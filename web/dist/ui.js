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
  let currentMode = 'walk';
  let moveX = 0, moveZ = 0;
  const last = {};
  let ready = false;
  let toastTimeout;
  let orientationBlocked = false;
  const portraitMedia = window.matchMedia?.('(pointer: coarse) and (orientation: portrait)');
  function syncOrientation() {
    const blocked = Boolean(portraitMedia?.matches && !document.body.classList.contains('allow-portrait'));
    if (blocked === orientationBlocked) return;
    orientationBlocked = blocked;
    releaseAll();
    handlers.orientation?.(blocked);
  }

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
    steeringKnob.style.setProperty('--steering-y', '0px');
    steeringPad.setAttribute('aria-valuenow', String(Math.round(steeringValue * 100)));
    steeringPad.setAttribute('aria-valuetext', steeringValue === 0 ? '直行' : `${steeringValue > 0 ? '左转' : '右转'} ${Math.round(Math.abs(steeringValue) * 100)}%`);
    steeringPad.classList.toggle('is-pressed', steeringValue !== 0);
    handlers.steer?.(steeringValue);
  }
  function setMove(x, z) {
    const magnitude = Math.hypot(x, z);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    moveX = magnitude < .08 ? 0 : x * scale;
    moveZ = magnitude < .08 ? 0 : z * scale;
    steeringKnob.style.setProperty('--steering-x', `${moveX * 32}px`);
    steeringKnob.style.setProperty('--steering-y', `${-moveZ * 32}px`);
    steeringPad.setAttribute('aria-valuenow', String(Math.round(Math.hypot(moveX, moveZ) * 100)));
    steeringPad.setAttribute('aria-valuetext', !moveX && !moveZ ? '站立' : '移动中');
    steeringPad.classList.toggle('is-pressed', Boolean(moveX || moveZ));
    handlers.move?.(moveX, moveZ);
  }
  function releaseAll() {
    steeringPointer = null;
    setSteering(0);
    setMove(0, 0);
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

  onClick('start-drive', () => { if (ready) handlers.start?.('walk'); });
  onClick('start-cruise', () => { if (ready) handlers.start?.('free'); });
  onClick('interact-button', () => { if (!byId('interact-button').disabled) { releaseAll(); handlers.interact?.(); world?.focus({ preventScroll: true }); } });
  onClick('continue-portrait', () => { document.body.classList.add('allow-portrait'); syncOrientation(); world?.focus({ preventScroll: true }); });
  onClick('rotate-fullscreen', () => handlers.fullscreen?.());
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
      if (!hud.hidden) world?.focus({ preventScroll: true });
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
    if (currentMode === 'walk') setMove((event.clientX - center) / (bounds.width * .32), ((bounds.top || 0) + (bounds.height || bounds.width) / 2 - event.clientY) / (bounds.width * .32));
    else setSteering((center - event.clientX) / (bounds.width * .32));
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
      setMove(0, 0);
    });
  }
  steeringPad.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    if (currentMode === 'walk') setMove(event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : 0, event.code === 'ArrowUp' ? 1 : event.code === 'ArrowDown' ? -1 : 0);
    else setSteering(event.code === 'ArrowLeft' ? 1 : event.code === 'ArrowRight' ? -1 : 0);
  });
  steeringPad.addEventListener('keyup', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    setSteering(0);
    setMove(0, 0);
  });
  steeringPad.addEventListener('blur', () => { steeringPointer = null; setSteering(0); setMove(0, 0); });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  portraitMedia?.addEventListener?.('change', syncOrientation);
  syncOrientation();

  return {
    get orientationBlocked() { return orientationBlocked; },
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
      const mode = state.mode || currentMode;
      if (mode !== currentMode) { releaseAll(); currentMode = mode; }
      document.body.classList.toggle('is-driving', mode === 'drive');
      const walking = mode !== 'drive';
      text('movement-caption', walking ? '拖动摇杆 · 自由移动' : '左右拖动 · 转向');
      text('movement-hint', walking ? '移动' : '驾驶');
      text('secondary-key', walking ? 'SHIFT' : 'SPACE');
      text('secondary-hint', walking ? '奔跑' : '手刹');
      text('vehicle-label', walking ? 'ON FOOT · 步行' : state.vehicleLabel || 'COASTAL GT');
      steeringPad.setAttribute('aria-label', walking ? '移动摇杆，拖动选择方向' : '方向盘，左右拖动转向');
      byId('interact-button').disabled = !state.canInteract;
      text('interaction-label', state.interactionLabel || (walking ? '靠近车辆或任务地点' : '停车后下车'));
      if (state.mission) {
        const mission = state.mission;
        text('mission-chapter', mission.chapter || '街头委托');
        text('mission-title', mission.title || '自由探索');
        text('mission-objective', mission.objective || mission.description || '城市没有终点，随心探索。');
        const total = Math.max(0, Number(mission.total) || 0);
        const progress = Math.max(0, Math.min(total, Number(mission.progress) || 0));
        text('mission-progress', total === 0 ? '∞ 自由探索' : progress >= total ? '已完成' : `${String(progress + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`);
        byId('mission-progress-fill').style.width = `${total > 0 ? progress / total * 100 : 0}%`;
        text('mission-cash', `$${Math.max(0, Number(mission.cash) || 0).toLocaleString('en-US')}`);
        text('mission-reward', `$${Math.max(0, Number(mission.reward) || 0).toLocaleString('en-US')}`);
        byId('mission-reward-wrap').hidden = total === 0;
      }
      const speed = Math.max(0, Math.round(Math.abs(Number(state.speed) || 0)));
      text('speed', speed);
      text('gear', state.gear || 'N');
      if (last.speed !== speed) {
        byId('speed-fill').style.width = `${Math.min(speed / 140, 1) * 100}%`;
        last.speed = speed;
      }
      const checkpoints = Math.max(0, Math.floor(Number(state.checkpoint) || 0));
      text('checkpoint-count', `${checkpoints.toLocaleString('zh-CN')} 份委托`);
      text('distance-value', distanceLabel(state.distance));
      const destination = Number(state.destinationDistance);
      text('destination-distance', state.mission?.total === 0 ? '自由探索' : Number.isFinite(destination) && destination >= 0
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
      const musicSource = state.musicSource || 'coast';
      const musicOpen = state.musicPanelOpen;
      byId('music-button').setAttribute('aria-pressed', String(musicOpen ?? musicOn));
      byId('music-button').setAttribute('data-playing', String(musicSource !== 'spotify' && musicOn));
      byId('music-button').setAttribute('aria-label', musicOpen ? '关闭音乐播放器' : '打开音乐播放器');
      text('music-source-label', musicSource === 'spotify' ? 'GTA V 原声' : musicSource === 'local' ? '本地音乐' : 'COAST FM');
      text('radio-state', musicSource === 'spotify' ? (musicOpen ? 'PLAYER' : 'READY') : musicOn ? 'ON AIR' : 'OFF');
      if (state.trackLabel) text('track-label', state.trackLabel);
      byId('track-button').setAttribute('aria-label', musicSource === 'coast' ? '切换下一首音乐' : '打开音乐播放器选择曲目');
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
