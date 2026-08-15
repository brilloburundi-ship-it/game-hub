import LIKE_CHARGE_TAP_AUDIO from'./assets/audio/like-charge-tap-data.js?v=1.0.0';
import CRITICAL_READY_AUDIO from'./assets/audio/critical-ready-no-mercy-data.js?v=1.0.0';
import{S,clamp}from'./core.js?v=1.4.0';

const VERSION='1.4.0';
const CHARGE_MAX=20;
const ROSE_HEAL_PER_UNIT=25;
const ATTACK_STATE=/^(attack\d+|special|dash)$/;
const AUDIO_GAIN={tap:.42,ready:.78};
let audioContext=null;
let ownsAudioContext=false;
const audioBuffers=new Map();

function getAudioContext(){
  const shared=window.__fighterArenaAudioBus?.context;
  if(shared&&shared.state!=='closed'){audioContext=shared;return shared}
  if(audioContext&&audioContext.state!=='closed')return audioContext;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)return null;
  audioContext=new Ctx({latencyHint:'interactive'});
  ownsAudioContext=true;
  window.__fighterArenaAudioBus={...(window.__fighterArenaAudioBus||{}),context:audioContext};
  return audioContext;
}
function dataUrlBytes(url){
  const comma=String(url||'').indexOf(',');
  if(comma<0)throw Error('Invalid Fighter Arena audio data URL');
  const raw=atob(String(url).slice(comma+1));
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes.buffer;
}
async function getAudioBuffer(key,url){
  if(audioBuffers.has(key))return audioBuffers.get(key);
  const ctx=getAudioContext();
  if(!ctx)throw Error('Web Audio unavailable');
  const promise=ctx.decodeAudioData(dataUrlBytes(url).slice(0));
  audioBuffers.set(key,promise);
  return promise;
}
function silentUnlock(ctx){
  try{
    const buffer=ctx.createBuffer(1,1,ctx.sampleRate||44100);
    const source=ctx.createBufferSource();
    const gain=ctx.createGain();
    gain.gain.value=0;
    source.buffer=buffer;
    source.connect(gain).connect(ctx.destination);
    source.start(0);
  }catch(_e){}
}
async function primeLikeAudio(){
  try{
    const ctx=getAudioContext();
    if(!ctx)return;
    silentUnlock(ctx);
    if(ctx.state==='suspended')await ctx.resume();
    await Promise.all([
      getAudioBuffer('tap',LIKE_CHARGE_TAP_AUDIO),
      getAudioBuffer('ready',CRITICAL_READY_AUDIO)
    ]);
    window.__fighterArenaLikeCriticalAudioReady=true;
  }catch(error){
    console.warn('[Fighter Arena Like Critical Audio] preload failed',error);
  }
}
async function playAudio(key,url,gainValue){
  try{
    const ctx=getAudioContext();
    if(!ctx)return;
    if(ctx.state==='suspended')await ctx.resume();
    const buffer=await getAudioBuffer(key,url);
    const source=ctx.createBufferSource();
    const gain=ctx.createGain();
    source.buffer=buffer;
    gain.gain.value=gainValue;
    source.connect(gain).connect(ctx.destination);
    source.start(0);
  }catch(error){
    console.warn(`[Fighter Arena Like Critical Audio] ${key} failed`,error);
  }
}
function playLikeChargeTap(){void playAudio('tap',LIKE_CHARGE_TAP_AUDIO,AUDIO_GAIN.tap)}
function playCriticalReadyVoice(){void playAudio('ready',CRITICAL_READY_AUDIO,AUDIO_GAIN.ready)}

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
function chargePercent(v){return CHARGE_MAX>0?clamp(chargeOf(v)/CHARGE_MAX*100,0,100):0}
function setCharge(v,n){if(v)v.likeCriticalCharge=clamp(Number(n||0),0,CHARGE_MAX)}

function announceReady(v){
  playCriticalReadyVoice();
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
  if(!v)return false;
  const before=chargeOf(v),after=clamp(before+n,0,CHARGE_MAX);
  const reachedReady=before<CHARGE_MAX&&after>=CHARGE_MAX;
  setCharge(v,after);
  if(reachedReady)announceReady(v);
  return reachedReady;
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
      get(){return chargePercent(r.viewer)},
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
      if(r&&!r.dead&&Number.isFinite(beforeHp))r.hp=Math.min(r.maxHp,beforeHp);
      v.potions=Number.isFinite(beforePotions)?beforePotions:0;
      const reachedReady=addLikeCharge(v,likeCount(p));
      if(!reachedReady)playLikeChargeTap();
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
    blueBarSource:'likes-only',likeChargeAudio:true,criticalReadyAudio:true,
    audioEngine:'WebAudio-unlocked-on-enter'
  };
  return true;
}

const startButton=document.querySelector('#startButton');
for(const eventName of ['pointerdown','touchend','click']){
  startButton?.addEventListener(eventName,()=>{void primeLikeAudio()},{once:true,capture:true});
}
document.addEventListener('pointerdown',()=>{void primeLikeAudio()},{once:true,capture:true});
const installTimer=setInterval(()=>{if(installBridge())clearInterval(installTimer)},50);
requestAnimationFrame(syncCritical);
setTimeout(installBridge,12000);
addEventListener('pagehide',()=>{
  clearInterval(installTimer);
  if(ownsAudioContext&&audioContext&&audioContext.state!=='closed')void audioContext.close();
},{once:true});