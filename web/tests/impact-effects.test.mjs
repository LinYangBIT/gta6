import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createImpactEffects } from '../dist/impact-effects.js';

const event = (id, x = 10, z = 20) => ({id, x, z, altitude: 0, nx: 1, nz: 0, strength: .9, speed: 18, kind: 'vehicle'});

function audioHarness() {
  const calls = {created: 0, resumes: 0, closed: 0, sources: [], gains: []};
  const parameter = value => ({value, setTargetAtTime(value) {this.value = value;}, setValueAtTime(value) {this.value = value;}, exponentialRampToValueAtTime(value) {this.value = value;}});
  const node = () => ({connect(next) {return next;}, disconnect() {this.disconnected = true;}});
  const source = () => { const n = {...node(), frequency: parameter(0), start() {this.started = true;}, stop() {this.stopped = true;}}; calls.sources.push(n); return n; };
  class AudioContext {
    constructor() {calls.created++; this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 8000; this.destination = node(); calls.context = this;}
    createGain() {const n = {...node(), gain: parameter(0)}; calls.gains.push(n); return n;}
    createBuffer(channels, samples) {const data = new Float32Array(samples); return {getChannelData() {return data;}};}
    createBufferSource() {return source();}
    createOscillator() {return source();}
    createBiquadFilter() {return {...node(), frequency: parameter(0), Q: parameter(0)};}
    resume() {calls.resumes++; this.state = 'running'; return Promise.resolve();}
    close() {calls.closed++; this.state = 'closed'; return Promise.resolve();}
  }
  return {calls, AudioContext};
}

test('impact pools remain bounded, survive large-world rebasing, expire and release owned resources', () => {
  const scene = new THREE.Scene(), effects = createImpactEffects(scene, {mobile: true, AudioContext: null});
  const x = 128e7, z = -128e7;
  for (let id = 0; id < 50; id++) effects.emit([event(id, x + 10, z + 20)]);
  effects.update(.016, {x, z});
  assert.equal(effects.stats.particles, effects.capacity);
  assert.equal(effects.stats.drawCalls, 3);
  assert.ok(effects.pools.every(pool => pool.count <= pool.instanceMatrix.count));
  const matrix = new THREE.Matrix4();
  for (const pool of effects.pools) {
    assert.ok(pool.count > 0, 'sparks, dust and debris all appear');
    pool.getMatrixAt(0, matrix);
    assert.ok(matrix.elements.every(Number.isFinite));
    assert.ok(Math.abs(matrix.elements[12] - 10) < 2 && Math.abs(matrix.elements[14] - 20) < 2);
  }
  const before = effects.stats.particles;
  effects.emit([event(49, x + 10, z + 20)]);
  assert.equal(effects.stats.particles, before, 'a drained event cannot play twice');
  for (let i = 0; i < 15; i++) effects.update(.1, {x, z});
  assert.equal(effects.stats.particles, 0); assert.ok(effects.pools.every(pool => pool.count === 0));
  const resources = [];
  for (const pool of effects.pools) for (const resource of [pool.geometry, pool.material]) resource.addEventListener('dispose', () => resources.push(resource));
  effects.dispose(); effects.dispose();
  assert.equal(resources.length, 6); assert.equal(scene.children.length, 0);
});

test('camera response is local, small and disabled for reduced motion and paused gameplay', () => {
  const effects = createImpactEffects(new THREE.Scene(), {AudioContext: null});
  effects.emit([event(1, 200, 300)], {listener: {x: 0, z: 0}}); effects.update(.02);
  assert.deepEqual(effects.getShake(), {x: 0, y: 0, roll: 0});
  effects.emit([event(2)], {listener: {x: 10, z: 20}}); effects.update(.02);
  const shake = effects.getShake();
  assert.ok(Math.abs(shake.x) > 0 && Math.abs(shake.x) <= .1);
  assert.ok(Math.abs(shake.y) <= .065 && Math.abs(shake.roll) <= .006);
  effects.update(.01, {}, {active: false});
  assert.equal(effects.stats.particles, 0); assert.deepEqual(effects.getShake(), {x: 0, y: 0, roll: 0});
  effects.dispose();
  const still = createImpactEffects(new THREE.Scene(), {AudioContext: null, reduceMotion: true});
  still.emit([event(1)]); still.update(.016);
  assert.ok(still.stats.particles > 0); assert.deepEqual(still.getShake(), {x: 0, y: 0, roll: 0});
  still.dispose();
});

test('impact audio unlocks only on entry, obeys mute, caps voices and stops when paused', async () => {
  const {calls, AudioContext} = audioHarness(), effects = createImpactEffects(new THREE.Scene(), {AudioContext});
  effects.emit([event(1)]); assert.equal(calls.created, 0);
  const unlocking = effects.startAudio(); assert.equal(calls.resumes, 1); await unlocking;
  effects.emit([event(2)]); assert.equal(effects.stats.voices, 1);
  effects.emit([event(3)]); assert.equal(effects.stats.voices, 1, 'simultaneous impacts are coalesced');
  for (let id = 4; id < 22; id++) {calls.context.currentTime += .08; effects.emit([event(id)]);}
  assert.equal(effects.stats.voices, 6, 'even a delayed render loop cannot allocate unbounded audio');
  effects.update(.01, {}, {enabled: false});
  assert.equal(effects.stats.voices, 0); assert.equal(calls.gains[0].gain.value, 0);
  assert.ok(calls.sources.every(node => node.stopped && node.disconnected));
  calls.context.currentTime += .1;
  effects.emit([event(99)], {enabled: false}); assert.equal(effects.stats.voices, 0);
  effects.update(.01, {}, {enabled: true}); effects.emit([event(100)]); assert.equal(effects.stats.voices, 1);
  effects.update(.01, {}, {active: false}); assert.equal(effects.stats.voices, 0);
  effects.dispose(); effects.dispose(); assert.equal(calls.closed, 1);
  assert.equal(await effects.startAudio(), false);
});

test('bad inputs and unsupported audio do not interrupt rendering or grow the deduplication cache', async () => {
  const effects = createImpactEffects(new THREE.Scene(), {AudioContext: null});
  assert.equal(await effects.startAudio(), false);
  effects.emit([null, event(1, NaN), {...event(2), strength: NaN, speed: NaN}]);
  assert.equal(effects.stats.particles, 0);
  for (let id = 10; id < 400; id++) effects.emit([event(id)]);
  effects.update(NaN, {x: NaN});
  assert.equal(effects.stats.seenEvents, 128); assert.ok(effects.stats.particles <= effects.capacity);
  effects.dispose();
});
