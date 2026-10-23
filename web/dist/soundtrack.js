/** Visible, user-started soundtrack sources. Commercial music stays on Spotify. */
export const GTA_SCORE_URL = 'https://open.spotify.com/album/5EJAJsaHhQYLwVbynpcGkD';
export const GTA_SCORE_EMBED = 'https://open.spotify.com/embed/album/5EJAJsaHhQYLwVbynpcGkD?theme=0';

export function createSoundtrack({ onSelection, onStatus, onFocus, onCoastToggle, onCoastNext, document: dom = globalThis.document, urlAPI = globalThis.URL } = {}) {
  const byId = id => dom.getElementById(id);
  const panel = byId('soundtrack-panel');
  const mount = byId('spotify-mount');
  const audio = byId('local-audio');
  const fileInput = byId('local-audio-file');
  const localLabel = byId('local-audio-name');
  let source = 'spotify', opened = false, paused = false, disposed = false, compact = false;
  let frame = null, objectURL = null, filename = '', playing = false;
  const removers = [];
  const listen = (element, type, callback) => {
    element?.addEventListener(type, callback);
    removers.push(() => element?.removeEventListener(type, callback));
  };
  const status = message => { byId('soundtrack-status').textContent = message; onStatus?.(message); };
  function unloadSpotify() {
    if (!frame) return;
    frame.remove(); frame = null;
  }
  function stopLocal() { audio.pause(); playing = false; }
  function loadSpotify() {
    if (frame || !opened || paused || source !== 'spotify' || disposed) return;
    frame = dom.createElement('iframe');
    frame.title = 'GTA V 原声 · Spotify 官方播放器';
    frame.src = GTA_SCORE_EMBED;
    frame.width = '100%'; frame.height = '152';
    frame.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('loading', 'lazy');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    mount.appendChild(frame);
  }
  function sync() {
    panel.hidden = !opened;
    panel.setAttribute('data-compact', String(compact));
    const compactButton = byId('soundtrack-compact');
    compactButton.hidden = source === 'coast';
    compactButton.textContent = compact ? '展开' : '只显示播放器';
    compactButton.setAttribute('aria-pressed', String(compact));
    compactButton.setAttribute('aria-label', compact ? '展开音乐来源和设置' : '只显示播放器，保留可见播放控件');
    byId('music-button').setAttribute('aria-expanded', String(opened));
    for (const name of ['spotify', 'coast', 'local']) {
      byId(`music-source-${name}`).setAttribute('aria-pressed', String(name === source));
      byId(`soundtrack-${name}`).hidden = name !== source;
    }
  }
  function select(next) {
    if (disposed || !['spotify', 'coast', 'local'].includes(next)) return;
    if (source !== next) { unloadSpotify(); stopLocal(); }
    source = next;
    if (source === 'coast') compact = false;
    sync();
    onSelection?.(source);
    if (source === 'spotify') {
      loadSpotify();
      status('点击 Spotify 播放键开始原声');
    } else if (source === 'local') status(filename ? '点击下方播放键开始本地音乐' : '选择你自己的音频，文件只在本机播放');
    else status('原创合成器电台 · 两首曲目');
  }
  function open() {
    if (disposed || paused) return;
    opened = true; sync(); loadSpotify();
    status(source === 'spotify' ? '点击 Spotify 播放键开始原声' : source === 'local' ? '使用下方播放器控制音乐' : '原创合成器电台 · 两首曲目');
  }
  function close() {
    opened = false; compact = false; unloadSpotify(); stopLocal(); sync();
  }
  function setPaused(value) {
    value = Boolean(value);
    if (value === paused) return;
    paused = value;
    if (paused) close();
  }
  function loadFile(file) {
    if (disposed || !file) return false;
    if (!file.type?.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(file.name || '')) {
      status('请选择 MP3、M4A、WAV 或其他音频文件');
      return false;
    }
    stopLocal();
    if (objectURL) urlAPI.revokeObjectURL(objectURL);
    objectURL = urlAPI.createObjectURL(file);
    filename = String(file.name || '本地音乐');
    audio.src = objectURL; audio.load();
    localLabel.textContent = filename;
    select('local');
    return true;
  }
  for (const name of ['spotify', 'coast', 'local']) listen(byId(`music-source-${name}`), 'click', () => select(name));
  listen(byId('soundtrack-close'), 'click', () => { close(); onFocus?.(); });
  listen(byId('soundtrack-compact'), 'click', () => {
    if (!opened || source === 'coast') return;
    compact = !compact; sync();
    if (compact) onFocus?.();
  });
  listen(byId('coast-toggle'), 'click', () => onCoastToggle?.());
  listen(byId('coast-next'), 'click', () => onCoastNext?.());
  listen(byId('local-audio-pick'), 'click', () => fileInput.click());
  listen(fileInput, 'change', () => { loadFile(fileInput.files?.[0]); fileInput.value = ''; });
  listen(audio, 'play', () => {
    if (paused || !opened || source !== 'local') { stopLocal(); return; }
    playing = true; onSelection?.('local');
  });
  listen(audio, 'pause', () => { playing = false; });
  listen(audio, 'ended', () => { playing = false; });
  listen(audio, 'error', () => { playing = false; status('这段音频无法播放，请换一个格式'); });
  // Controls in the panel should never also trigger movement shortcuts.
  listen(panel, 'keydown', event => { if (event.code === 'Escape') { event.preventDefault(); close(); onFocus?.(); } event.stopPropagation(); });
  sync();
  return {
    get source() { return source; },
    get isOpen() { return opened; },
    get isCompact() { return compact; },
    get playing() { return playing; },
    get label() { return source === 'spotify' ? 'GTA V · THE SCORE' : source === 'local' ? filename || '本地音乐' : 'COAST FM'; },
    select, open, close, togglePanel() { opened ? close() : open(); }, setPaused, loadFile,
    dispose() {
      if (disposed) return;
      close(); disposed = true;
      for (const remove of removers) remove();
      audio.removeAttribute('src'); audio.load();
      if (objectURL) urlAPI.revokeObjectURL(objectURL);
      objectURL = null;
    },
  };
}
