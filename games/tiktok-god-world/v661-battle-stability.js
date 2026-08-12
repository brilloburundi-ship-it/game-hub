(() => {
  'use strict';

  const VERSION = 'stable-v66-safe-frame';
  const MAX_FRAME_DT = 0.05;
  const MILITARY_BUILDINGS = new Set(['barracks', 'forge', 'watchtower', 'stone_tower', 'keep']);
  let lastErrorLogAt = 0;

  function hasMilitaryInfrastructure(k) {
    return !!k?.alive && (k.buildings || []).some(b =>
      b && !b.__v66Destroyed && Number(b.hp) > 0 && MILITARY_BUILDINGS.has(b.type)
    );
  }

  function recordRuntimeError(scope, error) {
    const message = String(error?.message || error || 'Unknown runtime error');
    window.__GW_LAST_RUNTIME_ERROR = {
      scope,
      message,
      stack: String(error?.stack || ''),
      at: Date.now()
    };
    const now = performance.now();
    if (now - lastErrorLogAt >= 5000) {
      lastErrorLogAt = now;
      console.error(`[God World ${scope}]`, error);
    }
  }

  function removePrematureGuards(sim, r) {
    for (const k of sim.kingdoms || []) {
      if (hasMilitaryInfrastructure(k)) continue;
      const guards = r.__v66Guards?.get(k.id) || [];
      for (const u of guards) {
        try {
          if (u?.s && !u.s.destroyed) u.s.destroy({ children: true });
        } catch (_) {}
      }
      r.__v66Guards?.set(k.id, []);
      r.__v66NextSpawn?.set(k.id, (Number(r.__v66Clock) || 0) + 0.5);
    }
  }

  function installMilitaryGate(sim, r) {
    if (r.__gwMilitaryGateInstalled) return;
    r.__gwMilitaryGateInstalled = true;
    const baseMakeSoldier = typeof r.makeSoldier === 'function' ? r.makeSoldier.bind(r) : null;
    if (!baseMakeSoldier) return;

    r.makeSoldier = function (k, role) {
      if (!hasMilitaryInfrastructure(k)) return null;
      if (performance.now() < (this.__gwPauseGuardsUntil || 0)) return null;
      try {
        return baseMakeSoldier(k, role);
      } catch (error) {
        recordRuntimeError('soldier-create', error);
        return null;
      }
    };

    removePrematureGuards(sim, r);
  }

  function installSafeBattleFrame(sim, r) {
    if (r.__gwSafeBattleFrameInstalled) return;
    r.__gwSafeBattleFrameInstalled = true;
    const baseUpdateWars = typeof r.updateWars === 'function' ? r.updateWars.bind(r) : null;
    if (!baseUpdateWars) return;

    r.updateWars = function (battleSim, rawDt) {
      const dt = Math.max(0.001, Math.min(MAX_FRAME_DT, Number(rawDt) || 0.016));
      try {
        return baseUpdateWars(battleSim, dt);
      } catch (error) {
        recordRuntimeError('battle-frame', error);
        return undefined;
      }
    };
  }

  function installSafeWorldFrame(sim, r) {
    if (sim.__gwSafeWorldFrameInstalled) return;
    sim.__gwSafeWorldFrameInstalled = true;
    const baseUpdate = typeof sim.update === 'function' ? sim.update.bind(sim) : null;
    if (baseUpdate) {
      sim.update = function (rawDt) {
        const dt = Math.max(0.001, Math.min(MAX_FRAME_DT, Number(rawDt) || 0.016));
        try {
          return baseUpdate(dt);
        } catch (error) {
          recordRuntimeError('world-frame', error);
          return undefined;
        }
      };
    }

    const baseUpdateFx = typeof r.updateFx === 'function' ? r.updateFx.bind(r) : null;
    if (baseUpdateFx) {
      r.updateFx = function (rawDt) {
        const dt = Math.max(0.001, Math.min(MAX_FRAME_DT, Number(rawDt) || 0.016));
        try {
          return baseUpdateFx(dt);
        } catch (error) {
          recordRuntimeError('fx-frame', error);
          return undefined;
        }
      };
    }
  }

  function install(sim) {
    if (!sim || sim.__gwIntegratedBattleInstalled) return;
    const r = sim.r;
    if (!r?.__v66Guards || !sim.__v66LivingBattlesInstalled) {
      setTimeout(() => install(sim), 40);
      return;
    }

    // Keep the proven V6.6 battle implementation as the only battle authority.
    // This module only guards its frame and prevents soldiers from existing before
    // the kingdom has actually developed military infrastructure.
    sim.__gwIntegratedBattleInstalled = true;
    window.__BUILD_VERSION = VERSION;
    document.documentElement.dataset.battleSystem = 'stable-v66-safe-frame';
    document.documentElement.dataset.militarySpawn = 'infrastructure-required';

    installMilitaryGate(sim, r);
    installSafeBattleFrame(sim, r);
    installSafeWorldFrame(sim, r);
  }

  function wait() {
    const sim = window.__SIM;
    if (!sim || !sim.__v66LivingBattlesInstalled || !sim.r?.__v66Guards) {
      setTimeout(wait, 30);
      return;
    }
    install(sim);
  }

  wait();
})();
