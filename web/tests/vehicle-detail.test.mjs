import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { ActorVisuals } from '../dist/actors.js';

test('refined body parts stay finite, in vehicle bounds and within a fixed geometry budget',()=>{
  const actors=new ActorVisuals(new THREE.Scene());
  for(const [kind,model] of actors.vehicleModels){
    let vertices=0;
    for(const geometry of Object.values(model.geometry)){
      vertices+=geometry.attributes.position.count;
      geometry.computeBoundingBox();
      const bounds=geometry.boundingBox;
      assert.ok(bounds.min.x>=-1.31&&bounds.max.x<=1.31,`${kind}: body exceeds existing mirror width`);
      assert.ok(bounds.min.z>=-2.5&&bounds.max.z<=2.5,`${kind}: body exceeds parking clearance`);
      assert.ok(bounds.min.y>=.26&&bounds.max.y<2.1);
      for(const name of ['position','normal','color'])assert.ok(geometry.attributes[name].array.every(Number.isFinite));
    }
    assert.ok(vertices<11000,`${kind}: ${vertices} vertices`);
  }
  assert.equal(actors.vehiclePools.size,17,'detail remains merged into the existing material batches');
  actors.dispose();
});

test('higher resolution tyres retain road contact and steering clearance',()=>{
  const actors=new ActorVisuals(new THREE.Scene());
  const tire=actors.vehiclePools.get('tire').geometry,rim=actors.vehiclePools.get('rim').geometry;
  tire.computeBoundingBox();rim.computeBoundingBox();
  assert.ok(tire.attributes.position.count+rim.attributes.position.count<8000);
  assert.ok(tire.boundingBox.min.y>=-1.001&&tire.boundingBox.max.y<=1.001,'tread must not enlarge rolling radius');
  assert.ok(rim.boundingBox.min.y>tire.boundingBox.min.y&&rim.boundingBox.max.y<tire.boundingBox.max.y);
  for(const model of actors.vehicleModels.values()){
    const lowest=model.wheelY+tire.boundingBox.min.y*model.wheelRadius;
    assert.ok(lowest>=-.012&&lowest<=.012,`${lowest} tyre/ground gap`);
    assert.ok(tire.boundingBox.max.x*model.wheelRadius+model.width+.015<1.25,'wheel stays inside mirror envelope');
  }
  actors.dispose();
});
