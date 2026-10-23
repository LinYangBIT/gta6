/** Export the actual streamed browser scene for editable Blender previews. */
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(option('--source', resolve(root, 'web/dist')));
const output = resolve(option('--output', '/tmp/endless-city.json'));
const seed = Number(option('--seed', '610'));
const THREE = await import(pathToFileURL(resolve(source, 'vendor/three.module.js')));
const { InfiniteCity } = await import(pathToFileURL(resolve(source, 'infinite-city.js')));
const scene = new THREE.Scene();
const city = new InfiniteCity(scene, { mobile: true, seed });
let stats = city.update(3, 30, 0, 0);
while (stats.pending > 0) stats = city.update(3, 30, 0, 0);
scene.updateMatrixWorld(true);
const local = new THREE.Matrix4();
const world = new THREE.Matrix4();
const color = new THREE.Color();
const batches = [];
scene.traverse(object => {
  if (!object.isMesh || !object.visible || (object.isInstancedMesh && object.count === 0)) return;
  const geometry = object.geometry;
  const position = geometry.getAttribute('position');
  if (!position) return;
  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  const instances = [];
  const count = object.isInstancedMesh ? object.count : 1;
  for (let i = 0; i < count; i++) {
    if (object.isInstancedMesh) {
      object.getMatrixAt(i, local);
      world.multiplyMatrices(object.matrixWorld, local);
    } else world.copy(object.matrixWorld);
    const item = { matrix: world.toArray() };
    if (geometry.attributes.facadeSeed) {
      item.facadeSeed = geometry.attributes.facadeSeed.getX(i);
      item.dimensions = [Math.hypot(...local.elements.slice(0,3)),Math.hypot(...local.elements.slice(4,7)),Math.hypot(...local.elements.slice(8,11))];
    }
    if (object.instanceColor) { object.getColorAt(i, color); item.color = color.toArray(); }
    instances.push(item);
  }
  batches.push({
    name: object.name || material.name || 'City material',
    geometry: { positions: Array.from(position.array), normals: geometry.attributes.normal ? Array.from(geometry.attributes.normal.array) : null, uv: geometry.attributes.uv ? Array.from(geometry.attributes.uv.array) : null, indices: geometry.index ? Array.from(geometry.index.array) : null },
    material: { facade: object.name.endsWith('/ glass') ? 'glass' : object.name.endsWith('/ facade') ? 'masonry' : null, color: material.color?.toArray() || [1, 1, 1], roughness: material.roughness ?? .7, metalness: material.metalness ?? 0,
      emissive: material.emissive?.toArray() || [0, 0, 0], emissiveIntensity: material.emissiveIntensity ?? 0 },
    instances,
  });
});
await writeFile(output, JSON.stringify({ seed, stats, camera: [250, 230, 270], target: [35, 12, 30], batches }));
console.log(JSON.stringify({ output, batches: batches.length, instances: batches.reduce((total, batch) => total + batch.instances.length, 0), stats }));
city.dispose();
