(() => {
  'use strict';

  const VERSION = '20260814-auto-war-performance-1';
  const WAR_GUARD_CAP = 8;
  const PEACE_GUARD_CAP = 6;
  const FIRST_WAR_AGE = 45;
  const WAR_COOLDOWN_MIN_MS = 24000;
  const WAR_COOLDOWN_MAX_MS = 36000;
  const CAMERA_TARGET_HZ = 12;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  if (window.__KW2_AUTO_WAR_PERF?.installed) return;

  function activeWars(sim) {
    return (sim.wars || []).filter(war => war && !war.done);
  }

  function atWar(sim, kingdomId) {
    return activeWars(sim).some(war => war.a === kingdomId || war.b === kingdomId);
  }

  function pairKey(a, b) {
    return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
  }

  function choosePair(sim, state) {
    const alive = (sim.kingdoms || []).filter(k => k?.alive && !k.founding);
    const candidates = [];
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        if (sim.areAllied?.(a, b)) continue;
        const pa = Math.max(1, Number(sim.power?.(a)) || 1);
        const pb = Math.max(1, Number(sim.power?.(b)) || 1);
        const mismatch = Math.abs(Math.log(pa / pb));
        const distance = Math.hypot(
          Number(a.capital?.[0] || 0) - Number(b.capital?.[0] || 0),
          Number(a.capital?.[1] || 0) - Number(b.capital?.[1] || 0)
        );
        const adjacentBonus = sim.borderPair?.(a, b) ? -18 : 0;
        const repeatPenalty = state.lastPair === pairKey(a, b) ? 28 : 0;
        candidates.push({ a, b, score: distance + mismatch * 17 + repeatPenalty + adjacentBonus + Math.random() * 7 });
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.score - b.score);
    const chosen = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
    return Math.random() < 0.5 ? [chosen.a, chosen.b] : [chosen.b, chosen.a];
  }

  function installAutomaticWarPolicy(sim, state) {
    const physicalAttack = sim.attack.bind(sim);
    state.nextWarAt = performance.now() + 12000;

    // Viewer/API ATTACK is disabled. Only the automatic policy can open the gate.
    sim.attack = function(attacker, target) {
      if (!this.__kw2AutomaticWarGate) return false;
      return physicalAttack(attacker, target);
    };

    sim.warAI = function() {
      if (this.matchOver) return false;
      for (const kingdom of this.kingdoms || []) if (kingdom?.aggressive != null) kingdom.aggressive = null;

      const wars = activeWars(this);
      if (wars.length) {
        state.warWasActive = true;
        return true;
      }

      const now = performance.now();
      if (state.warWasActive) {
        state.warWasActive = false;
        state.nextWarAt = now + rand(WAR_COOLDOWN_MIN_MS, WAR_COOLDOWN_MAX_MS);
      }
      if (Number(this.age || 0) < FIRST_WAR_AGE || now < state.nextWarAt) return true;

      const pair = choosePair(this, state);
      if (!pair) {
        state.nextWarAt = now + 10000;
        return true;
      }

      const [attacker, target] = pair;
      let started = false;
      this.__kw2AutomaticWarGate = true;
      try {
        started = physicalAttack(attacker, target) === true;
      } finally {
        this.__kw2AutomaticWarGate = false;
      }

      if (started) {
        state.lastPair = pairKey(attacker, target);
        state.totalAutomaticWars++;
        state.lastAutomaticWar = { attacker: attacker.name, target: target.name, startedAt: Date.now() };
      } else {
        state.nextWarAt = now + 8000;
      }
      return true;
    };

    document.querySelectorAll('[data-test="attack"]').forEach(button => button.remove());
    try { if (window.TikTokGodWorld) delete window.TikTokGodWorld.attack; } catch (_) {}
    return true;
  }

  function destroyVisualGuard(unit) {
    if (!unit) return;
    try {
      unit.dead = true;
      unit.warId = null;
      if (unit.s && !unit.s.destroyed) unit.s.destroy({ children: true });
    } catch (_) {}
  }

  function enforceGuardCaps(sim, renderer) {
    if (!renderer.__v66Guards?.entries) return;
    for (const [kingdomId, guards] of renderer.__v66Guards.entries()) {
      if (!Array.isArray(guards)) continue;
      const cap = atWar(sim, kingdomId) ? WAR_GUARD_CAP : PEACE_GUARD_CAP;
      const live = guards.filter(unit => unit && !unit.dead && unit.s && !unit.s.destroyed);
      if (live.length <= cap) continue;
      const remove = new Set(live.slice(cap));
      for (const unit of remove) destroyVisualGuard(unit);
      for (let index = guards.length - 1; index >= 0; index--) {
        if (remove.has(guards[index])) guards.splice(index, 1);
      }
    }
  }

  function installGuardCap(sim, renderer) {
    if (renderer.__kw2AutoWarGuardCap || typeof renderer.makeSoldier !== 'function') return false;
    renderer.__kw2AutoWarGuardCap = true;
    const previousMakeSoldier = renderer.makeSoldier.bind(renderer);
    renderer.makeSoldier = function(kingdom, role) {
      const guards = this.__v66Guards?.get?.(kingdom?.id) || [];
      const cap = atWar(sim, kingdom?.id) ? WAR_GUARD_CAP : PEACE_GUARD_CAP;
      const count = guards.reduce((n, unit) => n + (unit && !unit.dead && unit.s && !unit.s.destroyed ? 1 : 0), 0);
      if (count >= cap) return null;
      return previousMakeSoldier(kingdom, role);
    };
    enforceGuardCaps(sim, renderer);
    return true;
  }

  function installBattleThrottle(sim, renderer, state) {
    if (renderer.__kw2AutoWarBattleThrottle || typeof renderer.updateWars !== 'function') return false;
    renderer.__kw2AutoWarBattleThrottle = true;
    const previousUpdateWars = renderer.updateWars.bind(renderer);
    let accumulator = 0;

    renderer.updateWars = function(battleSim, rawDt) {
      const dt = Math.max(0.001, Math.min(0.066, Number(rawDt) || 0.016));
      if (!activeWars(battleSim).length) {
        accumulator = 0;
        const result = previousUpdateWars(battleSim, dt);
        enforceGuardCaps(battleSim, this);
        return result;
      }

      const fps = Number(this.app?.ticker?.FPS) || 60;
      const hz = fps < 42 ? 15 : (fps < 52 ? 18 : 20);
      state.currentBattleHz = hz;
      document.documentElement.dataset.kw2BattleHz = String(hz);
      accumulator += dt;
      const interval = 1 / hz;
      if (accumulator + 1e-6 < interval) return;
      accumulator = Math.max(0, accumulator - interval);

      enforceGuardCaps(battleSim, this);
      const startedAt = performance.now();
      const result = previousUpdateWars(battleSim, interval);
      const elapsed = performance.now() - startedAt;
      state.lastWarUpdateMs = elapsed;
      state.maxWarUpdateMs = Math.max(state.maxWarUpdateMs, elapsed);
      state.samples.push(elapsed);
      if (state.samples.length > 60) state.samples.shift();
      state.avgWarUpdateMs = state.samples.reduce((sum, value) => sum + value, 0) / state.samples.length;
      enforceGuardCaps(battleSim, this);
      return result;
    };
    return true;
  }

  function installCameraThrottle(sim, renderer) {
    if (renderer.__kw2AutoWarCameraThrottle || typeof renderer.warCameraTarget !== 'function') return false;
    renderer.__kw2AutoWarCameraThrottle = true;
    const previousWarCameraTarget = renderer.warCameraTarget.bind(renderer);
    let nextAt = 0;
    let cached = null;
    renderer.warCameraTarget = function(director, now) {
      if (!activeWars(sim).length) {
        cached = null;
        nextAt = 0;
        return previousWarCameraTarget(director, now);
      }
      const clock = performance.now();
      if (!cached || clock >= nextAt) {
        cached = previousWarCameraTarget(director, now);
        nextAt = clock + 1000 / CAMERA_TARGET_HZ;
      }
      return cached;
    };
    return true;
  }

  async function install() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (sim?.r && window.__KW2_PHYSICAL_WAR_EXPEDITION?.installed && typeof sim.attack === 'function' && typeof sim.r.updateWars === 'function') break;
      await sleep(25);
    }

    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Kingdom War 2 runtime unavailable for automatic war performance patch');

    const state = {
      installed: true,
      version: VERSION,
      automaticWar: true,
      viewerAttack: false,
      maxConcurrentWars: 1,
      warGuardCap: WAR_GUARD_CAP,
      peaceGuardCap: PEACE_GUARD_CAP,
      adaptiveBattleHz: true,
      currentBattleHz: 20,
      cameraTargetHz: CAMERA_TARGET_HZ,
      nextWarAt: 0,
      warWasActive: false,
      lastPair: null,
      lastAutomaticWar: null,
      totalAutomaticWars: 0,
      lastWarUpdateMs: 0,
      avgWarUpdateMs: 0,
      maxWarUpdateMs: 0,
      samples: []
    };

    state.automaticWarPolicy = installAutomaticWarPolicy(sim, state);
    state.guardCapInstalled = installGuardCap(sim, sim.r);
    state.battleThrottleInstalled = installBattleThrottle(sim, sim.r, state);
    state.cameraThrottleInstalled = installCameraThrottle(sim, sim.r);
    window.__KW2_AUTO_WAR_PERF = state;

    document.documentElement.dataset.kw2WarPolicy = 'automatic-ai-no-viewer-attack';
    document.documentElement.dataset.kw2WarGuardCap = String(WAR_GUARD_CAP);
    document.documentElement.dataset.kw2MaxWars = '1';
  }

  install().catch(error => {
    window.__KW2_AUTO_WAR_PERF_ERROR = String(error?.stack || error?.message || error);
    console.error('[Kingdom War 2 automatic war performance]', error);
  });
})();
