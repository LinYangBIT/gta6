/** Music persists independently from its settings panel. */
export const GTA_SCORE_URL='https://open.spotify.com/album/5EJAJsaHhQYLwVbynpcGkD';
export const GTA_SCORE_EMBED='https://open.spotify.com/embed/album/5EJAJsaHhQYLwVbynpcGkD?theme=0';
export const SPOTIFY_API_URL='https://open.spotify.com/embed/iframe-api/v1';
const spotifyAPIs=new WeakMap();
function loadSpotifyAPI(dom,win){
  if(!win||!dom.head)return Promise.reject(new Error('Spotify API unavailable'));
  if(spotifyAPIs.has(win))return spotifyAPIs.get(win);
  const promise=new Promise((resolve,reject)=>{
    const previous=win.onSpotifyIframeApiReady,script=dom.createElement('script');script.src=SPOTIFY_API_URL;script.async=true;
    const timeout=win.setTimeout(()=>reject(new Error('Spotify API timeout')),8000);
    win.onSpotifyIframeApiReady=api=>{win.clearTimeout(timeout);try{previous?.(api);}catch{}resolve(api);};
    script.onerror=()=>{win.clearTimeout(timeout);reject(new Error('Spotify API unavailable'));};dom.head.appendChild(script);
  });spotifyAPIs.set(win,promise);return promise;
}

export function createSoundtrack({radio,onSelection,onStatus,onFocus,document:dom=globalThis.document,
  window:win=globalThis.window,urlAPI=globalThis.URL,spotifyLoader}={}){
  const byId=id=>dom.getElementById(id),panel=byId('soundtrack-panel'),mount=byId('spotify-mount');
  const audio=byId('local-audio'),fileInput=byId('local-audio-file'),localLabel=byId('local-audio-name');
  let source='spotify',opened=false,suspended=false,disposed=false,started=false,desired=false,userPaused=false;
  let localPlaying=false,coastPlaying=false,spotifyPlaying=false,spotifyKnown=false,volume=.38;
  let fallbackPlaying=false,fallbackPending=null,uncontrolledSpotify=false;
  let objectURL=null,filename='',controller=null,controllerReady=false,spotifyNode=null,spotifyLoading=false,expectedLocalPause=false;
  let epoch=0,spotifyEpoch=0,pendingPlayback=false;
  const removers=[];
  const status=message=>{const node=byId('soundtrack-status');if(node)node.textContent=message;onStatus?.(message);};
  const listen=(element,type,callback)=>{element?.addEventListener(type,callback);removers.push(()=>element?.removeEventListener(type,callback));};
  const isPlaying=()=>!suspended&&(source==='coast'?coastPlaying:source==='local'?localPlaying:spotifyPlaying||fallbackPlaying);
  const isDocked=()=>source==='spotify'&&!opened&&Boolean(spotifyNode||spotifyLoading);
  function sync(){
    panel.hidden=!opened;panel.setAttribute('data-compact','false');panel.setAttribute('data-docked',String(isDocked()));
    const compact=byId('soundtrack-compact');
    if(compact){compact.hidden=true;compact.textContent='收起';compact.setAttribute('aria-pressed','false');compact.setAttribute('aria-label','收起设置，音乐继续播放');}
    byId('music-button')?.setAttribute('aria-expanded',String(opened));
    for(const name of ['spotify','coast','local']){byId(`music-source-${name}`)?.setAttribute('aria-pressed',String(name===source));const node=byId(`soundtrack-${name}`);if(node)node.hidden=name!==source;}
    const waiting=desired&&source==='spotify'&&!spotifyKnown;
    for(const id of ['music-play-toggle','intro-music-toggle']){const toggle=byId(id);if(toggle){toggle.textContent=id==='intro-music-toggle'?(isPlaying()?'音乐 · 暂停':waiting?'停止 Spotify':'音乐 · 播放'):(isPlaying()?'Ⅱ':waiting?'■':'▶');toggle.setAttribute('aria-label',isPlaying()?'暂停背景音乐':waiting?'停止 Spotify 播放器':'播放背景音乐');toggle.setAttribute('aria-pressed',String(isPlaying()));}}
    const slider=byId('music-volume');if(slider){const nativeVolume=source==='spotify'&&!fallbackPlaying;slider.value=String(volume);slider.disabled=nativeVolume;slider.setAttribute('aria-label',nativeVolume?'Spotify 音量请使用系统控制':'背景音乐音量');}
    const coastButton=byId('coast-toggle');if(coastButton)coastButton.textContent=source==='coast'&&isPlaying()?'暂停音乐':'播放音乐';
  }
  function pauseLocal(){if(!audio.paused)expectedLocalPause=true;audio.pause();localPlaying=false;}
  function unloadSpotify(){
    spotifyEpoch++;spotifyLoading=false;try{controller?.destroy();}catch{}
    controller=null;controllerReady=false;spotifyNode?.remove();spotifyNode=null;uncontrolledSpotify=false;
    while(mount.firstChild)mount.removeChild(mount.firstChild);
    spotifyPlaying=false;spotifyKnown=false;
  }
  function pauseSpotify(){if(controller){try{controller.pause();}catch{unloadSpotify();}}else if(spotifyNode)unloadSpotify();spotifyPlaying=false;}
  function stopCurrent(){epoch++;pendingPlayback=false;fallbackPending=null;fallbackPlaying=false;radio?.setPaused(true);coastPlaying=false;pauseLocal();pauseSpotify();sync();}
  function confirmSpotify(){
    // A real player event, never SDK readiness, owns the audio handover.
    const newlyStarted=!spotifyPlaying,hadFallback=fallbackPlaying||Boolean(fallbackPending);
    radio?.setPaused(true);fallbackPlaying=false;fallbackPending=null;spotifyPlaying=true;spotifyKnown=true;
    if(newlyStarted)status(hadFallback?'GTA V 原声正在播放 · 已接替入场 BGM':'GTA V 原声正在播放');
  }
  function startFallback(){
    if(spotifyPlaying||uncontrolledSpotify)return Promise.resolve(spotifyPlaying);
    if(fallbackPlaying)return Promise.resolve(true);
    if(fallbackPending)return fallbackPending;
    const ticket=epoch;
    radio?.setPaused(false);
    let unlocking;try{unlocking=radio?.start();}catch{unlocking=false;}
    // start() is deliberately invoked before any await to retain the Enter gesture.
    const pending=Promise.resolve(unlocking).then(ok=>{
      if(ticket!==epoch||disposed||suspended||source!=='spotify'||!desired)return false;
      if(spotifyPlaying||uncontrolledSpotify){radio?.setPaused(true);return spotifyPlaying;}
      fallbackPlaying=Boolean(ok);
      status(fallbackPlaying?'COAST FM 入场 BGM · 原声开始后自动切换':'点击顶部播放键开启 BGM，或展开原声播放器');
      return fallbackPlaying;
    },()=>false).finally(()=>{if(fallbackPending===pending){fallbackPending=null;sync();}});
    fallbackPending=pending;return pending;
  }
  function attemptSpotify(){if(!desired||suspended||source!=='spotify'||disposed||!controllerReady)return;if(controller){try{controller.play();status('已请求 GTA V 原声；若未响起，点顶部音乐按钮展开播放器');}catch{status('点顶部音乐按钮展开播放器，再点击播放');}}}
  function fallbackSpotify(ticket){
    if(ticket!==spotifyEpoch||disposed||source!=='spotify')return;
    // Without the SDK, a plain iframe cannot report its play state. Hand over
    // only after an explicit user choice so it cannot overlap the entry BGM.
    spotifyNode?.remove();const gate=dom.createElement('button');gate.type='button';gate.className='button button--outline';gate.textContent='打开 GTA V 原声播放器';
    listen(gate,'click',()=>{
      if(ticket!==spotifyEpoch||disposed||source!=='spotify')return;
      epoch++;fallbackPending=null;fallbackPlaying=false;radio?.setPaused(true);uncontrolledSpotify=true;desired=true;userPaused=false;
      const frame=dom.createElement('iframe');frame.title='GTA V 原声 · Spotify 官方播放器';frame.src=GTA_SCORE_EMBED;
      frame.width='100%';frame.height='152';frame.setAttribute('allow','autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
      frame.setAttribute('allowfullscreen','');frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
      gate.remove();mount.appendChild(frame);spotifyNode=frame;status('入场 BGM 已让出声音，请点击原声播放器的播放键');sync();
    });
    mount.appendChild(gate);spotifyNode=gate;spotifyLoading=false;status('可继续听入场 BGM；点顶部音乐按钮展开播放器，选择 GTA V 原声');sync();
  }
  function ensureSpotify(){
    if(spotifyNode||spotifyLoading||disposed||source!=='spotify')return;
    const ticket=++spotifyEpoch;spotifyLoading=true;
    const target=dom.createElement('div');target.textContent='正在准备 Spotify 原声…';mount.appendChild(target);spotifyNode=target;sync();
    const getAPI=spotifyLoader??(()=>loadSpotifyAPI(dom,win));
    Promise.resolve().then(getAPI).then(api=>{
      if(ticket!==spotifyEpoch||disposed||source!=='spotify')return;
      api.createController(target,{uri:'spotify:album:5EJAJsaHhQYLwVbynpcGkD',width:'100%',height:152,theme:'dark'},embed=>{
        if(ticket!==spotifyEpoch||disposed||source!=='spotify'){embed.destroy();return;}
        controller=embed;spotifyLoading=false;
        embed.addListener('ready',()=>{if(ticket!==spotifyEpoch)return;controllerReady=true;if(!desired)status('GTA V 原声已就绪 · 点击进入城市时尝试自动播放');attemptSpotify();sync();});
        embed.addListener('playback_started',()=>{if(ticket!==spotifyEpoch)return;if(suspended){embed.pause();return;}if(!desired)return;confirmSpotify();sync();});
        embed.addListener('playback_update',event=>{
          if(ticket!==spotifyEpoch||disposed)return;
          const playing=event?.data?.isPaused===false,wasPlaying=spotifyPlaying;spotifyKnown=true;
          if(playing){if(suspended){spotifyPlaying=false;embed.pause();}else{desired=true;userPaused=false;confirmSpotify();}}
          else{spotifyPlaying=false;if(wasPlaying&&!suspended&&desired){desired=false;userPaused=true;}}
          sync();
        });
        status('正在准备 Spotify 播放器…');sync();
      });
    }).catch(()=>fallbackSpotify(ticket));
  }
  async function playCurrent(){
    if(disposed||suspended||!desired)return false;
    if(source==='spotify'){
      if(spotifyPlaying)return true;
      const fallback=startFallback();ensureSpotify();attemptSpotify();sync();return fallback;
    }
    const ticket=++epoch;radio?.setPaused(source!=='coast');
    if(source==='coast'){
      pendingPlayback=true;let ok=false;try{ok=Boolean(await radio?.start());}catch{}
      if(ticket!==epoch||disposed||source!=='coast'||suspended||!desired)return false;
      pendingPlayback=false;coastPlaying=ok;if(!ok)status('点击播放键开启背景音乐');sync();return ok;
    }
    if(source==='local'){
      if(!objectURL){status('选择本机音频即可播放，收起设置后继续播放');return false;}
      pendingPlayback=true;try{await audio.play();if(ticket!==epoch||disposed||source!=='local'||suspended||!desired)return false;pendingPlayback=false;localPlaying=true;sync();return true;}
      catch{if(ticket===epoch){pendingPlayback=false;localPlaying=false;status('浏览器暂未允许自动播放，请点击播放键');sync();}return false;}
    }
  }
  // Warm the official controller during asset loading, without requesting any
  // audio. A later trusted Enter click can call play() before its first await.
  function prepare(){if(!disposed&&source==='spotify')ensureSpotify();}
  function start(){if(disposed)return Promise.resolve(false);if(started&&userPaused)return Promise.resolve(false);started=true;desired=true;return playCurrent();}
  function togglePlayback(){
    if(disposed)return Promise.resolve(false);
    if(isPlaying()||pendingPlayback||fallbackPending||(desired&&source==='spotify'&&!spotifyKnown)){userPaused=true;desired=false;stopCurrent();status('背景音乐已暂停');return Promise.resolve(false);}
    started=true;userPaused=false;desired=true;return playCurrent();
  }
  function select(next){
    if(disposed||!['coast','spotify','local'].includes(next))return;
    if(source!==next){stopCurrent();unloadSpotify();source=next;}
    started=true;userPaused=false;desired=true;onSelection?.(source);sync();
    if(source==='spotify')status('GTA V 原声 · 自动播放受浏览器、账号和地区限制');
    else if(source==='local')status(filename?'本机音频 · 收起设置后继续播放':'选择你自己的音频，文件只在本机播放');
    else status('COAST FM · 原创背景音乐');
    void playCurrent();
  }
  function open(){if(disposed)return;opened=true;sync();if(source==='spotify')ensureSpotify();}
  function close(){if(disposed)return;opened=false;sync();}
  function setSuspended(value){value=Boolean(value);if(disposed||value===suspended)return;suspended=value;if(suspended)stopCurrent();else if(desired&&!userPaused)void playCurrent();sync();}
  function setVolume(value){value=Number(value);if(!Number.isFinite(value))return;volume=Math.max(0,Math.min(1,value));audio.volume=volume;radio?.setVolume(volume);sync();}
  function loadFile(file){
    if(disposed||!file)return false;
    if(!file.type?.startsWith('audio/')&&!/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(file.name||'')){status('请选择 MP3、M4A、WAV 或其他音频文件');return false;}
    epoch++;pauseLocal();if(objectURL)urlAPI.revokeObjectURL(objectURL);
    objectURL=urlAPI.createObjectURL(file);filename=String(file.name||'本地音乐');audio.src=objectURL;audio.loop=true;audio.load();localLabel.textContent=filename;select('local');return true;
  }
  function nextTrack(){
    if(source==='coast')return Promise.resolve(radio?.nextTrack()).then(ok=>{coastPlaying=Boolean(ok)&&desired&&!suspended;sync();return coastPlaying;});
    if(source==='local'&&objectURL){audio.currentTime=0;return desired?playCurrent():Promise.resolve(false);}
    open();status('使用 Spotify 播放器选择下一首');return Promise.resolve(false);
  }
  for(const name of ['spotify','coast','local'])listen(byId(`music-source-${name}`),'click',()=>select(name));
  listen(byId('soundtrack-close'),'click',()=>{close();onFocus?.();});
  listen(byId('soundtrack-compact'),'click',()=>{opened?close():open();onFocus?.();});
  listen(byId('music-play-toggle'),'click',()=>{void togglePlayback();onFocus?.();});
  listen(byId('intro-music-toggle'),'click',()=>{void togglePlayback();});
  listen(byId('music-volume'),'input',event=>setVolume(event.target.value));
  listen(byId('coast-toggle'),'click',()=>{void togglePlayback();});listen(byId('coast-next'),'click',()=>{void nextTrack();});
  listen(byId('local-audio-pick'),'click',()=>fileInput.click());listen(fileInput,'change',()=>{loadFile(fileInput.files?.[0]);fileInput.value='';});
  listen(audio,'play',()=>{if(disposed||suspended||source!=='local'){pauseLocal();return;}localPlaying=true;desired=true;userPaused=false;sync();});
  listen(audio,'pause',()=>{localPlaying=false;if(expectedLocalPause)expectedLocalPause=false;else if(source==='local'&&!suspended){desired=false;userPaused=true;}sync();});
  listen(audio,'ended',()=>{localPlaying=false;sync();});listen(audio,'error',()=>{localPlaying=false;status('这段音频无法播放，请换一个格式');sync();});
  listen(panel,'keydown',event=>{if(event.code==='Escape'){event.preventDefault();close();onFocus?.();}event.stopPropagation();});
  audio.loop=true;setVolume(volume);sync();
  return {
    get source(){return source;},get isOpen(){return opened;},get isDocked(){return isDocked();},get isCompact(){return isDocked();},get playing(){return isPlaying();},
    get usingFallback(){return source==='spotify'&&fallbackPlaying;},get playbackKnown(){return source!=='spotify'||spotifyKnown||fallbackPlaying;},get volume(){return volume;},get label(){return source==='spotify'?(fallbackPlaying?'COAST FM · 等待原声':'GTA V · THE SCORE'):source==='local'?filename||'本地音乐':radio?.trackLabel||'COAST FM';},
    prepare,start,togglePlayback,nextTrack,select,open,close,togglePanel(){opened?close():open();},setSuspended,setPaused:setSuspended,setVolume,loadFile,
    dispose(){if(disposed)return;desired=false;userPaused=true;stopCurrent();unloadSpotify();opened=false;disposed=true;sync();for(const remove of removers)remove();audio.removeAttribute('src');audio.load();if(objectURL)urlAPI.revokeObjectURL(objectURL);objectURL=null;panel.hidden=true;radio?.dispose();},
  };
}
