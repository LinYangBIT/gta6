import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {EntryCinematic} from '../dist/entry-cinematic.js';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const source=await readFile(new URL('../dist/main.js',import.meta.url),'utf8');

function harness(){
  const callbacks={window:new Map(),document:new Map(),canvas:new Map()},calls=[],elements=new Map();
  let handlers,videoOpen=false,now=0;
  class Vector3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}set(x,y,z){Object.assign(this,{x,y,z});return this;}}
  function element(id){
    if(!elements.has(id))elements.set(id,{hidden:true,inert:false,style:{setProperty(){}},listeners:new Map(),
      addEventListener(name,fn){this.listeners.set(name,fn);},focus(){calls.push('focus:'+id);}});
    return elements.get(id);
  }
  const canvas={focus(){calls.push('focus:canvas');},addEventListener(name,fn){callbacks.canvas.set(name,fn);}};
  const soundtrack={source:'spotify',prepare(){calls.push('prepare');return Promise.resolve(true);},start(){calls.push('start');return Promise.resolve(true);},setSuspended(value){calls.push(['suspended',value]);},nextTrack(){},togglePanel(){}};
  const classes=new Set();
  const document={hidden:false,body:{classList:{add(value){classes.add(value);},remove(value){classes.delete(value);}}},
    querySelector(selector){if(selector==='#world')return canvas;if(selector.includes('dialog')&&videoOpen)return element('video-dialog');return null;},
    getElementById(id){if(id==='video-dialog')return {open:videoOpen};if(id==='graphics-quality')return null;return element(id);},
    addEventListener(name,fn){callbacks.document.set(name,fn);}};
  const ui={hideIntro(){calls.push('hide');},showIntro(){calls.push('menu');},toast(){},setError(){},update(){},orientationBlocked:false};
  const context=vm.createContext({
    THREE:{Vector3},EntryCinematic,document,window:{addEventListener(name,fn){callbacks.window.set(name,fn);}},
    matchMedia:()=>({matches:false}),performance:{now:()=>now},localStorage:{getItem:()=>null},
    Gameplay:class{constructor(){this.mode='walk';this.state={x:13,z:30,yaw:Math.PI,speed:0,distance:0};this.vehicles=new Map();this.updates=0;}update(){this.updates++;}nearbyVehicle(){return null;}},
    MissionSystem:class{snapshot(){return {noticeId:0,target:null,completed:0};}update(){return this.snapshot();}},
    FloatingOrigin:class{constructor(){this.x=0;this.z=0;}update(){return {dx:0,dz:0};}},
    CameraControls:class{constructor(){this.yaw=0;}clear(){}reset(){}},createRadio:()=>({}),createSoundtrack:()=>soundtrack,
    createUI(value){handlers=value;return ui;},QUALITY_MODES:['auto','high','balanced','performance'],
    coastGroundHeight:()=>.22,districtAt:()=>({label:'Ocean Drive'}),requestAnimationFrame(){},
    console,URL,Set,Map,Math,Number,Promise,
  });
  // Run real application event wiring and tick, replacing rendering only.
  const boot=source.lastIndexOf('\ntry{setupRenderer();');
  assert.ok(boot>0,'Expected the render bootstrap boundary');
  const moduleBody=source.slice(0,boot).replace(/^import[^\n]*\n/gm,'').replaceAll('import.meta.url',JSON.stringify('https://example.test/main.js'));
  vm.runInContext(moduleBody,context);
  vm.runInContext('ready=true;renderer={render(){}};city={update(){return {};}};actors={update(){}};camera={position:new THREE.Vector3(),lookAt(){}};updateCamera=()=>{};updateMarkers=()=>{};drawMap=()=>{};',context);
  return {callbacks,calls,elements,classes,handlers,document,ui,read:expression=>vm.runInContext(expression,context),
    video(value){videoOpen=value;},advance(seconds){for(let elapsed=0;elapsed<seconds-1e-8;elapsed+=.05){now+=50;vm.runInContext(`tick(${now});`,context);}}};
}

test('official audio starts synchronously before CG; CG blocks input and retains the selected mode',()=>{
  const h=harness();
  assert.deepEqual(h.calls,['prepare'],'loading only prepares the official player');
  h.handlers.start('free');
  assert.deepEqual(h.calls.slice(1,3),['start','hide'],'trusted click requests audio before changing the screen');
  assert.equal(h.read('active'),false);assert.equal(h.read('entry.playing'),true);
  assert.equal(h.read('missionEnabled'),false);assert.equal(h.elements.get('hud').inert,true);
  h.handlers.start('walk');
  assert.equal(h.calls.filter(value=>value==='start').length,1,'double click does not restart audio or CG');
  assert.equal(h.read('missionEnabled'),false,'double click does not change the requested mode');
  h.callbacks.window.get('keydown')({code:'KeyW',target:{matches:()=>false},preventDefault(){}});
  assert.equal(h.read('keys.size'),0);
  h.advance(1);assert.equal(h.read('game.updates'),0,'walking and missions wait until CG ends');
  const before=h.read('entry.elapsed');
  h.document.hidden=true;h.advance(.4);assert.equal(h.read('entry.elapsed'),before);
  h.document.hidden=false;h.ui.orientationBlocked=true;h.advance(.4);assert.equal(h.read('entry.elapsed'),before);
  h.ui.orientationBlocked=false;
  h.elements.get('cinematic-skip').listeners.get('click')();h.advance(.4);
  assert.equal(h.read('entry.playing'),false);assert.equal(h.read('active'),true);
  assert.equal(h.read('game.mode'),'walk');assert.equal(h.read('missionEnabled'),false);
  assert.equal(h.elements.get('hud').inert,false);assert.equal(h.elements.get('entry-cinematic').hidden,true);
  assert.ok(!h.classes.has('is-cinematic'));assert.ok(h.read('game.updates')>0);
  assert.ok(!h.calls.some(value=>Array.isArray(value)&&value[1]===true),'CG and pauses do not suspend music');
  h.handlers.menu();h.handlers.start('walk');
  assert.equal(h.read('entry.still'),true,'returning from menu uses a short transition');
  h.advance(.7);assert.equal(h.read('active'),true);assert.equal(h.read('missionEnabled'),true);
});

test('menus cancel CG safely; overlays preserve music except a separate video or context failure',()=>{
  const h=harness();h.handlers.start('walk');h.advance(.2);h.calls.length=0;
  h.handlers.menu();h.handlers.dialog(true);h.handlers.orientation(true);
  h.document.hidden=true;h.callbacks.document.get('visibilitychange')();
  h.document.hidden=false;h.callbacks.document.get('visibilitychange')();
  assert.equal(h.read('entry.playing'),false);assert.equal(h.read('active'),false);
  assert.equal(h.elements.get('hud').inert,false);assert.equal(h.elements.get('entry-cinematic').hidden,true);
  assert.ok(!h.calls.some(value=>Array.isArray(value)&&value[0]==='suspended'&&value[1]===true));
  h.advance(8);assert.equal(h.read('active'),false,'cancelled entry cannot resume itself');
  h.video(true);h.handlers.dialog(true);assert.deepEqual(h.calls.at(-1),['suspended',true]);
  h.video(false);h.handlers.dialog(false);assert.deepEqual(h.calls.at(-1),['suspended',false]);
  h.handlers.start('walk');h.callbacks.canvas.get('webglcontextlost')({preventDefault(){}});
  assert.equal(h.read('entry.playing'),false);assert.equal(h.read('active'),false);
  assert.equal(h.elements.get('entry-cinematic').hidden,true);
  assert.ok(h.calls.some(value=>Array.isArray(value)&&value[0]==='suspended'&&value[1]===true));
});

test('Escape skips CG while the skip button has keyboard focus',()=>{
  const h=harness();h.handlers.start('walk');
  let prevented=false;
  h.callbacks.window.get('keydown')({code:'Escape',target:{matches:selector=>selector.includes('button')},preventDefault(){prevented=true;}});
  assert.equal(prevented,true);h.advance(.4);assert.equal(h.read('active'),true);
});

test('the compact music buttons and persistent player remain outside the HUD and CG',()=>{
  const hud=html.indexOf('<main id="hud"'),hudEnd=html.indexOf('</main>',hud),panel=html.indexOf('<section id="soundtrack-panel"');
  const cg=html.indexOf('<section id="entry-cinematic"'),cgEnd=html.indexOf('</section>',cg);
  assert.ok(hud>=0&&hudEnd>hud&&panel>hudEnd,'persistent music panel lives outside the hideable gameplay HUD');
  assert.ok(cg>=0&&cgEnd<panel,'persistent music panel lives outside the transient CG overlay');
  for(const id of ['music-button','music-play-toggle']){
    const button=html.indexOf(`id="${id}"`);
    assert.ok(button>hudEnd&&button<panel,`${id} stays accessible when the menu hides the HUD or the full player is collapsed`);
  }
  assert.match(html,/id="intro-music-toggle"/);assert.match(html,/id="music-play-toggle"/);
});
