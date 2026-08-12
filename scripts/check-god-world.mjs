import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games/tiktok-god-world');
const read = name => readFile(resolve(gameRoot, name), 'utf8');

const [index, sw, versionText, treeDepth, packageJson] = await Promise.all([
  read('index.html'),
  read('sw.js'),
  read('version.json'),
  read('tree-depth.js'),
  readFile(resolve(root, 'package.json'), 'utf8')
]);

const version = JSON.parse(versionText);
if (version.version !== '6.6.2-startup-recovery') throw new Error(`Expected V6.6.2 stable version, found ${version.version}`);
if (version.marker !== 'god-world-v662-resilient-assets-ios') throw new Error('V6.6.2 stable marker missing');
if (!index.includes('V6.6.2 STABLE')) throw new Error('V6.6.2 STABLE UI marker missing');
if (!sw.includes("const CACHE = 'god-world-v6-6-2-startup-recovery'")) throw new Error('V6.6.2 service-worker cache marker missing');

const expectedScripts = [
  'asset-recovery.js',
  'game.js',
  'tree-depth.js',
  'lan-bridge.js',
  'interface-v63.js',
  'world-effects.js',
  'music.js',
  'living-kingdoms-v65.js',
  'v651-ground-contact.js',
  'v66-living-battles.js',
  'v661-battle-stability.js'
];

for (const file of expectedScripts) {
  const loads = (index.match(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (loads !== 1) throw new Error(`${file} must be loaded exactly once by the V6.6.2 stable index, found ${loads}`);
}

const forbiddenLaterLayers = [
  'v67-siege-legions.js',
  'v671-mobile-stability.js',
  'v672-join-hotfix.js',
  'runtime-v68.js',
  'test-hotfix-v681.js'
];
for (const file of forbiddenLaterLayers) {
  if (index.includes(file)) throw new Error(`Post-V6.6.2 layer must not be loaded: ${file}`);
  if (sw.includes(file)) throw new Error(`Post-V6.6.2 layer must not be cached: ${file}`);
}

if (!treeDepth.includes('window.__TREE_DEPTH_PROMISE = null')) throw new Error('V6.6.2 vegetation must remain non-blocking during JOIN/building creation');
if (!treeDepth.includes('window.__TREE_DEPTH_LOADING')) throw new Error('V6.6.2 vegetation background loading marker missing');

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

console.log('TikTok God World V6.6.2 STABLE: exact runtime stack, syntax, cache shell and non-blocking startup checks OK');
