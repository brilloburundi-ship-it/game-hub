(() => {
  'use strict';

  const TREE_DATA = 'assets/map/vegetation.json';
  const TREE_TEXTURES = {
    pine: 'assets/vegetation/pine.png',
    'pine-snow': 'assets/vegetation/pine-snow.png',
    round: 'assets/vegetation/round.png'
  };
  const GROUND_TEXTURES = {
    grass: 'assets/vegetation/grass-tuft.svg',
    flowers: 'assets/vegetation/flowers.svg',
    rocks: 'assets/vegetation/rocks.svg'
  };
  const WORLD_SCALE = Number(window.__V705_WORLD_SCALE || 1);

  const waitForRenderer = async () => {
    for (let i = 0; i < 3600; i++) {
      const renderer = window.__SIM?.r;
      if (renderer?.entities && window.PIXI) return renderer;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Renderer Pixi non disponibile per gli alberi in profondità');
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
        for (const key of ['source', 'resource', 'image', 'bitmap', 'canvas']) {
          try { if (current[key]) queue.push(current[key]); } catch (_) { /* inaccessible property */ }
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

  function hash01(x, y, salt = 0) {
    let h = Math.imul((x + 37 + salt) | 0, 374761393) ^ Math.imul((y + 91 - salt) | 0, 668265263);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  async function installStaticGroundProps(renderer) {
    const sim = window.__SIM;
    if (!sim?.w || !renderer.root?.addChildAt || renderer.__v705GroundPropsInstalled) return 0;

    const loaded = await Promise.all(
      Object.entries(GROUND_TEXTURES).map(async ([kind, url]) => [kind, await window.PIXI.Assets.load(url)])
    );
    const textures = Object.fromEntries(loaded);
    for (const texture of Object.values(textures)) if (texture?.source) texture.source.scaleMode = 'nearest';

    const layer = new window.PIXI.Container();
    layer.label = 'pixel-ground-flora';
    layer.sortableChildren = false;
    layer.eventMode = 'none';
    renderer.root.addChildAt(layer, Math.min(1, renderer.root.children.length));

    let count = 0;
    for (let y = 1; y < sim.w.gridH - 1; y++) for (let x = 1; x < sim.w.gridW - 1; x++) {
      if (!sim.land(x, y) || sim.isRiver?.(x, y)) continue;
      const biome = sim.biome(x, y);
      let kind = null;
      const r = hash01(x, y, 17);

      if (biome === 'grass') {
        if (r < 0.047) kind = 'grass';
        else if (r < 0.061) kind = 'flowers';
        else if (r > 0.982) kind = 'rocks';
      } else if (biome === 'tundra') {
        if (r < 0.018) kind = 'grass';
        else if (r > 0.977) kind = 'rocks';
      } else if (biome === 'desert') {
        if (r < 0.030) kind = 'rocks';
      } else if (biome === 'mountain') {
        if (r < 0.054) kind = 'rocks';
      } else if (biome === 'forest' && r < 0.012) {
        kind = 'grass';
      }
      if (!kind) continue;

      const sprite = new window.PIXI.Sprite(textures[kind]);
      const [sx, sy] = sim.iso(x, y);
      const jx = Math.round((hash01(x, y, 31) - 0.5) * 18);
      const jy = Math.round((hash01(x, y, 47) - 0.5) * 6);
      sprite.label = `ground-${kind}`;
      sprite.anchor.set(0.5, 1);
      sprite.position.set(sx + jx, sy + 5 + jy);
      const scale = 0.78 + hash01(x, y, 61) * 0.34;
      sprite.scale.set(scale);
      sprite.roundPixels = true;
      sprite.eventMode = 'none';
      layer.addChild(sprite);
      count++;
    }

    renderer.__v705GroundPropsInstalled = true;
    renderer.__v705GroundProps = layer;
    document.documentElement.dataset.groundProps = String(count);
    return count;
  }

  const install = async () => {
    const renderer = await waitForRenderer();
    installTextureCompatibility(renderer);
    if (!renderer.entities?.addChild || renderer.__depthTreesInstalled) return;

    const response = await fetch(TREE_DATA, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Dati alberi non disponibili (${response.status})`);
    const data = await response.json();

    const loaded = await Promise.all(
      Object.entries(TREE_TEXTURES).map(async ([kind, url]) => [kind, await window.PIXI.Assets.load(url)])
    );
    const textures = Object.fromEntries(loaded);
    for (const texture of Object.values(textures)) {
      if (texture?.source) texture.source.scaleMode = 'nearest';
    }

    const byCell = new Map();
    const cellKey = (x, y) => `${x},${y}`;
    const scaledCell = cell => [
      Math.max(0, Math.min(window.__SIM.w.gridW - 1, Math.round(cell[0] * WORLD_SCALE))),
      Math.max(0, Math.min(window.__SIM.w.gridH - 1, Math.round(cell[1] * WORLD_SCALE)))
    ];

    for (const tree of data.trees) {
      const sprite = new window.PIXI.Sprite(textures[tree.type]);
      const cell = scaledCell(tree.cell);
      sprite.label = 'depth-tree';
      sprite.__treeData = { ...tree, cell };
      sprite.anchor.set(0.5, 1);
      sprite.position.set(Math.round(tree.x * WORLD_SCALE), Math.round(tree.y * WORLD_SCALE));
      sprite.zIndex = Math.round(sprite.y * 100) + 15;
      sprite.roundPixels = true;
      renderer.entities.addChild(sprite);
      const key = cellKey(cell[0], cell[1]);
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(sprite);
    }

    const groundPropCount = await installStaticGroundProps(renderer);

    renderer.depthTreesByCell = byCell;
    renderer.prepareBuildSite = async (kingdom, x, y, sim, forceCastle = false) => {
      const key = cellKey(x, y), trees = (byCell.get(key) || []).filter(sprite => !sprite.destroyed);
      if (!trees.length) return;

      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const workers = kingdom.farmers.filter(farmer => !farmer.fixedBuilding);
      const worker = forceCastle || !workers.length ? null : workers.sort((a, b) =>
        Math.hypot(a.cell[0] - x, a.cell[1] - y) - Math.hypot(b.cell[0] - x, b.cell[1] - y)
      )[0];

      if (worker) {
        worker.buildPrepUntil = sim.age + 8;
        const path = sim.findPath(kingdom, worker.cell, [x, y]);
        if (path.length) {
          worker.path = path; worker.taskCell = [x, y]; worker.action = 'walk';
          renderer.setFarmerAction(worker, 'walk');
          const deadline = performance.now() + 2600;
          while (performance.now() < deadline && (worker.path.length || worker.cell[0] !== x || worker.cell[1] !== y)) await sleep(80);
        }
        worker.path = []; worker.action = 'chop_wood'; worker.actionUntil = sim.age + 1.2;
        renderer.setFarmerAction(worker, 'chop_wood');
        await sleep(850);
      }

      for (const sprite of trees) {
        const chips = new window.PIXI.Graphics();
        for (let i = 0; i < 9; i++) chips.rect(Math.random() * 12 - 6, Math.random() * 9 - 7, 2, 2).fill({ color: i % 3 ? 0x8d5b31 : 0xd59b53, alpha: .95 });
        chips.position.set(sprite.x, sprite.y - 3); chips._life = .9; chips._vy = -3; renderer.fx.addChild(chips);
        sprite.destroy();
      }
      byCell.delete(key);
      kingdom.resources.wood += trees.length * 4;
      document.documentElement.dataset.treesCut = String((Number(document.documentElement.dataset.treesCut) || 0) + trees.length);
      if (worker) { worker.buildPrepUntil = 0; worker.action = 'idle'; worker.actionUntil = 0; renderer.setFarmerAction(worker, 'idle'); }
      renderer.entities.sortDirty = true;
    };
    renderer.entities.sortDirty = true;
    renderer.__depthTreesInstalled = true;
    window.__TREE_DEPTH_READY = {
      count: data.trees.length,
      groundProps: groundPropCount,
      version: `${data.version}-v705`,
      worldScale: WORLD_SCALE
    };
    document.documentElement.dataset.treeDepth = `${data.version}-v705:${data.trees.length}:${groundPropCount}`;
  };

  window.__TREE_DEPTH_PROMISE = install().catch(error => {
    window.__TREE_DEPTH_ERROR = String(error?.message || error);
    console.error('[tree-depth]', error);
  });
})();
