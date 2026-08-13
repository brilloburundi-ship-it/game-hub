(() => {
  'use strict';
  const VERSION = 'v709-unified-water-palette-1';
  if (window.__V709_WATER_PALETTE?.installed) return;

  const state = window.__V709_WATER_PALETTE = { installed: false, version: VERSION, terrain: false, backdrop: false, errors: [] };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function recolorTerrain(sim) {
    const r = sim.r;
    const source = r?.__v706TerrainCanvas;
    if (!source || !window.PIXI?.Texture) return false;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      const rr = d[i], gg = d[i + 1], bb = d[i + 2];
      const oldOcean = (bb > rr + 20 && bb > gg + 2 && rr < 40 && gg < 90);
      if (!oldOcean) continue;
      const lum = (rr + gg + bb) / 3;
      if (lum < 45) { d[i] = 36; d[i + 1] = 101; d[i + 2] = 132; }
      else if (lum < 60) { d[i] = 47; d[i + 1] = 120; d[i + 2] = 152; }
      else { d[i] = 78; d[i + 1] = 159; d[i + 2] = 186; }
    }
    ctx.putImageData(image, 0, 0);
    const sprite = r.root?.children?.[0];
    if (!sprite) return false;
    const texture = window.PIXI.Texture.from(canvas);
    if (texture?.source) texture.source.scaleMode = 'nearest';
    sprite.texture = texture;
    r.__v709UnifiedWaterCanvas = canvas;
    return true;
  }

  function recolorBackdrop(sim) {
    const r = sim.r, P = window.PIXI;
    const ocean = r?.__v708OceanBackdropContainer;
    if (!ocean || !P?.Graphics) return false;
    const base = ocean.children?.[0], waves = ocean.children?.[1];
    if (!base || !waves) return false;
    const redraw = () => {
      const pad = 96;
      const w = Math.max(1, innerWidth + pad * 2);
      const h = Math.max(1, innerHeight + pad * 2);
      base.clear();
      base.rect(-pad, -pad, w, h).fill({ color: 0x2f7898, alpha: 1 });
      waves.clear();
      for (let y = -40; y < innerHeight + 80; y += 34) {
        const row = Math.floor((y + 40) / 34);
        const shift = (row % 2) * 21;
        for (let x = -80 + shift; x < innerWidth + 100; x += 70) {
          const len = 18 + ((x + row * 13) % 3 + 3) % 3 * 5;
          waves.rect(x, y, len, 2).fill({ color: row % 3 === 0 ? 0x4e9fba : 0x3e8eaa, alpha: 0.24 });
          if ((row + Math.floor(x / 70)) % 4 === 0) waves.rect(x + 8, y + 7, Math.max(8, len - 9), 1).fill({ color: 0x8bc5d2, alpha: 0.16 });
        }
      }
    };
    redraw();
    window.addEventListener('resize', redraw, { passive: true });
    return true;
  }

  async function install() {
    for (let i = 0; i < 1200; i++) {
      if (window.__SIM?.r && window.__V708_WATER_CAMERA_FISHING?.installed) break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Simulation unavailable for unified water palette');
    state.terrain = recolorTerrain(sim);
    state.backdrop = recolorBackdrop(sim);
    state.installed = true;
    document.documentElement.dataset.waterPalette = VERSION;
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v709-water-palette]', error);
  });

  window.__V709_WATER_PALETTE = state;
})();
