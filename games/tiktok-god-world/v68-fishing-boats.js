(() => {
'use strict';
const VERSION='v68-fishing-boats-3',FRAME=64,SORT_INTERVAL=.12;
if(window.__V68_FISHING_BOATS?.installed)return;
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),rand=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),key=(x,y)=>`${x},${y}`;
function atlasUrl(){return String(window.__V68_FISHING_ATLAS||'').replace('QPVw+G8Usj','QPVw+G+8Usj').replace('EntRdBPIKwTCAH','EntRdBPIKwqTCAH');}
function loadImage(url){return new Promise((resolve,reject)=>{const im=new Image();im.decoding='async';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Fishing boat atlas failed to load'));im.src=url;});}
function factionBlue(r,g,b){return b>145&&b>g+45&&b>r+60&&g<125&&r<75;}
function recolor(renderer,tex,color){
 const c=renderer.textureToCanvas?.(tex);if(!c)return tex;const ctx=c.getContext('2d',{willReadFrequently:true}),im=ctx.getImageData(0,0,c.width,c.height),d=im.data,p=renderer.teamPalette?.(color);if(!p)return tex;
 for(let i=0;i<d.length;i+=4){if(d[i+3]<8)continue;const r=d[i],g=d[i+1],b=d[i+2];if(!factionBlue(r,g,b))continue;const lum=(r+g+b)/3,rep=lum<78?p.dark:lum<150?p.mid:p.light;d[i]=rep[0];d[i+1]=rep[1];d[i+2]=rep[2];}
 ctx.putImageData(im,0,0);return window.PIXI.Texture.from(c);
}
async function makeFrames(P){const im=await loadImage(atlasUrl()),atlas=P.Texture.from(im),out=[];for(let row=0;row<3;row++)for(let col=0;col<4;col++)out.push(new P.Texture({source:atlas.source,frame:new P.Rectangle(col*FRAME,row*FRAME,FRAME,FRAME)}));return out;}
function seaCell(sim,x,y){return sim.inBounds?.(x,y)&&!sim.land(x,y);}
function seaNeighbours(sim,x,y){return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].filter(([a,b])=>seaCell(sim,a,b));}
function portSeaCell(sim,port){return [[port.x,port.y+1],[port.x+1,port.y],[port.x-1,port.y],[port.x,port.y-1]].find(([x,y])=>seaCell(sim,x,y))||null;}
function fishingRoute(sim,start){
 if(!start)return null;const sk=key(...start),parent=new Map([[sk,null]]),distance=new Map([[sk,0]]),queue=[start],candidates=[];let head=0;
 while(head<queue.length&&parent.size<240){const cell=queue[head++],d=distance.get(key(...cell))||0;if(d>=4&&d<=10)candidates.push(cell);if(d>=10)continue;for(const next of seaNeighbours(sim,cell[0],cell[1])){const t=key(...next);if(parent.has(t))continue;parent.set(t,cell);distance.set(t,d+1);queue.push(next);}}
 if(!candidates.length)return null;const outer=candidates.filter(c=>(distance.get(key(...c))||0)>=6),pool=outer.length?outer:candidates,target=pool[(Math.random()*pool.length)|0],route=[];let cur=target;while(cur){route.push(cur);cur=parent.get(key(...cur));}route.reverse();return route.length>1?route:null;
}
function worldPoint(sim,cell){const p=sim.iso(cell[0],cell[1]);return[p[0],p[1]+3];}
function portAlive(k,port){return!!port&&!port.__v66Destroyed&&(k.buildings||[]).includes(port);}
function suppressFarmGroundSquare(renderer,sim){
 const g=renderer.settlement;if(!g||g.__v68FarmGroundPatched||typeof g.fill!=='function'||typeof g.stroke!=='function')return;
 const fill=g.fill,stroke=g.stroke,transparent=style=>typeof style==='number'?{color:style,alpha:0}:{...(style||{}),alpha:0};
 g.fill=function(style,...rest){const color=typeof style==='number'?style:style?.color;if(color===0xb88745)return fill.call(this,transparent(style),...rest);return fill.call(this,style,...rest);};
 g.stroke=function(style,...rest){const color=typeof style==='number'?style:style?.color;if(color===0x715333||color===0xd3b05e)return stroke.call(this,transparent(style),...rest);return stroke.call(this,style,...rest);};
 g.__v68FarmGroundPatched=true;renderer.redrawSettlementGround?.(sim);
}
async function install(){
 for(let i=0;i<1600;i++){if(window.__SIM?.r?.app?.ticker&&window.PIXI?.Texture&&window.__V67_PIXEL_BUILDINGS?.installed)break;await sleep(20);}
 const sim=window.__SIM,renderer=sim?.r,P=window.PIXI;if(!sim||!renderer?.app?.ticker||!P?.Texture||!renderer.textureToCanvas||!renderer.teamPalette||!window.__V68_FISHING_ATLAS)return;
 suppressFarmGroundSquare(renderer,sim);
 const base=await makeFrames(P),cache=new Map(),boats=new Map();
 const framesFor=k=>{if(cache.has(k.id))return cache.get(k.id);const f=base.map(t=>recolor(renderer,t,k.color));cache.set(k.id,f);return f;};
 const setFrame=(boat,start,count,period)=>{const i=start+(Math.floor(boat.animClock/period)%count),t=boat.frames[i];if(boat.sprite.texture!==t)boat.sprite.texture=t;};
 const face=(boat,tx)=>{const sx=Math.abs(boat.sprite.scale.x||boat.scale);boat.sprite.scale.x=tx>=boat.x?sx:-sx;boat.sprite.scale.y=Math.abs(boat.sprite.scale.y||boat.scale);};
 const position=(boat,x,y)=>{boat.x=x;boat.y=y;boat.sprite.position.set(x,y);boat.sprite.zIndex=Math.round(y*100)+14;};
 function spawn(k,port){
   const home=portSeaCell(sim,port);if(!home)return null;const frames=framesFor(k),sprite=new P.Sprite(frames[0]),scale=.52;sprite.anchor.set(.5,.78);sprite.scale.set(scale);sprite.roundPixels=true;sprite.eventMode='none';
   const [x,y]=worldPoint(sim,home),boat={k,port,home,frames,sprite,scale,x,y,state:'docked',wait:rand(3,7),route:null,routeIndex:0,animClock:Math.random()*.5,fishClock:0,destroyClock:0};position(boat,x,y);renderer.entities.addChild(sprite);boats.set(k.id,boat);renderer.entities.sortDirty=true;return boat;
 }
 function destroy(boat){if(!boat||boat.state==='destroying'||boat.state==='gone')return;boat.state='destroying';boat.destroyClock=0;boat.animClock=0;boat.sprite.alpha=1;}
 function remove(boat){if(!boat)return;boat.state='gone';if(boat.sprite&&!boat.sprite.destroyed)boat.sprite.destroy();boats.delete(boat.k.id);if(renderer.entities?.sortableChildren)renderer.entities.sortDirty=true;}
 function startTrip(boat){const home=portSeaCell(sim,boat.port);if(!home)return false;boat.home=home;const route=fishingRoute(sim,home);if(!route)return false;boat.route=route;boat.routeIndex=1;boat.state='outbound';boat.animClock=0;return true;}
 function move(boat,route,dt,speed){if(!route?.length||boat.routeIndex>=route.length)return true;const [tx,ty]=worldPoint(sim,route[boat.routeIndex]);face(boat,tx);const dx=tx-boat.x,dy=ty-boat.y,d=Math.hypot(dx,dy);if(d<.8){position(boat,tx,ty);boat.routeIndex++;return boat.routeIndex>=route.length;}const step=Math.min(d,speed*dt);position(boat,boat.x+dx/d*step,boat.y+dy/d*step);return false;}
 function update(boat,dt){
   boat.animClock+=dt;if(!boat.k?.alive||!portAlive(boat.k,boat.port))destroy(boat);
   if(boat.state==='destroying'){boat.destroyClock+=dt;boat.sprite.texture=boat.frames[8+clamp(Math.floor(boat.destroyClock/.52),0,3)];if(boat.destroyClock>=2.25)remove(boat);return;}
   if(boat.state==='docked'){setFrame(boat,0,4,.34);boat.wait-=dt;if(boat.wait<=0&&!startTrip(boat))boat.wait=rand(4,8);return;}
   if(boat.state==='outbound'){setFrame(boat,4,4,.18);if(move(boat,boat.route,dt,19)){boat.state='fishing';boat.fishClock=rand(8,14);boat.animClock=0;}return;}
   if(boat.state==='fishing'){setFrame(boat,0,4,.42);boat.fishClock-=dt;if(boat.fishClock<=0){boat.route=[...boat.route].reverse();boat.routeIndex=1;boat.state='returning';boat.animClock=0;}return;}
   if(boat.state==='returning'){setFrame(boat,4,4,.18);if(move(boat,boat.route,dt,19)){boat.state='docked';boat.wait=rand(5,10);boat.animClock=0;const [x,y]=worldPoint(sim,boat.home);position(boat,x,y);}}
 }
 let scan=0,sortClock=0;renderer.app.ticker.add(()=>{const dt=Math.min(.05,renderer.app.ticker.deltaMS/1000);scan-=dt;if(scan<=0){scan=1;for(const k of sim.kingdoms||[]){if(!k?.alive)continue;const port=(k.buildings||[]).find(b=>b.type==='port'&&!b.__v66Destroyed),existing=boats.get(k.id);if(!existing&&port?._sprite?.visible&&port?._sprite?.renderable)spawn(k,port);else if(existing&&existing.port!==port)destroy(existing);}}for(const boat of [...boats.values()])update(boat,dt);sortClock+=dt;if(boats.size&&renderer.entities?.sortableChildren&&sortClock>=SORT_INTERVAL){sortClock=0;renderer.entities.sortDirty=true;}});
 const api=window.TikTokGodWorld=window.TikTokGodWorld||{};api.destroyFishingBoat=ref=>{let k=null;if(Number.isInteger(ref))k=sim.kingdoms?.[ref];else{const n=String(ref??'').toLowerCase();k=sim.kingdomByName?.get(n)||sim.kingdoms?.find(x=>String(x.name).toLowerCase()===n);}const b=k?boats.get(k.id):null;if(b)destroy(b);return!!b;};
 renderer.__v68FishingBoats=boats;window.__V68_FISHING_BOATS={installed:true,version:VERSION,onePerPort:true,seaOnly:true,fishingLoop:true,returnToPort:true,destructionFrames:true,kingdomColor:true,farmGroundSquareHidden:true,atlasBytes:11437,atlasRepair:true,sortEveryFrame:false,sortInterval:SORT_INTERVAL};document.documentElement.dataset.fishingBoats=VERSION;
}
install().catch(e=>{window.__V68_FISHING_BOATS_ERROR=String(e?.message||e);console.error('[v68-fishing-boats]',e);});
})();