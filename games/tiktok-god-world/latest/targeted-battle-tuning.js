(() => {
  'use strict';

  const VERSION = 'v713-targeted-battle-tuning-1';
  if (window.__V713_TARGETED_BATTLE_TUNING?.bootstrap) return;

  const state = window.__V713_TARGETED_BATTLE_TUNING = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    slowedCombatAnimations: false,
    frontAlignedCaptures: 0,
    immediateTerritoryRedraws: 0,
    errors: []
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function activeWarBetween(sim, winner, loser) {
    return (sim.wars || []).find(w =>
      !w.done && w.__v66?.phase === 'combat' && Array.isArray(w.front) &&
      ((w.a === winner.id && w.b === loser.id) || (w.a === loser.id && w.b === winner.id))
    ) || null;
  }

  function installAnimationTuning(sim) {
    const r = sim.r;
    if (!r || r.__v713CombatAnimationTuning || typeof r.swapAnim !== 'function') return false;
    r.__v713CombatAnimationTuning = true;
    const originalSwapAnim = r.swapAnim.bind(r);
    r.swapAnim = function(holder, key) {
      const result = originalSwapAnim(holder, key);
      const sprite = holder?._sprite;
      const role = holder?._role;
      if (!sprite || sprite.destroyed || !role) return result;
      if (key === 'attack') sprite.animationSpeed = role === 'archer' ? 0.078 : 0.098;
      else if (key === 'hurt') sprite.animationSpeed = role === 'archer' ? 0.082 : 0.102;
      else if (key !== 'death') sprite.animationSpeed = role === 'archer' ? 0.12 : 0.16;
      return result;
    };
    state.slowedCombatAnimations = true;
    return true;
  }

  function installFrontAlignment(sim) {
    if (sim.__v713FrontCaptureAlignment || typeof sim.capture !== 'function') return false;
    sim.__v713FrontCaptureAlignment = true;
    const originalCapture = sim.capture.bind(sim);
    sim.capture = function(winner, loser, x, y) {
      const war = activeWarBetween(this, winner, loser);
      if (war?.front) {
        const enemyFront = winner.id === war.a ? war.front[1] : war.front[0];
        const fx = Number(enemyFront?.[0]), fy = Number(enemyFront?.[1]);
        const valid = Number.isFinite(fx) && Number.isFinite(fy) &&
          this.getOwner?.(fx, fy) === loser.id &&
          (this.neigh?.(fx, fy) || []).some(([nx, ny]) => this.getOwner?.(nx, ny) === winner.id);
        if (valid && (fx !== x || fy !== y)) {
          x = fx;
          y = fy;
          state.frontAlignedCaptures++;
        }
      }
      const result = originalCapture(winner, loser, x, y);
      this.r?.redrawTerritories?.(this);
      state.immediateTerritoryRedraws++;
      return result;
    };
    return true;
  }

  async function install() {
    for (let i = 0; i < 2000; i++) {
      const sim = window.__SIM;
      if (sim?.r?.swapAnim && typeof sim.capture === 'function' && sim.__v661BattleStabilityInstalled) break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Simulation unavailable for targeted battle tuning');
    if (!installAnimationTuning(sim)) throw new Error('Combat animation tuning unavailable');
    if (!installFrontAlignment(sim)) throw new Error('Front alignment unavailable');
    state.installed = true;
    document.documentElement.dataset.targetedBattleTuning = VERSION;
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v713-targeted-battle-tuning]', error);
  });
})();
