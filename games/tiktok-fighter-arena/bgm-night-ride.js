const VERSION='1.0.0';
const SOURCE='./assets/audio/music/night-ride.mp3?v=1.0.0';
const EXPECTED_BYTES=67807191;
const DEFAULT_VOLUME=.18;

const start=document.querySelector('#startButton');
const loadText=document.querySelector('#loadText');
const loadBar=document.querySelector('#loadProgress');
const audio=new Audio();
audio.loop=true;
audio.preload='auto';
audio.playsInline=true;
audio.volume=DEFAULT_VOLUME;

let objectUrl='';
let preloadPromise=null;
let ready=false;
let failed=false;
let progress=0;
let started=false;
let finalGameText='';
let destroyed=false;

function gameReady(){return window.__fighterArenaReady===true}
function setGate(){
  if(!start||destroyed)return;
  if(failed){
    start.disabled=false;
    start.textContent='RETRY MUSIC';
    return;
  }
  if(!ready){
    start.disabled=true;
    if(gameReady())start.textContent='LOADING MUSIC…';
    return;
  }
  if(gameReady()){
    start.disabled=false;
    start.textContent='ENTER ARENA';
  }
}
function showProgress(){
  if(!gameReady()||!loadText)return;
  if(!finalGameText)finalGameText=loadText.textContent||'Arena ready';
  loadText.textContent=`Preloading Night Ride… ${Math.round(progress*100)}%`;
  if(loadBar)loadBar.style.width=`${Math.max(0,Math.min(100,92+progress*8))}%`;
}
function markReady(){
  ready=true;
  failed=false;
  progress=1;
  if(loadBar&&gameReady())loadBar.style.width='100%';
  if(loadText&&gameReady())loadText.textContent=`${finalGameText||'Arena ready'} · Night Ride preloaded`;
  setGate();
}
function markFailed(error){
  failed=true;
  ready=false;
  window.__fighterArenaBgmError=error;
  if(loadText)loadText.textContent=`Music preload error: ${error?.message||error}`;
  setGate();
  console.error('[Fighter Arena] Night Ride preload failed',error);
}
function waitForPlayable(){
  return new Promise((resolve,reject)=>{
    if(audio.readyState>=3)return resolve();
    const timer=setTimeout(()=>finish(Error('Night Ride audio decode timeout')),20000);
    const onReady=()=>finish();
    const onError=()=>finish(audio.error||Error('Night Ride audio decode failed'));
    function finish(error){
      clearTimeout(timer);
      audio.removeEventListener('canplaythrough',onReady);
      audio.removeEventListener('canplay',onReady);
      audio.removeEventListener('error',onError);
      error?reject(error):resolve();
    }
    audio.addEventListener('canplaythrough',onReady,{once:true});
    audio.addEventListener('canplay',onReady,{once:true});
    audio.addEventListener('error',onError,{once:true});
  });
}
async function preload(){
  if(preloadPromise)return preloadPromise;
  preloadPromise=(async()=>{
    const response=await fetch(SOURCE,{cache:'force-cache'});
    if(!response.ok)throw Error(`Night Ride HTTP ${response.status}`);
    const total=Number(response.headers.get('content-length'))||EXPECTED_BYTES;
    let blob;
    if(response.body?.getReader){
      const reader=response.body.getReader(),chunks=[];
      let loaded=0;
      for(;;){
        const{done,value}=await reader.read();
        if(done)break;
        if(value?.byteLength){
          chunks.push(value);
          loaded+=value.byteLength;
          progress=Math.max(0,Math.min(1,loaded/total));
          showProgress();
        }
      }
      blob=new Blob(chunks,{type:'audio/mpeg'});
    }else{
      blob=await response.blob();
      progress=1;
      showProgress();
    }
    if(blob.size<50000000)throw Error(`Night Ride asset incomplete (${blob.size} bytes)`);
    objectUrl=URL.createObjectURL(blob);
    audio.src=objectUrl;
    audio.load();
    await waitForPlayable();
    markReady();
    return true;
  })().catch(error=>{markFailed(error);return false});
  return preloadPromise;
}
async function play(){
  if(!ready)return false;
  try{
    await audio.play();
    started=true;
    return true;
  }catch(error){
    window.__fighterArenaBgmPlayError=error;
    console.warn('[Fighter Arena] Night Ride playback blocked',error);
    return false;
  }
}
function stop(){audio.pause();audio.currentTime=0;started=false}
function setVolume(value){audio.volume=Math.max(0,Math.min(1,Number(value)||0));return audio.volume}

const gateObserver=start?new MutationObserver(()=>setGate()):null;
gateObserver?.observe(start,{attributes:true,attributeFilter:['disabled']});
const gateTimer=setInterval(()=>{
  if(destroyed)return;
  if(gameReady()&&!finalGameText&&loadText)finalGameText=loadText.textContent||'Arena ready';
  if(gameReady()&&!ready&&!failed)showProgress();
  if(gameReady()&&ready&&loadText&&!/Night Ride preloaded/.test(loadText.textContent||''))loadText.textContent=`${finalGameText||'Arena ready'} · Night Ride preloaded`;
  setGate();
},100);

start?.addEventListener('pointerdown',event=>{
  if(failed){event.preventDefault();event.stopImmediatePropagation();location.reload();return}
  if(!ready){event.preventDefault();event.stopImmediatePropagation();return}
  void play();
},{capture:true});
start?.addEventListener('click',event=>{
  if(failed){event.preventDefault();event.stopImmediatePropagation();location.reload();return}
  if(!ready){event.preventDefault();event.stopImmediatePropagation();return}
  void play();
},{capture:true});

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(started)audio.pause()}
  else if(started&&ready)void audio.play().catch(()=>{});
});
addEventListener('pagehide',()=>{
  destroyed=true;
  clearInterval(gateTimer);
  gateObserver?.disconnect();
  audio.pause();
  audio.removeAttribute('src');
  if(objectUrl)URL.revokeObjectURL(objectUrl);
},{once:true});

window.FighterArenaBGM={
  version:VERSION,
  title:'Night Ride',
  source:SOURCE,
  preload,
  play,
  stop,
  setVolume,
  get audio(){return audio},
  get status(){return{ready,failed,progress,started,volume:audio.volume,duration:audio.duration||0}}
};

setGate();
void preload();
