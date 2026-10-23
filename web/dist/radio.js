/**
 * Original, locally synthesized Coast FM. No recordings, streams, or downloads.
 * Call start/toggle from a user gesture so mobile browsers can unlock audio.
 */
export const RADIO_TRACKS = Object.freeze([
  Object.freeze({ id: 'afterglow', title: '落日余晖 · Afterglow', bpm: 96,
    chords: Object.freeze([[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59]].map(Object.freeze)),
    melody: Object.freeze([76, null, 72, 71, 69, null, 72, 76, 77, null, 76, 72, 69, 72, 76, null,
      76, 79, 76, null, 72, 71, 67, null, 74, null, 71, 67, 69, 71, 74, null]),
    arp: Object.freeze([0, 2, 1, 3, 2, 1, 3, 1]),
  }),
  Object.freeze({ id: 'night-drive', title: '霓虹慢行 · Neon Tide', bpm: 110,
    chords: Object.freeze([[38, 45, 50, 53], [34, 41, 46, 50], [41, 48, 53, 57], [36, 43, 48, 52]].map(Object.freeze)),
    melody: Object.freeze([74, null, 77, 76, 74, 69, null, 72, 70, null, 74, 77, 74, null, 70, 69,
      72, 77, null, 81, 79, 77, 72, null, 76, null, 72, 67, 69, 72, 76, null]),
    arp: Object.freeze([0, 1, 2, 3, 1, 2, 3, 2]),
  }),
]);

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const midi = note => 440 * 2 ** ((note - 69) / 12);

/** One sixteenth-note event list; a complete evolving arrangement is 32 bars. */
export function scoreStep(trackIndex, absoluteStep) {
  const track = RADIO_TRACKS[((trackIndex % RADIO_TRACKS.length) + RADIO_TRACKS.length) % RADIO_TRACKS.length];
  const step = ((Math.floor(absoluteStep) % 512) + 512) % 512;
  const beat = step % 16;
  const bar = Math.floor(step / 16);
  const section = Math.floor(bar / 8);
  const chord = track.chords[Math.floor(bar / 2) % 4];
  const events = [];
  if (beat === 0) events.push({ kind: 'pad', notes: chord.slice(1), length: 17.4 });
  if ([0, 3, 6, 8, 11, 14].includes(beat)) {
    events.push({ kind: 'bass', note: chord[0] + (beat === 14 ? 12 : 0), length: beat % 8 === 0 ? 2.3 : 1.45 });
  }
  if (beat % 2 === 0) {
    const index = track.arp[(beat / 2 + bar % 2 * 2) % track.arp.length];
    events.push({ kind: 'arp', note: chord[index] + 12, length: 1.6, pan: beat % 4 === 0 ? -.28 : .28 });
  }
  if (beat === 0 || beat === 8 || (section === 1 && beat === 11)) events.push({ kind: 'kick' });
  if (beat === 4 || beat === 12) events.push({ kind: 'snare' });
  if (beat % 2 === 0 || (section === 3 && beat >= 12)) {
    events.push({ kind: 'hat', open: beat === 14 && bar % 2 === 1 });
  }
  // Lead enters after the first eight bars; a quieter bridge changes the texture.
  if (section !== 0 && beat % 2 === 0) {
    const note = track.melody[(bar % 8 * 4 + beat / 4 | 0) % track.melody.length];
    if (note !== null && (section !== 2 || beat % 4 === 0)) {
      events.push({ kind: 'lead', note, length: section === 2 ? 3.2 : 1.8, soft: section === 2 });
    }
  }
  return events;
}

export function createRadio(options = {}) {
  const Audio = options.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const interval = options.setInterval ?? globalThis.setInterval.bind(globalThis);
  const cancelInterval = options.clearInterval ?? globalThis.clearInterval.bind(globalThis);
  let context, mix, master, delay, noise;
  let timer = null, enabled = false, paused = false, trackIndex = 0;
  let step = 0, nextTime = 0, generation = 0;
  let volume = Number.isFinite(options.volume) ? clamp(options.volume, 0, 1) : .38;
  const sources = new Set();

  function connectSource(source, nodes = []) {
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
    return source;
  }

  function makeGraph() {
    if (context) return;
    if (!Audio) throw new Error('Web Audio is unavailable');
    context = new Audio();
    mix = context.createGain();
    master = context.createGain();
    master.gain.value = 0;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 3;
    compressor.attack.value = .008;
    compressor.release.value = .24;
    mix.connect(compressor).connect(master).connect(context.destination);
    delay = context.createDelay(1);
    delay.delayTime.value = 60 / RADIO_TRACKS[trackIndex].bpm * .75;
    const feedback = context.createGain(); feedback.gain.value = .24;
    const wet = context.createGain(); wet.gain.value = .15;
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(mix);
    noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = noise.getChannelData(0);
    let seed = 273105;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = seed / 2147483648 - 1;
    }
  }

  function setGain(target, seconds = .08) {
    if (!master) return;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(target, now, seconds / 3);
  }

  function stopClock() {
    if (timer !== null) { cancelInterval(timer); timer = null; }
    if (!context) return;
    const now = context.currentTime;
    for (const source of sources) {
      try { source.stop(now + .04); } catch { /* A finished one-shot is harmless. */ }
    }
    sources.clear();
    setGain(0, .04);
  }

  function tone(note, when, duration, settings = {}) {
    const nodes = [];
    const source = connectSource(context.createOscillator(), nodes);
    source.type = settings.type || 'triangle';
    source.frequency.setValueAtTime(midi(note), when);
    source.detune.value = settings.detune || 0;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(settings.cutoff || 2100, when);
    filter.Q.value = .55;
    const envelope = context.createGain();
    nodes.push(filter, envelope);
    const attack = Math.min(settings.attack || .015, duration * .3);
    const release = Math.min(settings.release || .14, duration * .65);
    envelope.gain.setValueAtTime(.0001, when);
    envelope.gain.linearRampToValueAtTime(settings.peak || .05, when + attack);
    envelope.gain.setValueAtTime(settings.peak || .05, when + Math.max(attack, duration - release));
    envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(filter).connect(envelope);
    let out = envelope;
    if (settings.pan && context.createStereoPanner) {
      const pan = context.createStereoPanner(); pan.pan.value = settings.pan;
      nodes.push(pan);
      envelope.connect(pan); out = pan;
    }
    out.connect(mix);
    if (settings.echo) out.connect(delay);
    source.start(when); source.stop(when + duration + .02);
  }

  function percussion(kind, when, open = false) {
    if (kind === 'kick') {
      const gain = context.createGain();
      const source = connectSource(context.createOscillator(), [gain]);
      source.frequency.setValueAtTime(138, when);
      source.frequency.exponentialRampToValueAtTime(43, when + .12);
      gain.gain.setValueAtTime(.0001, when);
      gain.gain.linearRampToValueAtTime(.45, when + .004);
      gain.gain.exponentialRampToValueAtTime(.0001, when + .34);
      source.connect(gain).connect(mix);
      source.start(when); source.stop(when + .35);
      return;
    }
    const nodes = [];
    const source = connectSource(context.createBufferSource(), nodes); source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = kind === 'snare' ? 'bandpass' : 'highpass';
    filter.frequency.value = kind === 'snare' ? 2300 : 7200;
    filter.Q.value = kind === 'snare' ? .6 : .7;
    const envelope = context.createGain();
    nodes.push(filter, envelope);
    const length = kind === 'snare' ? .16 : open ? .23 : .045;
    envelope.gain.setValueAtTime(.0001, when);
    envelope.gain.linearRampToValueAtTime(kind === 'snare' ? .19 : open ? .055 : .04, when + .002);
    envelope.gain.exponentialRampToValueAtTime(.0001, when + length);
    source.connect(filter).connect(envelope).connect(mix);
    source.start(when); source.stop(when + length + .01);
    if (kind === 'snare') tone(50, when, .09, { peak: .035, cutoff: 1100 });
  }

  function schedule() {
    if (!enabled || paused || !context || context.state !== 'running') return;
    const stepLength = 60 / RADIO_TRACKS[trackIndex].bpm / 4;
    // A throttled background tab never produces a burst of missed notes.
    if (nextTime < context.currentTime - .15) nextTime = context.currentTime + .03;
    while (nextTime < context.currentTime + .13) {
      for (const event of scoreStep(trackIndex, step)) {
        const duration = (event.length || 1) * stepLength;
        if (event.kind === 'pad') {
          for (const note of event.notes) {
            tone(note, nextTime, duration, { type: 'sawtooth', peak: .019, attack: .24, release: .7, cutoff: 1000, detune: -5, pan: -.35, echo: true });
            tone(note, nextTime, duration, { type: 'triangle', peak: .023, attack: .24, release: .7, cutoff: 1500, detune: 5, pan: .35 });
          }
        } else if (event.kind === 'bass') {
          tone(event.note, nextTime, duration, { type: 'sawtooth', peak: .1, cutoff: 360, release: .09 });
          tone(event.note, nextTime, duration, { type: 'sine', peak: .08, cutoff: 600, release: .09 });
        } else if (event.kind === 'arp') {
          tone(event.note, nextTime, duration, { peak: .045, attack: .006, cutoff: 2400, pan: event.pan, echo: true });
        } else if (event.kind === 'lead') {
          tone(event.note, nextTime, duration, { type: 'triangle', peak: event.soft ? .028 : .045, attack: .025, release: .17, cutoff: 3200, echo: true });
        } else percussion(event.kind, nextTime, event.open);
      }
      nextTime += stepLength;
      step = (step + 1) % 512;
    }
  }

  function startClock() {
    if (timer !== null || !enabled || paused || context?.state !== 'running') return;
    const now = context.currentTime;
    nextTime = now + .06;
    // Let voices from a previous station fade out before the next one arrives.
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + .035);
    master.gain.setTargetAtTime(volume, now + .05, .08);
    schedule();
    timer = interval(schedule, 25);
  }

  async function start() {
    const attempt = ++generation;
    enabled = true;
    try {
      makeGraph();
      // resume is invoked before the first await, preserving the click gesture.
      const unlocking = context.resume();
      await unlocking;
      if (attempt !== generation || !enabled) return false;
      if (context.state !== 'running') throw new Error('Audio is suspended');
      startClock();
      return true;
    } catch {
      if (attempt === generation) { enabled = false; stopClock(); }
      return false;
    }
  }

  return {
    get enabled() { return enabled; },
    get trackLabel() { return RADIO_TRACKS[trackIndex].title; },
    get trackIndex() { return trackIndex; },
    get supported() { return Boolean(Audio); },
    start,
    async toggle() {
      if (enabled) { generation++; enabled = false; stopClock(); return false; }
      return start();
    },
    async nextTrack() {
      generation++;
      stopClock(); step = 0;
      trackIndex = (trackIndex + 1) % RADIO_TRACKS.length;
      if (delay) delay.delayTime.value = 60 / RADIO_TRACKS[trackIndex].bpm * .75;
      return enabled ? start() : false;
    },
    setPaused(value) {
      const next = Boolean(value);
      if (paused === next) return;
      paused = next;
      if (paused) stopClock();
      else if (enabled && context) {
        // Visibility restoration can leave iOS audio suspended. A later gesture
        // can unlock it; rejection is contained and does not affect driving.
        try {
          const unlocking = context.resume();
          Promise.resolve(unlocking).then(startClock).catch(() => {});
        } catch { /* A future explicit play gesture can retry. */ }
      }
    },
    setVolume(value) {
      if (!Number.isFinite(value)) return;
      volume = clamp(value, 0, 1);
      if (enabled && !paused) setGain(volume);
    },
    dispose() {
      generation++; enabled = false; stopClock();
      if (context) { Promise.resolve(context.close()).catch(() => {}); context = undefined; }
    },
  };
}
