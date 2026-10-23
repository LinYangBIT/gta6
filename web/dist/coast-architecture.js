/**
 * Manually authored Art Deco hotel exteriors, studied from the public Vice City
 * Ocean Drive / GTA VI hotel screenshots. These are new meshes, not game assets.
 * The street-facing elevation is local +X; widths/depths are X/Z footprints.
 */
const CREAM = '#e8e2ce';
const FRAME = '#d7d7c5';
const GLASS = '#214553';
const DARK = '#394448';
const FONT = {
  A:['01110','10001','10001','11111','10001','10001','10001'],
  B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'],
  D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'],
  F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'],
  H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'],
  L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'],
  N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],
  P:['11110','10001','10001','11110','10000','10000','10000'],
  R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],
  T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],
  V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','11011','10001'],
  X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],
};

export function describeCoastBuilding(building, lod = 0) {
  const b=building, records=[];
  const w=b.width, d=b.depth, h=b.height, base=.22, front=w/2;
  const orientation=Number.isFinite(b.orientation)?b.orientation:0, co=Math.cos(orientation), si=Math.sin(orientation);
  const variant=b.landmark || (b.style==='glass'?'tower':'apartment');
  const styles={
    colony:{wall:'#75aeb0',accent:'#80eadb',dark:'#427d88',floors:4},
    dominion:{wall:'#e7dfc9',accent:'#d99594',dark:'#9d8d7f',floors:5},
    dixon:{wall:'#e4e0d1',accent:'#daaa7b',dark:'#927468',floors:7},
    coral:{wall:'#d99b94',accent:'#76bfb4',dark:'#b37570',floors:4},
    tower:{wall:'#aec5c5',accent:'#b7cfce',dark:'#728a95',floors:Math.round(h/3.5)},
    apartment:{wall:b.color||'#d9c8b1',accent:b.accent||'#a7bdad',dark:'#8a8d84',floors:b.floors||Math.round(h/3.4)},
  };
  const style=styles[variant]||styles.apartment;
  const floors=Math.max(2,Math.min(24,b.floors||style.floors));
  const floorH=(h-3.6)/(floors-1), roof=base+h;
  const seed=(b.detailSeed||1)%65521/101;
  function add(type,x,y,z,sx,sy,sz,color,ry=0,rx=0,rz=0) {
    records.push({type,x:b.x+co*x+si*z,y,z:b.z-si*x+co*z,sx,sy,sz,color,ry:orientation+ry,rx,rz,seed});
  }
  const box=(x,y,z,sx,sy,sz,color=style.wall,type='solid',ry=0,rx=0,rz=0)=>add(type,x,y,z,sx,sy,sz,color,ry,rx,rz);
  const round=(x,y,z,r,height,color,rz=0)=>add('round',x,y,z,r,height,r,color,0,0,rz);
  function roundedMass(x,y,z,width,height,depth,r,color) {
    box(x,y,z,width-2*r,height,depth,color,'stucco');
    box(x,y,z,width,height,depth-2*r,color,'stucco');
    for(const sx of [-1,1])for(const sz of [-1,1])round(x+sx*(width/2-r),y,z+sz*(depth/2-r),r,height,color);
  }
  function horizontalBand(y,thickness=.18,overhang=.48,color=CREAM) {
    box(0,y,0,w+overhang,thickness,d+overhang,color);
  }
  function frontWindow(z,y,width=2.1,height=2.15,detail=lod===0) {
    const x=front+.025;
    // Dark recess, proud frame, individual panes, sill and lintel.
    box(x,y,z,.05,height,width,'#123742','glazing');
    if(lod>=2)return;
    const fw=.09;
    for(const side of [-1,1]) {
      box(x+.13,y,z+side*(width/2+.045),.22,height+.18,fw,FRAME,'metal');
      box(x+.13,y+side*(height/2+.045),z,.22,fw,width+.18,FRAME,'metal');
    }
    box(x+.12,y,z,.17,height,.065,FRAME,'metal');
    box(x+.19,y-height/2-.1,z,.40,.12,width+.33,CREAM);
    if(detail) {
      box(x+.11,y+.13,z,.15,.06,width,FRAME,'metal');
      box(x+.058,y,z-width*.24,.026,height*.90,width*.40,'#32515c','glazing');
      if(Math.floor(z*3+y*7+seed)%4===0)box(x+.07,y,z+width*.25,.028,height*.87,width*.32,'#c8b99a','solid');
      box(x+.05,y+height*.27,z,.032,.055,width*.9,'#56737b','metal');
    }
  }
  function sideWindows(side) {
    if(lod>=2)return;
    const z=side*(d/2+.035), cols=Math.max(2,Math.floor((w-5)/4.8));
    const count=lod===0?floors-1:Math.min(floors-1,6);
    for(let row=0;row<count;row++) {
      const y=4.5+row*(h-5)/Math.max(1,count);
      for(let col=0;col<cols;col++) {
        const x=(col-(cols-1)/2)*(w-5)/cols;
        box(x,y,z,2.0,2.0,.06,GLASS,'glazing');
        box(x,y-1.08,z+side*.10,2.25,.14,.28,CREAM);
        if(lod===0) {
          for(const edge of [-1,1])box(x+edge*1.035,y,z+side*.08,.075,2.1,.16,FRAME,'metal');
          box(x,y,z+side*.08,.07,2.1,.14,FRAME,'metal');
          box(x,y+.2,z+side*.08,2.1,.065,.14,FRAME,'metal');
        }
      }
    }
  }
  function glyph(letter,x,top,z,scale,color,type='glow') {
    const rows=FONT[letter];if(!rows)return;
    rows.forEach((row,y)=>{
      // Horizontal runs merge many neon strokes into a single shared-box instance.
      for(let col=0;col<5;){
        if(row[col]!=='1'){col++;continue;}
        let end=col+1;while(end<5&&row[end]==='1')end++;
        const length=end-col;
        box(x,top-(y+.5)*scale,z-((col+end)/2-2.5)*scale,.055,scale*.82,length*scale*.92,color,type);
        col=end;
      }
    });
  }
  function text(label,x,y,z,width,color=CREAM,type='glow') {
    const scale=width/Math.max(1,label.length*6-1), total=(label.length*6-1)*scale;
    [...label].forEach((letter,index)=>glyph(letter,x,y+3.5*scale,z+total/2-(index*6+2.5)*scale,scale,color,type));
  }
  function blade(label,z,low,high,color=style.accent) {
    const height=high-low, scale=Math.min(.32,height/(label.length*8));
    const bw=5*scale+.5,x=front+.80;
    box(x,(low+high)/2,z,1.15,height+.55,bw,style.dark,'metal');
    box(x+.60,(low+high)/2,z,.035,height+.23,bw-.17,'#2c4446');
    for(const side of [-1,1])box(x+.64,(low+high)/2,z+side*(bw/2-.1),.05,height+.18,.055,color,'glow');
    box(x+.64,high+.18,z,.05,.05,bw-.18,color,'glow');
    box(x+.64,low-.18,z,.05,.05,bw-.18,color,'glow');
    const textTop=high-(height-label.length*8*scale)/2;
    if(lod<2)for(let n=0;n<label.length;n++)glyph(label[n],x+.66,textTop-n*8*scale,z,scale,CREAM);
  }
  function entrance(z=0,width=4.8) {
    const x=front;
    box(x+.08,1.66,z,.1,2.86,width,'#173c44','glazing');
    for(const side of [-1,1])box(x+.25,1.69,z+side*(width/2+.1),.4,3.0,.2,CREAM);
    box(x+.25,3.22,z,.4,.2,width+.4,CREAM);
    box(x+.16,1.68,z,.16,2.88,.08,'#a2aca5','metal');
    for(const side of [-1,1])box(x+.28,1.45,z+side*.23,.06,.6,.045,'#d7bc84','metal');
    box(x+.72,.25,z,1.4,.14,width+.75,'#e2d2b7','paving');
    box(x+.45,3.51,z,1.5,.16,width+1.5,style.accent);
    if(lod===0) {
      box(x+.16,2.91,z,.05,.15,width-.3,'#d2b077','glow');
      box(x+.48,3.41,z,1.35,.025,width+1.3,'#eed3a0','glow');
      for(const side of [-1,1]) {
        round(x+.75,.54,z+side*(width/2+1.25),.45,.52,'#d3baa0');
        add('crown',x+.75,1.1,z+side*(width/2+1.25),.54,.75,.54,'#457357');
      }
    }
  }
  function shopfronts() {
    // The hotel lobby stays in the centre. Glazed café bays occupy the large
    // street-level wall on either side, under shallow fabric canopies.
    const span=d/2-4.5,bay=span/3,window=bay-.65;
    for(const side of [-1,1]) {
      for(let n=0;n<3;n++) {
        const z=side*(3.65+(n+.5)*bay);
        box(front+.052,1.69,z,.07,2.10,window,'#244b52','glazing');
        if(lod>=2)continue;
        box(front+.13,.59,z,.23,.15,window+.27,CREAM);
        box(front+.13,2.80,z,.23,.16,window+.27,CREAM);
        for(const edge of [-1,1])box(front+.14,1.69,z+edge*(window/2+.04),.22,2.25,.10,CREAM);
        box(front+.15,1.69,z,.16,2.1,.075,'#bcbda8','metal');
        if(lod===0) {
          box(front+.16,2.35,z,.17,.06,window,'#bcbda8','metal');
          box(front+.10,1.65,z+window*.25,.025,1.92,window*.39,'#385e62','glazing');
          box(front+.17,.83,z,.09,.11,window-.12,'#b9a181','metal');
        }
      }
      const z=side*(3.65+span/2);
      if(lod<2) {
        box(front+.76,3.10,z,1.65,.11,span+.05,'#ddc2a0','solid',0,0,-.14);
        box(front+1.56,2.99,z,.10,.29,span+.05,'#bd8877');
        box(front+.77,3.01,z,1.53,.03,span-.12,'#90745e','metal',0,0,-.14);
      }
    }
    if(lod===0)text('CAFE',front+1.62,2.99,3.65+span/2,2.15,'#f3e1be','metal');
  }
  function umbrella(z,color=style.accent) {
    const x=front+1.45;
    round(x,1.55,z,.035,2.6,'#bfb6a1');
    add('canopy',x,2.87,z,1.40,.52,1.40,color);
    round(x,.94,z,.62,.08,'#d1b28c');
    round(x,.57,z,.045,.72,'#485454');
    round(x,.25,z,.30,.055,'#485454');
    for(const side of [-1,1]) {
      box(x,.62,z+side*.88,.43,.065,.45,'#775c4f');
      box(x,.91,z+side*1.09,.44,.55,.055,'#775c4f');
      for(const sx of [-1,1])for(const sz of [-1,1])box(x+sx*.17,.43,z+side*.88+sz*.17,.035,.39,.035,'#394c4e','metal');
    }
  }
  function parapet() {
    const parapetHeight=.72;
    for(const side of [-1,1]) {
      box(side*(w/2-.18),roof+parapetHeight/2,0,.34,parapetHeight,d,style.wall,'stucco');
      box(0,roof+parapetHeight/2,side*(d/2-.18),w,parapetHeight,.34,style.wall,'stucco');
    }
    horizontalBand(roof+.74,.12,.25,CREAM);
    // Recessed roof membrane and mechanical equipment, rather than a solid cap.
    box(0,roof+.025,0,w-.7,.04,d-.7,'#8c8980');
    if(lod===0)for(const z of [-d*.23,d*.20]) {
      box(-w*.15,roof+.55,z,2.0,1.05,2.8,'#8d9898','metal');
      for(let n=-3;n<=3;n++)box(-w*.15,roof+1.09,z+n*.33,1.76,.05,.09,'#46585b','metal');
      round(-w*.15,roof+1.14,z,.61,.055,'#384c51');
    }
  }

  // Low landmarks retain their actual shaped silhouette at all detail levels.
  if(variant==='coral'||variant==='dominion')roundedMass(0,base+h/2,0,w,h,d,variant==='coral'?2.7:1.9,style.wall);
  else box(0,base+h/2,0,w,h,d,style.wall,lod>=2?'facade':'stucco');
  box(0,.43,0,w+.20,.42,d+.20,style.dark);
  const bays=Math.max(3,Math.floor((d-5)/4.9));
  const windowWidth=Math.min(2.7,(d-7)/bays*.72);
  for(let floor=1;floor<floors;floor++) {
    const y=3.6+(floor-.5)*floorH;
    if(lod===2 && floor%2===0)continue;
    for(let col=0;col<bays;col++) {
      const z=(col-(bays-1)/2)*(d-6)/bays;
      frontWindow(z,y,windowWidth,Math.min(2.45,floorH*.65));
    }
  }
  sideWindows(-1);sideWindows(1);
  entrance(0,variant==='dominion'?5.8:4.6);

  if(variant==='colony') {
    shopfronts();
    // Turquoise ribbon windows, alternating white/turquoise ledges and the tall
    // corner blade read like the iconic ocean-front low-rise even at a distance.
    for(let floor=1;floor<=floors;floor++) {
      const y=floor===floors?roof+.12:3.60+(floor-1)*floorH;
      horizontalBand(y,.20,.62,CREAM);
      box(front+.36,y-.10,0,.06,.055,d+.55,'#9dfff0','glow');
      box(0,y-.10,-d/2-.35,w+.56,.055,.06,'#9dfff0','glow');
    }
    blade('COLONY',-d*.34,4.5,roof+1.1,'#a0e8e5');
    if(lod<2) {
      box(front+.50,3.51,-d*.27,1.1,.42,5.3,'#429b9e');
      text('HOTEL',front+1.09,3.52,-d*.27,4.3,CREAM);
      for(let z=-d/2+2,n=0;z<d/2-2;z+=2,n++) {
        box(front+.18,roof+.70,z,.065,.075,2.03,'#b5fff1','glow',0,n%2?.16:-.16);
      }
    }
  } else if(variant==='dominion') {
    for(let floor=1;floor<=floors;floor++)horizontalBand(floor===floors?roof+.12:3.6+(floor-1)*floorH,.15,.54,CREAM);
    const portalZ=-d*.36;
    box(front+.28,h*.57,portalZ,.75,h*.83,3.2,'#d4b5a8','stucco');
    for(const offset of [-.82,0,.82])box(front+.70,h*.57,portalZ+offset,.15,h*.76,.13,'#a27c70');
    for(const y of [5.9,9.7]) {
      round(front+.78,y,portalZ,.69,.16,CREAM,Math.PI/2);
      round(front+.88,y,portalZ,.51,.055,'#1b3d45',Math.PI/2);
    }
    if(lod<2) {
      box(front+.65,3.75,0,1.4,.48,d*.77,'#d9b0a1');
      text('DOMINION HOTEL',front+1.37,3.76,0,d*.69,'#654943','metal');
      for(const z of [-d*.32,-d*.15,d*.15,d*.32])umbrella(z,'#d99e9c');
    }
  } else if(variant==='dixon') {
    for(const z of [-d*.41,d*.41]) {
      box(front+.23,h*.53,z,.55,h*.93,.76,CREAM);
      box(front+.55,h*.53,z,.13,h*.88,.15,style.accent,'glow');
    }
    for(let floor=2;floor<floors;floor++) {
      const y=3.6+(floor-1)*floorH;
      box(front+.65,y,0,1.7,.16,d*.78,CREAM);
      if(lod<2) {
        box(front+1.44,y+.72,0,.055,.055,d*.78,'#a7b1a6','metal');
        for(let z=-d*.36;z<d*.38;z+=lod===0?1.15:2.4)box(front+1.44,y+.39,z,.055,.72,.055,'#a7b1a6','metal');
      }
    }
    for(let tier=0;tier<3;tier++)box(-w*.12,roof+.45+tier*.65,0,w*.63-tier*1.0,.8,d*.63-tier*1.3,style.wall,'stucco');
    blade('DIXON',-d*.34,h*.39,roof+.5,'#efbd88');
    if(lod<2)text('HOTEL',front+.30,4.02,d*.16,6.5,'#8d654e','metal');
  } else if(variant==='coral') {
    for(let floor=1;floor<=floors;floor++) {
      const y=floor===floors?roof+.1:3.6+(floor-1)*floorH;
      roundedMass(0,y,0,w+.55,.22,d+.55,2.9,CREAM);
      box(front+.37,y-.12,0,.05,.06,d-5,style.accent,'glow');
    }
    for(const z of [-d*.37,d*.37])box(front+.33,h*.55,z,.58,h*.91,.55,style.accent,'stucco');
    if(lod<2) {
      text('CORAL PALMS',front+.28,4.02,0,d*.68,'#f2d8b1','glow');
      umbrella(-d*.31,'#d29f83');umbrella(d*.31,'#d29f83');
      for(const z of [-d*.25,d*.25]) {
        round(front+.45,roof-.8,z,.6,.14,CREAM,Math.PI/2);
        round(front+.54,roof-.8,z,.42,.05,style.dark,Math.PI/2);
      }
    }
  } else {
    for(let floor=1;floor<=floors;floor+=lod===2?3:1)horizontalBand(floor===floors?roof+.12:3.6+(floor-1)*floorH,.15,.35,CREAM);
    if(lod<2)text('OCEAN SUITES',front+.32,3.9,0,Math.min(d*.76,15),'#d8b28b','metal');
  }
  parapet();
  return records;
}
