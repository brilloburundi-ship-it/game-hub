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
      r.makeFarmerSprite = function(...args) {
        const action = args[0];
        const sprite = originalMake(...args);
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

// Targeted V7.1.2 recovery/engagement layer. It deliberately lives inside the
// existing latest/gameplay.js release file so no additional patch script is loaded.
(() => {
  'use strict';

  const VERSION = 'v803-engagement-recovery-3-visible-citizens';
  if (window.__V712_ENGAGEMENT_RECOVERY?.bootstrap) return;

  const state = window.__V712_ENGAGEMENT_RECOVERY = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    interactionPower: false,
    bigHelpCity: false,
    windmillRecovery: false,
    portRecovery: false,
    likePowerEvents: 0,
    giftPowerEvents: 0,
    bigHelpCities: 0,
    lastBigHelpRequested: 0,
    lastBigHelpBuilt: 0,
    lastBigHelpCitizens: 0,
    recoveredWindmills: 0,
    portsBuilt: 0,
    portsWaitingForCoast: 0,
    errors: []
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const LIKE_POWER_PER = 0.035;
  const FOLLOW_POWER = 4;
  const PORT_MIN_AGE = 30;
  const PORT_COST = { wood: 90, stone: 24, gold: 12 };

  const BIG_CITY_GIFTS = [
    'meteor', 'galaxy', 'lion', 'universe', 'dragon', 'castle fantasy',
    'interstellar', 'phoenix'
  ];

  const BIG_CITY_PATTERN = [
    'house', 'house', 'house', 'house', 'house', 'house', 'house', 'house',
    'farm', 'farm', 'farm', 'farm',
    'warehouse', 'warehouse', 'market',
    'barracks', 'barracks', 'forge', 'stable', 'silo',
    'church', 'windmill', 'watchtower', 'stone_tower'
  ];

  function kingdomByName(sim, name) {
    return sim?.kingdomByName?.get?.(String(name || '').toLowerCase()) || null;
  }

  function hasPort(k) {
    return (k?.buildings || []).some(b => b?.type === 'port' && !b.__v66Destroyed && Number(b.hp) > 0);
  }

  function giftFallbackValue(name) {
    const g = String(name || '').toLowerCase();
    if (g.includes('rose')) return 1;
    if (g.includes('ice cream') || g.includes('finger heart')) return 5;
    if (g.includes('coffee') || g.includes('doughnut') || g.includes('donut')) return 15;
    if (g.includes('perfume') || g.includes('firework') || g.includes('tiktok')) return 50;
    if (g.includes('money gun') || g.includes('train') || g.includes('motorcycle')) return 180;
    if (g.includes('sports car') || g.includes('yacht') || g.includes('private jet') || g.includes('whale diving')) return 600;
    if (BIG_CITY_GIFTS.some(token => g.includes(token))) return 1500;
    return 1;
  }

  function giftValue(gift, repeat, meta) {
    const n = Math.max(1, Number(repeat) || 1);
    const fields = [meta?.diamonds, meta?.diamondCount, meta?.giftValue, meta?.coinValue, meta?.value, meta?.price];
    const explicit = fields.map(Number).find(value => Number.isFinite(value) && value > 0);
    return Math.max(1, Math.max(0, explicit || 0) || giftFallbackValue(gift)) * n;
  }

  function giftPower(value) {
    if (value >= 1000) return 24;
    if (value >= 500) return 15;
    if (value >= 100) return 8;
    if (value >= 20) return 4;
    if (value >= 5) return 2;
    return 0.9;
  }

  function strengthenViewerMeter(sim, k, points, duration) {
    if (!k?.alive) return;
    k.__v712ViewerSupport = clamp(Number(k.__v712ViewerSupport || 0) + points, 0, 32);
    k.__v712ViewerSupportUntil = Math.max(Number(k.__v712ViewerSupportUntil || 0), sim.age + duration);
  }

  function isBigHelpGift(gift, repeat, meta) {
    const g = String(gift || '').toLowerCase();
    return BIG_CITY_GIFTS.some(token => g.includes(token)) || giftValue(gift, repeat, meta) >= 1000;
  }

  function bigCityBuildingCount(gift, value, repeat) {
    const name = String(gift || '').toLowerCase();
    let count = name.includes('galaxy') ? 28 : name.includes('lion') ? 34 : 40;
    if (value >= 2500) count += 3;
    if (value >= 5000) count += 3;
    count += (clamp(Math.max(1, Number(repeat) || 1), 1, 3) - 1) * 8;
    return clamp(Math.round(count), 28, 56);
  }

  function bigCityPlan(count) {
    const plan = [];
    for (let index = 0; plan.length < count && index < count * 3; index++) {
      const type = BIG_CITY_PATTERN[index % BIG_CITY_PATTERN.length];
      plan.push(type);
    }
    return plan;
  }

  async function buildPowerCity(sim, k, gift, repeat = 1, meta = {}) {
    if (!k?.alive || typeof sim.instantGiftBuild !== 'function') return 0;
    const run = async () => {
      if (!k?.alive || k.founding) return 0;
      k.__v712BigHelpBusy = true;
      try {
      const scale = clamp(Math.max(1, Number(repeat) || 1), 1, 3);
      const value = giftValue(gift, repeat, meta);
      const types = bigCityPlan(bigCityBuildingCount(gift, value, repeat));
      k.resources.food += 1800 * scale;
      k.resources.wood += 1500 * scale;
      k.resources.stone += 1050 * scale;
      k.resources.gold += 750 * scale;
      k.military += 120 * scale;
      k.popCap += 22 * scale;

      sim.claimGiftLand?.(k, Math.round(20 + types.length * 1.1));
      const built = await sim.instantGiftBuild(k, types);
      // Large building plans also populate the streets they create. The existing
      // citizen owner remains syncCitizens; this only raises its per-kingdom cap.
      const realizedPlan = Math.max(Number(built) || 0, Math.min(types.length, 12));
      const visibleCitizenTarget = clamp(Math.round(10 + realizedPlan * 0.55), 24, 36);
      const citizenGain = clamp(Math.round(realizedPlan * 0.65), 18, 32);
      k.__v712VisibleCitizenCap = Math.max(Number(k.__v712VisibleCitizenCap) || 0, visibleCitizenTarget);
      if (typeof sim.giftPopulation === 'function') await sim.giftPopulation(k, citizenGain);
      k.lastBuild -= 8;
      k.lastExpand -= 5;
      k.lastPop -= 4;
      strengthenViewerMeter(sim, k, 16, 120);
      sim.r?.supportFx?.(k, '👑', 14);
      sim.updateSelected?.();
      state.bigHelpCities++;
      state.bigHelpCity = true;
      state.lastBigHelpRequested = types.length;
      state.lastBigHelpBuilt = built || 0;
      state.lastBigHelpCitizens = k.farmers?.length || 0;
      return built || 0;
      } catch (error) {
        state.errors.push(String(error?.stack || error?.message || error));
        return 0;
      } finally {
        k.__v712BigHelpBusy = false;
      }
    };

    // Preserve every LIVE event, but serialize this existing owner per kingdom so
    // two Universe/Lion gifts cannot race or make the second plan disappear.
    const previous = k.__v712BigHelpQueue || Promise.resolve();
    const queued = Promise.resolve(previous).catch(() => 0).then(run);
    k.__v712BigHelpQueue = queued;
    try { return await queued; }
    finally { if (k.__v712BigHelpQueue === queued) k.__v712BigHelpQueue = null; }
  }

  function installInteractionPower(sim) {
    if (sim.__v712InteractionPower) return false;
    sim.__v712InteractionPower = true;

    if (typeof sim.like === 'function') {
      const originalLike = sim.like.bind(sim);
      sim.like = function(name, count = 1) {
        const out = originalLike(name, count);
        const k = kingdomByName(this, name);
        if (k?.alive) {
          const n = Math.max(1, Number(count) || 1);
          // Power impact is intentionally contained: engagement helps, gifts remain stronger.
          k.military += n * LIKE_POWER_PER;
          strengthenViewerMeter(this, k, Math.min(3.5, n * 0.035), Math.min(40, 12 + n * 0.25));
          state.likePowerEvents++;
          this.updateSelected?.();
        }
        return out;
      };
    }

    if (typeof sim.follow === 'function') {
      const originalFollow = sim.follow.bind(sim);
      sim.follow = function(name, ...rest) {
        const before = kingdomByName(this, name)?.followed;
        const out = originalFollow(name, ...rest);
        const k = kingdomByName(this, name);
        if (k?.alive && !before && k.followed) {
          k.military += FOLLOW_POWER;
          strengthenViewerMeter(this, k, 5, 45);
          this.updateSelected?.();
        }
        return out;
      };
    }

    if (typeof sim.gift === 'function') {
      const originalGift = sim.gift.bind(sim);
      sim.gift = async function(name, gift, repeat = 1, meta = {}) {
        const ready = typeof this.waitForKingdomReady === 'function' ? await this.waitForKingdomReady(name) : kingdomByName(this, name);
        const isHighGift = !!ready?.alive && isBigHelpGift(gift, repeat, meta);
        const routedMeta = isHighGift ? { ...meta, __v712HighGiftPlan: true } : meta;
        {
          const out = await originalGift(name, gift, repeat, routedMeta);
          const k = kingdomByName(this, name);
          if (!k?.alive) return out;

          const value = giftValue(gift, repeat, meta);
          const power = giftPower(value);
          k.military += power;
          strengthenViewerMeter(this, k, clamp(power * 0.42, 0.6, 10), clamp(30 + power * 4, 35, 120));
          k.lastBuild -= clamp(power * 0.16, 0.2, 4.5);
          k.lastExpand -= clamp(power * 0.10, 0.15, 3.0);
          k.lastPop -= clamp(power * 0.07, 0.1, 2.0);
          state.giftPowerEvents++;

          if (isHighGift) await buildPowerCity(this, k, gift, repeat, meta);
          this.updateSelected?.();
          return out;
        }
      };
    }

    state.interactionPower = true;
    return true;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Windmill recovery frame failed to load'));
      image.src = url;
    });
  }

  async function installWindmillRecovery(sim) {
    const r = sim.r, P = window.PIXI;
    const list = window.__V67_ASSET_DATA?.windmill;
    if (!r?.app?.ticker || !P?.Texture || !Array.isArray(list) || list.length < 7 || !r.textureToCanvas || !r.recolorTeamCanvas) return false;
    if (r.__v712WindmillRecovery) return true;
    r.__v712WindmillRecovery = true;

    const images = await Promise.all(list.slice(3).map(loadImage));
    const baseFrames = images.map(image => P.Texture.from(image));
    const cache = new Map();
    const recovered = new Set();
    const health = new WeakMap();

    const framesFor = k => {
      if (cache.has(k.id)) return cache.get(k.id);
      const frames = baseFrames.map(tex => {
        const canvas = r.textureToCanvas(tex);
        if (!canvas) return tex;
        r.recolorTeamCanvas(canvas, k.color);
        return P.Texture.from(canvas);
      });
      cache.set(k.id, frames);
      return frames;
    };

    const recover = (k, b, now) => {
      if (!b?._sprite || b._sprite.destroyed || b.__v66Destroyed) return;
      b.__v712WindFrames = framesFor(k);
      b.__v712WindClock = Math.random() * 0.5;
      recovered.add(b);
      health.set(b, { texture: b._sprite.texture, changedAt: now });
      state.recoveredWindmills++;
    };

    let scanClock = 0;
    r.app.ticker.add(() => {
      const dt = Math.min(0.05, r.app.ticker.deltaMS / 1000);
      const now = performance.now();
      scanClock -= dt;
      if (scanClock <= 0) {
        scanClock = 0.30;
        for (const k of sim.kingdoms || []) {
          if (!k?.alive) continue;
          for (const b of k.buildings || []) {
            if (b?.type !== 'windmill' || !b._sprite || b._sprite.destroyed || b.__v66Destroyed) continue;
            if (b._sprite.visible === false || b._sprite.renderable === false) continue;
            let h = health.get(b);
            if (!h) {
              h = { texture: b._sprite.texture, changedAt: now };
              health.set(b, h);
            } else if (!recovered.has(b) && h.texture !== b._sprite.texture) {
              h.texture = b._sprite.texture;
              h.changedAt = now;
            }
            // Healthy V6.7 windmills keep their original animation. Only a mill
            // stuck on one frame for >1s is adopted by this recovery ticker.
            if (!recovered.has(b) && now - h.changedAt > 1050) recover(k, b, now);
          }
        }
      }

      for (const b of [...recovered]) {
        const s = b?._sprite;
        if (!s || s.destroyed || b.__v66Destroyed) {
          recovered.delete(b);
          continue;
        }
        if (s.visible === false || s.renderable === false) continue;
        const frames = b.__v712WindFrames;
        if (!frames?.length) continue;
        b.__v712WindClock += dt;
        const index = Math.floor(b.__v712WindClock / 0.18) % frames.length;
        if (s.texture !== frames[index]) s.texture = frames[index];
      }
    });

    state.windmillRecovery = true;
    return true;
  }

  async function buildIndependentPort(sim, k) {
    if (!k?.alive || hasPort(k) || k.__v712PortBusy) return false;
    if (sim.age < PORT_MIN_AGE || k.pop < 6 || k.territory.size < 10) return false;
    for (const [resource, cost] of Object.entries(PORT_COST)) if (Number(k.resources?.[resource] || 0) < cost) return false;

    k.__v712PortBusy = true;
    try {
      // The final V8 placement owner searches only territory already held by the
      // kingdom. Inland kingdoms wait until normal expansion reaches the coast.
      const cell = typeof sim.findBuildCell === 'function' ? sim.findBuildCell(k, 'port', false) : null;
      if (!cell) { state.portsWaitingForCoast++; return false; }

      const b = await sim.addBuilding(k, 'port', cell[0], cell[1], false, false);
      if (!b) return false;
      for (const [resource, cost] of Object.entries(PORT_COST)) k.resources[resource] -= cost;
      // The port is an independent milestone: do not consume the normal construction timer.
      sim.r?.puff?.(...sim.iso(cell[0], cell[1]));
      state.portsBuilt++;
      sim.updateSelected?.();
      return true;
    } catch (error) {
      state.errors.push(String(error?.stack || error?.message || error));
      return false;
    } finally {
      k.__v712PortBusy = false;
    }
  }

  function installPortRecovery(sim) {
    if (sim.__v712IndependentPortRecovery) return false;
    sim.__v712IndependentPortRecovery = true;
    // The V8 simulation clock calls this milestone check once every three ticks.
    // Ports no longer need their own permanent render-frame callback.
    sim.__v712MaybeBuildPort = k => buildIndependentPort(sim, k);
    state.portRecovery = true;
    return true;
  }

  async function install() {
    for (let i = 0; i < 2400; i++) {
      if (
        window.__SIM?.r && window.__V707_GAMEPLAY_POLISH?.installed &&
        window.__V67_PIXEL_BUILDINGS?.installed && window.__V68_FISHING_BOATS?.installed
      ) break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Simulation unavailable for engagement recovery');

    installInteractionPower(sim);
    await installWindmillRecovery(sim);
    installPortRecovery(sim);

    state.boatsPerPort = 2;
    state.normalDevelopmentUntouched = true;
    state.installed = true;
    document.documentElement.dataset.engagementRecovery = VERSION;
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v712-engagement-recovery]', error);
  });
})();
