const VERSION='1.0.0';

function applyViewport(){
  const root=document.documentElement,body=document.body,app=document.querySelector('#app');
  for(const el of [root,body,app]){
    if(!el)continue;
    el.style.width='100%';
    el.style.height='100dvh';
    el.style.minHeight='100dvh';
    el.style.margin='0';
    el.style.overflow='hidden';
    el.style.overscrollBehavior='none';
  }
  if(body){body.style.position='fixed';body.style.inset='0';body.style.touchAction='manipulation'}
}

async function requestFullscreen(){
  const target=document.documentElement;
  try{
    if(document.fullscreenElement)return true;
    if(target.requestFullscreen){
      await target.requestFullscreen({navigationUI:'hide'});
      return true;
    }
    if(target.webkitRequestFullscreen){
      target.webkitRequestFullscreen();
      return true;
    }
  }catch{}
  return false;
}

async function enterGameFullscreen(){
  applyViewport();
  const requested=await requestFullscreen();
  try{await screen.orientation?.lock?.('portrait')}catch{}
  // In regular Safari this also encourages the browser chrome to collapse after the user gesture.
  setTimeout(()=>{try{scrollTo(0,1)}catch{}},80);
  window.__fighterArenaFullscreen={
    version:VERSION,
    requested,
    standalone:window.matchMedia?.('(display-mode: standalone)')?.matches===true||navigator.standalone===true,
    fullscreen:!!document.fullscreenElement
  };
}

applyViewport();
addEventListener('resize',applyViewport,{passive:true});
addEventListener('orientationchange',applyViewport,{passive:true});
const start=document.querySelector('#startButton');
if(start)start.addEventListener('click',enterGameFullscreen,{capture:true});
