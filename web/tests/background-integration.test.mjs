import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const source=await readFile(new URL('../dist/main.js',import.meta.url),'utf8');

test('game entry unlocks audio in the click turn and gameplay overlays do not pause background music',()=>{
  const callbacks={window:new Map(),document:new Map(),canvas:new Map()},calls=[];
  let handlers,videoOpen=false;
  class Vector3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}}
  const canvas={focus(){calls.push('focus');},addEventListener(name,fn){callbacks.canvas.set(name,fn);}};
  const soundtrack={source:'coast',start(){calls.push('start');return Promise.resolve(true);},setSuspended(value){calls.push(['suspended',value]);},nextTrack(){},togglePanel(){}};
  const element={open:false};
  const document={hidden:false,querySelector(selector){if(selector==='#world')return canvas;if(selector==='#video-dialog[open]')return videoOpen?element:null;return null;},getElementById(id){return id==='video-dialog'?{open:videoOpen}:null;},addEventListener(name,fn){callbacks.document.set(name,fn);}};
  const ui={hideIntro(){calls.push('hide');},showIntro(){calls.push('menu');},toast(){},setError(){},orientationBlocked:false};
  const context=vm.createContext({
    THREE:{Vector3},document,window:{addEventListener(name,fn){callbacks.window.set(name,fn);}},
    matchMedia:()=>({matches:false}),performance:{now:()=>0},localStorage:{getItem:()=>null},
    Gameplay:class{constructor(){this.state={x:13,z:30};}},MissionSystem:class{},FloatingOrigin:class{},
    CameraControls:class{clear(){}},createRadio:()=>({}),createSoundtrack:()=>soundtrack,
    createUI(value){handlers=value;return ui;},QUALITY_MODES:['auto','high','balanced','performance'],
    console,URL,Set,Map,Math,Number,Promise,
  });
  // Keep the application's actual event wiring. Rendering and resource loading
  // are deliberately outside this music/gameplay lifecycle contract.
  const boot=source.lastIndexOf('\ntry{setupRenderer();');
  assert.ok(boot>0,'Expected the render bootstrap boundary');
  const moduleBody=source.slice(0,boot).replace(/^import[^\n]*\n/gm,'').replaceAll('import.meta.url',JSON.stringify('https://example.test/main.js'));
  vm.runInContext(moduleBody,context);
  vm.runInContext('ready=true;',context);
  handlers.start('walk');
  assert.deepEqual(calls.slice(0,3),['hide','start','focus'],'audio start is invoked synchronously from the Enter handler');
  calls.length=0;
  handlers.menu();handlers.dialog(true);handlers.orientation(true);
  document.hidden=true;callbacks.document.get('visibilitychange')();
  document.hidden=false;callbacks.document.get('visibilitychange')();
  assert.ok(!calls.some(value=>Array.isArray(value)&&value[0]==='suspended'&&value[1]===true),'menu/help/rotation/background never explicitly suspend music');
  videoOpen=true;handlers.dialog(true);assert.deepEqual(calls.at(-1),['suspended',true]);
  videoOpen=false;handlers.dialog(false);assert.deepEqual(calls.at(-1),['suspended',false]);
  callbacks.canvas.get('webglcontextlost')({preventDefault(){}});
  assert.ok(calls.some(value=>Array.isArray(value)&&value[0]==='suspended'&&value[1]===true));
});

test('a playing Spotify dock is not contained in the HUD that the menu hides',()=>{
  const hud=html.indexOf('<main id="hud"'),hudEnd=html.indexOf('</main>',hud),panel=html.indexOf('<section id="soundtrack-panel"');
  assert.ok(hud>=0&&hudEnd>hud&&panel>hudEnd,'persistent music panel must live outside the hideable gameplay HUD');
  assert.match(html,/id="intro-music-toggle"/,'menu retains an explicit music play/pause control');
  assert.match(html,/id="music-play-toggle"/,'gameplay retains an explicit music play/pause control');
});
