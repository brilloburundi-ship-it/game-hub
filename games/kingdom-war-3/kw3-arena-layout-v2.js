(() => {
'use strict';
const VERSION='20260814-kw3-arena-layout-v2';
const key=(x,y)=>`${x},${y}`;
if(window.__KW3_ARENA_LAYOUT_V2?.installed)return;
function live(sim){return (sim.kingdoms||[]).filter(k=>k?.alive&&!k.founding);}
function candidates(sim){
 const out=[];
 for(let y=5;y<sim.w.gridH-5;y++)for(let x=5;x<sim.w.gridW-5;x++){
  if(sim.getOwner(x,y)!==-1||sim.biome(x,y)!=='grass'||!sim.isBuildableCell(x,y,'castle'))continue;
  if((sim.spawnRoom?.(x,y)||0)<7)continue;
  const [sx,sy]=sim.iso(x,y);out.push({x,y,sx,sy});
 }
 return out;
}
function compactSpawns(sim){
 if(sim.__kw3CompactSpawns)return sim.__kw3CompactSpawns;
 const pts=candidates(sim); if(pts.length<2)return null;
 const cx=pts.reduce((s,p)=>s+p.sx,0)/pts.length, cy=pts.reduce((s,p)=>s+p.sy,0)/pts.length;
 const left=pts.filter(p=>p.sx<cx).sort((a,b)=>(Math.abs(a.sx-(cx-150))+Math.abs(a.sy-cy)*.7)-(Math.abs(b.sx-(cx-150))+Math.abs(b.sy-cy)*.7));
 let a=left[0]||pts[0];
 const right=pts.filter(p=>p.sx>cx&&Math.hypot(p.x-a.x,p.y-a.y)>=7&&Math.hypot(p.x-a.x,p.y-a.y)<=16)
  .sort((p,q)=>(Math.abs(p.sx-(cx+150))+Math.abs(p.sy-cy)*.7)-(Math.abs(q.sx-(cx+150))+Math.abs(q.sy-cy)*.7));
 let b=right[0]||pts.filter(p=>p!==a).sort((p,q)=>Math.abs(Math.hypot(p.x-a.x,p.y-a.y)-11)-Math.abs(Math.hypot(q.x-a.x,q.y-a.y)-11))[0];
 return sim.__kw3CompactSpawns=[[a.x,a.y],[b.x,b.y]];
}
function clearOldFortress(sim,k){
 const structural=new Set(['wall','wall_corner','gate','stone_tower','watchtower','barracks','farm','house_a','market']);
 for(const b of k.buildings||[])if(structural.has(b.type)&&b.type!=='castle'){
  b.__v66Destroyed=true;b.hp=0;
  if(b.sprite){b.sprite.visible=false;b.sprite.renderable=false;}
 }
}
async function put(sim,k,type,dx,dy){
 const x=k.capital[0]+dx,y=k.capital[1]+dy;
 if(!sim.inBounds(x,y)||!sim.land(x,y))return null;
 const old=sim.buildingAt?.(x,y);if(old&&!old.__v66Destroyed)return old;
 try{return await sim.addBuilding(k,type,x,y,true,true);}catch{return null;}
}
function claim(sim,k,r=4){
 const [cx,cy]=k.capital;
 for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  if(Math.max(Math.abs(dx),Math.abs(dy))>r)continue;
  const x=cx+dx,y=cy+dy;if(!sim.land(x,y))continue;
  const o=sim.getOwner(x,y);if(o!==-1&&o!==k.id)continue;
  sim.setOwner(x,y,k.id);k.territory.add(key(x,y));
 }
}
async function rebuild(sim,k,slot){
 if(!k?.alive||k.__kw3ArenaV2Ready)return;k.__kw3ArenaV2Ready=true;
 clearOldFortress(sim,k);claim(sim,k,4);
 // A real connected perimeter: 7x7 enclosure, corner towers replace corner wall tiles.
 const R=3, gateX=slot===0?3:-3, gateY=0;
 for(let x=-R+1;x<=R-1;x++){await put(sim,k,'wall',x,-R);await put(sim,k,'wall',x,R);}
 for(let y=-R+1;y<=R-1;y++){
  if(!(-R===gateX&&y===gateY))await put(sim,k,'wall',-R,y);
  if(!( R===gateX&&y===gateY))await put(sim,k,'wall', R,y);
 }
 for(const [dx,dy] of [[-R,-R],[R,-R],[-R,R],[R,R]])await put(sim,k,'stone_tower',dx,dy);
 await put(sim,k,'gate',gateX,gateY);
 // Inner defensive layer around the keep, leaving streets/courtyard free.
 for(const [dx,dy] of [[-1,-2],[0,-2],[1,-2],[-1,2],[0,2],[1,2],[-2,-1],[-2,0],[-2,1],[2,-1],[2,0],[2,1]])await put(sim,k,'wall',dx,dy);
 for(const [dx,dy] of [[-2,-2],[2,-2],[-2,2],[2,2]])await put(sim,k,'watchtower',dx,dy);
 // Economy sits inside the outer perimeter but outside the keep ring.
 await put(sim,k,'barracks',slot===0?-1:1,-1);
 await put(sim,k,'farm',slot===0?-1:1,1);
 await put(sim,k,'house_a',slot===0?1:-1,-1);
 await put(sim,k,'market',slot===0?1:-1,1);
 sim.__v800Performance?.rebuildBuildingIndex?.();sim.r.redrawTerritories?.(sim,true);sim.r.redrawSettlementGround?.(sim);
}
function focus(sim){
 const ks=live(sim);if(ks.length<2)return;
 const mx=Math.round((ks[0].capital[0]+ks[1].capital[0])/2),my=Math.round((ks[0].capital[1]+ks[1].capital[1])/2);
 sim.r.focusCell?.(mx,my);
 const root=sim.r.root;if(root?.scale?.set)root.scale.set(Math.max(.58,Math.min(.76,Number(root.scale.x||.68))));
}
function install(sim){
 if(sim.__kw3ArenaLayoutV2===VERSION)return;
 const rawJoin=sim.join.bind(sim),rawPick=typeof sim.pickExpansionCell==='function'?sim.pickExpansionCell.bind(sim):null;
 compactSpawns(sim);
 sim.freeSpawn=function(){const s=compactSpawns(this);const n=live(this).length+(this.kingdoms||[]).filter(k=>k?.founding).length;return s?.[n]||null;};
 if(rawPick)sim.pickExpansionCell=function(k,c,salt=0,target=null){const limited=(c||[]).filter(([x,y])=>Math.hypot(x-k.capital[0],y-k.capital[1])<=7.5);return rawPick(k,limited.length?limited:c,salt,target);};
 sim.join=async function(name){const before=live(this).length,k=await rawJoin(name);if(k?.alive&&!k.__kw3ArenaV2Ready){await rebuild(this,k,Math.min(before,1));focus(this);}return k;};
 // Existing kingdoms in a hot reload are rebuilt too.
 Promise.resolve().then(async()=>{for(const [i,k] of live(sim).entries())await rebuild(sim,k,Math.min(i,1));focus(sim);});
 sim.__kw3ArenaLayoutV2=VERSION;
 window.__KW3_ARENA_LAYOUT_V2=Object.freeze({installed:true,version:VERSION,map:'compact-two-side',outerWallRadius:3,innerWall:true,connectedWalls:true});
 document.documentElement.dataset.kw3ArenaLayout=VERSION;
}
let tries=0;const timer=setInterval(()=>{tries++;const sim=window.__GOD_WORLD_SIM||window.__KINGDOM_WAR_SIM||window.__KW2_SIM;if(sim?.join&&sim?.r){clearInterval(timer);install(sim);}else if(tries>300)clearInterval(timer);},50);
})();