import{S,cfg}from'./core.js?v=1.4.0';

const VERSION='2.1.0';
const CLASSES=new Set(['free','follow','tier1','tier2','tier3']);

// Definitive combat tuning. Fighter roster/visuals are intentionally excluded.
const ATTACK_SCALE={free:1.00,follow:1.15,tier1:1.30,tier2:1.65,tier3:2.10};
const DAMAGE_REDUCTION={free:.08,follow:.12,tier1:.15,tier2:.25,tier3:.40};
const MATCHUP={
  free:  {free:1.00,follow:.75,tier1:.45,tier2:.20,tier3:.08},
  follow:{free:1.15,follow:1.00,tier1:.65,tier2:.28,tier3:.10},
  tier1: {free:1.25,follow:1.10,tier1:1.00,tier2:.30,tier3:.12},
  tier2: {free:1.55,follow:1.45,tier1:1.35,tier2:1.00,tier3:.18},
  tier3: {free:1.80,follow:1.70,tier1:1.60,tier2:1.45,tier3:1.00}
};

// Global tempo changes only fight duration. It does not alter roster, tier
// membership, HP ladder, relative matchup hierarchy, animations or VFX.
const COMBAT_TEMPO=1.75;

// combat-v14 currently applies 1.45 to strong attacks and .84 to chained hits.
// These corrections make the effective locked rules exactly 1.50 special,
// .85 second combo hit and .70 third combo hit without touching animations.
const STRONG_CORRECTION=1.50/1.45;
const SECOND_COMBO_CORRECTION=.85/.84;
const THIRD_COMBO_CORRECTION=.70/.84;

function combatClass(r){
  const reward=String(r?.viewer?.rewardClass||'');
  if(CLASSES.has(reward))return reward;
  const locked=window.__fighterArenaTierRoster?.classOf?.(r?.fighterId);
  return CLASSES.has(locked)?locked:'free';
}
function baseAttack(r){
  const f=cfg(r?.fighterId);if(!f)return 0;
  const level=Math.max(1,Number(r?.viewer?.level||1));
  return Math.max(1,Number(f.stats?.attack||1))*(1+(level-1)*.055);
}
function opponentOf(r){return(S.active||[]).find(x=>x&&x!==r&&!x.dead)||null}
function stateCorrection(r){
  let mult=1;
  if(r?.state==='special'||r?.state==='attack3'||r?.state==='attack4')mult*=STRONG_CORRECTION;
  if(r?.comboStrike)mult*=r.__tierComboThirdArmed?THIRD_COMBO_CORRECTION:SECOND_COMBO_CORRECTION;
  return mult;
}
function effectiveAttack(r){
  if(!r?.viewer||r.dead)return Math.max(1,Number(r?.__combatFallbackAttack||1));
  const defender=opponentOf(r),aClass=combatClass(r),dClass=combatClass(defender);
  const raw=baseAttack(r);
  const tier=ATTACK_SCALE[aClass]||1;
  const matchup=MATCHUP[aClass]?.[dClass]??1;
  const reduction=1-(DAMAGE_REDUCTION[dClass]??0);
  return Math.max(1,raw*tier*matchup*reduction*stateCorrection(r)*COMBAT_TEMPO);
}
function installLock(r){
  if(!r||r.__combatRulesVersion===VERSION)return;
  r.__combatFallbackAttack=Math.max(1,Number(r.attack||1));
  r.__combatFallbackDefense=Math.max(0,Number(r.defense||0));
  try{
    Object.defineProperty(r,'attack',{
      configurable:true,enumerable:true,
      get(){return effectiveAttack(r)},
      set(v){r.__combatFallbackAttack=Math.max(1,Number(v||1))}
    });
    Object.defineProperty(r,'defense',{
      configurable:true,enumerable:true,
      get(){return 0},
      set(v){r.__combatFallbackDefense=Math.max(0,Number(v||0))}
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
  hp:{free:'fighter base HP',follow:600,tier1:800,tier2:1800,tier3:2800,rose:'+10 max HP each'},
  attackScale:{...ATTACK_SCALE},
  damageReduction:{...DAMAGE_REDUCTION},
  matchup:Object.fromEntries(Object.entries(MATCHUP).map(([k,v])=>[k,{...v}])),
  combatTempo:COMBAT_TEMPO,
  combo:{tier1:1,tier2:2,tier3:3,follow:2,secondHit:.85,thirdHit:.70},
  specialMultiplier:1.50,
  note:'All combat power is tier math only. No fighter-specific attack or defense bonuses. Global tempo shortens fights without changing relative balance.'
};
window.__fighterArenaTierAttackBalance=window.__fighterArenaCombatRules;
