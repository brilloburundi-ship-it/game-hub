(() => {
  'use strict';

  const VERSION = 'stable-v66-safe-frame';
  const MAX_FRAME_DT = 0.05;
  const MILITARY_BUILDINGS = new Set(['barracks', 'forge', 'watchtower', 'stone_tower', 'keep']);
  const STARTER_BUILDINGS = ['house_a', 'house_b', 'farm'];
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

  function keepCivilianNeutral(farmer) {
    const sprite = farmer?._sprite;
    if (sprite && !sprite.destroyed) sprite.tint = 0xffffff;
  }

  function repairBuildingVisual(r, k, b) {
    if (!b || b.__v66Destroyed || Number(b.hp) <= 0) return;
    if (b._foundation) { b._foundation.visible = false; b._foundation.alpha = 0; }
    if (b._shadow) { b._shadow.visible = false; b._shadow.alpha = 0; }
    const sprite = b._sprite;
    if (!sprite || sprite.destroyed) return;
    try {
      const texture = r.getBuildingTexture?.(k, b.type);
      if (texture?.width > 0 && texture?.height > 0) sprite.texture = texture;
    } catch (error) {
      recordRuntimeError('building-texture', error);
    }
    sprite.visible = true;
    sprite.renderable = true;
    sprite.tint = 0xffffff;
    sprite.alpha = Math.max(0.28, Number(sprite.alpha) || 0);
    sprite.anchor?.set?.(0.5, 1);
    sprite.y = Math.round(b.sy + (b.type === 'farm' ? 0 : 1));
    sprite.zIndex = Math.round(b.sy * 100) + 20;
    sprite.roundPixels = true;
  }

  function repairKingdomVisuals(r, k) {
    if (!k?.alive) return;
    for (const b of k.buildings || []) repairBuildingVisual(r, k, b);
    for (const farmer of k.farmers || []) keepCivilianNeutral(farmer);
    if (r.entities) r.entities.sortDirty = true;
  }

  async function ensureStarterVillage(sim, r, k) {
    if (!k?.alive) return;
    const living = (k.buildings || []).filter(b => !b.__v66Destroyed && Number(b.hp) > 0);
    if (living.length !== 1 || living[0].type !== 'castle') {
      repairKingdomVisuals(r, k);
      return;
    }

    for (const type of STARTER_BUILDINGS) {
      let cell = sim.findBuildCell?.(k, type, true) || null;
      if (!cell && typeof sim.claimGiftLand === 'function') {
        sim.claimGiftLand(k, 4);
        cell = sim.findBuildCell?.(k, type, true) || null;
      }
      if (!cell) continue;
      const b = await sim.addBuilding(k, type, cell[0], cell[1], false, true);
      if (b) repairBuildingVisual(r, k, b);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    repairKingdomVisuals(r, k);
    r.redrawSettlementGround?.(sim);
  }

  function installPostJoinPresentation(sim, r) {
    if (sim.__gwPostJoinPresentationInstalled) return;
    sim.__gwPostJoinPresentationInstalled = true;

    const baseAddBuilding = typeof sim.addBuilding === 'function' ? sim.addBuilding.bind(sim) : null;
    if (baseAddBuilding) {
      sim.addBuilding = async function (...args) {
        const b = await baseAddBuilding(...args);
        if (b) repairBuildingVisual(r, args[0], b);
        return b;
      };
    }

    const baseAddFarmer = typeof r.addFarmer === 'function' ? r.addFarmer.bind(r) : null;
    if (baseAddFarmer) {
      r.addFarmer = async function (k, farmer) {
        const result = await baseAddFarmer(k, farmer);
        keepCivilianNeutral(farmer);
        return result;
      };
    }

    const baseJoin = typeof sim.join === 'function' ? sim.join.bind(sim) : null;
    if (baseJoin) {
      sim.join = async function (name) {
        const k = await baseJoin(name);
        if (k?.alive) await ensureStarterVillage(this, r, k);
        return k;
      };
    }

    for (const k of sim.kingdoms || []) repairKingdomVisuals(r, k);
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
    // This module only adds safety/presentation guards to existing methods.
    sim.__gwIntegratedBattleInstalled = true;
    window.__BUILD_VERSION = VERSION;
    document.documentElement.dataset.battleSystem = 'stable-v66-safe-frame';
    document.documentElement.dataset.militarySpawn = 'infrastructure-required';

    installPostJoinPresentation(sim, r);
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