(() => {
'use strict';
const VERSION='20260814-kw3-fortress-layout-v3';
const key=(x,y)=>`${x},${y}`;
if(window.__KW3_ARENA_LAYOUT_V2?.version===VERSION)return;
function live(sim){return (sim.kingdoms||[]).filter(k=>k?.alive&&!k.founding);}
function candidates(sim){
 const out=[];
 for(let y=6;y<sim.w.gridH-6;y++)for(let x=6;x<sim.w.gridW-6;x++){
  if(sim.getOwner(x,y)!==-1||sim.biome(x,y)!=='grass'||!sim.isBuildableCell(x,y,'castle'))continue;
  if((sim.spawnRoom?.(x,y)||0)<7)continue;
  const [sx,sy]=sim.iso(x,y);out.push({x,y,sx,sy});
 }
 return out;
}
function compactSpawns(sim){
 if(sim.__kw3CompactSpawnsV3)return sim.__kw3CompactSpawnsV3;
 const pts=candidates(sim);if(pts.length<2)return null;
 const cx=pts.reduce((s,p)=>s+p.sx,0)/pts.length,cy=pts.reduce((s,p)=>s+p.sy,0)/pts.length;
 const left=pts.filter(p=>p.sx<cx).sort((a,b)=>(Math.abs(a.sx-(cx-175))+Math.abs(a.sy-cy)*.72)-(Math.abs(b.sx-(cx-175))+Math.abs(b.sy-cy)*.72));
 const a=left[0]||pts[0];
 const right=pts.filter(p=>p.sx>cx&&Math.hypot(p.x-a.x,p.y-a.y)>=11&&Math.hypot(p.x-a.x,p.y-a.y)<=19)
  .sort((p,q)=>(Math.abs(p.sx-(cx+175))+Math.abs(p.sy-cy)*.72)-(Math.abs(q.sx-(cx+175))+Math.abs(q.sy-cy)*.72));
 const b=right[0]||pts.filter(p=>p!==a).sort((p,q)=>Math.abs(Math.hypot(p.x-a.x,p.y-a.y)-14)-Math.abs(Math.hypot(q.x-a.x,q.y-a.y)-14))[0];
 return sim.__kw3CompactSpawnsV3=[[a.x,a.y],[b.x,b.y]];
}
function hideBuilding(sim,b){
 b.__v66Destroyed=true;b.hp=0;
 if(b._sprite){b._sprite.visible=false;b._sprite.renderable=false;}
 if(b.sprite){b.sprite.visible=false;b.sprite.renderable=false;}
 if(b._foundation){b._foundation.visible=false;b._foundation.renderable=false;}
 if(b._shadow){b._shadow.visible=false;b._shadow.renderable=false;}
 try{sim.r.destroyBuilding?.(b);}catch{}
}
function clearOldFortress(sim,k){
 const structural=new Set(['wall','wall_corner','gate','stone_tower','watchtower','barracks','farm','house_a','house_b','house_c','market','forge','stable','warehouse','church','windmill','silo']);
 for(const b of k.buildings||[])if(structural.has(b.type)&&b.type!=='castle')hideBuilding(sim,b);
 k.buildings=(k.buildings||[]).filter(b=>!(structural.has(b.type)&&b.type!=='castle'&&b.__v66Destroyed));
}
function orientBuilding(b,mirror=false){
 if(!b)return b;b.__kw3Mirror=!!mirror;
 for(const s of [b._sprite,b.sprite]){
  if(!s?.scale)continue;
  const mag=Math.abs(Number(s.scale.x)||1);s.scale.x=mirror?-mag:mag;
 }
 return b;
}
async function put(sim,k,type,dx,dy,mirror=false){
 const x=k.capital[0]+dx,y=k.capital[1]+dy;
 if(!sim.inBounds(x,y)||!sim.land(x,y))return null;
 const old=(k.buildings||[]).find(b=>b.x===x&&b.y===y&&!b.__v66Destroyed&&Number(b.hp||0)>0);
 if(old)return orientBuilding(old,mirror);
 try{return orientBuilding(await sim.addBuilding(k,type,x,y,true,true),mirror);}catch{return null;}
}
function claim(sim,k,r=5){
 const [cx,cy]=k.capital;
 for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  const x=cx+dx,y=cy+dy;if(!sim.land(x,y))continue;
  const o=sim.getOwner(x,y);if(o!==-1&&o!==k.id)continue;
  sim.setOwner(x,y,k.id);k.territory.add(key(x,y));
 }
}
function gateFor(sim,k,slot,R){
 const spawns=compactSpawns(sim)||[];
 const other=spawns[slot===0?1:0];
 if(!other)return slot===0?[R,0]:[-R,0];
 const [cx,cy]=sim.iso(...k.capital),[ox,oy]=sim.iso(...other);const vx=ox-cx,vy=oy-cy;
 const sides=[[R,0],[-R,0],[0,R],[0,-R]];
 let best=sides[0],bestDot=-Infinity;
 for(const side of sides){
  const [sx,sy]=sim.iso(k.capital[0]+side[0],k.capital[1]+side[1]);
  const dx=sx-cx,dy=sy-cy,dot=dx*vx+dy*vy;
  if(dot>bestDot){bestDot=dot;best=side;}
 }
 return best;
}
function economySlots(gx,gy){
 const pool=[[-2,-1],[-1,-2],[1,-2],[2,-1],[-2,1],[-1,2],[1,2],[2,1]];
 return pool.sort((a,b)=>(a[0]*gx+a[1]*gy)-(b[0]*gx+b[1]*gy)).slice(0,4);
}
async function rebuild(sim,k,slot){
 if(!k?.alive||k.__kw3FortressV3Ready)return;
 k.__kw3FortressV3Ready=true;k.__kw3ArenaV2Ready=true;
 clearOldFortress(sim,k);claim(sim,k,5);
 const R=4,[gateX,gateY]=gateFor(sim,k,slot,R);
 k.__kw3GateCell=[gateX,gateY];
 k.__kw3GateDir=[Math.sign(gateX),Math.sign(gateY)];
 k.__kw3FortressRadius=R;
 // ONE clean outer perimeter. No inner wall ring: the keep now has a real courtyard.
 for(let x=-R+1;x<=R-1;x++){
  if(!(gateX===x&&gateY===-R))await put(sim,k,'wall',x,-R,false);
  if(!(gateX===x&&gateY=== R))await put(sim,k,'wall',x, R,false);
 }
 for(let y=-R+1;y<=R-1;y++){
  if(!(gateX===-R&&gateY===y))await put(sim,k,'wall',-R,y,true);
  if(!(gateX=== R&&gateY===y))await put(sim,k,'wall', R,y,true);
 }
 for(const [dx,dy] of [[-R,-R],[R,-R],[-R,R],[R,R]])await put(sim,k,'stone_tower',dx,dy,dx===R);
 const gateMirror=Math.abs(gateX)===R;
 await put(sim,k,'gate',gateX,gateY,gateMirror);
 // Economy is deliberately on the rear/side half of the courtyard, away from the attack lane.
 const slots=economySlots(...k.__kw3GateDir);
 const types=['barracks','farm','house_a','market'];
 for(let i=0;i<types.length;i++)await put(sim,k,types[i],slots[i][0],slots[i][1],false);
 // Reserve the central keep footprint and a straight gate-to-keep approach for troops.
 k.__kw3ReservedCells=new Set();
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)k.__kw3ReservedCells.add(key(dx,dy));
 const [gx,gy]=k.__kw3GateDir;
 for(let step=1;step<R;step++)k.__kw3ReservedCells.add(key(gx*step,gy*step));
 sim.__v800Performance?.rebuildBuildingIndex?.();sim.r.redrawTerritories?.(sim,true);sim.r.redrawSettlementGround?.(sim);
}
function focus(sim){
 const ks=live(sim);if(ks.length<2)return;
 const mx=Math.round((ks[0].capital[0]+ks[1].capital[0])/2),my=Math.round((ks[0].capital[1]+ks[1].capital[1])/2);
 sim.r.focusCell?.(mx,my);const root=sim.r.root;if(root?.scale?.set)root.scale.set(Math.max(.56,Math.min(.72,Number(root.scale.x||.66))));
}
function install(sim){
 if(sim.__kw3ArenaLayoutV2===VERSION)return;
 const rawJoin=sim.join.bind(sim),rawPick=typeof sim.pickExpansionCell==='function'?sim.pickExpansionCell.bind(sim):null;
 compactSpawns(sim);
 sim.freeSpawn=function(){const s=compactSpawns(this);const n=live(this).length+(this.kingdoms||[]).filter(k=>k?.founding).length;return s?.[n]||null;};
 if(rawPick)sim.pickExpansionCell=function(k,c,salt=0,target=null){const limited=(c||[]).filter(([x,y])=>Math.hypot(x-k.capital[0],y-k.capital[1])<=8.5);return rawPick(k,limited.length?limited:c,salt,target);};
 sim.join=async function(name){const before=live(this).length,k=await rawJoin(name);if(k?.alive&&!k.__kw3FortressV3Ready){await rebuild(this,k,Math.min(before,1));focus(this);}return k;};
 Promise.resolve().then(async()=>{for(const [i,k] of live(sim).entries())await rebuild(sim,k,Math.min(i,1));focus(sim);});
 sim.__kw3ArenaLayoutV2=VERSION;
 window.__KW3_ARENA_LAYOUT_V2=Object.freeze({installed:true,version:VERSION,map:'compact-two-side',outerWallRadius:4,innerWall:false,connectedWalls:true,clearCourtyard:true,dynamicOpponentFacingGate:true,reservedBuildCells:true,mirroredWallAxis:true});
 document.documentElement.dataset.kw3ArenaLayout=VERSION;
}
let tries=0;const timer=setInterval(()=>{tries++;const sim=window.__GOD_WORLD_SIM||window.__KINGDOM_WAR_SIM||window.__KW2_SIM||window.__SIM;if(sim?.join&&sim?.r){clearInterval(timer);install(sim);}else if(tries>300)clearInterval(timer);},50);
})();