import * as THREE from './vendor/three.module.js';

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const UP = new THREE.Vector3(0, 1, 0);

/** Three bounded instance pools; contacts stay in world doubles until upload. */
export function createImpactEffects(scene, options = {}) {
  const mobile = Boolean(options.mobile), reduceMotion = Boolean(options.reduceMotion);
  const Audio = Object.hasOwn(options, 'AudioContext') ? options.AudioContext
    : globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const capacity = mobile ? 160 : 280;
  const group = new THREE.Group(); group.name = 'Collision sparks, dust and debris';
  scene.add(group);
  const pools = [
    new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({color: '#ffd48a', toneMapped: false}), capacity),
    new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({color: '#9ca6ad', transparent: true, opacity: .18, depthWrite: false}), Math.ceil(capacity / 3)),
    new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({color: '#344457', roughness: .85, metalness: .2}), Math.ceil(capacity / 4)),
  ];
  pools.forEach((pool, index) => { pool.name = ['Sparks', 'Impact dust', 'Small debris'][index]; pool.count = 0; pool.frustumCulled = false; pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(pool); });
  const particles = Array.from({length: capacity}, () => ({life: 0}));
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const seen = new Set(), seenOrder = [];
  let cursor = 0, elapsed = 0, shake = 0, disposed = false, active = true;
  let context, master, noiseBuffer, unlocked = false, generation = 0, audioEnabled = true, lastSound = -Infinity;
  const voices = new Set();

  function release(voice) {
    if (!voices.delete(voice)) return;
    for (const node of voice.sources) { try { node.stop(); } catch {} }
    for (const node of voice.nodes) { try { node.disconnect(); } catch {} }
  }
  function silence() { for (const voice of [...voices]) release(voice); }
  function setAudio(enabled) {
    audioEnabled = Boolean(enabled);
    if (master) master.gain.setTargetAtTime(active && audioEnabled ? .65 : 0, context.currentTime, .015);
    if (!active || !audioEnabled) silence();
  }
  async function startAudio() {
    if (disposed || typeof Audio !== 'function') return false;
    const ticket = ++generation;
    try {
      if (!context) {
        context = new Audio(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
        noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * .4), context.sampleRate);
        const data = noiseBuffer.getChannelData(0); let random = 731;
        for (let i = 0; i < data.length; i++) { random = Math.imul(random, 1664525) + 1013904223 | 0; data[i] = ((random >>> 0) / 2147483648 - 1) * (1 - i / data.length); }
      }
      const promise = context.resume(); // Remain inside the user's enter gesture.
      await promise;
      if (disposed || ticket !== generation) return false;
      unlocked = context.state === 'running'; setAudio(audioEnabled); return unlocked;
    } catch { if (!disposed && ticket === generation) unlocked = false; return false; }
  }
  function sound(strength, proximity) {
    if (!unlocked || !audioEnabled || !active || context?.state !== 'running' || voices.size >= 6) return;
    const time = context.currentTime;
    if (time - lastSound < .075) return;
    lastSound = time;
    const power = clamp(strength * proximity, 0, 1);
    if (power < .015) return;
    const thud = context.createOscillator(), noise = context.createBufferSource(), thudGain = context.createGain(), noiseGain = context.createGain(), filter = context.createBiquadFilter();
    thud.type = 'sine'; thud.frequency.setValueAtTime(85 + strength * 45, time); thud.frequency.exponentialRampToValueAtTime(33, time + .18);
    thudGain.gain.setValueAtTime(Math.max(.0001, .10 * power), time); thudGain.gain.exponentialRampToValueAtTime(.0001, time + .24);
    noise.buffer = noiseBuffer; filter.type = 'bandpass'; filter.frequency.value = 550 + strength * 1200; filter.Q.value = .5;
    noiseGain.gain.setValueAtTime(Math.max(.0001, .055 * power), time); noiseGain.gain.exponentialRampToValueAtTime(.0001, time + .30);
    thud.connect(thudGain).connect(master); noise.connect(filter).connect(noiseGain).connect(master);
    const voice = { sources: [thud, noise], nodes: [thud, noise, thudGain, noiseGain, filter], end: time + .34 };
    voices.add(voice); noise.onended = () => release(voice);
    thud.start(time); noise.start(time); thud.stop(time + .26); noise.stop(time + .32);
  }
  function emit(events = [], {enabled = true, listener = null} = {}) {
    if (disposed || !active) return;
    setAudio(enabled);
    for (const event of events.slice(0, 12)) {
      if (!Number.isFinite(event?.x) || !Number.isFinite(event?.z)) continue;
      if (event.id != null) {
        if (seen.has(event.id)) continue;
        seen.add(event.id); seenOrder.push(event.id);
        if (seenOrder.length > 128) seen.delete(seenOrder.shift());
      }
      const strength = clamp(finite(event.strength, finite(event.speed) / 18), 0, 1);
      if (strength < .015) continue;
      const altitude = Math.max(0, finite(event.altitude));
      const distance = listener ? Math.hypot(event.x - finite(listener.x), event.z - finite(listener.z), altitude - finite(listener.altitude)) : 0;
      const proximity = Math.max(0, 1 - distance / 48);
      shake = Math.max(shake, reduceMotion ? 0 : strength * proximity);
      sound(strength, proximity);
      let random = ((event.id ?? elapsed * 1000) | 0) + 17;
      const rand = () => { random = Math.imul(random, 1664525) + 1013904223 | 0; return (random >>> 0) / 4294967296; };
      const count = Math.ceil((reduceMotion ? 5 : 9) + strength * (mobile ? 14 : 24));
      const nx = finite(event.nx), nz = finite(event.nz);
      for (let i = 0; i < count; i++) {
        const p = particles[cursor++ % capacity], type = i % 6 === 0 ? 1 : i % 5 === 0 ? 2 : 0;
        const angle = rand() * Math.PI * 2, velocity = (1.5 + rand() * 5) * (.35 + strength);
        const life = type === 1 ? .75 + rand() * .35 : .22 + rand() * .48;
        Object.assign(p, { x: event.x, y: .55 + altitude, z: event.z, vx: Math.cos(angle) * velocity + nx * strength * 2, vy: 1.2 + rand() * 3.5, vz: Math.sin(angle) * velocity + nz * strength * 2,
          life, maxLife: life, type, size: type === 1 ? .20 + rand() * .22 : type === 2 ? .035 + rand() * .065 : .018 + rand() * .023, angle, spin: (rand() - .5) * 18, floor: .06 });
      }
    }
  }
  function update(dt, origin = {}, state = {}) {
    if (disposed) return;
    active = state.active !== false; setAudio(state.enabled !== false);
    if (!active) { clear(); return; }
    dt = clamp(finite(dt), 0, .1); elapsed += dt; shake *= Math.exp(-11 * dt);
    for (const voice of [...voices]) if (context.currentTime >= voice.end) release(voice);
    pools.forEach(pool => { pool.count = 0; });
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      const dust = p.type === 1;
      p.vy -= (dust ? 1.5 : 10) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; p.vy = Math.abs(p.vy) * .18; p.vx *= .75; p.vz *= .75; }
      const pool = pools[p.type]; if (pool.count >= pool.instanceMatrix.count) continue;
      const fade = p.life / p.maxLife, size = p.size * (dust ? 1 + (1 - fade) * 3 : fade);
      position.set(p.x - finite(origin.x), p.y, p.z - finite(origin.z));
      quaternion.setFromAxisAngle(UP, p.angle + elapsed * p.spin);
      scale.set(size, size * (dust ? .65 : p.type === 0 ? 3.5 : 1), size);
      matrix.compose(position, quaternion, scale); pool.setMatrixAt(pool.count++, matrix);
    }
    for (const pool of pools) pool.instanceMatrix.needsUpdate = true;
  }
  function getShake() {
    if (reduceMotion || !active || disposed) return {x: 0, y: 0, roll: 0};
    return {x: Math.sin(elapsed * 91) * shake * .10, y: Math.sin(elapsed * 117 + .8) * shake * .065, roll: Math.sin(elapsed * 77) * shake * .006};
  }
  function clear() {
    shake = 0; for (const p of particles) p.life = 0;
    pools.forEach(pool => { pool.count = 0; }); silence(); seen.clear(); seenOrder.length = 0;
  }
  return {
    group, pools, capacity, startAudio, emit, update, getShake, clear,
    get stats() { return {particles: particles.filter(p => p.life > 0).length, voices: voices.size, seenEvents: seen.size, drawCalls: 3}; },
    dispose() {
      if (disposed) return; clear(); disposed = true; generation++; unlocked = false;
      pools.forEach(pool => { pool.dispose(); pool.geometry.dispose(); pool.material.dispose(); }); group.removeFromParent();
      try { master?.disconnect(); Promise.resolve(context?.close()).catch(() => {}); } catch {}
    },
  };
}
