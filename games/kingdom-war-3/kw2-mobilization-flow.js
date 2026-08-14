(() => {
  'use strict';

  const VERSION = '20260814-mobilization-flow-1';
  const DEVELOPMENT_SECONDS = 240;
  const CORE_ARMY = 12;
  const BASE_VISIBLE_ARMY = 18;
  const MAX_VISIBLE_ARMY = 28;
  const POWER_DEADBAND = 1.08;
  const CIVILIAN_SPEED = 31;
  const SOLDIER_SPEED = 38;
  const EXIT_SPEED = 27;
  const LEGACY_DUMMIES = 10;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  if (window.__KW2_MOBILIZATION_FLOW?.installed) return;

  function activeWar(sim) {
    return (sim.wars || []).find(war => !war.done) || null;
  }

  function samePair(war, a, b) {
    return !!war && !!a && !!b && (
      (war.a === a.id && war.b === b.id) ||
      (war.a === b.id && war.b === a.id)
    );
  }

  function developmentStart(sim) {
    if (Number.isFinite(sim.__kw2DevelopmentStartedAt)) return sim.__kw2DevelopmentStartedAt;
    const alive = (sim.kingdoms || []).filter(k => k?.alive);
    if (!alive.length) return null;
    const founded = alive.map(k => Number(k.__kw2FoundedAt)).filter(Number.isFinite);
    sim.__kw2DevelopmentStartedAt = founded.length ? Math.min(...founded) : Number(sim.age || 0);
    return sim.__kw2DevelopmentStartedAt;
  }

  function developmentRemaining(sim) {
    const start = developmentStart(sim);
    if (start == null) return DEVELOPMENT_SECONDS;
    return Math.max(0, DEVELOPMENT_SECONDS - (Number(sim.age || 0) - start));
  }

  function developmentLocked(sim) {
    return developmentRemaining(sim) > 0;
  }

  function darkForest(sim, x, y) {
    const biome = String(sim.biome?.(x, y) || '').toLowerCase();
    return biome.includes('forest') || biome.includes('darkwood') || biome.includes('dark_wood');
  }

  function castlePoint(sim, kingdom) {
    const castle = (kingdom?.buildings || []).find(b => b?.type === 'castle' && !b.__v66Destroyed);
    if (castle && Number.isFinite(castle.sx) && Number.isFinite(castle.sy)) return [castle.sx, castle.sy + 5];
    const p = sim.iso(...(kingdom?.capital || [0, 0]));
    return [p[0], p[1] + 6];
  }

  function setVisible(sprite, visible) {
    if (!sprite || sprite.destroyed) return;
    sprite.visible = visible;
    sprite.renderable = visible;
    if (visible) sprite.play?.(); else sprite.stop?.();
  }

  function hideFarmer(farmer, hidden) {
    if (!farmer) return;
    farmer.__kw2WarHidden = hidden;
    if (hidden) {
      farmer.path = [];
      farmer.taskCell = null;
      farmer.action = 'idle';
      farmer.actionUntil = 0;
    }
    setVisible(farmer._sprite, !hidden);
  }

  function hideKingdomFarmers(kingdom) {
    if (!kingdom?.alive) return;
    for (const farmer of kingdom.farmers || []) hideFarmer(farmer, true);
    kingdom.__kw2FarmersHiddenForWar = true;
  }

  function moveToward(x, y, tx, ty, speed, dt, epsilon = 4) {
    const dx = tx - x, dy = ty - y;
    const d = Math.hypot(dx, dy);
    if (d <= epsilon) return { x: tx, y: ty, dx, dy, arrived: true };
    const step = Math.min(d, Math.max(0, speed * dt));
    return { x: x + dx / d * step, y: y + dy / d * step, dx, dy, arrived: d - step <= epsilon };
  }

  function flowLocked(sim, kingdom) {
    if (!kingdom) return false;
    const war = activeWar(sim);
    if (war && (war.a === kingdom.id || war.b === kingdom.id)) return true;
    if (sim.__kw2Mobilization && [sim.__kw2Mobilization.a, sim.__kw2Mobilization.b].includes(kingdom.id)) return true;
    if (sim.__kw2Demobilization?.sides?.includes?.(kingdom.id)) return true;
    if (sim.__kw2CivilianExit?.sides?.includes?.(kingdom.id)) return true;
    return false;
  }

  function beginMobilization(sim, attacker, target, launch) {
    if (!attacker?.alive || !target?.alive || attacker === target) return false;
    if (activeWar(sim) || sim.__kw2Mobilization || sim.__kw2Demobilization || sim.__kw2CivilianExit) return false;
    sim.__kw2Mobilization = { a: attacker.id, b: target.id, attacker: attacker.id, target: target.id, launch, launched: false };
    for (const kingdom of [attacker, target]) {
      for (const farmer of kingdom.farmers || []) {
        farmer.path = [];
        farmer.taskCell = null;
        farmer.action = 'walk';
        farmer.actionUntil = 0;
      }
    }
    document.documentElement.dataset.kw2WarFlow = 'civilians-to-castle';
    return true;
  }

  function processMobilization(sim, renderer, dt) {
    const state = sim.__kw2Mobilization;
    if (!state) return;
    let remaining = 0;
    for (const side of [state.a, state.b]) {
      const kingdom = sim.kingdoms?.[side];
      if (!kingdom?.alive) continue;
      const [tx, ty] = castlePoint(sim, kingdom);
      for (const farmer of kingdom.farmers || []) {
        if (farmer.__kw2WarHidden) continue;
        remaining++;
        farmer.path = [];
        farmer.taskCell = null;
        const step = moveToward(Number(farmer.x) || tx, Number(farmer.y) || ty, tx, ty, CIVILIAN_SPEED, dt);
        farmer.x = step.x;
        farmer.y = step.y;
        farmer.action = 'walk';
        if (farmer._sprite && !farmer._sprite.destroyed) {
          setVisible(farmer._sprite, true);
          renderer.updateFarmer?.(farmer, step.dx, step.dy);
          farmer._sprite.position.set(step.x, step.y);
        }
        if (step.arrived) {
          farmer.x = tx;
          farmer.y = ty;
          farmer.cell = [...kingdom.capital];
          hideFarmer(farmer, true);
          remaining--;
        }
      }
      kingdom.__kw2FarmersHiddenForWar = (kingdom.farmers || []).every(f => f.__kw2WarHidden);
    }
    if (remaining > 0 || state.launched) return;
    state.launched = true;
    const attacker = sim.kingdoms?.[state.attacker];
    const target = sim.kingdoms?.[state.target];
    if (!attacker?.alive || !target?.alive) {
      sim.__kw2Mobilization = null;
      return;
    }
    hideKingdomFarmers(attacker);
    hideKingdomFarmers(target);
    document.documentElement.dataset.kw2WarFlow = 'army-deploying';
    state.launch?.(attacker, target);
  }

  function guards(renderer, side) {
    return renderer.__v66Guards?.get?.(side) || [];
  }

  function storePeaceGuards(sim, renderer) {
    if (activeWar(sim) || sim.__kw2Mobilization || sim.__kw2Demobilization) return;
    for (const kingdom of sim.kingdoms || []) {
      if (!kingdom?.alive) continue;
      const [cx, cy] = castlePoint(sim, kingdom);
      for (const unit of guards(renderer, kingdom.id)) {
        if (!unit || unit.dead || !unit.s || unit.s.destroyed) continue;
        unit.warId = null;
        unit.state = 'garrison';
        unit.x = cx;
        unit.y = cy;
        unit.__kw2StoredInCastle = true;
        unit.__kw2CastleDeployed = null;
        unit.s.position.set(cx, cy);
        setVisible(unit.s, false);
      }
    }
  }

  function deployCore(sim, renderer, war) {
    if (!war || war.done) return;
    for (const side of [war.a, war.b]) {
      const kingdom = sim.kingdoms?.[side];
      if (!kingdom?.alive) continue;
      const [cx, cy] = castlePoint(sim, kingdom);
      let i = 0;
      for (const unit of guards(renderer, side)) {
        if (!unit || unit.dead || unit.warId !== war.id || !unit.s || unit.s.destroyed) continue;
        if (unit.__kw2CastleDeployed !== war.id) {
          const x = cx + ((i % 4) - 1.5) * 4.5;
          const y = cy + Math.floor(i / 4) * 3;
          unit.x = x;
          unit.y = y;
          unit.s.position.set(x, y);
          unit.__kw2CastleDeployed = war.id;
          unit.__kw2StoredInCastle = false;
          renderer.swapAnim?.(unit.s, 'walk');
        }
        setVisible(unit.s, true);
        i++;
      }
    }
  }

  function suppressLegacyReserves(renderer, war) {
    const map = renderer.__kw2FieldReserves;
    if (!(map instanceof Map) || !war || war.done) return;
    for (const side of [war.a, war.b]) {
      const current = map.get(side) || [];
      for (const unit of current) {
        if (unit?.s && !unit.s.destroyed && typeof unit.s.destroy === 'function') unit.s.destroy({ children: true });
      }
      map.set(side, Array.from({ length: LEGACY_DUMMIES }, () => ({ s: { destroyed: true } })));
    }
  }

  function visualArmyCount(sim, kingdom, enemy, previous = 0) {
    let total = BASE_VISIBLE_ARMY;
    const own = Math.max(1, Number(sim.power?.(kingdom)) || 1);
    const foe = Math.max(1, Number(sim.power?.(enemy)) || 1);
    if (own > foe * POWER_DEADBAND) total += clamp(Math.round(Math.log2(own / foe) * 6), 1, MAX_VISIBLE_ARMY - BASE_VISIBLE_ARMY);
    return clamp(Math.max(previous || 0, total), BASE_VISIBLE_ARMY, MAX_VISIBLE_ARMY);
  }

  function reserveMap(renderer) {
    renderer.__kw2MobilizedReserves ||= new Map();
    return renderer.__kw2MobilizedReserves;
  }

  function makeReserve(sim, renderer, kingdom, index, warId) {
    const role = index % 5 === 0 ? 'archer' : (index % 3 === 0 ? 'spear' : 'sword');
    const sprite = renderer.makeSoldier?.(kingdom, role);
    if (!sprite) return null;
    const [cx, cy] = castlePoint(sim, kingdom);
    sprite.scale.set(0.88);
    sprite.position.set(cx, cy);
    renderer.entities?.addChild?.(sprite);
    renderer.swapAnim?.(sprite, 'walk');
    return { s: sprite, side: kingdom.id, role, x: cx, y: cy, index, warId, anim: 'walk' };
  }

  function setReserveAnim(renderer, unit, action) {
    if (!unit?.s || unit.s.destroyed || unit.anim === action) return;
    unit.anim = action;
    renderer.swapAnim?.(unit.s, action);
  }

  function updateReserves(sim, renderer, war, dt) {
    if (!war || war.done) return;
    war.__kw2ArmyCounts ||= {};
    for (const side of [war.a, war.b]) {
      const kingdom = sim.kingdoms?.[side];
      const enemy = sim.kingdoms?.[side === war.a ? war.b : war.a];
      if (!kingdom?.alive || !enemy?.alive) continue;
      const total = visualArmyCount(sim, kingdom, enemy, war.__kw2ArmyCounts[side]);
      war.__kw2ArmyCounts[side] = total;
      const wanted = Math.max(0, total - CORE_ARMY);
      const map = reserveMap(renderer);
      const list = map.get(side) || [];
      while (list.length < wanted) {
        const unit = makeReserve(sim, renderer, kingdom, list.length, war.id);
        if (!unit) break;
        list.push(unit);
      }
      map.set(side, list);

      const [ownX, ownY] = castlePoint(sim, kingdom);
      const [enemyX, enemyY] = castlePoint(sim, enemy);
      let dx = enemyX - ownX, dy = enemyY - ownY;
      const len = Math.max(1, Math.hypot(dx, dy));
      dx /= len; dy /= len;
      const px = -dy, py = dx;
      const core = guards(renderer, side).filter(u => u && !u.dead && u.warId === war.id && Number.isFinite(u.x) && Number.isFinite(u.y));
      let anchorX = ownX, anchorY = ownY;
      if (core.length) {
        anchorX = core.reduce((sum, u) => sum + u.x, 0) / core.length;
        anchorY = core.reduce((sum, u) => sum + u.y, 0) / core.length;
      }
      for (let i = 0; i < list.length; i++) {
        const unit = list[i];
        if (!unit?.s || unit.s.destroyed) continue;
        const tx = anchorX - dx * (18 + Math.floor(i / 6) * 10.5) + px * (((i % 6) - 2.5) * 7.5);
        const ty = anchorY - dy * (18 + Math.floor(i / 6) * 10.5) + py * (((i % 6) - 2.5) * 7.5);
        const step = moveToward(unit.x, unit.y, tx, ty, SOLDIER_SPEED, dt);
        unit.x = step.x;
        unit.y = step.y;
        unit.s.position.set(unit.x, unit.y);
        unit.s.zIndex = Math.round(unit.y * 100) + 15;
        setVisible(unit.s, true);
        setReserveAnim(renderer, unit, war.__v66?.phase === 'combat' && step.arrived ? 'attack' : 'walk');
        if (unit.s._sprite) {
          const mag = Math.abs(unit.s._sprite.scale.x || 1);
          unit.s._sprite.scale.x = enemyX >= unit.x ? mag : -mag;
        }
      }
      kingdom.__kw2DesiredFieldArmy = total;
    }
    const a = sim.kingdoms?.[war.a], b = sim.kingdoms?.[war.b];
    if (a?.alive && b?.alive) document.documentElement.dataset.kw2FieldArmy = `${a.name}:${war.__kw2ArmyCounts[war.a]}|${b.name}:${war.__kw2ArmyCounts[war.b]}`;
  }

  function takeReserves(renderer, war) {
    const map = reserveMap(renderer);
    const result = [];
    for (const side of [war.a, war.b]) {
      for (const unit of map.get(side) || []) result.push({ side, unit });
      map.delete(side);
    }
    return result;
  }

  function beginDemobilization(sim, renderer, war, reserves) {
    const sides = [], units = [];
    for (const side of [war.a, war.b]) {
      const kingdom = sim.kingdoms?.[side];
      if (!kingdom?.alive) continue;
      sides.push(side);
      hideKingdomFarmers(kingdom);
      for (const unit of guards(renderer, side)) {
        if (!unit || unit.dead || !unit.s || unit.s.destroyed) continue;
        units.push({ type: 'core', side, unit, x: Number(unit.x) || unit.s.x, y: Number(unit.y) || unit.s.y });
      }
    }
    for (const entry of reserves || []) {
      const kingdom = sim.kingdoms?.[entry.side];
      if (!kingdom?.alive || !entry.unit?.s || entry.unit.s.destroyed) continue;
      units.push({ type: 'reserve', side: entry.side, unit: entry.unit, x: entry.unit.x, y: entry.unit.y });
    }
    sim.__kw2Demobilization = { sides, units };
    document.documentElement.dataset.kw2WarFlow = 'army-returning';
  }

  function exitCells(sim, kingdom) {
    return [...(kingdom.territory || [])]
      .map(token => token.split(',').map(Number))
      .filter(([x, y]) => Math.hypot(x - kingdom.capital[0], y - kingdom.capital[1]) <= 5 && sim.isNpcWalkableCell?.(kingdom, x, y));
  }

  function beginCivilianExit(sim, sides) {
    const entries = [], aliveSides = [];
    for (const side of sides || []) {
      const kingdom = sim.kingdoms?.[side];
      if (!kingdom?.alive) continue;
      aliveSides.push(side);
      const cells = exitCells(sim, kingdom);
      const [cx, cy] = castlePoint(sim, kingdom);
      let i = 0;
      for (const farmer of kingdom.farmers || []) {
        const cell = cells.length ? cells[i % cells.length] : kingdom.capital;
        const p = sim.iso(...cell);
        farmer.x = cx; farmer.y = cy; farmer.cell = [...kingdom.capital]; farmer.path = []; farmer.taskCell = null;
        farmer.action = 'walk'; farmer.actionUntil = 0; farmer.__kw2CivilianExit = true;
        hideFarmer(farmer, false);
        if (farmer._sprite && !farmer._sprite.destroyed) farmer._sprite.position.set(cx, cy);
        entries.push({ kingdom, farmer, cell, tx: p[0], ty: p[1] + 6 });
        i++;
      }
      kingdom.__kw2FarmersHiddenForWar = false;
    }
    sim.__kw2CivilianExit = entries.length ? { sides: aliveSides, entries } : null;
    document.documentElement.dataset.kw2WarFlow = entries.length ? 'civilians-exiting' : 'peace';
  }

  function processDemobilization(sim, renderer, dt) {
    const state = sim.__kw2Demobilization;
    if (!state) return;
    let remaining = 0;
    for (const entry of state.units) {
      const kingdom = sim.kingdoms?.[entry.side], unit = entry.unit, sprite = unit?.s;
      if (!kingdom?.alive || !sprite || sprite.destroyed || entry.done) continue;
      const [tx, ty] = castlePoint(sim, kingdom);
      const step = moveToward(entry.x, entry.y, tx, ty, SOLDIER_SPEED, dt);
      entry.x = step.x; entry.y = step.y;
      setVisible(sprite, true); renderer.swapAnim?.(sprite, 'walk'); sprite.position.set(entry.x, entry.y); sprite.zIndex = Math.round(entry.y * 100) + 16;
      if (entry.type === 'core') { unit.x = entry.x; unit.y = entry.y; unit.state = 'returning'; unit.warId = null; }
      if (step.arrived) {
        entry.done = true;
        if (entry.type === 'core') {
          unit.x = tx; unit.y = ty; unit.state = 'garrison'; unit.__kw2StoredInCastle = true; unit.__kw2CastleDeployed = null;
          sprite.position.set(tx, ty); setVisible(sprite, false);
        } else sprite.destroy({ children: true });
      } else remaining++;
    }
    if (remaining > 0) return;
    const sides = [...state.sides];
    sim.__kw2Demobilization = null;
    beginCivilianExit(sim, sides);
  }

  function processCivilianExit(sim, renderer, dt) {
    const state = sim.__kw2CivilianExit;
    if (!state) return;
    let remaining = 0;
    for (const entry of state.entries) {
      const farmer = entry.farmer;
      if (!entry.kingdom?.alive || !farmer || !farmer.__kw2CivilianExit) continue;
      const step = moveToward(farmer.x, farmer.y, entry.tx, entry.ty, EXIT_SPEED, dt);
      farmer.x = step.x; farmer.y = step.y; farmer.action = 'walk';
      renderer.updateFarmer?.(farmer, step.dx, step.dy);
      if (farmer._sprite && !farmer._sprite.destroyed) farmer._sprite.position.set(step.x, step.y);
      if (step.arrived) {
        farmer.cell = [...entry.cell]; farmer.action = 'idle'; farmer.actionUntil = 0; farmer.__kw2CivilianExit = false;
        renderer.setFarmerAction?.(farmer, 'idle');
      } else remaining++;
    }
    if (remaining > 0) return;
    sim.__kw2CivilianExit = null;
    document.documentElement.dataset.kw2WarFlow = 'peace';
  }

  function install(sim) {
    if (sim.__kw2MobilizationFlow === VERSION) return;
    const renderer = sim.r;

    const previousIsBuildable = sim.isBuildableCell.bind(sim);
    sim.isBuildableCell = function(x, y, type = 'house_a') {
      if (darkForest(this, x, y)) return false;
      return previousIsBuildable(x, y, type);
    };

    const previousAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = function(kingdom, type, x, y, forceCastle = false, instant = false) {
      if (String(type || '').toLowerCase() !== 'castle' && darkForest(this, x, y)) return null;
      return previousAddBuilding(kingdom, type, x, y, forceCastle, instant);
    };

    if (typeof sim.releaseFarmWorker === 'function') {
      for (const kingdom of sim.kingdoms || []) for (const farmer of kingdom.farmers || []) if (farmer?.fixedBuilding) sim.releaseFarmWorker(kingdom, farmer.fixedBuilding);
    }
    sim.spawnFarmWorker = async function() { return null; };

    const oldFarmerAI = sim.farmerAI.bind(sim);
    sim.farmerAI = function(kingdom) {
      if (flowLocked(this, kingdom)) return false;
      return oldFarmerAI(kingdom);
    };

    const oldJoin = sim.join.bind(sim);
    sim.join = async function(name) {
      const kingdom = await oldJoin(name);
      if (kingdom?.alive && !Number.isFinite(this.__kw2DevelopmentStartedAt)) {
        this.__kw2DevelopmentStartedAt = Number(this.age || 0);
        document.documentElement.dataset.kw2DevelopmentStartedAt = String(this.__kw2DevelopmentStartedAt);
      }
      return kingdom;
    };

    const realAttack = sim.attack.bind(sim);
    sim.attack = function(attacker, target) {
      if (!attacker?.alive || !target?.alive || attacker === target) return false;
      if (developmentLocked(this)) {
        document.documentElement.dataset.kw2AttackBlocked = `development-${Math.ceil(developmentRemaining(this))}`;
        return false;
      }
      const war = activeWar(this);
      if (war) return samePair(war, attacker, target);
      if (this.__kw2Mobilization) return [this.__kw2Mobilization.a, this.__kw2Mobilization.b].includes(attacker.id) && [this.__kw2Mobilization.a, this.__kw2Mobilization.b].includes(target.id);
      if (this.__kw2Demobilization || this.__kw2CivilianExit) return false;
      return beginMobilization(this, attacker, target, realAttack);
    };

    const realStartWar = sim.startWar.bind(sim);
    sim.startWar = function(a, b) {
      if (!a?.alive || !b?.alive || a === b || developmentLocked(this)) return false;
      const war = activeWar(this);
      if (war) return samePair(war, a, b);
      if (this.__kw2Mobilization) return true;
      if (this.__kw2Demobilization || this.__kw2CivilianExit) return false;
      return beginMobilization(this, a, b, (attacker, target) => realStartWar(attacker, target));
    };

    const oldEndWar = typeof renderer.endWar === 'function' ? renderer.endWar.bind(renderer) : null;
    if (oldEndWar) renderer.endWar = function(war) {
      const returning = takeReserves(this, war);
      const result = oldEndWar(war);
      for (const side of [war.a, war.b]) {
        const kingdom = sim.kingdoms?.[side];
        if (kingdom?.alive) hideKingdomFarmers(kingdom);
      }
      beginDemobilization(sim, this, war, returning);
      return result;
    };

    const oldUpdateWars = renderer.updateWars.bind(renderer);
    renderer.updateWars = function(battleSim, rawDt) {
      const liveSim = battleSim || sim;
      const dt = clamp(Number(rawDt) || 0.016, 0.001, 0.05);
      suppressLegacyReserves(this, activeWar(liveSim));
      const result = oldUpdateWars(liveSim, dt);

      if (liveSim.__kw2Mobilization) processMobilization(liveSim, this, dt);
      const war = activeWar(liveSim);
      if (war) {
        if (liveSim.__kw2Mobilization && samePair(war, liveSim.kingdoms?.[liveSim.__kw2Mobilization.a], liveSim.kingdoms?.[liveSim.__kw2Mobilization.b])) liveSim.__kw2Mobilization = null;
        for (const side of [war.a, war.b]) {
          const kingdom = liveSim.kingdoms?.[side];
          if (kingdom?.alive) hideKingdomFarmers(kingdom);
        }
        deployCore(liveSim, this, war);
        updateReserves(liveSim, this, war, dt);
        document.documentElement.dataset.kw2WarFlow = war.__v66?.phase === 'combat' ? 'battle' : 'army-deploying';
      } else if (liveSim.__kw2Demobilization) processDemobilization(liveSim, this, dt);
      else if (liveSim.__kw2CivilianExit) processCivilianExit(liveSim, this, dt);
      else if (!liveSim.__kw2Mobilization) storePeaceGuards(liveSim, this);

      document.documentElement.dataset.kw2DevelopmentLockRemaining = String(Math.ceil(developmentRemaining(liveSim)));
      return result;
    };

    sim.__kw2MobilizationFlow = VERSION;
    window.__KW2_MOBILIZATION_FLOW = Object.freeze({
      installed: true,
      version: VERSION,
      developmentSeconds: DEVELOPMENT_SECONDS,
      darkForestBuildingBlocked: true,
      fixedFarmWorkers: false,
      civiliansEnterCastleBeforeWar: true,
      soldiersDeployFromCastle: true,
      survivingSoldiersReturnToCastle: true,
      civiliansExitAfterReturn: true,
      baseVisibleArmy: BASE_VISIBLE_ARMY,
      maxVisibleArmy: MAX_VISIBLE_ARMY,
      remoteMilitaryPopIn: false
    });
    document.documentElement.dataset.kw2MobilizationFlow = VERSION;
    document.documentElement.dataset.kw2ForestBuild = 'blocked';
    developmentStart(sim);
    storePeaceGuards(sim, renderer);
  }

  async function wait() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (sim?.r && window.__KW2_OPEN_FIELD_BALANCE?.installed && window.__KW2_PHYSICAL_WAR_EXPEDITION?.installed && sim.__v661BattleStabilityInstalled && typeof sim.attack === 'function' && typeof sim.startWar === 'function' && typeof sim.addBuilding === 'function' && typeof sim.isBuildableCell === 'function' && typeof sim.r.updateWars === 'function') {
        install(sim);
        return;
      }
      await sleep(25);
    }
    throw new Error('Kingdom War 2 runtime unavailable for mobilization flow patch');
  }

  wait().catch(error => {
    window.__KW2_MOBILIZATION_FLOW_ERROR = String(error?.stack || error?.message || error);
    console.error('[Kingdom War 2 mobilization flow]', error);
  });
})();