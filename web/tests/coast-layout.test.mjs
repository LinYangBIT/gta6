import test from 'node:test';
import assert from 'node:assert/strict';
import { COAST_BOUNDS, COAST_ROADS, COAST_BUILDINGS, COAST_FEATURES,
  COAST_MISSION_STOPS, COAST_PEDESTRIAN_PATHS, getCoastChunk, coastRoadAt,
  coastRoadDistance, coastGroundHeight, coastCollidersNear, coastRoute } from '../dist/coast-layout.js';
import { generateChunk, isRoad, collidersNear } from '../dist/world-layout.js';

const inside=(p,c,pad=0)=>p.x>c.minX-pad&&p.x<c.maxX+pad&&p.z>c.minZ-pad&&p.z<c.maxZ+pad;
const clear=(p,radius=0)=>!(coastCollidersNear(p.x,p.z)||[]).some(c=>inside(p,c,radius));
function eachStep(points,fn,spacing=1){for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/spacing);for(let j=0;j<=n;j++)fn({x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n});}}

test('coastal geometry is deterministic and every drawn road segment has one streamed owner',()=>{
 const owned=new Set(),ids=new Set();
 for(let cx=-2;cx<8;cx++)for(let cz=-4;cz<2;cz++){
  const a=getCoastChunk(cx,cz,610);assert.equal(a.coastal,true);assert.deepEqual(generateChunk(cx,cz,610),a);
  assert.deepEqual(getCoastChunk(cx,cz,610),a);
  assert.ok(a.vehicleSpawns.length<=4);
  for(const b of a.buildings){assert.ok(!ids.has(b.id));ids.add(b.id);}
  for(const road of a.roads)for(const s of road.segments){const key=`${road.id}/${s.index}`;assert.ok(!owned.has(key),key);owned.add(key);assert.equal(Math.floor((s.a.x+s.b.x)/256),cx);assert.equal(Math.floor((s.a.z+s.b.z)/256),cz);}
 }
 assert.equal(ids.size,COAST_BUILDINGS.length);
 assert.equal(owned.size,COAST_ROADS.reduce((sum,r)=>sum+r.points.length-1,0));
 assert.equal(getCoastChunk(-3,0),null);assert.equal(getCoastChunk(8,0),null);
 const start=getCoastChunk(0,0).vehicleSpawns;
 assert.deepEqual(start.slice(0,2),[{x:7,z:30,yaw:Math.PI,hero:true},{x:7,z:78,yaw:Math.PI}]);
});

test('all named roads including the hotel alley join the navigable coastal graph',()=>{
 for(const road of COAST_ROADS){
  const start=road.points[Math.floor(road.points.length/2)];
  const path=coastRoute(start,{x:3,z:30});assert.ok(path&&path.length>1,road.id);
  eachStep(path,p=>{assert.ok(coastRoadDistance(p.x,p.z)<.01,`${road.id}: ${JSON.stringify(p)}`);assert.ok(clear(p,1.25),`${road.id} blocked at ${JSON.stringify(p)}`);});
 }
 const around=coastRoute({x:-128,z:-137},{x:-128,z:-183});
 assert.ok(around.some(p=>Math.abs(p.x+128)>20));
 eachStep(around,p=>assert.ok(Math.hypot(p.x+128,p.z+160)>=21.7));
 const curved=coastRoute({x:7,z:30},{x:3,z:-128});
 assert.ok(curved.some(p=>p.x<-24));
 assert.equal(coastRoute({x:9999,z:9999},{x:0,z:0}),null);
});

test('asphalt mask agrees with rendered centerlines and accessible portals connect to the infinite grid',()=>{
 for(const road of COAST_ROADS)eachStep(road.points,p=>{
  if(p.x>=COAST_BOUNDS.maxX||p.z>=COAST_BOUNDS.maxZ)return;
  assert.equal(coastRoadAt(p.x,p.z),true,`${road.id} ${JSON.stringify(p)}`);
  assert.equal(isRoad(p.x,p.z),true);assert.ok(clear(p,1.25));
 },2);
 for(const p of[{x:0,z:-512},{x:-128,z:-512},{x:0,z:256},{x:-128,z:256},{x:1024,z:-384},{x:-256,z:0},{x:-256,z:128},{x:-256,z:-128},{x:-256,z:-256},{x:-256,z:-384}]){
  const route=coastRoute({x:0,z:30},p);assert.ok(route,JSON.stringify(p));
  assert.equal(isRoad(p.x,p.z),true);assert.ok(clear(p));
 }
 assert.equal(coastRoadAt(7,78),true);assert.equal(coastRoadAt(52,70),false);
 assert.equal(coastRoadAt(400,64),false);assert.equal(coastRoadAt(-400,64),null);
 assert.equal(generateChunk(20,20).coastal,undefined);
});

test('hotel facades, mission contacts, cars and footpaths have physical clearance',()=>{
 const landmarks=new Set(COAST_BUILDINGS.map(b=>b.landmark));
 for(const name of['colony','dominion','dixon','coral'])assert.ok(landmarks.has(name));
 for(const b of COAST_BUILDINGS){
  const footprint={minX:b.x-b.width/2,maxX:b.x+b.width/2,minZ:b.z-b.depth/2,maxZ:b.z+b.depth/2};
  for(let x=footprint.minX;x<=footprint.maxX;x+=2)for(let z=footprint.minZ;z<=footprint.maxZ;z+=2)assert.ok(coastRoadDistance(x,z)>=3.5,b.id);
  for(const other of COAST_BUILDINGS)if(other!==b)assert.ok(Math.abs(other.x-b.x)>=(other.width+b.width)/2||Math.abs(other.z-b.z)>=(other.depth+b.depth)/2,`${b.id}/${other.id}`);
 }
 for(const p of[{x:13,z:30},{x:13,z:13},{x:3,z:-128},{x:13,z:-115},...COAST_MISSION_STOPS.flatMap(s=>[s.parking,s.contact])])assert.ok(clear(p,.5),JSON.stringify(p));
 for(const s of COAST_MISSION_STOPS){assert.equal(isRoad(s.parking.x,s.parking.z),true);assert.ok(coastRoute({x:7,z:30},s.parking));}
 for(const path of COAST_PEDESTRIAN_PATHS)eachStep(path.points,p=>{assert.ok(clear(p,.5));assert.equal(coastGroundHeight(p.x,p.z),.22,JSON.stringify(p));});
 for(let cx=-2;cx<8;cx++)for(let cz=-4;cz<2;cz++)for(const p of getCoastChunk(cx,cz).vehicleSpawns){assert.ok(clear(p,1.4));assert.equal(isRoad(p.x,p.z),true);}
});

test('water prevents land travel while the causeway and marina approaches stay clear',()=>{
 for(const p of[{x:111,z:0},{x:500,z:-450},{x:59,z:-334}])assert.ok(collidersNear(p.x,p.z).some(c=>c.kind==='water'&&inside(p,c)));
 for(let x=96;x<=1024;x+=4){assert.ok(clear({x,z:-384},1.5));assert.equal(isRoad(x,-384),true);}
 assert.equal(coastGroundHeight(7,30),.03);assert.equal(coastGroundHeight(13,30),.22);
 assert.equal(coastGroundHeight(52,70),.22);assert.equal(coastGroundHeight(88,70),.02);
 assert.equal(coastGroundHeight(-300,0),null);
 assert.ok(COAST_FEATURES.some(f=>f.kind==='ocean'&&f.x+f.width/2===1024));
});
