import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionSystem } from '../dist/missions.js';
import { collidersNear, isRoad } from '../dist/world-layout.js';

const walk = (x, z) => ({ mode: 'walk', x, z, speed: 0, activeVehicleId: null });
const drive = (x, z, speed = 0, activeVehicleId = 'any-sedan-42') => ({ mode: 'drive', x, z, speed, activeVehicleId });
function stop(missions, actor) {
  for (let i = 0; i < 6; i++) missions.update(.1, actor);
}
function start(missions, vehicle = 'any-sedan-42') {
  const pickup = missions.snapshot().target;
  assert.equal(missions.interact(walk(pickup.x, pickup.z)).ok, true);
  missions.update(.016, drive(pickup.x, pickup.z, 0, vehicle));
  assert.equal(missions.stage, 'drive');
}
function finish(missions) {
  const parking = missions.snapshot().target;
  stop(missions, drive(parking.x, parking.z));
  const contact = missions.snapshot().target;
  assert.equal(missions.interact(walk(contact.x, contact.z)).ok, true);
  assert.equal(missions.stage, 'offer');
}

test('a delivery cannot begin without an explicit pickup on foot at the contact', () => {
  const missions = new MissionSystem();
  assert.equal(missions.snapshot().stage, 'pickup');
  missions.update(.1, drive(13, 13));
  assert.equal(missions.stage, 'pickup');
  assert.equal(missions.interact(drive(13, 13)).ok, false);
  assert.equal(missions.interact(walk(13, 30)).ok, false);
  assert.equal(missions.interact(walk(13, 13)).ok, true);
  assert.equal(missions.stage, 'vehicle');
  missions.update(.1, { ...drive(7, 30), activeVehicleId: null });
  assert.equal(missions.stage, 'vehicle');
});

test('any vehicle can carry the package and changing cars does not reset the job', () => {
  const missions = new MissionSystem();
  start(missions, 'parked-suv-940');
  missions.update(.1, walk(10, -50));
  assert.equal(missions.stage, 'drive');
  assert.match(missions.snapshot().objective, /重新上车/);
  missions.update(.1, drive(7, -50, 0, 'different-coupe'));
  assert.equal(missions.stage, 'drive');
  assert.equal(missions.completed, 0);
});

test('arrival requires a sustained stop in a car, followed by on-foot handover', () => {
  const missions = new MissionSystem();
  start(missions);
  const target = missions.snapshot().target;
  stop(missions, walk(target.x, target.z));
  assert.equal(missions.stage, 'drive');
  stop(missions, drive(target.x, target.z, 5));
  assert.equal(missions.stage, 'drive');
  missions.update(.1, drive(target.x, target.z));
  missions.update(.1, drive(target.x, target.z, 3));
  assert.equal(missions.stopTime, 0);
  stop(missions, drive(target.x, target.z));
  assert.equal(missions.stage, 'deliver');
  const contact = missions.snapshot().target;
  assert.equal(missions.interact(drive(contact.x, contact.z)).ok, false);
  assert.equal(missions.interact(walk(contact.x + 6, contact.z)).ok, false);
  assert.equal(missions.interact(walk(contact.x, contact.z)).ok, true);
  assert.equal(missions.cash, 300);
  assert.equal(missions.completed, 1);
});

test('reward is paid once, next contract is explicit, and progress resets for its own stages', () => {
  const missions = new MissionSystem();
  start(missions);
  finish(missions);
  const contact = missions.snapshot().target;
  for (let i = 0; i < 10; i++) missions.update(.1, walk(contact.x, contact.z));
  assert.equal(missions.cash, 300);
  assert.equal(missions.stage, 'offer');
  assert.equal(missions.snapshot().progress, 4);
  assert.equal(missions.snapshot().interaction.label, '接取下一单');
  assert.equal(missions.interact(walk(contact.x, contact.z)).ok, true);
  assert.equal(missions.stage, 'vehicle');
  assert.equal(missions.snapshot().progress, 1);
  assert.equal(missions.cash, 300);
  assert.equal(missions.interact(walk(contact.x, contact.z)).ok, false);
  missions.update(.1, drive(contact.x - 6, contact.z));
  const secondReward = missions.reward;
  finish(missions);
  assert.equal(missions.cash, 300 + secondReward);
  assert.equal(missions.completed, 2);
});

test('repeat contracts are seeded, unbounded in count, and place contacts clear of architecture', () => {
  const a = new MissionSystem({ seed: 281 });
  const b = new MissionSystem({ seed: 281 });
  start(a); start(b);
  const targets = [];
  for (let i = 0; i < 80; i++) {
    assert.deepEqual(a.snapshot().target, b.snapshot().target);
    targets.push(a.snapshot().target);
    const parking = a.snapshot().target;
    assert.ok(isRoad(parking.x, parking.z), 'every contract provides an actual road parking area');
    for (const collider of collidersNear(parking.x, parking.z, 281)) {
      assert.ok(parking.x < collider.minX - 2.5 || parking.x > collider.maxX + 2.5 || parking.z < collider.minZ - 2.5 || parking.z > collider.maxZ + 2.5, 'parking clearance overlaps a building or water');
    }
    const point = a.contact;
    for (const collider of collidersNear(point.x, point.z, 281)) {
      assert.ok(point.x < collider.minX - .7 || point.x > collider.maxX + .7 || point.z < collider.minZ - .7 || point.z > collider.maxZ + .7);
    }
    finish(a); finish(b);
    const previous = a.contact;
    a.interact(walk(previous.x, previous.z)); b.interact(walk(previous.x, previous.z));
    a.update(.1, drive(previous.x, previous.z)); b.update(.1, drive(previous.x, previous.z));
    assert.notDeepEqual(a.snapshot().target, targets.at(-1));
  }
  assert.equal(a.completed, 80);
  assert.ok(new Set(targets.map(t => `${t.x},${t.z}`)).size > 40);
  const c = new MissionSystem({ seed: 282 });
  start(c); finish(c);
  c.interact(walk(c.contact.x, c.contact.z)); c.update(.1, drive(c.contact.x, c.contact.z));
  assert.notDeepEqual(c.snapshot().target, targets[1]);
});

test('snapshots cannot mutate mission state and reset clears job rewards and notifications', () => {
  const missions = new MissionSystem({ seed: 50 });
  const snapshot = missions.snapshot();
  snapshot.target.x = 999;
  snapshot.contact.z = 999;
  assert.equal(missions.snapshot().target.x, 13);
  start(missions); finish(missions);
  assert.ok(missions.noticeId > 0);
  assert.ok(missions.cash > 0);
  missions.reset({ seed: 61 });
  assert.equal(missions.cash, 0);
  assert.equal(missions.completed, 0);
  assert.equal(missions.stage, 'pickup');
  assert.equal(missions.seed, 61);
  assert.equal(missions.noticeId, 0);
});
