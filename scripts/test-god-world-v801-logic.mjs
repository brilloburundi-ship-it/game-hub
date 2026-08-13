import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gameSource = await readFile(resolve(root, 'games/tiktok-god-world-v8-mobile/game.js'), 'utf8');
const gameplaySource = await readFile(resolve(root, 'games/tiktok-god-world-v8-mobile/latest/gameplay.js'), 'utf8');
const constructionSource = await readFile(resolve(root, 'games/tiktok-god-world-v8-mobile/construction-phases-v662-native-pixel.js'), 'utf8');
const simStart = gameSource.indexOf('class Simulation {');
const simEnd = gameSource.indexOf('class PixiRenderer', simStart);
const simClass = simStart >= 0 && simEnd > simStart ? gameSource.slice(simStart, simEnd).trim() : '';
if (!simClass) throw new Error('Simulation class could not be isolated');

const context = { console: { error() {}, warn() {}, log() {} }, window: {}, Math, Map, Set, Int16Array };
vm.createContext(context);
vm.runInContext(`
  const key=(x,y)=>\`${'${x},${y}'}\`;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const pick=a=>a[0];
  const rand=(a,b)=>(a+b)/2;
  const COLORS=[0x27a7ff];
  const COLORCSS=['#27a7ff'];
  const MAX_VISIBLE_FARMERS=24;
  const MAX_GIFT_VISIBLE_FARMERS=36;
  const MAX_MATCH_KINGDOMS=12;
  const VICTORY_RESTART_MS=10000;
  const BUILD_Y_OFFSET={};
  const BUILD_FOOTPRINT={castle:1};
  const document={documentElement:{dataset:{}}};
  const UI={victoryWinner:{textContent:''},victoryRestart:{textContent:''},victory:{classList:{remove:()=>{}}}};
  globalThis.victoryUI=UI;
  window.setTimeout=(callback,delay)=>{globalThis.restartCallback=callback;globalThis.restartDelay=delay;return 1;};
  window.location={reload:()=>{globalThis.didReload=true;}};
  const toast=()=>{};
  const feed=()=>{};
  ${simClass};
  globalThis.Simulation=Simulation;
`, context);
const Simulation = context.Simulation;

const pixiStart = gameSource.indexOf('class PixiRenderer');
const pixiEnd = gameSource.indexOf('class CanvasRenderer', pixiStart);
const pixiClass = pixiStart >= 0 && pixiEnd > pixiStart ? gameSource.slice(pixiStart, pixiEnd).trim() : '';
if (!pixiClass) throw new Error('Pixi camera owner could not be isolated');
const cameraContext = { console, Map, Set, Math };
vm.createContext(cameraContext);
vm.runInContext(`
  let clock=0;
  const performance={now:()=>clock};
  const innerWidth=390,innerHeight=844,CAMERA_MIN=.30,CAMERA_MAX=2.45,FARMER_WORLD_HEIGHT=18;
  const BUILD_HEIGHT={},BUILD_ANCHOR_Y={},BUILD_BASE={};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rand=(a,b)=>(a+b)/2,pick=a=>a[0],escapeHtml=v=>String(v),$=()=>null;
  const classes=new Set(['hidden']);
  const UI={card:{classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:v=>classes.has(v)}},ranking:null};
  const document={documentElement:{dataset:{}}};
  const window={};
  ${pixiClass};
  globalThis.PixiRenderer=PixiRenderer;
  globalThis.setClock=value=>{clock=value};
  globalThis.cardClasses=classes;
`, cameraContext);
const PixiRenderer = cameraContext.PixiRenderer;

function makeWorld(size = 31) {
  const land = Array.from({ length: size }, () => Array(size).fill(1));
  const biomes = Array.from({ length: size }, () => Array(size).fill('grass'));
  const coastDistance = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => Math.min(x, y, size - 1 - x, size - 1 - y)));
  return { gridW: size, gridH: size, land, biomes, coastDistance, rivers: [], originX: 0, originY: 0, tileW: 40, tileH: 20 };
}

function makeRenderer() {
  return {
    async addKingdom() {},
    async addBuilding(k, building) { building._sprite = { destroyed: false, destroy() { this.destroyed = true; } }; },
    async addFarmer() {},
    redrawTerritories() {}, redrawSettlementGround() {}, focusCell() {}, supportFx() {}, puff() {}, endWar() {},
    destroyBuilding(building) { building.__testDestroyed = true; }, removeFarmer() {}, eliminate() {},
    notifyCameraCastleDestruction() {},
    entities: [], labels: []
  };
}

function kingdom(id, capital) {
  return {
    id, name: `K${id}`, capital, territory: new Set(), buildings: [], farmers: [], alive: true,
    aggressive: null, allies: new Set(), resources: { food: 100, wood: 100, stone: 100, gold: 100 },
    pop: 4, popCap: 8, military: 5
  };
}

function seed(sim, k, radius = 1) {
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (Math.abs(dx) + Math.abs(dy) > radius) continue;
    const x = k.capital[0] + dx, y = k.capital[1] + dy;
    sim.setOwner(x, y, k.id);
    k.territory.add(`${x},${y}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const a = new Simulation(makeWorld(), makeRenderer());
const ka = kingdom(0, [15, 15]);
a.kingdoms.push(ka);
seed(a, ka);
const claimed = a.claimGiftLand(ka, 72);
assert(claimed === 72, `Expected 72 contiguous claims, got ${claimed}`);
for (const token of ka.territory) {
  const [x, y] = token.split(',').map(Number);
  assert(a.getOwner(x, y) === ka.id, `Territory owner mismatch at ${token}`);
}
const xs = [...ka.territory].map(token => Number(token.split(',')[0]));
const ys = [...ka.territory].map(token => Number(token.split(',')[1]));
const width = Math.max(...xs) - Math.min(...xs) + 1;
const height = Math.max(...ys) - Math.min(...ys) + 1;
assert(ka.territory.size < width * height, 'Gift expansion regressed to a filled rectangle');

const b = new Simulation(makeWorld(), makeRenderer());
const kb = kingdom(0, [15, 15]);
b.kingdoms.push(kb);
seed(b, kb);
b.claimGiftLand(kb, 72);
assert([...ka.territory].join('|') === [...kb.territory].join('|'), 'Irregular expansion must remain deterministic');

const c = new Simulation(makeWorld(41), makeRenderer());
const kc = kingdom(0, [20, 20]);
c.kingdoms.push(kc);
seed(c, kc);
c.claimGiftLand(kc, 45);
assert([...kc.territory].every(token => {
  const [x, y] = token.split(',').map(Number);
  return Math.min(x, y, 40 - x, 40 - y) > 1;
}), 'A bounded gift claim created an artificial line to the coast');

const navigationRenderer = makeRenderer();
navigationRenderer.depthTreesByCell = new Map([['16,15', [{ destroyed: false, __treeData: { category: 'tree' } }]]]);
const navigation = new Simulation(makeWorld(), navigationRenderer);
const navigationKingdom = kingdom(0, [15, 15]);
navigation.kingdoms.push(navigationKingdom);
for (let y = 14; y <= 16; y++) for (let x = 15; x <= 17; x++) {
  navigation.setOwner(x, y, navigationKingdom.id);
  navigationKingdom.territory.add(`${x},${y}`);
}
const treeSafePath = navigation.findPath(navigationKingdom, [15, 15], [17, 15]);
assert(treeSafePath.length > 2, 'NPC navigation did not route around a tree');
assert(!treeSafePath.some(([x, y]) => x === 16 && y === 15), 'NPC path still crosses the middle of a tree');

const allies = new Simulation(makeWorld(), makeRenderer());
const allyA = kingdom(0, [10, 10]), allyB = kingdom(1, [11, 10]);
allies.kingdoms.push(allyA, allyB);
seed(allies, allyA, 0); seed(allies, allyB, 0);
assert(allies.adjacentEnemies(allyA).includes(allyB.id), 'Adjacent non-allied kingdom was not considered an enemy');
assert(allies.ally(allyA, allyB) && allies.areAllied(allyA, allyB), 'ALLY did not create a reciprocal alliance');
assert(!allies.adjacentEnemies(allyA).includes(allyB.id), 'Allied kingdom remained an automatic war target');
assert(allies.attack(allyA, allyB) === false, 'An allied kingdom could still be attacked');

const collapseRenderer = makeRenderer();
let castleCameraEvents = 0;
collapseRenderer.notifyCameraCastleDestruction = () => { castleCameraEvents++; };
const collapse = new Simulation(makeWorld(), collapseRenderer);
const fallen = kingdom(0, [12, 12]), victor = kingdom(1, [18, 18]);
collapse.kingdoms.push(fallen, victor);
seed(collapse, fallen, 1); seed(collapse, victor, 1);
const fallenCells = [...fallen.territory];
fallen.buildings.push(
  { id: 'fallen-castle', type: 'castle', x: 12, y: 12, sx: 0, sy: 0, owner: fallen.id, hp: 1, maxHp: 420 },
  { id: 'fallen-house', type: 'house_a', x: 12, y: 13, sx: 0, sy: 10, owner: fallen.id, hp: 100, maxHp: 150 }
);
collapse.wars.push({ id: 'collapse-war', a: fallen.id, b: victor.id, done: false });
assert(collapse.eliminate(fallen, victor), 'Castle destruction did not eliminate the kingdom');
assert(!fallen.alive && fallen.territory.size === 0 && fallen.buildings.length === 0, 'Eliminated kingdom retained active AI state');
assert(fallenCells.every(token => {
  const [x, y] = token.split(',').map(Number);
  return collapse.getOwner(x, y) === -1 && !victor.territory.has(token);
}), 'Destroyed-castle territory did not disappear into neutral land');
assert(collapse.wars[0].done && castleCameraEvents === 1, 'Castle collapse did not end war AI or notify the absolute-priority camera');

const finalRound = new Simulation(makeWorld(), makeRenderer());
const finalist = kingdom(0, [12, 12]), champion = kingdom(1, [18, 18]);
finalist.buildings.push({ id: 'final-castle', type: 'castle', x: 12, y: 12, owner: finalist.id });
champion.buildings.push({ id: 'champion-castle', type: 'castle', x: 18, y: 18, owner: champion.id });
finalRound.kingdoms.push(finalist, champion); seed(finalRound, finalist, 1); seed(finalRound, champion, 1);
finalRound.roundEntrants = 2; finalRound.matchStarted = true;
let announcedWinner = null;
finalRound.showVictory = winner => { announcedWinner = winner; finalRound.matchOver = true; };
assert(finalRound.eliminate(finalist, champion) && announcedWinner === champion && finalRound.matchOver, 'Last surviving kingdom did not end the round');
const victoryPresentation = new Simulation(makeWorld(), makeRenderer());
victoryPresentation.select = () => {};
victoryPresentation.showVictory(champion);
assert(victoryPresentation.matchOver && context.victoryUI.victoryWinner.textContent === champion.name && context.restartDelay === 10000, 'Victory message or automatic restart timer is incomplete');
context.restartCallback();
assert(context.didReload === true, 'Victory timer did not reload a new empty world');

const directorWorld = { mapWidth: 1200, mapHeight: 900, tileW: 40, tileH: 20 };
const director = new PixiRenderer(directorWorld, {}, {});
const cameraA = kingdom(0, [8, 8]), cameraB = kingdom(1, [24, 20]);
cameraA.buildings.push({ type: 'castle' }); cameraB.buildings.push({ type: 'castle' });
for (let x = 2; x <= 22; x++) cameraA.territory.add(`${x},8`);
seed({ setOwner() {} }, cameraB, 1);
const iso = (x, y) => [(x - y) * 20 + 600, (x + y) * 10 + 100];
director.sim = { kingdoms: [cameraA, cameraB], wars: [], iso, selected: cameraA, updateSelected() {} };
director.installAutoCamera();
director.autoCamera.tourStartedAt = 0;
assert(director.autoCamera.transitionSeconds === 4.8, 'Automatic camera did not adopt the softer settling time');
cameraContext.setClock(0);
assert(director.autoCameraTarget(0) && director.autoCamera.mode === 'overview', 'Automatic director did not begin with a ten-second overview');
const panStart = director.autoCameraTarget(10000);
const panEnd = director.autoCameraTarget(19999);
assert(director.autoCamera.focusKingdom === cameraA && (panStart.x !== panEnd.x || panStart.y !== panEnd.y), 'Large peace-time kingdom did not receive a slow ten-second pan');
const emptyKingdom = kingdom(2, [32, 28]); emptyKingdom.alive = false;
director.sim.kingdoms.push(emptyKingdom);
director.sim.wars = [{ id: 'stale-war', a: 2, b: 1, done: true, front: [[32, 28], [24, 20]] }];
director.autoCamera.warShot = { warId: 'stale-war', startedAt: 20000, until: 30000, x: 9999, y: 9999 };
director.autoCameraTarget(21000);
assert(director.autoCamera.mode === 'kingdom' && director.autoCamera.focusKingdom === cameraB, 'Closed war shot remained focused on empty territory');
director.sim.wars = [
  { id: 'war-one', a: 0, b: 1, done: false, front: [[8, 8], [9, 8]] },
  { id: 'war-two', a: 0, b: 1, done: false, front: [[20, 20], [21, 20]] }
];
director.autoCamera.warShot = null;
director.autoCameraTarget(30000);
const firstWar = director.autoCamera.warShot.warId;
director.autoCameraTarget(39999);
assert(director.autoCamera.warShot.warId === firstWar, 'War camera changed before its full ten-second slot');
director.autoCameraTarget(40000);
assert(director.autoCamera.warShot.warId !== firstWar && director.autoCamera.warShot.until === 50000, 'War camera did not hand off to the next full ten-second slot');
cameraContext.setClock(41000);
director.notifyCameraCastleDestruction({ sx: 11, sy: 22 }, cameraA, cameraB, 10);
director.notifyCameraCastleDestruction({ sx: 33, sy: 44 }, cameraB, cameraA, 10);
director.autoCameraTarget(41000);
assert(director.autoCamera.mode === 'castle-destruction' && director.autoCamera.criticalQueue.length === 1, 'Castle destruction did not preempt the director absolutely');
director.autoCameraTarget(43001);
assert(director.autoCamera.mode === 'kingdom' && director.autoCamera.focusKingdom === cameraB, 'Castle priority remained on cleared land instead of the surviving kingdom');
director.autoCameraTarget(51000);
assert(director.autoCamera.mode === 'castle-destruction' && director.autoCamera.critical.until === 61000, 'Queued castle destruction lost its full ten-second priority');

director.sim.wars = [];
director.autoCamera.critical = null; director.autoCamera.criticalQueue.length = 0;
director.autoCamera.mode = 'kingdom'; director.autoCamera.focusKingdom = cameraA; director.autoCamera.shotKey = 'focus-test'; director.autoCamera.manualUntil = 0;
const center = iso(...cameraA.capital);
director.root = { scale: { x: .9 }, x: 195 - center[0] * .9, y: 422 - center[1] * .9 };
cameraContext.setClock(0); director.syncKingdomDetail();
assert(!cameraContext.cardClasses.has('hidden') && !cameraContext.cardClasses.has('fading'), 'Kingdom Focus did not appear at the beginning of a shot');
cameraContext.setClock(2001); director.syncKingdomDetail();
assert(cameraContext.cardClasses.has('fading'), 'Kingdom Focus did not begin dissolving after two seconds');
cameraContext.setClock(2601); director.syncKingdomDetail();
assert(cameraContext.cardClasses.has('hidden'), 'Kingdom Focus did not disappear after its dissolve');

const rollbackRenderer = makeRenderer();
const d = new Simulation(makeWorld(), rollbackRenderer);
const kd = kingdom(0, [15, 15]);
kd.name = 'Rollback';
d.kingdoms.push(kd);
d.kingdomByName.set('rollback', kd);
seed(d, kd);
d.rollbackFounding(kd);
assert(!kd.alive && kd.territory.size === 0 && !d.kingdomByName.has('rollback'), 'Failed JOIN rollback left a live partial kingdom');

const retryRenderer = makeRenderer();
let attempts = 0;
retryRenderer.addBuilding = async (k, building) => {
  attempts++;
  if (attempts === 1) throw new Error('transient render failure');
  building._sprite = { destroyed: false, destroy() { this.destroyed = true; } };
};
const e = new Simulation(makeWorld(), retryRenderer);
e.select = () => {};
e.updateUI = () => {};
e.spawnFarmer = async () => null;
assert(e.freeSpawn(), `Retry test world has no spawn (buildable=${e.isBuildableCell(15, 15, 'castle')}, room=${e.spawnRoom(15, 15)})`);
const founded = await e.join('Retry');
assert(founded?.alive && !founded.founding, `JOIN retry did not complete the founding transaction (attempts=${attempts}, founded=${!!founded})`);
assert(attempts === 2 && founded.buildings.filter(building => building.type === 'castle').length === 1, 'JOIN retry created zero or duplicate castles');

const concurrentRenderer = makeRenderer();
let releaseFounding;
concurrentRenderer.addKingdom = () => new Promise(resolve => { releaseFounding = resolve; });
const concurrent = new Simulation(makeWorld(), concurrentRenderer);
concurrent.select = () => {};
concurrent.updateUI = () => {};
concurrent.updateSelected = () => {};
concurrent.spawnFarmer = async () => null;
const firstJoin = concurrent.join('Duplicate');
await Promise.resolve();
const partial = concurrent.kingdomByName.get('duplicate');
assert(partial?.founding && !partial.alive && partial.buildings.length === 0, 'Founding kingdom became externally alive before its castle');
concurrent.like('Duplicate', 4);
const earlyGift = concurrent.gift('Duplicate', 'Rose', 1);
const secondJoin = concurrent.join('Duplicate');
releaseFounding();
const [firstDuplicate, secondDuplicate] = await Promise.all([firstJoin, secondJoin]);
await earlyGift;
assert(firstDuplicate === secondDuplicate, 'Concurrent duplicate JOIN did not share one founding promise');
assert(firstDuplicate?.alive && !firstDuplicate.founding, 'Concurrent JOIN did not finish in a live founded state');
assert(firstDuplicate.buildings.filter(building => building.type === 'castle').length === 1, 'Concurrent JOIN created zero or duplicate castles');
assert(firstDuplicate.resources.food > 195, 'Interaction arriving during JOIN was not replayed after founding');
assert(!concurrent.foundingByName.has('duplicate'), 'Completed JOIN left a stale founding lock');

const failRenderer = makeRenderer();
failRenderer.addBuilding = async () => { throw new Error('persistent render failure'); };
const f = new Simulation(makeWorld(), failRenderer);
f.select = () => {};
f.updateUI = () => {};
f.spawnFarmer = async () => null;
const rejected = await f.join('Rejected');
assert(rejected === null && !f.kingdomByName.has('rejected'), 'Failed JOIN remained registered');
assert(f.kingdoms.every(item => !item.alive || item.name !== 'Rejected'), 'Failed JOIN left a live partial civilization');

const capped = new Simulation(makeWorld(), makeRenderer());
capped.roundEntrants = 12;
assert(await capped.join('Thirteenth') === null && capped.kingdoms.length === 0, 'A thirteenth player entered the round');

const countSource = gameplaySource.match(/function bigCityBuildingCount\(gift, value, repeat\) \{[\s\S]*?\n  \}/)?.[0];
assert(countSource, 'High-gift building count owner could not be isolated');
const giftContext = { Math };
vm.createContext(giftContext);
vm.runInContext(`const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); ${countSource}; globalThis.count=bigCityBuildingCount;`, giftContext);
assert(giftContext.count('Galaxy', 1500, 1) === 28, 'Galaxy building count regressed');
assert(giftContext.count('Lion', 1500, 1) === 34, 'Lion building count regressed');
assert(giftContext.count('Universe', 1500, 1) === 40, 'Universe must request 40 buildings');
assert(giftContext.count('Universe', 5000, 3) === 56, 'Repeated high-value Universe must reach the 56-building cap');

const cityChunkStart = gameplaySource.indexOf('const BIG_CITY_GIFTS =');
const cityChunkEnd = gameplaySource.indexOf('function installInteractionPower', cityChunkStart);
const cityChunk = cityChunkStart >= 0 && cityChunkEnd > cityChunkStart ? gameplaySource.slice(cityChunkStart, cityChunkEnd) : '';
assert(cityChunk, 'High-gift city owner could not be isolated');
const cityContext = { Math, Promise };
vm.createContext(cityContext);
vm.runInContext(`
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const state={errors:[],bigHelpCities:0,bigHelpCity:false,lastBigHelpRequested:0,lastBigHelpBuilt:0};
  ${cityChunk}
  globalThis.buildPowerCity=buildPowerCity;
`, cityContext);
let activePlans = 0, maximumActivePlans = 0;
const requestedPlans = [];
const citizenGains = [];
const citySimulation = {
  claimGiftLand() {},
  async instantGiftBuild(k, types) {
    activePlans++;
    maximumActivePlans = Math.max(maximumActivePlans, activePlans);
    requestedPlans.push(types.length);
    await Promise.resolve();
    activePlans--;
    return types.length;
  },
  async giftPopulation(k, amount) { citizenGains.push(amount); },
  r: { supportFx() {} }, updateSelected() {}
};
const cityKingdom = {
  alive: true, founding: false, buildings: [], resources: { food: 0, wood: 0, stone: 0, gold: 0 },
  military: 0, popCap: 0, lastBuild: 0, lastExpand: 0, lastPop: 0
};
await Promise.all([
  cityContext.buildPowerCity(citySimulation, cityKingdom, 'Universe', 1, {}),
  cityContext.buildPowerCity(citySimulation, cityKingdom, 'Universe', 1, {})
]);
assert(requestedPlans.join(',') === '40,40', `Concurrent Universe plans were lost (${requestedPlans.join(',')})`);
assert(maximumActivePlans === 1, 'Concurrent high-gift building plans were not serialized');
assert(cityKingdom.__v712VisibleCitizenCap === 32, `Universe visible citizen cap is not proportional (${cityKingdom.__v712VisibleCitizenCap})`);
assert(citizenGains.join(',') === '26,26', `Universe citizen gains are not tied to its realized building plan (${citizenGains.join(',')})`);

const visibleGiftSimulation = new Simulation(makeWorld(), makeRenderer());
const visibleGiftKingdom = kingdom(0, [15, 15]);
visibleGiftKingdom.pop = 40;
visibleGiftKingdom.__v712VisibleCitizenCap = 32;
visibleGiftSimulation.kingdoms.push(visibleGiftKingdom);
for (let y = 11; y <= 19; y++) for (let x = 11; x <= 19; x++) {
  visibleGiftSimulation.setOwner(x, y, visibleGiftKingdom.id);
  visibleGiftKingdom.territory.add(`${x},${y}`);
}
await visibleGiftSimulation.syncCitizens(visibleGiftKingdom);
assert(visibleGiftKingdom.farmers.length === 32, `High-gift visible citizens were not actually spawned (${visibleGiftKingdom.farmers.length})`);

const gatewayStart = gameSource.indexOf('const giftProgress = new Map();');
const gatewayEnd = gameSource.indexOf('function fpsCounter', gatewayStart);
const gatewayChunk = gatewayStart >= 0 && gatewayEnd > gatewayStart ? gameSource.slice(gatewayStart, gatewayEnd) : '';
assert(gatewayChunk, 'TikFinity gift gateway could not be isolated');
const gatewayContext = { console, Map, String, Number, Math, Array };
vm.createContext(gatewayContext);
vm.runInContext(`
  const processComment=async()=>{};
  ${gatewayChunk}
  globalThis.handleEvent=handleEvent;
`, gatewayContext);
const routedGifts = [];
const gatewaySimulation = {
  async gift(...args) { routedGifts.push(args); },
  like() {}, follow() {}
};
await gatewayContext.handleEvent(gatewaySimulation, {
  event: 'gift', data: { uniqueId: 'viewer', giftDetails: { giftName: 'Universe' }, giftData: { value: 1500 }, repeatCount: 1, transactionId: 'streak-1' }
});
await gatewayContext.handleEvent(gatewaySimulation, {
  event: 'gift', data: { uniqueId: 'viewer', giftDetails: { giftName: 'Universe' }, giftData: { value: 1500 }, repeatCount: 2, transactionId: 'streak-1' }
});
await gatewayContext.handleEvent(gatewaySimulation, {
  event: 'gift', data: { uniqueId: 'viewer', giftDetails: { giftName: 'Universe' }, giftData: { value: 1500 }, repeatCount: 2, transactionId: 'streak-1', repeatEnd: true }
});
assert(routedGifts.length === 2 && routedGifts[0][2] === 1 && routedGifts[1][2] === 1, 'Cumulative gift streak was not converted to event deltas');
assert(routedGifts[0][1] === 'Universe' && routedGifts[0][3].value === 1500, 'Nested TikFinity gift name/value was not preserved');
await gatewayContext.handleEvent(gatewaySimulation, {
  type: 'gift', payload: { username: 'viewer', gift_name: 'Lion', value: 1500, repeat_count: 3, giftType: 1, repeatEnd: false }
});
assert(routedGifts.length === 2, 'Unidentified intermediate streak update should wait for repeatEnd');
await gatewayContext.handleEvent(gatewaySimulation, {
  type: 'gift', eventData: { username: 'viewer', gift_name: 'Lion', value: 1500, repeat_count: 3, giftType: 1, repeatEnd: true }
});
assert(routedGifts.length === 3 && routedGifts[2][1] === 'Lion' && routedGifts[2][2] === 3, 'Final unidentified streak payload was not routed once');

const constructionStart = constructionSource.indexOf('function copyTransform');
const constructionEnd = constructionSource.indexOf('async function install()', constructionStart);
const constructionChunk = constructionStart >= 0 && constructionEnd > constructionStart ? constructionSource.slice(constructionStart, constructionEnd) : '';
assert(constructionChunk, 'Construction completion owner could not be isolated');
const makeVector = () => ({ x: 0, y: 0, copyFrom(other) { this.x = Number(other?.x || 0); this.y = Number(other?.y || 0); } });
class ConstructionSprite {
  constructor(texture) {
    this.texture = texture;
    this.position = makeVector(); this.anchor = makeVector(); this.pivot = makeVector(); this.skew = makeVector(); this.scale = makeVector();
    this.rotation = 0; this.alpha = 1; this.zIndex = 0; this.visible = true; this.renderable = true; this.destroyed = false;
  }
  destroy() { this.destroyed = true; this.parent = null; }
}
const constructionContext = {
  console, Promise,
  window: {
    PIXI: { Sprite: ConstructionSprite },
    __CONSTRUCTION_TEXTURES_READY: Promise.resolve({ castle: [
      { base: 'base-1', mask: 'mask-1' }, { base: 'base-2', mask: 'mask-2' }, { base: 'base-3', mask: 'mask-3' }
    ] })
  }
};
vm.createContext(constructionContext);
vm.runInContext(`
  const kingdomFrames=()=>null;
  const sleep=async()=>{};
  ${constructionChunk}
  globalThis.playConstruction=play;
`, constructionContext);
const constructionParent = {
  children: [], sortableChildren: true, sortDirty: false,
  addChild(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
};
const completedCastle = new ConstructionSprite('castle');
completedCastle.parent = constructionParent;
completedCastle.visible = false;
completedCastle.renderable = false;
completedCastle.__v800RestoreVisible = true;
completedCastle.__v800RestoreRenderable = true;
let constructionCullCalls = 0;
const constructionRenderer = { entities: constructionParent, __v800RequestCull() { constructionCullCalls++; } };
await constructionContext.playConstruction(completedCastle, 'castle', 0x336699, constructionRenderer);
assert(completedCastle.visible && completedCastle.renderable, 'Completed castle restored stale hidden visibility');
assert(completedCastle.__constructionStagesComplete && !completedCastle.__constructionStagesPlaying, 'Construction completion state is inconsistent');
assert(constructionCullCalls === 1, 'Completed castle did not re-evaluate the current mobile viewport');

console.log(`V8.0.6 deterministic logic OK (cameraSkipsEmpty=true, maxPlayers=12, victoryRestart=true, castlePersistent=true, castleCollapse=neutral+AIoff, treeRouting=${treeSafePath.length}, alliance=true, irregular=${ka.territory.size}/${width * height}, coastWait=true, joinRetry=${attempts}, concurrentJoin=1castle, universe=40..56+citizens, queuedGifts=2/2, streak=2)`);
