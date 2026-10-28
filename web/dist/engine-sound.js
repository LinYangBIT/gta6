/** Quiet, procedural engine sound. The enter gesture unlocks audio; movement
 * state decides audibility, so walking, menus and CG never idle a hidden car. */
export function createEngineSound(options = {}) {
  const Audio = Object.hasOwn(options, 'AudioContext') ? options.AudioContext
    : globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const notify = message => options.onStatus?.(message);
  let enabled = true, disposed = false, unlocked = false, generation = 0;
  let context, fundamental, harmonic, lowpass, master;
  const nodes = [];
  let state = { speed: 0, active: false, driving: false, blocked: true };

  function createGraph() {
    if (context) return;
    if (typeof Audio !== 'function') throw new Error('Web Audio unavailable');
    context = new Audio();
    fundamental = context.createOscillator(); fundamental.type = 'sawtooth';
    harmonic = context.createOscillator(); harmonic.type = 'triangle';
    const body = context.createGain(), overtone = context.createGain();
    body.gain.value = .68; overtone.gain.value = .22;
    lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass';
    lowpass.frequency.value = 260; lowpass.Q.value = .55;
    master = context.createGain(); master.gain.value = 0;
    fundamental.frequency.value = 42; harmonic.frequency.value = 84;
    fundamental.connect(body).connect(lowpass);
    harmonic.connect(overtone).connect(lowpass);
    lowpass.connect(master).connect(context.destination);
    nodes.push(fundamental, harmonic, body, overtone, lowpass, master);
    fundamental.start(); harmonic.start();
  }

  function apply() {
    if (!context || disposed || !master) return;
    const speed = Math.min(60, Math.abs(Number.isFinite(state.speed) ? state.speed : 0));
    const time = context.currentTime, rpm = 42 + speed * 4.5;
    fundamental.frequency.setTargetAtTime(rpm, time, .085);
    harmonic.frequency.setTargetAtTime(rpm * 2.01, time, .085);
    lowpass.frequency.setTargetAtTime(260 + speed * 14, time, .1);
    const audible = enabled && unlocked && context.state === 'running'
      && state.active && state.driving && !state.blocked;
    const volume = audible ? .015 + Math.min(1, speed / 42) * .006 : 0;
    master.gain.setTargetAtTime(volume, time, audible ? .065 : .035);
  }

  async function start() {
    if (disposed || !enabled) return false;
    const ticket = ++generation;
    try {
      createGraph();
      // Keep resume in the trusted click turn, before any asynchronous boundary.
      const unlocking = context.resume();
      await unlocking;
      if (disposed || ticket !== generation || !enabled) return false;
      unlocked = context.state === 'running';
      apply();
      if (!unlocked) notify('点引擎声按钮可重试开启声音');
      return unlocked;
    } catch {
      if (!disposed && ticket === generation && enabled) {
        unlocked = false; apply();
        notify(typeof Audio === 'function' ? '浏览器暂未允许引擎声，点声音按钮可重试' : '此浏览器暂不支持引擎声');
      }
      return false;
    }
  }

  function toggle() {
    if (disposed) return Promise.resolve(false);
    enabled = !enabled; generation++;
    if (!enabled) {
      apply(); notify('引擎声已关闭');
      return Promise.resolve(false);
    }
    notify('引擎声已开启');
    return start();
  }

  return {
    get enabled() { return enabled; },
    get supported() { return typeof Audio === 'function'; },
    start, toggle,
    update(next = {}) {
      if (disposed) return;
      state = { speed: next.speed, active: Boolean(next.active), driving: Boolean(next.driving), blocked: Boolean(next.blocked) };
      apply();
    },
    dispose() {
      if (disposed) return;
      enabled = false; unlocked = false; generation++; apply(); disposed = true;
      for (const oscillator of [fundamental, harmonic]) { try { oscillator?.stop(); } catch {} }
      for (const node of nodes) { try { node.disconnect(); } catch {} }
      try { Promise.resolve(context?.close()).catch(() => {}); } catch {}
    },
  };
}
