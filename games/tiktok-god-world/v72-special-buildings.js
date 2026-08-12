(() => {
  'use strict';

  const VERSION = 'v72-special-buildings-1';
  const WINDMILL_FARMS_PER_BUILDING = 3;
  const WINDMILL_COST = { wood: 75, stone: 32, gold: 8 };
  const CHURCH_COST = { wood: 90, stone: 45, gold: 12 };
  const BUILD_COOLDOWN = 6;

  if (window.__V72_SPECIAL_BUILDINGS?.installed) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const liveBuildings = (k, type) => (k?.buildings || []).filter(b =>
    b && b.type === type && !b.__v66Destroyed && (!Number.isFinite(b.hp) || b.hp > 0));
  const isAtWar = (sim, k) => !!k?.alive && (sim.wars || []).some(w =>
    !w.done && (w.a === k.id || w.b === k.id));

  function affordable(k, cost) {
    return Object.entries(cost).every(([resource, amount]) => Number(k.resources?.[resource] || 0) >= amount);
  }

  function validCandidate(sim, k, type, x, y) {
    if (sim.getOwner(x, y) !== k.id) return false;
    if (!sim.isBuildableCell(x, y, type)) return false;
    if (sim.buildingBlockingCell(x, y)) return false;
    if (!sim.buildingSpacingOK(k, type, x, y)) return false;
    if ((k.farmers || []).some(f => f.cell?.[0] === x && f.cell?.[1] === y)) return false;
    return true;
  }

  function fallbackWindmillCell(sim, k) {
    const farms = liveBuildings(k, 'farm');
    if (!farms.length) return null;
    let best = null, bestScore = -Infinity;
    for (const token of k.territory || []) {
      const [x, y] = token.split(',').map(Number);
      if (!validCandidate(sim, k, 'windmill', x, y)) continue;
      let nearest = Infinity, nearby = 0;
      for (const farm of farms) {
        const d = Math.hypot(farm.x - x, farm.y - y);
        nearest = Math.min(nearest, d);
        if (d <= 5.6) nearby++;
      }
      if (nearest > 5.6) continue;
      const capital = Math.hypot(k.capital[0] - x, k.capital[1] - y);
      const score = nearby * 7 - Math.abs(nearest - 2.9) * 2.2 - capital * 0.035 + Math.random() * 0.25;
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    return best;
  }

  function fallbackChurchCell(sim, k) {
    const houses = (k.buildings || []).filter(b => /^house_[abc]$/.test(b.type) && !b.__v66Destroyed && (!Number.isFinite(b.hp) || b.hp > 0));
    if (houses.length < 3) return null;
    let best = null, bestScore = -Infinity;
    for (const token of k.territory || []) {
      const [x, y] = token.split(',').map(Number);
      if (!validCandidate(sim, k, 'church', x, y)) continue;
      let nearby = 0, nearest = Infinity;
      for (const house of houses) {
        const d = Math.hypot(house.x - x, house.y - y);
        nearest = Math.min(nearest, d);
        if (d <= 6.4) nearby++;
      }
      if (nearby < 2) continue;
      const capital = Math.hypot(k.capital[0] - x, k.capital[1] - y);
      const score = nearby * 8 - nearest * 1.7 - capital * 0.05 + Math.random() * 0.25;
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    return best;
  }

  async function construct(sim, k, type, cost, fallback) {
    if (!affordable(k, cost)) return false;
    let cell = sim.findBuildCell(k, type, false);
    if (!cell) cell = fallback(sim, k);
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

    const originalBuildAI = sim.buildAI.bind(sim);
    sim.buildAI = async function (k) {
      if (!k?.alive || isAtWar(this, k) || this.age - k.lastBuild < BUILD_COOLDOWN) {
        return originalBuildAI(k);
      }

      const farms = liveBuildings(k, 'farm').length;
      const windmills = liveBuildings(k, 'windmill').length;
      const windmillTarget = Math.floor(farms / WINDMILL_FARMS_PER_BUILDING);

      // Deterministic agricultural progression: at least one mill for every
      // three live farm plots. If a mill is destroyed, the deficit is rebuilt.
      if (windmills < windmillTarget && affordable(k, WINDMILL_COST)) {
        if (await construct(this, k, 'windmill', WINDMILL_COST, fallbackWindmillCell)) return true;
      }

      const houses = (k.buildings || []).filter(b => /^house_[abc]$/.test(b.type) && !b.__v66Destroyed && (!Number.isFinite(b.hp) || b.hp > 0)).length;
      const churches = liveBuildings(k, 'church').length;

      // The first church is no longer left to the old random special-building roll.
      // It becomes a normal milestone once the settlement is genuinely developed.
      if (churches < 1 && houses >= 3 && k.pop >= 10 && k.territory.size >= 14 && affordable(k, CHURCH_COST)) {
        if (await construct(this, k, 'church', CHURCH_COST, fallbackChurchCell)) return true;
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
      respectsWarBuildPause: true
    };
    document.documentElement.dataset.specialBuildings = VERSION;
  }

  install().catch(error => {
    window.__V72_SPECIAL_BUILDINGS_ERROR = String(error?.stack || error?.message || error);
    console.error('[v72-special-buildings]', error);
  });
})();
