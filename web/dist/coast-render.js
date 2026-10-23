/** Street-scale coastal scenery. Every object follows the shared road layout. */
import { COAST_ROADS, COAST_BUILDINGS } from './coast-layout.js?v=5';
import { describeCoastBuilding } from './coast-architecture.js?v=5';

const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function pointDistance(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);}
function hash(x,z,salt=0){let n=Math.imul(Math.round(x*10)+salt,374761393)^Math.imul(Math.round(z*10),668265263);n=Math.imul(n^(n>>>13),1274126177);return(n^(n>>>16))>>>0;}
const roadSegments=()=>COAST_ROADS.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,width:r.width,id:r.id,kind:r.kind})));
let cachedSegments;
function distanceFromRoad(x,z,ignore){
  cachedSegments??=roadSegments();let distance=Infinity;
  for(const s of cachedSegments)if(s.id!==ignore)distance=Math.min(distance,pointDistance(x,z,s.a,s.b)-s.width/2);
  return distance;
}

export function describeCoastChunk(data,lod=0){
  const records=[],X=data.x,Z=data.z,S=128;
  const add=(type,x,y,z,sx,sy,sz,color,ry=0,seed=0,rx=0,rz=0)=>records.push({type,x,y,z,sx,sy,sz,color,ry,seed,rx,rz});
  const box=(x,y,z,w,h,d,color,type='solid',ry=0)=>add(type,x,y,z,w,h,d,color,ry);
  const cylinder=(x,y,z,r,h,color,type='cylinder')=>add(type,x,y,z,r,h,r,color);
  const owns=(x,z)=>x>=X&&x<X+S&&z>=Z&&z<Z+S;
  const clear=(x,z,pad=1)=>distanceFromRoad(x,z)>pad&&!data.features.some(f=>f.kind==='marina'&&Math.abs(x-f.sourceX)<f.sourceWidth/2+pad&&Math.abs(z-f.sourceZ)<f.sourceDepth/2+pad)&&!COAST_BUILDINGS.some(b=>Math.abs(x-b.x)<b.width/2+pad&&Math.abs(z-b.z)<b.depth/2+pad);
  function slab(x,z,w,d,color,type,y=.08,h=.20){const a=Math.max(X,x-w/2),b=Math.min(X+S,x+w/2),c=Math.max(Z,z-d/2),e=Math.min(Z+S,z+d/2);if(b>a&&e>c)box((a+b)/2,y,(c+e)/2,b-a,h,e-c,color,type);}
  // Shared endpoint miters join the road cross-section exactly. Two affine
  // triangle prisms fill each quadrilateral without coplanar overlapping slabs.
  function edge(road,index,offset){
    const points=road.points,last=points.length-1,p=points[index];
    const before=points[index>0?index-1:road.closed?last-1:0],after=points[index<last?index+1:road.closed?1:last];
    const direction=(a,b)=>{const length=Math.hypot(b.x-a.x,b.z-a.z)||1;return{x:(b.z-a.z)/length,z:-(b.x-a.x)/length};};
    let a=direction(before,p),b=direction(p,after);
    if(index===0&&!road.closed)a=b;if(index===last&&!road.closed)b=a;
    const mx=a.x+b.x,mz=a.z+b.z,length=Math.hypot(mx,mz)||1,nx=mx/length,nz=mz/length;
    const scale=offset/Math.max(.55,nx*b.x+nz*b.z);
    return{x:p.x+nx*scale,z:p.z+nz*scale};
  }
  function triangle(a,b,c,y,h,color,type){
    if((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x)<0)[b,c]=[c,b];
    add(type,a.x,y,a.z,1,h,1,color);
    records.at(-1).basis=[b.x-a.x,b.z-a.z,c.x-a.x,c.z-a.z];
  }
  function strip(road,index,left,right,y,h,color,type){
    const a=edge(road,index,left),b=edge(road,index,right),c=edge(road,index+1,right),d=edge(road,index+1,left);
    triangle(a,b,c,y,h,color,type);triangle(a,c,d,y,h,color,type);
    for(const record of records.slice(-2)){record.roadId=road.id;record.roadSegment=index;}
  }
  // A neutral land foundation makes gaps between paving and planted strips real
  // ground. Road surfaces sit above it; sidewalks remain at the actor's .22m step.
  box(X+64,-.105,Z+64,S,.20,S,X>=0?'#a5b58b':'#bcb29e','ground');
  const features=data.features||[];
  for(const f of features){
    const {x,z,width:w=20,depth:d=20}=f;
    if(f.kind==='ocean'||f.kind==='sea'){
      slab(x,z,w,d,'#338f9a','water',0,.02);
    }else if(f.kind==='beach'||f.kind==='sand'){
      slab(x,z,w,d,'#dbc9a4','sand',.001,.018);
    }else if(f.kind==='park'||f.kind==='lawn'){
      slab(x,z,w,d,'#819360','green',.001,.018);
    }else if(f.kind==='promenade'||f.kind==='boardwalk'){
      slab(x,z,w,d,f.kind==='boardwalk'?'#af9171':'#d6c5af','paving',.11,.22);
    }else if(f.kind==='plaza'){
      slab(x,z,w,d,'#cfb5a3','paving',.11,.22);
    }else if(f.kind==='roundabout'||f.kind==='island'){
      const cx=f.sourceX??x,cz=f.sourceZ??z,r=f.radius??Math.min(f.sourceWidth??w,f.sourceDepth??d)/2;
      if(owns(cx,cz)){cylinder(cx,.10,cz,r,.20,'#dfcfb4','round');cylinder(cx,.23,cz,r-.55,.15,'#759068','round');}
    }else if(f.kind==='canal'||f.kind==='water'||f.kind==='marina'){
      slab(x,z,w,d,'#31858c','water',.013,.02);
    }
  }
  // The road layout owns the same sampled curves used by collision/surface tests.
  for(const road of data.roads||[]){
    const segments=road.segments??road.points.slice(1).map((b,i)=>({a:road.points[i],b,index:i})).filter(s=>owns((s.a.x+s.b.x)/2,(s.a.z+s.b.z)/2));
    const half=road.width/2,sidewalk=road.sidewalkWidth??4,layer=Math.max(0,COAST_ROADS.findIndex(r=>r.id===road.id))*.00015;
    for(const segment of segments){
      const {a,b}=segment,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<.01)continue;
      const x=(a.x+b.x)/2,z=(a.z+b.z)/2,yaw=Math.atan2(dx,dz),nx=Math.cos(yaw),nz=-Math.sin(yaw);
      const bridge=(road.kind==='bridge'||road.kind==='causeway')&&x>80;
      strip(road,segment.index,-half,half,.008+layer,.035,'#465051','roadTri');
      if(!bridge)for(const side of [-1,1]){
        const cx=x+nx*side*(half+sidewalk/2),cz=z+nz*side*(half+sidewalk/2);
        if(distanceFromRoad(cx,cz,road.id)>-.1)strip(road,segment.index,side*half,side*(half+sidewalk),.11+layer,.22,'#d3bcae','pavingTri');
        const ex=x+nx*side*(half+.11),ez=z+nz*side*(half+.11);
        if(distanceFromRoad(ex,ez,road.id)>1)strip(road,segment.index,side*(half-.015),side*(half+.235),.14+layer,.26,'#e3d5bb','curbTri');
      }
      const open=distanceFromRoad(x,z,road.id)>half+1;
      if(open&&road.kind!=='alley'&&road.kind!=='roundabout'){
        for(const side of [-1,1])strip(road,segment.index,side*.14-.0525,side*.14+.0525,.033+layer,.012,'#ecc975','paintTri');
        if(road.width>=15)for(const side of [-1,1]){
          strip(road,segment.index,side*(half-2.9)-.0475,side*(half-2.9)+.0475,.034+layer,.012,'#d8d5c2','paintTri');
          if(!bridge&&(segment.index??0)%3===0)box(x+nx*side*(half-1.55),.035,z+nz*side*(half-1.55),2.7,.012,.12,'#d8d5c2','paint',yaw);
        }
      }
      if(bridge){
        strip(road,segment.index,-half-.6,half+.6,-.07,.14,'#b3aba0','curbTri');
        for(const side of [-1,1]){
          strip(road,segment.index,side*(half+.325),side*(half+.575),.5,1,'#d8c9b0','curbTri');
          strip(road,segment.index,side*(half+.25),side*(half+.65),1.03,.12,'#e8dcc6','curbTri');
        }
      }
      // Alternating segment groups place furniture at a human rhythm, without
      // adding a pole at every short curve sample or blocking the starter camera.
      const index=segment.index??0;
      if(lod<2&&index%7===3&&length>2&&open&&!bridge&&road.kind!=='alley'&&road.kind!=='roundabout'){
        for(const side of [-1,1]){
          const px=x+nx*side*(half+sidewalk-.75),pz=z+nz*side*(half+sidewalk-.75);
          if(owns(px,pz)&&clear(px,pz,.25)&&!(Math.abs(px-13)<4&&Math.abs(pz-32)<10))lamp(px,pz,yaw+side*Math.PI/2);
        }
      }
    }
  }
  // Refined hotels are hand placed rather than randomly repeated street boxes.
  for(const building of data.buildings||[])records.push(...describeCoastBuilding(building,lod));
  for(const f of features)featureProps(f);
  // Thin bands of shore foam, sampled in cells, add a readable waterline and
  // never extend into the playable street. They share the animated ocean shader.
  for(let z=Math.ceil(Z/12)*12;z<Z+S;z+=12){
    for(const f of features)if((f.kind==='ocean'||f.kind==='sea')&&owns(f.x-f.width/2,z)){
      const shore=(f.sourceX??f.x)-(f.sourceWidth??f.width)/2;
      if(owns(shore,z)&&Math.abs(shore-110)<.1&&distanceFromRoad(shore+1,z)>5)box(shore+1.5,.025,z,2.2,.018,10,'#c4ded2','foam');
    }
  }
  return records;

  function lamp(x,z,yaw){
    cylinder(x,.25,z,.2,.48,'#4a514c');cylinder(x,3.65,z,.072,7.2,'#6b716a');
    box(x+Math.sin(yaw)*.72,7.12,z+Math.cos(yaw)*.72,.12,.12,1.6,'#5a625e','metal',yaw);
    box(x+Math.sin(yaw)*1.42,7.05,z+Math.cos(yaw)*1.42,.48,.13,.68,'#e8dfbe','glow',yaw);
  }
  function palm(x,z,height,seed){
    const lean=((seed%9)-4)*.12,angle=(seed%113)/113*TAU;
    for(let n=0;n<6;n++){
      const t=(n+.5)/6,px=x+Math.sin(angle)*lean*t*t,pz=z+Math.cos(angle)*lean*t*t;
      add('cylinder',px,.2+height*t,pz,.16*(1-t*.45),height/6+.035,.16*(1-t*.45),n%2?'#8f846b':'#a29476',0,0,Math.cos(angle)*lean/height,-Math.sin(angle)*lean/height);
      if(lod===0)cylinder(px,.2+height*(n+1)/6,pz,.175*(1-t*.45),.065,'#c0ad87');
    }
    const tx=x+Math.sin(angle)*lean,tz=z+Math.cos(angle)*lean;
    cylinder(tx,height+.2,tz,.29,.65,'#6c7244');
    const count=lod===2?7:11;
    for(let n=0;n<count;n++)add('leaf',tx,height+.36,tz,4.8+(n%3)*.38,3.4+(n%2)*.9,4.8+(n%3)*.38,n%3?'#3c6d46':'#779557',n/count*TAU+(seed%17)*.09);
    if(lod===0)for(let n=0;n<3;n++)add('crown',tx+Math.sin(n*2)*.22,height+.1,tz+Math.cos(n*2)*.22,.17,.22,.17,'#756044');
  }
  function bench(x,z,yaw=0){
    const placed=(dx,y,dz,w,h,d,color,type='solid')=>box(x+dx*Math.cos(yaw)+dz*Math.sin(yaw),y,z-dx*Math.sin(yaw)+dz*Math.cos(yaw),w,h,d,color,type,yaw);
    placed(0,.62,0,2.2,.12,.63,'#a08460');
    for(let n=0;n<4;n++)placed(0,.93+n*.13,-.26,2.2,.065,.07,'#ac8d66');
    for(const side of [-1,1])placed(side*.82,.36,0,.10,.55,.52,'#405254','metal');
  }
  function umbrella(x,z,color){
    cylinder(x,1.33,z,.045,2.4,'#a49478');add('canopy',x,2.56,z,1.62,.68,1.62,color);
    if(lod===0){cylinder(x,.25,z,.39,.10,'#baad94','round');for(const side of [-1,1]){box(x+side*1.2,.48,z,.62,.10,1.65,'#e7dbc2');box(x+side*1.2,.75,z-.55,.62,.15,.7,color,'solid');}}
  }
  function bin(x,z){cylinder(x,.65,z,.30,.83,'#4a6a61');cylinder(x,1.08,z,.33,.09,'#b2b9a3');box(x,1.02,z+.31,.34,.11,.035,'#223a37');}
  function featureProps(f){
    const {x,z,width:w=20,depth:d=20}=f,kind=f.kind;
    if(['park','lawn','promenade'].includes(kind)){
      const firstX=Math.ceil((x-w/2)/18)*18,firstZ=Math.ceil((z-d/2)/24)*24;
      for(let px=firstX+8;px<x+w/2;px+=18)for(let pz=firstZ+9;pz<z+d/2;pz+=24){
        const seed=hash(px,pz,610);if(!owns(px,pz)||!clear(px,pz,6)||seed%4===0)continue;
        palm(px+(seed%5)*.4,pz,7+(seed%40)/10,seed);
        if(lod===0&&seed%5===0){add('crown',px+2,.5,pz+1,1.1,.6,1.5,'#708750');add('crown',px-1,.4,pz-.6,1.2,.5,.8,'#7e935b');}
      }
      if(lod<2)for(let pz=Math.ceil((z-d/2)/38)*38+17;pz<z+d/2;pz+=38){const px=x-w/2+3.7;if(owns(px,pz)&&clear(px,pz,2)){bench(px,pz,Math.PI/2);bin(px,pz+2.8);}}
    }else if(kind==='beach'||kind==='sand'){
      for(let pz=Math.ceil((z-d/2)/29)*29+11;pz<z+d/2;pz+=29){
        const px=x+((hash(x,pz)%13)-6)*.8;
        if(owns(px,pz)&&clear(px,pz,5)&&lod<2)umbrella(px,pz,['#c2857b','#769d9e','#d4b274'][hash(px,pz)%3]);
      }
      if(lod<2&&owns(x,z)&&clear(x,z,7)&&Math.floor(z/128)%2===0){
        // A raised lifeguard cabin, with exterior rails and a ladder.
        for(const dx of [-1.45,1.45])for(const dz of [-1.1,1.1])box(x+dx,1.12,z+dz,.13,2.15,.13,'#d5c7a5');
        box(x,2.0,z,3.3,.2,2.8,'#e3c7a4');box(x,2.9,z,2.6,1.6,2.0,'#8fbeb4');box(x,3.85,z,3.4,.18,2.7,'#f0d4ae');
        box(x,3.0,z-1.02,1.7,.65,.06,'#315b61','glazing');
        for(const dx of [-1.55,1.55])box(x+dx,2.55,z,.08,1.05,2.7,'#d9dec6');
        for(let k=0;k<7;k++)box(x, .3+k*.24,z+2.6-k*.12,1.1,.08,.3,'#dbc8a5');
      }
    }else if(kind==='roundabout'||kind==='island'){
      const cx=f.sourceX??x,cz=f.sourceZ??z;
      if(owns(cx,cz)){palm(cx,cz,9,hash(cx,cz));if(lod<2)for(let i=0;i<7;i++)add('crown',cx+Math.sin(i*TAU/7)*4,.8,cz+Math.cos(i*TAU/7)*4,1.3,.7,1.3,i%2?'#6d8b57':'#9d9b59');}
    }else if(kind==='plaza'){
      for(const side of [-1,1]){const px=x+side*w*.3,pz=z;if(owns(px,pz)&&clear(px,pz,3)){palm(px,pz,6.5,hash(px,pz));if(lod===0)bench(px,pz+3);}}
    }
  }
}
