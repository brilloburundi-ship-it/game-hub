(() => {
  'use strict';

  const VERSION = 'v72-special-buildings-2';
  const WINDMILL_FARMS_PER_BUILDING = 3;
  const WINDMILL_COST = { wood: 75, stone: 32, gold: 8 };
  const CHURCH_COST = { wood: 90, stone: 45, gold: 12 };
  const BUILD_COOLDOWN = 6;
  const SPECIAL_CHECK_INTERVAL = 5;
  const NO_CELL_RETRY = 12;
  const MAX_LOCAL_CHECKS = 96;
  const MAX_ANCHORS = 7;

  if (window.__V72_SPECIAL_BUILDINGS?.installed) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const liveBuildings = (k, type) => (k?.buildings || []).filter(b =>
    b && b.type === type && !b.__v66Destroyed && (!Number.isFinite(b.hp) || b.hp > 0));
  const liveHouses = k => (k?.buildings || []).filter(b =>
    b && /^house_[abc]$/.test(b.type) && !b.__v66Destroyed && (!Number.isFinite(b.hp) || b.hp > 0));
  const isAtWar = (sim, k) => !!k?.alive && (sim.wars || []).some(w =>
    !w.done && (w.a === k.id || w.b === k.id));

  function affordable(k, cost) {
    return Object.entries(cost).every(([resource, amount]) => Number(k.resources?.[resource] || 0) >= amount);
  }

  function cheapCandidate(sim, k, type, x, y) {
    if (sim.getOwner(x, y) !== k.id) return false;
    if (!sim.isBuildableCell(x, y, type)) return false;
    return true;
  }

  function validCandidate(sim, k, type, x, y) {
    if (!cheapCandidate(sim, k, type, x, y)) return false;
    if (sim.buildingBlockingCell(x, y)) return false;
    if (!sim.buildingSpacingOK(k, type, x, y)) return false;
    if ((k.farmers || []).some(f => f.cell?.[0] === x && f.cell?.[1] === y)) return false;
    return true;
  }

  function windmillAnchors(k) {
    const farms = liveBuildings(k, 'farm');
    const mills = liveBuildings(k, 'windmill');
    if (!farms.length) return [];
    if (!mills.length) return farms.slice(0, MAX_ANCHORS);
    return farms
      .map(farm => ({ farm, d: Math.min(...mills.map(m => Math.hypot(farm.x - m.x, farm.y - m.y))) }))
      .sort((a, b) => b.d - a.d)
      .slice(0, MAX_ANCHORS)
      .map(entry => entry.farm);
  }

  function churchAnchors(k) {
    const houses = liveHouses(k);
    if (houses.length < 3) return [];
    return houses
      .slice()
      .sort((a, b) => Math.hypot(a.x - k.capital[0], a.y - k.capital[1]) - Math.hypot(b.x - k.capital[0], b.y - k.capital[1]))
      .slice(0, MAX_ANCHORS);
  }

  function scoreWindmill(k, x, y) {
    const farms = liveBuildings(k, 'farm');
    let nearest = Infinity, nearby = 0;
    for (const farm of farms) {
      const d = Math.hypot(farm.x - x, farm.y - y);
      nearest = Math.min(nearest, d);
      if (d <= 5.6) nearby++;
    }
    if (!nearby || nearest > 5.6) return -Infinity;
    const capital = Math.hypot(k.capital[0] - x, k.capital[1] - y);
    return nearby * 8 - Math.abs(nearest - 2.8) * 2.1 - capital * 0.03;
  }

  function scoreChurch(k, x, y) {
    const houses = liveHouses(k);
    let nearest = Infinity, nearby = 0;
    for (const house of houses) {
      const d = Math.hypot(house.x - x, house.y - y);
      nearest = Math.min(nearest, d);
      if (d <= 6.4) nearby++;
    }
    if (nearby < 2) return -Infinity;
    const capital = Math.hypot(k.capital[0] - x, k.capital[1] - y);
    return nearby * 9 - nearest * 1.7 - capital * 0.045;
  }

  function boundedLocalCell(sim, k, type) {
    const anchors = type === 'windmill' ? windmillAnchors(k) : churchAnchors(k);
    if (!anchors.length) return null;
    const visited = new Set();
    let checks = 0, best = null, bestScore = -Infinity;

    for (let radius = 1; radius <= 6 && checks < MAX_LOCAL_CHECKS; radius++) {
      for (const anchor of anchors) {
        for (let dy = -radius; dy <= radius && checks < MAX_LOCAL_CHECKS; dy++) {
          for (let dx = -radius; dx <= radius && checks < MAX_LOCAL_CHECKS; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
            const x = anchor.x + dx, y = anchor.y + dy, token = `${x},${y}`;
            if (visited.has(token)) continue;
            visited.add(token);
            if (!cheapCandidate(sim, k, type, x, y)) continue;
            checks++;
            if (!validCandidate(sim, k, type, x, y)) continue;
            const score = type === 'windmill' ? scoreWindmill(k, x, y) : scoreChurch(k, x, y);
            if (score > bestScore) { bestScore = score; best = [x, y]; }
          }
        }
      }
      if (best && radius >= 3) break;
    }
    return best;
  }

  async function construct(sim, k, type, cost) {
    if (!affordable(k, cost)) return false;
    const cell = boundedLocalCell(sim, k, type);
    if (!cell) return false;
    const building = await sim.addBuilding(k, type, cell[0], cell[1], false);
    if (!building) return false;
    for (const [resource, amount] of Object.entries(cost)) k.resources[resource] -= amount;
    k.lastBuild = sim.age;
    sim.r.puff?.(...sim.iso(cell[0], cell[1]));
    sim.updateSelected?.();
    return true;
  }

  async function install() {
    for (let i = 0; i < 2200; i++) {
      const sim = window.__SIM;
      if (sim?.r && typeof sim.buildAI === 'function' && typeof sim.findBuildCell === 'function' &&
          typeof sim.addBuilding === 'function' && window.__V71_SURGICAL_FIXES?.installed &&
          window.__V67_PIXEL_BUILDINGS?.installed) break;
      await sleep(20);
    }

    const sim = window.__SIM;
    if (!sim?.r || typeof sim.buildAI !== 'function' || typeof sim.findBuildCell !== 'function' || typeof sim.addBuilding !== 'function') return;

    const previousFindBuildCell = sim.findBuildCell.bind(sim);
    sim.findBuildCell = function(k, type, initial = false) {
      if (type === 'windmill' || type === 'church') return boundedLocalCell(this, k, type);
      return previousFindBuildCell(k, type, initial);
    };

    const state = new Map();
    const originalBuildAI = sim.buildAI.bind(sim);
    sim.buildAI = async function(k) {
      if (!k?.alive || isAtWar(this, k) || this.age - k.lastBuild < BUILD_COOLDOWN) {
        return originalBuildAI(k);
      }

      const entry = state.get(k.id) || { nextCheck: 0, signature: '' };
      const farms = liveBuildings(k, 'farm').length;
      const windmills = liveBuildings(k, 'windmill').length;
      const houses = liveHouses(k).length;
      const churches = liveBuildings(k, 'church').length;
      const signature = `${farms}:${windmills}:${houses}:${churches}`;
      const changed = entry.signature !== signature;

      if (!changed && this.age < entry.nextCheck) return originalBuildAI(k);
      entry.signature = signature;
      entry.nextCheck = this.age + SPECIAL_CHECK_INTERVAL;
      state.set(k.id, entry);

      const windmillTarget = Math.floor(farms / WINDMILL_FARMS_PER_BUILDING);
      if (windmills < windmillTarget && affordable(k, WINDMILL_COST)) {
        if (await construct(this, k, 'windmill', WINDMILL_COST)) return true;
        entry.nextCheck = this.age + NO_CELL_RETRY;
        return originalBuildAI(k);
      }

      if (churches < 1 && houses >= 3 && k.pop >= 10 && k.territory.size >= 14 && affordable(k, CHURCH_COST)) {
        if (await construct(this, k, 'church', CHURCH_COST)) return true;
        entry.nextCheck = this.age + NO_CELL_RETRY;
        return originalBuildAI(k);
      }

      return originalBuildAI(k);
    };

    window.__V72_SPECIAL_BUILDINGS = {
      installed: true,
      version: VERSION,
      windmillEveryFarms: WINDMILL_FARMS_PER_BUILDING,
      deterministicWindmills: true,
      deterministicFirstChurch: true,
      rebuildsDestroyedSpecialBuildings: true,
      respectsWarBuildPause: true,
      boundedLocalSearch: true,
      maxLocalChecks: MAX_LOCAL_CHECKS,
      retrySeconds: NO_CELL_RETRY,
      noFullTerritorySpecialScan: true
    };
    document.documentElement.dataset.specialBuildings = VERSION;
  }

  install().catch(error => {
    window.__V72_SPECIAL_BUILDINGS_ERROR = String(error?.stack || error?.message || error);
    console.error('[v72-special-buildings]', error);
  });
})();
