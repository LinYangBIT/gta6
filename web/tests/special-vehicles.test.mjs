import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { ActorVisuals } from '../dist/actors.js';
import { coastGroundHeight } from '../dist/coast-layout.js';

function mixed(){
  const vehicles=new Map(['bicycle','truck','helicopter'].map((kind,i)=>[kind,{id:kind,kind,x:13+i*12,z:30,yaw:0,color:'#41a8b6',speed:0,steering:.2,wheelAngle:.6,altitude:kind==='helicopter'?20:0}]));
  return{mode:'walk',state:{x:13,z:30,yaw:0,speed:0,wheelAngle:0},vehicles,activeVehicle:null};
}
function position(pool,index=0){const matrix=new THREE.Matrix4();pool.getMatrixAt(index,matrix);return new THREE.Vector3().setFromMatrixPosition(matrix);}
function elements(pool,index=0){const matrix=new THREE.Matrix4();pool.getMatrixAt(index,matrix);return [...matrix.elements];}

test('special vehicles have distinct physical silhouettes and bounded finite geometry',()=>{
  const actors=new ActorVisuals(new THREE.Scene());
  const limits={bicycle:{width:.8,height:1.2,length:2.2},truck:{width:3,height:3.7,length:7.2},helicopter:{width:2.2,height:3.1,length:6.9}};
  for(const [kind,limit]of Object.entries(limits)){
    const model=actors.vehicleModels.get(kind),bounds=new THREE.Box3();let vertices=0;
    for(const [part,geometry]of Object.entries(model.geometry)){
      for(const key of ['position','normal','color'])assert.ok(geometry.attributes[key].array.every(Number.isFinite),`${kind}/${part} has invalid geometry`);
      vertices+=geometry.attributes.position.count;
      if(!model.animated?.[part]){geometry.computeBoundingBox();bounds.union(geometry.boundingBox);}
    }
    const size=bounds.getSize(new THREE.Vector3());
    assert.ok(size.x<=limit.width&&bounds.max.y<=limit.height&&size.z<=limit.length,`${kind} exceeds its intended silhouette`);
    assert.ok(vertices<9000,`${kind} has unbounded detail`);
  }
  assert.equal(actors.vehicleModels.get('truck').wheels.length,6);
  assert.equal(actors.vehicleModels.get('bicycle').cycleWheels.length,2);
  assert.equal(actors.vehicleModels.get('helicopter').wheels.length,0);
  actors.dispose();
});

test('bike, truck and helicopter use their own animated parts instead of car silhouettes',()=>{
  const actors=new ActorVisuals(new THREE.Scene()),g=mixed();actors.update(g,{x:0,z:0},1,{});
  assert.equal(actors.stats.vehicles,3);
  assert.equal(actors.vehiclePools.get('bicycle:cycleWheel').count,2);
  assert.equal(actors.vehiclePools.get('bicycle:pedals').count,1);
  assert.equal(actors.vehiclePools.get('truck:paint').count,1);
  assert.equal(actors.vehiclePools.get('helicopter:mainRotor').count,1);
  assert.equal(actors.vehiclePools.get('tire').count,6);
  assert.equal(actors.vehiclePools.get('sedan:paint').count,0,'special vehicles must not fall back to sedan meshes');
  const first=elements(actors.vehiclePools.get('bicycle:cycleWheel'));
  g.vehicles.get('bicycle').wheelAngle=2;actors.update(g,{x:0,z:0},2,{});
  assert.notDeepEqual(elements(actors.vehiclePools.get('bicycle:cycleWheel')),first);
  for(const pool of actors.vehiclePools.values())for(let i=0;i<pool.count;i++)assert.ok(elements(pool,i).every(Number.isFinite));
  actors.dispose();
});

test('helicopter altitude and spinning rotors follow occupancy and floating origin',()=>{
  const actors=new ActorVisuals(new THREE.Scene()),g=mixed(),heli=g.vehicles.get('helicopter'),ox=128*1e6,oz=-128*1e6;
  for(const v of g.vehicles.values()){v.x+=ox;v.z+=oz;}g.state.x+=ox;g.state.z+=oz;
  actors.update(g,{x:ox,z:oz},1,{});
  const body=position(actors.vehiclePools.get('helicopter:paint'));assert.equal(body.x,37);assert.equal(body.z,30);assert.ok(body.y>19.9);
  const stopped=elements(actors.vehiclePools.get('helicopter:mainRotor'));actors.update(g,{x:ox,z:oz},2,{});
  assert.deepEqual(elements(actors.vehiclePools.get('helicopter:mainRotor')),stopped);
  g.activeVehicle=heli;g.mode='drive';actors.update(g,{x:ox,z:oz},2,{});
  const moving=elements(actors.vehiclePools.get('helicopter:mainRotor'));assert.notDeepEqual(moving,stopped);
  const tail=elements(actors.vehiclePools.get('helicopter:tailRotor'));actors.update(g,{x:ox,z:oz},2.1,{});
  assert.notDeepEqual(elements(actors.vehiclePools.get('helicopter:mainRotor')),moving);
  assert.notDeepEqual(elements(actors.vehiclePools.get('helicopter:tailRotor')),tail);
  heli.altitude=30;actors.update(g,{x:ox,z:oz},2.2,{});
  assert.ok(Math.abs(position(actors.vehiclePools.get('helicopter:paint')).y-body.y-10)<1e-5);
  actors.dispose();
});

test('bicycle keeps a pedalling player visible and returning to walking restores the gait',()=>{
  const actors=new ActorVisuals(new THREE.Scene()),g=mixed();g.mode='drive';g.activeVehicle=g.vehicles.get('bicycle');
  actors.update(g,{x:0,z:0},1,{});const rig=actors.avatar.userData.rig;
  assert.equal(actors.avatar.visible,true);assert.ok(rig.leftLeg.rotation.x<-.5);assert.ok(rig.leftArm.rotation.x<-.8);
  const first=rig.leftLeg.rotation.x;g.state.wheelAngle=1.1;actors.update(g,{x:0,z:0},2,{});assert.notEqual(rig.leftLeg.rotation.x,first);
  g.mode='walk';g.activeVehicle=null;g.state.speed=0;actors.update(g,{x:0,z:0},3,{});
  assert.equal(actors.avatar.visible,true);assert.ok(Math.abs(rig.body.rotation.x)<.01);
  assert.equal(actors.avatar.position.y,coastGroundHeight(g.state.x,g.state.z));
  actors.dispose();
});

test('maximum truck population fits shared wheel capacity and special resources are reused and disposed',()=>{
  const scene=new THREE.Scene(),actors=new ActorVisuals(scene),g=mixed();g.vehicles.clear();
  for(let i=0;i<128;i++)g.vehicles.set(`${i}`,{id:`${i}`,kind:'truck',x:i*8,z:30,yaw:0});
  const resources=new Set(actors.geometries);let disposals=0;for(const geometry of resources)geometry.addEventListener('dispose',()=>disposals++);
  for(let n=0;n<10;n++)actors.update(g,{x:n*128,z:0},n,{});
  assert.equal(actors.stats.vehicles,128);assert.equal(actors.vehiclePools.get('tire').count,768);
  assert.equal(actors.vehiclePools.get('tire').instanceMatrix.count,768);
  assert.deepEqual(actors.geometries,resources);assert.equal(actors.vehiclePools.size,34);
  actors.dispose();actors.dispose();assert.equal(disposals,resources.size);assert.equal(scene.children.length,0);
});
