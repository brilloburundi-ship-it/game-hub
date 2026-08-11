(() => {
  'use strict';

  const VERSION = '6.8-consolidated-runtime';
  const AI_STEP = 1 / 20;
  const MAX_RENDER_DT = 0.05;
  const SORT_INTERVAL = 0.14;
  const PEACE_GUARDS = 6;
  const WAR_GUARDS = 10;
  const LOSER_GUARDS_AFTER_BREAK = 4;
  const GUARD_SPAWN_PEACE = 0.95;
  const GUARD_SPAWN_WAR = 1.25;
  const BUILD_SCALE = { warehouse: 0.72, stable: 0.88 };
  const HOUSE_TYPES = new Set(['house_a', 'house_b', 'house_c']);
  const MAX_FIRES = 8;
  const CAPTURE_INTERVAL = 3.5;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const distance = (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

  function toast(message) {
    const host = document.querySelector('#toast');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function housingCapacity(k) {
    let cap = 0;
    for (const b of k?.buildings || []) {
      if (b.__v68Destroyed || b.hp <= 0) continue;
      if (b.type === 'castle') cap += 4;
      else if (b.type === 'keep') cap += 6;
      else if (HOUSE_TYPES.has(b.type)) cap += 4;
    }
    return Math.max(4, cap);
  }

  function syncHousing(k) {
    if (!k) return;
    k.popCap = housingCapacity(k);
    k.pop = Math.min(k.pop, k.popCap);
  }

  async function staffFarms(sim, k) {
    if (!k?.alive || typeof sim.spawnFarmWorker !== 'function') return;
    for (const farm of (k.buildings || []).filter(b => b.type === 'farm' && !b.__v68Destroyed && b.hp > 0)) {
      if ((k.farmers || []).some(f => f.fixedBuilding === farm.id)) continue;
      if (!(k.farmers || []).some(f => !f.fixedBuilding)) break;
      await sim.spawnFarmWorker(k, farm);
    }
  }

  function globalScale(r) {
    if (!r?.w) return 0.34;
    return Math.min(innerWidth / r.w.mapWidth, innerHeight / r.w.mapHeight) * 1.04;
  }

  function detailThreshold(r) {
    return Math.max(globalScale(r) * 1.32, innerWidth < 600 ? 0.70 : 0.74);
  }

  function installDetailCard(sim, r) {
    r.isKingdomDetailVisible = k => {
      if (!k?.alive || !r.root || r.root.scale.x < detailThreshold(r)) return false;
      const p = r.kingdomScreenPosition?.(k);
      if (!p) return false;
      return p[0] > -50 && p[0] < innerWidth + 50 && p[1] > 35 && p[1] < innerHeight + 60 &&
        Math.hypot(p[0] - innerWidth * 0.5, p[1] - innerHeight * 0.48) < Math.min(230, innerWidth * 0.38);
    };

    r.syncKingdomDetail = () => {
      const card = document.querySelector('#kingdomCard');
      if (!card || !r.root || r.root.scale.x < detailThreshold(r)) {
        card?.classList.add('hidden');
        return;
      }
      let nearest = null;
      let best = Infinity;
      for (const k of sim.kingdoms || []) {
        if (!k.alive) continue;
        const p = r.kingdomScreenPosition?.(k);
        if (!p) continue;
        const d = Math.hypot(p[0] - innerWidth * 0.5, p[1] - innerHeight * 0.48);
        if (d < best) { best = d; nearest = k; }
      }
      if (!nearest || best > Math.min(230, innerWidth * 0.38)) {
        card.classList.add('hidden');
        return;
      }
      if (sim.selected !== nearest) sim.selected = nearest;
      sim.updateSelected?.();
    };

    const close = document.querySelector('#closeCard');
    if (close && !close.dataset.v68Bound) {
      close.dataset.v68Bound = '1';
      close.addEventListener('click', () => document.querySelector('#kingdomCard')?.classList.add('hidden'));
    }
  }

  function groundBuilding(b, r) {
    if (!b) return;
    if (b._foundation) { b._foundation.visible = false; b._foundation.alpha = 0; }
    if (b._shadow) { b._shadow.visible = false; b._shadow.alpha = 0; }
    if (b._sprite) {
      b._sprite.anchor?.set?.(0.5, 1);
      b._sprite.y = Math.round(b.sy + (b.type === 'farm' ? 0 : 1));
      b._sprite.roundPixels = true;
      const factor = BUILD_SCALE[b.type];
      if (factor && !b.__v68Scaled) {
        b.__v68Scaled = true;
        b._sprite.scale.x *= factor;
        b._sprite.scale.y *= factor;
      }
    }
    if (Array.isArray(r?.entities)) {
      const entity = r.entities.find(entry => entry?.b === b);
      if (entity) entity.y = Math.round(b.sy + 1);
    }
  }

  function installBuildAndPopulation(sim, r, state) {
    sim.isBuildableCell = function (x, y, type = 'house_a') {
      if (!this.land(x, y) || this.isRiver(x, y)) return false;
      const biome = this.biome(x, y);
      if (!['grass', 'forest', 'desert'].includes(biome)) return false;
      if (type === 'farm' && biome !== 'grass') return false;
      const minCoast = type === 'castle' ? 4 : 2;
      if (this.coastDistance(x, y) < minCoast) return false;
      return this.neigh(x, y).length >= 3;
    };

    const coreAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = async function (...args) {
      const b = await coreAddBuilding(...args);
      if (!b) return b;
      groundBuilding(b, this.r);
      syncHousing(args[0]);
      if (BUILD_SCALE[b.type]) requestAnimationFrame(() => groundBuilding(b, this.r));
      await staffFarms(this, args[0]);
      if (this.r?.entities) this.r.entities.sortDirty = true;
      return b;
    };

    sim.population = async function (k) {
      syncHousing(k);
      if (this.age - k.lastPop < 5 || k.pop >= k.popCap || k.resources.food < 45) {
        await staffFarms(this, k);
        return;
      }
      k.lastPop = this.age;
      k.resources.food -= 32;
      k.pop++;
      await this.syncCitizens(k);
      await staffFarms(this, k);
    };

    sim.giftPopulation = async function (k, amount) {
      syncHousing(k);
      k.pop = Math.min(k.popCap, k.pop + Math.max(0, amount | 0));
      await this.syncCitizens(k);
      await staffFarms(this, k);
    };

    sim.buildAI = async function (k) {
      if (this.age - k.lastBuild < 6) return;
      const count = type => k.buildings.filter(b => b.type === type && !b.__v68Destroyed && b.hp > 0).length;
      syncHousing(k);
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
      } else if (k.resources.wood > 120 && k.resources.stone > 55 && Math.random() < 0.22) {
        type = pick(['forge', 'watchtower', 'windmill', 'silo', 'church']); cost = { wood: 90, stone: 45, gold: 10 };
      }
      if (!type) return;
      for (const [name, value] of Object.entries(cost)) if (k.resources[name] < value) return;
      const cell = this.findBuildCell(k, type, false);
      if (!cell) return;
      const b = await this.addBuilding(k, type, cell[0], cell[1], false);
      if (!b) return;
      for (const [name, value] of Object.entries(cost)) k.resources[name] -= value;
      syncHousing(k);
      if (HOUSE_TYPES.has(type) && k.pop < k.popCap) {
        k.pop++;
        await this.syncCitizens(k);
      }
      k.lastBuild = this.age;
      this.r.puff?.(...this.iso(...cell));
      await staffFarms(this, k);
    };

    const coreTick = sim.tick.bind(sim);
    sim.tick = async function () {
      if (this.__v68TickBusy) {
        this.__v68SkippedTicks = (this.__v68SkippedTicks || 0) + 1;
        return;
      }
      this.__v68TickBusy = true;
      try {
        return await coreTick();
      } catch (error) {
        console.error('[V6.8 tick]', error);
      } finally {
        this.__v68TickBusy = false;
      }
    };

    if (r.P && r.addKingdom) {
      r.addKingdom = async function (k) {
        const P = this.P;
        const t = new P.Text({
          text: k.name,
          style: {
            fontFamily: 'Arial', fontSize: 11, fontWeight: '700', fill: '#ffffff',
            stroke: { color: '#071015', width: 3 },
            dropShadow: { color: '#000000', alpha: 0.55, blur: 1, distance: 1 }
          }
        });
        t.anchor.set(0.5, 1);
        const [x, y] = this.sim.iso(...k.capital);
        t.position.set(x, y - 72);
        t.zIndex = 9999;
        this.labels.addChild(t);
        k._label = t;
      };
    }

    const coreJoin = sim.join.bind(sim);
    state.joinQueue = Promise.resolve();
    sim.join = function (...args) {
      state.joinQueue = state.joinQueue.then(async () => {
        state.pauseGuardSpawnsUntil = performance.now() + 900;
        const k = await coreJoin(...args);
        if (k?.alive) {
          for (const b of k.buildings || []) groundBuilding(b, r);
          syncHousing(k);
          await this.syncCitizens(k);
          await staffFarms(this, k);
        }
        state.pauseGuardSpawnsUntil = Math.max(state.pauseGuardSpawnsUntil, performance.now() + 450);
        return k;
      }).catch(error => {
        console.error('[V6.8 JOIN]', error);
        toast('JOIN recovered — please try again');
        return null;
      });
      return state.joinQueue;
    };
  }

  async function buildMany(sim, k, requestedTypes, landPerMiss = 4) {
    let built = 0;
    for (const requested of requestedTypes) {
      const type = requested === 'house' ? pick(['house_a', 'house_b', 'house_c']) : requested;
      let cell = sim.findBuildCell(k, type, false);
      if (!cell) {
        sim.claimGiftLand?.(k, landPerMiss);
        cell = sim.findBuildCell(k, type, false);
      }
      if (!cell) continue;
      const b = await sim.addBuilding(k, type, cell[0], cell[1], false, true);
      if (b) built++;
      await nextFrame();
    }
    syncHousing(k);
    return built;
  }

  function installInteractions(sim, r, state) {
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

    state.giftQueues = new Map();
    sim.gift = function (name, gift, repeat = 1, meta = {}) {
      const key = String(name).toLowerCase();
      const previous = state.giftQueues.get(key) || Promise.resolve();
      const task = previous.then(async () => {
        const k = this.kingdomByName.get(key);
        if (!k?.alive) return;
        const g = String(gift || '').toLowerCase();
        const n = clamp(Math.max(1, Number(repeat) || 1), 1, 3);
        const diamonds = Math.max(0, Number(meta.diamonds || meta.diamondCount || 0));
        let icon = '🎁';
        let helpLabel = '';
        let builds = [];
        let citizens = 0;
        let land = 0;

        if (/universe|dragon|castle fantasy|interstellar|phoenix/.test(g) || diamonds * n >= 1000) {
          k.resources.gold += 8000 * n; k.resources.food += 6000 * n; k.resources.wood += 5500 * n; k.resources.stone += 5000 * n;
          k.military += 420 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 480);
          builds = ['house', 'house', 'house', 'farm', 'farm', 'barracks', 'forge', 'market', 'stone_tower']; citizens = 24 * n; land = 24 * n; icon = '👑'; helpLabel = 'LEGENDARY HELP';
        } else if (g.includes('lion')) {
          k.resources.gold += 4200 * n; k.resources.food += 2600 * n; k.resources.wood += 2800 * n; k.resources.stone += 2200 * n;
          k.military += 220 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 300);
          builds = ['house', 'house', 'farm', 'barracks', 'forge', 'watchtower']; citizens = 14 * n; land = 15 * n; icon = '🦁'; helpLabel = 'ROYAL HELP';
        } else if (g.includes('galaxy')) {
          k.resources.gold += 1800 * n; k.resources.food += 1500 * n; k.resources.wood += 1200 * n; k.resources.stone += 900 * n;
          k.military += 90 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 180);
          builds = ['house', 'farm', 'barracks']; citizens = 7 * n; land = 8 * n; icon = '🌌'; helpLabel = 'CITY BOOST';
        } else if (/meteor|rocket|planet|supercar/.test(g) || diamonds * n >= 500) {
          k.resources.food += 1650 * n; k.resources.wood += 1450 * n; k.resources.stone += 980 * n; k.resources.gold += 1050 * n;
          k.military += 75 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 180);
          builds = ['house', 'house', 'farm', 'farm', 'barracks', 'forge']; citizens = 10 * n; land = 13 * n; icon = '☄️'; helpLabel = 'MEGA HELP';
        } else if (/private jet|yacht|whale diving|sports car|train|money gun|motorcycle|concert/.test(g) || diamonds * n >= 200) {
          k.resources.food += 720 * n; k.resources.wood += 620 * n; k.resources.stone += 430 * n; k.resources.gold += 410 * n;
          k.military += 32 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 110);
          builds = ['house', 'house', 'farm', 'market']; citizens = 6 * n; land = 7 * n; icon = '⚡'; helpLabel = 'BIG HELP';
        } else if (/swan|celebration|diamond tree/.test(g) || diamonds * n >= 80) {
          k.resources.food += 280 * n; k.resources.wood += 240 * n; k.resources.stone += 150 * n; k.resources.gold += 130 * n;
          k.military += 12 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 65);
          builds = ['house', 'farm']; citizens = 3 * n; land = 3 * n; icon = '✨'; helpLabel = 'INSTANT HELP';
        } else if (g.includes('rose')) {
          k.resources.food += 45 * n; k.resources.gold += 12 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 20); icon = '🌹';
        } else if (g.includes('ice cream')) {
          k.resources.food += 70 * n; citizens = n; icon = '🍦';
        } else if (g.includes('coffee') || g.includes('doughnut') || g.includes('donut')) {
          k.resources.food += 120 * n; k.resources.gold += 25 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 25); icon = '☕';
        } else if (g.includes('paper crane') || g.includes('heart me') || g.includes('hand heart')) {
          k.resources.food += 180 * n; k.resources.wood += 110 * n; builds = ['house']; citizens = 2 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 50); icon = '💞';
        } else if (g.includes('finger heart')) {
          k.resources.food += 90 * n; k.resources.wood += 55 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 35); icon = '🫰';
        } else if (g.includes('perfume')) {
          k.resources.gold += 120 * n; k.resources.stone += 45 * n; icon = '✨';
        } else if (g.includes('firework')) {
          k.resources.gold += 260 * n; k.resources.wood += 180 * n; k.resources.stone += 120 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 55); icon = '🎆';
        } else if (g.includes('tiktok')) {
          k.resources.gold += 180 * n; k.resources.wood += 120 * n; k.boostUntil = Math.max(k.boostUntil, this.age + 45); icon = '🎵';
        } else {
          const value = Math.max(1, diamonds || 1);
          k.resources.gold += (35 + value * 0.8) * n; k.resources.food += (35 + value * 0.5) * n; k.resources.wood += (25 + value * 0.35) * n;
        }

        if (land) this.claimGiftLand?.(k, land);
        if (builds.length) await buildMany(this, k, builds);
        syncHousing(k);
        if (citizens) await this.giftPopulation(k, citizens);
        await staffFarms(this, k);
        this.r.supportFx?.(k, icon, Math.min(10, 3 + builds.length));
        if (helpLabel) toast(`${name}: ${helpLabel} — instant kingdom development`);
        this.updateSelected?.();
      }).catch(error => console.error('[V6.8 gift]', error));
      const wrapped = task.finally(() => {
        if (state.giftQueues.get(key) === wrapped) state.giftQueues.delete(key);
      });
      state.giftQueues.set(key, wrapped);
      return wrapped;
    };
  }

  function activeWarFor(sim, kingdomId) {
    return (sim.wars || []).find(w => !w.done && (w.a === kingdomId || w.b === kingdomId)) || null;
  }

  function ensureWarMeta(w) {
    if (!w.__v68) {
      w.__v68 = {
        phase: 'rally', phaseAge: 0, combatAge: 0,
        losses: { [w.a]: 0, [w.b]: 0 },
        breakthrough: false, winner: null, loser: null,
        anchor: null, anchorDir: { x: 1, y: 0 }, target: null,
        lastCapture: -Infinity, announced: false
      };
    }
    return w.__v68;
  }

  function guardArray(state, side) {
    if (!state.guards.has(side)) state.guards.set(side, []);
    return state.guards.get(side);
  }

  function liveGuards(state, side, warId = null) {
    return guardArray(state, side).filter(u => !u.dead && (!warId || u.warId === warId));
  }

  function ensureUnitAnim(r, sim, u, key) {
    if (!u?.s?._sprite) return null;
    if (u.s._anim[key]?.length) return u.s._anim[key];
    const k = sim.kingdoms?.[u.side];
    if (!k) return u.s._anim.idle;
    const frames = r.getUnitAnim?.(k, u.s._unit, key) || u.s._anim.idle;
    u.s._anim[key] = frames;
    return frames;
  }

  function setUnitAnim(r, sim, u, key) {
    if (!u?.s?._sprite || u.dead && key !== 'death') return;
    if (u.s._animKey === key) return;
    const frames = ensureUnitAnim(r, sim, u, key);
    if (!frames?.length) return;
    u.s._animKey = key;
    const sprite = u.s._sprite;
    sprite.textures = frames;
    sprite.loop = key !== 'death';
    sprite.animationSpeed = key === 'walk' ? (u.role === 'sword' ? 0.19 : u.role === 'spear' ? 0.18 : 0.16) : key === 'attack' ? 0.19 : 0.14;
    sprite.tint = 0xffffff;
    sprite.gotoAndPlay(0);
  }

  function faceUnit(u, targetX) {
    if (!u?.s?._sprite) return;
    const sprite = u.s._sprite;
    const mag = Math.abs(sprite.scale.x || 1);
    sprite.scale.x = targetX >= u.x ? mag : -mag;
  }

  function createGuard(sim, r, state, k) {
    const P = r.P;
    if (!P || performance.now() < state.pauseGuardSpawnsUntil) return null;
    const seq = k.__v68GuardSeq = (k.__v68GuardSeq || 0) + 1;
    const role = seq % 5 === 0 ? 'archer' : seq % 3 === 0 ? 'spear' : 'sword';
    const unit = role === 'archer' ? 'archer' : 'knight';
    const idle = r.getUnitAnim?.(k, unit, 'idle') || r.unitAnim?.[`${unit}_idle`] || [];
    if (!idle.length) return null;

    const holder = new P.Container();
    const shadow = new P.Graphics();
    shadow.ellipse(0, 1, 6.5, 2.5).fill({ color: 0x000000, alpha: 0.16 });
    holder.addChild(shadow);
    const sprite = new P.AnimatedSprite(idle);
    sprite.anchor.set(0.5, 0.84);
    sprite.scale.set(role === 'archer' ? 0.39 : role === 'spear' ? 0.40 : 0.41);
    sprite.animationSpeed = 0.14;
    sprite.roundPixels = true;
    sprite.tint = 0xffffff;
    sprite.play();
    holder.addChild(sprite);
    holder._sprite = sprite;
    holder._shadow = shadow;
    holder._anim = { idle };
    holder._animKey = 'idle';
    holder._unit = unit;
    holder._role = role;

    if (role === 'spear') {
      const spear = new P.Graphics();
      spear.poly([0, -8, 12, -19]).stroke({ color: 0x8a5e32, width: 1.2 });
      spear.poly([11, -20, 13, -17, 10, -18]).fill({ color: 0xd9e0e4 });
      holder.addChild(spear);
    }

    let cell = k.capital;
    let seen = 0;
    for (const token of k.territory || []) {
      const [x, y] = token.split(',').map(Number);
      if (!sim.isWalkableCell(x, y) || sim.buildingAt?.(x, y)) continue;
      if (Math.hypot(x - k.capital[0], y - k.capital[1]) > 5.5) continue;
      if (Math.random() < 1 / ++seen) cell = [x, y];
    }
    const p = sim.iso(...cell);
    const x = p[0] + rand(-4, 4);
    const y = p[1] + 6 + rand(-2, 2);
    holder.position.set(x, y);
    holder.zIndex = Math.round(y * 100) + 16;
    r.entities.addChild(holder);

    const u = {
      s: holder, side: k.id, role, x, y, visualX: x, visualY: y,
      state: 'patrol', warId: null, group: 0, slot: 0,
      targetX: x, targetY: y, wait: rand(0.2, 1.0), speed: rand(16, 20),
      hp: role === 'archer' ? 40 : role === 'spear' ? 56 : 50,
      maxHp: role === 'archer' ? 40 : role === 'spear' ? 56 : 50,
      targetGuard: null, targetBuilding: null, hitCooldown: rand(0.1, 0.7), hurt: 0,
      dead: false, deadAge: 0, siegeRole: null, legionIndex: 0, civilianCooldown: 0
    };
    guardArray(state, k.id).push(u);
    choosePatrolTarget(sim, k, u);
    return u;
  }

  function choosePatrolTarget(sim, k, u) {
    let chosen = k.capital;
    let seen = 0;
    for (const token of k.territory || []) {
      const [x, y] = token.split(',').map(Number);
      if (!sim.isWalkableCell(x, y) || sim.buildingAt?.(x, y)) continue;
      if (Math.hypot(x - k.capital[0], y - k.capital[1]) > 6.2) continue;
      if (Math.random() < 1 / ++seen) chosen = [x, y];
    }
    const p = sim.iso(...chosen);
    u.targetX = p[0] + rand(-4, 4);
    u.targetY = p[1] + 6 + rand(-2, 2);
    u.wait = rand(0.2, 0.9);
  }

  function separationVector(u, peers) {
    let sx = 0, sy = 0;
    for (const q of peers) {
      if (q === u || q.dead) continue;
      const dx = u.x - q.x, dy = u.y - q.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 0.01 || d2 > 100) continue;
      const d = Math.sqrt(d2);
      const desired = q.side === u.side ? 9 : 5.5;
      if (d >= desired) continue;
      const f = (desired - d) / desired;
      sx += dx / d * f;
      sy += dy / d * f;
    }
    return [sx, sy];
  }

  function buildingSteer(sim, u) {
    let sx = 0, sy = 0;
    for (const k of sim.kingdoms || []) {
      if (!k.alive) continue;
      for (const b of k.buildings || []) {
        if (b.__v68Destroyed || b.hp <= 0) continue;
        const dx = u.x - b.sx;
        const dy = u.y - (b.sy - 5);
        if (Math.abs(dx) > 25 || Math.abs(dy) > 22) continue;
        const d = Math.max(0.1, Math.hypot(dx, dy));
        const radius = b.type === 'castle' ? 23 : b.type === 'farm' ? 15 : 13;
        if (d >= radius) continue;
        const f = (radius - d) / radius;
        sx += dx / d * f * 1.5;
        sy += dy / d * f * 1.15;
      }
    }
    return [sx, sy];
  }

  function moveLogical(sim, r, u, tx, ty, dt, speed, peers) {
    let dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.65) {
      setUnitAnim(r, sim, u, 'idle');
      return true;
    }
    let vx = dx / d, vy = dy / d;
    const sep = separationVector(u, peers);
    const obs = buildingSteer(sim, u);
    vx += sep[0] * 0.70 + obs[0];
    vy += sep[1] * 0.70 + obs[1];
    const len = Math.max(0.001, Math.hypot(vx, vy));
    vx /= len; vy /= len;
    const step = Math.min(d, speed * dt);
    u.x += vx * step;
    u.y += vy * step;
    faceUnit(u, u.x + vx * 8);
    setUnitAnim(r, sim, u, 'walk');
    return d <= 2.2;
  }

  function warGeometry(sim, w, u) {
    if (!w?.front) return null;
    const ownCell = u.side === w.a ? w.front[0] : w.front[1];
    const enemyCell = u.side === w.a ? w.front[1] : w.front[0];
    const own = sim.iso(...ownCell);
    const enemy = sim.iso(...enemyCell);
    let dx = enemy[0] - own[0], dy = enemy[1] - own[1];
    const len = Math.max(1, Math.hypot(dx, dy));
    dx /= len; dy /= len;
    const px = -dy, py = dx;
    const mx = (own[0] + enemy[0]) / 2;
    const my = (own[1] + enemy[1]) / 2 + 5;
    const lane = (u.group - 1) * 13 + ((u.slot % 2) ? 3 : -3);
    const row = Math.floor(u.slot / 2) * 6;
    return {
      enemyX: enemy[0], enemyY: enemy[1] + 5,
      rallyX: mx - dx * (34 + row) + px * lane,
      rallyY: my - dy * (34 + row) + py * lane,
      advanceX: mx - dx * (7 + row * 0.4) + px * lane,
      advanceY: my - dy * (7 + row * 0.4) + py * lane
    };
  }

  function assignWarUnits(state, w) {
    for (const side of [w.a, w.b]) {
      const units = liveGuards(state, side);
      units.forEach((u, index) => {
        u.warId = w.id;
        u.group = index % 3;
        u.slot = Math.floor(index / 3);
        u.state = 'rally';
        u.targetGuard = null;
        u.targetBuilding = null;
        u.siegeRole = null;
      });
    }
  }

  function startWar(sim, r, state, w) {
    if (r.warVisuals?.has(w.id)) {
      const old = r.warVisuals.get(w.id);
      try { old?.container?.destroy?.({ children: true }); } catch (_) {}
      r.warVisuals.delete(w.id);
    }
    w.__v68 = null;
    ensureWarMeta(w);
    assignWarUnits(state, w);
  }

  function endWar(sim, r, state, w) {
    for (const side of [w.a, w.b]) {
      for (const u of guardArray(state, side)) {
        if (u.warId !== w.id || u.dead) continue;
        u.warId = null;
        u.state = 'patrol';
        u.targetGuard = null;
        u.targetBuilding = null;
        u.siegeRole = null;
        const k = sim.kingdoms?.[side];
        if (k?.alive) choosePatrolTarget(sim, k, u);
      }
    }
  }

  function ensureGuardPopulation(sim, r, state, dt) {
    state.clock += dt;
    for (const k of sim.kingdoms || []) {
      if (!k.alive) continue;
      const war = activeWarFor(sim, k.id);
      let desired = war ? WAR_GUARDS : PEACE_GUARDS;
      if (war?.__v68?.breakthrough && war.__v68.loser === k.id) desired = LOSER_GUARDS_AFTER_BREAK;
      const live = liveGuards(state, k.id).length;
      const next = state.nextSpawn.get(k.id) || 0;
      if (live >= desired || state.clock < next || performance.now() < state.pauseGuardSpawnsUntil) continue;
      const u = createGuard(sim, r, state, k);
      state.nextSpawn.set(k.id, state.clock + (war ? GUARD_SPAWN_WAR : GUARD_SPAWN_PEACE));
      if (u && war) {
        const assigned = liveGuards(state, k.id, war.id).length;
        u.warId = war.id;
        u.group = assigned % 3;
        u.slot = Math.floor(assigned / 3);
        u.state = war.__v68?.phase === 'combat' ? 'advance' : 'rally';
      }
    }
  }

  function resetTargetLoads(state, w) {
    for (const side of [w.a, w.b]) for (const u of liveGuards(state, side, w.id)) u.__v68TargetLoad = 0;
  }

  function chooseEnemyGuard(state, w, u) {
    const enemySide = u.side === w.a ? w.b : w.a;
    const enemies = liveGuards(state, enemySide, w.id);
    if (!enemies.length) return null;
    if (u.targetGuard && !u.targetGuard.dead && u.targetGuard.side === enemySide && (u.targetGuard.__v68TargetLoad || 0) < 2) {
      u.targetGuard.__v68TargetLoad = (u.targetGuard.__v68TargetLoad || 0) + 1;
      return u.targetGuard;
    }
    let best = null, score = Infinity;
    for (const q of enemies) {
      const load = q.__v68TargetLoad || 0;
      const s = distance(u, q) + load * 13;
      if (s < score) { score = s; best = q; }
    }
    if (best) best.__v68TargetLoad = (best.__v68TargetLoad || 0) + 1;
    u.targetGuard = best;
    return best;
  }

  function playBlood(r, state, x, y, scale = 0.8) {
    return playOneShot(r, state, 'blood', x, y, scale);
  }

  function killGuard(sim, r, state, w, u, killerSide) {
    if (!u || u.dead) return;
    u.dead = true;
    u.deadAge = 0;
    u.state = 'dead';
    u.targetGuard = null;
    u.targetBuilding = null;
    setUnitAnim(r, sim, u, 'death');
    playBlood(r, state, u.x, u.y - 3, 0.9);
    const meta = ensureWarMeta(w);
    meta.losses[u.side] = (meta.losses[u.side] || 0) + 1;
    const victim = sim.kingdoms?.[u.side];
    if (victim?.alive) victim.military = Math.max(2, Number(victim.military || 2) - 0.45);
    const killer = sim.kingdoms?.[killerSide];
    if (killer?.alive) killer.military += 0.08;
  }

  function attackGuard(sim, r, state, w, u, target, dt) {
    if (!target || target.dead || target.side === u.side) return;
    faceUnit(u, target.x);
    const range = u.role === 'archer' ? 25 : 9.5;
    const d = distance(u, target);
    if (d > range) {
      moveLogical(sim, r, u, target.x, target.y, dt, u.role === 'archer' ? 17 : 20, liveGuards(state, u.side, w.id));
      return;
    }
    setUnitAnim(r, sim, u, 'attack');
    u.hitCooldown -= dt;
    if (u.hitCooldown > 0) return;
    u.hitCooldown = u.role === 'archer' ? rand(0.85, 1.15) : rand(0.68, 0.95);
    const damage = u.role === 'archer' ? rand(4.5, 7.5) : u.role === 'spear' ? rand(8.5, 12.5) : rand(7.5, 11.5);
    target.hp -= damage;
    target.hurt = Math.max(target.hurt, 0.12);
    if (Math.random() < 0.38) playBlood(r, state, target.x, target.y - 3, 0.62);
    if (target.hp <= 0) killGuard(sim, r, state, w, target, u.side);
  }

  function nearestEnemyBuilding(sim, enemy, x, y, allowCastle = false) {
    let choices = (enemy?.buildings || []).filter(b => !b.__v68Destroyed && b.hp > 0 && b.owner === enemy.id && (allowCastle || b.type !== 'castle'));
    if (!choices.length && !allowCastle) choices = (enemy?.buildings || []).filter(b => !b.__v68Destroyed && b.hp > 0 && b.owner === enemy.id);
    let best = null, bestD = Infinity;
    for (const b of choices) {
      const d = Math.hypot(b.sx - x, b.sy - y);
      if (d < bestD) { best = b; bestD = d; }
    }
    return best;
  }

  function stopFire(state, b) {
    const fx = state.fires.get(b);
    if (!fx) return;
    try { if (!fx.sprite.destroyed) fx.sprite.destroy(); } catch (_) {}
    state.fires.delete(b);
  }

  function startFire(r, state, b) {
    if (!state.vfxReady || !b || b.__v68Destroyed || !b._sprite) return;
    const existing = state.fires.get(b);
    if (existing) {
      existing.until = performance.now() + 6500;
      return;
    }
    if (state.fires.size >= MAX_FIRES) return;
    const s = new r.P.AnimatedSprite(state.vfx.fire);
    s.anchor.set(0.5, 0.88);
    s.animationSpeed = 0.15;
    s.loop = true;
    s.roundPixels = true;
    s.scale.set(b.type === 'castle' ? 0.92 : 0.68);
    s.position.set(Math.round(b.sx), Math.round(b.sy - Math.max(13, (b._sprite.height || 36) * 0.34)));
    s.zIndex = Math.round((b.sy - 8) * 100) + 45;
    s.play();
    r.fx.addChild(s);
    state.fires.set(b, { sprite: s, until: performance.now() + 6500 });
  }

  function attackBuilding(sim, r, state, w, u, b, dt) {
    const enemySide = u.side === w.a ? w.b : w.a;
    if (!b || b.__v68Destroyed || b.hp <= 0 || b.owner !== enemySide || b.owner === u.side) {
      u.targetBuilding = null;
      return;
    }
    const d = Math.hypot(b.sx - u.x, b.sy + 4 - u.y);
    if (d > 14) {
      moveLogical(sim, r, u, b.sx, b.sy + 5, dt, u.role === 'archer' ? 16 : 18, liveGuards(state, u.side, w.id));
      return;
    }
    faceUnit(u, b.sx);
    setUnitAnim(r, sim, u, 'attack');
    u.hitCooldown -= dt;
    if (u.hitCooldown > 0) return;
    u.hitCooldown = rand(0.78, 1.08);
    if (b.owner !== enemySide || b.owner === u.side) return;
    const damage = u.role === 'archer' ? rand(2.0, 3.5) : rand(4.5, 7.5);
    b.hp = Math.max(0, b.hp - damage);
    r.damageBuilding?.(b, damage);
    startFire(r, state, b);
    playOneShot(r, state, 'impact', b.sx + rand(-5, 5), b.sy - rand(7, 16), 0.68);
    if (b.hp <= 0 && !b.__v68Destroyed) {
      const owner = sim.kingdoms?.[b.owner];
      if (!owner || owner.id === u.side) return;
      owner.buildings = owner.buildings.filter(entry => entry !== b);
      sim.releaseFarmWorker?.(owner, b.id);
      b.__v68Destroyed = true;
      r.destroyBuilding?.(b);
      syncHousing(owner);
      if (owner.pop > owner.popCap) {
        owner.pop = owner.popCap;
        void sim.syncCitizens(owner);
      }
      u.targetBuilding = null;
    }
  }

  function killCivilian(sim, r, state, w, u) {
    u.civilianCooldown -= AI_STEP;
    if (u.civilianCooldown > 0) return false;
    const enemySide = u.side === w.a ? w.b : w.a;
    const enemy = sim.kingdoms?.[enemySide];
    if (!enemy?.alive || enemy.pop <= 2) return false;
    let victim = null, best = Infinity;
    for (const f of enemy.farmers || []) {
      if (f.fixedBuilding || !f._sprite) continue;
      const d = Math.hypot(f.x - u.x, f.y - u.y);
      if (d < best) { best = d; victim = f; }
    }
    if (!victim || best > 11) return false;
    u.civilianCooldown = rand(1.8, 2.8);
    enemy.farmers = enemy.farmers.filter(f => f !== victim);
    enemy.pop = Math.max(2, enemy.pop - 1);
    const s = victim._sprite;
    victim._sprite = null;
    if (victim.id) r.farmerSprites?.delete(victim.id);
    playBlood(r, state, s.x, s.y - 4, 0.85);
    state.civilianCorpses.push({ sprite: s, life: 1.4 });
    return true;
  }

  function updateWarPhase(sim, r, state, w, dt) {
    const meta = ensureWarMeta(w);
    meta.phaseAge += dt;
    if (meta.breakthrough) return;
    const units = [...liveGuards(state, w.a, w.id), ...liveGuards(state, w.b, w.id)];
    if (!units.length) return;
    if (meta.phase === 'rally') {
      let reached = 0;
      for (const u of units) {
        const g = warGeometry(sim, w, u);
        if (g && Math.hypot(u.x - g.rallyX, u.y - g.rallyY) < 7) reached++;
      }
      if ((meta.phaseAge > 1.2 && reached / units.length >= 0.60) || meta.phaseAge > 3.6) {
        meta.phase = 'advance'; meta.phaseAge = 0;
      }
    } else if (meta.phase === 'advance') {
      let reached = 0;
      for (const u of units) {
        const g = warGeometry(sim, w, u);
        if (g && Math.hypot(u.x - g.advanceX, u.y - g.advanceY) < 8) reached++;
      }
      if ((meta.phaseAge > 1.25 && reached / units.length >= 0.45) || meta.phaseAge > 4.4) {
        meta.phase = 'combat'; meta.phaseAge = 0; meta.combatAge = 0;
      }
    } else if (meta.phase === 'combat') {
      meta.combatAge += dt;
      const la = meta.losses[w.a] || 0, lb = meta.losses[w.b] || 0;
      const liveA = liveGuards(state, w.a, w.id).length;
      const liveB = liveGuards(state, w.b, w.id).length;
      const enough = meta.combatAge >= 6 && la + lb >= 2;
      const timeout = meta.combatAge >= 15;
      if (!enough && !timeout) return;
      let winner;
      if (la + 1 < lb) winner = w.a;
      else if (lb + 1 < la) winner = w.b;
      else if (liveA !== liveB) winner = liveA > liveB ? w.a : w.b;
      else winner = sim.power(sim.kingdoms[w.a]) >= sim.power(sim.kingdoms[w.b]) ? w.a : w.b;
      const loser = winner === w.a ? w.b : w.a;
      meta.breakthrough = true;
      meta.winner = winner;
      meta.loser = loser;
      meta.lastCapture = sim.age;
      const winners = liveGuards(state, winner, w.id);
      const base = winners.length ? {
        x: winners.reduce((sum, u) => sum + u.x, 0) / winners.length,
        y: winners.reduce((sum, u) => sum + u.y, 0) / winners.length
      } : (() => {
        const p = sim.iso(...(winner === w.a ? w.front[0] : w.front[1]));
        return { x: p[0], y: p[1] + 5 };
      })();
      meta.anchor = base;
      const ordered = winners.slice().sort((a, b) => {
        const ar = a.role === 'spear' ? 0 : a.role === 'sword' ? 1 : 2;
        const br = b.role === 'spear' ? 0 : b.role === 'sword' ? 1 : 2;
        return ar - br;
      });
      const raiders = ordered.length >= 6 ? 2 : 1;
      ordered.forEach((u, index) => {
        u.siegeRole = index >= ordered.length - raiders ? 'raider' : 'legion';
        u.legionIndex = index;
        u.targetGuard = null;
        u.targetBuilding = null;
      });
      for (const u of liveGuards(state, loser, w.id)) {
        u.siegeRole = 'defender';
        u.targetGuard = null;
        u.targetBuilding = null;
      }
      if (!meta.announced) {
        meta.announced = true;
        toast(`⚔️ ${sim.kingdoms[winner].name} breaks the line — siege of ${sim.kingdoms[loser].name}`);
      }
    }
  }

  function advanceSiegeAnchor(sim, state, w, dt) {
    const meta = ensureWarMeta(w);
    if (!meta.breakthrough || !meta.anchor) return;
    const loser = sim.kingdoms?.[meta.loser];
    if (!loser?.alive) return;
    const target = nearestEnemyBuilding(sim, loser, meta.anchor.x, meta.anchor.y, false);
    const capital = sim.iso(...loser.capital);
    const tx = target?.sx ?? capital[0];
    const ty = (target?.sy ?? capital[1]) + 5;
    let dx = tx - meta.anchor.x, dy = ty - meta.anchor.y;
    const d = Math.max(0.001, Math.hypot(dx, dy));
    dx /= d; dy /= d;
    const step = Math.min(d, 13 * dt);
    meta.anchor.x += dx * step;
    meta.anchor.y += dy * step;
    meta.anchorDir = { x: dx, y: dy };
    meta.target = target;
  }

  function updatePatrol(sim, r, k, u, dt, peers) {
    if (u.wait > 0) {
      u.wait -= dt;
      setUnitAnim(r, sim, u, 'idle');
      return;
    }
    if (!Number.isFinite(u.targetX) || Math.hypot(u.x - u.targetX, u.y - u.targetY) < 3) choosePatrolTarget(sim, k, u);
    if (moveLogical(sim, r, u, u.targetX, u.targetY, dt, u.speed, peers)) {
      u.wait = rand(0.35, 1.1);
      choosePatrolTarget(sim, k, u);
    }
  }

  function updateNormalWarUnit(sim, r, state, w, u, dt) {
    const meta = ensureWarMeta(w);
    const peers = liveGuards(state, u.side, w.id);
    const geo = warGeometry(sim, w, u);
    if (!geo) return;
    if (meta.phase === 'rally') {
      u.state = 'rally';
      moveLogical(sim, r, u, geo.rallyX, geo.rallyY, dt, 20, peers);
      faceUnit(u, geo.enemyX);
      return;
    }
    if (meta.phase === 'advance') {
      u.state = 'advance';
      moveLogical(sim, r, u, geo.advanceX, geo.advanceY, dt, 21.5, peers);
      faceUnit(u, geo.enemyX);
      return;
    }
    u.state = 'combat';
    const target = chooseEnemyGuard(state, w, u);
    if (target) attackGuard(sim, r, state, w, u, target, dt);
    else moveLogical(sim, r, u, geo.enemyX, geo.enemyY, dt, 18, peers);
  }

  function updateBreakthroughUnit(sim, r, state, w, u, dt) {
    const meta = ensureWarMeta(w);
    const peers = liveGuards(state, u.side, w.id);
    const nearbyEnemy = (() => {
      const enemySide = u.side === w.a ? w.b : w.a;
      let best = null, bestD = Infinity;
      for (const q of liveGuards(state, enemySide, w.id)) {
        const d = distance(u, q);
        if (d < bestD) { bestD = d; best = q; }
      }
      return bestD <= 15 ? best : null;
    })();
    if (nearbyEnemy) {
      attackGuard(sim, r, state, w, u, nearbyEnemy, dt);
      return;
    }

    if (u.side === meta.winner) {
      const loser = sim.kingdoms?.[meta.loser];
      if (!loser?.alive) return;
      if (u.siegeRole === 'raider') {
        if (killCivilian(sim, r, state, w, u)) return;
        let b = u.targetBuilding;
        if (!b || b.__v68Destroyed || b.hp <= 0 || b.owner !== loser.id) {
          b = nearestEnemyBuilding(sim, loser, u.x, u.y, false);
          u.targetBuilding = b;
        }
        if (b) attackBuilding(sim, r, state, w, u, b, dt);
        return;
      }
      const anchor = meta.anchor;
      if (!anchor) return;
      const dir = meta.anchorDir || { x: 1, y: 0 };
      const px = -dir.y, py = dir.x;
      const legion = liveGuards(state, meta.winner, w.id).filter(q => q.siegeRole === 'legion');
      const index = Math.max(0, legion.indexOf(u));
      const cols = Math.min(3, Math.max(2, legion.length));
      const col = (index % cols) - (cols - 1) / 2;
      const row = Math.floor(index / cols);
      const sx = anchor.x - dir.x * (row * 8.5) + px * col * 9.5;
      const sy = anchor.y - dir.y * (row * 8.5) + py * col * 9.5;
      moveLogical(sim, r, u, sx, sy, dt, 14.5, peers);
      faceUnit(u, anchor.x + dir.x * 20);
      return;
    }

    const loser = sim.kingdoms?.[meta.loser];
    if (!loser?.alive) return;
    const home = sim.iso(...loser.capital);
    const defenders = liveGuards(state, loser.id, w.id);
    const index = Math.max(0, defenders.indexOf(u));
    const ox = ((index % 3) - 1) * 9;
    const oy = Math.floor(index / 3) * 8;
    moveLogical(sim, r, u, home[0] + ox, home[1] + 8 + oy, dt, 12.5, peers);
    faceUnit(u, meta.anchor?.x ?? home[0]);
  }

  function updateGuards(sim, r, state, dt) {
    for (const k of sim.kingdoms || []) {
      if (!k.alive) continue;
      const war = activeWarFor(sim, k.id);
      const arr = guardArray(state, k.id);
      for (const u of arr) {
        if (u.dead) { u.deadAge += dt; continue; }
        if (u.hurt > 0) {
          u.hurt -= dt;
          setUnitAnim(r, sim, u, 'hurt');
          continue;
        }
        if (!war) {
          u.warId = null;
          u.siegeRole = null;
          updatePatrol(sim, r, k, u, dt, arr);
          continue;
        }
        if (u.warId !== war.id) {
          const assigned = liveGuards(state, k.id, war.id).length;
          u.warId = war.id;
          u.group = assigned % 3;
          u.slot = Math.floor(assigned / 3);
          u.targetGuard = null;
          u.targetBuilding = null;
        }
        if (war.__v68?.breakthrough) updateBreakthroughUnit(sim, r, state, war, u, dt);
        else updateNormalWarUnit(sim, r, state, war, u, dt);
      }
    }
  }

  function cleanupDead(r, state) {
    for (const [side, arr] of state.guards) {
      const keep = [];
      for (const u of arr) {
        if (u.dead && u.deadAge > 3.8) {
          try { if (!u.s.destroyed) u.s.destroy({ children: true }); } catch (_) {}
        } else keep.push(u);
      }
      state.guards.set(side, keep);
    }
  }

  function updateAI(sim, r, state, dt) {
    ensureGuardPopulation(sim, r, state, dt);
    for (const w of sim.wars || []) {
      if (w.done) continue;
      ensureWarMeta(w);
      resetTargetLoads(state, w);
      updateWarPhase(sim, r, state, w, dt);
      advanceSiegeAnchor(sim, state, w, dt);
    }
    updateGuards(sim, r, state, dt);
    cleanupDead(r, state);
  }

  function renderGuards(r, state, dt, sortDue) {
    const alpha = 1 - Math.exp(-22 * dt);
    for (const [, arr] of state.guards) {
      for (const u of arr) {
        if (!u.s || u.s.destroyed) continue;
        if (u.dead) {
          u.visualX = u.x; u.visualY = u.y;
          u.s.alpha = u.deadAge < 2.3 ? 1 : clamp(1 - (u.deadAge - 2.3) / 1.3, 0, 1);
        } else {
          u.visualX += (u.x - u.visualX) * alpha;
          u.visualY += (u.y - u.visualY) * alpha;
          u.s.alpha = 1;
          if (u.s._sprite) u.s._sprite.tint = 0xffffff;
        }
        u.s.position.set(u.visualX, u.visualY);
        if (sortDue) u.s.zIndex = Math.round(u.visualY * 100) + 16;
      }
    }
  }

  function updateCivilianCorpses(state, dt) {
    const keep = [];
    for (const corpse of state.civilianCorpses) {
      corpse.life -= dt;
      if (!corpse.sprite || corpse.sprite.destroyed) continue;
      corpse.sprite.alpha = clamp(corpse.life / 1.1, 0, 1);
      if (corpse.life <= 0) corpse.sprite.destroy();
      else keep.push(corpse);
    }
    state.civilianCorpses = keep;
  }

  async function loadSheet(r, file, frameW, frameH, count) {
    const base = await r.P.Assets.load(file);
    if (base?.source) base.source.scaleMode = 'nearest';
    const frames = [];
    for (let i = 0; i < count; i++) frames.push(new r.P.Texture({ source: base.source, frame: new r.P.Rectangle(i * frameW, 0, frameW, frameH) }));
    return frames;
  }

  async function preloadVfx(r, state) {
    try {
      const [fire, destroy, blood, impact] = await Promise.all([
        loadSheet(r, 'assets/vfx/fire-sheet.svg', 32, 32, 6),
        loadSheet(r, 'assets/vfx/destruction-sheet.svg', 40, 32, 6),
        loadSheet(r, 'assets/vfx/blood-sheet.svg', 32, 32, 5),
        loadSheet(r, 'assets/vfx/impact-sheet.svg', 32, 32, 5)
      ]);
      state.vfx = { fire, destroy, blood, impact };
      state.vfxReady = true;
    } catch (error) {
      console.warn('[V6.8 VFX]', error);
      state.vfxReady = false;
    }
  }

  function poolFor(r, state, key) {
    if (!state.vfxReady) return [];
    if (state.pools[key]) return state.pools[key];
    const frames = state.vfx[key === 'destroy' ? 'destroy' : key];
    const size = key === 'blood' ? 10 : key === 'impact' ? 8 : 6;
    const speed = key === 'blood' ? 0.20 : key === 'impact' ? 0.22 : 0.16;
    const pool = [];
    for (let i = 0; i < size; i++) {
      const s = new r.P.AnimatedSprite(frames);
      s.anchor.set(0.5, 0.72);
      s.animationSpeed = speed;
      s.loop = false;
      s.visible = false;
      s.roundPixels = true;
      s.onComplete = () => { s.visible = false; s.stop(); };
      r.fx.addChild(s);
      pool.push(s);
    }
    state.pools[key] = pool;
    return pool;
  }

  function playOneShot(r, state, key, x, y, scale = 1) {
    const pool = poolFor(r, state, key);
    if (!pool.length) return false;
    let s = pool.find(v => !v.visible) || pool[0];
    s.position.set(Math.round(x), Math.round(y));
    s.scale.set(scale);
    s.alpha = 1;
    s.visible = true;
    s.gotoAndPlay(0);
    return true;
  }

  function updateFires(state) {
    const now = performance.now();
    for (const [b, fx] of [...state.fires]) {
      if (!b || b.__v68Destroyed || !b._sprite || b._sprite.destroyed || now > fx.until) {
        stopFire(state, b);
        continue;
      }
      fx.sprite.position.set(Math.round(b.sx), Math.round(b.sy - Math.max(13, (b._sprite.height || 36) * 0.34)));
    }
  }

  function installBattle(sim, r, state) {
    state.guards = new Map();
    state.nextSpawn = new Map();
    state.clock = 0;
    state.aiAccumulator = 0;
    state.sortClock = 0;
    state.fires = new Map();
    state.pools = {};
    state.vfxReady = false;
    state.civilianCorpses = [];
    state.pauseGuardSpawnsUntil = performance.now() + 1200;

    const coreDestroyBuilding = r.destroyBuilding?.bind(r);
    const coreUpdateFarmer = r.updateFarmer?.bind(r);

    if (coreUpdateFarmer && r.anim) {
      r.updateFarmer = function (f, dx, dy) {
        const s = f?._sprite;
        if (!s) return;
        if (f.action === 'walk') {
          const a = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'walk_left' : 'walk_right') : (dy < 0 ? 'walk_up' : 'walk_down');
          if (this.anim[a] && s._action !== a) {
            s.textures = this.anim[a];
            s._action = a;
            s.animationSpeed = 0.18;
            this.applyFarmerScale?.(s, a);
            s.gotoAndPlay(0);
          }
        }
        s.position.set(f.x, f.y);
      };
    }

    r.startWar = function (w, battleSim = sim) { startWar(battleSim, this, state, w); };
    r.endWar = function (w) { endWar(sim, this, state, w); };
    r.casualty = function () {};
    r.battleFx = function (x, y) { playBlood(this, state, x, y, 0.72); };
    r.frontImpact = function (w, battleSim = sim) {
      if (!w?.front) return;
      const a = battleSim.iso(...w.front[0]);
      const b = battleSim.iso(...w.front[1]);
      playOneShot(this, state, 'impact', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 4, 0.76);
    };

    r.damageBuilding = function (b, damage) {
      if (!b?._sprite) return;
      const ratio = clamp(b.hp / Math.max(1, b.maxHp), 0, 1);
      b.damageState = ratio < 0.35 ? 2 : 1;
      b._sprite.tint = ratio < 0.35 ? 0x886d63 : 0xc9ad9d;
      startFire(this, state, b);
    };

    r.destroyBuilding = function (b, ...args) {
      if (!b) return;
      b.__v68Destroyed = true;
      playOneShot(this, state, 'destroy', b.sx, b.sy - 8, b.type === 'castle' ? 1.12 : 0.90);
      stopFire(state, b);
      return coreDestroyBuilding?.(b, ...args);
    };

    sim.resolveWars = function () {
      for (const w of this.wars || []) {
        if (w.done) continue;
        const a = this.kingdoms[w.a], b = this.kingdoms[w.b];
        if (!a?.alive || !b?.alive) {
          w.done = true;
          r.endWar?.(w);
          continue;
        }
        const pair = this.borderPair(a, b);
        if (!pair) {
          w.done = true;
          r.endWar?.(w);
          continue;
        }
        w.front = pair;
        const meta = ensureWarMeta(w);
        if (!meta.breakthrough || this.age - meta.lastCapture < CAPTURE_INTERVAL) continue;
        const winner = this.kingdoms[meta.winner], loser = this.kingdoms[meta.loser];
        if (!winner?.alive || !loser?.alive || !meta.anchor) continue;
        const candidates = [];
        for (const token of loser.territory) {
          const [x, y] = token.split(',').map(Number);
          if (!this.neigh(x, y).some(([nx, ny]) => this.getOwner(nx, ny) === winner.id)) continue;
          const p = this.iso(x, y);
          candidates.push({ x, y, wx: p[0], wy: p[1] + 5, d: Math.hypot(p[0] - meta.anchor.x, p[1] + 5 - meta.anchor.y) });
        }
        if (!candidates.length) continue;
        candidates.sort((x, y) => x.d - y.d);
        const cell = candidates[0];
        if (cell.d > 105) continue;
        meta.lastCapture = this.age;
        this.capture(winner, loser, cell.x, cell.y);
        winner.military += 0.35;
        loser.military = Math.max(2, Number(loser.military || 2) - 0.8);
        playOneShot(r, state, 'impact', cell.wx, cell.wy, 0.78);
        r.redrawTerritories?.(this);
        r.redrawSettlementGround?.(this);
        if ((cell.x === loser.capital[0] && cell.y === loser.capital[1]) || loser.territory.size <= 1) this.eliminate(loser, winner);
      }
    };

    r.updateWars = function (battleSim, rawDt) {
      const dt = clamp(Number(rawDt) || 0.016, 0.001, MAX_RENDER_DT);
      state.aiAccumulator = Math.min(state.aiAccumulator + dt, AI_STEP * 2.2);
      let loops = 0;
      while (state.aiAccumulator >= AI_STEP && loops++ < 2) {
        updateAI(battleSim, this, state, AI_STEP);
        state.aiAccumulator -= AI_STEP;
      }

      state.sortClock += dt;
      const sortDue = state.sortClock >= SORT_INTERVAL;
      if (sortDue) state.sortClock = 0;
      renderGuards(this, state, dt, sortDue);
      updateCivilianCorpses(state, dt);
      updateFires(state);

      if (sortDue) {
        for (const k of battleSim.kingdoms || []) {
          for (const f of k.farmers || []) if (f._sprite) f._sprite.zIndex = Math.round(f.y * 100) + 10;
        }
        if (this.entities) this.entities.sortDirty = true;
      } else if (this.entities) {
        this.entities.sortDirty = false;
      }
    };

    void preloadVfx(r, state);
  }

  function installDiagnostics(sim, r, state) {
    window.GodWorldDiagnostics = {
      version: VERSION,
      snapshot() {
        let guards = 0, dead = 0;
        for (const [, arr] of state.guards || []) for (const u of arr) { guards++; if (u.dead) dead++; }
        return {
          version: VERSION,
          kingdoms: (sim.kingdoms || []).filter(k => k.alive).length,
          activeWars: (sim.wars || []).filter(w => !w.done).length,
          guards, deadGuards: dead,
          fires: state.fires?.size || 0,
          entities: r.entities?.children?.length || 0,
          fx: r.fx?.children?.length || 0,
          skippedTicks: sim.__v68SkippedTicks || 0,
          trees: window.__TREE_DEPTH_READY?.count || 0
        };
      }
    };
  }

  function install(sim) {
    if (!sim || sim.__v68Installed) return;
    const r = sim.r;
    if (!r?.P || !r?.app || !r?.entities || !r?.unitAnim || !sim.kingdoms) {
      setTimeout(() => install(sim), 35);
      return;
    }
    sim.__v68Installed = true;
    const state = {};
    sim.__v68 = state;

    window.__BUILD_VERSION = VERSION;
    document.documentElement.dataset.battleSystem = 'v68-consolidated';
    document.documentElement.dataset.runtime = 'single-runtime';
    const tag = document.querySelector('.build-tag');
    if (tag) tag.textContent = 'V6.8 CONSOLIDATED';

    installDetailCard(sim, r);
    installBuildAndPopulation(sim, r, state);
    installInteractions(sim, r, state);
    installBattle(sim, r, state);
    installDiagnostics(sim, r, state);

    for (const k of sim.kingdoms || []) {
      syncHousing(k);
      for (const b of k.buildings || []) groundBuilding(b, r);
      void sim.syncCitizens(k).then(() => staffFarms(sim, k)).catch(() => {});
    }
    r.syncKingdomDetail?.();
    toast('V6.8 CONSOLIDATED loaded');
  }

  function wait() {
    const sim = window.__SIM;
    if (!sim || !sim.r?.app || !sim.r?.P) {
      setTimeout(wait, 30);
      return;
    }
    install(sim);
  }

  wait();
})();
