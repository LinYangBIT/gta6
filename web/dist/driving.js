/**
 * Deterministic, renderer-independent coastal driving simulation.
 * Units: metres, seconds, radians. +Z is the car's forward direction at yaw 0.
 * `steer: +1` turns left; `steer: -1` turns right. `reverse` is an independent
 * pedal: it brakes forward motion, then backs up. `brake` only stops the car.
 * `checkpoint` is the number collected (and the index of the next target).
 * A completed lap remains visible for 3 seconds before a new lap begins.
 */
export const CHECKPOINTS = Object.freeze([
  { x: 3, z: -25, radius: 6, label: '棕榈大道' },
  { x: 3, z: -85, radius: 6, label: '霓虹街区' },
  { x: 3, z: -155, radius: 6, label: '海岸公路' },
  { x: 3, z: -230, radius: 6, label: '日落尽头' },
  { x: 19, z: -250, radius: 7, label: '海湾掉头' },
  { x: -3, z: 15, radius: 6, label: '返回起点' },
].map(Object.freeze));

export const BOUNDS = Object.freeze({ minX: -5.2, maxX: 28, minZ: -450, maxZ: 58 });
export const PARKED_CARS = Object.freeze([
  Object.freeze({ x: -4.5, z: -18, radius: 1.6 }),
  Object.freeze({ x: 4.8, z: -40, radius: 1.6 }),
]);

// Road lanes clear the parked cars. Broad beach-side turns make a real loop.
const CRUISE_PATH = [
  [1, 12], [1, -25], [1, -85], [1, -155], [1, -230], [1, -246],
  [4, -255], [10, -259], [16, -256], [19, -250], [19, -234],
  [14, -205], [6, -183], [-1, -160], [-1, -85], [-1, -25], [-1, 15],
  [-1, 30], [2, 38], [8, 42], [14, 39], [18, 32], [17, 23], [12, 12], [4, 0],
];
const WHEEL_RADIUS = 0.43;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export const wrapAngle = value => ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;

function sweptDistance(x, z, px, pz, tx, tz) {
  const dx = x - px, dz = z - pz;
  const denominator = dx * dx + dz * dz;
  const t = denominator > 0 ? clamp(((tx - px) * dx + (tz - pz) * dz) / denominator, 0, 1) : 0;
  return Math.hypot(px + dx * t - tx, pz + dz * t - tz);
}

export class DrivingSimulation {
  constructor({ bestTime = 0 } = {}) {
    this.state = { bestTime: Math.max(0, finite(bestTime)) };
    this.reset();
  }

  /** Reset the car and current route; preserve the best time. */
  reset() {
    const bestTime = this.state.bestTime || 0;
    Object.assign(this.state, {
      x: 3, z: 30, yaw: Math.PI, speed: 0, steering: 0, wheelAngle: 0,
      distance: 0, checkpoint: 0, total: CHECKPOINTS.length, lapTime: 0,
      bestTime, completed: false, completedLaps: 0, cruising: false,
      collision: false, cameraBump: 0, surface: 'road', running: false,
    });
    this._motionYaw = Math.PI;
    this._completionRemaining = 0;
    this._cruiseIndex = 0;
    return this.state;
  }

  /** Cruise drives the same physical vehicle; it never teleports. */
  setCruise(enabled) {
    const wasCruising = this.state.cruising;
    this.state.cruising = Boolean(enabled);
    if (enabled && !wasCruising) {
      const { x, z, yaw } = this.state;
      let bestScore = Infinity;
      for (let i = 0; i < CRUISE_PATH.length; i++) {
        const [tx, tz] = CRUISE_PATH[i];
        const distance = Math.hypot(tx - x, tz - z);
        const angle = Math.abs(wrapAngle(Math.atan2(tx - x, tz - z) - yaw));
        const score = distance + angle * 18;
        if (score < bestScore) { bestScore = score; this._cruiseIndex = i; }
      }
      this.state.running = true;
    }
    return this.state;
  }

  /** Advance at most 0.1 seconds; large tab-resume gaps cannot fling the car. */
  update(dt, input = {}) {
    dt = clamp(finite(dt), 0, 0.1);
    if (!dt) return this.state;
    this.state.collision = false;
    const normalized = {
      throttle: clamp(finite(input.throttle), 0, 1),
      brake: clamp(finite(input.brake), 0, 1),
      reverse: clamp(finite(input.reverse), 0, 1),
      steer: clamp(finite(input.steer), -1, 1),
      handbrake: Boolean(input.handbrake),
    };
    const count = Math.max(1, Math.ceil(dt * 120));
    const step = dt / count;
    for (let i = 0; i < count; i++) {
      this._step(step, this.state.cruising ? this._cruiseInput() : normalized);
    }
    return this.state;
  }

  _cruiseInput() {
    const s = this.state;
    let target = CRUISE_PATH[this._cruiseIndex];
    const previous = CRUISE_PATH[(this._cruiseIndex + CRUISE_PATH.length - 1) % CRUISE_PATH.length];
    const segmentX = target[0] - previous[0], segmentZ = target[1] - previous[1];
    const passed = (s.x - target[0]) * segmentX + (s.z - target[1]) * segmentZ > 0;
    if (Math.hypot(target[0] - s.x, target[1] - s.z) < 3.6 || passed) {
      this._cruiseIndex = (this._cruiseIndex + 1) % CRUISE_PATH.length;
      target = CRUISE_PATH[this._cruiseIndex];
    }
    const error = wrapAngle(Math.atan2(target[0] - s.x, target[1] - s.z) - s.yaw);
    const next = CRUISE_PATH[(this._cruiseIndex + 1) % CRUISE_PATH.length];
    const futureTurn = Math.abs(wrapAngle(Math.atan2(next[0] - target[0], next[1] - target[1]) - s.yaw));
    let desiredSpeed = s.x > 6.5 ? 6.5 : 14;
    if (Math.abs(error) > 0.28 || futureTurn > 0.42) desiredSpeed = Math.min(desiredSpeed, 5);
    if (Math.abs(error) > 1.1) desiredSpeed = 3.2;
    return {
      throttle: clamp((desiredSpeed - s.speed) * 0.55, 0, 1),
      brake: clamp((s.speed - desiredSpeed) * 0.35, 0, 1),
      reverse: 0,
      steer: clamp(error * 2.6, -1, 1),
      handbrake: false,
    };
  }

  _step(dt, input) {
    const s = this.state;
    const previousX = s.x, previousZ = s.z;
    const wasBeach = s.x > 6.5;
    s.surface = wasBeach ? 'beach' : 'road';
    s.cameraBump *= Math.exp(-8 * dt);
    if (input.throttle > 0.01 || input.reverse > 0.01 || s.cruising) s.running = true;

    if (s.completed) {
      this._completionRemaining -= dt;
      if (this._completionRemaining <= 0) {
        s.completed = false;
        s.checkpoint = 0;
        s.lapTime = 0;
      }
    } else if (s.running) {
      s.lapTime += dt;
    }

    const oldSpeed = s.speed;
    // Brakes always win over a held accelerator. This also makes multi-touch
    // transitions predictable: neither brake pedal can accidentally select R.
    const drive = input.brake || input.handbrake ? 0 : input.throttle - input.reverse;
    const opposingMotion = drive * s.speed < -0.05;
    const power = opposingMotion ? 18 : drive < 0 ? 6.5 : wasBeach ? 5.5 : 9.5;
    let acceleration = drive * power;
    acceleration -= Math.sign(s.speed) * (input.brake * 21 + (input.handbrake ? 24 : 0));
    const drag = (wasBeach ? 1.7 : 0.65) + Math.abs(s.speed) * 0.04 + s.speed * s.speed * 0.004;
    if (Math.abs(s.speed) > 0.005) acceleration -= Math.sign(s.speed) * drag;
    s.speed += acceleration * dt;
    if (!drive && Math.sign(oldSpeed) !== Math.sign(s.speed)) s.speed = 0;
    s.speed = clamp(s.speed, -6, wasBeach ? 18 : 42);
    if (!drive && Math.abs(s.speed) < 0.035) s.speed = 0;

    // A quicker, wider low-speed rack lets a thumb pad make a U-turn without
    // requiring racing speed; the existing high-speed taper keeps it stable.
    const steeringLimit = 0.62 + 0.16 * Math.exp(-Math.abs(s.speed) / 8);
    const steeringTarget = input.steer * steeringLimit / (1 + Math.abs(s.speed) / 32);
    s.steering += (steeringTarget - s.steering) * (1 - Math.exp(-12 * dt));
    const yawRate = clamp(s.speed / 2.65 * Math.tan(s.steering) * (input.handbrake ? 1.25 : 1), -1.4, 1.4);
    s.yaw = wrapAngle(s.yaw + yawRate * dt);
    const grip = input.handbrake && Math.abs(s.speed) > 4 ? 2.1 : (wasBeach ? 5 : 13);
    this._motionYaw = wrapAngle(this._motionYaw + wrapAngle(s.yaw - this._motionYaw) * (1 - Math.exp(-grip * dt)));
    s.x += Math.sin(this._motionYaw) * s.speed * dt;
    s.z += Math.cos(this._motionYaw) * s.speed * dt;

    if ((s.x > 6.5) !== wasBeach) {
      s.speed *= 0.72;
      s.cameraBump = Math.max(s.cameraBump, 0.18);
    }
    const constrainedX = clamp(s.x, BOUNDS.minX, BOUNDS.maxX);
    const constrainedZ = clamp(s.z, BOUNDS.minZ, BOUNDS.maxZ);
    if (constrainedX !== s.x || constrainedZ !== s.z) {
      s.cameraBump = Math.max(s.cameraBump, Math.min(1, Math.abs(s.speed) / 15));
      s.x = constrainedX;
      s.z = constrainedZ;
      s.speed *= -0.08;
      s.collision = true;
    }
    for (const obstacle of PARKED_CARS) {
      const dx = s.x - obstacle.x, dz = s.z - obstacle.z;
      const distance = Math.hypot(dx, dz);
      const minimum = obstacle.radius + 1.15;
      if (distance >= minimum) continue;
      const nx = distance > 0.001 ? dx / distance : -Math.sin(s.yaw);
      const nz = distance > 0.001 ? dz / distance : -Math.cos(s.yaw);
      s.x = obstacle.x + nx * (minimum + 0.01);
      s.z = obstacle.z + nz * (minimum + 0.01);
      const approach = (Math.sin(this._motionYaw) * nx + Math.cos(this._motionYaw) * nz) * s.speed;
      if (approach < 0) {
        s.cameraBump = Math.max(s.cameraBump, Math.min(1, Math.abs(s.speed) / 15));
        s.speed *= -0.1;
      }
      s.collision = true;
    }
    // Collision separation must not push the car outside the drivable world.
    s.x = clamp(s.x, BOUNDS.minX, BOUNDS.maxX);
    s.z = clamp(s.z, BOUNDS.minZ, BOUNDS.maxZ);
    const travelled = Math.hypot(s.x - previousX, s.z - previousZ);
    s.distance += travelled;
    s.wheelAngle += Math.sign(oldSpeed || s.speed) * travelled / WHEEL_RADIUS;

    if (!s.completed && s.running) {
      const checkpoint = CHECKPOINTS[s.checkpoint];
      if (checkpoint && sweptDistance(s.x, s.z, previousX, previousZ, checkpoint.x, checkpoint.z) <= checkpoint.radius) {
        s.checkpoint++;
        if (s.checkpoint === CHECKPOINTS.length) {
          s.completed = true;
          s.completedLaps++;
          this._completionRemaining = 3;
          if (!s.bestTime || s.lapTime < s.bestTime) s.bestTime = s.lapTime;
        }
      }
    }
  }
}
