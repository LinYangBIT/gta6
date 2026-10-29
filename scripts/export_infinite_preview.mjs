/** Export the actual streamed browser scene for editable Blender previews. */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(option('--source', resolve(root, 'web/dist')));
const output = resolve(option('--output', '/tmp/endless-city.json'));
const seed = Number(option('--seed', '610'));
const vivid = args.includes('--vivid');
const metro = args.includes('--metro');
const cyberpunk = args.includes('--cyberpunk') || metro;
const dense = args.includes('--dense') || vivid || cyberpunk;
const coastal = args.includes('--coastal');
const street = args.includes('--street') || coastal || dense;
const aerial = option('--view', 'street') === 'aerial';
const vectorOption = (name, fallback) => option(name, fallback.join(',')).split(',').map(Number);
const center = vectorOption('--center', metro ? [-320,-128] : dense ? [-128,-128] : coastal ? [0,-128] : [3,30]);
const actorCenter = vectorOption('--actor-center', metro ? [-320,-256] : [13,30]);
const time = Number(option('--time', '1.8'));
const radius = Number(option('--radius', coastal || dense ? '3' : '2'));
const horizonRadius=Number(option('--horizon-radius',dense?'4':String(radius)));
const horizon=dense&&!args.includes('--no-horizon');
if (![...center,...actorCenter,time,radius,horizonRadius].every(Number.isFinite)) throw new Error('Preview coordinates must be finite numbers');
const THREE = await import(pathToFileURL(resolve(source, 'vendor/three.module.js')));
const { InfiniteCity } = await import(pathToFileURL(resolve(source, 'infinite-city.js')));
const scene = new THREE.Scene();
const city = new InfiniteCity(scene, { mobile: true, seed, radius, horizon, horizonRadius });
let stats = city.update(...center, 0, 0);
while (stats.pending > 0 || stats.farPending > 0) stats = city.update(...center, 0, 0);
city.updateTime?.(time);
let actors=null,hero=null,snapshotVehicles=[];
if(street){
  const { Gameplay }=await import(pathToFileURL(resolve(source,'gameplay.js')));
  const { ActorVisuals }=await import(pathToFileURL(resolve(source,'actors.js')));
  const gameplay=new Gameplay({seed});
  if(metro || args.includes('--actor-center')) {
    // Observe this real neighborhood's generated vehicle locations. We move only
    // the observing actor, never rearrange vehicles into an invented traffic shot.
    Object.assign(gameplay.walk,{x:actorCenter[0],z:actorCenter[1]});
    gameplay._streamVehicles(true);
  }
  hero=[...gameplay.vehicles.values()].find(car=>car.id==='0,0/car/0');
  // Blender imports the very same hero GLB used by the browser; pooled cars stay
  // in this geometry snapshot, with their per-instance and per-vertex colors.
  if(hero&&!cyberpunk)gameplay.vehicles.delete(hero.id);
  actors=new ActorVisuals(scene,{mobile:false});
  if(cyberpunk){
    // Load the same actual hero asset into the runtime actor manager, including
    // its current paint and attached neon geometry. No separate approximation.
    const { GLTFLoader }=await import(pathToFileURL(resolve(source,'vendor/addons/loaders/GLTFLoader.js')));
    const bytes=await readFile(resolve(source,'assets/car.glb'));
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    actors.setVehicleTemplate(gltf.scene);
  }
  actors.update(gameplay,{x:0,z:0},time,{contact:{x:13,z:13}});
  snapshotVehicles=[...gameplay.vehicles.values()].map(({id,kind,x,z,yaw,altitude=0})=>({id,kind,x,z,yaw,altitude}));
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
    material: { signAtlas: atlas, emissiveMap:!!material.emissiveMap, basicMaterial:!!material.isMeshBasicMaterial, road:['road','roadTri'].includes(surface), paving:['paving','pavingTri'].includes(surface), vertexColors:!!material.vertexColors, facade: object.name.endsWith('/ glass') ? 'glass' : object.name.endsWith('/ facade') ? 'masonry' : null, color: material.color?.toArray() || [1, 1, 1], roughness: material.roughness ?? .7, metalness: material.metalness ?? 0,
      emissive: material.isMeshBasicMaterial ? (material.color?.toArray() || [1,1,1]) : material.emissive?.toArray() || [0, 0, 0], emissiveIntensity: material.isMeshBasicMaterial ? 1 : material.emissiveIntensity ?? 0, water:object.name.endsWith('/ water'), smooth:['round','cylinder','canopy','crown'].some(type=>object.name===`City / ${type}`) },
    instances,
  });
});
const camera=vectorOption('--camera', aerial ? [330,340,330] : metro ? [-241,7,-192] : coastal || dense ? [12,2.2,92] : street ? [9,3.4,41] : [250,230,270]);
const target=vectorOption('--target', aerial ? [-15,0,-150] : metro ? [-336,8,-192] : coastal || dense ? [-20,4.4,0] : street ? [9,2.3,0] : [35,12,30]);
const lens=Number(option('--lens', aerial?'38':coastal||dense?'25.5':street?'28':'36'));
const overviewCamera=vectorOption('--overview-camera',metro?[-80,260,160]:dense?[310,380,320]:[330,340,330]);
const overviewTarget=vectorOption('--overview-target',metro?[-350,0,-110]:dense?[-180,0,-140]:[-15,0,-150]);
const overviewLens=Number(option('--overview-lens',dense?'33':'38'));
const sourceSha256={};
for(const file of [...(await readdir(source)).filter(name=>name.endsWith('.js')).sort(),'assets/car.glb'])sourceSha256[`web/dist/${file}`]=createHash('sha256').update(await readFile(resolve(source,file))).digest('hex');
const scriptSha256={};
for(const file of ['scripts/export_infinite_preview.mjs','scripts/render_infinite_preview.py'])scriptSha256[file]=createHash('sha256').update(await readFile(resolve(root,file))).digest('hex');
await writeFile(output, JSON.stringify({ seed, stats, street, coastal, dense, vivid, cyberpunk, metro, aerial, time, center, actorCenter, snapshotVehicles, sourceSha256, scriptSha256, radius, horizon, horizonRadius, hero:hero&&!cyberpunk?{...hero,glb:resolve(source,'assets/car.glb')}:null, heroInRuntimeBatches:cyberpunk, camera, target, lens, overviewCamera, overviewTarget, overviewLens, aspect:street?16/9:3/2, batches }));
console.log(JSON.stringify({ output, batches: batches.length, instances: batches.reduce((total, batch) => total + batch.instances.length, 0), stats }));
actors?.dispose();city.dispose();
