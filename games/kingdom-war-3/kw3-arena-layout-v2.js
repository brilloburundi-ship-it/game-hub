(() => {
'use strict';
const VERSION='20261124-kw3-two-gates-1', R=4;
const key=(x,y)=>`${x},${y}`;
const DEF=new Set(['wall','wall_corner','gate','stone_tower','watchtower']);
const live=sim=>(sim.kingdoms||[]).filter(k=>k?.alive&&!k.founding);
const active=b=>b&&!b.__v66Destroyed&&Number(b.hp)>0;
const occupied=sim=>(sim.kingdoms||[]).filter(k=>k?.alive||k?.founding);
function plan(gx,gy){
 const cells=[];
 for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
  if(Math.max(Math.abs(dx),Math.abs(dy))!==R)continue;
  const corner=Math.abs(dx)===R&&Math.abs(dy)===R;
  cells.push({dx,dy,type:corner?'stone_tower':((dx===gx&&dy===gy)||(dx===-gx&&dy===-gy))?'gate':'wall',axis:Math.abs(dy)===R?'x':'y'});
 }
 return cells;
}
function siteOK(sim,x,y,k=null){
 if(sim.biome(x,y)!=='grass'||!sim.isBuildableCell(x,y,'castle'))return false;
 for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
  const a=x+dx,b=y+dy,o=sim.getOwner(a,b);
  if(!sim.inBounds(a,b)||!sim.isWalkableCell(a,b)||!sim.isBuildableCell(a,b,'house_a')||(o!==-1&&o!==k?.id))return false;
 }
 return true;
}
function compatible(a,b){return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))>=11;}
function candidates(sim){
 const out=[];
 for(let y=R+2;y<sim.w.gridH-R-2;y++)for(let x=R+2;x<sim.w.gridW-R-2;x++){
  if(!siteOK(sim,x,y))continue;
  const [sx,sy]=sim.iso(x,y);out.push({x,y,sx,sy});
 }
 return out;
}
function slots(sim){
 const current=occupied(sim);
 const old=sim.__kw3CompactSpawnsV4;
 if(old&&old.every(([x,y])=>{
  const k=current.find(k=>k.capital?.[0]===x&&k.capital?.[1]===y);
  return !!k||siteOK(sim,x,y);
 })&&current.every(k=>old.some(([x,y])=>x===k.capital[0]&&y===k.capital[1])))return old;
 const pts=candidates(sim);if(!pts.length)return null;
 const cx=pts.reduce((s,p)=>s+p.sx,0)/pts.length,cy=pts.reduce((s,p)=>s+p.sy,0)/pts.length;
 const score=(a,b)=>Math.abs(a.sx-b.sx-350)+Math.abs(a.sy-b.sy)*.72+Math.abs((a.sy+b.sy)/2-cy)*.25;
 let pair=null,best=Infinity;
 if(current.length===1){
  const [x,y]=current[0].capital,[sx,sy]=sim.iso(x,y),a={x,y,sx,sy};
  for(const b of pts){if(!compatible(a,b))continue;const val=score(b.sx>a.sx?b:a,b.sx>a.sx?a:b);if(val<best){best=val;pair=[a,b];}}
 }else if(!current.length){
  for(const a of pts)for(const b of pts){
   if(b.sx<=a.sx||!compatible(a,b))continue;
   const val=score(b,a)+Math.abs((a.sx+b.sx)/2-cx)*.35;
   if(val<best){best=val;pair=[a,b];}
  }
 }else return current.map(k=>k.capital);
 if(!pair)return null;
 return sim.__kw3CompactSpawnsV4=pair.map(p=>[p.x,p.y]);
}
function freeSpawn(sim){
 const s=slots(sim)||[];
 return s.find(([x,y])=>!occupied(sim).some(k=>k.capital[0]===x&&k.capital[1]===y)&&siteOK(sim,x,y))||null;
}
function gateFor(sim,k){
 const other=(slots(sim)||[]).find(([x,y])=>x!==k.capital[0]||y!==k.capital[1]);
 if(!other)return [R,0];
 const [cx,cy]=sim.iso(...k.capital),[ox,oy]=sim.iso(...other);
 let best=[R,0],dot=-Infinity;
 for(const side of [[R,0],[-R,0],[0,R],[0,-R]]){
  const [sx,sy]=sim.iso(k.capital[0]+side[0],k.capital[1]+side[1]);
  const d=(sx-cx)*(ox-cx)+(sy-cy)*(oy-cy);
  if(d>dot){dot=d;best=side;}
 }
 return best;
}
function discard(sim,k,b){
 if(b.type==='farm')sim.releaseFarmWorker?.(k,b.id);
 if(typeof sim.discardBuilding==='function')sim.discardBuilding(k,b);
 else {sim.r.destroyBuilding?.(b);k.buildings=k.buildings.filter(v=>v!==b);}
}
function claim(sim,k){
 const [cx,cy]=k.capital;
 for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
  const x=cx+dx,y=cy+dy,o=sim.getOwner(x,y);
  if(sim.land(x,y)&&(o===-1||o===k.id)){sim.setOwner(x,y,k.id);k.territory.add(key(x,y));}
 }
}
function economySlots(gx,gy){
 return [[-2,-1],[-1,-2],[1,-2],[2,-1],[-2,1],[-1,2],[1,2],[2,1]]
  .sort((a,b)=>(a[0]*gx+a[1]*gy)-(b[0]*gx+b[1]*gy)).slice(0,4);
}
// Match the world grid exactly. One reusable pixel texture per axis and type;
// walls overlap their neighbours by a small amount, not by arbitrary sprite width.
const textures=new Map();
function wallTexture(sim,type,axis,frame=0){
 const r=sim.r,P=r.P||window.PIXI,base=r.buildTex?.[type];
 if(!P?.Texture||!base||typeof document.createElement!=='function')return null;
 const scale=r.buildingScale(type,base);
 if(!Number.isFinite(scale)||scale<=0)return null;
 const tw=sim.w.tileW/2,th=sim.w.tileH/2,sign=axis==='x'?1:-1;
 const vx=sign*tw,vy=th, H=type==='gate'?38:28,T=5;
 const cacheKey=[type,axis,tw,th,scale,frame].join('/');
 if(textures.has(cacheKey))return textures.get(cacheKey);
 const c=document.createElement('canvas'),w=Math.ceil((Math.abs(vx)*1.26+T*2+6)/scale),h=Math.ceil((H+Math.abs(vy)*1.26+T*2+10)/scale);
 c.width=w;c.height=h;const ctx=c.getContext('2d');if(!ctx)return null;
 const pivot=h-(Math.abs(vy)*.63+T+4)/scale;
 ctx.translate(w/2,pivot);ctx.scale(1/scale,1/scale);ctx.imageSmoothingEnabled=false;
 function pt(t,z=0,side=0){return [vx*t+side*T,vy*t-z-side*2.5*sign];}
 function poly(points,fill,stroke='#3b3939'){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.65;ctx.stroke();}}
 const a=-.63,b=.63,s=sign;
 const face=(lo,hi,z0,z1)=>[pt(lo,z0,s),pt(hi,z0,s),pt(hi,z1,s),pt(lo,z1,s)];
 poly([pt(a),pt(b),pt(b,H),pt(a,H)],'#696b70');
 poly([pt(a,0,s),pt(b,0,s),pt(b,H,s),pt(a,H,s)],'#9d9b91');
 poly([pt(a,H,-s),pt(b,H,-s),pt(b,H,s),pt(a,H,s)],'#c4c1b0');
 for(let row=0;row<H-3;row+=6){
  const z=row+4;
  poly(face(a,b,z,z+.35),'#615e59',null);
  for(let i=0;i<4;i++){const t=a+.1+i*.31+(row%12===0?0:.12);if(t<b-.05)poly(face(t,t+.018,row,z),'#68655e',null);}
 }
 for(let i=0;i<3;i++){
  const lo=a+i*.42,hi=lo+.23;
  poly(face(lo,hi,H,H+5),'#b7b4a7');
  poly([pt(lo,H+5,-s),pt(hi,H+5,-s),pt(hi,H+5,s),pt(lo,H+5,s)],'#ddd8c5');
 }
 if(type==='gate'){
  // Cut an actual transparent passage through the stone, then animate a raised wooden portcullis.
  ctx.save();ctx.globalCompositeOperation='destination-out';
  poly([pt(-.33,-3,-s),pt(.33,-3,-s),pt(.33,25,-s),pt(-.33,25,-s)],'#000',null);
  poly(face(-.33,.33,-3,25),'#000',null);
  poly([pt(-.33,-3,-s),pt(.33,-3,-s),pt(.33,-3,s),pt(-.33,-3,s)],'#000',null);
  poly([pt(-.33,25,-s),pt(.33,25,-s),pt(.33,25,s),pt(-.33,25,s)],'#000',null);
  ctx.restore();
  // The lowered door occupies the aperture; opening raises it behind the lintel.
  const lift=frame*5.75;
  if(lift<23){
   poly(face(-.31,.31,lift,23),'#684934');
   for(let i=-2;i<=2;i++)poly(face(i*.11,i*.11+.025,lift,23),'#30241d',null);
   for(const z of [6,14])if(z+lift<22)poly(face(-.29,.29,z+lift,Math.min(23,z+lift+2)),'#a49174');
  }
  poly(face(-.38,.38,24,28),'#bbb9ab');
 }
 const texture=P.Texture.from(c);try{texture.source.scaleMode='nearest';}catch{}
 const result={texture,anchorY:pivot/h,scale};textures.set(cacheKey,result);return result;
}
function style(sim,b,cell){
 if(!b||!cell||!active(b)||!['wall','gate'].includes(b.type))return;
 const sp=b._sprite;if(!sp||sp.destroyed)return;
 const t=wallTexture(sim,b.type,cell.axis,b.type==='gate'?(window.__KW3_GATES?.frame(b)||0):0);if(!t)return;
 if(sp.texture!==t.texture){sp.texture=t.texture;sp.anchor.set(.5,t.anchorY);}
 // Native construction can animate scale. Restore the correct sign without
 // interfering with the current growth factor; the texture encodes direction.
 if(sp.scale.x<0)sp.scale.x=Math.abs(sp.scale.x);
 b.__kw3WallAxis=cell.axis;
}
function validate(k){
 const expected=k.__kw3WallPlan;
 return !!expected&&expected.length===32&&expected.every(c=>(k.buildings||[]).some(b=>active(b)&&b.x===k.capital[0]+c.dx&&b.y===k.capital[1]+c.dy&&b.type===c.type));
}
async function put(sim,k,type,dx,dy,cell=null){
 const x=k.capital[0]+dx,y=k.capital[1]+dy;
 if(!sim.isWalkableCell(x,y)||sim.getOwner(x,y)!==k.id)return null;
 const old=(k.buildings||[]).find(b=>active(b)&&b.x===x&&b.y===y);
 if(old){if(old.type!==type)return null;style(sim,old,cell);return old;}
 const b=await sim.addBuilding(k,type,x,y,true,true);
 if(b)style(sim,b,cell);
 return b;
}
async function rebuild(sim,k,slot){
 if(!k?.alive)return false;
 if(k.__kw3FortressV3Ready)return true;
 if(k.__kw3FortressBuild)return k.__kw3FortressBuild;
 const work=async()=>{
  const [gx,gy]=k.__kw3GateCell||gateFor(sim,k);
  k.__kw3GateCell=[gx,gy];k.__kw3GateDir=[Math.sign(gx),Math.sign(gy)];
  k.__kw3FortressRadius=R;
  k.__kw3WallPlan=plan(gx,gy);
  k.__kw3ReservedCells=new Set();
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)k.__kw3ReservedCells.add(key(dx,dy));
  for(let step=1;step<R;step++){k.__kw3ReservedCells.add(key(k.__kw3GateDir[0]*step,k.__kw3GateDir[1]*step));k.__kw3ReservedCells.add(key(-k.__kw3GateDir[0]*step,-k.__kw3GateDir[1]*step));}
  claim(sim,k);k.__kw3ArenaV2Ready=true;
  const expected=new Map(k.__kw3WallPlan.map(c=>[key(c.dx,c.dy),c.type]));
  for(const b of [...k.buildings]){
   if(!active(b)||b.type==='castle'||b.type==='port')continue;
   const dx=b.x-k.capital[0],dy=b.y-k.capital[1],wanted=expected.get(key(dx,dy));
   if((DEF.has(b.type)&&wanted!==b.type)||(!DEF.has(b.type)&&(wanted||k.__kw3ReservedCells.has(key(dx,dy))||Math.max(Math.abs(dx),Math.abs(dy))>R-1)))discard(sim,k,b);
  }
  sim.__v800Performance?.rebuildBuildingIndex?.();
  for(const c of k.__kw3WallPlan){
   try{await put(sim,k,c.type,c.dx,c.dy,c);}catch(e){console.warn('[KW3 fortress cell]',c,e);}
  }
  if(!validate(k)){console.warn('[KW3 fortress] incomplete perimeter',k.name);return false;}
  const types=['barracks','farm','house_a','market'],positions=economySlots(...k.__kw3GateDir);
  for(let i=0;i<types.length;i++)try{await put(sim,k,types[i],...positions[i]);}catch(e){console.warn('[KW3 courtyard]',e);}
  k.__kw3FortressV3Ready=true;k.__kw3FortressReady=true;
  sim.__v800Performance?.rebuildBuildingIndex?.();sim.r.redrawTerritories?.(sim,true);sim.r.redrawSettlementGround?.(sim);
  return true;
 };
 k.__kw3FortressBuild=work();
 try{return await k.__kw3FortressBuild;}finally{delete k.__kw3FortressBuild;}
}
function focus(sim){
 const ks=live(sim);if(ks.length<2)return;
 const mx=Math.round((ks[0].capital[0]+ks[1].capital[0])/2),my=Math.round((ks[0].capital[1]+ks[1].capital[1])/2);
 sim.r.focusCell?.(mx,my);const root=sim.r.root;if(root?.scale?.set)root.scale.set(Math.max(.56,Math.min(.72,Number(root.scale.x||.66))));
}
function install(sim){
 if(sim.__kw3ArenaLayoutV2===VERSION)return;
 const rawAdd=sim.addBuilding.bind(sim),rawTick=sim.tick.bind(sim);
 sim.freeSpawn=function(){return freeSpawn(this);};
 sim.addBuilding=async function(k,type,x,y,...rest){
  if(k?.__kw3WallPlan){
   const dx=x-k.capital[0],dy=y-k.capital[1],c=k.__kw3WallPlan.find(v=>v.dx===dx&&v.dy===dy);
   if(DEF.has(type)&&c?.type!==type)return null;
   if(c&&c.type!==type)return null;
   if(c&&(k.buildings||[]).some(b=>active(b)&&b.x===x&&b.y===y))return null;
  }
  const b=await rawAdd(k,type,x,y,...rest);
  if(b&&k?.__kw3WallPlan){const c=k.__kw3WallPlan.find(v=>v.dx===x-k.capital[0]&&v.dy===y-k.capital[1]);style(this,b,c);}
  return b;
 };
 sim.tick=async function(...args){
  const result=await rawTick(...args);
  for(const k of live(this)){
   if(!k.__kw3FortressV3Ready)await rebuild(this,k,0);
   if(!k.__kw3WallPlan)continue;
   const expected=new Map(k.__kw3WallPlan.map(c=>[key(c.dx,c.dy),c]));
   for(const b of k.buildings)style(this,b,expected.get(key(b.x-k.capital[0],b.y-k.capital[1])));
  }
  return result;
 };
 window.__KW3_GATES?.install(sim);
 sim.__kw3ArenaLayoutV2=VERSION;
 window.__KW3_ARENA_LAYOUT_V2=Object.freeze({installed:true,version:VERSION,map:'compact-two-side',outerWallRadius:R,innerWall:false,connectedWalls:true,clearCourtyard:true,dynamicOpponentFacingGate:true,reservedBuildCells:true,mirroredWallAxis:true});
 document.documentElement.dataset.kw3ArenaLayout=VERSION;
 Promise.resolve().then(async()=>{for(const [i,k] of live(sim).entries())await rebuild(sim,k,i);focus(sim);}).catch(e=>console.error('[KW3 fortress]',e));
}
window.__KW3_CLOSED_FORTRESS={freeSpawn,rebuild,validate,install,style};
let tries=0;const timer=setInterval(()=>{tries++;const sim=window.__SIM;if(sim?.join&&sim?.r&&window.__KW3_SURVIVOR?.installed){clearInterval(timer);install(sim);}else if(tries>2400)clearInterval(timer);},50);
})();
