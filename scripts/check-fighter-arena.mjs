import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../games/tiktok-fighter-arena');
const read=name=>readFileSync(resolve(root,name),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const must=name=>{const p=resolve(root,name);assert(existsSync(p),`Missing Fighter Arena file: ${name}`);return p};
const absent=name=>assert(!existsSync(resolve(root,name)),`Test-only Fighter Arena file must be removed: ${name}`);

const requiredFiles=[
  'version.json','index.html','bootstrap.js','game-v14.js','core.js','core-r18.js',
  'combat-v14.js','combat-v14-closer.js','combat-v14-layout-tune.js','arena-hd.js','idle-wait.js',
  'asset-effects.js','roster-gate-v14.js','vfx-combat-overlay.js','gift-tier-policy.js',
  'gift-instant-heal.js','like-critical-system-v14.js','tier-attack-balance.js',
  'asset-medieval-warrior-2.js','asset-medieval-warrior-3.js',
  'fighters-0.json','fighters-1.json','fighters-2.json','manifest-core.json','bridge/server.mjs'
];
for(const name of requiredFiles)must(name);
for(const name of ['auto-showcase.js','TEST_BRIDGE_JOIN.bat','_probe150.txt','_probe300.txt','_arena_import_status.txt'])absent(name);

const version=JSON.parse(read('version.json'));
const index=read('index.html');
const bootstrap=read('bootstrap.js');
const game=read('game-v14.js');
const coreProxy=read('core.js');
const core=read('core-r18.js');
const combat=read('combat-v14.js');
const combatLive=read('combat-v14-closer.js');
const combatLayout=read('combat-v14-layout-tune.js');
const bridge=read('bridge/server.mjs');
const arena=read('arena-hd.js');
const effects=read('asset-effects.js');
const manifest=JSON.parse(read('manifest-core.json'));
const fighters={...JSON.parse(read('fighters-0.json')),...JSON.parse(read('fighters-1.json')),...JSON.parse(read('fighters-2.json'))};

assert(version.version==='1.4.0','Fighter Arena release version must remain 1.4.0');
assert(index.includes('bootstrap.js?v=1.4.0'),'Fighter Arena bootstrap is not wired');
assert(index.includes('lan-bridge.js'),'TikFinity/LAN bridge wiring must be preserved');
assert(index.includes('round-announcer.js'),'3-2-1/FIGHT/KO announcer wiring must be preserved');
assert(index.includes('round-audio-sync.js'),'Round audio sync wiring must be preserved');
assert(index.includes('gift-tier-policy.js'),'Gift tier policy wiring must be preserved');
assert(index.includes('like-critical-system-v14.js'),'Like critical system wiring must be preserved');
assert(index.includes('combat-v14-layout-tune.js?v=1.0.1-unlimited-rounds'),'Unlimited-round combat entry is not active');
assert(!index.includes('auto-showcase.js'),'Auto showcase must not be loaded');
assert(!/demo=1|autotest|showcase=1|testStreamButton|data-test/.test(index),'Test/demo controls must not remain in index.html');

assert(bootstrap.includes("import('./game-v14.js?v=1.4.0')"),'Game runtime is not wired through bootstrap');
assert(game.includes("const VERSION='1.4.0'"),'game-v14.js version mismatch');
assert(game.includes("from'./core.js?v=1.4.0'"),'Game must use shared core');
assert(game.includes("from'./combat-v14.js?v=1.4.0'"),'Game must use mapped combat runtime');
assert(!/DEMO_NAMES|demoAllowed|scheduleDemo|demoEngage|startTestStream|stopTestStream|testStream|data-test|gift-small|gift-medium|gift-high|gift-legend|BridgeTest|START LIVE TEST|simulated viewers/i.test(game),'Automatic viewers or test donations remain in game runtime');
assert(!/testStream/.test(core),'Test stream state must not remain in shared core');
assert(!/\/bridge\/test|BridgeTest|lastTestAt|test endpoint/i.test(bridge),'Bridge test event endpoint must be removed');

assert(combat.includes("combat-v14-closer.js?v=1.4.3-unlimited-rounds"),'Fallback combat path must use unlimited rounds');
assert(combatLayout.includes("combat-v14-closer.js?v=1.4.3-unlimited-rounds"),'Layout wrapper does not target unlimited combat');
assert(combatLive.includes('S.clock=Infinity'),'Live combat must switch to an unlimited round after countdown');
assert(!combatLive.includes('S.clock=90'),'90-second round limit must be removed');
assert(!combatLive.includes('S.clock=Math.max(0,S.clock-dt)'),'Fight clock must not count down');
assert(!/if\(S\.clock<=0&&!a\.dead&&!b\.dead\)/.test(combatLive),'Timeout winner selection must be removed');
assert(combatLive.includes("if(d.hp<=0){d.hp=0;d.dead=true"),'Rounds must still finish on actual KO');
assert(combatLive.includes('deathDuration'),'Death animation duration gate missing');
assert(combatLive.includes('loser.time>=need+.22'),'Next challenger must wait for completed death animation');
assert(combatLive.includes('finally{requestAnimationFrame(loop)}'),'Combat frame loop must remain self-healing');

const expectedArenaIds=['sky_dojo','ice_crystal','arcane_ruins','desert_moon','neon_city','jungle_temple','volcanic_ring','celestial_citadel'];
assert(manifest.arenas.length===8,'Expected eight Fighter Arena scenes');
assert(new Set(manifest.arenas.map(a=>a.id)).size===8,'Arena ids must be unique');
assert(JSON.stringify(manifest.arenas.map(a=>a.id))===JSON.stringify(expectedArenaIds),'Arena rotation changed unexpectedly');
assert(arena.includes('renderArenaHD'),'Retina HD arena renderer missing');
for(const id of expectedArenaIds)must(`assets/arenas/${id}.svg`);

const baseIds=[
  'street_mon','hero_knight','evil_wizard','huntress','martial_hero','medieval_king',
  'martial_champion','evil_wizard_2','samurai','hero_knight_prime','fantasy_warrior',
  'huntress_2','samurai_ronin','samurai_archer','samurai_commander','fire_wizard',
  'lightning_mage','wanderer_magician'
];
const requiredIds=[...baseIds,'medieval_warrior_2','medieval_warrior_3'];
const rosterMatch=game.match(/const ROSTER=\{([\s\S]*?)\};\s*const ALL_ROSTER=/);
assert(rosterMatch,'Unable to read Fighter Arena roster');
const rosterIds=[...rosterMatch[1].matchAll(/'([a-z0-9_]+)'/g)].map(m=>m[1]);
assert(rosterIds.length===20,`Expected 20 roster slots, found ${rosterIds.length}`);
assert(new Set(rosterIds).size===20,'Roster ids must be unique');
for(const id of requiredIds)assert(rosterIds.includes(id),`${id} missing from selection pools`);
assert(Object.keys(fighters).length===18,`Expected 18 base fighter definitions, found ${Object.keys(fighters).length}`);
for(const id of baseIds){
  const f=fighters[id];assert(f,`Missing base fighter ${id}`);assert(f.atlas,`${id}: missing atlas`);
  for(const a of ['idle','run','attack1','hurt'])assert(f.animations?.[a],`${id}: missing ${a}`);
}
assert(coreProxy.includes('ACTIVE_R20'),'Shared core fighter allow-list missing');
for(const id of requiredIds)assert(coreProxy.includes(`'${id}'`),`${id} missing from core allow-list`);

assert(game.includes('atlasFits'),'Sprite atlas geometry validation missing');
assert(game.includes('scheduleRecovery'),'Missing atlas recovery loop');
assert((effects.match(/data:image\/png;base64,/g)||[]).length===8,'Expected eight original Effects pack spritesheets');
for(const name of ['dust-dash.b64','sword-slash.b64','fire-ball.b64','lightning-bolt.b64','thunder-ultimate.b64','blood-impact-atlas.b64'])must(`assets/vfx/${name}`);

for(const name of [
  'game-v14.js','core.js','core-r18.js','combat-v14.js','combat-v14-closer.js','combat-v14-layout-tune.js',
  'vfx-combat-overlay.js','arena-hd.js','idle-wait.js','asset-effects.js','roster-gate-v14.js',
  'bootstrap.js','gift-tier-policy.js','gift-instant-heal.js','like-critical-system-v14.js',
  'tier-attack-balance.js','bridge/server.mjs','asset-medieval-warrior-2.js','asset-medieval-warrior-3.js'
]){
  const r=spawnSync(process.execPath,['--check',resolve(root,name)],{encoding:'utf8'});
  assert(r.status===0,`${name} syntax check failed: ${r.stderr||r.stdout}`);
}

console.log('Fighter Arena LIVE-only check OK: no simulated viewers/test donations, unlimited KO-only rounds, 20 fighters and 8 arenas verified');
