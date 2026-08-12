(() => {
  'use strict';

  const VERSION = 'stable-integrated-1';
  const HOUSES = new Set(['house_a', 'house_b', 'house_c']);
  const pick = values => values[(Math.random() * values.length) | 0];
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

  function activeWar(sim, id) {
    return (sim.wars || []).find(w => !w.done && (w.a === id || w.b === id)) || null;
  }

  function housingCapacity(k) {
    let capacity = 0;
    for (const b of k?.buildings || []) {
      if (!b || b.__v66Destroyed || b.hp <= 0) continue;
      if (b.type === 'castle') capacity += 4;
      else if (b.type === 'keep') capacity += 6;
      else if (HOUSES.has(b.type)) capacity += 4;
    }
    return Math.max(4, capacity);
  }

  async function syncHousing(sim, k, citizens = false) {
    if (!k?.alive) return;
    k.popCap = housingCapacity(k);
    k.pop = Math.min(k.pop, k.popCap);
    if (citizens) await sim.syncCitizens(k);
    keepCiviliansNeutral(k);
  }

  async function staffFarms(sim, k) {
    if (!k?.alive || typeof sim.spawnFarmWorker !== 'function') return;
    for (const farm of k.buildings.filter(b => b.type === 'farm' && !b.__v66Destroyed && b.hp > 0)) {
      if (k.farmers.some(f => f.fixedBuilding === farm.id)) continue;
      if (!k.farmers.some(f => !f.fixedBuilding)) break;
      await sim.spawnFarmWorker(k, farm);
    }
    keepCiviliansNeutral(k);
  }

  function keepCiviliansNeutral(k) {
    for (const farmer of k?.farmers || []) {
      if (farmer?._sprite && !farmer._sprite.destroyed) farmer._sprite.tint = 0xffffff;
    }
  }

  function groundBuilding(b, renderer, kingdom = null) {
    if (!b) return;
    if (b._foundation) { b._foundation.visible = false; b._foundation.alpha = 0; }
    if (b._shadow) { b._shadow.visible = false; b._shadow.alpha = 0; }
    if (b._sprite) {
      if (kingdom && renderer?.getBuildingTexture) {
        const texture = renderer.getBuildingTexture(kingdom, b.type);
        if (texture?.width > 0 && texture?.height > 0) b._sprite.texture = texture;
      }
      b._sprite.visible = true;
      b._sprite.renderable = true;
      b._sprite.tint = 0xffffff;
      b._sprite.alpha = Math.max(.28, Number(b._sprite.alpha) || 0);
      b._sprite.anchor?.set?.(.5, 1);
      b._sprite.y = Math.round(b.sy + (b.type === 'farm' ? 0 : 1));
      b._sprite.zIndex = Math.round(b.sy * 100) + 20;
      b._sprite.roundPixels = true;
    }
    if (Array.isArray(renderer?.entities)) {
      const entity = renderer.entities.find(entry => entry?.b === b);
      if (entity) { entity.alpha = Math.max(.28, Number(entity.alpha) || 0); entity.y = Math.round(b.sy + 1); }
    }
  }

  function installCleanRoads(sim, renderer) {
    if (!renderer?.settlement) return;
    renderer.redrawSettlementGround = function (battleSim = sim) {
      const g = this.settlement;
      if (!g) return;
      g.clear();
      for (const k of battleSim.kingdoms || []) {
        if (!k.alive) continue;
        const [cx, cy] = battleSim.iso(...k.capital);
        g.poly([cx, cy - 8, cx + 16, cy, cx, cy + 8, cx - 16, cy]).fill({ color: 0xb99a68, alpha: .42 });
        const nodes = [];
        const castleStart = battleSim.approachCell(k, k.buildings[0]) || k.capital;
        if (castleStart) nodes.push(castleStart);
        const buildings = k.buildings
          .filter(b => b.type !== 'castle' && !b.__v66Destroyed && b.hp > 0)
          .slice().sort((a, b) => Math.hypot(a.x - k.capital[0], a.y - k.capital[1]) - Math.hypot(b.x - k.capital[0], b.y - k.capital[1]));
        for (const b of buildings) {
          const goal = battleSim.approachCell(k, b);
          if (!goal) continue;
          let start = castleStart || k.capital, best = Infinity;
          for (const node of nodes) {
            const d = Math.hypot(goal[0] - node[0], goal[1] - node[1]);
            if (d < best) { best = d; start = node; }
          }
          const route = battleSim.findPath(k, start, goal, 240);
          const p0 = battleSim.iso(...start);
          const points = [[p0[0], p0[1] + 3], ...route.map(cell => {
            const p = battleSim.iso(...cell); return [p[0], p[1] + 3];
          })];
          if (points.length >= 2) {
            g.poly(points.flat()).stroke({ color: 0x8f724f, width: 4, alpha: .28 });
            g.poly(points.flat()).stroke({ color: 0xc6aa76, width: 1.5, alpha: .65 });
            nodes.push(...route, goal);
          }
          if (b.type === 'market') g.circle(b.sx, b.sy + 2, 7).fill({ color: 0xd1b679, alpha: .42 });
        }
      }
    };
    renderer.redrawSettlementGround(sim);
  }

  function installContextCard(sim, r) {
    const globalScale = () => r?.w ? Math.min(innerWidth / r.w.mapWidth, innerHeight / r.w.mapHeight) * 1.04 : .34;
    const cameraScale = () => r?.root?.scale ? Number(r.root.scale.x) || 0 : Number(r?.cam?.s) || 0;
    const threshold = () => Math.max(globalScale() * 1.32, innerWidth < 600 ? .70 : .74);
    r.isKingdomDetailVisible = k => {
      if (!k?.alive || cameraScale() < threshold()) return false;
      const p = r.kingdomScreenPosition?.(k);
      return !!p && Math.hypot(p[0] - innerWidth * .5, p[1] - innerHeight * .48) < Math.min(230, innerWidth * .38);
    };
    r.syncKingdomDetail = () => {
      const card = document.querySelector('#kingdomCard');
      if (!card || cameraScale() < threshold()) { card?.classList.add('hidden'); return; }
      let best = null, distance = Infinity;
      for (const k of sim.kingdoms || []) {
        if (!k.alive) continue;
        const p = r.kingdomScreenPosition?.(k); if (!p) continue;
        const d = Math.hypot(p[0] - innerWidth * .5, p[1] - innerHeight * .48);
        if (d < distance) { distance = d; best = k; }
      }
      if (!best || distance > Math.min(230, innerWidth * .38)) { card.classList.add('hidden'); return; }
      sim.selected = best;
      sim.updateSelected?.();
    };
  }

  function rearBuildCell(sim, k, type, war) {
    if (!war?.front) return sim.findBuildCell(k, type, false);
    const ownFront = k.id === war.a ? war.front[0] : war.front[1];
    let best = null, score = -Infinity;
    for (const token of k.territory || []) {
      const [x, y] = token.split(',').map(Number);
      if (sim.getOwner(x, y) !== k.id || !sim.isBuildableCell(x, y, type) || sim.buildingBlockingCell(x, y) || !sim.buildingSpacingOK(k, type, x, y)) continue;
      if (k.farmers.some(f => f.cell?.[0] === x && f.cell?.[1] === y)) continue;
      const frontD = Math.hypot(x - ownFront[0], y - ownFront[1]);
      if (frontD < 4.2) continue;
      const homeD = Math.hypot(x - k.capital[0], y - k.capital[1]);
      const candidate = frontD * 1.5 - homeD * .34 + Math.random() * .8;
      if (candidate > score) { score = candidate; best = [x, y]; }
    }
    return best || sim.findBuildCell(k, type, false);
  }

  function installEconomy(sim) {
    sim.isBuildableCell = function (x, y, type = 'house_a') {
      if (!this.land(x, y) || this.isRiver(x, y)) return false;
      const biome = this.biome(x, y);
      if (!['grass', 'forest', 'desert'].includes(biome)) return false;
      if (type === 'farm' && biome !== 'grass') return false;
      if (this.coastDistance(x, y) < (type === 'castle' ? 4 : 2)) return false;
      return this.neigh(x, y).length >= 3;
    };

    const baseAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = async function (...args) {
      const b = await baseAddBuilding(...args);
      if (!b) return b;
      groundBuilding(b, this.r, args[0]);
      await syncHousing(this, args[0], false);
      await staffFarms(this, args[0]);
      this.r.redrawSettlementGround?.(this);
      return b;
    };

    sim.population = async function (k) {
      await syncHousing(this, k, false);
      if (this.age - k.lastPop >= 5 && k.pop < k.popCap && k.resources.food >= 45) {
        k.lastPop = this.age; k.resources.food -= 32; k.pop++;
        await this.syncCitizens(k);
      }
      await staffFarms(this, k);
    };

    sim.giftPopulation = async function (k, amount) {
      await syncHousing(this, k, false);
      k.pop = Math.min(k.popCap, k.pop + Math.max(0, amount | 0));
      await this.syncCitizens(k);
      await staffFarms(this, k);
    };

    sim.buildAI = async function (k) {
      if (this.age - k.lastBuild < 6) return;
      await syncHousing(this, k, false);
      const count = type => k.buildings.filter(b => b.type === type && !b.__v66Destroyed && b.hp > 0).length;
      let type = null, cost = null;
      if (k.popCap - k.pop < 2 && k.resources.wood > 65) { type = pick(['house_a','house_b','house_c']); cost = { wood: 55, stone: 8 }; }
      else if (count('farm') < Math.ceil(k.pop / 9) && k.resources.wood > 55) { type = 'farm'; cost = { wood: 45, stone: 4 }; }
      else if (count('warehouse') < Math.ceil(k.territory.size / 14) && k.resources.wood > 85 && k.resources.stone > 30) { type = 'warehouse'; cost = { wood: 70, stone: 24 }; }
      else if (count('market') < 2 && k.pop > 12 && k.resources.wood > 95) { type = 'market'; cost = { wood: 80, stone: 18, gold: 15 }; }
      else if (count('barracks') < 2 && k.pop > 15 && k.resources.wood > 110 && k.resources.stone > 45) { type = 'barracks'; cost = { wood: 90, stone: 38 }; }
      else if (k.resources.wood > 120 && k.resources.stone > 55 && Math.random() < .22) { type = pick(['forge','watchtower','windmill','silo','church']); cost = { wood: 90, stone: 45, gold: 10 }; }
      else if (activeWar(this, k.id) && this.age - k.lastBuild >= 8 && k.resources.wood >= 76 && k.resources.stone >= 24) { type = 'warehouse'; cost = { wood: 70, stone: 24 }; }
      if (!type) return;
      for (const [resource, amount] of Object.entries(cost)) if (k.resources[resource] < amount) return;
      const war = activeWar(this, k.id);
      const cell = war ? rearBuildCell(this, k, type, war) : this.findBuildCell(k, type, false);
      if (!cell) return;
      const b = await this.addBuilding(k, type, cell[0], cell[1], false);
      if (!b) return;
    for (const [resource, amount] of Object.entries(cost)) k.resources[resource] -= amount;
      await syncHousing(this, k, false);
      if (HOUSES.has(type) && k.pop < k.popCap) { k.pop++; await this.syncCitizens(k); }
      klastBuild = this.age;
      this.r.puff?.(...this.iso(...cell));
      await staffFarms(this, k);
    };

    const baseTick = sim.tick.bind(sim);
    sim.tick = async function () {
      if (this.__gwTickBusy) { this.__gwSkippedTicks = (this.__gwSkippedTicks || 0) + 1; return; }
      this.__gwTickBusy = true;
      try { return await baseTick(); }
      catch (error) { console.error('[God World tick]', error); }
      finally { this.__gwTickBusy = false; }
    };
  }

  async function buildMany(sim, k, types) {
    for (const requested of types) {
      if (!k?.alive) break;
      const type = requested === 'house' ? pick(['house_a','house_b','house_c']) : requested;
      let cell = sim.findBuildCell(k, type, false);
      if (!cell) { sim.claimGiftLand?.(k, 4); cell = sim.findBuildCell(k, type, false); }
      if (cell) await sim.addBuilding(k, type, cell[0], cell[1], false, true);
      await nextFrame();
    }
    await syncHousing(sim, k, false);
  }

  function giftTier(gift, totalDiamonds) {
    if (/universe|dragon|castle fantasy|interstellar|phoenix/i.test(gift) || totalDiamonds >= 1000) return ['LEGENDARY HELP','👑',24,['house','house','house','farm','farm','barracks','forge','market','stone_tower'],24,420,{food:6000,wood:5500,stone:5000,gold:8000},480];
    if (/lion/i.test(gift)) return ['ROYAL HELP','🦩',15,['house','house','farm','barracks','forge','watchtower'],14,220,{food:2600,wood:2800,stone:2200,gold:4200},300];
    if (/galaxy/i.test(gift)) return ['CITY BOOST','🌝',8,['house','farm','barracks'],7,90,{food:1500,wood:1200,stone:900,gold:1800},180];
    if (/meteor|rocket|planet|supercar/i.test(gift) || totalDiamonds >= 500) return ['MEGA HELP','☇️',13,['house','house','farm','farm','barracks','forge'],10,75,{food:1650,wood:1450,stone:980,gold:1050},180];
    if (/private jet|yacht|whale diving|sports car|train|money gun|motorcycle|concert/i.test(gift) || totalDiamonds >= 200) return ['BIG HELP','⚡',7,['house','house','farm','market'],6,32,{food:720,wood:620,stone:430,gold:410},110];
    if (/swan|celebration|diamond tree|helicopter|race car/i.test(gift) || totalDiamonds >= 80) return ['INSTANT HELP','✨',3,['house','farm'],3,12,{food:280,wood:240,stone:150,gold:130},65];
    return null;
  }

  async function applyTier(sim, k, tier, repeat, name) {
    const [label, icon, land, builds, citizens, military, resources, boost] = tier;
    const n = Math.max(1, Math.min(3, Number(repeat) || 1));
    for (const [resource, amount] of Object.entries(resources)) k.resources[resource] += amount * n;
    k.military += military * n;
    k.boostUntil = Math.max(k.boostUntil, sim.age + boost);
    sim.claimGiftLand?.(k, land * n);
    for (let i = 0; i < n; i++) await buildMany(sim, k, builds);
    await sim.giftPopulation(k, citizens * n);
    sim.r.supportFx?.(k, icon, Math.min(12, 4 + builds.length));
    toast(`${name}: ${label} — instant kingdom development`);
  }

  function installGifts(sim) {
    sim.follow = function (name) {
      const k = this.kingdomByName.get(String(name).toLowerCase());
      if (!k?.alive || k.followed) return;
      k.followed = true;
    k.resources.wood += 85; k.resources.stone += 35; k.resources.gold += 20;
      k.boostUntil = Math.max(k.boostUntil, this.age + 30);
      toast(`🔨 ${name}: construction boom`);
      this.r.supportFx?.(k, '🔨', 4);
      this.updateSelected?.();
    };

    const queues = new Map();
    sim.gift = function (name, gift, repeat = 1, meta = {}) {
      const id = String(name).toLowerCase();
      const previous = queues.get(id) || Promise.resolve();
      const task = previous.then(async () => {
        const k = this.kingdomByName.get(id); if (!k?.alive) return null;
        const giftName = String(gift || 'gift'), g = giftName.toLowerCase();
        const n = Math.max(1, Number(repeat) || 1), diamonds = Math.max(0, Number(meta.diamonds || meta.diamondCount || 0));
        if (g.includes('rose')) { k.resources.food += 45*n; k.resources.gold += 12*n; k.boostUntil = Math.max(k.boostUntil,this.age+20); this.r.supportFx?.(k,'🌹',Math.min(6,2+n)); }
        else if (g.includes('ice cream')) { k.resources.food += 70*n; await this.giftPopulation(k,n); this.r.supportFx?.(k,'🍬',Math.min(6,2+n)); }
        else if (g.includes('coffee') || g.includes('doughnut') || g.includes('donut')) { k.resources.food += 120*n; k.resources.gold += 25*n; k.boostUntil=Math.max(k.boostUntil,this.age+25); this.r.supportFx?.(k,'☕',4); }
        else if (g.includes('paper crane') || g.includes('heart me') || g.includes('hand heart')) { k.resources.food += 180*n; k.resources.wood += 110*n; await this.giftPopulation(k,2*n); k.boostUntil=Math.max(k.boostUntil,this.age+50); this.r.supportFx?.(k,'💾',6); }
        else if (g.includes('finger heart')) { k.resources.food += 90*n; k.resources.wood += 55*n; k.boostUntil=Math.max(k.boostUntil,this.age+35); this.r.supportFx?.(k,'🊻',5); }
        else if (g.includes('perfume')) { k.resources.gold += 120*n; k.resources.stone += 45*n; this.r.supportFx?.(k,'☨',6); }
        else if (g.includes('firework')) { k.resources.gold += 260*n; k.resources.wood += 180*n; k.resources.stone += 120*n; k.boostUntil=Math.max(k.boostUntil,this.age+55); this.r.supportFx?.(k,'🎆',7); }
        else if (g.includes('tiktok')) { k.resources.gold += 180*n; k.resources.wood += 120*n; k.boostUntil=Math.max(k.boostUntil,this.age+45); this.r.supportFx?.(k,'🎵',7); }
        else {
          const tier = giftTier(giftName, diamonds * n);
          if (tier) await applyTier(this, k, tier, n,.ame);
          else { const value=Math.max(1,diamonds||1); k.resources.gold+=(35+value*.8)*n; k.resources.food+=(35+value*.5)*n; k.resources.wood+=(25+value*.35)*n; this.r.supportFx?.(k,'🎁',3); }
        }
        await syncHousing(this, k, true);
        await staffFarms(this, k);
        this.updateSelected?.();
        return k;
      }).catch(error => { console.error('[God World gift]', error); return null; });
      const wrapped = task.finally(() => { if (queues.get(id) === wrapped) queues.delete(id); });
      queues.set(id, wrapped);
      return wrapped;
    };
  }

  async function ensureStarterVillage(sim, k) {
    if (!k?.alive || (k.buildings || []).length !== 1 || k.buildings[0]?.type !== 'castle') return;
    const starter = ['house_a', 'house_b', 'farm'];
    for (const type of starter) {
      let cell = sim.findBuildCell(k, type, true);
      if (!cell) {
        sim.claimGiftLand?.(k, 4);
        cell = sim.findBuildCell(k, type, true);
      }
      if (!cell) continue;
      const b = await sim.addBuilding(k, type, cell[0], cell[1], false, true);
      if (b) groundBuilding(b, sim.r, k);
      await nextFrame();
    }
    await syncHousing(sim, k, true);
    await staffFarms(sim, k);
    sim.r.redrawSettlementGround?.(sim);
  }

  function installJoinQueue(sim, renderer) {
    const baseJoin = sim.join.bind(sim), queue = [];
    let running = false;
    const pump = async () => {
      if (running) return;
      running = true;
      try {
        while (queue.length) {
          const item = queue.shift();
          renderer.__gwPauseGuardsUntil = performance.now() + 650;
          try {
            const k = await baseJoin(item.name);
            if (k?.alive) {
              await ensureStarterVillage(sim, k);
              await syncHousing(sim, k, true);
              await staffFarms(sim, k);
              keepCiviliansNeutral(k);
              for (const b of k.buildings || []) groundBuilding(b, renderer, k);
              requestAnimationFrame(() => {
                for (const b of k.buildings || []) groundBuilding(b, renderer, k);
                renderer.entities && (renderer.entities.sortDirty = true);
              });
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
      } finally { running = false; }
    };
    sim.join = name => new Promise(resolve => { queue.push({name,resolve}); void pump(); });
  }

  function replaceElement(old) {
    if (!old?.parentNode) return old;
    const fresh = old.cloneNode(true);
    old.parentNode.replaceChild(fresh, old);
    return fresh;
  }

  function wireTest(sim) {
    const panel = document.querySelector('#testPanel');
    if (!panel || panel.dataset.gwStableBound) return;
    panel.dataset.gwStableBound = '1';
    for (const eventName of ['pointerdown','pointerup','touchstart','touchend','click']) panel.addEventListener(eventName, e => e.stopPropagation(), { passive: true });
    const toggle = replaceElement(document.querySelector('#toggleTest'));
    toggle?.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('collapsed'); });
    const gifts = {
      rose:['Rose',1], ice:['Ice Cream',1], fireworks:['Fireworks',1], swan:['Swan',100], concert:['Concert',260], money:['Money Gun',260],
      jet:['Private Jet',300], meteor:['Meteor Shower',560], car:['Sports Car',260], galaxy:['Galaxy',1000], lion:['Lion',1500], dragon:['Dragon',1200], universe:['Universe',1500]
    };
    for (const old of [...panel.querySelectorAll('[data-test]')]) {
      const button = replaceElement(old);
      button.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        if (button.disabled) return;
        button.disabled = true;
        try {
          const name = document.querySelector('#testName')?.value.trim() || 'Player', action = button.dataset.test;
          if (action === 'join') await sim.join(name);
          else if (action === 'like') sim.like(name,20);
          else if (action === 'follow') sim.follow(name);
          else if (action === 'boost') sim.boost30();
          else if (action === 'attack') {
            const attacker=sim.kingdomByName.get(name.toLowerCase());
            if (!attacker?.alive) toast('Create your kingdom with JOIN first');
            else { const target=sim.kingdoms.filter(k=>k.alive&&k!==attacker).sort((a,b)=>sim.power(b)-sim.power(a))[0]; if(target)sim.attack(attacker,target);else toast('At least two kingdoms are required'); }
          } else if (gifts[action]) { const [giftName,diamonds]=gifts[action]; await sim.gift(name,giftName,1,{diamonds}); }
        } finally { button.disabled = false; }
      });
    }
  }

  function removeLegacyVersionToast() {
    for (const el of document.querySelectorAll('#toast .toast')) if (/V6\.4 LIVING KINGDOMS loaded/i.test(el.textContent || '')) el.remove();
  }

  function install(sim) {
    if (!sim || sim.__gwStableLivingInstalled) return;
    sim.__gwStableLivingInstalled = true;
    sim.__v65Installed = true; // compatibility gate for the proven V6.6 battle base
    window.__BUILD_VERSION = VERSION;
    document.documentElement.dataset.runtime = 'stable-integrated-single-authority';
    const renderer = sim.r;
    installContextCard(sim, renderer);
    installCleanRoads(sim, render);
    installEconomy(sim);
    installGifts(sim);
    installJoinQueue(sim, renderer);
    for (const k of sim.kingdoms || []) {
      void syncHousing(sim,k,true).then(()=>staffFarms(sim,k)).catch(()=>{});
      for (const b of k.buildings || []) groundBuilding(b,renderer,k);
    }
    const close=document.querySelector('#closeCard'); if(close)close.onclick=()=>document.querySelector('#kingdomCard')?.classList.add('hidden');
    wireTest(sim);
    removeLegacyVersionToast();
    renderer.syncKingdomDetail?.();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
  }

  function wait() {
    const sim = window.__SIM;
    // window.TikTokGodWorld is created by the base wire() only after renderer init.
    // Installing after that point guarantees that TEST handlers and runtime methods
    // are replaced exactly once, never overwritten again by startup code.
    if (!sim || !window.TikTokGodWorld || !(sim.r?.app || sim.r?.canvas)) setTimeout(wait,25);
    else install(sim);
  }

  wait();
})();
