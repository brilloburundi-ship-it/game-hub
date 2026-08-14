(() => {
  'use strict';

  const VERSION = '20260814-kw3-true-kw2-base-1';
  const MAX_ACTIVE = 2;
  const PREP_SECONDS = 35;
  const ARENA_RADIUS = 11;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const key = (x, y) => `${x},${y}`;

  if (window.__KW3_SURVIVOR?.installed) return;

  function alive(sim) {
    return (sim.kingdoms || []).filter(k => k?.alive && !k.founding);
  }

  function activeWar(sim) {
    return (sim.wars || []).find(w => !w.done) || null;
  }

  function arenaCandidates(sim) {
    const pts = [];
    for (let y = 4; y < sim.w.gridH - 4; y++) for (let x = 4; x < sim.w.gridW - 4; x++) {
      if (sim.getOwner(x, y) !== -1) continue;
      if (!sim.isBuildableCell(x, y, 'castle') || sim.biome(x, y) !== 'grass') continue;
      if (sim.spawnRoom?.(x, y) < 7) continue;
      const [sx, sy] = sim.iso(x, y);
      pts.push({ x, y, sx, sy });
    }
    return pts;
  }

  function chooseArenaSpawns(sim) {
    if (Array.isArray(sim.__kw3ArenaSpawns) && sim.__kw3ArenaSpawns.length === 2) return sim.__kw3ArenaSpawns;
    const pts = arenaCandidates(sim);
    if (pts.length < 2) {
      const a = sim.freeSpawn?.() || [Math.floor(sim.w.gridW * .35), Math.floor(sim.w.gridH * .5)];
      const b = [Math.min(sim.w.gridW - 5, a[0] + 10), Math.max(4, a[1] - 10)];
      return (sim.__kw3ArenaSpawns = [a, b]);
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx); minY = Math.min(minY, p.sy); maxY = Math.max(maxY, p.sy); }
    const midY = (minY + maxY) * .5;
    const spanX = Math.max(1, maxX - minX);
    const targetA = minX + spanX * .34;
    const targetB = minX + spanX * .66;
    const score = (p, tx) => Math.abs(p.sx - tx) + Math.abs(p.sy - midY) * .55;
    const a = [...pts].sort((p, q) => score(p, targetA) - score(q, targetA))[0];
    const b = [...pts]
      .filter(p => Math.hypot(p.x - a.x, p.y - a.y) >= 9)
      .sort((p, q) => score(p, targetB) - score(q, targetB))[0] || pts[pts.length - 1];
    sim.__kw3ArenaSpawns = [[a.x, a.y], [b.x, b.y]];
    return sim.__kw3ArenaSpawns;
  }

  function claimFortressGround(sim, k) {
    const [cx, cy] = k.capital;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (Math.hypot(dx, dy) > 3.6) continue;
      const x = cx + dx, y = cy + dy;
      if (!sim.land(x, y)) continue;
      const owner = sim.getOwner(x, y);
      if (owner !== -1 && owner !== k.id) continue;
      sim.setOwner(x, y, k.id);
      k.territory.add(key(x, y));
    }
    sim.r.redrawTerritories?.(sim, true);
  }

  async function forceBuilding(sim, k, type, dx, dy) {
    const x = k.capital[0] + dx, y = k.capital[1] + dy;
    if (!sim.inBounds(x, y) || !sim.land(x, y)) return null;
    if (sim.buildingAt?.(x, y)) return null;
    try { return await sim.addBuilding(k, type, x, y, true, true); }
    catch (_) { return null; }
  }

  async function buildFortress(sim, k, slot) {
    if (!k?.alive || k.__kw3FortressReady) return;
    k.__kw3FortressReady = true;
    claimFortressGround(sim, k);
    k.resources.food = Math.max(k.resources.food, 260);
    k.resources.wood = Math.max(k.resources.wood, 320);
    k.resources.stone = Math.max(k.resources.stone, 260);
    k.resources.gold = Math.max(k.resources.gold, 90);
    k.popCap = Math.max(k.popCap, 24);
    k.military = Math.max(k.military, 24);

    const gateY = slot === 0 ? 2 : -2;
    const walls = [];
    for (let x = -2; x <= 2; x++) {
      if (!(x === 0 && gateY === -2)) walls.push(['wall', x, -2]);
      if (!(x === 0 && gateY === 2)) walls.push(['wall', x, 2]);
    }
    for (let y = -1; y <= 1; y++) {
      walls.push(['wall', -2, y]);
      walls.push(['wall', 2, y]);
    }
    for (const [type, dx, dy] of walls) await forceBuilding(sim, k, type, dx, dy);
    await forceBuilding(sim, k, 'gate', 0, gateY);
    for (const [dx, dy] of [[-2,-2],[2,-2],[-2,2],[2,2]]) await forceBuilding(sim, k, 'stone_tower', dx, dy);

    await forceBuilding(sim, k, 'barracks', -1, 0);
    await forceBuilding(sim, k, 'farm', 1, 0);
    await forceBuilding(sim, k, 'house_a', 0, slot === 0 ? -1 : 1);
    await forceBuilding(sim, k, 'market', 1, slot === 0 ? -1 : 1);

    // Use the real KW2 port system if its renderer/runtime accepts the type.
    let coast = null, best = Infinity;
    for (const token of k.territory) {
      const [x, y] = token.split(',').map(Number);
      const d = Number(sim.coastDistance?.(x, y) ?? 99);
      if (d < best) { best = d; coast = [x, y]; }
    }
    if (coast && best <= 4 && !sim.buildingAt?.(...coast)) {
      try { await sim.addBuilding(k, 'port', coast[0], coast[1], true, true); } catch (_) {}
    }

    sim.__v800Performance?.rebuildBuildingIndex?.();
    sim.r.redrawTerritories?.(sim, true);
    sim.r.redrawSettlementGround?.(sim);
  }

  function focusArena(sim) {
    const live = alive(sim);
    if (live.length < 2) {
      if (live[0]) sim.r.focusCell?.(...live[0].capital);
      return;
    }
    const mx = Math.round((live[0].capital[0] + live[1].capital[0]) / 2);
    const my = Math.round((live[0].capital[1] + live[1].capital[1]) / 2);
    sim.r.focusCell?.(mx, my);
    const root = sim.r.root;
    if (root?.scale?.set) {
      const desired = clamp(Math.min(.72, Number(root.scale.x || .72)), .52, .72);
      root.scale.set(desired);
    }
  }

  function repairChampion(sim, k) {
    if (!k?.alive) return;
    for (const b of k.buildings || []) {
      if (b.__v66Destroyed) continue;
      if (Number.isFinite(b.maxHp)) b.hp = Math.max(Number(b.hp || 0), b.maxHp * .82);
    }
    k.resources.food += 160;
    k.resources.wood += 140;
    k.resources.stone += 110;
    k.resources.gold += 70;
    k.military = Math.max(20, Number(k.military || 20));
  }

  function install(sim) {
    if (sim.__kw3SurvivorRuntime === VERSION) return;
    const rawFreeSpawn = sim.freeSpawn.bind(sim);
    const rawJoin = sim.join.bind(sim);
    const rawAttack = sim.attack.bind(sim);
    const rawStartWar = sim.startWar.bind(sim);
    const rawTick = sim.tick.bind(sim);
    const rawPickExpansion = typeof sim.pickExpansionCell === 'function' ? sim.pickExpansionCell.bind(sim) : null;
    const queue = [];

    chooseArenaSpawns(sim);

    sim.freeSpawn = function() {
      const slots = chooseArenaSpawns(this);
      const occupied = (this.kingdoms || []).filter(k => k?.alive || k?.founding).length;
      if (occupied < MAX_ACTIVE) return slots[occupied] || rawFreeSpawn();
      return null;
    };

    if (rawPickExpansion) {
      sim.pickExpansionCell = function(k, candidates, salt = 0, target = null) {
        const limited = (candidates || []).filter(([x, y]) => Math.hypot(x - k.capital[0], y - k.capital[1]) <= ARENA_RADIUS);
        return rawPickExpansion(k, limited.length ? limited : candidates, salt, target);
      };
    }

    sim.join = async function(name) {
      const clean = String(name || 'Player').trim().slice(0, 18);
      if (!clean) return null;
      const existing = this.kingdomByName?.get?.(clean.toLowerCase());
      if (existing?.alive) return rawJoin(clean);
      if (alive(this).length >= MAX_ACTIVE || this.__kw3VictoryBusy) {
        if (!queue.some(n => n.toLowerCase() === clean.toLowerCase())) queue.push(clean);
        document.documentElement.dataset.kw3Queue = queue.join('|');
        return null;
      }

      const before = alive(this).length;
      const k = await rawJoin(clean);
      if (!k?.alive) return k;
      k.__kw3Role = before === 0 ? 'champion' : 'challenger';
      k.__kw3Streak ||= 0;
      k.__kw3Shield = true;
      await buildFortress(this, k, before);

      const live = alive(this);
      if (live.length === 1) {
        this.__kw3RoundActive = false;
        this.matchStarted = false;
        document.documentElement.dataset.kw3State = 'waiting-challenger';
      } else if (live.length === 2) {
        // KW2's four-minute development lock is intentionally expired here; KW3 uses its own short prep phase.
        this.__kw2DevelopmentStartedAt = Number(this.age || 0) - 240;
        this.__kw3RoundActive = true;
        this.matchStarted = true;
        this.__kw3PrepUntil = Number(this.age || 0) + PREP_SECONDS;
        for (const side of live) side.__kw3Shield = true;
        document.documentElement.dataset.kw3State = 'fortifying';
        focusArena(this);
      }
      return k;
    };

    sim.attack = function(attacker, target) {
      if (attacker?.__kw3Shield || target?.__kw3Shield) return false;
      if (Number(this.__kw3PrepUntil || 0) > Number(this.age || 0)) return false;
      return rawAttack(attacker, target);
    };

    sim.startWar = function(a, b) {
      if (a?.__kw3Shield || b?.__kw3Shield) return false;
      if (Number(this.__kw3PrepUntil || 0) > Number(this.age || 0)) return false;
      return rawStartWar(a, b);
    };

    sim.checkVictory = function() {
      if (!this.__kw3RoundActive || this.__kw3VictoryBusy) return false;
      const contenders = alive(this).filter(k => k.territory.size > 0 && k.buildings.some(b => b.type === 'castle' && !b.__v66Destroyed));
      if (contenders.length !== 1) return false;
      this.__kw3RoundActive = false;
      this.showVictory(contenders[0]);
      return true;
    };

    sim.showVictory = function(winner) {
      if (!winner?.alive || this.__kw3VictoryBusy) return;
      this.__kw3VictoryBusy = true;
      this.matchOver = false;
      this.matchStarted = false;
      winner.__kw3Streak = Number(winner.__kw3Streak || 0) + 1;
      winner.__kw3Shield = true;
      repairChampion(this, winner);
      document.documentElement.dataset.kw3State = 'champion-shield';
      document.documentElement.dataset.kw3Champion = winner.name;
      const screen = document.querySelector('#victoryScreen');
      const nameNode = document.querySelector('#victoryWinner');
      const note = document.querySelector('#victoryRestart');
      if (nameNode) nameNode.textContent = winner.name;
      if (note) note.textContent = `Champion shield active — ${winner.__kw3Streak} win streak`;
      screen?.classList.remove('hidden');
      this.select?.(winner);
      this.r.focusCell?.(...winner.capital);

      window.setTimeout(async () => {
        screen?.classList.add('hidden');
        this.__kw3VictoryBusy = false;
        const current = alive(this);
        if (current.length === 1) {
          current[0].__kw3Shield = true;
          current[0].__kw3Role = 'champion';
        }
        document.documentElement.dataset.kw3State = 'waiting-challenger';
        if (queue.length && alive(this).length < MAX_ACTIVE) {
          const next = queue.shift();
          document.documentElement.dataset.kw3Queue = queue.join('|');
          await this.join(next);
        }
      }, 6000);
    };

    sim.tick = async function() {
      await rawTick();
      const live = alive(this);
      const remaining = Math.max(0, Math.ceil(Number(this.__kw3PrepUntil || 0) - Number(this.age || 0)));
      document.documentElement.dataset.kw3Prep = String(remaining);
      if (this.__kw3RoundActive && live.length === 2 && remaining <= 0 && !activeWar(this)) {
        for (const side of live) side.__kw3Shield = false;
        document.documentElement.dataset.kw3State = 'siege';
        rawAttack(live[0], live[1]);
      }
      if (!this.__kw3RoundActive && live.length === 1 && !this.__kw3VictoryBusy) live[0].__kw3Shield = true;
    };

    // Brand the inherited KW2 UI without changing its layout/visual language.
    document.title = 'Kingdom War 3 — Survivor Siege';
    const brand = document.querySelector('.brand b');
    if (brand) brand.textContent = 'Kingdom War 3';
    const ranking = document.querySelector('#ranking > b');
    if (ranking) ranking.textContent = 'ARENA POWERS';

    sim.__kw3SurvivorRuntime = VERSION;
    window.__KW3_SURVIVOR = Object.freeze({
      installed: true,
      version: VERSION,
      renderer: 'kingdom-war-2-native',
      flora: 'kingdom-war-2-native-atlas',
      maxActiveKingdoms: MAX_ACTIVE,
      survivorChampion: true,
      challengerQueue: true,
      fortressWalls: true,
      championShield: true,
      prepSeconds: PREP_SECONDS,
      arenaRadius: ARENA_RADIUS
    });
    document.documentElement.dataset.kw3Survivor = VERSION;
    document.documentElement.dataset.kw3Renderer = 'kw2-native';
  }

  async function wait() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (sim?.r && window.__TREE_DEPTH_V706?.installed && window.__KW2_INDIVIDUAL_ARMIES?.installed && typeof sim.join === 'function' && typeof sim.tick === 'function') {
        install(sim);
        return;
      }
      await sleep(25);
    }
    throw new Error('Kingdom War 3 could not attach to the native Kingdom War 2 runtime');
  }

  wait().catch(error => {
    window.__KW3_SURVIVOR_ERROR = String(error?.stack || error?.message || error);
    console.error('[Kingdom War 3 survivor runtime]', error);
  });
})();
