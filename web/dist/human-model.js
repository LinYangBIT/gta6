import * as THREE from './vendor/three.module.js';

// Small, articulated original character. Segment meshes are merged by material
// with vertex colors so facial/clothing detail adds no extra draw calls.
function mergedGeometry(parts) {
  const positions=[], normals=[], uvs=[],colors=[];
  for(const part of parts) {
    const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry;
    geometry.applyMatrix4(part.matrix);
    positions.push(...geometry.attributes.position.array);
    normals.push(...geometry.attributes.normal.array);
    const color=part.color;
    for(let i=0;i<geometry.attributes.position.count;i++)colors.push(color.r,color.g,color.b);
    const uv=geometry.attributes.uv;
    if(uv)uvs.push(...uv.array);else for(let i=0;i<geometry.attributes.position.count;i++)uvs.push(0,0);
    geometry.dispose();if(geometry!==part.geometry)part.geometry.dispose();
  }
  const result=new THREE.BufferGeometry();
  result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  result.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  result.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  result.computeBoundingSphere();return result;
}

function segment(parent,name,position=[0,0,0],surface) {
  const group=new THREE.Group();group.name=name;group.position.set(...position);parent.add(group);
  const parts=new Map();
  const add=(material,geometry,at=[0,0,0],scale=[1,1,1],rotate=[0,0,0])=>{
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...at),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotate)),new THREE.Vector3(...scale));
    if(!parts.has(material))parts.set(material,[]);parts.get(material).push({geometry,matrix});
  };
  const sphere=(material,at,scale)=>add(material,new THREE.SphereGeometry(1,12,8),at,scale);
  const cylinder=(material,at,top,bottom,height,scale=[1,1,1],rotate=[0,0,0])=>add(material,new THREE.CylinderGeometry(top,bottom,height,12),at,scale,rotate);
  const box=(material,at,scale,rotate)=>add(material,new THREE.BoxGeometry(1,1,1),at,scale,rotate);
  const finish=()=>{const pieces=[];for(const [material,geometries] of parts)for(const geometry of geometries)pieces.push({...geometry,color:material.color});const mesh=new THREE.Mesh(mergedGeometry(pieces),surface);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return group;};
  return {group,add,sphere,cylinder,box,finish};
}

export function createHuman({shirt='#e7d6bd',pants='#31576a',skin='#bd8967',hair='#302323',accessories=true}={}) {
  const root=new THREE.Group();root.name='Coast resident / articulated original';
  const body=new THREE.Group();body.name='Body motion';body.position.y=-.047;root.add(body);
  const surface=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.79,metalness:0});surface.name='Resident / vertex-colored fabric and skin';
  const material=(name,color)=>({name,color:new THREE.Color(color)});
  const cloth=material('Linen overshirt',shirt),denim=material('Twill trousers',pants),skinMat=material('Skin',skin,.65),hairMat=material('Hair',hair),white=material('Ivory cotton','#e8e4d8'),sole=material('Sneaker sole','#ece7d9'),dark=material('Dark leather','#282b2d'),metal=material('Warm metal','#bda66e',.38,.7),eye=material('Eyes','#282521',.35);
  const torso=segment(body,'Shirt and torso',[0,0,0],surface);
  const profile=[[.0,.91],[.15,.92],[.174,1.02],[.186,1.19],[.207,1.33],[.19,1.39],[.10,1.445],[.07,1.45]].map(([r,y])=>new THREE.Vector2(r,y));
  torso.add(cloth,new THREE.LatheGeometry(profile,16),[0,0,0],[1.12,1,.66]);
  torso.sphere(cloth,[0,1.27,0],[.224,.20,.135]);
  // The central undershirt and two folded lapels make the front readable.
  torso.box(white,[0,1.235,.132],[.115,.34,.018]);
  torso.box(cloth,[-.084,1.365,.131],[.075,.115,.022],[.06,0,-.34]);
  torso.box(cloth,[.084,1.365,.131],[.075,.115,.022],[.06,0,.34]);
  torso.box(cloth,[-.13,1.245,.146],[.069,.072,.012]);
  torso.box(white,[-.13,1.28,.154],[.071,.008,.005]);
  for(let y=1.04;y<1.35;y+=.078)torso.sphere(metal,[.071,y,.149],[.007,.007,.004]);
  torso.cylinder(skinMat,[0,1.468,0],.068,.081,.14,[1,1,.91]);
  torso.sphere(denim,[0,.902,0],[.177,.112,.111]);
  torso.box(dark,[0,.956,.005],[.331,.032,.211]);
  torso.box(metal,[0,.955,.116],[.04,.031,.008]);
  if(accessories){torso.box(dark,[.08,1.2,.149],[.033,.47,.018],[0,0,-.29]);torso.sphere(dark,[.17,1.048,.134],[.085,.12,.045]);}
  torso.finish();

  const head=segment(body,'Head',[0,1.643,0],surface);
  head.sphere(skinMat,[0,0,0],[.128,.171,.116]);
  head.sphere(skinMat,[0,-.072,.025],[.105,.092,.097]);
  head.sphere(skinMat,[-.128,-.004,0],[.024,.044,.022]);head.sphere(skinMat,[.128,-.004,0],[.024,.044,.022]);
  head.sphere(skinMat,[0,-.016,.114],[.022,.039,.035]);
  head.sphere(hairMat,[0,.096,-.024],[.132,.091,.119]);
  head.sphere(hairMat,[0,.022,-.09],[.121,.119,.047]);
  for(const side of [-1,1]){
    head.sphere(white,[side*.049,.025,.104],[.025,.012,.012]);
    head.sphere(eye,[side*.049,.025,.115],[.009,.010,.004]);
    head.box(hairMat,[side*.049,.052,.11],[.053,.011,.013],[0,0,side*-.09]);
    head.box(hairMat,[side*.116,.034,-.002],[.014,.083,.037]);
  }
  head.sphere(hairMat,[0,-.078,.108],[.037,.007,.004]);
  if(accessories){
    // Fine sunglasses sit on the head rather than hiding the animated face.
    head.box(dark,[-.051,.115,.087],[.072,.032,.014],[.30,0,0]);
    head.box(dark,[.051,.115,.087],[.072,.032,.014],[.30,0,0]);
    head.box(metal,[0,.121,.092],[.037,.008,.01]);
  }
  head.finish();

  const rig={body,head:head.group};
  for(const [side,label] of [[-1,'left'],[1,'right']]) {
    const arm=segment(body,`${label} upper arm`,[side*.229,1.355,0],surface);
    arm.sphere(cloth,[side*.012,-.056,0],[.086,.116,.09]);
    arm.cylinder(cloth,[side*.018,-.11,0],.079,.073,.17);
    arm.cylinder(skinMat,[side*.019,-.215,0],.061,.051,.18);
    arm.sphere(skinMat,[side*.02,-.292,0],[.051,.056,.052]);
    arm.finish();
    const forearm=segment(arm.group,`${label} forearm`,[side*.02,-.29,0],surface);
    forearm.cylinder(skinMat,[0,-.112,0],.048,.034,.225);
    forearm.sphere(skinMat,[0,-.242,.004],[.039,.064,.029]);
    forearm.sphere(skinMat,[-side*.032,-.226,.018],[.018,.033,.019]);
    if(side===-1&&accessories){forearm.cylinder(dark,[0,-.18,0],.038,.037,.031);forearm.box(metal,[-.005,-.18,.039],[.038,.032,.009]);}
    forearm.finish();
    const leg=segment(body,`${label} upper leg`,[side*.101,.878,0],surface);
    leg.cylinder(denim,[0,-.19,0],.092,.068,.38,[1,1,1.12]);
    leg.sphere(denim,[0,-.373,0],[.069,.067,.079]);
    leg.finish();
    const shin=segment(leg.group,`${label} lower leg`,[0,-.378,0],surface);
    shin.cylinder(denim,[0,-.17,0],.066,.046,.34,[1,1,1.08]);
    shin.cylinder(white,[0,-.345,0],.048,.046,.048,[1,1,1.05]);
    shin.sphere(dark,[0,-.392,.041],[.067,.061,.12]);
    shin.sphere(sole,[0,-.432,.041],[.069,.021,.123]);
    shin.box(sole,[0,-.386,.112],[.092,.024,.044],[.2,0,0]);
    for(let i=0;i<3;i++)shin.box(white,[0,-.357-i*.006,.045+i*.02],[.071,.006,.008],[.2,0,0]);
    shin.finish();
    rig[`${label}Arm`]=arm.group;rig[`${label}Forearm`]=forearm.group;rig[`${label}Leg`]=leg.group;rig[`${label}Shin`]=shin.group;
  }
  // Keep the graph reference non-enumerable: Object3D.toJSON must not encounter
  // a circular userData object when this asset is exported to Blender/glTF.
  Object.defineProperty(root.userData,'rig',{value:rig,enumerable:false});
  root.userData.characterHeight=1.83;
  root.userData.gait={time:null,phase:0,amount:0};
  return root;
}

export function animateHuman(root,{speed=0,time=0,phase=0,gesture=false}={}) {
  const rig=root?.userData?.rig;if(!rig)return;
  const gait=root.userData.gait,velocity=Math.abs(Number.isFinite(speed)?speed:0),safeTime=Number.isFinite(time)?time:0;
  const dt=gait.time===null?1/60:Math.max(0,Math.min(.1,safeTime-gait.time));gait.time=safeTime;
  const moving=velocity>.08?Math.min(1,velocity/1.7):0,run=velocity>3.5;
  gait.amount+=(moving-gait.amount)*(1-Math.exp(-dt*14));
  gait.phase+=dt*(run?10:6.8)*Math.max(.5,Math.min(1.4,velocity/1.8));
  const swing=Math.sin(gait.phase+phase)*gait.amount,opposite=-swing;
  rig.body.position.y=-.047+Math.abs(Math.sin((gait.phase+phase)*2))*.018*gait.amount;
  rig.body.rotation.x=run?.05*gait.amount:0;
  rig.body.rotation.z=Math.sin(safeTime*1.8+phase)*.007*(1-gait.amount);
  rig.leftLeg.rotation.x=swing*(run?.88:.47);rig.rightLeg.rotation.x=opposite*(run?.88:.47);
  rig.leftShin.rotation.x=Math.max(0,-swing)*(run?1.14:.6);rig.rightShin.rotation.x=Math.max(0,-opposite)*(run?1.14:.6);
  rig.leftArm.rotation.x=opposite*(run?.72:.43);rig.rightArm.rotation.x=swing*(run?.72:.43);
  rig.leftArm.rotation.z=.055;rig.rightArm.rotation.z=-.055;
  rig.leftForearm.rotation.x=-(run?.8:.14)-Math.max(0,swing)*.15;
  rig.rightForearm.rotation.x=-(run?.8:.14)-Math.max(0,opposite)*.15;
  if(gesture&&gait.amount<.15){rig.rightArm.rotation.x=-.5;rig.rightForearm.rotation.x=-.75+Math.sin(safeTime*1.5)*.08;}
  rig.head.rotation.y=Math.sin(safeTime*.65+phase)*.055*(1-gait.amount);
  rig.head.rotation.x=Math.sin(safeTime*1.4)*.012;
}
