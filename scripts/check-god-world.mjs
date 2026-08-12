import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games/tiktok-god-world');
const read = name => readFile(resolve(gameRoot, name), 'utf8');

const [index, sw, versionText, treeDepth, worldPolish, gameplayPolish, packageJson] = await Promise.all([
  read('index.html'),
  read('sw.js'),
  read('version.json'),
  read('tree-depth.js'),
  read('v706-world-polish.js'),
  read('v707-gameplay-polish.js'),
  readFile(resolve(root, 'package.json'), 'utf8')
]);

const version = JSON.parse(versionText);
if (version.version !== '6.6.2-startup-recovery') throw new Error(`Expected V6.6.2 stable core version, found ${version.version}`);
if (version.marker !== 'god-world-v662-resilient-assets-ios') throw new Error('V6.6.2 stable core marker missing');
if (!index.includes('V6.6.2 STABLE')) throw new Error('V6.6.2 STABLE UI marker missing');
if (!sw.includes("const CACHE = 'god-world-v7-0-7-free-civics'")) throw new Error('V7.0.7 free-civics service-worker cache marker missing');
if (!worldPolish.includes("const VERSION = 'v706-world-polish-1'")) throw new Error('V7.0.6 world-polish runtime marker missing');
if (!gameplayPolish.includes("const VERSION = 'v707-gameplay-polish-2'")) throw new Error('V7.0.7 free-civics runtime marker missing');
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
  'v707-gameplay-polish.js'
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
if (!gameplayPolish.includes("{ type: 'church', after: 4 }")) throw new Error('Immediate free church milestone missing');
if (!gameplayPolish.includes('buildFreeCivic')) throw new Error('Free civic builder missing');
if (!gameplayPolish.includes('k.lastBuild = previousLastBuild')) throw new Error('Free civics must preserve normal build timer');
if (!gameplayPolish.includes('return originalBuildAI(k)')) throw new Error('Normal build AI continuation missing');
if (!gameplayPolish.includes('nonBlocking: true')) throw new Error('Non-blocking civic marker missing');
if (!gameplayPolish.includes('removeWeaponOverlay')) throw new Error('Drawn-spear removal marker missing');

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

console.log('TikTok God World: stable core + free non-blocking windmill/church + worker/combat polish stack OK');
