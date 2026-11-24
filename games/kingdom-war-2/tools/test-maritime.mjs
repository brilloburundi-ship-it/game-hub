import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

async function run(source,assert){
const notes=[],win={__KW2_FORT:{reservedBy:()=>false,isReserved:()=>false},__KW2_ROYAL_HUD:{chronicle:s=>notes.push(s)}},doc={documentElement:{dataset:{}}};
new Function("window","document",source)(win,doc);
class G{constructor(){this.children=[];this.position={set:(x,y)=>{this.x=x;this.y=y}};this.scale={set(){},x:1};this.anchor={set(){}};this.destroyed=false;}poly(){return this}rect(){return this}fill(){return this}stroke(){return this}addChild(c){this.children.push(c);return c}destroy(){this.destroyed=true}}
const W=60,H=24,land=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>y>=4&&y<=18&&[[4,15],[23,34],[42,53]].some(([a,b])=>x>=a&&x<=b)?1:0));
const coast=land.map((r,y)=>r.map((v,x)=>v?Math.min(y-3,19-y,...[[4,15],[23,34],[42,53]].filter(([a,b])=>x>=a&&x<=b).map(([a,b])=>Math.min(x-a+1,b-x+1))):0));
const owner=new Map();let ticker;
const sim={w:{gridW:W,gridH:H,tileW:40,tileH:20},age:2,kingdoms:[],wars:[],kingdomByName:new Map(),r:{P:{Container:G,Graphics:G,Sprite:G},__kw2BoatFrames:()=>Array.from({length:12},(_,i)=>({id:i})),entities:new G(),app:{ticker:{deltaMS:50,add(fn){ticker=fn}}},redrawTerritories(){}},inBounds(x,y){return x>=0&&x<W&&y>=0&&y<H},land(x,y){return land[y]?.[x]===1},isRiver(){return false},biome(x,y){return this.land(x,y)?(coast[y][x]===1?"beach":"grass"):"ocean"},coastDistance(x,y){return coast[y]?.[x]||0},isWalkableCell(x,y){return this.land(x,y)},isBuildableCell(x,y,t){return this.land(x,y)&&this.coastDistance(x,y)>=(t==="port"?1:2)},getOwner(x,y){return owner.get(x+","+y)??-1},setOwner(x,y,id){if(this.land(x,y))owner.set(x+","+y,id)},neigh(x,y){return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].filter(c=>this.land(...c))},iso(x,y){return [(x-y)*20,(x+y)*10]},buildingBlockingCell(x,y){return this.kingdoms.flatMap(k=>k.buildings).find(b=>b.x===x&&b.y===y&&b.hp>0)},buildingSpacingOK(k,t,x,y){return k.buildings.every(b=>Math.hypot(x-b.x,y-b.y)>1.1)},async addBuilding(k,t,x,y){if(!this.land(x,y)||this.getOwner(x,y)!==k.id||this.buildingBlockingCell(x,y))return null;const b={type:t,x,y,hp:100};k.buildings.push(b);return b},join(){},giftPopulation(k,n){k.pop+=n},population(){},buildAI(){},gift(){},tick(){this.age++},power(k){return k.pop},syncCitizens(){},waitForKingdomReady(n){return this.kingdomByName.get(n.toLowerCase())}};
function king(id,x,y,dock){const k={id,name:"King"+id,alive:true,color:0x44aaff,capital:[x,y],pop:20,resources:{food:500,wood:500,stone:500,gold:500},territory:new Set(),buildings:[{type:"castle",x,y,hp:420},{type:"house_a",x:x+1,y,hp:100},{type:"port",x:dock,y,hp:150}],__kw2Cities:[{name:"Capital",x,y,capital:true}]};sim.kingdoms.push(k);sim.kingdomByName.set(k.name.toLowerCase(),k);for(const b of k.buildings){sim.setOwner(b.x,b.y,id);k.territory.add(b.x+","+b.y)}return k}
const a=king(0,8,10,15),b=king(1,27,10,34),M=win.__KW2_MARITIME;M.install(sim);
const path=M.routeSea(sim,[16,10],[35,10]);assert(path.every(c=>!sim.land(...c)),"sea only");
assert(M.capacity(a)===22,"housing capacity");assert(await sim.addBuilding(a,"house_a",16,10,true,true)===null,"water rejected even for forced construction");
const gold=a.resources.gold+b.resources.gold;const atlas=sim.r.__kw2BoatFrames;delete sim.r.__kw2BoatFrames;assert(!await sim.__kw2WorldCommand(a.name,"trade King1"),"no invented vessel without fishing atlas");sim.r.__kw2BoatFrames=atlas;assert(await sim.__kw2WorldCommand(a.name,"trade King1"),"trade launches with fishing atlas");assert(sim.__kw2Maritime.ships.every(s=>s.frames?.length===12),"fishing sprites exclusively");
for(let i=0;i<1800;i++)ticker();await sim.tick();for(let i=0;i<1800;i++)ticker();await sim.tick();
assert(sim.__kw2Maritime.tradeTrips===1,"merchant completes round trip");assert(a.resources.gold+b.resources.gold===gold,"trade transfers rather than creates gold");
await sim.__kw2WorldCommand(a.name,"colonize");sim.age=8;await sim.tick();assert(sim.__kw2Maritime.ships.some(s=>s.kind==="colony"),"colony expedition launches");
for(let i=0;i<2400;i++)ticker();await sim.tick();assert(sim.__kw2Maritime.colonies===1,"settlement after arrival");assert(a.__kw2Cities.length===2,"second city");assert(sim.kingdoms.every(k=>k.buildings.every(b=>sim.land(b.x,b.y))),"all buildings on land");assert(M.capacity(a)>=32,"colony increases housing");
return {tradeTrips:sim.__kw2Maritime.tradeTrips,goldTransferred:sim.__kw2Maritime.tradeGold,colonies:sim.__kw2Maritime.colonies,cities:a.__kw2Cities.length};
}
test('Maritime routes, trade, colony arrival and land-only buildings',async()=>{const source=await readFile(new URL('../kw2-maritime-cities.js',import.meta.url),'utf8');console.log(await run(source,assert.ok));});
