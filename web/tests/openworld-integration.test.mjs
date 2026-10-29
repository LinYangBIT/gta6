import test from 'node:test';
import assert from 'node:assert/strict';
import { Gameplay } from '../dist/gameplay.js';
import { MissionSystem } from '../dist/missions.js';
import { wrapAngle } from '../dist/driving.js';
import { coastRoute } from '../dist/coast-layout.js';
import { isRoad } from '../dist/world-layout.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// A gameplay-level journey: every position change below comes from movement
// inputs and the real collision simulation. No actor/vehicle teleport is used.
function firstDelivery({ seed = 610, parkingSlot = 0, stepTime = 1 / 60 } = {}) {
  const game = new Gameplay({ seed });
  const missions = new MissionSystem({ seed });
  const actor = () => ({ ...game.state, mode: game.mode, activeVehicleId: game.activeVehicle?.id ?? null });
  const step = (input = {}) => {
    game.update(stepTime, input, Math.PI);
    return missions.update(stepTime, actor());
  };
  function walkTo(x, z) {
    for (let frame = 0; frame < Math.ceil(40 / stepTime); frame++) {
      const dx = x - game.state.x, dz = z - game.state.z, distance = Math.hypot(dx, dz);
      if (distance < .22) return;
      // Camera points north: screen right is +X and forward is -Z.
      step({ moveX: dx / distance, moveZ: -dz / distance });
    }
    assert.fail(`Walking route blocked at ${game.state.x}, ${game.state.z}`);
  }

  assert.equal(game.mode, 'walk');
  assert.equal(missions.interact(actor()).ok, false, 'cannot collect from spawn');
  walkTo(13, 13);
  assert.equal(missions.interact(actor()).ok, true);
  assert.equal(missions.stage, 'vehicle');
  const parkingZ = parkingSlot === 0 ? 30 : 78;
  walkTo(13, parkingZ);
  assert.equal(game.interact().ok, true);
  assert.equal(game.activeVehicle.id, `0,0/car/${parkingSlot}`);
  assert.equal(game.activeVehicle.kind, parkingSlot === 0 ? 'coupe' : 'bicycle');
  step();
  assert.equal(missions.stage, 'drive');

  let touchedObstacle = false, leftRoad = false;
  const route = coastRoute({ x: 3, z: parkingZ - 22 }, { x: 3, z: -128 });
  assert.ok(route.length > 8, 'the delivery uses a sampled curved boulevard');
  assert.ok(route.some(point => point.x < -15), 'journey follows the western bend');
  let routeIndex = 0;
  for (let frame = 0; frame < Math.ceil(55 / stepTime) && missions.stage !== 'deliver'; frame++) {
    const state = game.state;
    // Leave the curb for the open lane before passing the next parked car.
    const enteringLane = state.z > parkingZ - 15;
    while (routeIndex < route.length - 1 && Math.hypot(route[routeIndex].x - state.x, route[routeIndex].z - state.z) < 6) routeIndex++;
    const targetX = enteringLane ? 3 : route[routeIndex].x, targetZ = enteringLane ? parkingZ - 22 : route[routeIndex].z;
    const dx = targetX - state.x, dz = targetZ - state.z;
    const error = wrapAngle(Math.atan2(dx, dz) - state.yaw);
    const finishing = routeIndex >= route.length - 3;
    let desiredSpeed = enteringLane ? 8 : finishing ? Math.min(9, Math.max(0, (Math.hypot(3 - state.x, -128 - state.z) - 6) * .7)) : 8;
    if (Math.abs(error) > .5) desiredSpeed = Math.min(desiredSpeed, 4.5);
    step({
      steer: clamp(error * 2.8, -1, 1),
      throttle: clamp((desiredSpeed - state.speed) * .4, 0, 1),
      brake: clamp((state.speed - desiredSpeed) * .5, 0, 1),
    });
    touchedObstacle ||= game.state.collision;
    leftRoad ||= !isRoad(game.state.x, game.state.z);
  }
  assert.equal(touchedObstacle, false, 'first delivery has a clear driving route');
  assert.equal(leftRoad, false, 'curved route stays on the rendered road');
  assert.equal(missions.stage, 'deliver', 'stopping at destination advances the mission');
  assert.ok(Math.abs(game.state.speed) < .7);
  assert.equal(missions.interact(actor()).ok, false, 'delivery requires getting out');
  const vehicleId = game.activeVehicle.id;
  const parked = { x: game.state.x, z: game.state.z };
  assert.equal(game.interact().ok, true);
  assert.equal(game.mode, 'walk');

  // Cross behind the larger curbside fleet before approaching the contact.
  // At seed 4928 a truck occupies the old z=-112 waypoint; z=-116 keeps
  // clearance from both that truck and our stopped vehicle, without teleporting.
  assert.ok(game._walkClear(game.state.x, -116), 'pedestrian crossing starts in clear space');
  walkTo(game.state.x, -116);
  walkTo(13, -116);
  walkTo(13, -115);
  assert.equal(missions.interact(actor()).ok, true);
  assert.equal(missions.cash, 300);
  assert.equal(missions.completed, 1);
  assert.equal(missions.stage, 'offer');
  assert.ok(game.state.distance > 190, 'trip includes both walking and driving');
  assert.deepEqual({ x: game.vehicles.get(vehicleId).x, z: game.vehicles.get(vehicleId).z }, parked);

  // Repeated E now accepts the next job, without duplicating the reward.
  assert.equal(missions.interact(actor()).ok, true);
  assert.equal(missions.cash, 300);
  assert.equal(missions.stage, 'vehicle');
  assert.equal(missions.contract, 2);
  assert.ok(Math.hypot(missions.destination.x - 13, missions.destination.z + 115) > 60);
}

test('complete the first mission from walking spawn through pickup, driving, exit and reward', () => {
  firstDelivery();
});

test('the same full journey works by bicycle with a different city seed and 30 Hz updates', () => {
  firstDelivery({ seed: 4928, parkingSlot: 1, stepTime: 1 / 30 });
});
