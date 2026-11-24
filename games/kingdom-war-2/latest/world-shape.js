(() => {
  'use strict';

  const VERSION = '20261124-world-atlas-1';
  if (window.__GOD_WORLD_LATEST_SHAPE?.installed) return;

  const state = window.__GOD_WORLD_LATEST_SHAPE = {
    installed: false,
    version: VERSION,
    rounded: false,
    coastSculpted: false,
    coastAdded: 0,
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

  // Four erosion passes carve bays into the original land mass.
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

  function neighbourBiome(land, biomes, x, y) {
    const count = new Map();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || !landAt(land, x + dx, y + dy)) continue;
        const b = biomes[y + dy]?.[x + dx];
        if (!b || b === 'ocean' || b === 'beach') continue;
        count.set(b, (count.get(b) || 0) + 1);
      }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'grass';
  }

  // Add real connected land outside selected coast runs. These are not decorative
  // pixels: they become part of w.land, so the silhouette gains actual coves and
  // promontories instead of only visually wobbling a straight isometric edge.
  function growCoastalTerrain(land, biomes) {
    let added = 0;
    const h = land.length, w = land[0]?.length || 0;
    const orthDirs = [[1,0],[-1,0],[0,1],[0,-1]];
    const diagDirs = [[1,1],[-1,-1],[1,-1],[-1,1]];

    for (let pass = 0; pass < 2; pass++) {
      const additions = [];
      for (let y = 3; y < h - 3; y++) {
        for (let x = 3; x < w - 3; x++) {
          if (land[y][x]) continue;
          let orth = 0, diag = 0;
          for (const [dx,dy] of orthDirs) if (landAt(land,x+dx,y+dy)) orth++;
          for (const [dx,dy] of diagDirs) if (landAt(land,x+dx,y+dy)) diag++;
          if (orth < 1 || orth + diag < 3) continue;

          const along =
            Math.sin(x * .43 + y * .17 + pass * 1.37) * .17 +
            Math.cos(y * .39 - x * .11 - pass * .73) * .12 +
            Math.sin((x - y) * .27 + pass * .4) * .08;
          const rnd = hash01(x, y, 3301 + pass * 131);
          const straightRunCandidate = orth === 1 && diag >= 2;
          const supportedCorner = orth >= 2 && diag >= 1;
          const threshold = straightRunCandidate ? .78 + pass * .10 : .91 + pass * .08;
          if ((straightRunCandidate || supportedCorner) && rnd + along > threshold) {
            additions.push([x, y, neighbourBiome(land, biomes, x, y)]);
          }
        }
      }
      for (const [x,y,biome] of additions) {
        if (land[y][x]) continue;
        land[y][x] = 1;
        biomes[y][x] = biome;
        added++;
      }
    }
    return added;
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
    const w=sim.w,W=w.gridW,H=w.gridH;
    const land=Array.from({length:H},()=>Array(W).fill(0));
    const biomes=Array.from({length:H},()=>Array(W).fill('ocean'));
    const span=(W+H-2)/2;
    const uv=(x,y)=>[(x-y-(W-H)/2)/span,(x+y-(W+H-2)/2)/span];
    const ellipse=(u,v,cx,cy,rx,ry)=>1-Math.hypot((u-cx)/rx,(v-cy)/ry);
    // A fantasy world atlas: three great land masses linked by broad natural
    // isthmuses. Islands remain wilderness, not unreachable player capitals.
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
      const [u,v]=uv(x,y);
      const noise=.055*Math.sin(u*23+v*12)+.035*Math.cos(v*31-u*7)+.023*Math.sin(u*51-v*22);
      const continental=Math.max(
        ellipse(u,v,-.37,-.04,.39,.43),
        ellipse(u,v,.30,-.11,.43,.43),
        ellipse(u,v,.10,.39,.34,.38),
        ellipse(u,v,-.02,.06,.32,.19),
        ellipse(u,v,.24,.17,.17,.25));
      const islands=Math.max(ellipse(u,v,-.62,.22,.075,.12),ellipse(u,v,-.39,.47,.07,.09),ellipse(u,v,.56,.31,.08,.11),ellipse(u,v,.06,-.61,.09,.07),ellipse(u,v,.34,-.60,.045,.075),ellipse(u,v,-.13,.65,.065,.07));
      if(Math.max(continental,islands)+noise<0)continue;
      land[y][x]=1;
      const n=Math.sin(u*15+v*9)*.45+Math.cos(v*19-u*7)*.34+Math.sin(u*31+v*29)*.21;
      const ridge=Math.abs(v-(-.28+.09*Math.sin(u*10)));
      if(v<-.29&&ridge<.045&&n>.10)biomes[y][x]='mountain';
      else if(v<-.38)biomes[y][x]='tundra';
      else if(v>.17&&u>.20&&n>-.33)biomes[y][x]='desert';
      else if(n>.27)biomes[y][x]='forest';
      else biomes[y][x]='grass';
    }
    w.land=land;w.biomes=biomes;
    const coast=recomputeCoast(w);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(land[y][x]&&coast[y][x]<=1)biomes[y][x]=vCold(x,y)?'ice_coast':'beach';
    function vCold(x,y){return uv(x,y)[1]<-.44;}
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    const rivers=[],used=new Set();
    // Short meandering rivers grow inland from separate coasts. They do not
    // form artificial water barriers across whole continents.
    const outlets=[];
    for(let y=3;y<H-3;y++)for(let x=3;x<W-3;x++){
      if(coast[y][x]!==1||biomes[y][x]==='ice_coast')continue;
      const [u,v]=uv(x,y);
      if(v<-.30||Math.abs(u)<.13)continue;
      outlets.push([x,y]);
    }
    outlets.sort((a,b)=>hash01(...a,77)-hash01(...b,77));
    for(const start of outlets){
      if(rivers.length>=5)break;
      if(rivers.some(r=>Math.hypot(r[0][0]-start[0],r[0][1]-start[1])<14))continue;
      const path=[start],seen=new Set([key(...start)]);
      for(let i=0;i<10;i++){
        const [x,y]=path[path.length-1];
        const options=dirs.map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>inBounds(w,a,b)&&land[b][a]&&!seen.has(key(a,b))&&!used.has(key(a,b))&&coast[b][a]>=coast[y][x]);
        options.sort((a,b)=>(coast[b[1]][b[0]]+hash01(...b,17)*.8)-(coast[a[1]][a[0]]+hash01(...a,17)*.8));
        if(!options.length)break;
        const p=options[0];seen.add(key(...p));path.push(p);
        if(coast[p[1]][p[0]]>=8)break;
      }
      if(path.length>=5){for(const p of path)used.add(key(...p));rivers.push(path.reverse());}
    }
    w.rivers=rivers;
    w.resources=[];
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
      if(!land[y][x]||used.has(key(x,y)))continue;
      if(hash01(x,y,321)<.055){
        const b=biomes[y][x];w.resources.push([x,y,b==='forest'?'wood':b==='mountain'?'stone':b==='desert'?'gold':'food']);
      }
    }
    if(sim.riverSet instanceof Set){sim.riverSet.clear();for(const p of used)sim.riverSet.add(p);}
    sim.__v712RoundedWorld=true;state.rounded=true;state.coastSculpted=true;
    state.atlas=true;state.islands=true;state.rivers=rivers.length;
    return true;
  }
  window.__KW2_WORLD_ATLAS={reshape,version:'20261124-world-atlas-1'};

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

    const sea=ctx.createLinearGradient(0,0,0,canvas.height);
    sea.addColorStop(0,'#255b79');sea.addColorStop(.48,'#306d8b');sea.addColorStop(1,'#194965');ctx.fillStyle=sea;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = .18;
    for (let y = 24; y < canvas.height; y += 48) {
      ctx.fillStyle = (Math.floor(y / 48) % 2) ? '#4e9fba' : '#3e8eaa';
      ctx.fillRect(0, y, canvas.width, Math.max(1, Math.round(2 / d)));
    }
    ctx.globalAlpha = 1;

    const coastPath = pathFor(w, loops(w.land), d, 18, 31);
    ctx.strokeStyle='#4a96a5';ctx.lineWidth=48/d;ctx.stroke(coastPath);
    ctx.strokeStyle='#73b1ac';ctx.lineWidth=23/d;ctx.stroke(coastPath);
    ctx.fillStyle = '#789e51';
    ctx.fill(coastPath, 'evenodd');
    ctx.strokeStyle = '#c6a85d';
    ctx.lineWidth = Math.max(2, 9 / d);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(coastPath);
    ctx.strokeStyle = '#789a4f';
    ctx.lineWidth = Math.max(1, 3 / d);
    ctx.stroke(coastPath);

    region(ctx, w, 'forest', '#416b40', d, .95);
    region(ctx, w, 'desert', '#c9a55b', d);
    region(ctx, w, 'tundra', '#b7c3b4', d);
    region(ctx, w, 'mountain', '#777d79', d);
    region(ctx, w, 'ice_coast', '#bac8c3', d);
    region(ctx, w, 'beach', '#cfb56b', d);

    // Bake small ground details once: no new animated sprites or GPU draw calls.
    for(let y=1;y<w.gridH-1;y++)for(let x=1;x<w.gridW-1;x++){
      const [sx,sy]=cellToScreen(w,x,y,d),b=w.biomes[y][x],n=hash01(x,y,81);
      if(!w.land[y][x]){
        if(n<.10){ctx.fillStyle='#b4d4d1';ctx.globalAlpha=.19;ctx.fillRect(sx-5/d,sy,10/d,1.3/d);ctx.globalAlpha=1;}
        continue;
      }
      if(w.coastDistance[y][x]<2)continue;
      if(b==='mountain'){
        const h=(15+n*13)/d,hw=(10+n*5)/d;
        ctx.beginPath();ctx.moveTo(sx-hw,sy+4/d);ctx.lineTo(sx,sy-h);ctx.lineTo(sx+hw,sy+4/d);ctx.closePath();ctx.fillStyle='#687b79';ctx.fill();
        ctx.beginPath();ctx.moveTo(sx,sy-h);ctx.lineTo(sx+hw,sy+4/d);ctx.lineTo(sx,sy+2/d);ctx.closePath();ctx.fillStyle='#465d61';ctx.fill();
        ctx.beginPath();ctx.moveTo(sx,sy-h);ctx.lineTo(sx-hw*.38,sy-h*.42);ctx.lineTo(sx,sy-h*.58);ctx.lineTo(sx+hw*.35,sy-h*.40);ctx.closePath();ctx.fillStyle='#dce0d1';ctx.fill();
      }else if(n<.62){
        ctx.globalAlpha=.13;ctx.fillStyle=n<.3?'#294b2a':'#ebdda1';
        ctx.fillRect(sx+(n-.5)*14/d,sy-2/d,Math.max(1,3/d),Math.max(1,1.5/d));ctx.globalAlpha=1;
      }
    }
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