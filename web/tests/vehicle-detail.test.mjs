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

test('the close Blender car shares bounded neon trim without owning the borrowed GLB',()=>{
  const actors=new ActorVisuals(new THREE.Scene()),template=new THREE.Group();
  const borrowedGeometry=new THREE.BoxGeometry(1,1,1),borrowedMaterial=new THREE.MeshStandardMaterial();
  template.add(new THREE.Mesh(borrowedGeometry,borrowedMaterial));
  let borrowedDisposed=0;borrowedGeometry.addEventListener('dispose',()=>borrowedDisposed++);
  actors.setVehicleTemplate(template);
  const trim=actors.hero.children.filter(node=>node.name.startsWith('Vehicle cybernetic trim'));
  assert.equal(trim.length,2);
  const geometries=trim.map(node=>node.geometry);let ownedDisposed=0;
  for(const node of trim){
    node.geometry.addEventListener('dispose',()=>ownedDisposed++);
    node.geometry.computeBoundingBox();const b=node.geometry.boundingBox;
    assert.ok(b.min.x>=-1.1&&b.max.x<=1.1&&b.min.z>=-2.3&&b.max.z<=2.3);
    assert.ok(b.min.y>.26&&b.max.y<1);
    assert.equal(node.material.isMeshBasicMaterial,true);
    assert.equal(node.material.vertexColors,true);
    assert.equal(node.castShadow,false);
    assert.ok(node.geometry.attributes.position.count<=600);
  }
  const head=trim[0].geometry.attributes.color,tail=trim[1].geometry.attributes.color;
  assert.ok(head.getZ(0)>head.getX(0),'cool cyan rail stays distinct from its dark body');
  assert.ok(tail.getX(0)>tail.getY(0),'rear magenta light keeps its colour');
  actors.setVehicleTemplate(template);
  assert.deepEqual(actors.hero.children.filter(node=>node.name.startsWith('Vehicle cybernetic trim')).map(node=>node.geometry),geometries,'replacing the hero reuses owned trim');
  assert.equal(actors.vehiclePools.size,17);
  actors.dispose();assert.equal(ownedDisposed,2);assert.equal(borrowedDisposed,0);
  borrowedGeometry.dispose();borrowedMaterial.dispose();
});
