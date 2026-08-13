(() => {
  'use strict';

  // V8 owns only the hot-path bookkeeping. Gameplay systems continue to call the
  // same public Simulation/Renderer methods, but those methods now share one set
  // of indexes instead of repeatedly scanning every territory and building.
  const VERSION = 'v803-mobile-performance-kernel-4-kingdom-war';
  if (window.__V800_PERFORMANCE_KERNEL?.bootstrap) return;

  const state = window.__V800_PERFORMANCE_KERNEL = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    mapGeometryChanged: false,
    indexedBuildings: 0,
    territoryCacheBuilds: 0,
    economyCacheHits: 0,
    buildCandidateChecks: 0,
    territoryDraws: 0,
    territoryDrawsSkipped: 0,
    portsValidated: 0,
    portsRejected: 0,
    tickSamples: [],
    lastTickMs: 0,
    maxTickMs: 0,
    errors: []
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const token = (x, y) => `${x},${y}`;
  const MIN_SEPARATION = {
    castle: 0, farm: 2, house_a: 2.15, house_b: 2.15, house_c: 2.15,
    stable: 2.35, barracks: 2.35, forge: 2.25, market: 2.3,
    church: 2.4, windmill: 2.35, warehouse: 2.2, silo: 2.2,
    watchtower: 2, stone_tower: 2, port: 2.35
  };
  const FOOTPRINT = { castle: 1, keep: 1 };
  const CENTRAL_TYPES = new Set(['warehouse', 'market', 'church', 'barracks', 'forge']);
  const BORDER_TYPES = new Set(['watchtower', 'stone_tower']);

  function aliveBuilding(building) {
    return !!building && !building.__v66Destroyed && (!Number.isFinite(building.hp) || building.hp > 0);
  }

  function atWar(sim, kingdom) {
    return !!kingdom?.alive && (sim.wars || []).some(war =>
      !war.done && (war.a === kingdom.id || war.b === kingdom.id));
  }

  function install(sim) {
    const renderer = sim.r;
    const width = sim.w.gridW;
    const cellId = (x, y) => y * width + x;

    const exactBuildings = new Map();
    const blockedCells = new Map();
    const spatialByKingdom = new Map();
    const territoryCache = new Map();
    const buildingCountsCache = new Map();
    const knownLengths = new Map();
    const knownDestroyed = new Map();
    let ownerRevision = 0;
    let lastTerritoryDrawRevision = -1;
    let lastViewportSignature = '';
    let portClock = 0;
    let settlementDirty = false;

    function invalidateKingdom(id) {
      if (!Number.isInteger(id) || id < 0) return;
      territoryCache.delete(id);
    }

    function rebuildBuildingIndex() {
      exactBuildings.clear();
      blockedCells.clear();
      spatialByKingdom.clear();
      buildingCountsCache.clear();
      knownLengths.clear();
      knownDestroyed.clear();

      let total = 0;
      for (const kingdom of sim.kingdoms || []) {
        if (!kingdom?.alive) continue;
        const buckets = new Map();
        const counts = Object.create(null);
        let destroyed = 0;
        for (const building of kingdom.buildings || []) {
          if (!aliveBuilding(building)) { destroyed++; continue; }
          total++;
          counts[building.type] = (counts[building.type] || 0) + 1;
          exactBuildings.set(cellId(building.x, building.y), building);
          const radius = FOOTPRINT[building.type] || 0;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              blockedCells.set(cellId(building.x + dx, building.y + dy), building);
            }
          }
          const bx = Math.floor(building.x / 4), by = Math.floor(building.y / 4);
          const bucketKey = token(bx, by);
          if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
          buckets.get(bucketKey).push(building);
        }
        spatialByKingdom.set(kingdom.id, buckets);
        buildingCountsCache.set(kingdom.id, counts);
        knownLengths.set(kingdom.id, kingdom.buildings?.length || 0);
        knownDestroyed.set(kingdom.id, destroyed);
      }
      state.indexedBuildings = total;
    }

    function buildingIndexChanged() {
      for (const kingdom of sim.kingdoms || []) {
        if (!kingdom?.alive) continue;
        if (knownLengths.get(kingdom.id) !== (kingdom.buildings?.length || 0)) return true;
        let destroyed = 0;
        for (const building of kingdom.buildings || []) if (!aliveBuilding(building)) destroyed++;
        if (knownDestroyed.get(kingdom.id) !== destroyed) return true;
      }
      return knownLengths.size !== (sim.kingdoms || []).filter(k => k?.alive).length;
    }

    function cachedTerritory(kingdom) {
      const existing = territoryCache.get(kingdom.id);
      if (existing && existing.size === kingdom.territory.size) return existing;

      const cells = [];
      const biomes = Object.create(null);
      for (const value of kingdom.territory || []) {
        const comma = value.indexOf(',');
        const x = Number(value.slice(0, comma)), y = Number(value.slice(comma + 1));
        if (!Number.isFinite(x) || !Number.isFinite(y) || sim.getOwner(x, y) !== kingdom.id) continue;
        cells.push([x, y]);
        const biome = sim.w.biomes[y]?.[x] || 'ocean';
        biomes[biome] = (biomes[biome] || 0) + 1;
      }
      const entry = { size: kingdom.territory.size, cells, biomes, frontier: null, walkable: null };
      territoryCache.set(kingdom.id, entry);
      state.territoryCacheBuilds++;
      return entry;
    }

    function frontierFor(kingdom) {
      const cache = cachedTerritory(kingdom);
      if (cache.frontier) return cache.frontier;
      const unique = new Map();
      for (const [x, y] of cache.cells) {
        for (const [nx, ny] of sim.neigh(x, y)) {
          if (sim.getOwner(nx, ny) === -1) unique.set(cellId(nx, ny), [nx, ny]);
        }
      }
      cache.frontier = [...unique.values()];
      return cache.frontier;
    }

    function nearbyBuildings(kingdom, x, y) {
      const buckets = spatialByKingdom.get(kingdom.id);
      if (!buckets) return [];
      const bx = Math.floor(x / 4), by = Math.floor(y / 4), nearby = [];
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const group = buckets.get(token(bx + ox, by + oy));
          if (group) nearby.push(...group);
        }
      }
      return nearby;
    }

    function isSea(x, y) {
      return sim.inBounds(x, y) && !sim.land(x, y);
    }

    function portDirection(kingdom, x, y) {
      if (!kingdom?.alive || !sim.inBounds(x, y) || !sim.land(x, y)) return null;
      if (sim.isRiver(x, y) || sim.getOwner(x, y) !== kingdom.id) return null;
      if (['mountain', 'ice_coast'].includes(sim.biome(x, y))) return null;
      if (sim.coastDistance(x, y) > 1) return null;
      if (isSea(x, y + 1)) return [0, 1];
      if (isSea(x + 1, y)) return [1, 0];
      return null;
    }

    function hasPort(kingdom) {
      return (kingdom?.buildings || []).some(building => building.type === 'port' && aliveBuilding(building));
    }

    function portCell(kingdom) {
      let best = null, bestScore = -Infinity;
      for (const [x, y] of cachedTerritory(kingdom).cells) {
        const direction = portDirection(kingdom, x, y);
        if (!direction || sim.buildingBlockingCell(x, y) || !sim.buildingSpacingOK(kingdom, 'port', x, y)) continue;
        if ((kingdom.farmers || []).some(f => f.cell?.[0] === x && f.cell?.[1] === y)) continue;
        const beach = sim.biome(x, y) === 'beach' ? 5 : 0;
        const distance = Math.hypot(x - kingdom.capital[0], y - kingdom.capital[1]);
        const score = beach - distance * 0.04 + Math.random() * 0.25;
        state.buildCandidateChecks++;
        if (score > bestScore) { bestScore = score; best = { cell: [x, y], direction }; }
      }
      return best;
    }

    const previousSetOwner = sim.setOwner.bind(sim);
    sim.setOwner = function(x, y, id) {
      const oldOwner = this.getOwner(x, y);
      const result = previousSetOwner(x, y, id);
      if (oldOwner !== id) {
        ownerRevision++;
        invalidateKingdom(oldOwner);
        invalidateKingdom(id);
      }
      return result;
    };

    sim.buildingAt = function(x, y) {
      const building = exactBuildings.get(cellId(x, y));
      return aliveBuilding(building) ? building : null;
    };

    sim.buildingBlockingCell = function(x, y) {
      const building = blockedCells.get(cellId(x, y));
      return aliveBuilding(building) ? building : null;
    };

    sim.buildingSpacingOK = function(kingdom, type, x, y) {
      const min = MIN_SEPARATION[type] || 2.15;
      for (const building of nearbyBuildings(kingdom, x, y)) {
        if (aliveBuilding(building) && Math.hypot(x - building.x, y - building.y) < min) return false;
      }
      return true;
    };

    const previousIsBuildable = sim.isBuildableCell.bind(sim);
    sim.isBuildableCell = function(x, y, type = 'house_a') {
      if (type !== 'port') return previousIsBuildable(x, y, type);
      const owner = this.getOwner(x, y);
      return portDirection(this.kingdoms?.[owner], x, y) !== null;
    };

    const previousFindBuildCell = sim.findBuildCell.bind(sim);
    sim.findBuildCell = function(kingdom, type, initial = false) {
      if (type === 'port') return portCell(kingdom)?.cell || null;
      // Civic placement is already bounded to a maximum of 64 candidates and has
      // important farm/house clustering rules, so retain that specialized owner.
      if (type === 'windmill' || type === 'church') return previousFindBuildCell(kingdom, type, initial);

      const used = kingdom.buildings || [];
      const min = initial ? 2 : (MIN_SEPARATION[type] || 2.15);
      let best = null, bestScore = -Infinity;
      for (const [x, y] of cachedTerritory(kingdom).cells) {
        state.buildCandidateChecks++;
        if (!previousIsBuildable(x, y, type) || sim.buildingBlockingCell(x, y)) continue;
        if (!sim.buildingSpacingOK(kingdom, type, x, y)) continue;
        if ((kingdom.farmers || []).some(f => f.cell?.[0] === x && f.cell?.[1] === y)) continue;

        let separation = 99;
        for (const building of nearbyBuildings(kingdom, x, y)) {
          separation = Math.min(separation, Math.hypot(x - building.x, y - building.y));
        }
        if (used.length && separation < min) continue;
        const distance = Math.hypot(x - kingdom.capital[0], y - kingdom.capital[1]);
        let bonus = 0;
        if (type === 'farm') bonus += sim.biome(x, y) === 'grass' ? 5 : -10;
        if (CENTRAL_TYPES.has(type)) bonus -= distance * 0.34;
        if (BORDER_TYPES.has(type)) bonus += distance * 0.12;
        const score = bonus - distance * 0.08 + Math.min(separation, 4) * 0.9 + Math.random() * 0.7;
        if (score > bestScore) { bestScore = score; best = [x, y]; }
      }
      return best;
    };

    sim.ownWalkableCells = function(kingdom) {
      const cache = cachedTerritory(kingdom);
      if (!cache.walkable) {
        cache.walkable = cache.cells.filter(([x, y]) => sim.isWalkableCell(x, y));
      }
      return cache.walkable.filter(([x, y]) => !sim.buildingBlockingCell(x, y));
    };

    sim.economy = function(kingdom) {
      const mult = this.age < kingdom.boostUntil ? 1.8 : 1;
      const counts = buildingCountsCache.get(kingdom.id) || Object.create(null);
      const biomes = cachedTerritory(kingdom).biomes;
      state.economyCacheHits++;

      kingdom.resources.food += (kingdom.pop * 0.32 + (counts.farm || 0) * 2.3 + (counts.windmill || 0) * 1.7 + (biomes.grass || 0) * 0.045 + (biomes.beach || 0) * 0.018) * mult;
      kingdom.resources.wood += (kingdom.pop * 0.19 + (biomes.forest || 0) * 0.34) * mult;
      kingdom.resources.stone += (kingdom.pop * 0.09 + (biomes.mountain || 0) * 0.48 + (counts.stone_tower || 0) * 0.2) * mult;
      kingdom.resources.gold += (kingdom.pop * 0.055 + (counts.market || 0) * 0.75 + (counts.warehouse || 0) * 0.18 + (biomes.desert || 0) * 0.035) * mult;
      kingdom.resources.food -= kingdom.pop * 0.11;
      kingdom.military += 0.08 + (counts.barracks || 0) * 0.25 + (counts.forge || 0) * 0.18;

      // Viewer development support used to wrap economy and repeat its hot path.
      // It is folded here so economy has one authoritative implementation.
      let support = Number(kingdom.__v712ViewerSupport || 0);
      if (support > 0 && this.age > Number(kingdom.__v712ViewerSupportUntil || 0)) {
        support = Math.max(0, support - 0.8);
        kingdom.__v712ViewerSupport = support;
      }
      const strength = Math.min(1.6, support / 10);
      if (strength > 0) {
        kingdom.resources.food += 2.3 * strength;
        kingdom.resources.wood += 1.8 * strength;
        kingdom.resources.stone += 0.85 * strength;
        kingdom.resources.gold += 0.42 * strength;
        kingdom.lastBuild -= 0.55 * strength;
        kingdom.lastExpand -= 0.38 * strength;
        kingdom.lastPop -= 0.24 * strength;
      }
    };

    sim.expandAI = function(kingdom) {
      if (!kingdom?.alive || kingdom.founding || atWar(this, kingdom)) return false;
      if (this.age - kingdom.lastExpand < 3 || kingdom.resources.food < 12 || kingdom.resources.wood < 10) return false;
      const candidates = frontierFor(kingdom).slice();
      if (!candidates.length) return false;
      const target = kingdom.aggressive != null ? this.kingdoms[kingdom.aggressive] : null;
      const cell = this.pickExpansionCell?.(kingdom, candidates, kingdom.territory.size, target);
      if (!cell) return false;
      const [x, y] = cell;
      this.setOwner(x, y, kingdom.id);
      kingdom.territory.add(token(x, y));
      invalidateKingdom(kingdom.id);
      kingdom.resources.food -= 6;
      kingdom.resources.wood -= 4;
      kingdom.lastExpand = this.age;
      return true;
    };

    const originalAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = function(kingdom, type, x, y, forceCastle = false, instant = false, ...rest) {
      if (type === 'port') {
        const direction = portDirection(kingdom, x, y);
        if (hasPort(kingdom) || !direction) {
          state.portsRejected++;
          return null;
        }
      }
      const result = originalAddBuilding(kingdom, type, x, y, forceCastle, instant, ...rest);
      return Promise.resolve(result).then(building => {
        if (!building) return building;
        rebuildBuildingIndex();
        if (type === 'port') {
          const direction = portDirection(kingdom, x, y);
          building.__v800PortDirection = direction;
          if (direction?.[0] === 1 && building._sprite?.scale) building._sprite.scale.x = -Math.abs(building._sprite.scale.x);
          state.portsValidated++;
        }
        return building;
      });
    };

    function viewportBounds(margin = 240) {
      const root = renderer.root;
      const scaleX = Math.max(0.001, Math.abs(Number(root?.scale?.x || 1)));
      const scaleY = Math.max(0.001, Math.abs(Number(root?.scale?.y || scaleX)));
      return {
        left: (-margin - Number(root?.x || 0)) / scaleX,
        right: (innerWidth + margin - Number(root?.x || 0)) / scaleX,
        top: (-margin - Number(root?.y || 0)) / scaleY,
        bottom: (innerHeight + margin - Number(root?.y || 0)) / scaleY,
        scale: scaleX
      };
    }

    const inBounds = (bounds, x, y) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;

    function visibleSimulation(forSettlement = false) {
      const bounds = viewportBounds(forSettlement ? 420 : 90);
      const view = Object.create(sim);
      view.kingdoms = [];
      let visibleCells = 0, visibleBuildings = 0;
      for (const kingdom of sim.kingdoms || []) {
        if (!kingdom?.alive) continue;
        const [capitalX, capitalY] = sim.iso(kingdom.capital[0], kingdom.capital[1]);
        const nearCapital = inBounds(bounds, capitalX, capitalY);
        if (forSettlement) {
          let buildings = (kingdom.buildings || []).filter(building =>
            aliveBuilding(building) && inBounds(bounds, building.sx, building.sy));
          // At world overview scale, dense road meshes are sub-pixel detail. Keep
          // the capital and main civic routes; full streets return on zoom-in.
          if (bounds.scale < 0.55 && buildings.length > 7) buildings = buildings.slice(0, 7);
          if (!nearCapital && !buildings.length) continue;
          const copy = Object.create(kingdom);
          copy.buildings = buildings;
          view.kingdoms.push(copy);
          visibleBuildings += buildings.length;
        } else {
          const territory = new Set();
          for (const [x, y] of cachedTerritory(kingdom).cells) {
            const [screenX, screenY] = sim.iso(x, y);
            if (inBounds(bounds, screenX, screenY)) territory.add(token(x, y));
          }
          if (!nearCapital && !territory.size) continue;
          const copy = Object.create(kingdom);
          copy.territory = territory;
          view.kingdoms.push(copy);
          visibleCells += territory.size;
        }
      }
      if (forSettlement) state.visibleRoadBuildings = visibleBuildings;
      else state.visibleTerritoryCells = visibleCells;
      return view;
    }

    const originalRedrawTerritories = renderer.redrawTerritories.bind(renderer);
    const drawVisibleTerritories = () => {
      state.territoryDraws++;
      return originalRedrawTerritories(visibleSimulation(false));
    };
    renderer.redrawTerritories = function(currentSim, force = false) {
      if (!force && lastTerritoryDrawRevision === ownerRevision) {
        state.territoryDrawsSkipped++;
        return false;
      }
      lastTerritoryDrawRevision = ownerRevision;
      return drawVisibleTerritories();
    };

    const originalSettlementDraw = renderer.redrawSettlementGround?.bind(renderer);
    if (originalSettlementDraw) {
      renderer.redrawSettlementGround = function() {
        settlementDirty = true;
        return false;
      };
    }

    // Depth ordering is visually relevant only when entities cross one another.
    // Request it freely from movement systems, but execute at 10 Hz instead of
    // sorting the complete entity container 60 times per second.
    let sortRequested = true;
    let sortClock = 0;
    renderer.__v800RequestSort = () => { sortRequested = true; };
    renderer.app.ticker.add(() => {
      const dt = Math.min(0.05, renderer.app.ticker.deltaMS / 1000);
      sortClock += dt;
      if (sortRequested && sortClock >= 0.1) {
        sortClock = 0;
        sortRequested = false;
        if (renderer.entities?.sortableChildren) renderer.entities.sortDirty = true;
      }
    });

    // Do not render or animate dynamic sprites that are outside the camera.
    // The margin keeps entrances seamless during panning and does not alter any
    // visible prefab, texture, scale or animation frame.
    let cullClock = 0;
    const setAnimationActive = (display, active) => {
      if (!display || display.destroyed) return;
      if ('autoUpdate' in display && Array.isArray(display.textures)) {
        if (!active && display.autoUpdate) {
          display.__v800ResumeAnimation = true;
          display.autoUpdate = false;
        } else if (active && display.__v800ResumeAnimation) {
          display.__v800ResumeAnimation = false;
          display.autoUpdate = true;
        }
      }
      for (const child of display.children || []) setAnimationActive(child, active);
    };
    const cull = () => {
      const root = renderer.root, entities = renderer.entities;
      if (!root || !entities) return;
      const scaleX = Number(root.scale?.x || 1), scaleY = Number(root.scale?.y || scaleX);
      const margin = 170;
      let visible = 0, hidden = 0;
      for (const display of entities.children || []) {
        if (!display || display.destroyed) continue;
        // War containers keep their children in world coordinates while their own
        // position is zero; their specialized battle limits already bound cost.
        if ((display.children?.length || 0) > 8 && display.x === 0 && display.y === 0) continue;
        const screenX = root.x + display.x * scaleX;
        const screenY = root.y + display.y * scaleY;
        const onScreen = screenX >= -margin && screenX <= innerWidth + margin && screenY >= -margin && screenY <= innerHeight + margin;
        if (!onScreen) {
          if (display.visible) { display.__v800RestoreVisible = true; display.visible = false; }
          if (display.renderable) { display.__v800RestoreRenderable = true; display.renderable = false; }
        } else {
          if (display.__v800RestoreVisible) { display.__v800RestoreVisible = false; display.visible = true; }
          if (display.__v800RestoreRenderable) { display.__v800RestoreRenderable = false; display.renderable = true; }
        }
        setAnimationActive(display, onScreen);
        if (onScreen) visible++; else hidden++;
      }
      state.visibleEntities = visible;
      state.culledEntities = hidden;
      document.documentElement.dataset.culledEntities = String(hidden);
      document.documentElement.dataset.visibleEntities = String(visible);

      const signature = `${Math.round(root.x / 90)}:${Math.round(root.y / 90)}:${Math.round(scaleX * 20)}`;
      if (signature !== lastViewportSignature) {
        lastViewportSignature = signature;
        lastTerritoryDrawRevision = ownerRevision;
        drawVisibleTerritories();
        if (originalSettlementDraw) {
          settlementDirty = false;
          originalSettlementDraw(visibleSimulation(true));
        }
      }
    };
    renderer.__v800RequestCull = cull;
    renderer.app.ticker.add(() => {
      cullClock += Math.min(0.05, renderer.app.ticker.deltaMS / 1000);
      if (cullClock < 0.25) return;
      cullClock = 0;
      cull();
    });

    // Civilian pathfinding is planning, not animation. Spread idle-worker plans
    // over three simulation ticks; every visible walker is still animated by the
    // render clock, while a growing population cannot create one giant CPU spike.
    const originalFarmerAI = sim.farmerAI.bind(sim);
    sim.farmerAI = function(kingdom) {
      const all = kingdom.farmers || [];
      if (all.length < 18) return originalFarmerAI(kingdom);
      const phase = (this.tickN + kingdom.id) % 3;
      const view = Object.create(kingdom);
      view.farmers = all.filter((farmer, index) => farmer.fixedBuilding || farmer.action === 'walk' || index % 3 === phase);
      return originalFarmerAI(view);
    };

    let warUpdateAccumulator = 0;
    sim.update = function(dt) {
      for (const kingdom of this.kingdoms || []) {
        if (!kingdom?.alive) continue;
        for (const farmer of kingdom.farmers || []) {
          const sprite = farmer?._sprite;
          const onScreen = !!sprite && sprite.visible !== false && sprite.renderable !== false;
          farmer.__v800MotionDebt = Math.min(0.3, Number(farmer.__v800MotionDebt || 0) + dt);
          if (!onScreen && farmer.__v800MotionDebt < 0.18) continue;
          const stepDt = farmer.__v800MotionDebt;
          farmer.__v800MotionDebt = 0;

          if (farmer.action === 'walk' && farmer.path?.length) {
            const next = farmer.path[0];
            if (!this.isNpcWalkableCell(kingdom, next[0], next[1])) {
              farmer.path = [];
              farmer.action = 'idle';
              farmer.actionUntil = 0;
              if (onScreen) this.r.setFarmerAction(farmer, 'idle');
              continue;
            }
            const [targetX, rawTargetY] = this.iso(next[0], next[1]);
            const targetY = rawTargetY + 6;
            const dx = targetX - farmer.x, dy = targetY - farmer.y;
            const distance = Math.hypot(dx, dy);
            if (distance <= 1.4) {
              farmer.x = targetX;
              farmer.y = targetY;
              farmer.cell = [...next];
              farmer.path.shift();
              if (!farmer.path.length) {
                farmer.action = 'idle';
                farmer.actionUntil = 0;
                if (onScreen) this.r.setFarmerAction(farmer, 'idle');
              }
              if (onScreen) this.r.updateFarmer(farmer, dx, dy);
            } else {
              const distanceStep = Math.min(distance, farmer.speed * stepDt);
              farmer.x += dx / distance * distanceStep;
              farmer.y += dy / distance * distanceStep;
              if (onScreen) this.r.updateFarmer(farmer, dx, dy);
            }
          } else if (onScreen) {
            this.r.updateFarmer(farmer, 0, 0);
          }
        }
      }

      // Combat positions use a 30 Hz fixed step; Pixi animation playback remains
      // at the native render FPS, so motion stays fluid with half the AI overhead.
      warUpdateAccumulator += dt;
      if (warUpdateAccumulator >= 1 / 30) {
        const warDt = Math.min(0.066, warUpdateAccumulator);
        warUpdateAccumulator = 0;
        this.r.updateWars?.(this, warDt);
      }
    };

    sim.tick = async function() {
      if (this.__v800TickBusy) return false;
      this.__v800TickBusy = true;
      const started = performance.now();
      try {
        if (buildingIndexChanged()) rebuildBuildingIndex();
        this.age++;
        this.tickN++;
        let sliceStarted = performance.now();
        for (const kingdom of this.kingdoms || []) {
          if (!kingdom?.alive || kingdom.founding) continue;
          this.economy(kingdom);
          await this.population(kingdom);
          await this.buildAI(kingdom);
          this.expandAI(kingdom);
          this.farmerAI(kingdom);
          // Keep long simulation work below a single frame budget. The same
          // operations still run once per tick, only distributed across frames.
          if (performance.now() - sliceStarted > 6) {
            await new Promise(resolve => setTimeout(resolve, 0));
            sliceStarted = performance.now();
          }
        }
        this.warAI();
        this.resolveWars();
        if (this.tickN % 2 === 0) this.r.redrawTerritories(this);
        this.updateUI();
        if (buildingIndexChanged()) rebuildBuildingIndex();
        this.__v70Housekeeping?.(1);

        portClock++;
        if (portClock >= 3) {
          portClock = 0;
          for (const kingdom of this.kingdoms || []) {
            if (kingdom?.alive && !kingdom.founding && !hasPort(kingdom)) await this.__v712MaybeBuildPort?.(kingdom);
          }
        }
        if (settlementDirty && originalSettlementDraw) {
          settlementDirty = false;
          originalSettlementDraw(visibleSimulation(true));
        }
        cull();

        const elapsed = performance.now() - started;
        state.lastTickMs = elapsed;
        state.maxTickMs = Math.max(state.maxTickMs, elapsed);
        state.tickSamples.push(elapsed);
        if (state.tickSamples.length > 120) state.tickSamples.shift();
        const average = state.tickSamples.reduce((sum, value) => sum + value, 0) / state.tickSamples.length;
        document.documentElement.dataset.lastTickMs = elapsed.toFixed(2);
        document.documentElement.dataset.averageTickMs = average.toFixed(2);
        document.documentElement.dataset.indexedBuildings = String(state.indexedBuildings);
        document.documentElement.dataset.portsValidated = String(state.portsValidated);
        document.documentElement.dataset.visibleTerritoryCells = String(state.visibleTerritoryCells || 0);
        document.documentElement.dataset.visibleRoadBuildings = String(state.visibleRoadBuildings || 0);
        return true;
      } finally {
        this.__v800TickBusy = false;
      }
    };

    rebuildBuildingIndex();
    // The final redraw owner must see the already-rendered initial frame as valid.
    lastTerritoryDrawRevision = -1;
    renderer.redrawTerritories(sim, true);

    sim.__v800Performance = {
      state,
      rebuildBuildingIndex,
      invalidateKingdom,
      portDirection,
      portCell,
      get averageTickMs() {
        return state.tickSamples.length ? state.tickSamples.reduce((sum, value) => sum + value, 0) / state.tickSamples.length : 0;
      }
    };
    state.installed = true;
    document.documentElement.dataset.performanceKernel = VERSION;
    document.documentElement.dataset.completeRelease = '8.0.3-mobile';
    document.title = 'Kingdom War';
  }

  async function boot() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (sim?.r?.app?.ticker && window.__V713_LIVE_POWER?.installed && window.__V711_BUILDING_SCALE_LOCK?.installed) break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Simulation unavailable for performance kernel');
    install(sim);
  }

  boot().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v800-performance-kernel]', error);
  });
})();
