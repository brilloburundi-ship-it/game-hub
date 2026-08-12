(() => {
  'use strict';

  const VERSION = 'v70-war-peace-cleanup-1';
  if (window.__V70_WAR_PEACE_CLEANUP?.installed) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function isAtWar(sim, kingdom) {
    if (!kingdom?.alive) return false;
    return (sim.wars || []).some(w => !w.done && (w.a === kingdom.id || w.b === kingdom.id));
  }

  function destroyDisplay(obj) {
    if (!obj) return null;
    try { obj.removeFromParent?.(); } catch (_) {}
    try { if (!obj.destroyed) obj.destroy({ children: true }); } catch (_) {
      try { if (!obj.destroyed) obj.destroy(); } catch (_) {}
    }
    return null;
  }

  function cleanupBuildingVisual(renderer, building) {
    if (!building) return;
    building._sprite = destroyDisplay(building._sprite);
    building._flag = destroyDisplay(building._flag);
    building._shadow = destroyDisplay(building._shadow);
    building._foundation = destroyDisplay(building._foundation);

    const fire = renderer.__v66Fires?.get?.(building);
    if (fire) {
      destroyDisplay(fire.c);
      renderer.__v66Fires.delete(building);
    }
  }

  function cleanupDestroyedBuildings(sim, renderer) {
    let changed = false;
    for (const kingdom of sim.kingdoms || []) {
      if (!Array.isArray(kingdom.buildings) || !kingdom.buildings.length) continue;
      const keep = [];
      for (const building of kingdom.buildings) {
        const destroyed = !!building?.__v66Destroyed || (Number.isFinite(building?.hp) && building.hp <= 0);
        if (!destroyed) {
          keep.push(building);
          continue;
        }
        if (building?.type === 'farm') sim.releaseFarmWorker?.(kingdom, building.id);
        cleanupBuildingVisual(renderer, building);
        changed = true;
      }
      if (keep.length !== kingdom.buildings.length) kingdom.buildings = keep;
    }
    if (changed) renderer.redrawSettlementGround?.(sim);
  }

  function cleanupDeadGuards(sim, renderer) {
    const guards = renderer.__v66Guards;
    if (!(guards instanceof Map)) return;

    for (const [kingdomId, arr] of guards) {
      const kingdom = sim.kingdoms?.[kingdomId];
      const keep = [];
      for (const unit of arr || []) {
        if (!unit?.s || unit.s.destroyed) continue;

        // When a kingdom falls, its remaining patrol/combat units must disappear
        // instead of becoming frozen orphan sprites after the war ends.
        if (!kingdom?.alive) {
          destroyDisplay(unit.s);
          continue;
        }

        if (unit.dead && Number(unit.deadAge || 0) >= 4.15) {
          destroyDisplay(unit.s);
          continue;
        }
        keep.push(unit);
      }
      guards.set(kingdomId, keep);
    }
  }

  function cleanupFarmerSpriteIndex(sim, renderer) {
    if (!(renderer.farmerSprites instanceof Map)) return;
    const liveIds = new Set();
    for (const kingdom of sim.kingdoms || []) {
      if (!kingdom?.alive) continue;
      for (const farmer of kingdom.farmers || []) if (farmer?.id) liveIds.add(farmer.id);
    }
    for (const [id, sprite] of [...renderer.farmerSprites]) {
      if (liveIds.has(id) && sprite && !sprite.destroyed) continue;
      destroyDisplay(sprite);
      renderer.farmerSprites.delete(id);
    }
  }

  function cleanupFinishedWarVisuals(sim, renderer) {
    if (!(renderer.warVisuals instanceof Map)) return;
    const activeIds = new Set((sim.wars || []).filter(w => !w.done).map(w => w.id));
    for (const [warId, visual] of [...renderer.warVisuals]) {
      if (activeIds.has(warId)) continue;
      destroyDisplay(visual?.container);
      renderer.warVisuals.delete(warId);
    }
  }

  async function install() {
    for (let i = 0; i < 2200; i++) {
      const sim = window.__SIM;
      if (sim?.r && typeof sim.buildAI === 'function' && typeof sim.expandAI === 'function' &&
          typeof sim.addBuilding === 'function' && window.__V67_PIXEL_BUILDINGS?.installed) break;
      await sleep(20);
    }

    const sim = window.__SIM, renderer = sim?.r;
    if (!sim || !renderer || typeof sim.buildAI !== 'function' || typeof sim.expandAI !== 'function' || typeof sim.addBuilding !== 'function') return;

    const originalBuildAI = sim.buildAI.bind(sim);
    sim.buildAI = async function (kingdom) {
      if (isAtWar(this, kingdom)) return null;
      return originalBuildAI(kingdom);
    };

    const originalExpandAI = sim.expandAI.bind(sim);
    sim.expandAI = function (kingdom) {
      if (isAtWar(this, kingdom)) return false;
      return originalExpandAI(kingdom);
    };

    // This final gate also covers instant/gift building. A kingdom may receive
    // resources or military help during war, but no new structure begins until peace.
    const originalAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = function (kingdom, type, x, y, forceCastle = false, instant = false, ...rest) {
      if (!forceCastle && kingdom?.alive && isAtWar(this, kingdom)) return null;
      return originalAddBuilding(kingdom, type, x, y, forceCastle, instant, ...rest);
    };

    // Gift-driven land claims obey the same wartime expansion pause.
    if (typeof sim.claimGiftLand === 'function') {
      const originalClaimGiftLand = sim.claimGiftLand.bind(sim);
      sim.claimGiftLand = function (kingdom, amount) {
        if (isAtWar(this, kingdom)) return 0;
        return originalClaimGiftLand(kingdom, amount);
      };
    }

    const previousWarState = new Map();
    let cleanupClock = 0;
    const housekeeping = dt => {
      cleanupClock += Math.min(0.1, Number(dt) || 0.016);
      if (cleanupClock < 0.75) return;
      cleanupClock = 0;

      for (const kingdom of sim.kingdoms || []) {
        const atWar = isAtWar(sim, kingdom);
        const wasAtWar = previousWarState.get(kingdom.id) || false;
        if (kingdom?.alive && wasAtWar && !atWar) {
          // Guarantee that neutral expansion can resume on the first peace tick.
          kingdom.lastExpand = Math.min(Number(kingdom.lastExpand) || 0, sim.age - 3);
          const target = sim.kingdoms?.[kingdom.aggressive];
          if (kingdom.aggressive != null && !target?.alive) kingdom.aggressive = null;
        }
        previousWarState.set(kingdom.id, atWar);
      }

      cleanupDestroyedBuildings(sim, renderer);
      cleanupDeadGuards(sim, renderer);
      cleanupFarmerSpriteIndex(sim, renderer);
      cleanupFinishedWarVisuals(sim, renderer);
    };

    if (renderer.app?.ticker) renderer.app.ticker.add(housekeeping);
    else setInterval(() => housekeeping(0.8), 800);

    window.__V70_WAR_PEACE_CLEANUP = {
      installed: true,
      version: VERSION,
      buildPausedDuringWar: true,
      expansionPausedDuringWar: true,
      resumesExpansionAfterWar: true,
      destroyedBuildingsPurged: true,
      deadNpcPurged: true,
      eliminatedKingdomGuardsPurged: true
    };
    document.documentElement.dataset.warPeaceCleanup = VERSION;
  }

  install().catch(error => {
    window.__V70_WAR_PEACE_CLEANUP_ERROR = String(error?.stack || error?.message || error);
    console.error('[v70-war-peace-cleanup]', error);
  });
})();