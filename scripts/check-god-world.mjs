import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games/tiktok-god-world');
const read = name => readFile(resolve(gameRoot, name), 'utf8');

const [index, sw, versionText, treeDepth, living, battle, music, game, generator, packageJson] = await Promise.all([
  read('index.html'),
  read('sw.js'),
  read('version.json'),
  read('tree-depth.js'),
  read('living-kingdoms-v65.js'),
  read('v661-battle-stability.js'),
  read('music.js'),
  read('game.js'),
  read('tools/generate_world_v2.py'),
  readFile(resolve(root, 'package.json'), 'utf8')
]);

const version = JSON.parse(versionText);
if (version.version !== 'stable-integrated-1') throw new Error(`Expected stable-integrated-1, found ${version.version}`);
if (version.marker !== 'god-world-stable-integrated-single-authority') throw new Error('Stable integrated marker missing');
if (!index.includes('STABLE INTEGRATED')) throw new Error('Stable visible build identity missing');
if (index.includes(' autoplay')) throw new Error('Music must not autoplay during startup');
if (!/id="bgMusic"[^>]*preload="metadata"/.test(index)) throw new Error('Music must use metadata preload');
if (!sw.includes("const CACHE = 'god-world-stable-integrated-map-style-2'")) throw new Error('Map-style cache marker missing');

const expectedScripts = [
  'asset-recovery.js', 'game.js', 'tree-depth.js', 'lan-bridge.js', 'interface-v63.js',
  'world-effects.js', 'music.js', 'living-kingdoms-v65.js', 'v66-living-battles.js', 'v661-battle-stability.js'
];
for (const file of expectedScripts) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loads = (index.match(new RegExp(escaped, 'g')) || []).length;
  if (loads !== 1) throw new Error(`${file} must be loaded exactly once, found ${loads}`);
}

const forbiddenLayers = [
  'v651-ground-contact.js', 'v67-siege-legions.js', 'v671-mobile-stability.js', 'v672-join-hotfix.js',
  'runtime-v68.js', 'test-hotfix-v681.js', 'world-bootstrap.js', 'world-environment.js'
];
for (const file of forbiddenLayers) {
  if (index.includes(file)) throw new Error(`Unwanted runtime layer loaded by index.html: ${file}`);
  if (sw.includes(file)) throw new Error(`Unwanted runtime layer cached by sw.js: ${file}`);
  try {
    await access(resolve(gameRoot, file));
    throw new Error(`Unwanted runtime file still exists: ${file}`);
  } catch (error) {
    if (String(error?.message || '').startsWith('Unwanted runtime file')) throw error;
  }
}

const blobHeader = Buffer.from(`blob ${Buffer.byteLength(game)}\0`);
const coreBlobSha = createHash('sha1').update(blobHeader).update(game).digest('hex');
if (coreBlobSha !== '8c6b2fd651077a86e2622747a372d0d416eaabcf') {
  throw new Error(`Stable game.js core changed unexpectedly: ${coreBlobSha}`);
}

if (!treeDepth.includes('window.__TREE_DEPTH_PROMISE = null')) throw new Error('Vegetation may block JOIN');
if (!treeDepth.includes('window.__TREE_DEPTH_LOADING')) throw new Error('Background vegetation loading marker missing');
if (!treeDepth.includes('const MAX_WORLD_TREES = 124')) throw new Error('Requested proportional individual-tree limit missing');
if (!treeDepth.includes('const MIN_TARGET_TREES = 108')) throw new Error('Individual-tree target missing');

if (!living.includes("const VERSION = 'stable-integrated-1'")) throw new Error('Living authority version marker missing');
if (!living.includes('sim.__v65Installed = true')) throw new Error('V6.6 compatibility gate missing');
if (!living.includes('ensureStarterVillage')) throw new Error('Starter village integration missing');
if (!living.includes("const starter = ['house_a', 'house_b', 'farm']")) throw new Error('Starter buildings must be castle + two houses + farm');
if (!living.includes('keepCiviliansNeutral')) throw new Error('Neutral civilian safeguard missing');
if (!living.includes('groundBuilding(b, this.r, args[0])')) throw new Error('Building visibility/grounding repair missing');
if (living.includes('isLake') || living.includes('isFreshWater') || living.includes('nearFreshWater')) throw new Error('Unrequested freshwater gameplay system found');
if (!living.includes('__gwTickBusy')) throw new Error('Simulation tick overlap guard missing');

if (!battle.includes("const VERSION = 'stable-v66-safe-frame'")) throw new Error('Safe V6.6 battle frame missing');
if (!battle.includes("document.documentElement.dataset.battleSystem = 'stable-v66-safe-frame'")) throw new Error('Safe battle marker missing');
if (!battle.includes('infrastructure-required')) throw new Error('Military infrastructure spawn gate missing');
if (battle.includes('__gwLazyAnim') || battle.includes('processPhysicalCapture')) throw new Error('Risky post-JOIN battle runtime returned');

if (!music.includes("audio.preload = 'metadata'")) throw new Error('Gesture-safe music metadata preload missing');
if (music.includes('audio.load()')) throw new Error('Music must not force-load full track during startup');

const world = JSON.parse(await readFile(resolve(gameRoot, 'assets/map/world.json'), 'utf8'));
const vegetation = JSON.parse(await readFile(resolve(gameRoot, 'assets/map/vegetation.json'), 'utf8'));
if (world.gridW !== 88 || world.gridH !== 64) throw new Error(`Expanded map grid must be 88x64, found ${world.gridW}x${world.gridH}`);
if (world.mapWidth !== 3900 || world.mapHeight !== 1900) throw new Error(`Expanded map canvas must be 3900x1900, found ${world.mapWidth}x${world.mapHeight}`);
if (world.tileW !== 40 || world.tileH !== 20) throw new Error('Original 40x20 isometric tile style must be preserved');
if (world.version !== 'organic-v4-expanded-same-style') throw new Error('Same-style expanded map marker missing');
if (!Array.isArray(world.rivers) || world.rivers.length < 4) throw new Error('Expanded world must retain several rivers');
const allowedBiomes = new Set(['ocean','forest','grass','desert','beach','mountain','tundra','ice_coast']);
for (const row of world.biomes) for (const biome of row) if (!allowedBiomes.has(biome)) throw new Error( Unexpected biome/system introduced: ${biome}`);

// Count detached land components (main continent + requested islets).
const H = world.land.length, W = world.land[0].length;
const landSeen = new Set();
let landComponents = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const token = `${x},${y}`;
  if (!world.land[y][x] || landSeen.has(token)) continue;
  landComponents++;
  const stack = [[x,y]]; landSeen.add(token);
  while (stack.length) {
    const [cx,cy] = stack.pop();
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=cx+dx, ny=cy+dy, nt=`${nx},${ny}`;
      if (nx>=0&&ny>=0&&nx<W&&ny<H&&world.land[ny][nx]&&!landSeen.has(nt)) { landSeen.add(nt); stack.push([nx,ny]); }
    }
  }
}
if (landComponents < 4) throw new Error(`Expected a main landmass plus islets, found ${landComponents} land components`);

// Interior water is a lake automatically under the existing land/walkability rules; no new runtime system is required.
const oceanSeen = new Set();
const queue = [];
const pushOcean = (x,y) => { const t=`${x},${y}`; if (!world.land[y][x]&&!oceanSeen.has(t)) { oceanSeen.add(t); queue.push([x,y]); } };
for (let x=0;x<W;x++){ pushOcean(x,0); pushOcean(x,H-1); }
for (let y=0;y<H;y++){ pushOcean(0,y); pushOcean(W-1,y); }
for (let qi=0; qi<queue.length; qi++) {
  const [cx,cy]=queue[qi];
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx=cx+dx,ny=cy+dy;
    if(nx>=0&&ny>=0&&nx<W&&ny<H) pushOcean(nx,ny);
  }
}
let interiorWater=0;
for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(!world.land[y][x]&&!oceanSeen.has(`${x},${y}`))interiorWater++;
if (interiorWater < 30) throw new Error(`Expected visible inland lakes, found only ${interiorWater} interior-water cells`);

if (vegetation.version !== 'organic-v4-expanded-same-style') throw new Error('Vegetation must match same-style map generation');
if (!Array.isArray(vegetation.trees) || vegetation.trees.length < 500) throw new Error('Individual-tree source data is too sparse');

const png = await readFile(resolve(gameRoot, 'assets/map/world.png'));
if (png.toString('ascii',1,4) !== 'PNG') throw new Error('world.png is not a PNG');
const pngW = png.readUInt32BE(16), pngH = png.readUInt32BE(20);
if (pngW !== 3900 || pngH !== 1900) throw new Error(`world.png dimensions mismatch: ${pngW}x${pngH}`);

for (const marker of [
  "im=Image.new('RGB',(MAP_W,MAP_H),(24,70,104))",
  "'grass':((118,178,78),(103,160,69))",
  "'desert':((221,190,126),(202,166,102))",
  "'forest':((92,158,70),(78,139,62))"
]) if (!generator.includes(marker)) throw new Error(`Original visual palette marker missing from map generator: ${marker}`);
if (!generator.includes('GW,GH=88,64') || !generator.includes('MAP_W=3900') || !generator.includes('MAP_H=1900')) throw new Error('Expanded same-style generator dimensions missing');
if (generator.includes('world-bootstrap') || generator.includes('fetch =')) throw new Error('Map generation must not run as a browser runtime');

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

console.log(`TikTok God World stable: core unchanged, starter village visible, civilians neutral, same-style 88x64 map, ${interiorWater} lake cells, ${landComponents-1} islets, ${world.rivers.length} rivers, individual trees, no new runtime systems`);
