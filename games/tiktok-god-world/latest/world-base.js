(() => {
  'use strict';

  const VERSION = 'v706-world-polish-1';
  if (window.__V706_WORLD_POLISH?.bootstrap) return;

  const state = window.__V706_WORLD_POLISH = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    terrainRebuilt: false,
    forestBuildEnabled: false,
    animationGovernor: false,
    errors: []
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const key = (x, y) => `${x},${y}`;
  const WORLD_SCALE = Number(window.__V705_WORLD_SCALE || 1);

  function hash01(x, y, salt = 0) {
    let h = Math.imul((x + 101 + salt) | 0, 374761393) ^ Math.imul((y + 211 - salt) | 0, 668265263);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  function cornerToScreen(world, u, v, divisor = 1) {
    return [
      (world.originX + (u - v) * world.tileW / 2) / divisor,
      (world.originY + (u + v) * world.tileH / 2 - world.tileH / 2) / divisor
    ];
  }

  function cellToScreen(world, x, y, divisor = 1) {
    return [
      (world.originX + (x - y) * world.tileW / 2) / divisor,
      (world.originY + (x + y) * world.tileH / 2) / divisor
    ];
  }

  function maskLoops(mask) {
    const h = mask.length;
    const w = h ? mask[0].length : 0;
    const edges = [];
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !!mask[y][x];
    const add = (a, b) => edges.push({ a, b, used: false });

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add([x, y], [x + 1, y]);
      if (!inside(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
      if (!inside(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
      if (!inside(x - 1, y)) add([x, y + 1], [x, y]);
    }

    const outgoing = new Map();
    for (let i = 0; i < edges.length; i++) {
      const k = key(edges[i].a[0], edges[i].a[1]);
      if (!outgoing.has(k)) outgoing.set(k, []);
      outgoing.get(k).push(i);
    }

    const loops = [];
    for (let i = 0; i < edges.length; i++) {
      if (edges[i].used) continue;
      const loop = [];
      let edgeIndex = i;
      let guard = 0;
      while (guard++ < edges.length + 8) {
        const edge = edges[edgeIndex];
        if (!edge || edge.used) break;
        edge.used = true;
        loop.push(edge.a);
        const end = edge.b;
        if (end[0] === loop[0][0] && end[1] === loop[0][1]) break;
        const candidates = outgoing.get(key(end[0], end[1])) || [];
        const next = candidates.find(idx => !edges[idx].used);
        if (next == null) {
          loop.push(end);
          break;
        }
        edgeIndex = next;
      }
      if (loop.length >= 3) loops.push(loop);
    }
    return loops;
  }

  function makePath(world, loops, divisor, wave, salt) {
    const path = new Path2D();
    for (const loop of loops) {
      const pts = loop.map(([u, v], i) => {
        const [sx, sy] = cornerToScreen(world, u, v, divisor);
        const jx = (hash01(u, v, salt + i * 3) - 0.5) * wave / divisor;
        const jy = (hash01(u, v, salt + 97 + i * 5) - 0.5) * wave * 0.48 / divisor;
        return [sx + jx, sy + jy];
      });
      if (pts.length < 3) continue;
      const firstMid = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
      path.moveTo(firstMid[0], firstMid[1]);
      for (let i = 1; i <= pts.length; i++) {
        const p = pts[i % pts.length];
        const n = pts[(i + 1) % pts.length];
        const mid = [(p[0] + n[0]) / 2, (p[1] + n[1]) / 2];
        path.quadraticCurveTo(p[0], p[1], mid[0], mid[1]);
      }
      path.closePath();
    }
    return path;
  }

  function biomeMask(world, biome) {
    return world.biomes.map((row, y) => row.map((value, x) => !!world.land[y][x] && value === biome));
  }

  function drawRegion(ctx, world, biome, color, divisor, wave, salt, alpha = 1) {
    const loops = maskLoops(biomeMask(world, biome));
    if (!loops.length) return;
    const path = makePath(world, loops, divisor, wave, salt);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill(path, 'evenodd');
    ctx.restore();
  }

  function createTerrainCanvas(sim, divisor = 1) {
    const world = sim.w;
    const width = Math.max(1, Math.round(world.mapWidth / divisor));
    const height = Math.max(1, Math.round(world.mapHeight / divisor));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#173f59';
    ctx.fillRect(0, 0, width, height);

    // Subtle ocean bands: static, cheap and pixel-art friendly.
    ctx.globalAlpha = 0.22;
    for (let y = 24; y < height; y += 48) {
      ctx.fillStyle = (Math.floor(y / 48) % 2) ? '#1b4b68' : '#12384f';
      ctx.fillRect(0, y, width, Math.max(1, Math.round(2 / divisor)));
    }
    ctx.globalAlpha = 1;

    const landLoops = maskLoops(world.land);
    const coastPath = makePath(world, landLoops, divisor, 9, 31);
    ctx.fillStyle = '#6e9a48';
    ctx.fill(coastPath, 'evenodd');

    // Coast is deliberately irregular and rounded, removing the previous cut-off corners.
    ctx.strokeStyle = '#c6a85d';
    ctx.lineWidth = Math.max(2, 8 / divisor);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(coastPath);
    ctx.strokeStyle = '#789a4f';
    ctx.lineWidth = Math.max(1, 3 / divisor);
    ctx.stroke(coastPath);

    // Biome fields are smooth masks; forest is terrain tint only, never baked-in trees.
    drawRegion(ctx, world, 'forest', '#527c3d', divisor, 7, 101, 0.90);
    drawRegion(ctx, world, 'desert', '#c9a55b', divisor, 11, 203, 1);
    drawRegion(ctx, world, 'tundra', '#87977f', divisor, 7, 307, 1);
    drawRegion(ctx, world, 'mountain', '#777d79', divisor, 5, 401, 1);
    drawRegion(ctx, world, 'ice_coast', '#bac8c3', divisor, 5, 503, 1);
    drawRegion(ctx, world, 'beach', '#cfb56b', divisor, 7, 607, 1);

    // Small deterministic pixel texture, no fake forests and no build-blocking decoration.
    const px = Math.max(1, Math.round(2 / divisor));
    for (let y = 1; y < world.gridH - 1; y++) for (let x = 1; x < world.gridW - 1; x++) {
      if (!world.land[y][x] || sim.isRiver?.(x, y)) continue;
      if (hash01(x, y, 701) > 0.17) continue;
      const [sx, sy] = cellToScreen(world, x, y, divisor);
      const biome = world.biomes[y][x];
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = biome === 'desert' ? '#8f733c' : biome === 'mountain' ? '#555b58' : '#355d35';
      ctx.fillRect(Math.round(sx + (hash01(x, y, 719) - .5) * 14 / divisor), Math.round(sy + (hash01(x, y, 733) - .5) * 5 / divisor), px, px);
    }
    ctx.globalAlpha = 1;

    // Rivers remain visible but lightweight.
    for (const river of world.rivers || []) {
      if (!Array.isArray(river) || river.length < 2) continue;
      ctx.beginPath();
      river.forEach((cell, i) => {
        const [sx, sy] = cellToScreen(world, cell[0], cell[1], divisor);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.strokeStyle = '#2f7696';
      ctx.lineWidth = Math.max(1, 4 / divisor);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#67a9bd';
      ctx.lineWidth = Math.max(1, 1.5 / divisor);
      ctx.stroke();
    }

    return canvas;
  }

  function replaceTerrain(sim) {
    const renderer = sim.r;
    if (renderer?.root?.children?.length && window.PIXI) {
      const sprite = renderer.root.children[0];
      if (!sprite || sprite.__v706CleanTerrain) return false;
      const divisor = WORLD_SCALE > 1 ? WORLD_SCALE : 1;
      const canvas = createTerrainCanvas(sim, divisor);
      const texture = window.PIXI.Texture.from(canvas);
      if (texture?.source) texture.source.scaleMode = 'nearest';
      sprite.texture = texture;
      sprite.scale.set(divisor);
      sprite.__v706CleanTerrain = true;
      renderer.__v706TerrainCanvas = canvas;
      renderer.home?.();
      return true;
    }

    if (renderer?.map) {
      renderer.map = createTerrainCanvas(sim, 1);
      renderer.__v706CleanTerrain = true;
      renderer.home?.();
      return true;
    }
    return false;
  }

  function extendForestBuildability(sim) {
    if (sim.__v706ForestBuildability || typeof sim.isBuildableCell !== 'function') return;
    sim.__v706ForestBuildability = true;
    const original = sim.isBuildableCell.bind(sim);
    sim.isBuildableCell = function (x, y, type = 'house_a') {
      if (original(x, y, type)) return true;
      if (!this.land(x, y) || this.isRiver(x, y) || this.biome(x, y) !== 'forest') return false;
      if (type === 'farm') return false;
      const minCoast = type === 'castle' ? 4 : 2;
      if (this.coastDistance(x, y) < minCoast) return false;
      return this.neigh(x, y).length >= 3;
    };
    state.forestBuildEnabled = true;
  }

  function finalAnimationSpeed(action) {
    const a = String(action || 'idle');
    if (a.startsWith('walk')) return 0.072;
    if (a.startsWith('run')) return 0.085;
    if (['harvest','plant_seed','dig','pickaxe','water','chop_wood','fish','milk_cow','push_cart','carry_sack','carry_log','carry_basket'].includes(a)) return 0.048;
    if (['eat','celebrate','hurt'].includes(a)) return 0.055;
    return 0.040;
  }

  function installAnimationGovernor(sim) {
    const renderer = sim.r;
    if (!renderer || renderer.__v706AnimationGovernor) return;
    renderer.__v706AnimationGovernor = true;

    const tune = farmer => {
      const sprite = farmer?._sprite;
      if (!sprite || sprite.destroyed) return;
      sprite.animationSpeed = finalAnimationSpeed(sprite._action || farmer?.action);
    };

    const originalSet = typeof renderer.setFarmerAction === 'function' ? renderer.setFarmerAction.bind(renderer) : null;
    if (originalSet) {
      renderer.setFarmerAction = function (farmer, action) {
        const result = originalSet(farmer, action);
        tune(farmer);
        return result;
      };
    }

    const originalUpdate = typeof renderer.updateFarmer === 'function' ? renderer.updateFarmer.bind(renderer) : null;
    if (originalUpdate) {
      renderer.updateFarmer = function (farmer, dx, dy) {
        const result = originalUpdate(farmer, dx, dy);
        tune(farmer);
        return result;
      };
    }

    for (const kingdom of sim.kingdoms || []) for (const farmer of kingdom.farmers || []) tune(farmer);
    state.animationGovernor = true;
  }

  async function install() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (sim?.r && window.__V705_WORLD_NPC_EXPANSION?.installed) break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Simulation renderer unavailable');

    extendForestBuildability(sim);
    installAnimationGovernor(sim);
    state.terrainRebuilt = replaceTerrain(sim);
    state.installed = true;
    state.propsExpected = true;
    document.documentElement.dataset.worldPolish = `${VERSION}:${state.terrainRebuilt ? 'terrain' : 'no-terrain'}:${state.forestBuildEnabled ? 'forest-build' : 'forest-locked'}`;
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v706-world-polish]', error);
  });
})();
