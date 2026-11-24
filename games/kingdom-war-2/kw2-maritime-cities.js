(() => {
'use strict';
const DIR=[[1,0],[-1,0],[0,1],[0,-1]],key=(x,y)=>x+','+y;
const live=b=>!!b&&!b.__v66Destroyed&&b.hp>0;
const kings=sim=>sim.kingdoms.filter(k=>k?.alive&&!k.founding);
const note=s=>window.__KW2_ROYAL_HUD?.chronicle(s);
const fmt=n=>Math.floor(n).toLocaleString('en-US');
const cityCost={food:110,wood:160,stone:75,gold:45};
const afford=(k,c)=>Object.entries(c).every(([r,n])=>k.resources[r]>=n);
const charge=(k,c)=>{for(const [r,n] of Object.entries(c))k.resources[r]-=n;};
function capacity(k){
 return (k.buildings||[]).filter(live).reduce((n,b)=>n+(b.type==='castle'?12:b.__kw2CityCenter?10:b.type.startsWith('house_')?10:0),0)||4;
}
function sea(sim,x,y){return sim.inBounds(x,y)&&!sim.land(x,y);}
function seaNear(sim,x,y){return DIR.map(([dx,dy])=>[x+dx,y+dy]).find(c=>sea(sim,...c))||null;}
function routeSea(sim,start,end){
 if(!start||!end||!sea(sim,...start)||!sea(sim,...end))return null;
 const W=sim.w.gridW,N=W*sim.w.gridH,id=(x,y)=>y*W+x,src=id(...start),dest=id(...end);
 const parent=new Int32Array(N).fill(-1),queue=new Int32Array(N);let head=0,tail=0;
 parent[src]=src;queue[tail++]=src;
 while(head<tail){
  const i=queue[head++];if(i===dest)break;const x=i%W,y=(i/W)|0;
  for(const [dx,dy] of DIR){const a=x+dx,b=y+dy;if(!sea(sim,a,b))continue;const j=id(a,b);if(parent[j]!==-1)continue;parent[j]=i;queue[tail++]=j;}
 }
 if(parent[dest]===-1)return null;
 const route=[];for(let i=dest;;i=parent[i]){route.push([i%W,(i/W)|0]);if(i===src)break;}
 return route.reverse();
}
function landRegions(sim){
 const W=sim.w.gridW,H=sim.w.gridH,ids=new Int16Array(W*H).fill(-1),sizes=[];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x;if(!sim.land(x,y)||ids[i]>=0)continue;
  const label=sizes.length,q=[i];ids[i]=label;
  for(let h=0;h<q.length;h++){const a=q[h]%W,b=(q[h]/W)|0;for(const [dx,dy] of DIR){const nx=a+dx,ny=b+dy;if(!sim.land(nx,ny))continue;const j=ny*W+nx;if(ids[j]<0){ids[j]=label;q.push(j);}}}
  sizes.push(q.length);
 }
 return {sizes,at:(x,y)=>sim.inBounds(x,y)?ids[y*W+x]:-1};
}
function canClaim(sim,k,x,y){
 return sim.land(x,y)&&!sim.isRiver(x,y)&&!['mountain','ice_coast'].includes(sim.biome(x,y))&&
 (sim.getOwner(x,y)===-1||sim.getOwner(x,y)===k.id)&&!window.__KW2_FORT.reservedBy(sim,x,y,k.id);
}
function portSite(sim,k,x,y){
 return canClaim(sim,k,x,y)&&sim.coastDistance(x,y)===1&&
 (sea(sim,x+1,y)||sea(sim,x,y+1))&&!sim.buildingBlockingCell(x,y);
}
function portPath(sim,k){
 // Multi-source BFS from the kingdom's connected land, not from the opposite coast.
 const q=[],parents=new Map();
 for(const token of k.territory){const c=token.split(',').map(Number);if(canClaim(sim,k,...c)){q.push(c);parents.set(token,null);}}
 for(let i=0;i<q.length&&i<7000;i++){
  const c=q[i],t=key(...c);
  if(portSite(sim,k,...c)&&!window.__KW2_FORT.isReserved(k,...c)){
   const path=[];for(let cur=c;cur;cur=parents.get(key(...cur)))path.push(cur);
   return path.reverse();
  }
  for(const [dx,dy] of DIR){const a=c[0]+dx,b=c[1]+dy,tag=key(a,b);if(parents.has(tag)||!canClaim(sim,k,a,b))continue;parents.set(tag,c);q.push([a,b]);}
 }
 return null;
}
function claim(sim,k,cells){for(const [x,y] of cells){if(sim.getOwner(x,y)!==-1||!canClaim(sim,k,x,y))continue;sim.setOwner(x,y,k.id);k.territory.add(key(x,y));}sim.__v800Performance?.invalidateKingdom?.(k.id);}
function ports(k){return k.buildings.filter(b=>live(b)&&b.type==='port');}
function colonySites(sim,regions){
 const out=[];
 for(let y=4;y<sim.w.gridH-4;y++)for(let x=4;x<sim.w.gridW-4;x++){
  if(sim.biome(x,y)!=='grass'||sim.coastDistance(x,y)<2||sim.coastDistance(x,y)>6||!sim.isBuildableCell(x,y,'house_a'))continue;
  let ok=true;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(!sim.land(x+dx,y+dy)||sim.isRiver(x+dx,y+dy))ok=false;
  if(!ok)continue;
  // Find a contiguous land approach from town to a south/east-facing port.
  const q=[[x,y]],parents=new Map([[key(x,y),null]]);let dock=null;
  for(let i=0;i<q.length&&i<180;i++){
   const c=q[i];if(sim.coastDistance(...c)===1&&(sea(sim,c[0]+1,c[1])||sea(sim,c[0],c[1]+1))){dock=c;break;}
   for(const [dx,dy] of DIR){const a=c[0]+dx,b=c[1]+dy,t=key(a,b);if(parents.has(t)||!sim.isWalkableCell(a,b)||Math.abs(a-x)+Math.abs(b-y)>9)continue;parents.set(t,c);q.push([a,b]);}
  }
  if(!dock)continue;const approach=[];for(let c=dock;c;c=parents.get(key(...c)))approach.push(c);
  out.push({x,y,dock,sea:seaNear(sim,...dock),approach,region:regions.at(x,y)});
 }
 return out;
}
function install(sim){
 if(sim.__kw2Maritime)return true;
 const r=sim.r,P=r.P,regions=landRegions(sim),sites=colonySites(sim,regions);
 const state={ships:[],tradeTrips:0,colonies:0,tradeGold:0,regions:regions.sizes.length,serial:0,clock:0};
 sim.__kw2Maritime=state;
 const oldAdd=sim.addBuilding.bind(sim);
 sim.addBuilding=async function(k,type,x,y,...rest){
  if(!this.land(x,y)||this.isRiver(x,y)||this.getOwner(x,y)!==k.id)return null;
  return oldAdd(k,type,x,y,...rest);
 };
 const oldJoin=sim.join.bind(sim);
 sim.join=async function(name,...args){
  const k=await oldJoin(name,...args);
  if(k?.alive&&!k.__kw2Cities){k.__kw2Cities=[{name:k.name+' Capital',x:k.capital[0],y:k.capital[1],capital:true}];k.popCap=capacity(k);note('👑 '+k.name+' founded a capital');}
  return k;
 };
 const oldGiftPop=sim.giftPopulation.bind(sim);
 sim.giftPopulation=async function(k,amount){
  k.popCap=capacity(k);
  const space=Math.max(0,k.popCap-k.pop),n=Math.max(0,Math.floor(Number(amount)||0));
  k.__kw2Immigrants=Math.min(500,(k.__kw2Immigrants||0)+Math.max(0,n-space));
  return oldGiftPop(k,Math.min(n,space));
 };
 const oldPopulation=sim.population.bind(sim);
 sim.population=async function(k){
  k.popCap=capacity(k);
  if(k.pop<k.popCap&&k.resources.food>=12&&this.age-k.lastPop>=4){
   const immigration=Math.min(k.__kw2Immigrants||0,Math.max(1,Math.ceil(k.popCap/20)));
   const births=Math.max(1,Math.floor(k.pop*.025));
   const n=Math.min(k.popCap-k.pop,Math.floor(k.resources.food/12),births+immigration);
   if(n>0){k.pop+=n;k.resources.food-=12*n;k.lastPop=this.age;k.__kw2Immigrants=Math.max(0,(k.__kw2Immigrants||0)-Math.max(0,n-births));await this.syncCitizens(k);}
  }
  if(k.pop>k.popCap&&this.age-(k.__kw2CrowdingAge||0)>=15){k.__kw2CrowdingAge=this.age;k.pop=Math.max(k.popCap,k.pop-1);await this.syncCitizens(k);}
  // The prior wrapper retains hunger mortality.
  await oldPopulation(k);
  k.popCap=capacity(k);
 };
 const oldBuild=sim.buildAI.bind(sim);
 sim.buildAI=async function(k){k.popCap=capacity(k);const out=await oldBuild(k);k.popCap=capacity(k);return out;};
 const oldGift=sim.gift.bind(sim);
 sim.gift=async function(name,gift,repeat=1,meta={}){
  const k=await this.waitForKingdomReady(name);if(!k?.alive)return;
  const before={...k.resources,pop:k.pop,power:this.power(k),build:k.buildings.length};
  const out=await oldGift(name,gift,repeat,meta);
  k.popCap=capacity(k);
  const dp=Math.max(0,this.power(k)-before.power),db=Math.max(0,k.buildings.length-before.build);
  state.lastGift='🎁 '+k.name+' received '+gift+' ×'+repeat+' · +'+fmt(dp)+' power'+(db?' · '+db+' buildings':'');note(state.lastGift);
  if(/castle fantasy|universe|lion|galaxy/i.test(gift))k.__kw2ColonizeWanted=true;
  return out;
 };
 function spawnShip(k,port,route,kind,dest,cargo){
  if(!route||route.length<2||state.ships.length>=24)return null;
  const lease=r.__kw2LeaseFishingBoat?.(k,port),frames=lease?.frames||r.__kw2BoatFrames?.(k);
  let g,h;
  if(frames?.length&&P.Sprite){
   g=lease?.sprite||new P.Sprite(frames[4]);h=g;
   g.anchor.set(.5,.78);g.scale.set(.52);g.roundPixels=true;g.texture=frames[4];
  }else{
   // A simple hull is only used if the legacy atlas has not loaded.
   g=new P.Container();h=new P.Graphics();
   h.poly([-12,-1,-8,5,7,5,13,-2,8,0,-9,0]).fill({color:0x79502d});h.rect(-1,-18,2,17).fill({color:0x533b27});h.poly([0,-17,9,-9,0,-4,-7,-10]).fill({color:k.color||0xe3ad55});g.addChild(h);
  }
  g.eventMode='none';const [x,y]=sim.iso(...route[0]);g.position.set(x,y+3);g.zIndex=Math.round(y*100)+14;if(!lease)r.entities.addChild(g);
  const ship={id:++state.serial,k,port,route,at:1,x,y,g,h,frames,lease,animClock:0,kind,dest,cargo,arrived:false,returning:false};state.ships.push(ship);return ship;
 }
 function chooseColony(k,port){
  if((k.__kw2Cities||[]).length>=5||state.ships.some(s=>s.k===k&&s.kind==='colony'))return null;
  const from=seaNear(sim,port.x,port.y),region=regions.at(port.x,port.y);
  const viable=sites.filter(p=>p.region!==region&&p.sea&&p.approach.every(c=>canClaim(sim,k,...c)&&!sim.buildingBlockingCell(...c))&&
   sim.getOwner(p.x,p.y)===-1&&sim.kingdoms.every(other=>!other.alive||(other.__kw2Cities||[{x:other.capital[0],y:other.capital[1]}]).every(c=>Math.hypot(c.x-p.x,c.y-p.y)>9))&&
   state.ships.every(s=>s.kind!=='colony'||Math.hypot(s.dest.x-p.x,s.dest.y-p.y)>8));
  viable.sort((a,b)=>Math.hypot(a.x-port.x,a.y-port.y)-Math.hypot(b.x-port.x,b.y-port.y));
  for(const p of viable.slice(0,30)){const route=routeSea(sim,from,p.sea);if(route?.length>4)return {p,route};}
  return null;
 }
 function launchColony(k){
  const port=ports(k)[0];if(!port||k.pop<14||!afford(k,cityCost))return false;
  const chosen=chooseColony(k,port);if(!chosen)return false;
  const s=spawnShip(k,port,chosen.route,'colony',chosen.p,{...cityCost});if(!s)return false;
  charge(k,cityCost);k.__kw2ColonizeWanted=false;
  note('⛵ '+k.name+' launched a colony expedition');return true;
 }
 function launchTrade(k,target=null){
  const port=ports(k)[0];if(!port||state.ships.some(s=>s.k===k&&s.kind==='trade')||k.resources.wood<30||k.resources.food<35)return false;
  const partners=kings(sim).filter(v=>v!==k&&(!target||v===target)&&!sim.wars.some(w=>!w.done&&[w.a,w.b].includes(k.id)&&[w.a,w.b].includes(v.id)));
  const candidates=partners.flatMap(v=>ports(v).map(p=>({v,p}))).sort((a,b)=>Math.hypot(a.p.x-port.x,a.p.y-port.y)-Math.hypot(b.p.x-port.x,b.p.y-port.y));
  for(const {v,p} of candidates){
   const route=routeSea(sim,seaNear(sim,port.x,port.y),seaNear(sim,p.x,p.y));if(!route||route.length<2)continue;
   const cargo={wood:20,food:25};const s=spawnShip(k,port,route,'trade',{k:v,port:p},cargo);if(!s)return false;
   charge(k,cargo);note('⚓ '+k.name+' dispatched a merchant to '+v.name);return true;
  }
  return false;
 }
 async function foundColony(s){
  const k=s.k,p=s.dest;
  if(!k.alive||!p.approach.every(c=>canClaim(sim,k,...c)&&!sim.buildingBlockingCell(...c))||sim.getOwner(p.x,p.y)!==-1)return false;
  const cells=[...p.approach];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(canClaim(sim,k,p.x+dx,p.y+dy))cells.push([p.x+dx,p.y+dy]);
  const fresh=[...new Map(cells.map(c=>[key(...c),c])).values()].filter(c=>sim.getOwner(...c)===-1);
  claim(sim,k,fresh);
  let b;
  try{b=await sim.addBuilding(k,'house_a',p.x,p.y,false,true);}catch(e){console.warn(e);}
  if(!b){for(const c of fresh){sim.setOwner(...c,-1);k.territory.delete(key(...c));}sim.__v800Performance?.invalidateKingdom?.(k.id);return false;}
  b.__kw2CityCenter=true;
  const city={name:k.name+' City '+((k.__kw2Cities||[]).length+1),x:p.x,y:p.y,center:b,capital:false,dock:p.dock,lastBuild:sim.age};
  (k.__kw2Cities||=([])).push(city);k.popCap=capacity(k);
  if(!sim.buildingBlockingCell(...p.dock)){try{city.port=await sim.addBuilding(k,'port',...p.dock,false,true);}catch(e){console.warn(e);}}
  if(P.Text&&r.labels?.addChild){try{const label=new P.Text({text:city.name,style:{fontFamily:'Arial',fontSize:12,fill:k.color||0xffffff,stroke:{color:0x182020,width:3}}});label.anchor.set(.5,1);const xy=sim.iso(p.x,p.y);label.position.set(xy[0],xy[1]-42);r.labels.addChild(label);city.label=label;}catch(e){}}
  state.colonies++;note('🏰 '+city.name+' founded across the sea');sim.r.redrawTerritories?.(sim,true);return true;
 }
 async function growCity(k,c){
  if(!live(c.center)){c.label?.destroy?.();c.dead=true;return;}
  if(sim.age-(c.lastBuild||0)<9)return;
  if(window.__KW2_BALANCED_CITIES){if(await window.__KW2_BALANCED_CITIES.build(sim,k,{center:c}))c.lastBuild=sim.age;return;}
  const near=k.buildings.filter(b=>live(b)&&Math.hypot(b.x-c.x,b.y-c.y)<7);
  const type=near.filter(b=>b.type==='farm').length<Math.max(1,Math.floor(near.length/4))?'farm':'house_b';
  const cost=type==='farm'?{wood:45,stone:4}:{wood:55,stone:8};if(!afford(k,cost))return;
  const options=[];for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
   const x=c.x+dx,y=c.y+dy;if(!canClaim(sim,k,x,y)||!sim.isBuildableCell(x,y,type)||sim.buildingBlockingCell(x,y)||!sim.buildingSpacingOK(k,type,x,y)||!sim.neigh(x,y).some(a=>sim.getOwner(...a)===k.id))continue;
   options.push([x,y]);
  }
  options.sort((a,b)=>Math.hypot(a[0]-c.x,a[1]-c.y)-Math.hypot(b[0]-c.x,b[1]-c.y));
  const p=options[0];if(!p)return;claim(sim,k,[p]);const b=await sim.addBuilding(k,type,...p,false,false);if(b){charge(k,cost);c.lastBuild=sim.age;k.popCap=capacity(k);}
 }
 function remove(s){if(s.lease)r.__kw2ReleaseFishingBoat?.(s.lease,s.kind==='colony'||!s.k.alive);else s.g.destroy({children:true});state.ships=state.ships.filter(v=>v!==s);}
 function update(dt){
  for(const s of state.ships){
   if(!s.k.alive||s.arrived)continue;
   const c=s.route[s.at];if(!c){s.arrived=true;continue;}
   const p=sim.iso(...c),dx=p[0]-s.x,dy=p[1]-s.y,d=Math.hypot(dx,dy),step=Math.min(d,90*dt);
   if(d<.6){s.x=p[0];s.y=p[1];s.at++;}else{s.x+=dx/d*step;s.y+=dy/d*step;s.h.scale.x=(dx<0?-1:1)*Math.abs(s.h.scale.x||1);}
   if(s.frames?.length){s.animClock+=dt;const frame=s.frames[4+Math.floor(s.animClock/.18)%4];if(s.g.texture!==frame)s.g.texture=frame;}
   s.g.position.set(s.x,s.y+3);s.g.zIndex=Math.round(s.y*100)+14;
  }
 }
 async function arrivals(){
  for(const k of sim.kingdoms)if(!k.alive)for(const c of k.__kw2Cities||[])if(c.label&&!c.label.destroyed)c.label.destroy();
  for(const s of [...state.ships]){
   if(!s.k.alive){if(s.returning&&s.profit&&s.dest?.k?.alive)s.dest.k.resources.gold+=s.profit;remove(s);continue;}
   if(!s.arrived)continue;
   if(s.kind==='colony'){
    if(!await foundColony(s)){for(const [r,n] of Object.entries(s.cargo))s.k.resources[r]+=n;note('⛵ '+s.k.name+' expedition returned: site unavailable');}
    remove(s);continue;
   }
   if(s.returning){s.k.resources.gold+=s.profit||0;state.tradeGold+=s.profit||0;state.tradeTrips++;note('⚓ '+s.k.name+' earned '+fmt(s.profit||0)+' gold from trade');remove(s);continue;}
   const target=s.dest.k,hostile=sim.wars.some(w=>!w.done&&[w.a,w.b].includes(s.k.id)&&[w.a,w.b].includes(target.id));
   if(target.alive&&live(s.dest.port)&&!hostile&&target.resources.gold>=20){
    const price=Math.min(42,Math.max(0,target.resources.gold-5));target.resources.gold-=price;target.resources.wood+=s.cargo.wood;target.resources.food+=s.cargo.food;s.profit=price;
   }else{for(const [r,n] of Object.entries(s.cargo))s.k.resources[r]+=n;s.profit=0;}
   s.returning=true;s.route.reverse();s.at=1;s.arrived=false;
  }
 }
 const tick=sim.tick.bind(sim);
 sim.tick=async function(...args){
  if(this.__kw2MaritimeBusy)return false;this.__kw2MaritimeBusy=true;
  try{
   const result=await tick(...args);if(this.matchOver)return result;await arrivals();
   for(const k of kings(this)){
    k.popCap=capacity(k);
    if(!k.__kw2Cities)k.__kw2Cities=[{name:k.name+' Capital',x:k.capital[0],y:k.capital[1],capital:true}];
    for(const c of k.__kw2Cities.filter(c=>!c.capital&&!c.dead))await growCity(k,c);
    if(!ports(k).length&&k.pop>=8&&this.age%5===k.id%5&&k.resources.wood>=12){
     const path=portPath(this,k);if(path){const next=path.find(c=>this.getOwner(...c)===-1);if(next){claim(this,k,[next]);k.resources.wood-=3;}else if(k.resources.wood>=95&&k.resources.stone>=35){const dock=path[path.length-1];const b=await this.addBuilding(k,'port',...dock,false,true);if(b){k.resources.wood-=80;k.resources.stone-=30;note('⚓ '+k.name+' opened a port');}}}
    }
    if((k.__kw2ColonizeWanted||k.pop>=30)&&this.age-(k.__kw2ColonyCheck||0)>=8){k.__kw2ColonyCheck=this.age;if((k.__kw2ColonizeWanted||this.age-(k.__kw2LastColony||0)>90)&&launchColony(k))k.__kw2LastColony=this.age;}
    if(this.age%18===k.id%18)launchTrade(k);
   }
   document.documentElement.dataset.kw2Ships=String(state.ships.length);document.documentElement.dataset.kw2Cities=String(kings(this).reduce((n,k)=>n+(k.__kw2Cities||[]).filter(c=>!c.dead).length,0));return result;
  }finally{this.__kw2MaritimeBusy=false;}
 };
 r.app.ticker.add(()=>update(Math.min(.05,r.app.ticker.deltaMS/1000)));
 sim.__kw2WorldCommand=async function(user,command){
  const k=this.kingdomByName.get(String(user).toLowerCase());if(!k?.alive){note(user+': type JOIN to found your kingdom');return false;}
  const c=command.trim();
  if(/^colonize$/i.test(c)){k.__kw2ColonizeWanted=true;note(k.name+': colony expedition queued; needs port, 14 population and supplies');return true;}
  if(/^trade(?:\s+.*)?$/i.test(c)){const name=c.replace(/^trade\s*/i,'').trim().replace(/^@/,'');const target=name?this.kingdomByName.get(name.toLowerCase()):null;if(name&&!target){note('Kingdom not found: '+name);return false;}const ok=launchTrade(k,target);if(!ok)note(k.name+': trade requires two ports and supplies');return ok;}
  if(/^build$/i.test(c)){k.lastBuild=0;note(k.name+': building priority requested');return true;}
  if(/^status$/i.test(c)){note(k.name+' · '+fmt(k.pop)+'/'+fmt(capacity(k))+' citizens · '+(k.__kw2Cities||[]).filter(c=>!c.dead).length+' cities');return true;}
  return false;
 };
 return true;
}
window.__KW2_MARITIME={install,routeSea,landRegions,capacity,colonySites};
})();