(() => {
  'use strict';

  const VERSION = 'v713-targeted-port-guard-1';
  const PORT_SEA_DIRECTIONS = [[0, 1], [1, 0]];
  if (window.__V713_TARGETED_PORT_GUARD?.bootstrap) return;

  const state = window.__V713_TARGETED_PORT_GUARD = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    rejectedInland: 0,
    rejectedDuplicate: 0,
    errors: []
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function isSea(sim, x, y) {
    return !!sim.inBounds?.(x, y) && !sim.land?.(x, y);
  }

  function strictCoastalCell(sim, kingdom, x, y) {
    if (!kingdom?.alive || !sim.inBounds?.(x, y) || !sim.land?.(x, y)) return false;
    if (sim.isRiver?.(x, y) || sim.getOwner?.(x, y) !== kingdom.id) return false;
    if (['mountain', 'ice_coast'].includes(sim.biome?.(x, y))) return false;
    if ((sim.coastDistance?.(x, y) ?? 99) > 1) return false;
    return PORT_SEA_DIRECTIONS.some(([dx, dy]) => isSea(sim, x + dx, y + dy));
  }

  function hasPort(kingdom) {
    return (kingdom?.buildings || []).some(b =>
      b?.type === 'port' && !b.__v66Destroyed && (!Number.isFinite(b.hp) || b.hp > 0)
    );
  }

  function installGuard(sim) {
    if (sim.__v713StrictPortGuard || typeof sim.addBuilding !== 'function') return false;
    sim.__v713StrictPortGuard = true;
    const originalAddBuilding = sim.addBuilding.bind(sim);

    sim.addBuilding = function(kingdom, type, x, y, ...rest) {
      if (type === 'port') {
        if (hasPort(kingdom)) {
          state.rejectedDuplicate++;
          return null;
        }
        // Validate the real cell even when an older recovery path passes force=true.
        // A port therefore cannot bypass the coast rule through any caller.
        if (!strictCoastalCell(this, kingdom, x, y)) {
          state.rejectedInland++;
          return null;
        }
      }
      return originalAddBuilding(kingdom, type, x, y, ...rest);
    };
    return true;
  }

  async function install() {
    for (let i = 0; i < 2000; i++) {
      const sim = window.__SIM;
      if (sim?.r && typeof sim.addBuilding === 'function' && window.__V67_PIXEL_BUILDINGS?.installed) break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r || !installGuard(sim)) throw new Error('Strict port guard unavailable');
    state.installed = true;
    document.documentElement.dataset.targetedPortGuard = VERSION;
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v713-targeted-port-guard]', error);
  });
})();
