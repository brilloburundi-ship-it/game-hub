import{renderArenaHD as baseRender,preloadArenaHD as basePreload}from'./arena-hd-v116.js?v=1.16.0';

const VERSION='1.21.0';
const SKY_FPS=15;
const SKY_FRAME_MS=1000/SKY_FPS;
const SKY_STALL_MS=1400;
const GROUND_CACHE=new WeakMap();

// Vertical arena composition only. Existing arena assets, fighter physics and fighter scale stay untouched.
// In portrait we fit the HD foreground by WIDTH (never by height), preserve its aspect ratio,
// let the animated sky fill the extra vertical space and anchor the detected arena floor exactly
// to the same groundY used by combat (70% of viewport height).
const PORTRAIT_PROFILES={
  sky_dojo:{width:1.34,x:0,floor:.70},
  ice_crystal:{width:1.30,x:0,floor:.70},
  arcane_ruins:{width:1.32,x:0,floor:.70},
  desert_moon:{width:1.26,x:0,floor:.70},
  neon_city:{width:1.30,x:0,floor:.70},
  jungle_temple:{width:1.28,x:0,floor:.70},
  volcanic_ring:{width:1.30,x:0,floor:.70},
  celestial_citadel:{width:1.30,x:0,floor:.70}
};

function isPortrait(w,h){return h>w*1.16}
function landscapeLift(w,h){return Math.min(68,h*.088)}

function detectGround(im,sx,sy,sw,sh){
  if(!im||typeof im!=='object')return .72;
  if(GROUND_CACHE.has(im))return GROUND_CACHE.get(im);
  let ratio=.72;
  try{
    const aw=240,ah=Math.max(100,Math.round(aw*(sh/Math.max(1,sw))));
    const cv=document.createElement('canvas');cv.width=aw;cv.height=ah;
    const q=cv.getContext('2d',{willReadFrequently:true});
    q.clearRect(0,0,aw,ah);
    q.drawImage(im,sx,sy,sw,sh,0,0,aw,ah);
    const px=q.getImageData(0,0,aw,ah).data,ys=[];
    const yMin=Math.round(ah*.36),x0=Math.round(aw*.14),x1=Math.round(aw*.86);
    for(let x=x0;x<=x1;x+=2){
      let y=ah-1;
      while(y>=yMin&&px[(y*aw+x)*4+3]<26)y--;
      if(y<yMin)continue;
      let top=y,gap=0,solid=0;
      for(;y>=yMin;y--){
        if(px[(y*aw+x)*4+3]>=26){top=y;gap=0;solid++}
        else if(++gap>4&&solid>=5)break;
      }
      if(solid>=5)ys.push(top/ah);
    }
    if(ys.length){
      ys.sort((a,b)=>a-b);
      ratio=ys[Math.min(ys.length-1,Math.floor(ys.length*.72))];
    }
  }catch(e){console.warn('[Fighter Arena] portrait arena floor scan fallback',e)}
  ratio=Math.max(.54,Math.min(.86,ratio));
  GROUND_CACHE.set(im,ratio);
  return ratio;
}

function composedContext(c,state){
  return new Proxy(c,{
    get(target,prop){
      if(prop==='drawImage'){
        return(...args)=>{
          if(args.length===9){
            const [im,sx,sy,sw,sh,,baseDy]=args;
            if(isPortrait(state.w,state.h)){
              const p=PORTRAIT_PROFILES[state.id]||{width:1.30,x:0,floor:.70};
              const sourceW=Math.max(1,Number(sw)||1),sourceH=Math.max(1,Number(sh)||1);
              const dw=state.w*p.width;
              const dh=dw*(sourceH/sourceW);
              const ground=detectGround(im,Number(sx)||0,Number(sy)||0,sourceW,sourceH);
              const dx=(state.w-dw)*.5+state.w*(p.x||0);
              const dy=state.h*p.floor-ground*dh;
              target.imageSmoothingEnabled=true;
              target.imageSmoothingQuality='high';
              return target.drawImage(im,sx,sy,sw,sh,dx,dy,dw,dh);
            }
            const shifted=[...args];
            shifted[6]=Number(baseDy||0)-landscapeLift(state.w,state.h);
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
  baseRender(composedContext(state.c,state),state.id,state.w,state.h,state.dpr);
  lastSkyPaint=performance.now();
}

function liveSkyFrame(now){
  skyRaf=0;
  if(!liveArena)return;
  if(now-lastSkyPaint>=SKY_FRAME_MS)paintArena(liveArena);
  skyRaf=requestAnimationFrame(liveSkyFrame);
}

function ensureLiveSky(force=false){
  if(!liveArena)return;
  if(force&&skyRaf){try{cancelAnimationFrame(skyRaf)}catch{}skyRaf=0}
  if(!skyRaf)skyRaf=requestAnimationFrame(liveSkyFrame);
}

function resumeLiveSky(){
  if(!liveArena)return;
  paintArena(liveArena);
  ensureLiveSky(true);
}

function installSafariSafeResume(){
  if(watchdogTimer)return;
  const resume=()=>resumeLiveSky();
  window.addEventListener('pageshow',resume,{passive:true});
  window.addEventListener('focus',resume,{passive:true});
  window.addEventListener('orientationchange',resume,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden')resumeLiveSky()},{passive:true});
  watchdogTimer=window.setInterval(()=>{
    if(liveArena&&performance.now()-lastSkyPaint>SKY_STALL_MS)resumeLiveSky();
  },900);
}

export function renderArenaHD(c,id,w,h,dpr=1){
  liveArena={c,id,w,h,dpr};
  paintArena(liveArena);
  installSafariSafeResume();
  ensureLiveSky();
}

export function preloadArenaHD(){return basePreload()}

window.__fighterArenaArenaComposition={
  version:VERSION,
  portrait:'proportional-width-fit',
  portraitGroundY:.70,
  preserveAspectRatio:true,
  stretchX:false,
  stretchY:false,
  reuseExistingEightArenas:true,
  reimportRequired:false,
  fightersUntouched:true,
  landscapeBehavior:'preserved-v120-lift',
  animatedSky:true,
  skyFps:SKY_FPS,
  safariResumeGuard:true,
  profiles:PORTRAIT_PROFILES
};
