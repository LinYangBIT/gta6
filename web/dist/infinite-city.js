import * as THREE from './vendor/three.module.js';
import { CHUNK_SIZE, generateChunk, districtAt } from './world-layout.js';

const WHITE = '#e9decc';
const DARK = '#20303b';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function random(seed) {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let x = n; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}

/** Window rows remain detailed at long range without thousands of window meshes. */
function facadeMaterial(glass = false) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: glass ? .28 : .78, metalness: glass ? .52 : .04 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = `attribute float facadeSeed;varying vec2 vFacadeUv;varying vec2 vFacadeSize;varying float vFacadeSeed;varying float vFacadeWall;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vFacadeUv=uv;vFacadeSeed=facadeSeed;vFacadeWall=1.0-abs(normal.y);
      vFacadeSize=vec2(abs(normal.x)>.5?length(instanceMatrix[2].xyz):length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));`);
    shader.fragmentShader = `varying vec2 vFacadeUv;varying vec2 vFacadeSize;varying float vFacadeSeed;varying float vFacadeWall;
      float windowHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+vFacadeSeed*17.1)*43758.5453);}\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 facadeCells=vec2(max(2.0,floor(vFacadeSize.x/3.0)),max(1.0,floor(vFacadeSize.y/3.4)));
      vec2 facadeUV=vFacadeUv*facadeCells;
      vec2 pane=fract(facadeUV);
      float border=${glass ? '.055' : '.19'};
      float paneMask=step(border,pane.x)*step(pane.x,1.0-border)*step(.23,pane.y)*step(pane.y,.82);
      float facadeMask=paneMask*step(.045,vFacadeUv.x)*step(vFacadeUv.x,.955)*step(3.4/max(vFacadeSize.y,4.0),vFacadeUv.y)*step(vFacadeUv.y,1.0-1.1/max(vFacadeSize.y,4.0))*vFacadeWall;
      float roomLit=step(.77,windowHash(floor(facadeUV)));
      vec3 reflection=mix(vec3(.055,.115,.17),vec3(.24,.36,.41),vFacadeUv.y);
      reflection+=vec3(.10,.065,.08)*pow(max(0.0,sin(vFacadeUv.x*8.0+vFacadeSeed)),8.0);
      diffuseColor.rgb=mix(diffuseColor.rgb,mix(reflection,vec3(.78,.53,.27),roomLit),facadeMask*${glass ? '.92' : '.9'});`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(.42,.21,.055)*roomLit*facadeMask*.5;`);
  };
  material.customProgramCacheKey = () => `infinite-facade-${glass ? 'glass' : 'masonry'}-1`;
  return material;
}

function leafGeometry() {
  const geo = new THREE.BufferGeometry();
  // A curved palm frond: the central ridge catches sunset light.
  const vertices = [-.12,0,0, .12,0,0, 0,.16,.35, -.27,.05,.55, .27,.05,.55, 0,-.10,1];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex([0,1,2,0,2,3,1,4,2,3,2,5,2,4,5]); geo.computeVertexNormals();
  return geo;
}

/** All architecture is stored as lightweight transforms, then globally instanced. */
function describeChunk(data, lod = 0) {
  const records = [];
  const add = (type,x,y,z,sx,sy,sz,color,ry=0,seed=0) => records.push({type,x,y,z,sx,sy,sz,color,ry,seed});
  const box = (x,y,z,w,h,d,color,type='solid',ry=0,seed=0) => add(type,x,y,z,w,h,d,color,ry,seed);
  const cylinder = (x,y,z,r,h,color) => add('cylinder',x,y,z,r,h,r,color);
  const X=data.x,Z=data.z,S=CHUNK_SIZE;
  box(X+S/2,-.10,Z+S/2,S,.18,S,'#313740','road');
  // A raised pedestrian island leaves a full-width road at every tile edge.
  box(X+S/2,.06,Z+S/2,S-21,.22,S-21,'#b7aaa0','paving');
  box(X+S/2,.18,Z+S/2,S-26,.06,S-26,'#b2a39a','paving');
  const stripe = '#f3ce7a';
  for (let t=18;t<S-13;t+=15) {
    box(X,.014,Z+t,.12,.018,7,stripe,'paint');
    box(X+t,.014,Z,7,.018,.12,stripe,'paint');
  }
  // Only the northwest corner owns these markings, avoiding overlapping seams.
  for(let k=-3;k<=3;k++) {
    box(X+k*1.35,.018,Z+13,.72,.018,3.3,WHITE,'paint');
    box(X+k*1.35,.018,Z-13,.72,.018,3.3,WHITE,'paint');
    box(X+13,.018,Z+k*1.35,3.3,.018,.72,WHITE,'paint');
    box(X-13,.018,Z+k*1.35,3.3,.018,.72,WHITE,'paint');
  }
  if(lod<2) {
    for(const t of [31,94]) {
      lamp(X+11.7,Z+t,Math.PI/2);lamp(X+t,Z+11.7,0);
      if(lod===0){lamp(X+S-11.7,Z+t,-Math.PI/2);lamp(X+t,Z+S-11.7,Math.PI);}
    }
    // Crossing signals and service covers add human scale at junctions.
    for(const [dx,dz] of [[11.7,11.7],[-11.7,-11.7]]) {
      cylinder(X+dx,2.15,Z+dz,.095,4.3,DARK);
      box(X+dx,4.1,Z+dz,.35,.9,.32,DARK);
      box(X+dx,4.25,Z+dz-.17,.16,.16,.03,'#efb785','glow');
      box(X+dx,3.98,Z+dz-.17,.16,.16,.03,'#7fd3ad','glow');
    }
  }
  for(const building of data.buildings) buildingParts(building);
  for(const feature of data.features || []) featureParts(feature);

  function lamp(x,z,angle) {
    cylinder(x,3.7,z,.095,7.2,'#424b50');
    box(x+Math.sin(angle)*.85,7.1,z+Math.cos(angle)*.85,.12,.11,1.8,'#424b50','solid',angle);
    box(x+Math.sin(angle)*1.65,7.02,z+Math.cos(angle)*1.65,.5,.10,.9,'#ffdaa5','glow',angle);
  }
  function palm(x,z,height,seed) {
    const rng=random(seed);cylinder(x,height/2+.2,z,.16,height,'#8a6753');
    const leaves=lod===0?7:5;
    for(let n=0;n<leaves;n++) add('leaf',x,height+.2,z,3.8,.9,3.9,n%2?'#39765a':'#548b60',n/leaves*Math.PI*2+rng()*.12);
    if(lod===0)for(let n=1;n<5;n++)cylinder(x,height*n/5,z,.18,.08,'#a48364');
  }
  function buildingParts(b) {
    const {x,z,width:w,depth:d,height:h}=b;
    const accent=b.accent||'#64c8b8', color=b.color||'#e0b1a0', rng=random(b.detailSeed);
    const isGlass=b.style==='glass', residential=b.style==='residential';
    const seed=(b.detailSeed%65521)/101;
    const type=isGlass?'glass':'facade';
    const base=.22;
    box(x,base+h/2,z,w,h,d,color,type,0,seed);
    box(x,.43,z,w+.45,.46,d+.45,'#5f6060');
    if(b.style==='glass') {
      // A stepped skyline, articulated curtain wall, and separate roof pavilion.
      box(x,base+h+.18,z,w+1,.36,d+1,'#9badaf');
      box(x,base+h+2.4,z,w*.63,4.5,d*.63,color,'glass',0,seed+3);
      const ribs=lod===2?2:Math.max(2,Math.floor(w/7));
      for(let n=0;n<=ribs;n++) {
        const dx=(n/ribs-.5)*(w-.8);
        box(x+dx,base+h/2,z+d/2+.07,.12,h,.15,'#9fb7bd','metal');
        box(x+dx,base+h/2,z-d/2-.07,.12,h,.15,'#9fb7bd','metal');
      }
      for(let y=8;y<h;y+=lod===0?7:14)box(x,base+y,z,w+.18,.16,d+.18,'#84a5af','metal');
      if(lod<2)cylinder(x-w*.24,h+5,z+d*.18,.10,8,'#495a67');
    } else if(b.style==='deco'||b.style==='hotel') {
      // Horizontal sunshades, a ziggurat crown, and contrasting corner fins.
      for(let k=0;k<3;k++)box(x,base+h+.18+k*.23,z,w+1-k*.25,.18,d+1-k*.25,k===1?accent:WHITE);
      const levels=lod===2?Math.max(1,Math.floor(h/12)):Math.max(1,Math.floor(h/3.6));
      for(let f=1;f<levels;f++)box(x,base+h*f/levels,z,w+.7,.18,d+.7,WHITE);
      for(let i=0;i<3;i++)box(x,base+h+.6+i*.65,z-d*.30,w*.35-i*.7,.75,d*.22,WHITE);
      for(const side of [-1,1])box(x+side*(w/2-.6),base+h/2,z-d/2-.23,.45,h,.38,accent);
      if(b.style==='hotel'&&lod<2) {
        for(let f=1;f<Math.min(b.floors||5,12);f++) {
          const y=base+f*h/(b.floors||5);
          box(x,y,z+d/2+.8,w*.9,.16,1.8,WHITE);
          box(x,y+.65,z+d/2+1.61,w*.9,.09,.08,accent,'metal');
          for(const dx of [-w*.43,0,w*.43])box(x+dx,y+.33,z+d/2+1.6,.07,.7,.08,WHITE,'metal');
        }
      }
    } else if(b.style==='brick') {
      // Recessed floor bands, deep cornice, vertical parapet pilasters.
      for(let y=3.7;y<h;y+=3.5)box(x,y,z,w+.25,.16,d+.25,'#d6c3aa');
      box(x,base+h+.25,z,w+.8,.55,d+.8,'#9b715b');
      box(x,base+h+.55,z,w+.45,.16,d+.45,WHITE);
      for(const dx of [-w*.44,0,w*.44])box(x+dx,base+h/2,z-d/2-.12,.35,h,.25,'#b18c72');
    } else if(residential) {
      // Low villas have overhanging terraces and a detached stair enclosure.
      box(x,base+h+.13,z,w+1.2,.26,d+1.2,WHITE);
      box(x-w*.23,base+h+1.2,z+d*.20,w*.31,2.3,d*.42,color,'facade',0,seed+1);
      box(x,base+3.35,z-d/2-.8,w*.82,.2,1.9,WHITE);
      if(lod<2) {
        box(x,base+4.0,z-d/2-1.7,w*.82,.08,.08,accent,'metal');
        for(const dx of [-w*.4,0,w*.4])box(x+dx,base+3.7,z-d/2-1.7,.08,.7,.08,WHITE,'metal');
      }
    }
    // A continuous ground-floor shopfront gives the street a readable edge.
    if(lod<2) {
      const front=z-d/2;
      box(x,1.6,front-.035,w*.83,2.6,.08,'#153542','glazing');
      const bays=Math.max(2,Math.floor(w/4.5));
      for(let n=0;n<=bays;n++)box(x+(n/bays-.5)*w*.84,1.6,front-.15,.11,2.85,.18,WHITE,'metal');
      box(x,3.1,front-.7,w*.92,.18,1.6,accent);
      box(x,3.02,front-1.48,w*.91,.05,.035,'#f3c38c','glow');
      // Individual canopy stripes and luminous sign lettering are only nearby.
      if(lod===0) {
        const stripes=Math.min(15,Math.floor(w));
        for(let n=0;n<stripes;n+=2)box(x+(n/stripes-.5)*w*.9,3.205,front-.7,w*.9/stripes,.018,1.5,WHITE);
        box(x,4.1,front-.16,Math.min(w*.7,12),.9,.23,'#22323e');
        const letters=5+Math.floor(rng()*5), signW=Math.min(w*.65,11);
        for(let n=0;n<letters;n++) {
          const lx=x+(n/(letters-1)-.5)*signW;
          box(lx,4.1,front-.295,.12,.48,.035,accent,'glow');
          box(lx+.14,4.29,front-.30,.35,.065,.035,accent,'glow');
          if(n%2)box(lx+.14,3.91,front-.30,.35,.065,.035,accent,'glow');
        }
        // Door steps, recessed entries and small planted thresholds.
        box(x,.30,front-.80,2.6,.18,1.3,'#d2bdaa');
        box(x,1.45,front-.18,1.7,2.5,.10,'#112b35','glazing');
        box(x+.48,1.3,front-.255,.05,.35,.05,'#d6c0a0','metal');
      }
      // Rooftop mechanicals are visible from the free camera.
      for(let n=0;n<(h>30?3:2);n++) {
        const rx=x+(n-.5)*w*.23,rz=z+d*.18;
        box(rx,h+.85,rz,2.7,1.2,2.1,'#68747c');
        box(rx,h+1.47,rz,2.45,.06,1.9,'#394a54','metal');
        if(lod===0)for(let t=0;t<4;t++)box(rx+(t-1.5)*.48,h+1.51,rz,.12,.04,1.8,'#9aa7aa','metal');
      }
      if(b.roof==='terrace') {
        for(const dx of [-w/2+.4,w/2-.4])box(x+dx,h+.75,z,.12,1.0,d-.5,WHITE,'metal');
        for(const dz of [-d/2+.4,d/2-.4])box(x,h+.75,z+dz,w-.5,1.0,.12,WHITE,'metal');
      }
      if(lod===0 && b.style==='brick') {
        cylinder(x+w*.22,h+1.8,z+d*.2,1.4,2.8,'#986d56');
        cylinder(x+w*.22,h+3.3,z+d*.2,1.55,.18,'#4b4a4a');
      }
    }
  }
  function featureParts(f) {
    const {x,z,width:w,depth:d}=f,rng=random(f.detailSeed||1);
    if(f.kind==='canal'||f.kind==='marina') {
      box(x,.16,z,w,.20,d,'#a7b6af','paving');
      box(x,.28,z,w-1,.12,d-1,'#347e87','water');
      for(const side of [-1,1]) {
        box(x+side*w/2,.46,z,.45,.65,d+.5,WHITE);
        box(x,.46,z+side*d/2,w,.65,.45,WHITE);
      }
      if(lod<2){
        box(x,.52,z,w,.26,2.3,'#997b61');
        for(const side of [-1,1])box(x,1.1,z+side*1.2,w,.1,.12,'#b5c4bd','metal');
        for(let t=0;t<3;t++) {
          const bx=x+(t-1)*w*.23,bz=z+d*.22;
          box(bx,.58,bz,2.4,.6,5,'#e6d9c6');
          box(bx,.94,bz-.3,1.8,.7,2.5,['#d58372','#77a5a5','#deb56e'][t]);
        }
      }
    } else if(f.kind==='park') {
      box(x,.24,z,w,.12,d,'#607b52','green');
      box(x,.31,z,3.3,.06,d,'#c8b7a1','paving');box(x,.31,z,w,.06,3.3,'#c8b7a1','paving');
      for(let n=0;n<(lod===2?3:8);n++) {
        const px=x+(rng()>.5?1:-1)*(w*.22+rng()*w*.18),pz=z+(rng()>.5?1:-1)*(d*.2+rng()*d*.18);
        if(n%2===0)palm(px,pz,5+rng()*3,Math.floor(rng()*1e8));
        else {cylinder(px,1.6,pz,.18,3,'#826651');add('crown',px,4,pz,2.5,3,2.5,'#4f7756');}
      }
      if(lod<2)for(const side of [-1,1]){
        box(x+side*3,.68,z,1.1,.16,3,'#9a7257');
        box(x+side*3.45,1.0,z,.12,.6,3,'#9a7257');
      }
    } else if(f.kind==='fountain') {
      cylinder(x,.45,z,Math.min(w,d)*.48,.55,'#c4c1b5');
      cylinder(x,.77,z,Math.min(w,d)*.43,.12,'#58a4aa');
      cylinder(x,1.25,z,.65,1.25,WHITE);
      cylinder(x,1.9,z,1.25,.18,'#a6d6d1');
    } else {
      box(x,.25,z,w,.12,d,'#c2b09a','paving');
      for(const side of [-1,1]) {
        palm(x+side*w*.34,z-d*.33,6,f.detailSeed+side+2);
        palm(x+side*w*.34,z+d*.33,7,f.detailSeed+side+5);
      }
      if(lod===0){
        for(const side of [-1,1])box(x+side*w*.28,.72,z,2,.2,3.4,'#8b705a');
        box(x,1.7,z,1.6,3,1.6,f.detailSeed%2?'#d6b18d':'#759c9c','metal',Math.PI/4);
      }
    }
  }
  return records;
}

export class InfiniteCity {
  constructor(scene, {mobile=false, seed=610, radius}={}) {
    this.mobile=mobile;this.seed=seed;this.radius=radius??(mobile?2:3);
    this.group=new THREE.Group();this.group.name='Infinite city / streamed districts';scene.add(this.group);
    this.chunks=new Map();this.pools=new Map();this.colors=new Map();this.pending=[];
    this.centerKey=null;this.originX=0;this.originZ=0;this.disposed=false;
    this.stats={loaded:0,buildings:0,instances:0,pending:0,drawCalls:0,district:''};
    this.geometry={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,10),leaf:leafGeometry(),crown:new THREE.IcosahedronGeometry(1,1)};
    const standard=(roughness=.7,metalness=0)=>new THREE.MeshStandardMaterial({color:0xffffff,roughness,metalness});
    this.materials={road:standard(.98),paving:standard(.88),solid:standard(.68),facade:facadeMaterial(),glass:facadeMaterial(true),metal:standard(.38,.5),glazing:standard(.22,.55),paint:standard(.9),green:standard(.91),cylinder:standard(.67),leaf:standard(.88),crown:standard(.94),glow:new THREE.MeshBasicMaterial({color:0xffffff}),water:standard(.22,.4)};
    this.materials.leaf.side=THREE.DoubleSide;
    for(const material of Object.values(this.materials))material.envMapIntensity=.58;
    this._matrix=new THREE.Matrix4();
  }
  setSeed(seed) {
    this.seed=seed;this.chunks.clear();this.pending=[];this.centerKey=null;
    for(const pool of this.pools.values())pool.count=0;
  }
  update(x,z,originX=0,originZ=0) {
    if(this.disposed)return this.stats;
    const cx=Math.floor(x/CHUNK_SIZE),cz=Math.floor(z/CHUNK_SIZE),key=`${cx},${cz}`;
    let dirty=false;
    if(key!==this.centerKey) {
      this.centerKey=key;this.cx=cx;this.cz=cz;
      const wanted=[];
      for(let dz=-this.radius;dz<=this.radius;dz++)for(let dx=-this.radius;dx<=this.radius;dx++)wanted.push({cx:cx+dx,cz:cz+dz,distance:Math.max(Math.abs(dx),Math.abs(dz))});
      const keep=new Set(wanted.map(p=>`${p.cx},${p.cz}`));
      for(const [id] of this.chunks)if(!keep.has(id)){this.chunks.delete(id);dirty=true;}
      wanted.sort((a,b)=>a.distance-b.distance||Math.hypot(a.cx-cx,a.cz-cz)-Math.hypot(b.cx-cx,b.cz-cz));
      for(const item of wanted) {
        const id=`${item.cx},${item.cz}`,lod=item.distance<=1?0:item.distance===2?1:2;
        let chunk=this.chunks.get(id);
        if(!chunk && item.distance<=1) {
          const data=generateChunk(item.cx,item.cz,this.seed);
          chunk={data,lod,records:describeChunk(data,lod)};this.chunks.set(id,chunk);dirty=true;
        } else if(chunk && chunk.lod!==lod){chunk.lod=lod;chunk.records=describeChunk(chunk.data,lod);dirty=true;}
      }
      this.pending=wanted.filter(p=>!this.chunks.has(`${p.cx},${p.cz}`));
      this.stats.district=districtAt(x,z,this.seed).label;
    }
    // Outer architecture arrives one tile per frame; all nearby streets exist immediately.
    if(this.pending.length) {
      const p=this.pending.shift(),data=generateChunk(p.cx,p.cz,this.seed),lod=p.distance===2?1:2;
      this.chunks.set(`${p.cx},${p.cz}`,{data,lod,records:describeChunk(data,lod)});dirty=true;
    }
    if(this.originX!==originX||this.originZ!==originZ){this.originX=originX;this.originZ=originZ;dirty=true;}
    if(dirty)this._rebuild();
    this.stats.loaded=this.chunks.size;this.stats.pending=this.pending.length;
    return this.stats;
  }
  _rebuild() {
    const groups=new Map();let buildings=0;
    for(const chunk of this.chunks.values()){
      buildings+=chunk.data.buildings.length;
      for(const record of chunk.records){let list=groups.get(record.type);if(!list){list=[];groups.set(record.type,list);}list.push(record);}
    }
    let total=0;
    for(const [type,records] of groups) {
      let pool=this.pools.get(type);
      if(!pool||pool.instanceMatrix.count<records.length) {
        if(pool){this.group.remove(pool);pool.geometry.dispose();pool.dispose();}
        let capacity=256;while(capacity<records.length)capacity*=2;
        const shape=['cylinder','leaf','crown'].includes(type)?type:'box';
        const geometry=this.geometry[shape].clone();
        if(type==='facade'||type==='glass')geometry.setAttribute('facadeSeed',new THREE.InstancedBufferAttribute(new Float32Array(capacity),1));
        pool=new THREE.InstancedMesh(geometry,this.materials[type],capacity);
        pool.name=`City / ${type}`;pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        pool.castShadow=!['road','paving','paint','glow','water','leaf'].includes(type);
        pool.receiveShadow=!['glow','water'].includes(type);pool.frustumCulled=true;
        this.group.add(pool);this.pools.set(type,pool);
      }
      pool.count=records.length;total+=records.length;
      for(let i=0;i<records.length;i++) {
        const r=records[i],c=Math.cos(r.ry),s=Math.sin(r.ry);
        this._matrix.set(c*r.sx,0,s*r.sz,r.x-this.originX,0,r.sy,0,r.y,-s*r.sx,0,c*r.sz,r.z-this.originZ,0,0,0,1);
        pool.setMatrixAt(i,this._matrix);
        let color=this.colors.get(r.color);if(!color){color=new THREE.Color(r.color);this.colors.set(r.color,color);}
        pool.setColorAt(i,color);
        if(pool.geometry.attributes.facadeSeed)pool.geometry.attributes.facadeSeed.setX(i,r.seed);
      }
      pool.instanceMatrix.needsUpdate=true;if(pool.instanceColor)pool.instanceColor.needsUpdate=true;
      if(pool.geometry.attributes.facadeSeed)pool.geometry.attributes.facadeSeed.needsUpdate=true;
      pool.computeBoundingSphere();
    }
    for(const [type,pool] of this.pools)if(!groups.has(type))pool.count=0;
    this.stats.buildings=buildings;this.stats.instances=total;this.stats.drawCalls=groups.size;
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    for(const pool of this.pools.values()){pool.geometry.dispose();pool.dispose();}
    for(const geo of Object.values(this.geometry))geo.dispose();
    for(const material of Object.values(this.materials))material.dispose();
    this.group.removeFromParent();this.pools.clear();this.chunks.clear();this.pending=[];this.colors.clear();
  }
}
