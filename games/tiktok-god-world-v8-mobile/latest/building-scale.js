(() => {
  'use strict';

  const VERSION = 'v711-building-scale-lock-4-smaller-forge';
  if (window.__V711_BUILDING_SCALE_LOCK?.bootstrap) return;
  const STABLE_LOCKED_WORLD_HEIGHT = 17.5;
  const FORGE_LOCKED_WORLD_HEIGHT = 24;
  const MARKET_LOCKED_WORLD_HEIGHT = 24;

  const state = window.__V711_BUILDING_SCALE_LOCK = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    stableWorldHeight: STABLE_LOCKED_WORLD_HEIGHT,
    forgeWorldHeight: FORGE_LOCKED_WORLD_HEIGHT,
    marketWorldHeight: MARKET_LOCKED_WORLD_HEIGHT,
    normalizedExisting: 0,
    normalizedAdds: 0,
    normalizedRecolors: 0,
    stableLocks: 0,
    forgeLocks: 0,
    marketLocks: 0,
    errors: []
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function canonicalTexture(renderer, type, fallback) {
    return renderer?.buildTex?.[type] || fallback || null;
  }

  function canonicalScale(renderer, type, fallbackTexture, multiplier = 1) {
    const tex = canonicalTexture(renderer, type, fallbackTexture);
    if (!tex) return null;
    const h = Math.max(1, Number(tex.height) || Number(fallbackTexture?.height) || 1);
    if (type === 'stable') return (STABLE_LOCKED_WORLD_HEIGHT / h) * multiplier;
    if (type === 'forge') return (FORGE_LOCKED_WORLD_HEIGHT / h) * multiplier;
    if (type === 'market') return (MARKET_LOCKED_WORLD_HEIGHT / h) * multiplier;
    const original = renderer.__v711OriginalBuildingScale;
    if (typeof original === 'function') return original(type, tex, multiplier);
    return null;
  }

  function normalizeBuilding(renderer, building) {
    const sprite = building?._sprite;
    if (!renderer || !sprite || sprite.destroyed) return false;
    if (sprite.visible === false || sprite.renderable === false) return false;
    const scale = canonicalScale(renderer, building.type, sprite.texture, 1);
    if (!Number.isFinite(scale) || scale <= 0) return false;
    const signX = sprite.scale.x < 0 ? -1 : 1;
    const signY = sprite.scale.y < 0 ? -1 : 1;
    const drift = Math.max(Math.abs(Math.abs(sprite.scale.x) - scale), Math.abs(Math.abs(sprite.scale.y) - scale));
    if (drift < 0.0005) return false;
    sprite.scale.set(scale * signX, scale * signY);
    building.__v711CanonicalScale = scale;
    if (building.type === 'stable') { sprite.__stableSmallScaleLocked = true; state.stableLocks++; }
    if (building.type === 'forge') { sprite.__forgeSmallScaleLocked = true; state.forgeLocks++; }
    if (building.type === 'market') { sprite.__marketSmallScaleLocked = true; state.marketLocks++; }
    return true;
  }

  function normalizeAll(sim) {
    let count = 0;
    for (const kingdom of sim?.kingdoms || []) {
      for (const building of kingdom?.buildings || []) if (normalizeBuilding(sim.r, building)) count++;
    }
    state.normalizedExisting += count;
    return count;
  }

  function installScaleLock(sim) {
    const renderer = sim?.r;
    if (!renderer || renderer.__v711ScaleLock || typeof renderer.buildingScale !== 'function') return false;
    renderer.__v711ScaleLock = true;
    const originalScale = renderer.buildingScale.bind(renderer);
    renderer.__v711OriginalBuildingScale = originalScale;
    renderer.buildingScale = function(type, tex, multiplier = 1) {
      const scale = canonicalScale(this, type, tex, multiplier);
      return Number.isFinite(scale) && scale > 0 ? scale : originalScale(type, tex, multiplier);
    };

    if (typeof renderer.addBuilding === 'function') {
      const originalAdd = renderer.addBuilding.bind(renderer);
      renderer.addBuilding = async function(kingdom, building, ...rest) {
        const out = await originalAdd(kingdom, building, ...rest);
        if (normalizeBuilding(this, building)) state.normalizedAdds++;
        return out;
      };
    }

    if (typeof renderer.recolorBuilding === 'function') {
      const originalRecolor = renderer.recolorBuilding.bind(renderer);
      renderer.recolorBuilding = function(building, kingdom, ...rest) {
        const out = originalRecolor(building, kingdom, ...rest);
        const enforce = () => { if (normalizeBuilding(this, building)) state.normalizedRecolors++; };
        if (out && typeof out.then === 'function') out.finally(enforce);
        else enforce();
        return out;
      };
    }

    normalizeAll(sim);
    state.installed = true;
    document.documentElement.dataset.buildingScaleLock = VERSION;
    return true;
  }

  async function install() {
    for (let i = 0; i < 1600; i++) {
      if (window.__SIM?.r?.buildingScale && window.__V710_FARMER_DIRECTION?.installed) break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Renderer unavailable for building scale lock');
    if (!installScaleLock(sim)) throw new Error('Building scale lock could not be installed');
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v711-building-scale-lock]', error);
  });
})();
