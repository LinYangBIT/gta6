/**
 * Renderer-independent driving on a deterministic, unbounded city street grid.
 * World coordinates stay in double precision; rendering owns its floating origin.
 * +Z is forward at yaw 0; positive steering turns left. Brake never reverses.
 */
import { CHUNK_SIZE, collidersNear, districtAt, isRoad } from './world-layout.js?v=9';
import { coastRoadAt, coastRoute } from './coast-layout.js?v=9';

const WHEEL_RADIUS = .43;
const CAR_RADIUS = 1.10;
const CAR_HALF_SPINE = 1.15;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export const wrapAngle = value => ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function routeRandom(seed, index) {
  let hash = (Math.imul(index + 1, 374761393) ^ Math.imul(seed, 668265263)) >>> 0;
  hash = Math.imul(hash ^ hash >>> 13, 1274126177) >>> 0;
  return ((hash ^ hash >>> 16) >>> 0) / 4294967296;
}

function sweptDistance(x, z, px, pz, tx, tz) {
  const dx = x - px, dz = z - pz;
  const denominator = dx * dx + dz * dz;
  const t = denominator > 0 ? clamp(((tx - px) * dx + (tz - pz) * dz) / denominator, 0, 1) : 0;
  return Math.hypot(px + dx * t - tx, pz + dz * t - tz);
}

function segmentClear(a, b, obstacles, clearance = 2.4) {
  for (const rect of obstacles) {
    let low = 0, high = 1;
    for (const [axis, minimum, maximum] of [['x', rect.minX - clearance, rect.maxX + clearance], ['z', rect.minZ - clearance, rect.maxZ + clearance]]) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-8) {
        if (a[axis] < minimum || a[axis] > maximum) { low = 2; break; }
      } else {
        const first = (minimum - a[axis]) / delta, second = (maximum - a[axis]) / delta;
        low = Math.max(low, Math.min(first, second));
        high = Math.min(high, Math.max(first, second));
      }
    }
    if (low <= high && high > .001 && low < .999) return false;
  }
  return true;
}

/** Small local visibility graph: bounded work, no retained exploration history. */
function roadJoinPath(state, seed) {
  const { x, z, yaw } = state;
  if (isRoad(x, z)) return [];
  const left = Math.floor(x / CHUNK_SIZE) * CHUNK_SIZE;
  const top = Math.floor(z / CHUNK_SIZE) * CHUNK_SIZE;
  const obstacles = collidersNear(x, z, seed);
  const nodes = [{ x, z }, { x: left, z }, { x: left + CHUNK_SIZE, z }, { x, z: top }, { x, z: top + CHUNK_SIZE }];
  for (const rect of obstacles) {
    for (const px of [rect.minX - 4.2, rect.maxX + 4.2]) {
      for (const pz of [rect.minZ - 4.2, rect.maxZ + 4.2]) {
        const candidate = { x: px, z: pz };
        if (segmentClear(candidate, candidate, obstacles)) nodes.push(candidate);
      }
    }
  }
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), closed = new Set();
  costs[0] = 0;
  let goal = -1;
  for (let pass = 0; pass < nodes.length; pass++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!closed.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || !Number.isFinite(costs[current])) break;
    if (current > 0 && current <= 4) { goal = current; break; }
    closed.add(current);
    for (let next = 1; next < nodes.length; next++) {
      if (closed.has(next) || !segmentClear(nodes[current], nodes[next], obstacles)) continue;
      const dx = nodes[next].x - nodes[current].x, dz = nodes[next].z - nodes[current].z;
      const turnPenalty = current === 0 ? Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw)) * 8 : 0;
      const cost = costs[current] + Math.hypot(dx, dz) + turnPenalty;
      if (cost < costs[next]) { costs[next] = cost; previous[next] = current; }
    }
  }
  if (goal < 0) return [];
  const path = [];
  for (let cursor = goal; cursor > 0; cursor = previous[cursor]) path.unshift(nodes[cursor]);
  return path;
}

export class DrivingSimulation {
  constructor({ bestTime = 0, seed = 610 } = {}) {
    this.seed = Math.trunc(finite(seed, 610));
    this.state = { bestTime: Math.max(0, finite(bestTime)) };
    this.reset();
  }

  reset() {
    const bestTime = this.state.bestTime || 0;
    Object.assign(this.state, {
      x: 3, z: 30, yaw: Math.PI, speed: 0, steering: 0, wheelAngle: 0,
      distance: 0, checkpoint: 0, total: 0, lapTime: 0, seed: this.seed,
      bestTime, completed: false, completedLaps: 0, cruising: false,
      collision: false, cameraBump: 0, surface: 'road', running: false,
    });
    this._motionYaw = Math.PI;
    this._routeHeading = 0;
    this._horizontalRun = 0;
    this._stuckTime = 0;
    this._recoveryTime = 0;
    this._approach = [];
    this._coastNavigation = false;
    this._setDestination(0, 0);
    return this.state;
  }

  setSeed(seed) {
    this.seed = Math.trunc(finite(seed, 610));
    return this.reset();
  }

  _setDestination(x, z) {
    this.state.destination = { x, z, radius: 6, label: districtAt(x, z, this.seed).label };
  }

  _nextDestination() {
    const current = this.state.destination;
    const chance = routeRandom(this.seed, this.state.checkpoint);
    // A northward expedition with varied east/west side streets keeps opening
    // new districts instead of cycling a finite ring. Manual driving is free.
    if (this._routeHeading === 0 || this._routeHeading === 2) {
      this._routeHeading = chance < .34 ? 3 : chance < .68 ? 1 : 0;
      this._horizontalRun = this._routeHeading === 0 ? 0 : 1;
    } else if (this._horizontalRun >= 2 || chance < .66) {
      this._routeHeading = 0;
      this._horizontalRun = 0;
    } else this._horizontalRun++;
    const [dx, dz] = directions[this._routeHeading];
    this._setDestination(current.x + dx * CHUNK_SIZE, current.z + dz * CHUNK_SIZE);
  }

  /** Join a nearby connected street before continuing the same physical car. */
  setCruise(enabled) {
    const s = this.state;
    const entering = Boolean(enabled) && !s.cruising;
    s.cruising = Boolean(enabled);
    if (entering) {
      this._joinLocalRoad();
      this._horizontalRun = 0;
      this._stuckTime = 0;
      this._recoveryTime = 0;
      s.running = true;
    }
    return s;
  }

  _joinLocalRoad() {
    const s = this.state;
    if (coastRoadAt(s.x, s.z) !== null) {
      const path = coastRoute(s, { x: 0, z: -512 });
      if (path?.length) {
        this._approach = path.map(point => ({ x: point.x, z: point.z }));
        this._approach.push({ x: 0, z: -548 });
        this._coastNavigation = true;
        this._routeHeading = 0;
        this._setDestination(0, -640);
        return;
      }
    }
    this._coastNavigation = false;
    this._approach = roadJoinPath(s, this.seed);
    const join = this._approach.at(-1) || s;
    const gx = Math.round(join.x / CHUNK_SIZE) * CHUNK_SIZE;
    const gz = Math.round(join.z / CHUNK_SIZE) * CHUNK_SIZE;
    const vertical = Math.abs(join.x - gx) < Math.abs(join.z - gz);
    if (vertical) {
      const dz = Math.cos(s.yaw) > 0 ? 1 : -1;
      let targetZ = (dz > 0 ? Math.ceil(join.z / CHUNK_SIZE) : Math.floor(join.z / CHUNK_SIZE)) * CHUNK_SIZE;
      if (Math.abs(targetZ - join.z) < 8) targetZ += dz * CHUNK_SIZE;
      this._routeHeading = dz < 0 ? 0 : 2;
      this._setDestination(gx, targetZ);
    } else {
      const dx = Math.sin(s.yaw) > 0 ? 1 : -1;
      let targetX = (dx > 0 ? Math.ceil(join.x / CHUNK_SIZE) : Math.floor(join.x / CHUNK_SIZE)) * CHUNK_SIZE;
      if (Math.abs(targetX - join.x) < 8) targetX += dx * CHUNK_SIZE;
      this._routeHeading = dx > 0 ? 1 : 3;
      this._setDestination(targetX, gz);
    }
  }

  update(dt, input = {}) {
    dt = clamp(finite(dt), 0, .1);
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
    for (let i = 0; i < count; i++) this._step(step, this.state.cruising ? this._cruiseInput(step) : normalized);
    return this.state;
  }

  _cruiseInput(dt) {
    const s = this.state;
    if (this._approach.length && Math.hypot(this._approach[0].x - s.x, this._approach[0].z - s.z) < 3) this._approach.shift();
    const target = this._approach[0] || s.destination;
    const distance = Math.hypot(target.x - s.x, target.z - s.z);
    const error = wrapAngle(Math.atan2(target.x - s.x, target.z - s.z) - s.yaw);
    if (this._recoveryTime > 0) {
      this._recoveryTime -= dt;
      if (this._recoveryTime <= 0) this._joinLocalRoad();
      return { throttle: 0, brake: 0, reverse: .65, steer: -Math.sign(error || 1), handbrake: false };
    }
    if (Math.abs(s.speed) < .5) this._stuckTime += dt;
    else this._stuckTime = 0;
    if (this._stuckTime > 2.5) { this._recoveryTime = 1.1; this._stuckTime = 0; }
    let desiredSpeed = this._coastNavigation && this._approach.length ? 8 : Math.min(17, 4.5 + Math.max(0, distance - 7) * .40);
    if (this._approach.length) desiredSpeed = Math.min(desiredSpeed, this._coastNavigation ? 8 : 5);
    if (Math.abs(error) > .2) desiredSpeed = Math.min(desiredSpeed, 9);
    if (Math.abs(error) > .55) desiredSpeed = Math.min(desiredSpeed, 4.5);
    if (Math.abs(error) > 1.15) desiredSpeed = 3.2;
    return {
      throttle: clamp((desiredSpeed - s.speed) * .60, 0, 1),
      brake: clamp((s.speed - desiredSpeed) * .4, 0, 1),
      reverse: 0, steer: clamp(error * 2.6, -1, 1), handbrake: false,
    };
  }

  _collide() {
    const s = this.state;
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    for (const rect of collidersNear(s.x, s.z, this.seed)) {
      for (const offset of [-CAR_HALF_SPINE, CAR_HALF_SPINE]) {
        const px = s.x + fx * offset, pz = s.z + fz * offset;
        const closestX = clamp(px, rect.minX, rect.maxX), closestZ = clamp(pz, rect.minZ, rect.maxZ);
        let nx = px - closestX, nz = pz - closestZ;
        const distance = Math.hypot(nx, nz);
        if (distance >= CAR_RADIUS) continue;
        let separation;
        if (distance > .0001) {
          nx /= distance; nz /= distance;
          separation = CAR_RADIUS - distance + .001;
        } else {
          const sides = [
            { gap: px - rect.minX, nx: -1, nz: 0 }, { gap: rect.maxX - px, nx: 1, nz: 0 },
            { gap: pz - rect.minZ, nx: 0, nz: -1 }, { gap: rect.maxZ - pz, nx: 0, nz: 1 },
          ];
          const side = sides.reduce((a, b) => a.gap < b.gap ? a : b);
          nx = side.nx; nz = side.nz; separation = side.gap + CAR_RADIUS + .001;
        }
        s.x += nx * separation; s.z += nz * separation;
        const approach = (Math.sin(this._motionYaw) * nx + Math.cos(this._motionYaw) * nz) * s.speed;
        if (approach < 0) {
          s.cameraBump = Math.max(s.cameraBump, Math.min(1, Math.abs(s.speed) / 15));
          s.speed *= -.08;
        }
        s.collision = true;
      }
    }
  }

  _step(dt, input) {
    const s = this.state;
    const previousX = s.x, previousZ = s.z;
    const wasRoad = isRoad(s.x, s.z);
    s.surface = wasRoad ? 'road' : 'sidewalk';
    s.cameraBump *= Math.exp(-8 * dt);
    if (input.throttle > .01 || input.reverse > .01 || s.cruising) s.running = true;
    if (s.running) s.lapTime += dt;
    const oldSpeed = s.speed;
    const drive = input.brake || input.handbrake ? 0 : input.throttle - input.reverse;
    const opposingMotion = drive * s.speed < -.05;
    const power = opposingMotion ? 18 : drive < 0 ? 6.5 : wasRoad ? 9.5 : 6.5;
    let acceleration = drive * power;
    acceleration -= Math.sign(s.speed) * (input.brake * 21 + (input.handbrake ? 24 : 0));
    const drag = (wasRoad ? .65 : 1.4) + Math.abs(s.speed) * .04 + s.speed * s.speed * .004;
    if (Math.abs(s.speed) > .005) acceleration -= Math.sign(s.speed) * drag;
    s.speed += acceleration * dt;
    if (!drive && Math.sign(oldSpeed) !== Math.sign(s.speed)) s.speed = 0;
    s.speed = clamp(s.speed, -6, wasRoad ? 42 : 20);
    if (!drive && Math.abs(s.speed) < .035) s.speed = 0;
    const speed = Math.abs(s.speed);
    // A thumbstick has useful travel around centre; a digital key takes time
    // to build steering lock. Keep the route controller's calibrated response.
    const amount = Math.abs(input.steer);
    const progressiveInput = Math.sign(input.steer) * amount * (.4 + .6 * amount);
    const steeringLimit = s.cruising
      ? (.62 + .16 * Math.exp(-speed / 8)) / (1 + speed / 32)
      : .72 / (1 + speed / 18 + speed * speed / 145);
    const steeringTarget = (s.cruising ? input.steer : progressiveInput) * steeringLimit;
    const returning = Math.abs(steeringTarget) < Math.abs(s.steering) || steeringTarget * s.steering < 0;
    const steeringResponse = s.cruising ? 12 : returning ? 9 : 4.6;
    s.steering += (steeringTarget - s.steering) * (1 - Math.exp(-steeringResponse * dt));
    // High-speed full lock should make a sweeping bend, not whip the car
    // sideways. Reverse keeps the same wheel direction and opposite yaw.
    const yawLimit = s.cruising ? 1.4 : Math.min(1.05, (input.handbrake ? 9.2 : 7.2) / Math.max(speed, 1));
    const yawRate = clamp(s.speed / 2.65 * Math.tan(s.steering) * (input.handbrake ? 1.25 : 1), -yawLimit, yawLimit);
    s.yaw = wrapAngle(s.yaw + yawRate * dt);
    const grip = input.handbrake && Math.abs(s.speed) > 4 ? 2.1 : wasRoad ? 13 : 8;
    this._motionYaw = wrapAngle(this._motionYaw + wrapAngle(s.yaw - this._motionYaw) * (1 - Math.exp(-grip * dt)));
    s.x += Math.sin(this._motionYaw) * s.speed * dt;
    s.z += Math.cos(this._motionYaw) * s.speed * dt;
    if (isRoad(s.x, s.z) !== wasRoad) s.cameraBump = Math.max(s.cameraBump, .10);
    this._collide();
    const travelled = Math.hypot(s.x - previousX, s.z - previousZ);
    s.distance += travelled;
    s.wheelAngle += Math.sign(oldSpeed || s.speed) * travelled / WHEEL_RADIUS;
    const target = s.destination;
    if (s.running && sweptDistance(s.x, s.z, previousX, previousZ, target.x, target.z) <= target.radius) {
      s.checkpoint++;
      this._approach = [];
      this._nextDestination();
    }
  }
}
