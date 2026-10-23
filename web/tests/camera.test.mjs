import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraControls } from '../dist/camera-controls.js';

test('drag works in every camera and recenter resets orbit, zoom and held pointers', () => {
  const controls = new CameraControls();
  for (let mode = 0; mode < 4; mode++) {
    assert.equal(controls.mode, mode);
    controls.begin(1, 100, 100); controls.move(1, 180, 140);
    assert.notEqual(controls.yaw, 0); assert.ok(controls.pitch > 0);
    controls.zoomBy(1.5); controls.cycle();
    assert.equal(controls.yaw, 0); assert.equal(controls.pitch, 0);
    assert.equal(controls.zoom, 1); assert.equal(controls.pointers.size, 0);
  }
});
test('pinch changes zoom without rotation; releasing either finger leaves valid orbit', () => {
  const controls = new CameraControls();
  controls.begin(1, 0, 0); controls.begin(2, 100, 0);
  controls.move(2, 200, 0);
  assert.equal(controls.zoom, .65); assert.equal(controls.yaw, 0);
  controls.end(1); controls.move(2, 210, 5);
  assert.notEqual(controls.yaw, 0);
  controls.clear(); const yaw = controls.yaw; controls.move(2, 500, 5);
  assert.equal(controls.yaw, yaw);
  controls.zoomBy(1e20); assert.equal(controls.zoom, 2.2);
});
