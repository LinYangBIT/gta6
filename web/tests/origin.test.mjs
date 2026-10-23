import test from 'node:test';
import assert from 'node:assert/strict';
import { FloatingOrigin } from '../dist/world-origin.js';

test('long journeys keep render coordinates small without moving global world positions', () => {
  const origin = new FloatingOrigin();
  for (const [x,z] of [[3,30],[1000,-1300],[-1e9,1e9],[3,30]]) {
    const oldX=origin.x, oldZ=origin.z;
    const camera={x:x-oldX-9,z:z-oldZ+5};
    const {dx,dz}=origin.update(x,z);
    camera.x-=dx; camera.z-=dz;
    assert.equal(camera.x+origin.x,x-9);
    assert.equal(camera.z+origin.z,z+5);
    assert.ok(Math.abs(x-origin.x)<=512 && Math.abs(z-origin.z)<=512);
  }
});
test('small movements around grid borders do not repeatedly rebase the camera', () => {
  const origin = new FloatingOrigin();
  for (const x of [-.01,.01,-.01,.01,127.99,128.01]) assert.deepEqual(origin.update(x,0),{dx:0,dz:0});
  assert.deepEqual(origin.update(NaN,Infinity),{dx:0,dz:0});
});
