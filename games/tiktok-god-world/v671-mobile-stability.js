(() => {
  'use strict';

  const VERSION = '6.7.1-mobile-stability';
  const SORT_INTERVAL = 0.14;
  const VISUAL_SMOOTH = 24;
  const SNAP_DISTANCE = 55;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function installBuildability(sim) {
    if (sim.__v671BuildabilityInstalled) return;
    sim.__v671BuildabilityInstalled = true;
    sim.isBuildableCell = function (x, y, type = 'house_a') {
      if (!this.land(x, y) || this.isRiver(x, y)) return false;
      const biome = this.biome(x, y);
      if (!['grass', 'forest', 'desert'].includes(biome)) return false;
      if (type === 'farm' && biome !== 'grass') return false;
      const minCoast = type === 'castle' ? 4 : 2;
      if (this.coastDistance(x, y) < minCoast) return false;
      return this.neigh(x, y).length >= 3;
    };
  }

  function installTickLock(sim) {
    if (sim.__v671TickLockInstalled) return;
    sim.__v671TickLockInstalled = true;
    const oldTick = sim.tick.bind(sim);
    sim.tick = async function () {
      if (this.__v671TickBusy) {
        this.__v671SkippedTicks = (this.__v671SkippedTicks || 0) + 1;
        return;
      }
      this.__v671TickBusy = true;
      try {
        return await oldTick();
      } catch (err) {
        console.error('[V6.7.1 tick]', err);
      } finally {
        this.__v671TickBusy = false;
      }
    };
  }

  function disableLegacyFireVfx(r) {
    if (r.__v671LegacyFireDisabled) return;
    r.__v671LegacyFireDisabled = true;
    for (const [, fx] of r.__v66Fires || []) {
      try { if (fx?.c && !fx.c.destroyed) fx.c.destroy({ children: true }); } catch (_) {}
    }
    class DisabledLegacyFireMap extends Map {
      get size() { return 12; }
    }
    r.__v66Fires = new DisabledLegacyFireMap();

    if (Array.isArray(r.__v66BloodPool) && r.__v66BloodPool.length > 5) {
      const extras = r.__v66BloodPool.splice(5);
      for (const c of extras) {
        try { if (c && !c.destroyed) c.destroy({ children: true }); } catch (_) {}
      }
    }
  }

  function guards(r) {
    const out = [];
    for (const [, arr] of r.__v66Guards || []) for (const u of arr || []) if (u?.s && !u.s.destroyed) out.push(u);
    return out;
  }

  function prepareVisualState(r) {
    for (const u of guards(r)) {
      if (!u.__v671Visual) {
        u.__v671Visual = {
          x: Number.isFinite(u.s.x) ? u.s.x : u.x,
          y: Number.isFinite(u.s.y) ? u.s.y : u.y
        };
      }
    }
  }

  function smoothGuardSprites(r, dt) {
    const alpha = 1 - Math.exp(-VISUAL_SMOOTH * clamp(dt, 0.001, 0.05));
    for (const u of guards(r)) {
      const state = u.__v671Visual || (u.__v671Visual = { x: u.x, y: u.y });
      const tx = Number.isFinite(u.x) ? u.x : u.s.x;
      const ty = Number.isFinite(u.y) ? u.y : u.s.y;
      const d = Math.hypot(tx - state.x, ty - state.y);
      if (d > SNAP_DISTANCE || u.deadAge > 0.1) {
        state.x = tx; state.y = ty;
      } else {
        state.x += (tx - state.x) * alpha;
        state.y += (ty - state.y) * alpha;
      }
      u.s.position.set(state.x, state.y);
      u.s.zIndex = Math.round(state.y * 100) + 16;
      if (u.s._sprite && !u.dead) {
        u.s._sprite.tint = 0xffffff;
        const key = u.s._animKey || u.animKey;
        if (key === 'walk') u.s._sprite.animationSpeed = u.role === 'sword' ? 0.19 : (u.role === 'spear' ? 0.18 : 0.16);
      }
    }
  }

  function installRendererStability(sim, r) {
    if (r.__v671RendererInstalled) return;
    r.__v671RendererInstalled = true;
    const oldUpdateWars = r.updateWars.bind(r);
    r.updateWars = function (battleSim, rawDt) {
      const dt = clamp(Number(rawDt) || 0.016, 0.001, 0.05);
      prepareVisualState(this);
      oldUpdateWars(battleSim, dt);
      smoothGuardSprites(this, dt);

      this.__v671SortClock = (this.__v671SortClock || 0) + dt;
      if (this.entities) {
        if (this.__v671SortClock >= SORT_INTERVAL) {
          this.__v671SortClock = 0;
          this.entities.sortDirty = true;
        } else {
          // v6.7 forced a full depth sort every render frame. On iPhone, once
          // villages and vegetation grew, that could stall the game after minutes.
          this.entities.sortDirty = false;
        }
      }
    };
  }

  function install(sim) {
    if (!sim || sim.__v671MobileStabilityInstalled) return;
    const r = sim.r;
    if (!r?.__v66Guards || !sim.__v67SiegeLegionsInstalled) {
      setTimeout(() => install(sim), 40);
      return;
    }
    sim.__v671MobileStabilityInstalled = true;
    window.__BUILD_VERSION = VERSION;
    document.documentElement.dataset.battleSystem = 'living-v671-mobile-stable';
    const tag = document.querySelector('.build-tag');
    if (tag) tag.textContent = 'V6.7.1 MOBILE STABLE';

    installBuildability(sim);
    installTickLock(sim);
    disableLegacyFireVfx(r);
    installRendererStability(sim, r);

    document.documentElement.dataset.mobileStability = 'tick-lock+guard-smoothing+sparse-trees+sort-throttle';
  }

  function wait() {
    const sim = window.__SIM;
    if (!sim || !sim.__v67SiegeLegionsInstalled || !sim.r?.__v66Guards) {
      setTimeout(wait, 35);
      return;
    }
    install(sim);
  }

  wait();
})();
