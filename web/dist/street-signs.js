import * as THREE from './vendor/three.module.js';

// Original shop names. This tiny atlas is generated locally, without image/font
// downloads, so street signage remains available offline and in preview exports.
export const STREET_SIGNS = ['PALM HOTEL', 'COAST CAFE', 'CORAL CLUB', 'SOL MARKET', 'VISTA HOTEL', 'MARINA BAR', 'SUNSET INN', 'OCEAN DINER'];
const FONT={
  A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','11011','10001'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111']
};

export function createStreetSignMaterial() {
  const cellW=256,cellH=64,width=cellW*4,height=cellH*2,pixels=new Uint8Array(width*height*4);
  const backgrounds=[[42,69,67],[224,205,172],[75,44,57],[60,85,71],[235,222,192],[44,80,88],[210,150,134],[57,77,90]];
  const inks=[[240,220,171],[56,69,68],[239,173,182],[238,219,170],[55,79,75],[244,223,179],[66,67,65],[238,212,171]];
  const rect=(x,y,w,h,c)=>{for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){const p=(py*width+px)*4;pixels.set([...c,255],p);}};
  STREET_SIGNS.forEach((label,index)=>{
    const left=(index%4)*cellW,bottom=Math.floor(index/4)*cellH,bg=backgrounds[index],ink=inks[index];
    rect(left,bottom,cellW,cellH,bg);rect(left+5,bottom+5,cellW-10,1,ink);rect(left+5,bottom+cellH-6,cellW-10,1,ink);
    const scale=3,textW=(label.length*6-1)*scale,start=left+Math.floor((cellW-textW)/2);
    [...label].forEach((letter,n)=>{(FONT[letter]||[]).forEach((row,y)=>{[...row].forEach((value,x)=>{if(value==='1')rect(start+(n*6+x)*scale,bottom+21+(6-y)*scale,scale,scale,ink);});});});
  });
  const texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:.58,metalness:.12});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=`attribute float signIndex;\n${shader.vertexShader}`;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>\nvMapUv=(vMapUv+vec2(mod(signIndex,4.0),floor(signIndex/4.0)))/vec2(4.0,2.0);`);
  };
  material.customProgramCacheKey=()=> 'coast-street-signs-1';
  return material;
}
