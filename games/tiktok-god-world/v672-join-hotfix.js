(() => {
  'use strict';

  const VERSION = '6.7.2-join-hotfix';
  const JOIN_GUARD_DELAY_MS = 650;

  const idleTask = (fn, delay = 0) => {
    const run = () => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(() => fn(), { timeout: 700 });
      else setTimeout(fn, 0);
    };
    setTimeout(run, delay);
  };

  function hydrateAnim(r, holder, k, unit, key) {
    if (!holder || holder.destroyed || !holder._sprite || holder._sprite.destroyed) return;
    try {
      const frames = r.getUnitAnim?.(k, unit, key);
      if (!frames?.length) return;
      holder._anim[key] = frames;
      if (holder._animKey === key) {
        const frame = holder._sprite.currentFrame || 0;
        holder._sprite.textures = frames;
        holder._sprite.gotoAndPlay(Math.min(frame, frames.length - 1));
      }
    } catch (err) {
      console.warn(`[V6.7.2] deferred ${unit}/${key} animation failed`, err);
    }
  }

  function installFastSoldiers(sim, r) {
    if (r.__v672FastSoldiersInstalled) return;
    r.__v672FastSoldiersInstalled = true;

    r.makeSoldier = function (k, role) {
      if (performance.now() < (this.__v672PauseGuardsUntil || 0)) return null;

      const P = this.P;
      const c = new P.Container();
      const shadow = new P.Graphics();
      shadow.ellipse(0, 1, 7, 3).fill({ color: 0x000000, alpha: .18 });
      c.addChild(shadow);

      const unit = role === 'archer' ? 'archer' : 'knight';
      // JOIN only pays for one already-cached/team-colored idle animation.
      // The remaining states are recolored in separate idle slices instead of
      // allocating every animation in the same frame.
      const idle = this.getUnitAnim(k, unit, 'idle') || [];
      const anim = { idle, walk: idle, attack: idle, hurt: idle, death: idle };
      const sprite = new P.AnimatedSprite(idle);
      sprite.anchor.set(.5, .84);
      sprite.animationSpeed = role === 'archer' ? .12 : .16;
      sprite.roundPixels = true;
      sprite.play();
      sprite.scale.set(role === 'archer' ? .39 : (role === 'spear' ? .40 : .41));
      c.addChild(sprite);

      c._sprite = sprite;
      c._shadow = shadow;
      c._anim = anim;
      c._animKey = 'idle';
      c._role = role;
      c._unit = unit;
      c.__v67PaletteLocked = true;
      c.__v67Team = k.id;
      c.__v672LazyAnim = true;

      if (role === 'spear') {
        const spear = new P.Graphics();
        spear.poly([0, -8, 12, -19]).stroke({ color: 0x8a5e32, width: 1.2 });
        spear.poly([11, -20, 13, -17, 10, -18]).fill({ color: 0xd9e0e4 });
        c.addChild(spear);
        c._weapon = spear;
      }

      idleTask(() => hydrateAnim(this, c, k, unit, 'walk'), 90);
      idleTask(() => hydrateAnim(this, c, k, unit, 'attack'), 280);
      idleTask(() => hydrateAnim(this, c, k, unit, 'hurt'), 520);
      idleTask(() => hydrateAnim(this, c, k, unit, 'death'), 760);
      return c;
    };
  }

  function installNonBlockingTreeBuild(sim, r) {
    if (sim.__v672TreeBuildInstalled) return;
    sim.__v672TreeBuildInstalled = true;
    const oldAddBuilding = sim.addBuilding.bind(sim);

    sim.addBuilding = async function (...args) {
      const pending = window.__TREE_DEPTH_PROMISE;
      const ready = !!window.__TREE_DEPTH_READY;
      if (!pending || ready) return oldAddBuilding(...args);

      // The core addBuilding waits for vegetation initialization. On iPhone this
      // made JOIN appear frozen while vegetation assets/sprites were still being
      // prepared. Buildings can safely proceed; tree-depth now skips occupied cells.
      window.__TREE_DEPTH_PROMISE = null;
      try {
        return await oldAddBuilding(...args);
      } finally {
        window.__TREE_DEPTH_PROMISE = pending;
      }
    };
  }

  function installJoinGuard(sim, r) {
    if (sim.__v672JoinGuardInstalled) return;
    sim.__v672JoinGuardInstalled = true;
    const oldJoin = sim.join.bind(sim);
    sim.join = async function (...args) {
      if (this.__v672JoinBusy) return null;
      this.__v672JoinBusy = true;
      r.__v672PauseGuardsUntil = performance.now() + JOIN_GUARD_DELAY_MS;
      try {
        return await oldJoin(...args);
      } catch (err) {
        console.error('[V6.7.2 JOIN]', err);
        const root = document.querySelector('#toast');
        if (root) {
          const el = document.createElement('div');
          el.className = 'toast';
          el.textContent = 'JOIN recovered — try again';
          root.appendChild(el);
          setTimeout(() => el.remove(), 2200);
        }
        return null;
      } finally {
        this.__v672JoinBusy = false;
        r.__v672PauseGuardsUntil = Math.max(r.__v672PauseGuardsUntil || 0, performance.now() + 220);
      }
    };
  }

  function trimRuntimeCaches(r) {
    // V6.7 could leave duplicate generated unit textures in its second palette cache.
    // New units bypass that cache; clear it once after install to release references.
    if (r.__v67UnitAnim?.clear) r.__v67UnitAnim.clear();
  }

  function install(sim) {
    if (!sim || sim.__v672JoinHotfixInstalled) return;
    const r = sim.r;
    if (!r?.P || !sim.__v671MobileStabilityInstalled || !sim.__v67SiegeLegionsInstalled) {
      setTimeout(() => install(sim), 35);
      return;
    }

    sim.__v672JoinHotfixInstalled = true;
    window.__BUILD_VERSION = VERSION;
    document.documentElement.dataset.battleSystem = 'living-v672-join-hotfix';
    document.documentElement.dataset.joinHotfix = 'nonblocking-trees+lazy-team-anims+guard-delay';
    const tag = document.querySelector('.build-tag');
    if (tag) tag.textContent = 'V6.7.2 JOIN HOTFIX';

    installFastSoldiers(sim, r);
    installNonBlockingTreeBuild(sim, r);
    installJoinGuard(sim, r);
    trimRuntimeCaches(r);
  }

  function wait() {
    const sim = window.__SIM;
    if (!sim || !sim.__v671MobileStabilityInstalled) {
      setTimeout(wait, 30);
      return;
    }
    install(sim);
  }

  wait();
})();
