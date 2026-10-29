import * as THREE from './vendor/three.module.js';

const UP=new THREE.Vector3(0,1,0),identity=new THREE.Matrix4();
function matrix(x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){return new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(sx,sy,sz));}
function merge(parts){
  const p=[],n=[],c=[];
  for(const part of parts){
    const g=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();g.applyMatrix4(part.matrix||identity);
    p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);const color=new THREE.Color(part.color||'#ffffff');
    for(let i=0;i<g.attributes.position.count;i++)c.push(color.r,color.g,color.b);
    g.dispose();part.geometry.dispose();
  }
  const g=new THREE.BufferGeometry();for(const [name,values]of [['position',p],['normal',n],['color',c]])g.setAttribute(name,new THREE.Float32BufferAttribute(values,3));
  g.computeBoundingSphere();return g;
}
function builder(){
  const buckets={};
  const add=(part,geometry,transform=identity,color='#ffffff')=>(buckets[part]??=[]).push({geometry,matrix:transform,color});
  const box=(part,x,y,z,w,h,d,color='#ffffff',rx=0,ry=0,rz=0)=>add(part,new THREE.BoxGeometry(1,1,1),matrix(x,y,z,w,h,d,rx,ry,rz),color);
  const sphere=(part,x,y,z,w,h,d,color='#ffffff')=>add(part,new THREE.SphereGeometry(1,16,10),matrix(x,y,z,w,h,d),color);
  const line=(part,a,b,r,color='#ffffff',sides=8)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);add(part,new THREE.CylinderGeometry(r,r,delta.length(),sides),new THREE.Matrix4().compose(start.add(end).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(UP,delta.clone().normalize()),new THREE.Vector3(1,1,1)),color);};
  return{add,box,sphere,line,finish:()=>Object.fromEntries(Object.entries(buckets).map(([part,list])=>[part,merge(list)]))};
}

function bicycle(){
  const b=builder(),{add,box,line}=b;
  const rear=[0,.36,-.65],front=[0,.36,.72],crank=[0,.39,-.13],saddle=[0,.89,-.30],head=[0,.94,.48];
  // Two complete frame triangles, separate fork, chain stays and handlebars.
  for(const [a,c]of [[rear,saddle],[saddle,crank],[crank,rear],[saddle,head],[head,crank]])line('paint',a,c,.034);
  line('detail',saddle,[0,1.0,-.34],.027,'#adb8c0');
  box('detail',0,1.02,-.34,.22,.065,.29,'#18222a');
  for(const side of [-1,1]){
    line('paint',[side*.07,.39,-.13],[side*.07,.36,-.65],.021);
    line('paint',[side*.07,.88,-.30],[side*.07,.36,-.65],.021);
    line('detail',[side*.065,.88,.51],[side*.065,.36,.72],.025,'#aab9c5');
    line('detail',[0,.95,.48],[0,1.08,.44],.025,'#aab9c5');
    line('detail',[0,1.08,.44],[side*.32,1.08,.46],.024,'#aab9c5');
    line('detail',[side*.24,1.08,.46],[side*.36,1.08,.47],.033,'#121e29');
  }
  line('detail',[.085,.42,-.13],[.085,.39,-.65],.011,'#485365');
  line('detail',[.085,.31,-.13],[.085,.33,-.65],.011,'#485365');
  add('detail',new THREE.CylinderGeometry(.10,.10,.025,16),matrix(.085,.39,-.13,1,1,1,0,0,Math.PI/2),'#a6b5be');
  line('detail',[-.08,.30,-.25],[-.30,.015,-.38],.014,'#78838d');
  box('light',0,1.02,.49,.09,.07,.055,'#bcfaff');box('tail',0,.92,-.46,.08,.055,.025,'#ff477a');
  line('light',[0,.92,-.24],[0,.95,.39],.010,'#38e5ef');
  // The wheel is a genuinely thin hoop with spokes, not a scaled car cylinder.
  add('cycleWheel',new THREE.TorusGeometry(.325,.035,6,28),matrix(0,0,0,1,1,1,0,Math.PI/2),'#18202a');
  add('cycleWheel',new THREE.TorusGeometry(.302,.012,5,28),matrix(0,0,0,1,1,1,0,Math.PI/2),'#b9ced3');
  for(let i=0;i<16;i++){const a=i*Math.PI/8;line('cycleWheel',[0,0,0],[0,Math.cos(a)*.30,Math.sin(a)*.30],.004,'#aebec9',4);}
  add('cycleWheel',new THREE.CylinderGeometry(.045,.045,.12,10),matrix(0,0,0,1,1,1,0,0,Math.PI/2),'#a9bac4');
  for(const side of [-1,1]){
    line('pedals',[0,0,0],[side*.12,side*.14,0],.014,'#b8c3cd');
    box('pedals',side*.18,side*.14,0,.12,.035,.08,'#26343d');
  }
  const geometry=b.finish();
  return{geometry,wheels:[],animated:{cycleWheel:true,pedals:true},cycleWheels:[{x:0,y:.36,z:-.65,front:false},{x:0,y:.36,z:.72,front:true}]};
}

function truck(){
  const b=builder(),{box,line}=b;
  box('detail',0,.67,-.02,2.18,.20,6.35,'#18242d');
  box('paint',0,1.59,2.15,2.42,1.78,2.40);
  box('paint',0,2.65,2.16,2.42,.20,2.35);
  box('glass',0,2.10,3.365,2.10,.73,.025,'#91aebf');
  box('detail',0,2.1,3.39,.045,.76,.028,'#273746');
  box('detail',0,.86,3.43,2.50,.25,.20,'#8aabb2');
  box('detail',0,1.20,3.38,1.27,.42,.07,'#132633');
  for(let i=0;i<6;i++)box('detail',0,1.04+i*.067,3.43,1.28,.018,.04,'#8097a6');
  box('paint',0,2.17,-1.12,2.50,2.68,4.08);
  box('detail',0,.86,-1.12,2.57,.15,4.16,'#526877');
  box('detail',0,3.54,-1.12,2.57,.08,4.16,'#768d99');
  for(const side of [-1,1]){
    box('glass',side*1.22,2.15,2.07,.025,.74,1.66,'#91aebf');
    box('paint',side*1.235,2.14,2.04,.045,.85,.075);
    box('detail',side*1.25,1.53,1.61,.04,.055,.24,'#c2cdd1');
    box('detail',side*1.29,.76,1.75,.18,.11,1.43,'#6d828f');
    line('detail',[side*1.19,2.15,2.74],[side*1.40,2.06,2.85],.024,'#25343e');
    box('detail',side*1.42,2.08,2.82,.12,.29,.25,'#243d48');
    box('glass',side*1.42,2.08,2.69,.10,.25,.025,'#92adb5');
    for(let n=0;n<13;n++)box('detail',side*1.266,2.18,-2.96+n*.305,.028,2.51,.045,'#647f90');
    for(let n=0;n<4;n++)box('light',side*1.28,1.05,-2.8+n,.022,.07,.17,'#ffbc63');
    box('light',side*.89,1.30,3.42,.41,.19,.05,'#c0f2ff');
    box('light',side*.92,2.81,2.86,.11,.065,.13,'#ffbe69');
    box('tail',side*.93,.98,-3.24,.39,.18,.035,'#ff5576');
    box('detail',side*.62,2.17,-3.18,.025,2.43,.025,'#1f3443');
    for(let y=1.22;y<3.4;y+=.9)box('detail',side*1.07,y,-3.19,.16,.08,.04,'#b6c8cf');
    box('light',side*1.28,1.40,-1.13,.025,.025,3.55,'#51e7dc');
  }
  box('detail',0,2.17,-3.19,.035,2.57,.03,'#263c48');
  box('detail',0,.94,-3.24,.47,.19,.025,'#d5ded7');
  const wheels=[];
  for(const side of [-1,1])for(const z of [2.32,-1.57,-2.62])wheels.push({x:side*1.13,y:.56,z,radius:.56,front:z>0});
  return{geometry:b.finish(),wheels,width:1.13,wheelY:.56,wheelRadius:.56,wheelbase:2.32};
}

function helicopter(){
  const b=builder(),{add,box,sphere,line}=b;
  sphere('paint',0,1.49,.36,.94,.81,1.75);
  sphere('glass',0,1.58,1.12,.83,.69,1.12,'#9fbac7');
  box('paint',0,2.12,1.15,.055,.07,1.6);
  line('paint',[-.73,1.26,1.75],[-.73,2.10,.82],.043);
  line('paint',[.73,1.26,1.75],[.73,2.10,.82],.043);
  line('paint',[-.75,2.04,.82],[.75,2.04,.82],.042);
  for(const side of [-1,1]){
    line('detail',[side*.74,.94,-.71],[side*.98,.23,-.92],.05,'#a4bcc6');
    line('detail',[side*.74,.94,.81],[side*.98,.23,1.0],.05,'#a4bcc6');
    line('detail',[side*.98,.18,-1.54],[side*.98,.18,1.57],.064,'#acbec8');
    line('detail',[side*.98,.18,1.57],[side*.98,.30,1.82],.064,'#acbec8');
    box('detail',side*.93,1.47,-.17,.025,.055,.27,'#b3c9cd');
    line('light',[side*.74,1.04,-.75],[side*.74,1.04,.91],.012,'#64edee');
    box('light',side*.92,1.51,.05,.055,.09,.10,side<0?'#ff496c':'#7bf3a4');
    for(let i=0;i<4;i++)box('detail',side*.64,2.17,-.65+i*.16,.27,.045,.075,'#233b49');
  }
  // Tapered tail boom, stabilizers and fin, all within the physical fuselage.
  const tail=new THREE.CylinderGeometry(.25,.11,2.60,10);
  add('paint',tail,matrix(0,1.52,-2.18,1,1,1,Math.PI/2));
  box('paint',0,1.54,-2.89,1.25,.055,.34);
  box('paint',0,1.96,-3.28,.075,.98,.34,'#ffffff',-.25);
  box('light',0,2.45,-3.15,.09,.07,.09,'#ff4f80');
  sphere('paint',0,2.15,-.50,.55,.36,.84);
  add('detail',new THREE.CylinderGeometry(.09,.13,.56,10),matrix(0,2.56,-.06),'#afbdc6');
  sphere('detail',0,2.86,-.06,.21,.09,.21,'#8da5b1');
  // Separate instanced parts receive rotor rotation in ActorVisuals.
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    box('mainRotor',Math.sin(a)*2.22,.0,Math.cos(a)*2.22,.18,.045,4.26,'#263d4d',0,a);
    box('mainRotor',Math.sin(a)*4.24,.014,Math.cos(a)*4.24,.20,.05,.20,'#65efe5',0,a);
  }
  for(const a of [0,Math.PI/2])box('tailRotor',0,0,0,.035,1.08,.095,'#a4c0c9',a);
  return{geometry:b.finish(),wheels:[],animated:{mainRotor:true,tailRotor:true},rotors:{main:{x:0,y:2.86,z:-.06},tail:{x:.16,y:1.98,z:-3.26}}};
}

export function createSpecialVehicle(kind){
  if(kind==='bicycle')return bicycle();if(kind==='truck')return truck();if(kind==='helicopter')return helicopter();
  throw new RangeError(`Unknown special vehicle: ${kind}`);
}

/** Seat pose keeps the same player character visible while riding a bicycle. */
export function poseBicycleRider(human,phase=0){
  const rig=human?.userData?.rig;if(!rig)return;
  const spin=Number.isFinite(phase)?phase:0;
  rig.body.position.y=.16;rig.body.rotation.set(.24,0,0);rig.head.rotation.set(-.12,0,0);
  for(const [side,offset]of [['left',0],['right',Math.PI]]){
    rig[`${side}Leg`].rotation.set(-1.0+Math.sin(spin+offset)*.32,0,0);
    rig[`${side}Shin`].rotation.set(1.27-Math.cos(spin+offset)*.38,0,0);
    rig[`${side}Arm`].rotation.set(-.96,0,side==='left'?.12:-.12);
    rig[`${side}Forearm`].rotation.set(-.42,0,0);
  }
}
