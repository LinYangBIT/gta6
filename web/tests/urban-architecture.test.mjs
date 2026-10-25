import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {describeUrbanBuilding} from '../dist/urban-architecture.js';

const styles=['deco','glass','brick','residential','hotel'];
function building(style,seed=610,orientation=0){return{x:36,z:-70,width:17,depth:26,height:style==='glass'?84:24,floors:7,style,color:'#c6bda4',accent:'#91b7b2',roof:seed%2?'terrace':'stepped',detailSeed:seed,orientation,infill:true};}
const shapes={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,10),sign:new THREE.PlaneGeometry(1,1)};
function bounds(r){
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(r.x,r.y,r.z),new THREE.Quaternion().setFromEuler(new THREE.Euler(r.rx,r.ry,r.rz)),new THREE.Vector3(r.sx,r.sy,r.sz));
  return new THREE.Box3().setFromBufferAttribute((shapes[r.type]||shapes.box).attributes.position).applyMatrix4(matrix);
}

test('dense buildings retain distinct styles while bounding every level of detail',()=>{
  const fingerprints=new Set();
  for(const style of styles)for(const seed of [1,4,610,813,2147483647]){
    const b=building(style,seed),near=describeUrbanBuilding(b,0),mid=describeUrbanBuilding(b,1),far=describeUrbanBuilding(b,2);
    assert.ok(near.length>=45&&near.length<=65,`${style}/${seed} near ${near.length}`);
    assert.ok(mid.length<=18&&mid.length>=8,`${style}/${seed} mid ${mid.length}`);
    assert.ok(far.length<=7&&far.length>=3,`${style}/${seed} far ${far.length}`);
    assert.ok(near.length>mid.length&&mid.length>far.length);
    assert.ok(near.some(r=>r.type==='sign'));
    assert.ok(!mid.some(r=>r.type==='sign')&&!far.some(r=>r.type==='sign'));
    assert.equal(near[0].type,style==='glass'?'glass':'facade');
    assert.deepEqual(describeUrbanBuilding(b,0),near);
    for(const r of [...near,...mid,...far]){
      for(const field of ['x','y','z','sx','sy','sz','rx','ry','rz','seed'])assert.ok(Number.isFinite(r[field]),`${style} ${field}`);
      assert.ok(r.sx>0&&r.sy>0&&r.sz>0);
    }
    if(seed===610)fingerprints.add(JSON.stringify(near.map(r=>[r.type,r.sx,r.sy,r.sz,r.rx,r.rz])));
  }
  assert.equal(fingerprints.size,styles.length);
});

test('all orientations preserve collision footprints and keep detail within reserved sidewalk margin',()=>{
  for(const style of styles)for(const orientation of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const roof of ['flat','pitched','stepped']){
    const b={...building(style,610,orientation),roof},records=describeUrbanBuilding(b,0),body=bounds(records[0]);
    assert.ok(Math.abs(body.min.x-(b.x-b.width/2))<1e-6);
    assert.ok(Math.abs(body.max.x-(b.x+b.width/2))<1e-6);
    assert.ok(Math.abs(body.min.z-(b.z-b.depth/2))<1e-6);
    assert.ok(Math.abs(body.max.z-(b.z+b.depth/2))<1e-6);
    for(const r of records){
      const box=bounds(r);
      assert.ok(box.min.x>=b.x-b.width/2-.9&&box.max.x<=b.x+b.width/2+.9,`${style} x overhang ${JSON.stringify(r)}`);
      assert.ok(box.min.z>=b.z-b.depth/2-.9&&box.max.z<=b.z+b.depth/2+.9,`${style} z overhang ${JSON.stringify(r)}`);
      assert.ok(box.min.y>=.20,`${style} penetrates ground`);
    }
  }
});

test('street-front signage and retail glazing face the selected street at all cardinal rotations',()=>{
  for(const orientation of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const b=building('brick',23,orientation),records=describeUrbanBuilding(b,0),sign=records.find(r=>r.type==='sign');
    const direction=new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(sign.rx,sign.ry,sign.rz));
    const outward=new THREE.Vector3(sign.x-b.x,0,sign.z-b.z).normalize();
    assert.ok(direction.dot(outward)>.999);
    assert.ok(records.some(r=>r.type==='glazing'&&Math.hypot(r.x-b.x,r.z-b.z)>Math.min(b.width,b.depth)/2));
  }
});

test('short residential buildings keep balconies distinct and detailed windows below the roof',()=>{
  for(const h of [6.3,9.45,12.6,31.5]){
    const b={...building('residential',4),height:h,roof:'flat'},records=describeUrbanBuilding(b,0);
    const balconySlabs=records.filter(r=>Math.abs(r.sx-b.width*.68)<1e-7&&r.sy===.13&&r.sz===.70);
    assert.equal(new Set(balconySlabs.map(r=>r.y)).size,balconySlabs.length,'low storeys must not produce coincident balcony decks');
    const upperGlazing=records.filter(r=>r.type==='glazing'&&r.y>4);
    assert.equal(upperGlazing.length,2,'bounded close-up window detail independent of floor count');
    for(const window of upperGlazing)assert.ok(window.y+window.sy/2<.22+h);
    assert.ok(records.length<=65);
  }
});
