import { getCoastChunk, coastRoadAt, coastCollidersNear, COAST_DISTRICT, inCoast } from './coast-layout.js?v=10';
/**
 * Seeded city planning shared by the renderer, collisions and navigation.
 * Coordinates are metres. A curved coastal quarter connects to the infinite street grid.
 * This module does not retain explored history or depend on rendering state.
 */
export const CHUNK_SIZE = 128;
export const ROAD_HALF_WIDTH = 10;
export const WORLD_SEED = 610;
export const COLLISION_CACHE_LIMIT = 48;

export const DISTRICTS = Object.freeze([
  { id: 'deco', name: '棕榈艺廊', label: 'PALM DECO · 棕榈艺廊', colors: ['#f0b297', '#cfdba7', '#d8abd1', '#f3dbaf'], accent: '#c6877a', styles: ['deco', 'hotel'], floors: [5, 13] },
  { id: 'downtown', name: '玻璃天际线', label: 'SKYLINE · 玻璃天际线', colors: ['#438f9e', '#56a0b7', '#486f9a', '#a0b4d5'], accent: '#97e4eb', styles: ['glass', 'glass', 'hotel'], floors: [12, 30] },
  { id: 'oldtown', name: '霓虹旧城', label: 'OLD QUARTER · 霓虹旧城', colors: ['#b65f50', '#ce8860', '#be9471', '#e2bb8d'], accent: '#f3a66e', styles: ['brick', 'deco'], floors: [3, 7] },
  { id: 'garden', name: '花园住宅区', label: 'GARDEN HEIGHTS · 花园住宅区', colors: ['#e4d49f', '#a6c9ae', '#ddb69a', '#a4b8d2'], accent: '#a8dca8', styles: ['residential', 'residential', 'deco'], floors: [2, 6] },
  { id: 'marina', name: '运河湾', label: 'MARINA BAY · 运河湾', colors: ['#f1d9a9', '#68c4cb', '#cca1c8', '#ed9d83'], accent: '#69d4da', styles: ['hotel', 'deco', 'glass'], floors: [4, 12] },
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
  const coast=coastRoadAt(x,z);if(coast!==null)return coast;
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
  if(inCoast(x,z))return COAST_DISTRICT;
  const { cx, cz } = chunkAt(x, z);
  return districtForChunk(cx, cz, seed);
}

export function generateChunk(cx, cz, seed = WORLD_SEED) {
  if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz)) throw new RangeError('Chunk coordinates must be safe integers');
  const coast=getCoastChunk(cx,cz,seed);if(coast)return coast;
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

  function addBuilding(localX, localZ, width, depth, size = 1, forcedStyle, orientation = 0) {
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
      orientation, infill: true,
    };
    buildings.push(building);
    colliders.push({ id: building.id, kind: 'building', minX: building.x - width / 2, maxX: building.x + width / 2, minZ: building.z - depth / 2, maxZ: building.z + depth / 2 });
  }

  function addFeature(kind, localX, localZ, width, depth) {
    const feature = { kind, x: x + localX, z: z + localZ, width, depth, detailSeed: hashCoordinates(detailSeed, 'feature', features.length) };
    features.push(feature);
    if (kind === 'canal' || kind === 'fountain') colliders.push({ id: `${key}/${kind}/${features.length}`, kind: kind === 'canal' ? 'water' : 'fountain', minX: feature.x - width / 2, maxX: feature.x + width / 2, minZ: feature.z - depth / 2, maxZ: feature.z + depth / 2 });
  }

  // Small parcels share an outward street edge. Each block keeps service passages
  // and a courtyard, rather than scattering detached buildings across a plaza.
  // The 18.5m inset preserves sidewalks, trees, parked cars and mission contacts.
  const edge = 18.5, farEdge = CHUNK_SIZE - edge;
  function frontage(axis, face, from, to, count, minDepth, maxDepth, size = 1) {
    const gap = 1.35, serviceGap = face === 'east' ? 6.8 : gap;
    const serviceAfter = Math.floor((count - 1) / 2);
    const weights = Array.from({ length: count }, () => between(random, .86, 1.14));
    const scale = (to - from - gap * (count - 2) - serviceGap) / weights.reduce((sum, n) => sum + n, 0);
    let at = from;
    for (const [index, weight] of weights.entries()) {
      const span = weight * scale, depth = between(random, minDepth, maxDepth);
      const center = at + span / 2;
      if (axis === 'x') {
        const z = face === 'north' ? edge + depth / 2 : farEdge - depth / 2;
        addBuilding(center, z, span, depth, size, undefined, face === 'north' ? 0 : Math.PI);
      } else {
        const x = face === 'west' ? edge + depth / 2 : farEdge - depth / 2;
        addBuilding(x, center, depth, span, size, undefined, face === 'west' ? Math.PI / 2 : -Math.PI / 2);
      }
      // One east-side vehicle-width passage connects the court to the street;
      // the remaining narrow gaps remain pedestrian access between parcels.
      at += span + (index === serviceAfter ? serviceGap : gap);
    }
  }
  if (layout === 0) {
    // Sixteen connected-looking frontages surround a compact shared court.
    for (const face of ['north', 'south']) frontage('x', face, edge, farEdge, 5, 21, 24);
    for (const face of ['west', 'east']) frontage('z', face, 44.5, 83.5, 3, 21, 24, .9);
    addFeature(district.id === 'garden' ? 'park' : 'plaza', 64, 64, 36, 36);
    if (district.id !== 'garden') addFeature('fountain', 64, 64, 5, 5);
  } else if (layout === 1) {
    // Narrow shop houses line every street; four rear buildings enclose small
    // service lanes. Shallow staggered roofs keep long streets visually varied.
    for (const face of ['north', 'south']) frontage('x', face, edge, farEdge, 6, 20, 23, .8);
    for (const face of ['west', 'east']) frontage('z', face, 43.5, 84.5, 3, 20, 23, .75);
    for (const localX of [54.5, 73.5]) for (const localZ of [54.5, 73.5]) {
      addBuilding(localX, localZ, between(random, 13, 15), between(random, 13, 15), .65,
        district.id === 'oldtown' ? 'brick' : undefined, localZ < 64 ? Math.PI : 0);
    }
  } else if (layout === 2) {
    // Urban towers stand behind a continuous lower street frontage. Four compact
    // cores, not a single isolated skyscraper, form the district skyline.
    for (const face of ['north', 'south']) frontage('x', face, edge, farEdge, 4, 18, 20, .68);
    for (const face of ['west', 'east']) frontage('z', face, 41, 87, 2, 18, 20, .72);
    for (const localX of [54, 74]) for (const localZ of [54, 74]) {
      addBuilding(localX, localZ, between(random, 16.5, 18), between(random, 16.5, 18),
        district.id === 'downtown' ? between(random, 1.15, 1.55) : 1.1,
        district.id === 'downtown' ? 'glass' : district.id === 'garden' ? 'residential' : 'hotel',
        localX < 64 ? Math.PI / 2 : -Math.PI / 2);
    }
    addFeature('plaza', 64, 86.5, 26, 3);
  } else {
    // Apartment and marina rows remain dense while retaining one usable interior
    // garden/canal. The basin occupies a fifth of the buildable block, not most.
    for (const face of ['west', 'east']) frontage('z', face, edge, farEdge, 6, 20.5, 23.5, .82);
    for (const face of ['north', 'south']) frontage('x', face, 43.5, 84.5, 3, 19, 22, .8);
    addFeature(district.id === 'marina' ? 'canal' : district.id === 'oldtown' ? 'plaza' : 'park', 64, 64, 24, 42);
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
  const coastal=coastCollidersNear(x,z);
  if(!coastal)return chunk.colliders;
  if(chunk.coastal)return coastal;
  return [...chunk.colliders,...coastal];
}
export function clearWorldCache() { collisionCache.clear(); }
export function worldCacheSize() { return collisionCache.size; }
