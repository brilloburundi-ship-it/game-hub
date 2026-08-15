import DIE_AUDIO from './assets/audio/victory-taunt-die-data.js?v=1.0.0';
import WHEEZE_AUDIO from './assets/audio/victory-taunt-wheeze-data.js?v=1.0.0';
import DEMON_LAUGH_AUDIO from './assets/audio/victory-taunt-demon-laugh-data.js?v=1.0.0';
import STUPID_CAT_AUDIO from './assets/audio/victory-taunt-stupid-cat-data.js?v=1.0.0';
import STANDBY_AUDIO from './assets/audio/victory-taunt-standby-data.js?v=1.0.0';
import {S,clamp} from './core.js?v=1.4.0';

// Focused post-KO winner taunts. They never interrupt the KO announcer:
// round-audio-sync dispatches the trigger only after the KO clip ends naturally.
const VERSION='1.0.0';
const TAUNT_DELAY_MS=250;
const TAUNTS=[
  {id:'die',src:DIE_AUDIO,weight:35,gain:.56},
  {id:'demon-laugh',src:DEMON_LAUGH_AUDIO,weight:30,gain:.48},
  {id:'wheeze',src:WHEEZE_AUDIO,weight:18,gain:.45},
  {id:'stupid-cat',src:STUPID_CAT_AUDIO,weight:9,gain:.50},
  {id:'standby',src:STANDBY_AUDIO,weight:8,gain:.50}
];

let context=null;
let activeSource=null;
let pendingTimer=0;
let lastTauntId='';
let roundState='idle';
let latestKoSequence=0;
const decoded=new Map();

function getContext(){
  if(!context)context=new(window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
  return context;
}
async function getBuffer(taunt){
  if(decoded.has(taunt.id))return decoded.get(taunt.id);
  const promise=(async()=>{
    const response=await fetch(taunt.src,{cache:'force-cache'});
    if(!response.ok)throw Error(`Victory taunt unavailable: ${taunt.id} (${response.status})`);
    const data=await response.arrayBuffer();
    return getContext().decodeAudioData(data.slice(0));
  })();
  decoded.set(taunt.id,promise);
  return promise;
}
function stopTaunt(){
  if(pendingTimer){clearTimeout(pendingTimer);pendingTimer=0}
  if(activeSource){
    try{activeSource.stop()}catch{}
    activeSource=null;
  }
}
function winnerRuntime(){
  const alive=(S.active||[]).filter(r=>r&&!r.dead&&Number(r.hp)>0);
  return alive.length===1?alive[0]:null;
}
function pickTaunt(){
  let pool=TAUNTS.filter(item=>item.id!==lastTauntId);
  if(!pool.length)pool=TAUNTS;
  const total=pool.reduce((sum,item)=>sum+item.weight,0);
  let roll=Math.random()*total;
  for(const item of pool){
    roll-=item.weight;
    if(roll<=0)return item;
  }
  return pool[pool.length-1];
}
function winnerPan(winner){
  const width=Math.max(1,Number(S.w)||1);
  return clamp(((Number(winner?.x)||width/2)/width)*2-1,-.42,.42);
}
async function playTaunt(sequence){
  pendingTimer=0;
  if(sequence!==latestKoSequence||roundState==='countdown'||roundState==='fight')return;
  const winner=winnerRuntime();
  if(!winner)return;
  const taunt=pickTaunt();
  try{
    const ctx=getContext();
    if(ctx.state==='suspended')await ctx.resume();
    const buffer=await getBuffer(taunt);
    if(sequence!==latestKoSequence||roundState==='countdown'||roundState==='fight')return;
    if(winnerRuntime()!==winner)return;
    stopTaunt();
    const source=ctx.createBufferSource();
    const gain=ctx.createGain();
    source.buffer=buffer;
    gain.gain.value=taunt.gain;
    source.connect(gain);
    if(typeof ctx.createStereoPanner==='function'){
      const panner=ctx.createStereoPanner();
      panner.pan.value=winnerPan(winner);
      gain.connect(panner).connect(ctx.destination);
    }else gain.connect(ctx.destination);
    source.onended=()=>{if(activeSource===source)activeSource=null};
    activeSource=source;
    lastTauntId=taunt.id;
    source.start();
  }catch(error){
    console.warn('[Fighter Arena] victory taunt failed',error);
  }
}
function scheduleTaunt(event){
  const sequence=Number(event?.detail?.sequence||0);
  if(!sequence||sequence<latestKoSequence)return;
  latestKoSequence=sequence;
  stopTaunt();
  pendingTimer=setTimeout(()=>{void playTaunt(sequence)},TAUNT_DELAY_MS);
}
async function prime(){
  try{
    const ctx=getContext();
    if(ctx.state==='suspended')await ctx.resume();
    await Promise.all(TAUNTS.map(getBuffer));
  }catch(error){
    console.warn('[Fighter Arena] victory taunt preload failed',error);
  }
}

addEventListener('fighterarena:ko-audio-started',event=>{
  latestKoSequence=Math.max(latestKoSequence,Number(event?.detail?.sequence||0));
  stopTaunt();
});
addEventListener('fighterarena:ko-audio-ended',scheduleTaunt);
addEventListener('fighterarena:round-audio-state',event=>{
  roundState=String(event?.detail?.state||'idle');
  if(roundState==='countdown'||roundState==='fight')stopTaunt();
});
const start=document.querySelector('#startButton');
start?.addEventListener('pointerdown',()=>{void prime()},{once:true,capture:true});
start?.addEventListener('click',()=>{void prime()},{once:true,capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTaunt()});
addEventListener('pagehide',()=>{
  stopTaunt();
  if(context&&context.state!=='closed')void context.close();
},{once:true});
window.__fighterArenaVictoryTaunts={version:VERSION,delayMs:TAUNT_DELAY_MS,count:TAUNTS.length};
