import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games/tiktok-god-world');
const read = name => readFile(resolve(gameRoot, name), 'utf8');

const [index, sw, versionText, worldShape, visuals, gameplay, farmerDirection, buildingScale, packageJson] = await Promise.all([
  read('index.html'), read('sw.js'), read('version.json'),
  read('latest/world-shape.js'), read('latest/visuals.js'), read('latest/gameplay.js'),
  read('latest/farmer-direction.js'), read('latest/building-scale.js'),
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

const token = '20260813-1236-v712';
const localScriptSrcs = [...index.matchAll(/<script src="(?!https?:\/\/)([^"]+)"/g)].map(m => m[1]);
for (const src of localScriptSrcs) if (!src.includes(`v=${token}`)) throw new Error(`Local script is not pinned to the one V7.1.2 release token: ${src}`);

if (!worldShape.includes("const VERSION = 'v712-latest-world-shape-1'")) throw new Error('Rounded latest-world marker missing');
if (!worldShape.includes('const rx=halfX*.80,ry=halfY*.92')) throw new Error('Island silhouette ratios missing');
if (!worldShape.includes('sculptCoast')) throw new Error('Organic coast sculpting missing');
if (!worldShape.includes('extendRiverToSea')) throw new Error('River-to-sea continuation missing');
if (!worldShape.includes('state.riverMouths++')) throw new Error('River mouth completion marker missing');
if (!worldShape.includes('quadraticCurveTo')) throw new Error('Smooth curved terrain rivers missing');
if (!worldShape.includes('recomputeCoast')) throw new Error('Coast-distance recomputation missing after reshaping');
if (!worldShape.includes('sim.riverSet.clear()')) throw new Error('River collision set must follow reshaped world');

if (!visuals.includes("const VERSION='v712-latest-visuals-1'")) throw new Error('Latest visual layer marker missing');
if (!visuals.includes('quadraticCurveTo')) throw new Error('Smooth wide-river overlay missing');
if (!visuals.includes('riverMouthBlend')) throw new Error('River mouth blend into sea missing');
if (!visuals.includes('0x2f7898') || !visuals.includes('0x4e9fba') || !visuals.includes('0x8bc5d2')) throw new Error('Unified sea/river palette missing');

if (!gameplay.includes('WORK_FRAME_MS')) throw new Error('Worker animation smoothing missing');
if (!gameplay.includes("{ type: 'windmill', after: 2 }") || !gameplay.includes("{ type: 'church', after: 5 }")) throw new Error('Free founding civics missing');
if (gameplay.includes('sim.buildAI =') || gameplay.includes('originalBuildAI')) throw new Error('Latest gameplay must not wrap buildAI');
if (!farmerDirection.includes('const LOOKAHEAD = 4') || !farmerDirection.includes('const OPPOSITE_HOLD_MS = 240')) throw new Error('Farmer direction stability missing');
if (!buildingScale.includes('const MARKET_LOCKED_WORLD_HEIGHT = 24')) throw new Error('Reduced market scale lock missing');
if (!buildingScale.includes('const STABLE_LOCKED_WORLD_HEIGHT = 28 * 0.72')) throw new Error('Stable scale lock missing');

const pkg = JSON.parse(packageJson);
if (!String(pkg.scripts?.check || '').includes('check:god-world')) throw new Error('npm run check must include check:god-world');

const syntaxFiles = [...latestScripts, 'latest/flora.js', 'sw.js'];
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

console.log('TikTok God World: V7.1.2 latest-only + organic island coasts + rivers joined to sea OK');
