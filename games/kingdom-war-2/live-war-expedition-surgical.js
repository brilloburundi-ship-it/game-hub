(() => {
  'use strict';

  const VERSION = '20260814-physical-war-1';
  const HIDDEN_BATTLE_TYPES = new Set(['warehouse']);
  const BIG_HELP_VISIBLE_REMAP = Object.freeze({
    warehouse: 'house_a',
    stable: 'house_b',
    forge: 'barracks'
  });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  if (window.__KW2_PHYSICAL_WAR_EXPEDITION?.installed) return;

  function sameWar(war, a, b) {
    return !!war && !war.done && (
      (war.a === a.id && war.b === b.id) ||
      (war.a === b.id && war.b === a.id)
    );
  }

  function activeWarFor(sim, kingdom) {
    if (!kingdom?.alive) return null;
    return (sim.wars || []).find(war => !war.done && (war.a === kingdom.id || war.b === kingdom.id)) || null;
  }

  function physicalWar(sim, attacker, target, originalStartWar) {
    const existing = (sim.wars || []).find(war => sameWar(war, attacker, target));
    if (existing) return existing;

    const realPair = sim.borderPair?.(attacker, target);
    if (realPair) {
      originalStartWar(attacker, target);
    } else {
      // Reuse the original startWar side effects (camera notification, feed, battle
      // renderer startup), but give it a physical expedition line instead of
      // growing territory across the map until a fake border is created.
      const originalBorderPair = sim.borderPair;
      try {
        sim.borderPair = function(a, b) {
          if ((a === attacker && b === target) || (a === target && b === attacker)) {
            return a === attacker
              ? [[...attacker.capital], [...target.capital]]
              : [[...target.capital], [...attacker.capital]];
          }
          return originalBorderPair.call(this, a, b);
        };
        originalStartWar(attacker, target);
      } finally {
        sim.borderPair = originalBorderPair;
      }
    }

    const war = (sim.wars || []).find(entry => sameWar(entry, attacker, target));
    if (war) {
      war.__kw2PhysicalOnly = true;
      war.__kw2AttackSide = attacker.id;
      war.__kw2DefenseSide = target.id;
      war.__kw2Expedition = !realPair;
      war.__kw2StartedAt = performance.now();
      // Keep the line stable. Territorial borders must never move the battle.
      if (!realPair) war.front = [[...attacker.capital], [...target.capital]];
    }
    return war || null;
  }

  function installTerritoryLockAndPhysicalResolution(sim) {
    if (sim.__kw2PhysicalWarRules) return true;
    sim.__kw2PhysicalWarRules = true;

    const originalAttack = sim.attack.bind(sim);
    const originalStartWar = sim.startWar.bind(sim);
    const originalExpandAI = typeof sim.expandAI === 'function' ? sim.expandAI.bind(sim) : null;
    const originalClaimGiftLand = typeof sim.claimGiftLand === 'function' ? sim.claimGiftLand.bind(sim) : null;

    sim.attack = function(attacker, target) {
      if (this.matchOver) return false;
      if (!attacker?.alive || !target?.alive || attacker === target) return false;
      if (this.areAllied?.(attacker, target)) return originalAttack(attacker, target);

      attacker.aggressive = target.id;
      const war = physicalWar(this, attacker, target, originalStartWar);
      return !!war;
    };

    // Final LIVE policy: no random wars and no territory-based approach toward an
    // ATTACK target. Explicit ATTACK starts the physical expedition immediately.
    sim.warAI = function() {
      if (this.matchOver) return false;
      for (const kingdom of this.kingdoms || []) {
        if (!kingdom?.alive || kingdom.aggressive == null) continue;
        const target = this.kingdoms?.[kingdom.aggressive];
        if (!target?.alive || target === kingdom || this.areAllied?.(kingdom, target)) kingdom.aggressive = null;
      }
      return true;
    };

    if (originalExpandAI) {
      sim.expandAI = function(kingdom) {
        if (activeWarFor(this, kingdom)) return false;
        return originalExpandAI(kingdom);
      };
    }

    if (originalClaimGiftLand) {
      sim.claimGiftLand = function(kingdom, amount) {
        if (activeWarFor(this, kingdom)) return 0;
        return originalClaimGiftLand(kingdom, amount);
      };
    }

    // Keep the existing 3-second power comparison/casualty cadence, but remove
    // capture(). Territory never changes during a war; the surviving physical army
    // must destroy real buildings on its route and burn the enemy castle to finish.
    sim.resolveWars = function() {
      for (const war of this.wars || []) {
        if (war.done) continue;
        const a = this.kingdoms?.[war.a], b = this.kingdoms?.[war.b];
        if (!a?.alive || !b?.alive || this.areAllied?.(a, b)) {
          war.done = true;
          this.r.endWar?.(war);
          continue;
        }

        if (!war.__v66 || war.__v66.phase !== 'combat') {
          war.lastCapture = this.age;
          continue;
        }
        if (this.age - Number(war.lastCapture || 0) < 3) continue;
        war.lastCapture = this.age;

        const powerA = this.power(a) * (0.85 + Math.random() * 0.30);
        const powerB = this.power(b) * (0.85 + Math.random() * 0.30);
        const winner = powerA >= powerB ? a : b;
        const loser = winner === a ? b : a;

        winner.military += 0.5;
        loser.military = Math.max(2, Number(loser.military || 2) - 1.5);
        this.r.casualty?.(war, loser.id, winner.id);
        if (Math.random() < 0.45) this.r.casualty?.(war, loser.id, winner.id);
      }
      return true;
    };

    return true;
  }

  function installVisibleGiftBuildingRemap(sim) {
    if (sim.__kw2VisibleGiftBuildingRemap || typeof sim.addBuilding !== 'function') return false;
    sim.__kw2VisibleGiftBuildingRemap = true;
    const previousAddBuilding = sim.addBuilding.bind(sim);

    sim.addBuilding = function(kingdom, type, ...rest) {
      let requested = String(type ?? '').trim().toLowerCase();
      if (kingdom?.__v712BigHelpBusy && BIG_HELP_VISIBLE_REMAP[requested]) {
        requested = BIG_HELP_VISIBLE_REMAP[requested];
      }
      return previousAddBuilding(kingdom, requested, ...rest);
    };
    return true;
  }

  function installHiddenBuildingBattleFilter(sim) {
    const r = sim.r;
    if (r.__kw2HiddenBuildingBattleFilter || typeof r.updateWars !== 'function') return false;
    r.__kw2HiddenBuildingBattleFilter = true;
    const previousUpdateWars = r.updateWars.bind(r);

    r.updateWars = function(battleSim, dt) {
      const originals = new Map();
      for (const kingdom of battleSim.kingdoms || []) {
        const original = kingdom.buildings || [];
        originals.set(kingdom, original);
        kingdom.buildings = original.filter(building =>
          building && !HIDDEN_BATTLE_TYPES.has(String(building.type || '').toLowerCase())
        );
      }

      try {
        return previousUpdateWars(battleSim, dt);
      } finally {
        for (const [kingdom, original] of originals) {
          if (!kingdom.alive) {
            kingdom.buildings = [];
            continue;
          }
          const visibleSurvivors = new Set(kingdom.buildings || []);
          kingdom.buildings = original.filter(building =>
            HIDDEN_BATTLE_TYPES.has(String(building?.type || '').toLowerCase()) || visibleSurvivors.has(building)
          );
        }
      }
    };
    return true;
  }

  function armyVanguardPoint(sim, r, war) {
    if (!war) return null;
    const preferred = Number.isInteger(war.__kw2AttackSide) ? war.__kw2AttackSide : war.a;
    const fallback = preferred === war.a ? war.b : war.a;

    const pointFor = side => {
      const units = (r.__v66Guards?.get?.(side) || []).filter(unit =>
        unit && !unit.dead && unit.warId === war.id && Number.isFinite(unit.x) && Number.isFinite(unit.y)
      );
      if (!units.length) return null;
      const enemySide = side === war.a ? war.b : war.a;
      const enemy = sim.kingdoms?.[enemySide];
      const castle = enemy?.buildings?.find(building => building?.type === 'castle' && !building.__v66Destroyed);
      const target = castle && Number.isFinite(castle.sx) && Number.isFinite(castle.sy)
        ? [castle.sx, castle.sy]
        : sim.iso(...(enemy?.capital || sim.kingdoms?.[side]?.capital || [0, 0]));

      units.sort((left, right) =>
        Math.hypot(left.x - target[0], left.y - target[1]) - Math.hypot(right.x - target[0], right.y - target[1])
      );
      const leaders = units.slice(0, Math.min(4, units.length));
      const x = leaders.reduce((sum, unit) => sum + unit.x, 0) / leaders.length;
      const y = leaders.reduce((sum, unit) => sum + unit.y, 0) / leaders.length;
      return { x, y, side };
    };

    return pointFor(preferred) || pointFor(fallback);
  }

  function installArmyCamera(sim) {
    const r = sim.r;
    if (r.__kw2ArmyCameraFollow || typeof r.warCameraTarget !== 'function') return false;
    r.__kw2ArmyCameraFollow = true;
    const previousWarCameraTarget = r.warCameraTarget.bind(r);

    r.warCameraTarget = function(director, now) {
      const base = previousWarCameraTarget(director, now);
      if (!base || !director?.warShot?.warId) return base;
      const war = (sim.wars || []).find(entry => entry.id === director.warShot.warId && !entry.done);
      const vanguard = armyVanguardPoint(sim, this, war);
      if (!vanguard) return base;

      const scale = Number(base.scale) || (innerWidth < 600 ? 0.92 : 1.02);
      director.mode = 'war';
      director.focusKingdom = null;
      document.documentElement.dataset.autoCameraWarFollow = `army-${vanguard.side}`;
      return {
        scale,
        x: innerWidth * 0.5 - vanguard.x * scale,
        y: innerHeight * 0.52 - vanguard.y * scale
      };
    };
    return true;
  }

  async function install() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (
        sim?.r &&
        window.__KW2_LIVE_PRELAUNCH_PATCH?.installed &&
        window.__V800_PERFORMANCE_KERNEL?.installed &&
        window.__GOD_WORLD_LATEST_VISUALS?.installed &&
        typeof sim.attack === 'function' &&
        typeof sim.startWar === 'function' &&
        typeof sim.resolveWars === 'function' &&
        typeof sim.r.updateWars === 'function' &&
        typeof sim.r.warCameraTarget === 'function'
      ) break;
      await sleep(25);
    }

    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Kingdom War 2 runtime unavailable for physical war patch');

    const territoryLock = installTerritoryLockAndPhysicalResolution(sim);
    const visibleGiftBuildings = installVisibleGiftBuildingRemap(sim);
    const hiddenBattleFilter = installHiddenBuildingBattleFilter(sim);
    const armyCameraFollow = installArmyCamera(sim);

    window.__KW2_PHYSICAL_WAR_EXPEDITION = Object.freeze({
      installed: true,
      version: VERSION,
      explicitAttackStartsPhysicalWar: true,
      territoryExpansionDuringWar: false,
      territoryCaptureDuringWar: false,
      powerResolutionPreserved: true,
      buildingDestructionPathPreserved: true,
      castleEliminationPreserved: true,
      armyCameraFollow,
      hiddenBattleFilter,
      visibleGiftBuildings,
      territoryLock
    });
    document.documentElement.dataset.kw2PhysicalWar = VERSION;
  }

  install().catch(error => {
    window.__KW2_PHYSICAL_WAR_EXPEDITION_ERROR = String(error?.stack || error?.message || error);
    console.error('[Kingdom War 2 physical war expedition]', error);
  });
})();
