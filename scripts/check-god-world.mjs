import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games/tiktok-god-world');
const read = name => readFile(resolve(gameRoot, name), 'utf8');

const [index, sw, versionText, treeDepth, worldPolish, gameplayPolish, waterCameraFishing, waterPalette, farmerDirection, buildingScaleLock, packageJson] = await Promise.all([
  read('index.html'),
  read('sw.js'),
  read('version.json'),
  read('tree-depth.js'),
  read('v706-world-polish.js'),
  read('v707-gameplay-polish.js'),
  read('v708-water-camera-fishing.js'),
  read('v709-water-palette.js'),
  read('v710-farmer-direction.js'),
  read('v711-building-scale-lock.js'),
  readFile(resolve(root, 'package.json'), 'utf8')
]);

const version = JSON.parse(versionText);
if (version.version !== '6.6.2-startup-recovery') throw new Error(`Expected V6.6.2 stable core version, found ${version.version}`);
if (version.marker !== 'god-world-v662-resilient-assets-ios') throw new Error('V6.6.2 stable core marker missing');
if (!index.includes('V6.6.2 STABLE')) throw new Error('V6.6.2 STABLE UI marker missing');
if (!sw.includes("const CACHE = 'god-world-v7-1-1-building-scale-lock'")) throw new Error('V7.1.1 building-scale cache marker missing');
if (!worldPolish.includes("const VERSION = 'v706-world-polish-1'")) throw new Error('V7.0.6 world-polish runtime marker missing');
if (!gameplayPolish.includes("const VERSION = 'v707-gameplay-polish-3'")) throw new Error('V7.0.7 outside-buildAI runtime marker missing');
if (!waterCameraFishing.includes("const VERSION = 'v708-water-camera-two-boats-1'")) throw new Error('V7.0.8 water/camera/two-boats runtime marker missing');
if (!waterPalette.includes("const VERSION = 'v709-unified-water-palette-1'")) throw new Error('V7.0.9 unified-water runtime marker missing');
if (!farmerDirection.includes("const VERSION = 'v710-farmer-direction-stability-1'")) throw new Error('V7.1.0 farmer-direction runtime marker missing');
if (!buildingScaleLock.includes("const VERSION = 'v711-building-scale-lock-2'")) throw new Error('V7.1.1 building-scale runtime marker missing');
if (!treeDepth.includes("const VERSION = 'v706-sparse-user-pixel-flora-1'")) throw new Error('V7.0.6 sparse pixel flora marker missing');

const expectedScripts = [
  'v69-runtime-stability.js',
  'asset-recovery.js',
  'v705-world-npc-expansion.js',
  'game.js',
  'v706-world-polish.js',
  'tree-depth.js',
  'lan-bridge.js',
  'interface-v63.js',
  'world-effects.js',
  'music.js',
  'living-kingdoms-v65.js',
  'v651-ground-contact.js',
  'v66-living-battles.js',
  'v661-battle-stability.js',
  'construction-phases-v662-native-pixel.js',
  'v67-w1.js',
  'v67-w2.js',
  'v67-w3.js',
  'v67-w4.js',
  'v67-w5.js',
  'v67-w6.js',
  'v67-w7.js',
  'v67-assets-church.js',
  'v67-assets-port.js',
  'v67-pixel-buildings.js',
  'v68-fishing-asset.js',
  'v68-fishing-boats.js',
  'v70-war-peace-cleanup.js',
  'v707-gameplay-polish.js',
  'v708-water-camera-fishing.js',
  'v709-water-palette.js',
  'v710-farmer-direction.js',
  'v711-building-scale-lock.js'
];

for (const file of expectedScripts) {
  const loads = (index.match(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (loads !== 1) throw new Error(`${file} must be loaded exactly once by the current stable index, found ${loads}`);
}

const forbiddenLaterLayers = [
  'v67-siege-legions.js',
  'v671-mobile-stability.js',
  'v672-join-hotfix.js',
  'runtime-v68.js',
  'test-hotfix-v681.js'
];
for (const file of forbiddenLaterLayers) {
  if (index.includes(file)) throw new Error(`Forbidden obsolete layer must not be loaded: ${file}`);
  if (sw.includes(file)) throw new Error(`Forbidden obsolete layer must not be cached: ${file}`);
}

if (!treeDepth.includes('window.__TREE_DEPTH_PROMISE = install().catch')) throw new Error('Tree-depth startup promise marker missing');
if (!treeDepth.includes('window.__TREE_DEPTH_READY')) throw new Error('Tree-depth ready marker missing');
if (!treeDepth.includes('excludesSnowPine: true')) throw new Error('Snow-pine exclusion marker missing');
if (!worldPolish.includes('createTerrainCanvas')) throw new Error('Clean terrain rebuild marker missing');
if (!worldPolish.includes('installAnimationGovernor')) throw new Error('Farmer animation governor marker missing');
if (!gameplayPolish.includes('WORK_FRAME_MS')) throw new Error('Manual work-frame pacing marker missing');
if (!gameplayPolish.includes("{ type: 'windmill', after: 2 }")) throw new Error('Immediate free windmill milestone missing');
if (!gameplayPolish.includes("{ type: 'church', after: 5 }")) throw new Error('Immediate free church milestone missing');
if (!gameplayPolish.includes('grantFreeCivic')) throw new Error('Free civic grant function missing');
if (!gameplayPolish.includes('scheduleFoundingCivic')) throw new Error('Independent founding-civic scheduler missing');
if (!gameplayPolish.includes('installFoundingCivics')) throw new Error('Founding-civic JOIN integration missing');
if (!gameplayPolish.includes('sim.__v69TickBusy')) throw new Error('Civic grants must wait outside the normal simulation tick');
if (!gameplayPolish.includes('outsideBuildAI: true')) throw new Error('Outside-buildAI diagnostic marker missing');
if (gameplayPolish.includes('sim.buildAI =') || gameplayPolish.includes('originalBuildAI')) throw new Error('Gameplay polish must never wrap or replace the original buildAI');
if (!gameplayPolish.includes('removeWeaponOverlay')) throw new Error('Drawn-spear removal marker missing');

if (!waterCameraFishing.includes('const BOATS_PER_PORT = 2')) throw new Error('Each port must support exactly two fishing boats');
if (!waterCameraFishing.includes('const FISH_FOOD_PER_TRIP = 10')) throw new Error('Fishing return food reward missing');
if (!waterCameraFishing.includes('installWideRivers')) throw new Error('Wide river overlay missing');
if (!waterCameraFishing.includes('width: 15') || !waterCameraFishing.includes('width: 10')) throw new Error('Layered wider river strokes missing');
if (!waterCameraFishing.includes('installOceanBackdrop')) throw new Error('Ocean backdrop effect missing');
if (!waterCameraFishing.includes('installCameraClamp')) throw new Error('Camera bounds clamp missing');
if (!waterCameraFishing.includes('clamp(r.root.x, minX, 0)')) throw new Error('Pixi camera may still pan outside world bounds');
if (!waterCameraFishing.includes('installSecondFishingBoat')) throw new Error('Second fishing boat system missing');
if (!waterCameraFishing.includes('fishingRoute')) throw new Error('Second boat sea fishing route missing');
if (!waterCameraFishing.includes('rewardReturnedTrip')) throw new Error('Fishing boats must deliver food after returning to port');

if (!waterPalette.includes('recolorTerrain')) throw new Error('Unified-water terrain recolor missing');
if (!waterPalette.includes('recolorBackdrop')) throw new Error('Unified-water backdrop recolor missing');
if (!waterPalette.includes('0x2f7898')) throw new Error('Sea must use the same primary blue as the river');
if (!waterPalette.includes('0x4e9fba') || !waterPalette.includes('0x8bc5d2')) throw new Error('Sea highlight palette must match river layers');

if (!farmerDirection.includes('const LOOKAHEAD = 4')) throw new Error('Farmer route lookahead must inspect four upcoming cells');
if (!farmerDirection.includes('const OPPOSITE_HOLD_MS = 240')) throw new Error('Farmer opposite-direction anti-flip hold missing');
if (!farmerDirection.includes('routeVector')) throw new Error('Farmer route-vector direction resolver missing');
if (!farmerDirection.includes('stableDirection')) throw new Error('Farmer direction hysteresis missing');
if (!farmerDirection.includes('syntheticVector')) throw new Error('Farmer animation-facing vector stabilizer missing');
if (!farmerDirection.includes('Farmer position, pathfinding')) throw new Error('Farmer direction fix must leave physical movement untouched');

if (!buildingScaleLock.includes('const STABLE_LOCKED_WORLD_HEIGHT = 28 * 0.72')) throw new Error('Small stable canonical world-height lock missing');
if (!buildingScaleLock.includes("if (type === 'stable')")) throw new Error('Stable must use the green-circle canonical size');
if (!buildingScaleLock.includes('canonicalTexture')) throw new Error('Canonical base-texture scale resolver missing');
if (!buildingScaleLock.includes('normalizeBuilding')) throw new Error('Existing building scale normalization missing');
if (!buildingScaleLock.includes('normalizeAll')) throw new Error('Existing-map scale sweep missing');
if (!buildingScaleLock.includes('sprite.visible === false || sprite.renderable === false')) throw new Error('Scale lock must not disturb temporary construction stages');
if (buildingScaleLock.includes('sim.buildAI =') || buildingScaleLock.includes('originalBuildAI')) throw new Error('Building scale lock must not touch buildAI');

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
for (const entry of shellEntries) {
  if (entry === './') continue;
  await access(resolve(gameRoot, entry));
}

for (const atlasPart of [
  'assets/vegetation/flora-atlas.part0',
  'assets/vegetation/flora-atlas.part1',
  'assets/vegetation/flora-atlas.part2',
  'assets/vegetation/flora-atlas.part3'
]) {
  if (!sw.includes(`'${atlasPart}'`)) throw new Error(`Pixel flora atlas part missing from preload shell: ${atlasPart}`);
}

console.log('TikTok God World: stable buildAI + water/camera/fishing + farmer direction + canonical building scale lock OK');
