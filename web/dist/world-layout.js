/**
 * Seeded city planning shared by the renderer, collisions and navigation.
 * Coordinates are metres. Every 128m grid line is a continuous public street.
 * This module does not retain explored history or depend on rendering state.
 */
export const CHUNK_SIZE = 128;
export const ROAD_HALF_WIDTH = 10;
export const WORLD_SEED = 610;
export const COLLISION_CACHE_LIMIT = 48;

export const DISTRICTS = Object.freeze([
  { id: 'deco', name: '棕榈艺廊', label: 'PALM DECO · 棕榈艺廊', colors: ['#e5c1ad', '#dce0cb', '#d6c8d5', '#eee4cf'], accent: '#c6877a', styles: ['deco', 'hotel'], floors: [5, 13] },
  { id: 'downtown', name: '玻璃天际线', label: 'SKYLINE · 玻璃天际线', colors: ['#5e8994', '#70909e', '#526d86', '#a0a4af'], accent: '#97e4eb', styles: ['glass', 'glass', 'hotel'], floors: [12, 30] },
  { id: 'oldtown', name: '霓虹旧城', label: 'OLD QUARTER · 霓虹旧城', colors: ['#9e5d53', '#b77c61', '#b08b73', '#d5b195'], accent: '#f3a66e', styles: ['brick', 'deco'], floors: [3, 7] },
  { id: 'garden', name: '花园住宅区', label: 'GARDEN HEIGHTS · 花园住宅区', colors: ['#d5d0b5', '#b7c6b3', '#cfb7a0', '#b2b9c6'], accent: '#a8dca8', styles: ['residential', 'residential', 'deco'], floors: [2, 6] },
  { id: 'marina', name: '运河湾', label: 'MARINA BAY · 运河湾', colors: ['#e4d6b8', '#8ebac0', '#c5b0c4', '#d89e86'], accent: '#69d4da', styles: ['hotel', 'deco', 'glass'], floors: [4, 12] },
].map(district => Object.freeze({ ...district, colors: Object.freeze(district.colors), styles: Object.freeze(district.styles), floors: Object.freeze(district.floors) })));

/** Hash full coordinate strings instead of truncating world coordinates to 32 bits. */
export function hashCoordinates(...parts) {
  let hash = 2166136261;
  const text = parts.join('|');
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15; hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ hash >>> 16) >>> 0;
}

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let number = Math.imul(state ^ state >>> 15, 1 | state);
    number ^= number + Math.imul(number ^ number >>> 7, 61 | number);
    return ((number ^ number >>> 14) >>> 0) / 4294967296;
  };
}

const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const between = (random, low, high) => low + random() * (high - low);
const choose = (random, options) => options[Math.floor(random() * options.length)];

export function chunkAt(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
  return { cx, cz, key: `${cx},${cz}` };
}

export function isRoad(x, z) {
  const dx = mod(x + CHUNK_SIZE / 2, CHUNK_SIZE) - CHUNK_SIZE / 2;
  const dz = mod(z + CHUNK_SIZE / 2, CHUNK_SIZE) - CHUNK_SIZE / 2;
  return Math.abs(dx) <= ROAD_HALF_WIDTH || Math.abs(dz) <= ROAD_HALF_WIDTH;
}

function districtForChunk(cx, cz, seed) {
  const regionX = Math.floor(cx / 3), regionZ = Math.floor(cz / 3);
  // The initial neighborhood retains the project's pastel Art Deco identity.
  if (regionX === 0 && regionZ === 0) return DISTRICTS[0];
  // Give the starting junction four distinct directions before the wider world
  // takes over; each building and courtyard still varies with the city seed.
  if (regionX === 0 && regionZ === -1) return DISTRICTS[1];
  if (regionX === -1 && regionZ === 0) return DISTRICTS[2];
  if (regionX === -1 && regionZ === -1) return DISTRICTS[4];
  if (regionX === 1 && regionZ === 0) return DISTRICTS[3];
  return DISTRICTS[hashCoordinates('district', regionX, regionZ, seed) % DISTRICTS.length];
}

export function districtAt(x, z, seed = WORLD_SEED) {
  const { cx, cz } = chunkAt(x, z);
  return districtForChunk(cx, cz, seed);
}

export function generateChunk(cx, cz, seed = WORLD_SEED) {
  if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz)) throw new RangeError('Chunk coordinates must be safe integers');
  const x = cx * CHUNK_SIZE, z = cz * CHUNK_SIZE;
  const key = `${cx},${cz}`;
  const detailSeed = hashCoordinates('chunk', cx, cz, seed);
  const random = randomSource(detailSeed);
  const district = districtForChunk(cx, cz, seed);
  const buildings = [], features = [], colliders = [];
  let layout = Math.floor(random() * 4);
  if (district.id === 'downtown' && random() < .55) layout = 2;
  if (district.id === 'garden' && random() < .6) layout = 3;
  if (district.id === 'marina' && random() < .65) layout = 3;

  function addBuilding(localX, localZ, width, depth, size = 1, forcedStyle) {
    const style = forcedStyle || choose(random, district.styles);
    const [low, high] = district.floors;
    const floors = Math.max(2, Math.round(between(random, low, high) * size));
    const floorHeight = style === 'glass' ? 3.65 : style === 'hotel' ? 3.4 : 3.15;
    const building = {
      id: `${key}/building/${buildings.length}`, x: x + localX, z: z + localZ,
      width, depth, height: Math.round((floors * floorHeight + .7) * 100) / 100,
      floors, style, color: choose(random, district.colors), accent: district.accent,
      detailSeed: hashCoordinates(detailSeed, buildings.length, 'building'),
      roof: style === 'deco' ? 'stepped' : style === 'residential' ? 'terrace' : choose(random, ['flat', 'terrace', 'stepped']),
      orientation: Math.floor(random() * 4) * Math.PI / 2,
    };
    buildings.push(building);
    colliders.push({ id: building.id, kind: 'building', minX: building.x - width / 2, maxX: building.x + width / 2, minZ: building.z - depth / 2, maxZ: building.z + depth / 2 });
  }

  function addFeature(kind, localX, localZ, width, depth) {
    const feature = { kind, x: x + localX, z: z + localZ, width, depth, detailSeed: hashCoordinates(detailSeed, 'feature', features.length) };
    features.push(feature);
    if (kind === 'canal' || kind === 'fountain') colliders.push({ id: `${key}/${kind}/${features.length}`, kind: kind === 'canal' ? 'water' : 'fountain', minX: feature.x - width / 2, maxX: feature.x + width / 2, minZ: feature.z - depth / 2, maxZ: feature.z + depth / 2 });
  }

  if (layout === 0) {
    // Four substantial street-front buildings around an open planted courtyard.
    for (const localX of [37, 91]) for (const localZ of [37, 91]) {
      addBuilding(localX, localZ, between(random, 27, 36), between(random, 27, 36));
    }
    addFeature(district.id === 'garden' ? 'park' : 'plaza', 64, 64, 31, 15);
    if (district.id !== 'garden') addFeature('fountain', 64, 64, 5, 5);
  } else if (layout === 1) {
    // Smaller shop houses form six independent, differently proportioned facades.
    for (const localX of [32, 64, 96]) for (const localZ of [38, 90]) {
      addBuilding(localX, localZ, between(random, 20, 26), between(random, 29, 38), .83);
    }
    addFeature('plaza', 64, 64, 88, 10);
  } else if (layout === 2) {
    // A stepped landmark tower and four low pavilions create a distinct skyline.
    addBuilding(64, 64, between(random, 34, 44), between(random, 34, 44), 1.45,
      district.id === 'downtown' ? 'glass' : district.id === 'garden' ? 'residential' : 'hotel');
    for (const localX of [30, 98]) for (const localZ of [30, 98]) {
      addBuilding(localX, localZ, between(random, 18, 22), between(random, 18, 22), .48);
    }
    addFeature('plaza', 64, 27, 22, 14);
    addFeature('park', 64, 101, 22, 14);
  } else {
    // Two rows wrap a garden, market court, or enclosed marina basin.
    for (const localX of [31, 97]) for (const localZ of [32, 64, 96]) {
      addBuilding(localX, localZ, between(random, 20, 25), between(random, 22, 27), .78);
    }
    addFeature(district.id === 'marina' ? 'canal' : district.id === 'oldtown' ? 'plaza' : 'park', 64, 64, 31, 88);
  }

  return { key, cx, cz, x, z, seed, detailSeed, layout, district, buildings, features, colliders };
}

// Physics queries are independent from what has finished rendering. A discarded
// chunk regenerates identically; long drives cannot accumulate a city-sized cache.
const collisionCache = new Map();
export function collidersNear(x, z, seed = WORLD_SEED) {
  const { cx, cz, key } = chunkAt(x, z);
  const cacheKey = `${seed}/${key}`;
  let chunk = collisionCache.get(cacheKey);
  if (chunk) collisionCache.delete(cacheKey);
  else chunk = generateChunk(cx, cz, seed);
  collisionCache.set(cacheKey, chunk);
  while (collisionCache.size > COLLISION_CACHE_LIMIT) collisionCache.delete(collisionCache.keys().next().value);
  // Neighboring plots start 18m beyond each chunk seam, well outside the car's
  // collision radius. Current-chunk colliders cover every reachable contact.
  return chunk.colliders;
}
export function clearWorldCache() { collisionCache.clear(); }
export function worldCacheSize() { return collisionCache.size; }
