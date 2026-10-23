import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DrivingSimulation, CHECKPOINTS } from './driving.js?v=2';
import { createUI } from './ui.js?v=2';
import { CameraControls } from './camera-controls.js?v=2';
import { createRadio } from './radio.js?v=2';
import { refineMaterials } from './surface-detail.js?v=2';

const canvas = document.querySelector('#world');
const mobile = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sim = new DrivingSimulation();
const keys = new Set();
const touch = {left:false,right:false,throttle:false,brake:false,reverse:false,handbrake:false};
let touchSteer = 0;
const view = new CameraControls();
const radio = createRadio();
let radioStarted = false;
const cameraLabels = ['追车', '环绕看车', '车头', '俯瞰'];
let renderer, scene, camera, car, sky, sea, sun, fillLight, wheels = [];
let ready = false, active = false, soundOn = false, clock = 0;
let lastTime = performance.now(), lastCheckpoint = 0, lastCompleted = false;
let audioContext, engine, audioGain, engineFilter, lastBest = 0;
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
    active=true; sim.setCruise(mode==='cruise'); ui.hideIntro();
    radio.setPaused(false);
    if(!radioStarted){radioStarted=true;radio.start().then(ok=>{if(!ok)ui.toast('点电台按钮开启音乐');});}
    else if(radio.enabled)radio.start();
    focusCanvas();
  },
  camera(){cycleCamera();focusCanvas();},
  recenter(){recenterCamera();focusCanvas();},
  reset(){resetCar();focusCanvas();},
  sound(){toggleSound();focusCanvas();},
  music(){radioStarted=true;radio.toggle().then(ok=>ui.toast(ok?'COAST FM · 音乐已开启':'电台已暂停'));focusCanvas();},
  track(){radioStarted=true;radio.nextTrack().then(ok=>ui.toast(ok?radio.trackLabel:'点电台按钮开启音乐'));focusCanvas();},
  fullscreen(){toggleFullscreen();},
  menu(){showMenu();},
  dialog(open){if(open)clearInput();radio.setPaused(open||!active||document.hidden);updateSound();},
  steer(value){touchSteer=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;},
  touch(control,pressed){if(control in touch)touch[control]=pressed;}
});
function recenterCamera(){view.mode=0;view.reset();ui.toast('已回到追车镜头 · 拖动画面可自由环绕');}
function cycleCamera(){view.cycle();ui.toast(`${cameraLabels[view.mode]} · 拖动环绕 / 双指缩放`);}
function resetCar(){sim.reset();lastCheckpoint=0;lastCompleted=false;view.reset();ui.toast('已回到海岸起点');}

function focusCanvas(){canvas.focus({preventScroll:true});}
function clearInput(){keys.clear();Object.keys(touch).forEach(key=>touch[key]=false);touchSteer=0;view.clear();}
function showMenu(){active=false;clearInput();radio.setPaused(true);updateSound();ui.showIntro();}
function saveBest(){
  if(sim.state.bestTime && sim.state.bestTime!==lastBest){
    lastBest=sim.state.bestTime;
    try{localStorage.setItem('sunset-coast-best',String(lastBest));}catch{/* Storage is optional. */}
  }
}
try{const best=Number(localStorage.getItem('sunset-coast-best'));if(best>0&&Number.isFinite(best)){sim.state.bestTime=best;lastBest=best;}}catch{/* Private browsing works without persistence. */}

function setupRenderer(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:!mobile,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.3:1.8));
  renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.03;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#b9839c');
  scene.fog=new THREE.Fog('#bc8d9e',100,680);
  camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.15,2600);
  camera.position.set(43,22,48);cameraTarget.set(-2,4,-25);
  camera.lookAt(cameraTarget);
  const hemisphere=new THREE.HemisphereLight('#dfe9ff','#725455',1.65);scene.add(hemisphere);
  sun=new THREE.DirectionalLight('#ffd2a0',3.5);sun.position.set(55,70,-80);
  sun.castShadow=true;
  sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);sun.shadow.bias=-.00025;sun.shadow.normalBias=.06;
  Object.assign(sun.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:240});
  scene.add(sun,sun.target);
  fillLight=new THREE.DirectionalLight('#9be5f0',.8);fillLight.position.set(20,20,50);scene.add(fillLight);
  const room=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);
  const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;
  room.dispose();pmrem.dispose();
  createSky();createSea();createCourse();
  canvas.tabIndex=0;
  canvas.setAttribute('aria-label','海滨城市驾驶画面。使用 W A S D 或方向键驾驶。');
}

function createSky(){
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{zenith:{value:new THREE.Color('#756286')},horizon:{value:new THREE.Color('#f4b3a3')},sunColor:{value:new THREE.Color('#ffe8af')},sunDirection:{value:new THREE.Vector3(.20,.16,-1).normalize()}},
    vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vDir;uniform vec3 zenith,horizon,sunColor,sunDirection;void main(){vec3 d=normalize(vDir);float h=smoothstep(-.03,.6,d.y);vec3 c=mix(horizon,zenith,h);float a=max(dot(d,sunDirection),0.0);c+=sunColor*pow(a,36.0)*.25;c=mix(c,sunColor,smoothstep(.9981,.9987,a));gl_FragColor=vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`
  });
  sky=new THREE.Mesh(new THREE.SphereGeometry(1800,32,20),material);sky.renderOrder=-100;sky.frustumCulled=false;scene.add(sky);
}

function createSea(){
  const geometry=new THREE.PlaneGeometry(1600,2300,70,120);geometry.rotateX(-Math.PI/2);
  const material=new THREE.ShaderMaterial({
    uniforms:{time:{value:0},eye:{value:new THREE.Vector3()},deep:{value:new THREE.Color('#1e747d')},shallow:{value:new THREE.Color('#65b4af')},sunColor:{value:new THREE.Color('#efb185')}},
    vertexShader:`uniform float time;varying vec3 vWorld;void main(){vec3 p=position;p.y+=sin(p.x*.13+time*.8)*.04+cos(p.z*.2+time*.55)*.025;vec4 w=modelMatrix*vec4(p,1.0);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform float time;uniform vec3 eye,deep,shallow,sunColor;varying vec3 vWorld;void main(){float rip=sin(vWorld.z*2.2+sin(vWorld.x*.7+time)*1.6+time)*.5+.5;vec3 n=normalize(vec3(sin(vWorld.x*.7+time)*.08,1.0,cos(vWorld.z*.6+time)*.13));vec3 v=normalize(eye-vWorld);float f=pow(1.0-max(dot(v,n),0.0),3.0);vec3 c=mix(deep,shallow,.14+rip*.06);float glint=pow(max(dot(reflect(-normalize(vec3(.3,.4,-1.0)),n),v),0.0),45.0);c=mix(c,sunColor,f*.2)+sunColor*glint*.7;float fog=smoothstep(150.0,700.0,distance(eye,vWorld));c=mix(c,vec3(.62,.38,.43),fog*.8);gl_FragColor=vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`
  });
  sea=new THREE.Mesh(geometry,material);sea.position.set(831,-.36,-850);scene.add(sea);
}

function createCourse(){
  const ringGeo=new THREE.TorusGeometry(3.15,.065,8,56);
  const footGeo=new THREE.RingGeometry(3.05,3.15,48);footGeo.rotateX(-Math.PI/2);
  CHECKPOINTS.forEach((point,i)=>{
    const group=new THREE.Group();group.position.set(point.x,0,point.z);
    const color=i===0?'#b3fff0':'#e6b8dd';
    const ring=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85}));ring.position.y=3.25;
    const foot=new THREE.Mesh(footGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.6,side:THREE.DoubleSide}));foot.position.y=.04;
    group.add(ring,foot);scene.add(group);markers.push({group,ring,foot});
  });
}

async function downloadAsset(file,totalHint,onChunk){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),120000);
  try{
    const response=await fetch(new URL(`./assets/${file}?v=2`,import.meta.url),{signal:controller.signal});
    if(!response.ok)throw new Error(`素材加载失败 (${response.status})`);
    if(!response.body){const data=await response.arrayBuffer();onChunk(data.byteLength,totalHint);return data;}
    const reader=response.body.getReader();const chunks=[];let loaded=0;
    while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;onChunk(loaded,totalHint);}
    const data=new Uint8Array(loaded);let offset=0;chunks.forEach(chunk=>{data.set(chunk,offset);offset+=chunk.length;});return data.buffer;
  }finally{clearTimeout(timeout);}
}

async function loadWorld(){
  const loader=new GLTFLoader();const progress=[0,0];
  let assetSizes=[10792856,1023164];
  try{const metadata=await fetch(new URL('./assets/scene-data.json?v=2',import.meta.url));if(metadata.ok){const data=await metadata.json();assetSizes=[data.assets['environment.glb'].bytes,data.assets['car.glb'].bytes];}}catch{/* File progress still works with fallback estimates. */}
  const totalSize=assetSizes[0]+assetSizes[1];
  const update=(i)=>bytes=>{progress[i]=bytes;const ratio=Math.min(.94,(progress[0]+progress[1])/totalSize*.94);ui.setLoading(ratio,'正在载入城市与跑车…');};
  const [environmentData,carData]=await Promise.all([downloadAsset('environment.glb',assetSizes[0],update(0)),downloadAsset('car.glb',assetSizes[1],update(1))]);
  ui.setLoading(.96,'正在准备夕阳与驾驶镜头…');
  const [environment,vehicle]=await Promise.all([loader.parseAsync(environmentData,''),loader.parseAsync(carData,'')]);
  environment.scene.traverse(object=>{
    if(object.isMesh){
      object.castShadow=true;object.receiveShadow=true;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const material of materials){material.envMapIntensity=.55;if(material.emissiveIntensity>1)material.emissiveIntensity=Math.min(material.emissiveIntensity,2.2);}
    }
  });
  refineMaterials(environment.scene);
  scene.add(environment.scene);car=vehicle.scene;refineMaterials(car,true);scene.add(car);
  car.traverse(object=>{
    if(object.isMesh){object.castShadow=true;object.receiveShadow=true;const ms=Array.isArray(object.material)?object.material:[object.material];ms.forEach(m=>m.envMapIntensity=1.15);}
    if(object.userData.wheel_radius)wheels.push({node:object,initial:object.rotation.x,radius:object.userData.wheel_radius,front:object.name.includes('front')});
  });
  // A soft contact patch remains visible on devices with shadows disabled.
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(2.4,4.8),new THREE.MeshBasicMaterial({color:0x251c32,transparent:true,opacity:.14,depthWrite:false}));
  contact.rotation.x=-Math.PI/2;contact.position.y=.012;car.add(contact);
  positionCar();ui.setLoading(1,'海岸已就绪');ready=true;ui.setReady();
  if(renderer.compileAsync){try{await renderer.compileAsync(scene,camera);}catch{/* First render remains the compatibility fallback. */}}
}

function positionCar(){
  const state=sim.state;car.position.set(state.x,state.x>11?-.16:state.x>6.5?.14:.015,state.z);
  car.rotation.set(0,state.yaw,Math.max(-.035,Math.min(.035,-state.steering*state.speed*.001)));
  for(const wheel of wheels){
    wheel.node.rotation.order='YXZ';
    wheel.node.rotation.y=wheel.front?state.steering:0;
    wheel.node.rotation.x=wheel.initial+(state.wheelAngle||0);
  }
}
function readInput(){
  const down=(...list)=>list.some(key=>keys.has(key));
  const keyboardSteer=(down('KeyA','ArrowLeft')?1:0)-(down('KeyD','ArrowRight')?1:0);
  return {throttle:(down('KeyW','ArrowUp')||touch.throttle)?1:0,
    brake:touch.brake?1:0, reverse:(down('KeyS','ArrowDown')||touch.reverse)?1:0,
    steer:keyboardSteer||touchSteer||(touch.left?1:0)-(touch.right?1:0),
    handbrake:down('Space')||touch.handbrake};
}

function updateCamera(dt){
  const s=sim.state, portrait=innerHeight>innerWidth;
  if(!active){
    if(!reduceMotion)introOrbit+=dt*.035;
    cameraDestination.set(42+Math.sin(introOrbit)*6,20,48+Math.cos(introOrbit)*6);
    lookDestination.set(-2,4,-26);
  }else{
    carPosition.set(s.x,0,s.z);
    const yaw=s.yaw+view.yaw;
    forward.set(Math.sin(yaw),0,Math.cos(yaw));
    if(view.mode===2){
      cameraDestination.copy(carPosition).addScaledVector(new THREE.Vector3(Math.sin(s.yaw),0,Math.cos(s.yaw)),1.85);
      cameraDestination.y=1.24;
      lookDestination.copy(cameraDestination).addScaledVector(forward,30);
      lookDestination.y+=Math.sin(-view.pitch)*20;
    }else{
      let radius, elevation, angle=yaw;
      if(view.mode===0){radius=(portrait?11.8:9.3)+Math.abs(s.speed)*.055;elevation=.38;}
      else if(view.mode===1){radius=portrait?11:8.5;elevation=.26;angle+=.7;}
      else{radius=portrait?28:24;elevation=.91;}
      elevation=THREE.MathUtils.clamp(elevation+view.pitch,.10,1.42);
      radius*=view.zoom;
      cameraDestination.set(s.x-Math.sin(angle)*radius*Math.cos(elevation),.85+radius*Math.sin(elevation),s.z-Math.cos(angle)*radius*Math.cos(elevation));
      lookDestination.copy(carPosition);lookDestination.y=.9;
      if(view.mode===0 && Math.abs(view.yaw)<.2)lookDestination.addScaledVector(forward,portrait?1:2.3);
    }
  }
  const factor=1-Math.exp(-dt*(view.pointers.size?15:view.mode===2?16:7));
  camera.position.lerp(cameraDestination,factor);cameraTarget.lerp(lookDestination,factor);camera.lookAt(cameraTarget);
  const baseFov=portrait?64:55;
  const targetFov=active&&view.mode===2?THREE.MathUtils.clamp(baseFov/view.zoom,35,88):baseFov+(active&&view.mode===0?Math.min(7,Math.abs(s.speed)*.2):0);
  if(Math.abs(camera.fov-targetFov)>.05){camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,factor);camera.updateProjectionMatrix();}
  sky.position.copy(camera.position);sea.material.uniforms.eye.value.copy(camera.position);
  sun.position.set(s.x+55,70,s.z-80);sun.target.position.set(s.x,0,s.z);
}

function updateMarkers(){
  const s=sim.state;
  markers.forEach((marker,index)=>{
    const current=index===s.checkpoint;
    marker.group.visible=active&&(current||index===s.checkpoint+1);
    marker.ring.material.opacity=current?.8:.16;
    marker.foot.material.opacity=current?.55:.15;
    marker.ring.scale.setScalar(1+Math.sin(clock*2)*.025);
    marker.ring.lookAt(camera.position.x,3.25,camera.position.z);
  });
  if(s.checkpoint!==lastCheckpoint){if(s.checkpoint>lastCheckpoint)ui.toast(`光圈 ${s.checkpoint} / ${s.total} · 自由探索`);lastCheckpoint=s.checkpoint;}
  if(s.completed&&!lastCompleted){ui.toast('海岸巡游完成！最佳用时已保存在本机');saveBest();}
  lastCompleted=!!s.completed;
}

const mapCanvas=document.querySelector('#minimap');const map=mapCanvas?.getContext('2d');
function drawMap(){
  if(!map)return;
  const w=mapCanvas.width,h=mapCanvas.height,s=sim.state;
  map.clearRect(0,0,w,h);map.fillStyle='#292339';map.fillRect(0,0,w,h);
  const sx=x=>w*.42+x*1.4;const sz=z=>h*.52+(z-s.z)*.82;
  map.fillStyle='#324e5b';map.fillRect(sx(31),0,w,h);map.fillStyle='#947b72';map.fillRect(sx(11),0,28,h);
  map.fillStyle='#625069';map.fillRect(sx(-35),0,30,h);
  map.fillStyle='#343342';map.fillRect(sx(-6.5),0,18,h);
  map.strokeStyle='#c4a684';map.setLineDash([5,6]);map.beginPath();map.moveTo(sx(0),0);map.lineTo(sx(0),h);map.stroke();map.setLineDash([]);
  CHECKPOINTS.forEach((point,i)=>{if(i<s.checkpoint)return;map.beginPath();map.strokeStyle=i===s.checkpoint?'#b9ffdf':'#bba3c2';map.lineWidth=i===s.checkpoint?2:1;map.arc(sx(point.x),sz(point.z),4,0,Math.PI*2);map.stroke();});
  map.save();map.translate(sx(s.x),sz(s.z));map.rotate(-s.yaw);map.fillStyle='#faffef';map.beginPath();map.moveTo(0,7);map.lineTo(-4,-4);map.lineTo(4,-4);map.closePath();map.fill();map.restore();
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
  const speed=Math.abs(sim.state.speed);
  engine.frequency.setTargetAtTime(42+speed*5,audioContext.currentTime,.08);
  engineFilter.frequency.setTargetAtTime(250+speed*18,audioContext.currentTime,.08);
  audioGain.gain.setTargetAtTime(soundOn&&active&&!document.hidden&&!document.querySelector('dialog[open]')?.022:0,audioContext.currentTime,.08);
}
async function toggleFullscreen(){
  try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else ui.toast('可使用浏览器菜单进入全屏');}catch{ui.toast('浏览器暂未允许全屏');}
  focusCanvas();
}

function tick(now){
  requestAnimationFrame(tick);
  const elapsed=(now-lastTime)/1000;lastTime=now;
  const dt=Math.min(.05,Math.max(0,elapsed));clock+=dt;
  if(!renderer||!ready)return;
  const paused=document.hidden||!!document.querySelector('dialog[open]');
  if(active&&!paused){
    const input=readInput();if(sim.state.cruising&&(input.throttle||input.brake||input.reverse||input.steer||input.handbrake)){sim.setCruise(false);ui.toast('已接管驾驶');}
    sim.update(dt,input);positionCar();
  }
  radio.setPaused(!active||paused);
  updateCamera(dt);sea.material.uniforms.time.value=clock;updateMarkers();updateSound();
  const s=sim.state;
  ui.update({speed:Math.abs(s.speed)*3.6,gear:s.speed<-.15?'R':Math.abs(s.speed)<.15?'N':String(Math.min(5,1+Math.floor(Math.abs(s.speed)/9))),checkpoint:s.checkpoint,total:s.total,best:s.bestTime||null,time:s.lapTime,cameraLabel:cameraLabels[view.mode],musicOn:radio.enabled,trackLabel:radio.trackLabel,soundOn,cruising:s.cruising,district:s.x>10?'SUNSET BEACH · 日落海滩':s.z< -110?'PALM DISTRICT · 棕榈街区':'OCEAN DRIVE · 海滨大道'});
  if(frameCount%3===0)drawMap();
  renderer.render(scene,camera);
  frameCount++;
  if(active&&!paused&&!adaptiveDone&&elapsed<.2){frameCost+=elapsed;adaptiveFrames++;if(adaptiveFrames>180){if(frameCost/adaptiveFrames>.035){renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);sun.castShadow=false;}adaptiveDone=true;}}
}

window.addEventListener('keydown',event=>{
  if(event.target.matches('input,textarea,select,button,a,[role="button"],[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
  if(event.code==='Escape'){if(active)showMenu();return;}
  if(!active)return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)){event.preventDefault();keys.add(event.code);}
  if(event.repeat)return;
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
  if(!active||document.querySelector('dialog[open]'))return;
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
