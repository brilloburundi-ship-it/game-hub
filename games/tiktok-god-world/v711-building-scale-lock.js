(() => {
  'use strict';

  const VERSION = 'v711-building-scale-lock-1';
  if (window.__V711_BUILDING_SCALE_LOCK?.bootstrap) return;

  const state = window.__V711_BUILDING_SCALE_LOCK = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    normalizedExisting: 0,
    normalizedAdds: 0,
    normalizedRecolors: 0,
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
    const targetHeight = Number(window.BUILD_HEIGHT?.[type]) || null;
    if (targetHeight) return (targetHeight / h) * multiplier;

    // Fallback to the renderer's original scale formula, but feed it the
    // canonical base texture so recolored/cropped variants cannot change size.
    const original = renderer.__v711OriginalBuildingScale;
    if (typeof original === 'function') return original(type, tex, multiplier);
    return null;
  }

  function normalizeBuilding(renderer, building) {
    if (!renderer || !building?._sprite || building._sprite.destroyed) return false;
    const base = canonicalTexture(renderer, building.type, building._sprite.texture);
    const scale = canonicalScale(renderer, building.type, base, 1);
    if (!Number.isFinite(scale) || scale <= 0) return false;
    building._sprite.scale.set(scale);
    building.__v711CanonicalScale = scale;
    return true;
  }

  function normalizeAll(sim) {
    let count = 0;
    for (const kingdom of sim?.kingdoms || []) {
      for (const building of kingdom?.buildings || []) {
        if (normalizeBuilding(sim.r, building)) count++;
      }
    }
    state.normalizedExisting += count;
    return count;
  }

  function installScaleLock(sim) {
    const renderer = sim?.r;
    if (!renderer || renderer.__v711ScaleLock) return false;
    renderer.__v711ScaleLock = true;

    if (typeof renderer.buildingScale === 'function') {
      const originalScale = renderer.buildingScale.bind(renderer);
      renderer.__v711OriginalBuildingScale = originalScale;
      renderer.buildingScale = function(type, tex, multiplier = 1) {
        const base = canonicalTexture(this, type, tex);
        return originalScale(type, base, multiplier);
      };
    }

    if (typeof renderer.addBuilding === 'function') {
      const originalAdd = renderer.addBuilding.bind(renderer);
      renderer.addBuilding = async function(kingdom, building, ...rest) {
        const out = await originalAdd(kingdom, building, ...rest);
        // Some construction layers animate scale during placement. Normalize on
        // the next frames too, so the final sprite always lands on canonical size.
        const enforce = () => {
          if (normalizeBuilding(this, building)) state.normalizedAdds++;
        };
        requestAnimationFrame(enforce);
        setTimeout(enforce, 1600);
        setTimeout(enforce, 2400);
        return out;
      };
    }

    if (typeof renderer.recolorBuilding === 'function') {
      const originalRecolor = renderer.recolorBuilding.bind(renderer);
      renderer.recolorBuilding = function(building, kingdom, ...rest) {
        const out = originalRecolor(building, kingdom, ...rest);
        const enforce = () => {
          if (normalizeBuilding(this, building)) state.normalizedRecolors++;
        };
        requestAnimationFrame(enforce);
        setTimeout(enforce, 100);
        return out;
      };
    }

    // v67 pixel-building layer can replace textures after the core renderer has
    // already calculated its size. A light watchdog only corrects buildings that
    // drift from their canonical scale; it does not touch positions or gameplay.
    let lastSweep = 0;
    const sweep = now => {
      if (!window.__SIM || window.__SIM !== sim) return;
      if (now - lastSweep >= 1200) {
        lastSweep = now;
        normalizeAll(sim);
      }
      requestAnimationFrame(sweep);
    };
    requestAnimationFrame(sweep);

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

  window.__V711_BUILDING_SCALE_LOCK = state;
})();
