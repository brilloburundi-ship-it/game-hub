import{S,cfg}from'./core.js?v=1.4.0';

const VERSION='1.0.0';
const ATTACK_SCALE={
  follow:1.80,
  tier1:2.00,
  tier2:2.80,
  tier3:4.60
};
const SAME_TIER_PRESSURE={
  follow:1.15,
  tier1:1.20,
  tier2:1.35,
  tier3:1.35
};
const FIGHTER_ATTACK_BONUS={
  samurai_archer:1.12
};

function baseAttack(r){
  const f=cfg(r?.fighterId);if(!f)return 0;
  const level=Math.max(1,Number(r.viewer?.level||1));
  return f.stats.attack*(1+(level-1)*.055);
}
function apply(r,e){
  if(!r?.viewer||r.dead)return;
  const cls=String(r.viewer.rewardClass||'');
  const scale=ATTACK_SCALE[cls];
  if(!scale)return;
  const sameTier=!!e?.viewer&&String(e.viewer.rewardClass||'')===cls;
  const duel=sameTier?(SAME_TIER_PRESSURE[cls]||1):1;
  const fighterBonus=FIGHTER_ATTACK_BONUS[r.fighterId]||1;
  r.attack=baseAttack(r)*scale*duel*fighterBonus;
  r.__tierAttackScale={base:scale,sameTier:duel,fighter:fighterBonus};
}
function frame(){
  const[a,b]=S.active||[];
  apply(a,b);apply(b,a);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__fighterArenaTierAttackBalance={version:VERSION,attackScale:{...ATTACK_SCALE},sameTierPressure:{...SAME_TIER_PRESSURE},fighterAttackBonus:{...FIGHTER_ATTACK_BONUS},goal:'same-tier fights resolve before timeout'};
