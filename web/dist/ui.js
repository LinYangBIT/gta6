/** DOM-only presentation and touch controls for Sunset Coast. */
export function createUI(handlers = {}) {
  const byId = id => document.getElementById(id);
  const intro = byId('intro');
  const hud = byId('hud');
  const world = byId('world');
  const drive = byId('start-drive');
  const cruise = byId('start-cruise');
  const loading = byId('loading');
  const readyMessage = byId('ready-message');
  const error = byId('load-error');
  const helpDialog = byId('help-dialog');
  const videoDialog = byId('video-dialog');
  const video = byId('cruise-video');
  const toastElement = byId('toast');
  const pointers = new Map();
  const last = {};
  let ready = false;
  let toastTimeout;

  function text(id, value) {
    const element = byId(id);
    const string = String(value);
    if (element && element.textContent !== string) element.textContent = string;
  }
  function onClick(id, callback) {
    byId(id)?.addEventListener('click', callback);
  }
  function dialogState() {
    const open = Boolean(document.querySelector('dialog[open]'));
    handlers.dialog?.(open);
    document.dispatchEvent(new CustomEvent('sunset:dialog', { detail: { open } }));
  }
  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    releaseAll();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialogState();
  }
  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else { dialog.removeAttribute('open'); dialogState(); }
  }
  function openVideo() {
    openDialog(videoDialog);
    video?.play()?.catch(() => {});
  }
  function releaseAll() {
    const controls = new Set(pointers.values());
    pointers.clear();
    for (const control of controls) handlers.touch?.(control, false);
    document.querySelectorAll('[data-control].is-pressed').forEach(button => button.classList.remove('is-pressed'));
  }
  function timeLabel(value, fallback = '--:--') {
    if (typeof value === 'string') return value;
    if (!Number.isFinite(value) || value < 0) return fallback;
    const total = Math.floor(value);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  function showIntro() {
    releaseAll();
    intro.classList.remove('is-hidden');
    intro.removeAttribute('aria-hidden');
    intro.inert = false;
    hud.hidden = true;
    document.body.classList.add('is-intro');
    if (ready) drive.focus({ preventScroll: true });
  }
  function hideIntro() {
    intro.classList.add('is-hidden');
    intro.setAttribute('aria-hidden', 'true');
    intro.inert = true;
    hud.hidden = false;
    document.body.classList.remove('is-intro');
    world?.focus({ preventScroll: true });
  }

  onClick('start-drive', () => { if (ready) handlers.start?.('drive'); });
  onClick('start-cruise', () => { if (ready) handlers.start?.('cruise'); });
  onClick('camera-button', () => handlers.camera?.());
  onClick('reset-button', () => handlers.reset?.());
  onClick('sound-button', () => handlers.sound?.());
  onClick('fullscreen-button', () => handlers.fullscreen?.());
  onClick('menu-button', () => { releaseAll(); handlers.menu?.(); });
  onClick('help-button', () => openDialog(helpDialog));
  onClick('intro-help', () => openDialog(helpDialog));
  onClick('watch-video', openVideo);
  onClick('error-video', openVideo);
  onClick('retry-load', () => handlers.retry ? handlers.retry() : window.location.reload());
  document.querySelector('.brand')?.addEventListener('click', event => event.preventDefault());

  for (const button of document.querySelectorAll('[data-close]')) {
    button.addEventListener('click', () => closeDialog(byId(button.dataset.close)));
  }
  for (const dialog of [helpDialog, videoDialog]) {
    if (!dialog) continue;
    dialog.addEventListener('close', () => {
      if (dialog === videoDialog && video) video.pause();
      dialogState();
    });
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(dialog);
    });
  }

  for (const button of document.querySelectorAll('[data-control]')) {
    const control = button.dataset.control;
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      const alreadyPressed = [...pointers.values()].includes(control);
      pointers.set(event.pointerId, control);
      button.setPointerCapture?.(event.pointerId);
      button.classList.add('is-pressed');
      if (!alreadyPressed) handlers.touch?.(control, true);
    });
    const release = event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (![...pointers.values()].includes(control)) {
        handlers.touch?.(control, false);
        button.classList.remove('is-pressed');
      }
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  return {
    setLoading(progress, message) {
      if (ready) return;
      const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress > 1 ? progress / 100 : progress)) : 0;
      const percent = Math.round(fraction * 100);
      loading.hidden = false;
      text('loading-percent', `${percent}%`);
      byId('loading-fill').style.width = `${percent}%`;
      if (message) text('loading-message', message);
    },
    setReady() {
      ready = true;
      document.body.classList.add('is-ready');
      drive.disabled = false;
      cruise.disabled = false;
      loading.hidden = true;
      error.hidden = true;
      readyMessage.hidden = false;
    },
    setError(message) {
      ready = false;
      drive.disabled = true;
      cruise.disabled = true;
      loading.hidden = true;
      readyMessage.hidden = true;
      error.hidden = false;
      text('error-message', message || '请刷新页面重试，或先观看海岸巡游短片。');
      showIntro();
    },
    update(state = {}) {
      const speed = Math.max(0, Math.round(Math.abs(Number(state.speed) || 0)));
      text('speed', speed);
      text('gear', state.gear || 'N');
      if (last.speed !== speed) {
        byId('speed-fill').style.width = `${Math.min(speed / 140, 1) * 100}%`;
        last.speed = speed;
      }
      const total = Math.max(1, Number(state.total) || 5);
      const checkpoint = Math.min(total, Math.max(0, Number(state.checkpoint) || 0));
      text('checkpoint-count', `${checkpoint} / ${total}`);
      const progressKey = `${checkpoint}/${total}`;
      if (last.route !== progressKey) {
        byId('route-fill').style.width = `${checkpoint / total * 100}%`;
        text('route-description', checkpoint >= total ? '海岸路线完成，继续享受海风' : '驶过光圈，探索海岸');
        last.route = progressKey;
      }
      text('elapsed-time', timeLabel(state.time, '00:00'));
      text('best-time', timeLabel(state.best));
      text('district', state.district || '棕榈大道');
      if (state.cameraLabel) text('camera-label', state.cameraLabel);
      const soundOn = Boolean(state.soundOn);
      if (last.soundOn !== soundOn) {
        byId('sound-button').setAttribute('aria-pressed', String(soundOn));
        byId('sound-button').setAttribute('aria-label', `${soundOn ? '关闭' : '打开'}声音，快捷键 M`);
        last.soundOn = soundOn;
      }
      byId('cruise-badge').hidden = !state.cruising;
    },
    showIntro,
    hideIntro,
    toast(message) {
      clearTimeout(toastTimeout);
      toastElement.textContent = String(message);
      toastElement.classList.add('is-visible');
      toastTimeout = setTimeout(() => toastElement.classList.remove('is-visible'), 3400);
    },
  };
}
