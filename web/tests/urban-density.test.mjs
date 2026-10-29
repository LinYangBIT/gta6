import test from 'node:test';
import assert from 'node:assert/strict';
import {generateChunk, CHUNK_SIZE, COLLISION_CACHE_LIMIT, collidersNear, clearWorldCache, worldCacheSize} from '../dist/world-layout.js';

const unionLength=intervals=>{
  intervals.sort((a,b)=>a[0]-b[0]);let total=0,low=0,high=0;
  for(const [a,b] of intervals){if(a>high){total+=high-low;low=a;high=b;}else high=Math.max(high,b);}
  return total+high-low;
};
const coverage=chunk=>chunk.buildings.reduce((sum,b)=>sum+b.width*b.depth,0)/(91*91);

test('infinite blocks hold dense continuous street frontage with usable inner courts',()=>{
  let count=0,totalBuildings=0,totalCoverage=0;const layouts=new Set();
  for(let cx=-20;cx<20;cx++)for(let cz=-20;cz<20;cz++){
    const chunk=generateChunk(cx,cz,610);if(chunk.coastal||chunk.metro)continue;
    assert.ok(chunk.buildings.length>=16&&chunk.buildings.length<=22);
    assert.ok(coverage(chunk)>.60&&coverage(chunk)<.88,`${chunk.key} coverage=${coverage(chunk)}`);
    for(const face of ['north','south','west','east']){
      const line=face==='north'||face==='west'?18.5:109.5;
      const horizontal=face==='north'||face==='south';
      const intervals=[];
      for(const b of chunk.buildings){
        const center=(horizontal?b.z-chunk.z:b.x-chunk.x),depth=horizontal?b.depth:b.width;
        const edge=center+((face==='north'||face==='west')?-depth/2:depth/2);
        if(Math.abs(edge-line)<1e-6){const along=horizontal?b.x-chunk.x:b.z-chunk.z,span=horizontal?b.width:b.depth;intervals.push([along-span/2,along+span/2]);}
      }
      assert.ok(unionLength(intervals)>72,`${chunk.key} ${face} has a sparse frontage`);
    }
    for(const b of chunk.buildings)assert.equal(b.infill,true);
    layouts.add(chunk.layout);count++;totalBuildings+=chunk.buildings.length;totalCoverage+=coverage(chunk);
  }
  assert.equal(layouts.size,4);assert.ok(totalBuildings/count>=17);assert.ok(totalCoverage/count>.67);
});

test('street-facing parcels orient entrances toward the actual adjoining road',()=>{
  for(const [cx,cz] of [[-12,8],[13,15],[-8,-12],[19,-19]]){
    const chunk=generateChunk(cx,cz,8234);
    for(const b of chunk.buildings){
      const localX=b.x-chunk.x,localZ=b.z-chunk.z;
      if(Math.abs(localZ-b.depth/2-18.5)<1e-6&&Math.abs(b.orientation)<1e-6)continue;
      if(Math.abs(localZ+b.depth/2-109.5)<1e-6&&Math.abs(b.orientation-Math.PI)<1e-6)continue;
      if(Math.abs(localX-b.width/2-18.5)<1e-6&&Math.abs(b.orientation-Math.PI/2)<1e-6)continue;
      if(Math.abs(localX+b.width/2-109.5)<1e-6&&Math.abs(b.orientation+Math.PI/2)<1e-6)continue;
      // Interior buildings face the shared court or service lane.
      assert.ok(localX-b.width/2>42&&localX+b.width/2<86&&localZ-b.depth/2>42&&localZ+b.depth/2<86);
    }
  }
});

test('dense districts continue beyond explored history without a growing collision cache',()=>{
  clearWorldCache();const origin=generateChunk(-18,27,610);
  for(let n=0;n<1000;n++){
    const cx=1000+n*7,cz=-7000-n*5,chunk=generateChunk(cx,cz,610);
    assert.ok(chunk.buildings.length>=16);
    collidersNear(cx*CHUNK_SIZE+13,cz*CHUNK_SIZE+13,610);
    assert.ok(worldCacheSize()<=COLLISION_CACHE_LIMIT);
  }
  assert.equal(worldCacheSize(),COLLISION_CACHE_LIMIT);
  assert.deepEqual(generateChunk(-18,27,610),origin);
});
