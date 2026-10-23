import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { COAST_BUILDINGS, COAST_FEATURES, coastCollidersNear, coastRoadDistance, getCoastChunk } from '../dist/coast-layout.js';
import { describeCoastBuilding } from '../dist/coast-architecture.js';
import { describeCoastChunk } from '../dist/coast-render.js';

function featureChunks(feature) {
  const chunks=[];
  for(let cz=Math.floor((feature.z-feature.depth/2)/128);cz<=Math.floor((feature.z+feature.depth/2-.001)/128);cz++) {
    for(let cx=Math.floor((feature.x-feature.width/2)/128);cx<=Math.floor((feature.x+feature.width/2-.001)/128);cx++) chunks.push(getCoastChunk(cx,cz));
  }
  return chunks;
}
const covers=(record,x,z)=>Math.abs(x-record.x)<=record.sx/2+.0001&&Math.abs(z-record.z)<=record.sz/2+.0001;

test('a roundabout crossing a chunk seam renders one island at its shared physical centre',()=>{
  const island=COAST_FEATURES.find(feature=>feature.kind==='roundabout');
  assert.ok(featureChunks(island).length>1,'regression exercises clipped chunks');
  for(const lod of [0,1,2]) {
    const records=featureChunks(island).flatMap(chunk=>describeCoastChunk(chunk,lod));
    const bases=records.filter(record=>record.type==='round'&&record.sx===island.radius&&record.sy===.2);
    assert.equal(bases.length,1,'the original island is owned once, never duplicated at clipped centres');
    assert.equal(bases[0].x,island.x);assert.equal(bases[0].z,island.z);
    assert.ok(coastCollidersNear(island.x,island.z).some(rect=>island.x>=rect.minX&&island.x<=rect.maxX&&island.z>=rect.minZ&&island.z<=rect.maxZ));
  }
});

test('the impassable marina is visibly water throughout its physics footprint',()=>{
  const marina=COAST_FEATURES.find(feature=>feature.kind==='marina');
  const collider=coastCollidersNear(marina.x,marina.z).find(rect=>rect.id==='coast/marina');
  assert.ok(collider);
  const records=featureChunks(marina).flatMap(chunk=>describeCoastChunk(chunk,0));
  for(let x=collider.minX+.5;x<collider.maxX;x+=5)for(let z=collider.minZ+.5;z<collider.maxZ;z+=5) {
    const water=records.filter(record=>record.type==='water'&&covers(record,x,z));
    assert.ok(water.length,`water must be visible at the blocked point ${x},${z}`);
    const waterTop=Math.max(...water.map(record=>record.y+record.sy/2));
    const land=records.filter(record=>['ground','green','sand','paving'].includes(record.type)&&!record.ry&&covers(record,x,z));
    assert.ok(land.every(record=>record.y+record.sy/2<waterTop),`water cannot be hidden under a park slab at ${x},${z}`);
  }
  const drownedTrunks=records.filter(record=>record.type==='cylinder'&&record.y<2&&record.sy>.5&&record.x>collider.minX&&record.x<collider.maxX&&record.z>collider.minZ&&record.z<collider.maxZ);
  assert.equal(drownedTrunks.length,0,'park planting must respect the visible water basin');
});

test('detailed hotel entrances and café furniture stay clear of the shared road surface',()=>{
  const geometry={box:new THREE.BoxGeometry(1,1,1),round:new THREE.CylinderGeometry(1,1,1,24),canopy:new THREE.ConeGeometry(1,1,16),crown:new THREE.IcosahedronGeometry(1,1)};
  const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
  for(const building of COAST_BUILDINGS.filter(building=>building.landmark))for(const record of describeCoastBuilding(building,0)) {
    p.set(record.x,record.y,record.z);s.set(record.sx,record.sy,record.sz);
    q.setFromEuler(new THREE.Euler(record.rx,record.ry,record.rz));matrix.compose(p,q,s);
    const bounds=new THREE.Box3().setFromBufferAttribute((geometry[record.type]||geometry.box).attributes.position).applyMatrix4(matrix);
    if(bounds.min.y>2.3)continue;
    for(const x of [bounds.min.x,(bounds.min.x+bounds.max.x)/2,bounds.max.x])for(const z of [bounds.min.z,(bounds.min.z+bounds.max.z)/2,bounds.max.z]) {
      assert.ok(coastRoadDistance(x,z)>1,`${building.id} ${record.type} blocks traffic at ${x},${z}`);
    }
  }
  for(const mesh of Object.values(geometry))mesh.dispose();
});
