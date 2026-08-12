(() => {
  'use strict';

  const VERSION = 'stable-integrated-1';
  const HOUSE_TYPES = new Set(['house_a', 'house_b', 'house_c']);
  const BUILD_ANCHOR = {
    castle: 1, keep: 1, gate: 1, wall: 1, wall_corner: 1,
    stone_tower: 1, watchtower: 1, house_a: 1, house_b: 1, house_c: 1,
    barracks: 1, forge: 1, stable: 1, farm: 1, windmill: 1,
    silo: 1, church: 1, market: 1, warehouse: 1
  };

  const pick = a => a[(Math.random() * a.length) | 0];
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

  function toast(message) {
    const host = document.querySelector('#toast');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function housingCapacity(k) {
    if (!k?.buildings) return 4;
    let capacity = 0;
    for (const b of k.buildings) {
      if (!b || b.__v66Destroyed || b.hp <= 0) continue;
      if (b.type === 'castle') capacity += 4;
      else if (b.type === 'keep') capacity += 6;
      else if (HOUSE_TYPES.has(b.type)) capacity += 4;
    }
    return Math.max(4, capacity);
  }

  async function syncHousing(sim, k, syncCitizens = true) {
    if (!k?.alive) return;
    k.popCap = housingCapacity(k);
    if (k.pop > k.popCap) k.pop = k.popCap;
    if (syncCitizens) await sim.syncCitizens(k);
  }

  function cameraScale(renderer) {
    if (renderer?.root?.scale) return Number(renderer.root.scale.x) || 0;
    return Number(renderer?.cam?.s) || 0;
  }

  function globalScale(renderer) {
    if (!renderer?.w) return 0.34;
    return Math.min(innerWidth / renderer.w.mapWidth, innerHeight / renderer.w.mapHeight) * 1.04;
  }

  function detailThreshold(renderer) {
    const base = globalScale(renderer);
    return Math.max(base * 1.32, innerWidth < 600 ? 0.70 : 0.74);
  }

  function screenPosition(renderer, k) {
    return typeof renderer?.kingdomScreenPosition === 'function' ? renderer.kingdomScreenPosition(k) : null;
  }

  function detailVisible(renderer, k) {
    if (!k?.alive || cameraScale(renderer) < detailThreshold(renderer)) return false;
    const p = screenPosition(renderer, k);
    if (!p) return false;
    const targetX = innerWidth * 0.50;
    const targetY = innerHeight * 0.48;
    return p[0] > -50 && p[0] < innerWidth + 50 && p[1] > 35 && p[1] < innerHeight + 60 &&
      Math.hypot(p[0] - targetX, p[1] - targetY) < Math.min(230, innerWidth * 0.38);
  }

  function syncDetail(renderer, sim) {
    const card = document.querySelector('#kingdomCard');
    if (!card) return;
    if (cameraScale(renderer) < detailThreshold(renderer)) {
      card.classList.add('hidden');
      return;
    }
    let nearest = null;
    let distance = Infinity;
    for (const k of sim.kingdoms || []) {
      if (!k?.alive) continue;
      const p = screenPosition(renderer, k);
      if (!p) continue;
      const d = Math.hypot(p[0] - innerWidth * 0.5, p[1] - innerHeight * 0.48);
      if (d < distance) {
        distance = d;
        nearest = k;
      }
    }
    const maxDistance = Math.min(230, innerWidth * 0.38);
    if (!nearest || distance > maxDistance) {
      card.classList.add('hidden');
      return;
    }
    if (sim.selected !== nearest) sim.selected = nearest;
    sim.updateSelected?.();
  }

  function groundBuilding(b, renderer) {
    if (!b) return;
    if (b._foundation) {
      b._foundation.visible = false;
      b._foundation.alpha = 0;
    }
    if (b._shadow) {
      b._shadow.visible = false;
      b._shadow.alpha = 0;
    }
    if (b._sprite) {
      b._sprite.anchor?.set?.(0.5, BUILD_ANCHOR[b.type] ?? 1);
      b._sprite.y = Math.round(b.sy + (b.type === 'farm' ? 0 : 1));
      b._sprite.roundPixels = true;
    }
    if (Array.isArray(renderer?.entities)) {
      const entity = renderer.entities.find(entry => entry?.b === b);
      if (entity) entity.y = Math.round(b.sy + 1);
    }
  }

  function installCleanRoads(sim, renderer) {
    if (!renderer?.settlement || typeof renderer.redrawSettlementGround !== 'function') return;
    renderer.redrawSettlementGround = function (battleSim = sim) {
      const g = this.settlement;
      if (!g) return;
      g.clear();
      for (const k of battleSim.kingdoms || []) {
        if (!k.alive) continue;
        const [cx, cy] = battleSim.iso(...k.capital);
        g.poly([cx, cy - 8, cx + 16, cy, cx, cy + 8, cx - 16, cy]).fill({ color: 0xb99a68, alpha: .42 });
        const roadNodes = [];
        const castleStart = battleSim.approachCell(k, k.buildings[0]) || k.capital;
        if (castleStart) roadNodes.push(castleStart);
        const others = k.buildings
          .filter(b => b.type !== 'castle' && !b.__v66Destroyed && b.hp > 0)
          .slice()
          .sort((a, b) => Math.hypot(a.x - k.capital[0], a.y - k.capital[1]) - Math.hypot(b.x - k.capital[0], b.y - k.capital[1]));
        for (const b of others) {
          const goal = battleSim.approachCell(k, b);
          if (!goal) continue;
          let start = castleStart || k.capital;
          let best = Infinity;
          for (const node of roadNodes) {
            const d = Math.hypot(goal[0] - node[0], goal[1] - node[1]);
            if (d < best) { best = d; start = node; }
          }
          const route = battleSim.findPath(k, start, goal, 240);
          const p0 = battleSim.iso(...(start || k.capital));
          const pts = [[p0[0], p0[1] + 3], ...route.map(c => {
            const p = battleSim.iso(...c);
            return [p[0], p[1] + 3];
          })];
          if (pts.length >= 2) {
            g.poly(pts.flat()).stroke({ color: 0x8f724f, width: 4, alpha: .28 });
            g.poly(pts.flat()).stroke({ color: 0xc6aa76, width: 1.5, alpha: .65 });
            for (const c of route) roadNodes.push(c);
            roadNodes.push(goal);
          }
          if (b.type === 'market') g.circle(b.sx, b.sy + 2, 7).fill({ color: 0xd1b679, alpha: .42 });
        }
      }
    };
    renderer.redrawSettlementGround(sim);
  }

  async function staffUnassignedFarms(sim, k) {
    if (!k?.alive || typeof sim.spawnFarmWorker !== 'function') return;
    const farms = k.buildings.filter(b => b.type === 'farm' && !b.__v66Destroyed && b.hp > 0);
    for (const farm of farms) {
      if (k.farmers.some(f => f.fixedBuilding === farm.id)) continue;
      if (!k.farmers.some(f => !f.fixedBuilding)) break;
      await sim.spawnFarmWorker(k, farm);
    }
  }

  async function buildMany(sim, k, types) {
    for (const requested of types) {
      if (!k?.alive) break;
      const type = requested === 'house' ? pick(['house_a', 'house_b', 'house_c']) : requested;
      let cell = sim.findBuildCell(k, type, false);
      if (!cell) {
        sim.claimGiftLand?.(k, 4);
        cell = sim.findBuildCell(k, type, false);
      }
      if (cell) await sim.addBuilding(k, type, cell[0], cell[1], false, true);
      await nextFrame();
    }
    await syncHousing(sim, k, false);
  }

  async function addGiftPopulation(sim, k, amount) {
    await syncHousing(sim, k, false);
    k.pop = Math.min(k.popCap, k.pop + Math.max(0, amount | 0));
    await sim.syncCitizens(k);
    await staffUnassignedFarms(sim, k);
  }

  function tierForGift(gift, diamondsTotal) {
    if (/universe|dragon|castle fantasy|interstellar|phoenix/i.test(gift) || diamondsTotal >= 1000) {
      return { label: 'LEGENDARY HELP', icon: '👑', land: 24, builds: ['house','house','house','farm','farm','barracks','forge','market','stone_tower'], citizens: 24, military: 420, resources: { food: 6000, wood: 5500, stone: 5000, gold: 8000 }, boost: 480 };
    }
    if (/lion/i.test(gift)) {
      return { label: 'ROYAL HELP', icon: '🦁', land: 15, builds: ['house','house','farm','barracks','forge','watchtower'], citizens: 14, military: 220, resources: { food: 2600, wood: 2800, stone: 2200, gold: 4200 }, boost: 300 };
    }
    if (/galaxy/i.test(gift)) {
      return { label: 'CITY BOOST', icon: '🌌', land: 8, builds: ['house','farm','barracks'], citizens: 7, military: 90, resources: { food: 1500, wood: 1200, stone: 900, gold: 1800 }, boost: 180 };
    }
    if (/meteor|rocket|planet|supercar/i.test(gift) || diamondsTotal >= 500) {
      return { label: 'MEGA HELP', icon: '☄️', land: 13, builds: ['house','house','farm','farm','barracks','forge'], citizens: 10, military: 75, resources: { food: 1650, wood: 1450, stone: 980, gold: 1050 }, boost: 180 };
    }
    if (/private jet|yacht|whale diving|sports car|train|money gun|motorcycle|concert/i.test(gift) || diamondsTotal >= 200) {
      return { label: 'BIG HELP', icon: '⚡', land: 7, builds: ['house','house','farm','market'], citizens: 6, military: 32, resources: { food: 720, wood: 620, stone: 430, gold: 410 }, boost: 110 };
    }
    if (/swan|celebration|diamond tree|helicopter|race car/i.test(gift) || diamondsTotal >= 80) {
      return { label: 'INSTANT HELP', icon: '✨', land: 3, builds: ['house','farm'], citizens: 3, military: 12, resources: { food: 280, wood: 240, stone: 150, gold: 130 }, boost: 65 };
    }
    return null;
  }

  async function applyTier(sim, k, tier, repeat, name) {
    const n = Math.max(1, Math.min(3, Number(repeat) || 1));
    for (const [resource, amount] of Object.entries(tier.resources)) k.resources[resource] += amount * n;
    k.military += tier.military * n;
    k.boostUntil = Math.max(k.boostUntil, sim.age + tier.boost);
    sim.claimGiftLand?.(k, tier.land * n);
    for (let i = 0; i < n; i++) await buildMany(sim, k, tier.builds);
    await addGiftPopulation(sim, k, tier.citizens * n);
    sim.r?.supportFx?.(k, tier.icon, Math.min(12, 4 + tier.builds.length));
    toast(`${name}: ${tier.label} — instant kingdom development`);
  }

  function installBuildability(sim) {
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

  function installEconomy(sim) {
    const originalAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = async function (...args) {
      const b = await originalAddBuilding(...args);
      if (!b) return b;
      groundBuilding(b, this.r);
      await syncHousing(this, args[0], false);
      await staffUnassignedFarms(this, args[0]);
      this.r.redrawSettlementGround?.(this);
      return b;
    };

    sim.giftPopulation = async function (k, amount) {
      await addGiftPopulation(this, k, amount);
    };

    sim.population = async function (k) {
      await syncHousing(this, k, false);
      if (k.pop > k.popCap) {
        k.pop = k.popCap;
        await this.syncCitizens(k);
      }
      if (this.age - k.lastPop >= 5 && k.pop < k.popCap && k.resources.food >= 45) {
        k.lastPop = this.age;
        k.resources.food -= 32;
        k.pop++;
        await this.syncCitizens(k);
      }
      await staffUnassignedFarms(this, k);
    };

    sim.buildAI = async function (k) {
      if (this.age - k.lastBuild < 6) return;
      await syncHousing(this, k, false);
      const count = type => k.buildings.filter(b => b.type === type && !b.__v66Destroyed && b.hp > 0).length;
      let type = null;
      let cost = null;
      if (k.popCap - k.pop < 2 && k.resources.wood > 65) {
        type = pick(['house_a', 'house_b', 'house_c']); cost = { wood: 55, stone: 8 };
      } else if (count('farm') < Math.ceil(k.pop / 9) && k.resources.wood > 55) {
        type = 'farm'; cost = { wood: 45, stone: 4 };
      } else if (count('warehouse') < Math.ceil(k.territory.size / 14) && k.resources.wood > 85 && k.resources.stone > 30) {
        type = 'warehouse'; cost = { wood: 70, stone: 24 };
      } else if (count('market') < 2 && k.pop > 12 && k.resources.wood > 95) {
        type = 'market'; cost = { wood: 80, stone: 18, gold: 15 };
      } else if (count('barracks') < 2 && k.pop > 15 && k.resources.wood > 110 && k.resources.stone > 45) {
        type = 'barracks'; cost = { wood: 90, stone: 38 };
      } else if (k.resources.wood > 120 && k.resources.stone > 55 && Math.random() < .22) {
        type = pick(['forge', 'watchtower', 'windmill', 'silo', 'church']); cost = { wood: 90, stone: 45, gold: 10 };
      }
      if (!type) return;
      for (const [resource, amount] of Object.entries(cost)) if (k.resources[resource] < amount) return;
      const cell = this.findBuildCell(k, type, false);
      if (!cell) return;
      const b = await this.addBuilding(k, type, cell[0], cell[1], false);
      if (!b) return;
      for (const [resource, amount] of Object.entries(cost)) k.resources[resource] -= amount;
      await syncHousing(this, k, false);
      if (HOUSE_TYPES.has(type) && k.pop < k.popCap) {
        k.pop++;
        await this.syncCitizens(k);
      }
      k.lastBuild = this.age;
      this.r.puff?.(...this.iso(...cell));
      await staffUnassignedFarms(this, k);
    };
  }

  function installTickGuard(sim) {
    const originalTick = sim.tick.bind(sim);
    sim.tick = async function () {
      if (this.__gwTickBusy) {
        this.__gwSkippedTicks = (this.__gwSkippedTicks || 0) + 1;
        return;
      }
      this.__gwTickBusy = true;
      try {
        return await originalTick();
      } catch (error) {
        console.error('[God World tick]', error);
      } finally {
        this.__gwTickBusy = false;
      }
    };
  }

  function installJoinQueue(sim, renderer) {
    const originalJoin = sim.join.bind(sim);
    const queue = [];
    let running = false;

    const pump = async () => {
      if (running) return;
      running = true;
      try {
        while (queue.length) {
          const item = queue.shift();
          renderer.__gwPauseGuardsUntil = performance.now() + 650;
          try {
            const k = await originalJoin(item.name);
            if (k?.alive) {
              await syncHousing(sim, k, true);
              await staffUnassignedFarms(sim, k);
              for (const b of k.buildings || []) groundBuilding(b, renderer);
            }
            item.resolve(k || null);
          } catch (error) {
            console.error('[God World JOIN]', error);
            toast('JOIN recovered — please try again');
            item.resolve(null);
          } finally {
            renderer.__gwPauseGuardsUntil = Math.max(renderer.__gwPauseGuardsUntil || 0, performance.now() + 220);
          }
          await nextFrame();
        }
      } finally {
        running = false;
      }
    };

    sim.join = function (name) {
      return new Promise(resolve => {
        queue.push({ name, resolve });
        void pump();
      });
    };
  }

  function installGifts(sim) {
    sim.follow = function (name) {
      const k = this.kingdomByName.get(String(name).toLowerCase());
      if (!k?.alive || k.followed) return;
      k.followed = true;
      k.resources.wood += 85;
      k.resources.stone += 35;
      k.resources.gold += 20;
      k.boostUntil = Math.max(k.boostUntil, this.age + 30);
      toast(`🔨 ${name}: construction boom`);
      this.r.supportFx?.(k, '🔨', 4);
      this.updateSelected?.();
    };

    const giftQueues = new Map();
    sim.gift = function (name, gift, repeat = 1, meta = {}) {
      const id = String(name).toLowerCase();
      const previous = giftQueues.get(id) || Promise.resolve();
      const task = previous.then(async () => {
        const k = this.kingdomByName.get(id);
        if (!k?.alive) return null;
        const giftName = String(gift || 'gift');
        const g = giftName.toLowerCase();
        const rawRepeat = Math.max(1, Number(repeat) || 1);
        const diamonds = Math.max(0, Number(meta.diamonds || meta.diamondCount || 0));
        const diamondsTotal = diamonds * rawRepeat;

        // Known small gifts keep their lightweight effects and never accidentally
        // become a large development tier because of a long streak.
        if (g.includes('rose')) {
          k.resources.food += 45 * rawRepeat; k.resources.gold += 12 * rawRepeat; k.boostUntil = Math.max(k.boostUntil, this.age + 20); this.r.supportFx?.(k, '🌹', Math.min(6, 2 + rawRepeat));
        } else if (g.includes('ice cream')) {
          k.resources.food += 70 * rawRepeat; await addGiftPopulation(this, k, rawRepeat); this.r.supportFx?.(k, '🍦', Math.min(6, 2 + rawRepeat));
        } else if (g.includes('coffee') || g.includes('doughnut') || g.includes('donut')) {
          k.resources.food += 120 * rawRepeat; k.resources.gold += 25 * rawRepeat; k.boostUntil = Math.max(k.boostUntil, this.age + 25); this.r.supportFx?.(k, '☕', 4);
        } else if (g.includes('paper crane') || g.includes('heart me') || g.includes('hand heart')) {
          k.resources.food += 180 * rawRepeat; k.resources.wood += 110 * rawRepeat; await addGiftPopulation(this, k, 2 * rawRepeat); k.boostUntil = Math.max(k.boostUntil, this.age + 50); this.r.supportFx?.(k, '💞', 6);
        } else if (g.includes('finger heart')) {
          k.resources.food += 90 * rawRepeat; k.resources.wood += 55 * rawRepeat; k.boostUntil = Math.max(k.boostUntil, this.age + 35); this.r.supportFx?.(k, '🫰', 5);
        } else if (g.includes('perfume')) {
          k.resources.gold += 120 * rawRepeat; k.resources.stone += 45 * rawRepeat; this.r.supportFx?.(k, '✨', 6);
        } else if (g.includes('firework')) {
          k.resources.gold += 260 * rawRepeat; k.resources.wood += 180 * rawRepeat; k.resources.stone += 120 * rawRepeat; k.boostUntil = Math.max(k.boostUntil, this.age + 55); this.r.supportFx?.(k, '🎆', 7);
        } else if (g.includes('tiktok')) {
          k.resources.gold += 180 * rawRepeat; k.resources.wood += 120 * rawRepeat; k.boostUntil = Math.max(k.boostUntil, this.age + 45); this.r.supportFx?.(k, '🎵', 7);
        } else {
          const tier = tierForGift(giftName, diamondsTotal);
          if (tier) await applyTier(this, k, tier, rawRepeat, name);
          else {
            const value = Math.max(1, diamonds || 1);
            k.resources.gold += (35 + value * .8) * rawRepeat;
            k.resources.food += (35 + value * .5) * rawRepeat;
            k.resources.wood += (25 + value * .35) * rawRepeat;
            this.r.supportFx?.(k, '🎁', 3);
          }
        }

        await syncHousing(this, k, true);
        await staffUnassignedFarms(this, k);
        this.updateSelected?.();
        return k;
      }).catch(error => {
        console.error('[God World gift]', error);
        return null;
      });
      const wrapped = task.finally(() => {
        if (giftQueues.get(id) === wrapped) giftQueues.delete(id);
      });
      giftQueues.set(id, wrapped);
      return wrapped;
    };
  }

  function replaceElement(old) {
    if (!old?.parentNode) return old;
    const fresh = old.cloneNode(true);
    old.parentNode.replaceChild(fresh, old);
    return fresh;
  }

  function wireStableTest(sim) {
    const panel = document.querySelector('#testPanel');
    if (!panel || panel.dataset.gwStableBound) return;
    panel.dataset.gwStableBound = '1';
    for (const eventName of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) {
      panel.addEventListener(eventName, event => event.stopPropagation(), { passive: true });
    }

    const toggle = replaceElement(document.querySelector('#toggleTest'));
    if (toggle) toggle.addEventListener('click', event => {
      event.stopPropagation();
      panel.classList.toggle('collapsed');
    });

    const giftMap = {
      rose: ['Rose', 1], ice: ['Ice Cream', 1], fireworks: ['Fireworks', 1],
      swan: ['Swan', 100], concert: ['Concert', 260], money: ['Money Gun', 260],
      jet: ['Private Jet', 300], meteor: ['Meteor Shower', 560], car: ['Sports Car', 260],
      galaxy: ['Galaxy', 1000], lion: ['Lion', 1500], dragon: ['Dragon', 1200], universe: ['Universe', 1500]
    };

    for (const old of [...panel.querySelectorAll('[data-test]')]) {
      const button = replaceElement(old);
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) return;
        const name = document.querySelector('#testName')?.value.trim() || 'Player';
        const action = button.dataset.test;
        button.disabled = true;
        try {
          if (action === 'join') await sim.join(name);
          else if (action === 'like') sim.like(name, 20);
          else if (action === 'follow') sim.follow(name);
          else if (action === 'boost') sim.boost30();
          else if (action === 'attack') {
            const attacker = sim.kingdomByName.get(name.toLowerCase());
            if (!attacker?.alive) toast('Create your kingdom with JOIN first');
            else {
              const target = sim.kingdoms.filter(k => k.alive && k !== attacker).sort((a, b) => sim.power(b) - sim.power(a))[0];
              if (target) sim.attack(attacker, target);
              else toast('At least two kingdoms are required');
            }
          } else if (giftMap[action]) {
            const [giftName, diamonds] = giftMap[action];
            await sim.gift(name, giftName, 1, { diamonds });
          }
        } finally {
          button.disabled = false;
        }
      });
    }
  }

  function install(sim) {
    if (!sim || sim.__gwStableLivingInstalled) return;
    sim.__gwStableLivingInstalled = true;
    window.__BUILD_VERSION = VERSION;
    document.documentElement.dataset.runtime = 'stable-integrated-single-authority';

    const renderer = sim.r;
    if (renderer) {
      renderer.isKingdomDetailVisible = k => detailVisible(renderer, k);
      renderer.syncKingdomDetail = () => syncDetail(renderer, sim);
    }

    installBuildability(sim);
    installCleanRoads(sim, renderer);
    installEconomy(sim);
    installTickGuard(sim);
    installJoinQueue(sim, renderer);
    installGifts(sim);

    for (const k of sim.kingdoms || []) {
      void syncHousing(sim, k, true).then(() => staffUnassignedFarms(sim, k)).catch(() => {});
      for (const b of k.buildings || []) groundBuilding(b, renderer);
    }

    const close = document.querySelector('#closeCard');
    if (close) close.onclick = () => document.querySelector('#kingdomCard')?.classList.add('hidden');
    wireStableTest(sim);
    renderer?.syncKingdomDetail?.();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then(reg => reg.update())
        .catch(() => {});
    }
  }

  function waitForSimulation() {
    const sim = window.__SIM;
    if (sim) install(sim);
    else setTimeout(waitForSimulation, 25);
  }

  waitForSimulation();
})();
