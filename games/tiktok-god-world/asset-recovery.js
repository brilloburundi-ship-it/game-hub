(() => {
  'use strict';

  const P = window.PIXI;
  if (!P?.Assets?.load || P.Assets.__godWorldRecoveryInstalled) return;
  P.Assets.__godWorldRecoveryInstalled = true;

  const originalLoad = P.Assets.load.bind(P.Assets);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const blobUrls = [];

  async function loadViaFreshFetch(src) {
    const join = src.includes('?') ? '&' : '?';
    const response = await fetch(`${src}${join}gw_asset_retry=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);
    return originalLoad(url);
  }

  function fallbackFor(src) {
    if (typeof src !== 'string') return null;
    if (src.includes('/assets/buildings/') || src.startsWith('assets/buildings/')) {
      if (!src.endsWith('/house_a.png') && !src.endsWith('assets/buildings/house_a.png')) return 'assets/buildings/house_a.png';
    }
    return null;
  }

  P.Assets.load = async function resilientAssetLoad(src, ...args) {
    try {
      return await originalLoad(src, ...args);
    } catch (firstError) {
      if (typeof src !== 'string') throw firstError;

      let lastError = firstError;
      // GitHub Pages can briefly serve an asset inconsistently just after a deploy,
      // especially when an installed iOS PWA wakes with an older service worker.
      // Retry the exact file with a fresh network request before failing startup.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await sleep(180 + attempt * 260);
          return await loadViaFreshFetch(src);
        } catch (error) {
          lastError = error;
        }
      }

      // Buildings are visual-only. Never kill the whole simulation because one
      // optional building image was unavailable: use the compact house art until
      // the next reload instead.
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
