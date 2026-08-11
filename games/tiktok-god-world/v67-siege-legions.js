(() => {
  'use strict';

  const VERSION = '6.7-siege-legions';
  const FRAME_DT_MAX = 0.045;
  const BREAKTHROUGH_MIN_COMBAT = 5.5;
  const BREAKTHROUGH_MIN_DEATHS = 3;
  const CAPTURE_INTERVAL = 3.25;
  const LEGION_SPEED = 13.5;
  const RAIDER_SPEED = 15.5;
  const RAID_RANGE = 15;
  const MAX_VFX_FIRES = 12;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b, c, d) => Math.hypot(c - a, d - b);

  function activeWarFor(sim, kingdomId) {
    return (sim.wars || []).find(w => !w.done && (w.a === kingdomId || w.b === kingdomId)) || null;
  }

  function guardsFor(r, side, warId = null) {
    const arr = r.__v66Guards?.get(side) || [];
    return arr.filter(u => !u.dead && (!warId || u.warId === warId));
  }

  function enemySideOf(w, side) { return side === w.a ? w.b : w.a; }

  function frontPoint(sim, w) {
    if (!w?.front) return null;
    const a = sim.iso(...w.front[0]);
    const b = sim.iso(...w.front[1]);
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 + 5 };
  }

  function unitEnemyNear(r, w, u, radius = 16) {
    const enemySide = enemySideOf(w, u.side);
    for (const q of guardsFor(r, enemySide, w.id)) {
      if (dist(u.x, u.y, q.x, q.y) <= radius) return q;
    }
    return null;
  }

  function faceUnit(u, targetX) {
    if (!u?.s?._sprite || u.s.destroyed) return;
    u.s.scale.x = Math.abs(u.s.scale.x || 1);
    const sprite = u.s._sprite;
    sprite.scale.x = (targetX >= u.x ? 1 : -1) * Math.abs(sprite.scale.x || 1);
  }

  function setUnitPos(u, x, y) {
    if (!u?.s || u.s.destroyed) return;
    u.x = x; u.y = y;
    u.s.position.set(x, y);
    u.s.zIndex = Math.round(y * 100) + 16;
  }

  function moveUnit(r, u, tx, ty, dt, speed) {
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.6) {
      r.swapAnim?.(u.s, 'idle');
      return true;
    }
    const step = Math.min(d, speed * dt);
    setUnitPos(u, u.x + dx / d * step, u.y + dy / d * step);
    faceUnit(u, tx);
    r.swapAnim?.(u.s, 'walk');
    return d <= 2;
  }

  // Keep roads but remove the extra beige diamond beneath farm art.
  function installCleanSettlementGround(sim, r) {
    r.redrawSettlementGround = function (battleSim = sim) {
      const g = this.settlement;
      if (!g) return;
      g.clear();
      for (const k of battleSim.kingdoms || []) {
        if (!k.alive) continue;
        const [cx, cy] = battleSim.iso(...k.capital);
        g.poly([cx, cy - 8, cx + 16, cy, cx, cy + 8, cx - 16, cy]).fill({ color: 0xb99a68, alpha: .42 });
        const roadNodes = [];
        const castleStart = battleSim.approachCell(k, k.buildings[0]) || k.capital;
        if (castleStart) roadNodes.push(castleStart);
        const others = k.buildings
          .filter(b => b.type !== 'castle' && !b.__v66Destroyed && b.hp > 0)
          .slice()
          .sort((a, b) => Math.hypot(a.x - k.capital[0], a.y - k.capital[1]) - Math.hypot(b.x - k.capital[0], b.y - k.capital[1]));
        for (const b of others) {
          const goal = battleSim.approachCell(k, b);
          if (!goal) continue;
          let start = castleStart || k.capital;
          let best = Infinity;
          for (const node of roadNodes) {
            const d = Math.hypot(goal[0] - node[0], goal[1] - node[1]);
            if (d < best) { best = d; start = node; }
          }
          const route = battleSim.findPath(k, start, goal, 240);
          const p0 = battleSim.iso(...(start || k.capital));
          const pts = [[p0[0], p0[1] + 3], ...route.map(c => {
            const p = battleSim.iso(...c);
            return [p[0], p[1] + 3];
          })];
          if (pts.length >= 2) {
            g.poly(pts.flat()).stroke({ color: 0x8f724f, width: 4, alpha: .28 });
            g.poly(pts.flat()).stroke({ color: 0xc6aa76, width: 1.5, alpha: .65 });
            for (const c of route) roadNodes.push(c);
            roadNodes.push(goal);
          }
          if (b.type === 'market') g.circle(b.sx, b.sy + 2, 7).fill({ color: 0xd1b679, alpha: .42 });
        }
      }
    };
    r.redrawSettlementGround(sim);
  }

  // Rebuild team-colored unit frames so attack/hurt/death never swap palette.
  function recolorUnitCanvas(r, canvas, color) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = image.data;
    const pal = r.teamPalette(color);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      const rr = d[i], gg = d[i + 1], bb = d[i + 2];
      const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), sat = max - min;
      const blue = bb > rr + 10 && bb > gg - 4 && sat > 24;
      const cyan = bb > rr + 8 && gg > rr + 8 && sat > 26;
      const green = gg > rr + 16 && gg > bb - 8 && sat > 34;
      if (!(blue || cyan || green)) continue;
      const lum = (rr + gg + bb) / 3;
      const rep = lum < 78 ? pal.dark : lum < 152 ? pal.mid : pal.light;
      d[i] = rep[0]; d[i + 1] = rep[1]; d[i + 2] = rep[2];
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function lockedAnim(r, k, unit, anim) {
    r.__v67UnitAnim ||= new Map();
    const cacheKey = `${k.id}:${unit}:${anim}:v67`;
    if (r.__v67UnitAnim.has(cacheKey)) return r.__v67UnitAnim.get(cacheKey);
    const base = r.unitAnim?.[`${unit}_${anim}`] || [];
    const frames = base.map(tex => {
      const c = r.textureToCanvas?.(tex);
      if (!c) return tex;
      return r.P.Texture.from(recolorUnitCanvas(r, c, k.color));
    });
    r.__v67UnitAnim.set(cacheKey, frames);
    return frames;
  }

  function lockSoldierPalette(r, sim, holder, kingdomId) {
    if (!holder?._sprite || holder.__v67PaletteLocked) return;
    const k = sim.kingdoms?.[kingdomId];
    if (!k) return;
    const unit = holder._unit || (holder._role === 'archer' ? 'archer' : 'knight');
    const anim = {};
    for (const key of ['idle', 'walk', 'attack', 'hurt', 'death']) anim[key] = lockedAnim(r, k, unit, key);
    holder._anim = anim;
    holder.__v67PaletteLocked = true;
    holder.__v67Team = k.id;
    const key = holder._animKey || 'idle';
    if (anim[key]?.length) {
      holder._sprite.textures = anim[key];
      holder._sprite.gotoAndPlay?.(0);
    }
    holder._sprite.tint = 0xffffff;
    holder.alpha = 1;
  }

  function installTeamColorLock(sim, r) {
    const oldMakeSoldier = r.makeSoldier.bind(r);
    r.makeSoldier = function (k, role) {
      const holder = oldMakeSoldier(k, role);
      lockSoldierPalette(this, sim, holder, k.id);
      return holder;
    };
    for (const [side, arr] of r.__v66Guards || []) {
      for (const u of arr) lockSoldierPalette(r, sim, u.s, side);
    }
  }

  function enforceTeamState(sim, r) {
    for (const [side, arr] of r.__v66Guards || []) {
      for (const u of arr) {
        if (u.dead || !u.s || u.s.destroyed) continue;
        lockSoldierPalette(r, sim, u.s, side);
        if (u.s._sprite) u.s._sprite.tint = 0xffffff;
        if (u.targetGuard && (u.targetGuard.dead || u.targetGuard.side === u.side)) u.targetGuard = null;
        if (u.targetBuilding && (u.targetBuilding.__v66Destroyed || u.targetBuilding.owner === u.side)) u.targetBuilding = null;
      }
    }
  }

  async function loadSheet(r, file, frameW, frameH, count) {
    const base = await r.P.Assets.load(file);
    if (base?.source) base.source.scaleMode = 'nearest';
    const frames = [];
    for (let i = 0; i < count; i++) {
      frames.push(new r.P.Texture({ source: base.source, frame: new r.P.Rectangle(i * frameW, 0, frameW, frameH) }));
    }
    return frames;
  }

  async function preloadVfx(r) {
    try {
      const [fire, destroy, blood, impact] = await Promise.all([
        loadSheet(r, 'assets/vfx/fire-sheet.svg', 32, 32, 6),
        loadSheet(r, 'assets/vfx/destruction-sheet.svg', 40, 32, 6),
        loadSheet(r, 'assets/vfx/blood-sheet.svg', 32, 32, 5),
        loadSheet(r, 'assets/vfx/impact-sheet.svg', 32, 32, 5)
      ]);
      r.__v67Vfx = { fire, destroy, blood, impact };
      r.__v67VfxReady = true;
      return true;
    } catch (err) {
      console.warn('[V6.7 VFX] sprite sheets unavailable; keeping safe fallback', err);
      r.__v67VfxReady = false;
      return false;
    }
  }

  function makeOneShotPool(r, key, frames, size, speed) {
    r.__v67Pools ||= {};
    if (r.__v67Pools[key]) return r.__v67Pools[key];
    const pool = [];
    for (let i = 0; i < size; i++) {
      const s = new r.P.AnimatedSprite(frames);
      s.anchor.set(.5, .72);
      s.animationSpeed = speed;
      s.loop = false;
      s.visible = false;
      s.roundPixels = true;
      s.onComplete = () => { s.visible = false; s.stop(); };
      r.fx.addChild(s);
      pool.push(s);
    }
    r.__v67Pools[key] = pool;
    return pool;
  }

  function playOneShot(r, key, x, y, scale = 1) {
    if (!r.__v67VfxReady) return false;
    const cfg = key === 'blood'
      ? [r.__v67Vfx.blood, 12, .20]
      : key === 'impact'
        ? [r.__v67Vfx.impact, 10, .22]
        : [r.__v67Vfx.destroy, 8, .16];
    const pool = makeOneShotPool(r, key, cfg[0], cfg[1], cfg[2]);
    let s = pool.find(v => !v.visible);
    if (!s) s = pool[0];
    s.textures = cfg[0];
    s.position.set(Math.round(x), Math.round(y));
    s.scale.set(scale);
    s.alpha = 1;
    s.visible = true;
    s.gotoAndPlay(0);
    return true;
  }

  function startPixelFire(r, b) {
    if (!r.__v67VfxReady || !b || b.__v66Destroyed || !b._sprite) return;
    r.__v67Fires ||= new Map();
    if (r.__v67Fires.has(b)) return;
    if (r.__v67Fires.size >= MAX_VFX_FIRES) return;
    const s = new r.P.AnimatedSprite(r.__v67Vfx.fire);
    s.anchor.set(.5, .88);
    s.animationSpeed = .15 + Math.random() * .035;
    s.loop = true;
    s.roundPixels = true;
    s.scale.set(b.type === 'castle' ? .95 : .72);
    s.position.set(Math.round(b.sx), Math.round(b.sy - Math.max(13, (b._sprite.height || 36) * .34)));
    s.zIndex = Math.round((b.sy - 8) * 100) + 45;
    s.play();
    r.fx.addChild(s);
    r.__v67Fires.set(b, s);
  }

  function stopPixelFire(r, b) {
    const s = r.__v67Fires?.get(b);
    if (!s) return;
    if (!s.destroyed) s.destroy();
    r.__v67Fires.delete(b);
  }

  function updatePixelVfx(r) {
    if (!r.__v67VfxReady) return;
    if (r.__v66BloodPool) for (const c of r.__v66BloodPool) c.renderable = false;
    if (r.__v66Fires) for (const [, fx] of r.__v66Fires) if (fx?.c) fx.c.renderable = false;
    for (const [b, s] of [...(r.__v67Fires || new Map())]) {
      if (!b || b.__v66Destroyed || !b._sprite || b._sprite.destroyed) {
        stopPixelFire(r, b);
        continue;
      }
      s.position.set(Math.round(b.sx), Math.round(b.sy - Math.max(13, (b._sprite.height || 36) * .34)));
    }
  }

  function rearBuildCell(sim, k, type, war) {
    if (!war?.front) return sim.findBuildCell(k, type, false);
    const ownFront = k.id === war.a ? war.front[0] : war.front[1];
    let best = null, bestScore = -Infinity;
    for (const token of k.territory || []) {
      const [x, y] = token.split(',').map(Number);
      if (!sim.isBuildableCell(x, y, type) || sim.getOwner(x, y) !== k.id) continue;
      if (sim.buildingBlockingCell(x, y) || !sim.buildingSpacingOK(k, type, x, y)) continue;
      if (k.farmers.some(f => f.cell?.[0] === x && f.cell?.[1] === y)) continue;
      const frontD = Math.hypot(x - ownFront[0], y - ownFront[1]);
      if (frontD < 4.2) continue;
      const homeD = Math.hypot(x - k.capital[0], y - k.capital[1]);
      const score = frontD * 1.5 - homeD * .34 + Math.random() * .8;
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    return best;
  }

  function warBuildPlan(k) {
    const count = type => k.buildings.filter(b => b.type === type && !b.__v66Destroyed).length;
    if (k.popCap - k.pop < 2 && k.resources.wood >= 55 && k.resources.stone >= 8) {
      return { type: ['house_a', 'house_b', 'house_c'][(Math.random() * 3) | 0], cost: { wood: 55, stone: 8 }, popCap: 5 };
    }
    if (count('farm') < Math.ceil(k.pop / 8) && k.resources.wood >= 45 && k.resources.stone >= 4) {
      return { type: 'farm', cost: { wood: 45, stone: 4 }, popCap: 0 };
    }
    if (k.resources.wood >= 76 && k.resources.stone >= 24) {
      return { type: 'warehouse', cost: { wood: 70, stone: 24 }, popCap: 0 };
    }
    return null;
  }

  function installWarConstruction(sim, r) {
    const oldBuildAI = sim.buildAI.bind(sim);
    sim.buildAI = async function (k) {
      const before = k.buildings.length;
      await oldBuildAI(k);
      if (k.buildings.length > before) return;
      const war = activeWarFor(this, k.id);
      if (!war || this.age - k.lastBuild < 8) return;
      const plan = warBuildPlan(k);
      if (!plan) return;
      for (const [name, value] of Object.entries(plan.cost)) if (k.resources[name] < value) return;
      const cell = rearBuildCell(this, k, plan.type, war);
      if (!cell) return;
      const b = await this.addBuilding(k, plan.type, cell[0], cell[1], false);
      if (!b) return;
      for (const [name, value] of Object.entries(plan.cost)) k.resources[name] -= value;
      if (plan.popCap) k.popCap += plan.popCap;
      k.lastBuild = this.age;
      r.puff?.(...this.iso(...cell));
    };
  }

  function ensureWarMeta(w) {
    w.__v67 ||= {
      combatStartedAt: 0,
      losses: { [w.a]: 0, [w.b]: 0 },
      breakthrough: false,
      winner: null,
      loser: null,
      legionAnchor: null,
      lastCapture: -Infinity,
      announced: false
    };
    return w.__v67;
  }

  function countPhysicalDeaths(r, w) {
    const meta = ensureWarMeta(w);
    for (const side of [w.a, w.b]) {
      for (const u of r.__v66Guards?.get(side) || []) {
        if (u.warId !== w.id || !u.dead || u.__v67DeathCounted) continue;
        u.__v67DeathCounted = true;
        meta.losses[side] = (meta.losses[side] || 0) + 1;
      }
    }
  }

  function chooseFirstBattleWinner(sim, r, w) {
    const meta = ensureWarMeta(w);
    if (meta.breakthrough || w.__v66?.phase !== 'combat') return;
    if (!meta.combatStartedAt) meta.combatStartedAt = performance.now();
    const elapsed = (performance.now() - meta.combatStartedAt) / 1000;
    if (elapsed < BREAKTHROUGH_MIN_COMBAT) return;
    const la = meta.losses[w.a] || 0, lb = meta.losses[w.b] || 0;
    const total = la + lb;
    if (total < BREAKTHROUGH_MIN_DEATHS) return;
    const liveA = guardsFor(r, w.a, w.id).length;
    const liveB = guardsFor(r, w.b, w.id).length;
    let winner = null;
    if (la + 1 < lb) winner = w.a;
    else if (lb + 1 < la) winner = w.b;
    else if (liveA !== liveB) winner = liveA > liveB ? w.a : w.b;
    else winner = sim.power(sim.kingdoms[w.a]) >= sim.power(sim.kingdoms[w.b]) ? w.a : w.b;
    const loser = winner === w.a ? w.b : w.a;
    meta.breakthrough = true;
    meta.winner = winner;
    meta.loser = loser;
    meta.lastCapture = sim.age;
    const winners = guardsFor(r, winner, w.id);
    if (winners.length) {
      const x = winners.reduce((s, u) => s + u.x, 0) / winners.length;
      const y = winners.reduce((s, u) => s + u.y, 0) / winners.length;
      meta.legionAnchor = { x, y };
    } else meta.legionAnchor = frontPoint(sim, w);
    r.__v661Reinforce ||= new Map();
    r.__v661Reinforce.set(loser, { next: Number.POSITIVE_INFINITY });
    if (!meta.announced) {
      meta.announced = true;
      const wk = sim.kingdoms[winner], lk = sim.kingdoms[loser];
      if (wk && lk) {
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = `⚔️ ${wk.name} breaks the line — siege of ${lk.name}`;
        document.querySelector('#toast')?.appendChild(el);
        setTimeout(() => el.remove(), 3000);
      }
    }
  }

  function siegeTarget(sim, w) {
    const meta = ensureWarMeta(w);
    const loser = sim.kingdoms[meta.loser];
    if (!loser?.alive) return null;
    const fp = frontPoint(sim, w) || { x: sim.iso(...loser.capital)[0], y: sim.iso(...loser.capital)[1] };
    const buildings = (loser.buildings || []).filter(b => !b.__v66Destroyed && b.hp > 0 && b.owner === loser.id && b.type !== 'castle');
    if (buildings.length) {
      buildings.sort((a, b) => dist(a.sx, a.sy, fp.x, fp.y) - dist(b.sx, b.sy, fp.x, fp.y));
      return buildings[0];
    }
    return (loser.buildings || []).find(b => !b.__v66Destroyed && b.hp > 0 && b.owner === loser.id) || null;
  }

  function raidBuilding(sim, r, u, w, b, dt) {
    if (!b || b.__v66Destroyed || b.hp <= 0 || b.owner !== enemySideOf(w, u.side)) {
      u.__v67RaidBuilding = null;
      return;
    }
    const d = dist(u.x, u.y, b.sx, b.sy + 4);
    if (d > RAID_RANGE) {
      moveUnit(r, u, b.sx, b.sy + 5, dt, RAIDER_SPEED);
      return;
    }
    faceUnit(u, b.sx);
    r.swapAnim?.(u.s, 'attack');
    const now = performance.now();
    if (now < (u.__v67NextRaidHit || 0)) return;
    u.__v67NextRaidHit = now + rand(780, 1120);
    if (b.owner === u.side) return;
    if (b.type === 'castle' && sim.kingdoms[b.owner]?.territory.size > 4) {
      startPixelFire(r, b);
      return;
    }
    const damage = u.role === 'archer' ? rand(2.2, 3.8) : rand(4.2, 7.2);
    b.hp = Math.max(0, b.hp - damage);
    r.damageBuilding?.(b, damage);
    startPixelFire(r, b);
    playOneShot(r, 'impact', b.sx + rand(-6, 6), b.sy - rand(7, 18), .72);
    if (b.hp <= 0 && !b.__v66Destroyed) {
      const owner = sim.kingdoms[b.owner];
      if (!owner || owner.id === u.side) return;
      owner.buildings = owner.buildings.filter(entry => entry !== b);
      sim.releaseFarmWorker?.(owner, b.id);
      r.destroyBuilding?.(b);
    }
  }

  function runBreakthroughMovement(sim, r, w, dt) {
    const meta = ensureWarMeta(w);
    if (!meta.breakthrough) return;
    const winner = sim.kingdoms[meta.winner], loser = sim.kingdoms[meta.loser];
    if (!winner?.alive || !loser?.alive) return;
    const target = siegeTarget(sim, w);
    const targetX = target?.sx ?? sim.iso(...loser.capital)[0];
    const targetY = (target?.sy ?? sim.iso(...loser.capital)[1]) + 5;
    const army = guardsFor(r, winner.id, w.id);
    if (!army.length) return;
    const raiderCount = army.length >= 6 ? 2 : 1;
    const legion = army.slice(0, Math.max(1, army.length - raiderCount));
    const raiders = army.slice(legion.length);

    const anchor = meta.legionAnchor || (meta.legionAnchor = frontPoint(sim, w) || { x: army[0].x, y: army[0].y });
    let dx = targetX - anchor.x, dy = targetY - anchor.y;
    const ad = Math.max(.001, Math.hypot(dx, dy));
    dx /= ad; dy /= ad;
    const advance = Math.min(ad, LEGION_SPEED * dt);
    anchor.x += dx * advance;
    anchor.y += dy * advance;
    const px = -dy, py = dx;

    const ordered = legion.slice().sort((a, b) => {
      const ar = a.role === 'spear' ? 0 : a.role === 'sword' ? 1 : 2;
      const br = b.role === 'spear' ? 0 : b.role === 'sword' ? 1 : 2;
      return ar - br;
    });
    const cols = Math.min(3, Math.max(2, ordered.length));
    ordered.forEach((u, i) => {
      if (unitEnemyNear(r, w, u, 15)) return;
      const col = (i % cols) - (cols - 1) / 2;
      const row = Math.floor(i / cols);
      const sx = anchor.x - dx * (row * 8.5) + px * col * 9.5;
      const sy = anchor.y - dy * (row * 8.5) + py * col * 9.5;
      moveUnit(r, u, sx, sy, dt, LEGION_SPEED + 1.5);
      faceUnit(u, targetX);
    });

    raiders.forEach((u, i) => {
      if (unitEnemyNear(r, w, u, 13)) return;
      let b = u.__v67RaidBuilding;
      if (!b || b.__v66Destroyed || b.owner !== loser.id) {
        const choices = (loser.buildings || []).filter(x => !x.__v66Destroyed && x.hp > 0 && x.owner === loser.id && x.type !== 'castle');
        choices.sort((a, b2) => dist(u.x, u.y, a.sx, a.sy) - dist(u.x, u.y, b2.sx, b2.sy));
        b = choices[i % Math.max(1, choices.length)] || target;
        u.__v67RaidBuilding = b || null;
      }
      if (b) raidBuilding(sim, r, u, w, b, dt);
    });

    const defenders = guardsFor(r, loser.id, w.id);
    const home = sim.iso(...loser.capital);
    defenders.forEach((u, i) => {
      if (unitEnemyNear(r, w, u, 14)) return;
      const ox = ((i % 3) - 1) * 9;
      const oy = Math.floor(i / 3) * 8;
      moveUnit(r, u, home[0] + ox, home[1] + 8 + oy, dt, 12.5);
      faceUnit(u, anchor.x);
    });
  }

  function processBreakthroughCapture(sim, r, w) {
    const meta = ensureWarMeta(w);
    if (!meta.breakthrough || sim.age - meta.lastCapture < CAPTURE_INTERVAL) return;
    const winner = sim.kingdoms[meta.winner], loser = sim.kingdoms[meta.loser];
    if (!winner?.alive || !loser?.alive) { w.done = true; return; }
    const pair = sim.borderPair(winner, loser);
    if (!pair) {
      w.done = true;
      r.endWar?.(w);
      return;
    }
    w.front = winner.id === w.a ? pair : [pair[1], pair[0]];
    const candidates = [];
    for (const token of loser.territory) {
      const [x, y] = token.split(',').map(Number);
      if (sim.neigh(x, y).some(([nx, ny]) => sim.getOwner(nx, ny) === winner.id)) candidates.push([x, y]);
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => {
      const da = Math.hypot(a[0] - loser.capital[0], a[1] - loser.capital[1]);
      const db = Math.hypot(b[0] - loser.capital[0], b[1] - loser.capital[1]);
      return da - db;
    });
    const [x, y] = candidates[0];
    meta.lastCapture = sim.age;
    const attackedBuilding = loser.buildings.find(b => b.x === x && b.y === y && b.owner === loser.id);
    if (attackedBuilding) startPixelFire(r, attackedBuilding);
    sim.capture(winner, loser, x, y);
    winner.military += .35;
    loser.military = Math.max(2, Number(loser.military || 2) - .8);
    playOneShot(r, 'impact', ...sim.iso(x, y), .8);
    r.redrawTerritories?.(sim);
    r.redrawSettlementGround?.(sim);
    if ((x === loser.capital[0] && y === loser.capital[1]) || loser.territory.size <= 1) sim.eliminate(loser, winner);
  }

  function installWarResolution(sim, r) {
    const oldResolveWars = sim.resolveWars.bind(sim);
    sim.resolveWars = function () {
      const active = (this.wars || []).filter(w => !w.done);
      for (const w of active) {
        ensureWarMeta(w);
        w.__v67TempDone = w.done;
        w.done = true;
      }
      try { oldResolveWars(); } finally {
        for (const w of active) w.done = w.__v67TempDone || false;
      }
      for (const w of active) {
        const a = this.kingdoms[w.a], b = this.kingdoms[w.b];
        if (!a?.alive || !b?.alive) { w.done = true; r.endWar?.(w); continue; }
        const pair = this.borderPair(a, b);
        if (!pair) { w.done = true; r.endWar?.(w); continue; }
        w.front = pair;
        processBreakthroughCapture(this, r, w);
      }
    };
  }

  function installRendererHooks(sim, r) {
    const oldUpdateWars = r.updateWars.bind(r);
    const oldDamageBuilding = r.damageBuilding.bind(r);
    const oldDestroyBuilding = r.destroyBuilding.bind(r);
    const oldBattleFx = r.battleFx?.bind(r);
    const oldFrontImpact = r.frontImpact?.bind(r);
    const oldCasualty = r.casualty?.bind(r);

    r.damageBuilding = function (b, damage) {
      oldDamageBuilding(b, damage);
      if (b && b.owner != null && b.hp / Math.max(1, b.maxHp) < .9) startPixelFire(this, b);
    };
    r.destroyBuilding = function (b, ...args) {
      if (b && !b.__v67DestroyFxPlayed) {
        b.__v67DestroyFxPlayed = true;
        playOneShot(this, 'destroy', b.sx, b.sy - 8, b.type === 'castle' ? 1.2 : .92);
      }
      stopPixelFire(this, b);
      return oldDestroyBuilding(b, ...args);
    };
    r.battleFx = function (x, y, ...args) {
      if (!playOneShot(this, 'blood', x, y, .78)) oldBattleFx?.(x, y, ...args);
    };
    r.frontImpact = function (w, battleSim) {
      const f = frontPoint(battleSim || sim, w);
      if (f && playOneShot(this, 'impact', f.x + rand(-5, 5), f.y + rand(-3, 3), .8)) return;
      oldFrontImpact?.(w, battleSim);
    };
    if (oldCasualty) {
      r.casualty = function (w, loserSide, winnerSide) {
        if (loserSide == null || loserSide === winnerSide) return;
        return oldCasualty(w, loserSide, winnerSide);
      };
    }

    r.updateWars = function (battleSim, rawDt) {
      const dt = clamp(Number(rawDt) || 0.016, 0.001, FRAME_DT_MAX);
      oldUpdateWars(battleSim, rawDt);
      enforceTeamState(battleSim, this);
      for (const w of battleSim.wars || []) {
        if (w.done) continue;
        const meta = ensureWarMeta(w);
        if (w.__v66?.phase !== 'combat') meta.combatStartedAt = 0;
        countPhysicalDeaths(this, w);
        chooseFirstBattleWinner(battleSim, this, w);
        runBreakthroughMovement(battleSim, this, w, dt);
      }
      updatePixelVfx(this);
      if (this.entities) this.entities.sortDirty = true;
    };
  }

  function resetEndedWarState(sim, r) {
    for (const w of sim.wars || []) {
      if (!w.done || !w.__v67 || w.__v67Cleanup) continue;
      w.__v67Cleanup = true;
      for (const side of [w.a, w.b]) {
        const k = sim.kingdoms[side];
        if (!k?.alive) continue;
        r.__v661Reinforce?.delete(side);
      }
    }
  }

  function install(sim) {
    if (!sim || sim.__v67SiegeLegionsInstalled) return;
    const r = sim.r;
    if (!r?.P || !r?.__v66Guards || !sim.__v661BattleStabilityInstalled) {
      setTimeout(() => install(sim), 40);
      return;
    }
    sim.__v67SiegeLegionsInstalled = true;
    window.__BUILD_VERSION = VERSION;
    document.documentElement.dataset.battleSystem = 'living-v67-siege-legions';
    const tag = document.querySelector('.build-tag');
    if (tag) tag.textContent = 'V6.7 SIEGE LEGIONS';

    installCleanSettlementGround(sim, r);
    installTeamColorLock(sim, r);
    installWarConstruction(sim, r);
    installWarResolution(sim, r);
    installRendererHooks(sim, r);
    void preloadVfx(r).then(() => updatePixelVfx(r));
    setInterval(() => resetEndedWarState(sim, r), 1500);
  }

  function wait() {
    const sim = window.__SIM;
    if (!sim || !sim.__v661BattleStabilityInstalled || !sim.r?.__v66Guards) {
      setTimeout(wait, 30);
      return;
    }
    install(sim);
  }

  wait();
})();
