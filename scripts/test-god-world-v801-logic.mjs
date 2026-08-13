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
  const BUILD_Y_OFFSET={};
  const BUILD_FOOTPRINT={castle:1};
  const toast=()=>{};
  const feed=()=>{};
  ${simClass};
  globalThis.Simulation=Simulation;
`, context);
const Simulation = context.Simulation;

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
    entities: [], labels: []
  };
}

function kingdom(id, capital) {
  return { id, name: `K${id}`, capital, territory: new Set(), buildings: [], farmers: [], alive: true, aggressive: null, allies: new Set() };
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
const gatewayEnd = gameSource.indexOf('function connectBridge', gatewayStart);
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

console.log(`V8.0.3 deterministic logic OK (castlePersistent=true, treeRouting=${treeSafePath.length}, alliance=true, irregular=${ka.territory.size}/${width * height}, coastWait=true, joinRetry=${attempts}, concurrentJoin=1castle, universe=40..56+citizens, queuedGifts=2/2, streak=2)`);
