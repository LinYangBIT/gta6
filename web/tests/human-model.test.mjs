import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createHuman,animateHuman} from '../dist/human-model.js';

test('resident has human-scale bounds, a complete articulated rig, and merged detail meshes',()=>{
  const resident=createHuman();resident.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(resident),size=bounds.getSize(new THREE.Vector3());
  assert.ok(size.y>1.7&&size.y<1.9);assert.ok(Math.abs(bounds.min.y)<.012);
  const rig=resident.userData.rig;
  for(const name of ['body','head','leftArm','rightArm','leftForearm','rightForearm','leftLeg','rightLeg','leftShin','rightShin'])assert.ok(rig[name]?.isObject3D,name);
  let meshes=0;resident.traverse(node=>{if(node.isMesh){meshes++;assert.ok(node.geometry.attributes.position.count>0);}});
  assert.ok(meshes<=12,`${meshes} merged meshes`);
  assert.doesNotThrow(()=>JSON.stringify(resident.toJSON()),'rig references do not break asset export');
});

test('walk and sprint animate opposing limbs and return smoothly to idle',()=>{
  const resident=createHuman(),rig=resident.userData.rig;
  for(let i=0;i<90;i++)animateHuman(resident,{speed:2,time:i/60});
  assert.ok(Math.abs(rig.leftLeg.rotation.x)>.03);
  assert.ok(Math.abs(rig.leftLeg.rotation.x+rig.rightLeg.rotation.x)<1e-10);
  assert.ok(rig.leftShin.rotation.x>=0&&rig.rightShin.rotation.x>=0);
  for(let i=90;i<180;i++)animateHuman(resident,{speed:5.5,time:i/60});
  assert.ok(rig.leftForearm.rotation.x<-.7);
  for(let i=180;i<330;i++)animateHuman(resident,{speed:0,time:i/60});
  assert.ok(Math.abs(rig.leftLeg.rotation.x)<.001);
  animateHuman(resident,{speed:NaN,time:Infinity,gesture:true});
  resident.traverse(node=>{assert.ok([...node.position,...node.rotation.toArray().slice(0,3)].every(Number.isFinite));});
  assert.ok(rig.rightForearm.rotation.x<-.6,'contact gestures on idle');
});
