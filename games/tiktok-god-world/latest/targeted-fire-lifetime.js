(() => {
  'use strict';

  const VERSION = 'v713-targeted-fire-lifetime-1';
  const FIRE_MIN_MS = 3200;
  const FIRE_MAX_MS = 3800;
  if (window.__V713_TARGETED_FIRE_LIFETIME?.bootstrap) return;

  const state = window.__V713_TARGETED_FIRE_LIFETIME = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    minMs: FIRE_MIN_MS,
    maxMs: FIRE_MAX_MS,
    removedAfterFire: 0,
    errors: []
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  function removeBurningBuilding(sim, renderer, building) {
    if (!building || building.__v66Destroyed) return false;
    const kingdom = sim.kingdoms?.[building.owner] ||
      (sim.kingdoms || []).find(k => (k.buildings || []).includes(building));

    building.hp = 0;
    building.__v66Destroyed = true;
    if (kingdom) {
      kingdom.buildings = (kingdom.buildings || []).filter(entry => entry !== building);
      sim.releaseFarmWorker?.(kingdom, building.id);
    }
    renderer.destroyBuilding?.(building);
    renderer.redrawSettlementGround?.(sim);
    sim.updateSelected?.();
    state.removedAfterFire++;
    return true;
  }

  function installLifetime(sim) {
    const r = sim.r;
    if (!r || r.__v713FireLifetime || typeof r.updateWars !== 'function') return false;
    r.__v713FireLifetime = true;
    const originalUpdateWars = r.updateWars.bind(r);

    r.updateWars = function(battleSim, rawDt) {
      const result = originalUpdateWars(battleSim, rawDt);
      const fires = this.__v66Fires;
      if (!(fires instanceof Map) || !fires.size) return result;

      const now = performance.now();
      for (const [building, fx] of [...fires]) {
        if (!building || building.__v66Destroyed || !fx) continue;
        if (!Number.isFinite(fx.__v713RemoveAt)) {
          fx.__v713RemoveAt = now + rand(FIRE_MIN_MS, FIRE_MAX_MS);
        }
        // Legacy hits can extend fire.life. Cap only that existing value; no new
        // particles, timers or ticker are created by this patch.
        if (Number.isFinite(fx.life)) fx.life = Math.min(fx.life, 4);
        if (now >= fx.__v713RemoveAt) removeBurningBuilding(battleSim || sim, this, building);
      }
      return result;
    };
    return true;
  }

  async function install() {
    for (let i = 0; i < 2000; i++) {
      const sim = window.__SIM;
      if (sim?.r?.__v66Fires instanceof Map && typeof sim.r.updateWars === 'function' && sim.__v661BattleStabilityInstalled) break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r || !installLifetime(sim)) throw new Error('Fire lifetime guard unavailable');
    state.installed = true;
    document.documentElement.dataset.targetedFireLifetime = VERSION;
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v713-targeted-fire-lifetime]', error);
  });
})();
