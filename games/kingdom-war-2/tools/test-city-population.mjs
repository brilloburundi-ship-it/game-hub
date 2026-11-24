import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
function run(src,assert){
 const win={};new Function("window",src)(win);const A=win.__KW2_CITY_POP;
 const c0={x:5,y:5,capital:true},c1={x:30,y:5,capital:false,center:{hp:100}},k={id:0,pop:42,capital:[5,5],__kw2Cities:[c0,c1],territory:new Set(),buildings:[{type:'castle',x:5,y:5,hp:420},{type:'house_a',x:7,y:5,hp:100},{type:'house_a',x:30,y:5,hp:100,__kw2CityCenter:true},{type:'house_b',x:32,y:5,hp:100}],farmers:[]};
 for(const c of [c0,c1])for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)k.territory.add((c.x+dx)+','+(c.y+dy));
 const sim={age:1,kingdoms:[k],r:{setFarmerAction(){},updateFarmer(){}},isNpcWalkableCell(k,x,y){return k.territory.has(x+','+y)&&!k.buildings.some(b=>b.x===x&&b.y===y)},visibleCitizenLimit:()=>42,iso:(x,y)=>[(x-y)*20,(x+y)*10],approachCell(k,b){return [b.x,b.y+1]}};
 const allocation=A.allocation(k,k.pop);assert(allocation[0].n===22&&allocation[1].n===20,'population by housing');
 for(let i=0;i<42;i++){const p=A.chooseHome(sim,k);assert(p,'spawn home');k.farmers.push({homeCity:p.cityKey,cell:p.cell,job:'builder'});}
 assert(k.farmers.filter(f=>f.homeCity==='30,5').length===20,'colony has its own civilians');
 for(const f of k.farmers){const p=A.localTask(sim,k,f);assert(Math.abs(p[0]-(f.homeCity==='30,5'?30:5))<10,'task stays within own city');}
 const n=A.settle(sim,k,c1,2);assert(n===2,'visible settlers transferred');return {population:42,capital:22,colony:20,localTasks:42,settlers:n};
}
test('Each settlement has housing-based civilians and local jobs',async()=>console.log(run(await readFile(new URL('../kw2-city-population.js',import.meta.url),'utf8'),assert.ok)));
