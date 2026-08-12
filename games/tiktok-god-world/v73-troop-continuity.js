(() => {
  'use strict';

  const VERSION = 'v73-troop-continuity-1';
  const REINFORCEMENT_SPEED = 92;
  const FRONT_CATCHUP_SPEED = 74;
  const ARRIVAL_DISTANCE = 1.2;

  if (window.__V73_TROOP_CONTINUITY?.installed) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function sideFromKey(key) {
    const i = String(key).lastIndexOf(':');
    const side = Number(String(key).slice(i + 1));
    return Number.isInteger(side) ? side : null;
  }

  function spawnPoint(sim, kingdom, index) {
    const p = sim.iso(...kingdom.capital);
    const col = index % 5;
    const row = Math.floor(index / 5) % 4;
    return [p[0] + (col - 2) * 5.5, p[1] + 8 + row * 5.5];
  }

  function smoothVisualArmy(sim, renderer, v71, dt) {
    const active = v71?.powerArmyVisuals;
    if (!(active instanceof Map) || !active.size) return;

    for (const [key, units] of active) {
      const side = sideFromKey(key);
      const kingdom = side == null ? null : sim.kingdoms?.[side];
      if (!kingdom?.alive || !Array.isArray(units)) continue;

      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        const sprite = unit?.s;
        if (!sprite || sprite.destroyed) continue;

        // V7.1 calculates the correct current formation target every frame. Preserve
        // that target, but never render a direct jump to it when the front advances.
        const targetX = Number(sprite.x);
        const targetY = Number(sprite.y);
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) continue;

        if (!Number.isFinite(unit.__v73X) || !Number.isFinite(unit.__v73Y)) {
          const [sx, sy] = spawnPoint(sim, kingdom, i);
          unit.__v73X = sx;
          unit.__v73Y = sy;
          unit.__v73SpawnedAtCapital = true;
        }

        const dx = targetX - unit.__v73X;
        const dy = targetY - unit.__v73Y;
        const distance = Math.hypot(dx, dy);
        if (distance > ARRIVAL_DISTANCE) {
          // New reinforcements travel quickly from the capital. Once near the front,
          // subsequent front changes use the lower catch-up speed so captures remain
          // visually continuous rather than looking like teleportation.
          const speed = unit.__v73SpawnedAtCapital && distance > 42 ? REINFORCEMENT_SPEED : FRONT_CATCHUP_SPEED;
          const step = Math.min(distance, speed * dt);
          unit.__v73X += dx / Math.max(distance, 0.001) * step;
          unit.__v73Y += dy / Math.max(distance, 0.001) * step;
        } else {
          unit.__v73X = targetX;
          unit.__v73Y = targetY;
          unit.__v73SpawnedAtCapital = false;
        }

        sprite.position.set(unit.__v73X, unit.__v73Y);
        sprite.zIndex = Math.round(unit.__v73Y * 100) + 15;
      }
    }

    if (renderer.entities?.sortableChildren) renderer.entities.sortDirty = true;
  }

  async function install() {
    for (let i = 0; i < 2200; i++) {
      if (window.__SIM?.r?.app?.ticker && window.__V71_SURGICAL_FIXES?.installed) break;
      await sleep(20);
    }

    const sim = window.__SIM;
    const renderer = sim?.r;
    const v71 = window.__V71_SURGICAL_FIXES;
    if (!sim || !renderer?.app?.ticker || !v71?.installed) return;

    let last = performance.now();
    renderer.app.ticker.add(function v73TroopContinuity() {
      const now = performance.now();
      const dt = clamp((now - last) / 1000, 0.001, 0.05);
      last = now;
      smoothVisualArmy(sim, renderer, v71, dt);
    });

    window.__V73_TROOP_CONTINUITY = {
      installed: true,
      version: VERSION,
      reinforcementsSpawnAtCapital: true,
      frontChangesInterpolated: true,
      directFrontTeleportsRemoved: true,
      troopCountPreserved: true
    };
    document.documentElement.dataset.troopContinuity = VERSION;
  }

  install().catch(error => {
    window.__V73_TROOP_CONTINUITY_ERROR = String(error?.stack || error?.message || error);
    console.error('[v73-troop-continuity]', error);
  });
})();
