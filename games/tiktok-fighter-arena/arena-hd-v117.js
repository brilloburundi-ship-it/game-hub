import{renderArenaHD as baseRender,preloadArenaHD as basePreload}from'./arena-hd-v116.js?v=1.16.0';

const VERSION='1.17.2';

// Global foreground-only lift. Fighters keep the exact same groundY; only the
// imported arena artwork is raised so the walkable surface meets their feet.
function arenaLift(w,h){
  const portrait=w<600;
  return Math.min(portrait?52:46,h*(portrait?.054:.062));
}

function liftedContext(c,lift){
  return new Proxy(c,{
    get(target,prop){
      if(prop==='drawImage'){
        return(...args)=>{
          // All imported arena foregrounds use the 9-argument drawImage form.
          // Procedural skies/vignettes are untouched, so lifting the platform
          // cannot move the background or the fighters.
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

export function renderArenaHD(c,id,w,h,dpr=1){
  const lift=arenaLift(w,h);
  return baseRender(liftedContext(c,lift),id,w,h,dpr);
}

export function preloadArenaHD(){return basePreload()}

window.__fighterArenaArenaFloorAlignment={
  version:VERSION,
  foregroundOnly:true,
  fightersUntouched:true,
  portraitMaxLift:52,
  landscapeMaxLift:46
};
