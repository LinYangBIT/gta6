import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { InfiniteCity } from '../dist/infinite-city.js';
import { CHUNK_SIZE } from '../dist/world-layout.js';

function settle(city,x=3,z=30,ox=0,oz=0) { for(let i=0;i<60;i++)city.update(x,z,ox,oz);return city.stats; }

test('bootstrap builds all immediately adjacent streets and pooled detailed neighborhoods', () => {
  const scene=new THREE.Scene(),city=new InfiniteCity(scene,{mobile:true});
  city.update(3,30);
  for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++)assert.ok(city.chunks.has(`${x},${z}`));
  const stats=settle(city);
  assert.equal(stats.loaded,25);assert.equal(stats.pending,0);
  assert.ok(stats.buildings>=30);assert.ok(stats.instances>10000);assert.ok(stats.instances<25000);
  assert.equal(city.chunks.get('0,0').data.coastal,true);
  assert.ok(stats.drawCalls<=25);assert.equal(city.group.children.length,stats.drawCalls);
  for(const mesh of city.group.children){assert.ok(mesh.isInstancedMesh);assert.ok(mesh.count>0);assert.ok(Number.isFinite(mesh.boundingSphere.radius));}
  city.dispose();assert.equal(scene.children.length,0);
});

test('streaming many distant tiles retains a fixed neighborhood and regeneration is stable', () => {
  const city=new InfiniteCity(new THREE.Scene(),{mobile:true});settle(city);
  const first=JSON.stringify(city.chunks.get('0,0').records);
  let maximum=0;
  for(let n=1;n<=100;n++) {
    const x=n*CHUNK_SIZE*3,z=-n*CHUNK_SIZE*2;
    settle(city,x+3,z+30,x,z);maximum=Math.max(maximum,city.chunks.size);
    assert.ok(city.chunks.size<=25);assert.equal(city.pending.length,0);
    assert.ok(city.pools.size<=25);assert.ok(city.colors.size<256);
  }
  assert.equal(maximum,25);
  settle(city);assert.equal(JSON.stringify(city.chunks.get('0,0').records),first);
  city.dispose();
});

test('far-world render matrices subtract floating origin without losing local positions', () => {
  const city=new InfiniteCity(new THREE.Scene(),{mobile:true});
  const ox=128*10000000,oz=-128*10000000;
  settle(city,ox+3,oz+30,ox,oz);
  const road=city.pools.get('road'),matrix=new THREE.Matrix4(),positions=[];
  for(let i=0;i<road.count;i++){
    road.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix);
    positions.push(p);assert.ok(Math.abs(p.x)<CHUNK_SIZE*4);assert.ok(Math.abs(p.z)<CHUNK_SIZE*4);
  }
  assert.ok(positions.some(p=>p.x===64&&p.z===64),'current tile keeps exact local metre coordinates');
  const oldRoad=road;
  city.update(ox+4,oz+31,ox,oz);assert.equal(city.pools.get('road'),oldRoad,'steady frames reuse GPU pools');
  city.dispose();
});

test('changing city seed replaces deterministic geometry while preserving bounded GPU allocation', () => {
  const city=new InfiniteCity(new THREE.Scene(),{mobile:true,seed:610});settle(city);
  const first=city.chunks.get('0,0').data.detailSeed;
  city.setSeed(8234);settle(city);
  assert.notEqual(city.chunks.get('0,0').data.detailSeed,first);assert.equal(city.chunks.size,25);
  assert.ok(city.group.children.length<=25);assert.equal(city.stats.pending,0);
  city.dispose();city.dispose();assert.equal(city.group.parent,null);
});

test('facade shaders integrate with shipped Three standard material and unique per-building seeds', () => {
  const city=new InfiniteCity(new THREE.Scene());settle(city);
  for(const type of ['facade','glass']) {
    const material=city.materials[type];
    const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('vFacadeSize=vec2'));
    assert.ok(shader.fragmentShader.includes('totalEmissiveRadiance+=vec3'));
    assert.ok(!shader.fragmentShader.includes('undefined'));
    const pool=city.pools.get(type);
    if(pool){const seeds=pool.geometry.getAttribute('facadeSeed');assert.ok(seeds.count>=pool.count);assert.ok(new Set(Array.from(seeds.array.slice(0,pool.count))).size>1);}
  }
  city.dispose();
});
