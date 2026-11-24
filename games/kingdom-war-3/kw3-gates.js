(() => {
'use strict';
const R=4, DEF=new Set(['wall','wall_corner','gate','stone_tower','watchtower']);
const active=b=>b&&!b.__v66Destroyed&&Number(b.hp)>0;
const live=sim=>(sim.kingdoms||[]).filter(k=>k?.alive&&k.__kw3WallPlan);
const grid=(sim,x,y)=>{
 const dx=(x-sim.w.originX)/(sim.w.tileW/2),dy=(y-6-sim.w.originY)/(sim.w.tileH/2);
 return [(dx+dy)/2,(dy-dx)/2];
};
const world=(sim,x,y)=>{const p=sim.iso(x,y);return [p[0],p[1]+6];};
const radius=(k,c)=>Math.max(Math.abs(c[0]-k.capital[0]),Math.abs(c[1]-k.capital[1]));
const friendly=(sim,side,k)=>side===k.id||!!(sim.kingdoms?.[side]?.allies?.has?.(k.id)&&k.allies?.has?.(side));
function defenceAt(sim,x,y){
 const b=sim.buildingAt?.(x,y);
 if(active(b)&&DEF.has(b.type)&&sim.kingdoms?.[b.owner]?.__kw3WallPlan)return b;
 return null;
}
function request(sim,b,side){
 const k=sim.kingdoms?.[b.owner];if(!k||!friendly(sim,side,k))return false;
 b.__kw3GateHold=performance.now()+850;
 return true;
}
function cellBlocked(sim,side,x,y,open=true){
 const b=defenceAt(sim,x,y);if(!b)return false;
 if(b.type!=='gate')return true;
 if(!friendly(sim,side,sim.kingdoms[b.owner]))return true;
 if(open)request(sim,b,side);
 return false;
}
function obstacle(sim,side,x,y){
 const c=grid(sim,x,y).map(Math.round),b=defenceAt(sim,...c);
 return b&&cellBlocked(sim,side,...c)?b:null;
}
function canMove(sim,side,x,y,nx,ny){
 const count=Math.max(1,Math.ceil(Math.hypot(nx-x,ny-y)/4));
 const start=grid(sim,x,y).map(Math.round);
 for(let i=1;i<=count;i++){
  const c=grid(sim,x+(nx-x)*i/count,y+(ny-y)*i/count).map(Math.round);
  if(c[0]===start[0]&&c[1]===start[1])continue;
  if(cellBlocked(sim,side,...c))return false;
  // No diagonal corner cutting through two adjoining wall cells.
  if(c[0]!==start[0]&&c[1]!==start[1]&&cellBlocked(sim,side,c[0],start[1],false)&&cellBlocked(sim,side,start[0],c[1],false))return false;
 }
 return true;
}
function passages(sim,k,side){
 const result=[];
 for(const c of k.__kw3WallPlan||[]){
  if(Math.abs(c.dx)===R&&Math.abs(c.dy)===R)continue;
  const x=k.capital[0]+c.dx,y=k.capital[1]+c.dy,b=defenceAt(sim,x,y);
  if(!b||(b.type==='gate'&&friendly(sim,side,k))){
   const dx=Math.abs(c.dx)===R?Math.sign(c.dx):0,dy=Math.abs(c.dy)===R?Math.sign(c.dy):0;
   result.push({x,y,dx,dy,b});
  }
 }
 return result;
}
function route(sim,side,x,y,tx,ty){
 if(!Number.isFinite(tx)||!Number.isFinite(ty))return [tx,ty];
 const from=grid(sim,x,y),to=grid(sim,tx,ty);
 for(const k of live(sim)){
  const fr=radius(k,from),tr=radius(k,to);
  const leaving=fr<R+.45&&tr>R+.45;
  const entering=fr>R-.45&&tr<R-.45;
  if(!leaving&&!entering)continue;
  const options=passages(sim,k,side);
  if(!options.length)continue;
  options.sort((a,b)=>Math.hypot(a.x-from[0],a.y-from[1])+Math.hypot(a.x-to[0],a.y-to[1])-(Math.hypot(b.x-from[0],b.y-from[1])+Math.hypot(b.x-to[0],b.y-to[1])));
  const p=options[0],sign=leaving?1:-1;
  const [gx,gy]=world(sim,p.x,p.y);
  if(p.b&&Math.hypot(x-gx,y-gy)<45)request(sim,p.b,side);
  const along=(from[0]-p.x)*p.dx+(from[1]-p.y)*p.dy;
  const lateral=Math.abs((from[0]-p.x)*p.dy-(from[1]-p.y)*p.dx);
  if(lateral<.23&&Math.abs(along)<1.35)return world(sim,p.x+p.dx*sign*1.15,p.y+p.dy*sign*1.15);
  return world(sim,p.x-p.dx*sign*.8,p.y-p.dy*sign*.8);
 }
 return [tx,ty];
}
function step(sim,side,x,y,tx,ty,speed,dt,epsilon=2.5){
 const original=Math.hypot(tx-x,ty-y);
 const target=route(sim,side,x,y,tx,ty),dx=target[0]-x,dy=target[1]-y,d=Math.hypot(dx,dy);
 const amount=Math.min(d,Math.max(0,speed*dt));
 let nx=x,ny=y;
 if(d>.001){const a=x+dx/d*amount,b=y+dy/d*amount;if(canMove(sim,side,x,y,a,b)){nx=a;ny=b;}}
 return {x:nx,y:ny,dx:nx-x,dy:ny-y,arrived:original<=epsilon||Math.hypot(tx-nx,ty-ny)<=epsilon};
}
function frame(b){return Math.max(0,Math.min(4,Math.round((b.__kw3GateOpen||0)*4)));}
function update(sim,dt){
 const now=performance.now(),elapsed=Math.max(0,Math.min(.1,Number(dt)||.016));
 for(const k of live(sim)){
  const gates=k.buildings.filter(b=>active(b)&&b.type==='gate');
  for(const b of gates){
   for(const f of k.farmers||[]){
    if(f.__kw2WarHidden)continue;
    if((f.path||[]).slice(0,2).some(c=>c[0]===b.x&&c[1]===b.y)||Math.hypot(f.x-b.sx,f.y-b.sy)<14)request(sim,b,k.id);
   }
   const want=(b.__kw3GateHold||0)>now?1:0;
   const old=frame(b);
   const value=b.__kw3GateOpen||0;
   b.__kw3GateOpen=want?Math.min(1,value+elapsed*5):Math.max(0,value-elapsed*3);
   if(frame(b)!==old||b.__kw3GateVisualFrame!==frame(b)){
    window.__KW3_CLOSED_FORTRESS?.style?.(sim,b,k.__kw3WallPlan.find(c=>c.dx===b.x-k.capital[0]&&c.dy===b.y-k.capital[1]));
    b.__kw3GateVisualFrame=frame(b);
   }
  }
 }
}
function install(sim){
 if(sim.__kw3GatesInstalled)return;
 sim.__kw3GatesInstalled=true;
 const originalWalk=sim.isNpcWalkableCell.bind(sim);
 sim.isNpcWalkableCell=function(k,x,y){
  const b=defenceAt(this,x,y);
  if(b?.type==='gate'&&friendly(this,k.id,this.kingdoms[b.owner]))return this.isWalkableCell(x,y)&&this.getOwner(x,y)===k.id&&!this.vegetationBlocksCell(x,y);
  return originalWalk(k,x,y);
 };
 const originalUpdate=sim.update.bind(sim);
 sim.update=function(dt,...args){update(this,dt);return originalUpdate(dt,...args);};
 document.documentElement.dataset.kw3Gates='two-functional-gates';
}
window.__KW3_GATES={install,frame,request,cellBlocked,obstacle,canMove,route,step,update,grid};
})();
