import{renderArenaHD as baseRender,preloadArenaHD as basePreload}from'./arena-hd-v116.js?v=1.16.0';

const VERSION='1.19.0';
const SKY_FPS=15;
const SKY_FRAME_MS=1000/SKY_FPS;

// Slightly stronger foreground lift: only the imported arena art moves upward.
// Fighter physics/groundY remain untouched so feet stay stable and non-floating.
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

function paintArena(state){
  if(!state?.c||!state.w||!state.h)return;
  const lift=arenaLift(state.w,state.h);
  baseRender(liftedContext(state.c,lift),state.id,state.w,state.h,state.dpr);
}

function liveSkyFrame(now){
  if(!liveArena){skyRaf=0;return}
  if(document.visibilityState!=='hidden'&&now-lastSkyPaint>=SKY_FRAME_MS){
    lastSkyPaint=now;
    paintArena(liveArena);
  }
  skyRaf=requestAnimationFrame(liveSkyFrame);
}
function ensureLiveSky(){if(!skyRaf)skyRaf=requestAnimationFrame(liveSkyFrame)}

export function renderArenaHD(c,id,w,h,dpr=1){
  liveArena={c,id,w,h,dpr};
  paintArena(liveArena);
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
  layerOrder:'animated sky -> HD arena foreground -> fighters'
};