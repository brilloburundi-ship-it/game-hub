(() => {
  'use strict';

  const VERSION = '20260814-war-fps-power-2';
  const EARLY_RING_TARGET = 25;
  const EARLY_BUILD_LIMIT = 7;
  const EARLY_EXPAND_INTERVAL = 1;
  const FIELD_BASE = 12;
  const FIELD_MAX = 22;
  const EVEN_POWER_RATIO = 1.08;
  const RESERVE_UPDATE_STEP = 0.05;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cellKey = (x, y) => `${x},${y}`;

  if (window.__KW2_OPEN_FIELD_BALANCE?.installed) return;

  function activeWar(sim) {
    return (sim.wars || []).find(war => !war.done) || null;
  }

  function activeWarFor(sim, kingdomId) {
    return (sim.wars || []).find(war => !war.done && (war.a === kingdomId || war.b === kingdomId)) || null;
  }

  function samePair(war, a, b) {
    return !!war && !!a && !!b && (
      (war.a === a.id && war.b === b.id) ||
      (war.a === b.id && war.b === a.id)
    );
  }

  function powerValue(sim, kingdom) {
    return Math.max(1, Number(sim.power?.(kingdom)) || 1);
  }

  // Both armies keep the full historical 12-soldier battle core. Power no longer
  // reduces the weaker army: it adds visible reserves only to the stronger side.
  function fieldCount(sim, kingdom, war) {
    if (!war || !kingdom?.alive) return FIELD_BASE;
    const enemyId = war.a === kingdom.id ? war.b : war.a;
    const enemy = sim.kingdoms?.[enemyId];
    if (!enemy?.alive) return FIELD_BASE;

    const ownPower = powerValue(sim, kingdom);
    const enemyPower = powerValue(sim, enemy);
    if (ownPower <= enemyPower * EVEN_POWER_RATIO) return FIELD_BASE;

    const ratio = ownPower / Math.max(1, enemyPower);
    const extra = clamp(Math.round(Math.log2(ratio) * 6), 1, FIELD_MAX - FIELD_BASE);
    return FIELD_BASE + extra;
  }

  function liveUnits(renderer, kingdomId, warId = null) {
    return (renderer.__v66Guards?.get?.(kingdomId) || []).filter(unit =>
      unit && !unit.dead && unit.s && !unit.s.destroyed && (!warId || unit.warId === warId)
    );
  }

  function reserveMap(renderer) {
    renderer.__kw2FieldReserves ||= new Map();
    return renderer.__kw2FieldReserves;
  }

  function destroyReserve(renderer, side) {
    const map = reserveMap(renderer);
    const list = map.get(side) || [];
    for (const unit of list) {
      if (unit?.s && !unit.s.destroyed) unit.s.destroy({ children: true });
    }
    map.delete(side);
  }

  function destroyAllReserves(renderer) {
    const map = reserveMap(renderer);
    for (const side of [...map.keys()]) destroyReserve(renderer, side);
  }

  function makeReserve(renderer, kingdom, index) {
    const role = index % 5 === 0 ? 'archer' : (index % 3 === 0 ? 'spear' : 'sword');
    const soldier = renderer.makeSoldier?.(kingdom, role);
    if (!soldier) return null;
    soldier.scale.set(0.88);
    soldier.zIndex = 0;
    renderer.entities?.addChild?.(soldier);
    return { s: soldier, side: kingdom.id, role, index, anim: '' };
  }

  function setReserveAnim(renderer, unit, action) {
    if (!unit?.s || unit.s.destroyed || unit.anim === action) return;
    unit.anim = action;
    renderer.swapAnim?.(unit.s, action);
  }

  function faceReserve(unit, targetX) {
    const sprite = unit?.s?._sprite;
    if (!sprite) return;
    const magnitude = Math.abs(sprite.scale.x || 1);
    sprite.scale.x = targetX >= unit.s.x ? magnitude : -magnitude;
  }

  function syncFieldReserves(sim, renderer, war) {
    if (!war?.__v66 || war.done) {
      destroyAllReserves(renderer);
      return;
    }

    const phase = war.__v66.phase || 'rally';
    for (const side of [war.a, war.b]) {
      const kingdom = sim.kingdoms?.[side];
      if (!kingdom?.alive) {
        destroyReserve(renderer, side);
        continue;
      }

      const desiredTotal = fieldCount(sim, kingdom, war);
      const wanted = Math.max(0, desiredTotal - FIELD_BASE);
      const map = reserveMap(renderer);
      const list = map.get(side) || [];

      while (list.length < wanted) {
        const unit = makeReserve(renderer, kingdom, list.length);
        if (!unit) break;
        list.push(unit);
      }
      while (list.length > wanted) {
        const unit = list.pop();
        if (unit?.s && !unit.s.destroyed) unit.s.destroy({ children: true });
      }
      map.set(side, list);
      kingdom.__kw2DesiredFieldArmy = desiredTotal;
      kingdom.__kw2VisiblePowerReserves = wanted;

      if (!list.length) continue;

      const enemyId = side === war.a ? war.b : war.a;
      const enemy = sim.kingdoms?.[enemyId];
      const ownCapital = sim.iso(...kingdom.capital);
      const enemyCapital = enemy?.capital ? sim.iso(...enemy.capital) : ownCapital;
      let dx = enemyCapital[0] - ownCapital[0], dy = enemyCapital[1] - ownCapital[1];
      const length = Math.max(1, Math.hypot(dx, dy));
      dx /= length; dy /= length;
      const px = -dy, py = dx;

      const core = liveUnits(renderer, side, war.id);
      let anchorX = ownCapital[0], anchorY = ownCapital[1] + 6;
      if (core.length) {
        anchorX = core.reduce((sum, unit) => sum + Number(unit.x || 0), 0) / core.length;
        anchorY = core.reduce((sum, unit) => sum + Number(unit.y || 0), 0) / core.length;
      }

      for (let i = 0; i < list.length; i++) {
        const unit = list[i];
        if (!unit?.s || unit.s.destroyed) continue;
        const row = Math.floor(i / 5);
        const column = (i % 5) - 2;
        const back = 16 + row * 11;
        const lateral = column * 8.5;
        const targetX = anchorX - dx * back + px * lateral;
        const targetY = anchorY - dy * back + py * lateral;
        unit.s.position.set(targetX, targetY);
        unit.s.zIndex = Math.round(targetY * 100) + 15;
        setReserveAnim(renderer, unit, phase === 'combat' ? 'attack' : 'walk');
        faceReserve(unit, enemyCapital[0]);
      }
    }
  }

  function sectorFor(dx, dy) {
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;
    return Math.floor((angle + Math.PI / 8) / (Math.PI / 4)) % 8;
  }

  function earlyRingCandidate(sim, kingdom) {
    const candidates = new Map();
    for (const token of kingdom.territory || []) {
      const [x, y] = token.split(',').map(Number);
      for (const [nx, ny] of sim.neigh?.(x, y) || []) {
        if (sim.getOwner?.(nx, ny) !== -1 || !sim.land?.(nx, ny)) continue;
        const d = Math.hypot(nx - kingdom.capital[0], ny - kingdom.capital[1]);
        if (d > 4.25) continue;
        candidates.set(cellKey(nx, ny), [nx, ny]);
      }
    }
    if (!candidates.size) return null;

    const sectorCounts = Array(8).fill(0);
    for (const token of kingdom.territory || []) {
      const [x, y] = token.split(',').map(Number);
      const dx = x - kingdom.capital[0], dy = y - kingdom.capital[1];
      const d = Math.hypot(dx, dy);
      if (d < 0.5 || d > 4.25) continue;
      sectorCounts[sectorFor(dx, dy)]++;
    }
    const maxSector = Math.max(...sectorCounts);

    let best = null;
    let bestScore = -Infinity;
    for (const [x, y] of candidates.values()) {
      const dx = x - kingdom.capital[0], dy = y - kingdom.capital[1];
      const d = Math.hypot(dx, dy);
      const sector = sectorFor(dx, dy);
      const ownNeighbours = (sim.neigh?.(x, y) || []).filter(([nx, ny]) => sim.getOwner?.(nx, ny) === kingdom.id).length;
      const walkable = sim.isWalkableCell?.(x, y) ? 1 : 0;
      const underCovered = maxSector - sectorCounts[sector];
      const ringFit = -Math.abs(d - 3.15) * 2.4;
      const score = underCovered * 4.2 + ownNeighbours * 1.15 + walkable * 1.4 + ringFit;
      if (score > bestScore) {
        best = [x, y];
        bestScore = score;
      }
    }
    return best;
  }

  function balancedBuildCell(sim, kingdom, type) {
    if (!kingdom?.alive || kingdom.buildings.length > EARLY_BUILD_LIMIT || type === 'castle') return null;

    const existing = (kingdom.buildings || []).filter(building => building.type !== 'castle');
    const sectorCounts = Array(8).fill(0);
    for (const building of existing) {
      const dx = building.x - kingdom.capital[0], dy = building.y - kingdom.capital[1];
      if (Math.hypot(dx, dy) < 0.5) continue;
      sectorCounts[sectorFor(dx, dy)]++;
    }
    const minCount = Math.min(...sectorCounts);

    let best = null;
    let bestScore = -Infinity;
    for (const token of kingdom.territory || []) {
      const [x, y] = token.split(',').map(Number);
      if (sim.getOwner?.(x, y) !== kingdom.id) continue;
      if (!sim.isBuildableCell?.(x, y, type)) continue;
      if (sim.buildingBlockingCell?.(x, y)) continue;
      if (!sim.buildingSpacingOK?.(kingdom, type, x, y)) continue;
      if ((kingdom.farmers || []).some(farmer => farmer.cell?.[0] === x && farmer.cell?.[1] === y)) continue;

      const dx = x - kingdom.capital[0], dy = y - kingdom.capital[1];
      const d = Math.hypot(dx, dy);
      if (d < 1.8 || d > 4.9) continue;
      const sector = sectorFor(dx, dy);
      const coverBonus = (sectorCounts[sector] === minCount ? 7 : 0) - sectorCounts[sector] * 1.4;
      const ringFit = -Math.abs(d - 3.15) * 1.8;
      const farmBonus = type === 'farm' && sim.biome?.(x, y) === 'grass' ? 3 : 0;
      const score = coverBonus + ringFit + farmBonus;
      if (score > bestScore) {
        best = [x, y];
        bestScore = score;
      }
    }
    return best;
  }

  function setFarmerHidden(farmer, hidden) {
    if (!farmer) return;
    farmer.__kw2WarHidden = hidden;
    if (hidden) {
      farmer.path = [];
      farmer.action = 'idle';
      farmer.actionUntil = 0;
    }
    const sprite = farmer._sprite;
    if (!sprite || sprite.destroyed) return;
    sprite.visible = !hidden;
    sprite.renderable = !hidden;
    if (hidden) sprite.stop?.();
    else sprite.play?.();
  }

  function setKingdomFarmersHidden(kingdom, hidden) {
    if (!kingdom?.alive) return;
    for (const farmer of kingdom.farmers || []) setFarmerHidden(farmer, hidden);
    kingdom.__kw2FarmersHiddenForWar = hidden;
  }

  function syncWarFarmerVisibility(sim) {
    const war = activeWar(sim);
    for (const kingdom of sim.kingdoms || []) {
      if (!kingdom?.alive) continue;
      const hidden = !!war && (kingdom.id === war.a || kingdom.id === war.b);
      if (!!kingdom.__kw2FarmersHiddenForWar !== hidden) setKingdomFarmersHidden(kingdom, hidden);
    }
  }

  function releaseFixedFarmers(sim) {
    let released = 0;
    for (const kingdom of sim.kingdoms || []) {
      for (const farmer of kingdom.farmers || []) {
        if (!farmer?.fixedBuilding) continue;
        const buildingId = farmer.fixedBuilding;
        if (sim.releaseFarmWorker?.(kingdom, buildingId)) released++;
      }
    }
    document.documentElement.dataset.kw2ReleasedFixedFarmers = String(released);
    return released;
  }

  function install(sim) {
    if (sim.__kw2OpenFieldBalance === VERSION) return true;
    const renderer = sim.r;

    // Farms remain productive buildings but never pin a visible citizen in place.
    releaseFixedFarmers(sim);
    sim.spawnFarmWorker = async function() { return null; };

    const previousFarmerAI = sim.farmerAI.bind(sim);
    sim.farmerAI = function(kingdom) {
      if (activeWarFor(this, kingdom?.id)) {
        setKingdomFarmersHidden(kingdom, true);
        return false;
      }
      if (kingdom?.__kw2FarmersHiddenForWar) setKingdomFarmersHidden(kingdom, false);
      return previousFarmerAI(kingdom);
    };

    const previousUpdateFarmer = typeof renderer.updateFarmer === 'function' ? renderer.updateFarmer.bind(renderer) : null;
    if (previousUpdateFarmer) {
      renderer.updateFarmer = function(farmer, ...args) {
        if (farmer?.__kw2WarHidden) return;
        return previousUpdateFarmer(farmer, ...args);
      };
    }

    const previousSetFarmerAction = typeof renderer.setFarmerAction === 'function' ? renderer.setFarmerAction.bind(renderer) : null;
    if (previousSetFarmerAction) {
      renderer.setFarmerAction = function(farmer, action) {
        if (farmer?.__kw2WarHidden) return;
        return previousSetFarmerAction(farmer, action);
      };
    }

    const previousJoin = sim.join.bind(sim);
    sim.join = async function(name) {
      const kingdom = await previousJoin(name);
      if (kingdom?.alive && !kingdom.__kw2BalancedFounding) {
        kingdom.__kw2BalancedFounding = true;
        kingdom.__kw2FoundedAt = this.age;
        kingdom.lastBuild = Math.min(Number(kingdom.lastBuild || this.age), this.age - 6);
        kingdom.lastExpand = Math.min(Number(kingdom.lastExpand || this.age), this.age - 1);
      }
      return kingdom;
    };

    const previousFindBuildCell = sim.findBuildCell.bind(sim);
    sim.findBuildCell = function(kingdom, type, initial = false) {
      if (!initial && kingdom?.alive && kingdom.buildings.length <= EARLY_BUILD_LIMIT) {
        const balanced = balancedBuildCell(this, kingdom, type);
        if (balanced) return balanced;
      }
      return previousFindBuildCell(kingdom, type, initial);
    };

    const previousExpandAI = sim.expandAI.bind(sim);
    sim.expandAI = function(kingdom) {
      if (!kingdom?.alive) return false;
      if (activeWarFor(this, kingdom.id)) return false;

      if (
        kingdom.territory.size < EARLY_RING_TARGET &&
        this.age - Number(kingdom.lastExpand || 0) >= EARLY_EXPAND_INTERVAL &&
        Number(kingdom.resources?.food || 0) >= 8 &&
        Number(kingdom.resources?.wood || 0) >= 6
      ) {
        const cell = earlyRingCandidate(this, kingdom);
        if (cell) {
          const [x, y] = cell;
          this.setOwner?.(x, y, kingdom.id);
          kingdom.territory.add(cellKey(x, y));
          kingdom.resources.food -= 4;
          kingdom.resources.wood -= 3;
          kingdom.lastExpand = this.age;
          return true;
        }
      }
      return previousExpandAI(kingdom);
    };

    const previousStartWar = sim.startWar.bind(sim);
    sim.startWar = function(a, b) {
      const running = activeWar(this);
      if (running && !samePair(running, a, b)) return false;
      const result = previousStartWar(a, b);
      const war = activeWar(this);
      if (war && samePair(war, a, b)) {
        setKingdomFarmersHidden(a, true);
        setKingdomFarmersHidden(b, true);
      }
      return result;
    };

    const previousAttack = sim.attack.bind(sim);
    sim.attack = function(attacker, target) {
      const running = activeWar(this);
      if (running && !samePair(running, attacker, target)) return false;
      return previousAttack(attacker, target);
    };

    const previousEndWar = typeof renderer.endWar === 'function' ? renderer.endWar.bind(renderer) : null;
    if (previousEndWar) {
      renderer.endWar = function(war) {
        const result = previousEndWar(war);
        destroyAllReserves(this);
        const a = sim.kingdoms?.[war?.a], b = sim.kingdoms?.[war?.b];
        if (a?.alive) setKingdomFarmersHidden(a, false);
        if (b?.alive) setKingdomFarmersHidden(b, false);
        return result;
      };
    }

    const previousUpdateWars = renderer.updateWars.bind(renderer);
    renderer.updateWars = function(battleSim, dt) {
      const liveSim = battleSim || sim;
      syncWarFarmerVisibility(liveSim);
      const result = previousUpdateWars(liveSim, dt);

      this.__kw2ReserveAccumulator = Number(this.__kw2ReserveAccumulator || 0) + Math.max(0, Number(dt) || 0);
      if (this.__kw2ReserveAccumulator >= RESERVE_UPDATE_STEP) {
        this.__kw2ReserveAccumulator = 0;
        const war = activeWar(liveSim);
        syncFieldReserves(liveSim, this, war);
        if (war && !war.done) {
          const a = liveSim.kingdoms?.[war.a], b = liveSim.kingdoms?.[war.b];
          if (a?.alive && b?.alive) {
            document.documentElement.dataset.kw2FieldArmy = `${a.name}:${fieldCount(liveSim, a, war)}|${b.name}:${fieldCount(liveSim, b, war)}`;
          }
        } else {
          document.documentElement.dataset.kw2FieldArmy = '';
        }
      }

      return result;
    };

    sim.__kw2OpenFieldBalance = VERSION;
    window.__KW2_OPEN_FIELD_BALANCE = Object.freeze({
      installed: true,
      version: VERSION,
      singleActiveWar: true,
      powerBasedOpenFieldMajority: true,
      weakerArmyNeverReduced: true,
      fieldBase: FIELD_BASE,
      fieldMaximum: FIELD_MAX,
      lightweightPowerReserves: true,
      warParticipantFarmersHidden: true,
      fixedFarmWorkers: false,
      roamingFarmerVarietyPreserved: true,
      earlyCapitalRingTarget: EARLY_RING_TARGET,
      earlyBalancedConstruction: true
    });
    document.documentElement.dataset.kw2OpenFieldBalance = VERSION;
    document.documentElement.dataset.kw2FixedFarmWorkers = '0';
    return true;
  }

  async function wait() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (
        sim?.r &&
        window.__KW2_PHYSICAL_WAR_EXPEDITION?.installed &&
        sim.__v661BattleStabilityInstalled &&
        typeof sim.power === 'function' &&
        typeof sim.findBuildCell === 'function' &&
        typeof sim.expandAI === 'function' &&
        typeof sim.farmerAI === 'function' &&
        typeof sim.r.updateWars === 'function'
      ) {
        install(sim);
        return;
      }
      await sleep(25);
    }
    throw new Error('Kingdom War 2 runtime unavailable for war FPS balance patch');
  }

  wait().catch(error => {
    window.__KW2_OPEN_FIELD_BALANCE_ERROR = String(error?.stack || error?.message || error);
    console.error('[Kingdom War 2 war FPS balance]', error);
  });
})();