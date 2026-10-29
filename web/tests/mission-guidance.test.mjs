import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionGuidance, missionDirection } from '../dist/mission-guidance.js';
import { MissionSystem } from '../dist/missions.js';

function harness({ supported = true, throws = false } = {}) {
  const said = [], changes = [], stages = [], ducked = [];
  const voices = [{ lang: 'zh-CN', name: 'Chinese', default: true }, { lang: 'en-GB', name: 'English UK', localService: true }, { lang: 'en-US', name: 'English US', localService: true }];
  let canceled = 0;
  const speech = { getVoices: () => voices, speak(item) { if (throws) throw Error('Blocked'); said.push(item); }, cancel() { canceled++; } };
  const guidance = createMissionGuidance({ speech: supported ? speech : {}, Utterance: supported ? class { constructor(text) { this.text = text; } } : false,
    onChange: value => changes.push(value), onStage: value => stages.push(value), onSpeaking: value => ducked.push(value) });
  return { guidance, said, changes, stages, ducked, voices, canceled: () => canceled };
}
const mission = (voiceKey = 'one') => ({ total: 4, stage: 'pickup', voiceKey, voiceText: 'Follow the gold marker to your contact.' });

test('voice waits for entry gesture and active gameplay, then speaks each objective once', () => {
  const h = harness();
  for (let i = 0; i < 20; i++) h.guidance.update(mission());
  assert.equal(h.said.length, 0);
  h.guidance.unlock();
  h.guidance.update(mission(), { active: false });
  assert.equal(h.said.length, 0, 'CG and blocked gameplay do not speak');
  h.guidance.update(mission(), { active: true });
  assert.equal(h.said.length, 1);
  assert.equal(h.said[0].lang, 'en-US');
  assert.equal(h.said[0].voice, h.voices[2], 'prefers an installed English voice over default Chinese');
  for (let i = 0; i < 400; i++) h.guidance.update(mission());
  assert.equal(h.said.length, 1, 'frame updates never queue duplicate narration');
  assert.equal(h.stages.length, 1);
  h.guidance.update(mission('two'));
  assert.equal(h.said.length, 2);
  assert.equal(h.canceled(), 1, 'new step replaces stale line');
});

test('speech completion, cancel, mute and failed synthesis release music ducking', () => {
  const h = harness(); h.guidance.unlock(); h.guidance.update(mission());
  h.said[0].onstart(); assert.equal(h.ducked.at(-1), true);
  h.guidance.pause(); assert.equal(h.ducked.at(-1), false);
  const canceledCount = h.canceled();
  for (let i = 0; i < 30; i++) h.guidance.update(mission(), { active: false });
  assert.equal(h.canceled(), canceledCount);
  h.said[0].onstart(); assert.equal(h.ducked.at(-1), false, 'late start cannot re-duck canceled speech');
  h.guidance.update(mission()); assert.equal(h.said.length, 1, 'resume does not repeat the stage');
  assert.equal(h.guidance.replay(), true); assert.equal(h.said.length, 2);
  h.said[1].onstart(); assert.equal(h.ducked.at(-1), true);
  h.guidance.toggle(); assert.equal(h.ducked.at(-1), false);
  h.guidance.update(mission('three')); assert.equal(h.said.length, 2, 'muted stages still update visually');
  assert.equal(h.stages.length, 2);
  h.guidance.toggle(); assert.equal(h.said.length, 3, 'turning voice on replays current objective');
  h.said[2].onstart(); h.said[2].onerror();
  assert.equal(h.changes.at(-1).status, 'text-only'); assert.equal(h.ducked.at(-1), false);
  h.guidance.dispose(); assert.equal(h.guidance.replay(), false);
});

test('unavailable or browser-blocked voice keeps captions/stage updates without throwing', () => {
  for (const options of [{ supported: false }, { throws: true }]) {
    const h = harness(options); h.guidance.unlock();
    assert.doesNotThrow(() => h.guidance.update(mission()));
    assert.equal(h.stages[0].voiceText, mission().voiceText);
    assert.equal(h.changes.at(-1).status, 'text-only');
  }
});

test('free exploration stays silent and mission reset permits the opening line again', () => {
  const h = harness(); h.guidance.unlock(); h.guidance.update(mission());
  h.guidance.update({ ...mission('free'), total: 0 });
  assert.equal(h.said.length, 1);
  h.guidance.reset(); h.guidance.update(mission());
  assert.equal(h.said.length, 2);
});

test('mission guidance includes useful bearings and English instructions for grounded and flying deliveries', () => {
  const m = new MissionSystem();
  const first = m.snapshot({ mode: 'walk', x: 13, z: 30, yaw: Math.PI });
  assert.equal(first.distance, 17);
  assert.equal(missionDirection(first.directionAngle).label, '前方');
  assert.equal(missionDirection(Math.PI).label, '身后');
  assert.equal(missionDirection(Math.PI / 2).label, '左侧');
  assert.equal(missionDirection(-Math.PI / 2).label, '右侧');
  assert.equal(missionDirection(null).available, false);
  assert.match(first.voiceText, /Follow the gold marker/);
  m.interact({ mode: 'walk', x: 13, z: 13 });
  const actor = { mode: 'drive', x: 3, z: -128, yaw: Math.PI, speed: 0, altitude: 10, verticalSpeed: 0, activeVehicleId: 'helicopter', vehicleKind: 'helicopter' };
  for (let i = 0; i < 10; i++) m.update(.1, actor);
  assert.equal(m.stage, 'drive', 'hovering over the parking area is not a delivery');
  assert.match(m.snapshot(actor).voiceText, /Land at the destination/);
  actor.altitude = 0; actor.verticalSpeed = -2;
  for (let i = 0; i < 6; i++) m.update(.1, actor);
  assert.equal(m.stage, 'drive', 'must settle after touchdown');
  actor.verticalSpeed = 0;
  for (let i = 0; i < 6; i++) m.update(.1, actor);
  assert.equal(m.stage, 'deliver');
});
