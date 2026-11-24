import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

async function run(citySource,cameraSource,assert){
 const win={__KW2_FORT:{DEF:new Set(['wall','gate','stone_tower']),isReserved:()=>false,reservedBy:()=>false},__KW2_MARITIME:{capacity:k=>12+10*k.buildings.filter(b=>b.type.startsWith('house_')&&b.hp>0).length}};
 const doc={documentElement:{dataset:{}}};
 new Function('window',citySource)(win);new Function('window','document','innerWidth','innerHeight',cameraSource)(win,doc,1366,768);
 const A=win.__KW2_BALANCED_CITIES;
 const k={id:0,name:'Test',alive:true,pop:4,popCap:12,military:8,capital:[15,15],resources:{wood:20000,stone:15000,gold:10000,food:20000},buildings:[{type:'castle',x:15,y:15,hp:420}],farmers:[],territory:new Set(),lastBuild:0};
 for(let y=2;y<29;y++)for(let x=2;x<29;x++)k.territory.add(x+','+y);
 const sim={age:0,kingdoms:[k],wars:[],r:{puff(){}},getOwner(x,y){return k.territory.has(x+','+y)?0:-1},land(x,y){return x>=0&&y>=0&&x<31&&y<31&&x!==1},isRiver(x,y){return y===1},isBuildableCell(x,y){return this.land(x,y)&&!this.isRiver(x,y)},biome(){return 'grass'},buildingBlockingCell(x,y){return k.buildings.find(b=>b.x===x&&b.y===y)},neigh(x,y){return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]},iso(x,y){return [(x-y)*20,(x+y)*10]},async addBuilding(k,t,x,y){if(!this.land(x,y)||this.isRiver(x,y)||this.buildingBlockingCell(x,y))return null;const b={type:t,x,y,hp:150};k.buildings.push(b);return b;},async syncCitizens(){},expandAI(){return true},async tick(){this.age++;await A.build(this,k,{test:!!k.__kw2DevelopmentTest});return true;}};
 const stalled={...k,buildings:[...k.buildings,...Array.from({length:12},()=>({type:'warehouse',hp:100}))]};
 assert(!A.plan(stalled).includes('warehouse'),'no unlimited warehouse duplication');
 A.install(sim);await sim.__kw2DevelopAll();for(let i=0;i<35;i++)await sim.tick();
 const types={};for(const b of k.buildings)types[b.type]=(types[b.type]||0)+1;
 assert(k.pop>=100&&k.pop<=k.popCap,'test develops population within housing');assert(types.house_a&&types.house_b&&types.house_c,'all house variants');assert(types.farm&&types.market&&types.barracks&&types.forge,'diverse functional buildings');assert(k.buildings.every(b=>sim.land(b.x,b.y)&&!sim.isRiver(b.x,b.y)),'dry construction');assert(k.military>=100,'test trains military');
 const w={id:'testwar',a:0,b:1,__v66:{phase:'combat'}},director={mode:'gift'},b={id:1,alive:true,capital:[25,25]},unit=(side,x,y)=>({side,x,y,warId:w.id,anim:'attack'});
 const cs={kingdoms:[k,b],wars:[w],iso:sim.iso,__kw2CivilizationWar:{units:[unit(0,100,200),unit(0,120,210),unit(1,220,200),unit(1,240,220)]}};
 const t=win.__KW2_BATTLE_CAMERA.target(cs,{overviewScale:()=>.2},director,0);
 assert(director.mode==='war'&&Number.isFinite(t.scale)&&t.scale>.2,'war overrides gift camera');assert(100*t.scale+t.x>0&&240*t.scale+t.x<1366,'both armies fit');
 return {population:k.pop,capacity:k.popCap,military:k.military,buildings:types,battleCamera:t};
}
test('Balanced development and battle director',async()=>{const city=await readFile(new URL('../kw2-balanced-cities.js',import.meta.url),'utf8'),cam=await readFile(new URL('../kw2-battle-camera.js',import.meta.url),'utf8');console.log(await run(city,cam,assert.ok));});
