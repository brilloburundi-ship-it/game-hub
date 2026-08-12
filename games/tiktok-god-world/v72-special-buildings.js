(() => {
  'use strict';

  const VERSION = 'v72-normal-special-buildings-3';
  const BUILD_COOLDOWN = 6;
  const SPECIAL_ROLL = 0.10;
  const SPECIAL_RETRY = 8;

  if (window.__V72_SPECIAL_BUILDINGS?.installed) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const isAtWar = (sim, k) => !!k?.alive && (sim.wars || []).some(w =>
    !w.done && (w.a === k.id || w.b === k.id));
  const countType = (k, type) => (k?.buildings || []).reduce((n, b) =>
    n + (b && b.type === type && !b.__v66Destroyed && (!Number.isFinite(b.hp) || b.hp > 0) ? 1 : 0), 0);
  const houseCount = k => (k?.buildings || []).reduce((n, b) =>
    n + (b && /^house_[abc]$/.test(b.type) && !b.__v66Destroyed && (!Number.isFinite(b.hp) || b.hp > 0) ? 1 : 0), 0);
  const affordable = (k, cost) => Object.entries(cost).every(([r, v]) => Number(k.resources?.[r] || 0) >= v);

  function weightedPick(entries) {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return entry;
    }
    return entries[entries.length - 1] || null;
  }

  function candidates(k) {
    const farms = countType(k, 'farm');
    const houses = houseCount(k);
    const territory = Number(k.territory?.size || 0);
    const list = [];

    // These remain normal AI buildings: they are simply rarer than houses,
    // farms, warehouses and markets and use the normal single-cell finder.
    if (farms >= 2) list.push({ type: 'windmill', weight: 3, cost: { wood: 82, stone: 34, gold: 8 } });
    if (houses >= 3 && Number(k.pop || 0) >= 10) list.push({ type: 'church', weight: 2, cost: { wood: 95, stone: 48, gold: 12 } });
    if (territory >= 12) list.push({ type: 'watchtower', weight: 3, cost: { wood: 82, stone: 38, gold: 6 } });
    if (territory >= 18) list.push({ type: 'stone_tower', weight: 2, cost: { wood: 45, stone: 72, gold: 10 } });
    if (Number(k.pop || 0) >= 14) list.push({ type: 'forge', weight: 2, cost: { wood: 92, stone: 48, gold: 10 } });
    if (farms >= 2) list.push({ type: 'silo', weight: 2, cost: { wood: 78, stone: 30, gold: 6 } });
    return list.filter(entry => affordable(k, entry.cost));
  }

  async function buildSpecial(sim, k, entry) {
    const cell = sim.findBuildCell(k, entry.type, false);
    if (!cell) return false;
    const building = await sim.addBuilding(k, entry.type, cell[0], cell[1], false);
    if (!building) return false;
    for (const [r, amount] of Object.entries(entry.cost)) k.resources[r] -= amount;
    k.lastBuild = sim.age;
    sim.r.puff?.(...sim.iso(cell[0], cell[1]));
    sim.updateSelected?.();
    return true;
  }

  async function install() {
    for (let i = 0; i < 2200; i++) {
      const sim = window.__SIM;
      if (sim?.r && typeof sim.buildAI === 'function' && typeof sim.findBuildCell === 'function' &&
          typeof sim.addBuilding === 'function' && window.__V71_SURGICAL_FIXES?.installed) break;
      await sleep(20);
    }

    const sim = window.__SIM;
    if (!sim?.r || typeof sim.buildAI !== 'function' || typeof sim.findBuildCell !== 'function' || typeof sim.addBuilding !== 'function') return;

    const originalBuildAI = sim.buildAI.bind(sim);
    sim.buildAI = async function(k) {
      if (!k?.alive || isAtWar(this, k) || this.age - k.lastBuild < BUILD_COOLDOWN) return originalBuildAI(k);

      // No deterministic scans, no cached territory search, no per-frame work.
      // One cheap probability check; only on success do we call the normal finder once.
      if (this.age >= Number(k.__v72NextSpecialAt || 0) && Math.random() < SPECIAL_ROLL) {
        k.__v72NextSpecialAt = this.age + SPECIAL_RETRY;
        const entry = weightedPick(candidates(k));
        if (entry && await buildSpecial(this, k, entry)) return true;
      }
      return originalBuildAI(k);
    };

    window.__V72_SPECIAL_BUILDINGS = {
      installed: true,
      version: VERSION,
      normalRandomConstruction: true,
      deterministicScannersRemoved: true,
      specialRoll: SPECIAL_ROLL,
      towersBuildable: true,
      windmillsBuildable: true,
      churchesBuildable: true,
      noExtraTicker: true,
      noTerritoryRescanLoop: true
    };
    document.documentElement.dataset.specialBuildings = VERSION;
  }

  install().catch(error => {
    window.__V72_SPECIAL_BUILDINGS_ERROR = String(error?.stack || error?.message || error);
    console.error('[v72-special-buildings]', error);
  });
})();
