import{S,cfg}from'./core.js?v=1.4.0';
import swordSlice from'./assets/audio/combat/sword-slice-data.js?v=1.0.0';
import swordClash from'./assets/audio/combat/sword-clash-data.js?v=1.0.0';
import swordStab from'./assets/audio/combat/sword-stab-data.js?v=1.0.0';
import magicCastA from'./assets/audio/combat/magic-cast-a-data.js?v=1.0.0';
import magicCastB from'./assets/audio/combat/magic-cast-b-data.js?v=1.0.0';
import magicImpact from'./assets/audio/combat/magic-impact-data.js?v=1.0.0';

const VERSION='1.1.0';
const BANK={
  swordSwing:[swordSlice],
  swordImpact:[swordClash],
  stab:[swordStab],
  magicCast:[magicCastA,magicCastB],
  magicImpact:[magicImpact]
};
const MAGIC_IDS=new Set(['evil_wizard','evil_wizard_2','fire_wizard','lightning_mage','wanderer_magician']);
const RANGED_IDS=new Set(['huntress','huntress_2','samurai_archer']);
const BLADE_IDS=new Set(['hero_knight','hero_knight_prime','medieval_king','fantasy_warrior','samurai_ronin','medieval_warrior_2','medieval_warrior_3','samurai','samurai_commander']);
const MAGIC=/wizard|mage|magician/i;
const RANGED=/huntress|archer/i;
const BLADE=/knight|warrior|king|samurai|ronin|commander/i;
const tracked=new WeakMap(),previous=[null,null],lastPick=new Map(),buffers=new Map(),voices=[];
const MAX_VOICES=7,MASTER=.82;
const status={ready:false,plays:0,blocked:0,lastError:'',lastGroup:'',lastFighter:''};
let context=null,decodePromise=null;

function getContext(){
  if(!context){
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)throw Error('Web Audio API unavailable');
    context=new AudioContextClass({latencyHint:'interactive'});
    context.addEventListener?.('statechange',()=>{status.contextState=context.state});
  }
  return context;
}
function bytesFromDataUri(uri){
  if(typeof uri!=='string'||!uri.startsWith('data:audio/'))throw Error('Invalid embedded combat audio');
  const comma=uri.indexOf(',');
  if(comma<0)throw Error('Malformed embedded combat audio');
  const raw=atob(uri.slice(comma+1).replace(/\s/g,''));
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes.buffer;
}
async function decodeAll(){
  const ctx=getContext(),jobs=[];
  for(const[group,list]of Object.entries(BANK))for(let i=0;i<list.length;i++){
    const key=`${group}:${i}`;
    if(buffers.has(key))continue;
    jobs.push(ctx.decodeAudioData(bytesFromDataUri(list[i]).slice(0)).then(buffer=>buffers.set(key,buffer)));
  }
  await Promise.all(jobs);
}
async function prime(){
  try{
    const ctx=getContext();
    if(ctx.state==='suspended')await ctx.resume();
    if(!decodePromise)decodePromise=decodeAll().catch(error=>{decodePromise=null;throw error});
    await decodePromise;
    status.ready=ctx.state==='running'&&buffers.size>0;
    status.contextState=ctx.state;
    if(!status.ready)status.blocked++;
    return status.ready;
  }catch(error){
    status.ready=false;
    status.lastError=error?.message||String(error);
    console.warn('[Fighter Arena] combat audio prime failed',error);
    return false;
  }
}
function pick(group){
  const list=BANK[group]||[];
  if(!list.length)return null;
  let index=Math.floor(Math.random()*list.length),last=lastPick.get(group);
  if(list.length>1&&index===last)index=(index+1)%list.length;
  lastPick.set(group,index);
  return buffers.get(`${group}:${index}`)||null;
}
function pruneVoices(){
  for(let i=voices.length-1;i>=0;i--)if(voices[i].ended)voices.splice(i,1);
}
async function play(group,{volume=1,rate=1,pan=0,fighter=''}={}){
  if(!S.started||document.hidden)return false;
  if(!(await prime()))return false;
  try{
    pruneVoices();
    if(voices.length>=MAX_VOICES){
      const oldest=voices.shift();
      try{oldest.source.stop()}catch{}
    }
    const ctx=getContext(),buffer=pick(group);
    if(!buffer)throw Error(`Missing decoded bank: ${group}`);
    const source=ctx.createBufferSource(),gain=ctx.createGain();
    const voice={source,ended:false};
    source.buffer=buffer;
    source.playbackRate.value=Math.max(.84,Math.min(1.18,rate*(.97+Math.random()*.06)));
    gain.gain.value=Math.max(0,Math.min(1,MASTER*volume*(.95+Math.random()*.08)));
    source.connect(gain);
    if(typeof ctx.createStereoPanner==='function'){
      const panner=ctx.createStereoPanner();
      panner.pan.value=Math.max(-1,Math.min(1,pan));
      gain.connect(panner).connect(ctx.destination);
    }else gain.connect(ctx.destination);
    source.onended=()=>{voice.ended=true};
    voices.push(voice);
    source.start();
    status.plays++;
    status.lastGroup=group;
    status.lastFighter=fighter;
    status.lastError='';
    return true;
  }catch(error){
    status.lastError=error?.message||String(error);
    console.warn(`[Fighter Arena] combat audio ${group} failed`,error);
    return false;
  }
}
function kindOf(r){
  const id=String(r?.fighterId||''),f=cfg(id),text=`${id} ${f?.name||''}`;
  if(MAGIC_IDS.has(id)||MAGIC.test(text))return'magic';
  if(RANGED_IDS.has(id)||RANGED.test(text))return'ranged';
  if(BLADE_IDS.has(id)||BLADE.test(text))return'blade';
  return'other';
}
function attacking(state){return state==='dash'||state==='special'||/^attack\d+$/.test(state||'')}
function snapshot(r){return r?{hp:Number(r.hp)||0,shield:Number(r.shield)||0}:null}
function hitChanged(target,prev){return!!target&&!!prev&&(target.hp<prev.hp-.001||target.shield<prev.shield-.001)}
function shieldChanged(target,prev){return!!target&&!!prev&&target.shield<prev.shield-.001}
function panFor(r){return r?.side===0?-.28:.28}
function watchFighter(r,target,prevTarget){
  if(!r)return;
  let t=tracked.get(r);
  if(!t){t={state:'',hit:false,time:Infinity,serial:0,launchSerial:-1,impactSerial:-1};tracked.set(r,t)}
  const entered=attacking(r.state)&&(!attacking(t.state)||r.state!==t.state||r.time<t.time-.015);
  const kind=kindOf(r),strong=r.state==='special'||r.state==='dash'||r.state==='attack3'||r.state==='attack4'||r.comboStrike;
  if(entered){
    t.serial++;
    if(t.launchSerial!==t.serial){
      t.launchSerial=t.serial;
      const opts={fighter:r.fighterId,pan:panFor(r)};
      if(kind==='magic')void play('magicCast',{...opts,volume:strong?.98:.84,rate:strong?.94:1.02});
      else if(kind==='blade')void play('swordSwing',{...opts,volume:strong?.96:.78,rate:strong?.93:1.02});
      else if(kind==='ranged')void play('stab',{...opts,volume:strong?.82:.68,rate:1.08});
    }
  }
  if(r.hit&&!t.hit&&hitChanged(target,prevTarget)&&t.impactSerial!==t.serial){
    t.impactSerial=t.serial;
    const opts={fighter:r.fighterId,pan:panFor(r)};
    if(kind==='blade'){
      const shielded=shieldChanged(target,prevTarget),stab=/attack2|attack4/.test(r.state||'')&&!r.comboStrike;
      void play(stab?'stab':'swordImpact',{...opts,volume:shielded?1:strong?.94:.8,rate:shielded?.92:strong?.96:1.02});
    }else if(kind==='magic'){
      const travel=.2+Math.min(.3,Math.abs((target?.x||0)-(r?.x||0))/850);
      setTimeout(()=>{void play('magicImpact',{...opts,volume:strong?1:.9,rate:strong?.94:1})},Math.max(120,travel*1000));
    }
  }
  t.state=r.state;
  t.hit=!!r.hit;
  t.time=Number(r.time)||0;
}
function frame(){
  const fighters=S.active||[],prev=[previous[0],previous[1]];
  watchFighter(fighters[0],fighters[1],prev[1]);
  watchFighter(fighters[1],fighters[0],prev[0]);
  previous[0]=snapshot(fighters[0]);
  previous[1]=snapshot(fighters[1]);
  requestAnimationFrame(frame);
}
const gesture=()=>{void prime()};
const start=document.querySelector('#startButton');
start?.addEventListener('pointerdown',gesture,{capture:true});
start?.addEventListener('click',gesture,{capture:true});
addEventListener('pointerdown',gesture,{once:true,capture:true,passive:true});
addEventListener('keydown',gesture,{once:true,capture:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.started)void prime()});
addEventListener('pagehide',()=>{
  for(const voice of voices)try{voice.source.stop()}catch{}
  voices.length=0;
  if(context&&context.state!=='closed')void context.close();
},{once:true});
requestAnimationFrame(frame);
window.FighterArenaCombatAudio={
  version:VERSION,
  embedded:true,
  banks:Object.keys(BANK),
  maxVoices:MAX_VOICES,
  prime,
  test:(group='swordSwing')=>play(group,{volume:.85}),
  get status(){return{...status,contextState:context?.state||'not-created',decoded:buffers.size,voices:voices.length}}
};
