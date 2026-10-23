import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingSimulation, wrapAngle } from '../dist/driving.js';
import { CHUNK_SIZE, generateChunk, isRoad, worldCacheSize, COLLISION_CACHE_LIMIT } from '../dist/world-layout.js';

function run(simulation, seconds, input, step = 1 / 60) {
  const count = Math.round(seconds / step);
  for (let i = 0; i < count; i++) simulation.update(step, input);
  return simulation.state;
}

test('throttle drives north, then the reverse pedal brakes and backs up', () => {
  const car = new DrivingSimulation();
  run(car, 2, { throttle: 1 });
  assert.ok(car.state.speed > 12 && car.state.z < 15);
  assert.ok(car.state.wheelAngle > 0 && car.state.distance > 10);
  run(car, 3, { reverse: 1 });
  assert.ok(car.state.speed < -2 && car.state.speed >= -6);
});

test('service brake stops forward and reverse motion without changing direction', () => {
  for (const input of [{ throttle: 1 }, { reverse: 1 }]) {
    const car = new DrivingSimulation();
    run(car, 1.5, input);
    const direction = Math.sign(car.state.speed);
    assert.notEqual(direction, 0);
    for (let i = 0; i < 180; i++) {
      car.update(1 / 60, { brake: 1 });
      assert.ok(car.state.speed * direction >= 0, 'brake crossed into the other gear');
    }
    assert.equal(car.state.speed, 0);
    const stoppedAt = { x: car.state.x, z: car.state.z };
    run(car, 2, { brake: 1, throttle: 1 });
    assert.equal(car.state.speed, 0, 'brake must override a held throttle');
    assert.deepEqual({ x: car.state.x, z: car.state.z }, stoppedAt);
  }
});

test('left and right steering produce mirrored turns and analog input makes a gentler turn', () => {
  const left = new DrivingSimulation();
  const right = new DrivingSimulation();
  const gentle = new DrivingSimulation();
  run(left, 1, { throttle: 0.5, steer: 1 });
  run(right, 1, { throttle: 0.5, steer: -1 });
  run(gentle, 1, { throttle: 0.5, steer: 0.3 });
  assert.ok(left.state.x < 2.6 && right.state.x > 3.4, 'thumb steering needs visible lateral movement');
  assert.ok(Math.abs((3 - left.state.x) - (right.state.x - 3)) < 0.001);
  assert.ok(wrapAngle(left.state.yaw - Math.PI) > 0.5);
  assert.ok(wrapAngle(right.state.yaw - Math.PI) < -0.5);
  assert.ok(gentle.state.x > left.state.x && gentle.state.x < 3);
  const parked = new DrivingSimulation();
  run(parked, 2, { steer: 1 });
  assert.equal(parked.state.yaw, -Math.PI, 'stationary steering must not rotate the car in place');
});

test('backing up reverses steering yaw and forward throttle can recover from reverse', () => {
  const car = new DrivingSimulation();
  run(car, 1, { reverse: 0.5, steer: 1 });
  assert.ok(car.state.z > 30 && car.state.speed < 0);
  assert.ok(wrapAngle(car.state.yaw - Math.PI) < 0);
  assert.ok(car.state.wheelAngle < 0);
  run(car, 1.5, { throttle: 1 });
  assert.ok(car.state.speed > 3, 'accelerator should brake reverse motion and select forward');
});

test('handbrake stops without reverse creep and opposed direction pedals cancel', () => {
  const car = new DrivingSimulation();
  run(car, 1, { throttle: 1, reverse: 1 });
  assert.equal(car.state.speed, 0);
  run(car, 1, { throttle: 1 });
  run(car, 2, { handbrake: true, throttle: 1 });
  assert.equal(car.state.speed, 0);
  const distance = car.state.distance;
  run(car, 2, { handbrake: true, reverse: 1 });
  assert.equal(car.state.speed, 0);
  assert.equal(car.state.distance, distance);
});

test('no input remains stationary, release decelerates, reset preserves best', () => {
  const car = new DrivingSimulation({ bestTime: 85 });
  run(car, 10, {});
  assert.equal(car.state.speed, 0);
  assert.equal(car.state.lapTime, 0);
  run(car, 1, { throttle: 1 });
  const speed = car.state.speed;
  run(car, 1, {});
  assert.ok(car.state.speed < speed);
  car.reset();
  assert.equal(car.state.bestTime, 85);
  assert.equal(car.state.z, 30);
});

test('frame-rate changes are stable and tab-resume dt is bounded', () => {
  const slow = new DrivingSimulation();
  const fast = new DrivingSimulation();
  run(slow, 3, { throttle: 1, steer: -0.05 }, 1 / 30);
  run(fast, 3, { throttle: 1, steer: -0.05 }, 1 / 120);
  assert.ok(Math.hypot(slow.state.x - fast.state.x, slow.state.z - fast.state.z) < 0.04);
  const before = fast.state.distance;
  fast.update(300, { throttle: 1 });
  assert.ok(fast.state.distance - before < 4.3);
  const snapshot = JSON.stringify(fast.state);
  fast.update(NaN, { throttle: NaN });
  assert.equal(JSON.stringify(fast.state), snapshot);
});

test('roads remain drivable far beyond the old map in both coordinate axes', () => {
  const north = new DrivingSimulation();
  north.state.x = -512 + 3;
  north.state.z = -640;
  run(north, 80, { throttle: 1 });
  assert.ok(north.state.z < -2000);
  assert.ok(north.state.speed > 30);
  assert.ok(Math.abs(north.state.x - (-512 + 3)) < .0001);
  const east = new DrivingSimulation();
  east.state.x = CHUNK_SIZE * 1700 + 30; east.state.z = 3;
  east.state.yaw = east._motionYaw = Math.PI / 2;
  run(east, 80, { throttle: 1 });
  assert.ok(east.state.x > CHUNK_SIZE * 1700 + 2000);
  assert.ok(east.state.speed > 30 && isRoad(east.state.x, east.state.z));
});

test('the full car capsule collides with actual procedural building footprints', () => {
  const building = generateChunk(-5, 0).buildings[0];
  const edge = building.z - building.depth / 2;
  const car = new DrivingSimulation();
  car.state.x = building.x;
  car.state.z = edge - 2.8;
  car.state.yaw = car._motionYaw = 0;
  car.state.speed = 42;
  car.update(.1, { throttle: 1 });
  assert.ok(car.state.collision, 'front of car must contact the generated facade');
  assert.ok(car.state.z + 2.25 <= edge + .002, 'car nose should not pass through the wall');
  assert.ok(car.state.speed < 1);
});

test('the causeway connects the coastal road across the bay to the infinite city', () => {
  const car = new DrivingSimulation();
  Object.assign(car.state, { x: 95, z: -384, yaw: Math.PI / 2 });
  car._motionYaw = Math.PI / 2;
  let collisions = 0, offRoad = 0;
  for (let i = 0; i < 35 * 60; i++) {
    car.update(1 / 60, { throttle: 1 });
    collisions += Number(car.state.collision);
    offRoad += Number(!isRoad(car.state.x, car.state.z));
  }
  assert.ok(car.state.x > 1024 && car.state.speed > 30);
  assert.equal(collisions, 0); assert.equal(offRoad, 0);
});

test('autonomous cruise traverses more than ten kilometres, turning without seams or teleports', () => {
  const car = new DrivingSimulation();
  car.setCruise(true);
  let largestStep = 0, collisions = 0, offRoad = 0;
  let minX = car.state.x, maxX = car.state.x;
  const destinations = new Set();
  for (let i = 0; i < 60 * 900; i++) {
    const { x, z, destination } = car.state;
    car.update(1 / 60);
    largestStep = Math.max(largestStep, Math.hypot(car.state.x - x, car.state.z - z));
    collisions += Number(car.state.collision);
    offRoad += Number(!isRoad(car.state.x, car.state.z));
    minX = Math.min(minX, car.state.x); maxX = Math.max(maxX, car.state.x);
    if (destination !== car.state.destination) {
      const next = car.state.destination;
      assert.equal(Math.abs(next.x - destination.x) + Math.abs(next.z - destination.z), CHUNK_SIZE);
      destinations.add(`${next.x},${next.z}`);
    }
  }
  assert.ok(car.state.distance > 10000);
  assert.ok(car.state.checkpoint > 75 && destinations.size > 75);
  assert.ok(car.state.z < -5000 && maxX - minX > 500);
  assert.equal(collisions, 0); assert.equal(offRoad, 0);
  assert.ok(largestStep < .5, `largest movement ${largestStep}`);
  assert.ok(worldCacheSize() <= COLLISION_CACHE_LIMIT, 'exploration must retain only a bounded collision cache');
});

test('cruise joins the local street after free exploration instead of returning to the spawn map', () => {
  const car = new DrivingSimulation();
  car.state.x = 1283; car.state.z = -2510;
  car.state.yaw = car._motionYaw = Math.PI;
  car.setCruise(true);
  assert.equal(car.state.destination.x, 1280);
  assert.equal(car.state.destination.z, -2560);
  run(car, 70, {});
  assert.ok(car.state.checkpoint > 4);
  assert.ok(car.state.z < -2700);
  assert.ok(isRoad(car.state.x, car.state.z));
});

test('city seeds reproduce navigation, and resetting a new seed resets the exploration', () => {
  const first = new DrivingSimulation({ seed: 781 });
  const repeated = new DrivingSimulation({ seed: 781 });
  const other = new DrivingSimulation({ seed: 782 });
  first.setCruise(true); repeated.setCruise(true); other.setCruise(true);
  run(first, 100, {}); run(repeated, 100, {}); run(other, 100, {});
  assert.deepEqual(first.state, repeated.state);
  assert.notDeepEqual(first.state.destination, other.state.destination);
  first.setSeed(782);
  assert.equal(first.state.seed, 782);
  assert.equal(first.state.checkpoint, 0);
  assert.equal(first.state.distance, 0);
  assert.equal(first.state.x, 3);
});

test('cruise finds a clear procedural courtyard exit instead of repeatedly driving into the nearest building', () => {
  const car = new DrivingSimulation({ seed: 610 });
  // Keep this regression at the same plot layout, outside the authored coast.
  const candidates = Array.from({ length: 20 }, (_, i) => generateChunk(-5 - i, 0, 610));
  const chunk = candidates.find(c => c.layout === 0);
  assert.ok(chunk);
  Object.assign(car.state, { x: chunk.x + 80, z: 64, yaw: 1 });
  car._motionYaw = 1;
  car.setCruise(true);
  let collisions = 0;
  for (let i = 0; i < 120 * 60; i++) {
    car.update(1 / 60);
    collisions += Number(car.state.collision);
  }
  assert.equal(collisions, 0);
  assert.ok(car.state.checkpoint >= 8);
  assert.ok(car.state.distance > 1000 && isRoad(car.state.x, car.state.z));
});
