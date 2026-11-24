(() => {
'use strict';
const VERSION='20261124-kw2-living-civilizations-1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const key=(x,y)=>x+','+y;
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const alive=b=>!!b&&!b.__v66Destroyed&&b.hp>0;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const living=sim=>sim.kingdoms.filter(k=>k?.alive&&!k.founding);
const activeWar=sim=>sim.wars.find(w=>!w.done);
const isAtWar=(sim,k)=>sim.wars.some(w=>!w.done&&(w.a===k.id||w.b===k.id));
const stats={sword:{hp:72,damage:11,range:23,speed:47},spear:{hp:85,damage:13,range:27,speed:43},archer:{hp:52,damage:8,range:52,speed:45}};
const mobile=()=>typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
function targetArmy(k,cap=128){
 const gift=Math.max(0,Number(k.__v713InteractionPower)||0);
 const support=Math.floor(Math.log2(1+gift/100)*2.5);
 const pop=Math.max(0,Number(k.pop)||0),trained=Math.max(0,Number(k.military)||0);
 return Math.min(cap,Math.max(0,Math.floor(pop*.85)+support),Math.max(3,Math.floor(pop*.58+Math.sqrt(trained)*.8+support)));
}
function cellWorld(sim,x,y){const a=sim.iso(x,y);return {x:a[0],y:a[1]+6};}
function grid(sim,x,y){
 const a=(x-sim.w.originX)/(sim.w.tileW/2),b=(y-6-sim.w.originY)/(sim.w.tileH/2);
 return [Math.round((a+b)/2),Math.round((b-a)/2)];
}
function createNavigation(sim){
 const W=sim.w.gridW,H=sim.w.gridH,N=W*H;
 const terrain=new Uint8Array(N),blocks=new Map(),fields=new Map();
 let revision=-1,created=0;
 const id=(x,y)=>y*W+x,valid=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)terrain[id(x,y)]=sim.isWalkableCell(x,y)?1:0;
 const components=new Int16Array(N).fill(-1);let group=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const start=id(x,y);if(!terrain[start]||components[start]>=0)continue;
  const queue=[start];components[start]=group;
  for(let head=0;head<queue.length;head++){
   const i=queue[head],cx=i%W,cy=(i/W)|0;
   for(const [dx,dy] of DIRS){const nx=cx+dx,ny=cy+dy;if(!valid(nx,ny))continue;const ni=id(nx,ny);if(terrain[ni]&&components[ni]<0){components[ni]=group;queue.push(ni);}}
  }
  group++;
 }
 function connected(a,b){return valid(...a)&&valid(...b)&&components[id(...a)]>=0&&components[id(...a)]===components[id(...b)];}
 function refresh(){
  const rev=sim.__kw2TopologyRevision||0;if(rev===revision)return;
  revision=rev;fields.clear();blocks.clear();
  for(const k of sim.kingdoms)if(k?.alive||k?.founding)for(const b of k.buildings||[]){
   if(!alive(b))continue;
   const r=b.type==='castle'||b.type==='keep'?1:0;
   for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(valid(b.x+dx,b.y+dy))blocks.set(id(b.x+dx,b.y+dy),b);
  }
 }
 function pass(side,x,y){
  if(!valid(x,y)||!terrain[id(x,y)])return false;
  const b=blocks.get(id(x,y));if(!alive(b))return true;
  return b.type==='gate'&&(b.owner===side||sim.areAllied?.(sim.kingdoms[side],sim.kingdoms[b.owner]));
 }
 function gate(side,x,y){
  if(!valid(x,y))return;
  const b=blocks.get(id(x,y));
  if(b?.type==='gate'&&alive(b)&&pass(side,x,y))window.__KW2_FORT?.gateRequest(sim,side,b);
 }
 function buildField(side,goals,cacheKey){
  const existing=fields.get(cacheKey);if(existing)return existing;
  if(created>=3)return null;created++;
  const d=new Int16Array(N).fill(-1),q=new Int32Array(N);let head=0,tail=0;
  for(const [x,y] of goals)if(pass(side,x,y)&&d[id(x,y)]===-1){const i=id(x,y);d[i]=0;q[tail++]=i;}
  while(head<tail){
   const i=q[head++],x=i%W,y=(i/W)|0;
   for(const [dx,dy] of DIRS){
    const nx=x+dx,ny=y+dy;
    if(!pass(side,nx,ny))continue;
    const ni=id(nx,ny);if(d[ni]!==-1)continue;d[ni]=d[i]+1;q[tail++]=ni;
   }
  }
  if(fields.size>=80)fields.delete(fields.keys().next().value);
  fields.set(cacheKey,d);return d;
 }
 function goalsForBuilding(b){
  const r=(b.type==='castle'||b.type==='keep'?1:0)+1,goals=[];
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==r||Math.abs(dx)+Math.abs(dy)!==r)continue;
   goals.push([b.x+dx,b.y+dy]);
  }
  // Corner approaches to a large keep are legitimate when cardinal ones are occupied.
  if(r>1)for(const dx of [-r,r])for(const dy of [-1,1])goals.push([b.x+dx,b.y+dy],[b.x+dy,b.y+dx]);
  return goals;
 }
 function field(side,target){
  const b=target.building;
  if(b)return buildField(side,goalsForBuilding(b),side+':b:'+b.owner+':'+b.x+','+b.y);
  const c=target.cell;return buildField(side,[c,...DIRS.map(([dx,dy])=>[c[0]+dx,c[1]+dy])],side+':c:'+key(...c));
 }
 function value(f,x,y){return valid(x,y)&&f?f[id(x,y)]:-1;}
 function next(side,f,x,y,phase=0){
  let best=null,d=value(f,x,y);
  if(d===0)return null;
  if(d<0)d=Infinity;
  for(let i=0;i<4;i++){
   const [dx,dy]=DIRS[(i+Math.floor(phase))%4];
   const a=x+dx,b=y+dy,v=value(f,a,b);
   if(v>=0&&v<d&&pass(side,a,b)){d=v;best=[a,b];}
  }
  return best;
 }
 return {refresh,pass,gate,field,value,next,connected,begin(){created=0;refresh();},goalsForBuilding,get revision(){return revision;}};
}
function install(sim){
 if(sim.__kw2CivilizationWar||!sim.r?.P||!sim.r?.entities)return false;
 const r=sim.r,P=r.P;
 window.__KW2_FORT.install(sim);
 const nav=createNavigation(sim),units=[],arrows=[],fires=new Map();
 const cap=mobile()?48:128,globalCap=cap*2;
 const state={installed:true,version:VERSION,units,arrows,fires,cap,globalCap,warCount:0,combatKills:0,buildingsDestroyed:0,territoryCaptured:0,peakUnits:0,nextWar:0,clock:0};
 // Old battle modules remain only for shared renderer utilities. Their army
 // simulation is never called: this is the single authority for combat.
 for(const list of r.__v66Guards?.values?.()||[])for(const u of list)u.s?.destroy?.({children:true});
 r.__v66Guards?.clear?.();
 for(const fx of r.__v66Fires?.values?.()||[])fx.c?.destroy?.({children:true});
 r.__v66Fires?.clear?.();
 sim.visibleCitizenLimit=k=>Math.min(mobile()?18:32,Math.max(mobile()?14:24,Number(k.__v712VisibleCitizenCap)||0));
 const priorJoin=sim.join.bind(sim);
 sim.join=async function(...args){const k=await priorJoin(...args);if(k?.alive)k.__kw2FoundedAt??=this.age;return k;};
 for(const k of living(sim))k.__kw2FoundedAt??=sim.age;
 const oldEconomy=sim.economy.bind(sim);
 sim.economy=function(k){
  const before={...k.resources};
  oldEconomy(k);
  const deployed=units.filter(u=>!u.dead&&!u.retiring&&u.side===k.id&&u.fromPopulation).length;
  // A quarter of normal positive income is replaced by actual working NPC productivity.
  for(const resource of ['food','wood','stone','gold']){
   const gain=k.resources[resource]-before[resource];
   if(gain>0)k.resources[resource]-=gain*.25;
  }
  const workers=(k.farmers||[]).filter(f=>!f.__kw2WarHidden);
  const scale=Math.max(1,Math.max(0,k.pop-deployed)/Math.max(1,workers.length));
  for(const f of workers){
   if(['walk','idle','hurt','death'].includes(f.action)||!f.action)continue;
   const resource=f.job?.startsWith('farm')?'food':f.job==='wood'?'wood':f.job==='stone'?'stone':'gold';
   const rates={food:.23,wood:.16,stone:.085,gold:.045};
   k.resources[resource]+=rates[resource]*scale*(this.age<k.boostUntil?1.8:1);
   if(f.job==='builder')k.lastBuild-=.025;
  }
  k.resources.food=Math.max(0,k.resources.food-deployed*.055);
  const limit=Math.max(8,k.pop*1.5+Math.log2(1+(k.__v713InteractionPower||0)/100)*8);
  k.military=Math.min(limit,Math.max(0,k.military||0));
 };
 const oldPopulation=sim.population.bind(sim);
 sim.population=async function(k){
  const out=await oldPopulation(k);
  if(k.resources.food<1&&k.pop>2&&this.age-(k.__kw2LastHunger||0)>18){
   k.__kw2LastHunger=this.age;k.pop--;await this.syncCitizens(k);
  }
  return out;
 };
 const oldFarmerAI=sim.farmerAI.bind(sim);
 sim.farmerAI=function(k){
  if(isAtWar(this,k)){
   const enemy=units.filter(u=>!u.dead&&u.side!==k.id&&!this.areAllied(k,this.kingdoms[u.side]));
   for(const f of k.farmers||[]){
    if(f.fixedBuilding||!enemy.some(u=>Math.hypot(u.x-f.x,u.y-f.y)<55))continue;
    const safe=this.approachCell(k,k.buildings.find(b=>b.type==='castle'));
    if(safe){const path=this.findPath(k,f.cell,safe);if(path.length){f.path=path;f.taskCell=safe;f.action='walk';this.r.setFarmerAction(f,'walk');}}
   }
  }
  return oldFarmerAI(k);
 };
 function makeUnit(k,war){
  const reserve=war.reserve[k.id];if(!reserve||reserve.remaining<=0)return null;
  const current=units.filter(u=>!u.dead&&u.side===k.id);
  if(current.length>=targetArmy(k,cap)||units.filter(u=>!u.dead).length>=globalCap)return null;
  if(k.resources.food<2||k.resources.gold<.6)return null;
  const castle=k.buildings.find(b=>alive(b)&&b.type==='castle');if(!castle)return null;
  const cells=nav.goalsForBuilding(castle).filter(c=>nav.pass(k.id,...c));
  if(!cells.length)return null;
  const c=cells[(Math.random()*cells.length)|0],p=cellWorld(sim,...c);
  const seq=k.__kw2ArmySeq=(k.__kw2ArmySeq||0)+1;
  const role=seq%4===0?'archer':seq%3===0?'spear':'sword',st=stats[role];
  const s=r.makeSoldier(k,role);if(!s)return null;
  const variants={sword:['SwordMan','KingMan','PrinceMan','HorseMan'],spear:['SpearMan','HalberdMan','ShieldMan','CavalierMan'],archer:['ArcherMan','CrossBowMan','Mage','ArchMage']};
  const variant=variants[role][(Math.floor(seq/3)+k.id)%variants[role].length];
  if(r.getMinifolkFrames&&s._sprite){try{const frames={};for(const a of ['idle','walk','attack','hurt','death']){const v=r.getMinifolkFrames('humans',variant,a,k);frames[a]=v?.length?v:s._anim[a];}if(frames.idle?.length){s._anim=frames;s._sprite.textures=frames.idle;s._sprite.gotoAndPlay?.(0);s._unit=variant;}}catch(_){}}
  const bonus=clamp(1+Math.log10(1+Math.max(0,k.__v713InteractionPower||0)/100)*.12,1,1.65);
  const u={s,side:k.id,warId:war.id,role,x:p.x,y:p.y,cell:c.slice(),hp:st.hp*bonus,maxHp:st.hp*bonus,damage:st.damage*bonus,speed:st.speed*rand(.86,1.16),cooldown:rand(.2,.8),nextThink:0,target:null,nextCell:null,dead:false,retiring:false,fromPopulation:current.filter(v=>v.fromPopulation).length<Math.max(0,k.pop-2),phase:rand(0,6.28),offsetX:rand(-4.2,4.2),offsetY:rand(-2.1,2.1),occupier:seq%5===1,musterCell:war.muster?.slots[k.id]?.[seq%(war.muster.slots[k.id].length||1)]||null};
  s.position.set(u.x,u.y);s.zIndex=Math.round(u.y*100)+16;r.entities.addChild(s);
  units.push(u);reserve.remaining--;k.resources.food-=2;k.resources.gold-=.6;
  state.peakUnits=Math.max(state.peakUnits,units.length);
  return u;
 }
 function anim(u,name){
  if(u.anim===name)return;u.anim=name;r.swapAnim?.(u.s,name);
  if(u.s?._sprite){u.s._sprite.animationSpeed=name==='attack'?.13:name==='death'?.12:name==='hurt'?.12:.12;}
 }
 function face(u,x){if(u.s?._sprite)u.s._sprite.scale.x=(x>=u.x?1:-1)*Math.abs(u.s._sprite.scale.x||1);}
 function kill(u){
  if(u.dead)return;u.dead=true;u.deadAt=state.clock;u.target=null;
  anim(u,'death');if(u.s?._sprite){u.s._sprite.loop=false;u.s._sprite.gotoAndPlay?.(0);}
  const k=sim.kingdoms[u.side];if(k?.alive){k.military=Math.max(0,k.military-1);if(u.fromPopulation){k.pop=Math.max(2,k.pop-1);k.__kw2PopulationDirty=true;}}
  state.combatKills++;
 }
 function makeArrow(u,target){
  if(arrows.length>=100)return;
  const g=new P.Graphics();g.poly([-5,0,4,0]).stroke({color:0xdac39a,width:1.3});g.poly([4,0,0,-2,0,2]).fill({color:0xc8c8c8});
  const a={g,x:u.x,y:u.y-10,tx:target.x,ty:target.y-8,t:0,d:.28+Math.random()*.17};
  g.position.set(a.x,a.y);r.fx.addChild(g);arrows.push(a);
 }
 function fire(b){
  if(fires.has(b)||fires.size>=42)return;
  const c=new P.Container();
  const parts=[];
  for(let i=0;i<5;i++){
   const g=new P.Graphics();g.rect(-2,-7,4,8).fill({color:i%2?0xffa22d:0xf46b20});g.rect(-1,-4,2,4).fill({color:0xffe49b});
   g.x=(i-2)*3;g.y=-3-rand(0,7);c.addChild(g);parts.push(g);
  }
  for(let i=0;i<3;i++){const g=new P.Graphics();g.rect(-2,-2,4,4).fill({color:0x655c55,alpha:.6});g.y=-15-i*5;g.x=(i-1)*4;c.addChild(g);parts.push(g);}
  c.position.set(b.sx,b.sy-5);r.fx.addChild(c);fires.set(b,{c,parts});
 }
 function damageBuilding(u,b){
  if(!alive(b))return;
  b.hp=Math.max(0,b.hp-u.damage*(u.role==='archer'?.55:1));
  const ratio=b.hp/b.maxHp;
  if(b._sprite)b._sprite.tint=ratio<.3?0x8b736a:ratio<.75?0xc7b5a7:0xffffff;
  if(ratio<.82)fire(b);
  if(b.hp>0)return;
  const owner=sim.kingdoms[b.owner],winner=sim.kingdoms[u.side];
  state.buildingsDestroyed++;sim.__kw2TopologyRevision=(sim.__kw2TopologyRevision||0)+1;
  if(b.type==='castle'){sim.eliminate(owner,winner);return;}
  b.__v66Destroyed=true;
  if(owner){owner.buildings=owner.buildings.filter(v=>v!==b);sim.releaseFarmWorker?.(owner,b.id);if(b.type.startsWith('house_'))owner.popCap=Math.max(4,owner.popCap-5);}
  r.destroyBuilding?.(b);sim.__v800Performance?.rebuildBuildingIndex?.();r.redrawSettlementGround?.(sim);
 }
 function endWar(w){
  if(w.__kw2Ended)return;w.__kw2Ended=true;w.done=true;
  state.nextWar=sim.age+45+Math.floor(Math.random()*25);
  for(const u of units)if(!u.dead&&u.warId===w.id){u.retiring=true;u.target=null;u.nextCell=null;u.nextThink=0;}
  for(const id of [w.a,w.b]){const k=sim.kingdoms[id];if(k)k.aggressive=null;}
 }
 r.endWar=endWar;
 r.startWar=function(w){w.__v66={phase:'rally',age:0,phaseAge:0};w.__kw2Started=state.clock;w.__kw2Progress=state.clock;};
 function musterPlan(a,b){
  nav.begin();
  const src=nav.goalsForBuilding(a.buildings.find(v=>alive(v)&&v.type==='castle')||{type:'castle',x:a.capital[0],y:a.capital[1]}).filter(c=>nav.pass(a.id,...c));
  const dst=nav.goalsForBuilding(b.buildings.find(v=>alive(v)&&v.type==='castle')||{type:'castle',x:b.capital[0],y:b.capital[1]}).filter(c=>nav.pass(b.id,...c));
  if(!src.length||!dst.length)return null;
  // Find a neutral, open rendezvous along a real route, not the geometric midpoint in water.
  const W=sim.w.gridW,H=sim.w.gridH,id=(x,y)=>y*W+x;
  const parent=new Int32Array(W*H).fill(-1),q=new Int32Array(W*H);let head=0,tail=0,goal=-1;
  for(const c of src){const i=id(...c);parent[i]=i;q[tail++]=i;}
  const goals=new Set(dst.map(c=>id(...c)));
  while(head<tail){
   const i=q[head++];if(goals.has(i)){goal=i;break;}
   const x=i%W,y=(i/W)|0;
   for(const [dx,dy] of DIRS){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H||!sim.isWalkableCell(nx,ny))continue;const j=id(nx,ny);if(parent[j]>=0)continue;
    const block=sim.buildingBlockingCell?.(nx,ny);if(block&&block.type!=='gate')continue;
    parent[j]=i;q[tail++]=j;}
  }
  if(goal<0)return null;const path=[];for(let i=goal;;i=parent[i]){path.push([i%W,(i/W)|0]);if(parent[i]===i)break;}path.reverse();
  if(path.length<9)return null;
  const mid=(path.length/2)|0,front=path[mid],out={center:front,slots:{}};
  for(const [k,fraction] of [[a,.39],[b,.61]]){
   const base=path[Math.round((path.length-1)*fraction)];
   const cells=[base];
   for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    if(Math.abs(dx)+Math.abs(dy)>3||(!dx&&!dy))continue;
    const x=base[0]+dx,y=base[1]+dy;
    if(nav.pass(k.id,x,y)&&!sim.buildingBlockingCell?.(x,y)&&Math.hypot(x-front[0],y-front[1])>=1.5)cells.push([x,y]);
   }
   cells.sort((x,y)=>Math.hypot(x[0]-base[0],x[1]-base[1])-Math.hypot(y[0]-base[0],y[1]-base[1]));
   out.slots[k.id]=cells.slice(0,7);
  }
  return out;
 }
 function start(a,b,manual=false){
  if(sim.matchOver||!a?.alive||!b?.alive||a===b||sim.areAllied(a,b)||!nav.connected(a.capital,b.capital)||activeWar(sim)||units.some(u=>!u.dead&&u.retiring))return false;
  if(!manual&&(sim.age-(a.__kw2FoundedAt??sim.age)<120||sim.age-(b.__kw2FoundedAt??sim.age)<120))return false;
  const w={id:'civil-war-'+(++state.warCount),a:a.id,b:b.id,front:[a.capital.slice(),b.capital.slice()],done:false,lastCapture:sim.age,startedAge:sim.age,occupation:new Map(),nextRecruit:0,reserve:{}};
  for(const k of [a,b]){const n=targetArmy(k,cap);w.reserve[k.id]={remaining:n+Math.floor(k.pop*.3),lastTarget:n};}
  w.muster=musterPlan(a,b);w.released=!w.muster;w.musterDeadline=state.clock+45;
  sim.wars.push(w);r.startWar(w);r.notifyCameraWar?.(w,sim);state.nextWar=sim.age+30;
  return true;
 }
 state.canFight=(a,b)=>!!(a?.alive&&b?.alive&&a!==b&&!sim.areAllied(a,b)&&nav.connected(a.capital,b.capital));
 sim.startWar=function(a,b){return start(a,b,false);};
 sim.attack=function(a,b){return start(a,b,true);};
 sim.warAI=function(){
  if(this.__kw2TestRun&&!this.__kw2TestRun.started)return false;
  if(this.matchOver||activeWar(this)||this.age<state.nextWar||units.some(u=>!u.dead&&u.retiring))return false;
  const ks=living(this).filter(k=>this.age-(k.__kw2FoundedAt??this.age)>=120&&k.pop>=6);
  const pairs=[];
  for(let i=0;i<ks.length;i++)for(let j=i+1;j<ks.length;j++){
   const a=ks[i],b=ks[j];if(this.areAllied(a,b)||!nav.connected(a.capital,b.capital))continue;
   const mismatch=Math.abs(Math.log(Math.max(1,this.power(a))/Math.max(1,this.power(b))));
   const d=Math.hypot(a.capital[0]-b.capital[0],a.capital[1]-b.capital[1]);
   pairs.push({a,b,score:d+mismatch*7+Math.random()*8});
  }
  pairs.sort((a,b)=>a.score-b.score);
  for(const p of pairs.slice(0,3))if(start(p.a,p.b))return true;
  state.nextWar=this.age+10;return false;
 };
 function spatial(){
  const cells=new Map();
  for(const u of units)if(!u.dead&&!u.retiring){const k=key(Math.floor(u.x/48),Math.floor(u.y/48));if(!cells.has(k))cells.set(k,[]);cells.get(k).push(u);}
  return cells;
 }
 function nearby(map,u,radius){
  const result=[],x=Math.floor(u.x/48),y=Math.floor(u.y/48),r0=Math.ceil(radius/48);
  for(let dy=-r0;dy<=r0;dy++)for(let dx=-r0;dx<=r0;dx++)for(const v of map.get(key(x+dx,y+dy))||[])if(v!==u&&!v.dead&&distance(u,v)<=radius)result.push(v);
  return result;
 }
 function clearLine(u,v){
  if(!nav.pass(u.side,...v.cell))return false;
  const steps=Math.ceil(distance(u,v)/6);
  for(let i=1;i<steps;i++){const c=grid(sim,u.x+(v.x-u.x)*i/steps,u.y+(v.y-u.y)*i/steps);if(!nav.pass(u.side,...c))return false;}
  return true;
 }
 function objective(u,w,map){
  const enemy=sim.kingdoms[u.side===w.a?w.b:w.a];if(!enemy?.alive)return null;
  const others=nearby(map,u,95).filter(v=>v.side===enemy.id);
  others.sort((a,b)=>distance(u,a)-distance(u,b));
  const closest=others[0];if(closest&&clearLine(u,closest))return {unit:closest,cell:closest.cell.slice()};
  if(w.muster&&w.released&&w.__v66.phase!=='combat'&&Math.hypot(u.cell[0]-w.muster.center[0],u.cell[1]-w.muster.center[1])>2){const t={cell:w.muster.center},f=nav.field(u.side,t);if(f&&nav.value(f,...u.cell)>=0)return t;}
  const bs=enemy.buildings.filter(alive).sort((a,b)=>{
   const score=v=>Math.hypot(v.sx-u.x,v.sy-u.y)-(v.type==='gate'?18:0)+(v.type==='castle'?12:0);
   return score(a)-score(b);
  });
  // A building is an objective only when a walkable approach is reachable.
  // This naturally directs attacks to gates and walls until an actual breach exists.
  for(const b of bs.slice(0,9)){
   const t={building:b},f=nav.field(u.side,t);
   if(f&&nav.value(f,...u.cell)>=0)return t;
  }
  return u.target?.building&&alive(u.target.building)?u.target:null;
 }
 function move(u,target,dt,map){
  if(!target){anim(u,'idle');return;}
  const f=nav.field(u.side,target);
  if(u.nextCell&&!nav.pass(u.side,...u.nextCell))u.nextCell=null;
  if(!u.nextCell&&f)u.nextCell=nav.next(u.side,f,...u.cell,u.phase);
  if(!u.nextCell){
   if(target.unit&&!target.unit.dead){
    const v=target.unit,d=distance(u,v),step=Math.min(d,u.speed*dt);
    if(d>.5){const nx=u.x+(v.x-u.x)/d*step,ny=u.y+(v.y-u.y)/d*step,c=grid(sim,nx,ny);
     if(nav.pass(u.side,...c)){face(u,v.x);anim(u,'walk');u.x=nx;u.y=ny;u.cell=c;u.s.position.set(nx,ny);u.s.zIndex=Math.round(ny*100)+16;return;}}
   }
   anim(u,'idle');return;
  }
  const c=u.nextCell;nav.gate(u.side,...c);nav.gate(u.side,...u.cell);
  const p=cellWorld(sim,...c);p.x+=u.offsetX;p.y+=u.offsetY;
  const dx=p.x-u.x,dy=p.y-u.y,d=Math.hypot(dx,dy);
  if(d<.6){u.x=p.x;u.y=p.y;u.cell=c.slice();u.nextCell=null;return;}
  // Individual speeds and local congestion, no shared formation or group movement.
  const same=nearby(map,u,8).filter(v=>v.side===u.side);
  const speed=u.speed*(same.length>2?.78:1),step=Math.min(d,speed*dt);
  face(u,p.x);anim(u,'walk');u.x+=dx/d*step;u.y+=dy/d*step;
  if(d>5&&same.length){let rx=0,ry=0;for(const v of same){const ax=u.x-v.x,ay=u.y-v.y,l=Math.max(.1,Math.hypot(ax,ay));rx+=ax/l;ry+=ay/l;}const nx=u.x+clamp(rx,-1,1)*.55,ny=u.y+clamp(ry,-1,1)*.55;const here=grid(sim,u.x,u.y),there=grid(sim,nx,ny);if(here[0]===there[0]&&here[1]===there[1]){u.x=nx;u.y=ny;}}
  u.s.position.set(u.x,u.y);u.s.zIndex=Math.round(u.y*100)+16;
  if(d-step<.5){u.cell=c.slice();u.nextCell=null;}
 }
 function updateUnit(u,w,map,dt){
  if(u.dead)return;
  const k=sim.kingdoms[u.side];
  if(!k?.alive){u.dead=true;u.deadAt=state.clock-3;return;}
  if(u.retiring||!w||w.done){
   const b=k.buildings.find(b=>alive(b)&&b.type==='castle');
   if(!b||Math.hypot(u.x-b.sx,u.y-b.sy)<45||state.clock-(u.returnStarted??=state.clock)>65){u.dead=true;u.deadAt=state.clock-3;return;}
   move(u,{building:b},dt,map);return;
  }
  if(!w.released&&u.musterCell){
   const t={cell:u.musterCell},f=nav.field(u.side,t);
   if(f&&nav.value(f,...u.cell)===0){u.musterReady=true;u.nextCell=null;anim(u,'idle');return;}
   if(f&&nav.value(f,...u.cell)>=0){move(u,t,dt,map);return;}
   if(!f){anim(u,'idle');return;}
  }
  if(u.occupier&&w.__v66.phase==='combat'&&!u.nextCell){
   const [x,y]=u.cell,owner=sim.getOwner(x,y);
   const border=sim.neigh(x,y).some(c=>sim.getOwner(...c)!==owner);
   const enemyNear=nearby(map,u,35).some(v=>v.side===owner);
   if(owner>=0&&owner!==u.side&&[w.a,w.b].includes(owner)&&border&&!sim.buildingBlockingCell(x,y)&&!enemyNear){
    const tag=key(x,y);if(u.occupationTag!==tag){u.occupationTag=tag;u.occupationUntil=state.clock+3.5;}
    if(state.clock<u.occupationUntil){anim(u,'idle');return;}
   }
  }
  if(state.clock>=u.nextThink||u.target?.unit?.dead||(u.target?.building&&!alive(u.target.building))){
   u.target=objective(u,w,map);u.nextThink=state.clock+rand(.35,.85);
  }
  const target=u.target;
  if(!target){anim(u,'idle');return;}
  const v=target.unit,b=target.building;
  if(v&&!v.dead)target.cell=v.cell.slice();
  if(!v&&!b){move(u,target,dt,map);return;}
  const p=v?{x:v.x,y:v.y}:{x:b.sx,y:b.sy};
  const d=Math.hypot(u.x-p.x,u.y-p.y),st=stats[u.role];
  const field=b?nav.field(u.side,target):null;
  const canHit=b?(field&&nav.value(field,...u.cell)===0):(d<=st.range&&clearLine(u,v));
  u.cooldown-=dt;
  if(canHit){
   u.nextCell=null;face(u,p.x);anim(u,'attack');w.__kw2Progress=state.clock;w.__v66.phase='combat';
   if(u.cooldown<=0){u.cooldown=rand(.8,1.45);if(u.role==='archer')makeArrow(u,p);if(v){v.hp-=u.damage*rand(.85,1.15);if(v.hp<=0)kill(v);else if(Math.random()<.28)anim(v,'hurt');}else damageBuilding(u,b);}
   return;
  }
  move(u,target,dt,map);
 }
 function occupation(w){
  const claims=new Map();
  for(const u of units){
   if(u.dead||u.retiring||u.warId!==w.id)continue;
   const [x,y]=u.cell,owner=sim.getOwner(x,y);
   if(owner<0||owner===u.side||!([w.a,w.b].includes(owner))||sim.buildingBlockingCell(x,y))continue;
   if(!sim.neigh(x,y).some(c=>sim.getOwner(...c)!==owner))continue;
   const tag=key(x,y);if(!claims.has(tag))claims.set(tag,{side:u.side,owner,x,y});
  }
  for(const [tag,v] of claims){
   if(units.some(u=>!u.dead&&u.side===v.owner&&Math.max(Math.abs(u.cell[0]-v.x),Math.abs(u.cell[1]-v.y))<=1)){w.occupation.delete(tag);continue;}
   const count=(w.occupation.get(tag)||0)+1;w.occupation.set(tag,count);
   if(count<3)continue;
   sim.setOwner(v.x,v.y,v.side);sim.kingdoms[v.owner].territory.delete(tag);sim.kingdoms[v.side].territory.add(tag);
   sim.__v800Performance?.invalidateKingdom?.(v.owner);sim.__v800Performance?.invalidateKingdom?.(v.side);w.occupation.delete(tag);state.territoryCaptured++;w.__kw2Progress=state.clock;
  }
  for(const tag of w.occupation.keys())if(!claims.has(tag))w.occupation.delete(tag);
 }
 sim.resolveWars=function(){
  for(const k of living(this))if(k.__kw2PopulationDirty){k.__kw2PopulationDirty=false;void this.syncCitizens(k).catch(console.warn);}
  for(const w of this.wars){
   if(w.done){endWar(w);continue;}
   const a=this.kingdoms[w.a],b=this.kingdoms[w.b];
   if(!a?.alive||!b?.alive||this.areAllied(a,b)){endWar(w);continue;}
   if((state.clock-w.__kw2Started>20&&[w.a,w.b].every(id=>w.reserve[id].remaining<=0&&!units.some(u=>!u.dead&&u.side===id)))||state.clock-w.__kw2Progress>100||this.age-w.startedAge>420){endWar(w);continue;}
   occupation(w);
   const aUnits=units.filter(u=>!u.dead&&u.side===a.id),bUnits=units.filter(u=>!u.dead&&u.side===b.id);
   const near=aUnits.find(u=>u.target?.unit||u.target?.building);
   if(near){const other=near.target.unit?.cell||[near.target.building.x,near.target.building.y];w.front=[near.cell.slice(),other.slice()];}
   if(w.released&&w.__v66.phase==='rally')w.__v66.phase='advance';
  }
 };
 function updateTowers(w,map){
  if(!w)return;
  for(const side of [w.a,w.b]){
   const k=sim.kingdoms[side];if(!k?.alive)continue;
   const enemy=side===w.a?w.b:w.a;
   for(const b of k.buildings){
    if(!alive(b)||!['stone_tower','watchtower'].includes(b.type)||(b.__kw2NextShot||0)>state.clock)continue;
    const point={x:b.sx,y:b.sy};
    const candidates=nearby(map,point,78).filter(u=>u.side===enemy);
    if(!candidates.length)continue;
    candidates.sort((a,c)=>distance(point,a)-distance(point,c));
    const target=candidates[0];b.__kw2NextShot=state.clock+rand(1.5,2.2);
    makeArrow({x:b.sx,y:b.sy-24},target);target.hp-=rand(5,9);
    if(target.hp<=0)kill(target);
   }
  }
 }
 function updateEffects(dt){
  for(let i=arrows.length-1;i>=0;i--){
   const a=arrows[i];a.t+=dt;const t=Math.min(1,a.t/a.d);
   a.g.position.set(a.x+(a.tx-a.x)*t,a.y+(a.ty-a.y)*t-Math.sin(t*Math.PI)*12);
   a.g.rotation=Math.atan2(a.ty-a.y-Math.cos(t*Math.PI)*12*Math.PI,a.tx-a.x);
   if(t>=1){a.g.destroy();arrows.splice(i,1);}
  }
  for(const [b,fx] of fires){
   if(!alive(b)||!sim.kingdoms[b.owner]?.alive){fx.c.destroy({children:true});fires.delete(b);continue;}
   for(let i=0;i<fx.parts.length;i++){const g=fx.parts[i];if(i<5)g.scale.y=.8+Math.abs(Math.sin(state.clock*10+i))*.6;else{g.y=-12-((state.clock*8+i*6)%25);g.alpha=.65*(1-(-g.y-12)/28);}}
  }
 }
 let accumulator=0,sortClock=0;
 r.updateWars=function(_sim,dt){
  accumulator+=Math.min(.1,Math.max(0,Number(dt)||0));
  const step=mobile()?1/20:1/25;if(accumulator<step)return;
  const elapsed=Math.min(.12,accumulator);accumulator=0;state.clock+=elapsed;sim.__kw2Clock=state.clock;
  nav.begin();const w=activeWar(sim);
  if(w){
   const fps=Number(r.app?.ticker?.FPS)||60,dynamic=fps<27?Math.floor(cap*.55):fps<42?Math.floor(cap*.8):cap;
   if(state.clock>=w.nextRecruit){
    w.nextRecruit=state.clock+.18;
    for(const id of [w.a,w.b]){
     const k=sim.kingdoms[id];if(k?.alive){const reserve=w.reserve[id],target=targetArmy(k,cap);if(target>reserve.lastTarget){reserve.remaining+=target-reserve.lastTarget;reserve.lastTarget=target;}for(let batch=0;batch<3&&units.filter(u=>!u.dead&&u.side===id).length<targetArmy(k,dynamic);batch++){if(!makeUnit(k,w))break;}}
    }
   }
  }
  if(w&&!w.released){const enough=[w.a,w.b].every(id=>{const list=units.filter(u=>!u.dead&&u.side===id);const k=sim.kingdoms[id],target=targetArmy(k,cap);return list.length>=Math.max(2,Math.ceil(target*.6))&&list.filter(u=>u.musterReady).length>=Math.max(2,Math.ceil(list.length*.65));});if(enough||state.clock>=w.musterDeadline){w.released=true;w.__v66.phase='advance';for(const u of units){u.nextCell=null;u.nextThink=0;u.target=null;}}}
  const map=spatial();
  for(const u of units)updateUnit(u,w,map,elapsed);
  updateTowers(w,map);
  for(let i=units.length-1;i>=0;i--){const u=units[i];if(!u.dead)continue;const age=state.clock-u.deadAt;if(age>1.6){u.s?.destroy?.({children:true});units.splice(i,1);}else if(age>.9)u.s.alpha=clamp((1.6-age)/.7,0,1);}
  window.__KW2_FORT.gateUpdate(sim,elapsed);updateEffects(elapsed);
  sortClock+=elapsed;if(sortClock>=.12){sortClock=0;r.__v800RequestSort?.();if(r.entities)r.entities.sortDirty=true;}
  document.documentElement.dataset.kw2ArmyUnits=String(units.filter(u=>!u.dead).length);
  document.documentElement.dataset.kw2WarState=w?(w.__v66?.phase||'advance'):'peace';
 };
 const oldTick=sim.tick.bind(sim);
 sim.tick=async function(...args){if(this.matchOver)return false;try{return await oldTick(...args);}catch(error){console.error('[KW2 civilization tick]',error);return false;}};
 // On-page testing can still exercise a manual war while automatic wars develop naturally.
 document.documentElement.dataset.kw2Military='individual-physical-war';
 document.documentElement.dataset.kw2ArmyCap=String(globalCap);
 sim.__kw2CivilizationWar=state;
 window.__KW2_CIVILIZATION_STATE=state;
 return true;
}
window.__KW2_CIVILIZATION={install,targetArmy,createNavigation,grid};
const wait=setInterval(()=>{
 const sim=window.__SIM;
 if(sim?.r?.app?.ticker&&window.__V800_PERFORMANCE_KERNEL?.installed&&window.__V713_LIVE_POWER?.installed&&sim.__v661BattleStabilityInstalled&&window.__KW2_FORT&&window.__GOD_WORLD_LATEST_SHAPE?.installed){clearInterval(wait);try{install(sim);}catch(error){window.__KW2_CIVILIZATION_ERROR=String(error?.message||error);console.error('[KW2 initialization]',error);}}
},50);
})();
