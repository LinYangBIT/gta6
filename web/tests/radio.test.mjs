import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadio, RADIO_TRACKS, scoreStep } from '../dist/radio.js';

function makeAudioHarness({ rejectResume = false } = {}) {
  const timers = new Map();
  const calls = { resumes: 0, starts: [], stops: [], closed: 0 };
  let nextTimer = 0;
  const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({
    gain: parameter(), frequency: parameter(), detune: parameter(), Q: parameter(), pan: parameter(), delayTime: parameter(),
    threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(),
    connect(next) { return next; }, disconnect() {},
    start(when) { calls.starts.push(when); }, stop(when) { calls.stops.push(when); },
  });
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); calls.context = this; }
    resume() { calls.resumes++; if (rejectResume) return Promise.reject(new Error('Gesture required')); this.state = 'running'; return Promise.resolve(); }
    close() { calls.closed++; this.state = 'closed'; return Promise.resolve(); }
    createGain() { return node(); }
    createDynamicsCompressor() { return node(); }
    createDelay() { return node(); }
    createBiquadFilter() { return node(); }
    createOscillator() { return node(); }
    createStereoPanner() { return node(); }
    createBufferSource() { return node(); }
    createBuffer(channels, count) { return { getChannelData() { return new Float32Array(count); } }; }
  }
  const options = {
    AudioContext,
    setInterval(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); },
  };
  return { options, calls, timers, advance(time) { calls.context.currentTime = time; for (const callback of timers.values()) callback(); } };
}

test('both original arrangements contain harmony, rhythm and an evolving lead', () => {
  assert.equal(RADIO_TRACKS.length, 2);
  assert.notEqual(RADIO_TRACKS[0].bpm, RADIO_TRACKS[1].bpm);
  assert.notDeepEqual(scoreStep(0, 0), scoreStep(1, 0));
  for (let track = 0; track < RADIO_TRACKS.length; track++) {
    const intro = Array.from({ length: 128 }, (_, step) => scoreStep(track, step)).flat();
    const full = Array.from({ length: 512 }, (_, step) => scoreStep(track, step)).flat();
    assert.deepEqual(new Set(full.map(event => event.kind)), new Set(['pad', 'bass', 'arp', 'kick', 'hat', 'snare', 'lead']));
    assert.ok(!intro.some(event => event.kind === 'lead'));
    assert.ok(full.some(event => event.kind === 'lead'));
    assert.ok(full.every(event => !('note' in event) || event.note >= 24 && event.note <= 96));
    assert.deepEqual(scoreStep(track, 512), scoreStep(track, 0));
  }
});

test('audio unlock is synchronous with the play gesture and starts one scheduler', async () => {
  const harness = makeAudioHarness();
  const radio = createRadio(harness.options);
  assert.equal(harness.calls.resumes, 0);
  const started = radio.start();
  assert.equal(harness.calls.resumes, 1, 'resume must happen before returning the promise');
  assert.equal(await started, true);
  assert.equal(radio.enabled, true);
  assert.equal(harness.timers.size, 1);
  assert.ok(harness.calls.starts.length > 5, 'music includes simultaneous chord and rhythm voices');
  await radio.start();
  assert.equal(harness.timers.size, 1, 'repeated start does not double the beat');
  radio.dispose();
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.calls.closed, 1);
});

test('pause stops pending voices; resume and track switch maintain one clock', async () => {
  const harness = makeAudioHarness();
  const radio = createRadio(harness.options);
  await radio.start();
  const firstTitle = radio.trackLabel;
  const stopsBefore = harness.calls.stops.length;
  radio.setPaused(true);
  assert.equal(harness.timers.size, 0);
  assert.ok(harness.calls.stops.length > stopsBefore);
  assert.equal(radio.enabled, true, 'pause preserves the user music preference');
  radio.setPaused(false);
  await Promise.resolve();
  assert.equal(harness.timers.size, 1);
  await radio.nextTrack();
  assert.notEqual(radio.trackLabel, firstTitle);
  assert.equal(harness.timers.size, 1);
  await radio.toggle();
  assert.equal(radio.enabled, false);
  assert.equal(harness.timers.size, 0);
  await radio.nextTrack();
  assert.equal(harness.timers.size, 0, 'changing station while muted does not enable music');
  radio.dispose();
});

test('a stalled browser resumes at current audio time without replaying missed beats', async () => {
  const harness = makeAudioHarness();
  const radio = createRadio(harness.options);
  await radio.start();
  const previous = harness.calls.starts.length;
  harness.advance(90);
  const newStarts = harness.calls.starts.slice(previous);
  assert.ok(newStarts.every(time => time >= 90));
  assert.ok(newStarts.length < 30, 'lookahead schedules only a bounded number of voices');
  radio.dispose();
});

test('an immediate mute cancels an in-flight audio unlock', async () => {
  const harness = makeAudioHarness();
  const radio = createRadio(harness.options);
  const pending = radio.start();
  await radio.toggle();
  assert.equal(await pending, false);
  assert.equal(radio.enabled, false);
  assert.equal(harness.timers.size, 0);
  radio.dispose();
});

test('blocked or unavailable audio returns false without failing the experience', async () => {
  const harness = makeAudioHarness({ rejectResume: true });
  const blocked = createRadio(harness.options);
  assert.equal(await blocked.start(), false);
  assert.equal(blocked.enabled, false);
  assert.equal(harness.timers.size, 0);
  const unsupported = createRadio();
  assert.equal(unsupported.supported, false);
  assert.equal(await unsupported.start(), false);
  blocked.dispose();
});
