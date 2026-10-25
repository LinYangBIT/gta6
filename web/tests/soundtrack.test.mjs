import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoundtrack,GTA_SCORE_EMBED,GTA_SCORE_URL} from '../dist/soundtrack.js';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

function harness(options={}){
  class Element{
    constructor(id){this.id=id;this.attrs=new Map();this.listeners=new Map();this.children=[];this.hidden=false;this.paused=true;this.value='';this.pauseCount=0;this.playCount=0;this.loadCount=0;}
    get firstChild(){return this.children[0]??null;}
    setAttribute(k,v){this.attrs.set(k,v);}removeAttribute(k){this.attrs.delete(k);if(k==='src')this.src='';}
    addEventListener(k,fn){const a=this.listeners.get(k)||[];a.push(fn);this.listeners.set(k,a);}
    removeEventListener(k,fn){this.listeners.set(k,(this.listeners.get(k)||[]).filter(f=>f!==fn));}
    emit(k,event={}){for(const fn of this.listeners.get(k)||[])fn({target:this,preventDefault(){},stopPropagation(){},...event});}
    appendChild(child){child.parent=this;this.children.push(child);return child;}
    removeChild(child){this.children=this.children.filter(c=>c!==child);child.parent=null;}
    remove(){this.parent?.removeChild(this);this.removed=true;}
    play(){this.playCount++;if(options.localReject)return Promise.reject(new Error('autoplay blocked'));this.paused=false;this.emit('play');return Promise.resolve();}
    pause(){this.pauseCount++;if(!this.paused){this.paused=true;this.emit('pause');}}
    load(){this.loadCount++;}click(){this.emit('click');}
  }
  const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element(m[1])]));
  for(const id of ['music-play-toggle','music-volume','intro-music-toggle'])if(!elements.has(id))elements.set(id,new Element(id));
  const created=[],revoked=[],notices=[],selections=[],controllers=[],pendingCallbacks=[];
  let loads=0,focus=0;
  const document={getElementById:id=>elements.get(id)??null,createElement:tag=>{const e=new Element(tag);created.push(e);return e;}};
  const radio={enabled:false,paused:false,startCount:0,nextCount:0,volume:.38,disposed:false,trackLabel:'原创曲目',
    start(){this.startCount++;this.enabled=true;return options.radioStart?options.radioStart():Promise.resolve(true);},
    setPaused(v){this.paused=Boolean(v);},setVolume(v){this.volume=v;},nextTrack(){this.nextCount++;this.trackLabel='下一首';return Promise.resolve(this.enabled&&!this.paused);},dispose(){this.enabled=false;this.disposed=true;}};
  const spotifyAPI={createController(target,config,callback){
    const frame=new Element('iframe');frame.height=String(config.height);frame.src=GTA_SCORE_EMBED;
    const parent=target.parent;target.remove();parent?.appendChild(frame);
    const listeners=new Map(),control={frame,config,playCount:0,pauseCount:0,destroyCount:0,
      addListener(k,fn){listeners.set(k,fn);},emit(k,data={}){listeners.get(k)?.({data});},
      play(){this.playCount++;if(options.spotifyPlayReject)throw new Error('autoplay blocked');},pause(){this.pauseCount++;this.emit('playback_update',{isPaused:true});},destroy(){this.destroyCount++;frame.remove();}};
    controllers.push(control);if(options.lateController)pendingCallbacks.push(()=>callback(control));else callback(control);
  }};
  const api=createSoundtrack({document,radio,urlAPI:{createObjectURL:file=>'blob:'+file.name,revokeObjectURL:url=>revoked.push(url)},
    spotifyLoader:()=>{loads++;return options.spotifyReject?Promise.reject(new Error('blocked')):Promise.resolve(spotifyAPI);},
    onStatus:m=>notices.push(m),onSelection:s=>selections.push(s),onFocus:()=>focus++});
  return{api,radio,options,e:id=>elements.get(id),created,revoked,notices,selections,controllers,pendingCallbacks,get loads(){return loads;},get focus(){return focus;}};
}

test('official GTA score is prepared silently and the enter gesture requests playback synchronously',async()=>{
  const h=harness();assert.equal(h.api.source,'spotify');assert.equal(h.api.playing,false);assert.equal(h.loads,0);
  h.api.prepare();h.api.prepare();await flush();const embed=h.controllers[0];
  assert.equal(h.loads,1,'preparing twice shares the same controller');embed.emit('ready');
  assert.equal(embed.playCount,0,'preloading does not start music before entering');assert.equal(h.api.playing,false);
  const playing=h.api.start();assert.equal(embed.playCount,1,'the ready controller receives play in the click turn');
  assert.equal(await playing,false,'requesting autoplay does not claim audio is playing');assert.equal(h.radio.startCount,0);
  embed.emit('playback_started');assert.equal(h.api.playing,true);
  h.api.open();h.e('soundtrack-close').click();assert.equal(h.api.isOpen,false);assert.equal(h.api.playing,true);assert.equal(embed.pauseCount,0);
  h.api.open();h.e('soundtrack-panel').emit('keydown',{code:'Escape'});assert.equal(h.api.playing,true);assert.equal(h.focus,2);
  assert.equal(h.api.isDocked,true);assert.equal(h.e('spotify-mount').firstChild,embed.frame);h.api.dispose();assert.equal(h.radio.disposed,true);
});

test('entering before the official controller is ready plays on readiness without starting the original station',async()=>{
  const h=harness();await h.api.start();await flush();const embed=h.controllers[0];
  assert.equal(embed.playCount,0);assert.equal(h.radio.startCount,0);assert.equal(h.api.playing,false);
  embed.emit('ready');assert.equal(embed.playCount,1);assert.equal(h.api.playing,false);
  embed.emit('playback_update',{isPaused:false});assert.equal(h.api.playing,true);
  h.api.close();assert.equal(h.api.playing,true);assert.equal(embed.pauseCount,0);h.api.dispose();
});

test('COAST remains an explicit alternative and closing settings keeps it playing',async()=>{
  const h=harness();h.api.select('coast');assert.equal(h.radio.startCount,1,'audio unlock happens before the first await');await flush();
  assert.equal(h.api.playing,true);assert.equal(h.e('soundtrack-panel').hidden,true);
  h.api.open();h.api.close();assert.equal(h.api.playing,true);assert.equal(h.radio.paused,false);assert.equal(h.loads,0);h.api.dispose();
});

test('blocked Spotify autoplay remains on the official player and can be retried from another gesture',async()=>{
  const h=harness({spotifyPlayReject:true});h.api.prepare();await flush();const embed=h.controllers[0];embed.emit('ready');
  await h.api.start();assert.equal(h.api.playing,false);assert.equal(h.api.source,'spotify');assert.equal(h.radio.startCount,0);
  assert.match(h.notices.at(-1),/播放器中点击播放/);assert.equal(h.api.isDocked,true);
  h.options.spotifyPlayReject=false;await h.api.start();assert.equal(embed.playCount,2);assert.equal(h.api.playing,false);
  embed.emit('playback_update',{isPaused:false});assert.equal(h.api.playing,true);h.api.dispose();
});

test('a preloaded controller arriving after changing the source cannot autoplay or replace local audio',async()=>{
  const h=harness({lateController:true});h.api.prepare();await flush();
  h.api.loadFile({name:'local.mp3',type:'audio/mpeg'});await flush();h.pendingCallbacks[0]();const embed=h.controllers[0];
  assert.equal(embed.destroyCount,1);assert.equal(embed.playCount,0);assert.equal(h.api.source,'local');assert.equal(h.api.playing,true);
  assert.equal(h.e('spotify-mount').children.length,0);h.api.dispose();
});

test('local file selection autoplays and loops; closing settings leaves playback intact',async()=>{
  const h=harness();h.api.open();assert.equal(h.api.loadFile({name:'my-score.mp3',type:'audio/mpeg'}),true);await flush();
  const audio=h.e('local-audio');assert.equal(audio.src,'blob:my-score.mp3');assert.equal(audio.loop,true);assert.equal(audio.playCount,1);assert.equal(h.api.playing,true);
  const pauses=audio.pauseCount;h.api.close();assert.equal(audio.pauseCount,pauses);assert.equal(audio.paused,false);assert.equal(h.e('soundtrack-panel').hidden,true);
  audio.pause();assert.equal(h.api.playing,false);await h.api.start();assert.equal(audio.paused,true,'a user pause survives re-entering gameplay');
  await h.api.togglePlayback();assert.equal(h.api.playing,true);h.api.dispose();assert.deepEqual(h.revoked,['blob:my-score.mp3']);
});

test('Spotify uses official controller and retains the same visible dock when settings close',async()=>{
  const h=harness();h.api.open();h.api.select('spotify');await flush();const embed=h.controllers[0];
  assert.equal(embed.config.uri,'spotify:album:5EJAJsaHhQYLwVbynpcGkD');assert.equal(embed.frame.height,'152');assert.equal(embed.playCount,0);embed.emit('ready');assert.equal(embed.playCount,1);
  assert.equal(h.api.playing,false,'play request is not proof of Spotify audio');
  embed.emit('playback_started');assert.equal(h.api.playing,true);
  h.api.close();assert.equal(h.api.isOpen,false);assert.equal(h.api.isDocked,true);assert.equal(h.e('soundtrack-panel').hidden,false);assert.equal(embed.destroyCount,0);
  assert.equal(h.e('spotify-mount').children[0],embed.frame);assert.equal(h.e('soundtrack-panel').attrs.get('data-docked'),'true');
  h.api.open();h.e('soundtrack-compact').click();assert.equal(h.api.isDocked,true);assert.equal(h.controllers.length,1);
  await h.api.togglePlayback();assert.ok(embed.pauseCount>0);assert.equal(h.api.playing,false);assert.equal(embed.destroyCount,0);
  await h.api.start();assert.equal(h.api.playing,false,'re-entering does not override explicit pause');
  assert.ok(html.includes(GTA_SCORE_URL));h.api.dispose();assert.equal(embed.destroyCount,1);
});

test('switching music sources stops competing audio and returns to background radio',async()=>{
  const h=harness();await h.api.start();h.api.select('spotify');await flush();const embed=h.controllers[0];embed.emit('playback_started');
  assert.equal(h.radio.paused,true);h.api.loadFile({name:'sound.wav',type:'audio/wav'});await flush();
  assert.equal(embed.destroyCount,1);assert.equal(h.api.source,'local');assert.equal(h.api.playing,true);
  h.api.select('coast');await flush();assert.equal(h.e('local-audio').paused,true);assert.equal(h.radio.paused,false);assert.equal(h.api.playing,true);
  await h.api.nextTrack();assert.equal(h.radio.nextCount,1);assert.equal(h.api.label,'下一首');h.api.dispose();
});

test('temporary video suspension restores playback but never overrides a manual pause',async()=>{
  const h=harness();h.api.select('coast');await flush();h.api.setSuspended(true);assert.equal(h.api.playing,false);assert.equal(h.radio.paused,true);
  h.api.setSuspended(false);await flush();assert.equal(h.api.playing,true);
  await h.api.togglePlayback();const starts=h.radio.startCount;h.api.setSuspended(true);h.api.setSuspended(false);await h.api.start();
  assert.equal(h.radio.startCount,starts);assert.equal(h.api.playing,false);await h.api.nextTrack();assert.equal(h.radio.paused,true);assert.equal(h.api.playing,false);h.api.dispose();
});

test('a cancelled Spotify startup stays cancelled while its native controls can resume later',async()=>{
  const h=harness();h.api.select('spotify');await flush();const embed=h.controllers[0];
  await h.api.togglePlayback();embed.emit('ready');assert.equal(embed.playCount,0,'late API readiness cannot override a stop');
  const pauses=embed.pauseCount;embed.emit('playback_started');assert.equal(embed.pauseCount,pauses,'native play is not immediately cancelled');
  assert.equal(h.api.playing,false,'a late started event alone cannot revive a cancelled request');
  embed.emit('playback_update',{isPaused:false});assert.equal(h.api.playing,true,'the actual player state confirms a native resume');
  embed.emit('playback_update',{isPaused:true});assert.equal(h.api.playing,false);await h.api.start();assert.equal(embed.playCount,0,'native pause also survives menu re-entry');h.api.dispose();
});

test('blocked local autoplay is reported and a later explicit gesture can retry',async()=>{
  const h=harness({localReject:true});h.api.loadFile({name:'track.ogg',type:''});await flush();
  assert.equal(h.api.playing,false);assert.match(h.notices.at(-1),/自动播放/);
  h.options.localReject=false;await h.api.togglePlayback();assert.equal(h.api.playing,true);
  assert.equal(h.api.loadFile({name:'not-a-song.html',type:'text/html'}),false);assert.equal(h.api.label,'track.ogg');
  h.e('local-audio').emit('error');assert.equal(h.api.playing,false);assert.match(h.notices.at(-1),/无法播放/);h.api.dispose();
});

test('late playback completion or Spotify controller cannot revive an abandoned source',async()=>{
  let resolveRadio;const h=harness({radioStart:()=>new Promise(resolve=>{resolveRadio=resolve;}),lateController:true});
  h.api.select('coast');const pending=h.api.start();h.api.select('spotify');await flush();h.api.loadFile({name:'local.mp3',type:'audio/mpeg'});await flush();
  resolveRadio(true);await pending;h.pendingCallbacks[0]();assert.equal(h.controllers[0].destroyCount,1);
  assert.equal(h.api.source,'local');assert.equal(h.api.playing,true);assert.equal(h.radio.paused,true);assert.equal(h.e('spotify-mount').children.length,0);
  h.api.dispose();assert.equal(h.e('local-audio').paused,true);
});

test('API failure keeps a normal visible Spotify player and explicit stop removes it',async()=>{
  const h=harness({spotifyReject:true});h.api.select('spotify');await flush();const frame=h.e('spotify-mount').firstChild;
  assert.equal(frame.src,GTA_SCORE_EMBED);assert.equal(h.api.playing,false);h.api.close();assert.equal(frame.removed,undefined);assert.equal(h.api.isDocked,true);
  await h.api.togglePlayback();assert.equal(frame.removed,true);assert.equal(h.e('spotify-mount').children.length,0);h.api.dispose();
});

test('volume, menu playback button, file replacement and disposal release resources',async()=>{
  const h=harness();h.api.select('coast');await flush();h.e('intro-music-toggle').click();await flush();assert.equal(h.api.playing,false);
  h.e('intro-music-toggle').click();await flush();assert.equal(h.api.playing,true);
  h.e('music-volume').value='.7';h.e('music-volume').emit('input');assert.equal(h.radio.volume,.7);assert.equal(h.e('local-audio').volume,.7);
  h.api.loadFile({name:'a.mp3',type:'audio/mpeg'});await flush();h.api.loadFile({name:'b.wav',type:'audio/wav'});await flush();assert.deepEqual(h.revoked,['blob:a.mp3']);
  h.api.dispose();assert.deepEqual(h.revoked,['blob:a.mp3','blob:b.wav']);assert.equal(h.e('soundtrack-panel').hidden,true);
  h.api.open();h.api.select('spotify');await flush();assert.equal(h.api.isOpen,false);assert.equal(h.loads,0);
});
