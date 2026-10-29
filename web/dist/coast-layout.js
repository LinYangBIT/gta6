import { coastCityElements, cityElementColliders, COAST_CITY_ELEMENTS } from './metro-districts.js?v=12';
/** A connected, hand-authored coastal quarter, surrounded by the infinite city.
 * One source of truth for asphalt, architecture, vehicles and collision queries.
 * The boulevard's east side opens into a beach, rather than another square block.
 */
export const COAST_BOUNDS = Object.freeze({ minX:-256, maxX:1024, minZ:-512, maxZ:256 });
const S=128, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const P=(x,z)=>({x,z});
const hash=(...parts)=>{let h=2166136261;for(const c of parts.join('|'))h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>16;return h>>>0;};
export const COAST_DISTRICT=Object.freeze({id:'ocean-drive',name:'海洋大道',label:'OCEAN DRIVE · 海洋大道',colors:['#426e82','#9b9ab5','#8f648d'],styles:['hotel','deco'],floors:[3,8]});
export function inCoast(x,z){return x>=COAST_BOUNDS.minX&&x<COAST_BOUNDS.maxX&&z>=COAST_BOUNDS.minZ&&z<COAST_BOUNDS.maxZ;}
const inBounds=(x,z,pad=0)=>x>=COAST_BOUNDS.minX-pad&&x<=COAST_BOUNDS.maxX+pad&&z>=COAST_BOUNDS.minZ-pad&&z<=COAST_BOUNDS.maxZ+pad;

function samples(controls,smooth=false){
 const result=[];
 for(let i=0;i<controls.length-1;i++){
  const a=controls[i],b=controls[i+1],p=controls[Math.max(0,i-1)],q=controls[Math.min(controls.length-1,i+2)];
  const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/5));
  for(let j=0;j<count;j++){
   const t=j/count,t2=t*t,t3=t2*t;
   const coordinate=k=>smooth?.5*((2*a[k])+(-p[k]+b[k])*t+(2*p[k]-5*a[k]+4*b[k]-q[k])*t2+(-p[k]+3*a[k]-3*b[k]+q[k])*t3):a[k]+(b[k]-a[k])*t;
   result.push(P(coordinate('x'),coordinate('z')));
  }
 }
 result.push({...controls.at(-1)});return result;
}
const road=(id,name,kind,width,controls,smooth=false,sidewalkWidth=3.8)=>({id,name,kind,width,sidewalkWidth,points:samples(controls.map(p=>Array.isArray(p)?P(...p):p),smooth)});
const circle=[];for(let i=0;i<=40;i++){const t=i/40*Math.PI*2;circle.push(P(-128+Math.cos(t)*22,-160+Math.sin(t)*22));}
export const COAST_ROADS=Object.freeze([
 road('ocean-drive','Ocean Drive','boulevard',18,[[0,256],[0,128],[0,64],[0,30],[0,0],[0,-18],[-12,-40],[-26,-70],[-20,-100],[0,-128],[18,-170],[25,-215],[0,-256],[-18,-295],[-20,-335],[0,-384],[12,-430],[0,-480],[0,-512]],true,4.2),
 road('palm-south','Palm Avenue','avenue',16,[[-128,256],[-128,128],[-128,0],[-128,-80],[-128,-138]],false,3.6),
 road('palm-north','Palm Avenue','avenue',16,[[-128,-182],[-128,-256],[-128,-384],[-128,-512]],false,3.6),
 {...road('fountain-circle','Fountain Circle','roundabout',12,circle,false,2.8),closed:true},
 road('sunset-diagonal','Sunset Cut','avenue',14,[[-256,-128],[-215,-135],[-180,-151],[-150,-160]],true,3.3),
 road('circle-to-coast','Coral Connector','avenue',14,[[-106,-160],[-80,-160],[-45,-164],[18,-170]],true,3.3),
 road('calle-ocho','Calle Ocho','avenue',16,[[-256,0],[-128,0],[-82,0],[0,0]],false,3.8),
 road('south-crossing','Beach Garden Road','avenue',16,[[-256,128],[-128,128],[-82,128],[0,128]],false,3.8),
 road('north-crossing','Marina Approach','avenue',16,[[-256,-256],[-128,-256],[0,-256]],false,3.6),
 road('causeway-land','Causeway Avenue','avenue',18,[[-256,-384],[-128,-384],[0,-384],[96,-384]],false,3.2),
 road('bay-causeway','Biscayne Causeway','bridge',18,[[96,-384],[128,-384],[256,-384],[384,-384],[512,-384],[640,-384],[768,-384],[896,-384],[1024,-384]],false,3.2),
 road('hotel-alley','Hotel Service Lane','alley',7,[[-82,128],[-82,80],[-82,8],[-82,0]],false,1.2),
 road('market-lane','Market Lane','alley',7,[[-256,-70],[-210,-70],[-175,-70],[-128,-80]],true,1.2),
]);
const roadSegments=[];
for(const r of COAST_ROADS)for(let i=0;i<r.points.length-1;i++)roadSegments.push({a:r.points[i],b:r.points[i+1],index:i,road:r});
const nearbySegments=new Map();
for(const segment of roadSegments){
 const margin=segment.road.width/2+segment.road.sidewalkWidth+1;
 for(let cx=Math.floor((Math.min(segment.a.x,segment.b.x)-margin)/S);cx<=Math.floor((Math.max(segment.a.x,segment.b.x)+margin)/S);cx++)
  for(let cz=Math.floor((Math.min(segment.a.z,segment.b.z)-margin)/S);cz<=Math.floor((Math.max(segment.a.z,segment.b.z)+margin)/S);cz++){const key=`${cx},${cz}`;if(!nearbySegments.has(key))nearbySegments.set(key,[]);nearbySegments.get(key).push(segment);}
}
const segmentsNear=(x,z)=>nearbySegments.get(`${Math.floor(x/S)},${Math.floor(z/S)}`)||[];
export function projectToCoastSegment(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return {x:a.x+t*dx,z:a.z+t*dz,t,distance:Math.hypot(x-a.x-t*dx,z-a.z-t*dz)};}
export function coastRoadAt(x,z){
 if(!inCoast(x,z))return null;
 for(const s of segmentsNear(x,z))if(projectToCoastSegment(x,z,s.a,s.b).distance<=s.road.width/2+.001)return true;
 return false;
}
export function coastRoadDistance(x,z){let best=Infinity;for(const s of roadSegments)best=Math.min(best,projectToCoastSegment(x,z,s.a,s.b).distance-s.road.width/2);return best;}

const bounds=b=>({minX:b.x-b.width/2,maxX:b.x+b.width/2,minZ:b.z-b.depth/2,maxZ:b.z+b.depth/2});
const overlap=(a,b,p=0)=>a.minX<b.maxX+p&&a.maxX>b.minX-p&&a.minZ<b.maxZ+p&&a.maxZ>b.minZ-p;
function segmentHits(a,b,r,pad=0){
 let lo=0,hi=1;
 for(const[k,min,max]of[['x',r.minX-pad,r.maxX+pad],['z',r.minZ-pad,r.maxZ+pad]]){const d=b[k]-a[k];if(Math.abs(d)<1e-9){if(a[k]<min||a[k]>max)return false;}else{const t0=(min-a[k])/d,t1=(max-a[k])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));}}
 return lo<=hi;
}
const building=(id,x,z,width,depth,height,floors,landmark,color,accent,style='hotel')=>({id:`coast/${id}`,x,z,width,depth,height,floors,landmark,style,color,accent,orientation:0,detailSeed:hash(id),roof:'terrace'});
const buildings=[
 building('colony',-36,40,28,36,16,4,'colony','#438b98','#40e8f2'),
 building('dominion',-58,-61,28,40,22,5,'dominion','#9b8fad','#ff4fb6'),
 building('dixon',-56,-103,28,26,29,7,'dixon','#8a739f','#ffc86a'),
 building('coral',-36,94,28,34,16,4,'coral','#a25c8f','#40e8f2'),
 building('marina-palace',-30,-211,32,44,23,6,'dominion','#778fa7','#b085ff'),
];
// Urban parcels line each street first, then the remaining inland block interiors.
// This replaces isolated buildings in broad empty lots with continuous, varied
// frontage while preserving the hand-modelled hotels, their lanes and the beach.
const protectedPlots=[
 {minX:-244,maxX:-176,minZ:-123,maxZ:-85}, // Market court and its planted edges.
 {minX:-145,maxX:-111,minZ:-177,maxZ:-143}, // Roundabout green island.
];
function addInfill(id,x,z,width,depth,frontageRoad=null){
 const r={minX:x-width/2,maxX:x+width/2,minZ:z-depth/2,maxZ:z+depth/2};
 // Keep a full street/sidewalk setback at the portals and leave the coast open.
 if(r.minX<-242||r.maxX>12||r.minZ<-498||r.maxZ>242)return false;
 if(protectedPlots.some(plot=>overlap(r,plot,2)))return false;
 if(buildings.some(other=>overlap(r,bounds(other),2)))return false;
 if(roadSegments.some(s=>segmentHits(s.a,s.b,r,s.road.width/2+4.5)))return false;
 const n=hash('infill',id),inland=x<-145;
 let floors=inland?6+(n>>>5)%9:3+(n>>>5)%6;
 let style=inland&&n%5===0?'glass':n%4===0?'brick':n%3===0?'residential':'deco';
 // Scattered office clusters rise behind the lower seafront, not in front of it.
 if(inland&&z<-190&&n%7===0){floors=18+(n>>>12)%7;style='glass';}
 const floorHeight=style==='glass'?3.65:3.2;
 const palette=style==='glass'?['#315c78','#437a89','#526c8e']:['#7f6d88','#8b627c','#4d7b81','#8f8194','#985d90','#477d95'];
 const b=building(`infill-${id}`,x,z,width,depth,Math.round((floors*floorHeight+.6)*100)/100,floors,null,palette[n%palette.length],['#40e8f2','#ff4fb6','#b085ff','#ffc86a'][(n>>>8)%4],style);
 let closest=null;
 for(const s of roadSegments){const p=projectToCoastSegment(x,z,s.a,s.b);if(!closest||p.distance<closest.distance)closest=p;}
 const dx=closest.x-x,dz=closest.z-z;
 b.infill=true;b.frontageRoad=frontageRoad;
 b.frontage=Math.abs(dx)>Math.abs(dz)?dx>0?'east':'west':dz>0?'south':'north';
 // Footprints are axis-aligned. The frontage flag gives renderers the entrance
 // direction without rotating rectangular plots into a neighbouring building.
 b.orientation={north:0,west:Math.PI/2,south:Math.PI,east:-Math.PI/2}[b.frontage];
 buildings.push(b);return true;
}
for(const road of COAST_ROADS){
 if(['bridge','roundabout'].includes(road.kind))continue;
 let travelled=0,next=19,parcel=0;
 for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
  while(travelled+length>=next){
   const t=(next-travelled)/length,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,nx=(b.z-a.z)/length,nz=-(b.x-a.x)/length;
   for(const side of[-1,1]){
    const n=hash(road.id,parcel,side),vertical=Math.abs(nx)>.6;
    const width=vertical?19+n%5:17+n%4,depth=vertical?17+(n>>>4)%4:19+(n>>>4)%5;
    const setback=road.width/2+5+Math.abs(nx)*width/2+Math.abs(nz)*depth/2;
    addInfill(`${road.id}-${parcel}-${side}`,x+side*nx*setback,z+side*nz*setback,width,depth,road.id);
   }
   next+=23;parcel++;
  }
  travelled+=length;
 }
}
// Smaller courtyard wings and apartment blocks occupy deep parcels. Exact
// rectangle/segment checks keep diagonal roads and every alley fully usable.
for(let z=-480;z<240;z+=22)for(let x=-228;x<6;x+=22){
 const n=hash('courtyard',x,z);
 addInfill(`courtyard-${x}-${z}`,x,z,16+n%4,16+(n>>>4)%4);
}
export const COAST_BUILDINGS=Object.freeze(buildings);
export const COAST_FEATURES=Object.freeze([
 {id:'coastal-park',kind:'park',x:43,z:-128,width:46,depth:768,coastalPark:true},
 ...[[-512,-396],[-372,-365],[-303,256]].map(([from,to],i)=>({id:`promenade-${i}`,kind:'promenade',x:52,z:(from+to)/2,width:4,depth:to-from})),
 {id:'beach',kind:'beach',x:88,z:-128,width:44,depth:768},
 {id:'bay',kind:'ocean',x:567,z:-128,width:914,depth:768},
 {id:'fountain-island',kind:'roundabout',x:-128,z:-160,width:30,depth:30,radius:15},
 {id:'marina-inlet',kind:'marina',x:59,z:-334,width:48,depth:62},
 {id:'market-court',kind:'plaza',x:-210,z:-104,width:62,depth:32},
]);
export function coastGroundHeight(x,z){
 if(!inCoast(x,z))return null;
 let sidewalk=false;
 for(const s of segmentsNear(x,z)){const d=projectToCoastSegment(x,z,s.a,s.b).distance;if(d<=s.road.width/2+.001)return .03;if(d<=s.road.width/2+s.road.sidewalkWidth)sidewalk=true;}
 if(sidewalk)return .22;
 if(COAST_FEATURES.some(f=>['promenade','plaza'].includes(f.kind)&&Math.abs(x-f.x)<=f.width/2&&Math.abs(z-f.z)<=f.depth/2))return .22;
 return .02;
}
const water=[
 {id:'coast/bay/north',kind:'water',minX:110,maxX:1024,minZ:-512,maxZ:-396},
 {id:'coast/bay/south',kind:'water',minX:110,maxX:1024,minZ:-372,maxZ:256},
 {id:'coast/marina',kind:'water',minX:35,maxX:83,minZ:-365,maxZ:-303},
 {id:'coast/fountain',kind:'fountain',minX:-135,maxX:-121,minZ:-167,maxZ:-153},
];
const allColliders=[...buildings.map(b=>({id:b.id,kind:'building',height:b.height+5,...bounds(b)})),...water,...cityElementColliders(COAST_CITY_ELEMENTS)];
export function coastCollidersNear(x,z){if(!inBounds(x,z,16))return null;return allColliders.filter(r=>r.minX<=x+16&&r.maxX>=x-16&&r.minZ<=z+16&&r.maxZ>=z-16);}

export const COAST_MISSION_STOPS=Object.freeze([
 {label:'Colony 海滨酒店',parking:P(3,128),contact:P(13,141)},
 {label:'棕榈大道唱片店',parking:P(-125,128),contact:P(-117,141)},
 {label:'Marina 湾畔照相馆',parking:P(-125,-256),contact:P(-117,-243)},
 {label:'Biscayne 跨湾入口',parking:P(3,-384),contact:P(13,-371)},
]);
export const COAST_PEDESTRIAN_PATHS=Object.freeze([
 {points:[P(13,20),P(13,110)],speed:1.05},
 {points:[P(-117,22),P(-117,111)],speed:1.15},
 {points:[P(-117,-306),P(-117,-271)],speed:.95},
 {points:[P(52,30),P(52,110)],speed:1.0},
 {points:[P(-244,11),P(-150,11)],speed:1.2},
]);
const spawns=[{x:7,z:30,yaw:Math.PI,hero:true},{x:7,z:78,yaw:Math.PI}];
for(const r of COAST_ROADS){
 if(['bridge','roundabout','alley'].includes(r.kind))continue;
 let travelled=0,next=38;
 for(let i=0;i<r.points.length-1;i++){
  const a=r.points[i],b=r.points[i+1],length=Math.hypot(b.x-a.x,b.z-a.z);
  if(travelled+length>=next){
   const t=(next-travelled)/length,fx=(b.x-a.x)/length,fz=(b.z-a.z)/length,side=hash(r.id,i)%2?1:-1;
   const v={x:a.x+(b.x-a.x)*t+fz*side*(r.width/2-2),z:a.z+(b.z-a.z)*t-fx*side*(r.width/2-2),yaw:Math.atan2(fx,fz)+(side>0?0:Math.PI)};
   const safe=!allColliders.some(c=>v.x>c.minX-3&&v.x<c.maxX+3&&v.z>c.minZ-3&&v.z<c.maxZ+3)&&!spawns.some(o=>Math.hypot(v.x-o.x,v.z-o.z)<20);
   // Keep junctions and small curving connectors open to manoeuvre.
   const crossings=COAST_ROADS.filter(other=>other!==r).some(other=>other.points.some(p=>Math.hypot(v.x-p.x,v.z-p.z)<14));
   if(safe&&!crossings&&inCoast(v.x,v.z))spawns.push(v);
   next+=49;
  }
  travelled+=length;
 }
}
const spawnsByChunk=new Map();
for(const v of spawns){const key=`${Math.floor(v.x/S)},${Math.floor(v.z/S)}`;if(!spawnsByChunk.has(key))spawnsByChunk.set(key,[]);const list=spawnsByChunk.get(key);if(list.length<4)list.push(v);}

export function getCoastChunk(cx,cz,seed=610){
 const x=cx*S,z=cz*S;if(!inCoast(x+.5,z+.5))return null;
 const key=`${cx},${cz}`,r={minX:x,maxX:x+S,minZ:z,maxZ:z+S};
 const roads=[];
 for(const road of COAST_ROADS){const segments=[];for(let i=0;i<road.points.length-1;i++){const a=road.points[i],b=road.points[i+1],mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;if(mx>=x&&mx<x+S&&mz>=z&&mz<z+S)segments.push({a,b,index:i});}if(segments.length)roads.push({...road,segments});}
 const features=[];
 for(const f of COAST_FEATURES){const b=bounds(f);if(!overlap(r,b))continue;const minX=Math.max(r.minX,b.minX),maxX=Math.min(r.maxX,b.maxX),minZ=Math.max(r.minZ,b.minZ),maxZ=Math.min(r.maxZ,b.maxZ);features.push({...f,x:(minX+maxX)/2,z:(minZ+maxZ)/2,width:maxX-minX,depth:maxZ-minZ,detailSeed:hash(seed,key,f.id),sourceX:f.x,sourceZ:f.z,sourceWidth:f.width,sourceDepth:f.depth});}
 const owned=buildings.filter(b=>b.x>=x&&b.x<x+S&&b.z>=z&&b.z<z+S).map(b=>({...b,detailSeed:hash(seed,b.id)}));
 return {key,cx,cz,x,z,seed,detailSeed:hash('coast',key,seed),layout:'coastal',coastal:true,district:COAST_DISTRICT,buildings:owned,features,roads,cityElements:coastCityElements(cx,cz),colliders:allColliders.filter(c=>overlap(r,c)),vehicleSpawns:(spawnsByChunk.get(key)||[]).map(v=>({...v}))};
}

// Every connector shares exact sample nodes. This avoids fake grid navigation
// through the roundabout island and hotels when a mission changes its target.
const nodes=[],nodeByKey=new Map(),edges=[];
const node=p=>{const k=`${p.x.toFixed(4)},${p.z.toFixed(4)}`;if(nodeByKey.has(k))return nodeByKey.get(k);const i=nodes.length;nodes.push(p);edges.push([]);nodeByKey.set(k,i);return i;};
for(const s of roadSegments){s.ai=node(s.a);s.bi=node(s.b);const cost=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);edges[s.ai].push({to:s.bi,cost});edges[s.bi].push({to:s.ai,cost});}
function nearest(position){let best=null;for(const s of roadSegments){const p=projectToCoastSegment(position.x,position.z,s.a,s.b);if(!best||p.distance<best.distance)best={...p,segment:s};}return best;}
export function coastRoute(start,end){
 if(!start||!end||!inBounds(start.x,start.z,1)||!inBounds(end.x,end.z,1))return null;
 const a=nearest(start),b=nearest(end);if(!a||!b)return null;
 if(a.distance>35||b.distance>35)return null;
 const costs=new Float64Array(nodes.length);costs.fill(Infinity);const previous=new Int32Array(nodes.length);previous.fill(-1);const visited=new Uint8Array(nodes.length);
 for(const i of[a.segment.ai,a.segment.bi])costs[i]=Math.hypot(nodes[i].x-a.x,nodes[i].z-a.z);
 for(let count=0;count<nodes.length;count++){
  let current=-1;for(let i=0;i<nodes.length;i++)if(!visited[i]&&(current<0||costs[i]<costs[current]))current=i;
  if(current<0||!Number.isFinite(costs[current]))break;visited[current]=1;
  for(const e of edges[current]){const candidate=costs[current]+e.cost;if(candidate<costs[e.to]){costs[e.to]=candidate;previous[e.to]=current;}}
 }
 let finish=-1,best=Infinity;
 for(const i of[b.segment.ai,b.segment.bi]){const cost=costs[i]+Math.hypot(nodes[i].x-b.x,nodes[i].z-b.z);if(cost<best){best=cost;finish=i;}}
 if(finish<0||!Number.isFinite(best))return null;
 const result=[];for(let i=finish;i!==-1;i=previous[i])result.unshift({...nodes[i]});result.unshift(P(a.x,a.z));result.push(P(b.x,b.z),{x:end.x,z:end.z});
 return result.filter((p,i)=>i===0||Math.hypot(p.x-result[i-1].x,p.z-result[i-1].z)>.05);
}
