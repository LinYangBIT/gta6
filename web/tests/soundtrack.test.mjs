import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSoundtrack, GTA_SCORE_EMBED, GTA_SCORE_URL } from '../dist/soundtrack.js';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');

function harness() {
  class Element {
    constructor(id) { this.id=id;this.attrs=new Map();this.listeners=new Map();this.children=[];this.hidden=false;this.paused=true;this.value='';this.pauseCount=0;this.loadCount=0; }
    setAttribute(key,value){this.attrs.set(key,value);}
    removeAttribute(key){this.attrs.delete(key);if(key==='src')this.src='';}
    addEventListener(name,callback){const list=this.listeners.get(name)||[];list.push(callback);this.listeners.set(name,list);}
    removeEventListener(name,callback){this.listeners.set(name,(this.listeners.get(name)||[]).filter(fn=>fn!==callback));}
    emit(name,event={}){for(const fn of this.listeners.get(name)||[])fn({preventDefault(){},stopPropagation(){},...event});}
    appendChild(child){child.parent=this;this.children.push(child);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;this.removed=true;}
    pause(){this.paused=true;this.pauseCount++;this.emit('pause');}
    load(){this.loadCount++;}
    click(){this.emit('click');}
  }
  const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>[match[1],new Element(match[1])]));
  const created=[],revoked=[],selections=[],notices=[];
  let focus=0,toggle=0,next=0;
  const document={getElementById(id){assert(elements.has(id),`Missing soundtrack element ${id}`);return elements.get(id);},createElement(tag){const element=new Element(tag);created.push(element);return element;}};
  const api=createSoundtrack({document,urlAPI:{createObjectURL:file=>`blob:test-${file.name}`,revokeObjectURL:url=>revoked.push(url)},onSelection:source=>selections.push(source),onStatus:message=>notices.push(message),onFocus:()=>focus++,onCoastToggle:()=>toggle++,onCoastNext:()=>next++});
  return {api,e:id=>elements.get(id),created,revoked,selections,notices,get focus(){return focus;},get toggle(){return toggle;},get next(){return next;}};
}

test('GTA score loads only after a user opens its visible official player',()=>{
  const h=harness();
  assert.equal(h.api.source,'spotify');assert.equal(h.created.length,0,'no third-party request during game loading');
  assert.equal(h.e('soundtrack-panel').hidden,true);
  h.api.open();
  const frame=h.created[0];
  assert.equal(frame.src,GTA_SCORE_EMBED);assert.equal(frame.height,'152');
  assert.equal(new URL(frame.src).hostname,'open.spotify.com');
  assert.equal(h.e('soundtrack-panel').hidden,false);assert.equal(h.e('soundtrack-spotify').hidden,false);
  assert.equal(h.api.playing,false,'iframe availability must not be advertised as confirmed audio playback');
  h.api.close();
  assert.equal(frame.removed,true,'a closed external player cannot keep playing invisibly');
  assert.equal(h.e('spotify-mount').children.length,0);
  assert(html.includes(GTA_SCORE_URL),'a direct Spotify link remains available if embedding is unavailable');
  h.api.dispose();
});

test('selecting a source notifies the radio owner and removes competing external playback',()=>{
  const h=harness();h.api.open();
  h.e('music-source-coast').click();
  assert.equal(h.api.source,'coast');assert.equal(h.created[0].removed,true);
  assert.equal(h.selections.at(-1),'coast');
  h.e('coast-toggle').click();h.e('coast-next').click();
  assert.equal(h.toggle,1);assert.equal(h.next,1);
  h.e('music-source-spotify').click();
  assert.equal(h.selections.at(-1),'spotify','main can pause COAST FM before Spotify starts');
  assert.equal(h.e('soundtrack-coast').hidden,true);assert.equal(h.e('spotify-mount').children.length,1);
  h.api.select('untrusted-url');assert.equal(h.api.source,'spotify');
  h.api.dispose();
});

test('compact mode retains the same visible player until it is explicitly closed',()=>{
  const h=harness();h.api.open();const frame=h.created[0];
  h.e('soundtrack-compact').click();
  assert.equal(h.api.isCompact,true);assert.equal(h.e('soundtrack-panel').attrs.get('data-compact'),'true');
  assert.equal(h.e('soundtrack-panel').hidden,false);assert.equal(h.e('soundtrack-spotify').hidden,false);
  assert.equal(h.e('spotify-mount').children[0],frame,'resizing must not recreate the playing frame');
  assert.equal(h.focus,1,'compact mode returns keyboard control to the game');
  h.e('soundtrack-compact').click();assert.equal(h.api.isCompact,false);
  h.e('soundtrack-compact').click();h.e('soundtrack-close').click();
  assert.equal(frame.removed,true);assert.equal(h.api.isOpen,false);assert.equal(h.api.isCompact,false);
  h.api.open();h.api.select('local');h.e('soundtrack-compact').click();
  assert.equal(h.api.isCompact,true);assert.equal(h.e('soundtrack-local').hidden,false);
  h.api.select('coast');assert.equal(h.api.isCompact,false);assert.equal(h.e('soundtrack-compact').hidden,true);
  h.api.dispose();
});

test('menu or background pause unloads the score and requires a new player gesture',()=>{
  const h=harness();h.api.open();const frame=h.created[0];
  h.api.setPaused(true);assert.equal(h.api.isOpen,false);assert.equal(frame.removed,true);
  h.api.open();assert.equal(h.api.isOpen,false,'opening while gameplay is suspended is ignored');
  h.api.setPaused(false);assert.equal(h.created.length,1,'resuming game does not restart third-party audio');
  h.api.open();assert.equal(h.created.length,2);
  h.e('soundtrack-panel').emit('keydown',{code:'Escape'});
  assert.equal(h.api.isOpen,false);assert.equal(h.focus,1,'closing with Escape returns control to the game');
  h.api.dispose();
});

test('local files stay as revocable blob URLs and pause safely when the player closes',()=>{
  const h=harness();h.api.open();
  assert.equal(h.api.loadFile({name:'my-score.mp3',type:'audio/mpeg'}),true);
  assert.equal(h.e('local-audio').src,'blob:test-my-score.mp3');assert.equal(h.api.label,'my-score.mp3');
  assert.equal(h.selections.at(-1),'local');assert.equal(h.api.playing,false,'file selection does not autoplay');
  h.e('local-audio').emit('play');assert.equal(h.api.playing,true);
  assert.equal(h.api.loadFile({name:'page.html',type:'text/html'}),false);
  assert.equal(h.api.label,'my-score.mp3','invalid selection preserves the usable file');
  h.api.loadFile({name:'second.wav',type:'audio/wav'});
  assert.deepEqual(h.revoked,['blob:test-my-score.mp3']);
  h.e('local-audio').emit('play');h.api.close();
  assert.equal(h.api.playing,false);assert.equal(h.e('local-audio').paused,true);
  h.api.dispose();assert.deepEqual(h.revoked,['blob:test-my-score.mp3','blob:test-second.wav']);
  h.api.open();assert.equal(h.api.isOpen,false,'disposed controls cannot recreate media');
});

test('local decoding errors are visible and native playback cannot escape suspended state',()=>{
  const h=harness();h.api.open();h.api.loadFile({name:'track.ogg',type:''});
  h.e('local-audio').emit('error');assert.match(h.notices.at(-1),/无法播放/);
  h.api.setPaused(true);h.e('local-audio').emit('play');
  assert.equal(h.api.playing,false);assert.equal(h.e('local-audio').paused,true);
  h.api.dispose();
});
