(() => {
  'use strict';

  const VERSION = 'large-water-world-1';
  const GRID_W = 88, GRID_H = 64;
  const TILE_W = 40, TILE_H = 20;
  const ORIGIN_X = 1820, ORIGIN_Y = 110;
  const MAP_W = 4000, MAP_H = 1900;
  const SEED = 260812;
  let worldCache = null, vegetationCache = null, mapCanvas = null;

  const cellKey = (x, y) => `${x},${y}`;
  const hash = (x, y, seed = SEED) => {
    let h = Math.imul((x + 101) ^ seed, 374761393) + Math.imul((y + 313) ^ (seed >>> 1), 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = t => t * t * (3 - 2 * t);
  const noise = (x, y, scale, seed) => {
    const fx = x / scale, fy = y / scale;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
    const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
    const ab = a + (b - a) * tx, cd = c + (d - c) * tx;
    return (ab + (cd - ab) * ty) * 2 - 1;
  };
  const gauss = (u, v, cx, cy, sx, sy, amp) => amp * Math.exp(-(((u - cx) / sx) ** 2 + ((v - cy) / sy) ** 2));
  const iso = (x, y) => [ORIGIN_X + (x - y) * TILE_W / 2, ORIGIN_Y + (x + y) * TILE_H / 2];

  function buildLand() {
    const land = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(0));
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const u = (x / (GRID_W - 1) - .5) * 2, v = (y / (GRID_H - 1) - .5) * 2;
      let shape = .94 - (u / 1.01) ** 2 - (v / .84) ** 2;
      shape += gauss(u, v, -.70, -.05, .38, .42, .46) + gauss(u, v, .70, -.12, .35, .36, .42);
      shape += gauss(u, v, -.10, .66, .42, .31, .26) + gauss(u, v, .20, -.68, .34, .27, .23);
      shape -= gauss(u, v, -.52, -.50, .22, .22, .33) + gauss(u, v, .48, .48, .24, .20, .35) + gauss(u, v, .02, .80, .27, .16, .25);
      shape += noise(x, y, 10, SEED + 1) * .18 + noise(x, y, 5, SEED + 2) * .07 + noise(x, y, 2.6, SEED + 3) * .018;
      land[y][x] = shape > .045 ? 1 : 0;
    }
    const islands = [[9, 10, 3, 2], [79, 12, 3, 2], [78, 56, 3, 2], [15, 56, 3, 2]];
    for (const [cx, cy, rx, ry] of islands) {
      for (let y = Math.max(1, cy - ry - 1); y <= Math.min(GRID_H - 2, cy + ry + 1); y++) {
        for (let x = Math.max(1, cx - rx - 1); x <= Math.min(GRID_W - 2, cx + rx + 1); x++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry;
          if (dx * dx + dy * dy <= 1 && land[y][x] === 0) land[y][x] = 1;
        }
      }
    }
    return land;
  }

  function coastDistance(land) {
    const out = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(999));
    const q = [];
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (!land[y][x]) { out[y][x] = 0; q.push([x, y]); }
    let head = 0;
    while (head < q.length) {
      const [x, y] = q[head++], next = out[y][x] + 1;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H || out[ny][nx] <= next) continue;
        out[ny][nx] = next; q.push([nx, ny]);
      }
    }
    return out;
  }

  function chooseLakes(land, coast, biomes) {
    const candidates = [];
    for (let y = 6; y < GRID_H - 6; y++) for (let x = 6; x < GRID_W - 6; x++) {
      if (!land[y][x] || coast[y][x] < 7 || !['grass','forest'].includes(biomes[y][x])) continue;
      candidates.push([coast[y][x] + hash(x, y, SEED + 20) * 2, x, y]);
    }
    candidates.sort((a, b) => b[0] - a[0]);
    const centers = [];
    for (const [, x, y] of candidates) {
      if (centers.every(([cx, cy]) => Math.hypot(x - cx, y - cy) > 15)) centers.push([x, y]);
      if (centers.length >= 5) break;
    }
    const cells = new Set();
    centers.forEach(([cx, cy], i) => {
      const rx = 2.1 + (i % 2) * .55, ry = 1.55 + ((i + 1) % 2) * .4;
      for (let y = Math.max(1, Math.floor(cy - 4)); y <= Math.min(GRID_H - 2, Math.ceil(cy + 4)); y++) {
        for (let x = Math.max(1, Math.floor(cx - 4)); x <= Math.min(GRID_W - 2, Math.ceil(cx + 4)); x++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry;
          if (dx * dx + dy * dy < .98 + hash(x, y, SEED + i) * .05 && land[y][x] && coast[y][x] >= 4) cells.add(cellKey(x, y));
        }
      }
    });
    return { centers, cells };
  }

  function buildWorld() {
    if (worldCache) return worldCache;
    const land = buildLand(), coast = coastDistance(land);
    const biomes = Array.from({ length: GRID_H }, () => Array(GRID_W).fill('ocean'));
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      if (!land[y][x]) continue;
      const yy = y / (GRID_H - 1), xx = x / (GRID_W - 1);
      const ridge1 = 16 + .18 * x + 3 * Math.sin(x / 8.2), ridge2 = 44 - .18 * x + 2.5 * Math.sin(x / 6.8 + 1.3);
      const rough = noise(x, y, 7, SEED + 8), moisture = noise(x, y, 9, SEED + 9);
      const mountain = coast[y][x] >= 4 && rough > .02 && (Math.abs(y - ridge1) < 1.35 || (x < 39 && Math.abs(y - ridge2) < 1.0));
      const north = yy < .15 && coast[y][x] >= 2 && noise(x, y, 5, SEED + 10) > -.25;
      const desert = (xx > .62 && yy > .42 && moisture < .85) || (xx > .77 && yy > .30);
      biomes[y][x] = coast[y][x] === 1 ? 'beach' : mountain ? 'mountain' : north ? 'tundra' : desert ? 'desert' : moisture > .04 ? 'forest' : 'grass';
    }

    const lakeData = chooseLakes(land, coast, biomes);
    for (const token of lakeData.cells) { const [x, y] = token.split(',').map(Number); biomes[y][x] = 'lake'; }

    const starts = [], candidates = [];
    for (let y = 3; y < GRID_H - 3; y++) for (let x = 3; x < GRID_W - 3; x++) {
      if (land[y][x] && coast[y][x] >= 9 && ['mountain','forest'].includes(biomes[y][x])) candidates.push([coast[y][x] + hash(x,y,SEED+44)*3,x,y]);
    }
    candidates.sort((a,b) => b[0]-a[0]);
    for (const [,x,y] of candidates) { if (starts.every(([a,b]) => Math.hypot(x-a,y-b)>12)) starts.push([x,y]); if (starts.length>=6) break; }

    const rivers = [];
    const lakeDist = (x, y) => {
      let best = 999;
      for (const token of lakeData.cells) { const [a,b]=token.split(',').map(Number); best=Math.min(best,Math.abs(x-a)+Math.abs(y-b)); }
      return best;
    };
    starts.forEach(([sx,sy], ri) => {
      let x=sx,y=sy; const path=[[x,y]], seen=new Set([cellKey(x,y)]);
      for (let step=0; step<100; step++) {
        if (coast[y][x] <= 1 || lakeData.cells.has(cellKey(x,y))) break;
        const opts=[];
        for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx=x+dx,ny=y+dy,k=cellKey(nx,ny);
          if(nx<0||ny<0||nx>=GRID_W||ny>=GRID_H||!land[ny][nx]||seen.has(k)) continue;
          const score = ri % 3 === 0 ? lakeDist(nx,ny)*.55 + coast[ny][nx]*.10 + hash(nx,ny,SEED+ri)*1.1 : coast[ny][nx] + hash(nx,ny,SEED+ri)*1.2;
          opts.push([score,nx,ny]);
        }
        if(!opts.length) break; opts.sort((a,b)=>a[0]-b[0]); [,x,y]=opts[0]; seen.add(cellKey(x,y)); path.push([x,y]);
      }
      if(path.length>=8) rivers.push(path);
    });
    const riverSet = new Set(rivers.flat().map(([x,y])=>cellKey(x,y)));
    for(const token of riverSet){ if(lakeData.cells.has(token)) continue; const [x,y]=token.split(',').map(Number); biomes[y][x]='river'; }

    const resources=[];
    for(let y=0;y<GRID_H;y++) for(let x=0;x<GRID_W;x++){
      if(!land[y][x]||lakeData.cells.has(cellKey(x,y))||riverSet.has(cellKey(x,y))||coast[y][x]<2) continue;
      const b=biomes[y][x],p=hash(x,y,SEED+70);
      if(b==='forest'&&p<.12) resources.push([x,y,'wood']); else if(b==='mountain'&&p<.24) resources.push([x,y,'stone']);
      else if(b==='grass'&&p<.035) resources.push([x,y,'food']); else if(b==='desert'&&p<.022) resources.push([x,y,'gold']);
    }

    worldCache={gridW:GRID_W,gridH:GRID_H,tileW:TILE_W,tileH:TILE_H,originX:ORIGIN_X,originY:ORIGIN_Y,mapWidth:MAP_W,mapHeight:MAP_H,land,biomes,coastDistance:coast,resources,rivers,lakes:[...lakeData.cells].map(s=>s.split(',').map(Number)),seed:SEED,version:VERSION};
    document.documentElement.dataset.worldMap = `${GRID_W}x${GRID_H}:${VERSION}`;
    return worldCache;
  }

  function buildVegetation() {
    if (vegetationCache) return vegetationCache;
    const world=buildWorld(),trees=[]; let id=0;
    for(let y=0;y<GRID_H;y++) for(let x=0;x<GRID_W;x++){
      const b=world.biomes[y][x]; if(!['forest','grass','tundra'].includes(b)) continue;
      const chance=b==='forest'?.76:b==='tundra'?.24:.10; if(hash(x,y,SEED+100)>chance) continue;
      let count=1; if(b==='forest'&&hash(x,y,SEED+101)<.52) count++; if(b==='forest'&&hash(x,y,SEED+102)<.22) count++;
      const [cx,cy]=iso(x,y);
      for(let i=0;i<count;i++){
        const h=hash(x+i*7,y+i*11,SEED+103),type=b==='tundra'?'pine-snow':h<.55?'pine':'round';
        trees.push({id:id++,type,x:Math.round(cx+(hash(x,y,SEED+110+i)*26-13)),y:Math.round(cy+(hash(x,y,SEED+120+i)*10-3)),cell:[x,y]});
      }
    }
    vegetationCache={version:'single-tree-large-water-1',trees}; return vegetationCache;
  }

  function renderMap() {
    if (mapCanvas) return mapCanvas;
    const w=buildWorld(),canvas=document.createElement('canvas'); canvas.width=MAP_W; canvas.height=MAP_H;
    const c=canvas.getContext('2d'); c.imageSmoothingEnabled=false;
    c.fillStyle='#18476b'; c.fillRect(0,0,MAP_W,MAP_H);
    for(let i=0;i<1250;i++){
      const x=Math.floor(hash(i,1,SEED+200)*MAP_W),y=Math.floor(hash(i,2,SEED+201)*MAP_H),len=3+Math.floor(hash(i,3,SEED+202)*9);
      c.fillStyle=i%3===0?'#2f7195':i%3===1?'#28648a':'#245a80'; c.fillRect(x,y,len,1);
    }
    const colors={grass:'#76b650',forest:'#5d9d47',beach:'#d6c184',desert:'#dbbd7d',tundra:'#c2d4bd',mountain:'#809181',river:'#3789a8',lake:'#3080a6'};
    const diamond=(cx,cy)=>{c.beginPath();c.moveTo(cx,cy-TILE_H/2);c.lineTo(cx+TILE_W/2,cy);c.lineTo(cx,cy+TILE_H/2);c.lineTo(cx-TILE_W/2,cy);c.closePath();};
    for(let depth=0;depth<GRID_W+GRID_H-1;depth++) for(let y=0;y<GRID_H;y++){
      const x=depth-y;if(x<0||x>=GRID_W||!w.land[y][x])continue; const [cx,cy]=iso(x,y),b=w.biomes[y][x];
      c.fillStyle=colors[b]||colors.grass;diamond(cx,cy);c.fill();
      if(b==='lake'||b==='river'){c.fillStyle='#63aac2';c.fillRect(cx-9,cy,17,1);}
      else if(b==='mountain'){c.fillStyle='#5f6d67';c.beginPath();c.moveTo(cx-7,cy+3);c.lineTo(cx,cy-12);c.lineTo(cx+8,cy+3);c.closePath();c.fill();c.fillStyle='#dfe5dc';c.beginPath();c.moveTo(cx,cy-12);c.lineTo(cx-3,cy-5);c.lineTo(cx+3,cy-5);c.closePath();c.fill();}
      else if((b==='grass'||b==='forest')&&hash(x,y,SEED+300)<.42){c.fillStyle='#4d8a3f';c.fillRect(cx-5+Math.floor(hash(x,y,SEED+301)*10),cy-2,1,1);}
    }
    mapCanvas=canvas; return canvas;
  }

  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    if(/assets\/map\/world\.json(?:[?#]|$)/.test(url)) return Promise.resolve(new Response(JSON.stringify(buildWorld()),{status:200,headers:{'Content-Type':'application/json'}}));
    if(/assets\/map\/vegetation\.json(?:[?#]|$)/.test(url)) return Promise.resolve(new Response(JSON.stringify(buildVegetation()),{status:200,headers:{'Content-Type':'application/json'}}));
    return nativeFetch(input,init);
  };

  const P=window.PIXI;
  if(P?.Assets?.load&&!P.Assets.__gwWorldBootstrap){
    P.Assets.__gwWorldBootstrap=true;
    const nativeLoad=P.Assets.load.bind(P.Assets);
    P.Assets.load=async function(src,...args){
      if(typeof src==='string'&&/assets\/map\/world\.png(?:[?#]|$)/.test(src)) return P.Texture.from(renderMap());
      return nativeLoad(src,...args);
    };
  }

  window.__GW_WORLD_BOOTSTRAP={version:VERSION,getWorld:buildWorld,getVegetation:buildVegetation};
})();
