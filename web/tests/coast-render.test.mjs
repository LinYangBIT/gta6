import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { COAST_ROADS, COAST_BOUNDS, getCoastChunk } from '../dist/coast-layout.js';
import { describeCoastChunk } from '../dist/coast-render.js';
import { InfiniteCity } from '../dist/infinite-city.js';

const coastalRecords=[];
for(let x=COAST_BOUNDS.minX/128;x<COAST_BOUNDS.maxX/128;x++)for(let z=COAST_BOUNDS.minZ/128;z<COAST_BOUNDS.maxZ/128;z++)coastalRecords.push(...describeCoastChunk(getCoastChunk(x,z),1));
const vertices=r=>[{x:r.x,z:r.z},{x:r.x+r.basis[0],z:r.z+r.basis[1]},{x:r.x+r.basis[2],z:r.z+r.basis[3]}];
const key=p=>`${p.x.toFixed(7)},${p.z.toFixed(7)}`;
const pointInTriangle=(p,tri)=>{const sign=(a,b,c)=>(a.x-c.x)*(b.z-c.z)-(b.x-c.x)*(a.z-c.z);const d=tri.map((v,i)=>sign(p,v,tri[(i+1)%3]));return !(d.some(n=>n<-1e-7)&&d.some(n=>n>1e-7));};

test('every coastal road segment has continuous mitered geometry including chunk boundaries',()=>{
 const triangles=coastalRecords.filter(r=>r.type==='roadTri');
 assert.equal(triangles.length,COAST_ROADS.reduce((sum,r)=>sum+(r.points.length-1)*2,0));
 assert.equal(coastalRecords.filter(r=>r.type==='road').length,0,'coast must never render a generic grid asphalt sheet');
 for(const road of COAST_ROADS){
  let previous=null;
  for(let index=0;index<road.points.length-1;index++){
   const pair=triangles.filter(r=>r.roadId===road.id&&r.roadSegment===index);
   assert.equal(pair.length,2,`${road.id}/${index} is owned exactly once`);
   const corners=new Set(pair.flatMap(r=>vertices(r).map(key)));
   assert.equal(corners.size,4);
   if(previous)assert.equal([...corners].filter(p=>previous.has(p)).length,2,`${road.id}/${index} shares its full edge with its neighbor`);
   previous=corners;
   const a=road.points[index],b=road.points[index+1],mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
   assert.ok(pair.some(r=>pointInTriangle(mid,vertices(r))),`${road.id}/${index} covers the physical road centerline`);
   for(const r of pair)assert.ok(r.basis[0]*r.basis[3]-r.basis[1]*r.basis[2]>0,'positive affine determinant keeps face normals correct');
  }
 }
});

test('shore foam is owned once across the entire ocean and cannot appear at tile seams',()=>{
 const foam=coastalRecords.filter(r=>r.type==='foam');
 assert.ok(foam.length>30);
 assert.equal(new Set(foam.map(r=>`${r.x}/${r.z}`)).size,foam.length);
 assert.ok(foam.every(r=>r.x===111.5));
 assert.ok(foam.every(r=>r.z< -396||r.z> -372),'causeway remains above clear water');
});

test('coastal GPU pools preserve affine road prisms and tilted round architectural detail',()=>{
 const city=new InfiniteCity(new THREE.Scene(),{mobile:true});
 for(let n=0;n<50;n++)city.update(3,30);
 const records=[...city.chunks.values()].flatMap(c=>c.records),matrix=new THREE.Matrix4(),p=new THREE.Vector3();
 const roadRecords=records.filter(r=>r.type==='roadTri'),pool=city.pools.get('roadTri');
 for(let index=0;index<roadRecords.length;index++){
  const r=roadRecords[index];pool.getMatrixAt(index,matrix);
  const local=[new THREE.Vector3(0,0,0),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1)];
  const wanted=vertices(r);
  local.forEach((v,i)=>{p.copy(v).applyMatrix4(matrix);assert.ok(Math.abs(p.x-wanted[i].x)<.0001);assert.ok(Math.abs(p.z-wanted[i].z)<.0001);});
 }
 const round=records.filter(r=>r.type==='round'),tiltedIndex=round.findIndex(r=>r.rx||r.rz);
 assert.ok(tiltedIndex>=0,'portholes use cylinders rotated onto real vertical facades');
 city.pools.get('round').getMatrixAt(tiltedIndex,matrix);
 assert.ok(Math.abs(matrix.elements[5])<.0001);
 assert.ok(city.stats.drawCalls<=25);assert.ok(city.stats.instances<25000);
 city.dispose();
});

test('ocean and stucco shaders compile with standard materials and animate without rebuilding pools',()=>{
 const city=new InfiniteCity(new THREE.Scene(),{mobile:true});city.update(3,30);
 const pool=city.pools.get('water');
 for(const type of ['water','foam','stucco','ground','sand']){
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  city.materials[type].onBeforeCompile(shader);
  assert.ok(!shader.fragmentShader.includes('undefined'));
  if(type==='water'||type==='foam'){city.updateTime(38.5);assert.equal(shader.uniforms.coastTime.value,38.5);}
 }
 city.updateTime(99);assert.equal(city.pools.get('water'),pool);
 city.dispose();
});
