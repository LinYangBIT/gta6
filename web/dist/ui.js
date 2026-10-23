/** DOM-only presentation and touch controls for Sunset Coast. */
export function createUI(handlers = {}) {
  const byId = id => document.getElementById(id);
  const intro = byId('intro');
  const hud = byId('hud');
  const world = byId('world');
  const drive = byId('start-drive');
  const cruise = byId('start-cruise');
  const newCity = byId('new-city-button');
  const loading = byId('loading');
  const readyMessage = byId('ready-message');
  const error = byId('load-error');
  const helpDialog = byId('help-dialog');
  const videoDialog = byId('video-dialog');
  const video = byId('cruise-video');
  const toastElement = byId('toast');
  const pointers = new Map();
  const steeringPad = byId('steering-pad');
  const steeringKnob = byId('steering-knob');
  let steeringPointer = null;
  let steeringValue = 0;
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
  function setSteering(value) {
    steeringValue = Math.max(-1, Math.min(1, Number(value) || 0));
    if (Math.abs(steeringValue) < 0.055) steeringValue = 0;
    steeringKnob.style.setProperty('--steering-x', `${-steeringValue * 30}px`);
    steeringPad.setAttribute('aria-valuenow', String(Math.round(steeringValue * 100)));
    steeringPad.setAttribute('aria-valuetext', steeringValue === 0 ? '直行' : `${steeringValue > 0 ? '左转' : '右转'} ${Math.round(Math.abs(steeringValue) * 100)}%`);
    steeringPad.classList.toggle('is-pressed', steeringValue !== 0);
    handlers.steer?.(steeringValue);
  }
  function releaseAll() {
    steeringPointer = null;
    setSteering(0);
    const controls = new Set(pointers.values());
    pointers.clear();
    for (const control of controls) handlers.touch?.(control, false);
    document.querySelectorAll('[data-control].is-pressed').forEach(button => button.classList.remove('is-pressed'));
  }
  function distanceLabel(metres, decimals = 2) {
    const distance = Math.max(0, Number(metres) || 0);
    return `${(distance / 1000).toFixed(decimals)} km`;
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
  onClick('new-city-button', () => { if (ready) { releaseAll(); handlers.newCity?.(); } });
  onClick('camera-button', () => handlers.camera?.());
  onClick('recenter-button', () => handlers.recenter?.());
  onClick('music-button', () => handlers.music?.());
  onClick('track-button', () => handlers.track?.());
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

  // Each finger owns its input until released; steering and pedals work together.
  for (const button of document.querySelectorAll('[data-control]')) {
    const control = button.dataset.control;
    const press = id => {
      const alreadyPressed = [...pointers.values()].includes(control);
      pointers.set(id, control);
      button.classList.add('is-pressed');
      if (!alreadyPressed) handlers.touch?.(control, true);
    };
    const release = id => {
      if (!pointers.has(id)) return;
      pointers.delete(id);
      if (![...pointers.values()].includes(control)) {
        handlers.touch?.(control, false);
        button.classList.remove('is-pressed');
      }
    };
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      press(event.pointerId);
      button.setPointerCapture?.(event.pointerId);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(name, event => release(event.pointerId));
    }
    button.addEventListener('keydown', event => {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      if (!event.repeat) press(`keyboard:${control}`);
    });
    button.addEventListener('keyup', event => {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      release(`keyboard:${control}`);
    });
    button.addEventListener('blur', () => release(`keyboard:${control}`));
  }
  const steerAt = event => {
    const bounds = steeringPad.getBoundingClientRect();
    const center = bounds.left + bounds.width / 2;
    setSteering((center - event.clientX) / (bounds.width * .32));
  };
  steeringPad.addEventListener('contextmenu', event => event.preventDefault());
  steeringPad.addEventListener('pointerdown', event => {
    if (steeringPointer !== null || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault();
    steeringPointer = event.pointerId;
    steeringPad.setPointerCapture?.(event.pointerId);
    steerAt(event);
  });
  steeringPad.addEventListener('pointermove', event => {
    if (event.pointerId !== steeringPointer) return;
    event.preventDefault();
    steerAt(event);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    steeringPad.addEventListener(name, event => {
      if (event.pointerId !== steeringPointer) return;
      steeringPointer = null;
      setSteering(0);
    });
  }
  steeringPad.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    setSteering(event.code === 'ArrowLeft' ? 1 : event.code === 'ArrowRight' ? -1 : 0);
  });
  steeringPad.addEventListener('keyup', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    setSteering(0);
  });
  steeringPad.addEventListener('blur', () => { steeringPointer = null; setSteering(0); });
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
      newCity.disabled = false;
      loading.hidden = true;
      error.hidden = true;
      readyMessage.hidden = false;
    },
    setError(message) {
      ready = false;
      drive.disabled = true;
      cruise.disabled = true;
      newCity.disabled = true;
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
      const checkpoints = Math.max(0, Math.floor(Number(state.checkpoint) || 0));
      text('checkpoint-count', `${checkpoints.toLocaleString('zh-CN')} 个路口`);
      text('distance-value', distanceLabel(state.distance));
      const destination = Number(state.destinationDistance);
      text('destination-distance', Number.isFinite(destination) && destination >= 0
        ? destination >= 1000 ? distanceLabel(destination, 1) : `${Math.round(destination)} m`
        : '-- m');
      text('route-description', state.cruising ? '沿着路口巡游，随时接管方向' : '随心转弯，发现下一片街区');
      const seedLabel = String(Number.isFinite(state.seed) ? Math.trunc(state.seed) : 610).padStart(6, '0');
      text('world-seed', seedLabel);
      text('city-label', seedLabel);
      text('district', state.district || '棕榈大道');
      if (state.cameraLabel) text('camera-label', state.cameraLabel);
      const soundOn = Boolean(state.soundOn);
      if (last.soundOn !== soundOn) {
        byId('sound-button').setAttribute('aria-pressed', String(soundOn));
        byId('sound-button').setAttribute('aria-label', `${soundOn ? '关闭' : '打开'}引擎声`);
        last.soundOn = soundOn;
      }
      const musicOn = Boolean(state.musicOn);
      if (last.musicOn !== musicOn) {
        byId('music-button').setAttribute('aria-pressed', String(musicOn));
        byId('music-button').setAttribute('aria-label', `${musicOn ? '关闭' : '打开'}背景音乐`);
        text('radio-state', musicOn ? 'ON AIR' : 'OFF');
        last.musicOn = musicOn;
      }
      if (state.trackLabel) text('track-label', state.trackLabel);
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
