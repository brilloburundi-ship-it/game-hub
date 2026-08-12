import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games/tiktok-god-world');
const read = name => readFile(resolve(gameRoot, name), 'utf8');

const [index, sw, versionText, treeDepth, living, battle, safeFrame, construction, music, game, generator, packageJson] = await Promise.all([
  read('index.html'), read('sw.js'), read('version.json'), read('tree-depth.js'),
  read('living-kingdoms-v65.js'), read('v66-living-battles.js'), read('v661-battle-stability.js'), read('construction-visuals-v67.js'),
  read('music.js'), read('game.js'), read('tools/generate_world_v2.py'), readFile(resolve(root, 'package.json'), 'utf8')
]);

const version = JSON.parse(versionText);
if (version.version !== 'stable-integrated-1') throw new Error(`Expected stable-integrated-1, found ${version.version}`);
if (version.marker !== 'god-world-stable-integrated-single-authority') throw new Error('Stable marker missing');
if (!index.includes('STABLE INTEGRATED')) throw new Error('Visible stable identity missing');
if (index.includes(' autoplay')) throw new Error('Music must not autoplay');
if (!/id="bgMusic"[^>]*preload="metadata"/.test(index)) throw new Error('Music preload must remain metadata');
if (!sw.includes("const CACHE = 'god-world-stable-integrated-construction-v4'")) throw new Error('Construction cache marker missing');

const expectedScripts = [
  'asset-recovery.js','game.js','tree-depth.js','lan-bridge.js','interface-v63.js','world-effects.js','music.js',
  'living-kingdoms-v65.js','v66-living-battles.js','v661-battle-stability.js','construction-visuals-v67.js'
];
for (const file of expectedScripts) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loads = (index.match(new RegExp(escaped, 'g')) || []).length;
  if (loads !== 1) throw new Error(`${file} must load exactly once, found ${loads}`);
}

const forbidden = ['v651-ground-contact.js','v67-siege-legions.js','v671-mobile-stability.js','v672-join-hotfix.js','runtime-v68.js','test-hotfix-v681.js','world-bootstrap.js','world-environment.js'];
for (const file of forbidden) {
  if (index.includes(file) || sw.includes(file)) throw new Error(`Unwanted runtime referenced: ${file}`);
  try { await access(resolve(gameRoot, file)); throw new Error(`Unwanted runtime file exists: ${file}`); }
  catch (error) { if (String(error?.message || '').startsWith('Unwanted runtime')) throw error; }
}

const blobHeader = Buffer.from(`blob ${Buffer.byteLength(game)}\0`);
const coreBlobSha = createHash('sha1').update(blobHeader).update(game).digest('hex');
if (coreBlobSha !== '8c6b2fd651077a86e2622747a372d0d416eaabcf') throw new Error(`Stable game.js core changed: ${coreBlobSha}`);

if (!treeDepth.includes('window.__TREE_DEPTH_PROMISE = null')) throw new Error('Vegetation may block JOIN');
if (!treeDepth.includes('window.__TREE_DEPTH_LOADING')) throw new Error('Background vegetation marker missing');
if (!treeDepth.includes('const MAX_WORLD_TREES = 124')) throw new Error('Individual-tree cap missing');
if (!treeDepth.includes('const MIN_TARGET_TREES = 108')) throw new Error('Individual-tree target missing');

if (!living.includes("const VERSION = 'stable-integrated-1'")) throw new Error('Stable living controller missing');
if (!living.includes('sim.__v65Installed = true')) throw new Error('V6.6 compatibility gate missing');
if (!living.includes('__gwTickBusy')) throw new Error('Tick overlap guard missing');
if ((living.match(/sim\.gift\s*=\s*function/g) || []).length !== 1) throw new Error('Gift authority must remain singular');
if ((living.match(/sim\.buildAI\s*=\s*async\s+function/g) || []).length !== 1) throw new Error('Build AI authority must remain singular');
if ((living.match(/sim\.population\s*=\s*async\s+function/g) || []).length !== 1) throw new Error('Population authority must remain singular');
if (living.includes('originalGift') || living.includes('baseGift')) throw new Error('Gift resolver chains to a previous authority');
if (living.includes('isLake') || living.includes('isFreshWater') || living.includes('nearFreshWater')) throw new Error('Unrequested freshwater gameplay added');

if (!safeFrame.includes("const VERSION = 'stable-v66-safe-frame'")) throw new Error('Safe V6.6 frame missing');
if (!safeFrame.includes("const STARTER_BUILDINGS = ['house_a', 'house_b', 'farm']")) throw new Error('Starter village must be two houses plus farm');
if (!safeFrame.includes('applyFarmerPalette')) throw new Error('Kingdom farmer palette integration missing');
if (!safeFrame.includes('recolorFarmerCanvas')) throw new Error('Farmer palette recoloring missing');
if (!safeFrame.includes('__gwFarmerPaletteCache')) throw new Error('Farmer palette cache missing');
if (safeFrame.includes('keepCivilianNeutral')) throw new Error('Farmers must no longer be forced neutral');
if (!safeFrame.includes('repairBuildingVisual')) throw new Error('Building visibility repair missing');
if (!safeFrame.includes('sprite.visible = true') || !safeFrame.includes('sprite.alpha = 1')) throw new Error('Building sprites must be forced visible without replacing their stable textures');
if (!safeFrame.includes('Do not replace them here')) throw new Error('Stable building texture ownership must remain in the base renderer');
if (!safeFrame.includes('installPostJoinPresentation')) throw new Error('Post-JOIN presentation integration missing');
if (!safeFrame.includes("document.documentElement.dataset.battleSystem = 'stable-v66-safe-frame'")) throw new Error('Safe battle marker missing');
if (!safeFrame.includes('infrastructure-required')) throw new Error('Military infrastructure gate missing');
if (safeFrame.includes('setInterval(')) throw new Error('Safe frame must not add recurring loops');

if (!construction.includes("const VERSION = 'construction-visuals-v67'")) throw new Error('Construction visuals runtime missing');
for (const stage of ['stage-1-foundation.svg','stage-2-scaffold.svg','stage-3-walls.svg']) {
  if (!construction.includes(stage) || !sw.includes(stage)) throw new Error(`Construction stage missing from runtime/cache: ${stage}`);
}
if (!construction.includes('hideFinalBuilding') || !construction.includes('showFinalBuilding')) throw new Error('Construction-to-final building visibility handoff missing');
if (!construction.includes('playPixiConstruction') || !construction.includes('playCanvasConstruction')) throw new Error('Construction visuals must support both renderers');

if (!music.includes("audio.preload = 'metadata'")) throw new Error('Gesture-safe music preload missing');
if (music.includes('audio.load()')) throw new Error('Music must not force-load full track at startup');

const world = JSON.parse(await read('assets/map/world.json'));
const vegetation = JSON.parse(await read('assets/map/vegetation.json'));
if (world.gridW !== 88 || world.gridH !== 64) throw new Error(`Map must be 88x64, found ${world.gridW}x${world.gridH}`);
if (world.mapWidth !== 3900 || world.mapHeight !== 1900) throw new Error(`Map canvas must be 3900x1900, found ${world.mapWidth}x${world.mapHeight}`);
if (world.tileW !== 40 || world.tileH !== 20) throw new Error('Original 40x20 isometric tile style changed');
if (world.version !== 'organic-v4-expanded-same-style') throw new Error(`Same-style map marker missing: ${world.version}`);
const landCount = world.land.flat().reduce((sum, cell) => sum + Number(cell || 0), 0);
if (landCount < 2200 || landCount > 3000) throw new Error(`Island silhouette out of range: ${landCount} land cells`);
for (let x=0; x<world.gridW; x++) {
  if (world.land[0][x] || world.land[world.gridH-1][x]) throw new Error('Island map must keep ocean on the outer top/bottom border');
}
for (let y=0; y<world.gridH; y++) {
  if (world.land[y][0] || world.land[y][world.gridW-1]) throw new Error('Island map must keep ocean on the outer left/right border');
}
if (!Array.isArray(world.rivers) || world.rivers.length < 4) throw new Error('Expanded world needs several rivers');

const allowedBiomes = new Set(['ocean','forest','grass','desert','beach','mountain','tundra','ice_coast']);
for (const row of world.biomes) for (const biome of row) if (!allowedBiomes.has(biome)) throw new Error(`Unexpected biome/system: ${biome}`);

const H = world.land.length, W = world.land[0].length;
const seen = new Set();
let components = 0;
for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
  const token=`${x},${y}`;
  if (!world.land[y][x] || seen.has(token)) continue;
  components++;
  const stack=[[x,y]]; seen.add(token);
  while (stack.length) {
    const [cx,cy]=stack.pop();
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=cx+dx, ny=cy+dy, nt=`${nx},${ny}`;
      if (nx>=0&&ny>=0&&nx<W&&ny<H&&world.land[ny][nx]&&!seen.has(nt)) { seen.add(nt); stack.push([nx,ny]); }
    }
  }
}
if (components < 4) throw new Error(`Expected main island plus islets, found ${components} land components`);

const oceanSeen = new Set();
const queue = [];
const pushOcean=(x,y)=>{ const t=`${x},${y}`; if (!world.land[y][x]&&!oceanSeen.has(t)) { oceanSeen.add(t); queue.push([x,y]); } };
for (let x=0;x<W;x++){ pushOcean(x,0); pushOcean(x,H-1); }
for (let y=0;y<H;y++){ pushOcean(0,y); pushOcean(W-1,y); }
for (let i=0;i<queue.length;i++) {
  const [cx,cy]=queue[i];
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx=cx+dx, ny=cy+dy;
    if(nx>=0&&ny>=0&&nx<W&&ny<H) pushOcean(nx,ny);
  }
}
let interiorWater=0;
for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(!world.land[y][x]&&!oceanSeen.has(`${x},${y}`)) interiorWater++;
if (interiorWater < 30) throw new Error(`Expected visible inland lakes, found ${interiorWater} interior-water cells`);

if (vegetation.version !== 'organic-v4-expanded-same-style') throw new Error('Vegetation/map versions differ');
if (!Array.isArray(vegetation.trees) || vegetation.trees.length < 500) throw new Error('Individual-tree source data too sparse');

const png = await readFile(resolve(gameRoot, 'assets/map/world.png'));
if (png.toString('ascii',1,4) !== 'PNG') throw new Error('world.png invalid');
const pngW=png.readUInt32BE(16), pngH=png.readUInt32BE(20);
if (pngW !== 3900 || pngH !== 1900) throw new Error(`world.png dimensions mismatch: ${pngW}x${pngH}`);

for (const marker of [
  "im=Image.new('RGB',(MAP_W,MAP_H),(24,70,104))",
  "'grass':((118,178,78),(103,160,69))",
  "'forest':((92,158,70),(78,139,62))",
  "'desert':((221,190,126),(202,166,102))"
]) if (!generator.includes(marker)) throw new Error(`Original visual palette marker missing: ${marker}`);
if (!generator.includes('GW,GH=88,64') || !generator.includes('MAP_W=3900') || !generator.includes('MAP_H=1900')) throw new Error('Expanded same-style generator dimensions missing');
if (!generator.includes('Guarantee visible sea around every side of the main island')) throw new Error('Island silhouette guard missing');
if (generator.includes('world-bootstrap') || generator.includes('window.') || generator.includes('fetch(')) throw new Error('Map generator must stay build-time/static only');

const pkg = JSON.parse(packageJson);
if (!String(pkg.scripts?.check || '').includes('check:god-world')) throw new Error('npm run check must include check:god-world');
for (const file of [...expectedScripts,'sw.js']) {
  const full=resolve(gameRoot,file); await access(full);
  const check=spawnSync(process.execPath,['--check',full],{encoding:'utf8'});
  if (check.status !== 0) throw new Error(`Invalid JavaScript in ${file}:\n${check.stderr || check.stdout}`);
}

const shellMatch=sw.match(/const SHELL = \[([\s\S]*?)\];/);
if (!shellMatch) throw new Error('Service worker SHELL missing');
for (const match of shellMatch[1].matchAll(/'([^']+)'/g)) {
  if (match[1] !== './') await access(resolve(gameRoot,match[1]));
}

console.log(`TikTok God World stable: unchanged core, island-shaped same-style 88x64 static map, ${interiorWater} lake cells, ${components-1} islets, ${world.rivers.length} rivers, ${vegetation.trees.length} source trees, starter village, staged 2D construction visuals, visible final buildings and kingdom-colored farmers OK`);
