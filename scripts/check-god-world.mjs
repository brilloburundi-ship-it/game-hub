import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games/tiktok-god-world');
const read = name => readFile(resolve(gameRoot, name), 'utf8');

const [index, sw, versionText, treeDepth, living, battle, music, packageJson] = await Promise.all([
  read('index.html'),
  read('sw.js'),
  read('version.json'),
  read('tree-depth.js'),
  read('living-kingdoms-v65.js'),
  read('v661-battle-stability.js'),
  read('music.js'),
  readFile(resolve(root, 'package.json'), 'utf8')
]);

const version = JSON.parse(versionText);
if (version.version !== 'stable-integrated-1') throw new Error(`Expected stable-integrated-1, found ${version.version}`);
if (version.marker !== 'god-world-stable-integrated-single-authority') throw new Error('Integrated stable marker missing');
if (!index.includes('STABLE INTEGRATED')) throw new Error('Single visible build identity missing');
if (index.includes(' autoplay')) throw new Error('Music must not autoplay during startup');
if (!/id="bgMusic"[^>]*preload="metadata"/.test(index)) throw new Error('Music must use metadata preload');
if (!sw.includes("const CACHE = 'god-world-stable-integrated-1'")) throw new Error('Integrated service-worker cache marker missing');

const expectedScripts = [
  'asset-recovery.js',
  'game.js',
  'tree-depth.js',
  'lan-bridge.js',
  'interface-v63.js',
  'world-effects.js',
  'music.js',
  'living-kingdoms-v65.js',
  'v66-living-battles.js',
  'v661-battle-stability.js'
];
for (const file of expectedScripts) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loads = (index.match(new RegExp(escaped, 'g')) || []).length;
  if (loads !== 1) throw new Error(`${file} must be loaded exactly once, found ${loads}`);
}

const forbiddenLayers = [
  'v651-ground-contact.js',
  'v67-siege-legions.js',
  'v671-mobile-stability.js',
  'v672-join-hotfix.js',
  'runtime-v68.js',
  'test-hotfix-v681.js'
];
for (const file of forbiddenLayers) {
  if (index.includes(file)) throw new Error(`Obsolete layer still loaded by index.html: ${file}`);
  if (sw.includes(file)) throw new Error(`Obsolete layer still cached by sw.js: ${file}`);
}

if (!treeDepth.includes('window.__TREE_DEPTH_PROMISE = null')) throw new Error('Vegetation may still block JOIN/building creation');
if (!treeDepth.includes('window.__TREE_DEPTH_LOADING')) throw new Error('Background vegetation loading marker missing');
if (!treeDepth.includes('const MAX_WORLD_TREES = 96')) throw new Error('Sparse vegetation limit missing');

if (!living.includes("const VERSION = 'stable-integrated-1'")) throw new Error('Living authority version marker missing');
if (!living.includes("document.documentElement.dataset.runtime = 'stable-integrated-single-authority'")) throw new Error('Single living authority marker missing');
if (!living.includes('sim.__v65Installed = true')) throw new Error('V6.6 compatibility gate missing');
if (!living.includes('window.TikTokGodWorld')) throw new Error('Living authority must install only after base wire startup');
if (living.includes('originalGift') || living.includes('baseGift')) throw new Error('Gift resolver must not call a previous gift authority');
if ((living.match(/sim\.gift\s*=\s*function/g) || []).length !== 1) throw new Error('Gift authority must be defined exactly once in living module');
if ((living.match(/sim\.buildAI\s*=\s*async\s+function/g) || []).length !== 1) throw new Error('Build AI authority must be defined exactly once in living module');
if ((living.match(/sim\.population\s*=\s*async\s+function/g) || []).length !== 1) throw new Error('Population authority must be defined exactly once in living module');
if (!living.includes('__gwTickBusy')) throw new Error('Simulation tick overlap guard missing');
if (!living.includes('__gwPauseGuardsUntil')) throw new Error('JOIN guard-spawn pause missing');
if (!living.includes('rearBuildCell')) throw new Error('Wartime rear construction logic missing');

if (!battle.includes("const VERSION = 'stable-integrated-battles'")) throw new Error('Integrated battle authority marker missing');
if (!battle.includes("document.documentElement.dataset.battleSystem = 'stable-integrated-physical-siege'")) throw new Error('Physical siege marker missing');
if (!battle.includes('const SORT_INTERVAL = 0.14')) throw new Error('Mobile depth-sort throttle missing');
if (!battle.includes('__gwLazyAnim')) throw new Error('Lazy team soldier animation loading missing');
if (!battle.includes('processPhysicalCapture')) throw new Error('Physical army-driven conquest missing');
if (!battle.includes('BREAKTHROUGH_MIN_DEATHS')) throw new Error('Physical breakthrough loss gate missing');
for (const vfx of ['fire-sheet.svg', 'blood-sheet.svg', 'impact-sheet.svg', 'destruction-sheet.svg']) {
  if (!battle.includes(vfx)) throw new Error(`Battle VFX reference missing: ${vfx}`);
}
if (battle.includes('setInterval(')) throw new Error('Integrated battle authority must not create recurring setInterval loops');

if (!music.includes("audio.preload = 'metadata'")) throw new Error('Gesture-safe music metadata preload missing');
if (music.includes('audio.load()')) throw new Error('Music must not force-load the full track during startup');
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

console.log('TikTok God World stable-integrated-1: single authorities, non-blocking JOIN, gifts, physical siege, mobile throttles, cache shell and syntax checks OK');
