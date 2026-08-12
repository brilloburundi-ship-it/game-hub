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

  function silenceLegacyLoadToast() {
    const clear = () => {
      $$('#toast .toast').forEach(el => {
        if (/V6\.4 LIVING KINGDOMS loaded/i.test(el.textContent || '')) el.remove();
      });
    };
    clear();
    setTimeout(clear, 0);
    setTimeout(clear, 120);
    setTimeout(clear, 500);
  }

  function installTestPanelHotfix() {
    const panel = $('#testPanel');
    const oldToggle = $('#toggleTest');
    if (!panel || !oldToggle || panel.dataset.v682 === '1') return;
    panel.dataset.v682 = '1';

    // Detach every legacy TEST handler instead of wrapping it. This prevents
    // the old V6.4 click path and the V6.8 runtime from both reacting to one tap.
    const toggle = oldToggle.cloneNode(true);
    oldToggle.replaceWith(toggle);

    const stop = e => e.stopPropagation();
    ['pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchend', 'click'].forEach(type => {
      panel.addEventListener(type, stop, { passive: type !== 'click' });
    });

    toggle.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      panel.classList.toggle('collapsed');
    });

    // Replace the action buttons too, removing all old onclick callbacks.
    $$('[data-test]').forEach(oldBtn => {
      const btn = oldBtn.cloneNode(true);
      oldBtn.replaceWith(btn);
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        runTestAction(btn.dataset.test, btn).catch(err => {
          console.error('[V6.8.2 TEST action]', err);
          toast('Test action recovered — simulation continues');
        });
      });
    });
  }

  let actionQueue = Promise.resolve();
  function runTestAction(act, btn) {
    actionQueue = actionQueue.then(async () => {
      const sim = window.__SIM;
      if (!sim) return;
      const name = ($('#testName')?.value || 'Player').trim() || 'Player';
      btn.disabled = true;
      try {
        if (act === 'join') await sim.join(name);
        else if (act === 'like') sim.like(name, 20);
        else if (act === 'follow') sim.follow(name);
        else if (act === 'rose') await sim.gift(name, 'Rose', 1);
        else if (act === 'ice') await sim.gift(name, 'Ice Cream', 1);
        else if (act === 'fireworks') await sim.gift(name, 'Fireworks', 1);
        else if (act === 'swan') await sim.gift(name, 'Swan', 1);
        else if (act === 'concert') await sim.gift(name, 'Concert', 1);
        else if (act === 'money') await sim.gift(name, 'Money Gun', 1);
        else if (act === 'jet') await sim.gift(name, 'Private Jet', 1);
        else if (act === 'meteor') await sim.gift(name, 'Meteor', 1);
        else if (act === 'car') await sim.gift(name, 'Sports Car', 1);
        else if (act === 'galaxy') await sim.gift(name, 'Galaxy', 1);
        else if (act === 'lion') await sim.gift(name, 'Lion', 1);
        else if (act === 'dragon') await sim.gift(name, 'Dragon', 1);
        else if (act === 'universe') await sim.gift(name, 'Universe', 1);
        else if (act === 'boost') sim.boost30?.();
        else if (act === 'attack') {
          const a = sim.kingdomByName.get(name.toLowerCase());
          if (!a) return toast('Create your kingdom with JOIN first');
          const target = sim.kingdoms.filter(k => k.alive && k !== a).sort((x, y) => sim.power(y) - sim.power(x))[0];
          if (target) sim.attack(a, target);
          else toast('At least two kingdoms are required');
        }
      } finally {
        btn.disabled = false;
      }
    });
    return actionQueue;
  }

  function installSimulationWatchdog() {
    const sim = window.__SIM;
    if (!sim || sim.__v682Watchdog) return;
    sim.__v682Watchdog = true;
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
      stalledFor = 0;
      Promise.resolve(sim.tick?.()).catch(err => console.error('[V6.8.2 watchdog]', err));
    }, 1000);
  }

  function install() {
    silenceLegacyLoadToast();
    installTestPanelHotfix();
    installSimulationWatchdog();
    const tag = document.querySelector('.build-tag');
    if (tag) tag.textContent = 'V6.8.2 SINGLE TEST';
    window.__BUILD_VERSION = '6.8.2-single-test-handler';
  }

  (function wait() {
    if (!window.__SIM || !$('#testPanel')) return setTimeout(wait, 40);
    install();
  })();
})();
