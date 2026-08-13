(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const key = (x, y) => `${x},${y}`;

  const COLORS = [0x27a7ff, 0xff594f, 0xffc928, 0x58d26f, 0xb66cff, 0xff8a34, 0x23d6c1, 0xf45da2, 0x9dcf3e, 0x5c77ff, 0xd99c42, 0xe4e4e4];
  const COLORCSS = COLORS.map(c => '#' + c.toString(16).padStart(6, '0'));
  const NAMES = ['Greenvale', 'Highrock', 'Brightwood', 'Moonstone', 'Riverhold', 'Goldfield', 'Bluepeak', 'Royal Oak'];
  const MAX_VISIBLE_FARMERS = 24;
  const FARMER_WORLD_HEIGHT = 18;
  const CAMERA_MIN = .30, CAMERA_MAX = 2.45;

  const BUILD_HEIGHT = {
    castle: 92,
    keep: 76,
    gate: 60,
    wall: 44,
    wall_corner: 46,
    stone_tower: 56,
    watchtower: 59,
    house_a: 43,
    house_b: 43,
    house_c: 41,
    barracks: 48,
    forge: 47,
    stable: 28,
    farm: 32,
    windmill: 55,
    silo: 48,
    church: 51,
    market: 47,
    warehouse: 47
  };
  const BUILD_Y_OFFSET = { stable: 2, farm: 3, market: 1, warehouse: 1, barracks: 1, forge: 1 };
  const BUILD_ANCHOR_Y = { castle: .97, keep: .96, farm: .91, stable: .92, house_a: .94, house_b: .94, house_c: .94, market: .94, warehouse: .94, barracks: .95, forge: .94 };
  const BUILD_BASE = { castle: [29, 9], keep: [25, 8], farm: [25, 8], stable: [20, 7], house_a: [17, 6], house_b: [17, 6], house_c: [17, 6], market: [19, 6], warehouse: [19, 6], barracks: [20, 7], forge: [19, 6] };

  // Ground footprint is deliberately smaller than the artwork: it blocks only the
  // area that visually represents the building base, leaving real streets around it.
  const BUILD_FOOTPRINT = {
    castle: 1, keep: 1, gate: 0, wall: 0, wall_corner: 0, stone_tower: 0, watchtower: 0,
    house_a: 0, house_b: 0, house_c: 0, barracks: 0, forge: 0, stable: 0, farm: 0,
    windmill: 0, silo: 0, church: 0, market: 0, warehouse: 0
  };
  const BUILD_MIN_SEP = { castle: 0, farm: 2.0, house_a: 2.15, house_b: 2.15, house_c: 2.15, stable: 2.35, barracks: 2.35, forge: 2.25, market: 2.3, church: 2.4, windmill: 2.35, warehouse: 2.2, silo: 2.2, watchtower: 2.0, stone_tower: 2.0 };

  const UI = {
    age: $('#age'), fps: $('#fps'), players: $('#players'), rank: $('#rankRows'), bridgeDot: $('#bridgeDot'), bridgeText: $('#bridgeText'), feed: $('#feed'),
    card: $('#kingdomCard'), kColor: $('#kColor'), kName: $('#kName'), food: $('#rFood'), wood: $('#rWood'), stone: $('#rStone'), gold: $('#rGold'), pop: $('#rPop'), terr: $('#rTerr'), power: $('#rPower'), build: $('#rBuild')
  };

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; $('#toast').appendChild(t);
    setTimeout(() => t.remove(), 3300);
  }
  function feed(user, msg) {
    const d = document.createElement('div');
    d.innerHTML = `<b>${escapeHtml(user)}</b> ${escapeHtml(msg)}`;
    UI.feed.appendChild(d);
    while (UI.feed.children.length > 9) UI.feed.firstChild.remove();
  }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function fmt(n) { n = Math.floor(n); return n >= 1000000 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n); }
  function secs(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

  class Simulation {
    constructor(world, renderer) {
      this.w = world;
      this.r = renderer;
      this.kingdoms = [];
      this.kingdomByName = new Map();
      this.owner = new Int16Array(world.gridW * world.gridH).fill(-1);
      this.wars = [];
      this.age = 0;
      this.tickN = 0;
      this.selected = null;
      this.neutral = [];
      this.riverSet = new Set();
      for (const path of (world.rivers || [])) for (const [x, y] of path) this.riverSet.add(key(x, y));
    }

    idx(x, y) { return y * this.w.gridW + x; }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w.gridW && y < this.w.gridH; }
    land(x, y) { return this.inBounds(x, y) && this.w.land[y][x] === 1; }
    biome(x, y) { return this.inBounds(x, y) ? this.w.biomes[y][x] : 'ocean'; }
    isRiver(x, y) { return this.riverSet.has(key(x, y)); }
    neigh(x, y) { return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => this.land(a, b)); }
    getOwner(x, y) { return this.inBounds(x, y) ? this.owner[this.idx(x, y)] : -99; }
    setOwner(x, y, id) { if (this.inBounds(x, y)) this.owner[this.idx(x, y)] = id; }
    iso(x, y) { return [this.w.originX + (x - y) * this.w.tileW / 2, this.w.originY + (x + y) * this.w.tileH / 2]; }
    coastDistance(x, y) { return this.w.coastDistance?.[y]?.[x] ?? 0; }

    isWalkableCell(x, y) {
      if (!this.land(x, y) || this.isRiver(x, y)) return false;
      return !['mountain', 'ice_coast'].includes(this.biome(x, y));
    }

    isBuildableCell(x, y, type = 'house_a') {
      if (!this.land(x, y) || this.isRiver(x, y)) return false;
      const b = this.biome(x, y);
      if (!['grass', 'desert'].includes(b)) return false;
      const minCoast = type === 'castle' ? 4 : 2;
      if (this.coastDistance(x, y) < minCoast) return false;
      if (type === 'farm' && b !== 'grass') return false;
      return this.neigh(x, y).length >= 3;
    }

    buildingAt(x, y) {
      for (const k of this.kingdoms) {
        if (!k.alive) continue;
        for (const b of k.buildings) if (b.x === x && b.y === y) return b;
      }
      return null;
    }

    buildingBlocksCell(b, x, y) {
      const r = BUILD_FOOTPRINT[b.type] || 0;
      return Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) <= r;
    }

    buildingBlockingCell(x, y) {
      for (const k of this.kingdoms) {
        if (!k.alive) continue;
        for (const b of k.buildings) if (this.buildingBlocksCell(b, x, y)) return b;
      }
      return null;
    }

    buildingSpacingOK(k, type, x, y) {
      const minSep = BUILD_MIN_SEP[type] || 2.15;
      for (const b of k.buildings) {
        if (Math.hypot(x - b.x, y - b.y) < minSep) return false;
      }
      return true;
    }

    async init() {
      await this.r.init(this);
      // V4: the world starts completely natural. Civilizations only exist after JOIN.
      this.neutral.length = 0;
      this.r.redrawTerritories(this);
    }

    findSpawnCandidates(n) {
      const pts = [];
      for (let y = 4; y < this.w.gridH - 4; y++) for (let x = 4; x < this.w.gridW - 4; x++) {
        if (!this.isBuildableCell(x, y, 'castle') || this.biome(x, y) !== 'grass') continue;
        if (pts.every(([px, py]) => Math.hypot(px - x, py - y) > 8)) pts.push([x, y]);
        if (pts.length >= n) return pts;
      }
      return pts;
    }

    async spawnNeutral(x, y, name) {
      const [sx, sy] = this.iso(x, y);
      const v = { x, y, name };
      this.neutral.push(v);
      await this.r.addNeutralVillage(v, sx, sy);
    }

    spawnRoom(x, y) {
      let good = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        if (this.isBuildableCell(x + dx, y + dy, dx === 0 && dy === 0 ? 'castle' : 'house_a') && this.getOwner(x + dx, y + dy) === -1) good++;
      }
      return good;
    }

    freeSpawn() {
      let best = null, bestScore = -1e9;
      for (let y = 4; y < this.w.gridH - 4; y++) for (let x = 4; x < this.w.gridW - 4; x++) {
        if (this.getOwner(x, y) !== -1 || !this.isBuildableCell(x, y, 'castle') || this.biome(x, y) !== 'grass') continue;
        if (this.spawnRoom(x, y) < 7) continue;
        let d = 99;
        for (const k of this.kingdoms) if (k.alive) d = Math.min(d, Math.hypot(k.capital[0] - x, k.capital[1] - y));
        for (const v of this.neutral) d = Math.min(d, Math.hypot(v.x - x, v.y - y));
        if (d <= 7) continue;
        const score = d + Math.min(this.coastDistance(x, y), 8) * .24 + this.spawnRoom(x, y) * .2 + Math.random() * 1.5;
        if (score > bestScore) { best = [x, y]; bestScore = score; }
      }
      return best;
    }

    claimInitialArea(k, x, y) {
      const cells = [];
      for (let r = 0; r <= 3; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== r) continue;
          const a = x + dx, b = y + dy;
          if (!this.land(a, b) || this.getOwner(a, b) !== -1) continue;
          cells.push([a, b]);
        }
      }
      for (const [a, b] of cells.slice(0, 13)) {
        this.setOwner(a, b, k.id);
        k.territory.add(key(a, b));
      }
    }

    async join(name) {
      name = String(name || 'Player').trim().slice(0, 18);
      if (!name) return;
      const existing = this.kingdomByName.get(name.toLowerCase());
      if (existing && existing.alive) {
        this.select(existing); this.r.focusCell(...existing.capital); toast(`${name} is already in the world`); return existing;
      }

      const pos = this.freeSpawn();
      if (!pos) { toast('The map is full: JOIN queued for the next world'); return null; }

      const id = this.kingdoms.length, color = COLORS[id % COLORS.length], css = COLORCSS[id % COLORCSS.length];
      const k = {
        id, name, color, css, capital: pos, territory: new Set(),
        resources: { food: 150, wood: 135, stone: 80, gold: 42 },
        pop: 4, popCap: 4, military: 8, buildings: [], farmers: [], alive: true, score: 0,
        followed: false, boostUntil: 0, lastExpand: this.age, lastBuild: this.age, lastPop: this.age, aggressive: null
      };
      this.kingdoms.push(k);
      this.kingdomByName.set(name.toLowerCase(), k);

      const [x, y] = pos;
      this.claimInitialArea(k, x, y);
      await this.r.addKingdom(k, this);
      // V4: JOIN founds ONLY the capital. Every other building must be produced by the economy.
      await this.addBuilding(k, 'castle', x, y, true);
      for (let i = 0; i < Math.min(k.pop, MAX_VISIBLE_FARMERS); i++) await this.spawnFarmer(k);
      this.r.redrawTerritories(this);
      this.select(k);
      this.r.focusCell(x, y);
      toast(`👑 ${name}: capital founded`);
      feed(name, 'JOIN — castle founded');
      this.updateUI();
      return k;
    }

    async addBuilding(k, type, x, y, forceCastle = false, instant = false) {
      if (!forceCastle) {
        if (!this.isBuildableCell(x, y, type) || this.getOwner(x, y) !== k.id || this.buildingAt(x, y)) return null;
      }
      if (window.__TREE_DEPTH_PROMISE) await window.__TREE_DEPTH_PROMISE.catch(() => {});
      await this.r.prepareBuildSite?.(k, x, y, this, forceCastle || instant);
      const [sx, sy] = this.iso(x, y);
      const maxHp = type === 'castle' ? 420 : ['stone_tower','barracks','forge'].includes(type) ? 220 : 150;
      const b = { id: `b${k.id}_${k.buildings.length}`, type, x, y, sx, sy: sy + 6 + (BUILD_Y_OFFSET[type] || 0), owner: k.id, hp: maxHp, maxHp, damageState: 0 };
      k.buildings.push(b);
      for (const f of k.farmers) {
        if (f.path?.some(c => this.buildingBlocksCell(b, c[0], c[1]))) { f.path = []; f.action = 'idle'; f.actionUntil = 0; this.r.setFarmerAction(f, 'idle'); }
      }
      await this.r.addBuilding(k, b);
      if (type === 'farm') await this.spawnFarmWorker(k, b);
      return b;
    }

    visibleFarmerSpawnCell(k) {
      const cells = [...k.territory]
        .map(s => s.split(',').map(Number))
        .filter(([x, y]) => this.isWalkableCell(x, y) && !this.buildingBlockingCell(x, y));
      if (!cells.length) return k.capital;
      let best = cells[0], bestScore = -1e9;
      for (const c of cells) {
        let sep = 99;
        for (const f of k.farmers) sep = Math.min(sep, Math.hypot(c[0] - f.cell[0], c[1] - f.cell[1]));
        const score = sep + Math.random() * 1.8;
        if (score > bestScore) { best = c; bestScore = score; }
      }
      return best;
    }

    async spawnFarmer(k) {
      if (k.farmers.filter(f => !f.fixedBuilding).length >= MAX_VISIBLE_FARMERS) return null;
      const cell = this.visibleFarmerSpawnCell(k);
      const [sx, sy] = this.iso(...cell);
      const f = {
        id: `f${k.id}_${k._farmerSeq = (k._farmerSeq || 0) + 1}`, cell: [...cell], x: sx, y: sy + 6,
        action: 'idle', actionUntil: 0, speed: rand(18, 25), job: pick(['farm', 'wood', 'stone', 'builder']),
        path: [], taskCell: null, phase: Math.random() * 10
      };
      k.farmers.push(f);
      await this.r.addFarmer(k, f);
      return f;
    }

    async spawnFarmWorker(k, building) {
      if (k.farmers.some(f => f.fixedBuilding === building.id)) return null;
      let f = k.farmers
        .filter(worker => !worker.fixedBuilding)
        .sort((a, b) => Math.hypot(a.cell[0] - building.x, a.cell[1] - building.y) - Math.hypot(b.cell[0] - building.x, b.cell[1] - building.y))[0];
      if (!f) return null;
      const [sx, sy] = this.iso(building.x, building.y);
      f.cell = [building.x, building.y]; f.x = sx - 10; f.y = sy + 12;
      f.action = 'harvest'; f.actionUntil = Number.POSITIVE_INFINITY; f.speed = 0;
      f.job = 'farm_fixed'; f.fixedBuilding = building.id; f.path = []; f.taskCell = [building.x, building.y];
      this.r.setFarmerAction(f, 'harvest');
      this.r.updateFarmer(f, 0, 1);
      return f;
    }

    releaseFarmWorker(k, buildingId) {
      const f = k.farmers.find(worker => worker.fixedBuilding === buildingId);
      if (!f) return null;
      f.fixedBuilding = null; f.job = pick(['farm', 'wood', 'stone', 'builder']);
      f.speed = rand(18, 25); f.action = 'idle'; f.actionUntil = 0; f.path = []; f.taskCell = null;
      this.r.setFarmerAction(f, 'idle');
      return f;
    }

    async syncCitizens(k) {
      const target = Math.min(k.pop, MAX_VISIBLE_FARMERS);
      while (k.farmers.length < target) await this.spawnFarmer(k);
      while (k.farmers.length > target) {
        let index = -1;
        for (let i = k.farmers.length - 1; i >= 0; i--) if (!k.farmers[i].fixedBuilding) { index = i; break; }
        if (index < 0) break;
        const [removed] = k.farmers.splice(index, 1);
        this.r.removeFarmer?.(removed);
      }
    }

    select(k) { this.selected = k; UI.card.classList.toggle('hidden', !k); this.updateSelected(); this.r.selectKingdom?.(k); }
    updateSelected() {
      const k = this.selected;
      if (!k || !k.alive) { UI.card.classList.add('hidden'); return; }
      UI.card.classList.toggle('hidden', !this.r.isKingdomDetailVisible?.(k));
      UI.kColor.style.background = k.css; UI.kName.textContent = k.name;
      UI.food.textContent = fmt(k.resources.food); UI.wood.textContent = fmt(k.resources.wood); UI.stone.textContent = fmt(k.resources.stone); UI.gold.textContent = fmt(k.resources.gold);
      UI.pop.textContent = k.pop; UI.terr.textContent = k.territory.size; UI.power.textContent = Math.floor(this.power(k)); UI.build.textContent = k.buildings.length;
    }
    power(k) { return k.pop * 2.2 + k.military * 1.4 + k.territory.size * 2.5 + k.buildings.length * 6 + k.resources.gold * .025; }

    async tick() {
      this.age++; this.tickN++;
      for (const k of this.kingdoms) {
        if (!k.alive) continue;
        this.economy(k);
        await this.population(k);
        await this.buildAI(k);
        this.expandAI(k);
        this.farmerAI(k);
      }
      this.warAI();
      this.resolveWars();
      if (this.tickN % 2 === 0) this.r.redrawTerritories(this);
      this.updateUI();
    }

    economy(k) {
      const mult = this.age < k.boostUntil ? 1.8 : 1;
      const counts = {};
      for (const b of k.buildings) counts[b.type] = (counts[b.type] || 0) + 1;
      const biomeCounts = {};
      for (const s of k.territory) {
        const [x, y] = s.split(',').map(Number), b = this.w.biomes[y][x];
        biomeCounts[b] = (biomeCounts[b] || 0) + 1;
      }
      k.resources.food += (k.pop * .32 + (counts.farm || 0) * 2.3 + (counts.windmill || 0) * 1.7 + (biomeCounts.grass || 0) * .045 + (biomeCounts.beach || 0) * .018) * mult;
      k.resources.wood += (k.pop * .19 + (biomeCounts.forest || 0) * .34) * mult;
      k.resources.stone += (k.pop * .09 + (biomeCounts.mountain || 0) * .48 + (counts.stone_tower || 0) * .2) * mult;
      k.resources.gold += (k.pop * .055 + (counts.market || 0) * .75 + (counts.warehouse || 0) * .18 + (biomeCounts.desert || 0) * .035) * mult;
      k.resources.food -= k.pop * .11;
      k.military += .08 + (counts.barracks || 0) * .25 + (counts.forge || 0) * .18;
    }

    async population(k) {
      if (this.age - k.lastPop < 5 || k.pop >= k.popCap || k.resources.food < 45) return;
      k.lastPop = this.age; k.resources.food -= 32; k.pop++;
      await this.syncCitizens(k);
    }

    findBuildCell(k, type, initial = false) {
      const cells = [...k.territory]
        .map(s => s.split(',').map(Number))
        .filter(([x, y]) => this.getOwner(x, y) === k.id && this.isBuildableCell(x, y, type) && !this.buildingBlockingCell(x, y) && this.buildingSpacingOK(k, type, x, y) && !k.farmers.some(f => f.cell[0] === x && f.cell[1] === y));
      if (!cells.length) return null;

      const used = k.buildings.map(b => [b.x, b.y]);
      const minSep = initial ? 2.0 : (BUILD_MIN_SEP[type] || 2.15);
      let best = null, bestScore = -1e9;
      for (const [x, y] of cells) {
        let sep = 99;
        for (const [ux, uy] of used) sep = Math.min(sep, Math.hypot(x - ux, y - uy));
        if (sep < minSep) continue;
        const d = Math.hypot(x - k.capital[0], y - k.capital[1]);
        const biome = this.biome(x, y);
        let bonus = 0;
        if (type === 'farm') bonus += biome === 'grass' ? 5 : -10;
        if (['warehouse', 'market', 'church', 'barracks', 'forge'].includes(type)) bonus -= d * .34;
        if (['watchtower', 'stone_tower'].includes(type)) bonus += d * .12;
        const score = bonus - d * .08 + Math.min(sep, 4) * .9 + Math.random() * .7;
        if (score > bestScore) { best = [x, y]; bestScore = score; }
      }
      return best;
    }

    async buildAI(k) {
      if (this.age - k.lastBuild < 6) return;
      let type = null, cost = null, popCapGain = 0;
      const c = t => k.buildings.filter(b => b.type === t).length;

      if (k.popCap - k.pop < 2 && k.resources.wood > 65) { type = pick(['house_a', 'house_b', 'house_c']); cost = { wood: 55, stone: 8 }; popCapGain = 5; }
      else if (c('farm') < Math.ceil(k.pop / 9) && k.resources.wood > 55) { type = 'farm'; cost = { wood: 45, stone: 4 }; }
      else if (c('warehouse') < Math.ceil(k.territory.size / 14) && k.resources.wood > 85 && k.resources.stone > 30) { type = 'warehouse'; cost = { wood: 70, stone: 24 }; }
      else if (c('market') < 2 && k.pop > 12 && k.resources.wood > 95) { type = 'market'; cost = { wood: 80, stone: 18, gold: 15 }; }
      else if (c('barracks') < 2 && k.pop > 15 && k.resources.wood > 110 && k.resources.stone > 45) { type = 'barracks'; cost = { wood: 90, stone: 38 }; }
      else if (k.resources.wood > 120 && k.resources.stone > 55 && Math.random() < .22) { type = pick(['forge', 'watchtower', 'windmill', 'silo', 'church']); cost = { wood: 90, stone: 45, gold: 10 }; }
      if (!type) return;

      for (const [r, v] of Object.entries(cost)) if (k.resources[r] < v) return;
      const cell = this.findBuildCell(k, type, false);
      if (!cell) return; // V3: no spending and no overlap if the city has no safe ground yet.

      const [x, y] = cell;
      const b = await this.addBuilding(k, type, x, y, false);
      if (!b) return;
      for (const [r, v] of Object.entries(cost)) k.resources[r] -= v;
      k.popCap += popCapGain;
      if (popCapGain > 0) { k.pop = Math.min(k.popCap, k.pop + 1); await this.syncCitizens(k); }
      k.lastBuild = this.age;
      this.r.puff(...this.iso(x, y));
    }

    expandAI(k) {
      if (this.age - k.lastExpand < 3 || k.resources.food < 12 || k.resources.wood < 10) return;
      let candidates = [];
      for (const s of k.territory) {
        const [x, y] = s.split(',').map(Number);
        for (const [a, b] of this.neigh(x, y)) if (this.getOwner(a, b) === -1) candidates.push([a, b]);
      }
      if (!candidates.length) return;
      // Prefer cells that are useful terrain, but conquest/territory may still include mountains/coasts.
      candidates = [...new Map(candidates.map(c => [key(...c), c])).values()];
      if (k.aggressive) {
        const t = this.kingdoms[k.aggressive];
        if (t?.alive) candidates.sort((a, b) => Math.hypot(a[0] - t.capital[0], a[1] - t.capital[1]) - Math.hypot(b[0] - t.capital[0], b[1] - t.capital[1]));
      } else {
        candidates.sort((a, b) => (this.isWalkableCell(b[0], b[1]) ? 1 : 0) - (this.isWalkableCell(a[0], a[1]) ? 1 : 0));
      }
      const [x, y] = candidates[0];
      this.setOwner(x, y, k.id); k.territory.add(key(x, y));
      k.resources.food -= 6; k.resources.wood -= 4; k.lastExpand = this.age;
    }

    ownWalkableCells(k) {
      return [...k.territory].map(s => s.split(',').map(Number)).filter(([x, y]) => this.getOwner(x, y) === k.id && this.isWalkableCell(x, y) && !this.buildingBlockingCell(x, y));
    }

    approachCell(k, b) {
      if (!b) return null;
      const r = (BUILD_FOOTPRINT[b.type] || 0) + 1;
      const cand = [];
      for (let dy=-r; dy<=r; dy++) for (let dx=-r; dx<=r; dx++) {
        if (Math.max(Math.abs(dx),Math.abs(dy)) !== r) continue;
        cand.push([b.x+dx,b.y+dy]);
      }
      const safe = cand.filter(([x,y]) => this.getOwner(x,y) === k.id && this.isWalkableCell(x,y) && !this.buildingBlockingCell(x,y));
      if (!safe.length) return null;
      safe.sort((a,b2) => Math.hypot(a[0]-k.capital[0],a[1]-k.capital[1]) - Math.hypot(b2[0]-k.capital[0],b2[1]-k.capital[1]));
      return safe[0];
    }

    findPath(k, start, goal, maxNodes = 350) {
      const sk = key(...start), gk = key(...goal);
      if (sk === gk) return [];
      const canStep = (x,y) => this.isWalkableCell(x,y) && this.getOwner(x,y) === k.id && !this.buildingBlockingCell(x,y);
      if (!canStep(goal[0], goal[1])) return [];
      const q = [start], prev = new Map([[sk, null]]);
      let head = 0;
      while (head < q.length && head < maxNodes) {
        const [x, y] = q[head++];
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const nk = key(nx, ny);
          if (prev.has(nk) || !canStep(nx,ny)) continue;
          prev.set(nk, key(x, y));
          if (nk === gk) {
            const rev = [[nx, ny]];
            let cur = prev.get(nk);
            while (cur && cur !== sk) {
              const [cx, cy] = cur.split(',').map(Number);
              rev.push([cx, cy]); cur = prev.get(cur);
            }
            return rev.reverse();
          }
          q.push([nx, ny]);
        }
      }
      return [];
    }

    chooseTaskCell(k, f) {
      const own = this.ownWalkableCells(k);
      if (!own.length) return this.approachCell(k, k.buildings[0]) || k.capital;
      const buildings = k.buildings;

      if (f.job === 'farm') {
        const farms = buildings.filter(b => b.type === 'farm');
        if (farms.length) return this.approachCell(k, pick(farms)) || pick(own);
        const grass = own.filter(([x, y]) => this.biome(x, y) === 'grass');
        return grass.length ? pick(grass) : pick(own);
      }
      if (f.job === 'wood') {
        const forest = own.filter(([x, y]) => this.biome(x, y) === 'forest');
        return forest.length ? pick(forest) : pick(own);
      }
      if (f.job === 'stone') {
        const quarry = own.filter(([x, y]) => this.neigh(x, y).some(([a, b]) => this.biome(a, b) === 'mountain'));
        return quarry.length ? pick(quarry) : pick(own);
      }
      const sites = buildings.filter(b => b.type !== 'castle');
      if (sites.length) return this.approachCell(k, sites[sites.length - 1]) || pick(own);
      return this.approachCell(k, buildings[0]) || pick(own);
    }

    workActionFor(f) {
      if (f.job === 'farm') return pick(['harvest', 'water']);
      if (f.job === 'wood') return 'chop_wood';
      if (f.job === 'stone') return pick(['pickaxe', 'dig']);
      return 'carry_sack';
    }

    farmerAI(k) {
      for (const f of k.farmers) {
        if (f.fixedBuilding) {
          const action = Math.floor((this.age + f.phase) / 3) % 2 ? 'harvest' : 'water';
          if (f.action !== action) { f.action = action; this.r.setFarmerAction(f, action); }
          continue;
        }
        if (f.buildPrepUntil > this.age) continue;
        if (f.action === 'walk' && f.path.length) continue;
        if (this.age < f.actionUntil) continue;

        const target = this.chooseTaskCell(k, f);
        const path = this.findPath(k, f.cell, target);
        if (path.length) {
          f.path = path;
          f.taskCell = target;
          f.action = 'walk';
          f.actionUntil = 0;
          this.r.setFarmerAction(f, 'walk');
        } else {
          const act = this.workActionFor(f);
          f.action = act;
          f.actionUntil = this.age + 2 + Math.random();
          this.r.setFarmerAction(f, act);
        }
      }
    }

    update(dt) {
      for (const k of this.kingdoms) {
        if (!k.alive) continue;
        for (const f of k.farmers) {
          if (f.action === 'walk' && f.path.length) {
            const next = f.path[0];
            // A newly completed building can close a street while a farmer is en route.
            // Replan immediately instead of ever letting an NPC slide underneath it.
            if (!this.isWalkableCell(next[0], next[1]) || this.getOwner(next[0], next[1]) !== k.id || this.buildingBlockingCell(next[0], next[1])) {
              f.path = []; f.action = 'idle'; f.actionUntil = 0; this.r.setFarmerAction(f, 'idle'); continue;
            }
            const [tx, ty0] = this.iso(...next), ty = ty0 + 6;
            const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
            if (d <= 1.4) {
              f.x = tx; f.y = ty; f.cell = [...next]; f.path.shift();
              if (!f.path.length) { f.action = 'idle'; f.actionUntil = 0; this.r.setFarmerAction(f, 'idle'); }
              this.r.updateFarmer(f, dx, dy);
            } else {
              const step = Math.min(d, f.speed * dt);
              f.x += dx / d * step; f.y += dy / d * step;
              this.r.updateFarmer(f, dx, dy);
            }
          } else {
            this.r.updateFarmer(f, 0, 0);
          }
        }
      }
      this.r.updateWars?.(this, dt);
    }

    adjacentEnemies(k) {
      const out = new Set();
      for (const s of k.territory) {
        const [x, y] = s.split(',').map(Number);
        for (const [a, b] of this.neigh(x, y)) {
          const o = this.getOwner(a, b);
          if (o >= 0 && o !== k.id && this.kingdoms[o]?.alive) out.add(o);
        }
      }
      return [...out];
    }
    borderPair(a, b) {
      for (const s of a.territory) {
        const [x, y] = s.split(',').map(Number);
        for (const [nx, ny] of this.neigh(x, y)) if (this.getOwner(nx, ny) === b.id) return [[x, y], [nx, ny]];
      }
      return null;
    }
    attack(attacker, target) {
      if (!attacker?.alive || !target?.alive || attacker === target) return false;
      attacker.aggressive = target.id;
      const pair = this.borderPair(attacker, target);
      if (!pair) { toast(`${attacker.name}: advancing toward ${target.name}`); return false; }
      return this.startWar(attacker, target);
    }
    startWar(a, b) {
      if (this.wars.some(w => !w.done && ((w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id)))) return true;
      const pair = this.borderPair(a, b); if (!pair) return false;
      const w = { id: `${a.id}-${b.id}-${Date.now()}`, a: a.id, b: b.id, front: pair, lastCapture: this.age, done: false, pulse: 0, fxClock: 0, arrowClock: 0 };
      this.wars.push(w); this.r.startWar(w, this); toast(`⚔️ ${a.name} attacks ${b.name}`); feed('WORLD', `${a.name} ⚔ ${b.name}`); return true;
    }
    warAI() {
      if (this.age < 35) return;
      for (const k of this.kingdoms) {
        if (!k.alive) continue;
        const enemies = this.adjacentEnemies(k);
        if (enemies.length && Math.random() < .008) this.startWar(k, this.kingdoms[pick(enemies)]);
      }
    }
    resolveWars() {
      for (const w of this.wars) {
        if (w.done) continue;
        const a = this.kingdoms[w.a], b = this.kingdoms[w.b];
        if (!a?.alive || !b?.alive) { w.done = true; continue; }
        const pair = this.borderPair(a, b);
        if (!pair) { w.done = true; this.r.endWar(w); continue; }
        w.front = pair;
        if (this.age - w.lastCapture < 3) continue;
        w.lastCapture = this.age;
        const pa = this.power(a) * (.85 + Math.random() * .3), pb = this.power(b) * (.85 + Math.random() * .3);
        const winner = pa >= pb ? a : b, loser = winner === a ? b : a;
        const capturable = [];
        for (const s of loser.territory) {
          const [x, y] = s.split(',').map(Number);
          if (this.neigh(x, y).some(([nx, ny]) => this.getOwner(nx, ny) === winner.id)) capturable.push([x, y]);
        }
        if (!capturable.length) continue;
        capturable.sort((u, v) => Math.hypot(u[0] - winner.capital[0], u[1] - winner.capital[1]) - Math.hypot(v[0] - winner.capital[0], v[1] - winner.capital[1]));
        const [x, y] = capturable[0];
        this.capture(winner, loser, x, y);
        winner.military += .5; loser.military = Math.max(2, loser.military - 1.5);
        this.r.casualty?.(w, loser.id, winner.id);
        if (Math.random() < .45) this.r.casualty?.(w, loser.id, winner.id);
        if (Math.random() < .35) { loser.pop = Math.max(2, loser.pop - 1); void this.syncCitizens(loser); }
        this.r.battleFx(...this.iso(x, y), winner.color);
        this.r.frontImpact(w, this);
        if ((x === loser.capital[0] && y === loser.capital[1]) || loser.territory.size <= 1) this.eliminate(loser, winner);
      }
    }
    capture(winner, loser, x, y) {
      this.setOwner(x, y, winner.id); loser.territory.delete(key(x, y)); winner.territory.add(key(x, y));
      const hit = loser.buildings.find(b => b.x === x && b.y === y);
      if (hit && hit.type !== 'castle') {
        const damage = hit.maxHp * rand(.62, 1.05);
        hit.hp -= damage;
        this.r.damageBuilding(hit, damage);
        if (hit.hp <= 0) {
          loser.buildings = loser.buildings.filter(b => b !== hit);
          this.releaseFarmWorker(loser, hit.id);
          this.r.destroyBuilding(hit);
        } else {
          // Surviving structures are occupied only after the fight has physically reached them.
          hit.owner = winner.id;
          loser.buildings = loser.buildings.filter(b => b !== hit);
          winner.buildings.push(hit);
          const linkedWorker = loser.farmers.find(f => f.fixedBuilding === hit.id);
          if (linkedWorker) {
            loser.farmers = loser.farmers.filter(f => f !== linkedWorker);
            winner.farmers.push(linkedWorker);
            loser.pop = Math.max(2, loser.pop - 1);
            winner.popCap = Math.max(winner.popCap, winner.pop + 1);
            winner.pop++;
          } else if (hit.type === 'farm') this.spawnFarmWorker(winner, hit);
          this.r.recolorBuilding?.(hit, winner);
        }
      }
    }
    eliminate(loser, winner) {
      loser.alive = false;
      for (const s of [...loser.territory]) {
        const [x, y] = s.split(',').map(Number); this.setOwner(x, y, winner.id); winner.territory.add(s);
      }
      loser.territory.clear(); winner.resources.gold += loser.resources.gold * .5; winner.resources.food += loser.resources.food * .35;
      for (const building of [...loser.buildings]) {
        if (building.type === 'castle' || Math.random() < .55) this.r.destroyBuilding(building, true);
        else {
          building.owner = winner.id;
          winner.buildings.push(building);
          if (building.type === 'farm') this.spawnFarmWorker(winner, building);
          this.r.recolorBuilding?.(building, winner);
        }
      }
      loser.buildings.length = 0;
      for (const farmer of loser.farmers) this.r.removeFarmer?.(farmer);
      loser.farmers.length = 0;
      this.r.eliminate(loser, winner); toast(`🏰 ${winner.name} conquers ${loser.name}`); feed('WORLD', `${loser.name} has fallen`);
      if (this.selected === loser) this.select(winner);
    }

    like(name, count = 1) {
      const k = this.kingdomByName.get(String(name).toLowerCase()); if (!k?.alive) return;
      const n = Math.max(1, Number(count) || 1);
      k.resources.food += n * .65; k.resources.wood += n * .25; k.resources.gold += n * .08;
      k.boostUntil = Math.max(k.boostUntil, this.age + Math.min(18, n * .15)); this.r.supportFx(k, '❤️', Math.min(6, n)); this.updateSelected();
    }
    follow(name) {
      const k = this.kingdomByName.get(String(name).toLowerCase()); if (!k?.alive || k.followed) return;
      k.followed = true; k.resources.wood += 85; k.resources.stone += 35; k.resources.gold += 20; k.boostUntil = this.age + 30;
      toast(`🔨 ${name}: boom edilizio`); this.r.supportFx(k, '🔨', 4);
    }

    claimGiftLand(k, amount) {
      let remaining = Math.max(0, amount | 0), guard = 0;
      while (remaining > 0 && guard++ < 8) {
        const frontier = [];
        for (const s of k.territory) {
          const [x, y] = s.split(',').map(Number);
          for (const [nx, ny] of this.neigh(x, y)) if (this.getOwner(nx, ny) === -1 && this.land(nx, ny)) frontier.push([nx, ny]);
        }
        const unique = [...new Map(frontier.map(c => [key(...c), c])).values()]
          .sort((a, b) => (this.isWalkableCell(b[0], b[1]) ? 1 : 0) - (this.isWalkableCell(a[0], a[1]) ? 1 : 0));
        if (!unique.length) break;
        for (const [x, y] of unique.slice(0, remaining)) { this.setOwner(x, y, k.id); k.territory.add(key(x, y)); remaining--; }
      }
      this.r.redrawTerritories(this);
    }

    async instantGiftBuild(k, types) {
      let built = 0;
      for (const requested of types) {
        const type = requested === 'house' ? pick(['house_a', 'house_b', 'house_c']) : requested;
        let cell = this.findBuildCell(k, type, false);
        if (!cell) { this.claimGiftLand(k, 5); cell = this.findBuildCell(k, type, false); }
        if (!cell) continue;
        const building = await this.addBuilding(k, type, cell[0], cell[1], false, true);
        if (!building) continue;
        if (type.startsWith('house_')) k.popCap += 5;
        built++;
        this.r.puff(...this.iso(...cell));
      }
      return built;
    }

    async giftPopulation(k, amount) {
      k.pop = Math.min(k.popCap, k.pop + Math.max(0, amount | 0));
      await this.syncCitizens(k);
    }

    async gift(name, gift, repeat = 1, meta = {}) {
      const k = this.kingdomByName.get(String(name).toLowerCase()); if (!k?.alive) return;
      const g = String(gift || '').toLowerCase(), n = Math.max(1, Number(repeat) || 1);
      const diamonds = Number(meta.diamonds || meta.diamondCount || 0);
      if (g.includes('rose')) {
        k.resources.food += 45 * n; k.resources.gold += 12 * n; k.boostUntil = this.age + 20; this.r.supportFx(k, '🌹', 3);
      } else if (g.includes('ice cream')) {
        k.resources.food += 70 * n; await this.giftPopulation(k, n); this.r.supportFx(k, '🍦', 4);
      } else if (g.includes('coffee') || g.includes('doughnut') || g.includes('donut')) {
        k.resources.food += 120 * n; k.resources.gold += 25 * n; k.boostUntil = this.age + 25; this.r.supportFx(k, '☕', 4);
      } else if (g.includes('paper crane') || g.includes('heart me') || g.includes('hand heart')) {
        k.resources.food += 180 * n; k.resources.wood += 110 * n; k.popCap += 2 * n; await this.giftPopulation(k, 2 * n); k.boostUntil = this.age + 50; this.r.supportFx(k, '💞', 6);
      } else if (g.includes('finger heart')) {
        k.resources.food += 90 * n; k.resources.wood += 55 * n; k.boostUntil = this.age + 35; this.r.supportFx(k, '🫰', 5);
      } else if (g.includes('perfume')) {
        k.resources.gold += 120 * n; k.resources.stone += 45 * n; this.r.supportFx(k, '✨', 6);
      } else if (g.includes('firework')) {
        k.resources.gold += 260 * n; k.resources.wood += 180 * n; k.resources.stone += 120 * n; k.boostUntil = this.age + 55; this.r.supportFx(k, '🎆', 7);
      } else if (g.includes('money gun') || g.includes('train') || g.includes('motorcycle')) {
        k.resources.gold += 520 * n; k.resources.wood += 360 * n; k.resources.stone += 240 * n; k.military += 25 * n; k.boostUntil = this.age + 75;
        await this.instantGiftBuild(k, ['house']); await this.giftPopulation(k, 3 * n); this.r.supportFx(k, '💰', 8);
      } else if (g.includes('sports car') || g.includes('yacht') || g.includes('private jet') || g.includes('whale diving')) {
        k.resources.gold += 650 * n; k.resources.wood += 420 * n; k.resources.stone += 300 * n; k.military += 35 * n; k.boostUntil = this.age + 90;
        await this.instantGiftBuild(k, ['house', 'barracks']); await this.giftPopulation(k, 4 * n); this.r.supportFx(k, '⚡', 9);
      } else if (g.includes('tiktok')) {
        k.resources.gold += 180 * n; k.resources.wood += 120 * n; k.boostUntil = this.age + 45; this.r.supportFx(k, '🎵', 7);
      } else if (g.includes('galaxy')) {
        k.resources.gold += 1800 * n; k.resources.food += 1500 * n; k.resources.wood += 1200 * n; k.resources.stone += 900 * n; k.military += 90 * n; k.boostUntil = this.age + 180;
        k.popCap += 10 * n;
        this.claimGiftLand(k, 8 * n); await this.instantGiftBuild(k, ['house', 'farm', 'barracks']); await this.giftPopulation(k, 7 * n);
        toast(`${name}: GALAXY — instant city boost`); this.r.supportFx(k, '🌌', 14);
      } else if (g.includes('lion')) {
        k.resources.gold += 4200 * n; k.resources.food += 2600 * n; k.resources.wood += 2800 * n; k.resources.stone += 2200 * n; k.military += 220 * n; k.boostUntil = this.age + 300;
        k.popCap += 20 * n;
        this.claimGiftLand(k, 15 * n); await this.instantGiftBuild(k, ['house', 'house', 'farm', 'barracks', 'forge', 'watchtower']); await this.giftPopulation(k, 14 * n);
        toast(`${name}: LION — major civilization leap`); this.r.supportFx(k, '🦁', 18);
      } else if (g.includes('universe') || g.includes('dragon') || g.includes('castle fantasy') || g.includes('interstellar') || g.includes('phoenix') || diamonds * n >= 1000) {
        k.resources.gold += 8000 * n; k.resources.food += 6000 * n; k.resources.wood += 5500 * n; k.resources.stone += 5000 * n; k.military += 420 * n; k.boostUntil = this.age + 480;
        k.popCap += 40 * n;
        this.claimGiftLand(k, 24 * n); await this.instantGiftBuild(k, ['house', 'house', 'house', 'farm', 'farm', 'barracks', 'forge', 'market', 'stone_tower']); await this.giftPopulation(k, 24 * n);
        toast(`${name}: LEGENDARY BIG HELP — kingdom transformed`); this.r.supportFx(k, '👑', 24);
      } else {
        const value = Math.max(1, diamonds || 1);
        k.resources.gold += (35 + value * .8) * n; k.resources.food += (35 + value * .5) * n; k.resources.wood += (25 + value * .35) * n; this.r.supportFx(k, '🎁', 3);
      }
      this.updateSelected();
    }
    boost30() { for (const k of this.kingdoms) if (k.alive) k.boostUntil = this.age + 30; toast('⏩ Simulation boosted for 30 seconds'); }
    updateUI() {
      UI.age.textContent = secs(this.age);
      const alive = this.kingdoms.filter(k => k.alive); UI.players.textContent = `${alive.length} kingdoms`;
      document.documentElement.dataset.farms = String(alive.reduce((sum, k) => sum + k.buildings.filter(b => b.type === 'farm').length, 0));
      document.documentElement.dataset.fixedFarmWorkers = String(alive.reduce((sum, k) => sum + k.farmers.filter(f => f.fixedBuilding).length, 0));
      document.documentElement.dataset.activeWars = String(this.wars.filter(w => !w.done).length);
      const rank = [...alive].sort((a, b) => this.power(b) - this.power(a)).slice(0, 5);
      UI.rank.innerHTML = rank.map((k, i) => `<div class="rank-row"><b>${i + 1}</b><i style="background:${k.css}"></i><span>${escapeHtml(k.name)}</span><span class="score">${fmt(this.power(k))}</span></div>`).join('');
      this.updateSelected();
    }
  }

  class PixiRenderer {
    constructor(world, buildManifest, npcManifest) {
      this.w = world; this.bm = buildManifest; this.nm = npcManifest;
      this.app = null; this.root = null; this.territory = null; this.settlement = null; this.entities = null; this.labels = null; this.fx = null;
      this.buildTex = {}; this.anim = {}; this.unitAnim = {}; this.kingdomBuildTex = new Map(); this.kingdomUnitAnim = new Map(); this.kingdomFlagTex = new Map(); this.farmerSprites = new Map(); this.warVisuals = new Map(); this.drag = null; this.selected = null;
    }

    async init(sim) {
      this.sim = sim; const P = window.PIXI; this.P = P;
      // Netlify/iOS hotfix: Pixi's default texture loader uses WorkerManager + fetch.
      // On protected/authenticated Netlify sessions that worker can receive 401 even
      // while the page itself is visible. Use the browser Image loader instead.
      P.Assets.setPreferences({ preferWorkers: false, preferCreateImageBitmap: false });
      this.app = new P.Application();
      // Pixel-art assets are authored for nearest-neighbour presentation. One
      // physical render pixel per CSS pixel keeps them crisp while avoiding the
      // 2.25x fill-rate cost of a 1.5 DPR canvas during long simulations.
      await this.app.init({ resizeTo: window, background: '#153f61', antialias: false, autoDensity: true, resolution: 1, preference: 'webgl', powerPreference: 'high-performance' });
      $('#game').appendChild(this.app.canvas); this.app.canvas.style.imageRendering = 'pixelated';
      this.root = new P.Container(); this.territory = new P.Graphics(); this.settlement = new P.Graphics(); this.entities = new P.Container(); this.labels = new P.Container(); this.fx = new P.Container();
      this.entities.sortableChildren = true;
      this.root.addChild(await this.makeMap(), this.territory, this.settlement, this.entities, this.labels, this.fx);
      this.app.stage.addChild(this.root);
      await this.preload(); this.installCamera(); this.home();
      let last = performance.now();
      this.app.ticker.add(() => { const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now; sim.update(dt); this.updateFx(dt); });
    }

    async makeMap() { const tex = await this.P.Assets.load('assets/map/world.png'); const s = new this.P.Sprite(tex); s.eventMode = 'static'; return s; }
    async preload() {
      const P = this.P;
      for (const [name, m] of Object.entries(this.bm)) this.buildTex[name] = await P.Assets.load(m.file);
      const needed = ['idle', 'walk_down', 'walk_up', 'walk_left', 'walk_right', 'harvest', 'water', 'pickaxe', 'dig', 'chop_wood', 'carry_sack'];
      for (const a of needed) await this.loadAnim(a);
      for (const unit of ['knight','archer']) for (const a of ['idle','walk','attack','hurt','death']) await this.loadUnitAnim(unit, a, 48, 48, 4);
    }
    async loadAnim(a) {
      if (this.anim[a]) return this.anim[a];
      const P = this.P, m = this.nm.actions[a]; if (!m) return this.anim.idle;
      const base = await P.Assets.load(`assets/npc/${a}.png`), arr = [];
      for (let i = 0; i < m.frames; i++) arr.push(new P.Texture({ source: base.source, frame: new P.Rectangle(i * m.frameWidth, 0, m.frameWidth, m.frameHeight) }));
      this.anim[a] = arr; return arr;
    }

    async loadUnitAnim(unit, anim, frameWidth = 48, frameHeight = 48, frames = 4) {
      const key = `${unit}_${anim}`;
      if (this.unitAnim[key]) return this.unitAnim[key];
      const P = this.P;
      const base = await P.Assets.load(`assets/units/${key}.png`), arr = [];
      for (let i = 0; i < frames; i++) arr.push(new P.Texture({ source: base.source, frame: new P.Rectangle(i * frameWidth, 0, frameWidth, frameHeight) }));
      this.unitAnim[key] = arr; return arr;
    }
    swapAnim(holder, key) {
      if (!holder || holder._animKey === key || !holder._sprite) return;
      const tex = holder._anim[key]; if (!tex) return;
      holder._animKey = key; holder._sprite.textures = tex; holder._sprite.gotoAndPlay(0);
    }

    teamPalette(color) {
      const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
      const clamp8 = v => Math.max(0, Math.min(255, Math.round(v)));
      return {
        dark: [clamp8(r * 0.55), clamp8(g * 0.55), clamp8(b * 0.55)],
        mid: [clamp8(r * 0.82), clamp8(g * 0.82), clamp8(b * 0.82)],
        light: [clamp8(255 - (255 - r) * 0.28), clamp8(255 - (255 - g) * 0.28), clamp8(255 - (255 - b) * 0.28)]
      };
    }
    textureToCanvas(tex) {
      const src = tex?.source?.resource?.source || tex?.source?.source || tex?.source?.resource || tex?.baseTexture?.resource?.source;
      if (!src) return null;
      const c = document.createElement('canvas');
      c.width = tex.width || src.width; c.height = tex.height || src.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      if (tex.frame) ctx.drawImage(src, tex.frame.x, tex.frame.y, tex.frame.width, tex.frame.height, 0, 0, tex.frame.width, tex.frame.height);
      else ctx.drawImage(src, 0, 0);
      return c;
    }
    recolorTeamCanvas(canvas, color) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data, pal = this.teamPalette(color);
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]; if (a < 8) continue;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max - min;
        const isBlue = b > g + 12 && b > r + 16 && sat > 28;
        const isGreen = g > r + 14 && g > b + 8 && sat > 26;
        // Only the original blue team accents change palette. Green foliage
        // integrated in farms, stables and houses must keep its natural color.
        const isTeam = isBlue;
        if (!isTeam) continue;
        const lum = (r + g + b) / 3;
        const rep = lum < 78 ? pal.dark : lum < 150 ? pal.mid : pal.light;
        d[i] = rep[0]; d[i + 1] = rep[1]; d[i + 2] = rep[2];
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    }
    getBuildingTexture(k, type) {
      const cacheKey = `${k.id}:${type}`;
      if (this.kingdomBuildTex.has(cacheKey)) return this.kingdomBuildTex.get(cacheKey);
      const base = this.buildTex[type] || this.buildTex.house_a;
      const canvas = this.textureToCanvas(base);
      if (!canvas) return base;
      const recolored = this.recolorTeamCanvas(canvas, k.color);
      const tex = this.P.Texture.from(recolored);
      this.kingdomBuildTex.set(cacheKey, tex);
      return tex;
    }
    getUnitAnim(k, unit, anim) {
      const cacheKey = `${k.id}:${unit}:${anim}`;
      if (this.kingdomUnitAnim.has(cacheKey)) return this.kingdomUnitAnim.get(cacheKey);
      const key = `${unit}_${anim}`;
      const arr = this.unitAnim[key] || [];
      const recolored = arr.map(tex => {
        const c = this.textureToCanvas(tex);
        if (!c) return tex;
        return this.P.Texture.from(this.recolorTeamCanvas(c, k.color));
      });
      this.kingdomUnitAnim.set(cacheKey, recolored);
      return recolored;
    }

    getFlagTexture(k) {
      if (this.kingdomFlagTex.has(k.id)) return this.kingdomFlagTex.get(k.id);
      const c = document.createElement('canvas'); c.width = 14; c.height = 10;
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
      const pal = this.teamPalette(k.color);
      const hex = a => `rgb(${a[0]},${a[1]},${a[2]})`;
      ctx.fillStyle = '#493523'; ctx.fillRect(1,0,1,10);
      ctx.fillStyle = hex(pal.dark); ctx.fillRect(2,1,10,7);
      ctx.fillStyle = hex(pal.mid); ctx.fillRect(3,1,9,5);
      ctx.fillStyle = hex(pal.light); ctx.fillRect(3,1,7,2);
      ctx.clearRect(10,6,2,2); ctx.clearRect(11,5,1,1);
      const tex = this.P.Texture.from(c); this.kingdomFlagTex.set(k.id, tex); return tex;
    }
    addBuildingFlag(k, b) {
      if (!['castle','keep','barracks','watchtower','stone_tower','gate'].includes(b.type)) return;
      const flag = new this.P.Sprite(this.getFlagTexture(k)); flag.anchor.set(.15,1);
      const lift = (BUILD_HEIGHT[b.type] || 46) * .70;
      flag.position.set(b.sx - 2, b.sy - lift); flag.scale.set(.75); flag.zIndex = Math.round(b.sy * 100) + 21; flag.roundPixels = true;
      this.entities.addChild(flag); b._flag = flag;
    }
    recolorBuilding(b, k) {
      if (!b?._sprite) return;
      b._sprite.texture = this.getBuildingTexture(k, b.type);
      if (b._flag) b._flag.texture = this.getFlagTexture(k);
    }

    installCamera() {
      const c = this.app.canvas; c.style.touchAction = 'none';
      let pointers = new Map(), pinch = null, tapTime = 0, down = null;
      const mid = p => ({ x:(p[0].x+p[1].x)/2, y:(p[0].y+p[1].y)/2 });
      c.addEventListener('contextmenu', e => e.preventDefault());
      c.addEventListener('pointerdown', e => {
        e.preventDefault(); c.setPointerCapture?.(e.pointerId); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        down = {x:e.clientX,y:e.clientY,t:performance.now()};
        if (pointers.size === 1) this.drag = {x:e.clientX,y:e.clientY,ox:this.root.x,oy:this.root.y};
        if (pointers.size === 2) {
          this.drag = null; const p=[...pointers.values()], m=mid(p), dist=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
          const s=this.root.scale.x; pinch={dist:Math.max(1,dist),scale:s,wx:(m.x-this.root.x)/s,wy:(m.y-this.root.y)/s};
        }
      },{passive:false});
      c.addEventListener('pointermove', e => {
        if (!pointers.has(e.pointerId)) return; e.preventDefault(); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if (pointers.size === 1 && this.drag) { this.root.position.set(this.drag.ox+e.clientX-this.drag.x,this.drag.oy+e.clientY-this.drag.y); this.constrainCamera(); }
        else if (pointers.size === 2 && pinch) {
          const p=[...pointers.values()], m=mid(p), d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
          const ns=clamp(pinch.scale*d/pinch.dist,CAMERA_MIN,CAMERA_MAX); this.root.scale.set(ns);
          this.root.position.set(m.x-pinch.wx*ns,m.y-pinch.wy*ns); this.constrainCamera();
        }
      },{passive:false});
      const end = e => {
        const was=pointers.size; pointers.delete(e.pointerId);
        if (was===1 && down) {
          const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y), now=performance.now();
          if (moved<10 && now-down.t<300) {
            if (now-tapTime<330) { if (this.sim.selected?.alive) this.focusCell(...this.sim.selected.capital); else this.zoomTo(this.root.scale.x*1.28,e.clientX,e.clientY); tapTime=0; }
            else tapTime=now;
          }
        }
        if (pointers.size===1) { const p=[...pointers.values()][0]; this.drag={x:p.x,y:p.y,ox:this.root.x,oy:this.root.y}; } else this.drag=null;
        if (pointers.size<2) pinch=null; down=null;
      };
      c.addEventListener('pointerup',end,{passive:false}); c.addEventListener('pointercancel',end,{passive:false});
      c.addEventListener('wheel',e=>{e.preventDefault();this.zoomTo(this.root.scale.x*(e.deltaY>0?.9:1.1),e.clientX,e.clientY);},{passive:false});
      ['gesturestart','gesturechange','gestureend'].forEach(n=>document.addEventListener(n,e=>e.preventDefault(),{passive:false}));
    }
    constrainCamera() {
      const s=this.root.scale.x, mw=this.w.mapWidth*s, mh=this.w.mapHeight*s, margin=80;
      const minX=innerWidth-mw-margin,maxX=margin,minY=innerHeight-mh-margin,maxY=margin;
      this.root.x = mw+margin*2<=innerWidth ? (innerWidth-mw)/2 : clamp(this.root.x,minX,maxX);
      this.root.y = mh+margin*2<=innerHeight ? (innerHeight-mh)/2 : clamp(this.root.y,minY,maxY);
      this.syncKingdomDetail();
    }
    zoomTo(scale,sx,sy) { scale=clamp(scale,CAMERA_MIN,CAMERA_MAX); const old=this.root.scale.x,wx=(sx-this.root.x)/old,wy=(sy-this.root.y)/old; this.root.scale.set(scale); this.root.position.set(sx-wx*scale,sy-wy*scale); this.constrainCamera(); }
    home() { const sx=innerWidth/this.w.mapWidth,sy=innerHeight/this.w.mapHeight,s=clamp(Math.min(sx,sy)*1.04,.30,.9); this.root.scale.set(s); this.root.position.set((innerWidth-this.w.mapWidth*s)/2,(innerHeight-this.w.mapHeight*s)/2); this.syncKingdomDetail(); }
    focusCell(x,y) { const [wx,wy]=this.sim.iso(x,y),s=clamp(innerWidth<600?.82:.92,.5,1.2); this.root.scale.set(s); this.root.position.set(innerWidth*.5-wx*s,innerHeight*.47-wy*s); this.constrainCamera(); }

    kingdomScreenPosition(k) {
      if (!k?.alive || !this.root) return null;
      const [wx, wy] = this.sim.iso(...k.capital), s = this.root.scale.x;
      return [this.root.x + wx * s, this.root.y + wy * s];
    }
    isKingdomDetailVisible(k) {
      if (!k?.alive || !this.root || this.root.scale.x < .68) return false;
      const p = this.kingdomScreenPosition(k); if (!p) return false;
      return p[0] > -80 && p[0] < innerWidth + 80 && p[1] > 35 && p[1] < innerHeight + 80 && Math.hypot(p[0] - innerWidth * .5, p[1] - innerHeight * .48) < Math.min(310, innerWidth * .54);
    }
    syncKingdomDetail() {
      if (!this.sim || !this.root) return;
      if (this.root.scale.x < .68) { UI.card.classList.add('hidden'); return; }
      let nearest = null, distance = Infinity;
      for (const k of this.sim.kingdoms) {
        const p = this.kingdomScreenPosition(k); if (!p) continue;
        const d = Math.hypot(p[0] - innerWidth * .5, p[1] - innerHeight * .48);
        if (d < distance) { distance = d; nearest = k; }
      }
      if (!nearest || distance > Math.min(310, innerWidth * .54)) { UI.card.classList.add('hidden'); return; }
      if (this.sim.selected !== nearest) { this.sim.selected = nearest; this.selectKingdom(nearest); }
      this.sim.updateSelected();
    }

    buildingScale(type, tex, multiplier = 1) { return ((BUILD_HEIGHT[type] || 46) / Math.max(1, tex.height)) * multiplier; }
    farmerScale(action, multiplier = 1) { const m = this.nm.actions[action] || this.nm.actions.idle; return (FARMER_WORLD_HEIGHT / Math.max(1, m.visualHeight || m.frameHeight)) * multiplier; }

    async addNeutralVillage(v, sx, sy) {
      const spots = [
        ['keep', 0, 0, .78], ['house_a', -42, 27, .82], ['farm', 43, 31, .78], ['warehouse', 2, 42, .78]
      ];
      for (const [type, ox, oy, mul] of spots) {
        const tex = this.buildTex[type], sp = new this.P.Sprite(tex); sp.anchor.set(.5, 1); sp.position.set(sx + ox, sy + oy); sp.scale.set(this.buildingScale(type, tex, mul)); sp.alpha = .84; sp.zIndex = sp.y; this.entities.addChild(sp);
      }
      for (let i = 0; i < 4; i++) {
        const spr = this.makeFarmerSprite('idle'); spr.position.set(sx + (i - 1.5) * 13, sy + 42 + (i % 2) * 5); this.applyFarmerScale(spr, 'idle', .9); spr.zIndex = spr.y; this.entities.addChild(spr);
      }
    }

    async addKingdom(k) {
      // Prepare the kingdom palette once so buildings and units become real pixel-art variants.
      this.getBuildingTexture(k, 'castle');
      this.getUnitAnim(k, 'knight', 'idle'); this.getUnitAnim(k, 'archer', 'idle');
      const t = new this.P.Text({ text: k.name, style: { fontFamily: 'Arial', fontSize: 11, fontWeight: '700', fill: '#ffffff', stroke: { color: '#071015', width: 3 }, dropShadow: { color: '#000000', alpha: .55, blur: 1, distance: 1 } } });
      t.anchor.set(.5, 1); const [x, y] = this.sim.iso(...k.capital); t.position.set(x, y - 72); t.zIndex = 9999; this.labels.addChild(t); k._label = t;
      this.__v800RequestCull?.();
    }

    async addBuilding(k, b) {
      const tex = this.getBuildingTexture(k, b.type);
      const targetScale = this.buildingScale(b.type, tex);
      const [baseW, baseH] = BUILD_BASE[b.type] || [16, 5];
      const foundation = new this.P.Graphics();
      foundation.poly([0, -baseH, baseW, 0, 0, baseH, -baseW, 0]).fill({ color: 0x8c7655, alpha: .82 }).stroke({ color: 0x3f3529, width: 1, alpha: .72 });
      foundation.poly([-baseW + 3, 0, 0, baseH - 2, baseW - 3, 0]).stroke({ color: 0xc2a977, width: 1, alpha: .55 });
      foundation.position.set(b.sx, b.sy); foundation.zIndex = Math.round(b.sy * 100) + 16; foundation.roundPixels = true;
      const shadow = new this.P.Graphics();
      const shadowW = Math.max(12, baseW * .82);
      shadow.ellipse(0, -1, shadowW, Math.max(3, baseH * .52)).fill({ color: 0x071015, alpha: .46 });
      shadow.position.set(b.sx, b.sy); shadow.zIndex = Math.round(b.sy * 100) + 18; shadow.roundPixels = true;
      const sp = new this.P.Sprite(tex); sp.anchor.set(.5, BUILD_ANCHOR_Y[b.type] || .96); sp.position.set(b.sx, b.sy); sp.scale.set(targetScale); sp.zIndex = Math.round(b.sy * 100) + 20; sp.roundPixels = true;
      sp.eventMode = b.type === 'castle' ? 'static' : 'none'; if (b.type === 'castle') sp.on('pointertap', () => this.sim.select(k));
      this.entities.addChild(foundation, shadow, sp); b._foundation = foundation; b._shadow = shadow; b._sprite = sp; this.addBuildingFlag(k, b); this.__v800RequestCull?.(); this.redrawSettlementGround(this.sim);
      if (b.type !== 'castle') {
        sp.alpha = .18; sp.scale.set(targetScale * .72);
        let elapsed = 0;
        const grow = () => {
          elapsed += this.app.ticker.deltaMS / 1000; const t = clamp(elapsed / 1.45, 0, 1), ease = 1 - Math.pow(1 - t, 3);
          sp.alpha = .18 + .82 * ease; sp.scale.set(targetScale * (.72 + .28 * ease));
          if (t >= 1) { sp.alpha = 1; sp.scale.set(targetScale); this.app.ticker.remove(grow); }
        };
        this.app.ticker.add(grow);
      }
    }

    makeFarmerSprite(action) {
      const frames = this.anim[action] || this.anim.idle;
      const s = new this.P.AnimatedSprite(frames); s.anchor.set(.5, 1); s.loop = true; s._action = action; s.roundPixels = true; s.animationSpeed = .12; s.play(); return s;
    }
    applyFarmerScale(s, action, multiplier = 1) { const sc = this.farmerScale(action, multiplier); s.scale.set(sc); }
    async addFarmer(k, f) {
      const s = this.makeFarmerSprite('idle'); this.applyFarmerScale(s, 'idle'); s.position.set(f.x, f.y); s.zIndex = Math.round(f.y * 100) + 10; this.entities.addChild(s); f._sprite = s; this.farmerSprites.set(f.id, s); this.__v800RequestCull?.();
    }
    removeFarmer(f) {
      const s = f?._sprite; if (s && !s.destroyed) s.destroy();
      if (f?.id) this.farmerSprites.delete(f.id);
      if (f) f._sprite = null;
    }
    setFarmerAction(f, action) {
      const s = f._sprite; if (!s) return;
      let a = action === 'walk' ? 'walk_down' : action; if (!this.anim[a]) a = 'idle';
      if (s._action !== a) { s.textures = this.anim[a]; s._action = a; s.animationSpeed = a.startsWith('walk') ? .18 : .14; this.applyFarmerScale(s, a); s.gotoAndPlay(0); }
    }
    updateFarmer(f, dx, dy) {
      const s = f._sprite; if (!s) return;
      if (f.action === 'walk') {
        const a = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'walk_left' : 'walk_right') : (dy < 0 ? 'walk_up' : 'walk_down');
        if (this.anim[a] && s._action !== a) { s.textures = this.anim[a]; s._action = a; s.animationSpeed = .18; this.applyFarmerScale(s, a); s.gotoAndPlay(0); }
      }
      s.position.set(f.x, f.y);
      const nextZ = Math.round(f.y * 25) * 4 + 10;
      if (s.zIndex !== nextZ) { s.zIndex = nextZ; if (this.__v800RequestSort) this.__v800RequestSort(); else this.entities.sortDirty = true; }
    }

    redrawSettlementGround(sim) {
      const g = this.settlement; if (!g) return; g.clear();
      for (const k of sim.kingdoms) {
        if (!k.alive) continue;
        const [cx, cy] = sim.iso(...k.capital);
        g.poly([cx, cy - 8, cx + 16, cy, cx, cy + 8, cx - 16, cy]).fill({ color: 0xb99a68, alpha: .42 });
        const roadNodes = [];
        const castleStart = sim.approachCell(k, k.buildings[0]) || k.capital;
        if (castleStart) roadNodes.push(castleStart);
        const others = k.buildings.filter(b => b.type !== 'castle').slice().sort((a, b) => Math.hypot(a.x - k.capital[0], a.y - k.capital[1]) - Math.hypot(b.x - k.capital[0], b.y - k.capital[1]));
        for (const b of others) {
          const goal = sim.approachCell(k, b);
          if (!goal) continue;
          let start = castleStart || k.capital;
          let best = 1e9;
          for (const node of roadNodes) {
            const d = Math.hypot(goal[0] - node[0], goal[1] - node[1]);
            if (d < best) { best = d; start = node; }
          }
          const route = sim.findPath(k, start, goal, 240);
          const sp0 = sim.iso(...(start || k.capital));
          const pts = [[sp0[0], sp0[1] + 3], ...route.map(c => { const p = sim.iso(...c); return [p[0], p[1] + 3]; })];
          if (pts.length >= 2) {
            g.poly(pts.flat()).stroke({ color: 0x8f724f, width: 4, alpha: .28 });
            g.poly(pts.flat()).stroke({ color: 0xc6aa76, width: 1.5, alpha: .65 });
            for (const c of route) roadNodes.push(c);
            roadNodes.push(goal);
          }
          if (b.type === 'farm') {
            const x = b.sx, y = b.sy + 4, w = 17, h = 8;
            g.poly([x, y - h, x + w, y, x, y + h, x - w, y]).fill({ color: 0xb88745, alpha: .68 }).stroke({ color: 0x715333, width: 1, alpha: .72 });
            for (let r = -2; r <= 2; r++) g.poly([x - w + 4, y + r * 1.6, x, y + h - 2 + r, x + w - 4, y + r * 1.6]).stroke({ color: 0xd3b05e, width: .8, alpha: .7 });
          }
          if (b.type === 'market') g.circle(b.sx, b.sy + 2, 7).fill({ color: 0xd1b679, alpha: .42 });
        }
      }
    }

    redrawTerritories(sim) {
      const g = this.territory; g.clear(); const tw = this.w.tileW, th = this.w.tileH;
      const dirs = [[1, 0, 1, 2], [-1, 0, 3, 0], [0, 1, 2, 3], [0, -1, 0, 1]];
      for (const k of sim.kingdoms) {
        if (!k.alive) continue;
        for (const st of k.territory) {
          const [x, y] = st.split(',').map(Number), [cx, cy] = sim.iso(x, y), pts = [[cx, cy - th / 2], [cx + tw / 2, cy], [cx, cy + th / 2], [cx - tw / 2, cy]];
          g.poly(pts.flat()).fill({ color: k.color, alpha: .08 });
          for (const [dx, dy, a, b] of dirs) {
            const nx = x + dx, ny = y + dy, same = sim.land(nx, ny) && sim.getOwner(nx, ny) === k.id;
            if (!same) g.poly([pts[a][0], pts[a][1], pts[b][0], pts[b][1]]).stroke({ color: k.color, width: 2.2, alpha: .95 });
          }
        }
      }
    }

    startWar(w, sim) { this.ensureWar(w, sim); }
    endWar(w) { const v = this.warVisuals.get(w.id); if (v) { v.container.destroy({ children: true }); this.warVisuals.delete(w.id); } }

    makeSoldier(k, role) {
      const P = this.P, c = new P.Container();
      const shadow = new P.Graphics();
      shadow.ellipse(0, 1, 7, 3).fill({ color: 0x000000, alpha: .22 });
      c.addChild(shadow);
      const unit = role === 'archer' ? 'archer' : 'knight';
      const anim = {
        idle: this.getUnitAnim(k, unit, 'idle'),
        walk: this.getUnitAnim(k, unit, 'walk'),
        attack: this.getUnitAnim(k, unit, 'attack'),
        hurt: this.getUnitAnim(k, unit, 'hurt'),
        death: this.getUnitAnim(k, unit, 'death')
      };
      const sprite = new P.AnimatedSprite(anim.idle || anim.walk || anim.attack || []);
      sprite.anchor.set(.5, .84); sprite.animationSpeed = role === 'archer' ? .12 : .16; sprite.play();
      sprite.scale.set(role === 'archer' ? 0.39 : (role === 'spear' ? 0.40 : 0.41));
      c.addChild(sprite);
      c._sprite = sprite; c._shadow = shadow; c._anim = anim; c._animKey = 'idle'; c._role = role; c._unit = unit;
      if (role === 'spear') {
        const spear = new P.Graphics();
        spear.poly([0,-8, 12,-19]).stroke({ color: 0x8a5e32, width: 1.2 });
        spear.poly([11,-20, 13,-17, 10,-18]).fill({ color: 0xd9e0e4 });
        c.addChild(spear); c._weapon = spear;
      }
      c.scale.set(1); return c;
    }

    ensureWar(w, sim) {
      if (this.warVisuals.has(w.id)) return this.warVisuals.get(w.id);
      const P = this.P, c = new P.Container(); c.sortableChildren = true; c.zIndex = 0; this.entities.addChild(c); const armies = [];
      for (const side of [w.a, w.b]) {
        const k = sim.kingdoms[side];
        const visible = clamp(Math.round(12 + Math.sqrt(Math.max(0, k.military)) * 1.15), 14, 28);
        for (let i = 0; i < visible; i++) {
          const role = i >= visible - Math.max(2, Math.floor(visible * .25)) ? 'archer' : (i % 4 === 0 ? 'spear' : 'sword');
          const s = this.makeSoldier(k, role); c.addChild(s);
          armies.push({ s, side, i, role, phase: Math.random() * 6, swing: Math.random() * 6 });
        }
      }
      const v = { container: c, armies, arrows: [], clock: 0, arrowClock: 0, age: 0 }; this.warVisuals.set(w.id, v); return v;
    }

    casualty(w, loserSide, winnerSide) {
      const v = this.warVisuals.get(w.id); if (!v) return;
      const live = v.armies.filter(u => u.side === loserSide && !u.dead); if (!live.length) return;
      const u = pick(live); u.dead = true;
      this.swapAnim(u.s, 'hurt');
      const bx = u.s.x, by = u.s.y - 5;
      const blood = new this.P.Graphics();
      for (let i=0;i<7;i++) blood.rect(rand(-5,5),rand(-4,3),rand(1,3),rand(1,3)).fill({color:i<5?0x8f1717:0xc12a20,alpha:.9});
      blood.position.set(bx,by); blood._life=.45; blood._vy=rand(-4,-1); this.fx.addChild(blood);
      setTimeout(() => { if (!u.s?.destroyed) { this.swapAnim(u.s, 'death'); if(u.s._sprite){u.s._sprite.loop=false;u.s._sprite.animationSpeed=.14;u.s._sprite.gotoAndPlay(0);} } }, 120);
      setTimeout(() => { if (!u.s?.destroyed) { let life=1.4; const fade=()=>{ if(u.s.destroyed){this.app.ticker.remove(fade);return;} life-=this.app.ticker.deltaMS/1000; u.s.alpha=clamp(life,0,1); if(life<=0){u.s.destroy({children:true});this.app.ticker.remove(fade);} }; this.app.ticker.add(fade); } }, 2200);
      if (winnerSide != null && Math.random() < .18) {
        const winner = v.armies.filter(z => z.side === winnerSide && !z.dead); if (winner.length) {
          const h = pick(winner); this.swapAnim(h.s, 'hurt'); setTimeout(()=>{ if(!h.dead && !h.s?.destroyed) this.swapAnim(h.s,'attack'); },180);
        }
      }
    }

    spawnArrow(v, x0, y0, x1, y1) {
      const g = new this.P.Graphics();
      g.poly([-4,0,4,0]).stroke({ color: 0xd8c79f, width: 1 });
      g.poly([4,0,1,-1.5,1,1.5]).fill({ color: 0xb7b7b7 });
      g.position.set(x0,y0); g.rotation = Math.atan2(y1-y0,x1-x0); g.zIndex = Math.round(y0*100)+30;
      v.container.addChild(g); v.arrows.push({ g, x0,y0,x1,y1,t:0,d:.32+Math.random()*.16 });
    }

    avoidBuildings(sim, x, y, dir) {
      for (const kingdom of sim.kingdoms) {
        if (!kingdom.alive) continue;
        for (const building of kingdom.buildings) {
          const halfW = building.type === 'castle' ? 31 : building.type === 'farm' ? 24 : 20;
          const height = (BUILD_HEIGHT[building.type] || 46) + 8;
          if (Math.abs(x - building.sx) < halfW && y < building.sy + 7 && y > building.sy - height) {
            x = building.sx + (dir < 0 ? -halfW - 6 : halfW + 6);
            y = Math.max(y, building.sy + 9);
          }
        }
      }
      return [x, y];
    }

    updateWars(sim, dt) {
      for (const w of sim.wars) {
        if (w.done) continue;
        const v = this.ensureWar(w, sim), [aCell, bCell] = w.front, [ax, ay] = sim.iso(...aCell), [bx, by] = sim.iso(...bCell), mx = (ax + bx) / 2, my = (ay + by) / 2;
        v.age += dt;
        const march = clamp(v.age / 4.2, 0, 1), marchEase = 1 - Math.pow(1 - march, 3);
        v.container.zIndex = Math.round(my * 100) + 19;
        const sideUnits = { [w.a]: v.armies.filter(u=>u.side===w.a && !u.dead), [w.b]: v.armies.filter(u=>u.side===w.b && !u.dead) };
        for (const side of [w.a,w.b]) {
          const arr=sideUnits[side], dir = side===w.a ? -1:1;
          let frontN=0, rearN=0;
          for (const u of arr) {
            u.phase += dt * 3.2; u.swing += dt * 8;
            const rear = u.role==='archer'; const row = rear ? 1 : 0; const idx = rear ? rearN++ : frontN++;
            const cols = rear ? Math.max(2, Math.ceil(arr.filter(z=>z.role==='archer').length/2)) : Math.max(3, Math.ceil(arr.filter(z=>z.role!=='archer').length/2));
            const col = idx % cols, r = Math.floor(idx/cols);
            const baseX = mx + dir * (rear ? 30 + r*8 : 10 + r*7);
            const baseY = my + (col-(cols-1)/2)*5.4;
            const kingdom = sim.kingdoms[side], [startX, startY] = sim.iso(...kingdom.capital);
            const clash = march < 1 || rear ? 0 : Math.sin(u.phase+u.i)*1.6;
            let px = startX + (baseX + dir*clash - startX) * marchEase;
            let py = startY + (baseY + Math.cos(u.phase*.8+u.i)*.8 - startY) * marchEase;
            [px, py] = this.avoidBuildings(sim, px, py, dir);
            u.s.position.set(px, py);
            u.s.scale.x = Math.abs(u.s.scale.x) * (dir<0 ? 1 : -1);
            if (u.s._sprite) {
              const mode = march < .98 ? 'walk' : rear ? (Math.sin(u.swing) > 0.45 ? 'attack' : 'idle') : (Math.sin(u.swing) > 0.1 ? 'attack' : 'walk');
              this.swapAnim(u.s, mode);
              u.s._sprite.scale.x = Math.abs(u.s._sprite.scale.x) * (dir < 0 ? 1 : -1);
            }
            if (u.s._weapon) u.s._weapon.rotation = rear ? 0 : Math.sin(u.swing)*.28;
            u.s.zIndex = Math.round(u.s.y*100)+20;
          }
        }
        v.container.sortChildren();
        v.clock += dt; v.arrowClock += dt;
        if (march >= .98 && v.arrowClock > .32) {
          v.arrowClock=0;
          for (const side of [w.a,w.b]) {
            const arch = sideUnits[side].filter(u=>u.role==='archer'); if (!arch.length) continue;
            const shooter=pick(arch), target=pick(sideUnits[side===w.a?w.b:w.a].filter(u=>u.role!=='archer'));
            if (target) this.spawnArrow(v, shooter.s.x, shooter.s.y-10, target.s.x, target.s.y-8);
          }
        }
        if (v.clock > .16) { v.clock=0; this.frontImpact(w, sim); }
        for (const a of [...v.arrows]) {
          a.t += dt; const q=clamp(a.t/a.d,0,1), arc=Math.sin(q*Math.PI)*10;
          a.g.position.set(a.x0+(a.x1-a.x0)*q, a.y0+(a.y1-a.y0)*q-arc);
          a.g.rotation=Math.atan2((a.y1-a.y0)-Math.cos(q*Math.PI)*30, a.x1-a.x0);
          if(q>=1){ a.g.destroy(); v.arrows.splice(v.arrows.indexOf(a),1); }
        }
      }
    }

    puff(x, y) { const g = new this.P.Graphics(); for (let i = 0; i < 10; i++) g.rect(rand(-12, 12), rand(-7, 7), rand(2, 4), rand(2, 4)).fill({ color: i%3===0?0xefe2bf:0xc8b08a, alpha: .72 }); g.position.set(x, y); g._life = .9; this.fx.addChild(g); }
    battleFx(x, y, color) { const g = new this.P.Graphics(); for (let i = 0; i < 14; i++) g.rect(rand(-8,8), rand(-6,6), rand(2,4), rand(2,4)).fill({ color: i%4===0?0xffd16a:(i%3===0?color:0xff9640), alpha: .9 }); g.position.set(x, y); g._life = .4; g._vy = rand(-3,1); this.fx.addChild(g); }
    frontImpact(w, sim) {
      if (!w?.front) return; const [a,b]=w.front, pa=sim.iso(...a), pb=sim.iso(...b), x=(pa[0]+pb[0])/2+rand(-8,8), y=(pa[1]+pb[1])/2+rand(-7,7);
      const g=new this.P.Graphics();
      for(let i=0;i<8;i++) g.rect(rand(-8,8),rand(-5,5),rand(1,3),rand(1,3)).fill({color:i<4?0x8b1a1a:(i<6?0xcfbba0:0xffd36e),alpha:.92});
      if(Math.random()<.55){ g.rect(-6,-1,12,2).fill({color:0xf6e2a3,alpha:.85}); g.rect(-1,-6,2,12).fill({color:0xf6e2a3,alpha:.55}); }
      g.position.set(x,y); g._life=.35; g._vy=rand(-1,1); this.fx.addChild(g);
    }
    damageBuilding(b, damage) {
      if (!b?._sprite) return; const ratio=clamp(b.hp/b.maxHp,0,1); b.damageState=ratio<.35?2:1;
      b._sprite.tint = ratio<.35 ? 0x886d63 : 0xc9ad9d;
      const g=new this.P.Graphics();
      for(let i=0;i<12;i++) g.rect(rand(-10,10),rand(-8,2),rand(2,4),rand(2,4)).fill({color:i%3===0?0x5b5148:0xbca98d,alpha:.8});
      g.position.set(b.sx,b.sy-10); g._life=.9; g._vy=-5; this.fx.addChild(g);
    }
    destroyBuilding(b) {
      const x=b.sx,y=b.sy; if(b._sprite){ b._sprite.destroy(); b._sprite=null; } if(b._flag){ b._flag.destroy(); b._flag=null; } if(b._shadow){ b._shadow.destroy(); b._shadow=null; } if(b._foundation){ b._foundation.destroy(); b._foundation=null; }
      const g=new this.P.Graphics();
      g.ellipse(0,2,17,6).fill({color:0x211b18,alpha:.5});
      for(let i=0;i<34;i++){ const col=i%5===0?0x332b27:(i%4===0?0x665548:(i%3===0?0x8f6b45:0xb9a184)); g.rect(rand(-17,17),rand(-8,5),rand(2,5),rand(2,4)).fill({color:col,alpha:.96}); }
      g.poly([-12,2,-4,-11,-1,-10,-7,3]).fill({color:0x49301f,alpha:.95});
      g.poly([5,4,12,-8,15,-7,10,5]).fill({color:0x3d2a20,alpha:.95});
      for(let i=0;i<5;i++) g.rect(rand(-9,9),rand(-13,-5),2,2).fill({color:i%2?0xff8b32:0xffcf55,alpha:.9});
      g.position.set(x,y); g.zIndex=Math.round(y*100)+22; g._life=8; g._vy=0; this.fx.addChild(g);
      for(let i=0;i<4;i++){
        const smoke=new this.P.Graphics(); smoke.rect(-2,-2,4,4).fill({color:i%2?0x5f5b58:0x85807a,alpha:.55});
        smoke.position.set(x+rand(-7,7),y-rand(7,15)); smoke._life=2.5+Math.random()*2; smoke._vy=rand(-8,-4); this.fx.addChild(smoke);
      }
      this.redrawSettlementGround(this.sim);
    }
    supportFx(k, emoji, n) { const [x, y] = this.sim.iso(...k.capital); for (let i = 0; i < n; i++) { const t = new this.P.Text({ text: emoji, style: { fontSize: 16 } }); t.anchor.set(.5); t.position.set(x + rand(-30, 30), y - 70 + rand(-10, 15)); t._life = 1.2 + Math.random() * .5; t._vy = rand(-18, -10); this.fx.addChild(t); } }
    updateFx(dt) { for (const o of [...this.fx.children]) { if (o._life == null) continue; o._life -= dt; o.alpha = clamp(o._life, 0, 1); if (o._vy) o.y += o._vy * dt; if (o._life <= 0) o.destroy(); } }
    eliminate(loser) { if (loser._label) loser._label.alpha = .25; }
    selectKingdom(k) { if (this.selected?._label) this.selected._label.scale.set(1); this.selected = k; if (k?._label) k._label.scale.set(1.08); }
  }

  class CanvasRenderer {
    constructor(world, bm, nm) { this.w = world; this.bm = bm; this.nm = nm; this.images = {}; this.animImgs = {}; this.entities = []; this.farmers = []; this.labels = []; this.cam = { x: 0, y: 0, s: 1 }; }
    async init(sim) {
      this.sim = sim; this.canvas = document.createElement('canvas'); this.ctx = this.canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false; $('#game').appendChild(this.canvas);
      this.resize = () => { this.canvas.width = innerWidth * (devicePixelRatio || 1); this.canvas.height = innerHeight * (devicePixelRatio || 1); this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px'; this.ctx.setTransform(devicePixelRatio || 1, 0, 0, devicePixelRatio || 1, 0, 0); this.home(); };
      addEventListener('resize', this.resize); this.map = await this.loadImg('assets/map/world.png');
      for (const [n, m] of Object.entries(this.bm)) this.images[n] = await this.loadImg(m.file);
      for (const a of ['idle', 'walk_down', 'walk_up', 'walk_left', 'walk_right', 'harvest', 'water', 'pickaxe', 'dig', 'chop_wood', 'carry_sack']) this.animImgs[a] = await this.loadImg(`assets/npc/${a}.png`);
      this.resize(); this.install(); let last = performance.now();
      const loop = now => { const dt = Math.min(.05, (now - last) / 1000); last = now; sim.update(dt); this.draw(now / 1000); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    }
    loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
    home() { const s = Math.min(innerWidth / this.w.mapWidth, innerHeight / this.w.mapHeight) * 1.04; this.cam.s = clamp(s, .34, .9); this.cam.x = (innerWidth - this.w.mapWidth * this.cam.s) / 2; this.cam.y = (innerHeight - this.w.mapHeight * this.cam.s) / 2; this.syncKingdomDetail(); }
    focusCell(x, y) { const [wx, wy] = this.sim.iso(x, y); this.cam.s = innerWidth < 600 ? .78 : .9; this.cam.x = innerWidth * .5 - wx * this.cam.s; this.cam.y = innerHeight * .47 - wy * this.cam.s; this.syncKingdomDetail(); }
    kingdomScreenPosition(k) { if(!k?.alive||!this.sim)return null;const [wx,wy]=this.sim.iso(...k.capital);return[this.cam.x+wx*this.cam.s,this.cam.y+wy*this.cam.s]; }
    isKingdomDetailVisible(k) { const p=this.kingdomScreenPosition(k);return !!p&&this.cam.s>=.68&&Math.hypot(p[0]-innerWidth*.5,p[1]-innerHeight*.48)<Math.min(310,innerWidth*.54); }
    syncKingdomDetail() { if(!this.sim)return;if(this.cam.s<.68){UI.card.classList.add('hidden');return;}let nearest=null,distance=Infinity;for(const k of this.sim.kingdoms){const p=this.kingdomScreenPosition(k);if(!p)continue;const d=Math.hypot(p[0]-innerWidth*.5,p[1]-innerHeight*.48);if(d<distance){distance=d;nearest=k;}}if(!nearest||distance>Math.min(310,innerWidth*.54)){UI.card.classList.add('hidden');return;}if(this.sim.selected!==nearest)this.sim.selected=nearest;this.sim.updateSelected(); }
    install() {
      this.canvas.style.touchAction='none'; let pts=new Map(),drag=null,pinch=null;
      const constrain=()=>{const mw=this.w.mapWidth*this.cam.s,mh=this.w.mapHeight*this.cam.s,m=80; this.cam.x=mw+m*2<=innerWidth?(innerWidth-mw)/2:clamp(this.cam.x,innerWidth-mw-m,m); this.cam.y=mh+m*2<=innerHeight?(innerHeight-mh)/2:clamp(this.cam.y,innerHeight-mh-m,m);this.syncKingdomDetail();};
      this.canvas.addEventListener('pointerdown',e=>{e.preventDefault();this.canvas.setPointerCapture?.(e.pointerId);pts.set(e.pointerId,{x:e.clientX,y:e.clientY}); if(pts.size===1)drag={x:e.clientX,y:e.clientY,ox:this.cam.x,oy:this.cam.y}; if(pts.size===2){drag=null;const p=[...pts.values()],mx=(p[0].x+p[1].x)/2,my=(p[0].y+p[1].y)/2,d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);pinch={d:Math.max(1,d),s:this.cam.s,wx:(mx-this.cam.x)/this.cam.s,wy:(my-this.cam.y)/this.cam.s};}},{passive:false});
      this.canvas.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;e.preventDefault();pts.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pts.size===1&&drag){this.cam.x=drag.ox+e.clientX-drag.x;this.cam.y=drag.oy+e.clientY-drag.y;constrain();}else if(pts.size===2&&pinch){const p=[...pts.values()],mx=(p[0].x+p[1].x)/2,my=(p[0].y+p[1].y)/2,d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),ns=clamp(pinch.s*d/pinch.d,CAMERA_MIN,CAMERA_MAX);this.cam.s=ns;this.cam.x=mx-pinch.wx*ns;this.cam.y=my-pinch.wy*ns;constrain();}},{passive:false});
      const end=e=>{pts.delete(e.pointerId);if(pts.size===1){const p=[...pts.values()][0];drag={x:p.x,y:p.y,ox:this.cam.x,oy:this.cam.y};}else drag=null;if(pts.size<2)pinch=null;}; this.canvas.addEventListener('pointerup',end);this.canvas.addEventListener('pointercancel',end);
      this.canvas.addEventListener('wheel',e=>{e.preventDefault();const ns=clamp(this.cam.s*(e.deltaY>0?.9:1.1),CAMERA_MIN,CAMERA_MAX),wx=(e.clientX-this.cam.x)/this.cam.s,wy=(e.clientY-this.cam.y)/this.cam.s;this.cam.x=e.clientX-wx*ns;this.cam.y=e.clientY-wy*ns;this.cam.s=ns;constrain();},{passive:false});
    }
    buildingScale(type, img, multiplier = 1) { return ((BUILD_HEIGHT[type] || 46) / Math.max(1, img.height)) * multiplier; }
    farmerScale(action) { const m = this.nm.actions[action] || this.nm.actions.idle; return FARMER_WORLD_HEIGHT / Math.max(1, m.visualHeight || m.frameHeight); }
    async addNeutralVillage(v, sx, sy) { const defs = [['keep', 0, 0, .78], ['house_a', -42, 27, .82], ['farm', 43, 31, .78], ['warehouse', 2, 42, .78]]; for (const [t, ox, oy, mul] of defs) this.entities.push({ type: 'building', img: this.images[t], x: sx + ox, y: sy + oy, scale: this.buildingScale(t, this.images[t], mul), alpha: .84 }); }
    async addKingdom(k) { const [x, y] = this.sim.iso(...k.capital); this.labels.push({ k, x, y: y - 72 }); }
    async addBuilding(k, b) { this.entities.push({ type: 'building', img: this.images[b.type] || this.images.house_a, x: b.sx, y: b.sy, scale: this.buildingScale(b.type, this.images[b.type] || this.images.house_a), alpha: 1, b }); }
    async addFarmer(k, f) { this.farmers.push({ f, k }); }
    removeFarmer(f) { this.farmers = this.farmers.filter(entry => entry.f !== f); }
    damageBuilding(b, damage) { if (b) b.damageState = (b.hp / b.maxHp) < .35 ? 2 : 1; }
    destroyBuilding(b) { this.entities = this.entities.filter(e => e.b !== b); }
    frontImpact() {}
    setFarmerAction(f, action) { if (action !== 'walk') f._canvasAction = action; }
    updateFarmer(f, dx, dy) { if (f.action === 'walk') f._canvasAction = Math.abs(dx)>Math.abs(dy)?(dx<0?'walk_left':'walk_right'):(dy<0?'walk_up':'walk_down'); }
    redrawTerritories() {} startWar() {} endWar() {} updateWars() {} puff() {} battleFx() {} supportFx() {} eliminate() {} selectKingdom() {}
    draw(t) {
      const c = this.ctx, s = this.cam.s; c.save(); c.setTransform((devicePixelRatio || 1) * s, 0, 0, (devicePixelRatio || 1) * s, (devicePixelRatio || 1) * this.cam.x, (devicePixelRatio || 1) * this.cam.y); c.imageSmoothingEnabled = false;
      c.clearRect(-this.cam.x / s, -this.cam.y / s, innerWidth / s, innerHeight / s); c.drawImage(this.map, 0, 0);
      for (const k of this.sim.kingdoms) { if (!k.alive) continue; c.fillStyle = k.css + '20'; c.strokeStyle = k.css; c.lineWidth = 2 / s; for (const st of k.territory) { const [x, y] = st.split(',').map(Number), [cx, cy] = this.sim.iso(x, y), tw = this.w.tileW, th = this.w.tileH; c.beginPath(); c.moveTo(cx, cy - th / 2); c.lineTo(cx + tw / 2, cy); c.lineTo(cx, cy + th / 2); c.lineTo(cx - tw / 2, cy); c.closePath(); c.fill(); c.stroke(); } }
      const depth = this.entities.map(e=>({kind:'entity',y:e.y,e}));
      for (const {f} of this.farmers) depth.push({kind:'farmer',y:f.y,f});
      depth.sort((a,b)=>a.y-b.y || (a.kind==='farmer'?-1:1));
      for (const it of depth) {
        if (it.kind==='entity') {
          const e=it.e;if(!e.img)continue;c.globalAlpha=e.alpha??1;
          if(e.b){const base=BUILD_BASE[e.b.type]||[16,5],bw=base[0],bh=base[1];c.beginPath();c.moveTo(e.x,e.y-bh);c.lineTo(e.x+bw,e.y);c.lineTo(e.x,e.y+bh);c.lineTo(e.x-bw,e.y);c.closePath();c.fillStyle='#8c7655';c.fill();c.strokeStyle='#3f3529';c.lineWidth=1;c.stroke();}
          const w=e.img.width*e.scale,h=e.img.height*e.scale,anchor=BUILD_ANCHOR_Y[e.b?.type]||.96;c.drawImage(e.img,e.x-w/2,e.y-h*anchor,w,h);c.globalAlpha=1;
        }
        else { const f=it.f, act=f.action==='walk'?(f._canvasAction||'walk_down'):(this.animImgs[f.action]?f.action:'idle'),im=this.animImgs[act],m=this.nm.actions[act],frame=((t*(m.fps||6))|0)%m.frames,fw=m.frameWidth,fh=m.frameHeight,sc=this.farmerScale(act); if(im)c.drawImage(im,frame*fw,0,fw,fh,f.x-fw*sc/2,f.y-fh*sc,fw*sc,fh*sc); }
      }
      c.font = 'bold 11px Arial'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = '#071015'; c.fillStyle = 'white'; for (const l of this.labels) { if (!l.k.alive) continue; c.strokeText(l.k.name, l.x, l.y); c.fillText(l.k.name, l.x, l.y); } c.restore();
    }
  }

  async function boot() {
    try {
      const [world, bm, nm] = await Promise.all([
        fetch('assets/map/world.json').then(r => r.json()),
        fetch('assets/buildings/manifest.json').then(r => r.json()),
        fetch('assets/npc/manifest.json').then(r => r.json())
      ]);
      const renderer = window.PIXI ? new PixiRenderer(world, bm, nm) : new CanvasRenderer(world, bm, nm);
      if (!window.PIXI) toast('Canvas compatibility mode — PixiJS unavailable');
      const sim = new Simulation(world, renderer); window.__SIM = sim; await sim.init(); wire(sim, renderer); setInterval(() => sim.tick(), 1000); fpsCounter();
      $('#loading').style.opacity = '0'; setTimeout(() => $('#loading').remove(), 380); toast('V6.4 LIVING KINGDOMS loaded');
    } catch (err) { console.error(err); $('#loading').innerHTML = `<strong>Startup error</strong><span>${escapeHtml(err.message)}</span>`; }
  }

  function wire(sim, r) {
    $('#closeCard').onclick = () => sim.select(null);
    const hint=$('#touchHint'); if(hint){setTimeout(()=>hint.classList.add('hide'),4200); ['pointerdown','touchstart'].forEach(ev=>document.addEventListener(ev,()=>hint.classList.add('hide'),{once:true,passive:true}));}
    $('#zoomIn').onclick = () => { if (r.root) r.zoomTo(r.root.scale.x * 1.18, innerWidth / 2, innerHeight / 2); else r.cam.s = clamp(r.cam.s * 1.18, CAMERA_MIN, CAMERA_MAX); };
    $('#zoomOut').onclick = () => { if (r.root) r.zoomTo(r.root.scale.x * .84, innerWidth / 2, innerHeight / 2); else r.cam.s = clamp(r.cam.s * .84, CAMERA_MIN, CAMERA_MAX); };
    $('#homeCam').onclick = () => r.home(); $('#toggleTest').onclick = () => $('#testPanel').classList.toggle('collapsed');
    $$('[data-test]').forEach(b => b.onclick = async () => {
      const name = $('#testName').value.trim() || 'Player', act = b.dataset.test;
      if (act === 'join') await sim.join(name);
      else if (act === 'like') { sim.like(name, 20); feed(name, '❤️ ×20'); }
      else if (act === 'follow') { sim.follow(name); feed(name, 'FOLLOW'); }
      else if (act === 'rose') { await sim.gift(name, 'Rose', 1); feed(name, '🌹 Rose'); }
      else if (act === 'ice') { await sim.gift(name, 'Ice Cream', 1); feed(name, '🍦 Ice Cream'); }
      else if (act === 'fireworks') { await sim.gift(name, 'Fireworks', 1); feed(name, '🎆 Fireworks'); }
      else if (act === 'car') { await sim.gift(name, 'Sports Car', 1); feed(name, '🏎️ Sports Car'); }
      else if (act === 'galaxy') { await sim.gift(name, 'Galaxy', 1); feed(name, '🌌 Galaxy'); }
      else if (act === 'lion') { await sim.gift(name, 'Lion', 1); feed(name, '🦁 Lion'); }
      else if (act === 'dragon') { await sim.gift(name, 'Dragon', 1); feed(name, '🐉 Dragon'); }
      else if (act === 'universe') { await sim.gift(name, 'Universe', 1); feed(name, '🌠 Universe'); }
      else if (act === 'boost') sim.boost30();
      else if (act === 'attack') { const a = sim.kingdomByName.get(name.toLowerCase()); if (!a) { toast('Create your kingdom with JOIN first'); return; } const target = sim.kingdoms.filter(k => k.alive && k !== a).sort((x, y) => sim.power(y) - sim.power(x))[0]; if (target) { sim.attack(a, target); feed(name, `ATTACK ${target.name}`); } else toast('At least two kingdoms are required'); }
    });
    const chatForm = $('#chatForm');
    if (chatForm) chatForm.onsubmit = async e => { e.preventDefault(); const v = $('#chatInput').value.trim(); if (!v) return; $('#chatInput').value = ''; const name = $('#testName').value.trim() || 'Player'; await processComment(sim, name, v); };
    window.TikTokGodWorld = { emit: e => handleEvent(sim, e), join: n => sim.join(n), like: (n, c) => sim.like(n, c), follow: n => sim.follow(n), gift: (n, g, c, m) => sim.gift(n, g, c, m), attack: (a, b) => { const ka = sim.kingdomByName.get(String(a).toLowerCase()), kb = sim.kingdomByName.get(String(b).toLowerCase()); return sim.attack(ka, kb); } };
    window.addEventListener('tiktok-event', e => handleEvent(sim, e.detail || {}));
  }

  async function processComment(sim, user, comment) {
    feed(user, comment); const c = comment.trim();
    if (/^join$/i.test(c)) return sim.join(user);
    const m = c.match(/^attack\s+@?(.+)$/i);
    if (m) { const a = sim.kingdomByName.get(user.toLowerCase()), b = sim.kingdomByName.get(m[1].trim().toLowerCase()); if (!a) return toast(`${user}: type JOIN first`); if (!b) return toast(`Kingdom ${m[1].trim()} not found`); return sim.attack(a, b); }
    if (/^expand$/i.test(c)) { const k = sim.kingdomByName.get(user.toLowerCase()); if (k) { k.resources.food += 10; k.resources.wood += 8; k.lastExpand = 0; } }
  }
  async function handleEvent(sim, raw) {
    const e = raw?.data && typeof raw.data === 'object' ? { ...raw, ...raw.data } : raw;
    const type = String(e.type || e.event || e.eventType || e.event_name || '').toLowerCase();
    const user = String(e.username || e.uniqueId || e.user?.uniqueId || e.user?.nickname || e.nickname || 'Viewer');
    if (type.includes('comment') || e.comment || e.message) return processComment(sim, user, String(e.comment || e.message || e.text || ''));
    if (type.includes('like')) return sim.like(user, e.count || e.likeCount || e.repeatCount || 1);
    if (type.includes('follow')) return sim.follow(user);
    if (type.includes('gift')) return sim.gift(user, e.giftName || e.gift?.name || e.name || 'gift', e.repeatCount || e.count || 1, { diamonds: e.diamondCount || e.diamond_count || e.gift?.diamondCount || e.gift?.diamond_count || 0 });
  }
  function connectBridge(sim) {
    const q = new URLSearchParams(location.search), url = q.get('bridge') || localStorage.getItem('godworld_bridge') || '';
    if (!url) { UI.bridgeText.textContent = 'bridge ready'; UI.bridgeDot.style.background = '#d39d34'; return; }
    let ws;
    const go = () => { try { ws = new WebSocket(url); ws.onopen = () => { UI.bridgeText.textContent = 'TikTok bridge online'; UI.bridgeDot.style.background = '#45d66d'; localStorage.setItem('godworld_bridge', url); }; ws.onmessage = m => { try { handleEvent(sim, JSON.parse(m.data)); } catch {} }; ws.onclose = () => { UI.bridgeText.textContent = 'bridge reconnecting'; UI.bridgeDot.style.background = '#b33'; setTimeout(go, 5000); }; ws.onerror = () => ws.close(); } catch { setTimeout(go, 5000); } };
    go();
  }
  function fpsCounter() { let frames = 0, last = performance.now(); const loop = now => { frames++; if (now - last >= 1000) { UI.fps.textContent = `${Math.round(frames * 1000 / (now - last))} FPS`; frames = 0; last = now; } requestAnimationFrame(loop); }; requestAnimationFrame(loop); }

  window.__BUILD_VERSION = '6.4-living-kingdoms';
  boot();
})();
