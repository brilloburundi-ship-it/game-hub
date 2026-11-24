(() => {
  'use strict';

  const P = window.PIXI;
  if (!P?.Assets?.load || P.Assets.__godWorldRecoveryInstalled) return;
  P.Assets.__godWorldRecoveryInstalled = true;

  const originalLoad = P.Assets.load.bind(P.Assets);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const blobUrls = [];

  async function loadViaFreshFetch(src) {
    const url = new URL(src, document.baseURI);
    url.searchParams.set('gw_asset_retry', String(Date.now()));
    if (/\.(png|jpg|jpeg|webp|gif)$/i.test(url.pathname)) {
      // Safari can reject worker/fetch or blob-URL decoding. Use the native
      // image decoder and preserve the actual sheet dimensions.
      return new Promise((resolve, reject) => {
        const image = new Image();
        const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('Image timeout: ' + src)); }, 12000);
        image.onload = () => {
          clearTimeout(timer);
          try {
            const texture = P.Texture.from(image);
            texture.source.scaleMode = 'nearest';
            resolve(texture);
          } catch (error) { reject(error); }
        };
        image.onerror = () => { clearTimeout(timer); reject(new Error('Image load failed: ' + src)); };
        image.src = url.href;
      });
    }
    return originalLoad(url.href);
  }

  function fallbackFor(src) {
    if (typeof src !== 'string') return null;
    if (src.includes('assets/buildings/')) {
      if (!src.endsWith('house_a.png')) return 'assets/buildings/house_a.png';
    }
    if (src.includes('assets/minifolks/villagers/')) {
      if (!src.endsWith('MiniPeasant.png')) return 'assets/minifolks/villagers/MiniPeasant.png';
    }
    if (src.includes('assets/minifolks/humans/')) {
      if (!src.endsWith('MiniSwordMan.png')) return 'assets/minifolks/humans/MiniSwordMan.png';
    }
    if (src.includes('assets/minifolks/animals/')) {
      if (!src.endsWith('MiniBunny.png')) return 'assets/minifolks/animals/MiniBunny.png';
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
      throw new Error(src + ': ' + (lastError?.message || String(lastError)));
    }
  };

  window.addEventListener('pagehide', () => {
    for (const url of blobUrls) URL.revokeObjectURL(url);
    blobUrls.length = 0;
  }, { once: true });
})();
