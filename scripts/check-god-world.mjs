import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games/tiktok-god-world');
const read = name => readFile(resolve(gameRoot, name), 'utf8');

const [index, sw, versionText, worldShape, visuals, gameplay, waterBase, farmerDirection, buildingScale, construction, fishingBoats, packageJson] = await Promise.all([
  read('index.html'), read('sw.js'), read('version.json'),
  read('latest/world-shape.js'), read('latest/visuals.js'), read('latest/gameplay.js'),
  read('latest/water-base.js'), read('latest/farmer-direction.js'), read('latest/building-scale.js'),
  read('construction-phases-v662-native-pixel.js'), read('v68-fishing-boats.js'),
  readFile(resolve(root, 'package.json'), 'utf8')
]);

const version = JSON.parse(versionText);
if (version.version !== '6.6.2-startup-recovery') throw new Error(`Expected stable core 6.6.2, found ${version.version}`);
if (!index.includes('V7.1.2 LATEST')) throw new Error('V7.1.2 LATEST UI marker missing');
if (!index.includes("window.__GOD_WORLD_RELEASE='7.1.2-latest'")) throw new Error('Single latest release marker missing');
if (!sw.includes("const CACHE = 'god-world-v7-1-2-latest-only'")) throw new Error('Latest-only cache marker missing');

const forbiddenActivePatchPaths = [
  'v69-runtime-stability.js', 'v705-world-npc-expansion.js', 'v706-world-polish.js', 'tree-depth.js',
  'v70-war-peace-cleanup.js', 'v707-gameplay-polish.js', 'v708-water-camera-fishing.js',
  'v709-water-palette.js', 'v710-farmer-direction.js', 'v711-building-scale-lock.js'
];
for (const file of forbiddenActivePatchPaths) {
  if (index.includes(`src="${file}`)) throw new Error(`Old patch path must not be actively loaded: ${file}`);
  if (sw.includes(`'${file}'`)) throw new Error(`Old patch path must not be in latest cache shell: ${file}`);
}

const latestScripts = [
  'latest/runtime-stability.js', 'latest/world-npc-expansion.js', 'latest/world-base.js',
  'latest/world-shape.js', 'latest/flora-loader.js', 'latest/war-peace-cleanup.js',
  'latest/gameplay.js', 'latest/water-base.js', 'latest/visuals.js',
  'latest/farmer-direction.js', 'latest/building-scale.js'
];
for (const file of latestScripts) {
  const loads = (index.match(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (loads !== 1) throw new Error(`${file} must be loaded exactly once, found ${loads}`);
  if (!sw.includes(`'${file}'`)) throw new Error(`${file} missing from latest cache shell`);
}
if (!sw.includes("'latest/flora.js'")) throw new Error('Latest flora payload missing from cache shell');
if (!index.includes('v68-fishing-boats.js?v=20260813-1236-v712')) throw new Error('Primary fishing boat runtime must stay active');
if (!sw.includes("'v68-fishing-boats.js'")) throw new Error('Primary fishing boat runtime missing from cache shell');

const token = '20260813-1236-v712';
const localScriptSrcs = [...index.matchAll(/<script src="(?!https?:\/\/)([^"]+)"/g)].map(m => m[1]);
for (const src of localScriptSrcs) if (!src.includes(`v=${token}`)) throw new Error(`Local script is not pinned to the one V7.1.2 release token: ${src}`);

if (!worldShape.includes("const VERSION = 'v712-latest-world-shape-1'")) throw new Error('Rounded latest-world marker missing');
if (!worldShape.includes('const rx = halfX * .76, ry = halfY * .88')) throw new Error('Organic island silhouette ratios missing');
if (!worldShape.includes('function sculptCoast')) throw new Error('Multi-pass coast sculpting missing');
if (!worldShape.includes('for (let pass = 0; pass < 4; pass++)')) throw new Error('Coast sculpting must use four erosion passes');
if (!worldShape.includes('function growCoastalTerrain')) throw new Error('Connected coast terrain growth missing');
if (!worldShape.includes('state.coastAdded = growCoastalTerrain(land, biomes)')) throw new Error('Added coastal terrain must be part of the real land mask');
if (!worldShape.includes('function neighbourBiome')) throw new Error('New coastal terrain biome continuity missing');
if (!worldShape.includes('function bell')) throw new Error('Deliberate bay/headland shaping missing');
if (!worldShape.includes('const bays =')) throw new Error('Bay profile missing from island generator');
if (!worldShape.includes('pathFor(w, loops(w.land), d, 18, 31)')) throw new Error('Rendered coastline must strongly break straight isometric runs');
if (!worldShape.includes('quadraticCurveTo')) throw new Error('Smooth curved terrain rivers/coasts missing');
if (!worldShape.includes('recomputeCoast')) throw new Error('Coast-distance recomputation missing after reshaping');
if (!worldShape.includes('function extendRiverToSea')) throw new Error('River-to-sea extension missing');
if (!worldShape.includes('for (let extra = 0; extra < 3; extra++)')) throw new Error('River mouth must continue several cells into open sea');
if (!worldShape.includes('state.riverMouths++')) throw new Error('River mouth completion marker missing');
if (!worldShape.includes('sim.riverSet.clear()')) throw new Error('River collision set must follow reshaped world');

if (!visuals.includes("const VERSION='v712-latest-visuals-1'")) throw new Error('Latest visual layer marker missing');
if (!visuals.includes('quadraticCurveTo')) throw new Error('Smooth wide-river overlay missing');
if (!visuals.includes('0x2f7898') || !visuals.includes('0x4e9fba') || !visuals.includes('0x8bc5d2')) throw new Error('Unified sea/river palette missing');
if (!visuals.includes('function splitRiver')) throw new Error('River land/sea visual split missing');
if (!visuals.includes('seaCleaner.stroke({color:0x2f7898,width:24,alpha:1})')) throw new Error('Open-sea river-line cleanup missing');
if (!visuals.includes('state.seaRiverSuppressed=true')) throw new Error('Sea river suppression diagnostic missing');

if (!construction.includes("version:'v662-native-pixel-3'")) throw new Error('Construction palette-safe revision missing');
if (!construction.includes('kingdomStageTextureSource:true')) throw new Error('Construction stages must use kingdom-coloured prefab source');
if (!construction.includes('function kingdomFrames')) throw new Error('Per-kingdom construction frame generation missing');
if (!construction.includes('renderer?.textureToCanvas?.(sprite?.texture)')) throw new Error('Construction stages must derive from the completed kingdom texture');
if (!construction.includes('return recolorTeamCanvas(canvas,color)')) throw new Error('Construction team-palette fallback missing');

if (!gameplay.includes('WORK_FRAME_MS')) throw new Error('Worker animation smoothing missing');
if (!gameplay.includes("{ type: 'windmill', after: 2 }") || !gameplay.includes("{ type: 'church', after: 5 }")) throw new Error('Free founding civics missing');
if (!gameplay.includes('const LIKE_SUPPORT_PER = 0.22')) throw new Error('Like development support strength missing');
if (!gameplay.includes('const ROSE_SUPPORT_PER = 3.5')) throw new Error('Rose development support strength missing');
if (!gameplay.includes('function installViewerDevelopmentSupport')) throw new Error('Viewer development support integration missing');
if (!gameplay.includes('function applySupportEconomy')) throw new Error('Persistent viewer economy acceleration missing');
if (!gameplay.includes('k.lastBuild -= 0.55 * strength')) throw new Error('Viewer support must accelerate normal construction cadence');

// LIVE interaction safeguards: every interaction tier must now affect real kingdom power.
if (!gameplay.includes("const VERSION = 'v712-engagement-recovery-1'")) throw new Error('Targeted engagement/recovery layer missing');
if (!gameplay.includes('const LIKE_POWER_PER = 0.035')) throw new Error('Contained LIKE power contribution missing');
if (!gameplay.includes('function giftPower')) throw new Error('Gift-to-power tier resolver missing');
if (!gameplay.includes('k.military += power')) throw new Error('All gifts must contribute to real kingdom power');
if (!gameplay.includes('const BIG_CITY_GIFTS')) throw new Error('High-gift big-help classification missing');
if (!gameplay.includes('const BIG_CITY_TYPES')) throw new Error('Powerful instant city building pack missing');
if (!gameplay.includes('function buildPowerCity')) throw new Error('High gifts must be able to build an immediate powerful city');
if (!gameplay.includes("'church', 'windmill', 'watchtower', 'stone_tower', 'port'")) throw new Error('Big-help city must include late civic/military/port structures');

// Windmill and port recovery are deliberately independent from normal development.
if (!gameplay.includes('function installWindmillRecovery')) throw new Error('Windmill animation recovery missing');
if (!gameplay.includes('now - h.changedAt > 1050')) throw new Error('Static-only windmill recovery guard missing');
if (!gameplay.includes('Math.floor(b.__v712WindClock / 0.18)')) throw new Error('Recovered windmill animation cadence missing');
if (!gameplay.includes('function installPortRecovery')) throw new Error('Independent port recovery missing');
if (!gameplay.includes('function buildIndependentPort')) throw new Error('Independent port builder missing');
if (!gameplay.includes('const PORT_COST = { wood: 90, stone: 24, gold: 12 }')) throw new Error('Port resource rule missing');
if (gameplay.includes('sim.buildAI =') || gameplay.includes('originalBuildAI')) throw new Error('Latest gameplay must not wrap buildAI');

// Existing fishing pipeline must still provide one primary plus one secondary boat.
if (!fishingBoats.includes('renderer.__v68FishingBoats=boats')) throw new Error('Primary fishing boat registry missing');
if (!fishingBoats.includes('fishingLoop:true') || !fishingBoats.includes('returnToPort:true')) throw new Error('Primary fishing boat work loop missing');
if (!waterBase.includes('const BOATS_PER_PORT = 2')) throw new Error('Two fishing boats per port rule missing');
if (!waterBase.includes('installSecondFishingBoat(sim)')) throw new Error('Second fishing boat system missing');
if (!waterBase.includes('api.getFishingBoatCount')) throw new Error('Fishing boat count diagnostic missing');

// Civilians keep the stable facing fix, but now use smooth fractional presentation and dispersed targets.
if (!farmerDirection.includes('const LOOKAHEAD = 4') || !farmerDirection.includes('const OPPOSITE_HOLD_MS = 240')) throw new Error('Farmer direction stability missing');
if (!farmerDirection.includes('const WALK_ANIMATION_SPEED = 0.11')) throw new Error('Smooth civilian walk cadence missing');
if (!farmerDirection.includes('function installAntiTrainTargets')) throw new Error('Farmer anti-train target distribution missing');
if (!farmerDirection.includes('function spreadTaskTarget')) throw new Error('Farmer target spreading missing');
if (!farmerDirection.includes('sprite.roundPixels = false')) throw new Error('Farmer fractional-pixel walking missing');
if (!farmerDirection.includes('Math.exp(-30 * dt)')) throw new Error('Farmer display interpolation missing');

if (!buildingScale.includes('const MARKET_LOCKED_WORLD_HEIGHT = 24')) throw new Error('Reduced market scale lock missing');
if (!buildingScale.includes('const STABLE_LOCKED_WORLD_HEIGHT = 28 * 0.72')) throw new Error('Stable scale lock missing');

const pkg = JSON.parse(packageJson);
if (!String(pkg.scripts?.check || '').includes('check:god-world')) throw new Error('npm run check must include check:god-world');

const syntaxFiles = [...latestScripts, 'latest/flora.js', 'construction-phases-v662-native-pixel.js', 'v68-fishing-boats.js', 'sw.js'];
for (const file of syntaxFiles) {
  const full = resolve(gameRoot, file);
  await access(full);
  const check = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`Invalid JavaScript in ${file}:\n${check.stderr || check.stdout}`);
}

const shellMatch = sw.match(/const SHELL = \[([\s\S]*?)\];/);
if (!shellMatch) throw new Error('Service worker SHELL list missing');
for (const entry of [...shellMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1])) {
  if (entry === './') continue;
  await access(resolve(gameRoot, entry));
}

console.log('TikTok God World: V7.1.2 latest-only + LIVE power/big-help + windmill/port/2-boats recovery + smooth anti-train civilians OK');
