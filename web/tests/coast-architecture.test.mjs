import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { describeCoastBuilding } from '../dist/coast-architecture.js';

const hotels = [
  {x:-36,z:40,width:28,depth:36,height:16,floors:4,landmark:'colony'},
  {x:-58,z:-61,width:28,depth:40,height:22,floors:5,landmark:'dominion'},
  {x:-56,z:-103,width:28,depth:26,height:29,floors:7,landmark:'dixon'},
  {x:-36,z:94,width:28,depth:34,height:16,floors:4,landmark:'coral'},
];

test('reference hotels produce distinct detailed silhouettes and retain bounded distant detail', () => {
  const fingerprints=[];
  for(const b of hotels) {
    const near=describeCoastBuilding(b,0),middle=describeCoastBuilding(b,1),far=describeCoastBuilding(b,2);
    assert.ok(near.length>400&&near.length<1100,`${b.landmark} has bounded near detail`);
    assert.ok(middle.length<near.length);
    assert.ok(far.length<middle.length/3);
    assert.ok(near.some(r=>r.type==='glazing'));
    assert.ok(near.some(r=>r.type==='metal'));
    assert.ok(near.some(r=>r.type==='glow'));
    assert.ok(near.some(r=>r.type==='stucco'));
    fingerprints.push(JSON.stringify(near.map(r=>[r.type,r.sx,r.sy,r.sz,r.rx,r.rz])));
    for(const r of [...near,...middle,...far]) {
      for(const field of ['x','y','z','sx','sy','sz','ry','rx','rz','seed'])assert.ok(Number.isFinite(r[field]),`${b.landmark} ${field}`);
      assert.ok(r.sx>0&&r.sy>0&&r.sz>0);
    }
  }
  assert.equal(new Set(fingerprints).size,hotels.length);
});

test('frontage details stay within the reserved three-metre sidewalk strip', () => {
  // Include orientation and round/conical meshes, rather than measuring only
  // centers: balcony edges and café umbrellas must not extend into traffic.
  const geometry={
    box:new THREE.BoxGeometry(1,1,1),
    round:new THREE.CylinderGeometry(1,1,1,24),
    canopy:new THREE.ConeGeometry(1,1,16),
    crown:new THREE.IcosahedronGeometry(1,1),
  };
  const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),matrix=new THREE.Matrix4();
  for(const b of hotels) {
    let maximumX=-Infinity;
    for(const record of describeCoastBuilding(b,0)) {
      const g=geometry[record.type]||geometry.box;
      p.set(record.x,record.y,record.z);s.set(record.sx,record.sy,record.sz);
      q.setFromEuler(new THREE.Euler(record.rx,record.ry,record.rz));matrix.compose(p,q,s);
      const bounds=new THREE.Box3().setFromBufferAttribute(g.attributes.position).applyMatrix4(matrix);
      maximumX=Math.max(maximumX,bounds.max.x);
    }
    assert.ok(maximumX<=b.x+b.width/2+3.01,`${b.landmark} frontage ${maximumX}`);
  }
  for(const g of Object.values(geometry))g.dispose();
});

test('porthole windows face the boulevard and whole hotel placement rotates consistently', () => {
  const b=hotels[1],plain=describeCoastBuilding(b,0),angle=Math.PI/2;
  const rotated=describeCoastBuilding({...b,orientation:angle},0);
  assert.ok(plain.some(r=>r.type==='round'&&r.rz===Math.PI/2),'actual circular porthole meshes');
  assert.equal(rotated.length,plain.length);
  for(let i=0;i<plain.length;i++) {
    const a=plain[i],r=rotated[i];
    assert.ok(Math.abs(r.x-(b.x+a.z-b.z))<1e-7);
    assert.ok(Math.abs(r.z-(b.z-(a.x-b.x)))<1e-7);
    assert.equal(r.y,a.y);
    assert.ok(Math.abs(r.ry-a.ry-angle)<1e-7);
  }
});

test('hotel retrofit media faces the street and switches off detailed roof props at distance',()=>{
  for(const b of hotels){
    const near=describeCoastBuilding(b,0),mid=describeCoastBuilding(b,1),far=describeCoastBuilding(b,2);
    const signs=near.filter(r=>r.type==='sign');
    assert.equal(signs.length,1);assert.ok(signs[0].y>b.height,'media frame sits above the roof');
    const normal=new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(signs[0].rx,signs[0].ry,signs[0].rz));
    assert.ok(normal.x>.999,'new media panel faces the boulevard');
    assert.equal(mid.filter(r=>r.type==='sign').length,0);assert.equal(far.filter(r=>r.type==='sign').length,0);
    assert.ok(near.some(r=>r.type==='glow'&&r.y>b.height+3),'roof antenna has a small beacon');
    assert.ok(near.length<1100,'five landmarks retain bounded offline/mobile export size');
  }
});
