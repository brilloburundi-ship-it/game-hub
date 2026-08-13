(() => {
  'use strict';

  const VERSION = 'v708-water-camera-two-boats-1';
  if (window.__V708_WATER_CAMERA_FISHING?.bootstrap) return;

  const state = window.__V708_WATER_CAMERA_FISHING = {
    bootstrap: true,
    installed: false,
    version: VERSION,
    riverOverlay: false,
    oceanBackdrop: false,
    cameraClamp: false,
    secondBoatSystem: false,
    foodTrips: 0,
    errors: []
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const key = (x, y) => `${x},${y}`;
  const BOATS_PER_PORT = 2;
  const FISH_FOOD_PER_TRIP = 10;

  function drawRiverPath(g, sim) {
    for (const river of sim.w?.rivers || []) {
      if (!Array.isArray(river) || river.length < 2) continue;
      const first = sim.iso(river[0][0], river[0][1]);
      g.moveTo(first[0], first[1]);
      for (let i = 1; i < river.length; i++) {
        const p = sim.iso(river[i][0], river[i][1]);
        g.lineTo(p[0], p[1]);
      }
    }
  }

  function installWideRivers(sim) {
    const r = sim.r, P = window.PIXI;
    if (!r?.root || !P?.Graphics || r.__v708WideRivers) return false;
    r.__v708WideRivers = true;

    const group = new P.Container();
    group.label = 'v708-wide-rivers';
    group.eventMode = 'none';

    const bank = new P.Graphics();
    drawRiverPath(bank, sim);
    bank.stroke({ color: 0x173f59, width: 15, alpha: 0.48 });

    const water = new P.Graphics();
    drawRiverPath(water, sim);
    water.stroke({ color: 0x2f7898, width: 10, alpha: 0.96 });

    const inner = new P.Graphics();
    drawRiverPath(inner, sim);
    inner.stroke({ color: 0x4e9fba, width: 6, alpha: 0.82 });

    const shine = new P.Graphics();
    drawRiverPath(shine, sim);
    shine.stroke({ color: 0x8bc5d2, width: 2, alpha: 0.58 });

    group.addChild(bank, water, inner, shine);
    // Keep the river under territories/buildings but above the clean terrain map.
    r.root.addChildAt(group, Math.min(1, r.root.children.length));
    r.__v708RiverOverlay = group;
    state.riverOverlay = true;
    return true;
  }

  function installOceanBackdrop(sim) {
    const r = sim.r, P = window.PIXI;
    if (!r?.app?.stage || !P?.Graphics || r.__v708OceanBackdrop) return false;
    r.__v708OceanBackdrop = true;

    const ocean = new P.Container();
    ocean.label = 'v708-ocean-backdrop';
    ocean.eventMode = 'none';
    const base = new P.Graphics();
    const waves = new P.Graphics();
    ocean.addChild(base, waves);
    r.app.stage.addChildAt(ocean, 0);

    const redraw = () => {
      const pad = 96;
      const w = Math.max(1, innerWidth + pad * 2);
      const h = Math.max(1, innerHeight + pad * 2);
      base.clear();
      base.rect(-pad, -pad, w, h).fill({ color: 0x123a55, alpha: 1 });
      waves.clear();
      for (let y = -40; y < innerHeight + 80; y += 34) {
        const row = Math.floor((y + 40) / 34);
        const shift = (row % 2) * 21;
        for (let x = -80 + shift; x < innerWidth + 100; x += 70) {
          const len = 18 + ((x + row * 13) % 3 + 3) % 3 * 5;
          waves.rect(x, y, len, 2).fill({ color: row % 3 === 0 ? 0x4b8da8 : 0x2d6e8c, alpha: 0.22 });
          if ((row + Math.floor(x / 70)) % 4 === 0) {
            waves.rect(x + 8, y + 7, Math.max(8, len - 9), 1).fill({ color: 0x78afbf, alpha: 0.13 });
          }
        }
      }
    };
    redraw();

    let time = 0;
    r.app.ticker.add(() => {
      time += Math.min(0.05, r.app.ticker.deltaMS / 1000);
      waves.x = Math.sin(time * 0.34) * 8;
      waves.y = Math.sin(time * 0.22) * 3;
    });
    window.addEventListener('resize', redraw, { passive: true });

    r.__v708OceanBackdropContainer = ocean;
    state.oceanBackdrop = true;
    return true;
  }

  function clampPixiCamera(r) {
    if (!r?.root || !r?.w) return;
    const s = Number(r.root.scale?.x) || 1;
    const mw = r.w.mapWidth * s;
    const mh = r.w.mapHeight * s;
    const minX = innerWidth - mw;
    const minY = innerHeight - mh;
    r.root.x = mw <= innerWidth ? (innerWidth - mw) / 2 : clamp(r.root.x, minX, 0);
    r.root.y = mh <= innerHeight ? (innerHeight - mh) / 2 : clamp(r.root.y, minY, 0);
    r.syncKingdomDetail?.();
    r.syncOverviewHud?.();
  }

  function clampCanvasCamera(r) {
    if (!r?.cam || !r?.w) return;
    const s = Number(r.cam.s) || 1;
    const mw = r.w.mapWidth * s;
    const mh = r.w.mapHeight * s;
    const minX = innerWidth - mw;
    const minY = innerHeight - mh;
    r.cam.x = mw <= innerWidth ? (innerWidth - mw) / 2 : clamp(r.cam.x, minX, 0);
    r.cam.y = mh <= innerHeight ? (innerHeight - mh) / 2 : clamp(r.cam.y, minY, 0);
    r.syncKingdomDetail?.();
    r.syncOverviewHud?.();
  }

  function installCameraClamp(sim) {
    const r = sim.r;
    if (!r || r.__v708CameraClamp) return false;
    r.__v708CameraClamp = true;

    if (r.root) {
      r.constrainCamera = function () {
        clampPixiCamera(this);
      };
      const originalHome = typeof r.home === 'function' ? r.home.bind(r) : null;
      if (originalHome) {
        r.home = function (...args) {
          const out = originalHome(...args);
          clampPixiCamera(this);
          return out;
        };
      }
      const originalFocus = typeof r.focusCell === 'function' ? r.focusCell.bind(r) : null;
      if (originalFocus) {
        r.focusCell = function (...args) {
          const out = originalFocus(...args);
          clampPixiCamera(this);
          return out;
        };
      }
      clampPixiCamera(r);
    } else if (r.cam) {
      const originalHome = typeof r.home === 'function' ? r.home.bind(r) : null;
      if (originalHome) {
        r.home = function (...args) {
          const out = originalHome(...args);
          clampCanvasCamera(this);
          return out;
        };
      }
      const originalFocus = typeof r.focusCell === 'function' ? r.focusCell.bind(r) : null;
      if (originalFocus) {
        r.focusCell = function (...args) {
          const out = originalFocus(...args);
          clampCanvasCamera(this);
          return out;
        };
      }
      const loop = () => {
        if (!window.__SIM) return;
        clampCanvasCamera(r);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    state.cameraClamp = true;
    return true;
  }

  function seaCell(sim, x, y) {
    return sim.inBounds?.(x, y) && !sim.land(x, y);
  }

  function seaNeighbours(sim, x, y) {
    return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => seaCell(sim, a, b));
  }

  function portSeaCell(sim, port) {
    return [[port.x, port.y + 1], [port.x + 1, port.y], [port.x - 1, port.y], [port.x, port.y - 1]]
      .find(([x, y]) => seaCell(sim, x, y)) || null;
  }

  function fishingRoute(sim, start) {
    if (!start) return null;
    const startKey = key(...start);
    const parent = new Map([[startKey, null]]);
    const distance = new Map([[startKey, 0]]);
    const queue = [start];
    const candidates = [];
    let head = 0;

    while (head < queue.length && parent.size < 260) {
      const cell = queue[head++];
      const d = distance.get(key(...cell)) || 0;
      if (d >= 5 && d <= 11) candidates.push(cell);
      if (d >= 11) continue;
      for (const next of seaNeighbours(sim, cell[0], cell[1])) {
        const token = key(...next);
        if (parent.has(token)) continue;
        parent.set(token, cell);
        distance.set(token, d + 1);
        queue.push(next);
      }
    }

    if (!candidates.length) return null;
    const outer = candidates.filter(cell => (distance.get(key(...cell)) || 0) >= 7);
    const pool = outer.length ? outer : candidates;
    const target = pool[(Math.random() * pool.length) | 0];
    const route = [];
    let cur = target;
    while (cur) {
      route.push(cur);
      cur = parent.get(key(...cur));
    }
    route.reverse();
    return route.length > 1 ? route : null;
  }

  function worldPoint(sim, cell, laneOffset = 0) {
    const p = sim.iso(cell[0], cell[1]);
    return [p[0] + laneOffset, p[1] + 3 + Math.abs(laneOffset) * 0.08];
  }

  function portAlive(k, port) {
    return !!port && !port.__v66Destroyed && Number(port.hp) > 0 && (k.buildings || []).includes(port);
  }

  function installSecondFishingBoat(sim) {
    const r = sim.r, P = window.PIXI;
    const firstBoats = r?.__v68FishingBoats;
    if (!r?.app?.ticker || !r?.entities?.addChild || !(firstBoats instanceof Map) || !P?.Sprite || r.__v708SecondFishingBoats) return false;

    const seconds = new Map();
    const previousState = new WeakMap();
    r.__v708SecondFishingBoats = seconds;

    const position = (boat, x, y) => {
      boat.x = x; boat.y = y;
      boat.sprite.position.set(x, y);
      boat.sprite.zIndex = Math.round(y * 100) + 15;
    };
    const face = (boat, tx) => {
      const sx = Math.abs(boat.sprite.scale.x || boat.scale);
      boat.sprite.scale.x = tx >= boat.x ? sx : -sx;
      boat.sprite.scale.y = Math.abs(boat.sprite.scale.y || boat.scale);
    };
    const setFrame = (boat, start, count, period) => {
      const i = start + (Math.floor(boat.animClock / period) % count);
      const t = boat.frames[i];
      if (t && boat.sprite.texture !== t) boat.sprite.texture = t;
    };
    const move = (boat, route, dt, speed) => {
      if (!route?.length || boat.routeIndex >= route.length) return true;
      const [tx, ty] = worldPoint(sim, route[boat.routeIndex], boat.laneOffset);
      face(boat, tx);
      const dx = tx - boat.x, dy = ty - boat.y, d = Math.hypot(dx, dy);
      if (d < 0.8) {
        position(boat, tx, ty);
        boat.routeIndex++;
        return boat.routeIndex >= route.length;
      }
      const step = Math.min(d, speed * dt);
      position(boat, boat.x + dx / d * step, boat.y + dy / d * step);
      return false;
    };
    const destroy = boat => {
      if (!boat || boat.state === 'destroying' || boat.state === 'gone') return;
      boat.state = 'destroying';
      boat.destroyClock = 0;
      boat.animClock = 0;
      boat.sprite.alpha = 1;
    };
    const remove = boat => {
      if (!boat) return;
      boat.state = 'gone';
      if (boat.sprite && !boat.sprite.destroyed) boat.sprite.destroy();
      seconds.delete(boat.k.id);
      if (r.__v800RequestSort) r.__v800RequestSort();
      else if (r.entities?.sortableChildren) r.entities.sortDirty = true;
    };
    const startTrip = boat => {
      const home = portSeaCell(sim, boat.port);
      if (!home) return false;
      boat.home = home;
      const route = fishingRoute(sim, home);
      if (!route) return false;
      boat.route = route;
      boat.routeIndex = 1;
      boat.state = 'outbound';
      boat.animClock = 0;
      return true;
    };
    const spawnSecond = first => {
      if (!first?.k?.alive || !first.port || !first.frames?.length) return null;
      const k = first.k;
      const home = portSeaCell(sim, first.port);
      if (!home) return null;
      const sprite = new P.Sprite(first.frames[0]);
      const scale = Number(first.scale) || 0.52;
      sprite.anchor.set(0.5, 0.78);
      sprite.scale.set(scale);
      sprite.roundPixels = true;
      sprite.eventMode = 'none';
      sprite.label = `fishing-boat-2-k${k.id}`;
      const laneOffset = 7;
      const [x, y] = worldPoint(sim, home, laneOffset);
      const boat = {
        k, port: first.port, home, frames: first.frames, sprite, scale, laneOffset,
        x, y, state: 'docked', wait: rand(1.8, 4.8), route: null, routeIndex: 0,
        animClock: Math.random() * 0.7, fishClock: 0, destroyClock: 0
      };
      position(boat, x, y);
      r.entities.addChild(sprite);
      seconds.set(k.id, boat);
      if (r.__v800RequestSort) r.__v800RequestSort();
      else if (r.entities?.sortableChildren) r.entities.sortDirty = true;
      return boat;
    };
    const updateSecond = (boat, dt) => {
      boat.animClock += dt;
      if (!boat.k?.alive || !portAlive(boat.k, boat.port)) destroy(boat);
      if (boat.state === 'destroying') {
        boat.destroyClock += dt;
        const frame = boat.frames[8 + clamp(Math.floor(boat.destroyClock / 0.52), 0, 3)];
        if (frame) boat.sprite.texture = frame;
        if (boat.destroyClock >= 2.25) remove(boat);
        return;
      }
      if (boat.state === 'docked') {
        setFrame(boat, 0, 4, 0.34);
        boat.wait -= dt;
        if (boat.wait <= 0 && !startTrip(boat)) boat.wait = rand(4, 8);
        return;
      }
      if (boat.state === 'outbound') {
        setFrame(boat, 4, 4, 0.18);
        if (move(boat, boat.route, dt, 19)) {
          boat.state = 'fishing';
          boat.fishClock = rand(9, 15);
          boat.animClock = 0;
        }
        return;
      }
      if (boat.state === 'fishing') {
        setFrame(boat, 0, 4, 0.42);
        boat.fishClock -= dt;
        if (boat.fishClock <= 0) {
          boat.route = [...boat.route].reverse();
          boat.routeIndex = 1;
          boat.state = 'returning';
          boat.animClock = 0;
        }
        return;
      }
      if (boat.state === 'returning') {
        setFrame(boat, 4, 4, 0.18);
        if (move(boat, boat.route, dt, 19)) {
          boat.state = 'docked';
          boat.wait = rand(5, 10);
          boat.animClock = 0;
          const [x, y] = worldPoint(sim, boat.home, boat.laneOffset);
          position(boat, x, y);
        }
      }
    };

    const rewardReturnedTrip = boat => {
      if (!boat?.k?.alive || !portAlive(boat.k, boat.port)) return;
      boat.k.resources.food += FISH_FOOD_PER_TRIP;
      state.foodTrips++;
      if (sim.selected === boat.k) sim.updateSelected?.();
    };

    let scan = 0;
    r.app.ticker.add(() => {
      const dt = Math.min(0.05, r.app.ticker.deltaMS / 1000);
      scan -= dt;
      if (scan <= 0) {
        scan = 0.7;
        for (const k of sim.kingdoms || []) {
          if (!k?.alive) continue;
          const first = firstBoats.get(k.id);
          const second = seconds.get(k.id);
          if (first && !second && portAlive(k, first.port)) spawnSecond(first);
          else if (second && (!first || second.port !== first.port)) destroy(second);
        }
      }

      for (const boat of [...seconds.values()]) updateSecond(boat, dt);

      const all = [];
      for (const boat of firstBoats.values()) all.push(boat);
      for (const boat of seconds.values()) all.push(boat);
      for (const boat of all) {
        if (!boat || boat.state === 'gone') continue;
        const before = previousState.get(boat);
        if (before === 'returning' && boat.state === 'docked') rewardReturnedTrip(boat);
        previousState.set(boat, boat.state);
      }
      if (r.__v800RequestSort) r.__v800RequestSort();
      else if (r.entities?.sortableChildren) r.entities.sortDirty = true;
    });

    const api = window.TikTokGodWorld = window.TikTokGodWorld || {};
    api.getFishingBoatCount = ref => {
      let k = null;
      if (Number.isInteger(ref)) k = sim.kingdoms?.[ref];
      else {
        const n = String(ref ?? '').toLowerCase();
        k = sim.kingdomByName?.get(n) || sim.kingdoms?.find(x => String(x.name).toLowerCase() === n);
      }
      if (!k) return 0;
      let count = 0;
      const first = firstBoats.get(k.id);
      const second = seconds.get(k.id);
      if (first && first.state !== 'gone') count++;
      if (second && second.state !== 'gone') count++;
      return count;
    };

    state.secondBoatSystem = true;
    return true;
  }

  async function install() {
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      if (sim?.r && window.__V706_WORLD_POLISH?.installed && window.__V68_FISHING_BOATS?.installed) break;
      await sleep(20);
    }
    const sim = window.__SIM;
    if (!sim?.r) throw new Error('Simulation renderer unavailable for V7.0.8');

    installOceanBackdrop(sim);
    installWideRivers(sim);
    installCameraClamp(sim);
    installSecondFishingBoat(sim);

    state.installed = true;
    state.boatsPerPort = BOATS_PER_PORT;
    state.foodPerTrip = FISH_FOOD_PER_TRIP;
    document.documentElement.dataset.waterCameraFishing = VERSION;
  }

  install().catch(error => {
    state.errors.push(String(error?.stack || error?.message || error));
    console.error('[v708-water-camera-fishing]', error);
  });
})();
