(() => {
  'use strict';

  const VERSION = 'v707-gameplay-polish-3';
  if (window.__V707_GAMEPLAY_POLISH?.bootstrap) return;

  const state = window.__V707_GAMEPLAY_POLISH = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    manualWorkFrames: false,
    foundingCivics: false,
    spearOverlayRemoved: false,
    viewerSupport: false,
    freeCivicsGranted: 0,
    likeSupportEvents: 0,
    roseSupportEvents: 0,
    errors: []
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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

  // Viewer support is deliberately cumulative: sustained likes and gifts must make
  // a supported kingdom visibly out-develop an otherwise equivalent idle kingdom.
  const SUPPORT_CAP = 32;
  const LIKE_SUPPORT_PER = 0.22;
  const ROSE_SUPPORT_PER = 3.5;

  // These two founding buildings are independent gifts. They never replace,
  // wrap or delay the simulation's original buildAI development loop.
  const CIVIC_PLAN = [
    { type: 'windmill', after: 2 },
    { type: 'church', after: 5 }
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
      if (!window.__SIM) return;
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
    return (k?.buildings || []).some(b => b && !b.__v66Destroyed && Number(b.hp) > 0 && b.type === type);
  }

  function markFreeCivic(k, type) {
    k.__v707FreeCivics ||= {};
    if (!k.__v707FreeCivics[type]) state.freeCivicsGranted++;
    k.__v707FreeCivics[type] = true;
  }

  async function grantFreeCivic(sim, k, plan) {
    if (!k?.alive) return false;
    if (k.__v707FreeCivics?.[plan.type]) return true;
    if (hasBuilding(k, plan.type)) {
      markFreeCivic(k, plan.type);
      return true;
    }
    if (typeof sim.findBuildCell !== 'function' || typeof sim.addBuilding !== 'function') return false;

    const cell = sim.findBuildCell(k, plan.type, false);
    if (!cell) return false;

    // addBuilding itself does not charge resources or alter lastBuild. The original
    // buildAI remains the only authority that spends resources and advances lastBuild.
    const building = await sim.addBuilding(k, plan.type, cell[0], cell[1], false, false);
    if (!building) return false;
    markFreeCivic(k, plan.type);
    k.__v707Civics ||= {};
    k.__v707Civics[plan.type] = sim.age;
    return true;
  }

  function scheduleFoundingCivic(sim, k, plan) {
    if (!k?.alive) return;
    k.__v707CivicSchedules ||= {};
    if (k.__v707CivicSchedules[plan.type]) return;

    const slot = k.__v707CivicSchedules[plan.type] = { attempts: 0, done: false };
    const attempt = async () => {
      if (!k?.alive || slot.done) return;
      if (hasBuilding(k, plan.type)) {
        markFreeCivic(k, plan.type);
        slot.done = true;
        return;
      }

      if (sim.__v69TickBusy || sim.__v707CivicGrantBusy) {
        setTimeout(attempt, 700);
        return;
      }

      sim.__v707CivicGrantBusy = true;
      let built = false;
      try {
        built = await grantFreeCivic(sim, k, plan);
      } catch (error) {
        state.errors.push(String(error?.stack || error?.message || error));
      } finally {
        sim.__v707CivicGrantBusy = false;
      }

      if (built) {
        slot.done = true;
        return;
      }
      slot.attempts++;
      if (slot.attempts < 24) setTimeout(attempt, 2500);
    };

    setTimeout(attempt, Math.max(0, plan.after * 1000));
  }

  function scheduleFoundingCivics(sim, k) {
    for (const plan of CIVIC_PLAN) scheduleFoundingCivic(sim, k, plan);
  }

  function installFoundingCivics(sim) {
    if (sim.__v707FoundingCivics || typeof sim.join !== 'function') return;
    sim.__v707FoundingCivics = true;

    const originalJoin = sim.join.bind(sim);
    sim.join = async function(...args) {
      const kingdom = await originalJoin(...args);
      if (kingdom?.alive) scheduleFoundingCivics(this, kingdom);
      return kingdom;
    };

    for (const k of sim.kingdoms || []) if (k?.alive) scheduleFoundingCivics(sim, k);
    state.foundingCivics = true;
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

  function supportedKingdom(sim, name) {
    return sim.kingdomByName?.get?.(String(name || '').toLowerCase()) || null;
  }

  function addViewerSupport(sim, k, points, duration) {
    if (!k?.alive) return;
    k.__v712ViewerSupport = clamp(Number(k.__v712ViewerSupport || 0) + points, 0, SUPPORT_CAP);
    k.__v712ViewerSupportUntil = Math.max(Number(k.__v712ViewerSupportUntil || 0), sim.age + duration);
  }

  function supportStrength(sim, k) {
    let meter = Number(k?.__v712ViewerSupport || 0);
    if (meter <= 0) return 0;
    if (sim.age > Number(k.__v712ViewerSupportUntil || 0)) {
      meter = Math.max(0, meter - 0.8);
      k.__v712ViewerSupport = meter;
      if (!meter) return 0;
    }
    return Math.min(1.6, meter / 10);
  }

  function applyLikeSupport(sim, k, count) {
    const n = Math.max(1, Number(count) || 1);
    k.resources.food += 0.90 * n;
    k.resources.wood += 0.65 * n;
    k.resources.stone += 0.28 * n;
    k.resources.gold += 0.12 * n;
    k.lastBuild -= Math.min(2.5, n * 0.08);
    k.lastExpand -= Math.min(1.5, n * 0.05);
    k.lastPop -= Math.min(0.8, n * 0.025);
    addViewerSupport(sim, k, n * LIKE_SUPPORT_PER, Math.max(14, Math.min(34, 10 + n * 0.6)));
    state.likeSupportEvents++;
  }

  async function applyRoseSupport(sim, k, repeat) {
    const n = Math.max(1, Number(repeat) || 1);
    k.resources.food += 65 * n;
    k.resources.wood += 55 * n;
    k.resources.stone += 30 * n;
    k.resources.gold += 16 * n;
    k.popCap += n;
    k.lastBuild -= Math.min(4, 1.35 * n);
    k.lastExpand -= Math.min(2.5, 0.85 * n);
    k.lastPop -= Math.min(1.8, 0.55 * n);
    addViewerSupport(sim, k, n * ROSE_SUPPORT_PER, Math.max(50, 35 + n * 10));
    if (typeof sim.giftPopulation === 'function') await sim.giftPopulation(k, Math.min(n, 3));
    state.roseSupportEvents++;
  }

  function applySupportEconomy(sim, k) {
    const strength = supportStrength(sim, k);
    if (strength <= 0) return;

    // Persistent spectator support accelerates the same normal economy/build cycle.
    // It never calls buildAI itself and never spawns buildings out of sequence.
    k.resources.food += 2.3 * strength;
    k.resources.wood += 1.8 * strength;
    k.resources.stone += 0.85 * strength;
    k.resources.gold += 0.42 * strength;

    k.lastBuild -= 0.55 * strength;
    k.lastExpand -= 0.38 * strength;
    k.lastPop -= 0.24 * strength;
  }

  function installViewerDevelopmentSupport(sim) {
    if (sim.__v712ViewerDevelopmentSupport) return;
    sim.__v712ViewerDevelopmentSupport = true;

    if (typeof sim.like === 'function') {
      const originalLike = sim.like.bind(sim);
      sim.like = function(name, count = 1) {
        const result = originalLike(name, count);
        const k = supportedKingdom(this, name);
        if (k?.alive) {
          applyLikeSupport(this, k, count);
          this.updateSelected?.();
        }
        return result;
      };
    }

    if (typeof sim.gift === 'function') {
      const originalGift = sim.gift.bind(sim);
      sim.gift = async function(name, gift, repeat = 1, meta = {}) {
        const result = await originalGift(name, gift, repeat, meta);
        const k = supportedKingdom(this, name);
        if (k?.alive && String(gift || '').toLowerCase().includes('rose')) {
          await applyRoseSupport(this, k, repeat);
          this.updateSelected?.();
        }
        return result;
      };
    }

    if (typeof sim.economy === 'function') {
      const originalEconomy = sim.economy.bind(sim);
      sim.economy = function(k) {
        const result = originalEconomy(k);
        if (k?.alive) applySupportEconomy(this, k);
        return result;
      };
    }

    state.viewerSupport = true;
  }

  async function install() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (sim?.r && typeof sim.join === 'function') break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Simulation unavailable for V7.0.7 gameplay polish');

    installFarmerAnimationSmoothing(sim);
    installFoundingCivics(sim);
    installNoDrawnSpears(sim);
    installViewerDevelopmentSupport(sim);

    state.installed = true;
    state.civicPlan = CIVIC_PLAN.map(p => ({ type: p.type, after: p.after, free: true, outsideBuildAI: true }));
    state.support = {
      likePerEvent: LIKE_SUPPORT_PER,
      rosePerEvent: ROSE_SUPPORT_PER,
      cap: SUPPORT_CAP,
      buildAIUntouched: true
    };
    document.documentElement.dataset.gameplayPolish = VERSION;
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v707-gameplay-polish]', error);
  });
})();
