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
const game=read('game.js');
const core=read('core.js');
const combat=read('combat-v13.js');
const arena=read('arena-hd.js');
const effects=read('asset-effects.js');
const manifest=JSON.parse(read('manifest-core.json'));
const fighters={...JSON.parse(read('fighters-0.json')),...JSON.parse(read('fighters-1.json')),...JSON.parse(read('fighters-2.json'))};

assert(version.version==='1.3.0','Fighter Arena release version must be 1.3.0');
assert(index.includes(`game.js?v=${version.version}`),'index.html cache-bust does not match release version');
assert(game.includes(`const VERSION='${version.version}'`),'game.js version does not match version.json');
assert(game.includes("combat-v13.js?v=1.3.0"),'1.3 combat runtime is not wired');
assert(game.includes('FX_ASSETS'),'Original VFX pack loader missing');
assert((effects.match(/data:image\/png;base64,/g)||[]).length===8,'Expected eight original Effects pack spritesheets');
assert(manifest.arenas.length===6,'Expected six Fighter Arena HD scenes');
assert(new Set(manifest.arenas.map(a=>a.id)).size===6,'Arena ids must be unique');
assert(arena.includes('renderArenaHD'),'Retina HD arena renderer missing');
for(const name of ['skyDojo','neonCity','volcanic','ice','forge','dragon'])assert(arena.includes(`function ${name}`),`HD arena scene ${name} missing`);
assert(combat.includes('doubleChance'),'Random double attack bonus missing');
assert(combat.includes('DOUBLE ATTACK!'),'Double attack feedback missing');
assert(combat.includes('combatGap'),'Expanded combat spacing missing');
assert(combat.includes('getMetrics'),'Stable fighter body metrics missing');
assert(combat.includes('sheetFx'),'Original VFX sprite runtime missing');
assert(core.includes('setAvailableFighters'),'Loaded fighter availability gating missing');
assert(core.includes('winner.x=spawnX(winSide)'),'Waiting champion must return to and remain on their side');
assert(!core.includes('S.queue.push(loser.viewer)'),'Defeated fighter must not be auto-requeued for an immediate rematch');
assert(game.includes('loadedIds.size<2'),'Arena should only hard-block when fewer than two real fighter atlases load');
assert(game.includes('scheduleRecovery'),'Background fighter atlas recovery missing');
assert(game.includes('recovering in background'),'Partial fighter readiness status missing');
assert(game.includes("get('demo')==='1'"),'Demo viewer stream must be gated behind ?demo=1');
assert(game.includes('scheduleDemo'),'Timed simulated LIVE viewer stream missing');
assert(game.includes('4500+Math.random()*9500'),'Natural viewer waiting interval missing');
assert(game.includes('8000+Math.random()*10000'),'Long demo waiting gaps missing');
assert(index.includes('testStreamButton'),'LIVE test stream control missing');
assert(index.includes('winner stays on their side in idle'),'Idle champion behavior not documented in UI');
assert(!game.includes('chooseFallbackAtlas'),'Cross-fighter sprite substitution must never return');
assert(game.includes('atlasFits'),'Sprite atlas geometry validation missing');
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
for(const name of ['game.js','core.js','combat-v13.js','arena-hd.js','asset-effects.js']){
  const p=resolve(root,name),r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  assert(r.status===0,`${name} syntax check failed: ${r.stderr||r.stdout}`);
}
console.log(`Fighter Arena ${version.version}: ${Object.keys(fighters).length} unique fighter definitions, ${manifest.arenas.length} Retina HD arenas, timed demo stream and idle champion checks passed.`);
