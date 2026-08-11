(() => {
  'use strict';

  const TREE_DATA = 'assets/map/vegetation.json';
  const TREE_TEXTURES = {
    pine: 'assets/vegetation/pine.png',
    'pine-snow': 'assets/vegetation/pine-snow.png',
    round: 'assets/vegetation/round.png'
  };
  const MAX_WORLD_TREES = 96;
  const MIN_CELL_GAP = 2.15;
  const MIN_TARGET_TREES = 72;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const cellKey = (x, y) => `${x},${y}`;
  const hashCell = (x, y) => {
    let h = ((x + 17) * 73856093) ^ ((y + 29) * 19349663);
    h ^= h >>> 13;
    return h >>> 0;
  };

  const waitForRenderer = async () => {
    for (let i = 0; i < 1200; i++) {
      const renderer = window.__SIM?.r;
      if (renderer?.entities && window.PIXI) return renderer;
      await sleep(50);
    }
    throw new Error('Pixi renderer unavailable for sparse vegetation');
  };

  function chooseSparseTrees(data, sim) {
    const unique = new Map();
    for (const tree of data.trees || []) {
      if (!tree?.cell) continue;
      const [cx, cy] = tree.cell;
      if (!sim?.land?.(cx, cy) || sim.buildingAt?.(cx, cy)) continue;
      const biome = sim.biome?.(cx, cy);
      if (!['grass', 'forest', 'desert', 'tundra'].includes(biome)) continue;
      const k = cellKey(cx, cy);
      const current = unique.get(k);
      if (!current || hashCell(cx, cy) < hashCell(current.cell[0] + 3, current.cell[1] + 7)) unique.set(k, tree);
    }

    const candidates = [...unique.values()].sort((a, b) => hashCell(a.cell[0], a.cell[1]) - hashCell(b.cell[0], b.cell[1]));
    const selected = [];
    for (const tree of candidates) {
      const [x, y] = tree.cell;
      if (selected.some(other => Math.hypot(x - other.cell[0], y - other.cell[1]) < MIN_CELL_GAP)) continue;
      selected.push(tree);
      if (selected.length >= MAX_WORLD_TREES) break;
    }

    if (selected.length < Math.min(MIN_TARGET_TREES, MAX_WORLD_TREES)) {
      const set = new Set(selected.map(t => cellKey(...t.cell)));
      for (const tree of candidates) {
        const k = cellKey(...tree.cell);
        if (set.has(k)) continue;
        selected.push(tree); set.add(k);
        if (selected.length >= Math.min(MIN_TARGET_TREES, MAX_WORLD_TREES)) break;
      }
    }
    return selected;
  }

  const install = async () => {
    const renderer = await waitForRenderer();
    const sim = window.__SIM;
    if (!sim || !renderer.entities?.addChild || renderer.__depthTreesInstalled) return;

    const response = await fetch(TREE_DATA, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Vegetation data unavailable (${response.status})`);
    const data = await response.json();
    const chosen = chooseSparseTrees(data, sim);

    const loaded = await Promise.all(Object.entries(TREE_TEXTURES).map(async ([kind, url]) => [kind, await window.PIXI.Assets.load(url)]));
    const textures = Object.fromEntries(loaded);
    for (const texture of Object.values(textures)) if (texture?.source) texture.source.scaleMode = 'nearest';

    const byCell = new Map();
    let inserted = 0;
    for (const tree of chosen) {
      const [cx, cy] = tree.cell;
      if (sim.buildingAt?.(cx, cy)) continue;
      const texture = textures[tree.type] || textures.round || textures.pine;
      if (!texture) continue;
      const sprite = new window.PIXI.Sprite(texture);
      sprite.label = 'sparse-depth-tree';
      sprite.__treeData = tree;
      sprite.anchor.set(0.5, 1);
      sprite.position.set(Math.round(tree.x), Math.round(tree.y));
      const h = hashCell(cx, cy);
      const scale = 0.58 + (h % 16) / 100;
      sprite.scale.set(scale);
      sprite.zIndex = Math.round(tree.y * 100) + 15;
      sprite.roundPixels = true;
      renderer.entities.addChild(sprite);
      const k = cellKey(cx, cy);
      if (!byCell.has(k)) byCell.set(k, []);
      byCell.get(k).push(sprite);
      inserted++;
      if (inserted % 12 === 0) await nextFrame();
    }

    renderer.depthTreesByCell = byCell;
    renderer.prepareBuildSite = async (kingdom, x, y, battleSim = sim) => {
      const k = cellKey(x, y);
      const trees = (byCell.get(k) || []).filter(sprite => !sprite.destroyed);
      if (!trees.length) return;

      const worker = (kingdom.farmers || []).find(f => !f.fixedBuilding && f._sprite);
      if (worker) {
        worker.action = 'chop_wood';
        worker.actionUntil = battleSim.age + 0.3;
        renderer.setFarmerAction?.(worker, 'chop_wood');
        await sleep(90);
      }

      for (const sprite of trees) {
        const chips = new window.PIXI.Graphics();
        for (let i = 0; i < 5; i++) chips.rect(Math.random() * 8 - 4, Math.random() * 7 - 5, 2, 2).fill({ color: i % 2 ? 0x8d5b31 : 0xd59b53, alpha: .9 });
        chips.position.set(sprite.x, sprite.y - 3);
        chips._life = .45;
        chips._vy = -2;
        renderer.fx.addChild(chips);
        sprite.destroy();
      }
      byCell.delete(k);
      kingdom.resources.wood += trees.length * 3;
      if (worker) {
        worker.action = 'idle'; worker.actionUntil = 0;
        renderer.setFarmerAction?.(worker, 'idle');
      }
    };

    renderer.entities.sortDirty = true;
    renderer.__depthTreesInstalled = true;
    window.__TREE_DEPTH_READY = { count: inserted, sourceCount: (data.trees || []).length, version: 'sparse-v4-nonblocking' };
    document.documentElement.dataset.treeDepth = `sparse-v4:${inserted}`;
  };

  // Buildings never wait for vegetation. Late tree insertion already checks
  // buildingAt(), so JOIN can finish immediately while trees stream in.
  window.__TREE_DEPTH_PROMISE = null;
  window.__TREE_DEPTH_LOADING = install().catch(error => {
    window.__TREE_DEPTH_ERROR = String(error?.message || error);
    console.error('[tree-depth]', error);
  });
})();
