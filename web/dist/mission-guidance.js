/** Short English dispatch lines. Speech is optional; the same line is always captioned. */
export function createMissionGuidance(options = {}) {
  const speech = options.speech ?? globalThis.speechSynthesis;
  const Utterance = options.Utterance ?? globalThis.SpeechSynthesisUtterance;
  let enabled = true, unlocked = false, active = false, disposed = false;
  let current = null, lastKey = null, speaking = null, status = 'ready';
  const supported = Boolean(speech && typeof speech.speak === 'function' && typeof Utterance === 'function');
  const notify = () => options.onChange?.({ enabled, supported, status, speaking: Boolean(speaking) });
  const voice = () => {
    const voices = speech?.getVoices?.() || [];
    const english = voices.filter(item => /^en(?:[-_]|$)/i.test(item.lang || ''));
    return english.find(item => item.localService && /^en-US$/i.test(item.lang))
      || english.find(item => item.localService) || english.find(item => item.default) || english[0];
  };
  function cancel() {
    const wasSpeaking = speaking;
    speaking = null;
    if (wasSpeaking) {
      try { speech?.cancel?.(); } catch {}
      status = enabled ? 'ready' : 'muted';
      options.onSpeaking?.(false); notify();
    }
  }
  function say() {
    if (disposed || !current?.voiceText || !unlocked || !enabled || !active) return false;
    cancel();
    if (!supported) { status = 'text-only'; notify(); return false; }
    try {
      const utterance = new Utterance(current.voiceText);
      utterance.lang = 'en-US'; utterance.rate = .98; utterance.pitch = 1; utterance.volume = .9;
      const selected = voice();
      if (selected) utterance.voice = selected;
      speaking = utterance;
      status = 'ready';
      utterance.onstart = () => {
        if (speaking !== utterance || disposed) return;
        status = 'speaking'; options.onSpeaking?.(true); notify();
      };
      utterance.onend = () => {
        if (speaking !== utterance || disposed) return;
        speaking = null; status = 'ready'; options.onSpeaking?.(false); notify();
      };
      utterance.onerror = () => {
        if (speaking !== utterance || disposed) return;
        speaking = null; status = 'text-only'; options.onSpeaking?.(false); notify();
      };
      speech.speak(utterance);
      notify();
      return true;
    } catch {
      speaking = null; status = 'text-only'; options.onSpeaking?.(false); notify();
      return false;
    }
  }
  return {
    get enabled() { return enabled; },
    get supported() { return supported; },
    unlock() { unlocked = true; },
    update(mission, { active: nextActive = true } = {}) {
      if (disposed) return;
      current = mission?.total > 0 && mission.voiceText ? mission : null;
      active = Boolean(nextActive && current);
      if (!active) { cancel(); return; }
      // Only consume the stage after entry is unlocked, so loading/CG cannot
      // swallow the opening line. Repeated frame updates never queue speech.
      if (unlocked && current.voiceKey !== lastKey) {
        lastKey = current.voiceKey;
        options.onStage?.(current);
        say();
      }
    },
    replay() { unlocked = true; return say(); },
    toggle() {
      enabled = !enabled; unlocked = true;
      if (!enabled) { cancel(); status = 'muted'; notify(); }
      else { status = 'ready'; notify(); say(); }
      return enabled;
    },
    pause() { active = false; cancel(); },
    reset() { lastKey = null; cancel(); },
    dispose() { if (disposed) return; cancel(); disposed = true; current = null; },
  };
}

/** Relative world bearing in radians; zero points toward the viewed heading. */
export function missionDirection(angle) {
  if (!Number.isFinite(angle)) return { degrees: 0, label: '寻找载具', available: false };
  const normalized = Math.atan2(Math.sin(angle), Math.cos(angle));
  const degrees = -normalized * 180 / Math.PI;
  const absolute = Math.abs(degrees);
  return { degrees, available: true, label: absolute < 24 ? '前方' : absolute > 150 ? '身后' : degrees < 0 ? '左侧' : '右侧' };
}
