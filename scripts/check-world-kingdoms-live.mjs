import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const game=resolve(root,'games','world-kingdoms-live');
const errors=[];
const check=(ok,message)=>{if(!ok)errors.push(message);};
const read=path=>readFile(resolve(game,path),'utf8');
const [html,js,css,version,projects]=await Promise.all([read('index.html'),read('game.js'),read('styles.css'),read('version.json').then(JSON.parse),readFile(resolve(root,'data','projects.json'),'utf8').then(JSON.parse)]);

check(version.marker==='fresh-simulation-procedural-earth-2.5d-kw2-assets-only-2','version marker must prove the fresh asset-only 2.5D architecture');
check(projects.some(p=>p.id==='world-kingdoms-live'&&p.rootPath==='games/world-kingdoms-live'),'project registry entry is missing');
check(js.includes("const ASSET_ROOT = '../kingdom-war-2/'"),'Kingdom War 2 asset root is missing');
check(js.includes('assets/buildings/manifest.json')&&js.includes('assets/minifolks/manifest.json'),'both allowed Kingdom War 2 asset catalogs are required');
for(const forbidden of ['assets/map/world.json','assets/map/world.png','kingdom-war-2/game.js','living-kingdoms','kw2-mobilization','latest/gameplay','lan-bridge.js'])check(!js.includes(forbidden),`fresh game must not reuse ${forbidden}`);
for(const team of ['RED','BLUE','GREEN','YELLOW','PURPLE','ORANGE'])check(js.includes(`['${team}'`),`autonomous ${team} kingdom is missing`);
for(const feature of ['makeTerrain','createSettlement','sendColonists','planLandRoute','startWar','updateArmy','conquer','diplomacy','startVote','connectBridge'])check(js.includes(`function ${feature}`),`${feature} system is missing`);
check(js.includes('const WORLD_TILT = .72')&&js.includes('ctx.scale(state.camera.z,state.camera.z*WORLD_TILT)'),'2.5D terrain projection is missing');
check(js.includes('const CONTINENTS = [')&&js.includes('MOUNTAIN_RANGES'),'recognizable independent Earth terrain definition is missing');
check(js.includes('function teamTint')&&js.includes('tintedBuildings')&&js.includes('tintedFolk'),'kingdom-specific prefab and NPC coloring is missing');
check(!/w\.troops\)\{t\.x\+=.*rand/s.test(js),'army march must not jitter troops randomly each frame');
for(const marker of ['data-test="join"','data-test="likes"','data-test="follow"','data-test="share"','data-test="small"','data-test="medium"','data-test="large"','data-test="war"'])check(html.includes(marker),`test control ${marker} is missing`);
check(html.includes('id="votePanel"')&&html.includes('id="historyPanel"')&&html.includes('id="world"'),'streaming UI surface is incomplete');
check(css.length>5000,'streaming stylesheet is unexpectedly small');
for(const file of ['index.html','styles.css','game.js','bridge/server.mjs','manifest.webmanifest','sw.js','version.json']){try{check((await stat(resolve(game,file))).size>0,`${file} is empty`);}catch{errors.push(`${file} is missing`);}}
for(const file of ['game.js','bridge/server.mjs','sw.js']){const result=spawnSync(process.execPath,['--check',resolve(game,file)],{encoding:'utf8'});check(result.status===0,`${file} syntax: ${(result.stderr||result.stdout).trim()}`);}

if(errors.length){console.error(`World Kingdoms LIVE contract FAILED (${errors.length}):`);errors.forEach((error,index)=>console.error(`${index+1}. ${error}`));process.exitCode=1;}else console.log('World Kingdoms LIVE contract OK: independent 2.5D Earth, six color-coded autonomous kingdoms, stable land-routed armies, Kingdom War 2 prefabs/NPCs only, TEST/LIVE events and relay');
