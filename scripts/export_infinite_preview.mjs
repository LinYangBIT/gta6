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
const coastal = args.includes('--coastal');
const street = args.includes('--street') || coastal;
const aerial = option('--view', 'street') === 'aerial';
const vectorOption = (name, fallback) => option(name, fallback.join(',')).split(',').map(Number);
const center = vectorOption('--center', coastal ? [0,-128] : [3,30]);
const time = Number(option('--time', '1.8'));
const radius = Number(option('--radius', coastal ? '3' : '2'));
if (![...center,time,radius].every(Number.isFinite)) throw new Error('Preview coordinates must be finite numbers');
const THREE = await import(pathToFileURL(resolve(source, 'vendor/three.module.js')));
const { InfiniteCity } = await import(pathToFileURL(resolve(source, 'infinite-city.js')));
const scene = new THREE.Scene();
const city = new InfiniteCity(scene, { mobile: true, seed, radius });
let stats = city.update(...center, 0, 0);
while (stats.pending > 0) stats = city.update(...center, 0, 0);
city.updateTime?.(time);
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
  actors.update(gameplay,{x:0,z:0},time,{contact:{x:13,z:13}});
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
  const surface = object.name.startsWith('City / ') ? object.name.slice(7) : '';
  const image=material.map?.image;
  const atlas=image?.data&&image.width&&image.height?{width:image.width,height:image.height,data:Buffer.from(image.data.buffer,image.data.byteOffset,image.data.byteLength).toString('base64'),columns:material.userData?.atlasColumns??4,rows:material.userData?.atlasRows??2}:null;
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
    material: { signAtlas: atlas, basicMaterial:!!material.isMeshBasicMaterial, road:['road','roadTri'].includes(surface), paving:['paving','pavingTri'].includes(surface), vertexColors:!!material.vertexColors, facade: object.name.endsWith('/ glass') ? 'glass' : object.name.endsWith('/ facade') ? 'masonry' : null, color: material.color?.toArray() || [1, 1, 1], roughness: material.roughness ?? .7, metalness: material.metalness ?? 0,
      emissive: material.isMeshBasicMaterial ? (material.color?.toArray() || [1,1,1]) : material.emissive?.toArray() || [0, 0, 0], emissiveIntensity: material.isMeshBasicMaterial ? 1 : material.emissiveIntensity ?? 0, water:object.name==='City / water', smooth:['round','cylinder','canopy','crown'].some(type=>object.name===`City / ${type}`) },
    instances,
  });
});
const camera=vectorOption('--camera', aerial ? [330,340,330] : coastal ? [12,2.2,92] : street ? [9,3.4,41] : [250,230,270]);
const target=vectorOption('--target', aerial ? [-15,0,-150] : coastal ? [-20,4.4,0] : street ? [9,2.3,0] : [35,12,30]);
const lens=Number(option('--lens', aerial?'38':coastal?'25.5':street?'28':'36'));
await writeFile(output, JSON.stringify({ seed, stats, street, coastal, aerial, time, center, radius, hero:hero?{...hero,glb:resolve(source,'assets/car.glb')}:null, camera, target, lens, aspect:street?16/9:3/2, batches }));
console.log(JSON.stringify({ output, batches: batches.length, instances: batches.reduce((total, batch) => total + batch.instances.length, 0), stats }));
actors?.dispose();city.dispose();
