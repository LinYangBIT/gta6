import * as THREE from './vendor/three.module.js';
import { CHUNK_SIZE, generateChunk, districtAt } from './world-layout.js?v=5';
import { createStreetSignMaterial } from './street-signs.js?v=5';
import { describeCoastChunk } from './coast-render.js?v=5';

const WHITE = '#eee7d8';
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

/** Pavement grain is evaluated in metres instead of stretched box UVs. */
function streetMaterial(paving=false) {
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:paving?.91:.97});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=`varying vec3 vStreetPosition;\n${shader.vertexShader}`;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStreetPosition=(instanceMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=`varying vec3 vStreetPosition;float streetNoise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }\n${shader.fragmentShader}`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 streetP=vStreetPosition.xz;
      float grain=streetNoise(floor(streetP*34.0));
      diffuseColor.rgb*=.91+grain*.15;
      ${paving ? `vec2 tile=fract(streetP/1.8);float seam=1.0-step(.018,min(min(tile.x,tile.y),min(1.0-tile.x,1.0-tile.y)));diffuseColor.rgb*=1.0-seam*.21;diffuseColor.rgb*=.95+streetNoise(floor(streetP/1.8))*.08;` : `float patch=streetNoise(floor(streetP*.13));diffuseColor.rgb*=.9+patch*.17;vec2 lane=abs(mod(streetP+64.0,128.0)-64.0);float tracks=(1.0-smoothstep(.45,.90,abs(lane.x-3.7)))+(1.0-smoothstep(.45,.90,abs(lane.y-3.7)));diffuseColor.rgb*=1.0-tracks*.10;`}
    `);
  };
  material.customProgramCacheKey=()=>paving?'coast-concrete-1':'coast-asphalt-1';
  return material;
}

function leafGeometry() {
  const geo=new THREE.BufferGeometry(),vertices=[],indices=[];
  // Narrow individual leaflets along a curved spine give recognizable feathery
  // silhouettes instead of a solid star shape. One geometry is shared by all trees.
  const point=(x,y,z)=>{vertices.push(x,y,z);return vertices.length/3-1;};
  for(let n=0;n<14;n++) {
    const t=n/14,next=(n+1)/14,curve=u=>Math.sin(u*Math.PI)*.20-u*u*.55;
    const width=.27*Math.sin((t*.86+.1)*Math.PI)*(1-t*.55);
    const a=point(0,curve(t),t),b=point(0,curve(next),next);
    const l=point(-width,curve(t)-.045,t+.10),r=point(width,curve(t)-.045,t+.10);
    indices.push(a,b,l,a,r,b);
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

/** All architecture is stored as lightweight transforms, then globally instanced. */
function describeChunk(data, lod = 0) {
  if(data.coastal)return describeCoastChunk(data,lod);
  const records = [];
  const add = (type,x,y,z,sx,sy,sz,color,ry=0,seed=0) => records.push({type,x,y,z,sx,sy,sz,color,ry,seed});
  const box = (x,y,z,w,h,d,color,type='solid',ry=0,seed=0) => add(type,x,y,z,w,h,d,color,ry,seed);
  const cylinder = (x,y,z,r,h,color) => add('cylinder',x,y,z,r,h,r,color);
  const X=data.x,Z=data.z,S=CHUNK_SIZE;
  box(X+S/2,-.10,Z+S/2,S,.18,S,'#363d40','road');
  // A raised pedestrian island leaves a full-width road at every tile edge.
  box(X+S/2,.06,Z+S/2,S-21,.22,S-21,'#d0beb1','paving');
  box(X+S/2,.18,Z+S/2,S-26,.06,S-26,'#c8b6a8','paving');
  // Pale concrete curb and coral sidewalk edging are distinct from the asphalt.
  for(const edge of [10.55,S-10.55]) {
    box(X+edge,.18,Z+S/2,.22,.16,S-21,'#e0d7c5','paving');
    box(X+S/2,.18,Z+edge,S-21,.16,.22,'#e0d7c5','paving');
  }
  const stripe = '#e5c676';
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
    for(const t of [43,94]) {
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
  // Every block has a real palm avenue, including the first walking street.
  const treeSlots=lod===2?[34,92]:[25,51,78,104];
  for(let i=0;i<treeSlots.length;i++) {
    const t=treeSlots[i],treeSeed=data.detailSeed+i*911;
    const height=7.8+(treeSeed%37)/12;
    for(const edge of [15.8,S-15.8]) {
      palm(X+edge,Z+t,height,treeSeed+edge);
      palm(X+t,Z+edge,height+.7,treeSeed+edge+123);
      if(lod===0) {
        box(X+edge,.25,Z+t,1.35,.08,1.35,'#665b45','green');
        box(X+t,.25,Z+edge,1.35,.08,1.35,'#665b45','green');
      }
    }
  }
  if(lod===0) {
    // Drain grates and square utility covers add near-ground scale without meshes per slat.
    for(const t of [39,86]) {
      box(X+9.1,.027,Z+t,.7,.022,1.35,'#50534e','metal');
      box(X+t,.027,Z+9.1,1.35,.022,.7,'#50534e','metal');
      for(let k=-2;k<=2;k++)box(X+9.1,.04,Z+t+k*.22,.6,.012,.055,'#232c2c','metal');
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
    const rng=random(seed);cylinder(x,height/2+.2,z,.14,height,'#8e8063');
    const leaves=lod===0?9:6;
    for(let n=0;n<leaves;n++)add('leaf',x,height+.2,z,4.8,2.6+(n%3)*.6,4.8,n%3?'#3d6340':'#6a7d45',n/leaves*Math.PI*2+rng()*.12);
    cylinder(x,height-.1,z,.29,.75,'#596143');
    if(lod===0)for(let n=1;n<8;n++)cylinder(x,height*n/8,z,.155,.065,'#a79774');
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
        const signIndex=b.detailSeed%8;
        add('sign',x,4.1,front-.302,Math.min(w*.7,12),1.22,1,'#ffffff',Math.PI,signIndex);
        // Door steps, recessed entries and small planted thresholds.
        box(x,.30,front-.80,2.6,.18,1.3,'#d2bdaa');
        box(x,1.45,front-.18,1.7,2.5,.10,'#112b35','glazing');
        box(x+.48,1.3,front-.255,.05,.35,.05,'#d6c0a0','metal');
      }
      // West and east-facing storefronts make north/south avenues inhabited too.
      for(const side of [-1,1]) {
        const edge=x+side*w/2,face=edge+side*.09;
        box(face,1.55,z,.12,2.55,d*.83,'#23413f','glazing');
        const bays=Math.max(2,Math.floor(d/5));
        for(let i=0;i<=bays;i++)box(edge+side*.17,1.55,z+(i/bays-.5)*d*.84,.20,2.8,.11,WHITE,'metal');
        box(edge+side*.8,3.15,z,1.7,.18,d*.91,accent);
        box(edge+side*1.62,2.95,z,.07,.38,d*.91,accent);
        if(lod===0) {
          add('sign',edge+side*.26,4.3,z,Math.min(d*.69,11),1.2,1,'#ffffff',side*Math.PI/2,b.detailSeed%8);
          box(edge+side*.22,1.37,z,.08,2.5,1.8,'#152e31','glazing');
          box(edge+side*.29,1.3,z+.55,.08,.4,.055,'#ddcaa4','metal');
          for(let n=0;n<Math.min(13,Math.floor(d));n+=2)box(edge+side*.8,3.25,z+(n/Math.min(13,Math.floor(d))-.5)*d*.88,1.6,.018,d*.88/Math.min(13,Math.floor(d)),WHITE);
        }
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

/** Fine stucco and ground detail stay procedural and require no borrowed textures. */
function grainMaterial(kind='stucco') {
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:kind==='stucco'?.84:.96});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=`varying vec3 vGrainPosition;\n${shader.vertexShader}`;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGrainPosition=(instanceMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=`varying vec3 vGrainPosition;float coastGrain(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,39.425)))*43758.5453); }\n${shader.fragmentShader}`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float grit=coastGrain(floor(vGrainPosition*${kind==='stucco'?'57.0':'18.0'}));
      diffuseColor.rgb*=.94+grit*.09;
      ${kind==='stucco'?`float stain=(1.0-smoothstep(.22,1.2,vGrainPosition.y))*(.5+.5*coastGrain(floor(vGrainPosition*vec3(.7,0.0,.7))));diffuseColor.rgb*=1.0-stain*.18;`:`float drift=sin(vGrainPosition.x*.45+sin(vGrainPosition.z*.32));diffuseColor.rgb*=.98+drift*.024;`}
    `);
  };
  material.customProgramCacheKey=()=>`coastal-${kind}-1`;return material;
}
function oceanMaterial(time,foam=false){
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:foam?.8:.19,metalness:foam?0:.35,transparent:foam,opacity:foam?.72:1,depthWrite:!foam});
  material.onBeforeCompile=shader=>{
    shader.uniforms.coastTime=time;
    shader.vertexShader=`varying vec3 vOceanPosition;\n${shader.vertexShader}`;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvOceanPosition=(instanceMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=`varying vec3 vOceanPosition;uniform float coastTime;\n${shader.fragmentShader}`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float waves=sin(vOceanPosition.x*.43+sin(vOceanPosition.z*.12)*.7-coastTime*.8)*.5+.5;
      float ripples=sin(vOceanPosition.x*1.7+vOceanPosition.z*1.1+coastTime*1.2)*.5+.5;
      diffuseColor.rgb*=.90+waves*.13+ripples*.05;
      ${foam?'diffuseColor.a*=.38+.62*pow(waves,2.0);':'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.53,.77,.73),pow(waves,22.0)*.10);'}
    `);
  };
  material.customProgramCacheKey=()=>foam?'coastal-foam-1':'coastal-water-1';return material;
}

function trianglePrismGeometry(){
  const v=[[0,-.5,0],[1,-.5,0],[0,-.5,1],[0,.5,0],[1,.5,0],[0,.5,1]];
  const faces=[[0,1,2],[3,5,4],[0,3,4],[0,4,1],[1,4,5],[1,5,2],[2,5,3],[2,3,0]],positions=[];
  for(const face of faces)for(const index of face)positions.push(...v[index]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}

export class InfiniteCity {
  constructor(scene, {mobile=false, seed=610, radius}={}) {
    this.mobile=mobile;this.seed=seed;this.radius=radius??(mobile?2:3);
    this.group=new THREE.Group();this.group.name='Infinite city / streamed districts';scene.add(this.group);
    this.chunks=new Map();this.pools=new Map();this.colors=new Map();this.pending=[];
    this.centerKey=null;this.originX=0;this.originZ=0;this.disposed=false;
    this.stats={loaded:0,buildings:0,instances:0,pending:0,drawCalls:0,district:''};
    this.geometry={triangle:trianglePrismGeometry(),sign:new THREE.PlaneGeometry(1,1),box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,10),round:new THREE.CylinderGeometry(1,1,1,24),canopy:new THREE.ConeGeometry(1,1,16),leaf:leafGeometry(),crown:new THREE.IcosahedronGeometry(1,1)};
    this._coastTime={value:0};
    const standard=(roughness=.7,metalness=0)=>new THREE.MeshStandardMaterial({color:0xffffff,roughness,metalness});
    this.materials={sign:createStreetSignMaterial(),road:streetMaterial(),paving:streetMaterial(true),solid:standard(.68),facade:facadeMaterial(),glass:facadeMaterial(true),metal:standard(.38,.5),glazing:standard(.22,.55),paint:standard(.9),green:standard(.91),cylinder:standard(.67),leaf:standard(.88),crown:standard(.94),glow:new THREE.MeshBasicMaterial({color:0xffffff}),water:oceanMaterial(this._coastTime),foam:oceanMaterial(this._coastTime,true),round:standard(.72),canopy:standard(.83),stucco:grainMaterial('stucco'),ground:grainMaterial('ground'),sand:grainMaterial('sand')};
    this.materials.roadTri=this.materials.road;this.materials.pavingTri=this.materials.paving;this.materials.curbTri=this.materials.solid;this.materials.paintTri=this.materials.paint;
    this.materials.leaf.side=THREE.DoubleSide;
    for(const material of Object.values(this.materials))material.envMapIntensity=.58;
    this._matrix=new THREE.Matrix4();this._rotation=new THREE.Euler();this._quaternion=new THREE.Quaternion();this._position=new THREE.Vector3();this._scale=new THREE.Vector3();
  }
  updateTime(time){if(Number.isFinite(time))this._coastTime.value=time;}
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
        const shape=type.endsWith('Tri')?'triangle':['cylinder','round','canopy','leaf','crown','sign'].includes(type)?type:'box';
        const geometry=this.geometry[shape].clone();
        if(type==='facade'||type==='glass')geometry.setAttribute('facadeSeed',new THREE.InstancedBufferAttribute(new Float32Array(capacity),1));
        if(type==='sign')geometry.setAttribute('signIndex',new THREE.InstancedBufferAttribute(new Float32Array(capacity),1));
        pool=new THREE.InstancedMesh(geometry,this.materials[type],capacity);
        pool.name=`City / ${type}`;pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        pool.castShadow=!['roadTri','pavingTri','paintTri','road','paving','paint','glow','water','foam','ground','sand','sign'].includes(type);
        pool.receiveShadow=!['glow','water','foam'].includes(type);pool.frustumCulled=true;
        this.group.add(pool);this.pools.set(type,pool);
      }
      pool.count=records.length;total+=records.length;
      for(let i=0;i<records.length;i++) {
        const r=records[i],c=Math.cos(r.ry),s=Math.sin(r.ry);
        if(r.basis){const [ax,az,bx,bz]=r.basis;this._matrix.set(ax,0,bx,r.x-this.originX,0,r.sy,0,r.y,az,0,bz,r.z-this.originZ,0,0,0,1);}
        else if(r.rx||r.rz){
          this._rotation.set(r.rx||0,r.ry||0,r.rz||0);this._quaternion.setFromEuler(this._rotation);this._position.set(r.x-this.originX,r.y,r.z-this.originZ);this._scale.set(r.sx,r.sy,r.sz);this._matrix.compose(this._position,this._quaternion,this._scale);
        }else this._matrix.set(c*r.sx,0,s*r.sz,r.x-this.originX,0,r.sy,0,r.y,-s*r.sx,0,c*r.sz,r.z-this.originZ,0,0,0,1);
        pool.setMatrixAt(i,this._matrix);
        let color=this.colors.get(r.color);if(!color){color=new THREE.Color(r.color);this.colors.set(r.color,color);}
        pool.setColorAt(i,color);
        if(pool.geometry.attributes.facadeSeed)pool.geometry.attributes.facadeSeed.setX(i,r.seed);
        if(pool.geometry.attributes.signIndex)pool.geometry.attributes.signIndex.setX(i,r.seed);
      }
      pool.instanceMatrix.needsUpdate=true;if(pool.instanceColor)pool.instanceColor.needsUpdate=true;
      if(pool.geometry.attributes.facadeSeed)pool.geometry.attributes.facadeSeed.needsUpdate=true;
      if(pool.geometry.attributes.signIndex)pool.geometry.attributes.signIndex.needsUpdate=true;
      pool.computeBoundingSphere();
    }
    for(const [type,pool] of this.pools)if(!groups.has(type))pool.count=0;
    this.stats.buildings=buildings;this.stats.instances=total;this.stats.drawCalls=groups.size;
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    for(const pool of this.pools.values()){pool.geometry.dispose();pool.dispose();}
    for(const geo of Object.values(this.geometry))geo.dispose();
    for(const material of new Set(Object.values(this.materials))){material.map?.dispose();material.dispose();}
    this.group.removeFromParent();this.pools.clear();this.chunks.clear();this.pending=[];this.colors.clear();
  }
}
