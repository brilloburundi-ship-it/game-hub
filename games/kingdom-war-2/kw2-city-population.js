(() => {
'use strict';
const live=b=>b&&!b.__v66Destroyed&&b.hp>0;
const tag=c=>c.x+','+c.y;
const dist=(x,y,c)=>Math.hypot(x-c.x,y-c.y);
function cities(k){
 const cs=(k.__kw2Cities||[]).filter(c=>!c.dead&&(c.capital||live(c.center)));
 return cs.length?cs:[{x:k.capital[0],y:k.capital[1],capital:true}];
}
function nearest(cs,x,y){return cs.reduce((a,b)=>dist(x,y,b)<dist(x,y,a)?b:a);}
function allocation(k,visible){
 const cs=cities(k),weights=cs.map(c=>({c,cap:0,n:0}));
 for(const b of k.buildings.filter(live)){
  const n=b.type==='castle'?12:b.__kw2CityCenter?10:b.type.startsWith('house_')?10:0;
  if(n)weights.find(w=>w.c===nearest(cs,b.x,b.y)).cap+=n;
 }
 const sum=weights.reduce((n,w)=>n+w.cap,0)||1;
 let left=Math.max(0,Math.floor(visible));
 for(const w of weights){w.raw=visible*w.cap/sum;w.n=Math.min(left,Math.floor(w.raw));left-=w.n;}
 for(const w of [...weights].sort((a,b)=>(b.raw-b.n)-(a.raw-a.n)))if(left>0&&w.cap){w.n++;left--;}
 return weights;
}
function localCells(sim,k,c,radius=9){
 return [...k.territory].map(t=>t.split(',').map(Number)).filter(p=>dist(...p,c)<=radius&&sim.isNpcWalkableCell(k,...p)&&nearest(cities(k),...p)===c);
}
function chooseHome(sim,k){
 const weights=allocation(k,Math.min(k.pop,sim.visibleCitizenLimit(k)));
 const f=k.farmers||[];
 weights.sort((a,b)=>(b.n-f.filter(v=>v.homeCity===tag(b.c)).length)-(a.n-f.filter(v=>v.homeCity===tag(a.c)).length));
 for(const w of weights){
  const cells=localCells(sim,k,w.c);if(!cells.length)continue;
  const occupied=new Set(f.map(v=>v.cell.join(',')));
  const free=cells.filter(c=>!occupied.has(c.join(','))),p=(free.length?free:cells);
  return {cityKey:tag(w.c),cell:p[Math.floor(Math.random()*p.length)]};
 }
 return null;
}
function localTask(sim,k,f){
 const cs=cities(k),c=cs.find(c=>tag(c)===f.homeCity)||nearest(cs,...f.cell);
 f.homeCity=tag(c);
 const cells=localCells(sim,k,c,11);if(!cells.length)return f.cell;
 const own=k.buildings.filter(b=>live(b)&&nearest(cs,b.x,b.y)===c);
 const desired=f.job==='farm'?['farm','windmill']:f.job==='builder'?['house_a','house_b','house_c','market','barracks']:f.job==='stone'?['forge','warehouse']:['silo','warehouse'];
 const sites=own.filter(b=>desired.includes(b.type));
 if(sites.length){const b=sites[Math.floor(Math.random()*sites.length)];const p=sim.approachCell(k,b,f.cell);if(p&&dist(...p,c)<=11)return p;}
 return cells[Math.floor(Math.random()*cells.length)];
}
function settle(sim,k,c,n){
 const free=localCells(sim,k,c);if(!free.length)return 0;
 const source=(k.farmers||[]).filter(f=>!f.fixedBuilding&&f.homeCity!==tag(c)).slice(0,n);
 for(let i=0;i<source.length;i++){
  const f=source[i],p=free[i%free.length],xy=sim.iso(...p);
  f.homeCity=tag(c);f.cell=p.slice();f.x=xy[0];f.y=xy[1]+6;f.path=[];f.taskCell=null;f.action='idle';f.actionUntil=0;sim.r.setFarmerAction?.(f,'idle');sim.r.updateFarmer?.(f,0,0);
 }
 return source.length;
}
function install(sim){
 if(sim.__kw2CityPop)return true;sim.__kw2CityPop=true;
 const mobile=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
 sim.visibleCitizenLimit=k=>{
  const active=sim.kingdoms.filter(v=>v.alive).length||1;
  const cap=mobile?Math.min(32,Math.max(12,Math.floor(320/active))):Math.min(92,Math.max(28,Math.floor(1250/active)));
  return cap;
 };
 const prev=sim.population.bind(sim);
 sim.population=async function(k){
  const before=k.pop;
  await prev(k);
  const cap=window.__KW2_MARITIME.capacity(k);
  if(this.age-(k.__kw2GrowthAt||0)>=4&&k.resources.food>=10&&k.pop<cap){
   const n=Math.min(cap-k.pop,Math.floor(k.resources.food/8),Math.max(2,Math.ceil((cap-k.pop)*.18),Math.ceil(k.pop*.045)));
   if(n>0){k.pop+=n;k.resources.food-=n*8;k.__kw2GrowthAt=this.age;}
  }
  if(k.pop!==before||this.age%10===k.id%10){
   await this.syncCitizens(k);
   if(this.age%10===k.id%10){const weights=allocation(k,Math.min(k.pop,this.visibleCitizenLimit(k)));for(const w of weights){const have=k.farmers.filter(f=>f.homeCity===tag(w.c)).length;if(have<w.n&&w.c.capital===false)settle(this,k,w.c,Math.min(3,w.n-have));}}
  }
 };
 return true;
}
window.__KW2_CITY_POP={install,allocation,chooseHome,localTask,settle};
})();