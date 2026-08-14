const V='1.4.0-ios-fix1';
const paths=['./assets/r20/medieval-warrior-3.0.b64','./assets/r20/medieval-warrior-3.1.b64','./assets/r20/medieval-warrior-3.2.b64','./assets/r20/medieval-warrior-3.3.b64'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function read(path){
  let last=null;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const r=await fetch(`${path}?v=${V}&attempt=${attempt}`,{cache:'no-store'});
      if(!r.ok)throw new Error(`${path} ${r.status}`);
      const text=(await r.text()).trim();
      if(!text)throw new Error(`${path} empty payload`);
      return text;
    }catch(error){
      last=error;
      if(attempt<3)await sleep(120*(attempt+1));
    }
  }
  throw last||new Error(`${path} unavailable`);
}
let b64='';
// Sequential reads avoid Safari dropping one request when several base64
// sprite chunks are decoded at the same time during startup.
for(const path of paths)b64+=await read(path);
if(b64.length!==9976)throw new Error(`medieval_warrior_3 payload length ${b64.length}/9976`);
if(!b64.startsWith('UklGR'))throw new Error('medieval_warrior_3 missing RIFF header');
const raw=atob(b64);
if(raw.slice(0,4)!=='RIFF'||raw.slice(8,12)!=='WEBP')throw new Error('medieval_warrior_3 invalid WebP header');
const n=(raw.charCodeAt(4)|(raw.charCodeAt(5)<<8)|(raw.charCodeAt(6)<<16)|(raw.charCodeAt(7)<<24))>>>0;
if(n+8!==raw.length)throw new Error(`medieval_warrior_3 truncated WebP ${raw.length}/${n+8}`);
export const MEDIEVAL_WARRIOR_3={"./assets/medieval_warrior_3.webp":`data:image/webp;base64,${b64}`};
