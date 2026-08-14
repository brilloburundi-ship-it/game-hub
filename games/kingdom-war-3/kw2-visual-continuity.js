(() => {
  'use strict';

  const VERSION = '20260814-kw3-kw2-visual-1';
  if (window.__KW3_KW2_VISUAL?.installed) return;

  const canvas = document.querySelector('#game');
  const ctx = canvas?.getContext?.('2d');
  if (!canvas || !ctx) return;

  const CELL_W = 72;
  const CELL_H = 80;
  const COLS = 8;
  const BASE = '../kingdom-war-2/assets/vegetation/';
  const PARTS = [
    `${BASE}flora-atlas.part0`,
    `${BASE}flora-atlas.part1`,
    `${BASE}flora-atlas.part2`,
    `${BASE}flora-atlas.part3`
  ];

  // Same first six tree frames used by Kingdom War 2's flora atlas.
  const TREE_FRAMES = [
    { name: 'tree_oak_dark', index: 0 },
    { name: 'tree_oak_light', index: 1 },
    { name: 'tree_autumn', index: 2 },
    { name: 'tree_apple', index: 3 },
    { name: 'tree_pine', index: 4 },
    { name: 'tree_birch', index: 5 }
  ];

  const fakeTreeHex = new Set(['#3a291d', '#183e27', '#28563a', '#244a2c', '#35643a']);
  const fakeTreeRgb = new Set([
    'rgb(58, 41, 29)', 'rgb(24, 62, 39)', 'rgb(40, 86, 58)', 'rgb(36, 74, 44)', 'rgb(53, 100, 58)'
  ]);
  const kw3OnlyBackdrop = new Set(['#17475b', '#255d6d']);
  const kw3OnlyBackdropRgb = new Set(['rgb(23, 71, 91)', 'rgb(37, 93, 109)']);

  const originalFillRect = ctx.fillRect.bind(ctx);
  const originalFill = ctx.fill.bind(ctx);
  const originalDrawImage = ctx.drawImage.bind(ctx);
  let atlas = null;
  let treeCall = 0;
  let atlasReady = false;

  const isTreeStyle = () => fakeTreeHex.has(String(ctx.fillStyle).toLowerCase()) || fakeTreeRgb.has(String(ctx.fillStyle).toLowerCase());
  const isKw3BackdropStyle = () => kw3OnlyBackdrop.has(String(ctx.fillStyle).toLowerCase()) || kw3OnlyBackdropRgb.has(String(ctx.fillStyle).toLowerCase());

  function drawAtlasTree() {
    if (!atlasReady || !atlas) return false;
    const slot = treeCall++ % 64;
    // Stable visual variety: dark/light oak and pine dominate, with occasional birch/autumn/apple.
    const pattern = [0, 4, 1, 4, 0, 5, 4, 1, 2, 4, 0, 3];
    const frame = TREE_FRAMES[pattern[slot % pattern.length]];
    const sx = (frame.index % COLS) * CELL_W;
    const sy = Math.floor(frame.index / COLS) * CELL_H;
    const scaleJitter = 0.88 + ((slot * 37) % 17) / 100;
    const dw = 52 * scaleJitter;
    const dh = 58 * scaleJitter;
    originalDrawImage(atlas, sx, sy, CELL_W, CELL_H, -dw / 2, -dh + 7, dw, dh);
    return true;
  }

  // Kingdom 3 originally drew placeholder polygon/rectangle trees. Replace those exact
  // draw calls in-place so depth/order remains correct relative to buildings and NPCs.
  ctx.fillRect = function(x, y, w, h) {
    if (atlasReady && isTreeStyle()) {
      if (x === -3 && y === -3 && w === 6 && h === 22) drawAtlasTree();
      return;
    }
    // Remove the artificial flat blue side strips used by the first KW3 prototype;
    // the actual Kingdom War 2 world art already contains its own coast/water treatment.
    if (isKw3BackdropStyle() && (w >= 18 || h >= 20)) return;
    return originalFillRect(x, y, w, h);
  };

  ctx.fill = function(...args) {
    if (atlasReady && isTreeStyle()) return;
    return originalFill(...args);
  };

  // Preserve the Kingdom War 2 map pixels instead of stretching an arbitrary crop.
  ctx.drawImage = function(image, ...args) {
    const src = String(image?.currentSrc || image?.src || '');
    if (src.includes('/kingdom-war-2/assets/map/world.png') && args.length === 8) {
      const iw = Number(image.naturalWidth || image.width || 1);
      const ih = Number(image.naturalHeight || image.height || 1);
      const destAspect = canvas.width / canvas.height;
      // Smaller arena = a tighter native-aspect crop of the same KW2 world art.
      let sh = ih * 0.60;
      let sw = sh * destAspect;
      if (sw > iw * 0.72) { sw = iw * 0.72; sh = sw / destAspect; }
      const sx = (iw - sw) * 0.5;
      const sy = (ih - sh) * 0.50;
      return originalDrawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    }
    return originalDrawImage(image, ...args);
  };

  async function loadAtlas() {
    const buffers = await Promise.all(PARTS.map(async url => {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`KW2 flora atlas part unavailable (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    }));
    const bytes = new Uint8Array(buffers.reduce((sum, part) => sum + part.byteLength, 0));
    let offset = 0;
    for (const part of buffers) { bytes.set(part, offset); offset += part.byteLength; }
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = blobUrl;
      await img.decode();
      atlas = img;
      atlasReady = true;
      document.documentElement.dataset.kw3TreeAssets = 'kw2-flora-atlas';
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    }
  }

  window.__KW3_KW2_VISUAL = Object.freeze({
    installed: true,
    version: VERSION,
    sameWorldArtAsKingdomWar2: true,
    nativeAspectArenaCrop: true,
    placeholderTreesRemoved: true,
    kingdomWar2TreeAtlas: true,
    treeVariants: TREE_FRAMES.map(v => v.name),
    atlasParts: PARTS.slice()
  });
  document.documentElement.dataset.kw3Visual = VERSION;

  loadAtlas().catch(error => {
    document.documentElement.dataset.kw3TreeAssets = 'fallback';
    window.__KW3_KW2_VISUAL_ERROR = String(error?.stack || error?.message || error);
    console.error('[Kingdom War 3 / Kingdom War 2 visual continuity]', error);
  });
})();
