import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_SIZE, ROAD_HALF_WIDTH, DISTRICTS, COLLISION_CACHE_LIMIT,
  generateChunk, chunkAt, districtAt, isRoad, collidersNear, clearWorldCache, worldCacheSize } from '../dist/world-layout.js';

const overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

test('a world seed reproduces complete architecture after traversal and cache eviction', () => {
  const before = generateChunk(-7, 11, 610);
  assert.deepEqual(generateChunk(-7, 11, 610), before);
  assert.notDeepEqual(generateChunk(-7, 11, 611).buildings, before.buildings);
  clearWorldCache();
  const first = structuredClone(collidersNear(-7 * 128 + 50, 11 * 128 + 50, 610));
  for (let i = 0; i < 500; i++) collidersNear(i * 128 + 50, 64, 610);
  assert.equal(worldCacheSize(), COLLISION_CACHE_LIMIT);
  assert.deepEqual(collidersNear(-7 * 128 + 50, 11 * 128 + 50, 610), first);
});

test('procedural streets cross positive and negative chunk seams outside the coastal quarter', () => {
  for (const grid of [-1000000, -17, 23, 1000000]) {
    const line = grid * CHUNK_SIZE;
    for (let offset = -64; offset <= 64; offset += 4) {
      for (const lane of [-ROAD_HALF_WIDTH, -3, 0, 3, ROAD_HALF_WIDTH]) {
        assert.ok(isRoad(line + lane, line + offset));
        assert.ok(isRoad(line + offset, line + lane));
      }
    }
    assert.equal(isRoad(line + 30, line + 30), false);
  }
  assert.deepEqual(chunkAt(-.1, -.1), { cx: -1, cz: -1, key: '-1,-1' });
  assert.deepEqual(chunkAt(128, -128), { cx: 1, cz: -1, key: '1,-1' });
});

test('districts form coherent regions with different building styles, heights and layouts', () => {
  const districts = new Set(), styles = new Set(), layouts = new Set(), heights = new Set(), colors = new Set(), features = new Set();
  for (let cx = -9; cx < 9; cx++) for (let cz = -9; cz < 9; cz++) {
    const chunk = generateChunk(cx, cz);
    districts.add(chunk.district.id); layouts.add(chunk.layout);
    const regionStart = { x: Math.floor(cx / 3) * 3 * 128, z: Math.floor(cz / 3) * 3 * 128 };
    if (!chunk.coastal && !chunk.metro && !generateChunk(Math.floor(cx / 3) * 3, Math.floor(cz / 3) * 3).coastal && !generateChunk(Math.floor(cx / 3) * 3, Math.floor(cz / 3) * 3).metro)
      assert.equal(districtAt(chunk.x + 64, chunk.z + 64).id, districtAt(regionStart.x + 2, regionStart.z + 2).id);
    for (const building of chunk.buildings) { styles.add(building.style); heights.add(building.height); colors.add(building.color); }
    for (const feature of chunk.features) features.add(feature.kind);
  }
  assert.equal(districts.size, DISTRICTS.length + 1 + 6);
  assert.ok(districts.has('ocean-drive'));
  assert.equal(styles.size, 5);
  assert.equal(layouts.size, 11);
  assert.ok(layouts.has('coastal'));
  assert.ok(heights.size > 35);
  assert.ok(colors.size >= 18);
  assert.ok(features.has('canal') && features.has('park') && features.has('plaza'));
});

test('all plots stay clear of streets and building footprints never intersect', () => {
  for (let cx = -8; cx < 8; cx++) for (let cz = -8; cz < 8; cz++) {
    const chunk = generateChunk(cx, cz);
    if (chunk.coastal) continue; // Curved coastal plots have their own geometric tests.
    assert.ok(chunk.buildings.length >= 4);
    for (const collider of chunk.colliders) {
      assert.ok(collider.minX >= chunk.x + 18 && collider.maxX <= chunk.x + 110, JSON.stringify(collider));
      assert.ok(collider.minZ >= chunk.z + 18 && collider.maxZ <= chunk.z + 110, JSON.stringify(collider));
    }
    const buildings = chunk.colliders.filter(collider => collider.kind === 'building');
    for (let a = 0; a < buildings.length; a++) for (let b = a + 1; b < buildings.length; b++) assert.equal(overlaps(buildings[a], buildings[b]), false);
    for (const feature of chunk.features) {
      const bounds = { minX: feature.x - feature.width / 2, maxX: feature.x + feature.width / 2, minZ: feature.z - feature.depth / 2, maxZ: feature.z + feature.depth / 2 };
      for (const building of buildings) assert.equal(overlaps(bounds, building), false);
    }
  }
});

test('large coordinates preserve finite local geometry without integer wrapping', () => {
  const chunk = generateChunk(2 ** 32 + 71, -(2 ** 32) - 34, 2026);
  const ordinary = generateChunk(71, -34, 2026);
  assert.notEqual(chunk.detailSeed, ordinary.detailSeed);
  for (const building of chunk.buildings) {
    assert.ok(Number.isFinite(building.x) && Number.isFinite(building.z) && building.height > 0);
    assert.ok(building.x - chunk.x >= 18 && building.x - chunk.x <= 110);
  }
  assert.deepEqual(chunkAt(chunk.x + 64, chunk.z + 64), { cx: chunk.cx, cz: chunk.cz, key: chunk.key });
});
