(() => {
  'use strict';

  const VERSION = '6.6-living-battles-2-single-scale-owner';
  const PEACE_GUARD_MAX = 8;
  const WAR_GUARD_MAX = 14;
  const MAX_FRAME_DT = 0.05;
  const CIVILIAN_VISIBLE_CAP = 24;
  const LARGE_PREFAB_SCALE = { warehouse: 0.72 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b, c, d) => Math.hypot(c - a, d - b);

  function activeWarFor(sim, kingdomId) {
    return (sim.wars || []).find(w => !w.done && (w.a === kingdomId || w.b === kingdomId)) || null;
  }

  function parseCell(token) {
    const comma = token.indexOf(',');
    return [Number(token.slice(0, comma)), Number(token.slice(comma + 1))];
  }

  function pickOwnedCell(sim, k, preferCapital = false) {
    let chosen = k.capital;
    let seen = 0;
    for (const token of k.territory || []) {
      const cell = parseCell(token);
      if (!sim.isWalkableCell?.(cell[0], cell[1])) continue;
      if (sim.buildingAt?.(cell[0], cell[1])) continue;
      if (preferCapital && Math.hypot(cell[0] - k.capital[0], cell[1] - k.capital[1]) > 5.5) continue;
      seen++;
      if (Math.random() < 1 / seen) chosen = cell;
    }
    return chosen || k.capital;
  }

  function cellWorld(sim, cell, jitter = true) {
    const p = sim.iso(cell[0], cell[1]);
    return [p[0] + (jitter ? rand(-4, 4) : 0), p[1] + 6 + (jitter ? rand(-2, 2) : 0)];
  }

  function desiredGuardCount(k, atWar) {
    const n = Math.round(3 + Math.sqrt(Math.max(1, Number(k.military) || 1)) * 0.5);
    return clamp(n, 4, atWar ? WAR_GUARD_MAX : PEACE_GUARD_MAX);
  }

  function setAnim(r, u, key) {
    if (!u?.s || u.dead) return;
    if (u.animKey === key) return;
    u.animKey = key;
    r.swapAnim?.(u.s, key);
  }

  function faceTarget(u, targetX) {
    if (!u?.s?._sprite) return;
    // Never flip both the parent and the child. The old battle code did both,
    // effectively cancelling the direction change and leaving one army backwards.
    u.s.scale.x = Math.abs(u.s.scale.x || 1);
    const sprite = u.s._sprite;
    const mag = Math.abs(sprite.scale.x || 1);
    sprite.scale.x = targetX >= u.x ? mag : -mag;
  }

  function makeBloodPool(r) {
    if (r.__v66BloodPool) return;
    r.__v66BloodPool = [];
    for (let i = 0; i < 18; i++) {
      const c = new r.P.Container();
      c.visible = false;
      c.__life = 0;
      c.__parts = [];
      for (let p = 0; p < 7; p++) {
        const g = new r.P.Graphics();
        const size = p < 2 ? 3 : 2;
        g.rect(-size / 2, -size / 2, size, size).fill({ color: p % 3 === 0 ? 0xc12a20 : 0x861414, alpha: 0.95 });
        c.addChild(g);
        c.__parts.push({ g, vx: 0, vy: 0 });
      }
      r.fx.addChild(c);
      r.__v66BloodPool.push(c);
    }
  }

  function bloodBurst(r, x, y, strength = 1) {
    makeBloodPool(r);
    let c = r.__v66BloodPool.find(v => !v.visible);
    if (!c) c = r.__v66BloodPool.reduce((a, b) => a.__life < b.__life ? a : b);
    c.visible = true;
    c.alpha = 1;
    c.position.set(x, y);
    c.__life = 0.38 + strength * 0.22;
    c.scale.set(0.85 + strength * 0.2);
    for (const part of c.__parts) {
      part.g.position.set(rand(-2, 2), rand(-2, 1));
      part.g.alpha = 1;
      part.vx = rand(-13, 13) * strength;
      part.vy = rand(-22, -6) * strength;
    }
  }

  function updateBloodPool(r, dt) {
    if (!r.__v66BloodPool) return;
    for (const c of r.__v66BloodPool) {
      if (!c.visible) continue;
      c.__life -= dt;
      for (const part of c.__parts) {
        part.vy += 34 * dt;
        part.g.x += part.vx * dt;
        part.g.y += part.vy * dt;
        part.g.alpha = clamp(c.__life * 2.6, 0, 1);
      }
      if (c.__life <= 0) c.visible = false;
    }
  }

  function startBuildingFire(r, b) {
    if (!b || b.__v66Destroyed) return;
    r.__v66Fires ||= new Map();
    if (r.__v66Fires.has(b)) {
      const fx = r.__v66Fires.get(b);
      fx.life = Math.max(fx.life, 8);
      return;
    }
    if (r.__v66Fires.size >= 12) return;

    const c = new r.P.Container();
    const flames = [];
    const colors = [0xffd33d, 0xff7b21, 0xc92d16, 0xffa62b];
    for (let i = 0; i < 5; i++) {
      const g = new r.P.Graphics();
      g.rect(-2, -5, 4, 8).fill({ color: colors[i % colors.length], alpha: 0.92 });
      c.addChild(g);
      flames.push(g);
    }
    const smoke = [];
    for (let i = 0; i < 3; i++) {
      const g = new r.P.Graphics();
      g.rect(-2, -2, 4, 4).fill({ color: i % 2 ? 0x6c6863 : 0x8b8580, alpha: 0.52 });
      c.addChild(g);
      smoke.push(g);
    }
    c.position.set(b.sx, b.sy - Math.max(12, (b._sprite?.height || 32) * 0.32));
    c.zIndex = Math.round((b.sy - 10) * 100) + 40;
    r.fx.addChild(c);
    r.__v66Fires.set(b, { c, flames, smoke, phase: Math.random() * 10, life: 10 });
  }

  function stopBuildingFire(r, b) {
    const fx = r.__v66Fires?.get(b);
    if (!fx) return;
    fx.c.destroy({ children: true });
    r.__v66Fires.delete(b);
  }

  function updateFires(r, dt) {
    if (!r.__v66Fires) return;
    for (const [b, fx] of [...r.__v66Fires]) {
      if (!b || b.__v66Destroyed || !b._sprite) {
        stopBuildingFire(r, b);
        continue;
      }
      fx.life -= dt;
      fx.phase += dt * 8;
      fx.c.position.set(b.sx, b.sy - Math.max(12, (b._sprite?.height || 32) * 0.32));
      fx.flames.forEach((g, i) => {
        g.x = (i - 2) * 3 + Math.sin(fx.phase + i * 1.7) * 1.5;
        g.y = -Math.abs(Math.sin(fx.phase * 1.25 + i)) * 4 - (i % 2) * 2;
        g.scale.y = 0.78 + Math.abs(Math.sin(fx.phase + i)) * 0.55;
        g.alpha = 0.72 + Math.abs(Math.sin(fx.phase * 1.4 + i)) * 0.28;
      });
      fx.smoke.forEach((g, i) => {
        const loop = (fx.phase * 0.55 + i * 2.1) % 5;
        g.x = Math.sin(fx.phase * 0.45 + i) * 5;
        g.y = -8 - loop * 4;
        g.alpha = 0.5 * (1 - loop / 5);
      });
      if (fx.life <= 0 && (b.hp / Math.max(1, b.maxHp)) > 0.55) stopBuildingFire(r, b);
    }
  }

  function resizeLargePrefab(b) {
    const factor = LARGE_PREFAB_SCALE[b?.type];
    if (!factor || !b?._sprite || b.__v66PrefabScaled) return;
    b.__v66PrefabScaled = true;
    b._sprite.scale.x *= factor;
    b._sprite.scale.y *= factor;
    b._sprite.y = Math.round(b.sy + 1);
  }

  function enforceGroundContact(sim) {
    for (const k of sim.kingdoms || []) {
      for (const b of k.buildings || []) {
        if (b._foundation) { b._foundation.visible = false; b._foundation.alpha = 0; }
        if (b._shadow) { b._shadow.visible = false; b._shadow.alpha = 0; }
        if (b._sprite) b._sprite.y = Math.round(b.sy + (b.type === 'farm' ? 0 : 1));
        resizeLargePrefab(b);
      }
    }
  }

  function guardArrays(r, kingdomId) {
    if (!r.__v66Guards) r.__v66Guards = new Map();
    if (!r.__v66Guards.has(kingdomId)) r.__v66Guards.set(kingdomId, []);
    return r.__v66Guards.get(kingdomId);
  }

  function choosePatrolTarget(sim, k, u) {
    const cell = pickOwnedCell(sim, k, true);
    const p = cellWorld(sim, cell, true);
    u.targetX = p[0];
    u.targetY = p[1];
    u.wait = rand(0.15, 0.85);
  }

  function spawnGuard(sim, r, k) {
    const arr = guardArrays(r, k.id);
    const i = (k.__v66GuardSeq = (k.__v66GuardSeq || 0) + 1);
    const role = i % 5 === 0 ? 'archer' : (i % 3 === 0 ? 'spear' : 'sword');
    const s = r.makeSoldier?.(k, role);
    if (!s) return null;
    s.scale.set(0.92);
    const cell = pickOwnedCell(sim, k, true);
    const p = cellWorld(sim, cell, true);
    s.position.set(p[0], p[1]);
    s.zIndex = Math.round(p[1] * 100) + 16;
    r.entities.addChild(s);
    const u = {
      s, side: k.id, role, x: p[0], y: p[1], state: 'patrol', warId: null,
      targetX: p[0], targetY: p[1], wait: rand(0.1, 0.7), speed: rand(17, 21),
      group: 0, slot: 0, attackCooldown: rand(0, 0.6), targetGuard: null,
      targetBuilding: null, dead: false, deadAge: 0, hurt: 0, animKey: ''
    };
    arr.push(u);
    choosePatrolTarget(sim, k, u);
    return u;
  }

  function separationVector(u, peers) {
    let sx = 0, sy = 0;
    for (const q of peers) {
      if (q === u || q.dead) continue;
      const dx = u.x - q.x, dy = u.y - q.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 0.001 || d2 > 64) continue;
      const d = Math.sqrt(d2);
      const f = (8 - d) / 8;
      sx += dx / d * f;
      sy += dy / d * f;
    }
    return [sx, sy];
  }

  function buildingSteer(sim, u) {
    let sx = 0, sy = 0;
    for (const k of sim.kingdoms || []) {
      if (!k.alive) continue;
      for (const b of k.buildings || []) {
        if (b.__v66Destroyed) continue;
        const dx = u.x - b.sx;
        const dy = u.y - (b.sy - 5);
        if (Math.abs(dx) > 28 || Math.abs(dy) > 24) continue;
        const d = Math.max(0.1, Math.hypot(dx, dy));
        const radius = b.type === 'castle' ? 25 : (b.type === 'farm' ? 17 : 15);
        if (d >= radius) continue;
        const f = (radius - d) / radius;
        sx += dx / d * f * 1.8;
        sy += dy / d * f * 1.3;
      }
    }
    return [sx, sy];
  }

  function moveGuard(sim, r, u, tx, ty, dt, speed, peers) {
    let dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.6) {
      setAnim(r, u, 'idle');
      return true;
    }
    let vx = dx / d, vy = dy / d;
    const sep = separationVector(u, peers);
    const obs = buildingSteer(sim, u);
    vx += sep[0] * 0.72 + obs[0];
    vy += sep[1] * 0.72 + obs[1];
    const len = Math.max(0.001, Math.hypot(vx, vy));
    vx /= len; vy /= len;
    const step = Math.min(d, speed * dt);
    u.x += vx * step;
    u.y += vy * step;
    u.s.position.set(u.x, u.y);
    u.s.zIndex = Math.round(u.y * 100) + 16;
    faceTarget(u, u.x + vx * 8);
    setAnim(r, u, 'walk');
    return d <= 2.2;
  }

  function warGeometry(sim, w, side, u) {
    if (!w.front) return null;
    const ownCell = side === w.a ? w.front[0] : w.front[1];
    const enemyCell = side === w.a ? w.front[1] : w.front[0];
    const own = sim.iso(ownCell[0], ownCell[1]);
    const enemy = sim.iso(enemyCell[0], enemyCell[1]);
    let dx = enemy[0] - own[0], dy = enemy[1] - own[1];
    const len = Math.max(1, Math.hypot(dx, dy));
    dx /= len; dy /= len;
    const px = -dy, py = dx;
    const mx = (own[0] + enemy[0]) / 2;
    const my = (own[1] + enemy[1]) / 2;
    const lane = (u.group - 1) * 15 + ((u.slot % 2) ? 3.5 : -3.5);
    const row = Math.floor(u.slot / 2);
    return {
      enemyX: enemy[0], enemyY: enemy[1],
      rallyX: own[0] - dx * (28 + row * 5) + px * lane,
      rallyY: own[1] - dy * (28 + row * 5) + py * lane + 5,
      advanceX: mx - dx * (7 + row * 1.5) + px * lane * 0.72,
      advanceY: my - dy * (7 + row * 1.5) + py * lane * 0.72 + 5
    };
  }

  function assignWarGuards(sim, r, w, side) {
    const arr = guardArrays(r, side).filter(u => !u.dead);
    let assigned = arr.filter(u => u.warId === w.id).length;
    for (const u of arr) {
      if (u.warId && u.warId !== w.id) continue;
      if (u.warId === w.id) continue;
      u.warId = w.id;
      u.group = assigned % 3;
      u.slot = Math.floor(assigned / 3);
      u.state = 'rally';
      u.targetGuard = null;
      u.targetBuilding = null;
      assigned++;
    }
  }

  function prepareWar(sim, r, w) {
    if (!w.__v66) {
      w.__v66 = { phase: 'rally', age: 0, phaseAge: 0, lastCivilian: -99 };
    }
    assignWarGuards(sim, r, w, w.a);
    assignWarGuards(sim, r, w, w.b);
  }

  function nearestEnemyGuard(r, u, enemySide) {
    let best = null, bestD = Infinity;
    for (const q of guardArrays(r, enemySide)) {
      if (q.dead) continue;
      const d = dist(u.x, u.y, q.x, q.y);
      if (d < bestD) { best = q; bestD = d; }
    }
    return [best, bestD];
  }

  function nearestEnemyBuilding(enemy, u, allowCastle = false) {
    let best = null, bestD = Infinity;
    for (const b of enemy.buildings || []) {
      if (b.__v66Destroyed || b.hp <= 0) continue;
      if (!allowCastle && b.type === 'castle') continue;
      const d = dist(u.x, u.y, b.sx, b.sy);
      if (d < bestD) { best = b; bestD = d; }
    }
    return [best, bestD];
  }

  function attackGuard(r, u, target, dt) {
    u.attackCooldown -= dt;
    faceTarget(u, target.x);
    setAnim(r, u, 'attack');
    if (u.attackCooldown > 0) return;
    u.attackCooldown = rand(0.55, 0.9);
    target.hurt = 0.12;
    if (Math.random() < 0.34) bloodBurst(r, target.x, target.y - 6, 0.45);
  }

  function destroySiegedBuilding(sim, r, enemy, b) {
    if (!b || b.__v66Destroyed) return;
    b.__v66Destroyed = true;
    enemy.buildings = (enemy.buildings || []).filter(entry => entry !== b);
    sim.releaseFarmWorker?.(enemy, b.id);
    stopBuildingFire(r, b);
    r.destroyBuilding?.(b);
    r.redrawSettlementGround?.(sim);
  }

  function attackBuilding(sim, r, u, enemy, b, dt) {
    u.attackCooldown -= dt;
    faceTarget(u, b.sx);
    setAnim(r, u, 'attack');
    if (u.attackCooldown > 0) return;
    u.attackCooldown = rand(0.65, 1.05);

    if (b.type === 'castle') {
      startBuildingFire(r, b);
      return;
    }

    const damage = u.role === 'archer' ? rand(1.8, 3.1) : rand(3.2, 5.8);
    b.hp = Math.max(0, b.hp - damage);
    r.damageBuilding?.(b, damage);
    if ((b.hp / Math.max(1, b.maxHp)) < 0.82 || Math.random() < 0.18) startBuildingFire(r, b);
    if (b.hp <= 0) destroySiegedBuilding(sim, r, enemy, b);
  }

  function updateCombatGuard(sim, r, w, u, dt, peers) {
    const enemySide = u.side === w.a ? w.b : w.a;
    const enemy = sim.kingdoms[enemySide];
    if (!enemy?.alive) return;

    let target = u.targetGuard;
    if (!target || target.dead || dist(u.x, u.y, target.x, target.y) > 80) {
      target = nearestEnemyGuard(r, u, enemySide)[0];
      u.targetGuard = target;
    }

    const guardDistance = target ? dist(u.x, u.y, target.x, target.y) : Infinity;
    const [building, buildingDistance] = nearestEnemyBuilding(enemy, u, enemy.territory.size <= 5);

    // A unit that has reached the village may peel off to burn/destroy nearby
    // structures while the rest of the formation keeps enemy guards occupied.
    if (building && buildingDistance < 34 && guardDistance > 24) {
      u.targetBuilding = building;
      if (buildingDistance > 14) moveGuard(sim, r, u, building.sx, building.sy + 5, dt, 19, peers);
      else attackBuilding(sim, r, u, enemy, building, dt);
      return;
    }

    if (target) {
      if (guardDistance > (u.role === 'archer' ? 27 : 9.5)) {
        moveGuard(sim, r, u, target.x, target.y, dt, u.role === 'archer' ? 18 : 21, peers);
      } else {
        attackGuard(r, u, target, dt);
      }
      return;
    }

    if (building) {
      if (buildingDistance > 14) moveGuard(sim, r, u, building.sx, building.sy + 5, dt, 19, peers);
      else attackBuilding(sim, r, u, enemy, building, dt);
      return;
    }

    const geo = warGeometry(sim, w, u.side, u);
    if (geo) moveGuard(sim, r, u, geo.enemyX, geo.enemyY + 5, dt, 19, peers);
  }

  function updatePatrolGuard(sim, r, k, u, dt, peers) {
    if (u.wait > 0) {
      u.wait -= dt;
      setAnim(r, u, 'idle');
      return;
    }
    if (!Number.isFinite(u.targetX) || dist(u.x, u.y, u.targetX, u.targetY) < 3) {
      choosePatrolTarget(sim, k, u);
      return;
    }
    if (moveGuard(sim, r, u, u.targetX, u.targetY, dt, u.speed, peers)) {
      u.wait = rand(0.35, 1.15);
      choosePatrolTarget(sim, k, u);
    }
  }

  function updateDeadGuard(r, u, dt) {
    u.deadAge += dt;
    if (u.s.destroyed) return;
    if (u.deadAge < 2.5) {
      u.s.alpha = 1;
    } else {
      u.s.alpha = clamp(1 - (u.deadAge - 2.5) / 1.5, 0, 1);
    }
  }

  function markGuardDead(r, u) {
    if (!u || u.dead) return;
    u.dead = true;
    u.deadAge = 0;
    u.state = 'dead';
    u.targetGuard = null;
    u.targetBuilding = null;
    bloodBurst(r, u.x, u.y - 6, 1.15);
    r.swapAnim?.(u.s, 'death');
    if (u.s?._sprite) {
      u.s._sprite.loop = false;
      u.s._sprite.animationSpeed = 0.14;
      u.s._sprite.gotoAndPlay?.(0);
    }
  }

  function updateWarPhase(sim, r, w, dt) {
    prepareWar(sim, r, w);
    const meta = w.__v66;
    meta.age += dt;
    meta.phaseAge += dt;

    const units = [...guardArrays(r, w.a), ...guardArrays(r, w.b)].filter(u => !u.dead && u.warId === w.id);
    if (!units.length) return;

    if (meta.phase === 'rally') {
      let reached = 0;
      for (const u of units) {
        const geo = warGeometry(sim, w, u.side, u);
        if (geo && dist(u.x, u.y, geo.rallyX, geo.rallyY) < 7) reached++;
      }
      if ((meta.phaseAge > 1.15 && reached / units.length >= 0.68) || meta.phaseAge > 3.4) {
        meta.phase = 'advance';
        meta.phaseAge = 0;
        for (const u of units) u.state = 'advance';
      }
    } else if (meta.phase === 'advance') {
      let reached = 0;
      for (const u of units) {
        const geo = warGeometry(sim, w, u.side, u);
        if (geo && dist(u.x, u.y, geo.advanceX, geo.advanceY) < 8) reached++;
      }
      if ((meta.phaseAge > 1.25 && reached / units.length >= 0.48) || meta.phaseAge > 4.2) {
        meta.phase = 'combat';
        meta.phaseAge = 0;
        for (const u of units) u.state = 'combat';
      }
    }
  }

  function cleanupDeadGuards(r) {
    for (const [id, arr] of r.__v66Guards || []) {
      const keep = [];
      for (const u of arr) {
        if (u.dead && u.deadAge > 4.1) {
          if (!u.s.destroyed) u.s.destroy({ children: true });
        } else keep.push(u);
      }
      r.__v66Guards.set(id, keep);
    }
  }

  function ensureGuardPopulation(sim, r, dt) {
    r.__v66Clock = (r.__v66Clock || 0) + dt;
    r.__v66NextSpawn ||= new Map();
    for (const k of sim.kingdoms || []) {
      if (!k.alive) continue;
      const war = activeWarFor(sim, k.id);
      const desired = desiredGuardCount(k, !!war);
      const arr = guardArrays(r, k.id).filter(u => !u.dead);
      const next = r.__v66NextSpawn.get(k.id) || 0;
      if (arr.length < desired && r.__v66Clock >= next) {
        const u = spawnGuard(sim, r, k);
        r.__v66NextSpawn.set(k.id, r.__v66Clock + (war ? 0.22 : 0.34));
        if (u && war) {
          const assigned = guardArrays(r, k.id).filter(q => q.warId === war.id && !q.dead).length;
          u.warId = war.id;
          u.group = assigned % 3;
          u.slot = Math.floor(assigned / 3);
          u.state = war.__v66?.phase === 'combat' ? 'advance' : 'rally';
        }
      }
    }
  }

  function updateAllGuards(sim, r, dt) {
    for (const k of sim.kingdoms || []) {
      if (!k.alive) continue;
      const arr = guardArrays(r, k.id);
      const war = activeWarFor(sim, k.id);
      for (const u of arr) {
        if (u.dead) {
          updateDeadGuard(r, u, dt);
          continue;
        }
        if (u.hurt > 0) {
          u.hurt -= dt;
          setAnim(r, u, 'hurt');
          continue;
        }
        if (!war || u.warId !== war.id) {
          u.warId = null;
          u.state = 'patrol';
          updatePatrolGuard(sim, r, k, u, dt, arr);
          continue;
        }

        const meta = war.__v66;
        const geo = warGeometry(sim, war, u.side, u);
        if (!meta || !geo) continue;
        if (meta.phase === 'rally') {
          u.state = 'rally';
          moveGuard(sim, r, u, geo.rallyX, geo.rallyY, dt, 22, arr);
          faceTarget(u, geo.enemyX);
        } else if (meta.phase === 'advance') {
          u.state = 'advance';
          moveGuard(sim, r, u, geo.advanceX, geo.advanceY, dt, 24, arr);
          faceTarget(u, geo.enemyX);
        } else {
          u.state = 'combat';
          updateCombatGuard(sim, r, war, u, dt, arr);
        }
      }
    }
    if (r.entities) r.entities.sortDirty = true;
  }

  function markCivilianVictims(sim, k) {
    const target = Math.min(Number(k.pop) || 0, CIVILIAN_VISIBLE_CAP);
    const drop = Math.max(0, (k.farmers || []).length - target);
    if (!drop) return;
    const war = activeWarFor(sim, k.id);
    if (!war?.front) return;
    const enemyCell = k.id === war.a ? war.front[1] : war.front[0];
    const fp = sim.iso(enemyCell[0], enemyCell[1]);
    const candidates = (k.farmers || []).filter(f => !f.fixedBuilding).sort((a, b) => dist(a.x, a.y, fp[0], fp[1]) - dist(b.x, b.y, fp[0], fp[1]));
    const victims = candidates.slice(0, drop);
    if (!victims.length) return;
    const victimSet = new Set(victims);
    for (const f of victims) f.__v66WarDeath = true;
    // syncCitizens removes unassigned citizens from the end. Move the selected
    // front-line civilians there so the visible death matches the real pop loss.
    k.farmers = k.farmers.filter(f => !victimSet.has(f));
    k.farmers.push(...victims);
  }

  function install(sim) {
    if (!sim || sim.__v66LivingBattlesInstalled) return;
    const r = sim.r;
    if (!r?.P || !r?.entities) {
      setTimeout(() => install(sim), 50);
      return;
    }
    sim.__v66LivingBattlesInstalled = true;
    window.__BUILD_VERSION = VERSION;
    document.documentElement.dataset.battleSystem = 'living-v66';
    const tag = document.querySelector('.build-tag');
    if (tag) tag.textContent = 'V6.6 LIVING BATTLES';

    r.__v66Guards = new Map();
    r.__v66Fires = new Map();
    makeBloodPool(r);
    enforceGroundContact(sim);

    const oldStartWar = typeof r.startWar === 'function' ? r.startWar.bind(r) : null;
    const oldEndWar = typeof r.endWar === 'function' ? r.endWar.bind(r) : null;
    const oldDamageBuilding = typeof r.damageBuilding === 'function' ? r.damageBuilding.bind(r) : null;
    const oldDestroyBuilding = typeof r.destroyBuilding === 'function' ? r.destroyBuilding.bind(r) : null;
    const oldRemoveFarmer = typeof r.removeFarmer === 'function' ? r.removeFarmer.bind(r) : null;
    const oldSyncCitizens = typeof sim.syncCitizens === 'function' ? sim.syncCitizens.bind(sim) : null;
    const oldResolveWars = typeof sim.resolveWars === 'function' ? sim.resolveWars.bind(sim) : null;
    const oldAddBuilding = typeof sim.addBuilding === 'function' ? sim.addBuilding.bind(sim) : null;

    r.startWar = function (w, battleSim) {
      // Destroy any legacy instant-clash visual that may already exist, then let
      // guards physically rally from their real kingdom positions.
      if (this.warVisuals?.has(w.id) && oldEndWar) oldEndWar(w);
      w.__v66 = { phase: 'rally', age: 0, phaseAge: 0, lastCivilian: -99 };
      prepareWar(battleSim || sim, this, w);
    };

    r.endWar = function (w) {
      if (this.warVisuals?.has(w.id) && oldEndWar) oldEndWar(w);
      for (const side of [w.a, w.b]) {
        for (const u of guardArrays(this, side)) {
          if (u.warId !== w.id || u.dead) continue;
          u.warId = null;
          u.state = 'patrol';
          u.targetGuard = null;
          u.targetBuilding = null;
          const k = sim.kingdoms[side];
          if (k?.alive) choosePatrolTarget(sim, k, u);
        }
      }
    };

    r.casualty = function (w, loserSide) {
      const live = guardArrays(this, loserSide).filter(u => !u.dead && (!u.warId || u.warId === w.id));
      if (!live.length) return;
      const u = live[(Math.random() * live.length) | 0];
      markGuardDead(this, u);
    };

    // Replace the old bright impact flashes with small pixel blood/dust events.
    r.battleFx = function (x, y) { bloodBurst(this, x, y - 3, 0.38); };
    r.frontImpact = function (w, battleSim) {
      if (!w?.front) return;
      const pa = (battleSim || sim).iso(...w.front[0]);
      const pb = (battleSim || sim).iso(...w.front[1]);
      bloodBurst(this, (pa[0] + pb[0]) / 2 + rand(-5, 5), (pa[1] + pb[1]) / 2 + rand(-4, 4), 0.5);
    };

    r.damageBuilding = function (b, damage) {
      const now = performance.now();
      if (!b.__v66LastDamageFx || now - b.__v66LastDamageFx > 300) {
        b.__v66LastDamageFx = now;
        oldDamageBuilding?.(b, damage);
      } else if (b._sprite) {
        const ratio = clamp(b.hp / Math.max(1, b.maxHp), 0, 1);
        b.damageState = ratio < 0.35 ? 2 : 1;
        b._sprite.tint = ratio < 0.35 ? 0x886d63 : 0xc9ad9d;
      }
      if ((b.hp / Math.max(1, b.maxHp)) < 0.82) startBuildingFire(this, b);
    };

    r.destroyBuilding = function (b) {
      if (b) b.__v66Destroyed = true;
      stopBuildingFire(this, b);
      oldDestroyBuilding?.(b);
    };

    r.removeFarmer = function (f) {
      if (!f?.__v66WarDeath || !f._sprite) {
        oldRemoveFarmer?.(f);
        return;
      }
      const s = f._sprite;
      f._sprite = null;
      if (f.id) this.farmerSprites?.delete(f.id);
      bloodBurst(this, s.x, s.y - 5, 0.9);
      s.stop?.();
      s.rotation = rand(-0.16, 0.16);
      let life = 1.55;
      const fade = () => {
        if (s.destroyed) { this.app.ticker.remove(fade); return; }
        life -= Math.min(this.app.ticker.deltaMS / 1000, MAX_FRAME_DT);
        s.alpha = clamp(life / 1.1, 0, 1);
        if (life <= 0) { s.destroy(); this.app.ticker.remove(fade); }
      };
      this.app.ticker.add(fade);
    };

    if (oldSyncCitizens) {
      sim.syncCitizens = async function (k) {
        markCivilianVictims(this, k);
        return oldSyncCitizens(k);
      };
    }

    if (oldResolveWars) {
      sim.resolveWars = function () {
        // Territory cannot jump forward while troops are still rallying/marching.
        // Holding lastCapture here makes conquest follow the visible army.
        for (const w of this.wars || []) {
          if (w.done) continue;
          if (!w.__v66 || w.__v66.phase !== 'combat') w.lastCapture = this.age;
        }
        return oldResolveWars();
      };
    }

    if (oldAddBuilding) {
      sim.addBuilding = async function (...args) {
        const b = await oldAddBuilding(...args);
        if (b) {
          if (b._foundation) { b._foundation.visible = false; b._foundation.alpha = 0; }
          if (b._shadow) { b._shadow.visible = false; b._shadow.alpha = 0; }
          // Wait for the construction grow animation before shrinking the large shed.
          setTimeout(() => resizeLargePrefab(b), 1600);
        }
        return b;
      };
    }

    r.updateWars = function (battleSim, rawDt) {
      const dt = clamp(Number(rawDt) || 0.016, 0.001, MAX_FRAME_DT);
      ensureGuardPopulation(battleSim, this, dt);
      for (const w of battleSim.wars || []) {
        if (w.done) continue;
        updateWarPhase(battleSim, this, w, dt);
      }
      updateAllGuards(battleSim, this, dt);
      updateBloodPool(this, dt);
      updateFires(this, dt);
      cleanupDeadGuards(this);
      this.__v66GroundClock = (this.__v66GroundClock || 0) + dt;
      if (this.__v66GroundClock > 1.4) {
        this.__v66GroundClock = 0;
        enforceGroundContact(battleSim);
      }
    };

    for (const w of sim.wars || []) {
      if (!w.done) {
        if (r.warVisuals?.has(w.id) && oldEndWar) oldEndWar(w);
        w.__v66 = { phase: 'rally', age: 0, phaseAge: 0, lastCivilian: -99 };
      }
    }

    // Seed only one guard per kingdom immediately. The rest arrive gradually so
    // a JOIN/ATTACK never creates a single-frame allocation spike.
    for (const k of sim.kingdoms || []) if (k.alive && !guardArrays(r, k.id).length) spawnGuard(sim, r, k);

    setTimeout(() => enforceGroundContact(sim), 1700);
  }

  function wait() {
    const sim = window.__SIM;
    if (!sim || !sim.__v65Installed || !sim.r?.P) {
      setTimeout(wait, 25);
      return;
    }
    install(sim);
  }

  wait();
})();
