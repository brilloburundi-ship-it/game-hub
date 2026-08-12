import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games/tiktok-god-world');
const read = name => readFile(resolve(gameRoot, name), 'utf8');

const [index, sw, versionText, treeDepth, living, battle, music, bootstrap, environment, game, packageJson] = await Promise.all([
  read('index.html'), read('sw.js'), read('version.json'), read('tree-depth.js'), read('living-kingdoms-v65.js'),
  read('v661-battle-stability.js'), read('music.js'), read('world-bootstrap.js'), read('world-environment.js'), read('game.js'),
  readFile(resolve(root, 'package.json'), 'utf8')
]);

const version = JSON.parse(versionText);
if (version.version !== 'stable-integrated-1') throw new Error(`Expected stable-integrated-1, found ${version.version}`);
if (version.marker !== 'god-world-stable-integrated-single-authority') throw new Error('Integrated stable marker missing');
if (!index.includes('STABLE INTEGRATED')) throw new Error('Single visible build identity missing');
if (index.includes(' autoplay')) throw new Error('Music must not autoplay during startup');
if (!/id="bgMusic"[^>]*preload="metadata"/.test(index)) throw new Error('Music must use metadata preload');
if (!sw.includes("const CACHE = 'god-world-stable-integrated-large-water-1'")) throw new Error('Large-water service-worker cache marker missing');

const gameBytes = Buffer.from(game, 'utf8');
const gameBlobSha = createHash('sha1').update(`blob ${gameBytes.length}\0`).update(gameBytes).digest('hex');
if (gameBlobSha !== '8c6b2fd651077a86e2622747a372d0d416eaabcf') throw new Error(`Stable game.js core changed unexpectedly: ${gameBlobSha}`);

const expectedScripts = [
  'world-bootstrap.js', 'asset-recovery.js', 'game.js', 'tree-depth.js', 'lan-bridge.js', 'interface-v63.js',
  'world-effects.js', 'music.js', 'living-kingdoms-v65.js', 'world-environment.js', 'v66-living-battles.js', 'v661-battle-stability.js'
];
for (const file of expectedScripts) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loads = (index.match(new RegExp(escaped, 'g')) || []).length;
  if (loads !== 1) throw new Error(`${file} must be loaded exactly once, found ${loads}`);
}
if (!(index.indexOf('world-bootstrap.js') < index.indexOf('game.js'))) throw new Error('World bootstrap must load before the stable core');
if (!(index.indexOf('living-kingdoms-v65.js') < index.indexOf('world-environment.js'))) throw new Error('World environment must load after stable living authority');
if (!(index.indexOf('world-environment.js') < index.indexOf('v66-living-battles.js'))) throw new Error('World environment must load before battle support');

for (const file of ['v651-ground-contact.js','v67-siege-legions.js','v671-mobile-stability.js','v672-join-hotfix.js','runtime-v68.js','test-hotfix-v681.js']) {
  if (index.includes(file)) throw new Error(`Obsolete layer still loaded by index.html: ${file}`);
  if (sw.includes(file)) throw new Error(`Obsolete layer still cached by sw.js: ${file}`);
}

if (!treeDepth.includes('window.__TREE_DEPTH_PROMISE = null')) throw new Error('Vegetation may still block JOIN/building creation');
if (!treeDepth.includes('window.__TREE_DEPTH_LOADING')) throw new Error('Background vegetation loading marker missing');
if (!treeDepth.includes('const MAX_WORLD_TREES = 220')) throw new Error('Large-world individual-tree cap missing');
if (!treeDepth.includes("version: 'single-tree-large-world-v1'")) throw new Error('Individual-tree world marker missing');
if (!treeDepth.includes('instant = false')) throw new Error('Instant starter builds must not wait on chopping animation');

if (!living.includes("const VERSION = 'stable-integrated-1'")) throw new Error('Living authority version marker missing');
if (!living.includes("document.documentElement.dataset.runtime = 'stable-integrated-single-authority'")) throw new Error('Single living authority marker missing');
if (!living.includes('sim.__v65Installed = true')) throw new Error('V6.6 compatibility gate missing');
if (!living.includes('window.TikTokGodWorld')) throw new Error('Living authority must install only after base wire startup');
if (living.includes('originalGift') || living.includes('baseGift')) throw new Error('Gift resolver must not call a previous gift authority');
if ((living.match(/sim\.gift\s*=\s*function/g) || []).length !== 1) throw new Error('Gift authority must be defined exactly once');
if ((living.match(/sim\.buildAI\s*=\s*async\s+function/g) || []).length !== 1) throw new Error('Build AI authority must be defined exactly once');
if ((living.match(/sim\.population\s*=\s*async\s+function/g) || []).length !== 1) throw new Error('Population authority must be defined exactly once');
if (!living.includes('__gwTickBusy')) throw new Error('Simulation tick overlap guard missing');
if (!living.includes('__gwPauseGuardsUntil')) throw new Error('JOIN guard-spawn pause missing');
if (!living.includes('rearBuildCell')) throw new Error('Wartime rear construction logic missing');

if (!battle.includes("const VERSION = 'stable-v66-safe-frame'")) throw new Error('Safe V6.6 battle guard marker missing');
if (!battle.includes("document.documentElement.dataset.battleSystem = 'stable-v66-safe-frame'")) throw new Error('Safe battle-system marker missing');
if (!battle.includes('function hasMilitaryInfrastructure')) throw new Error('Military infrastructure gate missing');
if (!battle.includes('if (!hasMilitaryInfrastructure(k)) return null')) throw new Error('Soldiers may still spawn immediately after JOIN');
if (!battle.includes('window.__GW_LAST_RUNTIME_ERROR')) throw new Error('Runtime frame diagnostic marker missing');
if (!battle.includes('sim.update = function') || !battle.includes('r.updateWars = function') || !battle.includes('r.updateFx = function')) throw new Error('Safe frame wrappers missing');
for (const risky of ['installLazySoldiers','preloadPixelVfx','processPhysicalCapture']) if (battle.includes(risky)) throw new Error(`Risky battle feature active: ${risky}`);
if (battle.includes('setInterval(')) throw new Error('Battle stability layer must not create recurring intervals');

if (!bootstrap.includes("const VERSION = 'large-water-world-1'")) throw new Error('Large-water world bootstrap marker missing');
if (!bootstrap.includes('const GRID_W = 88, GRID_H = 64')) throw new Error('Enlarged 88x64 world grid missing');
if (!bootstrap.includes('const MAP_W = 4000, MAP_H = 1900')) throw new Error('Enlarged map canvas dimensions missing');
if (!bootstrap.includes('const islands = [[')) throw new Error('Small-island generation missing');
if (!bootstrap.includes('function chooseLakes')) throw new Error('Lake generation missing');
if (!bootstrap.includes('const rivers = []')) throw new Error('River generation missing');
if (!bootstrap.includes('function buildVegetation')) throw new Error('Individual-tree vegetation generation missing');
if (!/assets\\\/map\\\/world\\\.json/.test(bootstrap)) throw new Error('world.json interception missing');
if (!/assets\\\/map\\\/vegetation\\\.json/.test(bootstrap)) throw new Error('vegetation.json interception missing');
if (!/assets\\\/map\\\/world\\\.png/.test(bootstrap)) throw new Error('world.png interception missing');
if (!bootstrap.includes('window.__GW_WORLD_BOOTSTRAP')) throw new Error('World bootstrap diagnostic handle missing');

if (!environment.includes("const VERSION = 'stable-large-water-1'")) throw new Error('World environment version marker missing');
if (!environment.includes("const STARTER = ['house_a', 'house_b', 'farm']")) throw new Error('Starter village definition missing');
if (!environment.includes('const STARTER_TERRITORY_TARGET = 20')) throw new Error('Starter village build-room guarantee missing');
if (!environment.includes('renderer.__gwNeutralCivilians')) throw new Error('Neutral civilian palette guard missing');
if (!environment.includes("document.documentElement.dataset.civilians = 'neutral'")) throw new Error('Neutral civilian marker missing');
if (!environment.includes('sim.lakeSet') || !environment.includes('sim.nearFreshWater')) throw new Error('Fresh-water gameplay logic missing');
if (!environment.includes('freshFarms')) throw new Error('Fresh-water farm bonus missing');
if (!environment.includes('ensureStarterLand')) throw new Error('Starter build-room expansion missing');
if (!environment.includes('sim.__gwStarterJoinInstalled') || !environment.includes('seedStarterVillage')) throw new Error('Starter JOIN extension missing');
if (!environment.includes('sprite.renderable = true')) throw new Error('Building visibility recovery missing');
if (!environment.includes('sim.__gwStableLivingInstalled')) throw new Error('Environment may install before stable living authority');

const sandbox = {
  console, Response, setTimeout, clearTimeout,
  window: { fetch: async () => { throw new Error('Unexpected native fetch'); }, PIXI: { Assets: { load: async () => ({}) }, Texture: { from: value => value } } },
  document: { documentElement: { dataset: {} }, createElement: () => { throw new Error('Canvas should not be needed for data validation'); } }
};
sandbox.window.window = sandbox.window;
vm.runInNewContext(bootstrap, sandbox, { filename: 'world-bootstrap.js' });
const generated = sandbox.window.__GW_WORLD_BOOTSTRAP?.getWorld?.();
const vegetation = sandbox.window.__GW_WORLD_BOOTSTRAP?.getVegetation?.();
if (!generated) throw new Error('World bootstrap did not expose generated data');
if (generated.gridW !== 88 || generated.gridH !== 64 || generated.mapWidth !== 4000 || generated.mapHeight !== 1900) throw new Error('Unexpected generated world dimensions');
const landCount = generated.land.flat().filter(Boolean).length;
if (landCount < 3000) throw new Error(`Enlarged world has too little land: ${landCount}`);
if (!Array.isArray(generated.lakes) || generated.lakes.length < 40) throw new Error(`Not enough lake cells: ${generated.lakes?.length || 0}`);
if (!Array.isArray(generated.rivers) || generated.rivers.length < 3 || generated.rivers.some(path => path.length < 8)) throw new Error('Generated rivers missing or too short');
if (!vegetation?.trees || vegetation.trees.length < 1000) throw new Error(`Individual-tree source population too low: ${vegetation?.trees?.length || 0}`);
for (const [x,y] of [[9,10],[79,12],[78,56],[15,56]]) if (!generated.land?.[y]?.[x]) throw new Error(`Small-island land missing near ${x},${y}`);

if (!music.includes("audio.preload = 'metadata'")) throw new Error('Gesture-safe music metadata preload missing');
if (music.includes('audio.load()')) throw new Error('Music must not force-load full track during startup');
if (!music.includes("const unlockEvents = ['pointerdown', 'keydown']")) throw new Error('Gesture-safe music unlock missing');

const pkg = JSON.parse(packageJson);
if (!String(pkg.scripts?.check || '').includes('check:god-world')) throw new Error('npm run check must include check:god-world');

const jsFiles = [...expectedScripts, 'sw.js'];
for (const file of jsFiles) {
  const full = resolve(gameRoot, file);
  await access(full);
  const check = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`Invalid JavaScript in ${file}:\n${check.stderr || check.stdout}`);
}

const shellMatch = sw.match(/const SHELL = \[([\s\S]*?)\];/);
if (!shellMatch) throw new Error('Service worker SHELL list missing');
const shellEntries = [...shellMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
for (const entry of shellEntries) { if (entry !== './') await access(resolve(gameRoot, entry)); }
for (const roleFile of ['world-bootstrap.js','world-environment.js']) if (!shellEntries.includes(roleFile)) throw new Error(`${roleFile} must be cached by PWA`);
for (const oldMapAsset of ['assets/map/world.json','assets/map/world.png','assets/map/vegetation.json']) if (shellEntries.includes(oldMapAsset)) throw new Error(`Old static map asset must not control generated world: ${oldMapAsset}`);
for (const asset of ['assets/vegetation/pine.png','assets/vegetation/pine-snow.png','assets/vegetation/round.png']) await access(resolve(gameRoot, asset));

console.log(`TikTok God World stable-integrated-1 OK: core ${gameBlobSha}; ${generated.gridW}x${generated.gridH}; ${landCount} land; ${generated.lakes.length} lake cells; ${generated.rivers.length} rivers; ${vegetation.trees.length} source trees; starter village + neutral civilians; V6.6 safe battle frame`);
