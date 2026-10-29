/** Authored metropolitan destinations connected to the same unlimited streets.
 * Ground obstacles and visual pieces are generated together; every venue keeps
 * the 18 m road/sidewalk margin used by procedural mission and traffic paths. */
const S=128;
const hash=(...parts)=>{let h=2166136261;for(const c of parts.join('|'))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const VENUES=Object.freeze([
  {cx:-3,cz:0,id:'civic',name:'市民运动公园',label:'CIVIC COMMONS · 市民运动公园',kind:'sports'},
  {cx:-3,cz:-1,id:'transit',name:'中央交通广场',label:'CENTRAL TRANSIT · 中央交通广场',kind:'transit'},
  {cx:-3,cz:-2,id:'cargo',name:'货运工业区',label:'FREIGHT WORKS · 货运工业区',kind:'cargo'},
  {cx:-3,cz:-3,id:'aviation',name:'西湾航空站',label:'WEST BAY AIR · 西湾航空站',kind:'aviation'},
  {cx:-4,cz:-2,id:'hills',name:'山麓别墅区',label:'CREST HILLS · 山麓别墅区',kind:'hills'},
  {cx:-4,cz:0,id:'market',name:'街头集市',label:'NIGHT MARKET · 街头集市',kind:'market'},
]);

export const CITY_POINTS_OF_INTEREST=Object.freeze([
  {x:40,z:68,label:'海滩篮球场',kind:'sports'},
  {x:85,z:112,label:'沙滩排球 / 救生站',kind:'beach'},
  ...VENUES.map(v=>({x:v.cx*S+64,z:v.cz*S+64,label:v.name,kind:v.kind})),
].map(v=>Object.freeze(v)));

export function metroDistrictAt(cx,cz){
  const v=VENUES.find(v=>v.cx===cx&&v.cz===cz);
  return v?{id:v.id,name:v.name,label:v.label,colors:['#45697b','#81647f','#738591'],accent:'#40e8f2',styles:['brick','residential'],floors:[2,8]}:null;
}

const bounds=(x,z,w,d)=>({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2});
const element=(kind,x,z,width,depth,extra={})=>({kind,x,z,width,depth,...extra});

export function getMetroChunk(cx,cz,seed=610){
  const v=VENUES.find(v=>v.cx===cx&&v.cz===cz);if(!v)return null;
  const x=cx*S,z=cz*S,key=`${cx},${cz}`,buildings=[],colliders=[],cityElements=[];
  const district=metroDistrictAt(cx,cz),n=hash(seed,key);
  const building=(lx,lz,w,d,h,style='brick')=>{
    const id=`${key}/metro-building/${buildings.length}`,color=district.colors[(n+buildings.length)%district.colors.length];
    buildings.push({id,x:x+lx,z:z+lz,width:w,depth:d,height:h,floors:Math.max(2,Math.round(h/3.3)),style,color,accent:district.accent,detailSeed:hash(id,seed),roof:'terrace',orientation:0,infill:true});
    colliders.push({id,kind:'building',...bounds(x+lx,z+lz,w,d),height:h+5});
  };
  const item=(kind,lx,lz,w,d,extra={})=>{const f=element(kind,x+lx,z+lz,w,d,{id:`${key}/${kind}/${cityElements.length}`,detailSeed:hash(seed,key,kind),...extra});cityElements.push(f);return f;};
  const block=(f,height,kind=f.kind)=>colliders.push({id:f.id,kind,...bounds(f.x,f.z,f.width,f.depth),height});
  // Four corner premises frame each open civic/industrial parcel instead of a
  // uniform wall of identical towers. Their entrances face the street margins.
  for(const lx of [30,98])for(const lz of [30,98])building(lx,lz,21,21, v.kind==='hills'?9:v.kind==='cargo'?11:14+(hash(lx,lz,seed)%4)*3.2,v.kind==='hills'?'residential':'brick');
  const vehicleSpawns=[{x:x+7,z:z+30,yaw:Math.PI,kind:'sedan'},{x:x+121,z:z+78,yaw:0,kind:'coupe'}];
  if(v.kind==='sports'){
    item('basketball',64,62,30,39);item('skate',97,65,17,31);
    item('garden',31,64,17,31);item('shelter',64,104,16,5);
    vehicleSpawns.push({x:x+114,z:z+53,yaw:Math.PI,kind:'bicycle'});
  }else if(v.kind==='transit'){
    item('station',64,64,39,23);item('flyover',64,64,19,92);
    for(const lx of [51,77])for(const lz of [26,102]){const f=item('pier',lx,lz,1.6,2.1);block(f,8.1);}
    // Elevated rail crosses this plaza above ground level, with a protected
    // underside collider interpreted by altitude-aware flight physics.
    colliders.push({id:`${key}/flyover/deck`,kind:'overhead',...bounds(x+64,z+64,19,92),minHeight:7.5,minY:7.5,maxY:9,height:9});
    item('shelter',31,64,5,19);item('shelter',98,64,5,19);
  }else if(v.kind==='cargo'){
    for(const lx of [52,76])for(const lz of [46,63,80]){const f=item('container',lx,lz,12,5.4,{stack:1+(hash(lx,lz,seed)%2)});block(f,f.stack*2.65+.22);}
    item('crane',64,64,49,55);
    for(const lx of [41,87])for(const lz of [39,89]){const f=item('pier',lx,lz,1.5,1.5,{crane:true});block(f,20);}
    vehicleSpawns.push({x:x+113,z:z+52,yaw:0,kind:'truck'});
  }else if(v.kind==='aviation'){
    item('helipad',64,64,36,36);item('fuel',31,64,17,27);
    const f=item('hangar',98,64,21,35);block(f,9.4);
    item('windsock',47,97,2,2);
    vehicleSpawns.push({x:x+64,z:z+64,yaw:Math.PI,kind:'helicopter'});
  }else if(v.kind==='hills'){
    const f=item('hill',64,64,39,39);block(f,31);
    item('crest-sign',64,64,31,4);item('garden',31,64,17,31);item('garden',98,64,17,31);
  }else{
    item('market',64,64,39,39);item('fuel',31,64,17,31);item('shelter',98,64,5,19);
  }
  const features=[{kind:'plaza',x:x+64,z:z+64,width:40,depth:40,detailSeed:hash(seed,key,'plaza')}];
  colliders.push(...cityElementColliders(cityElements));
  return{key,cx,cz,x,z,seed,detailSeed:n,layout:`metro-${v.kind}`,metro:true,district,buildings,features,cityElements,colliders,vehicleSpawns};
}

/** These sit on existing beach/park surfaces; no street or contact is moved. */
export const COAST_CITY_ELEMENTS=Object.freeze([
  element('basketball',40,68,27,37,{id:'coast/basketball'}),
  element('volleyball',85,112,24,37,{id:'coast/volleyball'}),
  element('lifeguard',84,29,7,8,{id:'coast/lifeguard'}),
  element('outdoor-gym',39,173,25,24,{id:'coast/gym'}),
  element('shelter',20,222,4,16,{id:'coast/bus-shelter'}),
]);

export function coastCityElements(cx,cz){return COAST_CITY_ELEMENTS.filter(f=>Math.floor(f.x/S)===cx&&Math.floor(f.z/S)===cz).map(f=>({...f}));}

export function cityElementColliders(elements=[]){
  const result=[];
  for(const f of elements){
    const{x,z,width:w,depth:d}=f;
    const block=(dx,dz,width,depth,height,minY=0)=>result.push({id:`${f.id}/solid/${result.length}`,kind:'street-furniture',...bounds(x+dx,z+dz,width,depth),height,minY,maxY:height});
    if(f.kind==='lifeguard')block(0,0,w+1,d+1,5.6);
    if(f.kind==='basketball')for(const side of[-1,1])block(0,side*(d/2-1.2),.24,.24,4.2);
    if(f.kind==='market')for(const dx of[-w*.31,w*.31])for(const dz of[-d*.31,0,d*.31])block(dx,dz,Math.min(6,w*.2),Math.min(3,d*.16),3.3);
    if(f.kind==='fuel'){
      for(const side of[-1,1])block(0,side*d*.22,1.5,.85,4.9);
      block(0,0,w,d*.62,5.3,4.7);
    }
    if(f.kind==='shelter'){
      block(0,d*.43,w,.1,3.3);block(0,0,w*.72,d*.42,.9);
      block(0,0,w+.4,d+.4,3.3,2.9);
    }
    if(f.kind==='skate')for(const side of[-1,1])block(0,side*d*.28,w*.7,5,1.55);
  }
  return result;
}

/** Primitive instance records reuse existing materials, so richness adds no
 * unbounded meshes or lights. LOD cuts structural detail before silhouette. */
export function describeCityElements(elements=[],lod=0){
  const records=[];
  const add=(type,x,y,z,sx,sy,sz,color,ry=0,rx=0,rz=0)=>records.push({type,x,y,z,sx,sy,sz,color,ry,rx,rz,seed:0});
  const box=(x,y,z,w,h,d,color,type='solid',ry=0)=>add(type,x,y,z,w,h,d,color,ry);
  const pole=(x,y,z,r,h,color)=>add('cylinder',x,y,z,r,h,r,color);
  // Paving tops out at .25 m; venue color sits above it and line markings
  // sit above that color surface, avoiding both buried paint and coplanar flicker.
  const paint=(x,z,w,d,color='#dbe5e3',y=.29)=>box(x,y,z,w,.018,d,color,'paint');
  const surface=(x,z,w,d,color)=>paint(x,z,w,d,color,.265);
  for(const f of elements){
    const{x,z,width:w,depth:d,kind}=f;
    if(kind==='basketball'||kind==='volleyball'){
      surface(x,z,w,d,kind==='basketball'?'#247a89':'#ddc78f');
      paint(x,z,.11,d);for(const side of[-1,1]){paint(x+side*w/2,z,.12,d);paint(x,z+side*d/2,w,.12);}
      if(kind==='basketball'){
        paint(x,z,w,.10);
        if(lod<2)for(let i=0;i<20;i++){const a=i/20*Math.PI*2;paint(x+Math.cos(a)*3.4,z+Math.sin(a)*3.4,.17,.45,'#dbe5e3');}
        for(const side of[-1,1]){pole(x,1.7,z+side*(d/2-1.2),.09,3.0,'#263f51');box(x,3.3,z+side*(d/2-2),3.2,1.65,.12,'#dce6ea');box(x,3.3,z+side*(d/2-2.08),1,.63,.02,'#ed7f6e');paint(x,z+side*(d/2-4.5),w*.48,.10);}
      }else if(lod<2){for(const side of[-1,1])pole(x+side*(w/2-1),1.5,z,.08,2.7,'#ddd7b4');box(x,2,z,w-2,.07,.06,'#e1e0ce');for(let k=0;k<12;k++)box(x+(k/11-.5)*(w-2),1.6,z,.025,.85,.025,'#b6bcb6');}
    }else if(kind==='container'){
      const color=['#377c85','#aa7759','#73587d'][(Math.round(x+z)+10000)%3];
      for(let j=0;j<(f.stack||1);j++){const y=1.55+j*2.65;box(x,y,z,w,2.6,d,color);box(x,y+1.34,z,w+.12,.08,d+.12,'#abc1c5','metal');if(lod<2)for(let n=0;n<7;n++)for(const side of[-1,1])box(x+(n/6-.5)*(w-.35),y,z+side*(d/2+.025),.10,2.4,.06,'#b2b9b2','metal');}
    }else if(kind==='crane'){
      box(x,20.2,z,w,1.8,2.2,'#c79a56','metal');for(const side of[-1,1])box(x+side*(w/2-1.5),20.3,z,1.2,1.4,d,'#c79a56','metal');
      box(x,18.8,z+8,5,2.5,4,'#2e6075','glazing');pole(x,12.3,z,.09,13,'#313f4c');box(x,5.6,z,3.8,.6,1.2,'#c79a56','metal');
      if(lod===0)for(let n=0;n<8;n++)box(x+(n/7-.5)*(w-4),21.2,z,.12,.7,2.2,'#485765','metal');
    }else if(kind==='pier'){
      box(x,(f.crane?20:8)/2,z,w,f.crane?20:8,d,f.crane?'#c79a56':'#687888','solid');
    }else if(kind==='flyover'){
      box(x,8.1,z,w,1.2,d,'#697b8c');box(x,8.74,z,w-.5,.08,d,'#303e50','road');
      for(const side of[-1,1]){box(x+side*(w/2-.3),9.2,z,.28,.9,d,'#9cadbd','metal');paint(x+side*3.2,z,.13,d,'#d1c494',8.8);}
      if(lod<2)for(let t=-d/2+4;t<d/2;t+=8){box(x,8.89,z+t,9,.10,.45,'#625c56');for(const side of[-1,1])box(x+side*2,8.94,z+t,.1,.1,8,'#a7b8c1','metal');}
    }else if(kind==='station'){
      box(x,.36,z,w,.25,d,'#8495a6','paving');
      for(const side of[-1,1]){box(x+side*13,4.2,z,7,.35,d,'#376d82');for(const at of[-d*.35,d*.35])pole(x+side*13,2.1,z+at,.12,4.1,'#33485d');box(x+side*13,1,z,4,.3,8,'#ba825c');}
    }else if(kind==='helipad'){
      surface(x,z,w,d,'#3b5262');for(const side of[-1,1]){paint(x+side*4.2,z,1.2,13,'#eef0bb');paint(x+side*(w/2-1),z,.15,d-2,'#f6d28c');paint(x,z+side*(d/2-1),w-2,.15,'#f6d28c');}paint(x,z,8.4,1.3,'#eef0bb');
      for(const dx of[-w/2+2,w/2-2])for(const dz of[-d/2+2,d/2-2])box(x+dx,.40,z+dz,.28,.15,.28,'#65f5c9','glow');
    }else if(kind==='hangar'){
      box(x,4.5,z,w,8.8,d,'#667e92');box(x,9.1,z,w+1,.4,d+1,'#a2bac5');box(x-w/2-.03,3.8,z,.08,6.5,d*.8,'#263c54','glazing');if(lod<2)for(let t=-d*.45;t<d*.45;t+=2.1)box(x-w/2-.1,3.8,z+t,.08,6.4,.10,'#bdcbd0','metal');
    }else if(kind==='windsock'){
      pole(x,3.5,z,.075,6.8,'#c8ced1');box(x+1.2,6.8,z,2.4,.55,.55,'#f29d5c');if(lod===0)for(const offset of[.3,.9,1.5])box(x+offset,6.8,z,.28,.56,.56,'#e8e2c8');
    }else if(kind==='fuel'){
      surface(x,z,w,d,'#627080');box(x,4.9,z,w,.35,d*.6,'#3d586f');box(x,5.13,z,w,.12,d*.62,'#eaa668','glow');
      for(const side of[-1,1]){pole(x,2.5,z+side*d*.23,.13,4.7,'#c2cbd0');box(x,.85,z+side*d*.22,1.5,1.4,.85,'#d7cebb');box(x,1.07,z+side*d*.22-.44,.9,.5,.03,'#183c48','glazing');}
    }else if(kind==='hill'){
      for(let j=0;j<6;j++){const scale=1-j*.12;box(x,2.4+j*4,z,w*scale,4.8,d*scale,j%2?'#71816b':'#5b7667','green');}
      box(x,25.3,z,11,.6,12,'#b9b49c');box(x,27.8,z,9,4.5,9,'#8c9f9b','facade');box(x,30.2,z,10,.3,10,'#d1d9cc');
    }else if(kind==='crest-sign'){
      // Repeating fin letters form a large original hillside landmark.
      const letters=['C','R','E','S','T'];const glyph={C:['111','100','100','100','111'],R:['110','101','110','101','101'],E:['111','100','110','100','111'],S:['111','100','111','001','111'],T:['111','010','010','010','010']};
      if(lod<2)for(let l=0;l<letters.length;l++)for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(glyph[letters[l]][row][col]==='1')box(x+(l-2)*5.2+(col-1)*1.1,25+(4-row)*1.2,z-12,1.12,1.2,.45,'#e3e2cf');
    }else if(kind==='garden'){
      surface(x,z,w,d,'#567c67');for(const side of[-1,1]){pole(x,1.9,z+side*d*.27,.15,3.5,'#816d59');add('crown',x,4.4,z+side*d*.27,2.8,3.5,2.8,'#4f7756');}box(x, .6,z,5,.3,1.2,'#b18063');
    }else if(kind==='market'){
      surface(x,z,w,d,'#725c70');
      for(const dx of[-w*.31,w*.31])for(const dz of[-d*.31,0,d*.31]){const sw=Math.min(6,w*.2),sd=Math.min(3,d*.16);box(x+dx,1,z+dz,sw,1.5,sd,'#8b6a67');box(x+dx,3.1,z+dz,sw+.5,.3,sd+.6,dx<0?'#dbb66e':'#56b4ac');for(const side of[-1,1])pole(x+dx+side*sw*.45,1.7,z+dz,.055,2.8,'#d9d7c7');if(lod===0)for(let n=0;n<3;n++)box(x+dx+(n-1)*sw*.22,1.95,z+dz,sw*.18,.35,sd*.3,['#e2b46a','#8db36f','#c7798a'][n]);}
      box(x,5.2,z,w-.3,.06,.06,'#c5c5ae');if(lod<2)for(let n=0;n<9;n++)box(x+(n/8-.5)*(w-2),5.0,z,.18,.22,.18,n%2?'#ffd18c':'#b38bea','glow');
    }else if(kind==='skate'){
      surface(x,z,w,d,'#7c8795');for(const side of[-1,1]){box(x,.9,z+side*d*.28,w*.7,1.3,5,'#99a9b4');box(x,1,z,w*.6,.07,.07,'#c5cdd1','metal');}
    }else if(kind==='lifeguard'){
      for(const dx of[-2,2])for(const dz of[-2.4,2.4])pole(x+dx,1.2,z+dz,.12,2.3,'#a59b85');box(x,2.4,z,w,.35,d,'#ced5c9');box(x,3.9,z,w*.8,2.6,d*.7,'#7eb4bd');box(x,4.1,z-d*.35-.02,w*.55,1.3,.06,'#254659','glazing');box(x,5.4,z,w+1,.3,d+1,'#ddb580');
    }else if(kind==='outdoor-gym'){
      surface(x,z,w,d,'#667b72');for(const dx of[-7,0,7]){for(const dz of[-3,3])pole(x+dx,1.5,z+dz,.075,2.6,'#bdc9bd');box(x+dx,2.8,z,.12,.12,6,'#3d576b','metal');box(x+dx,.7,z,1.3,.25,3,'#bf8d68');}
    }else if(kind==='shelter'){
      box(x,3.1,z,w+.4,.22,d+.4,'#466e88');for(const dx of[-w*.4,w*.4])for(const dz of[-d*.4,d*.4])pole(x+dx,1.6,z+dz,.06,2.9,'#92adbc');box(x,1.4,z+d*.43,w,2.7,.06,'#346577','glazing');box(x,.8,z,w*.72,.18,d*.42,'#b3916e');box(x,2.7,z-d*.43,w*.7,.23,.05,'#69e8e8','glow');
    }
  }
  return records;
}
