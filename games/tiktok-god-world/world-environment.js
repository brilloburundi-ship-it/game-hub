(() => {
  'use strict';

  const VERSION = 'stable-large-water-1';
  const key = (x, y) => `${x},${y}`;
  const STARTER = ['house_a', 'house_b', 'farm'];

  function neutralizeCivilianTexture(renderer, texture) {
    try {
      const canvas = renderer.textureToCanvas?.(texture);
      if (!canvas) return texture;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = image.data;
      const dark = [102, 73, 47], mid = [158, 116, 73], light = [215, 178, 123];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const greenCloth = g > r + 12 && g > b + 6 && max - min > 20 && g > 52;
        if (!greenCloth) continue;
        const lum = (r + g + b) / 3;
        const rep = lum < 82 ? dark : lum < 156 ? mid : light;
        data[i] = rep[0]; data[i + 1] = rep[1]; data[i + 2] = rep[2];
      }
      ctx.putImageData(image, 0, 0);
      return window.PIXI.Texture.from(canvas);
    } catch (error) {
      console.warn('[God World neutral civilian]', error);
      return texture;
    }
  }

  function installNeutralCivilians(sim) {
    const renderer = sim.r;
    if (!renderer?.anim || renderer.__gwNeutralCivilians) return;
    renderer.__gwNeutralCivilians = true;
    for (const [action, frames] of Object.entries(renderer.anim)) {
      if (!Array.isArray(frames) || !frames.length) continue;
      renderer.anim[action] = frames.map(texture => neutralizeCivilianTexture(renderer, texture));
    }
    const baseMakeFarmerSprite = renderer.makeFarmerSprite?.bind(renderer);
    if (baseMakeFarmerSprite) {
      renderer.makeFarmerSprite = function (action) {
        const sprite = baseMakeFarmerSprite(action);
        if (sprite) sprite.tint = 0xffffff;
        return sprite;
      };
    }
    const baseSetFarmerAction = renderer.setFarmerAction?.bind(renderer);
    if (baseSetFarmerAction) {
      renderer.setFarmerAction = function (farmer, action) {
        const result = baseSetFarmerAction(farmer, action);
        if (farmer?._sprite) farmer._sprite.tint = 0xffffff;
        return result;
      };
    }
    for (const kingdom of sim.kingdoms || []) {
      for (const farmer of kingdom.farmers || []) if (farmer?._sprite) farmer._sprite.tint = 0xffffff;
    }
    document.documentElement.dataset.civilians = 'neutral';
  }

  function installFreshWater(sim) {
    if (sim.__gwFreshWaterInstalled) return;
    sim.__gwFreshWaterInstalled = true;
    sim.lakeSet = new Set((sim.w.lakes || []).map(([x, y]) => key(x, y)));
    sim.isLake = (x, y) => sim.lakeSet.has(key(x, y));
    sim.isFreshWater = (x, y) => sim.isRiver(x, y) || sim.isLake(x, y);
    sim.nearFreshWater = (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (sim.isFreshWater(x + dx, y + dy)) return true;
      }
      return false;
    };

    const baseWalkable = sim.isWalkableCell.bind(sim);
    sim.isWalkableCell = function (x, y) {
      if (this.isLake(x, y)) return false;
      return baseWalkable(x, y);
    };

    const baseEconomy = sim.economy.bind(sim);
    sim.economy = function (kingdom) {
      baseEconomy(kingdom);
      if (!kingdom?.alive) return;
      const mult = this.age < kingdom.boostUntil ? 1.8 : 1;
      let freshTiles = 0, freshFarms = 0;
      for (const token of kingdom.territory || []) {
        const [x, y] = token.split(',').map(Number);
        if (this.nearFreshWater(x, y)) freshTiles++;
      }
      for (const building of kingdom.buildings || []) {
        if (building.type === 'farm' && !building.__v66Destroyed && this.nearFreshWater(building.x, building.y)) freshFarms++;
      }
      kingdom.resources.food += (freshTiles * 0.028 + freshFarms * 0.65) * mult;
    };

    document.documentElement.dataset.freshWater = `${sim.w.lakes?.length || 0}-lake-cells:${sim.w.rivers?.length || 0}-rivers`;
  }

  function forceBuildingVisible(building) {
    const sprite = building?._sprite;
    if (!sprite || sprite.destroyed) return;
    sprite.visible = true;
    sprite.renderable = true;
    sprite.alpha = 1;
    sprite.tint = 0xffffff;
    const restore = () => {
      if (!sprite.destroyed) {
        sprite.visible = true;
        sprite.renderable = true;
        sprite.alpha = 1;
      }
    };
    requestAnimationFrame(restore);
    setTimeout(restore, 180);
    setTimeout(restore, 620);
    setTimeout(restore, 1500);
  }

  async function seedStarterVillage(sim, kingdom) {
    if (!kingdom?.alive || kingdom.__gwStarterVillage) return kingdom;
    kingdom.__gwStarterVillage = true;

    for (const token of [...kingdom.territory]) {
      const [x, y] = token.split(',').map(Number);
      if (!sim.isLake(x, y)) continue;
      kingdom.territory.delete(token);
      if (sim.getOwner(x, y) === kingdom.id) sim.setOwner(x, y, -1);
    }

    const existingHouses = () => kingdom.buildings.filter(b => /^house_/.test(b.type) && !b.__v66Destroyed).length;
    const existingFarms = () => kingdom.buildings.filter(b => b.type === 'farm' && !b.__v66Destroyed).length;
    const required = [];
    while (existingHouses() + required.filter(t => t.startsWith('house_')).length < 2) required.push(STARTER[required.length % 2]);
    if (existingFarms() < 1) required.push('farm');

    for (const type of required) {
      let cell = sim.findBuildCell(kingdom, type, true);
      if (!cell) {
        sim.claimGiftLand?.(kingdom, 4);
        cell = sim.findBuildCell(kingdom, type, true);
      }
      if (!cell) continue;
      const building = await sim.addBuilding(kingdom, type, cell[0], cell[1], false, true);
      forceBuildingVisible(building);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }

    for (const building of kingdom.buildings || []) forceBuildingVisible(building);
    if (typeof sim.giftPopulation === 'function' && kingdom.pop < Math.min(6, kingdom.popCap)) {
      await sim.giftPopulation(kingdom, Math.min(6, kingdom.popCap) - kingdom.pop);
    }
    sim.r.redrawSettlementGround?.(sim);
    sim.r.redrawTerritories?.(sim);
    sim.updateUI?.();
    return kingdom;
  }

  function installStarterJoin(sim) {
    if (sim.__gwStarterJoinInstalled) return;
    sim.__gwStarterJoinInstalled = true;
    const baseJoin = sim.join.bind(sim);
    sim.join = async function (name) {
      const kingdom = await baseJoin(name);
      if (kingdom?.alive) {
        try { await seedStarterVillage(this, kingdom); }
        catch (error) { console.error('[God World starter village]', error); }
      }
      return kingdom;
    };
  }

  function install() {
    const sim = window.__SIM;
    if (!sim || !sim.__gwStableLivingInstalled || !sim.r?.app || sim.__gwWorldEnvironmentInstalled) return false;
    sim.__gwWorldEnvironmentInstalled = true;
    installFreshWater(sim);
    installNeutralCivilians(sim);
    installStarterJoin(sim);
    window.__WORLD_ENVIRONMENT_VERSION = VERSION;
    document.documentElement.dataset.worldEnvironment = VERSION;
    return true;
  }

  function wait() {
    if (!install()) setTimeout(wait, 30);
  }
  wait();
})();
