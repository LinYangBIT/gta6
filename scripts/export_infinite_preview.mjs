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
const street = args.includes('--street');
const THREE = await import(pathToFileURL(resolve(source, 'vendor/three.module.js')));
const { InfiniteCity } = await import(pathToFileURL(resolve(source, 'infinite-city.js')));
const scene = new THREE.Scene();
const city = new InfiniteCity(scene, { mobile: true, seed });
let stats = city.update(3, 30, 0, 0);
while (stats.pending > 0) stats = city.update(3, 30, 0, 0);
let actors=null,hero=null;
if(street){
  const { Gameplay }=await import(pathToFileURL(resolve(source,'gameplay.js')));
  const { ActorVisuals }=await import(pathToFileURL(resolve(source,'actors.js')));
  const gameplay=new Gameplay({seed});
  hero=[...gameplay.vehicles.values()].find(car=>car.id==='0,0/car/0');
  // Blender imports the very same hero GLB used by the browser; pooled cars stay
  // in this geometry snapshot, with their per-instance and per-vertex colors.
  if(hero)gameplay.vehicles.delete(hero.id);
  actors=new ActorVisuals(scene,{mobile:false});
  actors.update(gameplay,{x:0,z:0},1.8,{contact:{x:13,z:13}});
}
scene.updateMatrixWorld(true);
const local = new THREE.Matrix4();
const world = new THREE.Matrix4();
const color = new THREE.Color();
const batches = [];
scene.traverse(object => {
  if (!object.isMesh || (object.isInstancedMesh && object.count === 0)) return;
  for(let node=object;node;node=node.parent)if(!node.visible)return;
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
    if (geometry.attributes.signIndex) item.signIndex=geometry.attributes.signIndex.getX(i);
    if (object.instanceColor) { object.getColorAt(i, color); item.color = color.toArray(); }
    instances.push(item);
  }
  batches.push({
    name: object.name || material.name || 'City material',
    geometry: { positions: Array.from(position.array), colors: geometry.attributes.color?Array.from(geometry.attributes.color.array):null, normals: geometry.attributes.normal ? Array.from(geometry.attributes.normal.array) : null, uv: geometry.attributes.uv ? Array.from(geometry.attributes.uv.array) : null, indices: geometry.index ? Array.from(geometry.index.array) : null },
    material: { signAtlas: object.name==='City / sign'?{width:material.map.image.width,height:material.map.image.height,data:Buffer.from(material.map.image.data).toString('base64')}:null, road:object.name==='City / road', paving:object.name==='City / paving', vertexColors:!!material.vertexColors, facade: object.name.endsWith('/ glass') ? 'glass' : object.name.endsWith('/ facade') ? 'masonry' : null, color: material.color?.toArray() || [1, 1, 1], roughness: material.roughness ?? .7, metalness: material.metalness ?? 0,
      emissive: material.emissive?.toArray() || [0, 0, 0], emissiveIntensity: material.emissiveIntensity ?? 0 },
    instances,
  });
});
await writeFile(output, JSON.stringify({ seed, stats, street, hero:hero?{...hero,glb:resolve(source,'assets/car.glb')}:null, camera: street?[9,3.4,41]:[250,230,270], target: street?[9,2.3,0]:[35,12,30], lens:street?28:36, aspect:street?16/9:3/2, batches }));
console.log(JSON.stringify({ output, batches: batches.length, instances: batches.reduce((total, batch) => total + batch.instances.length, 0), stats }));
actors?.dispose();city.dispose();
