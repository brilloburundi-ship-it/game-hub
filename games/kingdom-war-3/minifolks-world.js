(() => {
  'use strict';

  const VERSION = 'kw2-minifolks-world-1';
  const ANIMAL_SPECIES = Object.freeze(['Bear', 'Bird', 'Boar', 'Bunny', 'Deer1', 'Deer2', 'Fox', 'Wolf']);
  const VILLAGER_TYPES = Object.freeze([
    'NobleMan', 'NobleWoman', 'OldMan', 'OldWoman',
    'Princess', 'Queen', 'VillagerMan', 'VillagerWoman'
  ]);
  const CORE_OWNED_VILLAGERS = Object.freeze(['Peasant', 'Worker']);
  const CARDINAL_NEIGHBOURS = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1]]);
  const CELL_Y_OFFSET = 5;

  const previous = window.__KW2_MINIFOLKS_WORLD;
  if (typeof previous?.destroy === 'function') {
    try { previous.destroy(); } catch (_) {}
  }

  const animalSpecies = new Set();
  const villagerTypes = new Set();
  const state = {
    installed: false,
    version: VERSION,
    animalCount: 0,
    villagerCount: 0,
    animalSpecies,
    villagerTypes,
    // Short aliases make console and automated diagnostics convenient.
    species: animalSpecies,
    types: villagerTypes,
    expectedAnimalSpecies: new Set(ANIMAL_SPECIES),
    expectedVillagerTypes: new Set(VILLAGER_TYPES),
    coreOwnedVillagerTypes: new Set(CORE_OWNED_VILLAGERS),
    roaming: true,
    animalsRoaming: true,
    villagersRoaming: true,
    movement: 'deterministic-cell-roaming:idle+walk:horizontal-flip',
    movingAnimalCount: 0,
    movingVillagerCount: 0,
    movementTicks: 0,
    lastMovementAt: 0,
    horizontalFlip: true,
    idleAnimation: true,
    walkAnimation: true,
    territoryLockedVillagers: true,
    naturalAnimalPalette: true,
    naturalVillagerPalette: true,
    proceduralOverlays: 0,
    mobile: false,
    animalCap: 0,
    villagerCap: 0,
    villagerPerKingdom: 0,
    spawnShortfalls: 0,
    cleanupCount: 0,
    resetCount: 0,
    waitingFor: 'window.__SIM and Minifolks renderer API',
    errors: []
  };
  window.__KW2_MINIFOLKS_WORLD = state;

  let stopped = false;
  let manager = null;
  let supervisorTimer = 0;
  const reportedErrors = new Set();

  function recordError(context, error) {
    const message = `${context}: ${error?.message || String(error)}`;
    if (reportedErrors.has(message)) return;
    reportedErrors.add(message);
    state.errors.push(message);
    if (state.errors.length > 24) state.errors.shift();
    console.warn('[Kingdom War 2 Minifolks]', message);
  }

  function isMobileClassDevice() {
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches === true;
    const narrow = Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 900;
    const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
    const lowCpu = Number(navigator.hardwareConcurrency || 8) <= 4;
    return coarse || narrow || lowMemory || lowCpu;
  }

  function hash32(value) {
    const text = String(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= hash >>> 16;
    return hash >>> 0;
  }

  function hashCell(x, y, salt = 0) {
    let hash = Math.imul((x + 101 + salt) | 0, 374761393) ^ Math.imul((y + 211 - salt) | 0, 668265263);
    hash = Math.imul((hash ^ (hash >>> 13)) | 0, 1274126177);
    return (hash ^ (hash >>> 16)) >>> 0;
  }

  function makeRandom(seed) {
    let value = (hash32(seed) || 0x6d2b79f5) >>> 0;
    return () => {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      return (value >>> 0) / 4294967296;
    };
  }

  function cellKey(x, y) {
    return `${x},${y}`;
  }

  function pixiApiReady(sim) {
    const renderer = sim?.r;
    return !!(
      renderer?.entities?.addChild &&
      renderer?.app?.ticker &&
      renderer.__kw2MinifolksReady === true &&
      typeof renderer.getMinifolkFrames === 'function' &&
      typeof renderer.createMinifolkSprite === 'function'
    );
  }

  function createManager(sim) {
    const renderer = sim.r;
    const mobile = isMobileClassDevice();
    const animalCap = mobile ? 24 : 40;
    const villagerCap = mobile ? 48 : 80;
    const animals = [];
    const villagersByKingdom = new Map();
    let destroyed = false;
    let reconcileClock = 0;
    let diagnosticsClock = 0;

    state.mobile = mobile;
    state.animalCap = animalCap;
    state.villagerCap = villagerCap;
    state.waitingFor = '';

    function blockingVegetationAt(x, y) {
      if (sim.vegetationBlocksCell?.(x, y)) return true;
      const props = renderer.depthTreesByCell?.get?.(cellKey(x, y)) || [];
      return props.some(sprite => {
        if (!sprite || sprite.destroyed) return false;
        const category = sprite.__treeData?.category;
        return category === 'tree' || category === 'bush';
      });
    }

    function buildingAt(x, y) {
      return !!(sim.buildingBlockingCell?.(x, y) || sim.buildingAt?.(x, y));
    }

    function baseWalkable(x, y) {
      if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
      if (!sim.inBounds?.(x, y) || !sim.land?.(x, y) || sim.isRiver?.(x, y)) return false;
      const biome = sim.biome?.(x, y);
      if (biome === 'mountain' || biome === 'ice_coast' || biome === 'ocean') return false;
      if (sim.isWalkableCell && !sim.isWalkableCell(x, y)) return false;
      return !buildingAt(x, y) && !blockingVegetationAt(x, y);
    }

    function animalCellValid(x, y) {
      return baseWalkable(x, y) && sim.biome?.(x, y) === 'forest';
    }

    function villagerCellValid(kingdom, x, y) {
      return !!kingdom?.alive && !kingdom.founding && baseWalkable(x, y) && sim.getOwner?.(x, y) === kingdom.id;
    }

    function allAgents() {
      const list = [...animals];
      for (const group of villagersByKingdom.values()) list.push(...group.agents);
      return list;
    }

    function cellReserved(x, y, except = null) {
      for (const agent of allAgents()) {
        if (agent === except || agent.destroyed) continue;
        if (agent.cell[0] === x && agent.cell[1] === y) return true;
        if (agent.targetCell?.[0] === x && agent.targetCell?.[1] === y) return true;
      }
      return false;
    }

    function worldPosition(cell) {
      const position = sim.iso(cell[0], cell[1]);
      return [Math.round(position[0]), Math.round(position[1] + CELL_Y_OFFSET)];
    }

    function requestDepthSort() {
      if (typeof renderer.__v800RequestSort === 'function') renderer.__v800RequestSort();
      else if (renderer.entities?.sortableChildren) renderer.entities.sortDirty = true;
    }

    function placeAgent(agent, cell) {
      const [x, y] = worldPosition(cell);
      agent.cell = [cell[0], cell[1]];
      agent.targetCell = null;
      agent.sprite.position.set(x, y);
      agent.sprite.zIndex = Math.round(y * 100) + 12;
      agent.depthBucket = Math.round(y * 4);
      requestDepthSort();
    }

    function setFacing(agent, dx) {
      if (!dx || !agent.sprite?.scale) return;
      const magnitude = Math.abs(Number(agent.sprite.scale.x) || agent.baseScaleX || 1);
      agent.baseScaleX = magnitude;
      // Supplied sheets face right. Mirroring the original sprite is the only
      // directional treatment; no tint, overlay or generated pixel is added.
      agent.sprite.scale.x = dx < 0 ? -magnitude : magnitude;
    }

    function setAction(agent, action) {
      if (!agent?.sprite || agent.sprite.destroyed || agent.action === action) return;
      try {
        const frames = renderer.getMinifolkFrames(agent.category, agent.name, action);
        if (!Array.isArray(frames) || !frames.length) throw new Error(`no ${action} frames`);
        agent.sprite.textures = frames;
        agent.sprite.animationSpeed = action === 'walk' ? 0.14 : 0.09;
        agent.sprite.loop = true;
        agent.sprite.gotoAndPlay?.(0);
        agent.action = action;
      } catch (error) {
        recordError(`${agent.category}/${agent.name}/${action}`, error);
      }
    }

    function makeAgent(category, name, cell, seed, kingdom = null) {
      try {
        // Kingdom is deliberately not passed here. Decorative villagers and
        // wildlife retain their supplied natural palette; Peasant/Worker and
        // military ownership remain the core renderer's responsibility.
        const sprite = renderer.createMinifolkSprite(category, name, 'idle');
        if (!sprite || sprite.destroyed) throw new Error('renderer returned no sprite');
        sprite.label = `kw2-minifolk-${category}-${name}`;
        sprite.eventMode = 'none';
        sprite.roundPixels = true;
        if (sprite.anchor?.set) sprite.anchor.set(0.5, 1);
        renderer.entities.addChild(sprite);

        const random = makeRandom(seed);
        const speciesSpeed = name === 'Bird' ? 18 : name === 'Bunny' || name === 'Fox' || name === 'Wolf' ? 15 : 12;
        const agent = {
          category,
          name,
          kingdom,
          sprite,
          cell: [cell[0], cell[1]],
          targetCell: null,
          action: 'idle',
          state: 'idle',
          idleLeft: 0.45 + random() * 1.8,
          speed: category === 'animals' ? speciesSpeed + random() * 2.5 : 10.5 + random() * 2,
          random,
          baseScaleX: Math.abs(Number(sprite.scale?.x) || 1),
          depthBucket: -1,
          destroyed: false
        };
        placeAgent(agent, cell);
        sprite.__kw2Minifolk = {
          category,
          name,
          kingdomId: kingdom?.id ?? null,
          roaming: true,
          naturalPalette: true,
          proceduralOverlay: false
        };
        return agent;
      } catch (error) {
        recordError(`create ${category}/${name}`, error);
        return null;
      }
    }

    function destroyAgent(agent) {
      if (!agent || agent.destroyed) return;
      agent.destroyed = true;
      try {
        if (agent.sprite && !agent.sprite.destroyed) agent.sprite.destroy();
      } catch (error) {
        recordError(`destroy ${agent.category}/${agent.name}`, error);
      }
      state.cleanupCount++;
    }

    function spreadForestCells(targetCount) {
      const candidates = [];
      for (let y = 1; y < sim.w.gridH - 1; y++) {
        for (let x = 1; x < sim.w.gridW - 1; x++) {
          if (animalCellValid(x, y)) candidates.push([x, y]);
        }
      }
      if (!candidates.length) return [];

      candidates.sort((a, b) => hashCell(a[0], a[1], 811) - hashCell(b[0], b[1], 811));
      const chosen = [candidates.shift()];
      while (chosen.length < targetCount && candidates.length) {
        let bestIndex = 0;
        let bestScore = -Infinity;
        for (let i = 0; i < candidates.length; i++) {
          const cell = candidates[i];
          let nearest = Infinity;
          for (const used of chosen) nearest = Math.min(nearest, Math.hypot(cell[0] - used[0], cell[1] - used[1]));
          const score = nearest * 100000 + (hashCell(cell[0], cell[1], chosen.length + 977) % 100000);
          if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }
        chosen.push(candidates.splice(bestIndex, 1)[0]);
      }
      return chosen;
    }

    function spawnAnimals() {
      const cells = spreadForestCells(animalCap);
      for (let i = 0; i < cells.length && animals.length < animalCap; i++) {
        const name = ANIMAL_SPECIES[i % ANIMAL_SPECIES.length];
        const agent = makeAgent('animals', name, cells[i], `kw2:animal:${name}:${i}`);
        if (agent) animals.push(agent);
      }
      if (animals.length < Math.min(ANIMAL_SPECIES.length, animalCap)) {
        state.spawnShortfalls++;
        recordError('forest wildlife', new Error(`only ${animals.length} valid animals could be created`));
      }
    }

    function kingdomCells(kingdom, salt) {
      const cells = [];
      const territory = kingdom?.territory;
      if (territory?.size) {
        for (const token of territory) {
          const parts = String(token).split(',');
          const x = Number(parts[0]), y = Number(parts[1]);
          if (villagerCellValid(kingdom, x, y)) cells.push([x, y]);
        }
      } else {
        for (let y = 0; y < sim.w.gridH; y++) for (let x = 0; x < sim.w.gridW; x++) {
          if (villagerCellValid(kingdom, x, y)) cells.push([x, y]);
        }
      }
      cells.sort((a, b) => {
        const ah = hashCell(a[0], a[1], salt);
        const bh = hashCell(b[0], b[1], salt);
        if (ah !== bh) return ah - bh;
        const capital = kingdom.capital || [0, 0];
        return Math.hypot(a[0] - capital[0], a[1] - capital[1]) - Math.hypot(b[0] - capital[0], b[1] - capital[1]);
      });
      return cells;
    }

    function spawnVillager(group, kingdom, index) {
      const typeIndex = ((Number(kingdom.id) || 0) * 3 + index) % VILLAGER_TYPES.length;
      const name = VILLAGER_TYPES[typeIndex];
      const cells = kingdomCells(kingdom, 1201 + typeIndex * 41 + index * 7);
      const cell = cells.find(candidate => !cellReserved(candidate[0], candidate[1]));
      if (!cell) return false;
      const agent = makeAgent('villagers', name, cell, `kw2:villager:${kingdom.id}:${name}:${index}`, kingdom);
      if (!agent) return false;
      group.agents.push(agent);
      return true;
    }

    function cleanupKingdom(key, group) {
      for (const agent of group?.agents || []) destroyAgent(agent);
      villagersByKingdom.delete(key);
    }

    function reconcileVillagers() {
      const alive = (sim.kingdoms || [])
        .filter(kingdom => kingdom?.alive && !kingdom.founding)
        .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
      const aliveObjects = new Set(alive);

      for (const [key, group] of [...villagersByKingdom]) {
        if (!group.kingdom?.alive || !aliveObjects.has(group.kingdom)) cleanupKingdom(key, group);
      }

      const perKingdom = alive.length ? Math.max(2, Math.min(VILLAGER_TYPES.length, Math.floor(villagerCap / alive.length))) : 0;
      state.villagerPerKingdom = perKingdom;
      for (const kingdom of alive) {
        const key = String(kingdom.id);
        let group = villagersByKingdom.get(key);
        if (group && group.kingdom !== kingdom) {
          cleanupKingdom(key, group);
          group = null;
        }
        if (!group) {
          group = { kingdom, agents: [] };
          villagersByKingdom.set(key, group);
        }

        while (group.agents.length > perKingdom) destroyAgent(group.agents.pop());
        while (group.agents.length < perKingdom) {
          if (!spawnVillager(group, kingdom, group.agents.length)) {
            state.spawnShortfalls++;
            break;
          }
        }
      }
    }

    function validForAgent(agent, cell) {
      return agent.category === 'animals'
        ? animalCellValid(cell[0], cell[1])
        : villagerCellValid(agent.kingdom, cell[0], cell[1]);
    }

    function relocationCell(agent) {
      const cells = agent.category === 'animals'
        ? spreadForestCells(Math.min(animalCap, 16))
        : kingdomCells(agent.kingdom, 1709 + Math.floor(agent.random() * 10000));
      if (!cells.length) return null;
      const start = Math.floor(agent.random() * cells.length);
      for (let offset = 0; offset < cells.length; offset++) {
        const cell = cells[(start + offset) % cells.length];
        if (!cellReserved(cell[0], cell[1], agent)) return cell;
      }
      return null;
    }

    function chooseNeighbour(agent) {
      const start = Math.floor(agent.random() * CARDINAL_NEIGHBOURS.length);
      for (let offset = 0; offset < CARDINAL_NEIGHBOURS.length; offset++) {
        const direction = CARDINAL_NEIGHBOURS[(start + offset) % CARDINAL_NEIGHBOURS.length];
        const candidate = [agent.cell[0] + direction[0], agent.cell[1] + direction[1]];
        if (!validForAgent(agent, candidate) || cellReserved(candidate[0], candidate[1], agent)) continue;
        return candidate;
      }
      return null;
    }

    function stopWalking(agent) {
      agent.state = 'idle';
      agent.targetCell = null;
      agent.idleLeft = 0.55 + agent.random() * 2.1;
      setAction(agent, 'idle');
    }

    function updateAgent(agent, dt) {
      if (!agent || agent.destroyed || !agent.sprite || agent.sprite.destroyed) return false;
      if (!validForAgent(agent, agent.cell)) {
        const relocation = relocationCell(agent);
        if (relocation) {
          placeAgent(agent, relocation);
          stopWalking(agent);
        }
        return false;
      }

      if (agent.state !== 'walk') {
        agent.idleLeft -= dt;
        if (agent.idleLeft <= 0) {
          const target = chooseNeighbour(agent);
          if (!target) {
            agent.idleLeft = 0.4 + agent.random() * 1.2;
            return false;
          }
          agent.targetCell = target;
          agent.state = 'walk';
          setAction(agent, 'walk');
          const targetPosition = worldPosition(target);
          setFacing(agent, targetPosition[0] - agent.sprite.x);
        }
        return false;
      }

      if (!agent.targetCell || !validForAgent(agent, agent.targetCell)) {
        placeAgent(agent, agent.cell);
        stopWalking(agent);
        return false;
      }

      const [targetX, targetY] = worldPosition(agent.targetCell);
      const dx = targetX - agent.sprite.x;
      const dy = targetY - agent.sprite.y;
      const distance = Math.hypot(dx, dy);
      const step = agent.speed * dt;
      if (distance <= step || distance < 0.01) {
        placeAgent(agent, agent.targetCell);
        stopWalking(agent);
        return true;
      }

      agent.sprite.x += dx / distance * step;
      agent.sprite.y += dy / distance * step;
      setFacing(agent, dx);
      const nextDepth = Math.round(agent.sprite.y * 4);
      if (nextDepth !== agent.depthBucket) {
        agent.depthBucket = nextDepth;
        agent.sprite.zIndex = Math.round(agent.sprite.y * 100) + 12;
        requestDepthSort();
      }
      return true;
    }

    function updateDiagnostics() {
      animalSpecies.clear();
      villagerTypes.clear();
      for (const animal of animals) if (!animal.destroyed) animalSpecies.add(animal.name);
      let villagers = 0;
      for (const group of villagersByKingdom.values()) {
        for (const villager of group.agents) {
          if (villager.destroyed) continue;
          villagers++;
          villagerTypes.add(villager.name);
        }
      }
      state.animalCount = animals.reduce((count, animal) => count + (!animal.destroyed ? 1 : 0), 0);
      state.villagerCount = villagers;
      state.movingAnimalCount = animals.reduce((count, animal) => count + (animal.state === 'walk' && !animal.destroyed ? 1 : 0), 0);
      state.movingVillagerCount = [...villagersByKingdom.values()].reduce(
        (count, group) => count + group.agents.filter(agent => agent.state === 'walk' && !agent.destroyed).length,
        0
      );

      const root = document.documentElement;
      root.dataset.kw2MinifolksWorld = VERSION;
      root.dataset.minifolksWorld = state.installed ? 'installed' : 'waiting';
      root.dataset.minifolksAnimals = String(state.animalCount);
      root.dataset.minifolksVillagers = String(state.villagerCount);
      root.dataset.minifolksAnimalSpecies = [...animalSpecies].join(',');
      root.dataset.minifolksVillagerTypes = [...villagerTypes].join(',');
      root.dataset.minifolksCoreOwned = CORE_OWNED_VILLAGERS.join(',');
      root.dataset.minifolksRoaming = 'animals+villagers';
      root.dataset.minifolksMovement = String(state.movementTicks);
      root.dataset.minifolksOverlays = '0';
    }

    function tick() {
      if (destroyed) return;
      if (window.__SIM !== sim || sim.r !== renderer) {
        api.destroy(true);
        return;
      }

      const dt = Math.min(0.05, Math.max(0, Number(renderer.app.ticker.deltaMS || 16.67) / 1000));
      reconcileClock += dt;
      diagnosticsClock += dt;

      // Eliminated kingdoms lose every decorative villager on the next render
      // frame, independently of the slower population reconciliation pass.
      for (const [key, group] of [...villagersByKingdom]) {
        if (!group.kingdom?.alive) cleanupKingdom(key, group);
      }

      let moved = 0;
      for (const animal of animals) if (updateAgent(animal, dt)) moved++;
      for (const group of villagersByKingdom.values()) {
        for (const villager of group.agents) if (updateAgent(villager, dt)) moved++;
      }
      if (moved) {
        state.movementTicks += moved;
        state.lastMovementAt = performance.now();
      }

      if (reconcileClock >= 0.75) {
        reconcileClock = 0;
        reconcileVillagers();
      }
      if (diagnosticsClock >= 0.25) {
        diagnosticsClock = 0;
        updateDiagnostics();
      }
    }

    const api = {
      sim,
      renderer,
      get destroyed() { return destroyed; },
      refresh: reconcileVillagers,
      destroy(isReset = false) {
        if (destroyed) return;
        destroyed = true;
        try { renderer.app?.ticker?.remove?.(tick); } catch (_) {}
        for (const animal of animals) destroyAgent(animal);
        animals.length = 0;
        for (const [key, group] of [...villagersByKingdom]) cleanupKingdom(key, group);
        if (isReset) state.resetCount++;
        state.installed = false;
        updateDiagnostics();
      }
    };

    spawnAnimals();
    reconcileVillagers();
    renderer.app.ticker.add(tick);
    renderer.__v800RequestCull?.();
    state.installed = true;
    updateDiagnostics();
    return api;
  }

  function supervise() {
    if (stopped) return;
    const sim = window.__SIM;
    if (manager && (manager.destroyed || manager.sim !== sim || manager.renderer !== sim?.r)) {
      if (!manager.destroyed) manager.destroy(true);
      manager = null;
    }
    if (manager || !pixiApiReady(sim)) return;
    try {
      manager = createManager(sim);
    } catch (error) {
      recordError('install', error);
      state.installed = false;
    }
  }

  state.refresh = () => manager?.refresh?.();
  state.destroy = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(supervisorTimer);
    manager?.destroy?.(false);
    manager = null;
    state.installed = false;
  };

  document.documentElement.dataset.kw2MinifolksWorld = `${VERSION}:waiting`;
  document.documentElement.dataset.minifolksWorld = 'waiting';
  supervisorTimer = window.setInterval(supervise, 250);
  supervise();
})();
