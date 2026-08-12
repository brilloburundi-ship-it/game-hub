(() => {
  'use strict';

  const VERSION = 'construction-visuals-v67';
  const STAGES = [
    'assets/buildings/construction/stage-1-foundation.svg',
    'assets/buildings/construction/stage-2-scaffold.svg',
    'assets/buildings/construction/stage-3-walls.svg'
  ];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function buildKey(k, type, x, y) {
    return `${k?.id ?? -1}:${type}:${x}:${y}`;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function ensureStageAssets(r) {
    if (r.__gwConstructionAssetPromise) return r.__gwConstructionAssetPromise;
    r.__gwConstructionAssetPromise = Promise.all(STAGES.map(loadImage)).then(images => {
      if (r.P?.Texture?.from) {
        return { images, textures: images.map(image => r.P.Texture.from(image)) };
      }
      return { images, textures: null };
    }).catch(error => {
      console.error('[God World construction assets]', error);
      return { images: [], textures: null };
    });
    return r.__gwConstructionAssetPromise;
  }

  function showFinalBuilding(r, b) {
    if (!b || b.__v66Destroyed || b.hp <= 0) return;
    const sp = b._sprite;
    if (sp && !sp.destroyed) {
      sp.visible = true;
      sp.renderable = true;
      sp.alpha = 1;
      sp.zIndex = Math.round(b.sy * 100) + 20;
      sp.roundPixels = true;
    }
    if (Array.isArray(r.entities)) {
      const entity = r.entities.find(entry => entry?.b === b);
      if (entity) entity.alpha = 1;
    }
    if (r.entities && !Array.isArray(r.entities)) r.entities.sortDirty = true;
    b.__gwConstructionDone = true;
  }

  function hideFinalBuilding(r, b) {
    const sp = b?._sprite;
    if (sp && !sp.destroyed) sp.visible = false;
    if (Array.isArray(r.entities)) {
      const entity = r.entities.find(entry => entry?.b === b);
      if (entity) entity.alpha = 0;
    }
  }

  async function playPixiConstruction(r, b, textures, instant) {
    if (!textures?.length || !r?.P?.Sprite || !r.entities?.addChild) return false;
    const finalHeight = Math.max(30, Math.min(92, Number(b?._sprite?.height) || (b.type === 'castle' ? 88 : 48)));
    const stage = new r.P.Sprite(textures[0]);
    stage.anchor.set(.5, .9);
    stage.position.set(b.sx, b.sy + 1);
    stage.zIndex = Math.round(b.sy * 100) + 23;
    stage.roundPixels = true;
    const setTexture = texture => {
      stage.texture = texture;
      const h = Math.max(1, Number(texture.height) || 140);
      stage.scale.set((finalHeight * .94) / h);
    };
    setTexture(textures[0]);
    r.entities.addChild(stage);
    r.entities.sortDirty = true;
    b.__gwConstructionSprite = stage;

    const duration = instant ? 180 : (b.type === 'castle' ? 390 : 520);
    for (let i = 0; i < textures.length; i++) {
      if (b.__v66Destroyed || b.hp <= 0) break;
      setTexture(textures[i]);
      stage.alpha = .82;
      await sleep(Math.max(70, duration * .28));
      stage.alpha = 1;
      await sleep(Math.max(90, duration * .72));
    }

    if (!stage.destroyed) stage.destroy({ children: true });
    b.__gwConstructionSprite = null;
    return true;
  }

  async function playCanvasConstruction(r, b, images, instant) {
    if (!images?.length || !Array.isArray(r.entities)) return false;
    const finalEntity = r.entities.find(entry => entry?.b === b);
    const scaleFor = image => typeof r.buildingScale === 'function'
      ? r.buildingScale(b.type, image, .94)
      : .42;
    const stage = { type: 'building', img: images[0], x: b.sx, y: b.sy + 1, scale: scaleFor(images[0]), alpha: 1, __gwConstruction: true };
    r.entities.push(stage);
    b.__gwConstructionEntity = stage;
    const duration = instant ? 180 : (b.type === 'castle' ? 390 : 520);
    for (const image of images) {
      if (b.__v66Destroyed || b.hp <= 0) break;
      stage.img = image;
      stage.scale = scaleFor(image);
      await sleep(duration);
    }
    r.entities = r.entities.filter(entry => entry !== stage);
    b.__gwConstructionEntity = null;
    if (finalEntity && !b.__v66Destroyed && b.hp > 0) finalEntity.alpha = 1;
    return true;
  }

  async function playConstruction(r, b, instant) {
    if (!b || b.__gwConstructionPlaying || b.__gwConstructionDone) return;
    b.__gwConstructionPlaying = true;
    hideFinalBuilding(r, b);
    try {
      const assets = await ensureStageAssets(r);
      let shown = false;
      if (assets.textures) shown = await playPixiConstruction(r, b, assets.textures, instant);
      if (!shown) shown = await playCanvasConstruction(r, b, assets.images, instant);
      if (!shown && !instant) await sleep(420);
    } catch (error) {
      console.error('[God World construction sequence]', error);
    } finally {
      b.__gwConstructionPlaying = false;
      showFinalBuilding(r, b);
      r.puff?.(b.sx, b.sy - 2);
    }
  }

  function install(sim) {
    if (!sim?.r || sim.__gwConstructionVisualsInstalled) return;
    sim.__gwConstructionVisualsInstalled = true;
    const r = sim.r;
    r.__gwConstructionPending ||= new Map();
    void ensureStageAssets(r);

    const baseRendererAddBuilding = typeof r.addBuilding === 'function' ? r.addBuilding.bind(r) : null;
    if (baseRendererAddBuilding) {
      r.addBuilding = async function (k, b) {
        const result = await baseRendererAddBuilding(k, b);
        const key = buildKey(k, b.type, b.x, b.y);
        const instant = !!r.__gwConstructionPending.get(key);
        void playConstruction(r, b, instant);
        return result;
      };
    }

    const baseSimAddBuilding = typeof sim.addBuilding === 'function' ? sim.addBuilding.bind(sim) : null;
    if (baseSimAddBuilding) {
      sim.addBuilding = async function (k, type, x, y, forceCastle = false, instant = false, ...rest) {
        const key = buildKey(k, type, x, y);
        r.__gwConstructionPending.set(key, !!instant);
        try {
          return await baseSimAddBuilding(k, type, x, y, forceCastle, instant, ...rest);
        } finally {
          setTimeout(() => r.__gwConstructionPending.delete(key), 80);
        }
      };
    }

    for (const k of sim.kingdoms || []) {
      if (!k?.alive) continue;
      for (const b of k.buildings || []) showFinalBuilding(r, b);
    }

    document.documentElement.dataset.constructionVisuals = VERSION;
  }

  function wait() {
    const sim = window.__SIM;
    if (!sim?.r || !sim.__gwStableLivingInstalled || !sim.__gwIntegratedBattleInstalled) setTimeout(wait, 40);
    else install(sim);
  }

  wait();
})();
