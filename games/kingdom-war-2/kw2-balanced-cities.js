(() => {
'use strict';
const live=b=>b&&!b.__v66Destroyed&&b.hp>0;
const houses=['house_a','house_b','house_c'];
const costs={house_a:{wood:55,stone:8},house_b:{wood:55,stone:8},house_c:{wood:55,stone:8},farm:{wood:45,stone:4},market:{wood:80,stone:18,gold:15},barracks:{wood:90,stone:38},forge:{wood:85,stone:32,gold:8},stable:{wood:85,stone:22},windmill:{wood:80,stone:25},church:{wood:90,stone:40},warehouse:{wood:70,stone:24},silo:{wood:65,stone:20}};
const count=(k,t)=>k.buildings.filter(b=>live(b)&&b.type===t).length;
const afford=(k,t)=>Object.entries(costs[t]).every(([r,n])=>k.resources[r]>=n);
function plan(k,buildings=k.buildings){
 const c=t=>buildings.filter(b=>live(b)&&b.type===t).length,p=Math.max(4,k.pop),h=houses.reduce((n,t)=>n+c(t),0),total=Object.keys(costs).reduce((n,t)=>n+c(t),0);
 const capacity=12+h*10;
 const demands=[];
 const push=(type,desired,priority)=>{const have=c(type);if(have<desired)demands.push({type,score:priority+(desired-have)/desired*10});};
 const variant=houses.slice().sort((a,b)=>c(a)-c(b))[0];
 const housing=Math.max(2,Math.ceil((p+Math.max(12,p*.35)-12)/10),Math.ceil(total*.34));
 if(h<housing)demands.push({type:variant,score:capacity-p<10?115:82+(housing-h)*2});
 push('farm',Math.max(1,Math.ceil(p/24)),k.resources.food<p*4?110:76);
 push('market',Math.max(1,Math.ceil(p/65)),p>=12?71:36);
 push('barracks',Math.max(1,Math.ceil(p/70)),p>=14?74:34);
 if(p>=12||h>=2){push('windmill',Math.max(1,Math.ceil(c('farm')/4)),62);push('church',Math.max(1,Math.ceil(h/9)),57);}
 if(p>=22||h>=3){push('forge',Math.max(1,Math.ceil(p/100)),64);push('stable',Math.max(1,Math.ceil(p/120)),55);push('silo',Math.max(1,Math.ceil(c('farm')/5)),53);}
 if(p>=20||h>=4)push('warehouse',Math.max(1,Math.ceil((h+c('farm'))/12)),42);
 return demands.sort((a,b)=>b.score-a.score).map(d=>d.type);
}
function place(sim,k,type,center=null,allowClaim=false){
 const F=window.__KW2_FORT,source=center?[center.x,center.y]:k.capital;
 let best=null,score=-Infinity;
 const tiles=center?Array.from({length:169},(_,i)=>[center.x+i%13-6,center.y+Math.floor(i/13)-6]):[...k.territory].map(t=>t.split(',').map(Number));
 const other=k.buildings.filter(live);
 for(const [x,y] of tiles){
  const owner=sim.getOwner(x,y);
  if(owner!==k.id&&!(allowClaim&&owner===-1&&sim.neigh(x,y).some(c=>sim.getOwner(...c)===k.id)))continue;
  if(!sim.land(x,y)||sim.isRiver(x,y)||!sim.isBuildableCell(x,y,type)||F.isReserved(k,x,y)||F.reservedBy(sim,x,y,k.id)||sim.buildingBlockingCell(x,y))continue;
  if(k.farmers?.some(f=>f.cell?.[0]===x&&f.cell?.[1]===y))continue;
  if(other.some(b=>Math.hypot(b.x-x,b.y-y)<(F.DEF.has(b.type)?1.05:1.65)))continue;
  const distance=Math.hypot(x-source[0],y-source[1]);
  const value=-distance+(owner===k.id?2:0)+(type==='farm'&&sim.biome(x,y)==='grass'?4:0)+(sim.vegetationBlocksCell?.(x,y)?-.6:0);
  if(value>score){score=value;best=[x,y];}
 }
 return best;
}
async function build(sim,k,{test=false,center=null}={}){
 if(!k.alive||k.__kw2BalancedBusy)return false;
 k.__kw2BalancedBusy=true;
 try{
  const local=center?k.buildings.filter(b=>Math.hypot(b.x-center.x,b.y-center.y)<8):k.buildings;
  const cityPop=center?Math.min(k.pop,Math.max(12,local.filter(b=>houses.includes(b.type)).length*7)):k.pop;
  const localK=center?{...k,pop:cityPop,buildings:local}:k;
  const list=plan(localK,local).filter(t=>afford(k,t)&&(!sim.r.buildTex||sim.r.buildTex[t]));
  if(!list.length)return false;
  let expanded=false;
  for(let attempt=0;attempt<2;attempt++){
   for(const type of list){
    const cell=place(sim,k,type,center,!!center);
    if(!cell)continue;
    const [x,y]=cell,claimed=sim.getOwner(x,y)===-1;
    if(claimed){sim.setOwner(x,y,k.id);if(sim.getOwner(x,y)!==k.id)continue;k.territory.add(x+','+y);sim.__v800Performance?.invalidateKingdom?.(k.id);}
    let b;try{b=await sim.addBuilding(k,type,x,y,false,true);}catch(e){console.warn('[city placement]',type,e);}
    if(!b){if(claimed){sim.setOwner(x,y,-1);k.territory.delete(x+','+y);sim.__v800Performance?.invalidateKingdom?.(k.id);}continue;}
    for(const [r,n] of Object.entries(costs[type]))k.resources[r]-=n;
    k.popCap=window.__KW2_MARITIME.capacity(k);
    if(houses.includes(type)&&k.pop<k.popCap&&k.resources.food>=24){k.pop=Math.min(k.popCap,k.pop+(test?6:2));k.resources.food-=24;try{await sim.syncCitizens(k);}catch(e){console.warn('[citizens]',e);}}
    sim.r.puff?.(...sim.iso(x,y));return true;
   }
   if(center||expanded||k.resources.wood<65)break;
   expanded=true;const n=sim.claimGiftLand?.(k,test?10:3)||0;if(!n)break;
   k.resources.wood=Math.max(0,k.resources.wood-n*2);sim.__v800Performance?.invalidateKingdom?.(k.id);
  }
  return false;
 }finally{k.__kw2BalancedBusy=false;}
}
function install(sim){
 if(sim.__kw2BalancedCities)return true;
 sim.__kw2BalancedCities=true;
 const note=s=>window.__KW2_ROYAL_HUD?.chronicle(s);
 const oldExpand=sim.expandAI.bind(sim);
 sim.expandAI=function(k){
  const buildings=k.buildings.filter(b=>live(b)&&!window.__KW2_FORT.DEF.has(b.type)).length;
  const max=36+buildings*11+k.pop*2;
  if(k.territory.size>=max&&!k.__kw2DevelopmentTest)return false;
  return oldExpand(k);
 };
 const oldTick=sim.tick.bind(sim);
 sim.tick=async function(...args){
  if(this.__kw2DevelopmentTick)return false;this.__kw2DevelopmentTick=true;
  try{
   const result=await oldTick(...args);
   if(!this.__kw2TestRun)return result;
   const ks=this.kingdoms.filter(k=>k?.alive&&!k.founding),run=this.__kw2TestRun;
   for(const k of ks){
    if(!k.__kw2DevelopmentTest)continue;
    k.popCap=window.__KW2_MARITIME.capacity(k);
    const target=Math.min(k.popCap,130);
    if(k.pop<target){k.pop=Math.min(target,k.pop+12);k.lastPop=this.age;await this.syncCitizens(k);}
    k.military=Math.max(k.military,k.pop*1.4);
    if(k.pop>=100||this.age>=run.until)delete k.__kw2DevelopmentTest;
   }
   const ready=ks.filter(k=>k.pop>=65);
   if(!this.wars.some(w=>!w.done)&&!run.started){
    const pairs=[];for(let i=0;i<ready.length;i++)for(let j=i+1;j<ready.length;j++)pairs.push([ready[i],ready[j]]);
    pairs.sort((a,b)=>Math.hypot(a[0].capital[0]-a[1].capital[0],a[0].capital[1]-a[1].capital[1])-Math.hypot(b[0].capital[0]-b[1].capital[0],b[0].capital[1]-b[1].capital[1]));
    for(const [a,b] of pairs)if(this.attack(a,b)){run.started=true;note('⚔ TEST: large battle started');break;}
   }
   if(this.age>=run.until||ks.every(k=>!k.__kw2DevelopmentTest)){
    for(const k of ks)delete k.__kw2DevelopmentTest;
    note('TEST: development complete'+(run.started?' — battle underway':''));
    this.__kw2TestRun=null;
   }
   return result;
  }finally{this.__kw2DevelopmentTick=false;}
 };
 sim.__kw2DevelopAll=async function(){
  const ks=this.kingdoms.filter(k=>k?.alive&&!k.founding);
  if(!ks.length){note('TEST: use JOIN to create kingdoms first');return false;}
  if(this.__kw2TestRun){note('TEST: development already running');return false;}
  for(const k of ks){
   k.__kw2DevelopmentTest=true;k.resources.food+=6000;k.resources.wood+=6000;k.resources.stone+=3500;k.resources.gold+=2200;
   k.lastBuild=this.age-10;k.lastExpand=this.age-10;k.lastPop=this.age-10;
   k.__kw2FoundedAt=this.age-120;k.boostUntil=Math.max(k.boostUntil||0,this.age+90);
   k.military=Math.max(k.military,100);
  }
  this.__kw2TestRun={until:this.age+75,started:false};
  note('TEST: developing '+ks.length+' kingdoms — housing, economy and armies');
  return true;
 };
 return true;
}
window.__KW2_BALANCED_CITIES={install,plan,build,place};
})();