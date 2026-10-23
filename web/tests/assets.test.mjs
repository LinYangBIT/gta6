import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Vector3 } from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/vendor/addons/loaders/GLTFLoader.js';

async function loadAsset(filename) {
  const bytes = await readFile(new URL(`../dist/assets/${filename}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(data, '');
  gltf.scene.updateMatrixWorld(true);
  return { gltf, document, bytes: bytes.length };
}

function meshStats(scene) {
  let meshes = 0;
  let drawCalls = 0;
  let vertices = 0;
  scene.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    drawCalls += Math.max(1, object.geometry.groups.length);
    const position = object.geometry.getAttribute('position');
    assert.ok(position && position.count > 0, `${object.name} needs positions`);
    vertices += position.count;
    for (let index = 0; index < position.count; index += 1) {
      assert.ok(Number.isFinite(position.getX(index)));
      assert.ok(Number.isFinite(position.getY(index)));
      assert.ok(Number.isFinite(position.getZ(index)));
    }
  });
  return { meshes, drawCalls, vertices };
}

function finiteBounds(scene) {
  const bounds = new Box3().setFromObject(scene);
  assert.equal(bounds.isEmpty(), false);
  for (const number of [...bounds.min.toArray(), ...bounds.max.toArray()]) {
    assert.ok(Number.isFinite(number));
  }
  return bounds;
}

function near(actual, expected, tolerance = 0.0001) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);
}

const environment = await loadAsset('environment.glb');
const car = await loadAsset('car.glb');

test('actual GLB files load with the shipped Three.js loader and no external assets', () => {
  for (const asset of [environment, car]) {
    assert.ok(asset.gltf.scene.isGroup);
    assert.equal(asset.gltf.animations.length, 0);
    assert.ok(asset.document.meshes.length > 0);
    assert.ok(asset.document.materials.length > 0);
    for (const entry of [...(asset.document.buffers ?? []), ...(asset.document.images ?? [])]) {
      assert.equal(entry.uri, undefined, 'asset must be self-contained');
    }
  }
  assert.ok(environment.bytes < 20 * 1024 * 1024);
  assert.ok(car.bytes < 3 * 1024 * 1024);
});

test('environment and car contain finite surfaces within the shared drawing budget', () => {
  const coastStats = meshStats(environment.gltf.scene);
  const carStats = meshStats(car.gltf.scene);
  assert.ok(coastStats.meshes > 20);
  assert.ok(carStats.meshes > 4);
  assert.ok(coastStats.drawCalls + carStats.drawCalls <= 120);
  const bounds = finiteBounds(environment.gltf.scene);
  assert.ok(bounds.min.x < -50 && bounds.min.z < -400);
  assert.ok(bounds.max.x < 50, 'the large ocean plane should not be exported');
  assert.ok(bounds.max.y > 40 && bounds.max.y < 60);
});

test('environment excludes the playable car and browser-generated sky, sea and lights', () => {
  const materialNames = new Set();
  environment.gltf.scene.traverse((object) => {
    assert.equal(Boolean(object.isCamera || object.isLight), false);
    assert.equal(object.userData.wheel_radius, undefined);
    if (object.isMesh) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materialNames.add(material.name);
      }
    }
  });
  for (const name of materialNames) {
    assert.doesNotMatch(name, /Comet \/ hero|Sunset disc|Atlantic \/ turquoise water/);
  }
  assert.ok([...materialNames].some((name) => name.includes('Coral coupe')));
  assert.ok([...materialNames].some((name) => name.includes('Ivory coupe')));
});

test('playable car is centred, grounded and sized in metres', () => {
  const bounds = finiteBounds(car.gltf.scene);
  const size = bounds.getSize(new Vector3());
  near(bounds.min.y, 0);
  near((bounds.min.x + bounds.max.x) / 2, 0);
  assert.ok(size.x > 2.2 && size.x < 2.5);
  assert.ok(size.y > 1.2 && size.y < 1.5);
  assert.ok(size.z > 4.5 && size.z < 4.9);
  const root = car.gltf.scene.children.find((node) => node.userData.forward_axis === '+Z');
  assert.ok(root, 'car root must declare the +Z driving direction');
});

test('four independent wheel pivots retain world coordinates and support local X rolling', () => {
  const wheels = [];
  car.gltf.scene.traverse((node) => {
    if (node.userData.wheel_radius !== undefined) wheels.push(node);
  });
  assert.deepEqual(wheels.map((wheel) => wheel.name).sort(), [
    'wheel_left_front', 'wheel_left_rear', 'wheel_right_front', 'wheel_right_rear',
  ]);
  for (const wheel of wheels) {
    near(wheel.userData.wheel_radius, 0.43);
    const position = wheel.getWorldPosition(new Vector3());
    near(position.x, wheel.name.includes('left') ? -1.06 : 1.06);
    near(position.y, 0.43);
    near(position.z, wheel.name.includes('front') ? 1.43 : -1.42);
    assert.ok(wheel.children.length >= 3, 'complete tire/rim assembly stays under pivot');
    const before = wheel.quaternion.clone();
    wheel.rotation.x += Math.PI / 2;
    car.gltf.scene.updateMatrixWorld(true);
    assert.ok(wheel.quaternion.angleTo(before) > 1.5);
    assert.ok(wheel.getWorldPosition(new Vector3()).distanceTo(position) < 0.0001);
    finiteBounds(wheel);
    wheel.quaternion.copy(before);
  }
  car.gltf.scene.updateMatrixWorld(true);
});
