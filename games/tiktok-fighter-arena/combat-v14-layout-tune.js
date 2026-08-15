import{startCombat as baseStartCombat}from'./combat-v14-closer.js?v=1.4.3-unlimited-rounds';
import{S,cfg}from'./core.js?v=1.4.0';

const VERSION='1.0.1';
const RANGE_SCALE=.76;

function suppressOverheadNames(canvas){
  const ctx=canvas.getContext('2d');
  if(!ctx||ctx.__fighterArenaNamesHidden)return;
  const baseFillText=ctx.fillText.bind(ctx);
  ctx.fillText=(text,...args)=>{
    const value=String(text??'');
    const isFighterName=(S.active||[]).some(r=>r?.viewer&&String(r.viewer.name)===value);
    if(isFighterName)return;
    return baseFillText(text,...args);
  };
  ctx.__fighterArenaNamesHidden=true;
}
function tuneActiveRanges(){
  for(const r of S.active||[]){
    if(!r?.fighterId)continue;
    if(r.__layoutTuneFighterId===r.fighterId)continue;
    const baseRange=Number(cfg(r.fighterId)?.stats?.range);
    if(Number.isFinite(baseRange)&&baseRange>0)r.range=Math.max(1,baseRange*RANGE_SCALE);
    r.__layoutTuneFighterId=r.fighterId;
  }
  requestAnimationFrame(tuneActiveRanges);
}

export function startCombat(canvas){
  suppressOverheadNames(canvas);
  const result=baseStartCombat(canvas);
  requestAnimationFrame(tuneActiveRanges);
  window.__fighterArenaLayoutTune={version:VERSION,overheadNames:false,rangeScale:RANGE_SCALE};
  return result;
}
