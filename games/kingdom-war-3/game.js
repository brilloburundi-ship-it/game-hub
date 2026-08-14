(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const W = canvas.width = 900;
  const H = canvas.height = 1400;
  ctx.imageSmoothingEnabled = false;

  const ASSET = '../kingdom-war-2/assets/';
  const PATHS = {
    world: 'map/world.png',
    castle: 'buildings/castle.png', gate: 'buildings/gate.png', wall: 'buildings/wall.png', wall_corner: 'buildings/wall_corner.png',
    tower: 'buildings/stone_tower.png', barracks: 'buildings/barracks.png', farm: 'buildings/farm.png', market: 'buildings/market.png',
    house: 'buildings/house_a.png', forge: 'buildings/forge.png', church: 'buildings/church.png', windmill: 'buildings/windmill.png',
    peasant: 'minifolks/villagers/MiniPeasant.png', worker: 'minifolks/villagers/MiniWorker.png', villagerMan: 'minifolks/villagers/MiniVillagerMan.png', villagerWoman: 'minifolks/villagers/MiniVillagerWoman.png',
    sword: 'minifolks/humans/MiniSwordMan.png', spear: 'minifolks/humans/MiniSpearMan.png', archer: 'minifolks/humans/MiniArcherMan.png', shield: 'minifolks/humans/MiniShieldMan.png', cavalier: 'minifolks/humans/MiniCavalierMan.png'
  };
  const images = {};
  let assetsReady = false;
  Promise.all(Object.entries(PATHS).map(([key, path]) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => { images[key] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = ASSET + path;
  }))).then(() => { assetsReady = true; });

  const ui = {
    phase: document.querySelector('#phase'), roundInfo: document.querySelector('#roundInfo'), fps: document.querySelector('#fps'),
    northCard: document.querySelector('#northCard'), southCard: document.querySelector('#southCard'),
    northName: document.querySelector('#northName'), southName: document.querySelector('#southName'), northStreak: document.querySelector('#northStreak'), southStreak: document.querySelector('#southStreak'),
    northLife: document.querySelector('#northLife'), southLife: document.querySelector('#southLife'), northPop: document.querySelector('#northPop'), southPop: document.querySelector('#southPop'),
    northArmy: document.querySelector('#northArmy'), southArmy: document.querySelector('#southArmy'), northWood: document.querySelector('#northWood'), southWood: document.querySelector('#southWood'),
    northStone: document.querySelector('#northStone'), southStone: document.querySelector('#southStone'), northGold: document.querySelector('#northGold'), southGold: document.querySelector('#southGold'),
    shield: document.querySelector('#shieldBanner'), event: document.querySelector('#eventBanner')
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const fmt = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.max(0, Math.floor(n))}`;
  const COLORS = ['#55a7ff', '#ef6262', '#f2c95a', '#7bd58c', '#d26df0', '#69d7d0', '#ff9d56', '#e6e8ee'];

  const BUILD_HP = { castle: 2200, gate: 1000, wall: 620, tower: 900, barracks: 780, farm: 520, market: 580, house: 500, forge: 720, church: 620, windmill: 560, port: 850 };
  const BUILD_COST = { gate: [50, 85, 0], wall: [28, 55, 0], tower: [35, 75, 8], barracks: [75, 60, 15], farm: [55, 15, 0], market: [65, 30, 20], house: [50, 18, 0], forge: [75, 80, 20], church: [60, 65, 20], windmill: [70, 25, 5] };
  const BUILD_SCALE = { castle: .62, gate: .42, wall: .43, wall_corner: .46, tower: .48, barracks: .55, farm: .52, market: .52, house: .52, forge: .52, church: .52, windmill: .54 };

  const state = {
    time: 0, phase: 'waiting', round: 0, kingdoms: [null, null], queue: [], prep: 0, winnerPause: 0,
    particles: [], projectiles: [], screenShake: 0, lastEconomy: 0, lastUI: 0, eventTimer: 0, fps: 60
  };

  function announce(text, seconds = 2.3) {
    ui.event.textContent = text;
    ui.event.classList.add('show');
    state.eventTimer = seconds;
  }

  function building(type, x, y, rot = 0, status = 'planned', priority = 1) {
    return { id: `${type}-${Math.random().toString(36).slice(2, 8)}`, type, x, y, rot, hp: status === 'alive' ? BUILD_HP[type] : 0, maxHp: BUILD_HP[type], status, progress: status === 'alive' ? 1 : 0, priority, paid: status === 'alive' };
  }

  function fortressBlueprint(slot, anchor) {
    const dir = slot === 0 ? 1 : -1;
    const out = [
      building('castle', anchor.x, anchor.y, 0, 'alive', 0),
      building('port', slot === 0 ? 115 : 785, anchor.y + dir * 10, 0, 'alive', 0),
      building('gate', anchor.x, anchor.y + dir * 145, 0, 'planned', 0),
      building('tower', anchor.x - 180, anchor.y - dir * 105, 0, 'planned', 0), building('tower', anchor.x + 180, anchor.y - dir * 105, 0, 'planned', 0),
      building('tower', anchor.x - 180, anchor.y + dir * 120, 0, 'planned', 0), building('tower', anchor.x + 180, anchor.y + dir * 120, 0, 'planned', 0)
    ];
    for (const x of [-125, -62, 0, 62, 125]) out.push(building('wall', anchor.x + x, anchor.y - dir * 112, 0, 'planned', 0));
    for (const x of [-126, -65, 65, 126]) out.push(building('wall', anchor.x + x, anchor.y + dir * 135, 0, 'planned', 0));
    for (const y of [-68, -15, 40, 92]) {
      out.push(building('wall', anchor.x - 174, anchor.y + dir * y, Math.PI / 2, 'planned', 0));
      out.push(building('wall', anchor.x + 174, anchor.y + dir * y, Math.PI / 2, 'planned', 0));
    }
    out.push(building('farm', anchor.x - 92, anchor.y - dir * 20, 0, 'planned', 2));
    out.push(building('house', anchor.x + 92, anchor.y - dir * 18, 0, 'planned', 2));
    out.push(building('barracks', anchor.x - 92, anchor.y + dir * 52, 0, 'planned', 1));
    out.push(building('market', anchor.x + 92, anchor.y + dir * 52, 0, 'planned', 2));
    out.push(building('forge', anchor.x, anchor.y - dir * 70, 0, 'planned', 3));
    return out;
  }

  function createKingdom(name, slot) {
    const anchor = slot === 0 ? { x: 450, y: 250 } : { x: 450, y: 1150 };
    const color = COLORS[(state.round + slot * 3) % COLORS.length];
    const k = {
      id: `${Date.now()}-${slot}`, name: String(name || 'Player').trim().slice(0, 18) || 'Player', slot, color, anchor,
      resources: { food: 260, wood: 310, stone: 240, gold: 75 }, population: 12, popCap: 18, military: 18, siege: 0,
      buildings: fortressBlueprint(slot, anchor), civilians: [], units: [], pendingReinforcements: 0, trainPool: 0,
      shield: true, shieldPulse: 0, wins: 0, alive: true, buildClock: 0, spawnClock: 0, mobilized: false, giftPower: 0, repairBoost: 0
    };
    const civKinds = ['peasant', 'worker', 'villagerMan', 'villagerWoman'];
    for (let i = 0; i < 12; i++) {
      k.civilians.push({
        x: anchor.x + rand(-105, 105), y: anchor.y + rand(-75, 75), tx: anchor.x + rand(-105, 105), ty: anchor.y + rand(-75, 75),
        speed: rand(16, 25), wait: rand(0, 2), kind: civKinds[i % civKinds.length], hidden: false, state: 'roam', phase: Math.random() * 6
      });
    }
    return k;
  }

  function getBuilding(k, type) { return k?.buildings.find(b => b.type === type && b.status === 'alive' && b.hp > 0); }
  function countBuilding(k, type) { return k?.buildings.filter(b => b.type === type && b.status === 'alive' && b.hp > 0).length || 0; }
  function livingStructures(k) { return k?.buildings.filter(b => b.status === 'alive' && b.hp > 0) || []; }
  function fortressLife(k) {
    if (!k?.alive) return 0;
    const relevant = k.buildings.filter(b => b.status !== 'planned');
    const max = relevant.reduce((s, b) => s + b.maxHp, 0) || 1;
    return clamp(relevant.reduce((s, b) => s + Math.max(0, b.hp), 0) / max, 0, 1);
  }

  function join(name) {
    name = String(name || 'Player').trim().slice(0, 18) || 'Player';
    for (const k of state.kingdoms) if (k?.alive && k.name.toLowerCase() === name.toLowerCase()) { announce(`${name} is already in the arena`); return k; }
    const open = state.kingdoms.findIndex(k => !k?.alive);
    if (open < 0) {
      if (!state.queue.some(n => n.toLowerCase() === name.toLowerCase())) state.queue.push(name);
      announce(`${name} queued as next challenger`);
      return null;
    }
    const k = createKingdom(name, open);
    state.kingdoms[open] = k;
    state.round++;
    announce(open === 0 && !state.kingdoms[1] ? `👑 ${name} founded the champion fortress` : `⚔ ${name} enters as challenger`, 3);
    if (state.kingdoms.filter(Boolean).length === 1) {
      state.phase = 'waiting';
      k.shield = true;
    } else {
      state.phase = 'prep';
      state.prep = 35;
      for (const side of state.kingdoms) if (side) side.shield = true;
    }
    updateUI();
    return k;
  }

  function economyTick(k) {
    if (!k?.alive) return;
    const farms = countBuilding(k, 'farm'), markets = countBuilding(k, 'market'), houses = countBuilding(k, 'house'), barracks = countBuilding(k, 'barracks'), forge = countBuilding(k, 'forge');
    k.resources.food += 2.4 + farms * 3.8 + k.population * .08;
    k.resources.wood += 1.7 + k.population * .05;
    k.resources.stone += 1.1 + forge * .45;
    k.resources.gold += .55 + markets * 1.35;
    k.resources.food = Math.max(0, k.resources.food - k.population * .045);
    k.popCap = 18 + houses * 7;
    if (k.population < k.popCap && k.resources.food > 90 && Math.random() < .22) { k.population++; k.resources.food -= 30; }
    k.military += barracks * .12 + forge * .08;
    if (state.phase !== 'war' && state.phase !== 'mobilize') k.trainPool = Math.min(80, k.trainPool + .35 + barracks * .22);
  }

  function processConstruction(k, dt) {
    if (!k?.alive || state.phase === 'war' || state.phase === 'mobilize') return;
    k.buildClock -= dt;
    if (k.buildClock > 0) return;
    let active = k.buildings.find(b => b.status === 'building');
    if (!active) {
      active = k.buildings.filter(b => b.status === 'planned').sort((a, b) => a.priority - b.priority)[0];
      if (!active) return;
      const cost = BUILD_COST[active.type] || [0, 0, 0];
      if (k.resources.wood < cost[0] || k.resources.stone < cost[1] || k.resources.gold < cost[2]) return;
      k.resources.wood -= cost[0]; k.resources.stone -= cost[1]; k.resources.gold -= cost[2];
      active.status = 'building'; active.progress = .05; active.paid = true;
    }
    active.progress = clamp(active.progress + dt * (.16 + k.population * .0025), 0, 1);
    active.hp = active.maxHp * active.progress;
    if (active.progress >= 1) { active.status = 'alive'; active.hp = active.maxHp; announce(`${k.name} completed ${active.type}`); }
    k.buildClock = .25;
  }

  function repair(k, amount, rebuild = 0) {
    if (!k?.alive) return;
    const damaged = k.buildings.filter(b => b.status === 'alive' && b.hp > 0 && b.hp < b.maxHp).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
    let left = amount;
    for (const b of damaged) {
      const add = Math.min(left, b.maxHp - b.hp);
      b.hp += add; left -= add;
      if (left <= 0) break;
    }
    const destroyed = k.buildings.filter(b => b.status === 'destroyed' && b.type !== 'castle');
    for (let i = 0; i < rebuild && destroyed.length; i++) {
      const b = destroyed.shift();
      b.status = 'building'; b.progress = .42; b.hp = b.maxHp * .42; b.paid = true;
      announce(`🔨 ${k.name} rebuilds ${b.type}`);
    }
  }

  function like(name, count = 1) {
    const k = findKingdom(name); if (!k) return;
    const n = Math.max(1, Number(count) || 1);
    k.resources.food += n * .55;
    repair(k, n * .75, 0);
    if (state.phase === 'war') k.pendingReinforcements += Math.floor(n / 80);
  }

  function follow(name) {
    const k = findKingdom(name); if (!k) return;
    k.resources.food += 100; k.resources.wood += 85; k.resources.stone += 45; k.population = Math.min(k.popCap, k.population + 2); k.military += 5;
    repair(k, 90, 0); announce(`➕ ${k.name} receives new settlers`);
  }

  function giftFallback(name) {
    const g = String(name || '').toLowerCase();
    if (g.includes('rose')) return 1; if (g.includes('ice') || g.includes('heart')) return 5; if (g.includes('coffee')) return 15;
    if (g.includes('firework') || g.includes('tiktok')) return 50; if (g.includes('money') || g.includes('train')) return 180;
    if (g.includes('car') || g.includes('yacht') || g.includes('jet')) return 600; if (g.includes('lion') || g.includes('galaxy') || g.includes('universe') || g.includes('dragon')) return 1500;
    return 8;
  }

  function gift(name, giftName = 'Gift', repeat = 1, meta = {}) {
    const k = findKingdom(name); if (!k) return;
    const explicit = [meta?.diamonds, meta?.diamondCount, meta?.giftValue, meta?.value].map(Number).find(v => Number.isFinite(v) && v > 0);
    const value = Math.max(1, explicit || giftFallback(giftName)) * Math.max(1, Number(repeat) || 1);
    k.resources.food += value * 1.2; k.resources.wood += value * 1.05; k.resources.stone += value * .72; k.resources.gold += value * .55;
    k.military += Math.sqrt(value) * 1.65;
    k.siege += Math.sqrt(value) * .7;
    k.giftPower += value;
    repair(k, 35 + value * .7, value >= 1000 ? 2 : value >= 120 ? 1 : 0);
    if (state.phase === 'war') {
      const reinforcements = clamp(Math.ceil(Math.log2(value + 1) * 1.35), 1, 14);
      k.pendingReinforcements += reinforcements;
      if (value >= 500) k.shieldPulse = Math.max(k.shieldPulse, 3.5);
      announce(`🎁 ${k.name}: +${reinforcements} reinforcements`, 2.8);
    } else announce(`🎁 ${k.name} accelerates the fortress`, 2.4);
  }

  function findKingdom(name) {
    const key = String(name || '').trim().toLowerCase();
    return state.kingdoms.find(k => k?.alive && k.name.toLowerCase() === key) || null;
  }

  function mobilize() {
    state.phase = 'mobilize';
    for (const k of state.kingdoms) {
      if (!k?.alive) continue;
      k.shield = false; k.mobilized = false;
      for (const c of k.civilians) { c.state = 'toCastle'; c.hidden = false; }
    }
    announce('⚔ Citizens enter the keeps — armies mobilize', 3);
  }

  function startWar() {
    state.phase = 'war';
    for (const k of state.kingdoms) {
      if (!k?.alive) continue;
      k.mobilized = true;
      const base = clamp(26 + Math.floor(k.military * .32) + Math.floor(k.trainPool), 26, 58);
      k.pendingReinforcements += base;
      k.trainPool = 0;
    }
    announce('⚔ SIEGE BEGINS', 3);
  }

  function armyGate(k) {
    const g = getBuilding(k, 'gate');
    if (g) return { x: g.x, y: g.y + (k.slot === 0 ? 26 : -26) };
    return { x: k.anchor.x, y: k.anchor.y + (k.slot === 0 ? 120 : -120) };
  }

  function spawnUnit(k) {
    if (!k?.alive || k.pendingReinforcements <= 0) return;
    const gate = armyGate(k), idx = k.units.length + Math.floor(k.military);
    let role = idx % 6 === 0 ? 'archer' : idx % 4 === 0 ? 'spear' : idx % 11 === 0 ? 'shield' : 'sword';
    if (k.siege > 12 && idx % 17 === 0) role = 'ram';
    const stats = role === 'archer' ? [62, 7, 92, 30] : role === 'spear' ? [82, 10, 20, 34] : role === 'shield' ? [108, 8, 18, 29] : role === 'ram' ? [220, 34, 24, 19] : [76, 10, 18, 36];
    const u = {
      id: `${k.id}-u-${Date.now()}-${Math.random()}`, side: k.slot, role, x: gate.x + rand(-18, 18), y: gate.y + rand(-10, 10), hp: stats[0], maxHp: stats[0], damage: stats[1], range: stats[2],
      speed: stats[3] * rand(.88, 1.12), cooldown: rand(0, .7), retarget: 0, target: null, alive: true, death: 0, phase: Math.random() * 10, lane: rand(-48, 48), spawnDelay: rand(0, .7)
    };
    k.units.push(u); k.pendingReinforcements--;
  }

  function nearestEnemyUnit(u, enemy, maxD = 230) {
    let best = null, bestD = maxD;
    for (const q of enemy.units) {
      if (!q.alive) continue;
      const d = Math.hypot(q.x - u.x, q.y - u.y);
      if (d < bestD) { best = q; bestD = d; }
    }
    return best;
  }

  function nearestSiegeTarget(u, enemy) {
    const gate = getBuilding(enemy, 'gate');
    if (gate) return gate;
    let best = null, bestD = Infinity;
    for (const b of enemy.buildings) {
      if (b.status !== 'alive' || b.hp <= 0 || b.type === 'port') continue;
      if (!['wall', 'tower', 'castle', 'barracks', 'forge', 'market', 'house', 'farm'].includes(b.type)) continue;
      const d = Math.hypot(b.x - u.x, b.y - u.y);
      if (d < bestD) { best = b; bestD = d; }
    }
    return best;
  }

  function addBlood(x, y, color = '#b92c2c') {
    for (let i = 0; i < 4; i++) state.particles.push({ x, y, vx: rand(-28, 28), vy: rand(-35, -5), life: rand(.25, .55), color, size: rand(2, 4) });
  }

  function damageBuilding(enemy, b, amount, attacker) {
    if (!b || b.status !== 'alive' || b.hp <= 0) return;
    if (enemy.shield || enemy.shieldPulse > 0) return;
    b.hp -= amount;
    state.screenShake = Math.max(state.screenShake, amount > 25 ? 4 : 1.5);
    for (let i = 0; i < 3; i++) state.particles.push({ x: b.x + rand(-12, 12), y: b.y + rand(-20, 4), vx: rand(-20, 20), vy: rand(-28, -4), life: rand(.35, .8), color: pick(['#d7bb82', '#81715c', '#4c453c']), size: rand(2, 5) });
    if (b.hp <= 0) {
      b.hp = 0; b.status = 'destroyed';
      announce(`💥 ${enemy.name}'s ${b.type} destroyed`, 2);
      if (b.type === 'castle') defeat(enemy, attacker);
    }
  }

  function attackTarget(k, enemy, u, target, dt) {
    if (!target) return;
    const tx = target.x, ty = target.y, d = Math.hypot(tx - u.x, ty - u.y);
    if (d > u.range) return moveUnit(k, u, tx, ty, dt);
    u.cooldown -= dt;
    if (u.cooldown > 0) return;
    u.cooldown = u.role === 'ram' ? 1.8 : u.role === 'archer' ? 1.25 : rand(.72, 1.05);
    if ('maxHp' in target && 'role' in target) {
      let dmg = u.damage * rand(.82, 1.2);
      if (u.role === 'ram') dmg *= .25;
      target.hp -= dmg; addBlood(target.x, target.y - 8);
      if (u.role === 'archer') state.projectiles.push({ x: u.x, y: u.y - 12, tx: target.x, ty: target.y - 10, life: .24 });
      if (target.hp <= 0) { target.alive = false; target.death = 1.2; k.military += .04; }
    } else {
      let dmg = u.damage * (u.role === 'ram' ? 1.45 : u.role === 'spear' ? .85 : u.role === 'archer' ? .55 : .72);
      if (getBuilding(k, 'forge')) dmg *= 1.08;
      damageBuilding(enemy, target, dmg, k);
      if (u.role === 'archer') state.projectiles.push({ x: u.x, y: u.y - 12, tx: target.x, ty: target.y - 20, life: .28 });
    }
  }

  function moveUnit(k, u, tx, ty, dt) {
    let dx = tx - u.x, dy = ty - u.y;
    const d = Math.max(.001, Math.hypot(dx, dy));
    dx /= d; dy /= d;
    dx += Math.sin(state.time * 1.7 + u.phase) * .08;
    const allies = k.units;
    for (let i = 0, seen = 0; i < allies.length && seen < 10; i += 3) {
      const q = allies[i]; if (!q?.alive || q === u) continue;
      const qd = Math.hypot(u.x - q.x, u.y - q.y);
      if (qd > 0 && qd < 18) { dx += (u.x - q.x) / qd * .32; dy += (u.y - q.y) / qd * .32; seen++; }
    }
    const len = Math.max(.001, Math.hypot(dx, dy)); dx /= len; dy /= len;
    const step = Math.min(d, u.speed * dt);
    u.x += dx * step; u.y += dy * step;
  }

  function updateUnits(k, enemy, dt) {
    if (!k?.alive || !enemy?.alive) return;
    k.spawnClock -= dt;
    if (k.pendingReinforcements > 0 && k.spawnClock <= 0) { spawnUnit(k); k.spawnClock = .11; }
    for (const u of k.units) {
      if (!u.alive) { u.death -= dt; continue; }
      if (u.spawnDelay > 0) { u.spawnDelay -= dt; continue; }
      u.retarget -= dt;
      if (u.retarget <= 0 || !u.target || (u.target.role && !u.target.alive) || (u.target.status && u.target.status !== 'alive')) {
        u.target = nearestEnemyUnit(u, enemy, u.role === 'archer' ? 290 : 205) || nearestSiegeTarget(u, enemy);
        u.retarget = rand(.28, .62);
      }
      if (u.target) attackTarget(k, enemy, u, u.target, dt);
    }
    k.units = k.units.filter(u => u.alive || u.death > 0);
  }

  function updateCivilians(k, dt) {
    if (!k?.alive) return;
    for (const c of k.civilians) {
      c.phase += dt;
      if (c.hidden) continue;
      if (c.state === 'toCastle') {
        const dx = k.anchor.x - c.x, dy = k.anchor.y - c.y, d = Math.hypot(dx, dy);
        if (d < 12) { c.hidden = true; c.state = 'inside'; continue; }
        c.x += dx / Math.max(1, d) * 38 * dt; c.y += dy / Math.max(1, d) * 38 * dt;
        continue;
      }
      c.wait -= dt;
      if (c.wait <= 0 || Math.hypot(c.tx - c.x, c.ty - c.y) < 4) {
        c.tx = k.anchor.x + rand(-125, 125); c.ty = k.anchor.y + rand(-82, 82); c.wait = rand(1.5, 4.5);
      }
      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      if (d > 3) { c.x += dx / d * c.speed * dt; c.y += dy / d * c.speed * dt; }
    }
  }

  function allCiviliansInside() {
    return state.kingdoms.filter(Boolean).every(k => k.civilians.every(c => c.hidden));
  }

  function reviveCivilians(k) {
    if (!k?.alive) return;
    for (const c of k.civilians) {
      c.hidden = false; c.state = 'roam'; c.x = k.anchor.x + rand(-20, 20); c.y = k.anchor.y + rand(-15, 15); c.tx = k.anchor.x + rand(-120, 120); c.ty = k.anchor.y + rand(-80, 80); c.wait = rand(0, 2);
    }
  }

  function retreatUnits(k) {
    if (!k?.alive) return;
    for (const u of k.units) { if (u.alive) { u.retreat = true; u.target = null; } }
  }

  function defeat(loser, winner) {
    if (!loser?.alive || state.phase === 'victory') return;
    loser.alive = false;
    state.phase = 'victory'; state.winnerPause = 6;
    if (winner?.alive) {
      winner.wins++; winner.shield = true; winner.resources.food += 160; winner.resources.wood += 140; winner.resources.stone += 110; winner.resources.gold += 70;
      repair(winner, 520, 2); retreatUnits(winner);
    }
    announce(`🏆 ${winner?.name || 'Champion'} WINS — SHIELD ACTIVE`, 5);
  }

  function finishVictory() {
    const winnerIndex = state.kingdoms.findIndex(k => k?.alive);
    if (winnerIndex < 0) { state.kingdoms = [null, null]; state.phase = 'waiting'; return; }
    const winner = state.kingdoms[winnerIndex];
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    state.kingdoms[loserIndex] = null;
    winner.units.length = 0; winner.pendingReinforcements = 0; winner.mobilized = false; winner.shield = true;
    reviveCivilians(winner);
    state.phase = 'waiting';
    announce(`${winner.name} remains champion — next challenger JOIN`, 4);
    if (state.queue.length) setTimeout(() => join(state.queue.shift()), 500);
  }

  function update(dt) {
    state.time += dt;
    if (state.eventTimer > 0) { state.eventTimer -= dt; if (state.eventTimer <= 0) ui.event.classList.remove('show'); }
    for (const k of state.kingdoms) if (k?.alive) {
      if (k.shieldPulse > 0) k.shieldPulse -= dt;
      processConstruction(k, dt); updateCivilians(k, dt);
    }
    if (state.time - state.lastEconomy >= 1) {
      state.lastEconomy = state.time;
      for (const k of state.kingdoms) economyTick(k);
    }
    if (state.phase === 'prep') {
      state.prep -= dt;
      if (state.prep <= 0) mobilize();
    } else if (state.phase === 'mobilize') {
      if (allCiviliansInside()) startWar();
    } else if (state.phase === 'war') {
      const a = state.kingdoms[0], b = state.kingdoms[1];
      if (a?.alive && b?.alive) { updateUnits(a, b, dt); updateUnits(b, a, dt); }
    } else if (state.phase === 'victory') {
      state.winnerPause -= dt;
      const winner = state.kingdoms.find(k => k?.alive);
      if (winner) {
        const gate = armyGate(winner);
        for (const u of winner.units) if (u.alive) moveUnit(winner, u, gate.x, gate.y, dt);
      }
      if (state.winnerPause <= 0) finishVictory();
    }
    updateFx(dt);
    if (state.time - state.lastUI > .2) { state.lastUI = state.time; updateUI(); }
  }

  function updateFx(dt) {
    for (const p of state.particles) { p.life -= dt; p.vy += 55 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    state.particles = state.particles.filter(p => p.life > 0);
    for (const a of state.projectiles) { a.life -= dt; const t = clamp(1 - a.life / .28, 0, 1); a.x += (a.tx - a.x) * Math.min(1, dt * 10); a.y += (a.ty - a.y) * Math.min(1, dt * 10); a.arc = Math.sin(t * Math.PI) * 14; }
    state.projectiles = state.projectiles.filter(a => a.life > 0);
    state.screenShake *= Math.pow(.06, dt);
  }

  function drawBackground() {
    if (images.world) {
      const iw = images.world.width, ih = images.world.height;
      const sw = iw * .52, sh = ih * .78;
      ctx.drawImage(images.world, (iw - sw) * .5, (ih - sh) * .48, sw, sh, 0, 0, W, H);
    } else { ctx.fillStyle = '#496b3e'; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = '#071a17'; ctx.globalAlpha = .16; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    ctx.fillStyle = '#17475b'; ctx.fillRect(0, 0, 72, H); ctx.fillRect(W - 72, 0, 72, H);
    ctx.fillStyle = '#255d6d';
    for (let y = 20; y < H; y += 38) { ctx.fillRect(12 + (y % 70), y, 24, 2); ctx.fillRect(W - 58 + (y % 32), y + 12, 20, 2); }
    ctx.fillStyle = '#7d744f55'; ctx.fillRect(390, 420, 120, 560);
    ctx.fillStyle = '#b09b6640'; for (let y = 440; y < 970; y += 34) ctx.fillRect(414 + ((y / 34) % 2) * 18, y, 72, 8);
    drawForests();
  }

  const forestPoints = (() => {
    const pts = [];
    for (let i = 0; i < 64; i++) {
      const left = i % 2 === 0;
      pts.push({ x: left ? rand(82, 265) : rand(635, 818), y: rand(120, 1280), pine: i % 3 !== 0, s: rand(.75, 1.25) });
    }
    return pts;
  })();

  function drawTree(t) {
    ctx.save(); ctx.translate(t.x, t.y); ctx.scale(t.s, t.s);
    ctx.fillStyle = '#3a291d'; ctx.fillRect(-3, -3, 6, 22);
    if (t.pine) {
      ctx.fillStyle = '#183e27'; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(-18, 5); ctx.lineTo(18, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#28563a'; ctx.beginPath(); ctx.moveTo(-2, -24); ctx.lineTo(-14, -1); ctx.lineTo(10, -1); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#244a2c'; ctx.fillRect(-15, -25, 30, 24); ctx.fillRect(-22, -15, 44, 18); ctx.fillStyle = '#35643a'; ctx.fillRect(-12, -29, 22, 10); ctx.fillRect(-18, -19, 14, 9);
    }
    ctx.restore();
  }
  function drawForests() { for (const t of forestPoints) drawTree(t); }

  function drawPort(b, k) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.globalAlpha = b.status === 'building' ? .45 + b.progress * .55 : b.status === 'destroyed' ? .32 : 1;
    ctx.fillStyle = '#5b3b25'; ctx.fillRect(-42, -8, 84, 18); ctx.fillStyle = '#8a6240'; for (let x = -38; x <= 34; x += 12) ctx.fillRect(x, -8, 7, 18);
    ctx.fillStyle = '#3b271b'; ctx.fillRect(-38, 10, 6, 24); ctx.fillRect(30, 10, 6, 24);
    ctx.fillStyle = k.color; ctx.fillRect(-3, -48, 5, 42); ctx.fillStyle = '#e4dfc0'; ctx.beginPath(); ctx.moveTo(2, -44); ctx.lineTo(28, -27); ctx.lineTo(2, -18); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBuilding(b, k) {
    if (b.status === 'planned') return;
    if (b.type === 'port') return drawPort(b, k);
    const key = b.type === 'tower' ? 'tower' : b.type;
    const img = images[key];
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot || 0);
    let alpha = 1;
    if (b.status === 'building') alpha = .25 + b.progress * .75;
    if (b.status === 'destroyed') alpha = .25;
    ctx.globalAlpha = alpha;
    if (img) {
      const sc = BUILD_SCALE[key] || .5, dw = img.width * sc, dh = img.height * sc;
      ctx.drawImage(img, -dw / 2, -dh * .86, dw, dh);
    } else {
      ctx.fillStyle = b.status === 'destroyed' ? '#4c4238' : '#8c7655'; ctx.fillRect(-24, -35, 48, 35);
    }
    ctx.restore();
    if (b.status === 'destroyed') { ctx.fillStyle = '#271b16'; ctx.fillRect(b.x - 20, b.y - 5, 40, 7); return; }
    ctx.fillStyle = k.color; ctx.fillRect(b.x - 11, b.y - 46, 22, 5);
    if (b.hp < b.maxHp) { ctx.fillStyle = '#210d0d'; ctx.fillRect(b.x - 22, b.y + 4, 44, 4); ctx.fillStyle = '#d45a4f'; ctx.fillRect(b.x - 22, b.y + 4, 44 * clamp(b.hp / b.maxHp, 0, 1), 4); }
  }

  function drawSprite(img, x, y, frame, scale = 1, flip = false) {
    if (!img) { ctx.fillStyle = '#efe0b6'; ctx.fillRect(x - 4, y - 12, 8, 12); return; }
    const cell = 32, cols = Math.max(1, Math.floor(img.width / cell)), f = frame % Math.min(cols, 4);
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1); ctx.drawImage(img, f * cell, 0, cell, cell, -cell * scale / 2, -cell * scale, cell * scale, cell * scale); ctx.restore();
  }

  function drawCivilians(k) {
    if (!k?.alive) return;
    for (const c of k.civilians) {
      if (c.hidden) continue;
      const frame = Math.floor((state.time * 5 + c.phase) % 4); const flip = c.tx < c.x;
      ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
      drawSprite(images[c.kind], c.x, c.y, frame, 1.05, flip);
    }
  }

  function unitImage(role) { return role === 'archer' ? images.archer : role === 'spear' ? images.spear : role === 'shield' ? images.shield : role === 'ram' ? null : images.sword; }
  function drawUnit(u, k, enemy) {
    if (u.spawnDelay > 0) return;
    if (!u.alive && u.death <= 0) return;
    ctx.globalAlpha = u.alive ? 1 : clamp(u.death, 0, 1);
    ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(u.x, u.y, u.role === 'ram' ? 15 : 8, u.role === 'ram' ? 5 : 3, 0, 0, Math.PI * 2); ctx.fill();
    if (u.role === 'ram') {
      ctx.fillStyle = '#6d4a2d'; ctx.fillRect(u.x - 19, u.y - 15, 38, 14); ctx.fillStyle = '#9a754b'; ctx.fillRect(u.x - 23, u.y - 12, 46, 5); ctx.fillStyle = '#2c241b'; ctx.fillRect(u.x - 13, u.y - 1, 7, 7); ctx.fillRect(u.x + 7, u.y - 1, 7, 7);
    } else {
      const frame = u.alive ? Math.floor((state.time * (u.cooldown < .2 ? 9 : 6) + u.phase) % 4) : 0;
      drawSprite(unitImage(u.role), u.x, u.y, frame, 1.18, enemy ? enemy.anchor.x < u.x : false);
    }
    ctx.globalAlpha = 1;
    if (u.alive) { ctx.fillStyle = k.color; ctx.fillRect(u.x - 7, u.y - 26, 14, 2); }
  }

  function drawUnits() {
    const draw = [];
    for (const k of state.kingdoms) if (k) for (const u of k.units) draw.push([u.y, u, k]);
    draw.sort((a, b) => a[0] - b[0]);
    for (const [, u, k] of draw) drawUnit(u, k, state.kingdoms[k.slot === 0 ? 1 : 0]);
  }

  function drawFx() {
    for (const p of state.particles) { ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#f2d89a'; ctx.lineWidth = 2;
    for (const a of state.projectiles) { ctx.beginPath(); ctx.moveTo(a.x - 5, a.y - (a.arc || 0)); ctx.lineTo(a.x + 5, a.y - (a.arc || 0)); ctx.stroke(); }
  }

  function drawShield(k) {
    if (!k?.alive || (!k.shield && k.shieldPulse <= 0)) return;
    const pulse = 1 + Math.sin(state.time * 5) * .04;
    ctx.save(); ctx.translate(k.anchor.x, k.anchor.y); ctx.scale(pulse, pulse); ctx.strokeStyle = '#6ed4ff'; ctx.globalAlpha = k.shield ? .55 : .38; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, 0, 220, 175, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#4fc3ff12'; ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
  }

  function render() {
    ctx.save();
    const shakeX = state.screenShake ? rand(-state.screenShake, state.screenShake) : 0, shakeY = state.screenShake ? rand(-state.screenShake, state.screenShake) : 0;
    ctx.translate(shakeX, shakeY);
    drawBackground();
    const buildings = [];
    for (const k of state.kingdoms) if (k) for (const b of k.buildings) buildings.push([b.y, b, k]);
    buildings.sort((a, b) => a[0] - b[0]);
    for (const [, b, k] of buildings) drawBuilding(b, k);
    for (const k of state.kingdoms) { drawShield(k); drawCivilians(k); }
    drawUnits(); drawFx();
    ctx.restore();
  }

  function updateCard(k, prefix) {
    const card = ui[`${prefix}Card`], name = ui[`${prefix}Name`], life = ui[`${prefix}Life`], streak = ui[`${prefix}Streak`];
    if (!k) {
      card.classList.add('empty'); card.style.setProperty('--team', '#888'); name.textContent = 'OPEN SLOT'; streak.textContent = '0 W'; life.style.width = '0%';
      ui[`${prefix}Pop`].textContent = '0'; ui[`${prefix}Army`].textContent = '0'; ui[`${prefix}Wood`].textContent = '0'; ui[`${prefix}Stone`].textContent = '0'; ui[`${prefix}Gold`].textContent = '0'; return;
    }
    card.classList.toggle('empty', !k.alive); card.style.setProperty('--team', k.color); name.textContent = k.name; streak.textContent = `${k.wins} W`; life.style.width = `${fortressLife(k) * 100}%`;
    ui[`${prefix}Pop`].textContent = k.population; ui[`${prefix}Army`].textContent = k.units.filter(u => u.alive).length + k.pendingReinforcements;
    ui[`${prefix}Wood`].textContent = fmt(k.resources.wood); ui[`${prefix}Stone`].textContent = fmt(k.resources.stone); ui[`${prefix}Gold`].textContent = fmt(k.resources.gold);
  }

  function updateUI() {
    updateCard(state.kingdoms[0], 'north'); updateCard(state.kingdoms[1], 'south');
    if (state.phase === 'waiting') { ui.phase.textContent = state.kingdoms.some(k => k?.alive) ? 'CHAMPION WAITING' : 'WAITING FOR JOIN'; ui.roundInfo.textContent = state.queue.length ? `${state.queue.length} challenger queued` : 'Next JOIN enters the open fortress'; }
    else if (state.phase === 'prep') { ui.phase.textContent = `FORTIFY — ${Math.ceil(state.prep)}s`; ui.roundInfo.textContent = 'Build walls • train • repair'; }
    else if (state.phase === 'mobilize') { ui.phase.textContent = 'MOBILIZATION'; ui.roundInfo.textContent = 'Citizens enter • armies deploy'; }
    else if (state.phase === 'war') { ui.phase.textContent = 'LIVE SIEGE'; ui.roundInfo.textContent = 'Gifts = military reinforcements + rebuild'; }
    else { ui.phase.textContent = 'CHAMPION VICTORY'; ui.roundInfo.textContent = `Reset in ${Math.ceil(state.winnerPause)}s`; }
    const champion = state.kingdoms.find(k => k?.alive && k.shield);
    ui.shield.classList.toggle('hidden', !champion); if (champion) ui.shield.textContent = `🛡 ${champion.name.toUpperCase()} — CHAMPION SHIELD`;
  }

  function emit(e = {}) {
    const type = String(e.type || e.event || '').toLowerCase();
    const name = e.uniqueId || e.username || e.user || e.name || 'Player';
    if (type.includes('join') || type === 'comment' && String(e.comment || '').trim().toLowerCase() === 'join') return join(name);
    if (type.includes('like')) return like(name, e.likeCount || e.count || 1);
    if (type.includes('follow')) return follow(name);
    if (type.includes('gift')) return gift(name, e.giftName || e.gift || 'Gift', e.repeatCount || e.count || 1, e);
    if (type === 'comment') {
      const c = String(e.comment || '').trim().toLowerCase(); if (c === 'join') return join(name); if (c === 'repair' || c === 'rebuild') { const k = findKingdom(name); if (k) repair(k, 70, 1); }
    }
  }

  window.KingdomWar3 = { emit, join, like, follow, gift, state, repair: name => { const k = findKingdom(name); if (k) repair(k, 120, 1); } };
  window.KingdomWar3Bridge = { emit };

  document.querySelector('#toggleTest').addEventListener('click', () => document.querySelector('#testPanel').classList.toggle('collapsed'));
  document.querySelectorAll('[data-test]').forEach(button => button.addEventListener('click', () => {
    const name = document.querySelector('#testName').value.trim() || 'Player';
    const act = button.dataset.test;
    if (act === 'join') join(name);
    else if (act === 'like') like(name, 50);
    else if (act === 'follow') follow(name);
    else if (act === 'rose') gift(name, 'Rose', 1, { diamonds: 1 });
    else if (act === 'gift') gift(name, 'Money Gun', 1, { diamonds: 180 });
    else if (act === 'big') gift(name, 'Galaxy', 1, { diamonds: 1500 });
    else if (act === 'repair') { const k = findKingdom(name); if (k) repair(k, 160, 1); }
  }));

  let last = performance.now(), fpsClock = last, frames = 0;
  function loop(now) {
    const dt = clamp((now - last) / 1000, .001, .05); last = now; frames++;
    if (now - fpsClock >= 500) { state.fps = Math.round(frames * 1000 / (now - fpsClock)); ui.fps.textContent = state.fps; frames = 0; fpsClock = now; }
    update(dt); render(); requestAnimationFrame(loop);
  }
  updateUI(); requestAnimationFrame(loop);
})();
