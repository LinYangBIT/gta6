import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../dist/vendor/three.module.js';

const source=await readFile(new URL('../dist/main.js',import.meta.url),'utf8');
const start=source.indexOf('function updateCamera(dt){'),end=source.indexOf('function objectiveTarget(){',start);
assert.ok(start>=0&&end>start,'camera functions must be available from the real application');
const cameraSource=source.slice(start,end);

function harness(){
  let obstacles=[];
  const state={x:13,z:30,yaw:0,speed:8,altitude:0};
  const context=vm.createContext({THREE,Math,Map,
    game:{mode:'drive',activeVehicle:{kind:'helicopter'},state},origin:{x:0,z:0},
    innerWidth:1280,innerHeight:720,active:true,entry:{playing:false},cinematicFrame:null,
    reduceMotion:false,introOrbit:0,walkCameraYaw:0,worldSeed:610,
    view:{mode:0,yaw:0,pitch:0,zoom:1,pointers:new Map()},
    camera:new THREE.PerspectiveCamera(55,1280/720,.15,2600),
    cameraDestination:new THREE.Vector3(),lookDestination:new THREE.Vector3(),cameraTarget:new THREE.Vector3(),
    carPosition:new THREE.Vector3(),forward:new THREE.Vector3(),
    sky:{position:new THREE.Vector3()},sun:{position:new THREE.Vector3(),target:{position:new THREE.Vector3()}},
    impacts:null,actors:{avatar:{visible:false}},coastGroundHeight:()=>.22,collidersNear:()=>obstacles,
  });
  vm.runInContext(cameraSource,context);
  const frame=()=>vm.runInContext('updateCamera(1/60)',context);
  return{context,state,frame,obstacles(next){obstacles=next;},settle(){for(let i=0;i<240;i++)frame();},
    snapshot(){return{eye:context.camera.position.clone(),target:context.cameraTarget.clone(),destination:context.cameraDestination.clone(),look:context.lookDestination.clone()};}};
}

test('all four real camera modes follow helicopter altitude without horizontal drift',()=>{
  for(let mode=0;mode<4;mode++){
    const h=harness();h.context.view.mode=mode;h.settle();const low=h.snapshot();
    h.state.altitude=40;h.settle();const high=h.snapshot();
    for(const key of ['eye','target','destination','look']){
      assert.ok(Math.abs(high[key].y-low[key].y-40)<1e-7,`mode ${mode}: ${key} did not follow altitude`);
      assert.ok(Math.abs(high[key].x-low[key].x)<1e-7&&Math.abs(high[key].z-low[key].z)<1e-7,`mode ${mode}: horizontal drift`);
      assert.ok(high[key].toArray().every(Number.isFinite));
    }
    assert.equal(h.context.sun.target.position.y,40);
    assert.deepEqual(h.context.sky.position.toArray(),high.eye.toArray());
  }
});

test('real camera keeps bicycle rider visible except in first person and restores walking visibility',()=>{
  const h=harness();h.context.game.activeVehicle.kind='bicycle';
  for(const mode of [0,1,3]){h.context.view.mode=mode;h.frame();assert.equal(h.context.actors.avatar.visible,true);}
  h.context.view.mode=2;h.frame();assert.equal(h.context.actors.avatar.visible,false);
  h.context.game.mode='walk';h.context.game.activeVehicle=null;h.context.view.mode=0;h.frame();
  assert.equal(h.context.actors.avatar.visible,true);
  h.context.view.mode=2;h.frame();assert.equal(h.context.actors.avatar.visible,false);
  for(const kind of ['truck','helicopter','coupe']){
    h.context.game.mode='drive';h.context.game.activeVehicle={kind};h.context.view.mode=0;h.frame();
    assert.equal(h.context.actors.avatar.visible,false,`${kind} should not show a standing player`);
  }
});

test('larger vehicles receive a wider real camera orbit and remain stable at distant origins',()=>{
  const h=harness(),radius=()=>Math.hypot(h.context.cameraDestination.x-(h.state.x-h.context.origin.x),h.context.cameraDestination.z-(h.state.z-h.context.origin.z));
  h.context.game.activeVehicle.kind='coupe';h.frame();const coupe=radius();
  h.context.game.activeVehicle.kind='truck';h.frame();const truck=radius();
  h.context.game.activeVehicle.kind='helicopter';h.frame();const helicopter=radius();
  assert.ok(truck>coupe+2&&truck<coupe*1.5);assert.ok(helicopter>truck+2&&helicopter<coupe*1.8);
  const before=h.snapshot();const offset=128*1e7;
  h.state.x+=offset;h.state.z-=offset;h.context.origin.x=offset;h.context.origin.z=-offset;h.frame();
  assert.ok(h.context.cameraDestination.distanceTo(before.destination)<1e-7,'floating-origin shift must preserve local orbit');
});

test('camera shortens against a wall at street level but clears its roof in flight',()=>{
  const h=harness();h.frame();const unblocked=h.context.cameraDestination.clone();
  h.obstacles([{id:'low-building',kind:'building',minX:12,maxX:14,minZ:24,maxZ:25,height:5}]);h.frame();
  assert.ok(h.context.cameraDestination.z>unblocked.z+2,'wall must move the camera closer to its vehicle');
  h.state.altitude=40;h.frame();
  assert.ok(Math.abs(h.context.cameraDestination.z-unblocked.z)<1e-7,'flying above the roof must preserve full orbit');
  assert.ok(Math.abs(h.context.cameraDestination.y-unblocked.y-40)<1e-7);
});

test('an elevated deck does not shorten a camera orbit entirely below its underside',()=>{
  const h=harness();h.frame();const unblocked=h.context.cameraDestination.clone();
  h.obstacles([{id:'bridge-deck',kind:'bridge',minX:12,maxX:14,minZ:24,maxZ:25,minY:12,maxY:13,height:13}]);h.frame();
  assert.ok(h.context.cameraDestination.distanceTo(unblocked)<1e-7,'underpass camera must remain clear below the deck');
});
