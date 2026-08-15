import{S,clamp}from'./core.js?v=1.4.0';

const VERSION='1.0.0';
const CHARGE_MAX=100;
const ROSE_HEAL_PER_UNIT=25;
const ATTACK_STATE=/^(attack\d+|special|dash)$/;

function viewerFromPayload(p={},out=null){
  if(out?.id&&S.viewers.has(out.id))return S.viewers.get(out.id);
  const raw=String(p.userId||p.id||'');
  if(raw&&S.viewers.has(raw))return S.viewers.get(raw);
  const name=String(p.username||p.uniqueId||p.name||'').trim();
  if(name)return[...S.viewers.values()].find(v=>String(v?.name||'')===name)||null;
  return null;
}
function runtimeFor(v){return v?S.active.find(r=>r?.viewer?.id===v.id)||null:null}
function likeCount(p={}){return clamp(Number(p.count||p.likeCount||1),1,1000)}
function roseCount(p={}){return clamp(Number(p.repeatCount||p.count||1),1,10000)}
function isRose(type,p={}){
  const t=String(type||'').toLowerCase();
  return t==='rose'||(t==='gift'&&String(p.giftName||p.name||'').toLowerCase().includes('rose'));
}
function chargeOf(v){return clamp(Number(v?.likeCriticalCharge||0),0,CHARGE_MAX)}
function setCharge(v,n){if(v)v.likeCriticalCharge=clamp(Number(n||0),0,CHARGE_MAX)}

function announceReady(v){
  const r=runtimeFor(v);
  if(r&&!r.dead){
    r.glow=Math.max(Number(r.glow||0),.9);
    S.fx?.float?.(r.x,S.h*.50,'CRITICAL READY','#6fd7ff');
    S.fx?.burst?.(r.x,S.h*.61,'#6fd7ff',16,.85);
    S.fx?.sheet?.('sparkGb',r.x,S.h*.57,2.0);
  }
  S.fx?.toast?.(`${v.name} · CRITICAL READY`,'#6fd7ff');
}
function addLikeCharge(v,n){
  if(!v)return;
  const before=chargeOf(v),after=clamp(before+n,0,CHARGE_MAX);
  setCharge(v,after);
  if(before<CHARGE_MAX&&after>=CHARGE_MAX)announceReady(v);
}
function applyRosePotion(v,n){
  const r=runtimeFor(v);
  if(!r||r.dead)return;
  const before=Math.max(0,Number(r.hp||0));
  const heal=Math.max(0,ROSE_HEAL_PER_UNIT*n);
  r.hp=Math.min(r.maxHp,before+heal);
  const gained=Math.max(0,Math.round(r.hp-before));
  if(gained<=0)return;
  r.glow=Math.max(Number(r.glow||0),.7);
  S.fx?.float?.(r.x,S.h*.47,`POTION +${gained} HP`,'#66f29b');
  S.fx?.burst?.(r.x,S.h*.61,'#66f29b',Math.min(22,8+n),.8);
  S.fx?.sheet?.('impactGb',r.x,S.h*.58,1.85);
}

function installEnergyLock(r){
  if(!r||r.__likeCriticalEnergyLock===VERSION)return;
  try{
    Object.defineProperty(r,'energy',{
      configurable:true,enumerable:true,
      get(){return chargeOf(r.viewer)},
      set(_v){}
    });
    r.__likeCriticalEnergyLock=VERSION;
  }catch(e){console.error('[Fighter Arena Like Critical Energy]',e)}
}
function armCritical(r){
  if(!r||r.dead||r.comboStrike||r.__likeCriticalActive||chargeOf(r.viewer)<CHARGE_MAX)return;
  if(!ATTACK_STATE.test(String(r.state||'')))return;
  r.__likeCriticalActive=true;
  r.__likeCriticalStartedAt=performance.now();
  r.doubleQueued=true;
  r.glow=Math.max(Number(r.glow||0),1.35);
  S.fx?.toast?.(`${r.viewer.name} · DOUBLE CRITICAL!`,'#ffd56b');
  S.fx?.float?.(r.x,S.h*.46,'DOUBLE CRITICAL!','#ffd56b');
  S.fx?.burst?.(r.x,S.h*.60,'#6fd7ff',22,1.1);
  S.fx?.sheet?.('sparkGb',r.x,S.h*.56,2.35);
  S.fx?.flash?.(.14);
  S.fx?.tone?.(880,.09,.025,'triangle');
}
function consumeCritical(r){
  if(!r?.__likeCriticalActive)return;
  setCharge(r.viewer,0);
  r.__likeCriticalActive=false;
  r.__likeCriticalStartedAt=0;
  r.doubleQueued=false;
  r.glow=Math.max(Number(r.glow||0),.35);
}
function syncCritical(){
  for(const r of S.active||[]){
    if(!r?.viewer)continue;
    installEnergyLock(r);
    if(r.dead){if(r.__likeCriticalActive)consumeCritical(r);continue}
    if(!r.__likeCriticalActive)armCritical(r);
    if(r.__likeCriticalActive){
      const opponent=S.active.find(x=>x&&x!==r&&x.viewer?.id!==r.viewer.id);
      if((r.comboStrike&&r.hit)||opponent?.dead)consumeCritical(r);
    }
  }
  requestAnimationFrame(syncCritical);
}

function installBridge(){
  const api=window.FighterArenaBridge,base=api?.emit;
  if(!api||typeof base!=='function'||!base.__giftTierPolicy)return false;
  if(base.__likeCriticalSystem===VERSION)return true;
  const wrapped=(type,p={})=>{
    const t=String(type||'').toLowerCase();
    const beforeViewer=viewerFromPayload(p);
    const beforeRuntime=runtimeFor(beforeViewer);
    const beforeHp=beforeRuntime&&!beforeRuntime.dead?Number(beforeRuntime.hp):null;
    const beforePotions=Number(beforeViewer?.potions||0);
    const out=base(type,p);
    const v=viewerFromPayload(p,out);
    if(t==='like'&&v){
      const r=runtimeFor(v);
      // LIKE is now offense-only: undo the legacy heal/potion side effect.
      if(r&&!r.dead&&Number.isFinite(beforeHp))r.hp=Math.min(r.maxHp,beforeHp);
      v.potions=Number.isFinite(beforePotions)?beforePotions:0;
      addLikeCharge(v,likeCount(p));
    }
    if(v&&isRose(t,p))applyRosePotion(v,roseCount(p));
    return out;
  };
  wrapped.__likeCriticalSystem=VERSION;
  wrapped.__giftTierPolicy=base.__giftTierPolicy;
  if(base.__giftInstantHeal)wrapped.__giftInstantHeal=base.__giftInstantHeal;
  api.emit=wrapped;
  window.dispatchFighterArenaEvent=wrapped;
  window.__fighterArenaLikeCritical={
    version:VERSION,chargeMax:CHARGE_MAX,likesPerCritical:CHARGE_MAX,
    doubleCritical:true,rosePotionHealPerUnit:ROSE_HEAL_PER_UNIT,
    blueBarSource:'likes-only'
  };
  return true;
}

const installTimer=setInterval(()=>{if(installBridge())clearInterval(installTimer)},50);
requestAnimationFrame(syncCritical);
setTimeout(installBridge,12000);
addEventListener('pagehide',()=>clearInterval(installTimer),{once:true});
