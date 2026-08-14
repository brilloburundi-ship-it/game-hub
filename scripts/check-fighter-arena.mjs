import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../games/tiktok-fighter-arena');
const read=name=>readFileSync(resolve(root,name),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const version=JSON.parse(read('version.json'));
const index=read('index.html');
const bootstrap=read('bootstrap.js');
const game=read('game.js');
const coreProxy=read('core.js');
const core=read('core-r18.js');
const combat=read('combat-v13.js');
const arena=read('arena-hd.js');
const idle=read('idle-wait.js');
const effects=read('asset-effects.js');
const rosterLoader=read('asset-r18-roster.js');
const rosterGate=read('roster-gate.js');
const manifest=JSON.parse(read('manifest-core.json'));
const fighters={...JSON.parse(read('fighters-0.json')),...JSON.parse(read('fighters-1.json')),...JSON.parse(read('fighters-2.json'))};

assert(version.version==='1.3.0','Fighter Arena release version must be 1.3.0');
assert(index.includes('bootstrap.js'),'Fighter Arena bootstrap is not wired into index.html');
assert(index.includes('lan-bridge.js'),'TikFinity/LAN bridge wiring must be preserved');
assert(index.includes('round-announcer.js'),'3-2-1/FIGHT/KO announcer wiring must be preserved');
assert(bootstrap.includes('idle-wait.js?v=1.3.0'),'idle waiting runtime is not wired through bootstrap');
assert(bootstrap.includes('roster-gate.js?v=r18-step1'),'18-fighter startup gate is not wired through bootstrap');
assert(bootstrap.includes('game.js?v=1.3.0-r18-step1'),'R18 game cache bust is not wired through bootstrap');
assert(game.includes(`const VERSION='${version.version}'`),'game.js version does not match version.json');
assert(game.includes("combat-v13.js?v=1.3.0"),'1.3 combat runtime is not wired');
assert(game.includes('FX_ASSETS'),'Original VFX pack loader missing');
assert((effects.match(/data:image\/png;base64,/g)||[]).length===8,'Expected eight original Effects pack spritesheets');
assert(manifest.arenas.length===6,'Expected six Fighter Arena HD scenes');
assert(new Set(manifest.arenas.map(a=>a.id)).size===manifest.arenas.length,'Arena ids must be unique');
assert(arena.includes('renderArenaHD'),'Retina HD arena renderer missing');
for(const name of ['skyDojo','neonCity','volcanic','ice','forge','dragon'])assert(arena.includes(`function ${name}`),`HD arena scene ${name} missing`);
assert(combat.includes('doubleChance'),'Random double attack bonus missing');
assert(combat.includes('DOUBLE ATTACK!'),'Double attack feedback missing');
assert(combat.includes('combatGap'),'Expanded combat spacing missing');
assert(combat.includes('getMetrics'),'Stable fighter body metrics missing');
assert(combat.includes('sheetFx'),'Original VFX sprite runtime missing');
assert(coreProxy.includes("core-r18.js?v=r18-step1"),'All core imports must converge on the single R18 runtime');
assert(core.includes('setAvailableFighters'),'Loaded fighter availability gating missing');
assert(core.includes('winner.x=spawnX(winSide)'),'Waiting champion must return to and remain on their side');
assert(!core.includes('S.queue.push(loser.viewer)'),'Defeated fighter must not be auto-requeued for an immediate rematch');
assert(idle.includes("S.round==='waiting'"),'Waiting champion idle state controller missing');
assert(idle.includes('r.anim+=dt'),'Waiting champion idle animation must continue advancing');
assert(game.includes("get('demo')==='1'"),'Demo viewer stream must be gated behind ?demo=1');
assert(game.includes('scheduleDemo'),'Timed simulated LIVE viewer stream missing');
assert(game.includes('4500+Math.random()*9500'),'Natural viewer waiting interval missing');
assert(game.includes('8000+Math.random()*10000'),'Long demo waiting gaps missing');
assert(index.includes('testStreamButton'),'LIVE test stream control missing');
assert(index.includes('winner stays on their side in idle'),'Idle champion behavior not documented in UI');
assert(!game.includes('chooseFallbackAtlas'),'Cross-fighter sprite substitution must never return');
assert(game.includes('atlasFits'),'Sprite atlas geometry validation missing');

const requiredIds=['street_mon','hero_knight','evil_wizard','huntress','martial_hero','medieval_king','martial_champion','evil_wizard_2','samurai','hero_knight_prime','fantasy_warrior','huntress_2','samurai_ronin','samurai_archer','samurai_commander','fire_wizard','lightning_mage','wanderer_magician'];
assert(Object.keys(fighters).length===18,`Expected exactly 18 fighter definitions, found ${Object.keys(fighters).length}`);
assert(new Set(Object.keys(fighters)).size===18,'Fighter ids must be unique');
for(const id of requiredIds){
  assert(fighters[id],`Missing R18 fighter ${id}`);
  assert(core.includes(`'${id}'`),`${id} is defined but missing from R18 selection pools`);
}
assert(rosterGate.includes('const EXPECTED=18'),'Startup gate must require all 18 fighters');
assert(rosterGate.includes('ready===EXPECTED'),'Startup gate must not unlock on a partial roster');
for(const file of ['new_hero_knight_prime.webp','new_fantasy_warrior.webp','new_huntress_2.webp','new_samurai_ronin.webp','new_samurai_archer.webp','new_samurai_commander.webp','new_fire_wizard.webp','new_lightning_mage.webp','new_wanderer_magician.webp'])assert(rosterLoader.includes(file),`Strict R18 loader missing ${file}`);
assert(rosterLoader.includes('truncated WebP'),'R18 payload RIFF length validation missing');

for(const[id,f]of Object.entries(fighters)){
  assert(f.atlas,`${id}: missing atlas`);
  for(const a of ['idle','run','attack1','hurt'])assert(f.animations?.[a],`${id}: missing ${a} animation`);
  for(const[name,a]of Object.entries(f.animations||{})){
    assert(Number.isFinite(a.frameW)&&a.frameW>0,`${id}/${name}: invalid frameW`);
    assert(Number.isFinite(a.frameH)&&a.frameH>0,`${id}/${name}: invalid frameH`);
    assert(Number.isFinite(a.frames)&&a.frames>0,`${id}/${name}: invalid frames`);
    assert(Number.isFinite(a.fps)&&a.fps>0,`${id}/${name}: invalid fps`);
  }
}
for(const name of ['game.js','core.js','core-r18.js','combat-v13.js','arena-hd.js','idle-wait.js','asset-effects.js','asset-r18-roster.js','roster-gate.js','bootstrap.js']){
  const p=resolve(root,name),r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  assert(r.status===0,`${name} syntax check failed: ${r.stderr||r.stdout}`);
}
console.log(`Fighter Arena ${version.version}: 18/18 fighter definitions, single R18 runtime, strict roster gate, ${manifest.arenas.length} Retina HD arenas, bridge/announcer wiring preserved.`);
