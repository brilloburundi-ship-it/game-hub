(() => {
  'use strict';

  const VERSION = 'v67-pixel-buildings-1';
  if (window.__V67_PIXEL_BUILDINGS?.installed) return;

  const ASSET_DATA = window.__V67_ASSET_DATA || {};
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('V6.7 pixel asset failed to load'));
      image.src = url;
    });
  }

  async function textureSet(P, list) {
    const images = await Promise.all(list.map(loadImage));
    return images.map(image => P.Texture.from(image));
  }

  function isFactionBlue(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return b > g + 12 && b > r + 16 && (max - min) > 28;
  }

  function splitFactionTexture(renderer, texture, extraMaskTexture = null) {
    const source = renderer.textureToCanvas?.(texture);
    if (!source) return { base: texture, mask: extraMaskTexture || window.PIXI.Texture.EMPTY };
    const w = source.width, h = source.height;
    const base = document.createElement('canvas'); base.width = w; base.height = h;
    const mask = document.createElement('canvas'); mask.width = w; mask.height = h;
    const bctx = base.getContext('2d', { willReadFrequently: true });
    const mctx = mask.getContext('2d', { willReadFrequently: true });
    bctx.imageSmoothingEnabled = false; mctx.imageSmoothingEnabled = false;
    bctx.drawImage(source, 0, 0);
    const img = bctx.getImageData(0, 0, w, h);
    const d = img.data;
    const md = mctx.createImageData(w, h);
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]; if (a < 8) continue;
      const rr = d[i], gg = d[i + 1], bb = d[i + 2];
      if (!isFactionBlue(rr, gg, bb)) continue;
      const lum = (rr + gg + bb) / 3;
      const shade = clamp(Math.round(86 + lum * 0.68), 92, 255);
      md.data[i] = shade; md.data[i + 1] = shade; md.data[i + 2] = shade; md.data[i + 3] = a;
      d[i + 3] = 0;
    }
    bctx.putImageData(img, 0, 0);
    mctx.putImageData(md, 0, 0);
    if (extraMaskTexture) {
      const extra = renderer.textureToCanvas?.(extraMaskTexture);
      if (extra) mctx.drawImage(extra, 0, 0, w, h);
    }
    return {
      base: window.PIXI.Texture.from(base),
      mask: window.PIXI.Texture.from(mask)
    };
  }

  function recolorTexture(renderer, texture, color) {
    const canvas = renderer.textureToCanvas?.(texture);
    if (!canvas || !renderer.recolorTeamCanvas) return texture;
    renderer.recolorTeamCanvas(canvas, color);
    return window.PIXI.Texture.from(canvas);
  }

  function copyTransform(from, to) {
    to.position?.copyFrom?.(from.position);
    if (from.anchor && to.anchor) to.anchor.copyFrom(from.anchor);
    if (from.pivot && to.pivot) to.pivot.copyFrom(from.pivot);
    if (from.skew && to.skew) to.skew.copyFrom(from.skew);
    if (from.scale && to.scale) to.scale.copyFrom(from.scale);
    to.rotation = from.rotation || 0;
    to.alpha = from.alpha ?? 1;
    to.zIndex = from.zIndex ?? 0;
    to.roundPixels = true;
    to.eventMode = 'none';
  }

  function normalCandidate(sim, originalIsBuildable, k, type, x, y) {
    return sim.getOwner(x, y) === k.id &&
      originalIsBuildable(x, y, type) &&
      !sim.buildingBlockingCell(x, y) &&
      sim.buildingSpacingOK(k, type, x, y) &&
      !k.farmers.some(f => f.cell?.[0] === x && f.cell?.[1] === y);
  }

  function churchCell(sim, originalIsBuildable, k) {
    const houses = k.buildings.filter(b => /^house_[abc]$/.test(b.type));
    if (houses.length < 3) return null;
    let best = null, bestScore = -Infinity;
    for (const token of k.territory) {
      const [x, y] = token.split(',').map(Number);
      if (!normalCandidate(sim, originalIsBuildable, k, 'church', x, y)) continue;
      const near = houses.filter(h => Math.hypot(h.x - x, h.y - y) <= 5.0);
      if (near.length < 2) continue;
      const cx = near.reduce((s, h) => s + h.x, 0) / near.length;
      const cy = near.reduce((s, h) => s + h.y, 0) / near.length;
      let spread = 0;
      for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
        const a1 = Math.atan2(near[i].y - y, near[i].x - x);
        const a2 = Math.atan2(near[j].y - y, near[j].x - x);
        let da = Math.abs(a1 - a2); if (da > Math.PI) da = Math.PI * 2 - da;
        spread = Math.max(spread, da / Math.PI);
      }
      const centre = Math.hypot(cx - x, cy - y);
      const capital = Math.hypot(k.capital[0] - x, k.capital[1] - y);
      const score = near.length * 8 + spread * 5 - centre * 2.2 - capital * 0.06 + Math.random() * 0.35;
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    return best;
  }

  function windmillCell(sim, originalIsBuildable, k) {
    const farms = k.buildings.filter(b => b.type === 'farm');
    if (!farms.length) return null;
    let best = null, bestScore = -Infinity;
    for (const token of k.territory) {
      const [x, y] = token.split(',').map(Number);
      if (!normalCandidate(sim, originalIsBuildable, k, 'windmill', x, y)) continue;
      let nearest = Infinity, nearby = 0;
      for (const farm of farms) {
        const d = Math.hypot(farm.x - x, farm.y - y);
        nearest = Math.min(nearest, d);
        if (d <= 4.2) nearby++;
      }
      if (nearest > 3.6) continue;
      const ideal = Math.abs(nearest - 2.7);
      const score = nearby * 5 - ideal * 2.5 - Math.hypot(k.capital[0] - x, k.capital[1] - y) * 0.03 + Math.random() * 0.3;
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    return best;
  }

  function portBasicCell(sim, x, y) {
    if (!sim.land(x, y) || sim.isRiver(x, y)) return false;
    if (['mountain', 'ice_coast'].includes(sim.biome(x, y))) return false;
    if (sim.coastDistance(x, y) > 1) return false;
    // The port sprite opens toward the lower-left of the isometric screen.
    // +Y is exactly that direction, so the pier is only allowed where +Y is sea.
    if (sim.land(x, y + 1)) return false;
    return true;
  }

  function portCell(sim, k) {
    let best = null, bestScore = -Infinity;
    for (const token of k.territory) {
      const [x, y] = token.split(',').map(Number);
      if (sim.getOwner(x, y) !== k.id || !portBasicCell(sim, x, y)) continue;
      if (sim.buildingBlockingCell(x, y) || !sim.buildingSpacingOK(k, 'port', x, y)) continue;
      if (k.farmers.some(f => f.cell?.[0] === x && f.cell?.[1] === y)) continue;
      const beach = sim.biome(x, y) === 'beach' ? 4 : 0;
      const d = Math.hypot(k.capital[0] - x, k.capital[1] - y);
      const score = beach - d * 0.035 + Math.random() * 0.35;
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    return best;
  }

  async function playPortConstruction(renderer, sprite, color, frames) {
    if (!sprite?.parent || sprite.destroyed || sprite.__v67PortConstruction) return;
    sprite.__v67PortConstruction = true;
    const parent = sprite.parent;
    const wasVisible = sprite.visible, wasRenderable = sprite.renderable;
    sprite.visible = false; sprite.renderable = false;
    let active = [];
    try {
      const durations = [560, 610, 660];
      for (let i = 0; i < frames.length; i++) {
        for (const item of active) if (item && !item.destroyed) item.destroy();
        const pair = frames[i];
        const base = new window.PIXI.Sprite(pair.base);
        const mask = new window.PIXI.Sprite(pair.mask);
        copyTransform(sprite, base); copyTransform(sprite, mask);
        mask.tint = color;
        base.label = `construction-port-stage-${i + 1}`;
        mask.label = `construction-port-faction-${i + 1}`;
        parent.addChild(base); parent.addChild(mask); active = [base, mask];
        if (parent.sortableChildren) parent.sortDirty = true;
        await sleep(durations[i]);
        if (!sprite || sprite.destroyed) break;
      }
    } finally {
      for (const item of active) if (item && !item.destroyed) item.destroy();
      if (sprite && !sprite.destroyed) {
        sprite.visible = wasVisible; sprite.renderable = wasRenderable;
      }
      if (renderer.entities?.sortableChildren) renderer.entities.sortDirty = true;
    }
  }

  function installCastlePatrolCollision(sim, renderer) {
    if (!renderer.app?.ticker || renderer.__v67CastlePatrolCollision) return;
    renderer.__v67CastlePatrolCollision = true;
    renderer.app.ticker.add(() => {
      const guards = renderer.__v66Guards;
      if (!(guards instanceof Map)) return;
      for (const k of sim.kingdoms || []) {
        if (!k?.alive) continue;
        const castle = k.buildings?.find(b => b.type === 'castle' && !b.__v66Destroyed);
        if (!castle) continue;
        const arr = guards.get(k.id) || [];
        const cx = castle.sx, cy = castle.sy - 5;
        const rx = 29, ry = 19;
        for (const u of arr) {
          if (!u || u.dead || u.warId || u.state !== 'patrol' || !u.s || u.s.destroyed) continue;
          let dx = u.x - cx, dy = u.y - cy;
          let norm = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
          if (norm >= 1) continue;
          if (norm < 0.002) { dx = u.targetX >= cx ? 1 : -1; dy = 0.15; norm = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry); }
          const mul = 1.035 / Math.sqrt(norm);
          u.x = cx + dx * mul;
          u.y = cy + dy * mul;
          u.s.position.set(u.x, u.y);
          u.s.zIndex = Math.round(u.y * 100) + 16;
          u.targetX = NaN; u.targetY = NaN; u.wait = Math.max(u.wait || 0, 0.12);
        }
      }
      if (renderer.entities?.sortableChildren) renderer.entities.sortDirty = true;
    });
  }

  async function install() {
    for (let i = 0; i < 1400; i++) {
      if (window.__SIM?.r && window.PIXI?.Texture) break;
      await sleep(20);
    }
    const sim = window.__SIM, renderer = sim?.r, P = window.PIXI;
    if (!sim || !renderer || !P?.Texture || !renderer.textureToCanvas || !renderer.recolorTeamCanvas) return;

    const [windmill, church, port] = await Promise.all([
      textureSet(P, ASSET_DATA.windmill),
      textureSet(P, ASSET_DATA.church),
      textureSet(P, ASSET_DATA.port)
    ]);

    renderer.__v67OriginalBuildTex ||= {
      windmill: renderer.buildTex.windmill,
      church: renderer.buildTex.church
    };
    renderer.buildTex.windmill = windmill[3];
    renderer.buildTex.church = church[3];
    renderer.buildTex.port = port[3];

    for (const key of [...renderer.kingdomBuildTex.keys()]) {
      if (/:windmill$|:church$|:port$/.test(key)) renderer.kingdomBuildTex.delete(key);
    }

    let construction = null;
    try { construction = await window.__CONSTRUCTION_TEXTURES_READY; } catch (_) {}
    if (construction) {
      // Upgrade every existing construction phase so the original blue faction pixels
      // move into the tint mask instead of staying permanently blue.
      for (const [type, frames] of Object.entries(construction)) {
        construction[type] = frames.map(frame => splitFactionTexture(renderer, frame.base, frame.mask));
      }
      construction.windmill = windmill.slice(0, 3).map(tex => splitFactionTexture(renderer, tex));
      construction.church = church.slice(0, 3).map(tex => splitFactionTexture(renderer, tex));
    }
    const portConstruction = port.slice(0, 3).map(tex => splitFactionTexture(renderer, tex));

    const originalIsBuildable = sim.isBuildableCell.bind(sim);
    sim.isBuildableCell = function(x, y, type = 'house_a') {
      if (type === 'port') return portBasicCell(this, x, y);
      return originalIsBuildable(x, y, type);
    };

    const originalFindBuildCell = sim.findBuildCell.bind(sim);
    sim.findBuildCell = function(k, type, initial = false) {
      if (type === 'church') return churchCell(this, originalIsBuildable, k);
      if (type === 'windmill') return windmillCell(this, originalIsBuildable, k);
      if (type === 'port') return portCell(this, k);
      return originalFindBuildCell(k, type, initial);
    };

    const animatedWindmills = new Set();
    const windmillFrameCache = new Map();
    const framesForKingdom = k => {
      if (windmillFrameCache.has(k.id)) return windmillFrameCache.get(k.id);
      const frames = windmill.slice(3).map(tex => recolorTexture(renderer, tex, k.color));
      windmillFrameCache.set(k.id, frames);
      return frames;
    };

    const originalRendererAddBuilding = renderer.addBuilding.bind(renderer);
    renderer.addBuilding = async function(k, b) {
      await originalRendererAddBuilding(k, b);
      if (!b?._sprite) return;
      if (b.type === 'windmill') {
        b.__v67WindFrames = framesForKingdom(k);
        b.__v67WindClock = Math.random() * 0.7;
        b._sprite.texture = b.__v67WindFrames[0];
        animatedWindmills.add(b);
      }
      if (b.type === 'port') {
        b._sprite.anchor.set(.5, .95);
        b._sprite.y = Math.round(b.sy + 1);
      }
    };

    if (renderer.app?.ticker) {
      renderer.app.ticker.add(() => {
        const dt = Math.min(0.05, renderer.app.ticker.deltaMS / 1000);
        for (const b of [...animatedWindmills]) {
          const s = b?._sprite;
          if (!s || s.destroyed || b.__v66Destroyed) { animatedWindmills.delete(b); continue; }
          b.__v67WindClock += dt;
          const frames = b.__v67WindFrames;
          const i = Math.floor(b.__v67WindClock / 0.18) % frames.length;
          if (s.texture !== frames[i]) s.texture = frames[i];
        }
      });
    }

    const originalAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = function(...args) {
      const kingdom = args[0], type = args[1];
      const finish = async b => {
        if (type === 'port' && b?._sprite && kingdom?.color !== undefined) {
          await playPortConstruction(renderer, b._sprite, kingdom.color, portConstruction);
        }
        return b;
      };
      const result = originalAddBuilding(...args);
      return result && typeof result.then === 'function' ? result.then(finish) : finish(result);
    };

    const originalBuildAI = sim.buildAI.bind(sim);
    sim.buildAI = async function(k) {
      const hasPort = k.buildings.some(b => b.type === 'port');
      if (!hasPort && this.age - k.lastBuild >= 6 && k.pop >= 10 && k.territory.size >= 16 &&
          k.resources.wood >= 105 && k.resources.stone >= 30 && k.resources.gold >= 15) {
        const cell = this.findBuildCell(k, 'port', false);
        if (cell) {
          const b = await this.addBuilding(k, 'port', cell[0], cell[1], false);
          if (b) {
            k.resources.wood -= 105; k.resources.stone -= 30; k.resources.gold -= 15;
            k.lastBuild = this.age;
            this.r.puff?.(...this.iso(cell[0], cell[1]));
            return;
          }
        }
      }
      return originalBuildAI(k);
    };

    installCastlePatrolCollision(sim, renderer);

    window.__V67_PIXEL_BUILDINGS = {
      installed: true,
      version: VERSION,
      assetsEmbedded: true,
      windmillAnimated: true,
      churchHouseClusterPlacement: true,
      windmillFarmPlacement: true,
      portCoastOnly: true,
      portOnePerKingdom: true,
      constructionFactionColor: true,
      castlePatrolCollision: true
    };
    document.documentElement.dataset.pixelBuildingUpgrades = VERSION;
  }

  install().catch(error => {
    window.__V67_PIXEL_BUILDINGS_ERROR = String(error?.message || error);
    console.error('[v67-pixel-buildings]', error);
  });
})();
