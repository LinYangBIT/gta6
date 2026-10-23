import test from 'node:test';
import assert from 'node:assert/strict';
import { Gameplay, VEHICLE_HISTORY_LIMIT, WALK_RADIUS } from '../dist/gameplay.js';
import { generateChunk, isRoad } from '../dist/world-layout.js';
import { COAST_BOUNDS } from '../dist/coast-layout.js';

function run(game, seconds, input = {}, yaw = Math.PI, step = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / step); i++) game.update(step, input, yaw);
}

test('start on foot beside an enterable car; all generated car kinds can be entered and left', () => {
  const game = new Gameplay();
  assert.equal(game.mode, 'walk');
  assert.equal(game.activeVehicle, null);
  assert.equal(game.state.x, 13);
  assert.equal(game.nearbyVehicle().id, '0,0/car/0');
  assert.ok(game.vehicles.size > 8 && game.vehicles.size <= 36, 'coastal parking is sparse and bounded');
  const cars = [...game.vehicles.values()];
  assert.deepEqual(new Set(cars.map(car => car.kind)), new Set(['coupe', 'sedan', 'suv']));
  for (const car of cars) {
    game.walk.x = car.x + 3; game.walk.z = car.z;
    game.update(.001, {});
    const entered = game.interact();
    assert.equal(entered.ok, true, car.id);
    assert.equal(game.mode, 'drive');
    assert.equal(game.activeVehicle.id, car.id);
    assert.equal(game.sim._motionYaw, car.yaw);
    const left = game.interact();
    assert.equal(left.ok, true, car.id);
    assert.equal(game.mode, 'walk');
    assert.ok(game._walkClear(game.state.x, game.state.z));
  }
});

test('walking follows camera forward and right, with a capped diagonal and faster sprint', () => {
  const forward = new Gameplay();
  const right = new Gameplay();
  const diagonal = new Gameplay();
  const sprint = new Gameplay();
  for (const game of [forward, right, diagonal, sprint]) { game.walk.x = 0; game.walk.z = 0; }
  run(forward, .5, { moveZ: 1 }, Math.PI);
  run(right, .5, { moveX: 1 }, Math.PI);
  run(diagonal, .5, { moveX: 1, moveZ: 1 }, Math.PI);
  run(sprint, .5, { moveZ: 1, sprint: true }, Math.PI);
  assert.ok(forward.state.z < -1.5 && Math.abs(forward.state.x) < .001);
  assert.ok(right.state.x > 1.5 && Math.abs(right.state.z) < .001);
  assert.ok(Math.abs(diagonal.state.distance - forward.state.distance) < .001);
  assert.ok(sprint.state.distance > forward.state.distance * 1.9);
  const before = { x: right.state.x, z: right.state.z };
  run(right, .5, { moveZ: 1 }, Math.PI / 2);
  assert.ok(right.state.x > before.x + 1.5 && Math.abs(right.state.z - before.z) < .001);
});

test('every coastal parked car has a safe door, can be driven and exits without colliding with architecture or water', () => {
  let count = 0;
  for (let cx = COAST_BOUNDS.minX / 128; cx < COAST_BOUNDS.maxX / 128; cx++) {
    for (let cz = COAST_BOUNDS.minZ / 128; cz < COAST_BOUNDS.maxZ / 128; cz++) {
      const chunk = generateChunk(cx, cz);
      for (let slot = 0; slot < chunk.vehicleSpawns.length; slot++) {
        const space = chunk.vehicleSpawns[slot], game = new Gameplay();
        const rx = Math.cos(space.yaw), rz = -Math.sin(space.yaw);
        game.walk.x = space.x + rx * 2.5; game.walk.z = space.z + rz * 2.5;
        game.update(.001, {});
        const id = `${cx},${cz}/car/${slot}`;
        assert.ok(isRoad(space.x, space.z), `${id} parked outside asphalt`);
        assert.ok(game._walkClear(game.state.x, game.state.z), `${id} door blocked`);
        assert.equal(game.interact().ok, true, id);
        assert.equal(game.activeVehicle.id, id);
        run(game, .1);
        assert.equal(game.state.collision, false, `${id} starts in an obstacle`);
        assert.ok(Math.hypot(game.state.x - space.x, game.state.z - space.z) < .001);
        run(game, .3, { throttle: .3 });
        assert.ok(game.state.distance > .05, `${id} cannot move`);
        run(game, .3, { brake: 1 });
        assert.equal(game.interact().ok, true, `${id} cannot be left`);
        assert.ok(game._walkClear(game.state.x, game.state.z));
        count++;
      }
    }
  }
  assert.ok(count >= 20, 'the coastal district has a varied fleet');
});

test('walking reaches the beach but stops at the ocean shoreline', () => {
  const game = new Gameplay();
  game.walk.x = 106; game.walk.z = 0;
  run(game, 3, { moveX: 1, sprint: true });
  assert.ok(game.state.x > 109 && game.state.x <= 110 - WALK_RADIUS + .002);
  assert.equal(game.state.collision, true);
});

test('walking stops at building walls without tunneling and slides along them', () => {
  const game = new Gameplay();
  const wall = generateChunk(-5, 0).colliders.find(c => c.kind === 'building');
  game.walk.x = wall.minX - 2; game.walk.z = (wall.minZ + wall.maxZ) / 2;
  run(game, 2, { moveX: 1, sprint: true }, Math.PI, .1);
  assert.ok(game.state.x <= wall.minX - WALK_RADIUS + .002);
  assert.ok(game.state.collision);
  const startZ = game.state.z;
  run(game, .5, { moveX: 1, moveZ: 1 }, Math.PI);
  assert.ok(game.state.z < startZ - .8, 'wall contact should permit sliding');
  assert.ok(game.state.x <= wall.minX - WALK_RADIUS + .002);
});

test('walking cannot pass through parked cars', () => {
  const game = new Gameplay();
  game.walk.x = 11; game.walk.z = 30;
  run(game, 2, { moveX: -1, sprint: true }, Math.PI, .1);
  assert.ok(game.state.x > 8.4, 'player crossed the car capsule');
  assert.ok(game.state.collision);
});

test('entering transfers travel progress; stopping permits a safe exit and keeps the parked car', () => {
  const game = new Gameplay();
  run(game, .5, { moveZ: 1 }, Math.PI);
  const distance = game.state.distance;
  assert.equal(game.interact().ok, true);
  assert.equal(game.state.distance, distance);
  const id = game.activeVehicle.id;
  run(game, 1, { throttle: 1 });
  assert.ok(game.state.speed > 3);
  assert.equal(game.interact().ok, false, 'must stop before exiting');
  run(game, 2, { brake: 1 });
  const parked = { x: game.state.x, z: game.state.z };
  assert.equal(game.interact().ok, true);
  assert.equal(game.vehicles.get(id).speed, 0);
  assert.deepEqual({ x: game.vehicles.get(id).x, z: game.vehicles.get(id).z }, parked);
  assert.ok(game.state.distance > distance);
  assert.ok(game._walkClear(game.state.x, game.state.z));
});

test('driving collides with another car at high speed instead of passing through it', () => {
  const game = new Gameplay();
  game.interact();
  const obstacle = [...game.vehicles.values()].find(v => v.id !== game.activeVehicle.id);
  obstacle.x = 7; obstacle.z = 15; obstacle.yaw = Math.PI;
  game.state.speed = 35;
  let collided = false;
  for (let i = 0; i < 30; i++) { game.update(.1, { throttle: 1 }); collided ||= game.state.collision; }
  assert.equal(collided, true);
  assert.ok(game.state.z > obstacle.z + 4, 'active car crossed the parked car');
});

test('a driven car survives chunk changes and returning does not recreate it at its original space', () => {
  const game = new Gameplay();
  game.interact();
  const id = game.activeVehicle.id;
  game.state.x = 7; game.state.z = -330;
  game.update(.01, {});
  assert.equal(game.activeVehicle.id, id);
  assert.equal(game.activeVehicle.z, -330);
  assert.equal(game.interact().ok, true);
  game.walk.x = 13; game.walk.z = 30;
  game.update(.01, {});
  assert.equal(game.vehicles.has(id), false, 'original parking space regenerated a duplicate');
  game.walk.x = 10; game.walk.z = -330;
  game.update(.01, {});
  assert.equal(game.vehicles.get(id).z, -330);
  assert.equal(game.interact().ok, true);
  assert.equal(game.activeVehicle.id, id);
});

test('vehicle generation and modified history stay bounded over distant exploration', () => {
  const game = new Gameplay();
  for (let i = 0; i < 100; i++) {
    game.walk.x = -512 - i * 512 + 10; game.walk.z = 30;
    game.update(.01, {});
    assert.ok(game.vehicles.size <= 36 + VEHICLE_HISTORY_LIMIT);
    assert.equal(game.interact().ok, true);
    assert.equal(game.interact().ok, true);
  }
  assert.equal(game.vehicleHistory.size, VEHICLE_HISTORY_LIMIT);
  assert.ok(game.vehicles.size <= 40);
});

test('reset returns to a walking start and a new seed regenerates deterministic vehicle choices', () => {
  const a = new Gameplay({ seed: 99 }), b = new Gameplay({ seed: 99 });
  assert.deepEqual([...a.vehicles.values()], [...b.vehicles.values()]);
  a.interact(); run(a, 1, { throttle: 1 });
  a.reset();
  assert.equal(a.mode, 'walk'); assert.equal(a.state.distance, 0);
  assert.equal(a.vehicleHistory.size, 0);
  assert.deepEqual([...a.vehicles.values()], [...b.vehicles.values()]);
  a.setSeed(123);
  assert.notDeepEqual([...a.vehicles.values()], [...b.vehicles.values()]);
  assert.equal(a.sim.seed, 123);
  a.setCruise(true);
  assert.equal(a.state.cruising, false, 'walking must not silently start driving');
});

test('invalid input and resumed-tab time do not teleport the walking actor', () => {
  const game = new Gameplay();
  const start = { x: game.state.x, z: game.state.z };
  game.update(1000, { moveZ: 1, sprint: true }, Math.PI);
  assert.ok(Math.hypot(game.state.x - start.x, game.state.z - start.z) < .64);
  game.update(NaN, { moveX: Infinity, moveZ: NaN }, NaN);
  assert.ok(Number.isFinite(game.state.x) && Number.isFinite(game.state.z));
});
