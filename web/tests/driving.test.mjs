import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingSimulation, CHECKPOINTS, BOUNDS, PARKED_CARS, wrapAngle } from '../dist/driving.js';

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

test('road edge collisions keep the vehicle within world limits', () => {
  const car = new DrivingSimulation();
  car.state.x = BOUNDS.maxX - 0.1;
  car.state.yaw = Math.PI / 2;
  car._motionYaw = Math.PI / 2;
  car.state.speed = 38;
  car.update(0.1, { throttle: 1 });
  assert.ok(car.state.x <= BOUNDS.maxX);
  assert.ok(car.state.collision);
  assert.ok(Math.abs(car.state.speed) < 8);
});

test('parked car collision is detected even at maximum speed', () => {
  const car = new DrivingSimulation();
  const obstacle = PARKED_CARS[1];
  car.state.x = obstacle.x;
  car.state.z = obstacle.z + 4;
  car.state.speed = 42;
  car.update(0.1, { throttle: 1 });
  assert.ok(car.state.collision);
  assert.ok(Math.hypot(car.state.x - obstacle.x, car.state.z - obstacle.z) >= obstacle.radius + 1.14);
  assert.ok(car.state.speed < 5);
});

test('cruise completes ordered checkpoints and continuously loops without teleporting', () => {
  const car = new DrivingSimulation();
  car.setCruise(true);
  let largestStep = 0;
  let maxCheckpoint = 0;
  for (let i = 0; i < 60 * 240; i++) {
    const { x, z } = car.state;
    car.update(1 / 60);
    largestStep = Math.max(largestStep, Math.hypot(car.state.x - x, car.state.z - z));
    maxCheckpoint = Math.max(maxCheckpoint, car.state.checkpoint);
    if (car.state.completedLaps >= 2) break;
  }
  assert.equal(maxCheckpoint, CHECKPOINTS.length);
  assert.ok(car.state.completedLaps >= 2, JSON.stringify(car.state));
  assert.ok(car.state.bestTime > 20 && car.state.bestTime < 180);
  assert.ok(largestStep < 0.5, `largest movement ${largestStep}`);
});
