(() => {
  'use strict';

  const VERSION = 'v70-war-peace-cleanup-2-civic';
  const CIVIC_MAX_CHECKS = 64;
  const CIVIC_RETRY_BASE = 28;
  const CIVIC_COSTS = {
    windmill: { wood: 90, stone: 45, gold: 10 },
    church: { wood: 90, stone: 45, gold: 10 }
  };

  if (window.__V70_WAR_PEACE_CLEANUP?.installed) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function isAtWar(sim, kingdom) {
    if (!kingdom?.alive) return false;
    return (sim.wars || []).some(w => !w.done && (w.a === kingdom.id || w.b === kingdom.id));
  }

  function aliveCount(kingdom, type) {
    return (kingdom?.buildings || []).reduce((n, b) =>
      n + (b && b.type === type && !b.__v66Destroyed && (!Number.isFinite(b.hp) || b.hp > 0) ? 1 : 0), 0);
  }

  function affordable(kingdom, cost) {
    return Object.entries(cost).every(([resource, amount]) => Number(kingdom.resources?.[resource] || 0) >= amount);
  }

  const CIVIC_OFFSETS = [];
  for (let radius = 2; radius <= 4; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) CIVIC_OFFSETS.push([dx, dy]);
      }
    }
  }

  function validCivicCell(sim, kingdom, type, x, y) {
    if (sim.getOwner(x, y) !== kingdom.id) return false;
    if (!sim.isBuildableCell(x, y, type)) return false;
    if (sim.buildingBlockingCell(x, y)) return false;
    if (!sim.buildingSpacingOK(kingdom, type, x, y)) return false;
    if ((kingdom.farmers || []).some(f => f.cell?.[0] === x && f.cell?.[1] === y)) return false;
    return true;
  }

  function boundedCivicCell(sim, kingdom, type) {
    if (aliveCount(kingdom, type) >= 1) return null;

    const farms = (kingdom.buildings || []).filter(b => b.type === 'farm' && !b.__v66Destroyed);
    const houses = (kingdom.buildings || []).filter(b => /^house_[abc]$/.test(b.type) && !b.__v66Destroyed);
    if (type === 'windmill' && farms.length < 2) return null;
    if (type === 'church' && (houses.length < 3 || Number(kingdom.pop || 0) < 10)) return null;

    const anchors = type === 'windmill' ? farms : houses;
    const seen = new Set();
    let checked = 0;
    let best = null;
    let bestScore = -Infinity;
    const shift = ((kingdom.id || 0) * 11 + Math.floor(Number(sim.age || 0) / 20)) % CIVIC_OFFSETS.length;

    for (let ai = 0; ai < anchors.length && checked < CIVIC_MAX_CHECKS; ai++) {
      const anchor = anchors[(ai + (kingdom.id || 0)) % anchors.length];
      for (let oi = 0; oi < CIVIC_OFFSETS.length && checked < CIVIC_MAX_CHECKS; oi++) {
        const [dx, dy] = CIVIC_OFFSETS[(oi + shift) % CIVIC_OFFSETS.length];
        const x = anchor.x + dx, y = anchor.y + dy;
        const token = `${x},${y}`;
        if (seen.has(token)) continue;
        seen.add(token);
        checked++;
        if (!validCivicCell(sim, kingdom, type, x, y)) continue;

        let score = -Math.hypot(x - kingdom.capital[0], y - kingdom.capital[1]) * 0.05;
        if (type === 'windmill') {
          let nearest = Infinity, nearby = 0;
          for (const farm of farms) {
            const distance = Math.hypot(farm.x - x, farm.y - y);
            nearest = Math.min(nearest, distance);
            if (distance <= 4.3) nearby++;
          }
          if (nearest > 4.2) continue;
          score += nearby * 4.5 - Math.abs(nearest - 2.8) * 2;
        } else {
          let nearby = 0;
          for (const house of houses) if (Math.hypot(house.x - x, house.y - y) <= 5) nearby++;
          if (nearby < 2) continue;
          score += nearby * 5;
        }
        if (score > bestScore) { bestScore = score; best = [x, y]; }
      }
    }
    return best;
  }

  function civicTypeReady(kingdom, age) {
    const windmillReady = aliveCount(kingdom, 'windmill') < 1 && aliveCount(kingdom, 'farm') >= 2 && affordable(kingdom, CIVIC_COSTS.windmill);
    const houses = (kingdom.buildings || []).filter(b => /^house_[abc]$/.test(b.type) && !b.__v66Destroyed).length;
    const churchReady = aliveCount(kingdom, 'church') < 1 && houses >= 3 && Number(kingdom.pop || 0) >= 10 && affordable(kingdom, CIVIC_COSTS.church);
    if (!windmillReady && !churchReady) return null;
    if (windmillReady && churchReady) return ((kingdom.id || 0) + Math.floor(age / 30)) % 2 ? 'church' : 'windmill';
    return windmillReady ? 'windmill' : 'church';
  }

  function destroyDisplay(obj) {
    if (!obj) return null;
    try { obj.removeFromParent?.(); } catch (_) {}
    try { if (!obj.destroyed) obj.destroy({ children: true }); } catch (_) {
      try { if (!obj.destroyed) obj.destroy(); } catch (_) {}
    }
    return null;
  }

  function cleanupBuildingVisual(renderer, building) {
    if (!building) return;
    building._sprite = destroyDisplay(building._sprite);
    building._flag = destroyDisplay(building._flag);
    building._shadow = destroyDisplay(building._shadow);
    building._foundation = destroyDisplay(building._foundation);

    const fire = renderer.__v66Fires?.get?.(building);
    if (fire) {
      destroyDisplay(fire.c);
      renderer.__v66Fires.delete(building);
    }
  }

  function cleanupDestroyedBuildings(sim, renderer) {
    let changed = false;
    for (const kingdom of sim.kingdoms || []) {
      if (!Array.isArray(kingdom.buildings) || !kingdom.buildings.length) continue;
      const keep = [];
      for (const building of kingdom.buildings) {
        const destroyed = !!building?.__v66Destroyed || (Number.isFinite(building?.hp) && building.hp <= 0);
        if (!destroyed) {
          keep.push(building);
          continue;
        }
        if (building?.type === 'farm') sim.releaseFarmWorker?.(kingdom, building.id);
        cleanupBuildingVisual(renderer, building);
        changed = true;
      }
      if (keep.length !== kingdom.buildings.length) kingdom.buildings = keep;
    }
    if (changed) renderer.redrawSettlementGround?.(sim);
  }

  function cleanupDeadGuards(sim, renderer) {
    const guards = renderer.__v66Guards;
    if (!(guards instanceof Map)) return;

    for (const [kingdomId, arr] of guards) {
      const kingdom = sim.kingdoms?.[kingdomId];
      const keep = [];
      for (const unit of arr || []) {
        if (!unit?.s || unit.s.destroyed) continue;
        if (!kingdom?.alive) {
          destroyDisplay(unit.s);
          continue;
        }
        if (unit.dead && Number(unit.deadAge || 0) >= 4.15) {
          destroyDisplay(unit.s);
          continue;
        }
        keep.push(unit);
      }
      guards.set(kingdomId, keep);
    }
  }

  function cleanupFarmerSpriteIndex(sim, renderer) {
    if (!(renderer.farmerSprites instanceof Map)) return;
    const liveIds = new Set();
    for (const kingdom of sim.kingdoms || []) {
      if (!kingdom?.alive) continue;
      for (const farmer of kingdom.farmers || []) if (farmer?.id) liveIds.add(farmer.id);
    }
    for (const [id, sprite] of [...renderer.farmerSprites]) {
      if (liveIds.has(id) && sprite && !sprite.destroyed) continue;
      destroyDisplay(sprite);
      renderer.farmerSprites.delete(id);
    }
  }

  function cleanupFinishedWarVisuals(sim, renderer) {
    if (!(renderer.warVisuals instanceof Map)) return;
    const activeIds = new Set((sim.wars || []).filter(w => !w.done).map(w => w.id));
    for (const [warId, visual] of [...renderer.warVisuals]) {
      if (activeIds.has(warId)) continue;
      destroyDisplay(visual?.container);
      renderer.warVisuals.delete(warId);
    }
  }

  async function install() {
    for (let i = 0; i < 2200; i++) {
      const sim = window.__SIM;
      if (sim?.r && typeof sim.buildAI === 'function' && typeof sim.expandAI === 'function' &&
          typeof sim.addBuilding === 'function' && window.__V67_PIXEL_BUILDINGS?.installed) break;
      await sleep(20);
    }

    const sim = window.__SIM, renderer = sim?.r;
    if (!sim || !renderer || typeof sim.buildAI !== 'function' || typeof sim.expandAI !== 'function' || typeof sim.addBuilding !== 'function') return;

    const originalFindBuildCell = sim.findBuildCell.bind(sim);
    sim.findBuildCell = function (kingdom, type, initial = false) {
      if (type === 'windmill' || type === 'church') return boundedCivicCell(this, kingdom, type);
      return originalFindBuildCell(kingdom, type, initial);
    };

    const originalBuildAI = sim.buildAI.bind(sim);
    sim.buildAI = async function (kingdom) {
      if (isAtWar(this, kingdom)) return null;

      const beforeBuild = Number(kingdom?.lastBuild || 0);
      const result = await originalBuildAI(kingdom);
      if (!kingdom?.alive || Number(kingdom.lastBuild || 0) !== beforeBuild) return result;
      if (this.age - Number(kingdom.lastBuild || 0) < 6) return result;

      if (!Number.isFinite(kingdom.__v70NextCivicAt)) {
        kingdom.__v70NextCivicAt = this.age + 12 + ((kingdom.id || 0) % 6) * 2;
      }
      if (this.age < kingdom.__v70NextCivicAt) return result;
      kingdom.__v70NextCivicAt = this.age + CIVIC_RETRY_BASE + ((kingdom.id || 0) % 5) * 3;

      const type = civicTypeReady(kingdom, this.age);
      if (!type) return result;
      const cost = CIVIC_COSTS[type];
      const cell = this.findBuildCell(kingdom, type, false);
      if (!cell) return result;

      const building = await this.addBuilding(kingdom, type, cell[0], cell[1], false);
      if (!building) return result;
      for (const [resource, amount] of Object.entries(cost)) kingdom.resources[resource] -= amount;
      kingdom.lastBuild = this.age;
      this.r.puff?.(...this.iso(cell[0], cell[1]));
      this.updateSelected?.();
      return true;
    };

    const originalExpandAI = sim.expandAI.bind(sim);
    sim.expandAI = function (kingdom) {
      if (isAtWar(this, kingdom)) return false;
      return originalExpandAI(kingdom);
    };

    const originalAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = function (kingdom, type, x, y, forceCastle = false, instant = false, ...rest) {
      if (!forceCastle && kingdom?.alive && isAtWar(this, kingdom)) return null;
      if ((type === 'windmill' || type === 'church') && aliveCount(kingdom, type) >= 1) return null;
      return originalAddBuilding(kingdom, type, x, y, forceCastle, instant, ...rest);
    };

    if (typeof sim.claimGiftLand === 'function') {
      const originalClaimGiftLand = sim.claimGiftLand.bind(sim);
      sim.claimGiftLand = function (kingdom, amount) {
        if (isAtWar(this, kingdom)) return 0;
        return originalClaimGiftLand(kingdom, amount);
      };
    }

    const previousWarState = new Map();
    let cleanupClock = 0;
    const housekeeping = dt => {
      cleanupClock += Math.min(0.1, Number(dt) || 0.016);
      if (cleanupClock < 0.75) return;
      cleanupClock = 0;

      for (const kingdom of sim.kingdoms || []) {
        const atWar = isAtWar(sim, kingdom);
        const wasAtWar = previousWarState.get(kingdom.id) || false;
        if (kingdom?.alive && wasAtWar && !atWar) {
          kingdom.lastExpand = Math.min(Number(kingdom.lastExpand) || 0, sim.age - 3);
          const target = sim.kingdoms?.[kingdom.aggressive];
          if (kingdom.aggressive != null && !target?.alive) kingdom.aggressive = null;
        }
        previousWarState.set(kingdom.id, atWar);
      }

      cleanupDestroyedBuildings(sim, renderer);
      cleanupDeadGuards(sim, renderer);
      cleanupFarmerSpriteIndex(sim, renderer);
      cleanupFinishedWarVisuals(sim, renderer);
    };

    if (renderer.app?.ticker) renderer.app.ticker.add(housekeeping);
    else setInterval(() => housekeeping(0.8), 800);

    window.__V70_WAR_PEACE_CLEANUP = {
      installed: true,
      version: VERSION,
      buildPausedDuringWar: true,
      expansionPausedDuringWar: true,
      resumesExpansionAfterWar: true,
      destroyedBuildingsPurged: true,
      deadNpcPurged: true,
      eliminatedKingdomGuardsPurged: true,
      churchEnabled: true,
      windmillEnabled: true,
      maxChurchesPerKingdom: 1,
      maxWindmillsPerKingdom: 1,
      civicPlacementBounded: true,
      civicMaxCandidateChecks: CIVIC_MAX_CHECKS,
      civicNoTerritoryScan: true,
      civicNoExtraTicker: true
    };
    document.documentElement.dataset.warPeaceCleanup = VERSION;
  }

  install().catch(error => {
    window.__V70_WAR_PEACE_CLEANUP_ERROR = String(error?.stack || error?.message || error);
    console.error('[v70-war-peace-cleanup]', error);
  });
})();