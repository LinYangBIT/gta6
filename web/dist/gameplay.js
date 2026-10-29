/** On-foot exploration and transferable cars; no rendering or browser dependency. */
import { vehicleSpec } from './vehicle-specs.js?v=12';
import { DrivingSimulation, wrapAngle } from './driving.js?v=12';
import { CHUNK_SIZE, collidersNear, generateChunk, hashCoordinates, isRoad } from './world-layout.js?v=12';

export const VEHICLE_HISTORY_LIMIT = 64;
export const VEHICLE_INTERACT_RADIUS = 6.5;
export const WALK_RADIUS = .34;
const PALETTE = ['#246f87', '#772c63', '#526783', '#202b43', '#31538e', '#c68545', '#67538b', '#b6c5cf'];
const KINDS = ['coupe', 'sedan', 'suv', 'bicycle', 'truck'];
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function makeVehicle(cx, cz, slot, seed, parking = null) {
  const hash = hashCoordinates('vehicle', cx, cz, slot, seed);
  const hero = cx === 0 && cz === 0 && slot === 0;
  const side = slot < 2 ? 1 : -1;
  const kind = parking?.kind || (hero ? 'coupe' : cx === 0 && cz === 0 && slot === 1 ? 'bicycle'
    : cx === -1 && cz === 0 && slot === 0 ? 'truck' : cx === 0 && cz === 1 && slot === 0 ? 'helicopter'
      : KINDS[hash % KINDS.length]);
  return {
    id: `${cx},${cz}/car/${slot}`, homeChunk: `${cx},${cz}`,
    x: parking?.x ?? cx * CHUNK_SIZE + side * 7,
    z: parking?.z ?? cz * CHUNK_SIZE + [30, 78, 46, 102][slot],
    yaw: parking?.yaw ?? (side > 0 ? Math.PI : 0), kind, label: vehicleSpec(kind).label,
    color: hero ? PALETTE[0] : PALETTE[(hash >>> 7) % PALETTE.length],
    speed: 0, steering: 0, wheelAngle: 0, modified: false,
    altitude: 0, verticalSpeed: 0, vx: 0, vz: 0, angularVelocity: 0,
  };
}

function capsuleShape(vehicle) { return vehicleSpec(vehicle.kind); }

/** Separation of a circle from the car's oriented capsule footprint. */
function carContact(x, z, radius, car) {
  const shape = capsuleShape(car), fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const along = clamp((x - car.x) * fx + (z - car.z) * fz, -shape.spine, shape.spine);
  let nx = x - car.x - fx * along, nz = z - car.z - fz * along;
  const distance = Math.hypot(nx, nz), overlap = radius + shape.radius - distance;
  if (overlap <= 0) return null;
  if (distance > .00001) { nx /= distance; nz /= distance; }
  else { nx = Math.cos(car.yaw); nz = -Math.sin(car.yaw); }
  return { nx, nz, separation: overlap + .001 };
}

function wallContact(x, z, radius, rect) {
  let nx = x - clamp(x, rect.minX, rect.maxX), nz = z - clamp(z, rect.minZ, rect.maxZ);
  const distance = Math.hypot(nx, nz);
  if (distance >= radius) return null;
  if (distance > .00001) return { nx: nx / distance, nz: nz / distance, separation: radius - distance + .001 };
  const sides = [
    { gap: x - rect.minX, nx: -1, nz: 0 }, { gap: rect.maxX - x, nx: 1, nz: 0 },
    { gap: z - rect.minZ, nx: 0, nz: -1 }, { gap: rect.maxZ - z, nx: 0, nz: 1 },
  ];
  const side = sides.reduce((a, b) => a.gap < b.gap ? a : b);
  return { nx: side.nx, nz: side.nz, separation: side.gap + radius + .001 };
}

export class Gameplay {
  constructor({ seed = 610 } = {}) {
    this.seed = Math.trunc(finite(seed, 610));
    this.sim = new DrivingSimulation({ seed: this.seed });
    this.vehicles = new Map();
    this.vehicleHistory = new Map();
    this.reset();
  }

  get state() { return this.mode === 'drive' ? this.sim.state : this.walk; }
  get activeVehicle() { return this.activeVehicleId ? this.vehicles.get(this.activeVehicleId) || null : null; }

  reset() {
    this.sim.setVehicleKind('coupe');
    this.sim.reset();
    this._impacts = []; this._impactId = 0; this._impactCooldown = new Map(); this._time = 0;
    this.mode = 'walk';
    this.activeVehicleId = null;
    this.walk = { ...this.sim.state, x: 13, z: 30, yaw: Math.PI, surface: 'sidewalk', mode: 'walk' };
    this.vehicles.clear();
    this.vehicleHistory.clear();
    this._streamKey = '';
    this._streamVehicles(true);
    return this.state;
  }

  setSeed(seed) {
    this.seed = Math.trunc(finite(seed, 610));
    this.sim.setSeed(this.seed);
    return this.reset();
  }

  setCruise(enabled) {
    if (this.mode === 'drive') this.sim.setCruise(enabled);
    return this.state;
  }

  drainImpacts() { const events = this._impacts; this._impacts = []; return events; }

  _emitImpact(event, pair) {
    if (!Number.isFinite(event.speed) || event.speed < .8 || (this._impactCooldown.get(pair) ?? -1) > this._time) return;
    this._impactCooldown.set(pair, this._time + .12);
    while (this._impactCooldown.size > 128) this._impactCooldown.delete(this._impactCooldown.keys().next().value);
    this._impacts.push({ ...event, id: ++this._impactId, strength: Math.min(1, event.speed / 18) });
    if (this._impacts.length > 32) this._impacts.shift();
  }

  nearbyVehicle() {
    if (this.mode !== 'walk') return null;
    let nearest = null, best = VEHICLE_INTERACT_RADIUS;
    for (const car of this.vehicles.values()) {
      if (car.altitude > .35 || Math.hypot(car.vx || 0, car.vz || 0) > 2) continue;
      const distance = Math.hypot(car.x - this.walk.x, car.z - this.walk.z);
      if (distance < best) { best = distance; nearest = car; }
    }
    return nearest;
  }

  interact() {
    if (this.mode === 'drive') return this._exitVehicle();
    const car = this.nearbyVehicle();
    if (!car) return { ok: false, message: '靠近任意一辆车，再上车' };
    const progress = this.walk;
    this.sim.setVehicleKind(car.kind);
    this.sim.reset();
    Object.assign(this.sim.state, {
      x: car.x, z: car.z, yaw: car.yaw, speed: 0, steering: car.steering,
      altitude: car.altitude || 0, verticalSpeed: 0, vehicleKind: car.kind,
      wheelAngle: car.wheelAngle, distance: progress.distance, lapTime: progress.lapTime,
      checkpoint: progress.checkpoint, running: true, mode: 'drive',
      surface: isRoad(car.x, car.z) ? 'road' : 'sidewalk',
    });
    this.sim._motionYaw = car.yaw;
    this.sim.setVelocity(car.vx || 0, car.vz || 0);
    this.sim._joinLocalRoad();
    this.activeVehicleId = car.id;
    this.mode = 'drive';
    this._remember(car);
    return { ok: true, message: `已上车 · ${car.label}`, vehicleId: car.id };
  }

  _exitVehicle() {
    const car = this.activeVehicle, s = this.sim.state;
    if (!car) return { ok: false, message: '车辆尚未就绪' };
    if (s.altitude > .35 || Math.abs(s.verticalSpeed) > .5) return { ok: false, message: '先降落到地面，再离开直升机' };
    if (Math.hypot(this.sim.velocity.x, this.sim.velocity.z) > 1.4) return { ok: false, message: '先刹车停稳，再下车' };
    this._syncCar();
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    // Both doors, then the front/back; do not place the player inside a wall.
    const offsets = [[rx * 2.3, rz * 2.3], [-rx * 2.3, -rz * 2.3],
      [fx * 3.7, fz * 3.7], [-fx * 3.7, -fz * 3.7],
      [rx * 3.8, rz * 3.8], [-rx * 3.8, -rz * 3.8]];
    const position = offsets.map(([dx, dz]) => ({ x: s.x + dx, z: s.z + dz })).find(p => this._walkClear(p.x, p.z));
    if (!position) return { ok: false, message: '车门被挡住了，请把车挪到空处' };
    this.sim.setCruise(false);
    car.speed = 0; car.steering = 0; car.vx = 0; car.vz = 0; car.angularVelocity = 0;
    this.walk = { ...s, ...position, speed: 0, steering: 0, cruising: false, collision: false,
      mode: 'walk', altitude: 0, verticalSpeed: 0, impulseX: 0, impulseZ: 0, angularVelocity: 0, surface: isRoad(position.x, position.z) ? 'road' : 'sidewalk' };
    this.mode = 'walk';
    this.activeVehicleId = null;
    this._remember(car);
    this._streamVehicles(true);
    return { ok: true, message: '已下车 · 自由步行，靠近任何车辆可换车', vehicleId: car.id };
  }

  update(dt, input = {}, cameraYaw = this.state.yaw) {
    dt = clamp(finite(dt), 0, .1);
    if (!dt) return this.state;
    this._time += dt;
    this._streamVehicles();
    if (this.mode === 'walk') {
      const count = Math.max(1, Math.ceil(dt * 120));
      for (let i = 0; i < count; i++) { this._movePassive(dt / count); this._collideCars(); }
      this._walk(dt, input, finite(cameraYaw, this.walk.yaw));
    }
    else {
      if (this.sim.state.cruising && (input.throttle || input.brake || input.reverse || input.steer || input.handbrake || input.ascend || input.descend)) this.sim.setCruise(false);
      const count = Math.max(1, Math.ceil(dt * 120)), step = dt / count;
      let collided = false;
      for (let i = 0; i < count; i++) {
        const s = this.sim.state, x = s.x, z = s.z, distance = s.distance;
        const lastImpact = s.impactId;
        this.sim.update(step, input);
        if (s.impactId !== lastImpact && s.impact) this._emitImpact({ ...s.impact, vehicleId: this.activeVehicleId }, `${this.activeVehicleId}/wall`);
        this._movePassive(step);
        this._syncCar(false);
        this._collideCars();
        s.distance = distance + Math.hypot(s.x - x, s.z - z);
        collided ||= s.collision;
      }
      this.sim.state.collision = collided;
      this._syncCar();
    }
    this._streamVehicles();
    return this.state;
  }

  _walk(dt, input, cameraYaw) {
    const s = this.walk;
    let right = clamp(finite(input.moveX), -1, 1), forward = clamp(finite(input.moveZ), -1, 1);
    const length = Math.hypot(right, forward);
    if (length > 1) { right /= length; forward /= length; }
    const speed = input.sprint ? 6.3 : 3.15;
    const vx = (Math.sin(cameraYaw) * forward - Math.cos(cameraYaw) * right) * speed;
    const vz = (Math.cos(cameraYaw) * forward + Math.sin(cameraYaw) * right) * speed;
    if (length > .02) s.yaw = wrapAngle(s.yaw + wrapAngle(Math.atan2(vx, vz) - s.yaw) * (1 - Math.exp(-16 * dt)));
    s.collision = false;
    const count = Math.max(1, Math.ceil(dt * 120)), step = dt / count;
    let travelled = 0;
    for (let i = 0; i < count; i++) {
      const x = s.x, z = s.z;
      s.x += vx * step; s.z += vz * step;
      for (let pass = 0; pass < 2; pass++) {
        for (const wall of collidersNear(s.x, s.z, this.seed)) {
          if ((wall.minY ?? wall.minHeight ?? 0) > 1.9) continue;
          const hit = wallContact(s.x, s.z, WALK_RADIUS, wall);
          if (hit) { s.x += hit.nx * hit.separation; s.z += hit.nz * hit.separation; s.collision = true; }
        }
        for (const car of this.vehicles.values()) {
          if (car.altitude > 2 || Math.abs(car.x - s.x) > 7 || Math.abs(car.z - s.z) > 7) continue;
          const hit = carContact(s.x, s.z, WALK_RADIUS, car);
          if (hit) { s.x += hit.nx * hit.separation; s.z += hit.nz * hit.separation; s.collision = true; }
        }
      }
      travelled += Math.hypot(s.x - x, s.z - z);
    }
    s.speed = travelled / dt;
    s.distance += travelled;
    s.lapTime += dt;
    s.running = length > .02;
    s.surface = isRoad(s.x, s.z) ? 'road' : 'sidewalk';
  }

  _walkClear(x, z) {
    if (collidersNear(x, z, this.seed).some(wall => (wall.minY ?? wall.minHeight ?? 0) <= 1.9 && wallContact(x, z, WALK_RADIUS + .05, wall))) return false;
    for (const car of this.vehicles.values()) if (car.altitude <= 2 && carContact(x, z, WALK_RADIUS + .05, car)) return false;
    return true;
  }

  _bodyVelocity(car) {
    return car.id === this.activeVehicleId ? this.sim.velocity : { x: car.vx || 0, z: car.vz || 0 };
  }

  _setBodyVelocity(car, x, z, angularVelocity) {
    car.vx = x; car.vz = z; car.angularVelocity = clamp(angularVelocity, -1.8, 1.8);
    if (car.id === this.activeVehicleId) {
      this.sim.setVelocity(x, z); this.sim.state.angularVelocity = car.angularVelocity;
    } else car.speed = (Math.sin(car.yaw) * x + Math.cos(car.yaw) * z);
  }

  _moveBody(car, x, z) {
    car.x += x; car.z += z;
    if (car.id === this.activeVehicleId) { this.sim.state.x = car.x; this.sim.state.z = car.z; }
  }

  _movePassive(dt) {
    for (const car of this.vehicles.values()) {
      if (car.id === this.activeVehicleId || Math.hypot(car.vx || 0, car.vz || 0, car.angularVelocity || 0) < .005) continue;
      const spec = vehicleSpec(car.kind), vx = car.vx || 0, vz = car.vz || 0;
      car.x += vx * dt; car.z += vz * dt;
      car.yaw = wrapAngle(car.yaw + car.angularVelocity * dt);
      car.wheelAngle += Math.sign(car.speed || 1) * Math.hypot(vx, vz) * dt / spec.wheelRadius;
      const damping = Math.exp(-1.15 * dt);
      car.vx *= damping; car.vz *= damping; car.angularVelocity *= Math.exp(-3 * dt);
      if (Math.hypot(car.vx, car.vz) < .035) { car.vx = 0; car.vz = 0; }
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      for (const wall of collidersNear(car.x, car.z, this.seed)) {
        if ((wall.minY ?? wall.minHeight ?? 0) > spec.height + .22) continue;
        for (const offset of [-spec.spine, 0, spec.spine]) {
          const px = car.x + fx * offset, pz = car.z + fz * offset;
          const hit = wallContact(px, pz, spec.radius, wall);
          if (!hit) continue;
          car.x += hit.nx * hit.separation; car.z += hit.nz * hit.separation;
          const approach = car.vx * hit.nx + car.vz * hit.nz;
          if (approach < 0) {
            car.vx -= hit.nx * approach * 1.08; car.vz -= hit.nz * approach * 1.08;
            this._emitImpact({ x: px - hit.nx * spec.radius, z: pz - hit.nz * spec.radius, altitude: 0,
              nx: hit.nx, nz: hit.nz, speed: -approach, kind: 'wall', vehicleId: car.id }, `${car.id}/wall`);
          }
        }
      }
      car.speed = Math.sin(car.yaw) * car.vx + Math.cos(car.yaw) * car.vz;
      this._remember(car);
    }
  }

  _collideCars() {
    const cars = [...this.vehicles.values()];
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const specA = vehicleSpec(a.kind), specB = vehicleSpec(b.kind);
      if ((a.altitude || 0) > (b.altitude || 0) + specB.height || (b.altitude || 0) > (a.altitude || 0) + specA.height) continue;
      const reach = specA.spine + specA.radius + specB.spine + specB.radius;
      if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) continue;
      const va = this._bodyVelocity(a), vb = this._bodyVelocity(b);
      if (a.id !== this.activeVehicleId && b.id !== this.activeVehicleId && Math.hypot(va.x, va.z, vb.x, vb.z) < .005) continue;
      const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
      let contact = null;
      for (const offset of [-specA.spine, 0, specA.spine]) {
        const px = a.x + fx * offset, pz = a.z + fz * offset;
        const hit = carContact(px, pz, specA.radius, b);
        if (hit && (!contact || hit.separation > contact.separation)) contact = { ...hit, x: px - hit.nx * specA.radius, z: pz - hit.nz * specA.radius };
      }
      if (!contact) continue;
      const { nx, nz, separation, x, z } = contact;
      const invA = 1 / specA.mass, invB = 1 / specB.mass, total = invA + invB;
      const raX = x - a.x, raZ = z - a.z, rbX = x - b.x, rbZ = z - b.z;
      const inertiaA = specA.mass * ((specA.radius * 2) ** 2 + ((specA.spine + specA.radius) * 2) ** 2) / 12;
      const inertiaB = specB.mass * ((specB.radius * 2) ** 2 + ((specB.spine + specB.radius) * 2) ** 2) / 12;
      const leverA = raZ * nx - raX * nz, leverB = rbZ * nx - rbX * nz;
      const omegaA = a.angularVelocity || 0, omegaB = b.angularVelocity || 0;
      const approach = (va.x - vb.x) * nx + (va.z - vb.z) * nz + omegaA * leverA - omegaB * leverB;
      this._moveBody(a, nx * separation * invA / total, nz * separation * invA / total);
      this._moveBody(b, -nx * separation * invB / total, -nz * separation * invB / total);
      if (approach < 0) {
        const impulse = -(1 + .12) * approach / (total + leverA * leverA / inertiaA + leverB * leverB / inertiaB);
        this._setBodyVelocity(a, va.x + nx * impulse * invA, va.z + nz * impulse * invA, omegaA + leverA * impulse / inertiaA);
        this._setBodyVelocity(b, vb.x - nx * impulse * invB, vb.z - nz * impulse * invB, omegaB - leverB * impulse / inertiaB);
        this._emitImpact({ x, z, altitude: Math.min(a.altitude || 0, b.altitude || 0), nx, nz,
          speed: -approach, kind: 'vehicle', vehicleId: a.id, otherId: b.id }, [a.id, b.id].sort().join('|'));
      }
      if (a.id === this.activeVehicleId || b.id === this.activeVehicleId) {
        this.sim.state.collision = true;
        this.sim.state.cameraBump = Math.max(this.sim.state.cameraBump, Math.min(1, Math.abs(approach) / 18));
      }
      this._remember(a); this._remember(b);
    }
  }

  _syncCar(remember = true) {
    const car = this.activeVehicle, s = this.sim.state;
    if (!car) return;
    const velocity = this.sim.velocity;
    Object.assign(car, { x: s.x, z: s.z, yaw: s.yaw, speed: s.speed, steering: s.steering, wheelAngle: s.wheelAngle,
      altitude: s.altitude, verticalSpeed: s.verticalSpeed, vx: velocity.x, vz: velocity.z, angularVelocity: s.angularVelocity });
    if (remember) this._remember(car);
  }

  _remember(car) {
    car.modified = true;
    this.vehicleHistory.delete(car.id);
    this.vehicleHistory.set(car.id, car);
    while (this.vehicleHistory.size > VEHICLE_HISTORY_LIMIT) this.vehicleHistory.delete(this.vehicleHistory.keys().next().value);
  }

  _streamVehicles(force = false) {
    const s = this.state, cx = Math.floor(s.x / CHUNK_SIZE), cz = Math.floor(s.z / CHUNK_SIZE), key = `${cx},${cz}`;
    if (!force && key === this._streamKey) return;
    this._streamKey = key;
    const next = new Map();
    const nearby = car => Math.abs(Math.floor(car.x / CHUNK_SIZE) - cx) <= 1 && Math.abs(Math.floor(car.z / CHUNK_SIZE) - cz) <= 1;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const tileX = cx + dx, tileZ = cz + dz, chunk = generateChunk(tileX, tileZ, this.seed);
      // Coastal parking follows the authored road geometry; sea and plazas do
      // not inherit the old grid's four curbside placeholders.
      const spaces = Array.isArray(chunk.vehicleSpawns) ? chunk.vehicleSpawns : Array(4).fill(null);
      for (let slot = 0; slot < spaces.length; slot++) {
        const id = `${tileX},${tileZ}/car/${slot}`;
        if (this.vehicleHistory.has(id)) continue;
        const car = this.vehicles.get(id) || makeVehicle(tileX, tileZ, slot, this.seed, spaces[slot]);
        next.set(id, car);
      }
    }
    for (const car of this.vehicleHistory.values()) if (car.id === this.activeVehicleId || nearby(car)) next.set(car.id, car);
    this.vehicles = next;
  }
}
