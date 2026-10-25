import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRenderQuality,nextAutomaticTier} from '../dist/render-quality.js';

test('high resolution scales to retina and 4K displays without exceeding pixel budgets',()=>{
  for(const mobile of [false,true])for(const [width,height] of [[800,390],[1920,1080],[3840,2160],[7680,4320]])for(const devicePixelRatio of [1,2,3]){
    const q=resolveRenderQuality({mode:'high',width,height,devicePixelRatio,mobile});
    assert.ok(width*height*q.pixelRatio**2<=q.pixelBudget+1);
    assert.ok(q.pixelRatio>0&&q.pixelRatio<=2);assert.ok(q.shadowSize>=2048);
  }
  assert.equal(resolveRenderQuality({mode:'high',width:3840,height:2160,devicePixelRatio:2}).pixelRatio,1);
  assert.equal(resolveRenderQuality({mode:'high',width:800,height:390,devicePixelRatio:3,mobile:true}).pixelRatio,2);
});
test('automatic quality descends only after sustained slow frames while explicit high stays high',()=>{
  assert.equal(nextAutomaticTier('high',1/60),'high');
  assert.equal(nextAutomaticTier('high',1/25),'balanced');
  assert.equal(nextAutomaticTier('balanced',1/30),'balanced');
  assert.equal(nextAutomaticTier('balanced',1/20),'performance');
  assert.equal(resolveRenderQuality({mode:'high',autoTier:'performance'}).tier,'high');
});
test('invalid device measurements recover to finite settings and valid balanced/performance caps',()=>{
  for(const mode of ['auto','balanced','performance','invalid']){
    const q=resolveRenderQuality({mode,width:NaN,height:0,devicePixelRatio:Infinity});
    assert.ok(Number.isFinite(q.pixelRatio)&&q.pixelRatio>0);assert.ok(q.shadowSize>0);
  }
});
