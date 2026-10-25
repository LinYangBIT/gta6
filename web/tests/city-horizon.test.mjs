import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { InfiniteCity } from '../dist/infinite-city.js';
import { describeHorizonChunk } from '../dist/city-horizon.js';
import { generateChunk, CHUNK_SIZE } from '../dist/world-layout.js';

function settle(city,x=3,z=30,ox=0,oz=0){
  city.update(x,z,ox,oz);
  while(city.stats.pending)city.update(x,z,ox,oz);
  return city.stats;
}
function assertCoverage(city,x,z){
  const cx=Math.floor(x/CHUNK_SIZE),cz=Math.floor(z/CHUNK_SIZE),r=city.horizon.radius;
  for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
    const id=`${cx+dx},${cz+dz}`;
    assert.equal(Number(city.chunks.has(id))+Number(city.horizon.chunks.has(id)),1,`${id} must have exactly one representation`);
  }
  for(const id of city.horizon.chunks.keys())assert.equal(city.chunks.has(id),false,`${id} overlaps the detailed city`);
}

test('distant massing preserves the exact playable building identities, footprints and heights',()=>{
  for(const [cx,cz] of [[-1,0],[-2,-3],[-8,3],[22,-17]]){
    const data=generateChunk(cx,cz,610),records=describeHorizonChunk(data);
    const buildings=new Map(records.filter(r=>r.buildingId).map(r=>[r.buildingId,r]));
    assert.equal(buildings.size,data.buildings.length);
    for(const b of data.buildings){
      const r=buildings.get(b.id);
      assert.deepEqual([r.x,r.z,r.sx,r.sz,r.sy],[b.x,b.z,b.width,b.depth,b.height]);
      assert.equal(r.y,.22+b.height/2);
      assert.equal(r.type,b.style==='glass'?'glass':'facade');
    }
    assert.deepEqual(records,describeHorizonChunk(generateChunk(cx,cz,610)));
  }
});

test('every horizon tile is filled while detailed tiles stream and when approaching a far building',()=>{
  const city=new InfiniteCity(new THREE.Scene(),{mobile:true});
  city.update(3,30);assertCoverage(city,3,30);
  const farBefore=structuredClone(city.horizon.chunks.get('-5,0').data.buildings);
  while(city.stats.pending){city.update(3,30);assertCoverage(city,3,30);}
  city.update(-5*128+3,30);assertCoverage(city,-5*128+3,30);
  assert.deepEqual(city.chunks.get('-5,0').data.buildings,farBefore);
  while(city.stats.pending){city.update(-5*128+3,30);assertCoverage(city,-5*128+3,30);}
  settle(city);assertCoverage(city,3,30);
  assert.deepEqual(city.horizon.chunks.get('-5,0').data.buildings,farBefore);
  city.dispose();
});

test('horizon resources stay bounded during long trips and idle frames do not rewrite instance buffers',()=>{
  const scene=new THREE.Scene(),city=new InfiniteCity(scene,{mobile:true});
  settle(city);
  const far=city.horizon,initialRebuilds=far.stats.rebuilds;
  const versions=new Map([...far.pools].map(([type,pool])=>[type,{pool,version:pool.instanceMatrix.version}]));
  for(let i=0;i<120;i++)city.update(4,31);
  assert.equal(far.stats.rebuilds,initialRebuilds);
  for(const [type,{pool,version}] of versions){assert.equal(far.pools.get(type),pool);assert.equal(pool.instanceMatrix.version,version);}
  for(let step=1;step<=24;step++){
    const x=step*CHUNK_SIZE*13,z=-step*CHUNK_SIZE*7;
    settle(city,x+3,z+30,x,z);assertCoverage(city,x+3,z+30);
    assert.equal(far.chunks.size,264);assert.ok(far.pools.size<=4);assert.ok(far.colors.size<128);
    assert.ok(far.stats.instances<20000);assert.ok(city.stats.instances<26000);
    for(const pool of far.pools.values()){
      assert.equal(pool.castShadow,false);assert.equal(pool.receiveShadow,false);
      assert.ok(Number.isFinite(pool.boundingSphere.radius));assert.ok(pool.instanceMatrix.count<=32768);
    }
  }
  assert.ok(city.stats.totalBuildings>4000);
  const material=city.materials.facade;let disposals=0;material.addEventListener('dispose',()=>disposals++);
  city.dispose();city.dispose();assert.equal(disposals,1);
  assert.equal(scene.children.length,0);assert.equal(far.chunks.size,0);assert.equal(far.pools.size,0);
});

test('far-world origin shifts and city replacement update the entire horizon deterministically',()=>{
  const city=new InfiniteCity(new THREE.Scene(),{mobile:true});
  const ox=CHUNK_SIZE*10000000,oz=-CHUNK_SIZE*10000000;
  settle(city,ox+3,oz+30,ox,oz);
  const matrix=new THREE.Matrix4();
  for(const pool of city.horizon.pools.values())for(let index=0;index<pool.count;index++){
    pool.getMatrixAt(index,matrix);
    assert.ok(matrix.elements.every(Number.isFinite));
    assert.ok(Math.abs(matrix.elements[12])<128*10);assert.ok(Math.abs(matrix.elements[14])<128*10);
  }
  const key=[...city.horizon.chunks.keys()][0],before=structuredClone(city.horizon.chunks.get(key).data.buildings);
  city.setSeed(2026);settle(city,ox+3,oz+30,ox,oz);
  assert.notDeepEqual(city.horizon.chunks.get(key).data.buildings,before);
  city.setSeed(610);settle(city,ox+3,oz+30,ox,oz);
  assert.deepEqual(city.horizon.chunks.get(key).data.buildings,before);
  assertCoverage(city,ox+3,oz+30);city.dispose();
});
