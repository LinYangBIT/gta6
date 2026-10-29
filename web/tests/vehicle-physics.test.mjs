import test from 'node:test';
import assert from 'node:assert/strict';
import { Gameplay } from '../dist/gameplay.js';
import { DrivingSimulation } from '../dist/driving.js';
import { vehicleSpec } from '../dist/vehicle-specs.js';
import { generateChunk } from '../dist/world-layout.js';

const run = (game, seconds, input = {}, dt = 1 / 60) => { for (let i = 0; i < Math.round(seconds / dt); i++) game.update(dt, input); };

function impactFixture(kindA = 'coupe', kindB = 'sedan', lateral = 0) {
  const game = new Gameplay(); game.interact();
  const a = game.activeVehicle, specA = vehicleSpec(kindA), specB = vehicleSpec(kindB);
  Object.assign(a, { kind: kindA, x: -1280, z: -800, yaw: 0, altitude: 0 });
  game.sim.setVehicleKind(kindA);
  Object.assign(game.state, { x: a.x, z: a.z, yaw: 0, speed: 10, altitude: 0 });
  game.sim._motionYaw = 0;
  const b = { ...a, id: 'target', kind: kindB, x: a.x + lateral,
    z: a.z + specA.spine + specA.radius + specB.spine + specB.radius - .2,
    speed: 0, vx: 0, vz: 0, angularVelocity: 0, modified: false };
  game.vehicles = new Map([[a.id, a], [b.id, b]]);
  game._streamKey = '-10,-7'; game._syncCar(false);
  return { game, a, b, specA, specB };
}

test('vehicle collision conserves linear momentum and transfers speed into the parked body', () => {
  const { game, b, specA, specB } = impactFixture();
  const before = specA.mass * 10;
  game._collideCars();
  const velocity = game.sim.velocity;
  assert.ok(b.vz > 4, 'parked car acquires forward speed');
  assert.ok(velocity.z > 0 && velocity.z < 6, 'striking car retains reduced forward momentum');
  assert.ok(Math.abs(before - (specA.mass * velocity.z + specB.mass * b.vz)) < 1e-7);
  assert.ok(.5 * specA.mass * velocity.z ** 2 + .5 * specB.mass * b.vz ** 2 < .5 * specA.mass * 100, 'inelastic impact cannot add energy');
  const start = b.z; run(game, .25);
  assert.ok(b.z > start + .5, 'struck car keeps moving after the impulse');
  const events = game.drainImpacts();
  assert.ok(events.some(e => e.kind === 'vehicle' && e.speed > 8 && e.strength > .4));
  assert.deepEqual(game.drainImpacts(), [], 'consuming impacts does not replay effects');
});

test('mass changes the outcome: a truck pushes a bicycle much farther than a bicycle pushes a truck', () => {
  const heavy = impactFixture('truck', 'bicycle'), light = impactFixture('bicycle', 'truck');
  heavy.game._collideCars(); light.game._collideCars();
  assert.ok(heavy.b.vz > 10 && light.b.vz < .2);
  assert.ok(heavy.game.sim.velocity.z > 9 && light.game.sim.velocity.z < 0);
});

test('off-centre strikes transfer angular and lateral momentum without NaN or runaway spin', () => {
  const { game, a, b } = impactFixture('truck', 'sedan', 1.1);
  b.z -= .5;
  game._collideCars();
  assert.ok(Math.abs(b.angularVelocity) > .03, 'corner strike rotates the other body');
  assert.ok(Math.abs(b.vx) > .02, 'corner strike redirects lateral motion');
  run(game, 3);
  for (const car of [a, b]) for (const key of ['x', 'z', 'yaw', 'vx', 'vz', 'angularVelocity']) assert.ok(Number.isFinite(car[key]), key);
  assert.ok(Math.abs(b.angularVelocity) < 1.8);
});

test('momentum propagates through a line of parked cars and agrees at 30 and 60 Hz', () => {
  const cases = [];
  for (const dt of [1 / 30, 1 / 60]) {
    const { game, b } = impactFixture('truck', 'sedan');
    const c = { ...b, id: 'third', z: b.z + 4.75 };
    game.vehicles.set(c.id, c);
    run(game, .6, {}, dt);
    assert.ok(c.vz > 1, 'third car receives momentum from the second car');
    assert.ok(game.drainImpacts().some(event => event.vehicleId === 'target' && event.otherId === 'third'));
    cases.push({ x: c.x, z: c.z, vx: c.vx, vz: c.vz });
  }
  for (const key of ['x', 'z', 'vx', 'vz']) assert.ok(Math.abs(cases[0][key] - cases[1][key]) < .001, key);
});

test('passive impacted cars collide with solid walls and gradually settle', () => {
  const { game, b } = impactFixture();
  const wall = generateChunk(-10, -7).colliders.find(c => c.kind === 'building');
  b.x = wall.minX - vehicleSpec(b.kind).radius - .08; b.z = (wall.minZ + wall.maxZ) / 2;
  b.yaw = 0; b.vx = 16; b.vz = 0; b.angularVelocity = 0;
  for (let i = 0; i < 120; i++) game._movePassive(1 / 120);
  assert.ok(b.x + vehicleSpec(b.kind).radius <= wall.minX + .002, 'pushed car cannot tunnel through a building');
  assert.ok(Math.abs(b.vx) < 1);
  assert.ok(game.drainImpacts().some(e => e.kind === 'wall' && e.vehicleId === b.id));
});

test('bicycle and truck have distinct acceleration, maximum speed and turn radius', () => {
  const bike = new DrivingSimulation(), truck = new DrivingSimulation(), car = new DrivingSimulation();
  for (const [sim, kind] of [[bike, 'bicycle'], [truck, 'truck'], [car, 'coupe']]) {
    sim.setVehicleKind(kind); Object.assign(sim.state, { x: -1280, z: -800 });
    run(sim, 2, { throttle: 1 });
  }
  assert.ok(bike.state.speed < truck.state.speed && truck.state.speed < car.state.speed);
  for (const sim of [bike, truck, car]) { sim.state.x = -1280; sim.state.z = -800; sim.state.speed = 8; sim.state.yaw = sim._motionYaw = 0; run(sim, .4, { steer: 1 }); }
  assert.ok(bike.state.yaw > truck.state.yaw * 1.5, 'short bicycle wheelbase makes a tighter turn');
  run(bike, 20, { throttle: 1 }); assert.ok(bike.state.speed <= 12);
});

test('helicopter ascends, hovers, flies, lands and only permits a safe exit on the ground', () => {
  const game = new Gameplay();
  const helicopter = [...game.vehicles.values()].find(v => v.kind === 'helicopter');
  assert.ok(helicopter);
  game.walk.x = helicopter.x + 3; game.walk.z = helicopter.z;
  assert.equal(game.interact().ok, true); assert.equal(game.activeVehicle.kind, 'helicopter');
  game.setCruise(true); assert.equal(game.state.cruising, false);
  run(game, 4, { ascend: 1 });
  assert.ok(game.state.altitude > 30);
  assert.equal(game.interact().ok, false, 'cannot leave the craft in mid-air');
  run(game, 2); const hover = game.state.altitude;
  run(game, 2); assert.ok(Math.abs(game.state.altitude - hover) < .01, 'neutral lift holds hover');
  const before = { x: game.state.x, z: game.state.z };
  run(game, 1, { throttle: 1, steer: .2 });
  assert.ok(Math.hypot(game.state.x - before.x, game.state.z - before.z) > 2);
  run(game, 2, { brake: 1 });
  // Land vertically over the same clear street where it was spawned.
  game.state.x = helicopter.x = 7; game.state.z = helicopter.z = 218;
  game.sim.setVelocity(0, 0); game.state.angularVelocity = 0;
  run(game, 10, { descend: 1, brake: 1 });
  assert.equal(game.state.altitude, 0); assert.equal(game.state.verticalSpeed, 0);
  assert.equal(game.interact().ok, true);
  assert.equal(game.mode, 'walk'); assert.equal(game.state.altitude, 0);
});

test('flight can clear a roof while low flight hits the same building, and descent stops above the roof', () => {
  const building = generateChunk(-10, -7).buildings[0];
  const low = new DrivingSimulation(), high = new DrivingSimulation();
  for (const sim of [low, high]) {
    sim.setVehicleKind('helicopter');
    Object.assign(sim.state, { x: building.x, z: building.z - building.depth / 2 - 4, yaw: 0, speed: 30, altitude: sim === low ? 2 : building.height + 12 });
    sim._motionYaw = 0; run(sim, .5, { throttle: 1 });
  }
  assert.ok(low.state.z + 3.45 <= building.z - building.depth / 2 + .002);
  assert.ok(high.state.z > building.z - building.depth / 2, 'high flight crosses the facade footprint');
  high.state.x = building.x; high.state.z = building.z;
  high.setVelocity(0, 0); run(high, 8, { descend: 1, brake: 1 });
  assert.ok(high.state.altitude >= building.height, 'descent cannot enter the roof');
});

test('impact queue and cooldown registry remain bounded under repeated contacts', () => {
  const { game } = impactFixture();
  for (let i = 0; i < 1000; i++) game._emitImpact({ speed: 10, x: i, z: 0, kind: 'wall' }, String(i));
  assert.equal(game.drainImpacts().length, 32); assert.ok(game._impactCooldown.size <= 128);
});

test('authored metro vehicles retain their types and have usable parking and exits', () => {
  const found = new Set();
  for (const [cx, cz] of [[-3, 0], [-3, -1], [-3, -2], [-3, -3], [-4, -2], [-4, 0]]) {
    const chunk = generateChunk(cx, cz);
    for (const [slot, space] of chunk.vehicleSpawns.entries()) {
      const game = new Gameplay();
      game.walk.x = space.x + 3; game.walk.z = space.z; game.update(.001);
      assert.equal(game.interact().ok, true);
      assert.equal(game.activeVehicle.id, `${cx},${cz}/car/${slot}`);
      assert.equal(game.activeVehicle.kind, space.kind); found.add(space.kind);
      run(game, .3, { throttle: 1 }); assert.ok(game.state.distance > .01, `${chunk.key}: ${space.kind} must move`);
      run(game, .4, { brake: 1 }); assert.equal(game.interact().ok, true);
      assert.ok(game._walkClear(game.state.x, game.state.z));
    }
  }
  for (const kind of ['bicycle', 'truck', 'helicopter']) assert.ok(found.has(kind));
});

test('transit deck permits ground passage but blocks helicopter ascent and descent through the slab', () => {
  const truck = new DrivingSimulation(); truck.setVehicleKind('truck');
  Object.assign(truck.state, { x: -320, z: -64, yaw: 0, speed: 4 }); truck._motionYaw = 0;
  run(truck, 1, { throttle: 1 });
  assert.equal(truck.state.collision, false); assert.ok(truck.state.z > -62);
  const helicopter = new DrivingSimulation(); helicopter.setVehicleKind('helicopter');
  Object.assign(helicopter.state, { x: -320, z: -64 });
  run(helicopter, 4, { ascend: 1 });
  assert.ok(helicopter.state.altitude > 4 && helicopter.state.altitude < 4.5);
  assert.equal(helicopter.state.verticalSpeed, 0);
  Object.assign(helicopter.state, { x: -320, z: -64, altitude: 15 });
  run(helicopter, 4, { descend: 1 });
  assert.equal(helicopter.state.altitude, 10);
  const walk = new Gameplay(); assert.ok(walk._walkClear(-320, -64));
});
