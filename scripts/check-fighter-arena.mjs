import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../games/tiktok-fighter-arena');
const read=name=>readFileSync(resolve(root,name),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const must=name=>{const p=resolve(root,name);assert(existsSync(p),`Missing Fighter Arena file: ${name}`);return p};

const requiredFiles=[
  'version.json','index.html','bootstrap.js','game-v14.js','core.js','core-r18.js',
  'combat-v14.js','arena-hd.js','idle-wait.js','asset-effects.js','roster-gate-v14.js',
  'vfx-combat-overlay.js','auto-showcase.js','asset-medieval-warrior-2.js','asset-medieval-warrior-3.js',
  'fighters-0.json','fighters-1.json','fighters-2.json','manifest-core.json'
];
for(const name of requiredFiles)must(name);

const version=JSON.parse(read('version.json'));
const index=read('index.html');
const bootstrap=read('bootstrap.js');
const game=read('game-v14.js');
const coreProxy=read('core.js');
const core=read('core-r18.js');
const combat=read('combat-v14.js');
const combatVfx=read('vfx-combat-overlay.js');
const showcase=read('auto-showcase.js');
const arena=read('arena-hd.js');
const idle=read('idle-wait.js');
const effects=read('asset-effects.js');
const rosterGate=read('roster-gate-v14.js');
const mw2=read('asset-medieval-warrior-2.js');
const mw3=read('asset-medieval-warrior-3.js');
const manifest=JSON.parse(read('manifest-core.json'));
const fighters={...JSON.parse(read('fighters-0.json')),...JSON.parse(read('fighters-1.json')),...JSON.parse(read('fighters-2.json'))};

const baseIds=[
  'street_mon','hero_knight','evil_wizard','huntress','martial_hero','medieval_king',
  'martial_champion','evil_wizard_2','samurai','hero_knight_prime','fantasy_warrior',
  'huntress_2','samurai_ronin','samurai_archer','samurai_commander','fire_wizard',
  'lightning_mage','wanderer_magician'
];
const requiredIds=[...baseIds,'medieval_warrior_2','medieval_warrior_3'];

assert(version.version==='1.4.0','Fighter Arena release version must be 1.4.0');
assert(index.includes('bootstrap.js?v=1.4.0'),'Fighter Arena v1.4 bootstrap is not wired into index.html');
assert(index.includes('lan-bridge.js'),'TikFinity/LAN bridge wiring must be preserved');
assert(index.includes('round-announcer.js'),'3-2-1/FIGHT/KO visual announcer wiring must be preserved');
assert(index.includes('round-audio-sync.js'),'3-2-1/FIGHT/KO audio sync wiring must be preserved');
assert(index.includes('vfx-combat-overlay.js?v=1.1.0'),'Targeted combat VFX overlay wiring must be preserved');
assert(index.includes('auto-showcase.js?v=1.1.0'),'LIVE-flow auto showcase wiring must be preserved');
assert(bootstrap.includes("import('./idle-wait.js?v=1.4.0')"),'v1.4 idle waiting runtime is not wired through bootstrap');
assert(bootstrap.includes("import('./roster-gate-v14.js?v=1.4.0')"),'20-fighter startup gate is not wired through bootstrap');
assert(bootstrap.includes("import('./game-v14.js?v=1.4.0')"),'v1.4 game runtime is not wired through bootstrap');
assert(game.includes("const VERSION='1.4.0'"),'game-v14.js version does not match version.json');
assert(game.includes("from'./core.js?v=1.4.0'"),'game-v14.js must use the shared v1.4 core');
assert(game.includes("from'./combat-v14.js?v=1.4.0'"),'v1.4 combat runtime is not wired');
assert(combat.includes("from'./core.js?v=1.4.0'"),'combat-v14.js must use the same shared v1.4 core');
assert(idle.includes("from'./core.js?v=1.4.0'"),'idle-wait.js must use the same shared v1.4 core');
assert(game.includes('FX_ASSETS'),'Original VFX pack loader missing');
assert((effects.match(/data:image\/png;base64,/g)||[]).length===8,'Expected eight original Effects pack spritesheets');
const expectedArenaIds=['sky_dojo','ice_crystal','arcane_ruins','desert_moon','neon_city','jungle_temple','volcanic_ring','celestial_citadel'];
assert(manifest.arenas.length===8,'Expected eight Fighter Arena HD scenes');
assert(new Set(manifest.arenas.map(a=>a.id)).size===manifest.arenas.length,'Arena ids must be unique');
assert(JSON.stringify(manifest.arenas.map(a=>a.id))===JSON.stringify(expectedArenaIds),'Fighter Arena manifest must expose the exact 8-scene rotation');
assert(arena.includes('renderArenaHD'),'Retina HD arena renderer missing');
assert(arena.includes('preloadArenaHD'),'HD arena preload missing');
assert(arena.includes('assets/arenas/'),'HD arena asset path wiring missing');
assert(arena.includes('.svg?v=${VERSION}'),'HD arena renderer must load the current transparent SVG foregrounds');
for(const id of expectedArenaIds){
  must(`assets/arenas/${id}.svg`);
  assert(arena.includes(`'${id}'`),`HD arena renderer id ${id} missing`);
}

const combatVfxAssets=['dust-dash.b64','sword-slash.b64','fire-ball.b64','lightning-bolt.b64','thunder-ultimate.b64'];
for(const name of combatVfxAssets)must(`assets/vfx/${name}`);
assert(combatVfx.includes('const swordIds=new Set'),'Sword-specific VFX fighter allow-list missing');
assert(combatVfx.includes("r.fighterId==='fire_wizard'"),'Fire Wizard targeted VFX routing missing');
assert(combatVfx.includes("r.fighterId==='lightning_mage'"),'Lightning Mage targeted VFX routing missing');
assert(combatVfx.includes("spawn('swordSlash'"),'Sword slash hit VFX missing');
assert(combatVfx.includes("projectile('fireBall'"),'Fireball projectile VFX missing');
assert(combatVfx.includes("projectile('lightningBolt'"),'Lightning projectile VFX missing');
assert(combatVfx.includes("spawn('thunderUltimate'"),'Thunder ultimate VFX missing');
assert(combatVfx.includes("spawn('dustDash'"),'Dash dust VFX missing');
assert(combatVfx.includes('track=new WeakMap()'),'Per-fighter VFX state tracking missing');
assert(combatVfx.includes('if(!t.hit&&r.hit'),'Hit VFX must be gated to one trigger per attack hit');

assert(showcase.includes("const VERSION='1.1.0'"),'LIVE showcase must use the current cache contract');
assert(showcase.includes("emit('join'"),'LIVE showcase must exercise the real JOIN bridge path');
assert(showcase.includes("S.round==='finished'"),'LIVE showcase must wait for a real finished fight');
assert(showcase.includes("S.round==='waiting'&&S.active.filter(Boolean).length===1&&S.delay===0"),'LIVE showcase must wait through death animation and winner rotation');
assert(showcase.includes('joinHero(bout+1)'),'LIVE showcase must add the next viewer only after the previous fight completes');
assert(showcase.includes('winner incoming')||showcase.includes('next viewer incoming'),'LIVE showcase must expose winner-stays/next-viewer cadence');
assert(!showcase.includes('forcing real KO'),'LIVE showcase must not force scripted KO anymore');

const rosterMatch=game.match(/const ROSTER=\{([\s\S]*?)\};\s*const ALL_ROSTER=/);
assert(rosterMatch,'Unable to read the v1.4 fighter roster');
const rosterIds=[...rosterMatch[1].matchAll(/'([a-z0-9_]+)'/g)].map(m=>m[1]);
assert(rosterIds.length===20,`Expected 20 roster slots, found ${rosterIds.length}`);
assert(new Set(rosterIds).size===20,'Fighter roster ids must be unique');
for(const id of requiredIds)assert(rosterIds.includes(id),`${id} is missing from the v1.4 selection pools`);
assert(game.includes('medieval_warrior_2:{name:'),'Medieval Warrior 2 definition missing from v1.4 runtime');
assert(game.includes('medieval_warrior_3:{name:'),'Medieval Warrior 3 definition missing from v1.4 runtime');
for(const id of ['medieval_warrior_2','medieval_warrior_3']){
  const pos=game.indexOf(`${id}:{name:`);
  assert(pos>=0,`${id}: runtime definition missing`);
  const sample=game.slice(pos,pos+1800);
  for(const a of ['idle','run','attack1','hurt','death'])assert(sample.includes(`${a}:{`),`${id}: missing ${a} animation`);
}

assert(Object.keys(fighters).length===18,`Expected 18 base fighter definitions, found ${Object.keys(fighters).length}`);
assert(new Set(Object.keys(fighters)).size===18,'Base fighter ids must be unique');
for(const id of baseIds){
  const f=fighters[id];
  assert(f,`Missing base fighter ${id}`);
  assert(f.atlas,`${id}: missing atlas`);
  for(const a of ['idle','run','attack1','hurt'])assert(f.animations?.[a],`${id}: missing ${a} animation`);
  const hasDeath=!!(f.animations?.death||f.animations?.dead);
  if(id!=='samurai')assert(hasDeath,`${id}: missing native death/dead animation`);
  for(const[name,a]of Object.entries(f.animations||{})){
    assert(Number.isFinite(a.frameW)&&a.frameW>0,`${id}/${name}: invalid frameW`);
    assert(Number.isFinite(a.frameH)&&a.frameH>0,`${id}/${name}: invalid frameH`);
    assert(Number.isFinite(a.frames)&&a.frames>0,`${id}/${name}: invalid frames`);
    assert(Number.isFinite(a.fps)&&a.fps>0,`${id}/${name}: invalid fps`);
  }
}

assert(coreProxy.includes('ACTIVE_R20'),'Shared core must expose the active R20 allow-list');
for(const id of requiredIds)assert(coreProxy.includes(`'${id}'`),`${id} missing from the shared core R20 allow-list`);
assert(coreProxy.includes("core-r18.js?v=r18-step1"),'Shared core proxy must converge on one base runtime instance');
assert(core.includes('setAvailableFighters'),'Loaded fighter availability gating missing');
assert(core.includes('winner.x=spawnX(winSide)'),'Waiting champion must return to and remain on their side');
assert(!core.includes('S.queue.push(loser.viewer)'),'Defeated fighter must not be auto-requeued for an immediate rematch');
assert(idle.includes("S.round==='waiting'"),'Waiting champion idle state controller missing');
assert(idle.includes('r.anim+=dt'),'Waiting champion idle animation must continue advancing');

assert(combat.includes('doubleChance'),'Random double attack bonus missing');
assert(combat.includes('DOUBLE ATTACK!'),'Double attack feedback missing');
assert(combat.includes('combatGap'),'Expanded combat spacing missing');
assert(combat.includes('getMetrics'),'Stable fighter body metrics missing');
assert(combat.includes('sheetFx'),'Original VFX sprite runtime missing');
assert(combat.includes("setAnim(d,'death')"),'KO must enter the death state');
assert(combat.includes('deathDuration'),'Death animation duration gate missing');
assert(combat.includes('loser.time>=need+.22'),'Next challenger must wait for the completed death animation');
assert(combat.includes('safeDrawFighter'),'Per-fighter fail-safe renderer missing');
assert(combat.includes("warnOnce('frame-loop'"),'Frame-loop error containment missing');
assert(combat.includes('finally{requestAnimationFrame(loop)}'),'Frame loop must always schedule the next frame');

assert(game.includes("new URLSearchParams(location.search).get('demo')==='1'"),'Demo viewer stream must be gated behind ?demo=1');
assert(game.includes('scheduleDemo'),'Timed simulated LIVE viewer stream missing');
assert(game.includes('4500+Math.random()*9500'),'Natural viewer waiting interval missing');
assert(game.includes('8000+Math.random()*10000'),'Long demo waiting gaps missing');
assert(index.includes('testStreamButton'),'LIVE test stream control missing');
assert(index.includes('winner stays on their side in idle'),'Idle champion behavior not documented in UI');
assert(!game.includes('chooseFallbackAtlas'),'Cross-fighter sprite substitution must never return');
assert(game.includes('atlasFits'),'Sprite atlas geometry validation missing');

const gateMatch=rosterGate.match(/const REQUIRED=\[([\s\S]*?)\];/);
assert(gateMatch,'Unable to read roster-gate-v14 REQUIRED list');
const gateIds=[...gateMatch[1].matchAll(/'([a-z0-9_]+)'/g)].map(m=>m[1]);
assert(gateIds.length===20&&new Set(gateIds).size===20,'Startup gate must require exactly 20 unique fighters');
for(const id of requiredIds)assert(gateIds.includes(id),`Startup gate missing ${id}`);
assert(rosterGate.includes('const EXPECTED=REQUIRED.length'),'Startup gate expected count must derive from the complete roster');
assert(rosterGate.includes('button.disabled=true'),'Startup gate must disable entry while roster is incomplete');
assert(rosterGate.includes('stopImmediatePropagation'),'Startup gate must block a racing ENTER ARENA click before 20/20 is ready');

assert(mw2.includes('data:image/webp;base64,UklGR'),'Medieval Warrior 2 embedded WebP payload missing');
assert(mw3.includes("b64.startsWith('UklGR')"),'Medieval Warrior 3 RIFF header validation missing');
assert(mw3.includes("raw.slice(8,12)!=='WEBP'"),'Medieval Warrior 3 WebP signature validation missing');
assert(mw3.includes('truncated WebP'),'Medieval Warrior 3 RIFF length validation missing');

function validateWebP(buf,label){
  assert(buf.length>=12,`${label}: WebP payload too short`);
  assert(buf.subarray(0,4).toString('ascii')==='RIFF',`${label}: missing RIFF header`);
  assert(buf.subarray(8,12).toString('ascii')==='WEBP',`${label}: missing WEBP signature`);
  const declared=buf.readUInt32LE(4)+8;
  assert(declared===buf.length,`${label}: truncated RIFF/WebP payload ${buf.length}/${declared}`);
}
const mw2Match=mw2.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/);
assert(mw2Match,'Medieval Warrior 2 base64 payload could not be extracted');
validateWebP(Buffer.from(mw2Match[1],'base64'),'medieval_warrior_2');

const mw3Chunks=[
  'assets/r20/medieval-warrior-3.0.b64',
  'assets/r20/medieval-warrior-3.1.b64',
  'assets/r20/medieval-warrior-3.2.b64',
  'assets/r20/medieval-warrior-3.3.b64'
];
const mw3b64=mw3Chunks.map(name=>read(name).trim()).join('');
assert(mw3b64.length===9976,`medieval_warrior_3 base64 length ${mw3b64.length}/9976`);
validateWebP(Buffer.from(mw3b64,'base64'),'medieval_warrior_3');

for(const name of [
  'game-v14.js','core.js','core-r18.js','combat-v14.js','vfx-combat-overlay.js','auto-showcase.js','arena-hd.js','idle-wait.js',
  'asset-effects.js','roster-gate-v14.js','bootstrap.js','asset-medieval-warrior-2.js',
  'asset-medieval-warrior-3.js'
]){
  const p=resolve(root,name),r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  assert(r.status===0,`${name} syntax check failed: ${r.stderr||r.stdout}`);
}

console.log(`Fighter Arena ${version.version}: 20/20 roster contract, shared v1.4 core, fail-safe render loop, full KO/death gate, verified Medieval Warrior WebP payloads, ${manifest.arenas.length} Retina HD SVG arenas, targeted combat VFX, real-flow LIVE showcase and LIVE/demo isolation OK.`);
