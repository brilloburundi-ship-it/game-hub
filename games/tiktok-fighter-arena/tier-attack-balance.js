import{S}from'./core.js?v=1.4.0';

const VERSION='2.5.0';

// Definitive equal-damage combat tuning.
// Every fighter uses the same raw attack value: no fighter stat, tier or matchup
// can reduce/increase basic damage. Higher tiers remain tougher only because of HP.
const BASE_ATTACK=50;
const COMBAT_TEMPO=1.45;

// combat-v14 applies 1.45 to strong attacks and .84 to chained hits.
// Keep the previously agreed effective multipliers without changing animations.
const STRONG_CORRECTION=1.50/1.45;
const SECOND_COMBO_CORRECTION=.85/.84;
const THIRD_COMBO_CORRECTION=.70/.84;

function stateCorrection(r){
  let mult=1;
  if(r?.state==='special'||r?.state==='attack3'||r?.state==='attack4')mult*=STRONG_CORRECTION;
  if(r?.comboStrike)mult*=r.__tierComboThirdArmed?THIRD_COMBO_CORRECTION:SECOND_COMBO_CORRECTION;
  return mult;
}
function effectiveAttack(r){
  if(!r||r.dead)return BASE_ATTACK*COMBAT_TEMPO;
  return BASE_ATTACK*COMBAT_TEMPO*stateCorrection(r);
}
function installLock(r){
  if(!r||r.__combatRulesVersion===VERSION)return;
  try{
    Object.defineProperty(r,'attack',{
      configurable:true,enumerable:true,
      get(){return effectiveAttack(r)},
      set(_v){}
    });
    // Defense remains completely disabled.
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
  equalDamage:true,
  defenseEnabled:false,
  baseAttack:BASE_ATTACK,
  hp:{free:'fighter base HP',follow:600,tier1:800,tier2:1800,tier3:2800,rose:'+10 max HP each'},
  attackScale:{free:1,follow:1,tier1:1,tier2:1,tier3:1},
  damageReduction:{free:0,follow:0,tier1:0,tier2:0,tier3:0},
  matchup:'disabled — all classes deal the same damage',
  combatTempo:COMBAT_TEMPO,
  combo:{tier1:1,tier2:2,tier3:3,follow:2,secondHit:.85,thirdHit:.70},
  specialMultiplier:1.50,
  note:'All fighters and tiers deal the same base damage. Defense and matchup damage penalties are disabled. Tier endurance comes from HP only.'
};
window.__fighterArenaTierAttackBalance=window.__fighterArenaCombatRules;
