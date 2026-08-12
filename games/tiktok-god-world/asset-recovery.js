(() => {
  'use strict';

  const P = window.PIXI;
  if (!P?.Assets?.load || P.Assets.__godWorldRecoveryInstalled) return;
  P.Assets.__godWorldRecoveryInstalled = true;

  const originalLoad = P.Assets.load.bind(P.Assets);
  const originalFetch = window.fetch.bind(window);
  P.Assets.setPreferences?.({ preferWorkers: false, preferCreateImageBitmap: false });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const blobUrls = [];

  const PRELOAD_ASSETS = [
    'assets/map/world.json', 'assets/map/world.png', 'assets/map/vegetation.json',
    'assets/buildings/manifest.json',
    'assets/buildings/barracks.png', 'assets/buildings/castle.png', 'assets/buildings/church.png', 'assets/buildings/farm.png',
    'assets/buildings/forge.png', 'assets/buildings/gate.png', 'assets/buildings/house_a.png', 'assets/buildings/house_b.png',
    'assets/buildings/house_c.png', 'assets/buildings/keep.png', 'assets/buildings/market.png', 'assets/buildings/silo.png',
    'assets/buildings/stable.png', 'assets/buildings/stone_tower.png', 'assets/buildings/wall.png', 'assets/buildings/wall_corner.png',
    'assets/buildings/warehouse.png', 'assets/buildings/watchtower.png', 'assets/buildings/windmill.png',
    'assets/npc/manifest.json',
    'assets/npc/carry_basket.png', 'assets/npc/carry_log.png', 'assets/npc/carry_sack.png', 'assets/npc/celebrate.png',
    'assets/npc/chop_wood.png', 'assets/npc/dig.png', 'assets/npc/eat.png', 'assets/npc/fish.png', 'assets/npc/harvest.png',
    'assets/npc/hurt.png', 'assets/npc/idle.png', 'assets/npc/milk_cow.png', 'assets/npc/pickaxe.png', 'assets/npc/plant_seed.png',
    'assets/npc/push_cart.png', 'assets/npc/run_down.png', 'assets/npc/run_left.png', 'assets/npc/run_right.png', 'assets/npc/run_up.png',
    'assets/npc/sleep.png', 'assets/npc/walk_down.png', 'assets/npc/walk_left.png', 'assets/npc/walk_right.png', 'assets/npc/walk_up.png',
    'assets/npc/water.png',
    'assets/units/archer_attack.png', 'assets/units/archer_death.png', 'assets/units/archer_hurt.png', 'assets/units/archer_idle.png',
    'assets/units/archer_walk.png', 'assets/units/knight_attack.png', 'assets/units/knight_death.png', 'assets/units/knight_hurt.png',
    'assets/units/knight_idle.png', 'assets/units/knight_walk.png',
    'assets/vegetation/pine.png', 'assets/vegetation/pine-snow.png', 'assets/vegetation/round.png',
    'assets/vfx/blood-sheet.svg', 'assets/vfx/destruction-sheet.svg', 'assets/vfx/fire-sheet.svg', 'assets/vfx/impact-sheet.svg',
    'assets/audio/medieval-market-full.mp3'
  ];

  const BOOT_MANIFESTS = new Set([
    'assets/map/world.json',
    'assets/buildings/manifest.json',
    'assets/npc/manifest.json'
  ]);

  function loadingStatus(text) {
    const span = document.querySelector('#loading span');
    if (span) span.textContent = text;
  }

  function normalizedPath(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url || '';
      const url = new URL(raw, location.href);
      const base = new URL('.', location.href).pathname;
      return url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname.replace(/^\/+/, '');
    } catch (_) {
      return String(input || '').replace(/^\.\//, '');
    }
  }

  async function fetchWithRetry(src) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await originalFetch(src, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await sleep(220 + attempt * 360);
      }
    }
    throw lastError;
  }

  async function fullyPreload(src) {
    const response = await fetchWithRetry(src);
    if (src.endsWith('/medieval-market-full.mp3')) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      blobUrls.push(url);
      window.__GW_PRELOADED_AUDIO_URL = url;
      const audio = document.querySelector('#bgMusic');
      if (audio) {
        audio.src = url;
        audio.preload = 'auto';
      }
      return;
    }
    await response.arrayBuffer();
    if (/\.(png|svg)$/i.test(src)) {
      try {
        await originalLoad(src);
      } catch (_) {
        await loadViaFreshFetch(src);
      }
    }
  }

  async function preloadEverything() {
    const total = PRELOAD_ASSETS.length;
    let done = 0;
    let cursor = 0;
    const workers = Array.from({ length: 6 }, async () => {
      while (cursor < total) {
        const index = cursor++;
        const src = PRELOAD_ASSETS[index];
        await fullyPreload(src);
        done++;
        const pct = Math.round((done / total) * 100);
        loadingStatus(`Loading game assets… ${pct}%`);
      }
    });
    await Promise.all(workers);
    loadingStatus('All assets ready — starting world…');
    window.__GW_PRELOAD_COMPLETE = true;
    return true;
  }

  // Start immediately. The boot manifest fetches are gated below, so the simulation
  // cannot start until every runtime image, VFX sheet and the full music track is ready.
  window.__GW_PRELOAD_READY = preloadEverything().catch(error => {
    window.__GW_PRELOAD_ERROR = error;
    loadingStatus(`Asset preload failed: ${error?.message || error}`);
    throw error;
  });

  window.fetch = async function godWorldPreloadGate(input, init) {
    const path = normalizedPath(input);
    if (BOOT_MANIFESTS.has(path)) await window.__GW_PRELOAD_READY;
    return originalFetch(input, init);
  };

  async function loadViaFreshFetch(src) {
    const join = src.includes('?') ? '&' : '?';
    const response = await originalFetch(`${src}${join}gw_asset_retry=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);
    return originalLoad(url);
  }

  function fallbackFor(src) {
    if (typeof src !== 'string') return null;
    if (src.includes('assets/buildings/')) {
      if (!src.endsWith('house_a.png')) return 'assets/buildings/house_a.png';
    }
    if (src.includes('assets/npc/')) {
      if (!src.endsWith('idle.png')) return 'assets/npc/idle.png';
    }
    if (src.includes('assets/units/')) {
      if (!src.endsWith('knight_idle.png')) return 'assets/units/knight_idle.png';
    }
    return null;
  }

  P.Assets.load = async function resilientAssetLoad(src, ...args) {
    try {
      return await originalLoad(src, ...args);
    } catch (firstError) {
      if (typeof src !== 'string') throw firstError;

      let lastError = firstError;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await sleep(180 + attempt * 260);
          return await loadViaFreshFetch(src);
        } catch (error) {
          lastError = error;
        }
      }

      // Optional art must never prevent the simulation from starting. A missing
      // building/NPC/unit temporarily falls back to a compatible sprite sheet.
      const fallback = fallbackFor(src);
      if (fallback) {
        try {
          return await originalLoad(fallback);
        } catch (_) {
          try { return await loadViaFreshFetch(fallback); } catch (_) {}
        }
      }
      throw lastError;
    }
  };

  window.addEventListener('pagehide', () => {
    for (const url of blobUrls) URL.revokeObjectURL(url);
    blobUrls.length = 0;
  }, { once: true });
})();
