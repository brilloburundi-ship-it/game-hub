import{S,cfg}from'./core.js?v=1.4.0';

const VERSION='2.7.0';
const COMBAT_TEMPO=1.60;

// Free and Gift Tier 1/2/3 use the same damage rules. Higher gift tiers are
// stronger because they have more Max HP, not because of attack/defense gaps.
const STRONG_CORRECTION=1.50/1.45;
const SECOND_COMBO_CORRECTION=.85/.84;
const THIRD_COMBO_CORRECTION=.70/.84;
const LIKE_CRITICAL_FIRST=1.60;
const LIKE_CRITICAL_SECOND_TARGET=1.35;

function baseAttack(r){
  const f=cfg(r?.fighterId);
  if(!f)return Math.max(1,Number(r?.__combatFallbackAttack||1));
  const level=Math.max(1,Number(r?.viewer?.level||1));
  return Math.max(1,Number(f.stats?.attack||1))*(1+(level-1)*.055);
}
function stateCorrection(r){
  let mult=1;
  if(r?.state==='special'||r?.state==='attack3'||r?.state==='attack4')mult*=STRONG_CORRECTION;
  if(r?.comboStrike)mult*=r.__tierComboThirdArmed?THIRD_COMBO_CORRECTION:SECOND_COMBO_CORRECTION;
  if(r?.__likeCriticalActive){
    // First critical hit = x1.60. The chained second hit normally resolves at
    // ~0.85 power, so compensate it to land at ~x1.35 of a normal attack.
    mult*=r.comboStrike?(LIKE_CRITICAL_SECOND_TARGET/.85):LIKE_CRITICAL_FIRST;
  }
  return mult;
}
function effectiveAttack(r){
  return Math.max(1,baseAttack(r)*COMBAT_TEMPO*stateCorrection(r));
}
function installLock(r){
  if(!r||r.__combatRulesVersion===VERSION)return;
  r.__combatFallbackAttack=Math.max(1,Number(r.attack||1));
  try{
    Object.defineProperty(r,'attack',{
      configurable:true,enumerable:true,
      get(){return effectiveAttack(r)},
      set(v){r.__combatFallbackAttack=Math.max(1,Number(v||1))}
    });
    Object.defineProperty(r,'defense',{
      configurable:true,enumerable:true,
      get(){return 0},
      set(_v){}
    });
    r.__combatRulesVersion=VERSION;
  }catch(e){console.error('[Fighter Arena Combat Rules]',e)}
}
function frame(){
  for(const r of S.active||[])installLock(r);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__fighterArenaCombatRules={
  version:VERSION,
  locked:true,
  rosterUntouched:true,
  defenseEnabled:false,
  tierDamageGap:false,
  nativeFighterAttack:true,
  hp:{free:'fighter base HP',follow:600,tier1:800,tier2:1800,tier3:2800,rose:'+10 max HP each'},
  attackScale:{free:1,follow:1,tier1:1,tier2:1,tier3:1},
  damageReduction:{free:0,follow:0,tier1:0,tier2:0,tier3:0},
  matchup:'disabled — no tier-vs-tier damage modifiers',
  combatTempo:COMBAT_TEMPO,
  giftTierComboBonus:false,
  followCombo:2,
  specialMultiplier:1.50,
  likeCritical:{first:LIKE_CRITICAL_FIRST,second:LIKE_CRITICAL_SECOND_TARGET,doubleHit:true},
  note:'Tier does not modify damage. The blue bar is now Like-driven; at 100 Likes it arms a double critical attack. Defense remains disabled.'
};
window.__fighterArenaTierAttackBalance=window.__fighterArenaCombatRules;
