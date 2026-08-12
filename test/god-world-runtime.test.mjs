import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const runtimePath = resolve(import.meta.dirname, '../games/tiktok-god-world/living-kingdoms-v65.js');
const runtimeSource = await readFile(runtimePath, 'utf8');

function createHarness() {
  const toastHost = { appendChild() {} };
  const card = { classList: { add() {}, remove() {}, toggle() {} } };
  const document = {
    documentElement: { dataset: {} },
    querySelector(selector) {
      if (selector === '#toast') return toastHost;
      if (selector === '#kingdomCard') return card;
      return null;
    },
    querySelectorAll() { return []; },
    createElement() {
      return { className: '', textContent: '', remove() {} };
    }
  };

  let joinActive = 0;
  let maxJoinActive = 0;
  let tickActive = 0;
  let maxTickActive = 0;
  let buildSeq = 0;

  const kingdom = {
    id: 0,
    name: 'Player',
    alive: true,
    capital: [5, 5],
    territory: new Set(['5,5']),
    resources: { food: 0, wood: 0, stone: 0, gold: 0 },
    pop: 4,
    popCap: 4,
    military: 8,
    buildings: [{ id: 'castle', type: 'castle', hp: 420, maxHp: 420, x: 5, y: 5, sx: 50, sy: 50 }],
    farmers: [],
    followed: false,
    boostUntil: 0,
    lastBuild: 0,
    lastPop: 0
  };

  const renderer = {
    canvas: {},
    cam: { s: 1 },
    w: { mapWidth: 1000, mapHeight: 1000 },
    supportFx() {},
    kingdomScreenPosition() { return [500, 480]; },
    syncKingdomDetail() {},
    redrawSettlementGround() {},
    puff() {}
  };

  const sim = {
    r: renderer,
    age: 10,
    kingdoms: [kingdom],
    wars: [],
    selected: kingdom,
    kingdomByName: new Map([['player', kingdom]]),
    async syncCitizens() {},
    async spawnFarmWorker() { return null; },
    async addBuilding(k, type, x, y) {
      const b = { id: `b${++buildSeq}`, type, hp: 150, maxHp: 150, x, y, sx: x * 10, sy: y * 10 };
      k.buildings.push(b);
      return b;
    },
    async join() {
      joinActive++;
      maxJoinActive = Math.max(maxJoinActive, joinActive);
      await new Promise(resolve => setTimeout(resolve, 20));
      joinActive--;
      return kingdom;
    },
    async tick() {
      tickActive++;
      maxTickActive = Math.max(maxTickActive, tickActive);
      await new Promise(resolve => setTimeout(resolve, 20));
      tickActive--;
      this.age++;
    },
    like() {},
    follow() {},
    gift() {},
    population() {},
    buildAI() {},
    boost30() {},
    updateSelected() {},
    isRiver() { return false; },
    land() { return true; },
    biome() { return 'grass'; },
    coastDistance() { return 5; },
    neigh() { return [[1, 1], [1, 2], [2, 1]]; },
    getOwner() { return 0; },
    buildingBlockingCell() { return false; },
    buildingSpacingOK() { return true; },
    findBuildCell() { const n = buildSeq + 10; return [n, n]; },
    claimGiftLand() {},
    power() { return 100; },
    attack() { return true; }
  };

  renderer.sim = sim;

  const context = {
    console,
    document,
    navigator: {},
    performance,
    innerWidth: 1000,
    innerHeight: 1000,
    requestAnimationFrame: callback => setImmediate(() => callback(performance.now())),
    setTimeout: (fn, ms = 0, ...args) => {
      const timer = setTimeout(fn, ms, ...args);
      if (ms > 100) timer.unref?.();
      return timer;
    },
    clearTimeout,
    Promise,
    Map,
    Set,
    Math
  };
  context.window = context;
  context.window.__SIM = sim;
  context.window.TikTokGodWorld = {};

  vm.createContext(context);
  vm.runInContext(runtimeSource, context, { filename: 'living-kingdoms-v65.js' });

  return {
    context,
    sim,
    kingdom,
    metrics: {
      get maxJoinActive() { return maxJoinActive; },
      get maxTickActive() { return maxTickActive; }
    }
  };
}

test('God World runtime serializes JOIN and prevents overlapping ticks', async () => {
  const { sim, metrics } = createHarness();

  await Promise.all([sim.join('Player'), sim.join('Player2'), sim.join('Player3')]);
  assert.equal(metrics.maxJoinActive, 1, 'JOIN operations must execute one at a time');

  await Promise.all([sim.tick(), sim.tick(), sim.tick()]);
  assert.equal(metrics.maxTickActive, 1, 'simulation ticks must never overlap');
  assert.ok(sim.__gwSkippedTicks >= 2, 'overlapping tick attempts should be skipped safely');
});

test('God World big gift has one authority and one population/housing result', async () => {
  const { sim, kingdom } = createHarness();

  await sim.gift('Player', 'Private Jet', 1, { diamonds: 300 });

  assert.deepEqual(kingdom.resources, { food: 720, wood: 620, stone: 430, gold: 410 });
  assert.equal(kingdom.military, 40, 'Private Jet military help must be applied once');
  assert.equal(kingdom.buildings.filter(b => b.type.startsWith('house_')).length, 2, 'BIG HELP should create exactly two houses');
  assert.equal(kingdom.buildings.filter(b => b.type === 'farm').length, 1, 'BIG HELP should create exactly one farm');
  assert.equal(kingdom.buildings.filter(b => b.type === 'market').length, 1, 'BIG HELP should create exactly one market');
  assert.equal(kingdom.popCap, 12, 'housing capacity must come from the castle plus actual houses');
  assert.equal(kingdom.pop, 10, 'gift population must respect actual housing capacity');
});
