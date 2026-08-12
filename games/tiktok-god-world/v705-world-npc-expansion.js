(() => {
  'use strict';

  const VERSION = 'v705-world-npc-expansion-1';
  const WORLD_SCALE = 4 / 3;
  const FARMER_SPEED_FACTOR = 0.58;
  const FARMER_MIN_SPEED = 9.5;
  const FARMER_MAX_SPEED = 14.5;
  const NPC_FPS_FACTOR = 0.62;

  if (window.__V705_WORLD_NPC_EXPANSION?.installed) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nativeFetch = window.fetch.bind(window);
  let expandedWorldServed = false;
  let npcManifestServed = false;

  const urlText = input => {
    try { return typeof input === 'string' ? input : String(input?.url || ''); }
    catch (_) { return ''; }
  };

  const jsonResponse = (source, data) => {
    const headers = new Headers(source.headers || {});
    headers.set('content-type', 'application/json; charset=utf-8');
    headers.delete('content-length');
    return new Response(JSON.stringify(data), {
      status: source.status,
      statusText: source.statusText,
      headers
    });
  };

  function expandedSize(value) {
    return Math.max(1, Math.round(Number(value || 1) * WORLD_SCALE));
  }

  function resampleGrid(grid, newW, newH) {
    const oldH = Array.isArray(grid) ? grid.length : 0;
    const oldW = oldH && Array.isArray(grid[0]) ? grid[0].length : 0;
    if (!oldW || !oldH) return grid;
    const out = Array.from({ length: newH }, () => Array(newW));
    for (let y = 0; y < newH; y++) {
      const sy = Math.min(oldH - 1, Math.floor(y / WORLD_SCALE));
      for (let x = 0; x < newW; x++) {
        const sx = Math.min(oldW - 1, Math.floor(x / WORLD_SCALE));
        out[y][x] = grid[sy][sx];
      }
    }
    return out;
  }

  function recomputeCoastDistance(land) {
    const h = land.length, w = h ? land[0].length : 0;
    const dist = Array.from({ length: h }, () => Array(w).fill(-1));
    const qx = [], qy = [];
    let head = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!land[y][x]) {
        dist[y][x] = 0;
        qx.push(x); qy.push(y);
      }
    }
    while (head < qx.length) {
      const x = qx[head], y = qy[head++], next = dist[y][x] + 1;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || dist[ny][nx] >= 0) continue;
        dist[ny][nx] = next;
        qx.push(nx); qy.push(ny);
      }
    }
    return dist;
  }

  const scaleCell = (x, y, newW, newH) => [
    clamp(Math.round(Number(x || 0) * WORLD_SCALE), 0, newW - 1),
    clamp(Math.round(Number(y || 0) * WORLD_SCALE), 0, newH - 1)
  ];

  function scaleRiver(path, newW, newH) {
    if (!Array.isArray(path) || !path.length) return [];
    const targets = path.map(p => scaleCell(p[0], p[1], newW, newH));
    const out = [];
    const push = (x, y) => {
      const last = out[out.length - 1];
      if (!last || last[0] !== x || last[1] !== y) out.push([x, y]);
    };
    push(...targets[0]);
    for (let i = 1; i < targets.length; i++) {
      let [x, y] = out[out.length - 1];
      const [tx, ty] = targets[i];
      while (x !== tx || y !== ty) {
        if (x !== tx) x += Math.sign(tx - x);
        else if (y !== ty) y += Math.sign(ty - y);
        push(x, y);
      }
    }
    return out;
  }

  function expandWorld(world) {
    if (!world || world.__v705Expanded) return world;
    const oldW = Number(world.gridW || world.land?.[0]?.length || 1);
    const oldH = Number(world.gridH || world.land?.length || 1);
    const newW = expandedSize(oldW), newH = expandedSize(oldH);
    const land = resampleGrid(world.land, newW, newH);
    const biomes = resampleGrid(world.biomes, newW, newH);
    const resources = (world.resources || []).map(item => {
      const [x, y] = scaleCell(item[0], item[1], newW, newH);
      return [x, y, item[2]];
    });
    const rivers = (world.rivers || []).map(path => scaleRiver(path, newW, newH));

    return {
      ...world,
      gridW: newW,
      gridH: newH,
      originX: Math.round(Number(world.originX || 0) * WORLD_SCALE),
      originY: Math.round(Number(world.originY || 0) * WORLD_SCALE),
      mapWidth: Math.round(Number(world.mapWidth || 1) * WORLD_SCALE),
      mapHeight: Math.round(Number(world.mapHeight || 1) * WORLD_SCALE),
      land,
      biomes,
      coastDistance: recomputeCoastDistance(land),
      resources,
      rivers,
      version: `${world.version || 'world'}-v705-wide`,
      __v705Expanded: true,
      __v705OriginalGrid: [oldW, oldH],
      __v705Scale: WORLD_SCALE
    };
  }

  function slowNpcManifest(manifest) {
    if (!manifest?.actions) return manifest;
    const actions = {};
    for (const [name, action] of Object.entries(manifest.actions)) {
      const fps = Number(action?.fps || 0);
      actions[name] = {
        ...action,
        fps: fps > 0 ? Math.max(2, Math.round(fps * NPC_FPS_FACTOR * 10) / 10) : fps
      };
    }
    return { ...manifest, actions, version: `${manifest.version || 'npc'}-v705-slower` };
  }

  window.__V705_WORLD_SCALE = WORLD_SCALE;
  window.fetch = async function(input, init) {
    const url = urlText(input).split('#')[0].split('?')[0];
    if (url.endsWith('assets/map/world.json')) {
      const response = await nativeFetch(input, init);
      if (!response.ok) return response;
      const world = expandWorld(await response.clone().json());
      expandedWorldServed = true;
      return jsonResponse(response, world);
    }
    if (url.endsWith('assets/npc/manifest.json')) {
      const response = await nativeFetch(input, init);
      if (!response.ok) return response;
      npcManifestServed = true;
      return jsonResponse(response, slowNpcManifest(await response.clone().json()));
    }
    return nativeFetch(input, init);
  };

  function tunedFarmerSpeed(farmer, fromCoreReset = false) {
    if (!farmer || farmer.fixedBuilding) return farmer;
    const raw = Number(farmer.speed || 0);
    if (!Number.isFinite(raw) || raw <= 0) return farmer;
    if (fromCoreReset || !farmer.__v705SpeedTuned) {
      farmer.speed = clamp(raw * FARMER_SPEED_FACTOR, FARMER_MIN_SPEED, FARMER_MAX_SPEED);
      farmer.__v705SpeedTuned = true;
    }
    return farmer;
  }

  function animationSpeedFor(action) {
    const a = String(action || 'idle');
    if (a.startsWith('walk')) return 0.09;
    if (['harvest','water','pickaxe','dig','chop_wood','carry_sack'].includes(a)) return 0.082;
    return 0.062;
  }

  async function installRuntimePatches() {
    for (let i = 0; i < 1800; i++) {
      if (window.__SIM?.r && typeof window.__SIM.spawnFarmer === 'function') break;
      await sleep(20);
    }
    const sim = window.__SIM, renderer = sim?.r;
    if (!sim || !renderer) return;

    // The logical grid is larger, while the exact original map artwork is simply
    // scaled with nearest-neighbour rendering. No biome palette or map style changes.
    const mapSprite = renderer.root?.children?.[0];
    if (mapSprite?.scale?.set && !mapSprite.__v705MapScaled) {
      mapSprite.scale.set(WORLD_SCALE);
      mapSprite.__v705MapScaled = true;
      try { if (mapSprite.texture?.source) mapSprite.texture.source.scaleMode = 'nearest'; } catch (_) {}
      renderer.home?.();
    } else if (renderer.map && !renderer.__v705CanvasMapScaled) {
      try {
        const source = renderer.map;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(source.width * WORLD_SCALE);
        canvas.height = Math.round(source.height * WORLD_SCALE);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        renderer.map = canvas;
        renderer.__v705CanvasMapScaled = true;
        renderer.home?.();
      } catch (_) {}
    }

    for (const kingdom of sim.kingdoms || []) for (const farmer of kingdom.farmers || []) tunedFarmerSpeed(farmer);

    const originalSpawnFarmer = sim.spawnFarmer.bind(sim);
    sim.spawnFarmer = async function(...args) {
      const farmer = await originalSpawnFarmer(...args);
      tunedFarmerSpeed(farmer, true);
      return farmer;
    };

    const originalReleaseFarmWorker = sim.releaseFarmWorker?.bind(sim);
    if (originalReleaseFarmWorker) {
      sim.releaseFarmWorker = function(...args) {
        const farmer = originalReleaseFarmWorker(...args);
        tunedFarmerSpeed(farmer, true);
        return farmer;
      };
    }

    if (typeof renderer.makeFarmerSprite === 'function') {
      const originalMakeFarmerSprite = renderer.makeFarmerSprite.bind(renderer);
      renderer.makeFarmerSprite = function(action) {
        const sprite = originalMakeFarmerSprite(action);
        if (sprite) sprite.animationSpeed = animationSpeedFor(action);
        return sprite;
      };
    }

    if (typeof renderer.setFarmerAction === 'function') {
      const originalSetFarmerAction = renderer.setFarmerAction.bind(renderer);
      renderer.setFarmerAction = function(farmer, action) {
        const result = originalSetFarmerAction(farmer, action);
        const sprite = farmer?._sprite;
        if (sprite && !sprite.destroyed) sprite.animationSpeed = animationSpeedFor(sprite._action || action);
        return result;
      };
    }

    if (typeof renderer.updateFarmer === 'function') {
      const originalUpdateFarmer = renderer.updateFarmer.bind(renderer);
      renderer.updateFarmer = function(farmer, dx, dy) {
        const result = originalUpdateFarmer(farmer, dx, dy);
        const sprite = farmer?._sprite;
        if (sprite && !sprite.destroyed) sprite.animationSpeed = animationSpeedFor(sprite._action || farmer?.action);
        return result;
      };
    }

    for (const kingdom of sim.kingdoms || []) for (const farmer of kingdom.farmers || []) {
      const sprite = farmer?._sprite;
      if (sprite && !sprite.destroyed) sprite.animationSpeed = animationSpeedFor(sprite._action || farmer.action);
    }

    window.__V705_WORLD_NPC_EXPANSION = {
      installed: true,
      version: VERSION,
      worldScale: WORLD_SCALE,
      expandedWorldServed,
      npcManifestServed,
      grid: [sim.w.gridW, sim.w.gridH],
      mapSize: [sim.w.mapWidth, sim.w.mapHeight],
      farmerSpeedFactor: FARMER_SPEED_FACTOR,
      slowerAnimations: true,
      mapStylePreserved: true,
      noGameplayTickerAdded: true
    };
    document.documentElement.dataset.worldNpcExpansion = `${VERSION}:${sim.w.gridW}x${sim.w.gridH}`;
  }

  installRuntimePatches().catch(error => {
    window.__V705_WORLD_NPC_EXPANSION_ERROR = String(error?.stack || error?.message || error);
    console.error('[v705-world-npc-expansion]', error);
  });
})();
