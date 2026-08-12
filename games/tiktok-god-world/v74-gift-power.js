(() => {
  'use strict';

  const VERSION = 'v74-gift-power-1';
  const BUFF_SECONDS = 90;
  if (window.__V74_GIFT_POWER?.installed) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isAtWar = (sim, k) => !!k?.alive && (sim.wars || []).some(w =>
    !w.done && (w.a === k.id || w.b === k.id));

  function giftProfile(giftName, repeat, meta) {
    const g = String(giftName || '').toLowerCase();
    const n = Math.max(1, Number(repeat) || 1);
    const diamonds = Math.max(0, Number(meta?.diamonds || meta?.diamondCount || 0));
    let power = clamp(Math.round(2 + Math.sqrt(Math.max(1, diamonds * n)) * 1.5), 2, 90);
    let strength = 0.06;

    if (/rose|ice cream|coffee|doughnut|donut|finger heart/.test(g)) { power = 4 * n; strength = 0.07; }
    if (/firework|perfume|paper crane|heart me|hand heart|tiktok/.test(g)) { power = 12 * n; strength = 0.11; }
    if (/money gun|train|motorcycle|swan|concert|meteor/.test(g)) { power = 26 * n; strength = 0.16; }
    if (/sports car|yacht|private jet|whale diving/.test(g)) { power = 44 * n; strength = 0.21; }
    if (/galaxy/.test(g)) { power = 85 * n; strength = 0.28; }
    if (/lion/.test(g)) { power = 150 * n; strength = 0.36; }
    if (/universe|dragon|castle fantasy|interstellar|phoenix/.test(g) || diamonds * n >= 1000) {
      power = 260 * n; strength = 0.46;
    }
    return { power, strength };
  }

  function baseHp(unit) {
    return unit?.role === 'archer' ? 38 : (unit?.role === 'spear' ? 54 : 48);
  }

  function applyStrengthToGuards(renderer, kingdom, strength) {
    const guards = renderer.__v66Guards?.get?.(kingdom.id) || [];
    for (const unit of guards) {
      if (!unit || unit.dead) continue;
      const previous = Number(unit.__v74StrengthApplied || 0);
      if (strength <= previous + 0.001) continue;
      const delta = strength - previous;
      const current = Number.isFinite(unit.__v661Hp) ? unit.__v661Hp : baseHp(unit);
      unit.__v661Hp = current + baseHp(unit) * delta * 0.85;
      unit.__v74StrengthApplied = strength;
    }
  }

  async function install() {
    for (let i = 0; i < 2200; i++) {
      const sim = window.__SIM;
      if (sim?.r && typeof sim.gift === 'function' && window.__V71_SURGICAL_FIXES?.installed) break;
      await sleep(20);
    }

    const sim = window.__SIM;
    const renderer = sim?.r;
    if (!sim || !renderer || typeof sim.gift !== 'function') return;

    const previousGift = sim.gift.bind(sim);
    sim.gift = async function(name, giftName, repeat = 1, meta = {}) {
      const key = String(name).toLowerCase();
      const kingdom = this.kingdomByName?.get(key);
      const warNow = kingdom?.alive && isAtWar(this, kingdom);
      const result = await previousGift(name, giftName, repeat, meta);
      if (!kingdom?.alive) return result;

      const profile = giftProfile(giftName, repeat, meta);
      // During war V7.1 already converts the gift to military support, so only a
      // smaller additional power increment is added here. In peace the original
      // fast-build/resource effect remains intact and power is added on top.
      const powerBonus = warNow ? Math.max(2, Math.round(profile.power * 0.30)) : profile.power;
      kingdom.military = Math.max(0, Number(kingdom.military || 0)) + powerBonus;
      kingdom.__v74TroopStrength = Math.max(Number(kingdom.__v74TroopStrength || 0), profile.strength);
      kingdom.__v74TroopStrengthUntil = Math.max(Number(kingdom.__v74TroopStrengthUntil || 0), this.age + BUFF_SECONDS);
      applyStrengthToGuards(renderer, kingdom, kingdom.__v74TroopStrength);

      // The existing living-battle population already grows with military power.
      // Wake its reinforcement scheduler so the extra soldiers appear naturally.
      renderer.__v66NextSpawn?.set?.(kingdom.id, 0);
      renderer.supportFx?.(kingdom, '⚔️', clamp(Math.round(3 + powerBonus / 35), 3, 10));
      this.updateSelected?.();
      return result;
    };

    // Once per second is enough to give newly spawned reinforcements the active
    // gift-strength bonus; this deliberately avoids another render-frame ticker.
    const timer = setInterval(() => {
      if (!window.__SIM || document.hidden) return;
      for (const kingdom of sim.kingdoms || []) {
        if (!kingdom?.alive) continue;
        if (Number(kingdom.__v74TroopStrengthUntil || 0) <= Number(sim.age || 0)) {
          kingdom.__v74TroopStrength = 0;
          continue;
        }
        applyStrengthToGuards(renderer, kingdom, Number(kingdom.__v74TroopStrength || 0));
      }
    }, 1000);

    window.__V74_GIFT_POWER = {
      installed: true,
      version: VERSION,
      giftKeepsFastBuildInPeace: true,
      giftAddsMilitaryPower: true,
      giftStrengthensTroops: true,
      militaryPowerFeedsExistingReinforcements: true,
      buffSeconds: BUFF_SECONDS,
      timer
    };
    document.documentElement.dataset.giftPower = VERSION;
  }

  install().catch(error => {
    window.__V74_GIFT_POWER_ERROR = String(error?.stack || error?.message || error);
    console.error('[v74-gift-power]', error);
  });
})();
