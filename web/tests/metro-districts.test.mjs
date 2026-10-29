import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {CITY_POINTS_OF_INTEREST, getMetroChunk, describeCityElements, COAST_CITY_ELEMENTS, cityElementColliders} from '../dist/metro-districts.js';
import {generateChunk, districtAt, isRoad, collidersNear} from '../dist/world-layout.js';
import {InfiniteCity} from '../dist/infinite-city.js';
import {describeHorizonChunk} from '../dist/city-horizon.js';

const venues=[[-3,0],[-3,-1],[-3,-2],[-3,-3],[-4,-2],[-4,0]];
const overlap=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ;
test('six distinct city destinations preserve deterministic blocks, road access and safe actual vehicle spawns',()=>{
  const seen=new Set();
  for(const [cx,cz] of venues){
    const a=generateChunk(cx,cz,610),b=getMetroChunk(cx,cz,610);
    assert.deepEqual(a,b);assert.deepEqual(a,generateChunk(cx,cz,610));
    assert.equal(a.metro,true);assert.equal(districtAt(a.x+64,a.z+64).id,a.district.id);
    assert.equal(a.buildings.length,4);assert.ok(a.vehicleSpawns.length<=4);
    seen.add(a.district.id);
    for(const c of a.colliders){
      assert.ok(c.minX>=a.x+18&&c.maxX<=a.x+110,`${a.key}: ${c.id}`);
      assert.ok(c.minZ>=a.z+18&&c.maxZ<=a.z+110,`${a.key}: ${c.id}`);
      assert.ok(c.height>0&&Number.isFinite(c.height));
    }
    for(const v of a.vehicleSpawns){
      const radius=v.kind==='helicopter'?3.6:v.kind==='truck'?3.5:2.5;
      for(const c of a.colliders){
        if((c.minY||0)>2.5)continue;
        assert.equal(overlap({minX:v.x-radius,maxX:v.x+radius,minZ:v.z-radius,maxZ:v.z+radius},c),false,`${a.key}/${v.kind} conflicts ${c.id}`);
      }
    }
    for(const t of[3,32,64,100,125]){assert.equal(isRoad(a.x+3,a.z+t),true);assert.equal(isRoad(a.x+t,a.z+3),true);}
  }
  assert.equal(seen.size,6);assert.equal(getMetroChunk(-800,900),null);
  assert.ok(CITY_POINTS_OF_INTEREST.some(p=>p.kind==='aviation'));
});

test('new venues have finite bounded geometry at all LODs and retain their large far silhouettes',()=>{
  const kinds=new Set();
  for(const [cx,cz] of venues){
    const chunk=generateChunk(cx,cz);
    for(const e of chunk.cityElements)kinds.add(e.kind);
    for(let lod=0;lod<3;lod++){
      const r=describeCityElements(chunk.cityElements,lod);
      assert.ok(r.length>15&&r.length<350,`${chunk.key}: ${r.length}`);
      for(const p of r)for(const key of['x','y','z','sx','sy','sz'])assert.ok(Number.isFinite(p[key]),`${p.type}/${key}`);
      for(const p of r)assert.ok(p.sx>0&&p.sy>0&&p.sz>0);
    }
    const far=describeHorizonChunk(chunk);
    if(['cargo','hills','transit'].includes(chunk.district.id))assert.ok(far.some(r=>r.y>7&&!r.buildingId));
  }
  for(const k of['basketball','skate','flyover','container','crane','helipad','hangar','hill','crest-sign','market','fuel'])assert.ok(kinds.has(k));
});

test('beach sports equipment and elevated transit collisions agree with their playable levels',()=>{
  assert.ok(COAST_CITY_ELEMENTS.some(e=>e.kind==='basketball'));
  const guard=cityElementColliders(COAST_CITY_ELEMENTS).find(c=>c.id.startsWith('coast/lifeguard'));
  assert.ok(collidersNear(84,29).some(c=>c.id===guard.id));
  const transit=generateChunk(-3,-1),deck=transit.colliders.find(c=>c.kind==='overhead');
  assert.equal(deck.minY,7.5);assert.equal(deck.maxY,9);
  assert.ok(transit.cityElements.some(e=>e.kind==='flyover'));
  // Initial mission contact and initial vehicles keep clear of all new pieces.
  for(const [x,z,r] of[[13,13,.7],[7,30,3],[7,78,3],[7,218,3.6]])
    for(const c of cityElementColliders(COAST_CITY_ELEMENTS))assert.equal(overlap({minX:x-r,maxX:x+r,minZ:z-r,maxZ:z+r},c),false);
});

test('rich metropolitan scenery uses the existing instance pools and survives origin shifts',()=>{
  const scene=new THREE.Scene(),city=new InfiniteCity(scene,{mobile:true});
  for(let i=0;i<40;i++)city.update(-320,-128,-384,-128);
  assert.equal(city.chunks.size,25);assert.ok(city.stats.instances<26000);assert.ok(city.pools.size<=25);assert.ok(city.colors.size<=240);
  const matrix=new THREE.Matrix4();
  for(const pool of city.pools.values())for(let n=0;n<pool.count;n++){pool.getMatrixAt(n,matrix);assert.ok(matrix.elements.every(Number.isFinite));}
  city.dispose();assert.equal(scene.children.length,0);
});

test('court and helipad markings are above their color layer and the underlying plaza',()=>{
  for(const [cx,cz,kind] of [[-3,0,'basketball'],[-3,-3,'helipad']]){
    const city=new InfiniteCity(new THREE.Scene(),{radius:0,horizon:false});
    city.update(cx*128+64,cz*128+64);
    const chunk=city.chunks.get(`${cx},${cz}`),venue=chunk.data.cityElements.find(f=>f.kind===kind);
    const paints=describeCityElements([venue],0).filter(r=>r.type==='paint');
    const color=paints.find(r=>r.x===venue.x&&r.z===venue.z&&r.sx===venue.width&&r.sz===venue.depth);
    assert.ok(color);
    const paving=chunk.records.filter(r=>r.type==='paving'&&Math.abs(r.x-venue.x)<=r.sx/2&&Math.abs(r.z-venue.z)<=r.sz/2);
    const plazaTop=Math.max(...paving.map(r=>r.y+r.sy/2));
    assert.ok(color.y-color.sy/2>plazaTop,`${kind} surface must not be buried in paving`);
    for(const line of paints.filter(r=>r!==color))assert.ok(line.y-line.sy/2>color.y+color.sy/2,`${kind} line must not share its base plane`);
    city.dispose();
  }
});
