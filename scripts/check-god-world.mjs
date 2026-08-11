import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games/tiktok-god-world');
const read = name => readFile(resolve(gameRoot, name), 'utf8');

const [index, sw, runtime, treeDepth, packageJson] = await Promise.all([
  read('index.html'),
  read('sw.js'),
  read('runtime-v68.js'),
  read('tree-depth.js'),
  readFile(resolve(root, 'package.json'), 'utf8')
]);

const obsolete = [
  'living-kingdoms-v65.js',
  'v651-ground-contact.js',
  'v66-living-battles.js',
  'v661-battle-stability.js',
  'v67-siege-legions.js',
  'v671-mobile-stability.js',
  'v672-join-hotfix.js'
];

for (const file of obsolete) {
  if (index.includes(file)) throw new Error(`Obsolete God World patch still loaded by index.html: ${file}`);
  if (sw.includes(file)) throw new Error(`Obsolete God World patch still cached by sw.js: ${file}`);
}

const runtimeLoads = (index.match(/runtime-v68\.js/g) || []).length;
if (runtimeLoads !== 1) throw new Error(`runtime-v68.js must be loaded exactly once, found ${runtimeLoads}`);
if (!index.includes('V6.8 CONSOLIDATED')) throw new Error('V6.8 consolidated UI marker missing');
if (!/const\s+VERSION\s*=\s*['"]6\.8-consolidated-runtime['"]/.test(runtime)) throw new Error('V6.8 runtime marker missing');
if (/id=["']bgMusic["'][^>]*\bautoplay\b/i.test(index)) throw new Error('Background music must not autoplay during JOIN/startup');
if (!treeDepth.includes('window.__TREE_DEPTH_PROMISE = null')) throw new Error('Vegetation must not block JOIN/building creation');
if (!treeDepth.includes('window.__TREE_DEPTH_LOADING')) throw new Error('Vegetation background loading marker missing');
if (!sw.includes("'lan-bridge.js'")) throw new Error('Service worker shell must cache lan-bridge.js');

const definitions = [
  [/sim\.addBuilding\s*=\s*async\s+function/g, 'sim.addBuilding'],
  [/sim\.population\s*=\s*async\s+function/g, 'sim.population'],
  [/sim\.buildAI\s*=\s*async\s+function/g, 'sim.buildAI'],
  [/sim\.join\s*=\s*function/g, 'sim.join'],
  [/sim\.gift\s*=\s*function/g, 'sim.gift'],
  [/sim\.resolveWars\s*=\s*function/g, 'sim.resolveWars'],
  [/r\.updateWars\s*=\s*function/g, 'r.updateWars'],
  [/r\.damageBuilding\s*=\s*(?:function|[^;\n]*=>)/g, 'r.damageBuilding'],
  [/r\.destroyBuilding\s*=\s*function/g, 'r.destroyBuilding'],
  [/r\.redrawSettlementGround\s*=\s*function/g, 'r.redrawSettlementGround']
];
for (const [pattern, label] of definitions) {
  const count = (runtime.match(pattern) || []).length;
  if (count !== 1) throw new Error(`Consolidated runtime must define ${label} exactly once, found ${count}`);
}

if (!runtime.includes('__v68ScaleTimer')) throw new Error('Delayed large-prefab scale guard missing');
if (runtime.includes('setInterval(')) throw new Error('Consolidated runtime must not introduce recurring setInterval loops');

const pkg = JSON.parse(packageJson);
if (!String(pkg.scripts?.check || '').includes('check:god-world')) throw new Error('npm run check must include check:god-world');

const jsFiles = [
  'asset-recovery.js',
  'game.js',
  'tree-depth.js',
  'lan-bridge.js',
  'interface-v63.js',
  'world-effects.js',
  'music.js',
  'runtime-v68.js',
  'sw.js'
];
for (const file of jsFiles) {
  const full = resolve(gameRoot, file);
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

for (const asset of [
  'assets/vfx/fire-sheet.svg',
  'assets/vfx/blood-sheet.svg',
  'assets/vfx/impact-sheet.svg',
  'assets/vfx/destruction-sheet.svg',
  'assets/vegetation/pine.png',
  'assets/vegetation/pine-snow.png',
  'assets/vegetation/round.png'
]) await access(resolve(gameRoot, asset));

console.log('TikTok God World V6.8: one runtime, syntax, critical ownership, cache shell, assets and non-blocking JOIN checks OK');
