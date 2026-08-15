import{S,cfg,clamp,runtime,tierColor}from'./core.js?v=1.4.0';

const VERSION='1.0.0';
const GIFT_TIER_1=['martial_champion','hero_knight_prime','huntress','evil_wizard'];

const giftValue=p=>Math.max(1,Number(p?.diamondCount||p?.value||p?.coins||1))*Math.max(1,Number(p?.repeatCount||1));
const giftLevel=d=>d>=500?3:d>=100?2:d>=10?1:0;
function viewerFromPayload(p={},out=null){
  if(out?.id&&S.viewers.has(out.id))return S.viewers.get(out.id);
  const raw=String(p.userId||p.id||'');
  if(raw&&S.viewers.has(raw))return S.viewers.get(raw);
  const name=String(p.username||p.uniqueId||p.name||'Viewer').replace(/[<>&\"']/g,'').trim().slice(0,16)||'Viewer';
  const fallback=`viewer:${name.toLowerCase().replace(/\s+/g,'-')}`;
  return S.viewers.get(fallback)||[...S.viewers.values()].find(v=>v.name===name)||null;
}
function available(id){return !!cfg(id)&&(S.availableFighters.size===0||S.availableFighters.has(id))}
function chooseTier1(v){
  let pool=GIFT_TIER_1.filter(available);
  if(!pool.length)return null;
  const opponent=S.active.find(r=>r&&r.viewer.id!==v.id)?.fighterId;
  const distinct=pool.filter(id=>id!==opponent&&id!==v.fighterId);
  if(distinct.length)pool=distinct;
  else{
    const noOpponent=pool.filter(id=>id!==opponent);
    if(noOpponent.length)pool=noOpponent;
  }
  return pool[Math.floor(Math.random()*pool.length)]||pool[0];
}
function assign(v,id,{announce=true}={}){
  const f=cfg(id);if(!v||!f||!available(id))return false;
  const idx=S.active.findIndex(r=>r?.viewer.id===v.id);
  v.fighterId=id;
  v.highestTier=Math.max(v.highestTier||0,f.tier||0);
  if(idx>=0){
    const old=S.active[idx],fresh=runtime(v,idx),ratio=old?.maxHp?clamp(old.hp/old.maxHp,.25,1):1;
    fresh.hp=fresh.maxHp*ratio;
    fresh.energy=old?.energy||0;
    fresh.shield=old?.shield||0;
    fresh.x=old?.x??fresh.x;
    fresh.inv=Math.max(.35,old?.inv||0);
    S.active[idx]=fresh;
  }
  if(announce)S.fx?.toast?.(`${v.name} · GIFT TIER 1 → ${f.name}`,tierColor(f.tier||1));
  return true;
}
function publish(){
  const current=window.__fighterArenaSelectionPolicy||{};
  window.__fighterArenaSelectionPolicy={...current,giftRare:[...GIFT_TIER_1],giftTier1:[...GIFT_TIER_1]};
  window.__fighterArenaGiftPolicy={version:VERSION,tier1:[...GIFT_TIER_1],diamondRange:[10,99]};
}
function install(){
  const api=window.FighterArenaBridge;
  if(!api?.emit)return false;
  if(api.emit.__giftTierPolicy){publish();return true}
  const base=api.emit.bind(api);
  const wrapped=(type,p={})=>{
    const t=String(type||'').toLowerCase();
    const isRose=String(p.giftName||p.name||'').toLowerCase().includes('rose');
    if(t!=='gift'||isRose)return base(type,p);
    const d=giftValue(p),level=giftLevel(d),before=viewerFromPayload(p),beforeId=before?.fighterId||'',beforeLevel=before?.giftTierLevel||0;
    const out=base(type,p),v=viewerFromPayload(p,out);
    if(!v||level===0)return out;
    if(level<beforeLevel&&beforeId){
      assign(v,beforeId,{announce:false});
      v.giftTierLevel=beforeLevel;
      return out;
    }
    v.giftTierLevel=Math.max(beforeLevel,level);
    if(level===1){
      const id=chooseTier1(v);
      if(id)assign(v,id);
    }
    publish();
    return out;
  };
  wrapped.__giftTierPolicy=VERSION;
  api.emit=wrapped;
  window.dispatchFighterArenaEvent=wrapped;
  publish();
  return true;
}

const timer=setInterval(()=>{if(install())clearInterval(timer)},50);
setTimeout(()=>{install();clearInterval(timer)},12000);
