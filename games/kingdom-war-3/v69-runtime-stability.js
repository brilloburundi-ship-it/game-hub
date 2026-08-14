(() => {
  'use strict';

  const VERSION = 'v69-war-runtime-stability-1';
  if (window.__V69_RUNTIME_STABILITY?.bootstrap) return;

  const state = window.__V69_RUNTIME_STABILITY = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    listenerErrors: 0,
    tickErrors: 0,
    battleErrors: 0,
    skippedTicks: 0,
    slowTicks: 0,
    tickerRestarts: 0,
    contextLosses: 0,
    lastError: '',
    lastErrorSource: '',
    lastWorldFrameAt: performance.now(),
    lastTickMs: 0
  };

  const report = (source, error) => {
    const message = String(error?.stack || error?.message || error || 'Unknown runtime error');
    state.lastError = message;
    state.lastErrorSource = source;
    const now = performance.now();
    state.__lastLog ||= new Map();
    const previous = state.__lastLog.get(source) || 0;
    if (now - previous > 1800) {
      state.__lastLog.set(source, now);
      console.error(`[${VERSION}] ${source}`, error);
    }
  };

  // Guard every Pixi ticker callback before the renderer is created. A single
  // callback exception must never be able to cancel Pixi's next RAF request and
  // freeze the world while the DOM/FPS counter keeps running.
  const TickerProto = window.PIXI?.Ticker?.prototype;
  if (TickerProto && !TickerProto.__v69SafeCallbacks) {
    TickerProto.__v69SafeCallbacks = true;
    const originalAdd = TickerProto.add;
    const originalAddOnce = TickerProto.addOnce;
    const originalRemove = TickerProto.remove;

    const safeWrapper = (ticker, fn, context, once = false) => {
      ticker.__v69Callbacks ||= new Map();
      const existing = ticker.__v69Callbacks.get(fn);
      if (existing) return existing;
      let failures = 0;
      const wrapped = function (...args) {
        try {
          const value = fn.apply(this, args);
          failures = 0;
          if (once) ticker.__v69Callbacks.delete(fn);
          return value;
        } catch (error) {
          failures++;
          state.listenerErrors++;
          report(`ticker:${fn.name || 'anonymous'}`, error);
          // The building grow callback is disposable. If its sprite was destroyed
          // by a siege while still growing, remove only that failed animation.
          if (fn.name === 'grow' && failures >= 1) {
            try { originalRemove.call(ticker, wrapped, context); } catch (_) {}
            ticker.__v69Callbacks.delete(fn);
          } else if (once) {
            ticker.__v69Callbacks.delete(fn);
          }
          return undefined;
        }
      };
      ticker.__v69Callbacks.set(fn, wrapped);
      return wrapped;
    };

    TickerProto.add = function (fn, context, priority) {
      if (typeof fn !== 'function') return originalAdd.call(this, fn, context, priority);
      return originalAdd.call(this, safeWrapper(this, fn, context, false), context, priority);
    };

    if (typeof originalAddOnce === 'function') {
      TickerProto.addOnce = function (fn, context, priority) {
        if (typeof fn !== 'function') return originalAddOnce.call(this, fn, context, priority);
        return originalAddOnce.call(this, safeWrapper(this, fn, context, true), context, priority);
      };
    }

    TickerProto.remove = function (fn, context) {
      const wrapped = this.__v69Callbacks?.get(fn) || fn;
      const result = originalRemove.call(this, wrapped, context);
      if (wrapped !== fn) this.__v69Callbacks.delete(fn);
      return result;
    };
  }

  async function waitForSimulation() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (sim?.r?.app?.ticker && typeof sim.tick === 'function') return sim;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return null;
  }

  function sanitizeBattleState(sim, renderer) {
    const guards = renderer.__v66Guards;
    if (guards instanceof Map) {
      for (const [kingdomId, arr] of guards) {
        const clean = [];
        for (const u of arr || []) {
          if (!u || !u.s || u.s.destroyed) continue;
          if (!Number.isFinite(u.x) || !Number.isFinite(u.y)) {
            const k = sim.kingdoms?.[kingdomId];
            const cell = k?.capital;
            if (!cell) { try { u.s.destroy({ children: true }); } catch (_) {} continue; }
            const p = sim.iso(cell[0], cell[1]);
            u.x = p[0]; u.y = p[1] + 6;
            u.targetX = NaN; u.targetY = NaN;
            u.warId = null; u.state = 'patrol';
            u.s.position.set(u.x, u.y);
          }
          if (u.warId && !(sim.wars || []).some(w => !w.done && w.id === u.warId)) {
            u.warId = null;
            u.state = 'patrol';
            u.targetGuard = null;
            u.targetBuilding = null;
          }
          clean.push(u);
        }
        if (clean.length !== (arr || []).length) guards.set(kingdomId, clean);
      }
    }

    for (const w of sim.wars || []) {
      if (w.done) continue;
      const a = sim.kingdoms?.[w.a], b = sim.kingdoms?.[w.b];
      if (!a?.alive || !b?.alive) {
        w.done = true;
        try { renderer.endWar?.(w); } catch (error) { report('end-stale-war', error); }
        continue;
      }
      const f = w.front;
      const valid = Array.isArray(f) && f.length === 2 && f.every(c => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
      if (!valid) {
        const pair = sim.borderPair?.(a, b);
        if (pair) w.front = pair;
        else {
          w.done = true;
          try { renderer.endWar?.(w); } catch (error) { report('end-invalid-war', error); }
        }
      }
    }
  }

  function installSimulationGuards(sim) {
    const renderer = sim.r;
    const ticker = renderer.app.ticker;

    if (!sim.__v69TickMutexInstalled) {
      sim.__v69TickMutexInstalled = true;
      const originalTick = sim.tick.bind(sim);
      sim.tick = async function () {
        if (this.__v69TickBusy) {
          state.skippedTicks++;
          return false;
        }
        this.__v69TickBusy = true;
        const started = performance.now();
        try {
          await originalTick();
          return true;
        } catch (error) {
          state.tickErrors++;
          report('simulation-tick', error);
          return false;
        } finally {
          state.lastTickMs = performance.now() - started;
          if (state.lastTickMs > 950) state.slowTicks++;
          this.__v69TickBusy = false;
        }
      };
    }

    const installBattleWrapper = () => {
      if (renderer.__v69BattleWrapper || typeof renderer.updateWars !== 'function' || !sim.__v661BattleStabilityInstalled) return false;
      renderer.__v69BattleWrapper = true;
      const originalUpdateWars = renderer.updateWars.bind(renderer);
      renderer.updateWars = function (battleSim, dt) {
        try {
          sanitizeBattleState(battleSim || sim, this);
          return originalUpdateWars(battleSim || sim, dt);
        } catch (error) {
          state.battleErrors++;
          report('battle-update', error);
          sanitizeBattleState(battleSim || sim, this);
          return undefined;
        }
      };
      return true;
    };

    if (!installBattleWrapper()) {
      const retry = setInterval(() => {
        if (installBattleWrapper()) clearInterval(retry);
      }, 100);
      setTimeout(() => clearInterval(retry), 30000);
    }

    ticker.add(function v69WorldHeartbeat() {
      state.lastWorldFrameAt = performance.now();
    });

    const view = renderer.app.canvas || renderer.app.view;
    if (view?.addEventListener) {
      view.addEventListener('webglcontextlost', event => {
        state.contextLosses++;
        try { event.preventDefault(); } catch (_) {}
        report('webgl-context-lost', new Error('WebGL context lost'));
      }, false);
      view.addEventListener('webglcontextrestored', () => {
        try { ticker.stop(); ticker.start(); state.tickerRestarts++; } catch (error) { report('webgl-context-restore', error); }
      }, false);
    }

    // Independent DOM timer: if Pixi ever loses its RAF request, restart only the
    // ticker. Graphics, entity counts, animation quality and simulation rules stay unchanged.
    setInterval(() => {
      if (document.hidden) return;
      const stalledFor = performance.now() - state.lastWorldFrameAt;
      if (stalledFor < 1400) return;
      try {
        ticker.stop();
        ticker.start();
        state.tickerRestarts++;
        state.lastWorldFrameAt = performance.now();
      } catch (error) {
        report('ticker-watchdog', error);
      }
    }, 700);

    window.addEventListener('unhandledrejection', event => {
      state.tickErrors++;
      report('unhandled-promise', event.reason);
    });
    window.addEventListener('error', event => {
      if (!event?.error) return;
      report('window-error', event.error);
    });

    state.installed = true;
    document.documentElement.dataset.runtimeStability = VERSION;
  }

  waitForSimulation().then(sim => {
    if (sim) installSimulationGuards(sim);
  }).catch(error => report('install', error));
})();
