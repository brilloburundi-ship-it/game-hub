(() => {
  'use strict';

  const VERSION = 'v710-farmer-direction-stability-1';
  if (window.__V710_FARMER_DIRECTION?.bootstrap) return;

  const state = window.__V710_FARMER_DIRECTION = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    lookaheadCells: 4,
    oppositeFlipHoldMs: 240,
    directionChanges: 0,
    errors: []
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const LOOKAHEAD = 4;
  const TURN_HOLD_MS = 125;
  const OPPOSITE_HOLD_MS = 240;

  function clearDirection(farmer) {
    if (!farmer) return;
    farmer.__v710WalkDir = '';
    farmer.__v710PendingDir = '';
    farmer.__v710PendingSince = 0;
  }

  function routeVector(sim, farmer, dx = 0, dy = 0) {
    let vx = Number(dx) || 0;
    let vy = Number(dy) || 0;
    const path = farmer?.path;
    if (!Array.isArray(path) || !path.length || typeof sim?.iso !== 'function') return [vx, vy];

    const count = Math.min(LOOKAHEAD, path.length);
    let sumX = 0, sumY = 0, weightTotal = 0;
    for (let i = 0; i < count; i++) {
      const cell = path[i];
      if (!Array.isArray(cell) || cell.length < 2) continue;
      const point = sim.iso(cell[0], cell[1]);
      const tx = point[0], ty = point[1] + 6;
      // Farther nodes receive a little more weight so a staircase route is read
      // as its true travel direction instead of left/right micro-steps.
      const weight = 1 + i * 0.55;
      sumX += (tx - farmer.x) * weight;
      sumY += (ty - farmer.y) * weight;
      weightTotal += weight;
    }
    if (weightTotal > 0) {
      const lx = sumX / weightTotal;
      const ly = sumY / weightTotal;
      vx = lx * 0.86 + vx * 0.14;
      vy = ly * 0.86 + vy * 0.14;
    }
    return [vx, vy];
  }

  function classifyDirection(vx, vy, fallback = 'down') {
    const ax = Math.abs(vx), ay = Math.abs(vy);
    if (ax < 0.08 && ay < 0.08) return fallback || 'down';

    // Isometric grid steps naturally have roughly a 2:1 horizontal-to-vertical
    // screen vector. Keep those as left/right. Routes whose staircase averages
    // toward the vertical axis use the real up/down walk sheet instead.
    if (ax > ay * 1.18) return vx < 0 ? 'left' : 'right';
    return vy < 0 ? 'up' : 'down';
  }

  function isOpposite(a, b) {
    return (a === 'left' && b === 'right') || (a === 'right' && b === 'left') ||
      (a === 'up' && b === 'down') || (a === 'down' && b === 'up');
  }

  function stableDirection(farmer, candidate, now, immediate = false) {
    const current = farmer.__v710WalkDir;
    if (!current || immediate) {
      farmer.__v710WalkDir = candidate;
      farmer.__v710PendingDir = '';
      farmer.__v710PendingSince = 0;
      return candidate;
    }
    if (candidate === current) {
      farmer.__v710PendingDir = '';
      farmer.__v710PendingSince = 0;
      return current;
    }

    if (farmer.__v710PendingDir !== candidate) {
      farmer.__v710PendingDir = candidate;
      farmer.__v710PendingSince = now;
      return current;
    }

    const hold = isOpposite(current, candidate) ? OPPOSITE_HOLD_MS : TURN_HOLD_MS;
    if (now - Number(farmer.__v710PendingSince || 0) < hold) return current;

    farmer.__v710WalkDir = candidate;
    farmer.__v710PendingDir = '';
    farmer.__v710PendingSince = 0;
    state.directionChanges++;
    return candidate;
  }

  function syntheticVector(direction) {
    if (direction === 'left') return [-1, 0];
    if (direction === 'right') return [1, 0];
    if (direction === 'up') return [0, -1];
    return [0, 1];
  }

  function resolveDirection(sim, farmer, dx = 0, dy = 0, immediate = false) {
    const [vx, vy] = routeVector(sim, farmer, dx, dy);
    const candidate = classifyDirection(vx, vy, farmer?.__v710WalkDir || 'down');
    return stableDirection(farmer, candidate, performance.now(), immediate);
  }

  function installDirectionStability(sim) {
    const renderer = sim?.r;
    if (!renderer || renderer.__v710FarmerDirectionStability || typeof renderer.updateFarmer !== 'function') return false;
    renderer.__v710FarmerDirectionStability = true;

    const originalSet = typeof renderer.setFarmerAction === 'function' ? renderer.setFarmerAction.bind(renderer) : null;
    if (originalSet) {
      renderer.setFarmerAction = function(farmer, action) {
        if (String(action) === 'walk' && farmer?.path?.length) {
          const direction = resolveDirection(sim, farmer, 0, 0, !farmer.__v710WalkDir);
          return originalSet(farmer, `walk_${direction}`);
        }
        if (String(action) !== 'walk') clearDirection(farmer);
        return originalSet(farmer, action);
      };
    }

    const originalUpdate = renderer.updateFarmer.bind(renderer);
    renderer.updateFarmer = function(farmer, dx, dy) {
      if (farmer?.action !== 'walk' || !farmer?.path?.length) {
        if (farmer?.action !== 'walk') clearDirection(farmer);
        return originalUpdate(farmer, dx, dy);
      }

      const direction = resolveDirection(sim, farmer, dx, dy, !farmer.__v710WalkDir);
      const [stableDx, stableDy] = syntheticVector(direction);
      // Only the animation-facing vector is stabilized. Farmer position, pathfinding,
      // collision, speed and simulation movement remain untouched.
      return originalUpdate(farmer, stableDx, stableDy);
    };

    state.installed = true;
    document.documentElement.dataset.farmerDirection = VERSION;
    return true;
  }

  async function install() {
    for (let i = 0; i < 1600; i++) {
      if (window.__SIM?.r?.updateFarmer && window.__V707_GAMEPLAY_POLISH?.installed) break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r?.updateFarmer) throw new Error('Farmer renderer unavailable');
    if (!installDirectionStability(sim)) throw new Error('Farmer direction stability could not be installed');
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v710-farmer-direction]', error);
  });
})();
