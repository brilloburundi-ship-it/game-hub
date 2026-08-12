(() => {
  'use strict';

  const VERSION = 'stable-integrated-battles';
  const AI_STEP = 1 / 30;
  const MAX_STEP = 0.045;
  const MAX_WAR_GUARDS = 9;
  const MAX_PEACE_GUARDS = 6;
  const MIN_ALLY_SPACING = 8.5;
  const MIN_ENEMY_SPACING = 5.2;
  const BUILDING_RELEVANCE_RADIUS = 105;
  const SORT_INTERVAL = 0.14;
  const VISUAL_SMOOTH = 24;
  const SNAP_DISTANCE = 55;
  const BREAKTHROUGH_MIN_COMBAT = 5.5;
  const BREAKTHROUGH_MIN_DEATHS = 3;
  const CAPTURE_INTERVAL = 3.25;
  const LEGION_SPEED = 13.5;
  const RAIDER_SPEED = 15.5;
  const RAID_RANGE = 15;
  const MAX_PIXEL_FIRES = 8;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function activeWarFor(sim, kingdomId) {
    return (sim.wars || []).find(w => !w.done && (w.a === kingdomId || w.b === kingdomId)) || null;
  }

  function guardsFor(r, kingdomId, warId = null) {
    const guards = r.__v66Guards?.get(kingdomId) || [];
    return guards.filter(u => !u.dead && (!warId || u.warId === warId));
  }

  function enemySideOf(w, side) {
    return side === w.a ? w.b : w.a;
  }

  function frontWorld(sim, w) {
    if (!w?.front) return null;
    const a = sim.iso(...w.front[0]);
    const b = sim.iso(...w.front[1]);
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 + 5 };
  }

  function setGuardPosition(u, x, y) {
    if (!u?.s || u.s.destroyed) return;
    u.x = x;
    u.y = y;
    u.s.position.set(x, y);
    u.s.zIndex = Math.round(y * 100) + 16;
  }

  function faceGuard(u, targetX) {
    if (!u?.s?._sprite || u.s.destroyed) return;
    u.s.scale.x = Math.abs(u.s.scale.x || 1);
    const sprite = u.s._sprite;
    const scale = Math.abs(sprite.scale.x || 1);
    sprite.scale.x = targetX >= u.x ? scale : -scale;
  }

  function idleTask(fn, delay = 0) {
    setTimeout(() => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(() => fn(), { timeout: 700 });
      else setTimeout(fn, 0);
    }, delay);
  }

  function hydrateAnim(r, holder, k, unit, key) {
    if (!holder || holder.destroyed || !holder._sprite || holder._sprite.destroyed) return;
    try {
      const frames = r.getUnitAnim?.(k, unit, key);
      if (!frames?.length) return;
      holder._anim[key] = frames;
      if (holder._animKey === key) {
        const frame = holder._sprite.currentFrame || 0;
        holder._sprite.textures = frames;
        holder._sprite.gotoAndPlay(Math.min(frame, frames.length - 1));
      }
    } catch (error) {
      console.warn(`[God World] deferred ${unit}/${key} animation failed`, error);
    }
  }

  function installLazySoldiers(r) {
    if (r.__gwLazySoldiersInstalled) return;
    r.__gwLazySoldiersInstalled = true;
    r.makeSoldier = function (k, role) {
      if (performance.now() < (this.__gwPauseGuardsUntil || 0)) return null;
      const P = this.P;
      const holder = new P.Container();
      const shadow = new P.Graphics();
      shadow.ellipse(0, 1, 7, 3).fill({ color: 0x000000, alpha: .18 });
      holder.addChild(shadow);

      const unit = role === 'archer' ? 'archer' : 'knight';
      const idle = this.getUnitAnim(k, unit, 'idle') || [];
      const anim = { idle, walk: idle, attack: idle, hurt: idle, death: idle };
      const sprite = new P.AnimatedSprite(idle);
      sprite.anchor.set(.5, .84);
      sprite.animationSpeed = role === 'archer' ? .12 : .16;
      sprite.roundPixels = true;
      sprite.play();
      sprite.scale.set(role === 'archer' ? .39 : (role === 'spear' ? .40 : .41));
      holder.addChild(sprite);

      holder._sprite = sprite;
      holder._shadow = shadow;
      holder._anim = anim;
      holder._animKey = 'idle';
      holder._role = role;
      holder._unit = unit;
      holder.__gwLazyAnim = true;

      if (role === 'spear') {
        const spear = new P.Graphics();
        spear.poly([0, -8, 12, -19]).stroke({ color: 0x8a5e32, width: 1.2 });
        spear.poly([11, -20, 13, -17, 10, -18]).fill({ color: 0xd9e0e4 });
        holder.addChild(spear);
        holder._weapon = spear;
      }

      idleTask(() => hydrateAnim(this, holder, k, unit, 'walk'), 90);
      idleTask(() => hydrateAnim(this, holder, k, unit, 'attack'), 280);
      idleTask(() => hydrateAnim(this, holder, k, unit, 'hurt'), 520);
      idleTask(() => hydrateAnim(this, holder, k, unit, 'death'), 760);
      return holder;
    };
  }

  function guardHp(u) {
    if (!Number.isFinite(u.__gwHp)) u.__gwHp = u.role === 'archer' ? 38 : (u.role === 'spear' ? 54 : 48);
    return u.__gwHp;
  }

  function killGuard(sim, r, u, killerSide = null) {
    if (!u || u.dead || !u.s || u.s.destroyed) return false;
    u.dead = true;
    u.deadAge = 0;
    u.state = 'dead';
    u.targetGuard = null;
    u.targetBuilding = null;
    u.__gwHp = 0;
    r.battleFx?.(u.x, u.y - 2);
    r.swapAnim?.(u.s, 'death');
    if (u.s._sprite) {
      u.s._sprite.loop = false;
      u.s._sprite.animationSpeed = .13;
      u.s._sprite.gotoAndPlay?.(0);
    }
    const kingdom = sim.kingdoms?.[u.side];
    if (kingdom?.alive) kingdom.military = Math.max(2, Number(kingdom.military || 2) - .45);
    if (killerSide != null) {
      const killer = sim.kingdoms?.[killerSide];
      if (killer?.alive) killer.military += .08;
    }
    return true;
  }

  function engagedCandidate(r, w, loserSide) {
    const enemySide = enemySideOf(w, loserSide);
    const enemies = guardsFor(r, enemySide, w.id).filter(u => u.state === 'combat');
    if (!enemies.length) return null;
    let best = null;
    let bestD = Infinity;
    for (const u of guardsFor(r, loserSide, w.id)) {
      if (u.state !== 'combat') continue;
      for (const enemy of enemies) {
        const d = distance(u, enemy);
        if (d < bestD) { bestD = d; best = u; }
      }
    }
    return bestD <= 13 ? best : null;
  }

  function rebalanceTargets(r, w) {
    if (!w?.__v66 || w.__v66.phase !== 'combat') return;
    const now = performance.now();
    if (w.__gwRetargetAt && now < w.__gwRetargetAt) return;
    w.__gwRetargetAt = now + 650;

    for (const side of [w.a, w.b]) {
      const enemySide = enemySideOf(w, side);
      const attackers = guardsFor(r, side, w.id).filter(u => u.state === 'combat');
      const defenders = guardsFor(r, enemySide, w.id).filter(u => u.state === 'combat');
      if (!attackers.length || !defenders.length) continue;
      const loads = new Map(defenders.map(d => [d, 0]));
      for (const u of attackers) if (u.targetGuard && !u.targetGuard.dead && loads.has(u.targetGuard)) loads.set(u.targetGuard, (loads.get(u.targetGuard) || 0) + 1);
      for (const u of attackers) {
        if (u.targetGuard && !u.targetGuard.dead && (loads.get(u.targetGuard) || 0) <= 2) continue;
        let best = null;
        let score = Infinity;
        for (const d of defenders) {
          const load = loads.get(d) || 0;
          if (load >= 2) continue;
          const candidate = distance(u, d) + load * 15;
          if (candidate < score) { score = candidate; best = d; }
        }
        if (!best) best = defenders.reduce((a, b) => distance(u, a) <= distance(u, b) ? a : b);
        u.targetGuard = best;
        loads.set(best, (loads.get(best) || 0) + 1);
      }
    }
  }

  function resolvePhysicalCombat(sim, r, w) {
    if (!w?.__v66 || w.__v66.phase !== 'combat') return;
    const now = performance.now();
    const a = guardsFor(r, w.a, w.id).filter(u => u.state === 'combat');
    const b = guardsFor(r, w.b, w.id).filter(u => u.state === 'combat');
    if (!a.length || !b.length) return;

    const processed = new Set();
    for (const u of [...a, ...b]) {
      if (u.dead || processed.has(u)) continue;
      const enemies = u.side === w.a ? b : a;
      let target = u.targetGuard;
      if (!target || target.dead || target.side === u.side) {
        let best = null;
        let bestD = Infinity;
        for (const q of enemies) {
          const d = distance(u, q);
          if (d < bestD) { best = q; bestD = d; }
        }
        target = best;
        u.targetGuard = best;
      }
      if (!target || target.dead) continue;
      const d = distance(u, target);
      const range = u.role === 'archer' ? 16 : 9.6;
      if (d > range) continue;
      faceGuard(u, target.x);
      faceGuard(target, u.x);
      if (!u.__gwNextHit) u.__gwNextHit = now + rand(120, 500);
      if (now < u.__gwNextHit) continue;
      u.__gwNextHit = now + rand(720, 980);
      const damage = u.role === 'archer' ? rand(4.5, 7.5) : (u.role === 'spear' ? rand(8.5, 12.5) : rand(7.5, 11.5));
      target.__gwHp = guardHp(target) - damage;
      target.hurt = Math.max(Number(target.hurt) || 0, .08);
      if (Math.random() < .34) r.battleFx?.(target.x, target.y - 3);
      if (target.__gwHp <= 0) killGuard(sim, r, target, u.side);
      processed.add(target);
    }
  }

  function deClumpGuards(r, w) {
    const all = [...guardsFor(r, w.a, w.id), ...guardsFor(r, w.b, w.id)]
      .filter(u => u.state === 'combat' || u.state === 'advance' || u.state === 'rally');
    for (let i = 0; i < all.length; i++) {
      const u = all[i];
      if (!u?.s || u.s.destroyed) continue;
      for (let j = i + 1; j < all.length; j++) {
        const q = all[j];
        if (!q?.s || q.s.destroyed) continue;
        let dx = q.x - u.x;
        let dy = q.y - u.y;
        let d = Math.hypot(dx, dy);
        const minD = u.side === q.side ? MIN_ALLY_SPACING : MIN_ENEMY_SPACING;
        if (d >= minD) continue;
        if (d < .01) {
          const angle = ((i * 17 + j * 29) % 360) * Math.PI / 180;
          dx = Math.cos(angle); dy = Math.sin(angle); d = 1;
        }
        const push = Math.min(1.15, (minD - d) * .28);
        const nx = dx / d, ny = dy / d;
        setGuardPosition(u, u.x - nx * push, u.y - ny * push);
        setGuardPosition(q, q.x + nx * push, q.y + ny * push);
      }
    }
  }

  function nearbyBuildingSubset(sim, r, original) {
    if (!original || original.length <= 70) return original;
    const points = [];
    for (const [, guards] of r.__v66Guards || []) for (const u of guards) if (!u.dead) points.push({ x: u.x, y: u.y });
    for (const w of sim.wars || []) {
      if (w.done) continue;
      const f = frontWorld(sim, w);
      if (f) points.push(f);
    }
    if (!points.length) return original.slice(0, 70);
    const kept = original.filter(b => {
      if (b.__v66Destroyed || b.hp <= 0) return false;
      if (b.type === 'castle') return true;
      return points.some(p => Math.hypot(b.sx - p.x, b.sy - p.y) <= BUILDING_RELEVANCE_RADIUS);
    });
    if (kept.length < 18) {
      const extra = original
        .filter(b => !kept.includes(b) && !b.__v66Destroyed && b.hp > 0)
        .sort((a, b) => points.reduce((m, p) => Math.min(m, Math.hypot(a.sx - p.x, a.sy - p.y)), Infinity) - points.reduce((m, p) => Math.min(m, Math.hypot(b.sx - p.x, b.sy - p.y)), Infinity))
        .slice(0, 18 - kept.length);
      kept.push(...extra);
    }
    return kept;
  }

  function withRelevantBuildings(sim, r, fn) {
    const originals = new Map();
    try {
      for (const k of sim.kingdoms || []) {
        originals.set(k, k.buildings || []);
        k.buildings = nearbyBuildingSubset(sim, r, k.buildings || []);
      }
      return fn();
    } finally {
      for (const [k, original] of originals) k.buildings = original.filter(b => !b.__v66Destroyed && b.hp > 0);
    }
  }

  function siegeMeta(w) {
    if (!w.__gwSiege) {
      w.__gwSiege = {
        combatStartedAt: 0,
        losses: { [w.a]: 0, [w.b]: 0 },
        breakthrough: false,
        winner: null,
        loser: null,
        anchor: null,
        captureTarget: null,
        lastCapture: -Infinity,
        announced: false
      };
    }
    return w.__gwSiege;
  }

  function controlReinforcements(sim, r) {
    if (!r.__v66NextSpawn) return;
    r.__gwReinforce ||= new Map();
    const clock = Number(r.__v66Clock) || 0;
    for (const k of sim.kingdoms || []) {
      if (!k.alive) continue;
      const war = activeWarFor(sim, k.id);
      const meta = war ? siegeMeta(war) : null;
      const live = guardsFor(r, k.id).length;
      const limit = war ? MAX_WAR_GUARDS : MAX_PEACE_GUARDS;
      if (live >= limit || (meta?.breakthrough && meta.loser === k.id)) {
        r.__v66NextSpawn.set(k.id, Number.POSITIVE_INFINITY);
        continue;
      }
      const state = r.__gwReinforce.get(k.id) || { next: 0 };
      if (clock >= state.next) {
        r.__v66NextSpawn.set(k.id, 0);
        state.next = clock + (war ? 3.2 : 1.25);
      } else r.__v66NextSpawn.set(k.id, Number.POSITIVE_INFINITY);
      r.__gwReinforce.set(k.id, state);
    }
  }

  function trimExcessGuards(sim, r) {
    for (const [kingdomId, arr] of r.__v66Guards || []) {
      const war = activeWarFor(sim, kingdomId);
      const limit = war ? MAX_WAR_GUARDS : MAX_PEACE_GUARDS;
      const live = arr.filter(u => !u.dead);
      if (live.length <= limit) continue;
      const remove = live.slice(limit);
      const removeSet = new Set(remove);
      for (const u of remove) if (u.s && !u.s.destroyed) u.s.destroy({ children: true });
      r.__v66Guards.set(kingdomId, arr.filter(u => !removeSet.has(u)));
    }
  }

  function civilianHasNearbyEnemy(sim, r, f) {
    if (!f?._sprite) return false;
    const owner = (sim.kingdoms || []).find(k => (k.farmers || []).includes(f));
    if (!owner) return false;
    const war = activeWarFor(sim, owner.id);
    if (!war) return false;
    const enemySide = enemySideOf(war, owner.id);
    return guardsFor(r, enemySide, war.id).some(u => u.state === 'combat' && Math.hypot(u.x - f._sprite.x, u.y - f._sprite.y) <= 17);
  }

  async function loadSheet(r, file, frameW, frameH, count) {
    const base = await r.P.Assets.load(file);
    if (base?.source) base.source.scaleMode = 'nearest';
    const frames = [];
    for (let i = 0; i < count; i++) frames.push(new r.P.Texture({ source: base.source, frame: new r.P.Rectangle(i * frameW, 0, frameW, frameH) }));
    return frames;
  }

  async function preloadPixelVfx(r) {
    try {
      const [fire, destroy, blood, impact] = await Promise.all([
        loadSheet(r, 'assets/vfx/fire-sheet.svg', 32, 32, 6),
        loadSheet(r, 'assets/vfx/destruction-sheet.svg', 40, 32, 6),
        loadSheet(r, 'assets/vfx/blood-sheet.svg', 32, 32, 5),
        loadSheet(r, 'assets/vfx/impact-sheet.svg', 32, 32, 5)
      ]);
      r.__gwVfx = { fire, destroy, blood, impact };
      r.__gwVfxReady = true;
    } catch (error) {
      r.__gwVfxReady = false;
      console.warn('[God World VFX] sprite sheets unavailable; safe fallback remains active', error);
    }
  }

  function oneShotPool(r, key, frames, size, speed) {
    r.__gwVfxPools ||= {};
    if (r.__gwVfxPools[key]) return r.__gwVfxPools[key];
    const pool = [];
    for (let i = 0; i < size; i++) {
      const sprite = new r.P.AnimatedSprite(frames);
      sprite.anchor.set(.5, .72);
      sprite.animationSpeed = speed;
      sprite.loop = false;
      sprite.visible = false;
      sprite.roundPixels = true;
      sprite.onComplete = () => { sprite.visible = false; sprite.stop(); };
      r.fx.addChild(sprite);
      pool.push(sprite);
    }
    r.__gwVfxPools[key] = pool;
    return pool;
  }

  function playOneShot(r, key, x, y, scale = 1) {
    if (!r.__gwVfxReady) return false;
    const cfg = key === 'blood' ? [r.__gwVfx.blood, 8, .20] : key === 'impact' ? [r.__gwVfx.impact, 7, .22] : [r.__gwVfx.destroy, 5, .16];
    const pool = oneShotPool(r, key, cfg[0], cfg[1], cfg[2]);
    const sprite = pool.find(v => !v.visible) || pool[0];
    sprite.textures = cfg[0];
    sprite.position.set(Math.round(x), Math.round(y));
    sprite.scale.set(scale);
    sprite.alpha = 1;
    sprite.visible = true;
    sprite.gotoAndPlay(0);
    return true;
  }

  function startPixelFire(r, b) {
    if (!r.__gwVfxReady || !b || b.__v66Destroyed || !b._sprite) return;
    r.__gwFires ||= new Map();
    if (r.__gwFires.has(b) || r.__gwFires.size >= MAX_PIXEL_FIRES) return;
    const sprite = new r.P.AnimatedSprite(r.__gwVfx.fire);
    sprite.anchor.set(.5, .88);
    sprite.animationSpeed = .15 + Math.random() * .035;
    sprite.loop = true;
    sprite.roundPixels = true;
    sprite.scale.set(b.type === 'castle' ? .95 : .72);
    sprite.position.set(Math.round(b.sx), Math.round(b.sy - Math.max(13, (b._sprite.height || 36) * .34)));
    sprite.play();
    r.fx.addChild(sprite);
    r.__gwFires.set(b, sprite);
  }

  function stopPixelFire(r, b) {
    const sprite = r.__gwFires?.get(b);
    if (!sprite) return;
    if (!sprite.destroyed) sprite.destroy();
    r.__gwFires.delete(b);
  }

  function updatePixelFires(r) {
    for (const [b, sprite] of [...(r.__gwFires || new Map())]) {
      if (!b || b.__v66Destroyed || !b._sprite || b._sprite.destroyed) {
        stopPixelFire(r, b);
        continue;
      }
      sprite.position.set(Math.round(b.sx), Math.round(b.sy - Math.max(13, (b._sprite.height || 36) * .34)));
    }
  }

  function disableLegacyVfx(r) {
    for (const [, fx] of r.__v66Fires || []) {
      try { if (fx?.c && !fx.c.destroyed) fx.c.destroy({ children: true }); } catch (_) {}
    }
    class DisabledLegacyFireMap extends Map { get size() { return 12; } }
    r.__v66Fires = new DisabledLegacyFireMap();
    if (Array.isArray(r.__v66BloodPool)) {
      for (const c of r.__v66BloodPool) c.renderable = false;
      if (r.__v66BloodPool.length > 5) {
        const extras = r.__v66BloodPool.splice(5);
        for (const c of extras) try { if (c && !c.destroyed) c.destroy({ children: true }); } catch (_) {}
      }
    }
  }

  function countPhysicalDeaths(r, w) {
    const meta = siegeMeta(w);
    for (const side of [w.a, w.b]) {
      for (const u of r.__v66Guards?.get(side) || []) {
        if (u.warId !== w.id || !u.dead || u.__gwDeathCounted) continue;
        u.__gwDeathCounted = true;
        meta.losses[side] = (meta.losses[side] || 0) + 1;
      }
    }
  }

  function chooseBreakthrough(sim, r, w) {
    const meta = siegeMeta(w);
    if (meta.breakthrough || w.__v66?.phase !== 'combat') return;
    if (!meta.combatStartedAt) meta.combatStartedAt = performance.now();
    if ((performance.now() - meta.combatStartedAt) / 1000 < BREAKTHROUGH_MIN_COMBAT) return;
    const lossA = meta.losses[w.a] || 0;
    const lossB = meta.losses[w.b] || 0;
    if (lossA + lossB < BREAKTHROUGH_MIN_DEATHS) return;
    const liveA = guardsFor(r, w.a, w.id).length;
    const liveB = guardsFor(r, w.b, w.id).length;
    let winner;
    if (lossA + 1 < lossB) winner = w.a;
    else if (lossB + 1 < lossA) winner = w.b;
    else if (liveA !== liveB) winner = liveA > liveB ? w.a : w.b;
    else winner = sim.power(sim.kingdoms[w.a]) >= sim.power(sim.kingdoms[w.b]) ? w.a : w.b;
    const loser = enemySideOf(w, winner);
    meta.breakthrough = true;
    meta.winner = winner;
    meta.loser = loser;
    meta.lastCapture = sim.age;
    const army = guardsFor(r, winner, w.id);
    if (army.length) meta.anchor = { x: army.reduce((n, u) => n + u.x, 0) / army.length, y: army.reduce((n, u) => n + u.y, 0) / army.length };
    else meta.anchor = frontWorld(sim, w);
    meta.captureTarget = null;
    if (!meta.announced) {
      meta.announced = true;
      const winnerKingdom = sim.kingdoms[winner];
      const loserKingdom = sim.kingdoms[loser];
      if (winnerKingdom && loserKingdom) {
        const host = document.querySelector('#toast');
        if (host) {
          const el = document.createElement('div');
          el.className = 'toast';
          el.textContent = `⚔️ ${winnerKingdom.name} breaks the line — siege of ${loserKingdom.name}`;
          host.appendChild(el);
          setTimeout(() => el.remove(), 3000);
        }
      }
    }
  }

  function capturableCells(sim, winner, loser) {
    const cells = [];
    for (const token of loser.territory || []) {
      const [x, y] = token.split(',').map(Number);
      if (sim.neigh(x, y).some(([nx, ny]) => sim.getOwner(nx, ny) === winner.id)) cells.push([x, y]);
    }
    return cells;
  }

  function chooseCaptureTarget(sim, w, meta) {
    const winner = sim.kingdoms[meta.winner];
    const loser = sim.kingdoms[meta.loser];
    if (!winner?.alive || !loser?.alive) return null;
    if (meta.captureTarget) {
      const [x, y] = meta.captureTarget;
      if (sim.getOwner(x, y) === loser.id && sim.neigh(x, y).some(([nx, ny]) => sim.getOwner(nx, ny) === winner.id)) return meta.captureTarget;
    }
    const cells = capturableCells(sim, winner, loser);
    if (!cells.length) return null;
    const anchor = meta.anchor || frontWorld(sim, w) || { x: sim.iso(...winner.capital)[0], y: sim.iso(...winner.capital)[1] };
    cells.sort((a, b) => {
      const pa = sim.iso(...a), pb = sim.iso(...b);
      const da = Math.hypot(pa[0] - anchor.x, pa[1] - anchor.y);
      const db = Math.hypot(pb[0] - anchor.x, pb[1] - anchor.y);
      const ca = Math.hypot(a[0] - loser.capital[0], a[1] - loser.capital[1]);
      const cb = Math.hypot(b[0] - loser.capital[0], b[1] - loser.capital[1]);
      return da - db + (ca - cb) * 2;
    });
    meta.captureTarget = cells[0];
    return meta.captureTarget;
  }

  function enemyNear(r, w, u, radius) {
    return guardsFor(r, enemySideOf(w, u.side), w.id).some(q => Math.hypot(u.x - q.x, u.y - q.y) <= radius);
  }

  function moveSiegeUnit(u, tx, ty, dt, speed) {
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < .6) return true;
    const step = Math.min(d, speed * dt);
    setGuardPosition(u, u.x + dx / d * step, u.y + dy / d * step);
    faceGuard(u, tx);
    if (u.s?._animKey !== 'walk') {
      u.s._animKey = 'walk';
      const frames = u.s._anim?.walk;
      if (frames?.length && u.s._sprite) { u.s._sprite.textures = frames; u.s._sprite.gotoAndPlay?.(0); }
    }
    return d <= 2;
  }

  function nearestRaidBuilding(loser, u) {
    const buildings = (loser.buildings || []).filter(b => !b.__v66Destroyed && b.hp > 0 && b.owner === loser.id && b.type !== 'castle');
    buildings.sort((a, b) => Math.hypot(a.sx - u.x, a.sy - u.y) - Math.hypot(b.sx - u.x, b.sy - u.y));
    return buildings[0] || null;
  }

  function raidBuilding(sim, r, u, loser, b, dt) {
    if (!b || b.__v66Destroyed || b.hp <= 0 || b.owner !== loser.id) return;
    const d = Math.hypot(u.x - b.sx, u.y - (b.sy + 4));
    if (d > RAID_RANGE) {
      moveSiegeUnit(u, b.sx, b.sy + 5, dt, RAIDER_SPEED);
      return;
    }
    faceGuard(u, b.sx);
    const now = performance.now();
    if (now < (u.__gwNextRaidHit || 0)) return;
    u.__gwNextRaidHit = now + rand(780, 1120);
    const damage = u.role === 'archer' ? rand(2.2, 3.8) : rand(4.2, 7.2);
    b.hp = Math.max(0, b.hp - damage);
    r.damageBuilding?.(b, damage);
    startPixelFire(r, b);
    playOneShot(r, 'impact', b.sx + rand(-6, 6), b.sy - rand(7, 18), .72);
    if (b.hp <= 0 && !b.__v66Destroyed) {
      loser.buildings = loser.buildings.filter(entry => entry !== b);
      sim.releaseFarmWorker?.(loser, b.id);
      r.destroyBuilding?.(b);
    }
  }

  function runSiegeMovement(sim, r, w, dt) {
    const meta = siegeMeta(w);
    if (!meta.breakthrough) return;
    const winner = sim.kingdoms[meta.winner];
    const loser = sim.kingdoms[meta.loser];
    if (!winner?.alive || !loser?.alive) return;
    const army = guardsFor(r, winner.id, w.id);
    if (!army.length) {
      meta.breakthrough = false;
      meta.winner = null;
      meta.loser = null;
      meta.anchor = null;
      meta.captureTarget = null;
      meta.losses = { [w.a]: 0, [w.b]: 0 };
      meta.combatStartedAt = performance.now();
      meta.announced = false;
      return;
    }

    const targetCell = chooseCaptureTarget(sim, w, meta);
    if (!targetCell) return;
    const targetWorld = sim.iso(...targetCell);
    const targetX = targetWorld[0];
    const targetY = targetWorld[1] + 5;
    const anchor = meta.anchor || (meta.anchor = { x: army[0].x, y: army[0].y });
    let dx = targetX - anchor.x, dy = targetY - anchor.y;
    const d = Math.max(.001, Math.hypot(dx, dy));
    dx /= d; dy /= d;
    const advance = Math.min(d, LEGION_SPEED * dt);
    anchor.x += dx * advance;
    anchor.y += dy * advance;
    const px = -dy, py = dx;

    const raiderCount = army.length >= 6 ? 2 : 1;
    const ordered = army.slice().sort((a, b) => {
      const ar = a.role === 'spear' ? 0 : a.role === 'sword' ? 1 : 2;
      const br = b.role === 'spear' ? 0 : b.role === 'sword' ? 1 : 2;
      return ar - br;
    });
    const legion = ordered.slice(0, Math.max(1, ordered.length - raiderCount));
    const raiders = ordered.slice(legion.length);
    const cols = Math.min(3, Math.max(2, legion.length));
    legion.forEach((u, i) => {
      if (enemyNear(r, w, u, 15)) return;
      const col = (i % cols) - (cols - 1) / 2;
      const row = Math.floor(i / cols);
      moveSiegeUnit(u, anchor.x - dx * (row * 8.5) + px * col * 9.5, anchor.y - dy * (row * 8.5) + py * col * 9.5, dt, LEGION_SPEED + 1.5);
      faceGuard(u, targetX);
    });
    raiders.forEach(u => {
      if (enemyNear(r, w, u, 13)) return;
      const b = nearestRaidBuilding(loser, u);
      if (b) raidBuilding(sim, r, u, loser, b, dt);
      else moveSiegeUnit(u, targetX, targetY, dt, RAIDER_SPEED);
    });

    const defenders = guardsFor(r, loser.id, w.id);
    defenders.forEach((u, i) => {
      if (enemyNear(r, w, u, 14)) return;
      const home = sim.iso(...loser.capital);
      moveSiegeUnit(u, home[0] + ((i % 3) - 1) * 9, home[1] + 8 + Math.floor(i / 3) * 8, dt, 12.5);
      faceGuard(u, anchor.x);
    });
  }

  function processPhysicalCapture(sim, r, w) {
    const meta = siegeMeta(w);
    if (!meta.breakthrough || sim.age - meta.lastCapture < CAPTURE_INTERVAL) return;
    const winner = sim.kingdoms[meta.winner];
    const loser = sim.kingdoms[meta.loser];
    if (!winner?.alive || !loser?.alive) return;
    const target = chooseCaptureTarget(sim, w, meta);
    if (!target || !meta.anchor) return;
    const p = sim.iso(...target);
    if (Math.hypot(meta.anchor.x - p[0], meta.anchor.y - (p[1] + 5)) > 20) return;

    const [x, y] = target;
    meta.lastCapture = sim.age;
    sim.capture(winner, loser, x, y);
    winner.military += .35;
    loser.military = Math.max(2, Number(loser.military || 2) - .8);
    playOneShot(r, 'impact', p[0], p[1], .8);
    r.redrawTerritories?.(sim);
    r.redrawSettlementGround?.(sim);
    meta.captureTarget = null;
    if ((x === loser.capital[0] && y === loser.capital[1]) || loser.territory.size <= 1) sim.eliminate(loser, winner);
  }

  function prepareVisualState(r) {
    for (const [, arr] of r.__v66Guards || []) {
      for (const u of arr || []) {
        if (!u?.s || u.s.destroyed) continue;
        if (!u.__gwVisual) u.__gwVisual = { x: Number.isFinite(u.s.x) ? u.s.x : u.x, y: Number.isFinite(u.s.y) ? u.s.y : u.y };
      }
    }
  }

  function smoothGuardSprites(r, dt) {
    const alpha = 1 - Math.exp(-VISUAL_SMOOTH * clamp(dt, .001, .05));
    for (const [, arr] of r.__v66Guards || []) {
      for (const u of arr || []) {
        if (!u?.s || u.s.destroyed) continue;
        const state = u.__gwVisual || (u.__gwVisual = { x: u.x, y: u.y });
        const tx = Number.isFinite(u.x) ? u.x : u.s.x;
        const ty = Number.isFinite(u.y) ? u.y : u.s.y;
        const d = Math.hypot(tx - state.x, ty - state.y);
        if (d > SNAP_DISTANCE || u.deadAge > .1) { state.x = tx; state.y = ty; }
        else { state.x += (tx - state.x) * alpha; state.y += (ty - state.y) * alpha; }
        u.s.position.set(state.x, state.y);
        u.s.zIndex = Math.round(state.y * 100) + 16;
        if (u.s._sprite && !u.dead) {
          u.s._sprite.tint = 0xffffff;
          if (u.s._animKey === 'walk') u.s._sprite.animationSpeed = u.role === 'sword' ? .19 : (u.role === 'spear' ? .18 : .16);
        }
      }
    }
  }

  function install(sim) {
    if (!sim || sim.__gwIntegratedBattleInstalled) return;
    const r = sim.r;
    if (!r?.P || !r?.__v66Guards || typeof r.updateWars !== 'function') {
      setTimeout(() => install(sim), 40);
      return;
    }
    sim.__gwIntegratedBattleInstalled = true;
    document.documentElement.dataset.battleSystem = 'stable-integrated-physical-siege';

    const stableUpdateWars = r.updateWars.bind(r);
    const stableRemoveFarmer = typeof r.removeFarmer === 'function' ? r.removeFarmer.bind(r) : null;
    const stableDamageBuilding = typeof r.damageBuilding === 'function' ? r.damageBuilding.bind(r) : null;
    const stableDestroyBuilding = typeof r.destroyBuilding === 'function' ? r.destroyBuilding.bind(r) : null;
    const stableBattleFx = typeof r.battleFx === 'function' ? r.battleFx.bind(r) : null;
    const stableFrontImpact = typeof r.frontImpact === 'function' ? r.frontImpact.bind(r) : null;

    installLazySoldiers(r);
    disableLegacyVfx(r);
    void preloadPixelVfx(r);

    r.casualty = function (w, loserSide, winnerSide) {
      const u = engagedCandidate(this, w, loserSide);
      if (!u) return;
      u.__gwHp = guardHp(u) - rand(8, 13);
      if (Math.random() < .45) this.battleFx?.(u.x, u.y - 3);
      if (u.__gwHp <= 0) killGuard(sim, this, u, winnerSide);
    };

    if (stableRemoveFarmer) {
      r.removeFarmer = function (f) {
        if (f?.__v66WarDeath && f._sprite && !civilianHasNearbyEnemy(sim, this, f)) f.__v66WarDeath = false;
        return stableRemoveFarmer(f);
      };
    }

    r.damageBuilding = function (b, damage) {
      stableDamageBuilding?.(b, damage);
      if (b && b.hp / Math.max(1, b.maxHp) < .9) startPixelFire(this, b);
    };

    r.destroyBuilding = function (b, ...args) {
      if (b && !b.__gwDestroyFxPlayed) {
        b.__gwDestroyFxPlayed = true;
        playOneShot(this, 'destroy', b.sx, b.sy - 8, b.type === 'castle' ? 1.2 : .92);
      }
      stopPixelFire(this, b);
      return stableDestroyBuilding?.(b, ...args);
    };

    r.battleFx = function (x, y, ...args) {
      if (!playOneShot(this, 'blood', x, y, .78)) stableBattleFx?.(x, y, ...args);
    };

    r.frontImpact = function (w, battleSim) {
      const f = frontWorld(battleSim || sim, w);
      if (f && playOneShot(this, 'impact', f.x + rand(-5, 5), f.y + rand(-3, 3), .8)) return;
      stableFrontImpact?.(w, battleSim);
    };

    sim.resolveWars = function () {
      for (const w of this.wars || []) {
        if (w.done) continue;
        const a = this.kingdoms[w.a], b = this.kingdoms[w.b];
        if (!a?.alive || !b?.alive) { w.done = true; this.r.endWar?.(w); continue; }
        const pair = this.borderPair(a, b);
        if (!pair) { w.done = true; this.r.endWar?.(w); continue; }
        w.front = pair;
        processPhysicalCapture(this, this.r, w);
      }
    };

    r.updateWars = function (battleSim, rawDt) {
      const dt = clamp(Number(rawDt) || .016, .001, MAX_STEP);
      prepareVisualState(this);
      this.__gwAccumulator = (this.__gwAccumulator || 0) + dt;
      if (this.__gwAccumulator >= AI_STEP) {
        const step = Math.min(this.__gwAccumulator, MAX_STEP);
        this.__gwAccumulator = 0;
        controlReinforcements(battleSim, this);
        for (const w of battleSim.wars || []) if (!w.done) rebalanceTargets(this, w);
        withRelevantBuildings(battleSim, this, () => stableUpdateWars(battleSim, step));
        for (const w of battleSim.wars || []) {
          if (w.done) continue;
          resolvePhysicalCombat(battleSim, this, w);
          deClumpGuards(this, w);
          countPhysicalDeaths(this, w);
          const meta = siegeMeta(w);
          if (w.__v66?.phase !== 'combat') meta.combatStartedAt = 0;
          chooseBreakthrough(battleSim, this, w);
          runSiegeMovement(battleSim, this, w, step);
        }
        trimExcessGuards(battleSim, this);
        updatePixelFires(this);
      }
      smoothGuardSprites(this, dt);

      this.__gwSortClock = (this.__gwSortClock || 0) + dt;
      if (this.entities) {
        if (this.__gwSortClock >= SORT_INTERVAL) {
          this.__gwSortClock = 0;
          this.entities.sortDirty = true;
        } else this.entities.sortDirty = false;
      }
    };

    for (const [, arr] of r.__v66Guards || []) {
      for (const u of arr) {
        guardHp(u);
        u.__gwNextHit = performance.now() + rand(100, 700);
      }
    }
  }

  function wait() {
    const sim = window.__SIM;
    if (!sim || !sim.__v66LivingBattlesInstalled || !sim.r?.__v66Guards) setTimeout(wait, 30);
    else install(sim);
  }

  wait();
})();
