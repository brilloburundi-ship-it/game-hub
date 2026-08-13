(() => {
  'use strict';

  const VERSION = 'v706-sparse-user-pixel-flora-1';
  const ATLAS_PARTS = [
    'assets/vegetation/flora-atlas.part0',
    'assets/vegetation/flora-atlas.part1',
    'assets/vegetation/flora-atlas.part2',
    'assets/vegetation/flora-atlas.part3'
  ];
  const CELL_W = 72;
  const CELL_H = 80;
  const COLS = 8;

  // Exact order used to build the lightweight atlas from the user-provided pixel-art sheet.
  // The snow-covered pine is intentionally not present.
  const VARIANTS = [
    ['tree_oak_dark','tree'], ['tree_oak_light','tree'], ['tree_autumn','tree'], ['tree_apple','tree'], ['tree_pine','tree'], ['tree_birch','tree'], ['stump','tree'], ['sapling','tree'],
    ['bush_berry','bush'], ['bush_green','bush'], ['bush_daisy','bush'], ['bush_clover','bush'], ['bush_logberry','bush'],
    ['plant_grass_tall','plant'], ['plant_grass_small','plant'], ['plant_reeds_yellow','plant'], ['plant_reeds_brown','plant'], ['plant_broadleaf','plant'], ['plant_fern','plant'], ['plant_groundcover','plant'], ['plant_palmleaf','plant'],
    ['flower_daisy','flower'], ['flower_yellow','flower'], ['flower_poppy','flower'], ['flower_blue','flower'], ['flower_purple','flower'], ['flower_white','flower'], ['flower_pink','flower'], ['flower_orange','flower'],
    ['rock_small','rock'], ['rock_block','rock'], ['rock_boulder','rock'], ['rock_tall','rock'], ['rock_moss','rock'], ['rock_stack','rock'], ['rock_spire','rock']
  ];

  if (window.__TREE_DEPTH_V706?.installed) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const cellKey = (x, y) => `${x},${y}`;

  function hash01(x, y, salt = 0) {
    let h = Math.imul((x + 37 + salt) | 0, 374761393) ^ Math.imul((y + 91 - salt) | 0, 668265263);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  const waitForRenderer = async () => {
    for (let i = 0; i < 3600; i++) {
      const renderer = window.__SIM?.r;
      if (renderer?.entities && window.PIXI) return renderer;
      await sleep(25);
    }
    throw new Error('Pixi renderer unavailable for sparse pixel vegetation');
  };

  const installTextureCompatibility = renderer => {
    if (!renderer.textureToCanvas || renderer.__textureCompatibilityInstalled) return;
    const isDrawable = value => {
      if (!value) return false;
      const constructors = [
        window.HTMLImageElement, window.SVGImageElement, window.HTMLVideoElement,
        window.HTMLCanvasElement, window.ImageBitmap, window.OffscreenCanvas, window.VideoFrame
      ].filter(Boolean);
      return constructors.some(Type => value instanceof Type);
    };
    const unwrapDrawable = value => {
      const queue = [value];
      const seen = new Set();
      for (let depth = 0; queue.length && depth < 24; depth++) {
        const current = queue.shift();
        if (!current || seen.has(current)) continue;
        if (isDrawable(current)) return current;
        if (typeof current !== 'object') continue;
        seen.add(current);
        for (const prop of ['source', 'resource', 'image', 'bitmap', 'canvas']) {
          try { if (current[prop]) queue.push(current[prop]); } catch (_) {}
        }
      }
      return null;
    };
    renderer.textureToCanvas = tex => {
      const source = unwrapDrawable(tex);
      if (!source) return null;
      const frame = tex?.frame;
      const width = Math.max(1, Math.round(frame?.width || tex?.width || source.width || source.videoWidth || 1));
      const height = Math.max(1, Math.round(frame?.height || tex?.height || source.height || source.videoHeight || 1));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingEnabled = false;
      try {
        if (frame) context.drawImage(source, frame.x, frame.y, frame.width, frame.height, 0, 0, width, height);
        else context.drawImage(source, 0, 0, width, height);
        return canvas;
      } catch (_) {
        return null;
      }
    };
    renderer.__textureCompatibilityInstalled = true;
  };

  async function loadAtlas() {
    const buffers = await Promise.all(ATLAS_PARTS.map(async url => {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Flora atlas part unavailable (${response.status}): ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    }));
    const size = buffers.reduce((sum, part) => sum + part.byteLength, 0);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of buffers) { bytes.set(part, offset); offset += part.byteLength; }
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = blobUrl;
      await image.decode();
      const texture = window.PIXI.Texture.from(image);
      if (texture?.source) texture.source.scaleMode = 'nearest';
      return texture;
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    }
  }

  function createTextures(base) {
    const textures = new Map();
    for (let i = 0; i < VARIANTS.length; i++) {
      const [name] = VARIANTS[i];
      const x = (i % COLS) * CELL_W;
      const y = Math.floor(i / COLS) * CELL_H;
      const texture = new window.PIXI.Texture({
        source: base.source,
        frame: new window.PIXI.Rectangle(x, y, CELL_W, CELL_H)
      });
      textures.set(name, texture);
    }
    return textures;
  }

  function propCategory(sim, x, y) {
    const biome = sim.biome(x, y);
    const r = hash01(x, y, 13);

    if (biome === 'forest') {
      if (r < 0.17) return 'tree';
      if (r < 0.22) return 'bush';
      if (r < 0.25) return 'plant';
      if (r < 0.265) return 'flower';
      if (r < 0.278) return 'rock';
      return null;
    }
    if (biome === 'grass') {
      if (r < 0.015) return 'tree';
      if (r < 0.035) return 'bush';
      if (r < 0.060) return 'plant';
      if (r < 0.085) return 'flower';
      if (r < 0.095) return 'rock';
      return null;
    }
    if (biome === 'tundra') {
      if (r < 0.040) return 'tree';
      if (r < 0.060) return 'bush';
      if (r < 0.080) return 'plant';
      if (r < 0.110) return 'rock';
      return null;
    }
    if (biome === 'desert') {
      if (r < 0.020) return 'plant';
      if (r < 0.060) return 'rock';
      return null;
    }
    if (biome === 'mountain') {
      if (r < 0.085) return 'rock';
      if (r < 0.095) return 'plant';
      return null;
    }
    if (biome === 'beach') {
      if (r < 0.018) return 'plant';
      if (r < 0.030) return 'rock';
    }
    return null;
  }

  function spriteScale(name, category, x, y) {
    let base = category === 'tree' ? 0.69 : category === 'rock' ? 0.63 : category === 'bush' ? 0.61 : 0.57;
    if (name === 'stump') base = 0.63;
    if (name === 'sapling') base = 0.56;
    if (name === 'rock_tall' || name === 'rock_spire') base = 0.60;
    return base * (0.91 + hash01(x, y, 83) * 0.18);
  }

  async function install() {
    const renderer = await waitForRenderer();
    installTextureCompatibility(renderer);
    if (!renderer.entities?.addChild || renderer.__depthTreesInstalled) return;

    const sim = window.__SIM;
    const atlas = await loadAtlas();
    const textures = createTextures(atlas);
    const pools = {};
    for (const [name, category] of VARIANTS) (pools[category] ||= []).push(name);
    const cursors = { tree: 0, bush: 0, plant: 0, flower: 0, rock: 0 };

    const byCell = new Map();
    let count = 0;
    const used = new Set();

    for (let y = 1; y < sim.w.gridH - 1; y++) for (let x = 1; x < sim.w.gridW - 1; x++) {
      if (!sim.land(x, y) || sim.isRiver?.(x, y)) continue;
      const category = propCategory(sim, x, y);
      if (!category) continue;
      const pool = pools[category];
      const variant = pool[cursors[category]++ % pool.length];
      const texture = textures.get(variant);
      if (!texture) continue;

      const sprite = new window.PIXI.Sprite(texture);
      const [sx, sy] = sim.iso(x, y);
      const jx = Math.round((hash01(x, y, 31) - 0.5) * 14);
      const jy = Math.round((hash01(x, y, 47) - 0.5) * 5);
      sprite.label = `pixel-prop-${category}`;
      sprite.__treeData = { type: variant, category, cell: [x, y] };
      sprite.anchor.set(0.5, 1);
      sprite.position.set(Math.round(sx + jx), Math.round(sy + 5 + jy));
      sprite.scale.set(spriteScale(variant, category, x, y));
      sprite.zIndex = Math.round(sprite.y * 100) + (category === 'tree' || category === 'bush' ? 15 : 7);
      sprite.roundPixels = true;
      sprite.eventMode = 'none';
      renderer.entities.addChild(sprite);

      const k = cellKey(x, y);
      if (!byCell.has(k)) byCell.set(k, []);
      byCell.get(k).push(sprite);
      used.add(variant);
      count++;
    }

    renderer.depthTreesByCell = byCell;
    renderer.prepareBuildSite = async (kingdom, x, y, buildSim, forceCastle = false) => {
      const k = cellKey(x, y);
      const props = (byCell.get(k) || []).filter(sprite => !sprite.destroyed);
      if (!props.length) return;

      const workers = kingdom.farmers.filter(farmer => !farmer.fixedBuilding);
      const worker = forceCastle || !workers.length ? null : workers.sort((a, b) =>
        Math.hypot(a.cell[0] - x, a.cell[1] - y) - Math.hypot(b.cell[0] - x, b.cell[1] - y)
      )[0];
      const categories = new Set(props.map(sprite => sprite.__treeData?.category));
      const action = categories.has('tree') || categories.has('bush') ? 'chop_wood' : categories.has('rock') ? 'dig' : 'harvest';

      if (worker) {
        worker.buildPrepUntil = buildSim.age + 8;
        const path = buildSim.findPath(kingdom, worker.cell, [x, y]);
        if (path.length) {
          worker.path = path;
          worker.taskCell = [x, y];
          worker.action = 'walk';
          renderer.setFarmerAction(worker, 'walk');
          const deadline = performance.now() + 2600;
          while (performance.now() < deadline && (worker.path.length || worker.cell[0] !== x || worker.cell[1] !== y)) await sleep(80);
        }
        worker.path = [];
        worker.action = action;
        worker.actionUntil = buildSim.age + 1.4;
        renderer.setFarmerAction(worker, action);
        await sleep(720);
      }

      let wood = 0;
      let stone = 0;
      for (const sprite of props) {
        const category = sprite.__treeData?.category;
        if (category === 'tree' || category === 'bush') wood += category === 'tree' ? 4 : 2;
        if (category === 'rock') stone += 2;

        const debris = new window.PIXI.Graphics();
        const debrisColor = category === 'rock' ? 0x8c8c87 : category === 'flower' || category === 'plant' ? 0x4f7f38 : 0x9b6a37;
        for (let i = 0; i < 7; i++) debris.rect(Math.random() * 10 - 5, Math.random() * 7 - 6, 2, 2).fill({ color: debrisColor, alpha: .9 });
        debris.position.set(sprite.x, sprite.y - 3);
        debris._life = .75;
        debris._vy = -2.5;
        renderer.fx.addChild(debris);
        sprite.destroy();
      }

      byCell.delete(k);
      kingdom.resources.wood += wood;
      kingdom.resources.stone += stone;
      document.documentElement.dataset.propsCleared = String((Number(document.documentElement.dataset.propsCleared) || 0) + props.length);

      if (worker) {
        worker.buildPrepUntil = 0;
        worker.action = 'idle';
        worker.actionUntil = 0;
        renderer.setFarmerAction(worker, 'idle');
      }
      renderer.entities.sortDirty = true;
    };

    renderer.entities.sortDirty = true;
    renderer.__depthTreesInstalled = true;
    renderer.__v706SparseFlora = true;
    window.__TREE_DEPTH_V706 = {
      installed: true,
      version: VERSION,
      count,
      variantsAvailable: VARIANTS.length,
      variantsUsed: used.size,
      excludesSnowPine: true,
      atlasParts: ATLAS_PARTS.slice()
    };
    window.__TREE_DEPTH_READY = window.__TREE_DEPTH_V706;
    document.documentElement.dataset.treeDepth = `${VERSION}:${count}:${used.size}/${VARIANTS.length}`;
  }

  window.__TREE_DEPTH_PROMISE = install().catch(error => {
    window.__TREE_DEPTH_ERROR = String(error?.stack || error?.message || error);
    console.error('[tree-depth-v706]', error);
  });
})();
