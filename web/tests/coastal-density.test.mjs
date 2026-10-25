import test from 'node:test';
import assert from 'node:assert/strict';
import { COAST_BUILDINGS, COAST_ROADS, getCoastChunk } from '../dist/coast-layout.js';

const bounds=b=>({minX:b.x-b.width/2,maxX:b.x+b.width/2,minZ:b.z-b.depth/2,maxZ:b.z+b.depth/2});
const overlaps=(a,b,pad=0)=>a.minX<b.maxX+pad&&a.maxX>b.minX-pad&&a.minZ<b.maxZ+pad&&a.maxZ>b.minZ-pad;
function segmentHits(a,b,r,pad){
 let lo=0,hi=1;
 for(const [k,min,max] of [['x',r.minX-pad,r.maxX+pad],['z',r.minZ-pad,r.maxZ+pad]]){
  const d=b[k]-a[k];
  if(Math.abs(d)<1e-9){if(a[k]<min||a[k]>max)return false;}
  else{const t0=(min-a[k])/d,t1=(max-a[k])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));}
 }
 return lo<=hi;
}

test('the landward coastal quarter has connected urban density and a varied skyline',()=>{
 assert.ok(COAST_BUILDINGS.length>=120,'the 19-building isolated-plot layout must not return');
 const area=COAST_BUILDINGS.reduce((sum,b)=>sum+b.width*b.depth,0);
 assert.ok(area/(256*768)>.22,'inland coverage should read as city blocks rather than empty lots');
 for(let cz=-4;cz<2;cz++)for(const cx of [-2,-1])assert.ok(getCoastChunk(cx,cz).buildings.length>=4,`empty inland block ${cx},${cz}`);
 const infill=COAST_BUILDINGS.filter(b=>b.infill);
 assert.ok(infill.filter(b=>b.frontageRoad).length>=65,'street frontages are populated before back lots');
 assert.ok(new Set(infill.map(b=>b.style)).size>=4);
 assert.ok(infill.some(b=>b.floors<=4)&&infill.some(b=>b.floors>=18));
 assert.ok(infill.every(b=>b.landmark===null&&Number.isFinite(b.height)&&b.height>9));
 const facing={north:0,west:Math.PI/2,south:Math.PI,east:-Math.PI/2};
 for(const b of infill)assert.equal(b.orientation,facing[b.frontage],`${b.id} frontage orientation`);
});

test('the five coastal landmarks keep their original footprints amid new infill',()=>{
 const expected=[['colony',-36,40,28,36],['dominion',-58,-61,28,40],['dixon',-56,-103,28,26],['coral',-36,94,28,34],['marina-palace',-30,-211,32,44]];
 const landmarks=COAST_BUILDINGS.filter(b=>b.landmark);
 assert.equal(landmarks.length,expected.length);
 for(const [id,x,z,width,depth] of expected){const b=landmarks.find(b=>b.id===`coast/${id}`);assert.ok(b,id);assert.deepEqual([b.x,b.z,b.width,b.depth],[x,z,width,depth]);}
});

test('dense parcels leave sidewalks, market court, green island and beach clear',()=>{
 const market={minX:-244,maxX:-176,minZ:-123,maxZ:-85},island={minX:-145,maxX:-111,minZ:-177,maxZ:-143};
 const segments=COAST_ROADS.flatMap(road=>road.points.slice(1).map((b,i)=>({a:road.points[i],b,width:road.width})));
 for(const building of COAST_BUILDINGS.filter(b=>b.infill)){
  const r=bounds(building);
  assert.ok(r.minX>=-242&&r.maxX<=12&&r.minZ>=-498&&r.maxZ<=242,building.id);
  assert.ok(!overlaps(r,market,2)&&!overlaps(r,island,2),`${building.id} public space`);
  for(const other of COAST_BUILDINGS)if(building!==other)assert.ok(!overlaps(r,bounds(other),1.999),`${building.id} / ${other.id}`);
  for(const segment of segments)assert.ok(!segmentHits(segment.a,segment.b,r,segment.width/2+4.49),`${building.id} sidewalk setback`);
 }
});
