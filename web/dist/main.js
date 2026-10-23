import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Gameplay } from './gameplay.js?v=4';
import { MissionSystem } from './missions.js?v=4';
import { ActorVisuals } from './actors.js?v=4';
import { createUI } from './ui.js?v=4';
import { CameraControls } from './camera-controls.js?v=4';
import { createRadio } from './radio.js?v=4';
import { refineMaterials } from './surface-detail.js?v=4';
import { InfiniteCity } from './infinite-city.js?v=4';
import { CHUNK_SIZE, generateChunk, districtAt, collidersNear } from './world-layout.js?v=4';
import { FloatingOrigin } from './world-origin.js?v=4';

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
const keys = new Set();
const touch = {left:false,right:false,throttle:false,brake:false,reverse:false,handbrake:false,sprint:false};
let touchSteer = 0, touchMoveX=0, touchMoveZ=0;
const view = new CameraControls();
const radio = createRadio();
let radioStarted = false;
const cameraLabels = ['跟随', '侧面', '第一人称', '俯瞰'];
let renderer, scene, camera, sky, sun, fillLight, actors;
let ready = false, active = false, soundOn = false, clock = 0;
let lastTime = performance.now();
let audioContext, engine, audioGain, engineFilter;
let frameCost = 0, frameCount = 0, adaptiveFrames = 0, adaptiveDone = false;
let introOrbit = 0;
const markers = [];
const cameraTarget = new THREE.Vector3();
const cameraDestination = new THREE.Vector3();
const lookDestination = new THREE.Vector3();
const forward = new THREE.Vector3();
const carPosition = new THREE.Vector3();

const ui = createUI({
  start(mode){
    if (!ready) return;
    active=true; missionEnabled=mode!=='free'; ui.hideIntro();
    radio.setPaused(false);
    if(!radioStarted){radioStarted=true;radio.start().then(ok=>{if(!ok)ui.toast('点电台按钮开启音乐');});}
    else if(radio.enabled)radio.start();
    focusCanvas();
  },
  newCity(){newCity();},
  interact(){interact();focusCanvas();},
  camera(){cycleCamera();focusCanvas();},
  recenter(){recenterCamera();focusCanvas();},
  reset(){resetCar();focusCanvas();},
  sound(){toggleSound();focusCanvas();},
  music(){radioStarted=true;radio.toggle().then(ok=>ui.toast(ok?'COAST FM · 音乐已开启':'电台已暂停'));focusCanvas();},
  track(){radioStarted=true;radio.nextTrack().then(ok=>ui.toast(ok?radio.trackLabel:'点电台按钮开启音乐'));focusCanvas();},
  fullscreen(){toggleFullscreen();},
  menu(){showMenu();},
  dialog(open){if(open)clearInput();radio.setPaused(open||!active||document.hidden);updateSound();},
  orientation(blocked){if(blocked)clearInput();},
  steer(value){touchSteer=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;},
  move(x,z){touchMoveX=Number.isFinite(x)?x:0;touchMoveZ=Number.isFinite(z)?z:0;},
  touch(control,pressed){if(control in touch)touch[control]=pressed;}
});
function recenterCamera(){view.mode=0;view.reset();walkCameraYaw=game.state.yaw;ui.toast('镜头已回正 · 拖动画面自由环视');}
function cycleCamera(){view.cycle();ui.toast(`${cameraLabels[view.mode]} · 拖动环绕 / 双指缩放`);}
function resetCar(){game.reset();missions.reset({seed:worldSeed});lastNotice=0;walkCameraYaw=Math.PI;view.reset();clearInput();syncOrigin();snapCamera();ui.toast('已回到街头起点 · 任务已重新开始');}
function newCity(){
  if(!ready)return;
  worldSeed=Math.floor(Math.random()*2147483646)+1;
  try{localStorage.setItem('sunset-city-seed',String(worldSeed));}catch{/* Optional persistence. */}
  game.setSeed(worldSeed);missions.reset({seed:worldSeed});city.setSeed(worldSeed);mapCacheKey='';lastNotice=0;walkCameraYaw=Math.PI;
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
  if(result.ok&&previousMode!==game.mode){clearInput();view.reset();walkCameraYaw=game.state.yaw;}
}
function syncOrigin(){
  const {dx,dz}=origin.update(game.state.x,game.state.z);
  if(!dx&&!dz)return;
  for(const vector of [camera.position,cameraTarget,cameraDestination,lookDestination]){vector.x-=dx;vector.z-=dz;}
}
function snapCamera(){
  const x=game.state.x-origin.x,z=game.state.z-origin.z;
  camera.position.set(x+1,3,z+6);cameraTarget.set(x,1.5,z);camera.lookAt(cameraTarget);
}

function focusCanvas(){canvas.focus({preventScroll:true});}
function clearInput(){keys.clear();Object.keys(touch).forEach(key=>touch[key]=false);touchSteer=0;touchMoveX=0;touchMoveZ=0;view.clear();}
function showMenu(){active=false;clearInput();radio.setPaused(true);updateSound();ui.showIntro();}
function setupRenderer(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:!mobile,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.3:1.8));
  renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.04;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#bad0d2');
  scene.fog=new THREE.Fog('#bad0d2',mobile?140:210,mobile?250:380);
  camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.15,2600);
  camera.position.set(43,22,48);cameraTarget.set(-2,4,-25);
  camera.lookAt(cameraTarget);
  const hemisphere=new THREE.HemisphereLight('#c4e2f1','#7d7565',1.1);scene.add(hemisphere);
  sun=new THREE.DirectionalLight('#ffe1b1',3.1);sun.position.set(-55,70,80);
  sun.castShadow=true;
  sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);sun.shadow.bias=-.00025;sun.shadow.normalBias=.06;
  Object.assign(sun.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:240});
  scene.add(sun,sun.target);
  fillLight=new THREE.DirectionalLight('#a8d4ee',.45);fillLight.position.set(20,20,-50);scene.add(fillLight);
  const room=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);
  const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;
  room.dispose();pmrem.dispose();
  createSky();createCourse();
  city=new InfiniteCity(scene,{mobile,seed:worldSeed});
  cityStats=city.update(game.state.x,game.state.z,origin.x,origin.z);
  actors=new ActorVisuals(scene,{mobile});
  missionView=missions.snapshot(actorState());
  actors.update(game,origin,clock,missionView);snapCamera();
  canvas.tabIndex=0;
  canvas.setAttribute('aria-label','无限城市。W A S D 移动，Shift 跑步，E 交互或上下车，拖动画面环视。');
}

function createSky(){
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{zenith:{value:new THREE.Color('#75b7d1')},horizon:{value:new THREE.Color('#e9cfb3')},sunColor:{value:new THREE.Color('#fff2d0')},sunDirection:{value:new THREE.Vector3(-.55,.7,.8).normalize()}},
    vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vDir;uniform vec3 zenith,horizon,sunColor,sunDirection;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);}
    void main(){vec3 d=normalize(vDir);float h=smoothstep(-.03,.6,d.y);vec3 c=mix(horizon,zenith,h);
    vec2 p=d.xz/max(.09,d.y)*1.5;float n=noise(p)*.55+noise(p*2.0)*.28+noise(p*4.0)*.17;
    float clouds=smoothstep(.52,.76,n)*smoothstep(.04,.22,d.y);c=mix(c,vec3(.91,.92,.88),clouds*.8);
    float a=max(dot(d,sunDirection),0.0);c+=sunColor*pow(a,36.0)*.25;c=mix(c,sunColor,smoothstep(.9991,.9995,a));gl_FragColor=vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`
  });
  sky=new THREE.Mesh(new THREE.SphereGeometry(1800,32,20),material);sky.renderOrder=-100;sky.frustumCulled=false;scene.add(sky);
}

function createCourse(){
  const group=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(3.15,.065,8,48),new THREE.MeshBasicMaterial({color:'#ffdb78',transparent:true,opacity:.8}));ring.position.y=3.25;
  const footGeometry=new THREE.RingGeometry(3.05,3.15,40);footGeometry.rotateX(-Math.PI/2);
  const foot=new THREE.Mesh(footGeometry,new THREE.MeshBasicMaterial({color:'#ffdb78',transparent:true,opacity:.55,side:THREE.DoubleSide}));foot.position.y=.05;
  group.add(ring,foot);scene.add(group);markers.push({group,ring,foot});
}

async function downloadAsset(file,totalHint,onChunk){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),120000);
  try{
    const response=await fetch(new URL(`./assets/${file}?v=4`,import.meta.url),{signal:controller.signal});
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
  return {throttle:(down('KeyW','ArrowUp')||touch.throttle)?1:0,
    brake:touch.brake?1:0, reverse:(down('KeyS','ArrowDown')||touch.reverse)?1:0,
    steer:keyboardSteer||touchSteer||(touch.left?1:0)-(touch.right?1:0),
    handbrake:down('Space')||touch.handbrake,
    moveX:-keyboardSteer||touchMoveX,moveZ:((down('KeyW','ArrowUp')?1:0)-(down('KeyS','ArrowDown')?1:0))||touchMoveZ,
    sprint:down('ShiftLeft','ShiftRight')||touch.sprint};
}

function updateCamera(dt){
  const s=game.state, walking=game.mode==='walk', portrait=innerHeight>innerWidth;
  const px=s.x-origin.x,pz=s.z-origin.z;
  if(!active){
    if(!reduceMotion)introOrbit+=dt*.035;
    cameraDestination.set(px-8+Math.sin(introOrbit)*2,3.8,pz+9+Math.cos(introOrbit)*2);
    lookDestination.set(px+5,2.1,pz-22);
  }else{
    carPosition.set(px,0,pz);
    const yaw=(walking?walkCameraYaw:s.yaw)+view.yaw;
    forward.set(Math.sin(yaw),0,Math.cos(yaw));
    if(view.mode===2){
      cameraDestination.copy(carPosition).addScaledVector(new THREE.Vector3(Math.sin(s.yaw),0,Math.cos(s.yaw)),walking?.08:1.85);
      cameraDestination.y=walking?1.88:1.24;
      lookDestination.copy(cameraDestination).addScaledVector(forward,30);
      lookDestination.y+=Math.sin(-view.pitch)*20;
    }else{
      let radius, elevation, angle=yaw;
      if(view.mode===0){radius=walking?(portrait?6.2:4.8):(portrait?10:8.2)+Math.abs(s.speed)*.045;elevation=walking?.22:.27;}
      else if(view.mode===1){radius=walking?5.8:8.5;elevation=.20;angle+=.7;}
      else{radius=portrait?28:24;elevation=.91;}
      elevation=THREE.MathUtils.clamp(elevation+view.pitch,.10,1.42);
      radius*=view.zoom;
      const eye=walking?1.55:.95;
      cameraDestination.set(px-Math.sin(angle)*radius*Math.cos(elevation),eye+radius*Math.sin(elevation),pz-Math.cos(angle)*radius*Math.cos(elevation));
      lookDestination.copy(carPosition);lookDestination.y=eye;
      if(walking&&view.mode===0){cameraDestination.x-=Math.cos(angle)*.48;cameraDestination.z+=Math.sin(angle)*.48;}
      if(view.mode===0)lookDestination.addScaledVector(forward,walking?1.4:2.3);
      avoidCameraWalls(s);
    }
  }
  const factor=1-Math.exp(-dt*(view.pointers.size?15:view.mode===2?16:7));
  camera.position.lerp(cameraDestination,factor);cameraTarget.lerp(lookDestination,factor);camera.lookAt(cameraTarget);
  const baseFov=portrait?64:55;
  const targetFov=active&&view.mode===2?THREE.MathUtils.clamp(baseFov/view.zoom,35,88):baseFov+(active&&view.mode===0?Math.min(7,Math.abs(s.speed)*.2):0);
  if(Math.abs(camera.fov-targetFov)>.05){camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,factor);camera.updateProjectionMatrix();}
  sky.position.copy(camera.position);
  sun.position.set(px-55,70,pz+80);sun.target.position.set(px,0,pz);
  if(actors.avatar)actors.avatar.visible=!(active&&walking&&view.mode===2)&&walking;
}

// Keep the orbit on the player's side of a wall, including at chunk borders.
function avoidCameraWalls(s){
  const ax=s.x,az=s.z,bx=cameraDestination.x+origin.x,bz=cameraDestination.z+origin.z;
  const obstacles=new Map();
  for(const [x,z] of [[ax,az],[bx,bz]])for(const r of collidersNear(x,z,worldSeed))obstacles.set(r.id,r);
  let nearest=1;
  for(const r of obstacles.values()){
    let low=0,high=1;
    for(const [start,end,min,max] of [[ax,bx,r.minX-.25,r.maxX+.25],[az,bz,r.minZ-.25,r.maxZ+.25]]){
      const delta=end-start;
      if(Math.abs(delta)<1e-8){if(start<min||start>max){low=2;break;}}
      else{const a=(min-start)/delta,b=(max-start)/delta;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));}
    }
    if(low<=high&&low>0)nearest=Math.min(nearest,Math.max(.12,low-.08));
  }
  if(nearest<1){cameraDestination.x=ax-origin.x+(bx-ax)*nearest;cameraDestination.z=az-origin.z+(bz-az)*nearest;cameraDestination.y=1.6+(cameraDestination.y-1.6)*nearest;}
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
    marker.group.position.set(point.x-origin.x,.22,point.z-origin.z);
    const scale=missionView?.stage==='drive'?1:.38;
    marker.ring.scale.setScalar(scale*(1+Math.sin(clock*2)*.04));
    marker.foot.scale.setScalar(scale);
    marker.ring.position.y=missionView?.stage==='drive'?3.25:2.7;
    marker.ring.lookAt(camera.position.x,marker.ring.position.y+.22,camera.position.z);
  }
}

const mapCanvas=document.querySelector('#minimap');const map=mapCanvas?.getContext('2d');
function drawMap(){
  if(!map)return;
  const w=mapCanvas.width,h=mapCanvas.height,s=game.state,scale=game.mode==='walk'?1.3:.62;
  const cx=Math.floor(s.x/CHUNK_SIZE),cz=Math.floor(s.z/CHUNK_SIZE),key=`${worldSeed}:${cx}:${cz}`;
  if(key!==mapCacheKey){mapCacheKey=key;mapChunks=[];for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)mapChunks.push(generateChunk(cx+dx,cz+dz,worldSeed));}
  const sx=x=>w/2+(x-s.x)*scale,sz=z=>h/2+(z-s.z)*scale;
  map.clearRect(0,0,w,h);map.fillStyle='#3a3445';map.fillRect(0,0,w,h);
  map.fillStyle='#77717c';
  for(let i=-2;i<=3;i++){map.fillRect(sx((cx+i)*CHUNK_SIZE-10),0,20*scale,h);map.fillRect(0,sz((cz+i)*CHUNK_SIZE-10),w,20*scale);}
  for(const chunk of mapChunks){
    for(const feature of chunk.features){map.fillStyle=feature.kind==='canal'||feature.kind==='fountain'?'#548e98':'#638476';map.fillRect(sx(feature.x-feature.width/2),sz(feature.z-feature.depth/2),feature.width*scale,feature.depth*scale);}
    map.fillStyle=chunk.district.id==='downtown'?'#98a5b0':'#ba9c9e';
    for(const b of chunk.buildings)map.fillRect(sx(b.x-b.width/2),sz(b.z-b.depth/2),b.width*scale,b.depth*scale);
  }
  const target=objectiveTarget();
  if(target){
    if(game.mode==='drive'){map.beginPath();map.strokeStyle='#edc968';map.lineWidth=3;map.setLineDash([5,4]);map.moveTo(w/2,h/2);map.lineTo(w/2,sz(Math.round(s.z/CHUNK_SIZE)*CHUNK_SIZE));map.lineTo(sx(Math.round(target.x/CHUNK_SIZE)*CHUNK_SIZE),sz(Math.round(s.z/CHUNK_SIZE)*CHUNK_SIZE));map.lineTo(sx(Math.round(target.x/CHUNK_SIZE)*CHUNK_SIZE),sz(target.z));map.lineTo(sx(target.x),sz(target.z));map.stroke();map.setLineDash([]);}
    const tx=Math.max(9,Math.min(w-9,sx(target.x))),tz=Math.max(9,Math.min(h-9,sz(target.z)));
    map.fillStyle='#ffe18c';map.beginPath();map.arc(tx,tz,5,0,Math.PI*2);map.fill();
  }
  map.fillStyle='#b8def0';for(const v of game.vehicles.values()){if(v.id===game.activeVehicle?.id)continue;map.fillRect(sx(v.x)-2,sz(v.z)-3,4,6);}

  map.save();map.translate(w/2,h/2);map.rotate(-s.yaw);map.fillStyle='#fff9e6';map.strokeStyle='#292339';map.lineWidth=2;map.beginPath();map.moveTo(0,8);map.lineTo(-5,-5);map.lineTo(0,-2);map.lineTo(5,-5);map.closePath();map.stroke();map.fill();map.restore();
}

function toggleSound(){
  if(!audioContext){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio){ui.toast('此浏览器暂不支持声音');return;}
    audioContext=new Audio();engine=audioContext.createOscillator();engine.type='sawtooth';
    engineFilter=audioContext.createBiquadFilter();engineFilter.type='lowpass';engineFilter.frequency.value=420;
    audioGain=audioContext.createGain();audioGain.gain.value=0;
    engine.connect(engineFilter).connect(audioGain).connect(audioContext.destination);engine.start();
  }
  soundOn=!soundOn;if(soundOn)audioContext.resume().catch(()=>{soundOn=false;});
  ui.toast(soundOn?'引擎声已开启':'声音已关闭');
}
function updateSound(){
  if(!audioContext)return;
  const speed=Math.abs(game.state.speed);
  engine.frequency.setTargetAtTime(42+speed*5,audioContext.currentTime,.08);
  engineFilter.frequency.setTargetAtTime(250+speed*18,audioContext.currentTime,.08);
  audioGain.gain.setTargetAtTime(soundOn&&active&&game.mode==='drive'&&!ui.orientationBlocked&&!document.hidden&&!document.querySelector('dialog[open]')?.022:0,audioContext.currentTime,.08);
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
  if(active&&!paused){
    const input=readInput();
    game.update(dt,input,walkCameraYaw+view.yaw);
    if(missionEnabled)missionView=missions.update(dt,actorState());
    else missionView=missions.snapshot(actorState());
  }else missionView=missions.snapshot(actorState());
  if(missionEnabled&&missionView.noticeId!==lastNotice){lastNotice=missionView.noticeId;if(missionView.notice)ui.toast(missionView.notice);}
  syncOrigin();
  cityStats=city.update(game.state.x,game.state.z,origin.x,origin.z);
  actors.update(game,origin,clock,missionEnabled?missionView:null);
  radio.setPaused(!active||paused);
  updateCamera(dt);updateMarkers();updateSound();
  const s=game.state, target=objectiveTarget(), nearest=game.nearbyVehicle();
  const context=missionEnabled?missionView.interaction:null;
  const canExit=game.mode==='drive'&&Math.abs(s.speed)<=1.4;
  const interactionLabel=context?.label??(game.mode==='drive'?(canExit?'下车':'停车后下车'):nearest?`驾驶 ${nearest.label??'车辆'}`:'靠近车辆可上车');
  ui.update({mode:game.mode,vehicleLabel:game.activeVehicle?.label??'街头漫步',interactionLabel,canInteract:!!context?.available||canExit||!!nearest,
    mission:missionEnabled?missionView:{...missionView,chapter:'FREE ROAM',title:'城市属于你',objective:'步行探索，或靠近任意车辆上车。菜单可进入任务模式。',progress:0,total:0,target:null},
    speed:Math.abs(s.speed)*3.6,gear:s.speed<-.15?'R':Math.abs(s.speed)<.15?'N':String(Math.min(5,1+Math.floor(Math.abs(s.speed)/9))),checkpoint:missionView.completed,total:0,time:s.lapTime,distance:s.distance,seed:worldSeed,loadedChunks:cityStats.loaded,destinationDistance:target?Math.hypot(s.x-target.x,s.z-target.z):0,cameraLabel:cameraLabels[view.mode],musicOn:radio.enabled,trackLabel:radio.trackLabel,soundOn,cruising:s.cruising,district:districtAt(s.x,s.z,worldSeed).label});
  if(frameCount%5===0)drawMap();
  renderer.render(scene,camera);
  frameCount++;
  if(active&&!paused&&!adaptiveDone&&elapsed<.2){frameCost+=elapsed;adaptiveFrames++;if(adaptiveFrames>180){if(frameCost/adaptiveFrames>.035){renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);sun.shadow.mapSize.set(512,512);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}adaptiveDone=true;}}
}

window.addEventListener('keydown',event=>{
  if(event.target.matches('input,textarea,select,button,a,[role="button"],[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
  if(event.code==='Escape'){if(active)showMenu();return;}
  if(!active||ui.orientationBlocked)return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(event.code)){event.preventDefault();keys.add(event.code);}
  if(event.repeat)return;
  if(event.code==='KeyE'){event.preventDefault();interact();}
  if(event.code==='KeyC')cycleCamera();
  if(event.code==='KeyR')resetCar();
  if(event.code==='KeyV')recenterCamera();
  if(event.code==='KeyN'){radioStarted=true;radio.nextTrack();}
  if(event.code==='KeyM'){radioStarted=true;radio.toggle();}
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{lastTime=performance.now();if(document.hidden)clearInput();radio.setPaused(document.hidden||!active||!!document.querySelector('dialog[open]'));updateSound();});
window.addEventListener('resize',()=>{if(renderer&&camera){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}});
canvas.addEventListener('pointerdown',event=>{
  if(!active||ui.orientationBlocked||document.querySelector('dialog[open]'))return;
  event.preventDefault();view.begin(event.pointerId,event.clientX,event.clientY);canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>view.move(event.pointerId,event.clientX,event.clientY));
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>view.end(event.pointerId));
canvas.addEventListener('wheel',event=>{if(active){event.preventDefault();view.zoomBy(Math.exp(event.deltaY*.001));}},{passive:false});
canvas.addEventListener('dblclick',recenterCamera);
canvas.addEventListener('contextmenu',event=>event.preventDefault());
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();ready=false;active=false;clearInput();radio.setPaused(true);ui.setError('图形连接暂时中断，请重新载入海岸。');});

try{setupRenderer();requestAnimationFrame(tick);await loadWorld();}
catch(error){console.error('Coast initialization failed',error);ui.setError(error instanceof Error?`暂时无法进入 3D 场景：${error.message}`:'暂时无法载入 3D 场景。你仍可观看预览短片。');}
