import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingSimulation, STEERING_DEFAULTS} from '../dist/driving.js';
import {createSteeringSettings, STEERING_STORAGE_KEY} from '../dist/steering-settings.js';

function harness({saved, storage: customStorage, simulation = new DrivingSimulation()} = {}) {
  class Element {
    constructor() { this.value = ''; this.textContent = ''; this.attrs = new Map(); this.listeners = new Map(); }
    setAttribute(name, value) { this.attrs.set(name, value); }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name, callback) { if (this.listeners.get(name) === callback) this.listeners.delete(name); }
    emit(name) { this.listeners.get(name)?.({target: this}); }
  }
  const elements = new Map(['steering-sensitivity', 'steering-response', 'steering-sensitivity-value', 'steering-response-value', 'steering-reset'].map(id => [id, new Element()]));
  const values = new Map(saved === undefined ? [] : [[STEERING_STORAGE_KEY, saved]]), notices = [];
  const storage = customStorage ?? {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  const binding = createSteeringSettings({simulation, storage, document: {getElementById: id => elements.get(id)}, onStatus: message => notices.push(message)});
  return {simulation, binding, storage, values, notices, e: id => elements.get(id)};
}

test('sliders apply immediately without resetting motion, persist, and reload in another session', () => {
  const h = harness();
  Object.assign(h.simulation.state, {x: 12, z: -29, yaw: .7, speed: 9, distance: 123});
  const before = {...h.simulation.state};
  h.e('steering-sensitivity').value = '1.75'; h.e('steering-sensitivity').emit('input');
  h.e('steering-response').value = '1.4'; h.e('steering-response').emit('input');
  assert.deepEqual(h.simulation.state, before, 'changing controls must not move or reset a car');
  assert.deepEqual(h.simulation.steeringSettings, {sensitivity: 1.75, response: 1.4});
  assert.equal(h.e('steering-sensitivity-value').textContent, '175%');
  assert.equal(h.e('steering-response').attrs.get('aria-valuetext'), '140%');
  assert.equal(h.notices.length, 0, 'continuous input does not spam notices');
  h.e('steering-response').emit('change'); assert.deepEqual(h.notices, ['转向配置已更新并保存']);
  const reloaded = harness({storage: h.storage});
  assert.deepEqual(reloaded.binding.settings, {sensitivity: 1.75, response: 1.4});
  reloaded.simulation.reset(); reloaded.simulation.setSeed(222);
  assert.deepEqual(reloaded.simulation.steeringSettings, {sensitivity: 1.75, response: 1.4});
});

test('bad saved preferences fall back to defaults while numeric outliers are bounded', () => {
  for (const saved of ['broken JSON', 'null', '[]', '42', '{"sensitivity":"fast","response":null}']) {
    assert.deepEqual(harness({saved}).binding.settings, STEERING_DEFAULTS);
  }
  const h = harness({saved: JSON.stringify({sensitivity: 99, response: -2, unknown: 10})});
  assert.deepEqual(h.binding.settings, {sensitivity: 2, response: .6});
  assert.equal(h.e('steering-sensitivity').value, '2');
  assert.equal(h.e('steering-response-value').textContent, '60%');
});

test('restore recommended values updates the car, controls and stored preference', () => {
  const h = harness({saved: JSON.stringify({sensitivity: 1.9, response: 1.7})});
  h.e('steering-reset').emit('click');
  assert.deepEqual(h.binding.settings, STEERING_DEFAULTS);
  assert.deepEqual(JSON.parse(h.values.get(STEERING_STORAGE_KEY)), STEERING_DEFAULTS);
  assert.equal(h.e('steering-sensitivity-value').textContent, '130%');
  assert.equal(h.e('steering-response-value').textContent, '115%');
  assert.equal(h.notices.length, 1);
});

test('unavailable storage and optional DOM do not prevent in-session configuration', () => {
  const storage = {getItem() {throw new Error('denied');}, setItem() {throw new Error('denied');}};
  const h = harness({storage});
  h.e('steering-sensitivity').value = '1.6'; h.e('steering-sensitivity').emit('input');
  assert.equal(h.binding.settings.sensitivity, 1.6);
  h.e('steering-sensitivity').emit('change');
  assert.equal(h.notices.at(-1), '转向配置已更新（仅本次有效）');
  const notices = [];
  assert.doesNotThrow(() => createSteeringSettings({simulation: new DrivingSimulation(), document: null, storage: null, onStatus: message => notices.push(message)}).reset());
  assert.deepEqual(notices, ['已恢复推荐转向配置（仅本次有效）']);
  h.binding.dispose(); h.binding.dispose();
  h.e('steering-sensitivity').value = '.6'; h.e('steering-sensitivity').emit('input');
  assert.equal(h.binding.settings.sensitivity, 1.6, 'disposed settings release input listeners');
});
