import * as THREE from './vendor/three.module.js';
import { createHuman, animateHuman } from './human-model.js?v=10';
import { CHUNK_SIZE, isRoad } from './world-layout.js?v=10';
import { coastGroundHeight, coastRoadAt, COAST_PEDESTRIAN_PATHS } from './coast-layout.js?v=10';

// Gameplay holds 36 streamed vehicles plus at most 64 remembered relocations.
// Capacity covers the entire bounded map, including a crowded parked-car block.
const MAX_VEHICLES = 128;
const identity = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const groundHeight = (x, z) => coastGroundHeight(x, z) ?? (isRoad(x, z) ? .015 : .22);

function coastalPedestrianPose(path, time, offset) {
  const points = path.points;
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.z - points[i].z));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const phase = (time * (path.speed || 1.05) + offset) % (total * 2);
  const direction = phase < total ? 1 : -1;
  let travel = direction > 0 ? phase : total * 2 - phase;
  for (let i = 0; i < lengths.length; i++) {
    if (travel <= lengths[i] || i === lengths.length - 1) {
      const a = points[i], b = points[i + 1], t = travel / Math.max(.001, lengths[i]);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2((b.x - a.x) * direction, (b.z - a.z) * direction) };
    }
    travel -= lengths[i];
  }
  return { ...points[0], yaw: 0 };
}

// Bake static detail into a handful of shared meshes. No DOM/canvas dependency:
// the same models can be inspected and exported with Node or Blender tooling.
function bake(parts) {
  const arrays = { position: [], normal: [], color: [] };
  for (const { geometry, matrix = identity, color = '#ffffff' } of parts) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    const c = new THREE.Color(color), p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      arrays.position.push(p.getX(i), p.getY(i), p.getZ(i));
      arrays.normal.push(n.getX(i), n.getY(i), n.getZ(i));
      arrays.color.push(c.r, c.g, c.b);
    }
    g.dispose(); geometry.dispose();
  }
  const result = new THREE.BufferGeometry();
  for (const [name, array] of Object.entries(arrays)) result.setAttribute(name, new THREE.Float32BufferAttribute(array, 3));
  result.computeBoundingSphere();
  return result;
}

function transform(x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

function loft(rings) {
  // Eight-sided cross sections give the shoulder and sill distinct highlights.
  const positions = [], indices = [];
  for (const [z, w, low, high] of rings) {
    const bevel = Math.min(.13, (high - low) * .24);
    for (const [x, y] of [[-w * .82,low],[-w,low+bevel],[-w,high-bevel],[-w*.83,high],[w*.83,high],[w,high-bevel],[w,low+bevel],[w*.82,low]]) positions.push(x,y,z);
  }
  for (let r = 0; r < rings.length - 1; r++) for (let p = 0; p < 8; p++) {
    const a = r * 8 + p, b = r * 8 + (p + 1) % 8, c = a + 8, d = b + 8;
    indices.push(a,c,b,b,c,d);
  }
  for (let i=1;i<7;i++) { indices.push(0,i,i+1); const q=(rings.length-1)*8;indices.push(q,q+i+1,q+i); }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

function makeVehicle(kind) {
  const suv = kind === 'suv', coupe = kind === 'coupe';
  const w=suv?1.02:.96, length=suv?2.35:coupe?2.24:2.4, belt=suv?1.04:.85;
  const roof=suv?1.84:coupe?1.34:1.52, rear=suv?-1.62:coupe?-.91:-1.06, front= coupe?.55:.81;
  const wheelbase=suv?1.43:1.46,wheelY=suv?.45:.40,wheelRadius=suv?.46:.41;
  const buckets={paint:[],glass:[],detail:[],light:[],tail:[]};
  const add=(type,geometry,matrix,color)=>buckets[type].push({geometry,matrix,color});
  const box=(type,x,y,z,sx,sy,sz,color='#ffffff',rx=0,ry=0,rz=0)=>add(type,new THREE.BoxGeometry(1,1,1),transform(x,y,z,sx,sy,sz,rx,ry,rz),color);
  const rounded=(type,x,y,z,sx,sy,sz,color='#ffffff')=>add(type,loft([[-sz/2,sx*.42,-sy*.34,sy*.34],[-sz*.36,sx/2,-sy/2,sy/2],[sz*.36,sx/2,-sy/2,sy/2],[sz/2,sx*.42,-sy*.34,sy*.34]]),transform(x,y,z),color);
  const line=(type,a,b,r,color)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),matrix=new THREE.Matrix4().compose(start.add(end).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(Y,delta.clone().normalize()),new THREE.Vector3(1,1,1));add(type,new THREE.CylinderGeometry(r,r,delta.length(),6),matrix,color);};
  // Closely spaced shoulder sections produce real curved bumper highlights and
  // defined wheel-haunches; the cabin still has its own glass and painted roof.
  add('paint',loft([[-length,w*.82,.44,belt-.15],[-length+.10,w*.94,.39,belt-.07],[-length+.32,w,.36,belt],[-1.50,w*1.01,.36,belt+.035],[-1.12,w*.99,.36,belt+.045],[-.60,w*.97,.36,belt+.015],[.67,w*.97,.36,belt+.015],[1.22,w*1.01,.36,belt+.045],[length-.39,w*.99,.39,belt+.005],[length-.14,w*.91,.43,belt-.07],[length,w*.78,.48,belt-.15]]));
  add('glass',loft([[rear-.30,w*.91,belt-.015,belt+.015],[rear,w*.78,belt,roof-.08],[front,w*.73,belt,roof],[front+.6,w*.88,belt,belt+.018]]));
  add('paint',loft([[rear-.02,w*.79,roof-.095,roof-.065],[rear+.13,w*.78,roof-.08,roof+.015],[front-.13,w*.73,roof-.05,roof+.02],[front+.04,w*.72,roof-.06,roof-.025]]));
  // Door frames, sills, handles, trim, mirrors and subtly raised hood details.
  for (const side of [-1,1]) {
    box('detail',side*(w+.012),.48,0,.045,.10,length*1.74,'#263038');
    box('detail',side*(w+.008),belt-.10,-.1,.016,.025,length*1.75,'#343c43');
    box('paint',side*w*.81,(belt+roof)/2,rear+.11,.065,roof-belt,.11);
    box('paint',side*w*.80,(belt+roof)/2,front-.08,.065,roof-belt,.09);
    if(!coupe)box('detail',side*w*.86,(belt+roof)/2,-.22,.06,roof-belt,.12,'#1c252b');
    box('detail',side*(w+.022),belt-.04,coupe?-.53:-.07,.05,.045,.24,'#c4c9ca');
    if(!coupe)box('detail',side*(w+.022),belt-.04,-1.18,.05,.045,.23,'#bcc2c4');
    rounded('paint',side*(w+.14),belt+.17,.70,.26,.14,.31);
    box('glass',side*(w+.14),belt+.17,.55,.21,.11,.016);
    box('detail',side*w*.53,belt+.025,1.59,.018,.008,.48,'#59656a');
    box('detail',side*(w+.016),belt*.68,-1.26,.012,belt*.37,.015,'#3c4547');
    // Thin panel gaps and separate seals make the doors, hood and pillars read
    // at walking distance without adding a draw call for each component.
    for(const doorZ of coupe?[-.85,.72]:[-1.28,-.15,.77])box('detail',side*(w+.017),.65,doorZ,.011,.31,.012,'#304146');
    box('detail',side*(w+.022),.53,-.06,.012,.012,coupe?1.51:2.04,'#26383e');
    line('detail',[side*w*.76,roof-.04,front-.08],[side*w*.87,belt+.025,front+.53],.018,'#40555a');
    line('detail',[side*w*.79,roof-.09,rear+.04],[side*w*.89,belt+.025,rear-.25],.017,'#40555a');
    line('detail',[side*w*.44,belt+.035,front+.60],[side*w*.61,belt-.04,length-.22],.009,'#45616a');
    line('detail',[side*w*.13,belt+.055,front+.52],[side*w*.62,belt+.06,front+.45],.009,'#22343b');
    // Raised fender lips and dark inner liners outline the wheels. The trim
    // occupies the existing footprint; it does not change collision clearance.
    for(const axle of [-1,1]) {
      const z=axle*wheelbase;
      add('detail',new THREE.TorusGeometry(wheelRadius+.032,.026,4,16,Math.PI),transform(side*(w+.019),wheelY,z,1,1,1,0,side*Math.PI/2,0),'#29363a');
      add(suv?'detail':'paint',new THREE.TorusGeometry(wheelRadius+.063,.024,4,16,Math.PI),transform(side*(w+.031),wheelY,z,1,1,1,0,side*Math.PI/2,0),suv?'#465359':'#ffffff');
      rounded('detail',side*(w+.065),wheelY+.08,z+.17,.065,.19,.11,coupe?'#cc4c3e':'#9b8c71');
    }
    if(suv){box('detail',side*w*.68,roof+.08,-.36,.07,.09,2.4,'#58666a');box('detail',side*(w+.03),.31,-.1,.13,.06,2.6,'#8c9698');}
  }
  // Split headlights and grille lend each silhouette a distinct front face.
  box('detail',0,.52,length+.01,w*1.6,.15,.06,'#1a2327');
  box('detail',0,.71,length-.025,w*.63,.21,.10,'#152329');
  for(let i=-3;i<=3;i++)box('detail',i*w*.085,.71,length+.033,.023,.16,.02,'#98a9ab');
  for(const side of [-1,1]) {
    rounded('detail',side*w*.68,belt-.095,length-.052,w*.43,.13,.09,'#23363c');
    box('light',side*w*.68,belt-.075,length-.001,w*.36,.022,.025,'#d7f3fc');
    box('light',side*w*.68,belt-.12,length-.001,w*.36,.019,.025,'#f0f8f3');
    box('light',side*w*.90,belt-.10,length-.04,.035,.06,.025,'#ffb744');
    box('detail',side*w*.72,.48,length+.045,.21,.05,.02,'#a7bbc0');
    rounded('detail',side*w*.63,belt-.09,-length+.025,w*.56,.15,.085,'#46232e');
    box('tail',side*w*.63,belt-.062,-length-.02,w*.48,.025,.02,'#f4414f');
    box('tail',side*w*.63,belt-.115,-length-.02,w*.48,.02,.02,'#cd243d');
    box('light',side*w*.48,belt-.09,-length-.02,.045,.027,.023,'#e5e6dc');
    add('detail',new THREE.CylinderGeometry(.065,.065,.17,12),transform(side*w*.65,.34,-length+.02,1,1,1,Math.PI/2),'#9da8ab');
    add('detail',new THREE.CylinderGeometry(.049,.049,.006,12),transform(side*w*.65,.34,-length-.069,1,1,1,Math.PI/2),'#1f2a30');
    for(let n=0;n<3;n++)box('detail',side*w*.70,.57+n*.045,length+.035,.25,.014,.02,'#4b5c61');
  }
  box('detail',0,.61,-length-.016,.43,.18,.025,'#e9e7d8');
  box('detail',0,.59,length+.048,.40,.16,.025,'#d8ded7');
  if(coupe)box('paint',0,belt+.095,-length+.17,w*1.7,.055,.20);
  const out={};for(const [type,parts]of Object.entries(buckets))out[type]=bake(parts);
  return {geometry:out,width:w,wheelbase,wheelY,wheelRadius};
}

function makeWheels() {
  const tire=[],rim=[];
  const add=(parts,geometry,matrix,color)=>parts.push({geometry,matrix,color});
  add(tire,new THREE.CylinderGeometry(1,1,.60,32,1),transform(0,0,0,1,1,1,0,0,Math.PI/2),'#141c23');
  // Small raised tread edges and shaped sidewalls retain a smooth tyre outline.
  for(let n=0;n<24;n++){
    const angle=n*Math.PI*2/24;
    add(tire,new THREE.BoxGeometry(.43,.012,.032),transform(0,Math.cos(angle)*.991,Math.sin(angle)*.991,1,1,1,angle),'#283238');
  }
  for(const side of [-1,1]) {
    add(tire,new THREE.TorusGeometry(.82,.12,5,32),transform(side*.31,0,0,1,1,1,0,Math.PI/2,0),'#252e34');
    add(rim,new THREE.CylinderGeometry(.67,.67,.025,32),transform(side*.32,0,0,1,1,1,0,0,Math.PI/2),'#26333a');
    // The brake rotor sits behind narrow spokes instead of a solid wheel face.
    add(rim,new THREE.CylinderGeometry(.53,.53,.025,24),transform(side*.338,0,0,1,1,1,0,0,Math.PI/2),'#6d7b80');
    add(rim,new THREE.TorusGeometry(.68,.045,4,32),transform(side*.36,0,0,1,1,1,0,Math.PI/2,0),'#d0d9db');
    add(rim,new THREE.CylinderGeometry(.16,.16,.065,12),transform(side*.38,0,0,1,1,1,0,0,Math.PI/2),'#cdd5d5');
    for(let i=0;i<6;i++) {
      const angle=i*Math.PI*2/6;
      add(rim,new THREE.BoxGeometry(.045,.075,.49),transform(side*.385,Math.sin(angle)*.40,Math.cos(angle)*.40,1,1,1,-angle),'#bdced2');
      add(rim,new THREE.CylinderGeometry(.034,.034,.016,6),transform(side*.42,Math.sin(angle)*.105,Math.cos(angle)*.105,1,1,1,0,0,Math.PI/2),'#53636c');
    }
  }
  return {tire:bake(tire),rim:bake(rim)};
}

export class ActorVisuals {
  constructor(scene,{mobile=false}={}) {
    this.mobile=mobile;this.group=new THREE.Group();this.group.name='Street life / player, vehicles and contacts';scene.add(this.group);
    this.avatar=createHuman();this.avatar.name='Player / coastal courier';this.group.add(this.avatar);
    this.contact=createHuman({shirt:'#ce8568',pants:'#e3cfac',skin:'#916344',hair:'#211e20'});this.contact.name='Mission contact';this.contact.visible=false;this.group.add(this.contact);
    this.vehiclePools=new Map();this.vehicleModels=new Map();this.geometries=new Set();this.materials=new Set();this.disposed=false;
    this._matrix=new THREE.Matrix4();this._wheelMatrix=new THREE.Matrix4();this._local=new THREE.Matrix4();this._q=new THREE.Quaternion();this._roll=new THREE.Quaternion();this._wheelQ=new THREE.Quaternion();this._color=new THREE.Color();this._position=new THREE.Vector3();this._scale=new THREE.Vector3(1,1,1);
    const mat=(params)=>{const m=new THREE.MeshStandardMaterial({vertexColors:true,...params});this.materials.add(m);return m;};
    this.carMaterials={paint:mat({roughness:.29,metalness:.58}),glass:mat({color:'#1e3d4b',roughness:.17,metalness:.75}),detail:mat({roughness:.48,metalness:.35}),light:mat({emissive:'#dff7ec',emissiveIntensity:.55}),tail:mat({emissive:'#e72c2c',emissiveIntensity:.38}),tire:mat({roughness:.96}),rim:mat({roughness:.28,metalness:.72})};
    for(const kind of ['coupe','sedan','suv']) {
      const model=makeVehicle(kind);this.vehicleModels.set(kind,model);
      for(const [part,geometry]of Object.entries(model.geometry))this._pool(`${kind}:${part}`,geometry,this.carMaterials[part],MAX_VEHICLES);
    }
    const wheel=makeWheels();for(const [part,geometry]of Object.entries(wheel))this._pool(part,geometry,this.carMaterials[part],MAX_VEHICLES*4);
    // Ambient pedestrians use a bounded set, never spawn vehicles outside gameplay.
    this.pedestrians=[];
    const shirts=['#b4c2a7','#a66f65','#c1b796','#c4d4db','#826d8f','#d0a270'];
    for(let i=0;i<(mobile?3:5);i++) {
      const human=createHuman({shirt:shirts[i],pants:i%2?'#426171':'#3c3d48',skin:i%2?'#8e5e43':'#bf8d6a',accessories:false});
      human.name=`Pedestrian ${i+1}`;this.pedestrians.push(human);this.group.add(human);
    }
    this.stats={vehicles:0,vehicleDrawCalls:this.vehiclePools.size,people:2+this.pedestrians.length};
  }
  _pool(key,geometry,material,capacity) {
    const pool=new THREE.InstancedMesh(geometry,material,capacity);pool.count=0;pool.name=`Vehicles / ${key}`;
    pool.castShadow=true;pool.receiveShadow=true;pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);pool.frustumCulled=true;
    this.vehiclePools.set(key,pool);this.geometries.add(geometry);this.group.add(pool);return pool;
  }
  setVehicleTemplate(template) {
    if(this.hero){this.group.remove(this.hero);this.hero=null;}
    if(!template)return;
    // Share immutable template resources; disposal remains with the asset owner.
    this.hero=template.clone(true);this.hero.name='Blender coupe / close detail';this.hero.visible=false;this.heroWheels=[];this.heroPaint=[];
    this.hero.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;const clonePaint=m=>{if(/satin metallic paint/i.test(m.name)){const own=m.clone();this.materials.add(own);this.heroPaint.push(own);return own;}return m;};node.material=Array.isArray(node.material)?node.material.map(clonePaint):clonePaint(node.material);}if(node.userData.wheel_radius)this.heroWheels.push({node,initial:node.rotation.x,front:node.name.includes('front')});});
    this.group.add(this.hero);
  }
  update(gameplay,origin={x:0,z:0},time=0,mission={}) {
    if(this.disposed)return this.stats;
    const state=gameplay.state,ox=origin.x||0,oz=origin.z||0;
    this.avatar.visible=gameplay.mode==='walk';this.avatar.position.set(state.x-ox,groundHeight(state.x,state.z),state.z-oz);this.avatar.rotation.y=state.yaw;
    animateHuman(this.avatar,{speed:this.avatar.visible?Math.abs(state.speed):0,time});
    const contact=mission?.contact;
    this.contact.visible=!!contact&&Math.hypot(contact.x-state.x,contact.z-state.z)<220;
    if(contact){this.contact.position.set(contact.x-ox,groundHeight(contact.x,contact.z),contact.z-oz);this.contact.rotation.y=Math.atan2(state.x-contact.x,state.z-contact.z);animateHuman(this.contact,{time,gesture:true});}
    this._updateVehicles(gameplay,origin);
    // Stroll along unobstructed sidewalks; each actor remains in a single block.
    const cx=Math.floor(state.x/CHUNK_SIZE),cz=Math.floor(state.z/CHUNK_SIZE);
    for(let i=0;i<this.pedestrians.length;i++){
      if(coastRoadAt(state.x,state.z)!==null && COAST_PEDESTRIAN_PATHS.length){
        const p=this.pedestrians[i],path=COAST_PEDESTRIAN_PATHS[i%COAST_PEDESTRIAN_PATHS.length],pose=coastalPedestrianPose(path,time,i*23);
        p.position.set(pose.x-ox,groundHeight(pose.x,pose.z),pose.z-oz);p.rotation.y=pose.yaw;p.visible=Math.hypot(pose.x-state.x,pose.z-state.z)<200;
        animateHuman(p,{speed:path.speed||1.05,time,phase:i});continue;
      }
      const p=this.pedestrians[i],blockX=cx+(i%3)-1,blockZ=cz+Math.floor(i/3);
      p.visible=true;
      const phase=(time*(.9+i*.07)+i*23)%144,positive=phase<72,z=blockZ*CHUNK_SIZE+26+(positive?phase:144-phase);
      const x=blockX*CHUNK_SIZE+(i%2?114:14);
      p.position.set(x-ox,groundHeight(x,z),z-oz);p.rotation.y=positive?0:Math.PI;
      // A procedural actor near the district boundary must not enter its water
      // or buildings before the fixed coastal paths become active.
      p.visible=coastRoadAt(x,z)===null;
      animateHuman(p,{speed:1.15,time,phase:i});
    }
    return this.stats;
  }
  _updateVehicles(gameplay,origin) {
    const {state}=gameplay,ox=origin.x||0,oz=origin.z||0;
    const records=[...gameplay.vehicles.values()].sort((a,b)=>((a.id===gameplay.activeVehicle?.id)?-1:(b.id===gameplay.activeVehicle?.id)?1:Math.hypot(a.x-state.x,a.z-state.z)-Math.hypot(b.x-state.x,b.z-state.z))).slice(0,MAX_VEHICLES);
    const heroRecord=this.hero?records.find(v=>v.kind==='coupe'&&(v.id===gameplay.activeVehicle?.id||Math.hypot(v.x-state.x,v.z-state.z)<26)):null;
    for(const pool of this.vehiclePools.values())pool.count=0;
    if(this.hero)this.hero.visible=!!heroRecord;
    for(const record of records) {
      const kind=this.vehicleModels.has(record.kind)?record.kind:'sedan',model=this.vehicleModels.get(kind);
      const y=groundHeight(record.x,record.z);
      const yaw=record.yaw||0,steer=record.steering||0,roll=record.wheelAngle||0;
      this._q.setFromAxisAngle(Y,yaw);this._position.set(record.x-ox,y,record.z-oz);this._scale.set(1,1,1);this._matrix.compose(this._position,this._q,this._scale);
      if(record===heroRecord){
        this.hero.position.set(record.x-ox,y,record.z-oz);this.hero.rotation.set(0,yaw,0);
        for(const material of this.heroPaint)material.color.set(record.color||'#5bbab8');
        for(const wheel of this.heroWheels){wheel.node.rotation.order='YXZ';wheel.node.rotation.x=wheel.initial+roll;wheel.node.rotation.y=wheel.front?steer:0;}
        continue;
      }
      for(const part of Object.keys(model.geometry)) {
        const pool=this.vehiclePools.get(`${kind}:${part}`),i=pool.count++;pool.setMatrixAt(i,this._matrix);
        this._color.set(part==='paint'?record.color||'#c2cbd0':'#ffffff');pool.setColorAt(i,this._color);
      }
      for(const side of [-1,1])for(const front of [-1,1]) {
        this._wheelQ.setFromAxisAngle(Y,front===1?steer:0);this._roll.setFromAxisAngle(X,roll);this._wheelQ.multiply(this._roll);
        this._position.set(side*(model.width+.015),model.wheelY,front*model.wheelbase);this._scale.setScalar(model.wheelRadius);
        this._local.compose(this._position,this._wheelQ,this._scale);this._wheelMatrix.multiplyMatrices(this._matrix,this._local);
        for(const type of ['tire','rim']){const pool=this.vehiclePools.get(type);pool.setMatrixAt(pool.count++,this._wheelMatrix);}
      }
    }
    for(const pool of this.vehiclePools.values()) {
      pool.instanceMatrix.needsUpdate=true;if(pool.instanceColor)pool.instanceColor.needsUpdate=true;
      if(pool.count)pool.computeBoundingSphere();
    }
    this.stats.vehicles=records.length;this.stats.hero=heroRecord?.id||null;
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    // Hero resources are borrowed; every procedural resource is owned here.
    if(this.hero)this.hero.removeFromParent();
    this.group.traverse(node=>{if(node.isMesh&&!node.isInstancedMesh){this.geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])this.materials.add(m);}});
    for(const geometry of this.geometries)geometry.dispose();for(const material of this.materials)material.dispose();
    for(const pool of this.vehiclePools.values())pool.dispose();this.vehiclePools.clear();this.vehicleModels.clear();this.group.removeFromParent();
  }
}
