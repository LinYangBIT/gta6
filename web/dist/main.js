import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Gameplay } from './gameplay.js?v=12';
import { MissionSystem } from './missions.js?v=12';
import { ActorVisuals } from './actors.js?v=12';
import { createUI } from './ui.js?v=13';
import { CameraControls } from './camera-controls.js?v=12';
import { createRadio } from './radio.js?v=12';
import { createSoundtrack } from './soundtrack.js?v=12';
import { createEngineSound } from './engine-sound.js?v=12';
import { createImpactEffects } from './impact-effects.js?v=12';
import { createSteeringSettings } from './steering-settings.js?v=12';
import { EntryCinematic } from './entry-cinematic.js?v=12';
import { coastRoute, coastGroundHeight } from './coast-layout.js?v=12';
import { refineMaterials } from './surface-detail.js?v=12';
import { InfiniteCity } from './infinite-city.js?v=12';
import { CHUNK_SIZE, generateChunk, districtAt, collidersNear } from './world-layout.js?v=12';
import { CITY_POINTS_OF_INTEREST } from './metro-districts.js?v=12';
import { FloatingOrigin } from './world-origin.js?v=12';
import { resolveRenderQuality, nextAutomaticTier, QUALITY_MODES } from './render-quality.js?v=12';

const canvas = document.querySelector('#world');
const mobile = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let worldSeed=610;
try{const saved=Number(localStorage.getItem('sunset-city-seed'));if(Number.isSafeInteger(saved)&&saved>0)worldSeed=saved;}catch{/* Local persistence is optional. */}
const game = new Gameplay({seed:worldSeed});
const missions = new MissionSystem({seed:worldSeed});
let missionEnabled=true, missionView, lastNotice=0;
let walkCameraYaw=Math.PI;
const origin = new FloatingOrigin();
let city, cityStats={loaded:0}, mapCacheKey='', mapChunks=[];
let routeCacheKey='', routePoints=null;
const keys = new Set();
const touch = {left:false,right:false,throttle:false,brake:false,reverse:false,handbrake:false,sprint:false,ascend:false,descend:false};
let touchSteer = 0, touchMoveX=0, touchMoveZ=0;
const view = new CameraControls();
const radio = createRadio();
const cameraLabels = ['跟随', '侧面', '第一人称', '俯瞰'];
let renderer, scene, camera, sky, sun, fillLight, actors, impacts;
let ready = false, active = false, clock = 0;
let lastTime = performance.now();
let frameCost = 0, frameCount = 0, adaptiveFrames = 0, autoTier = 'high', qualityMode='auto';
try{const saved=localStorage.getItem('sunset-graphics-quality');if(QUALITY_MODES.includes(saved))qualityMode=saved;}catch{/* Optional setting persistence. */}
let introOrbit = 0;
const entry = new EntryCinematic();
let entryPlayed = false, cinematicFrame = null;
const cinematicOverlay = document.getElementById('entry-cinematic');
const cinematicSkip = document.getElementById('cinematic-skip');
const markers = [];
const cameraTarget = new THREE.Vector3();
const cameraDestination = new THREE.Vector3();
const lookDestination = new THREE.Vector3();
const forward = new THREE.Vector3();
const carPosition = new THREE.Vector3();

let ui;
const engineAudio=createEngineSound({onStatus:message=>ui?.toast(message)});
const soundtrack=createSoundtrack({
  radio,
  onStatus(message){ui?.toast(message);},
  onFocus(){focusCanvas();}
});
ui = createUI({
  start(mode){
    if (!ready || entry.playing) return;
    // Request official audio in this trusted click, before the visual transition.
    soundtrack.start();
    engineAudio.start();
    impacts?.startAudio();
    active=false; missionEnabled=mode!=='free'; clearInput();view.reset();walkCameraYaw=game.state.yaw;
    cinematicFrame=entry.start({x:game.state.x,z:game.state.z,ground:coastGroundHeight(game.state.x,game.state.z)??.22,quick:entryPlayed,reducedMotion:reduceMotion});
    document.body.classList.add('is-cinematic');
    cinematicOverlay.hidden=false;document.getElementById('hud').inert=true;
    ui.hideIntro();paintCinematic();cinematicSkip.focus({preventScroll:true});
  },
  newCity(){newCity();},
  interact(){interact();focusCanvas();},
  camera(){cycleCamera();focusCanvas();},
  recenter(){recenterCamera();focusCanvas();},
  reset(){resetCar();focusCanvas();},
  sound(){toggleSound();focusCanvas();},
  voiceSpeaking(speaking){soundtrack.setDucked?.(speaking);},
  music(){soundtrack.togglePanel();focusCanvas();},
  track(){nextMusic();focusCanvas();},
  fullscreen(){toggleFullscreen();},
  menu(){showMenu();},
  dialog(open){if(open)clearInput();soundtrack.setSuspended(Boolean(document.getElementById('video-dialog')?.open));updateSound();},
  orientation(blocked){if(blocked)clearInput();},
  steer(value){touchSteer=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;},
  move(x,z){touchMoveX=Number.isFinite(x)?x:0;touchMoveZ=Number.isFinite(z)?z:0;},
  touch(control,pressed){if(control in touch)touch[control]=pressed;}
});
soundtrack.prepare();
createSteeringSettings({simulation:game.sim,onStatus:message=>ui.toast(message)});
cinematicSkip?.addEventListener('click',()=>entry.skip());
function paintCinematic(){
  if(!cinematicFrame)return;
  cinematicOverlay.style.setProperty('--cinema-fade',String(cinematicFrame.fade));
  cinematicOverlay.style.setProperty('--cinema-progress',String(cinematicFrame.progress));
  document.getElementById('cinematic-title').textContent=cinematicFrame.title;
  document.getElementById('cinematic-subtitle').textContent=cinematicFrame.subtitle;
}
function closeCinematic(){
  entry.cancel();cinematicFrame=null;cinematicOverlay.hidden=true;
  document.body.classList.remove('is-cinematic');document.getElementById('hud').inert=false;
}
function finishEntry(){
  closeCinematic();entryPlayed=true;active=true;clearInput();focusCanvas();
}
function recenterCamera(){view.mode=0;view.reset();walkCameraYaw=game.state.yaw;ui.toast('镜头已回正 · 拖动画面自由环视');}
function cycleCamera(){view.cycle();ui.toast(`${cameraLabels[view.mode]} · 拖动环绕 / 双指缩放`);}
function resetCar(){game.reset();impacts?.clear();ui.resetGuidance?.();missions.reset({seed:worldSeed});lastNotice=0;walkCameraYaw=Math.PI;view.reset();clearInput();syncOrigin();snapCamera();ui.toast('已回到街头起点 · 任务已重新开始');}
function newCity(){
  if(!ready)return;
  worldSeed=Math.floor(Math.random()*2147483646)+1;
  try{localStorage.setItem('sunset-city-seed',String(worldSeed));}catch{/* Optional persistence. */}
  game.setSeed(worldSeed);impacts?.clear();ui.resetGuidance?.();missions.reset({seed:worldSeed});city.setSeed(worldSeed);mapCacheKey='';routeCacheKey='';lastNotice=0;walkCameraYaw=Math.PI;entryPlayed=false;
  clearInput();view.reset();syncOrigin();cityStats=city.update(game.state.x,game.state.z,origin.x,origin.z);
  snapCamera();ui.toast('新城市已生成 · 从街头开始新的旅程');
}
function actorState(){return {...game.state,mode:game.mode,activeVehicleId:game.activeVehicle?.id??null};}
function interact(){
  if(!active||!ready||ui.orientationBlocked||document.querySelector('dialog[open]'))return;
  const actor=actorState(), current=missions.snapshot(actor);
  if(missionEnabled&&current.interaction?.available){const result=missions.interact(actor);if(result.message)ui.toast(result.message);return;}
  const previousMode=game.mode,result=game.interact();
  if(result.message)ui.toast(result.message);
  if(result.ok&&previousMode!==game.mode){clearInput();view.reset();walkCameraYaw=game.state.yaw;if(game.mode==='drive')engineAudio.start();updateSound();}
}
function syncOrigin(){
  const {dx,dz}=origin.update(game.state.x,game.state.z);
  if(!dx&&!dz)return;
  for(const vector of [camera.position,cameraTarget,cameraDestination,lookDestination]){vector.x-=dx;vector.z-=dz;}
}
function snapCamera(){
  const x=game.state.x-origin.x,z=game.state.z-origin.z;
  const altitude=game.state.altitude||0;
  camera.position.set(x+1,altitude+3,z+6);cameraTarget.set(x,altitude+1.5,z);camera.lookAt(cameraTarget);
}

function focusCanvas(){canvas.focus({preventScroll:true});}
function clearInput(){keys.clear();Object.keys(touch).forEach(key=>touch[key]=false);touchSteer=0;touchMoveX=0;touchMoveZ=0;view.clear();}
function showMenu(){closeCinematic();active=false;clearInput();impacts?.clear();updateSound();ui.showIntro();}
function nextMusic(){soundtrack.nextTrack();}
function applyRenderQuality(){
  if(!renderer)return;
  const profile=resolveRenderQuality({mode:qualityMode,autoTier,width:innerWidth,height:innerHeight,devicePixelRatio,mobile});
  renderer.setPixelRatio(profile.pixelRatio);renderer.setSize(innerWidth,innerHeight);
  if(sun&&sun.shadow.mapSize.x!==profile.shadowSize){sun.shadow.mapSize.set(profile.shadowSize,profile.shadowSize);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}
}
const qualitySelect=document.getElementById('graphics-quality');
if(qualitySelect){qualitySelect.value=qualityMode;qualitySelect.addEventListener('change',()=>{qualityMode=QUALITY_MODES.includes(qualitySelect.value)?qualitySelect.value:'auto';autoTier='high';frameCost=0;adaptiveFrames=0;applyRenderQuality();try{localStorage.setItem('sunset-graphics-quality',qualityMode);}catch{}ui.toast('画质已更新');});}
function setupRenderer(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  applyRenderQuality();
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.16;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#344561');
  // The skyline uses the same streamed plots as the streets below. Atmospheric
  // depth now reaches across several neighborhoods rather than hiding the next block.
  scene.fog=new THREE.Fog('#344561',mobile?320:500,mobile?930:1400);
  camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.15,2600);
  camera.position.set(43,22,48);cameraTarget.set(-2,4,-25);
  camera.lookAt(cameraTarget);
  const hemisphere=new THREE.HemisphereLight('#9bbcff','#57425f',1.12);scene.add(hemisphere);
  sun=new THREE.DirectionalLight('#b6c8ff',2.05);sun.position.set(-55,70,80);
  sun.castShadow=true;
  applyRenderQuality();sun.shadow.bias=-.00025;sun.shadow.normalBias=.04;
  Object.assign(sun.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:240});
  scene.add(sun,sun.target);
  fillLight=new THREE.DirectionalLight('#6de6ed',.72);fillLight.position.set(20,20,-50);scene.add(fillLight);
  const room=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);
  const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;
  room.dispose();pmrem.dispose();
  createSky();createCourse();
  city=new InfiniteCity(scene,{mobile,seed:worldSeed});
  cityStats=city.update(game.state.x,game.state.z,origin.x,origin.z);
  actors=new ActorVisuals(scene,{mobile});
  impacts=createImpactEffects(scene,{mobile,reduceMotion});
  missionView=missions.snapshot(actorState());
  actors.update(game,origin,clock,missionView);snapCamera();
  canvas.tabIndex=0;
  canvas.setAttribute('aria-label','无限城市。W A S D 移动，Shift 跑步，E 交互或上下车，拖动画面环视。');
}

function createSky(){
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{zenith:{value:new THREE.Color('#162b56')},horizon:{value:new THREE.Color('#67466f')},sunColor:{value:new THREE.Color('#ee9aca')},sunDirection:{value:new THREE.Vector3(-.65,.12,.75).normalize()}},
    vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vDir;uniform vec3 zenith,horizon,sunColor,sunDirection;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
    void main(){vec3 d=normalize(vDir);float h=smoothstep(-.03,.6,d.y);vec3 c=mix(horizon,zenith,h);
    vec2 p=d.xz/max(.09,d.y)*1.5;float n=noise(p)*.55+noise(p*2.0)*.28+noise(p*4.0)*.17;
    float clouds=smoothstep(.52,.76,n)*smoothstep(.04,.22,d.y);c=mix(c,vec3(.32,.38,.57),clouds*.68);
    float a=max(dot(d,sunDirection),0.0);c+=sunColor*pow(a,36.0)*.25;c=mix(c,sunColor,smoothstep(.9991,.9995,a));gl_FragColor=vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`
  });
  sky=new THREE.Mesh(new THREE.SphereGeometry(1800,32,20),material);sky.renderOrder=-100;sky.frustumCulled=false;scene.add(sky);
}

function createCourse(){
  const group=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(3.15,.12,8,48),new THREE.MeshBasicMaterial({color:'#ffdc60',transparent:true,opacity:.95}));ring.position.y=3.25;
  const footGeometry=new THREE.RingGeometry(2.8,3.3,40);footGeometry.rotateX(-Math.PI/2);
  const foot=new THREE.Mesh(footGeometry,new THREE.MeshBasicMaterial({color:'#ffdb78',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));foot.position.y=.08;
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.22,1.35,24,12,1,true),new THREE.MeshBasicMaterial({color:'#ffe478',transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide}));beam.position.y=12;
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(.48,1.05,4),new THREE.MeshBasicMaterial({color:'#fff1a3'}));arrow.rotation.z=Math.PI;arrow.position.y=4.8;
  group.add(ring,foot,beam,arrow);scene.add(group);markers.push({group,ring,foot,beam,arrow});
}

async function downloadAsset(file,totalHint,onChunk){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),120000);
  try{
    const response=await fetch(new URL(`./assets/${file}?v=12`,import.meta.url),{signal:controller.signal});
    if(!response.ok)throw new Error(`素材加载失败 (${response.status})`);
    if(!response.body){const data=await response.arrayBuffer();onChunk(data.byteLength,totalHint);return data;}
    const reader=response.body.getReader();const chunks=[];let loaded=0;
    while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;onChunk(loaded,totalHint);}
    const data=new Uint8Array(loaded);let offset=0;chunks.forEach(chunk=>{data.set(chunk,offset);offset+=chunk.length;});return data.buffer;
  }finally{clearTimeout(timeout);}
}

async function loadWorld(){
  const loader=new GLTFLoader();
  ui.setLoading(.1,'正在生成第一片城市街区…');
  const prepareCity=async()=>{for(let i=0;i<(mobile?16:40);i++){cityStats=city.update(game.state.x,game.state.z,origin.x,origin.z);await new Promise(resolve=>requestAnimationFrame(resolve));}};
  const [carData]=await Promise.all([downloadAsset('car.glb',1945772,bytes=>ui.setLoading(.1+Math.min(.82,bytes/1945772*.82),'正在载入跑车与城市…')),prepareCity()]);
  ui.setLoading(.96,'正在准备路网与街区…');
  const vehicle=await loader.parseAsync(carData,'');
  const car=vehicle.scene;refineMaterials(car,true);
  car.traverse(object=>{
    if(object.isMesh){object.castShadow=true;object.receiveShadow=true;const ms=Array.isArray(object.material)?object.material:[object.material];ms.forEach(m=>m.envMapIntensity=1.15);}
  });
  // A soft contact patch remains visible on devices with shadows disabled.
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(2.4,4.8),new THREE.MeshBasicMaterial({color:0x251c32,transparent:true,opacity:.14,depthWrite:false}));
  contact.rotation.x=-Math.PI/2;contact.position.y=.012;car.add(contact);
  actors.setVehicleTemplate(car);actors.update(game,origin,clock,missionView);
  ui.setLoading(1,'街头已就绪');ready=true;ui.setReady();
  if(renderer.compileAsync){try{await renderer.compileAsync(scene,camera);}catch{/* First render remains the compatibility fallback. */}}
}

function readInput(){
  const down=(...list)=>list.some(key=>keys.has(key));
  const keyboardSteer=(down('KeyA','ArrowLeft')?1:0)-(down('KeyD','ArrowRight')?1:0);
  const flying=game.mode==='drive'&&game.activeVehicle?.kind==='helicopter';
  return {throttle:(down('KeyW','ArrowUp')||touch.throttle)?1:0,
    brake:touch.brake?1:0, reverse:(down('KeyS','ArrowDown')||touch.reverse)?1:0,
    steer:keyboardSteer||touchSteer||(touch.left?1:0)-(touch.right?1:0),
    handbrake:(!flying&&down('Space'))||touch.handbrake,
    ascend:flying&&(down('Space')||touch.ascend)?1:0,
    descend:flying&&(down('ControlLeft','ControlRight')||touch.descend)?1:0,
    moveX:-keyboardSteer||touchMoveX,moveZ:((down('KeyW','ArrowUp')?1:0)-(down('KeyS','ArrowDown')?1:0))||touchMoveZ,
    sprint:down('ShiftLeft','ShiftRight')||touch.sprint};
}

function updateCamera(dt){
  const s=game.state, walking=game.mode==='walk', portrait=innerHeight>innerWidth;
  const kind=game.activeVehicle?.kind,flying=!walking&&kind==='helicopter',large=kind==='truck'||flying;
  const altitude=walking?0:s.altitude||0;
  const px=s.x-origin.x,pz=s.z-origin.z,groundOffset=(coastGroundHeight(s.x,s.z)??.22)-.22+altitude;
  if(cinematicFrame?.camera){
    const [cx,cy,cz]=cinematicFrame.camera,[tx,ty,tz]=cinematicFrame.target;
    cameraDestination.set(cx-origin.x,cy,cz-origin.z);lookDestination.set(tx-origin.x,ty,tz-origin.z);
  }else if(!active&&!entry.playing){
    if(!reduceMotion)introOrbit+=dt*.035;
    cameraDestination.set(px+5+Math.sin(introOrbit)*2,4.5,pz+24+Math.cos(introOrbit)*2);
    lookDestination.set(px-44,6.2,pz-8);
  }else{
    carPosition.set(px,0,pz);
    const yaw=(walking?walkCameraYaw:s.yaw)+view.yaw;
    forward.set(Math.sin(yaw),0,Math.cos(yaw));
    if(view.mode===2){
      cameraDestination.copy(carPosition).addScaledVector(new THREE.Vector3(Math.sin(s.yaw),0,Math.cos(s.yaw)),walking?.08:flying?1.3:kind==='truck'?2.35:1.85);
      cameraDestination.y=(walking?1.88:flying?1.8:kind==='truck'?2.6:kind==='bicycle'?1.65:1.24)+groundOffset;
      lookDestination.copy(cameraDestination).addScaledVector(forward,30);
      lookDestination.y+=Math.sin(-view.pitch)*20;
    }else{
      let radius, elevation, angle=yaw;
      if(view.mode===0){radius=walking?(portrait?6.2:4.8):(portrait?10:8.2)+Math.abs(s.speed)*.045;elevation=walking?.22:.27;}
      else if(view.mode===1){radius=walking?5.8:8.5;elevation=.20;angle+=.7;}
      else{radius=portrait?28:24;elevation=.91;}
      if(large&&view.mode!==3)radius*=flying?1.65:1.35;
      elevation=THREE.MathUtils.clamp(elevation+view.pitch,.10,1.42);
      radius*=view.zoom;
      const eye=(walking?1.55:large?1.8:.95)+groundOffset;
      cameraDestination.set(px-Math.sin(angle)*radius*Math.cos(elevation),eye+radius*Math.sin(elevation),pz-Math.cos(angle)*radius*Math.cos(elevation));
      lookDestination.copy(carPosition);lookDestination.y=eye;
      if(walking&&view.mode===0){cameraDestination.x-=Math.cos(angle)*.48;cameraDestination.z+=Math.sin(angle)*.48;}
      if(view.mode===0)lookDestination.addScaledVector(forward,walking?1.4:2.3);
      avoidCameraWalls(s);
    }
  }
  const factor=entry.playing?1:1-Math.exp(-dt*(view.pointers.size?15:view.mode===2?16:7));
  camera.position.lerp(cameraDestination,factor);cameraTarget.lerp(lookDestination,factor);
  const shake=impacts?.getShake();
  if(shake&&active&&!reduceMotion){camera.position.x+=shake.x;camera.position.y+=shake.y;}
  camera.lookAt(cameraTarget);
  if(shake&&active&&!reduceMotion)camera.rotation.z+=shake.roll;
  const baseFov=portrait?64:55;
  const targetFov=cinematicFrame?.camera?cinematicFrame.fov:active&&view.mode===2?THREE.MathUtils.clamp(baseFov/view.zoom,35,88):baseFov+(active&&view.mode===0?Math.min(7,Math.abs(s.speed)*.2):0);
  if(Math.abs(camera.fov-targetFov)>.05){camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,factor);camera.updateProjectionMatrix();}
  sky.position.copy(camera.position);
  sun.position.set(px-55,altitude+70,pz+80);sun.target.position.set(px,altitude,pz);
  if(actors.avatar)actors.avatar.visible=(walking||kind==='bicycle')&&!(active&&view.mode===2);
}

// Keep the orbit on the player's side of a wall, including at chunk borders.
function avoidCameraWalls(s){
  const ax=s.x,az=s.z,bx=cameraDestination.x+origin.x,bz=cameraDestination.z+origin.z;
  const obstacles=new Map();
  for(const [x,z] of [[ax,az],[bx,bz]])for(const r of collidersNear(x,z,worldSeed))obstacles.set(r.id,r);
  let nearest=1;
  for(const r of obstacles.values()){
    const top=r.maxY??r.height??(r.kind==='building'?200:3);
    if(Math.min(lookDestination.y,cameraDestination.y)>top+.5)continue;
    const bottom=r.minY??r.minHeight??0;
    if(Math.max(lookDestination.y,cameraDestination.y)<bottom-.25)continue;
    let low=0,high=1;
    for(const [start,end,min,max] of [[ax,bx,r.minX-.25,r.maxX+.25],[az,bz,r.minZ-.25,r.maxZ+.25]]){
      const delta=end-start;
      if(Math.abs(delta)<1e-8){if(start<min||start>max){low=2;break;}}
      else{const a=(min-start)/delta,b=(max-start)/delta;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));}
    }
    if(low<=high&&low>0)nearest=Math.min(nearest,Math.max(.12,low-.08));
  }
  if(nearest<1){cameraDestination.x=ax-origin.x+(bx-ax)*nearest;cameraDestination.z=az-origin.z+(bz-az)*nearest;cameraDestination.y=lookDestination.y+(cameraDestination.y-lookDestination.y)*nearest;}
}
function objectiveTarget(){
  if(!missionEnabled)return null;
  if(missionView?.target)return missionView.target;
  if(missionView?.stage==='vehicle')return game.nearbyVehicle()??[...game.vehicles.values()].sort((a,b)=>Math.hypot(a.x-game.state.x,a.z-game.state.z)-Math.hypot(b.x-game.state.x,b.z-game.state.z))[0];
  return null;
}
function updateMarkers(){
  const point=objectiveTarget(),marker=markers[0];
  marker.group.visible=active&&Boolean(point);
  if(point){
    marker.group.position.set(point.x-origin.x,coastGroundHeight(point.x,point.z)??.22,point.z-origin.z);
    const scale=missionView?.stage==='drive'?1:.62;
    marker.ring.scale.setScalar(scale*(1+(reduceMotion?0:Math.sin(clock*2)*.06)));
    marker.foot.scale.setScalar(scale);
    marker.ring.position.y=missionView?.stage==='drive'?3.25:2.7;
    marker.ring.lookAt(camera.position);
    marker.arrow.position.y=4.7+(reduceMotion?0:Math.sin(clock*3)*.23);
    marker.arrow.rotation.y=reduceMotion?0:clock*.65;
    marker.beam.visible=Math.hypot(point.x-game.state.x,point.z-game.state.z)>12;
  }
}

const mapCanvas=document.querySelector('#minimap');const map=mapCanvas?.getContext('2d');
function drawMap(){
  if(!map)return;
  const w=mapCanvas.width,h=mapCanvas.height,s=game.state,scale=game.mode==='walk'?1.3:game.activeVehicle?.kind==='helicopter'?.4:.62;
  const cx=Math.floor(s.x/CHUNK_SIZE),cz=Math.floor(s.z/CHUNK_SIZE),key=`${worldSeed}:${cx}:${cz}`;
  if(key!==mapCacheKey){mapCacheKey=key;mapChunks=[];for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)mapChunks.push(generateChunk(cx+dx,cz+dz,worldSeed));}
  const sx=x=>w/2+(x-s.x)*scale,sz=z=>h/2+(z-s.z)*scale;
  map.clearRect(0,0,w,h);map.fillStyle='#535b50';map.fillRect(0,0,w,h);
  const roads=new Map();
  for(const chunk of mapChunks){
    map.save();map.beginPath();map.rect(sx(chunk.x),sz(chunk.z),CHUNK_SIZE*scale,CHUNK_SIZE*scale);map.clip();
    map.fillStyle=chunk.coastal?'#7c8c68':'#454b50';map.fillRect(sx(chunk.x),sz(chunk.z),CHUNK_SIZE*scale,CHUNK_SIZE*scale);
    for(const feature of chunk.features){
      map.fillStyle=['ocean','water','canal','fountain','marina'].includes(feature.kind)?'#438f9c':feature.kind==='beach'?'#d6c393':feature.kind==='plaza'?'#baa99a':'#779069';
      if(feature.points?.length){map.beginPath();feature.points.forEach((p,i)=>i?map.lineTo(sx(p.x),sz(p.z)):map.moveTo(sx(p.x),sz(p.z)));map.closePath();map.fill();}
      else if(Number.isFinite(feature.width)&&Number.isFinite(feature.depth))map.fillRect(sx(feature.x-feature.width/2),sz(feature.z-feature.depth/2),feature.width*scale,feature.depth*scale);
    }
    if(chunk.coastal){for(const road of chunk.roads||[])roads.set(road.id,road);}
    else{
      map.fillStyle='#b2aaa0';
      for(const x of [chunk.x,chunk.x+CHUNK_SIZE])map.fillRect(sx(x-10),sz(chunk.z),20*scale,CHUNK_SIZE*scale);
      for(const z of [chunk.z,chunk.z+CHUNK_SIZE])map.fillRect(sx(chunk.x),sz(z-10),CHUNK_SIZE*scale,20*scale);
    }
    map.restore();
  }
  map.lineCap='round';map.lineJoin='round';
  for(const road of roads.values()){
    map.beginPath();road.points.forEach((p,i)=>i?map.lineTo(sx(p.x),sz(p.z)):map.moveTo(sx(p.x),sz(p.z)));
    if(road.closed)map.closePath();map.strokeStyle=road.kind==='alley'?'#a4968b':'#c1b7a4';map.lineWidth=road.width*scale;map.stroke();
  }
  for(const chunk of mapChunks){
    for(const b of chunk.buildings){map.fillStyle=b.landmark?'#ecd2aa':chunk.district.id==='downtown'?'#98a5b0':'#b49f90';map.fillRect(sx(b.x-b.width/2),sz(b.z-b.depth/2),b.width*scale,b.depth*scale);}
  }
  for(const point of CITY_POINTS_OF_INTEREST){
    const x=sx(point.x),z=sz(point.z);if(x<12||x>w-12||z<12||z>h-22)continue;
    map.fillStyle='#2c4658';map.fillRect(x-7,z-7,14,14);map.strokeStyle='#8bc8cc';map.lineWidth=1;map.strokeRect(x-7,z-7,14,14);
    map.fillStyle='#dcffff';map.font='bold 9px sans-serif';map.textAlign='center';map.textBaseline='middle';
    map.fillText({cargo:'港',aviation:'空',sports:'场',beach:'滩',transit:'站',hills:'山',market:'市'}[point.kind]||'园',x,z);
  }
  const target=objectiveTarget();
  if(target){
    const routeKey=`${target.x},${target.z}/${Math.floor(s.x/20)},${Math.floor(s.z/20)}`;
    if(routeKey!==routeCacheKey){routeCacheKey=routeKey;routePoints=coastRoute(s,target);}
    if(game.mode==='drive'&&routePoints?.length){map.beginPath();map.strokeStyle='#ffda73';map.lineWidth=3;routePoints.forEach((p,i)=>i?map.lineTo(sx(p.x),sz(p.z)):map.moveTo(sx(p.x),sz(p.z)));map.stroke();}
    const tx=Math.max(9,Math.min(w-9,sx(target.x))),tz=Math.max(9,Math.min(h-9,sz(target.z)));
    map.fillStyle='#ffe18c';map.beginPath();map.arc(tx,tz,5,0,Math.PI*2);map.fill();
  }
  const nearestSpecial=new Map();
  for(const v of game.vehicles.values())if(['bicycle','truck','helicopter'].includes(v.kind)&&v.id!==game.activeVehicle?.id){
    const distance=Math.hypot(v.x-s.x,v.z-s.z),previous=nearestSpecial.get(v.kind);
    if(!previous||distance<previous.distance)nearestSpecial.set(v.kind,{id:v.id,distance});
  }
  for(const v of game.vehicles.values()){
    if(v.id===game.activeVehicle?.id)continue;
    let x=sx(v.x),z=sz(v.z);const outside=x<9||x>w-9||z<9||z>h-22;
    const special={bicycle:['B','#65f4dd'],truck:['T','#ffba6b'],helicopter:['H','#dda2ff']}[v.kind];
    if(outside){if(!special||nearestSpecial.get(v.kind)?.id!==v.id)continue;x=Math.max(13,Math.min(w-13,x));z=Math.max(13,Math.min(h-28,z));}
    if(special){map.fillStyle='#162335';map.beginPath();map.arc(x,z,7,0,Math.PI*2);map.fill();map.fillStyle=special[1];map.font='bold 10px sans-serif';map.textAlign='center';map.textBaseline='middle';map.fillText(special[0],x,z);}
    else{map.fillStyle='#c0e2ef';map.fillRect(x-2,z-3,4,6);}
    if(outside){map.font='8px sans-serif';map.fillText(`${Math.round(nearestSpecial.get(v.kind).distance)}m`,x,z+12);}
  }
  map.save();map.translate(w/2,h/2);map.rotate(-s.yaw);map.fillStyle='#fff9e6';map.strokeStyle='#292339';map.lineWidth=2;map.beginPath();map.moveTo(0,8);map.lineTo(-5,-5);map.lineTo(0,-2);map.lineTo(5,-5);map.closePath();map.stroke();map.fill();map.restore();
}

function toggleSound(){engineAudio.toggle();if(!engineAudio.enabled)impacts?.clear();updateSound();}
function updateSound(){
  engineAudio.update({speed:Math.abs(game.state.speed),vehicleKind:game.activeVehicle?.kind??'coupe',altitude:game.state.altitude||0,active,driving:game.mode==='drive',
    blocked:ui.orientationBlocked||document.hidden||Boolean(document.querySelector('dialog[open]'))});
}
async function toggleFullscreen(){
  try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen();if(screen.orientation?.lock)try{await screen.orientation.lock('landscape');}catch{/* The rotate hint remains available. */}}else ui.toast('可使用浏览器菜单进入全屏');}catch{ui.toast('浏览器暂未允许全屏');}
  focusCanvas();
}

function tick(now){
  requestAnimationFrame(tick);
  const elapsed=(now-lastTime)/1000;lastTime=now;
  const dt=Math.min(.05,Math.max(0,elapsed));clock+=dt;
  if(!renderer||!ready)return;
  const paused=document.hidden||ui.orientationBlocked||!!document.querySelector('dialog[open]');
  if(entry.playing){cinematicFrame=entry.update(paused?0:dt);if(entry.playing)paintCinematic();else finishEntry();}
  if(active&&!paused){
    const input=readInput();
    game.update(dt,input,walkCameraYaw+view.yaw);
    impacts?.emit(game.drainImpacts?.()||[],{enabled:engineAudio.enabled,listener:game.state});
    if(missionEnabled)missionView=missions.update(dt,actorState());
    else missionView=missions.snapshot(actorState());
  }else missionView=missions.snapshot(actorState());
  if(missionEnabled&&missionView.noticeId!==lastNotice){lastNotice=missionView.noticeId;if(missionView.notice)ui.toast(missionView.notice);}
  syncOrigin();
  impacts?.update(dt,origin,{active:active&&!paused,enabled:engineAudio.enabled});
  cityStats=city.update(game.state.x,game.state.z,origin.x,origin.z);
  city.updateTime?.(clock);
  actors.update(game,origin,clock,missionEnabled?missionView:null);
  updateCamera(dt);updateMarkers();updateSound();
  const s=game.state, target=objectiveTarget(), nearest=game.nearbyVehicle();
  const context=missionEnabled?missionView.interaction:null;
  const canExit=game.mode==='drive'&&Math.abs(s.speed)<=1.4&&(s.altitude||0)<=.35&&Math.abs(s.verticalSpeed||0)<=.5;
  const interactionLabel=context?.label??(game.mode==='drive'?(canExit?'下车':game.activeVehicle?.kind==='helicopter'?'降落停稳后下机':'停车后下车'):nearest?`驾驶 ${nearest.label??'车辆'}`:'靠近车辆可上车');
  const heading=(game.mode==='walk'?walkCameraYaw:s.yaw)+view.yaw;
  const direction=target?Math.atan2(target.x-s.x,target.z-s.z)-heading:null;
  ui.update({mode:game.mode,vehicleKind:game.activeVehicle?.kind,altitude:s.altitude||0,guidanceActive:active&&!paused&&missionEnabled,targetDistance:target?Math.hypot(target.x-s.x,target.z-s.z):null,navigationAngle:direction===null?null:Math.atan2(Math.sin(direction),Math.cos(direction)),vehicleLabel:game.activeVehicle?.label??'街头漫步',interactionLabel,canInteract:!!context?.available||canExit||!!nearest,
    mission:missionEnabled?missionView:{...missionView,chapter:'FREE ROAM',title:'城市属于你',objective:'步行探索，或靠近任意车辆上车。菜单可进入任务模式。',progress:0,total:0,target:null},
    speed:Math.abs(s.speed)*3.6,gear:s.speed<-.15?'R':Math.abs(s.speed)<.15?'N':String(Math.min(5,1+Math.floor(Math.abs(s.speed)/9))),checkpoint:missionView.completed,total:0,time:s.lapTime,distance:s.distance,seed:worldSeed,loadedChunks:cityStats.loaded,destinationDistance:target?Math.hypot(s.x-target.x,s.z-target.z):0,cameraLabel:cameraLabels[view.mode],musicSource:soundtrack.source,musicPanelOpen:soundtrack.isOpen,musicOn:soundtrack.playing,trackLabel:soundtrack.label,soundOn:engineAudio.enabled,cruising:s.cruising,district:districtAt(s.x,s.z,worldSeed).label});
  if(frameCount%5===0)drawMap();
  renderer.render(scene,camera);
  frameCount++;
  if(qualityMode==='auto'&&active&&!paused&&elapsed<.2){frameCost+=elapsed;adaptiveFrames++;if(adaptiveFrames>=240){const next=nextAutomaticTier(autoTier,frameCost/adaptiveFrames);if(next!==autoTier){autoTier=next;applyRenderQuality();ui.toast('已自动平衡画质与流畅度，可在设置中选择高清');}frameCost=0;adaptiveFrames=0;}}
}

window.addEventListener('keydown',event=>{
  if(entry.playing){
    const editing=event.target.matches('input,textarea,select,[contenteditable="true"]');
    if(!editing&&(event.code==='Escape'||(['Space','Enter'].includes(event.code)&&!event.target.matches('button,a')))){event.preventDefault();entry.skip();}
    return;
  }
  if(event.target.matches('input,textarea,select,button,a,[role="button"],[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
  if(event.code==='Escape'){if(active)showMenu();return;}
  if(!active||ui.orientationBlocked)return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight'].includes(event.code)){event.preventDefault();keys.add(event.code);}
  if(event.repeat)return;
  if(event.code==='KeyE'){event.preventDefault();interact();}
  if(event.code==='KeyC')cycleCamera();
  if(event.code==='KeyR')resetCar();
  if(event.code==='KeyV')recenterCamera();
  if(event.code==='KeyN')nextMusic();
  if(event.code==='KeyM')soundtrack.togglePanel();
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{lastTime=performance.now();if(document.hidden){clearInput();impacts?.clear();}updateSound();});
window.addEventListener('resize',()=>{if(renderer&&camera){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();applyRenderQuality();}});
canvas.addEventListener('pointerdown',event=>{
  if(!active||ui.orientationBlocked||document.querySelector('dialog[open]'))return;
  event.preventDefault();focusCanvas();view.begin(event.pointerId,event.clientX,event.clientY);canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>view.move(event.pointerId,event.clientX,event.clientY));
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>view.end(event.pointerId));
canvas.addEventListener('wheel',event=>{if(active){event.preventDefault();view.zoomBy(Math.exp(event.deltaY*.001));}},{passive:false});
canvas.addEventListener('dblclick',recenterCamera);
canvas.addEventListener('contextmenu',event=>event.preventDefault());
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();ready=false;active=false;closeCinematic();clearInput();impacts?.clear();soundtrack.setSuspended(true);updateSound();ui.showIntro();ui.setError('图形连接暂时中断，请重新载入海岸。');});

try{setupRenderer();requestAnimationFrame(tick);await loadWorld();}
catch(error){console.error('Coast initialization failed',error);ui.setError(error instanceof Error?`暂时无法进入 3D 场景：${error.message}`:'暂时无法载入 3D 场景。你仍可观看预览短片。');}
