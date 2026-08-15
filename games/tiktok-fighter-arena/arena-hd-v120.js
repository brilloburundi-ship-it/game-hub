import{renderArenaHD as baseRender,preloadArenaHD as basePreload}from'./arena-hd-v116.js?v=1.16.0';

const VERSION='1.20.0';
const SKY_FPS=15;
const SKY_FRAME_MS=1000/SKY_FPS;
const SKY_STALL_MS=1400;

// Foreground-only lift. Fighter physics and groundY are intentionally untouched.
function arenaLift(w,h){
  const portrait=w<600;
  return Math.min(portrait?72:68,h*(portrait?.078:.088));
}

function liftedContext(c,lift){
  return new Proxy(c,{
    get(target,prop){
      if(prop==='drawImage'){
        return(...args)=>{
          if(args.length===9){
            const shifted=[...args];
            shifted[6]=Number(shifted[6]||0)-lift;
            return target.drawImage(...shifted);
          }
          return target.drawImage(...args);
        };
      }
      const value=Reflect.get(target,prop,target);
      return typeof value==='function'?value.bind(target):value;
    },
    set(target,prop,value){target[prop]=value;return true}
  });
}

let liveArena=null;
let skyRaf=0;
let lastSkyPaint=0;
let watchdogTimer=0;

function paintArena(state){
  if(!state?.c||!state.w||!state.h)return;
  const lift=arenaLift(state.w,state.h);
  baseRender(liftedContext(state.c,lift),state.id,state.w,state.h,state.dpr);
  lastSkyPaint=performance.now();
}

function liveSkyFrame(now){
  // Clear the handle before scheduling the next frame so Safari can never leave
  // a stale RAF id that prevents a restart after tab/PWA suspension.
  skyRaf=0;
  if(!liveArena)return;
  if(now-lastSkyPaint>=SKY_FRAME_MS)paintArena(liveArena);
  skyRaf=requestAnimationFrame(liveSkyFrame);
}

function ensureLiveSky(force=false){
  if(!liveArena)return;
  if(force&&skyRaf){
    try{cancelAnimationFrame(skyRaf)}catch{}
    skyRaf=0;
  }
  if(!skyRaf)skyRaf=requestAnimationFrame(liveSkyFrame);
}

function resumeLiveSky(){
  if(!liveArena)return;
  // Paint immediately so the first visible Safari frame is fresh, then rebuild RAF.
  paintArena(liveArena);
  ensureLiveSky(true);
}

function installSafariSafeResume(){
  if(watchdogTimer)return;
  const resume=()=>resumeLiveSky();
  window.addEventListener('pageshow',resume,{passive:true});
  window.addEventListener('focus',resume,{passive:true});
  window.addEventListener('orientationchange',resume,{passive:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='hidden')resumeLiveSky();
  },{passive:true});
  watchdogTimer=window.setInterval(()=>{
    if(!liveArena)return;
    // Safari may resume the game RAF while leaving this offscreen-canvas RAF stale.
    // If the sky has not repainted recently, force only this renderer to restart.
    if(performance.now()-lastSkyPaint>SKY_STALL_MS)resumeLiveSky();
  },900);
}

export function renderArenaHD(c,id,w,h,dpr=1){
  liveArena={c,id,w,h,dpr};
  paintArena(liveArena);
  installSafariSafeResume();
  ensureLiveSky();
}

export function preloadArenaHD(){return basePreload()}

window.__fighterArenaArenaFloorAlignment={
  version:VERSION,
  foregroundOnly:true,
  fightersUntouched:true,
  portraitMaxLift:72,
  landscapeMaxLift:68,
  animatedSky:true,
  animatedSkyAllArenas:true,
  skyFps:SKY_FPS,
  safariResumeGuard:true,
  skyWatchdogMs:SKY_STALL_MS,
  layerOrder:'animated sky -> HD arena foreground -> fighters'
};
