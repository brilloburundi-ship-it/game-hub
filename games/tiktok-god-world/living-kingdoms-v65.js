(() => {
  'use strict';

  const VERSION = '6.5-grounded-kingdoms';
  const HOUSE_TYPES = new Set(['house_a', 'house_b', 'house_c']);
  const BUILD_ANCHOR = {
    castle: 1, keep: 1, gate: 1, wall: 1, wall_corner: 1,
    stone_tower: 1, watchtower: 1, house_a: 1, house_b: 1, house_c: 1,
    barracks: 1, forge: 1, stable: 1, farm: 1, windmill: 1,
    silo: 1, church: 1, market: 1, warehouse: 1
  };

  const GIFT_TIERS = [
    {
      min: 80,
      max: 199,
      label: 'INSTANT HELP',
      icon: '✨',
      land: 3,
      builds: ['house', 'farm'],
      citizens: 3,
      military: 12,
      resources: { food: 280, wood: 240, stone: 150, gold: 130 },
      boost: 65
    },
    {
      min: 200,
      max: 499,
      label: 'BIG HELP',
      icon: '⚡',
      land: 7,
      builds: ['house', 'house', 'farm', 'market'],
      citizens: 6,
      military: 32,
      resources: { food: 720, wood: 620, stone: 430, gold: 410 },
      boost: 110
    },
    {
      min: 500,
      max: 999,
      label: 'MEGA HELP',
      icon: '👑',
      land: 13,
      builds: ['house', 'house', 'house', 'farm', 'farm', 'barracks', 'forge'],
      citizens: 10,
      military: 75,
      resources: { food: 1650, wood: 1450, stone: 980, gold: 1050 },
      boost: 180
    }
  ];

  const NAMED_TIER = [
    [/swan|concert|meteor|helicopter|race car|celebration|diamond tree/i, 1],
    [/private jet|yacht|whale diving|sports car|train|money gun|motorcycle/i, 2],
    [/creator portal|tiktok stars|planet|rocket|supercar/i, 3]
  ];

  const ORIGINAL_LEGENDARY = /galaxy|lion|universe|dragon|castle fantasy|interstellar|phoenix/i;

  function toast(message) {
    const host = document.querySelector('#toast');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3300);
  }

  function housingCapacity(k) {
    if (!k?.buildings) return 0;
    let capacity = 0;
    for (const b of k.buildings) {
      if (b.type === 'castle') capacity += 4;
      else if (b.type === 'keep') capacity += 6;
      else if (HOUSE_TYPES.has(b.type)) capacity += 4;
    }
    return Math.max(4, capacity);
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
    if (typeof renderer.kingdomScreenPosition === 'function') return renderer.kingdomScreenPosition(k);
    return null;
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
    sim.updateSelected();
  }

  function groundBuilding(b, renderer) {
    if (!b) return;
    const sprite = b._sprite;
    if (sprite) {
      if (sprite.anchor?.set) sprite.anchor.set(0.5, BUILD_ANCHOR[b.type] ?? 1);
      else if (sprite.anchor) sprite.anchor.y = BUILD_ANCHOR[b.type] ?? 1;
      sprite.y = Math.round(b.sy + (b.type === 'farm' ? 1 : 2));
      sprite.roundPixels = true;
    }
    if (b._foundation) {
      b._foundation.y = Math.round(b.sy + 1);
      b._foundation.alpha = 0.96;
      b._foundation.scale.y = 0.88;
    }
    if (b._shadow) {
      b._shadow.y = Math.round(b.sy + 2);
      b._shadow.alpha = 0.70;
      b._shadow.scale.y = 0.58;
      b._shadow.scale.x = 0.94;
    }

    if (Array.isArray(renderer?.entities)) {
      const entity = renderer.entities.find(e => e?.b === b);
      if (entity) entity.y = Math.round(b.sy + 2);
    }
  }

  async function staffUnassignedFarms(sim, k) {
    if (!k?.alive || typeof sim.spawnFarmWorker !== 'function') return;
    const farms = k.buildings.filter(b => b.type === 'farm');
    for (const farm of farms) {
      if (k.farmers.some(f => f.fixedBuilding === farm.id)) continue;
      const roaming = k.farmers.some(f => !f.fixedBuilding);
      if (!roaming) break;
      await sim.spawnFarmWorker(k, farm);
    }
  }

  function tierForGift(giftName, diamondsTotal) {
    if (ORIGINAL_LEGENDARY.test(giftName)) return null;
    for (const [pattern, tierIndex] of NAMED_TIER) {
      if (pattern.test(giftName)) return GIFT_TIERS[tierIndex - 1];
    }
    return GIFT_TIERS.find(t => diamondsTotal >= t.min && diamondsTotal <= t.max) || null;
  }

  async function applyInstantHelp(sim, k, tier, repeat, name) {
    if (!tier || !k?.alive) return;
    const n = Math.max(1, Math.min(3, Number(repeat) || 1));
    for (const [resource, amount] of Object.entries(tier.resources)) {
      k.resources[resource] += amount * n;
    }
    k.military += tier.military * n;
    k.boostUntil = Math.max(k.boostUntil, sim.age + tier.boost);
    sim.claimGiftLand?.(k, tier.land * n);
    for (let i = 0; i < n; i++) {
      await sim.instantGiftBuild?.(k, tier.builds);
    }
    k.popCap = housingCapacity(k);
    await sim.giftPopulation?.(k, tier.citizens * n);
    await staffUnassignedFarms(sim, k);
    sim.r?.supportFx?.(k, tier.icon, Math.min(22, 7 + tier.land));
    toast(`${name}: ${tier.label} — instant kingdom development`);
    sim.updateSelected?.();
  }

  function wireExtraTestButtons(sim) {
    const gifts = {
      money: 'Money Gun',
      jet: 'Private Jet',
      swan: 'Swan',
      concert: 'Concert',
      meteor: 'Meteor Shower'
    };
    for (const [action, giftName] of Object.entries(gifts)) {
      const button = document.querySelector(`[data-test="${action}"]`);
      if (!button || button.dataset.v65Bound) continue;
      button.dataset.v65Bound = '1';
      button.addEventListener('click', async event => {
        event.stopImmediatePropagation();
        const name = document.querySelector('#testName')?.value.trim() || 'Player';
        const syntheticDiamonds = action === 'swan' ? 100 : action === 'concert' ? 260 : action === 'meteor' ? 560 : 0;
        await sim.gift(name, giftName, 1, { diamonds: syntheticDiamonds });
      }, true);
    }
  }

  function install(sim) {
    if (!sim || sim.__v65Installed) return;
    sim.__v65Installed = true;
    window.__BUILD_VERSION = VERSION;

    const renderer = sim.r;
    if (renderer) {
      renderer.isKingdomDetailVisible = k => detailVisible(renderer, k);
      renderer.syncKingdomDetail = () => syncDetail(renderer, sim);

      const originalHome = typeof renderer.home === 'function' ? renderer.home.bind(renderer) : null;
      if (originalHome) {
        renderer.home = (...args) => {
          const result = originalHome(...args);
          requestAnimationFrame(() => renderer.syncKingdomDetail());
          return result;
        };
      }
      const originalFocus = typeof renderer.focusCell === 'function' ? renderer.focusCell.bind(renderer) : null;
      if (originalFocus) {
        renderer.focusCell = (...args) => {
          const result = originalFocus(...args);
          requestAnimationFrame(() => renderer.syncKingdomDetail());
          return result;
        };
      }
    }

    const originalAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = async function (...args) {
      const b = await originalAddBuilding(...args);
      if (b) {
        groundBuilding(b, this.r);
        const k = args[0];
        if (k) k.popCap = housingCapacity(k);
      }
      return b;
    };

    sim.giftPopulation = async function (k, amount) {
      k.popCap = housingCapacity(k);
      k.pop = Math.min(k.popCap, k.pop + Math.max(0, amount | 0));
      await this.syncCitizens(k);
      await staffUnassignedFarms(this, k);
    };

    sim.population = async function (k) {
      const capacity = housingCapacity(k);
      k.popCap = capacity;
      if (k.pop > capacity) {
        k.pop = capacity;
        await this.syncCitizens(k);
      }
      if (this.age - k.lastPop < 5 || k.pop >= capacity || k.resources.food < 45) {
        await staffUnassignedFarms(this, k);
        return;
      }
      k.lastPop = this.age;
      k.resources.food -= 32;
      k.pop++;
      await this.syncCitizens(k);
      await staffUnassignedFarms(this, k);
    };

    sim.follow = function (name) {
      const k = this.kingdomByName.get(String(name).toLowerCase());
      if (!k?.alive || k.followed) return;
      k.followed = true;
      k.resources.wood += 85;
      k.resources.stone += 35;
      k.resources.gold += 20;
      k.boostUntil = this.age + 30;
      toast(`🔨 ${name}: construction boom`);
      this.r.supportFx(k, '🔨', 4);
      this.updateSelected();
    };

    const originalGift = sim.gift.bind(sim);
    sim.gift = async function (name, gift, repeat = 1, meta = {}) {
      const result = await originalGift(name, gift, repeat, meta);
      const k = this.kingdomByName.get(String(name).toLowerCase());
      if (!k?.alive) return result;
      const giftName = String(gift || 'gift');
      const diamonds = Math.max(0, Number(meta.diamonds || meta.diamondCount || 0));
      const total = diamonds * Math.max(1, Number(repeat) || 1);
      const tier = tierForGift(giftName, total);
      if (tier) await applyInstantHelp(this, k, tier, repeat, name);
      k.popCap = housingCapacity(k);
      k.pop = Math.min(k.pop, k.popCap);
      await this.syncCitizens(k);
      await staffUnassignedFarms(this, k);
      return result;
    };

    for (const k of sim.kingdoms || []) {
      k.popCap = housingCapacity(k);
      k.pop = Math.min(k.pop, k.popCap);
      for (const b of k.buildings || []) groundBuilding(b, sim.r);
      sim.syncCitizens(k).then(() => staffUnassignedFarms(sim, k)).catch(() => {});
    }

    const close = document.querySelector('#closeCard');
    if (close && !close.dataset.v65Bound) {
      close.dataset.v65Bound = '1';
      close.addEventListener('click', () => document.querySelector('#kingdomCard')?.classList.add('hidden'));
    }

    wireExtraTestButtons(sim);
    renderer?.syncKingdomDetail?.();
    toast('V6.5 GROUNDED KINGDOMS loaded');
  }

  function waitForSimulation() {
    const sim = window.__SIM;
    if (sim) {
      install(sim);
      return;
    }
    setTimeout(waitForSimulation, 25);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => reg.update())
      .catch(() => {});
  }

  waitForSimulation();
})();
