(() => {
  'use strict';

  const VERSION = 'v710-farmer-direction-stability-2';
  if (window.__V710_FARMER_DIRECTION?.bootstrap) return;

  const state = window.__V710_FARMER_DIRECTION = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    lookaheadCells: 4,
    oppositeFlipHoldMs: 240,
    directionChanges: 0,
    smoothMotion: false,
    antiTrain: false,
    errors: []
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const LOOKAHEAD = 4;
  const TURN_HOLD_MS = 125;
  const OPPOSITE_HOLD_MS = 240;
  const WALK_ANIMATION_SPEED = 0.11;

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

  function laneForFarmer(farmer) {
    if (Number.isFinite(farmer?.__v710Lane)) return farmer.__v710Lane;
    const text = String(farmer?.id || Math.random());
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash * 31) + text.charCodeAt(i)) | 0;
    const lane = ((Math.abs(hash) % 7) - 3) * 0.72;
    farmer.__v710Lane = lane;
    return lane;
  }

  function spreadTaskTarget(sim, k, farmer, target) {
    if (!Array.isArray(target) || farmer?.fixedBuilding) return target;
    const reserved = [];
    for (const other of k?.farmers || []) {
      if (!other || other === farmer || other.fixedBuilding) continue;
      const cell = other.taskCell || other.path?.[other.path.length - 1];
      if (Array.isArray(cell)) reserved.push(cell);
    }
    if (!reserved.length) return target;
    if (!reserved.some(cell => Math.hypot(cell[0] - target[0], cell[1] - target[1]) < 1.25)) return target;

    const candidates = (sim.ownWalkableCells?.(k) || []).filter(cell => {
      const d = Math.hypot(cell[0] - target[0], cell[1] - target[1]);
      if (d < 0.7 || d > 3.2) return false;
      return reserved.every(other => Math.hypot(cell[0] - other[0], cell[1] - other[1]) >= 1.15);
    });
    if (!candidates.length) return target;
    candidates.sort((a, b) => {
      const da = Math.hypot(a[0] - target[0], a[1] - target[1]) + Math.random() * 0.28;
      const db = Math.hypot(b[0] - target[0], b[1] - target[1]) + Math.random() * 0.28;
      return da - db;
    });
    return candidates[0];
  }

  function installAntiTrainTargets(sim) {
    if (sim.__v710AntiTrainTargets || typeof sim.chooseTaskCell !== 'function') return;
    sim.__v710AntiTrainTargets = true;
    const originalChoose = sim.chooseTaskCell.bind(sim);
    sim.chooseTaskCell = function(k, farmer) {
      return spreadTaskTarget(this, k, farmer, originalChoose(k, farmer));
    };
    state.antiTrain = true;
  }

  function smoothFarmerSprite(sim, renderer, farmer, dx, dy) {
    const sprite = farmer?._sprite;
    if (!sprite || sprite.destroyed) return;

    if (farmer.action !== 'walk' || !farmer.path?.length) {
      sprite.roundPixels = true;
      farmer.__v710DisplayX = sprite.x;
      farmer.__v710DisplayY = sprite.y;
      farmer.__v710DisplayAt = performance.now();
      return;
    }

    // Same principle used by the soldiers: update every render frame with fractional
    // coordinates. The simulation path and farmer speed are intentionally untouched.
    sprite.roundPixels = false;
    if (String(sprite._action || '').startsWith('walk')) sprite.animationSpeed = WALK_ANIMATION_SPEED;

    let vx = Number(dx) || 0, vy = Number(dy) || 0;
    if (Math.hypot(vx, vy) < 0.05 && farmer.path.length) {
      const p = sim.iso(farmer.path[0][0], farmer.path[0][1]);
      vx = p[0] - farmer.x;
      vy = p[1] + 6 - farmer.y;
    }
    const len = Math.max(0.001, Math.hypot(vx, vy));
    const lane = laneForFarmer(farmer);
    const tx = farmer.x + (-vy / len) * lane;
    const ty = farmer.y + (vx / len) * lane * 0.55;
    const now = performance.now();
    const last = Number(farmer.__v710DisplayAt || now - 16);
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    farmer.__v710DisplayAt = now;

    if (!Number.isFinite(farmer.__v710DisplayX) || !Number.isFinite(farmer.__v710DisplayY)) {
      farmer.__v710DisplayX = sprite.x;
      farmer.__v710DisplayY = sprite.y;
    }
    const alpha = 1 - Math.exp(-30 * dt);
    farmer.__v710DisplayX += (tx - farmer.__v710DisplayX) * alpha;
    farmer.__v710DisplayY += (ty - farmer.__v710DisplayY) * alpha;
    sprite.position.set(farmer.__v710DisplayX, farmer.__v710DisplayY);
    const nextZ = Math.round(farmer.__v710DisplayY * 25) * 4 + 10;
    if (sprite.zIndex !== nextZ) {
      sprite.zIndex = nextZ;
      if (renderer.__v800RequestSort) renderer.__v800RequestSort();
      else if (renderer.entities?.sortableChildren) renderer.entities.sortDirty = true;
    }
  }

  function installDirectionStability(sim) {
    const renderer = sim?.r;
    if (!renderer || renderer.__v710FarmerDirectionStability || typeof renderer.updateFarmer !== 'function') return false;
    renderer.__v710FarmerDirectionStability = true;

    installAntiTrainTargets(sim);

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
      let result;
      if (farmer?.action !== 'walk' || !farmer?.path?.length) {
        if (farmer?.action !== 'walk') clearDirection(farmer);
        result = originalUpdate(farmer, dx, dy);
      } else {
        const direction = resolveDirection(sim, farmer, dx, dy, !farmer.__v710WalkDir);
        const [stableDx, stableDy] = syntheticVector(direction);
        // Only the facing vector is stabilized; movement still uses the real simulation vector.
        result = originalUpdate(farmer, stableDx, stableDy);
      }
      smoothFarmerSprite(sim, this, farmer, dx, dy);
      return result;
    };

    state.smoothMotion = true;
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
