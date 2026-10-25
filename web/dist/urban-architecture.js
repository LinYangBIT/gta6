/** Dense street-front architecture. Window shaders supply the repeated detail;
 * a bounded number of real parts gives each block a useful street silhouette. */
const WHITE='#f0e6cf', DARK='#29494f';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export function describeUrbanBuilding(building,lod=0) {
  const b=building,records=[],detail=clamp(Math.floor(lod),0,2);
  // Layout width/depth always describe the world-axis collision rectangle. Only
  // the frontage rotates; a quarter turn must not exchange that footprint.
  const turn=((Math.round((b.orientation||0)/(Math.PI/2))%4)+4)%4;
  const angle=turn*Math.PI/2,co=Math.cos(angle),si=Math.sin(angle);
  const w=turn%2?b.depth:b.width,d=turn%2?b.width:b.depth,h=b.height;
  const base=.22,top=base+h,front=-d/2;
  const hash=(b.detailSeed??1)>>>0,seed=hash%65521/101;
  const style=b.style||'deco',glass=style==='glass',residential=style==='residential';
  const color=b.color||'#c9bba5';
  // A compact, stable palette gives adjacent shops their own identity. Keep the
  // wall color from the shared layout so near and distant buildings still match.
  const trims=glass?['#63b9c9','#e1bc76','#89c5cb']:['#de837e','#49b5b1','#a89ac9','#e1b45f','#74b9a0'];
  const accent=trims[(hash>>>4)%trims.length];
  function add(type,x,y,z,sx,sy,sz,tint,ry=0,rx=0,rz=0,partSeed=seed){
    records.push({type,x:b.x+co*x+si*z,y,z:b.z-si*x+co*z,sx,sy,sz,color:tint,ry:angle+ry,rx,rz,seed:partSeed});
  }
  const box=(x,y,z,sx,sy,sz,tint=WHITE,type='solid',ry=0,rx=0,rz=0)=>add(type,x,y,z,sx,sy,sz,tint,ry,rx,rz);
  const round=(x,y,z,r,height,tint)=>add('cylinder',x,y,z,r,height,r,tint);
  box(0,base+h/2,0,w,h,d,color,glass?'glass':'facade');
  box(0,.40,0,w+.22,.36,d+.22,glass?'#727e7b':'#8e887a');

  const pitched=b.roof==='pitched'||(residential&&hash%4===0&&h<24);
  if(pitched){
    const slope=.26,rise=w*.25*Math.tan(slope);
    for(const side of [-1,1])box(side*w*.25,top+.2+rise,0,w*.5/Math.cos(slope)+.35,.18,d+.50,
      ['#a87963','#7d8887','#a78e6b'][hash%3],'solid',0,0,-side*slope);
  }else{
    box(0,top+.14,0,w+.48,.28,d+.48,glass?'#99aaa7':WHITE);
    if(glass||b.roof==='stepped'||h>45)box(0,top+1.25,d*.12,w*.56,2.2,d*.54,glass?color:WHITE,glass?'glass':'facade');
  }
  if(detail===2)return records;

  // Recessed, glazed retail band and a shaded entrance on the actual street side.
  const shopWidth=w*.82;
  box(0,1.65,front-.028,shopWidth,2.55,.056,'#244750','glazing');
  box(0,.45,front-.10,shopWidth,.24,.16,DARK);
  box(0,3.11,front-.12,shopWidth+.20,.16,.25,WHITE);
  box(-w*.18,1.64,front-.10,.11,2.57,.20,WHITE,'metal');
  box(w*.18,1.64,front-.10,.11,2.57,.20,WHITE,'metal');
  box(0,3.48,front-.41,Math.min(w*.9,18),.15,.82,accent);
  // A small repeated cornice or setback reads clearly before window meshes do.
  if(style==='deco'||style==='hotel'||style==='brick'){
    for(const fraction of [.36,.70])box(0,base+h*fraction,0,w+.32,.13,d+.32,style==='brick'?'#bea58b':WHITE);
  }else if(glass){
    for(const side of [-1,1])box(side*(w/2-.35),base+h/2,front-.09,.18,h,.18,'#9bb7b9','metal');
  }
  if(detail===1)return records;

  const bays=clamp(Math.floor(shopWidth/3.6),2,5);
  for(let i=0;i<=bays;i++){
    const x=(i/bays-.5)*shopWidth;
    box(x,1.66,front-.14,.095,2.70,.18,WHITE,'metal');
  }
  box(-w*.18+.23,1.35,front-.23,.04,.48,.035,'#cebd8f','metal');
  // A real threshold and brass kickplate replace a flat ground-floor ribbon.
  box(-w*.18,.27,front-.36,1.65,.10,.64,'#cbbca3','paving');
  box(-w*.18,.65,front-.16,1.40,.30,.055,'#bb9c63','metal');
  // A hanging valance, alternating fabric panels and brackets make the canopy
  // readable in a close walking camera without adding a mesh for every fold.
  const awningWidth=Math.min(w*.9,18);
  box(0,3.35,front-.78,awningWidth,.27,.055,accent);
  for(const x of [-awningWidth*.32,0,awningWidth*.32])box(x,3.57,front-.41,awningWidth*.13,.035,.78,WHITE);
  for(const side of [-1,1])box(side*awningWidth*.40,3.26,front-.27,.065,.42,.48,DARK,'metal');
  // Two framed first-storey windows add real sill depth; the other window rows
  // continue to use the shared façade shader and do not grow with floor count.
  const frameY=Math.min(5.35,h-1.1),frameWidth=Math.min(2.2,w*.22),frameHeight=1.72;
  for(const side of [-1,1]){
    const x=side*w*.28;
    box(x,frameY,front-.04,frameWidth,frameHeight,.07,'#24596a','glazing');
    for(const edge of [-1,1])box(x+edge*(frameWidth/2+.045),frameY,front-.12,.09,frameHeight+.16,.20,WHITE,'metal');
    box(x,frameY+frameHeight/2+.06,front-.12,frameWidth+.18,.12,.20,WHITE);
    box(x,frameY-frameHeight/2-.08,front-.21,frameWidth+.34,.14,.40,WHITE);
    box(x,frameY,front-.13,.065,frameHeight,.15,WHITE,'metal');
  }
  box(0,3.86,front-.16,Math.min(w*.70,10),.65,.23,glass?DARK:accent);
  add('sign',0,3.86,front-.285,Math.min(w*.68,9.7),.59,1,'#ffffff',Math.PI,0,0,hash%8);
  // Shallow side entrance and protected service equipment distinguish the
  // building's inhabited ground floor without spilling into adjacent parcels.
  box(w/2+.03,1.45,d*.20,.06,2.45,1.36,'#3a4d4c','glazing');
  box(w/2+.10,2.72,d*.20,.20,.15,1.60,WHITE);

  if(glass){
    for(const x of [-w*.24,w*.24])box(x,base+h/2,front-.10,.11,h,.16,'#a7bcbb','metal');
    for(const fraction of [.32,.65])box(0,base+h*fraction,0,w+.20,.14,d+.20,'#91a7a7','metal');
    box(-w*.18,top+3.8,d*.15,.10,5.5,.10,DARK,'metal');
  }else if(residential||style==='hotel'){
    // Two real balconies are enough to give the street depth; upper storeys
    // remain detailed by the shared façade shader instead of per-window meshes.
    for(const fraction of h<10?[.65]:[.32,.65]){
      const y=base+Math.max(4.2,h*fraction),balconyWidth=w*.68;
      box(0,y,front-.35,balconyWidth,.13,.70,WHITE);
      box(0,y+.62,front-.67,balconyWidth,.07,.07,accent,'metal');
      for(const side of [-1,1])box(side*balconyWidth/2,y+.32,front-.36,.065,.68,.68,WHITE,'metal');
      for(const side of [-1,1])box(side*balconyWidth*.19,y+.33,front-.67,.04,.57,.055,WHITE,'metal');
    }
  }else{
    for(const side of [-1,1])box(side*(w/2-.27),base+h/2,front-.08,.24,h,.17,accent);
    box(0,top+.49,0,w*.72,.40,d*.80,WHITE);
    if(style==='brick'){
      // Traditional shop houses have a deep projecting cornice and a raised
      // parapet, distinct from the thinner, streamlined Deco floor bands.
      box(0,top+.33,front-.25,w+.38,.42,.72,'#a18570');
      box(0,top+.73,front+.12,w,.44,.24,color);
    }
  }
  if(!pitched){
    // Service penthouse, paired vents and a water tank create nonuniform roofs.
    box(-w*.21,top+.63,d*.18,w*.23,1.08,d*.24,'#91958d');
    for(const side of [-1,1])box(-w*.21+side*w*.055,top+1.22,d*.18,w*.075,.15,d*.16,'#566663','metal');
    for(const side of [-1,1])box(-w*.21+side*w*.055,top+1.32,d*.18,w*.055,.055,d*.12,'#bdc9bf','metal');
    if(hash%3===0){
      round(w*.24,top+.78,-d*.20,.60,1.25,'#a8b5aa');
      round(w*.24,top+1.43,-d*.20,.66,.10,'#c5cbbb');
    }
  }
  return records;
}
