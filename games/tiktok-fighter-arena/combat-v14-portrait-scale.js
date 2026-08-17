import{startCombat as baseStartCombat}from'./combat-v14-layout-tune.js?v=1.0.1-unlimited-rounds';
import{S,cfg}from'./core.js?v=1.4.0';

const VERSION='1.1.0-half';
const PORTRAIT_SCALE=.42;
const PORTRAIT_RATIO=1.16;

function isPortrait(){return innerHeight>innerWidth*PORTRAIT_RATIO}

function fighterImages(){
  const set=new Set();
  for(const r of S.active||[]){
    const f=r?.fighterId?cfg(r.fighterId):null;
    const img=f?.atlas?S.images?.get?.(f.atlas):null;
    if(img)set.add(img);
  }
  return set;
}

function installPortraitScale(canvas){
  const ctx=canvas.getContext('2d');
  if(!ctx||ctx.__fighterArenaPortraitScale)return;
  const baseDrawImage=ctx.drawImage.bind(ctx);
  ctx.drawImage=(image,...args)=>{
    if(isPortrait()&&args.length===8){
      const fighters=fighterImages();
      if(fighters.has(image)){
        const [sx,sy,sw,sh,dx,dy,dw,dh]=args.map(Number);
        if([sx,sy,sw,sh,dx,dy,dw,dh].every(Number.isFinite)){
          const nw=dw*PORTRAIT_SCALE,nh=dh*PORTRAIT_SCALE;
          const nx=dx+(dw-nw)*.5;
          const ny=dy+(dh-nh);
          return baseDrawImage(image,sx,sy,sw,sh,nx,ny,nw,nh);
        }
      }
    }
    return baseDrawImage(image,...args);
  };
  ctx.__fighterArenaPortraitScale=true;
}

export function startCombat(canvas){
  installPortraitScale(canvas);
  const result=baseStartCombat(canvas);
  window.__fighterArenaPortraitScale={version:VERSION,scale:PORTRAIT_SCALE,portraitOnly:true,feetAnchored:true};
  return result;
}
