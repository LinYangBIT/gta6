import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngineSound} from '../dist/engine-sound.js';

function harness({deferred = false, reject = false} = {}) {
  const calls = {created: 0, resumes: 0, closed: 0, oscillators: [], gains: [], notices: [], pending: []};
  const parameter = value => ({value, targets: [], setTargetAtTime(target, time, smoothing) {this.value = target; this.targets.push({target, time, smoothing});}});
  const node = () => ({connect(next) {return next;}, disconnect() {this.disconnected = true;}});
  class AudioContext {
    constructor() {calls.created++; this.state = 'suspended'; this.currentTime = 0; this.destination = node(); calls.context = this;}
    createOscillator() {const n = {...node(), frequency: parameter(0), start() {this.started = true;}, stop() {this.stopped = true;}}; calls.oscillators.push(n); return n;}
    createGain() {const n = {...node(), gain: parameter(0)}; calls.gains.push(n); return n;}
    createBiquadFilter() {return {...node(), frequency: parameter(0), Q: parameter(0)};}
    resume() {
      calls.resumes++;
      if (deferred) return new Promise((resolve, reject) => calls.pending.push({resolve: () => {this.state = 'running'; resolve();}, reject}));
      if (reject) return Promise.reject(new Error('blocked'));
      this.state = 'running'; return Promise.resolve();
    }
    close() {calls.closed++; this.state = 'closed'; return Promise.resolve();}
  }
  const sound = createEngineSound({AudioContext, onStatus: message => calls.notices.push(message)});
  return {sound, calls, master: () => calls.gains.at(-1)?.gain};
}

test('engine defaults enabled but creates and resumes audio only during the enter gesture', async () => {
  const h = harness();
  assert.equal(h.sound.enabled, true); assert.equal(h.calls.created, 0);
  h.sound.update({speed: 0, active: true, driving: false, blocked: false});
  assert.equal(h.calls.created, 0, 'the frame loop must not unlock audio');
  const entered = h.sound.start();
  assert.equal(h.calls.resumes, 1, 'resume runs before the first await');
  assert.equal(await entered, true); assert.equal(h.master().value, 0, 'walking remains silent');
  assert.equal(h.calls.oscillators.length, 2); assert.ok(h.calls.oscillators.every(n => n.started));
  await h.sound.start(); assert.equal(h.calls.created, 1, 'menu reentry reuses one graph');
  h.sound.dispose();
});

test('driving produces a quiet idle and smoothly increasing RPM; every gameplay block mutes it', async () => {
  const h = harness(); await h.sound.start();
  h.sound.update({speed: 0, active: true, driving: true, blocked: false});
  const idle = h.calls.oscillators[0].frequency.value;
  assert.ok(h.master().value > 0 && h.master().value <= .022);
  h.sound.update({speed: 30, active: true, driving: true, blocked: false});
  assert.ok(h.calls.oscillators[0].frequency.value > idle);
  assert.ok(h.calls.oscillators[0].frequency.targets.at(-1).smoothing > 0);
  assert.ok(h.master().value <= .022, 'engine should not overpower BGM');
  for (const patch of [{active: false}, {driving: false}, {blocked: true}]) {
    h.sound.update({speed: 30, active: true, driving: true, blocked: false, ...patch});
    assert.equal(h.master().value, 0);
  }
  h.sound.update({speed: NaN, active: true, driving: true, blocked: false});
  assert.ok(Number.isFinite(h.calls.oscillators[0].frequency.value));
  h.sound.update({speed: -20, active: true, driving: true, blocked: false});
  const reverse = h.calls.oscillators[0].frequency.value;
  h.sound.update({speed: 20, active: true, driving: true, blocked: false});
  assert.equal(h.calls.oscillators[0].frequency.value, reverse);
  h.sound.dispose();
});

test('manual mute persists across menu reentry and explicit toggle can restore it', async () => {
  const h = harness(); await h.sound.start();
  h.sound.update({speed: 20, active: true, driving: true, blocked: false});
  await h.sound.toggle(); const resumes = h.calls.resumes;
  assert.equal(h.sound.enabled, false); assert.equal(h.master().value, 0);
  assert.equal(await h.sound.start(), false); assert.equal(h.calls.resumes, resumes);
  h.sound.update({speed: 40, active: true, driving: true, blocked: false});
  assert.equal(h.master().value, 0);
  await h.sound.toggle(); assert.equal(h.sound.enabled, true); assert.ok(h.master().value > 0);
  h.sound.dispose();
});

test('late success or failure cannot override a newer mute or unlock request', async () => {
  const h = harness({deferred: true});
  h.sound.update({speed: 20, active: true, driving: true, blocked: false});
  const first = h.sound.start(); await h.sound.toggle();
  const second = h.sound.toggle(); h.calls.pending[1].resolve(); assert.equal(await second, true);
  h.calls.pending[0].reject(new Error('late denial')); assert.equal(await first, false);
  assert.equal(h.sound.enabled, true); assert.ok(h.master().value > 0);
  const third = h.sound.start(); await h.sound.toggle(); h.calls.pending[2].resolve();
  assert.equal(await third, false); assert.equal(h.sound.enabled, false); assert.equal(h.master().value, 0);
  h.sound.dispose();
});

test('unsupported and rejected audio fail quietly while disposal releases the graph', async () => {
  const notices = [], unsupported = createEngineSound({AudioContext: null, onStatus: m => notices.push(m)});
  assert.equal(unsupported.supported, false); assert.equal(await unsupported.start(), false);
  unsupported.update({speed: 20, active: true, driving: true}); unsupported.dispose();
  assert.equal(notices.length, 1);
  const h = harness({reject: true}); assert.equal(await h.sound.start(), false);
  h.sound.update({speed: 20, active: true, driving: true, blocked: false}); assert.equal(h.master().value, 0);
  h.sound.dispose(); h.sound.dispose();
  assert.equal(h.calls.closed, 1); assert.ok(h.calls.oscillators.every(n => n.stopped && n.disconnected));
  assert.equal(await h.sound.start(), false);
});
