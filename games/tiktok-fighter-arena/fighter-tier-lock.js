import{S}from'./core.js?v=1.4.0';

const VERSION='1.0.1';

// Authoritative gameplay classification. Do not infer gift tiers from the
// original asset metadata: those tier values describe the source roster and
// are not the TikTok gift ladder.
const ROSTER={
  free:['hero_knight','medieval_king','huntress_2','fire_wizard','medieval_warrior_2'],
  follow:['samurai_ronin'],
  tier1:['martial_champion','hero_knight_prime','huntress','evil_wizard'],
  tier2:['fantasy_warrior','street_mon','samurai_commander','medieval_warrior_3','evil_wizard_2'],
  tier3:['martial_hero','samurai','samurai_archer','wanderer_magician','lightning_mage']
};
const STARTERS=['hero_knight','medieval_king','huntress_2','fire_wizard'];
const CLASS_LEVEL={free:0,follow:0,tier1:1,tier2:2,tier3:3};
const byId=new Map();
for(const[className,ids]of Object.entries(ROSTER))for(const id of ids){
  if(byId.has(id))throw Error(`[Fighter Arena Tier Lock] duplicate fighter ${id}`);
  byId.set(id,{className,level:CLASS_LEVEL[className]});
}

function applyManifestTierLock(){
  const fighters=S.manifest?.fighters;if(!fighters)return false;
  const missing=[];
  for(const[id,meta]of Object.entries(fighters)){
    const rule=byId.get(id);
    if(!rule){missing.push(id);continue}
    // Normalize only the in-memory gameplay tier. Assets/files stay untouched.
    meta.tier=rule.level;
  }
  if(missing.length)console.warn('[Fighter Arena Tier Lock] unclassified fighters',missing);
  return true;
}

function normalizeShowcaseViewer(v){
  if(!v||!String(v.id||'').startsWith('showcase-live:'))return;
  const rule=byId.get(v.fighterId);if(!rule)return;
  v.highestTier=rule.level;
  if(rule.className==='follow'){
    v.followed=true;v.rewardClass='follow';v.giftTierLevel=0;v.giftTierFighterId='';v.comboLimit=2;
  }else if(rule.level>0){
    v.rewardClass=rule.className;v.giftTierLevel=rule.level;v.giftTierFighterId=v.fighterId;
  }else{
    v.rewardClass='';v.giftTierLevel=0;v.giftTierFighterId='';v.comboLimit=0;
  }
}

function sync(){
  applyManifestTierLock();
  for(const v of S.viewers.values())normalizeShowcaseViewer(v);
  window.__fighterArenaTierRoster={
    version:VERSION,
    authoritative:true,
    starters:[...STARTERS],
    free:[...ROSTER.free],
    follow:ROSTER.follow[0],
    tier1:[...ROSTER.tier1],
    tier2:[...ROSTER.tier2],
    tier3:[...ROSTER.tier3],
    classOf:id=>byId.get(id)?.className||null,
    levelOf:id=>byId.get(id)?.level??null
  };
}

sync();
const timer=setInterval(sync,80);
addEventListener('pagehide',()=>clearInterval(timer),{once:true});
