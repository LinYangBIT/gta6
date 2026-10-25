/** Resolution scales with the display while an explicit pixel budget bounds GPU cost. */
export const QUALITY_MODES=Object.freeze(['auto','high','balanced','performance']);
export function resolveRenderQuality({mode='auto',autoTier='high',width=1280,height=720,devicePixelRatio=1,mobile=false}={}){
  const selected=QUALITY_MODES.includes(mode)?mode:'auto';
  const tier=selected==='auto'?(['high','balanced','performance'].includes(autoTier)?autoTier:'high'):selected;
  const w=Number.isFinite(width)&&width>0?width:1280,h=Number.isFinite(height)&&height>0?height:720;
  const dpr=Number.isFinite(devicePixelRatio)&&devicePixelRatio>0?devicePixelRatio:1;
  const requested=tier==='high'?Math.min(2,Math.max(1.5,dpr)):tier==='balanced'?Math.min(1.5,dpr):1;
  const pixels=tier==='high'?(mobile?4_194_304:8_294_400):tier==='balanced'?(mobile?2_097_152:4_718_592):(mobile?1_048_576:2_073_600);
  const pixelRatio=Math.min(requested,Math.sqrt(pixels/(w*h)));
  const shadowSize=tier==='high'?(mobile?2048:4096):tier==='balanced'?(mobile?1024:2048):(mobile?512:1024);
  return {tier,pixelRatio,shadowSize,pixelBudget:pixels};
}
export function nextAutomaticTier(tier,averageFrameSeconds){
  if(!Number.isFinite(averageFrameSeconds))return tier;
  if(tier==='high'&&averageFrameSeconds>.035)return 'balanced';
  if(tier==='balanced'&&averageFrameSeconds>.045)return 'performance';
  return tier;
}
