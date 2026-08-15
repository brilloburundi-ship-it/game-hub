import{S}from'./core.js?v=1.4.0';

const VERSION='1.0.0';

function viewerFromPayload(p={},out=null){
  if(out?.id&&S.viewers.has(out.id))return S.viewers.get(out.id);
  const raw=String(p.userId||p.id||'');
  if(raw&&S.viewers.has(raw))return S.viewers.get(raw);
  const name=String(p.username||p.uniqueId||p.name||'').trim();
  if(name)return[...S.viewers.values()].find(v=>v.name===name)||null;
  return null;
}

function fullHealOnAscension(v,beforeLevel){
  const afterLevel=Math.max(0,Number(v?.giftTierLevel||0));
  if(!v||afterLevel<=beforeLevel)return;
  const r=S.active.find(x=>x?.viewer.id===v.id);
  if(!r||r.dead)return;
  const before=Math.max(0,Number(r.hp||0));
  r.hp=r.maxHp;
  r.glow=Math.max(1.25,Number(r.glow||0));
  r.inv=Math.max(.45,Number(r.inv||0));
  const healed=Math.max(0,Math.round(r.hp-before));
  if(healed>0)S.fx?.float?.(r.x,S.h*.51,`FULL HEAL +${healed} HP`,'#66f29b');
  S.fx?.burst?.(r.x,S.h*.61,'#66f29b',22,1.2);
  S.fx?.sheet?.('impactGb',r.x,S.h*.58,2.2);
  S.fx?.toast?.(`${v.name} · TIER ${afterLevel} ASCENSION · FULL HEAL`,'#66f29b');
}

function install(){
  const api=window.FighterArenaBridge;
  const base=api?.emit;
  if(!api||typeof base!=='function')return false;
  // Wait for the authoritative gift policy first, then wrap it without hiding
  // its marker; this prevents the policy from wrapping us again every sync tick.
  if(!base.__giftTierPolicy)return false;
  if(base.__giftInstantHeal===VERSION)return true;
  const wrapped=(type,p={})=>{
    const t=String(type||'').toLowerCase();
    const before=viewerFromPayload(p),beforeLevel=Math.max(0,Number(before?.giftTierLevel||0));
    const out=base(type,p);
    if(t==='gift'||t==='rose'){
      const v=viewerFromPayload(p,out);
      fullHealOnAscension(v,beforeLevel);
    }
    return out;
  };
  wrapped.__giftInstantHeal=VERSION;
  wrapped.__giftTierPolicy=base.__giftTierPolicy;
  api.emit=wrapped;
  window.dispatchFighterArenaEvent=wrapped;
  window.__fighterArenaGiftInstantHeal={version:VERSION,mode:'full-heal-on-tier-ascension'};
  return true;
}

const timer=setInterval(()=>{if(install())clearInterval(timer)},50);
setTimeout(install,12000);
addEventListener('pagehide',()=>clearInterval(timer),{once:true});
