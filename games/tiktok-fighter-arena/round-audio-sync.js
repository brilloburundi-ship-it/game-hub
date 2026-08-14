// Focused Fighter Arena announcer audio sync.
// Scope: 3-2-1-FIGHT and K.O. only. Combat, queue, bridge and arena logic are untouched.
const VERSION='1.0.0';
const CHUNKS={
  countdown:[
    './assets/audio/round-321-fight.b64.0',
    './assets/audio/round-321-fight.b64.1',
    './assets/audio/round-321-fight.b64.2a',
    './assets/audio/round-321-fight.b64.2b',
    './assets/audio/round-321-fight.b64.2c',
    './assets/audio/round-321-fight.b64.3a',
    './assets/audio/round-321-fight.b64.3b',
    './assets/audio/round-321-fight.b64.3c',
    './assets/audio/round-321-fight.b64.4',
    './assets/audio/round-321-fight.b64.5',
    './assets/audio/round-321-fight.b64.6a',
    './assets/audio/round-321-fight.b64.6b.0',
    './assets/audio/round-321-fight.b64.6b.1',
    './assets/audio/round-321-fight.b64.6b.2',
    './assets/audio/round-321-fight.b64.6b.3',
    './assets/audio/round-321-fight.b64.6b.4'
  ],
  ko:[
    './assets/audio/round-ko.b64.0',
    './assets/audio/round-ko.b64.1',
    './assets/audio/round-ko.b64.2',
    './assets/audio/round-ko.b64.3.0',
    './assets/audio/round-ko.b64.3.1',
    './assets/audio/round-ko.b64.3.2'
  ]
};
const VOLUME={countdown:.78,ko:.9};
const START_OFFSET={countdown:.02,ko:.035};
let context=null,activeSource=null,activeName='',lastState='idle';
const decoded=new Map();

function getContext(){
  if(!context)context=new(window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
  return context;
}
async function fetchBytes(paths){
  const parts=await Promise.all(paths.map(async path=>{
    const response=await fetch(`${path}?v=${VERSION}`,{cache:'force-cache'});
    if(!response.ok)throw Error(`Announcer audio unavailable: ${path} (${response.status})`);
    return response.text();
  }));
  const raw=atob(parts.join('').replace(/\s/g,''));
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes.buffer;
}
const encoded={
  countdown:fetchBytes(CHUNKS.countdown),
  ko:fetchBytes(CHUNKS.ko)
};
async function getBuffer(name){
  if(decoded.has(name))return decoded.get(name);
  const ctx=getContext();
  const promise=encoded[name].then(data=>ctx.decodeAudioData(data.slice(0)));
  decoded.set(name,promise);
  return promise;
}
async function prime(){
  try{
    const ctx=getContext();
    if(ctx.state==='suspended')await ctx.resume();
    await Promise.all([getBuffer('countdown'),getBuffer('ko')]);
  }catch(error){
    console.warn('[Fighter Arena] announcer audio preload failed',error);
  }
}
function stop(){
  if(activeSource)try{activeSource.stop()}catch{}
  activeSource=null;
  activeName='';
}
async function play(name){
  try{
    const ctx=getContext();
    if(ctx.state==='suspended')await ctx.resume();
    const buffer=await getBuffer(name);
    if(lastState!==(name==='countdown'?'countdown':'ko'))return;
    stop();
    const source=ctx.createBufferSource();
    const gain=ctx.createGain();
    source.buffer=buffer;
    gain.gain.value=VOLUME[name];
    source.connect(gain).connect(ctx.destination);
    source.onended=()=>{
      if(activeSource===source){activeSource=null;activeName=''}
    };
    activeSource=source;
    activeName=name;
    source.start(0,Math.min(START_OFFSET[name],Math.max(0,buffer.duration-.02)));
  }catch(error){
    console.warn(`[Fighter Arena] ${name} announcer failed`,error);
  }
}
function readState(){
  const label=(document.querySelector('#roundLabel')?.textContent||'').trim().toUpperCase();
  const timer=(document.querySelector('#roundTimer')?.textContent||'').trim().toUpperCase();
  if(label==='READY'&&['3','2','1'].includes(timer))return'countdown';
  if(label.startsWith('FIGHT'))return'fight';
  if(label==='WINNER'&&timer==='KO')return'ko';
  return'idle';
}
function sync(){
  const next=readState();
  if(next===lastState)return;
  lastState=next;
  if(next==='countdown'){
    stop();
    void play('countdown');
  }else if(next==='ko'){
    stop();
    void play('ko');
  }
  // countdown -> fight intentionally keeps the same clip playing:
  // the spoken FIGHT is embedded at the exact visual transition.
}
function attach(){
  const label=document.querySelector('#roundLabel');
  const timer=document.querySelector('#roundTimer');
  if(!label||!timer){setTimeout(attach,120);return}
  const observer=new MutationObserver(sync);
  observer.observe(label,{childList:true,subtree:true,characterData:true});
  observer.observe(timer,{childList:true,subtree:true,characterData:true});
  sync();
}
const start=document.querySelector('#startButton');
start?.addEventListener('pointerdown',()=>{void prime()},{once:true,capture:true});
start?.addEventListener('click',()=>{void prime()},{once:true,capture:true});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)stop();
  else sync();
});
addEventListener('pagehide',()=>{
  stop();
  if(context&&context.state!=='closed')void context.close();
},{once:true});
attach();
