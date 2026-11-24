(() => {
'use strict';
const DEF=new Set(['wall','wall_corner','gate','stone_tower','watchtower']);
const alive=b=>b&&!b.__v66Destroyed&&b.hp>0;
const key=(x,y)=>x+','+y;
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
const textures=new Map();
function kingdomColor(k){
 if(Number.isFinite(k?.color))return (k.color>>>0)&0xffffff;
 if(/^#[0-9a-f]{6}$/i.test(k?.css||''))return parseInt(k.css.slice(1),16);
 return 0x8b8273;
}
function mixColor(color,target,amount){
 const channels=[16,8,0].map(shift=>Math.round(((color>>shift)&255)*(1-amount)+((target>>shift)&255)*amount));
 return '#'+channels.map(v=>v.toString(16).padStart(2,'0')).join('');
}
function heraldry(color){
 return {main:mixColor(color,0x75685a,.14),dark:mixColor(color,0x171b22,.44),light:mixColor(color,0xfff0cc,.32),gold:'#d9bd79',edge:'#504438'};
}
function wallTexture(sim,type,axis,frame=0,color=0x8b8273,decor=false){
 const r=sim.r,P=r.P||window.PIXI,base=r.buildTex?.[type];
 if(!P?.Texture||!base||typeof document.createElement!=='function')return null;
 const scale=r.buildingScale(type,base);
 if(!Number.isFinite(scale)||scale<=0)return null;
 const tw=sim.w.tileW/2,th=sim.w.tileH/2,sign=axis==='x'?1:-1;
 const vx=sign*tw,vy=th, H=type==='gate'?38:28,T=5;
 const cacheKey=[type,axis,tw,th,scale,frame,color,decor?1:0].join('/');
 if(textures.has(cacheKey))return textures.get(cacheKey);
 const c=document.createElement('canvas'),w=Math.ceil((Math.abs(vx)*1.26+T*2+6)/scale),h=Math.ceil((H+Math.abs(vy)*1.26+T*2+10)/scale);
 c.width=w;c.height=h;const ctx=c.getContext('2d');if(!ctx)return null;
 const pivot=h-(Math.abs(vy)*.63+T+4)/scale;
 ctx.translate(w/2,pivot);ctx.scale(1/scale,1/scale);ctx.imageSmoothingEnabled=false;
 function pt(t,z=0,side=0){return [vx*t+side*T,vy*t-z-side*2.5*sign];}
 function poly(points,fill,stroke='#3b3939'){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.65;ctx.stroke();}}
 const a=-.63,b=.63,s=sign,p=heraldry(color);
 const face=(lo,hi,z0,z1)=>[pt(lo,z0,s),pt(hi,z0,s),pt(hi,z1,s),pt(lo,z1,s)];
 poly([pt(a),pt(b),pt(b,H),pt(a,H)],'#696b70');
 poly([pt(a,0,s),pt(b,0,s),pt(b,H,s),pt(a,H,s)],'#9d9b91');
 poly([pt(a,H,-s),pt(b,H,-s),pt(b,H,s),pt(a,H,s)],'#c4c1b0');
 for(let row=0;row<H-3;row+=6){
  const z=row+4;
  poly(face(a,b,z,z+.35),'#615e59',null);
  for(let i=0;i<4;i++){const t=a+.1+i*.31+(row%12===0?0:.12);if(t<b-.05)poly(face(t,t+.018,row,z),'#68655e',null);}
 }
 // Continuous painted fascia under the stone battlements, following the real wall axis.
 for(const side of [-s,s]){
  poly([pt(a,H-8,side),pt(b,H-8,side),pt(b,H-4,side),pt(a,H-4,side)],side===s?p.main:p.dark);
  poly([pt(a,H-4,side),pt(b,H-4,side),pt(b,H-3,side),pt(a,H-3,side)],p.light,null);
 }
 for(let i=0;i<3;i++){
  const lo=a+i*.42,hi=lo+.23;
  poly(face(lo,hi,H,H+5),'#b7b4a7');
  poly([pt(lo,H+5,-s),pt(hi,H+5,-s),pt(hi,H+5,s),pt(lo,H+5,s)],'#ddd8c5');
  // Small coloured enamel panels on the front of each merlon; stone tops stay natural.
  poly(face(lo+.025,hi-.025,H+1,H+3.5),p.main,p.dark);
 }
 function shield(t,z,size){
  poly([pt(t-size,z+5,s),pt(t+size,z+5,s),pt(t+size,z-1,s),pt(t,z-5,s),pt(t-size,z-1,s)],p.gold,p.edge);
  poly([pt(t-size*.73,z+3.6,s),pt(t+size*.73,z+3.6,s),pt(t+size*.73,z-.6,s),pt(t,z-3.5,s),pt(t-size*.73,z-.6,s)],p.main,p.dark);
  poly(face(t-.018,t+.018,z-1.5,z+2.6),p.light,null);
  poly(face(t-size*.42,t+size*.42,z+.1,z+1),p.light,null);
 }
 if(type==='wall'&&decor){
  // A hanging cloth pennant with a swallow-tail and small shield, not a full wall recolour.
  poly([pt(-.15,H-8,s),pt(.15,H-8,s),pt(.15,7,s),pt(0,10,s),pt(-.15,7,s)],p.main,p.dark);
  poly(face(-.18,.18,H-9,H-7),p.gold,p.edge);
  poly(face(-.13,-.1,11,H-10),p.light,null);
  shield(0,15,.105);
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
  // The crest sits on the lintel and never fills the transparent doorway.
  poly(face(-.36,.36,30,34),p.main,p.dark);
  shield(0,33,.16);
 }
 const texture=P.Texture.from(c);try{texture.source.scaleMode='nearest';}catch{}
 const result={texture,anchorY:pivot/h,scale};textures.set(cacheKey,result);return result;
}

function style(sim,k,b,c){
 if(!alive(b)||!c||!['wall','gate'].includes(b.type)||!b._sprite||b._sprite.destroyed)return;
 const frame=b.type==='gate'?Math.round((b.__kw2GateOpen||0)*4):0;
 const t=wallTexture(sim,b.type,c.axis,frame,kingdomColor(k),((c.dx+c.dy)%3)===0);
 if(t&&b._sprite.texture!==t.texture){b._sprite.texture=t.texture;b._sprite.anchor.set(.5,t.anchorY);}
 if(b._sprite.scale.x<0)b._sprite.scale.x=-b._sprite.scale.x;
}
function makePlan(x,y,r,axis){
 const cells=[];
 for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
  const corner=Math.abs(dx)===r&&Math.abs(dy)===r;
  const gate=axis==='x'?Math.abs(dx)===r&&dy===0:Math.abs(dy)===r&&dx===0;
  cells.push({x:x+dx,y:y+dy,dx,dy,type:corner?'stone_tower':gate?'gate':'wall',axis:Math.abs(dy)===r?'x':'y'});
 }
 return {x,y,r,axis,cells};
}
function reservedBy(sim,x,y,except){
 for(const p of sim.__kw2FortSlots||[]){
  if(p.assigned!=null)continue;
  if(Math.max(Math.abs(x-p.x),Math.abs(y-p.y))<=p.r)return true;
 }
 for(const k of sim.kingdoms||[]){
  if(!(k.alive||k.founding)||k.id===except||!k.__kw2Fort)continue;
  const p=k.__kw2Fort;
  if(Math.max(Math.abs(x-p.x),Math.abs(y-p.y))<=p.r)return true;
 }
 return false;
}
function candidate(sim,x,y,r){
 if(sim.biome(x,y)!=='grass'||!sim.isBuildableCell(x,y,'castle'))return null;
 for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  if(!sim.isBuildableCell(x+dx,y+dy,'house_a')||sim.getOwner(x+dx,y+dy)!==-1||reservedBy(sim,x+dx,y+dy))return null;
 }
 const usable=axis=>{const a=axis==='x'?[1,0]:[0,1];return [-1,1].every(sign=>sim.isWalkableCell(x+sign*a[0]*(r+1),y+sign*a[1]*(r+1)));};
 return usable('x')?makePlan(x,y,r,'x'):usable('y')?makePlan(x,y,r,'y'):null;
}
function reserveSites(sim){
 if(sim.__kw2FortSlots)return sim.__kw2FortSlots;
 const small=[],large=[];
 for(let y=4;y<sim.w.gridH-4;y++)for(let x=4;x<sim.w.gridW-4;x++){
  const p=candidate(sim,x,y,2);if(p)small.push(p);
  const q=candidate(sim,x,y,3);if(q)large.push(q);
 }
 const compatible=(p,q)=>Math.max(Math.abs(p.x-q.x),Math.abs(p.y-q.y))>=p.r+q.r+2;
 function fill(chosen,pool,count){
  while(chosen.length<count){
   let next=null,score=-Infinity;
   for(const p of pool){
    if(!chosen.every(q=>compatible(p,q)))continue;
    const d=Math.min(...chosen.map(q=>Math.max(Math.abs(p.x-q.x),Math.abs(p.y-q.y))));
    if(d>score){next=p;score=d;}
   }
   if(!next)break;chosen.push(next);
  }
  return chosen;
 }
 let best=[];
 // Prefer three roomy castles, but never sacrifice capacity for twelve kingdoms.
 for(let i=0;i<Math.min(24,large.length);i++){
  const seed=large[Math.floor(i*large.length/Math.min(24,large.length))];
  const chosen=fill(fill([seed],large,3),small,12);
  if(chosen.length>best.length)best=chosen;
  if(best.length===12)break;
 }
 if(best.length<12)for(let i=0;i<Math.min(16,small.length);i++){
  const chosen=fill([small[Math.floor(i*small.length/Math.min(16,small.length))]],small,12);
  if(chosen.length>best.length)best=chosen;
  if(best.length===12)break;
 }
 sim.__kw2FortSlots=best;return best;
}
function chooseSpawn(sim){
 const slots=reserveSites(sim),occupied=(sim.kingdoms||[]).filter(k=>k.alive||k.founding);
 let best=null,score=-Infinity;
 for(const p of slots){
  if(p.assigned!=null)continue;
  let valid=true;
  for(let dy=-p.r;dy<=p.r;dy++)for(let dx=-p.r;dx<=p.r;dx++)if(sim.getOwner(p.x+dx,p.y+dy)!==-1)valid=false;
  if(!valid)continue;
  let d=99;for(const k of occupied)d=Math.min(d,Math.max(Math.abs(p.x-k.capital[0]),Math.abs(p.y-k.capital[1])));
  const value=Math.min(d,35)+p.r*.5;
  if(value>score){score=value;best=p;}
 }
 sim.__kw2PendingFort=best;
 return best?[best.x,best.y]:null;
}
function isReserved(k,x,y){
 const p=k?.__kw2Fort;if(!p)return false;
 const dx=x-p.x,dy=y-p.y;
 if(Math.max(Math.abs(dx),Math.abs(dy))===p.r)return true;
 // Reserve the gate approach and the keep footprint, not the rest of the town.
 return Math.max(Math.abs(dx),Math.abs(dy))<p.r&&
 (p.axis==='x'?dy===0:dx===0);
}
function wallAt(k,x,y){return k.__kw2Fort?.cells.find(c=>c.x===x&&c.y===y);}
function atWar(sim,k){return (sim.wars||[]).some(w=>!w.done&&(w.a===k.id||w.b===k.id));}
function frontier(sim,k){
 const p=k.__kw2Fort;if(!p)return null;
 let best=null,d=Infinity;
 for(let dy=-p.r;dy<=p.r;dy++)for(let dx=-p.r;dx<=p.r;dx++){
  const x=p.x+dx,y=p.y+dy;
  if(sim.getOwner(x,y)!==-1||!sim.neigh(x,y).some(([a,b])=>sim.getOwner(a,b)===k.id))continue;
  const score=Math.abs(dx)+Math.abs(dy);if(score<d){best=[x,y];d=score;}
 }
 return best;
}
const costs={wall:{wood:8,stone:9},gate:{wood:22,stone:16},stone_tower:{wood:20,stone:27}};
async function construction(sim,k){
 if(!k.__kw2Fort||atWar(sim,k)||k.__kw2WallBusy||sim.age-(k.__kw2LastWall??-9)<4)return false;
 const p=k.__kw2Fort;
 const missing=p.cells.filter(c=>!k.buildings.some(b=>alive(b)&&b.x===c.x&&b.y===c.y&&b.type===c.type));
 if(!missing.length)return false;
 // Wait until the complete run is possible, rather than leave scattered panels for minutes.
 if(missing.some(c=>sim.getOwner(c.x,c.y)!==k.id||!sim.land(c.x,c.y)||sim.isRiver?.(c.x,c.y)||sim.buildingAt(c.x,c.y)))return false;
 const bill={wood:0,stone:0};
 for(const c of missing)for(const [r,n] of Object.entries(costs[c.type]))bill[r]+=n;
 if(k.resources.wood<bill.wood+55||k.resources.stone<bill.stone+8)return false;
 const created=[];k.__kw2WallBusy=true;
 try{
  for(const c of missing){
   const b=await sim.addBuilding(k,c.type,c.x,c.y,true,true);
   if(!b)throw Error('Fortification placement failed');
   b.maxHp=b.hp=c.type==='gate'?260:c.type==='stone_tower'?300:180;
   b.__kw2Fortification=true;b.__kw2WallAxis=c.axis;
   created.push(b);style(sim,k,b,c);
   if(b._sprite)b._sprite.alpha=0;
  }
  for(const b of created)if(b._sprite)b._sprite.alpha=1;
  for(const [r,n] of Object.entries(bill))k.resources[r]-=n;
  k.__kw2LastWall=sim.age;sim.r.puff?.(...sim.iso(p.x,p.y));
  return true;
 }catch(error){
  for(const b of created){if(sim.discardBuilding)sim.discardBuilding(k,b);else{k.buildings=k.buildings.filter(v=>v!==b);sim.r.destroyBuilding?.(b);}}
  sim.__v800Performance?.rebuildBuildingIndex?.();
  sim.__kw2TopologyRevision=(sim.__kw2TopologyRevision||0)+1;
  console.warn('[KW2 perimeter rollback]',error);return false;
 }finally{k.__kw2WallBusy=false;}
}
function gateRequest(sim,side,b){
 const k=sim.kingdoms[b.owner],own=sim.kingdoms[side];
 if(!k||!own||!(side===k.id||sim.areAllied?.(own,k)))return false;
 b.__kw2GateHold=(sim.__kw2Clock||0)+1.2;return true;
}
function gateUpdate(sim,dt){
 for(const k of sim.kingdoms||[]){
  if(!k.alive||!k.__kw2Fort)continue;
  for(const b of k.buildings){
   if(!alive(b)||b.type!=='gate'||!b.__kw2Fortification)continue;
   for(const f of k.farmers||[]){
    if((f.path||[]).slice(0,2).some(c=>c[0]===b.x&&c[1]===b.y)||Math.hypot(f.x-b.sx,f.y-b.sy)<13)gateRequest(sim,k.id,b);
   }
   const want=(b.__kw2GateHold||0)>(sim.__kw2Clock||0);
   b.__kw2GateOpen=want?1:0;
   style(sim,k,b,wallAt(k,b.x,b.y));
  }
 }
}
function install(sim){
 if(sim.__kw2Fortifications)return;
 sim.__kw2Fortifications=true;
 reserveSites(sim);
 sim.freeSpawn=function(){return chooseSpawn(this);};
 const oldAdd=sim.addBuilding.bind(sim);
 sim.addBuilding=async function(k,type,x,y,...rest){
  if(!this.land(x,y)||this.isRiver?.(x,y)||this.getOwner(x,y)!==k.id)return null;
  if(type==='castle'&&!k.__kw2Fort){
   const p=this.__kw2FortSlots?.find(slot=>slot.x===x&&slot.y===y&&slot.assigned==null)||this.__kw2PendingFort;
   if(p&&p.x===x&&p.y===y){k.__kw2Fort=p;p.assigned=k.id;}
   this.__kw2PendingFort=null;
  }
  if(type!=='castle'){
   if(reservedBy(this,x,y,k.id))return null;
   const c=wallAt(k,x,y);
   if(c&&type!==c.type)return null;
   if(!c&&isReserved(k,x,y))return null;
   if(c&&this.buildingAt(x,y))return null;
  }
  const b=await oldAdd(k,type,x,y,...rest);
  const c=wallAt(k,x,y);
  if(b&&c&&type===c.type){b.__kw2Fortification=true;style(this,k,b,c);}
  if(b)this.__kw2TopologyRevision=(this.__kw2TopologyRevision||0)+1;
  return b;
 };
 const oldRollback=sim.rollbackFounding?.bind(sim);
 if(oldRollback)sim.rollbackFounding=function(k){if(k.__kw2Fort)delete k.__kw2Fort.assigned;return oldRollback(k);};
 const oldBuildCell=sim.findBuildCell.bind(sim);
 sim.findBuildCell=function(k,type,...args){
  const c=oldBuildCell(k,type,...args);
  if(c&&!isReserved(k,...c)&&!reservedBy(this,...c,k.id))return c;
  if(type==='port')return null;
  // A reserved best candidate must not indefinitely block normal city development.
  let best=null,score=-Infinity;
  for(const token of k.territory){
   const [x,y]=token.split(',').map(Number);
   if(isReserved(k,x,y)||reservedBy(this,x,y,k.id)||!this.isBuildableCell(x,y,type)||this.buildingBlockingCell(x,y)||!this.buildingSpacingOK(k,type,x,y))continue;
   if(k.farmers.some(f=>f.cell?.[0]===x&&f.cell?.[1]===y))continue;
   const d=Math.hypot(x-k.capital[0],y-k.capital[1]);
   const v=-d+(type==='farm'&&this.biome(x,y)==='grass'?5:0);
   if(v>score){score=v;best=[x,y];}
  }
  return best;
 };
 const oldPick=sim.pickExpansionCell.bind(sim);
 sim.pickExpansionCell=function(k,candidates,...args){return oldPick(k,candidates.filter(([x,y])=>!reservedBy(this,x,y,k.id)),...args);};
 const oldExpand=sim.expandAI.bind(sim);
 sim.expandAI=function(k){
  if(!atWar(this,k)&&this.age-(k.lastExpand||0)>=2&&k.resources.food>=8&&k.resources.wood>=6){
   const c=frontier(this,k);if(c){this.setOwner(...c,k.id);k.territory.add(key(...c));k.resources.food-=3;k.resources.wood-=2;k.lastExpand=this.age;this.__v800Performance?.invalidateKingdom?.(k.id);return true;}
  }
  return oldExpand(k);
 };
 const oldWalk=sim.isNpcWalkableCell.bind(sim);
 sim.isNpcWalkableCell=function(k,x,y){
  const b=this.buildingAt(x,y);
  if(b?.type==='gate'&&b.__kw2Fortification&&b.owner===k.id&&alive(b))return this.isWalkableCell(x,y)&&this.getOwner(x,y)===k.id&&!this.vegetationBlocksCell(x,y);
  return oldWalk(k,x,y);
 };
 const oldBuild=sim.buildAI.bind(sim);
 sim.buildAI=async function(k){
  const result=await oldBuild(k);
  await construction(this,k);
  return result;
 };
 document.documentElement.dataset.kw2Fortifications='progressive-coloured-two-gates';
}
window.__KW2_FORT={install,makePlan,chooseSpawn,reserveSites,gateRequest,gateUpdate,style,isReserved,reservedBy,DEF};
})();
