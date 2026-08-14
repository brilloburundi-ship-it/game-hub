(() => {
  'use strict';
  const VERSION = '20260814-kw3-siege-polish-1';
  const api = window.KingdomWar3;
  if (!api?.state || window.__KW3_SIEGE_POLISH) return;
  const state = api.state;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nowSec = () => performance.now() / 1000;

  function queueJoin(name) {
    const clean = String(name || 'Player').trim().slice(0, 18) || 'Player';
    if (!state.queue.some(n => n.toLowerCase() === clean.toLowerCase())) state.queue.push(clean);
    return null;
  }

  const originalJoin = api.join;
  api.join = function(name) {
    if (state.phase === 'victory') return queueJoin(name);
    return originalJoin(name);
  };

  const originalEmit = api.emit;
  api.emit = function(event = {}) {
    const type = String(event.type || event.event || '').toLowerCase();
    const comment = String(event.comment || '').trim().toLowerCase();
    const isJoin = type.includes('join') || (type === 'comment' && comment === 'join');
    if (isJoin && state.phase === 'victory') return queueJoin(event.uniqueId || event.username || event.user || event.name || 'Player');
    return originalEmit(event);
  };
  if (window.KingdomWar3Bridge) window.KingdomWar3Bridge.emit = api.emit;

  function aliveBuilding(k, type) {
    return k?.buildings?.filter(b => b.type === type && b.status === 'alive' && b.hp > 0) || [];
  }

  function finishWarRebuilds(dt) {
    if (state.phase !== 'war') return;
    for (const k of state.kingdoms || []) {
      if (!k?.alive) continue;
      for (const b of k.buildings || []) {
        if (b.status !== 'building' || !b.paid) continue;
        b.progress = clamp(Number(b.progress || 0) + dt * .52, 0, 1);
        b.hp = Math.max(Number(b.hp || 0), b.maxHp * b.progress);
        if (b.progress >= 1) { b.status = 'alive'; b.hp = Math.max(b.hp, b.maxHp * .62); }
      }
    }
  }

  function towerFire() {
    if (state.phase !== 'war') return;
    const t = nowSec();
    for (const k of state.kingdoms || []) {
      if (!k?.alive) continue;
      const enemy = state.kingdoms[k.slot === 0 ? 1 : 0];
      if (!enemy?.alive) continue;
      for (const tower of aliveBuilding(k, 'tower')) {
        tower.__kw3NextShot ||= 0;
        if (t < tower.__kw3NextShot) continue;
        let target = null, best = 245;
        for (const u of enemy.units || []) {
          if (!u?.alive || u.spawnDelay > 0) continue;
          const d = Math.hypot(u.x - tower.x, u.y - tower.y);
          if (d < best) { best = d; target = u; }
        }
        if (!target) continue;
        tower.__kw3NextShot = t + Math.max(.72, 1.28 - (k.wins || 0) * .04);
        const damage = 7 + Math.min(5, (k.wins || 0) * .7);
        target.hp -= damage;
        state.projectiles?.push?.({ x: tower.x, y: tower.y - 45, tx: target.x, ty: target.y - 10, life: .28 });
        if (target.hp <= 0) { target.alive = false; target.death = 1.2; }
      }
    }
  }

  function portIncome(dt) {
    for (const k of state.kingdoms || []) {
      if (!k?.alive || !aliveBuilding(k, 'port').length) continue;
      const streak = 1 + Math.min(.5, (k.wins || 0) * .05);
      k.resources.gold += dt * .42 * streak;
      k.resources.wood += dt * .35 * streak;
      k.resources.food += dt * .28 * streak;
    }
  }

  let last = performance.now();
  function tick(now) {
    const dt = clamp((now - last) / 1000, .001, .05); last = now;
    finishWarRebuilds(dt);
    portIncome(dt);
    towerFire();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.__KW3_SIEGE_POLISH = Object.freeze({
    installed: true,
    version: VERSION,
    liveWarReconstruction: true,
    towerDefence: true,
    portEconomy: true,
    victoryJoinQueueGuard: true
  });
})();
