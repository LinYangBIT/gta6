import * as THREE from './vendor/three.module.js';
import { CHUNK_SIZE, generateChunk } from './world-layout.js?v=10';

/** A finite moving window onto the same unlimited city, with cheap distant geometry.
 * Far buildings keep the exact footprint/height of their detailed counterparts.
 * Four instance pools cover the whole horizon, with no distant shadow passes.
 */
export function describeHorizonChunk(data) {
  const records=[];
  const box=(type,x,y,z,sx,sy,sz,color,seed=0,ry=0)=>records.push({type,x,y,z,sx,sy,sz,color,seed,ry});
  const X=data.x,Z=data.z,S=CHUNK_SIZE;
  if(data.coastal) {
    box('solid',X+S/2,-.105,Z+S/2,S,.20,S,X>=0?'#a1bd87':'#bcb29e');
    for(const f of data.features) {
      if(f.kind==='roundabout')continue; // Island is visible as land through its road loop.
      const water=['ocean','water','canal','marina'].includes(f.kind);
      const color=water?'#20a8ba':f.kind==='beach'?'#f0d8a5':['park','lawn'].includes(f.kind)?'#79a468':'#d6c5af';
      box(water?'water':'solid',f.x,water?0:.003,f.z,f.width,.02,f.depth,color);
    }
    for(const road of data.roads||[])for(const s of road.segments||[]) {
      const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,length=Math.hypot(dx,dz);
      if(length<.01)continue;
      const x=(s.a.x+s.b.x)/2,z=(s.a.z+s.b.z)/2,yaw=Math.atan2(dx,dz);
      // A fine height separation makes distant crossings stable without extra meshes.
      box('solid',x,.008+(s.index%3)*.0001,z,road.width,.035,length+.02,'#465051',0,yaw);
    }
  } else {
    box('solid',X+S/2,-.10,Z+S/2,S,.18,S,'#363d40');
    box('solid',X+S/2,.06,Z+S/2,S-21,.22,S-21,'#c8b6a8');
    for(const f of data.features) {
      const water=f.kind==='canal'||f.kind==='fountain';
      box(water?'water':'solid',f.x,.245,f.z,f.width,.03,f.depth,water?'#20a8ba':f.kind==='park'?'#607b52':'#c2b09a');
    }
  }
  for(const b of data.buildings) {
    const seed=(b.detailSeed%65521)/101,type=b.style==='glass'?'glass':'facade';
    box(type,b.x,.22+b.height/2,b.z,b.width,b.height,b.depth,b.color,seed);
    records.at(-1).buildingId=b.id;
    box('solid',b.x,.22+b.height+.13,b.z,b.width+.35,.26,b.depth+.35,b.style==='glass'?'#9badaf':'#e4d9c4');
    if(b.height>55)box(type,b.x,.22+b.height+1.9,b.z,b.width*.60,3.6,b.depth*.60,b.color,seed+1);
  }
  return records;
}

export class CityHorizon {
  constructor(scene,{seed=610,radius=8,materials}={}) {
    this.seed=seed;this.radius=Math.max(1,Math.min(16,Math.floor(radius)));
    this.materials=materials;this.chunks=new Map();this.pools=new Map();this.colors=new Map();
    this.group=new THREE.Group();this.group.name='Horizon / streamed city';scene.add(this.group);
    this.geometry=new THREE.BoxGeometry(1,1,1);this.matrix=new THREE.Matrix4();
    this.centerKey=null;this.nearSignature='';this.originX=0;this.originZ=0;this.disposed=false;
    this.stats={loaded:0,buildings:0,instances:0,drawCalls:0,rebuilds:0,radius:this.radius};
  }
  setSeed(seed) {this.seed=seed;this.chunks.clear();this.centerKey=null;this.nearSignature='';for(const pool of this.pools.values())pool.count=0;}
  update(x,z,originX=0,originZ=0,nearChunks=new Map()) {
    if(this.disposed)return this.stats;
    const cx=Math.floor(x/CHUNK_SIZE),cz=Math.floor(z/CHUNK_SIZE),key=`${cx},${cz}`;
    const nearSignature=[...nearChunks.keys()].sort().join(';');
    const changed=key!==this.centerKey||nearSignature!==this.nearSignature;
    const shifted=originX!==this.originX||originZ!==this.originZ;
    if(!changed&&!shifted)return this.stats;
    this.originX=originX;this.originZ=originZ;
    if(changed) {
      this.centerKey=key;this.nearSignature=nearSignature;
      const wanted=new Set();
      for(let dz=-this.radius;dz<=this.radius;dz++)for(let dx=-this.radius;dx<=this.radius;dx++) {
        const tx=cx+dx,tz=cz+dz,id=`${tx},${tz}`;
        if(nearChunks.has(id))continue;
        wanted.add(id);
        if(!this.chunks.has(id)) {
          const data=generateChunk(tx,tz,this.seed);
          this.chunks.set(id,{data,records:describeHorizonChunk(data)});
        }
      }
      for(const id of this.chunks.keys())if(!wanted.has(id))this.chunks.delete(id);
    }
    this._rebuild();return this.stats;
  }
  _rebuild() {
    const groups=new Map();let buildings=0;
    for(const chunk of this.chunks.values()) {
      buildings+=chunk.data.buildings.length;
      for(const r of chunk.records){if(!groups.has(r.type))groups.set(r.type,[]);groups.get(r.type).push(r);}
    }
    let count=0;
    for(const [type,records] of groups) {
      let pool=this.pools.get(type);
      if(!pool||pool.instanceMatrix.count<records.length) {
        if(pool){this.group.remove(pool);pool.geometry.dispose();pool.dispose();}
        let capacity=256;while(capacity<records.length)capacity*=2;
        const geometry=this.geometry.clone();
        if(type==='facade'||type==='glass')geometry.setAttribute('facadeSeed',new THREE.InstancedBufferAttribute(new Float32Array(capacity),1));
        pool=new THREE.InstancedMesh(geometry,this.materials[type],capacity);
        pool.name=`Horizon / ${type}`;pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        pool.castShadow=false;pool.receiveShadow=false;this.group.add(pool);this.pools.set(type,pool);
      }
      pool.count=records.length;count+=records.length;
      for(let index=0;index<records.length;index++) {
        const r=records[index],c=Math.cos(r.ry),s=Math.sin(r.ry);
        this.matrix.set(c*r.sx,0,s*r.sz,r.x-this.originX,0,r.sy,0,r.y,-s*r.sx,0,c*r.sz,r.z-this.originZ,0,0,0,1);
        pool.setMatrixAt(index,this.matrix);
        let color=this.colors.get(r.color);if(!color){color=new THREE.Color(r.color);this.colors.set(r.color,color);}
        pool.setColorAt(index,color);
        pool.geometry.attributes.facadeSeed?.setX(index,r.seed);
      }
      pool.instanceMatrix.needsUpdate=true;pool.instanceColor.needsUpdate=true;
      if(pool.geometry.attributes.facadeSeed)pool.geometry.attributes.facadeSeed.needsUpdate=true;
      pool.computeBoundingSphere();
    }
    for(const [type,pool] of this.pools)if(!groups.has(type))pool.count=0;
    Object.assign(this.stats,{loaded:this.chunks.size,buildings,instances:count,drawCalls:groups.size,rebuilds:this.stats.rebuilds+1});
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    for(const pool of this.pools.values()){pool.geometry.dispose();pool.dispose();}
    this.geometry.dispose();this.chunks.clear();this.pools.clear();this.colors.clear();this.group.removeFromParent();
  }
}
