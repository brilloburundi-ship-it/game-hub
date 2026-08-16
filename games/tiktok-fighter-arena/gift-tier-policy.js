import{S,cfg,clamp,runtime}from'./core.js?v=1.4.0';

const VERSION='2.6.1';
const GIFT_TIER_1=['martial_champion','hero_knight_prime','huntress','evil_wizard'];
const GIFT_TIER_2=['fantasy_warrior','street_mon','samurai','medieval_warrior_3'];
const GIFT_TIER_3=['martial_hero','samurai_commander','samurai_archer','wanderer_magician','lightning_mage','fire_wizard'];
const STARTER_FIGHTERS=['hero_knight','medieval_king','huntress_2','evil_wizard_2'];
const FREE_FIGHTERS=[...STARTER_FIGHTERS,'medieval_warrior_2'];
const FOLLOW_FIGHTER='samurai_ronin';
const ROSE_HP=10;
const FREE_DEFENSE=0;
const PROFILES={
  follow:{maxHp:600,attack:1.00,defense:0,combo:2,targetFreeWins:4,color:'#75ef9b'},
  tier1:{maxHp:800,attack:1.00,defense:0,combo:0,targetFreeWins:5,color:'#ffd56b'},
  tier2:{maxHp:1800,attack:1.00,defense:0,combo:0,targetFreeWins:12,color:'#c489ff'},
  tier3:{maxHp:2800,attack:1.00,defense:0,combo:0,targetFreeWins:20,targetTier2Wins:10,color:'#ff6ab6'}
};
const POOLS={tier1:GIFT_TIER_1,tier2:GIFT_TIER_2,tier3:GIFT_TIER_3};
const JOIN_EVENTS=new Set(['join','enter','viewerenter','member']);
const LEAVE_EVENTS=new Set(['leave','exit','viewerleave','memberleave','viewerexit','memberexit']);

const giftValue=p=>Math.max(1,Number(p?.diamondCount||p?.value||p?.coins||1))*Math.max(1,Number(p?.repeatCount||1));
const roseCount=p=>Math.max(1,Number(p?.repeatCount||p?.count||1));
const giftLevel=d=>d>=500?3:d>=100?2:d>=10?1:0;
const classForLevel=level=>level===3?'tier3':level===2?'tier2':level===1?'tier1':'';
const classLevel=rewardClass=>/^tier[123]$/.test(String(rewardClass||''))?Number(String(rewardClass).slice(4)):0;
const isRoseGift=p=>String(p?.giftName||p?.name||'').toLowerCase().includes('rose');
function tierLevelForFighter(id){
  if(GIFT_TIER_3.includes(id))return 3;
  if(GIFT_TIER_2.includes(id))return 2;
  if(GIFT_TIER_1.includes(id))return 1;
  return 0;
}
function viewerFromPayload(p={},out=null){
  if(out?.id&&S.viewers.has(out.id))return S.viewers.get(out.id);
  const raw=String(p.userId||p.id||'');
  if(raw&&S.viewers.has(raw))return S.viewers.get(raw);
  const name=String(p.username||p.uniqueId||p.name||'Viewer').replace(/[<>&\"']/g,'').trim().slice(0,16)||'Viewer';
  const fallback=`viewer:${name.toLowerCase().replace(/\s+/g,'-')}`;
  return S.viewers.get(fallback)||[...S.viewers.values()].find(v=>v.name===name)||null;
}
function available(id){return !!cfg(id)&&(S.availableFighters.size===0||S.availableFighters.has(id))}
function choose(pool,v){
  let ids=pool.filter(available);
  if(!ids.length)return null;
  const opponent=S.active.find(r=>r&&r.viewer.id!==v.id)?.fighterId;
  const distinct=ids.filter(id=>id!==opponent&&id!==v.fighterId);
  if(distinct.length)ids=distinct;
  else{
    const noOpponent=ids.filter(id=>id!==opponent);
    if(noOpponent.length)ids=noOpponent;
  }
  return ids[Math.floor(Math.random()*ids.length)]||ids[0];
}
function normalizeTierState(v){
  if(!v)return 0;
  const inferred=tierLevelForFighter(v.fighterId),stored=Math.max(0,Number(v.giftTierLevel||0)),level=Math.max(inferred,stored);
  if(level>0){
    v.giftTierLevel=level;
    if(classLevel(v.rewardClass)<level)v.rewardClass=classForLevel(level);
    const profile=PROFILES[v.rewardClass];
    if(profile){v.comboLimit=profile.combo;v.targetFreeWins=profile.targetFreeWins}
  }
  return level;
}
function profileFor(v){return PROFILES[v?.rewardClass]||null}
function baseStats(v,f){
  const level=Math.max(1,Number(v?.level||1));
  return{
    attack:f.stats.attack*(1+(level-1)*.055),
    defense:0
  };
}
function applyFreeDefense(r,v){
  if(!r||!v||!FREE_FIGHTERS.includes(r.fighterId))return;
  r.defense=0;
}
function applyProfile(r,v,{preserveRatio=true}={}){
  const profile=profileFor(v),f=cfg(r?.fighterId);
  if(!r||!v||!profile||!f)return;
  const b=baseStats(v,f),roseHp=Math.max(0,Number(v.roseHpBonus||0));
  const desired={hp:profile.maxHp+roseHp,attack:b.attack,defense:0};
  const key=`${v.rewardClass}|${r.fighterId}|${v.level}|rose:${roseHp}|hp-only`;
  if(r.__giftProfileKey!==key){
    const ratio=preserveRatio&&r.maxHp>0?clamp(r.hp/r.maxHp,.05,1):1;
    r.maxHp=desired.hp;r.hp=desired.hp*ratio;r.__giftProfileKey=key;
  }else{
    r.maxHp=desired.hp;r.hp=Math.min(r.hp,r.maxHp);
  }
  r.attack=desired.attack;r.defense=0;r.comboLimit=profile.combo;
  v.comboLimit=profile.combo;v.targetFreeWins=profile.targetFreeWins;
}
function rebuildActive(v,{preserveRatio=true}={}){
  const idx=S.active.findIndex(r=>r?.viewer.id===v.id);if(idx<0)return;
  const old=S.active[idx],fresh=runtime(v,idx),ratio=preserveRatio&&old?.maxHp?clamp(old.hp/old.maxHp,.05,1):1;
  fresh.hp=fresh.maxHp*ratio;fresh.energy=old?.energy||0;fresh.shield=old?.shield||0;fresh.x=old?.x??fresh.x;fresh.inv=Math.max(.35,old?.inv||0);
  S.active[idx]=fresh;
}
function assign(v,id,rewardClass,{announce=true}={}){
  const f=cfg(id),profile=PROFILES[rewardClass];if(!v||!f||!profile||!available(id))return false;
  v.fighterId=id;v.rewardClass=rewardClass;v.comboLimit=profile.combo;v.targetFreeWins=profile.targetFreeWins;
  if(rewardClass.startsWith('tier')){
    const level=Number(rewardClass.slice(4))||0;
    v.giftTierLevel=Math.max(v.giftTierLevel||0,level);
    if(level>0)v.giftTierFighterId=id;
  }
  v.highestTier=Math.max(v.highestTier||0,f.tier||0);
  rebuildActive(v,{preserveRatio:true});
  const active=S.active.find(r=>r?.viewer.id===v.id);if(active)applyProfile(active,v,{preserveRatio:true});
  if(announce){
    const detail=rewardClass==='follow'?'FOLLOW · COMBO ×2':`GIFT ${rewardClass.toUpperCase()} · ${profile.maxHp} MAX HP`;
    S.fx?.toast?.(`${v.name} · ${detail} → ${f.name}`,profile.color);
  }
  return true;
}
function addRoseHp(v,count){
  if(!v)return;
  const roses=Math.max(1,Math.floor(Number(count||1))),bonus=roses*ROSE_HP;
  v.roseHpBonus=Math.max(0,Number(v.roseHpBonus||0))+bonus;
  const r=S.active.find(x=>x?.viewer.id===v.id);
  if(r&&!r.dead){
    r.maxHp+=bonus;
    r.glow=1;
    S.fx?.float?.(r.x,S.h*.53,`+${bonus} MAX HP`,'#ff78c2');
    S.fx?.burst?.(r.x,S.h*.62,'#ff78c2',Math.min(30,8+Math.ceil(Math.sqrt(roses))),1.05);
  }
  S.fx?.toast?.(`${v.name} · ${roses} ROSE${roses===1?'':'S'} · +${bonus} MAX HP`,'#ff78c2');
}
function resetGiftSession(v){
  if(!v)return;
  v.giftSessionValue=0;v.giftTierLevel=0;v.giftTierFighterId='';v.roseHpBonus=0;v.__giftTierSessionEnded=false;
  v.rewardClass=v.followed?'follow':'';v.comboLimit=v.followed?PROFILES.follow.combo:0;v.targetFreeWins=v.followed?PROFILES.follow.targetFreeWins:0;v.highestTier=0;
  const baseId=v.followed&&available(FOLLOW_FIGHTER)?FOLLOW_FIGHTER:choose(STARTER_FIGHTERS,v);
  if(baseId)v.fighterId=baseId;
  rebuildActive(v,{preserveRatio:false});
  const active=S.active.find(r=>r?.viewer.id===v.id);if(active){if(v.rewardClass)applyProfile(active,v,{preserveRatio:false});else applyFreeDefense(active,v)}
}
function restoreLockedTier(v,beforeId,beforeClass,beforeLevel){
  if(!v||beforeLevel<=0)return;
  const lockedId=beforeId||v.giftTierFighterId;
  const rewardClass=beforeClass||classForLevel(beforeLevel);
  v.giftTierLevel=beforeLevel;v.rewardClass=rewardClass;
  if(lockedId&&available(lockedId))assign(v,lockedId,rewardClass,{announce:false});
  else normalizeTierState(v);
}
function minorGiftPower(v){
  const r=S.active.find(x=>x?.viewer.id===v.id);if(!r||r.dead)return;
  r.shield+=20;r.energy=Math.min(100,r.energy+40);r.glow=Math.max(r.glow||0,.8);
}
function publish(){
  const current=window.__fighterArenaSelectionPolicy||{};
  window.__fighterArenaSelectionPolicy={...current,starters:[...STARTER_FIGHTERS],free:[...FREE_FIGHTERS],giftRare:[...GIFT_TIER_1],giftEpic:[...GIFT_TIER_2],giftMythic:[...GIFT_TIER_3],giftTier1:[...GIFT_TIER_1],giftTier2:[...GIFT_TIER_2],giftTier3:[...GIFT_TIER_3]};
  window.__fighterArenaGiftPolicy={version:VERSION,authoritative:true,free:[...FREE_FIGHTERS],starters:[...STARTER_FIGHTERS],tier1:[...GIFT_TIER_1],tier2:[...GIFT_TIER_2],tier3:[...GIFT_TIER_3],follow:FOLLOW_FIGHTER,ranges:{tier1:[10,99],tier2:[100,499],tier3:[500,null]},profiles:PROFILES,freeDefense:FREE_DEFENSE,noDowngrade:true,cumulativeGiftValue:true,allGiftNames:true,sessionResetOnLeave:true,sameTierLocked:true,roseMaxHpPerUnit:ROSE_HP,roseHpResetsOnRejoin:true,tierHpIsAbsolute:true,hpOnlyTierPower:true,tierAttackBonus:false,tierDefenseBonus:false,tierComboBonus:false};
}
function install(){
  const api=window.FighterArenaBridge;
  if(!api?.emit)return false;
  if(api.emit.__giftTierPolicy===VERSION){publish();return true}
  const base=api.emit.bind(api);
  const wrapped=(type,p={})=>{
    const t=String(type||'').toLowerCase(),before=viewerFromPayload(p),beforeId=before?.fighterId||'';
    if(LEAVE_EVENTS.has(t)){
      if(before)before.__giftTierSessionEnded=true;
      publish();return before||null;
    }
    const rejoining=JOIN_EVENTS.has(t)&&before?.__giftTierSessionEnded===true;
    if(JOIN_EVENTS.has(t)){
      const out=base(type,p),v=viewerFromPayload(p,out);
      if(v&&rejoining)resetGiftSession(v);
      publish();return out;
    }
    if(t==='follow'){
      const v=before||viewerFromPayload(p,base('join',p));if(!v)return null;
      if(v.followed){publish();return v}
      v.followed=true;
      const lockedLevel=normalizeTierState(v);
      if(lockedLevel===0&&available(FOLLOW_FIGHTER))assign(v,FOLLOW_FIGHTER,'follow');
      else if(lockedLevel>0)restoreLockedTier(v,beforeId,v.rewardClass,lockedLevel);
      publish();return v;
    }
    const directRose=t==='rose',giftEvent=t==='gift';
    if(giftEvent||directRose){
      const v=before||viewerFromPayload(p,base('join',p));if(!v)return null;
      const beforeLevel=normalizeTierState(v),lockedId=v.fighterId||beforeId,lockedClass=classForLevel(beforeLevel)||v.rewardClass;
      const roses=directRose?roseCount(p):(isRoseGift(p)?roseCount(p):0);
      const d=directRose?roseCount(p):giftValue(p);
      if(giftEvent)v.gifts=Math.max(0,Number(v.gifts||0))+d;
      if(roses>0)addRoseHp(v,roses);
      v.giftSessionValue=Math.max(0,Number(v.giftSessionValue||0))+d;
      const level=giftLevel(v.giftSessionValue);
      if(level>beforeLevel){
        const rewardClass=classForLevel(level),pool=POOLS[rewardClass],id=choose(pool,v);
        v.giftTierLevel=level;
        if(id)assign(v,id,rewardClass);
      }else if(beforeLevel>0){
        restoreLockedTier(v,lockedId,lockedClass,beforeLevel);
      }else if(level===0&&giftEvent&&!roses){
        minorGiftPower(v);
      }
      publish();return v;
    }
    const out=base(type,p),v=viewerFromPayload(p,out);
    if(v){normalizeTierState(v);const r=S.active.find(x=>x?.viewer.id===v.id);if(r){const profile=profileFor(v);if(profile)applyProfile(r,v);else applyFreeDefense(r,v)}}
    publish();return out;
  };
  wrapped.__giftTierPolicy=VERSION;api.emit=wrapped;window.dispatchFighterArenaEvent=wrapped;publish();return true;
}
function syncPowerAndCombos(){
  for(const r of S.active){
    if(!r||!r.viewer)continue;
    const v=r.viewer;normalizeTierState(v);
    const profile=profileFor(v);if(profile)applyProfile(r,v);else applyFreeDefense(r,v);
    const limit=Math.max(0,Number(v.comboLimit||r.comboLimit||0));
    if(!/^attack\d+$/.test(r.state)){
      if(r.state==='idle'||r.state==='run'||r.state==='hurt'||r.dead)r.__tierComboThirdArmed=false;
      continue;
    }
    if(limit===1&&!r.comboStrike)r.doubleQueued=false;
    if(limit>=2&&!r.comboStrike&&!r.__tierComboThirdArmed)r.doubleQueued=true;
    if(limit>=3&&r.comboStrike&&r.hit&&!r.__tierComboThirdArmed){r.__tierComboThirdArmed=true;r.comboStrike=false;r.doubleQueued=true}
  }
}

const installTimer=setInterval(()=>{if(install())clearInterval(installTimer)},50);
const syncTimer=setInterval(()=>{install();syncPowerAndCombos();publish()},40);
window.addEventListener('beforeunload',()=>{clearInterval(installTimer);clearInterval(syncTimer)},{once:true});
setTimeout(()=>{install();publish()},12000);