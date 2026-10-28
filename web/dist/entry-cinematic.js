/** Real-time entry camera sequence. No movie download or second audio source. */
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);

export class EntryCinematic {
  constructor() { this.playing = false; this.elapsed = 0; }

  start({ x = 13, z = 30, ground = .22, quick = false, reducedMotion = false } = {}) {
    this.anchor = { x, z, ground };
    this.still = quick || reducedMotion;
    this.duration = this.still ? .65 : 7.8;
    this.elapsed = 0;
    this.playing = true;
    return this.frame();
  }

  update(dt) {
    if (!this.playing) return null;
    this.elapsed = Math.min(this.duration, this.elapsed + clamp(Number.isFinite(dt) ? dt : 0, 0, .1));
    if (this.elapsed >= this.duration - 1e-8) { this.playing = false; return null; }
    return this.frame();
  }

  skip() {
    if (this.playing) this.elapsed = Math.max(this.elapsed, this.duration - .32);
  }

  cancel() { this.playing = false; }

  frame() {
    if (!this.playing) return null;
    const time = this.elapsed, { x, z, ground } = this.anchor;
    if (this.still) return { camera: null, target: null, fov: 55, fade: 1 - smooth(time / this.duration), progress: time / this.duration, title: '故事继续', subtitle: 'YOUR CITY · YOUR WAY', shot: -1 };
    // Both opening camera paths remain on the open, eastern side of the
    // boulevard. The final shot arrives behind the walking character.
    const shots = [
      { start: 0, end: 2.65, from: [61, 33, 91], to: [48, 27, 62], lookFrom: [-24, 7, -28], lookTo: [-32, 7, -17], title: '日落海岸', subtitle: 'SUNSET COAST · 20:48', fov: 58 },
      { start: 2.65, end: 5.15, from: [20, 5.5, 61], to: [16, 4.2, 44], lookFrom: [-35, 7, 38], lookTo: [-36, 7, 30], title: '每条街，都有故事', subtitle: 'OCEAN DRIVE', fov: 49 },
      { start: 5.15, end: 7.8, from: [14.4, 3.6, 39], to: [12.52, 2.60, 34.68], lookFrom: [13, 1.55, 29], lookTo: [13, 1.55, 28.6], title: '从这里开始', subtitle: 'WALK · DRIVE · EXPLORE', fov: 55 },
    ];
    const index = time < 2.65 ? 0 : time < 5.15 ? 1 : 2;
    const shot = shots[index], t = smooth((time - shot.start) / (shot.end - shot.start));
    const offset = point => [point[0] + x - 13, point[1] + ground - .22, point[2] + z - 30];
    const fadeIn = 1 - smooth(time / .55);
    const fadeOut = smooth((time - (this.duration - .45)) / .45);
    const cutFade = Math.max(...[2.65, 5.15].map(cut => 1 - smooth(Math.abs(time - cut) / .14)));
    return { camera: offset(mix(shot.from, shot.to, t)), target: offset(mix(shot.lookFrom, shot.lookTo, t)), fov: shot.fov, fade: Math.max(fadeIn, fadeOut, cutFade), progress: time / this.duration, title: shot.title, subtitle: shot.subtitle, shot: index };
  }
}
