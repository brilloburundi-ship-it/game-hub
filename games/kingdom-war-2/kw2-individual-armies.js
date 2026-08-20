(() => {
  'use strict';

  // Final lightweight peace layer for Kingdom War 2.
  // It intentionally leaves economy, territory growth, buildings and construction
  // untouched. Only war/military systems and the number of visible civilian NPCs
  // are affected.
  const VERSION = '20260820-peace-lite-1';
  const BASE_VISIBLE_CIVILIANS = 12;
  const MAX_VISIBLE_CIVILIANS = 18;
  const ENFORCE_MS = 250;
  const CITIZEN_SYNC_MS = 1000;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  if (window.__KW2_PEACE_MODE?.installed) return;

  const peaceAttack = function(attacker) {
    if (attacker) attacker.aggressive = null;
    return false;
  };
  const peaceStartWar = function() { return false; };
  const peaceWarAI = function() { return false; };
  const peaceRendererNoop = function() { return false; };
  const peaceWarCamera = function() { return null; };

  function visibleCitizenLimit(kingdom) {
    // Preserve the existing logical population and gift population. Only halve
    // how many civilian sprites are allowed on screen: 24 -> 12, 36 -> 18.
    const requested = Math.max(24, Number(kingdom?.__v712VisibleCitizenCap) || 0);
    return clamp(Math.ceil(requested * 0.5), BASE_VISIBLE_CIVILIANS, MAX_VISIBLE_CIVILIANS);
  }

  function lockMilitary(kingdom) {
    if (!kingdom || kingdom.__kw2PeaceMilitaryLocked) return;
    try {
      Object.defineProperty(kingdom, 'military', {
        configurable: true,
        enumerable: true,
        get() { return 0; },
        set() {}
      });
      kingdom.__kw2PeaceMilitaryLocked = true;
    } catch (_) {
      kingdom.military = 0;
    }
  }

  function showCivilian(farmer) {
    if (!farmer) return;
    farmer.__kw2WarHidden = false;
    const sprite = farmer._sprite;
    if (!sprite || sprite.destroyed) return;
    sprite.visible = true;
    sprite.renderable = true;
    sprite.play?.();
  }

  function hideSoldierSprite(sprite) {
    if (!sprite || sprite.destroyed) return;
    sprite.visible = false;
    sprite.renderable = false;
    sprite.stop?.();
  }

  function hideArmyMap(map) {
    if (!(map instanceof Map)) return;
    for (const list of map.values()) {
      if (!Array.isArray(list)) continue;
      for (const unit of list) hideSoldierSprite(unit?.s || unit);
    }
  }

  function clearWarState(sim) {
    const renderer = sim?.r;
    if (!sim) return;

    for (const war of sim.wars || []) {
      if (!war) continue;
      war.done = true;
      try { renderer?.endWar?.(war); } catch (_) {}
    }
    if (Array.isArray(sim.wars)) sim.wars.length = 0;

    sim.__kw2Mobilization = null;
    sim.__kw2Demobilization = null;
    sim.__kw2CivilianExit = null;

    for (const kingdom of sim.kingdoms || []) {
      if (!kingdom) continue;
      kingdom.aggressive = null;
      lockMilitary(kingdom);
      for (const farmer of kingdom.farmers || []) showCivilian(farmer);
    }

    hideArmyMap(renderer?.__v66Guards);
    hideArmyMap(renderer?.__kw2MobilizedReserves);
    hideArmyMap(renderer?.__kw2GiftWarReserves);
    hideArmyMap(renderer?.__kw2FieldReserves);

    document.documentElement.dataset.activeWars = '0';
    document.documentElement.dataset.kw2WarFlow = 'peace';
    document.documentElement.dataset.kw2Military = 'disabled';
    document.documentElement.dataset.kw2PeaceMode = VERSION;
  }

  function installOverrides(sim) {
    if (!sim?.r) return false;

    // Re-assert these assignments because older war patches install asynchronously
    // and may try to wrap the same methods after this file has loaded.
    if (sim.attack !== peaceAttack) sim.attack = peaceAttack;
    if (sim.startWar !== peaceStartWar) sim.startWar = peaceStartWar;
    if (sim.warAI !== peaceWarAI) sim.warAI = peaceWarAI;

    sim.resolveWars = function() {
      clearWarState(this);
      return false;
    };

    sim.visibleCitizenLimit = visibleCitizenLimit;

    const renderer = sim.r;
    renderer.startWar = peaceRendererNoop;
    renderer.updateWars = peaceRendererNoop;
    renderer.notifyCameraWar = peaceRendererNoop;
    renderer.warCameraTarget = peaceWarCamera;
    renderer.casualty = peaceRendererNoop;
    renderer.battleFx = peaceRendererNoop;
    renderer.frontImpact = peaceRendererNoop;

    return true;
  }

  function hideAttackTestButton() {
    const button = document.querySelector('[data-test="attack"]');
    if (button) button.style.display = 'none';
  }

  let lastCitizenSync = 0;
  function enforce(sim) {
    if (!sim?.r) return;
    installOverrides(sim);
    clearWarState(sim);
    hideAttackTestButton();

    const now = performance.now();
    if (now - lastCitizenSync < CITIZEN_SYNC_MS) return;
    lastCitizenSync = now;
    for (const kingdom of sim.kingdoms || []) {
      if (!kingdom?.alive || typeof sim.syncCitizens !== 'function') continue;
      Promise.resolve(sim.syncCitizens(kingdom)).catch(error => console.warn('[KW2 peace citizen sync]', error));
    }
  }

  async function install() {
    for (let i = 0; i < 2400; i++) {
      if (window.__SIM?.r) break;
      await sleep(25);
    }

    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Kingdom War 2 runtime unavailable for peace mode');

    enforce(sim);
    const timer = setInterval(() => enforce(window.__SIM), ENFORCE_MS);

    window.__KW2_PEACE_MODE = Object.freeze({
      installed: true,
      version: VERSION,
      war: false,
      military: false,
      visibleCivilianBase: BASE_VISIBLE_CIVILIANS,
      visibleCivilianMax: MAX_VISIBLE_CIVILIANS,
      timer
    });

    // Keep the legacy module marker present so no external compatibility check waits
    // for the old individual-army script. The feature itself is intentionally off.
    window.__KW2_INDIVIDUAL_ARMIES = Object.freeze({
      installed: true,
      version: VERSION,
      disabledByPeaceMode: true
    });

    console.info('[Kingdom War 2] Peace mode active:', VERSION);
  }

  install().catch(error => {
    window.__KW2_PEACE_MODE_ERROR = String(error?.stack || error?.message || error);
    console.error('[Kingdom War 2 peace mode]', error);
  });
})();
