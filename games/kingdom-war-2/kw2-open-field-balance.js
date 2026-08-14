(() => {
  'use strict';

  const VERSION = '20260814-open-field-power-1';
  const EARLY_RING_TARGET = 25;
  const EARLY_BUILD_LIMIT = 7;
  const EARLY_EXPAND_INTERVAL = 1;
  const FIELD_TOTAL = 22;
  const FIELD_MIN = 6;
  const FIELD_MAX = 12;
  const EVEN_POWER_RATIO = 1.08;
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

  function fieldCount(sim, kingdom, war) {
    if (!war || !kingdom?.alive) return 8;
    const enemyId = war.a === kingdom.id ? war.b : war.a;
    const enemy = sim.kingdoms?.[enemyId];
    if (!enemy?.alive) return FIELD_MAX;

    const ownPower = powerValue(sim, kingdom);
    const enemyPower = powerValue(sim, enemy);
    const ratio = Math.max(ownPower, enemyPower) / Math.max(1, Math.min(ownPower, enemyPower));
    if (ratio < EVEN_POWER_RATIO) return 11;

    const share = ownPower / (ownPower + enemyPower);
    return clamp(Math.round(FIELD_TOTAL * share), FIELD_MIN, FIELD_MAX);
  }

  function liveUnits(renderer, kingdomId) {
    return (renderer.__v66Guards?.get?.(kingdomId) || []).filter(unit => unit && !unit.dead && unit.s && !unit.s.destroyed);
  }

  function trimToPowerShare(renderer, kingdomId, desired) {
    const current = renderer.__v66Guards?.get?.(kingdomId) || [];
    const live = current.filter(unit => unit && !unit.dead && unit.s && !unit.s.destroyed);
    if (live.length <= desired) return;

    const surplus = live.length - desired;
    const candidates = [...live].sort((a, b) => {
      const score = unit => unit.state === 'combat' ? 3 : unit.state === 'advance' ? 2 : unit.state === 'rally' ? 1 : 0;
      return score(a) - score(b);
    });
    const removeSet = new Set(candidates.slice(0, surplus));
    for (const unit of removeSet) {
      if (unit.s && !unit.s.destroyed) unit.s.destroy({ children: true });
    }
    renderer.__v66Guards.set(kingdomId, current.filter(unit => !removeSet.has(unit)));
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

  function install(sim) {
    if (sim.__kw2OpenFieldBalance === VERSION) return true;
    const renderer = sim.r;

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
      return previousStartWar(a, b);
    };

    const previousAttack = sim.attack.bind(sim);
    sim.attack = function(attacker, target) {
      const running = activeWar(this);
      if (running && !samePair(running, attacker, target)) return false;
      return previousAttack(attacker, target);
    };

    const previousUpdateWars = renderer.updateWars.bind(renderer);
    renderer.updateWars = function(battleSim, dt) {
      const liveSim = battleSim || sim;
      const war = activeWar(liveSim);

      if (war && this.__v661Reinforce instanceof Map) {
        for (const side of [war.a, war.b]) {
          const kingdom = liveSim.kingdoms?.[side];
          if (!kingdom?.alive) continue;
          const desired = fieldCount(liveSim, kingdom, war);
          kingdom.__kw2DesiredFieldArmy = desired;
          const current = liveUnits(this, side).length;
          if (current < desired) {
            const state = this.__v661Reinforce.get(side) || { next: 0 };
            state.next = 0;
            this.__v661Reinforce.set(side, state);
          }
        }
      }

      const result = previousUpdateWars(liveSim, dt);

      if (war && !war.done) {
        for (const side of [war.a, war.b]) {
          const kingdom = liveSim.kingdoms?.[side];
          if (!kingdom?.alive) continue;
          const desired = fieldCount(liveSim, kingdom, war);
          trimToPowerShare(this, side, desired);
          kingdom.__kw2DesiredFieldArmy = desired;
        }
        const a = liveSim.kingdoms?.[war.a], b = liveSim.kingdoms?.[war.b];
        if (a?.alive && b?.alive) {
          document.documentElement.dataset.kw2FieldArmy = `${a.name}:${a.__kw2DesiredFieldArmy}|${b.name}:${b.__kw2DesiredFieldArmy}`;
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
      fieldTotalTarget: FIELD_TOTAL,
      fieldMinimum: FIELD_MIN,
      fieldMaximum: FIELD_MAX,
      earlyCapitalRingTarget: EARLY_RING_TARGET,
      earlyBalancedConstruction: true
    });
    document.documentElement.dataset.kw2OpenFieldBalance = VERSION;
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
        typeof sim.r.updateWars === 'function'
      ) {
        install(sim);
        return;
      }
      await sleep(25);
    }
    throw new Error('Kingdom War 2 runtime unavailable for open-field balance patch');
  }

  wait().catch(error => {
    window.__KW2_OPEN_FIELD_BALANCE_ERROR = String(error?.stack || error?.message || error);
    console.error('[Kingdom War 2 open field balance]', error);
  });
})();