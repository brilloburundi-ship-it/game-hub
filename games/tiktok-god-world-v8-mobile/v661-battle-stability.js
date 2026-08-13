(() => {
  'use strict';

  const VERSION = '8.0.3-battle-readability-arrows-2';
  const AI_HZ = 30;
  const AI_STEP = 1 / AI_HZ;
  const MAX_STEP = 0.045;
  const MAX_WAR_GUARDS = 9;
  const MAX_PEACE_GUARDS = 6;
  const MIN_ALLY_SPACING = 10.5;
  const MIN_ENEMY_SPACING = 7.2;
  const BUILDING_RELEVANCE_RADIUS = 105;
  const FRONT_RELEVANCE_RADIUS = 135;
  const SORT_INTERVAL = 0.12;
  const FIRE_MIN_MS = 3200;
  const FIRE_MAX_MS = 3800;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function activeWarFor(sim, kingdomId) {
    return (sim.wars || []).find(w => !w.done && (w.a === kingdomId || w.b === kingdomId)) || null;
  }

  function activeWarBetween(sim, winner, loser) {
    return (sim.wars || []).find(w =>
      !w.done && w.__v66?.phase === 'combat' && Array.isArray(w.front) &&
      ((w.a === winner.id && w.b === loser.id) || (w.a === loser.id && w.b === winner.id))
    ) || null;
  }

  function guardsFor(r, kingdomId) {
    return r.__v66Guards?.get(kingdomId) || [];
  }

  function liveGuards(r, kingdomId, warId = null) {
    return guardsFor(r, kingdomId).filter(u => !u.dead && (!warId || u.warId === warId));
  }

  function frontWorld(sim, w) {
    if (!w?.front) return null;
    const a = sim.iso(...w.front[0]);
    const b = sim.iso(...w.front[1]);
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
  }

  function setGuardPosition(u, x, y, r = null) {
    if (!u?.s || u.s.destroyed) return;
    if (r?.__v66NavigationBlocked?.(x, y)) return;
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

  function ensureArrowPool(r) {
    if (r.__v803ArrowPool) return r.__v803ArrowPool;
    r.__v803ArrowPool = [];
    for (let index = 0; index < 28; index++) {
      const arrow = new r.P.Container();
      const shaft = new r.P.Graphics();
      shaft.moveTo(-7, 0).lineTo(5, 0).stroke({ color: 0xf4d58b, width: 1.8, alpha: 1 });
      shaft.poly([4, -2.5, 9, 0, 4, 2.5]).fill({ color: 0xfff0b0, alpha: 1 });
      shaft.moveTo(-7, 0).lineTo(-10, -2).moveTo(-7, 0).lineTo(-10, 2).stroke({ color: 0xc98d4b, width: 1.4, alpha: 1 });
      arrow.addChild(shaft);
      arrow.visible = false;
      arrow.__active = false;
      arrow.zIndex = 999999;
      r.fx.addChild(arrow);
      r.__v803ArrowPool.push(arrow);
    }
    return r.__v803ArrowPool;
  }

  function spawnBattleArrow(r, u, targetX, targetY) {
    const pool = ensureArrowPool(r);
    const arrow = pool.find(item => !item.__active) || pool[0];
    const startX = u.x + (targetX >= u.x ? 5 : -5), startY = u.y - 12;
    arrow.__active = true;
    arrow.visible = true;
    arrow.alpha = 1;
    arrow.__age = 0;
    arrow.__duration = clamp(Math.hypot(targetX - startX, targetY - startY) / 92, 0.28, 0.52);
    arrow.__startX = startX; arrow.__startY = startY;
    arrow.__targetX = targetX; arrow.__targetY = targetY;
    arrow.position.set(startX, startY);
    arrow.rotation = Math.atan2(targetY - startY, targetX - startX);
    return arrow;
  }

  function updateBattleArrows(r, dt) {
    for (const arrow of r.__v803ArrowPool || []) {
      if (!arrow.__active) continue;
      arrow.__age += dt;
      const t = clamp(arrow.__age / arrow.__duration, 0, 1);
      const x = arrow.__startX + (arrow.__targetX - arrow.__startX) * t;
      const y = arrow.__startY + (arrow.__targetY - arrow.__startY) * t - Math.sin(Math.PI * t) * 8;
      arrow.position.set(x, y);
      const tangentY = (arrow.__targetY - arrow.__startY) - Math.cos(Math.PI * t) * Math.PI * 8;
      arrow.rotation = Math.atan2(tangentY, arrow.__targetX - arrow.__startX);
      arrow.alpha = t > 0.86 ? (1 - t) / 0.14 : 1;
      if (t >= 1) { arrow.__active = false; arrow.visible = false; }
    }
  }

  function killGuard(sim, r, u, killerSide = null) {
    if (!u || u.dead || !u.s || u.s.destroyed) return false;
    u.dead = true;
    u.deadAge = 0;
    u.state = 'dead';
    u.targetGuard = null;
    u.targetBuilding = null;
    u.__v661Hp = 0;
    r.battleFx?.(u.x, u.y - 2);
    r.swapAnim?.(u.s, 'death');
    if (u.s._sprite) {
      u.s._sprite.loop = false;
      u.s._sprite.animationSpeed = 0.09;
      u.s._sprite.gotoAndPlay?.(0);
    }
    const kingdom = sim.kingdoms?.[u.side];
    if (kingdom?.alive) kingdom.military = Math.max(2, Number(kingdom.military || 2) - 0.45);
    if (killerSide != null) {
      const killer = sim.kingdoms?.[killerSide];
      if (killer?.alive) killer.military += 0.08;
    }
    return true;
  }

  function guardHp(u) {
    if (!Number.isFinite(u.__v661Hp)) {
      u.__v661Hp = u.role === 'archer' ? 38 : (u.role === 'spear' ? 54 : 48);
    }
    return u.__v661Hp;
  }

  function engagedCandidate(r, w, loserSide) {
    const enemySide = loserSide === w.a ? w.b : w.a;
    const enemies = liveGuards(r, enemySide, w.id).filter(u => u.state === 'combat');
    if (!enemies.length) return null;
    let best = null;
    let bestD = Infinity;
    for (const u of liveGuards(r, loserSide, w.id)) {
      if (u.state !== 'combat') continue;
      for (const enemy of enemies) {
        const d = distance(u, enemy);
        if (d < bestD) {
          bestD = d;
          best = u;
        }
      }
    }
    return bestD <= 13 ? best : null;
  }

  function rebalanceTargets(r, w) {
    if (!w?.__v66 || w.__v66.phase !== 'combat') return;
    const now = performance.now();
    if (w.__v661RetargetAt && now < w.__v661RetargetAt) return;
    w.__v661RetargetAt = now + 650;

    for (const side of [w.a, w.b]) {
      const enemySide = side === w.a ? w.b : w.a;
      const attackers = liveGuards(r, side, w.id).filter(u => u.state === 'combat');
      const defenders = liveGuards(r, enemySide, w.id).filter(u => u.state === 'combat');
      if (!attackers.length || !defenders.length) continue;

      const loads = new Map(defenders.map(d => [d, 0]));
      for (const u of attackers) {
        if (u.targetGuard && !u.targetGuard.dead && loads.has(u.targetGuard)) {
          loads.set(u.targetGuard, (loads.get(u.targetGuard) || 0) + 1);
        }
      }

      for (const u of attackers) {
        if (u.targetGuard && !u.targetGuard.dead && (loads.get(u.targetGuard) || 0) <= 2) continue;
        let best = null;
        let bestScore = Infinity;
        for (const d of defenders) {
          const load = loads.get(d) || 0;
          if (load >= 2) continue;
          const score = distance(u, d) + load * 15;
          if (score < bestScore) {
            best = d;
            bestScore = score;
          }
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
    const a = liveGuards(r, w.a, w.id).filter(u => u.state === 'combat');
    const b = liveGuards(r, w.b, w.id).filter(u => u.state === 'combat');
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
      }
      if (!target || target.dead) continue;

      const d = distance(u, target);
      const range = u.role === 'archer' ? 29 : 9.6;
      if (d > range) continue;
      faceGuard(u, target.x);
      faceGuard(target, u.x);

      if (!u.__v661NextHit) u.__v661NextHit = now + rand(120, 500);
      if (now < u.__v661NextHit) continue;
      u.__v661NextHit = now + rand(1050, 1400);

      const damage = u.role === 'archer' ? rand(4.5, 7.5) : (u.role === 'spear' ? rand(8.5, 12.5) : rand(7.5, 11.5));
      target.__v661Hp = guardHp(target) - damage;
      target.hurt = Math.max(Number(target.hurt) || 0, 0.08);
      if (Math.random() < 0.34) r.battleFx?.(target.x, target.y - 3);
      if (target.__v661Hp <= 0) killGuard(sim, r, target, u.side);
      processed.add(target);
    }
  }

  function deClumpGuards(r, w) {
    const a = liveGuards(r, w.a, w.id);
    const b = liveGuards(r, w.b, w.id);
    const all = [...a, ...b].filter(u => u.state === 'combat' || u.state === 'advance' || u.state === 'rally');
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
        if (d < 0.01) {
          const angle = ((i * 17 + j * 29) % 360) * Math.PI / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const push = Math.min(1.15, (minD - d) * 0.28);
        const nx = dx / d;
        const ny = dy / d;
        setGuardPosition(u, u.x - nx * push, u.y - ny * push, r);
        setGuardPosition(q, q.x + nx * push, q.y + ny * push, r);
      }
    }
  }

  function nearbyBuildingSubset(sim, r, k, original) {
    if (!original || original.length <= 70) return original;
    const points = [];
    for (const [, guards] of r.__v66Guards || []) {
      for (const u of guards) if (!u.dead) points.push({ x: u.x, y: u.y });
    }
    for (const w of sim.wars || []) {
      if (w.done) continue;
      const f = frontWorld(sim, w);
      if (f) points.push(f);
    }
    if (!points.length) return original.slice(0, 70);

    const kept = [];
    for (const b of original) {
      if (b.__v66Destroyed || b.hp <= 0) continue;
      if (b.type === 'castle') { kept.push(b); continue; }
      let near = false;
      for (const p of points) {
        const radius = p.__front ? FRONT_RELEVANCE_RADIUS : BUILDING_RELEVANCE_RADIUS;
        const dx = b.sx - p.x;
        const dy = b.sy - p.y;
        if (dx * dx + dy * dy <= radius * radius) { near = true; break; }
      }
      if (near) kept.push(b);
    }
    if (kept.length < 18) {
      const extra = original
        .filter(b => !kept.includes(b) && !b.__v66Destroyed && b.hp > 0)
        .sort((a, b) => {
          const da = points.reduce((m, p) => Math.min(m, Math.hypot(a.sx - p.x, a.sy - p.y)), Infinity);
          const db = points.reduce((m, p) => Math.min(m, Math.hypot(b.sx - p.x, b.sy - p.y)), Infinity);
          return da - db;
        })
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
        k.buildings = nearbyBuildingSubset(sim, r, k, k.buildings || []);
      }
      return fn();
    } finally {
      for (const [k, original] of originals) {
        k.buildings = original.filter(b => !b.__v66Destroyed && b.hp > 0);
      }
    }
  }

  function expireBuildingFires(sim, r) {
    const fires = r.__v66Fires;
    if (!(fires instanceof Map) || !fires.size) return;
    const now = performance.now();
    for (const [building, fx] of [...fires]) {
      if (!building || building.__v66Destroyed || !fx) continue;
      if (!Number.isFinite(fx.__v661DestroyAt)) fx.__v661DestroyAt = now + rand(FIRE_MIN_MS, FIRE_MAX_MS);
      if (Number.isFinite(fx.life)) fx.life = Math.min(fx.life, 4);
      if (now < fx.__v661DestroyAt) continue;

      const kingdom = sim.kingdoms?.[building.owner] ||
        (sim.kingdoms || []).find(k => (k.buildings || []).includes(building));
      building.hp = 0;
      building.__v66Destroyed = true;
      if (kingdom) {
        kingdom.buildings = (kingdom.buildings || []).filter(entry => entry !== building);
        sim.releaseFarmWorker?.(kingdom, building.id);
      }
      r.destroyBuilding?.(building);
      r.redrawSettlementGround?.(sim);
      sim.updateSelected?.();
    }
  }

  function controlReinforcements(sim, r) {
    if (!r.__v66NextSpawn) return;
    r.__v661Reinforce ||= new Map();
    const clock = Number(r.__v66Clock) || 0;
    for (const k of sim.kingdoms || []) {
      if (!k.alive) continue;
      const war = activeWarFor(sim, k.id);
      const live = liveGuards(r, k.id).length;
      const limit = war ? MAX_WAR_GUARDS : MAX_PEACE_GUARDS;
      if (live >= limit) {
        r.__v66NextSpawn.set(k.id, Number.POSITIVE_INFINITY);
        continue;
      }
      const state = r.__v661Reinforce.get(k.id) || { next: 0 };
      if (clock >= state.next) {
        r.__v66NextSpawn.set(k.id, 0);
        state.next = clock + (war ? 3.2 : 1.25);
      } else {
        r.__v66NextSpawn.set(k.id, Number.POSITIVE_INFINITY);
      }
      r.__v661Reinforce.set(k.id, state);
    }
  }

  function trimExcessGuards(r) {
    for (const [kingdomId, arr] of r.__v66Guards || []) {
      const war = activeWarFor(r.sim, kingdomId);
      const limit = war ? MAX_WAR_GUARDS : MAX_PEACE_GUARDS;
      let live = arr.filter(u => !u.dead);
      if (live.length <= limit) continue;
      const remove = live.slice(limit);
      const removeSet = new Set(remove);
      for (const u of remove) {
        if (u.s && !u.s.destroyed) u.s.destroy({ children: true });
      }
      r.__v66Guards.set(kingdomId, arr.filter(u => !removeSet.has(u)));
    }
  }

  function civilianHasNearbyEnemy(sim, r, f) {
    if (!f?._sprite) return false;
    const owner = (sim.kingdoms || []).find(k => (k.farmers || []).includes(f));
    if (!owner) return false;
    const war = activeWarFor(sim, owner.id);
    if (!war) return false;
    const enemySide = owner.id === war.a ? war.b : war.a;
    for (const u of liveGuards(r, enemySide, war.id)) {
      if (u.state !== 'combat') continue;
      if (Math.hypot(u.x - f._sprite.x, u.y - f._sprite.y) <= 17) return true;
    }
    return false;
  }

  function install(sim) {
    if (!sim || sim.__v661BattleStabilityInstalled) return;
    const r = sim.r;
    if (!r?.__v66Guards || typeof r.updateWars !== 'function') {
      setTimeout(() => install(sim), 40);
      return;
    }
    sim.__v661BattleStabilityInstalled = true;
    window.__BUILD_VERSION = VERSION;
    document.documentElement.dataset.battleSystem = 'living-v803-readable-arrows';

    const v66UpdateWars = r.updateWars.bind(r);
    const v66RemoveFarmer = typeof r.removeFarmer === 'function' ? r.removeFarmer.bind(r) : null;
    const v66SwapAnim = typeof r.swapAnim === 'function' ? r.swapAnim.bind(r) : null;
    const originalCapture = typeof sim.capture === 'function' ? sim.capture.bind(sim) : null;

    if (v66SwapAnim) {
      r.swapAnim = function(holder, key) {
        const result = v66SwapAnim(holder, key);
        const sprite = holder?._sprite, role = holder?._role;
        if (!sprite || sprite.destroyed || !role) return result;
        if (key === 'attack') sprite.animationSpeed = role === 'archer' ? 0.055 : 0.07;
        else if (key === 'hurt') sprite.animationSpeed = role === 'archer' ? 0.065 : 0.08;
        else if (key !== 'death') sprite.animationSpeed = role === 'archer' ? 0.10 : 0.13;
        return result;
      };
    }

    if (originalCapture) {
      sim.capture = function(winner, loser, x, y) {
        const war = activeWarBetween(this, winner, loser);
        if (war?.front) {
          const enemyFront = winner.id === war.a ? war.front[1] : war.front[0];
          const fx = Number(enemyFront?.[0]), fy = Number(enemyFront?.[1]);
          const valid = Number.isFinite(fx) && Number.isFinite(fy) &&
            this.getOwner?.(fx, fy) === loser.id &&
            (this.neigh?.(fx, fy) || []).some(([nx, ny]) => this.getOwner?.(nx, ny) === winner.id);
          if (valid) { x = fx; y = fy; }
        }
        const result = originalCapture(winner, loser, x, y);
        this.r?.redrawTerritories?.(this);
        return result;
      };
    }

    // Old territory resolution used to pick a random guard anywhere in the army.
    // Translate the abstract casualty into damage only when a soldier is actually
    // touching the fight. Visible deaths therefore happen where the combat is.
    r.casualty = function (w, loserSide, winnerSide) {
      const u = engagedCandidate(this, w, loserSide);
      if (!u) return;
      u.__v661Hp = guardHp(u) - rand(8, 13);
      if (Math.random() < 0.45) this.battleFx?.(u.x, u.y - 3);
      if (u.__v661Hp <= 0) killGuard(sim, this, u, winnerSide);
    };

    if (v66RemoveFarmer) {
      r.removeFarmer = function (f) {
        if (f?.__v66WarDeath && f._sprite && !civilianHasNearbyEnemy(sim, this, f)) {
          f.__v66WarDeath = false;
        }
        return v66RemoveFarmer(f);
      };
    }

    r.spawnBattleArrow = function(u, targetX, targetY) {
      return spawnBattleArrow(this, u, targetX, targetY);
    };

    r.updateWars = function (battleSim, rawDt) {
      const dt = clamp(Number(rawDt) || 0.016, 0.001, MAX_STEP);
      updateBattleArrows(this, dt);
      this.__v661Accumulator = (this.__v661Accumulator || 0) + dt;
      if (this.__v661Accumulator < AI_STEP) return;
      const step = Math.min(this.__v661Accumulator, MAX_STEP);
      this.__v661Accumulator = 0;

      controlReinforcements(battleSim, this);
      for (const w of battleSim.wars || []) if (!w.done) rebalanceTargets(this, w);
      withRelevantBuildings(battleSim, this, () => v66UpdateWars(battleSim, step));
      expireBuildingFires(battleSim, this);

      for (const w of battleSim.wars || []) {
        if (w.done) continue;
        resolvePhysicalCombat(battleSim, this, w);
        deClumpGuards(this, w);
      }
      trimExcessGuards(this);

      this.__v661SortClock = (this.__v661SortClock || 0) + step;
      if (this.entities) {
        if (this.__v661SortClock >= SORT_INTERVAL) {
          this.__v661SortClock = 0;
          this.entities.sortDirty = true;
        } else {
          this.entities.sortDirty = false;
        }
      }
    };

    for (const [, arr] of r.__v66Guards) {
      for (const u of arr) {
        guardHp(u);
        u.__v661NextHit = performance.now() + rand(100, 700);
      }
    }
  }

  function wait() {
    const sim = window.__SIM;
    if (!sim || !sim.__v66LivingBattlesInstalled || !sim.r?.__v66Guards) {
      setTimeout(wait, 30);
      return;
    }
    install(sim);
  }

  wait();
})();
