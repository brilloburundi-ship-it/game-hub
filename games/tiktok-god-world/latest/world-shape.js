(() => {
  'use strict';

  const VERSION = 'v712-latest-world-shape-1';
  if (window.__GOD_WORLD_LATEST_SHAPE?.installed) return;

  const state = window.__GOD_WORLD_LATEST_SHAPE = {
    installed: false,
    version: VERSION,
    rounded: false,
    coastSculpted: false,
    riverMouths: 0,
    terrain: false,
    errors: []
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = (x, y) => `${x},${y}`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function hash01(x, y, salt = 0) {
    let h = Math.imul((x + 101 + salt) | 0, 374761393) ^ Math.imul((y + 211 - salt) | 0, 668265263);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  function cellToScreen(w, x, y, d = 1) {
    return [(w.originX + (x - y) * w.tileW / 2) / d, (w.originY + (x + y) * w.tileH / 2) / d];
  }

  function cornerToScreen(w, x, y, d = 1) {
    return [(w.originX + (x - y) * w.tileW / 2) / d, (w.originY + (x + y) * w.tileH / 2 - w.tileH / 2) / d];
  }

  function inBounds(w, x, y) {
    return x >= 0 && y >= 0 && x < w.gridW && y < w.gridH;
  }

  function landAt(mask, x, y) {
    return y >= 0 && y < mask.length && x >= 0 && x < (mask[0]?.length || 0) && !!mask[y][x];
  }

  function angleDelta(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function bell(angle, center, width) {
    const d = angleDelta(angle, center) / width;
    return Math.exp(-0.5 * d * d);
  }

  function recomputeCoast(w) {
    const dist = Array.from({ length: w.gridH }, () => Array(w.gridW).fill(999));
    const queue = [];
    let head = 0;
    for (let y = 0; y < w.gridH; y++) {
      for (let x = 0; x < w.gridW; x++) {
        if (!w.land[y][x]) {
          dist[y][x] = 0;
          queue.push([x, y]);
        }
      }
    }
    while (head < queue.length) {
      const [x, y] = queue[head++];
      const next = dist[y][x] + 1;
      for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!inBounds(w, a, b) || dist[b][a] <= next) continue;
        dist[b][a] = next;
        queue.push([a, b]);
      }
    }
    w.coastDistance = dist;
    return dist;
  }

  function coastExposure(mask, x, y) {
    let sea = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!landAt(mask, x + dx, y + dy)) sea++;
    }
    return sea;
  }

  function landAround(mask, x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && landAt(mask, x + dx, y + dy)) count++;
      }
    }
    return count;
  }

  function straightCoast(mask, x, y) {
    const l = landAt(mask, x - 1, y), r = landAt(mask, x + 1, y);
    const u = landAt(mask, x, y - 1), d = landAt(mask, x, y + 1);
    const ul = landAt(mask, x - 1, y - 1), ur = landAt(mask, x + 1, y - 1);
    const dl = landAt(mask, x - 1, y + 1), dr = landAt(mask, x + 1, y + 1);
    return (l && r && !u && !d) || (u && d && !l && !r) ||
      (l && u && !r && !d) || (r && d && !l && !u) ||
      (r && u && !l && !d) || (l && d && !r && !u) ||
      (ul && dr && !ur && !dl) || (ur && dl && !ul && !dr);
  }

  // Four erosion passes deliberately break long isometric ruler-lines into coves,
  // headlands and short beaches. Only exposed perimeter cells are touched.
  function sculptCoast(land, biomes) {
    for (let pass = 0; pass < 4; pass++) {
      const remove = [];
      for (let y = 2; y < land.length - 2; y++) {
        for (let x = 2; x < land[0].length - 2; x++) {
          if (!land[y][x]) continue;
          const sea = coastExposure(land, x, y);
          if (!sea) continue;
          const neighbours = landAround(land, x, y);
          if (neighbours < 5) continue;

          const straight = straightCoast(land, x, y);
          const wave =
            Math.sin(x * 0.53 + y * 0.19 + pass * 1.11) * 0.23 +
            Math.cos(y * 0.47 - x * 0.13 - pass * 0.83) * 0.19 +
            Math.sin((x + y) * 0.29 + pass * 0.51) * 0.14;
          const rnd = hash01(x, y, 1701 + pass * 101);
          const cut =
            (sea >= 2 && neighbours >= 6 && rnd + wave > 0.62) ||
            (straight && rnd + wave > 0.39) ||
            (straight && sea >= 1 && rnd > 0.68 - pass * 0.06);
          if (cut) remove.push([x, y]);
        }
      }
      for (const [x, y] of remove) {
        land[y][x] = 0;
        biomes[y][x] = 'ocean';
      }
    }
  }

  function longestSegment(w, river) {
    const segments = [];
    let current = [];
    for (const cell of river || []) {
      const x = cell?.[0], y = cell?.[1];
      const ok = Number.isInteger(x) && Number.isInteger(y) && inBounds(w, x, y) && !!w.land[y][x];
      if (ok) current.push([x, y]);
      else if (current.length) {
        segments.push(current);
        current = [];
      }
    }
    if (current.length) segments.push(current);
    segments.sort((a, b) => b.length - a.length);
    return segments[0]?.length >= 2 ? segments[0] : null;
  }

  // The river follows the coast-distance gradient and then continues two or three
  // cells into open water. This makes the final rendered mouth part of the sea.
  function extendRiverToSea(w, river) {
    if (!river?.length || river.length < 2) return river;
    const out = river.slice();
    const first = out[0], last = out[out.length - 1];
    const firstDist = w.coastDistance?.[first[1]]?.[first[0]] ?? 999;
    const lastDist = w.coastDistance?.[last[1]]?.[last[0]] ?? 999;
    if (firstDist < lastDist) out.reverse();

    let [x, y] = out[out.length - 1];
    const visited = new Set(out.map(([a, b]) => key(a, b)));
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];

    for (let step = 0; step < 110; step++) {
      const neighbours = dirs.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => inBounds(w, a, b));
      const seaCells = neighbours.filter(([a, b]) => !w.land[b][a]);
      if (seaCells.length) {
        seaCells.sort((p, q) => hash01(p[0], p[1], 2401) - hash01(q[0], q[1], 2401));
        const sea = seaCells[0];
        out.push(sea);
        let dx = sea[0] - x, dy = sea[1] - y;
        dx = clamp(dx, -1, 1); dy = clamp(dy, -1, 1);
        let sx = sea[0], sy = sea[1];
        for (let extra = 0; extra < 3; extra++) {
          const nx = sx + dx, ny = sy + dy;
          if (!inBounds(w, nx, ny) || w.land[ny][nx]) break;
          out.push([nx, ny]);
          sx = nx; sy = ny;
        }
        state.riverMouths++;
        return out;
      }

      const currentDist = w.coastDistance?.[y]?.[x] ?? 999;
      const candidates = neighbours
        .filter(([a, b]) => w.land[b][a] && !visited.has(key(a, b)))
        .map(cell => ({
          cell,
          dist: w.coastDistance?.[cell[1]]?.[cell[0]] ?? 999,
          jitter: hash01(cell[0], cell[1], 2207)
        }))
        .sort((a, b) => (a.dist + a.jitter * 0.24) - (b.dist + b.jitter * 0.24));
      const choice = candidates.find(candidate => candidate.dist <= currentDist) || candidates[0];
      if (!choice) break;
      [x, y] = choice.cell;
      visited.add(key(x, y));
      out.push([x, y]);
    }
    return out;
  }

  function reshape(sim) {
    if (sim.__v712RoundedWorld) return true;
    const w = sim.w;
    if (!w?.land?.length || !w?.biomes?.length) return false;

    const oldLand = w.land.map(row => row.slice());
    const oldBiome = w.biomes.map(row => row.slice());
    const cx = (w.gridW - 1) / 2, cy = (w.gridH - 1) / 2;
    const [mx, my] = cellToScreen(w, cx, cy);
    const halfX = ((w.gridW - 1) + (w.gridH - 1)) * w.tileW / 4;
    const halfY = ((w.gridW - 1) + (w.gridH - 1)) * w.tileH / 4;
    const rx = halfX * .76, ry = halfY * .88;

    const land = Array.from({ length: w.gridH }, () => Array(w.gridW).fill(0));
    const biomes = Array.from({ length: w.gridH }, () => Array(w.gridW).fill('ocean'));

    for (let y = 0; y < w.gridH; y++) {
      for (let x = 0; x < w.gridW; x++) {
        const [sx, sy] = cellToScreen(w, x, y);
        const nx = (sx - mx) / rx, ny = (sy - my) / ry;
        const radius = Math.hypot(nx, ny), angle = Math.atan2(ny, nx);

        // A strong multi-frequency coastline plus deliberate bays/headlands.
        // This avoids the long straight diamond sides visible on the isometric grid.
        const angular =
          Math.sin(angle * 2.35 + .28) * .064 +
          Math.sin(angle * 4.9 - 1.02) * .044 +
          Math.sin(angle * 8.7 + 1.58) * .029 +
          Math.cos(angle * 13.1 - .47) * .015;
        const local =
          Math.sin(nx * 8.6 + ny * 3.7 + .42) * .029 +
          Math.cos(nx * 4.4 - ny * 9.1) * .022 +
          Math.sin((nx + ny) * 12.2) * .016;

        const bays =
          bell(angle, -2.72, .24) * .105 +
          bell(angle, -1.08, .20) * .080 +
          bell(angle,  .42, .23) * .095 +
          bell(angle,  2.10, .21) * .085;
        const headlands =
          bell(angle, -2.02, .18) * .048 +
          bell(angle, -.18, .17) * .042 +
          bell(angle,  1.31, .18) * .046 +
          bell(angle,  2.77, .17) * .040;

        const edge = .842 + angular + local - bays + headlands;
        if (radius > edge) continue;

        land[y][x] = 1;
        const previous = oldLand[y]?.[x] ? oldBiome[y]?.[x] : null;
        if (previous && previous !== 'ocean') {
          biomes[y][x] = previous;
        } else {
          const n = hash01(x, y, 911);
          if (y < w.gridH * .18 && n < .24) biomes[y][x] = 'tundra';
          else if (x > w.gridW * .68 && y > w.gridH * .50 && n < .27) biomes[y][x] = 'desert';
          else if (n < .16) biomes[y][x] = 'forest';
          else biomes[y][x] = 'grass';
        }
      }
    }

    sculptCoast(land, biomes);
    w.land = land;
    w.biomes = biomes;
    const coast = recomputeCoast(w);
    state.coastSculpted = true;

    for (let y = 0; y < w.gridH; y++) {
      for (let x = 0; x < w.gridW; x++) {
        if (w.land[y][x] && coast[y][x] <= 1 && !['mountain', 'tundra', 'ice_coast'].includes(w.biomes[y][x])) {
          w.biomes[y][x] = 'beach';
        }
      }
    }

    w.rivers = (w.rivers || [])
      .map(river => longestSegment(w, river))
      .filter(Boolean)
      .map(river => extendRiverToSea(w, river))
      .filter(river => river?.length >= 2);

    if (sim.riverSet instanceof Set) {
      sim.riverSet.clear();
      for (const river of w.rivers) {
        for (const [x, y] of river) {
          if (inBounds(w, x, y) && w.land[y][x]) sim.riverSet.add(key(x, y));
        }
      }
    }

    sim.__v712RoundedWorld = true;
    state.rounded = true;
    return true;
  }

  function loops(mask) {
    const h = mask.length, w = h ? mask[0].length : 0;
    const edges = [];
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !!mask[y][x];
    const add = (a, b) => edges.push({ a, b, used: false });

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inside(x, y)) continue;
        if (!inside(x, y - 1)) add([x, y], [x + 1, y]);
        if (!inside(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
        if (!inside(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
        if (!inside(x - 1, y)) add([x, y + 1], [x, y]);
      }
    }

    const outgoing = new Map();
    edges.forEach((edge, index) => {
      const token = key(...edge.a);
      if (!outgoing.has(token)) outgoing.set(token, []);
      outgoing.get(token).push(index);
    });

    const result = [];
    for (let i = 0; i < edges.length; i++) {
      if (edges[i].used) continue;
      const loop = [];
      let j = i, guard = 0;
      while (guard++ < edges.length + 8) {
        const edge = edges[j];
        if (!edge || edge.used) break;
        edge.used = true;
        loop.push(edge.a);
        const end = edge.b;
        if (end[0] === loop[0][0] && end[1] === loop[0][1]) break;
        const next = (outgoing.get(key(...end)) || []).find(index => !edges[index].used);
        if (next == null) {
          loop.push(end);
          break;
        }
        j = next;
      }
      if (loop.length >= 3) result.push(loop);
    }
    return result;
  }

  function pathFor(w, sourceLoops, d, wave, salt) {
    const path = new Path2D();
    for (const loop of sourceLoops) {
      const points = loop.map(([x, y], i) => {
        const [sx, sy] = cornerToScreen(w, x, y, d);
        const wobble = (hash01(x, y, salt + i * 3) - .5) * wave / d;
        const wobbleY = (hash01(x, y, salt + 97 + i * 5) - .5) * wave * .56 / d;
        return [sx + wobble, sy + wobbleY];
      });
      if (points.length < 3) continue;
      const firstMid = [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2];
      path.moveTo(...firstMid);
      for (let i = 1; i <= points.length; i++) {
        const a = points[i % points.length], b = points[(i + 1) % points.length];
        path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      }
      path.closePath();
    }
    return path;
  }

  function region(ctx, w, name, color, d, alpha = 1) {
    const mask = w.biomes.map((row, y) => row.map((value, x) => !!w.land[y][x] && value === name));
    const regionLoops = loops(mask);
    if (!regionLoops.length) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill(pathFor(w, regionLoops, d, 7, 101 + name.length * 17), 'evenodd');
    ctx.restore();
  }

  function riverPath(ctx, points) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    ctx.lineTo(...points[points.length - 1]);
  }

  function terrain(sim, d = 1) {
    const w = sim.w;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w.mapWidth / d));
    canvas.height = Math.max(1, Math.round(w.mapHeight / d));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#2f7898';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = .18;
    for (let y = 24; y < canvas.height; y += 48) {
      ctx.fillStyle = (Math.floor(y / 48) % 2) ? '#4e9fba' : '#3e8eaa';
      ctx.fillRect(0, y, canvas.width, Math.max(1, Math.round(2 / d)));
    }
    ctx.globalAlpha = 1;

    // Stronger contour wobble is intentional: it prevents long perfectly straight
    // isometric shore segments even when several edge cells line up.
    const coastPath = pathFor(w, loops(w.land), d, 18, 31);
    ctx.fillStyle = '#6e9a48';
    ctx.fill(coastPath, 'evenodd');
    ctx.strokeStyle = '#c6a85d';
    ctx.lineWidth = Math.max(2, 9 / d);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(coastPath);
    ctx.strokeStyle = '#789a4f';
    ctx.lineWidth = Math.max(1, 3 / d);
    ctx.stroke(coastPath);

    region(ctx, w, 'forest', '#527c3d', d, .90);
    region(ctx, w, 'desert', '#c9a55b', d);
    region(ctx, w, 'tundra', '#87977f', d);
    region(ctx, w, 'mountain', '#777d79', d);
    region(ctx, w, 'ice_coast', '#bac8c3', d);
    region(ctx, w, 'beach', '#cfb56b', d);

    for (const river of w.rivers || []) {
      if (!river?.length || river.length < 2) continue;
      const points = river.map(([x, y]) => cellToScreen(w, x, y, d));
      riverPath(ctx, points);
      ctx.strokeStyle = '#23617e';
      ctx.lineWidth = Math.max(2, 8 / d);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      riverPath(ctx, points);
      ctx.strokeStyle = '#2f7898';
      ctx.lineWidth = Math.max(1, 5.5 / d);
      ctx.stroke();
      riverPath(ctx, points);
      ctx.strokeStyle = '#8bc5d2';
      ctx.lineWidth = Math.max(1, 1.4 / d);
      ctx.stroke();

      const last = points[points.length - 1];
      ctx.save();
      ctx.globalAlpha = .92;
      ctx.beginPath();
      ctx.arc(last[0], last[1], Math.max(6, 16 / d), 0, Math.PI * 2);
      ctx.fillStyle = '#2f7898';
      ctx.fill();
      ctx.globalAlpha = .48;
      ctx.beginPath();
      ctx.arc(last[0], last[1], Math.max(3, 8 / d), 0, Math.PI * 2);
      ctx.fillStyle = '#8bc5d2';
      ctx.fill();
      ctx.restore();
    }

    return canvas;
  }

  function replace(sim) {
    const r = sim.r;
    if (r?.root?.children?.length && window.PIXI) {
      const sprite = r.root.children[0];
      const d = Number(window.__V705_WORLD_SCALE || 1) > 1 ? Number(window.__V705_WORLD_SCALE) : 1;
      const canvas = terrain(sim, d);
      const texture = window.PIXI.Texture.from(canvas);
      if (texture?.source) texture.source.scaleMode = 'nearest';
      sprite.texture = texture;
      sprite.scale.set(d);
      r.__v706TerrainCanvas = canvas;
      r.__v712TerrainCanvas = canvas;
      r.home?.();
      return true;
    }
    if (r?.map) {
      r.map = terrain(sim, 1);
      r.__v706TerrainCanvas = r.map;
      r.__v712TerrainCanvas = r.map;
      r.home?.();
      return true;
    }
    return false;
  }

  async function install() {
    for (let i = 0; i < 1600; i++) {
      if (window.__SIM?.r && window.__V706_WORLD_POLISH?.installed) break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r) throw new Error('latest world renderer unavailable');
    reshape(sim);
    state.terrain = replace(sim);
    sim.r.redrawTerritories?.(sim);
    state.installed = true;
    document.documentElement.dataset.latestWorld = VERSION;
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error));
    console.error('[latest-world-shape]', error);
  });
})();