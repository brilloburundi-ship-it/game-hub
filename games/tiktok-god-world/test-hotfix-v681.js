(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const toast = msg => {
    const host = $('#toast');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  };

  function installTestPanelHotfix() {
    const panel = $('#testPanel');
    const toggle = $('#toggleTest');
    if (!panel || !toggle || toggle.dataset.v681 === '1') return;
    toggle.dataset.v681 = '1';

    // Keep UI touches entirely outside the Pixi pointer system on iPhone/iPad.
    const stop = e => e.stopPropagation();
    ['pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(type => {
      panel.addEventListener(type, stop, { passive: true });
    });

    // Replace the old handler with a deterministic toggle. Using pointerup avoids
    // Safari occasionally swallowing the synthetic click after canvas gestures.
    let lastPointerToggle = 0;
    const openClose = e => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      panel.classList.toggle('collapsed');
      lastPointerToggle = performance.now();
    };
    toggle.onclick = e => {
      if (performance.now() - lastPointerToggle < 450) return;
      openClose(e);
    };
    toggle.onpointerup = openClose;

    // Test actions run in a serialized queue, but never block the UI event itself.
    let queue = Promise.resolve();
    $$('[data-test]').forEach(btn => {
      const old = btn.onclick;
      if (!old || btn.dataset.v681 === '1') return;
      btn.dataset.v681 = '1';
      btn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        const fakeEvent = { preventDefault() {}, stopPropagation() {} };
        queue = queue
          .then(() => Promise.resolve(old.call(btn, fakeEvent)))
          .catch(err => {
            console.error('[V6.8.1 TEST action]', err);
            toast('Test action recovered — game is still running');
          });
      };
    });
  }

  function installSimulationWatchdog() {
    const sim = window.__SIM;
    if (!sim || sim.__v681Watchdog) return;
    sim.__v681Watchdog = true;
    let lastAge = Number(sim.age) || 0;
    let stalledFor = 0;

    setInterval(() => {
      const nowAge = Number(sim.age) || 0;
      if (nowAge > lastAge + 0.001) {
        lastAge = nowAge;
        stalledFor = 0;
        return;
      }
      stalledFor += 1;
      if (document.hidden || stalledFor < 3 || sim.__v68TickBusy) return;

      // Recover only a genuinely stalled timer. Do not create a second normal tick loop.
      stalledFor = 0;
      Promise.resolve(sim.tick?.()).catch(err => console.error('[V6.8.1 watchdog]', err));
    }, 1000);
  }

  function install() {
    installTestPanelHotfix();
    installSimulationWatchdog();
    const tag = document.querySelector('.build-tag');
    if (tag) tag.textContent = 'V6.8.1 TEST FIX';
    window.__BUILD_VERSION = '6.8.1-test-freeze-hotfix';
  }

  (function wait() {
    if (!window.__SIM || !$('#testPanel')) return setTimeout(wait, 40);
    install();
  })();
})();
