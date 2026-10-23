import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { ActorVisuals } from '../dist/actors.js';
import { coastGroundHeight, COAST_PEDESTRIAN_PATHS } from '../dist/coast-layout.js';
import { collidersNear } from '../dist/world-layout.js';

function game(count=6,x=13,z=30){
  const vehicles=new Map();
  for(let i=0;i<count;i++)vehicles.set(`v${i}`,{id:`v${i}`,kind:['coupe','sedan','suv'][i%3],x:7+i*12,z:30,yaw:Math.PI,color:i%2?'#ca7659':'#91b6b0',speed:0,wheelAngle:.7,steering:.2});
  return{mode:'walk',state:{x,z,yaw:Math.PI,speed:1.3},vehicles,activeVehicle:null};
}

test('each visible vehicle is backed by gameplay and shared batches remain bounded',()=>{
  const scene=new THREE.Scene(),actors=new ActorVisuals(scene,{mobile:true}),g=game(36);
  actors.update(g,{x:0,z:0},1,{contact:{x:13,z:13}});
  assert.equal(actors.stats.vehicles,36);assert.equal(actors.vehiclePools.size,17);
  assert.equal(actors.vehiclePools.get('tire').count,36*4);
  assert.equal(actors.vehiclePools.get('rim').count,36*4);
  assert.equal(actors.vehiclePools.get('coupe:paint').count,12);
  assert.equal(actors.avatar.visible,true);assert.equal(actors.contact.visible,true);
  const vehicleGeometry=new Set([...actors.vehiclePools.values()].map(p=>p.geometry));
  for(let n=0;n<120;n++)actors.update(game(36,n*128,-n*128),{x:n*128,z:-n*128},n,{});
  assert.equal(actors.vehiclePools.size,17);assert.equal(actors.geometries.size,17);
  assert.ok([...actors.vehiclePools.values()].every(p=>vehicleGeometry.has(p.geometry)));
  actors.update(game(100),{x:0,z:0},121,{});
  assert.equal(actors.stats.vehicles,100,'a full relocation history never creates invisible cars');
  assert.equal(actors.vehiclePools.get('tire').count,400);
  actors.dispose();actors.dispose();assert.equal(scene.children.length,0);
});

test('all three vehicle silhouettes differ and wheel matrices follow steering and floating origin',()=>{
  const actors=new ActorVisuals(new THREE.Scene()),g=game(3),heights=[];
  const ox=128*1e7,oz=-128*1e7;
  for(const v of g.vehicles.values()){v.x+=ox;v.z+=oz;}g.state.x+=ox;g.state.z+=oz;
  actors.update(g,{x:ox,z:oz},.7,{});
  for(const kind of ['coupe','sedan','suv']) {
    const geo=actors.vehicleModels.get(kind).geometry.glass;geo.computeBoundingBox();heights.push(geo.boundingBox.max.y);
    assert.ok(geo.attributes.position.count>100);
  }
  assert.ok(heights[0]<heights[1]&&heights[1]<heights[2]);
  const matrix=new THREE.Matrix4();actors.vehiclePools.get('coupe:paint').getMatrixAt(0,matrix);
  const position=new THREE.Vector3().setFromMatrixPosition(matrix);assert.equal(position.x,7);assert.equal(position.z,30);
  const wheels=actors.vehiclePools.get('tire');wheels.getMatrixAt(0,matrix);const first=Array.from(matrix.elements);
  g.vehicles.get('v0').wheelAngle=1.5;actors.update(g,{x:ox,z:oz},.8,{});wheels.getMatrixAt(0,matrix);
  assert.notDeepEqual(Array.from(matrix.elements),first);assert.ok(matrix.elements.every(Number.isFinite));
  actors.dispose();
});

test('Blender coupe detail replaces one procedural car without duplicating or disposing borrowed resources',()=>{
  const actors=new ActorVisuals(new THREE.Scene()),g=game(6);
  const template=new THREE.Group(),geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial({color:'#42b6b4'});material.name='satin metallic paint';
  template.add(new THREE.Mesh(geometry,material));let geometryDisposed=0,materialDisposed=0;
  geometry.addEventListener('dispose',()=>geometryDisposed++);material.addEventListener('dispose',()=>materialDisposed++);
  actors.setVehicleTemplate(template);actors.update(g,{x:0,z:0},0,{});
  assert.equal(actors.stats.hero,'v0');assert.equal(actors.hero.visible,true);
  assert.equal(actors.vehiclePools.get('coupe:paint').count,1);
  assert.equal(actors.vehiclePools.get('tire').count,20);
  assert.notEqual(actors.hero.children[0].material,material);
  assert.equal(material.color.getHexString(),'42b6b4');
  g.mode='drive';g.activeVehicle=g.vehicles.get('v3');actors.update(g,{x:0,z:0},0,{});
  assert.equal(actors.avatar.visible,false);assert.equal(actors.stats.hero,'v3');
  actors.dispose();assert.equal(geometryDisposed,0);assert.equal(materialDisposed,0);
  geometry.dispose();material.dispose();
});

test('coastal actors and cars follow asphalt, sidewalk and beach ground heights',()=>{
  const actors=new ActorVisuals(new THREE.Scene()),g=game(1),matrix=new THREE.Matrix4();
  for(const [x,z,height] of [[3,30,.03],[13,30,.22],[43,30,.02],[90,30,.02],[52,30,.22]]){
    Object.assign(g.state,{x,z});Object.assign(g.vehicles.get('v0'),{x,z});
    actors.update(g,{x:0,z:0},0,{contact:{x,z}});
    assert.equal(actors.avatar.position.y,height);
    assert.equal(actors.contact.position.y,height);
    actors.vehiclePools.get('coupe:paint').getMatrixAt(0,matrix);
    assert.ok(Math.abs(matrix.elements[13]-height)<1e-7);
  }
  actors.dispose();
});

test('ambient pedestrians stay on safe coastal paths through their complete walking cycles',()=>{
  const actors=new ActorVisuals(new THREE.Scene()),g=game(0);
  for(let t=0;t<=400;t+=2){
    actors.update(g,{x:0,z:0},t,{});
    for(let i=0;i<actors.pedestrians.length;i++){
      const p=actors.pedestrians[i],path=COAST_PEDESTRIAN_PATHS[i%COAST_PEDESTRIAN_PATHS.length];
      const {x,z}=p.position;
      assert.equal(p.position.y,coastGroundHeight(x,z));
      assert.ok(x>=Math.min(...path.points.map(p=>p.x))-.001&&x<=Math.max(...path.points.map(p=>p.x))+.001);
      assert.ok(z>=Math.min(...path.points.map(p=>p.z))-.001&&z<=Math.max(...path.points.map(p=>p.z))+.001);
      for(const r of collidersNear(x,z))assert.ok(x<r.minX-.34||x>r.maxX+.34||z<r.minZ-.34||z>r.maxZ+.34,'pedestrian enters an obstacle');
    }
  }
  actors.dispose();
});
