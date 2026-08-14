(() => {
'use strict';
const VERSION='20260814-kw3-siege-rules-v3';
if(window.__KW3_SIEGE_RULES_V3?.installed)return;
const DEFENSIVE=new Set(['wall','wall_corner','gate','stone_tower','watchtower']);
const CORE_ALLOWED=new Set(['castle','keep','barracks','farm','house_a','house_b','house_c','market','forge','stable','warehouse','church','windmill','silo']);
function live(sim){return (sim.kingdoms||[]).filter(k=>k?.alive&&!k.founding);}
function rel(k,b){return [b.x-k.capital[0],b.y-k.capital[1]];}
function perimeterBuilding(k,b){const [dx,dy]=rel(k,b);return Math.max(Math.abs(dx),Math.abs(dy))>=2.8;}
function activeDefences(k){return (k.buildings||[]).filter(b=>DEFENSIVE.has(b.type)&&!b.__v66Destroyed&&Number(b.hp||0)>0);}
function breachState(k){
 const defs=activeDefences(k);const gateAlive=defs.some(b=>b.type==='gate');
 const outer=defs.filter(b=>perimeterBuilding(k,b));
 const totalOuter=(k.buildings||[]).filter(b=>DEFENSIVE.has(b.type)&&perimeterBuilding(k,b)).length||1;
 const destroyedOuter=Math.max(0,totalOuter-outer.length);
 const breached=!gateAlive||destroyedOuter>=3;
 return {breached,gateAlive,destroyedOuter,totalOuter};
}
function buffFortress(k){
 for(const b of k.buildings||[]){
  if(b.__kw3SiegeBuffed)continue;
  let mult=1;
  if(b.type==='wall'||b.type==='wall_corner')mult=2.4;
  else if(b.type==='gate')mult=3.4;
  else if(b.type==='stone_tower'||b.type==='watchtower')mult=2.8;
  else if(b.type==='castle')mult=1.65;
  if(mult!==1){const old=Math.max(1,Number(b.maxHp||b.hp||100));b.maxHp=Math.round(old*mult);b.hp=Math.max(Number(b.hp||0),b.maxHp);}
  b.__kw3SiegeBuffed=true;
 }
}
function enforceCastleLock(k){
 const castle=(k.buildings||[]).find(b=>b.type==='castle'&&!b.__v66Destroyed);if(!castle)return;
 const state=breachState(k);k.__kw3Breached=state.breached;
 if(!state.breached){
  if(!Number.isFinite(castle.__kw3ProtectedHp))castle.__kw3ProtectedHp=Number(castle.hp||castle.maxHp||1);
  if(Number(castle.hp||0)<castle.__kw3ProtectedHp)castle.hp=castle.__kw3ProtectedHp;
 }else castle.__kw3ProtectedHp=Math.min(Number(castle.__kw3ProtectedHp||castle.hp||0),Number(castle.hp||0));
}
function keepEconomyInside(sim,k){
 for(const b of k.buildings||[]){
  if(b.__v66Destroyed||b.type==='castle'||b.type==='port'||DEFENSIVE.has(b.type))continue;
  const d=Math.max(Math.abs(b.x-k.capital[0]),Math.abs(b.y-k.capital[1]));
  if(d<=2.35)continue;
  b.__kw3OutsideFortress=true;
  b.__v66Destroyed=true;b.hp=0;
  if(b._sprite){b._sprite.visible=false;b._sprite.renderable=false;}
  if(b.sprite){b.sprite.visible=false;b.sprite.renderable=false;}
 }
}
function install(sim){
 if(sim.__kw3SiegeRulesV3===VERSION)return;
 const rawAdd=sim.addBuilding.bind(sim),rawTick=sim.tick.bind(sim);
 sim.addBuilding=async function(k,type,x,y,forceCastle=false,instant=false){
  if(k?.__kw3ArenaV2Ready&&type!=='port'){
   const dx=x-k.capital[0],dy=y-k.capital[1],r=Math.max(Math.abs(dx),Math.abs(dy));
   if(DEFENSIVE.has(type)){
    if(r>3.15)return null;
   }else if(CORE_ALLOWED.has(type)&&type!=='castle'&&r>2.35){
    return null;
   }
  }
  const b=await rawAdd(k,type,x,y,forceCastle,instant);
  if(b&&k?.__kw3ArenaV2Ready)buffFortress(k);
  return b;
 };
 sim.tick=async function(){
  await rawTick();
  for(const k of live(this)){buffFortress(k);keepEconomyInside(this,k);enforceCastleLock(k);}
  document.documentElement.dataset.kw3Breach=live(this).map(k=>`${k.name}:${k.__kw3Breached?'open':'sealed'}`).join('|');
 };
 for(const k of live(sim)){buffFortress(k);keepEconomyInside(sim,k);enforceCastleLock(k);}
 sim.__kw3SiegeRulesV3=VERSION;
 window.__KW3_SIEGE_RULES_V3=Object.freeze({installed:true,version:VERSION,breachBeforeCastle:true,gatePrimaryBreach:true,fortressHpBoost:true,economyInsideWalls:true});
 document.documentElement.dataset.kw3SiegeRules=VERSION;
}
let tries=0;const timer=setInterval(()=>{tries++;const sim=window.__GOD_WORLD_SIM||window.__KINGDOM_WAR_SIM||window.__KW2_SIM;if(sim?.tick&&sim?.addBuilding){clearInterval(timer);install(sim);}else if(tries>300)clearInterval(timer);},50);
})();