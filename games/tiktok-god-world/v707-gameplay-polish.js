(() => {
  'use strict';

  const VERSION = 'v707-gameplay-polish-2';
  if (window.__V707_GAMEPLAY_POLISH?.bootstrap) return;

  const state = window.__V707_GAMEPLAY_POLISH = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    manualWorkFrames: false,
    earlyCivics: false,
    spearOverlayRemoved: false,
    errors: []
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const WORK_ACTIONS = new Set([
    'harvest', 'plant_seed', 'dig', 'pickaxe', 'water', 'chop_wood',
    'fish', 'milk_cow', 'push_cart', 'carry_sack', 'carry_log', 'carry_basket'
  ]);

  const WORK_FRAME_MS = {
    harvest: 390,
    plant_seed: 410,
    dig: 420,
    pickaxe: 420,
    water: 430,
    chop_wood: 390,
    fish: 500,
    milk_cow: 520,
    push_cart: 360,
    carry_sack: 380,
    carry_log: 380,
    carry_basket: 380
  };

  // The first windmill and church are founding gifts. They are attempted before the
  // ordinary economy starts building, cost no resources and never consume lastBuild.
  const CIVIC_PLAN = [
    { type: 'windmill', after: 2 },
    { type: 'church', after: 4 }
  ];

  function spriteAction(sprite, farmer) {
    return String(sprite?._action || farmer?.action || 'idle');
  }

  function tuneSprite(farmer, forceActionReset = false) {
    const sprite = farmer?._sprite;
    if (!sprite || sprite.destroyed) return;
    const action = spriteAction(sprite, farmer);

    if (WORK_ACTIONS.has(action)) {
      const changed = sprite.__v707ManagedAction !== action;
      sprite.autoUpdate = false;
      sprite.animationSpeed = 0;
      if (changed || forceActionReset) {
        sprite.__v707ManagedAction = action;
        sprite.__v707NextFrameAt = performance.now() + 90 + Math.random() * 160;
        try { sprite.gotoAndStop?.(0); } catch (_) {}
      }
      return;
    }

    if (sprite.__v707ManagedAction) {
      sprite.__v707ManagedAction = '';
      sprite.__v707NextFrameAt = 0;
    }
    sprite.autoUpdate = true;
    if (action.startsWith('walk')) sprite.animationSpeed = 0.058;
    else if (action.startsWith('run')) sprite.animationSpeed = 0.070;
    else if (['eat', 'celebrate', 'hurt'].includes(action)) sprite.animationSpeed = 0.040;
    else sprite.animationSpeed = 0.032;
  }

  function installFarmerAnimationSmoothing(sim) {
    const r = sim.r;
    if (!r || r.__v707WorkerAnimationSmoothing) return;
    r.__v707WorkerAnimationSmoothing = true;

    const originalSet = typeof r.setFarmerAction === 'function' ? r.setFarmerAction.bind(r) : null;
    if (originalSet) {
      r.setFarmerAction = function(farmer, action) {
        const requested = String(action || 'idle');
        const sprite = farmer?._sprite;
        const current = spriteAction(sprite, farmer);
        const now = performance.now();

        if (
          farmer?.fixedBuilding && sprite && WORK_ACTIONS.has(current) && WORK_ACTIONS.has(requested) &&
          current !== requested && now - Number(sprite.__v707LastWorkSheetSwap || 0) < 6800
        ) {
          tuneSprite(farmer, false);
          return sprite;
        }

        const result = originalSet(farmer, action);
        if (farmer?._sprite && WORK_ACTIONS.has(spriteAction(farmer._sprite, farmer))) {
          farmer._sprite.__v707LastWorkSheetSwap = now;
        }
        tuneSprite(farmer, true);
        return result;
      };
    }

    const originalUpdate = typeof r.updateFarmer === 'function' ? r.updateFarmer.bind(r) : null;
    if (originalUpdate) {
      r.updateFarmer = function(farmer, dx, dy) {
        const result = originalUpdate(farmer, dx, dy);
        tuneSprite(farmer, false);
        return result;
      };
    }

    const originalMake = typeof r.makeFarmerSprite === 'function' ? r.makeFarmerSprite.bind(r) : null;
    if (originalMake) {
      r.makeFarmerSprite = function(action) {
        const sprite = originalMake(action);
        if (sprite && WORK_ACTIONS.has(String(action || ''))) {
          sprite.autoUpdate = false;
          sprite.animationSpeed = 0;
          sprite.__v707ManagedAction = String(action);
          sprite.__v707NextFrameAt = performance.now() + 120;
          try { sprite.gotoAndStop?.(0); } catch (_) {}
        }
        return sprite;
      };
    }

    for (const k of sim.kingdoms || []) for (const f of k.farmers || []) tuneSprite(f, true);

    let lastSweep = 0;
    const frameLoop = now => {
      if (!state.installed && !window.__SIM) return;
      if (now - lastSweep >= 70) {
        lastSweep = now;
        for (const k of sim.kingdoms || []) {
          if (!k?.alive) continue;
          for (const farmer of k.farmers || []) {
            const sprite = farmer?._sprite;
            if (!sprite || sprite.destroyed) continue;
            const action = spriteAction(sprite, farmer);
            if (!WORK_ACTIONS.has(action)) continue;
            tuneSprite(farmer, false);
            if (now < Number(sprite.__v707NextFrameAt || 0)) continue;
            const total = Math.max(1, Number(sprite.totalFrames || sprite.textures?.length || 1));
            if (total > 1) {
              const next = (Number(sprite.currentFrame || 0) + 1) % total;
              try { sprite.gotoAndStop?.(next); } catch (_) {}
            }
            sprite.__v707NextFrameAt = now + (WORK_FRAME_MS[action] || 420);
          }
        }
      }
      requestAnimationFrame(frameLoop);
    };
    requestAnimationFrame(frameLoop);
    state.manualWorkFrames = true;
  }

  function hasBuilding(k, type) {
    return (k?.buildings || []).some(b => b && !b.__v66Destroyed && b.hp > 0 && b.type === type);
  }

  function freeCivicGranted(k, type) {
    return !!k?.__v707FreeCivics?.[type];
  }

  async function buildFreeCivic(sim, k, plan) {
    if (!k?.alive || freeCivicGranted(k, plan.type) || hasBuilding(k, plan.type)) {
      if (hasBuilding(k, plan.type)) {
        k.__v707FreeCivics ||= {};
        k.__v707FreeCivics[plan.type] = true;
      }
      return false;
    }
    if (typeof sim.findBuildCell !== 'function' || typeof sim.addBuilding !== 'function') return false;

    const cell = sim.findBuildCell(k, plan.type, false);
    if (!cell) return false;

    // Completely free: no resource top-up, no deduction and no refund path.
    // Preserve lastBuild exactly so the normal city-development cadence is untouched.
    const previousLastBuild = k.lastBuild;
    const building = await sim.addBuilding(k, plan.type, cell[0], cell[1], false, false);
    k.lastBuild = previousLastBuild;
    if (!building) return false;

    k.__v707FreeCivics ||= {};
    k.__v707FreeCivics[plan.type] = true;
    k.__v707Civics ||= {};
    k.__v707Civics[plan.type] = sim.age;
    return true;
  }

  function installEarlyCivics(sim) {
    if (sim.__v707EarlyCivics || typeof sim.buildAI !== 'function') return;
    sim.__v707EarlyCivics = true;
    const originalBuildAI = sim.buildAI.bind(sim);

    sim.buildAI = async function(k) {
      if (!k?.alive) return originalBuildAI(k);
      if (!Number.isFinite(k.__v707JoinAge)) k.__v707JoinAge = this.age;
      const kingdomAge = this.age - k.__v707JoinAge;

      // Free civic attempts are additive. Failure to find a cell never blocks the
      // original AI; success also does not reset its build timer or spend resources.
      for (const plan of CIVIC_PLAN) {
        if (freeCivicGranted(k, plan.type) || kingdomAge < plan.after) continue;
        await buildFreeCivic(this, k, plan);
      }

      return originalBuildAI(k);
    };
    state.earlyCivics = true;
  }

  function removeWeaponOverlay(container) {
    const weapon = container?._weapon;
    if (!weapon) return false;
    try { weapon.parent?.removeChild?.(weapon); } catch (_) {}
    try { weapon.destroy?.({ children: true }); } catch (_) {}
    container._weapon = null;
    container.__v707NoDrawnSpear = true;
    return true;
  }

  function cleanExistingSpearOverlays(r) {
    let removed = 0;
    for (const [, guards] of r.__v66Guards || []) {
      for (const guard of guards || []) if (removeWeaponOverlay(guard?.s)) removed++;
    }
    for (const visual of r.warVisuals?.values?.() || []) {
      for (const unit of visual?.armies || []) if (removeWeaponOverlay(unit?.s)) removed++;
    }
    return removed;
  }

  function installNoDrawnSpears(sim) {
    const r = sim.r;
    if (!r || r.__v707NoDrawnSpears || typeof r.makeSoldier !== 'function') return;
    r.__v707NoDrawnSpears = true;
    const originalMakeSoldier = r.makeSoldier.bind(r);
    r.makeSoldier = function(k, role) {
      const soldier = originalMakeSoldier(k, role);
      removeWeaponOverlay(soldier);
      return soldier;
    };
    cleanExistingSpearOverlays(r);
    state.spearOverlayRemoved = true;
  }

  async function install() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (sim?.r && typeof sim.buildAI === 'function') break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Simulation unavailable for V7.0.7 gameplay polish');

    installFarmerAnimationSmoothing(sim);
    installEarlyCivics(sim);
    installNoDrawnSpears(sim);

    state.installed = true;
    state.civicPlan = CIVIC_PLAN.map(p => ({ type: p.type, after: p.after, free: true, nonBlocking: true }));
    document.documentElement.dataset.gameplayPolish = VERSION;
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v707-gameplay-polish]', error);
  });
})();
