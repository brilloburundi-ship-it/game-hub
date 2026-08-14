const V='r20-ios-fix2';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function read(path){
  let last=null;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const sep=path.includes('?')?'&':'?';
      const r=await fetch(`${path}${sep}v=${V}&attempt=${attempt}`,{cache:'no-store'});
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

async function join(paths){
  let out='';
  // Sequential requests are deliberate: Mobile Safari is more reliable when
  // large base64 sprite payloads are not fetched in a burst.
  for(const path of paths)out+=await read(path);
  return out;
}

function validWebp(b64,expected,label){
  if(b64.length!==expected)throw new Error(`${label} payload length ${b64.length}/${expected}`);
  if(!b64.startsWith('UklGR'))throw new Error(`${label} missing RIFF header`);
  const raw=atob(b64);
  if(raw.slice(0,4)!=='RIFF'||raw.slice(8,12)!=='WEBP')throw new Error(`${label} invalid WebP header`);
  const n=(raw.charCodeAt(4)|(raw.charCodeAt(5)<<8)|(raw.charCodeAt(6)<<16)|(raw.charCodeAt(7)<<24))>>>0;
  if(n+8!==raw.length)throw new Error(`${label} truncated WebP ${raw.length}/${n+8}`);
  return`data:image/webp;base64,${b64}`;
}

const specs=[
  ['new_hero_knight_prime.webp',19196,['./assets/new_hero_knight_prime.b64']],
  ['new_fantasy_warrior.webp',22832,['./assets/r18/fantasy_warrior.0.b64','./assets/r18/fantasy_warrior.1.b64','./assets/r18/fantasy_warrior.2.b64','./assets/r18/fantasy_warrior.3.b64']],
  ['new_huntress_2.webp',8800,['./assets/r18/huntress_2.0.b64','./assets/r18/huntress_2.1.b64']],
  ['new_samurai_ronin.webp',23664,['./assets/r18/samurai_ronin.0.b64','./assets/r18/samurai_ronin.1.b64','./assets/r18/samurai_ronin.2.b64','./assets/r18/samurai_ronin.3.b64']],
  ['new_samurai_archer.webp',26688,['./assets/r18/samurai_archer.0.b64','./assets/r18/samurai_archer.1.b64','./assets/r18/samurai_archer.2.b64','./assets/r18/samurai_archer.3.b64']],
  // Rebuilt losslessly from the original CraftPix source supplied by the user.
  ['new_samurai_commander.webp',25404,['./assets/r20/samurai-commander.0.b64','./assets/r20/samurai-commander.1.b64','./assets/r20/samurai-commander.2.b64','./assets/r20/samurai-commander.3.b64']],
  ['new_fire_wizard.webp',22860,['./assets/r18_fire_wizard.b64']],
  ['new_lightning_mage.webp',19408,['./assets/r18/lightning.clean0.b64','./assets/r18/lightning.clean1.b64','./assets/r18/lightning.clean2.b64','./assets/r18/lightning_mage.tail.b64']],
  ['new_wanderer_magician.webp',24104,['./assets/r18/wanderer_magician.0.b64','./assets/r18/wanderer_magician.1a.b64','./assets/r18/wanderer_magician.1b.b64']]
];

const pack={};
const failures=[];
for(const[name,expected,paths]of specs){
  try{
    const b64=await join(paths);
    pack[`./assets/${name}`]=validWebp(b64,expected,name);
  }catch(error){
    const message=error?.message||String(error);
    failures.push({name,message});
    console.warn(`[Fighter Arena] ${name} deferred: ${message}`);
  }
}

// A single network/decode failure must never discard the other eight fighters.
// The strict 20/20 gate remains authoritative: a missing fighter still prevents
// arena entry rather than being silently substituted with another character.
export const R18_ROSTER_ASSETS=pack;
export const R18_ROSTER_FAILURES=failures;
