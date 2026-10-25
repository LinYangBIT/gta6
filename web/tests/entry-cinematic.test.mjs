import test from 'node:test';
import assert from 'node:assert/strict';
import {EntryCinematic} from '../dist/entry-cinematic.js';
import {collidersNear} from '../dist/world-layout.js';

function run(step){
  const cg=new EntryCinematic(),frames=[cg.start()];
  while(cg.playing){const frame=cg.update(step);if(frame)frames.push(frame);}
  return {cg,frames};
}

test('entry camera finishes consistently and its three paths stay outside city buildings',()=>{
  for(const step of [1/30,1/60]){
    const {cg,frames}=run(step);
    assert.ok(Math.abs(cg.elapsed-cg.duration)<1e-8);assert.deepEqual([...new Set(frames.map(f=>f.shot))],[0,1,2]);
    for(const frame of frames){
      assert.ok(frame.fade>=0&&frame.fade<=1);assert.ok(frame.progress>=0&&frame.progress<1);
      assert.ok([...frame.camera,...frame.target,frame.fov].every(Number.isFinite));
      const [x,y,z]=frame.camera;
      assert.ok(y>2,'camera remains above the pavement');
      assert.ok(!collidersNear(x,z,610).some(r=>x>r.minX&&x<r.maxX&&z>r.minZ&&z<r.maxZ),'camera never enters a building footprint');
    }
    for(let i=1;i<frames.length;i++)if(frames[i].shot===frames[i-1].shot){
      const distance=Math.hypot(...frames[i].camera.map((value,index)=>value-frames[i-1].camera[index]));
      assert.ok(distance/step<25,'within-shot camera motion has no teleport');
    }
  }
});

test('skip completes quickly without replaying or leaving an active sequence',()=>{
  const cg=new EntryCinematic();cg.start();cg.update(.1);cg.skip();
  const skipped=cg.elapsed;cg.skip();assert.equal(cg.elapsed,skipped);
  for(let i=0;i<4;i++)cg.update(.1);
  assert.equal(cg.playing,false);assert.equal(cg.update(.1),null);assert.equal(cg.frame(),null);
  cg.start();cg.cancel();assert.equal(cg.update(.1),null);
});

test('reduced motion and menu return use a short fade without moving camera',()=>{
  for(const options of [{reducedMotion:true},{quick:true}]){
    const cg=new EntryCinematic();let frame=cg.start(options);
    assert.equal(frame.camera,null);assert.equal(frame.target,null);
    while(cg.playing){frame=cg.update(.1);if(frame)assert.equal(frame.camera,null);}
    assert.ok(cg.elapsed<1);
  }
});

test('paused or invalid frame time cannot jump an entry forward',()=>{
  const cg=new EntryCinematic();cg.start();cg.update(.1);
  for(const dt of [0,-1,NaN,Infinity]){cg.update(dt);assert.equal(cg.elapsed,.1);}
  cg.update(500);assert.equal(cg.elapsed,.2,'a resumed browser frame is bounded');
});
