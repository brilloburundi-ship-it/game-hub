import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameRoot = resolve(root, 'games', 'kingdom-war-2');
const errors = [];

const expectedProject = {
  id: 'kingdom-war-2',
  name: 'Kingdom War 2',
  repository: 'brilloburundi-ship-it/game-hub',
  branch: 'main',
  rootPath: 'games/kingdom-war-2',
  liveUrl: 'https://brilloburundi-ship-it.github.io/game-hub/games/kingdom-war-2/'
};

const expectedSprites = {
  villagers: [
    'MiniNobleMan.png',
    'MiniNobleWoman.png',
    'MiniOldMan.png',
    'MiniOldWoman.png',
    'MiniPeasant.png',
    'MiniPrincess.png',
    'MiniQueen.png',
    'MiniVillagerMan.png',
    'MiniVillagerWoman.png',
    'MiniWorker.png'
  ],
  humans: [
    'MiniArcherMan.png',
    'MiniArchMage.png',
    'MiniCavalierMan.png',
    'MiniCrossBowMan.png',
    'MiniHalberdMan.png',
    'MiniHorseMan.png',
    'MiniKingMan.png',
    'MiniMage.png',
    'MiniPrinceMan.png',
    'MiniShieldMan.png',
    'MiniSpearMan.png',
    'MiniSwordMan.png'
  ],
  animals: [
    'MiniBear.png',
    'MiniBird.png',
    'MiniBoar.png',
    'MiniBunny.png',
    'MiniDeer1.png',
    'MiniDeer2.png',
    'MiniFox.png',
    'MiniWolf.png'
  ]
};

function fail(message) {
  errors.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function displayPath(path) {
  return relative(root, path).replaceAll('\\', '/');
}

async function readText(path, label = displayPath(path)) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    fail(`${label}: file missing or unreadable (${error.code || error.message})`);
    return '';
  }
}

async function readJson(path, label = displayPath(path)) {
  const source = await readText(path, label);
  if (!source) return null;
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`${label}: invalid JSON (${error.message})`);
    return null;
  }
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function assertNonEmptyFile(path, label = displayPath(path)) {
  try {
    const info = await stat(path);
    check(info.isFile(), `${label}: expected a file`);
    check(info.size > 0, `${label}: sprite file is empty`);
  } catch (error) {
    fail(`${label}: required file is missing (${error.code || error.message})`);
  }
}

function sameMembers(actual, expected) {
  return actual.length === expected.length
    && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function checkExactFields(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    check(actual?.[key] === value, `${label}.${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(actual?.[key])}`);
  }
}

const projects = await readJson(resolve(root, 'data', 'projects.json'));
if (Array.isArray(projects)) {
  const matches = projects.filter(project => project?.id === expectedProject.id);
  check(matches.length === 1, `data/projects.json: expected exactly one registry entry with id "${expectedProject.id}", found ${matches.length}`);
  if (matches.length === 1) checkExactFields(matches[0], expectedProject, 'data/projects.json kingdom-war-2');
} else if (projects !== null) {
  fail('data/projects.json: registry root must be an array');
}

const [indexHtml, webManifest, version, packageJson] = await Promise.all([
  readText(resolve(gameRoot, 'index.html')),
  readJson(resolve(gameRoot, 'manifest.webmanifest')),
  readJson(resolve(gameRoot, 'version.json')),
  readJson(resolve(gameRoot, 'package.json'))
]);

check(/<title[^>]*>\s*Kingdom War 2(?:\s*[^<]*)?<\/title>/i.test(indexHtml), 'games/kingdom-war-2/index.html: <title> must identify the game as Kingdom War 2');
check(webManifest?.name === 'Kingdom War 2', 'games/kingdom-war-2/manifest.webmanifest: name must be "Kingdom War 2"');
check(webManifest?.short_name === 'Kingdom War 2', 'games/kingdom-war-2/manifest.webmanifest: short_name must be "Kingdom War 2"');
check(version?.game === 'Kingdom War 2', 'games/kingdom-war-2/version.json: game must be "Kingdom War 2"');
check(version?.stablePath === 'games/kingdom-war-2/', 'games/kingdom-war-2/version.json: stablePath must be "games/kingdom-war-2/"');
check(/^kingdom-war-2(?:-|$)/.test(packageJson?.name || ''), 'games/kingdom-war-2/package.json: package name must begin with "kingdom-war-2"');

const minifolksManifestPath = resolve(gameRoot, 'assets', 'minifolks', 'manifest.json');
const minifolksManifest = await readJson(minifolksManifestPath);
if (minifolksManifest) {
  const palette = minifolksManifest.teamPaletteMask;
  check(palette?.light === '#6098E8', 'assets/minifolks/manifest.json: teamPaletteMask.light must be exactly #6098E8');
  check(palette?.dark === '#4058C0', 'assets/minifolks/manifest.json: teamPaletteMask.dark must be exactly #4058C0');
  const expectedMetal = ['#8CADC6', '#B5D6DE', '#5A7B94'];
  check(Array.isArray(palette?.preserveMetal), 'assets/minifolks/manifest.json: teamPaletteMask.preserveMetal must be an array');
  if (Array.isArray(palette?.preserveMetal)) {
    check(sameMembers(palette.preserveMetal, expectedMetal), `assets/minifolks/manifest.json: preserveMetal must contain exactly ${expectedMetal.join(', ')}`);
  }

  for (const [groupName, expectedFiles] of Object.entries(expectedSprites)) {
    const group = minifolksManifest.groups?.[groupName];
    const characters = group?.characters;
    check(group?.path === `assets/minifolks/${groupName}/`, `assets/minifolks/manifest.json: groups.${groupName}.path must be "assets/minifolks/${groupName}/"`);
    check(characters && typeof characters === 'object' && !Array.isArray(characters), `assets/minifolks/manifest.json: groups.${groupName}.characters must be an object`);
    const declaredFiles = characters && typeof characters === 'object'
      ? Object.values(characters).map(character => character?.file).filter(Boolean)
      : [];
    check(sameMembers(declaredFiles, expectedFiles), `assets/minifolks/manifest.json: ${groupName} must declare exactly ${expectedFiles.length} expected sprites (found ${declaredFiles.length})`);
    check(new Set(declaredFiles).size === declaredFiles.length, `assets/minifolks/manifest.json: ${groupName} contains duplicate sprite declarations`);

    const directory = resolve(gameRoot, 'assets', 'minifolks', groupName);
    let diskPngs = [];
    try {
      diskPngs = (await readdir(directory, { withFileTypes: true }))
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
        .map(entry => entry.name);
    } catch (error) {
      fail(`assets/minifolks/${groupName}: directory missing or unreadable (${error.code || error.message})`);
    }
    check(sameMembers(diskPngs, expectedFiles), `assets/minifolks/${groupName}: directory must contain exactly the ${expectedFiles.length} expected PNG files (found ${diskPngs.length})`);
    await Promise.all(expectedFiles.map(file => assertNonEmptyFile(resolve(directory, file))));
  }
}

for (const legacyDirectory of ['npc', 'units']) {
  const path = resolve(gameRoot, 'assets', legacyDirectory);
  check(!(await isDirectory(path)), `games/kingdom-war-2/assets/${legacyDirectory}: legacy NPC directory must be removed`);
}

const runtimePaths = [
  resolve(gameRoot, 'index.html'),
  resolve(gameRoot, 'game.js'),
  resolve(gameRoot, 'sw.js'),
  resolve(gameRoot, 'asset-recovery.js')
];
const runtimeSources = new Map();
for (const path of runtimePaths) {
  const source = path.endsWith('index.html') ? indexHtml : await readText(path);
  runtimeSources.set(path, source);
  for (const legacyPath of ['assets/npc', 'assets/units']) {
    check(!source.toLowerCase().includes(legacyPath), `${displayPath(path)}: remove legacy runtime reference "${legacyPath}/..."`);
  }
}

const gameJs = runtimeSources.get(resolve(gameRoot, 'game.js')) || '';
for (const marker of ['recolorMinifolkCanvas', 'getMinifolkFrames', 'createMinifolkSprite', '__kw2MinifolksReady']) {
  check(gameJs.includes(marker), `games/kingdom-war-2/game.js: missing MiniFolks renderer hook "${marker}"`);
}
const runtimePaletteFromManifest = gameJs.includes('teamPaletteMask') && gameJs.includes('preserveMetal');
const runtimePaletteConstants = gameJs.includes("MINIFOLK_TEAM_LIGHT = '#6098E8'")
  && gameJs.includes("MINIFOLK_TEAM_DARK = '#4058C0'")
  && ['#8CADC6', '#B5D6DE', '#5A7B94'].every(color => gameJs.includes(color));
check(runtimePaletteFromManifest || runtimePaletteConstants, 'games/kingdom-war-2/game.js: recoloring must declare/use the exact MiniFolks team mask and preserved metal palette');
check(/if\s*\(\s*(?:preserveMetal|MINIFOLK_METAL_COLORS)\.(?:includes|has)\s*\(\s*hex\s*\)\s*\)\s*(?:continue|return\b)/.test(gameJs), 'games/kingdom-war-2/game.js: recoloring must skip preserved metal pixels before replacing kingdom colors');
check(/\.__kw2Kind\b/.test(gameJs), 'games/kingdom-war-2/game.js: farmers must retain the __kw2Kind MiniFolks variant marker');
const farmerSpriteReceivesKingdom = /createMinifolkSprite\s*\(\s*['"]villagers['"]\s*,\s*kind\s*,[\s\S]{0,160}?,\s*(?:k|kingdom)\s*\)/.test(gameJs);
const farmerAddPassesKingdom = /makeFarmerSprite\s*\(\s*['"]idle['"]\s*,\s*k\s*,\s*f\.__kw2Kind\s*\)/.test(gameJs)
  || /createMinifolkSprite\s*\(\s*['"]villagers['"]\s*,\s*f\.__kw2Kind\s*,[\s\S]{0,160}?,\s*k\s*\)/.test(gameJs);
check(farmerSpriteReceivesKingdom && farmerAddPassesKingdom, 'games/kingdom-war-2/game.js: farmer MiniFolks creation must propagate k from addFarmer into createMinifolkSprite("villagers", kind, ..., kingdom)');
const farmerWrapperPaths = [
  resolve(gameRoot, 'latest', 'world-npc-expansion.js'),
  resolve(gameRoot, 'latest', 'gameplay.js')
];
for (const wrapperPath of farmerWrapperPaths) {
  const source = await readText(wrapperPath);
  const forwardsAllArguments = /makeFarmerSprite\s*=\s*function\s*\(\s*\.\.\.args\s*\)[\s\S]{0,240}?original(?:MakeFarmerSprite|Make)\s*\(\s*\.\.\.args\s*\)/.test(source);
  check(forwardsAllArguments, `${displayPath(wrapperPath)}: makeFarmerSprite wrapper must forward kingdom and MiniFolks kind with ...args`);
}
const soldierFrameCalls = [...gameJs.matchAll(/getMinifolkFrames\s*\(\s*['"]humans['"]\s*,\s*(?:character|unit)\s*,\s*['"](idle|walk|attack|hurt|death)['"]\s*,\s*k\s*\)/g)].map(match => match[1]);
check(['idle', 'walk', 'attack', 'hurt', 'death'].every(action => soldierFrameCalls.includes(action)), 'games/kingdom-war-2/game.js: soldier idle/walk/attack/hurt/death frames must all use the human character and kingdom k');

const scriptSources = [...indexHtml.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1].split(/[?#]/, 1)[0]);
const minifolksWorldLoads = scriptSources.filter(source => source === 'minifolks-world.js' || source === './minifolks-world.js');
check(minifolksWorldLoads.length === 1, `games/kingdom-war-2/index.html: load minifolks-world.js exactly once (found ${minifolksWorldLoads.length})`);

const minifolksWorldPath = resolve(gameRoot, 'minifolks-world.js');
const minifolksWorld = await readText(minifolksWorldPath);
check(minifolksWorld.includes('window.__KW2_MINIFOLKS_WORLD'), 'games/kingdom-war-2/minifolks-world.js: expose diagnostics as window.__KW2_MINIFOLKS_WORLD');
check(/['"]villagers['"]/.test(minifolksWorld), 'games/kingdom-war-2/minifolks-world.js: villager population must use the "villagers" MiniFolks group');
check(/['"]animals['"]/.test(minifolksWorld), 'games/kingdom-war-2/minifolks-world.js: wildlife population must use the "animals" MiniFolks group');
check(/\bvillagers?\b/i.test(minifolksWorld) && /\bwildlife\b/i.test(minifolksWorld), 'games/kingdom-war-2/minifolks-world.js: diagnostics must report both villager and wildlife state');

const swPath = resolve(gameRoot, 'sw.js');
const swJs = runtimeSources.get(swPath) || '';
const cacheMatch = /\bconst\s+CACHE\s*=\s*['"]([^'"]+)['"]/.exec(swJs);
check(Boolean(cacheMatch), 'games/kingdom-war-2/sw.js: declare a literal CACHE namespace');
if (cacheMatch) check(cacheMatch[1].startsWith('kw2-'), `games/kingdom-war-2/sw.js: CACHE must use only the "kw2-" namespace, got "${cacheMatch[1]}"`);
const cleanupPrefixes = [...swJs.matchAll(/\.startsWith\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]);
check(cleanupPrefixes.includes('kw2-'), 'games/kingdom-war-2/sw.js: activation cleanup must target the kw2- namespace');
check(cleanupPrefixes.every(prefix => prefix === 'kw2-'), `games/kingdom-war-2/sw.js: service-worker cleanup must not touch other games (found: ${cleanupPrefixes.join(', ') || 'none'})`);
check(swJs.includes('minifolks-world.js'), 'games/kingdom-war-2/sw.js: SHELL must cache minifolks-world.js');
check(swJs.includes('assets/minifolks/manifest.json'), 'games/kingdom-war-2/sw.js: SHELL must cache the MiniFolks manifest');

const [bridgeServer, lanBridge] = await Promise.all([
  readText(resolve(gameRoot, 'bridge', 'server.mjs')),
  readText(resolve(gameRoot, 'lan-bridge.js'))
]);
check(/\bconst\s+PORT\s*=\s*Number\s*\([^\n;]*\b8794\b[^\n;]*\)/.test(bridgeServer), 'games/kingdom-war-2/bridge/server.mjs: dedicated bridge default port must be 8794');
check(/\bconst\s+APP_ID\s*=\s*['"]kingdom-war-2['"]/.test(bridgeServer), 'games/kingdom-war-2/bridge/server.mjs: APP_ID must be exactly "kingdom-war-2"');
check(/['"]KingdomWar2Bridge['"]/.test(bridgeServer), 'games/kingdom-war-2/bridge/server.mjs: LOCALAPPDATA token folder must be exactly "KingdomWar2Bridge"');
check(!/['"]TikTokGodWorldPixelBridge['"]/.test(bridgeServer), 'games/kingdom-war-2/bridge/server.mjs: copied TikTokGodWorldPixelBridge token folder must not remain');
check(!/\b8793\b/.test(bridgeServer), 'games/kingdom-war-2/bridge/server.mjs: copied port 8793 must not remain');
check(!/kingdom-war-v804-mobile/.test(bridgeServer), 'games/kingdom-war-2/bridge/server.mjs: copied Kingdom War app id must not remain');
const tokenStorageKeys = [...lanBridge.matchAll(/localStorage\.(?:getItem|setItem)\s*\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
check(tokenStorageKeys.length > 0, 'games/kingdom-war-2/lan-bridge.js: expected a persistent bridge token storage key');
check(tokenStorageKeys.every(key => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized.includes('kingdomwar2bridgetoken') || normalized.includes('kw2bridgetoken');
}), `games/kingdom-war-2/lan-bridge.js: token storage key must be Kingdom War 2-specific (found: ${[...new Set(tokenStorageKeys)].join(', ') || 'none'})`);

const syntaxPaths = new Set([
  resolve(gameRoot, 'game.js'),
  minifolksWorldPath,
  swPath,
  resolve(gameRoot, 'asset-recovery.js'),
  resolve(gameRoot, 'lan-bridge.js'),
  resolve(gameRoot, 'bridge', 'server.mjs')
]);
for (const source of scriptSources) {
  if (!source || /^[a-z]+:/i.test(source) || source.startsWith('//')) continue;
  const path = resolve(gameRoot, source.replace(/^\.\//, ''));
  if (path.startsWith(gameRoot) && /\.(?:m?js)$/i.test(path) && !source.startsWith('vendor/')) syntaxPaths.add(path);
}
for (const path of syntaxPaths) {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      fail(`${displayPath(path)}: JavaScript syntax target is not a file`);
      continue;
    }
  } catch (error) {
    fail(`${displayPath(path)}: JavaScript syntax target is missing (${error.code || error.message})`);
    continue;
  }
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'unknown parser error').trim().split(/\r?\n/).slice(0, 4).join(' | ');
    fail(`${displayPath(path)}: JavaScript syntax check failed: ${detail}`);
  }
}

if (errors.length) {
  console.error(`Kingdom War 2 static contract FAILED (${errors.length} ${errors.length === 1 ? 'error' : 'errors'}):`);
  for (const [index, message] of errors.entries()) console.error(`${index + 1}. ${message}`);
  process.exitCode = 1;
} else {
  console.log('Kingdom War 2 static contract OK: identity/path, 30 MiniFolks, palette preservation, NPC removal, kingdom colors, populations, kw2 service worker, bridge 8794 and JavaScript syntax');
}
