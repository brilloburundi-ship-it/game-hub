(() => {
  'use strict';

  const VERSION = '20260814-live-prelaunch-1';
  const BLOCKED_PREFABS = new Set(['stable', 'forge']);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  if (window.__KW2_LIVE_PRELAUNCH_PATCH?.installed) return;

  function sameWar(war, a, b) {
    return !!war && !war.done && (
      (war.a === a.id && war.b === b.id) ||
      (war.a === b.id && war.b === a.id)
    );
  }

  async function install() {
    // Install after the existing late runtime wrappers so this remains the final,
    // narrow pre-live policy layer and does not alter their implementation.
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      const runtimeReady = !!(
        sim?.r &&
        typeof sim.warAI === 'function' &&
        typeof sim.addBuilding === 'function' &&
        window.__V70_WAR_PEACE_CLEANUP?.installed &&
        window.__V707_GAMEPLAY_POLISH?.installed &&
        window.__V713_LIVE_POWER?.installed &&
        window.__V800_PERFORMANCE_KERNEL?.installed
      );
      if (runtimeReady) break;
      await sleep(25);
    }

    const sim = window.__SIM;
    if (!sim?.r || typeof sim.warAI !== 'function' || typeof sim.addBuilding !== 'function') {
      throw new Error('Kingdom War 2 simulation unavailable for live prelaunch patch');
    }
    if (sim.__kw2LivePrelaunchPatch === VERSION) return;

    const originalAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = function(kingdom, type, ...rest) {
      const normalized = String(type ?? '').trim().toLowerCase();
      if (BLOCKED_PREFABS.has(normalized)) return null;
      return originalAddBuilding(kingdom, type, ...rest);
    };

    // No random wars in LIVE. Explicit ATTACK is preserved: attack() sets
    // kingdom.aggressive, expansion advances toward that target, and this method
    // starts the war only when those explicitly targeted kingdoms share a border.
    sim.warAI = function() {
      if (this.matchOver) return false;

      for (const kingdom of this.kingdoms || []) {
        if (!kingdom?.alive || kingdom.aggressive == null) continue;

        const target = this.kingdoms?.[kingdom.aggressive];
        if (!target?.alive || target === kingdom || this.areAllied?.(kingdom, target)) {
          kingdom.aggressive = null;
          continue;
        }

        if ((this.wars || []).some(war => sameWar(war, kingdom, target))) continue;
        if (this.borderPair?.(kingdom, target)) this.startWar?.(kingdom, target);
      }
      return true;
    };

    sim.__kw2LivePrelaunchPatch = VERSION;
    window.__KW2_LIVE_PRELAUNCH_PATCH = Object.freeze({
      installed: true,
      version: VERSION,
      randomAutomaticWars: false,
      explicitAttackPreserved: true,
      blockedPrefabs: Object.freeze(['stable', 'forge'])
    });
    document.documentElement.dataset.kw2LivePrelaunch = VERSION;
  }

  install().catch(error => {
    window.__KW2_LIVE_PRELAUNCH_PATCH_ERROR = String(error?.stack || error?.message || error);
    console.error('[Kingdom War 2 live prelaunch]', error);
  });
})();
