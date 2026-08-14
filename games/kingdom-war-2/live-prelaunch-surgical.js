(() => {
  'use strict';

  const VERSION = '20260814-live-prelaunch-3';
  const BLOCKED_PREFABS = new Set(['stable', 'forge']);
  const HIDDEN_RENDER_PREFABS = new Set(['warehouse']);
  const HUMAN_MILITARY_VISUALS = Object.freeze({
    archer: Object.freeze(['ArcherMan', 'CrossBowMan', 'Mage', 'ArchMage']),
    spear: Object.freeze(['SpearMan', 'HalberdMan', 'ShieldMan', 'CavalierMan']),
    sword: Object.freeze(['SwordMan', 'HorseMan', 'KingMan', 'PrinceMan'])
  });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  if (window.__KW2_LIVE_PRELAUNCH_PATCH?.installed) return;

  function sameWar(war, a, b) {
    return !!war && !war.done && (
      (war.a === a.id && war.b === b.id) ||
      (war.a === b.id && war.b === a.id)
    );
  }

  function installHumanMilitaryVariety(sim) {
    const r = sim?.r;
    if (!r || typeof r.makeSoldier !== 'function' || typeof r.getMinifolkFrames !== 'function') return false;

    const originalMakeSoldier = r.makeSoldier.bind(r);
    r.__kw2LiveMilitaryVisualSeq ||= new Map();

    r.makeSoldier = function(kingdom, role) {
      const combatRole = role === 'archer' ? 'archer' : (role === 'spear' ? 'spear' : 'sword');
      const roster = HUMAN_MILITARY_VISUALS[combatRole];
      const kingdomId = Number(kingdom?.id) || 0;
      const sequenceKey = `${kingdomId}:${combatRole}`;
      const sequence = Number(this.__kw2LiveMilitaryVisualSeq.get(sequenceKey) || 0);
      const unit = roster[(sequence + kingdomId * 2) % roster.length];
      this.__kw2LiveMilitaryVisualSeq.set(sequenceKey, sequence + 1);

      const P = this.P;
      if (!P?.Container || !P?.Graphics || !P?.AnimatedSprite) return originalMakeSoldier(kingdom, role);

      const anim = {
        idle: this.getMinifolkFrames('humans', unit, 'idle', kingdom),
        walk: this.getMinifolkFrames('humans', unit, 'walk', kingdom),
        attack: this.getMinifolkFrames('humans', unit, 'attack', kingdom),
        hurt: this.getMinifolkFrames('humans', unit, 'hurt', kingdom),
        death: this.getMinifolkFrames('humans', unit, 'death', kingdom)
      };
      const initialFrames = anim.idle?.length ? anim.idle : (anim.walk?.length ? anim.walk : anim.attack);
      if (!initialFrames?.length) return originalMakeSoldier(kingdom, role);

      const container = new P.Container();
      const shadow = new P.Graphics();
      shadow.ellipse(0, 1, 7, 3).fill({ color: 0x000000, alpha: .22 });
      container.addChild(shadow);

      const sprite = new P.AnimatedSprite(initialFrames);
      sprite.anchor.set(.5, 1);
      sprite.animationSpeed = combatRole === 'archer' ? .12 : .16;
      sprite.play();
      sprite.scale.set(combatRole === 'archer' ? 0.62 : (combatRole === 'spear' ? 0.64 : 0.63));
      container.addChild(sprite);

      container._sprite = sprite;
      container._shadow = shadow;
      container._anim = anim;
      container._animKey = 'idle';
      container._role = combatRole;
      container._unit = unit;
      container.scale.set(1);

      this.__kw2SoldierTypes ||= new Set();
      this.__kw2SoldierTypes.add(unit);
      this.__kw2SoldiersCreated = Number(this.__kw2SoldiersCreated || 0) + 1;
      document.documentElement.dataset.minifolksSoldierTypes = [...this.__kw2SoldierTypes].join(',');
      document.documentElement.dataset.minifolksSoldiersCreated = String(this.__kw2SoldiersCreated);
      return container;
    };

    return true;
  }

  async function install() {
    // Install after the existing late runtime wrappers so this remains the final,
    // narrow pre-live policy layer and does not alter their implementation.
    for (let i = 0; i < 2400; i++) {
      const sim = window.__SIM;
      const runtimeReady = !!(
        sim?.r &&
        typeof sim.warAI === 'function' &&
        typeof sim.addBuilding === 'function' &&
        typeof sim.r.addBuilding === 'function' &&
        typeof sim.r.makeSoldier === 'function' &&
        typeof sim.r.getMinifolkFrames === 'function' &&
        window.__V70_WAR_PEACE_CLEANUP?.installed &&
        window.__V707_GAMEPLAY_POLISH?.installed &&
        window.__V713_LIVE_POWER?.installed &&
        window.__V800_PERFORMANCE_KERNEL?.installed
      );
      if (runtimeReady) break;
      await sleep(25);
    }

    const sim = window.__SIM;
    if (!sim?.r || typeof sim.warAI !== 'function' || typeof sim.addBuilding !== 'function') {
      throw new Error('Kingdom War 2 simulation unavailable for live prelaunch patch');
    }
    if (sim.__kw2LivePrelaunchPatch === VERSION) return;

    // Warehouse must still exist logically because buildAI uses it for normal
    // progression/economy. Suppress only its renderer so the unwanted prefab
    // never appears while all simulation counts and costs keep working unchanged.
    const originalRenderBuilding = typeof sim.r.addBuilding === 'function'
      ? sim.r.addBuilding.bind(sim.r)
      : null;
    if (originalRenderBuilding) {
      sim.r.addBuilding = function(kingdom, building, ...rest) {
        const normalized = String(building?.type ?? '').trim().toLowerCase();
        if (HIDDEN_RENDER_PREFABS.has(normalized)) {
          if (building) building.__kw2RenderSuppressed = true;
          return Promise.resolve(building);
        }
        return originalRenderBuilding(kingdom, building, ...rest);
      };
    }

    const originalAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = function(kingdom, type, ...rest) {
      const normalized = String(type ?? '').trim().toLowerCase();
      if (BLOCKED_PREFABS.has(normalized)) return null;
      return originalAddBuilding(kingdom, type, ...rest);
    };

    // No random wars in LIVE. Explicit ATTACK is preserved: attack() sets
    // kingdom.aggressive, expansion advances toward that target, and this method
    // starts the war only when those explicitly targeted kingdoms share a border.
    sim.warAI = function() {
      if (this.matchOver) return false;

      for (const kingdom of this.kingdoms || []) {
        if (!kingdom?.alive || kingdom.aggressive == null) continue;

        const target = this.kingdoms?.[kingdom.aggressive];
        if (!target?.alive || target === kingdom || this.areAllied?.(kingdom, target)) {
          kingdom.aggressive = null;
          continue;
        }

        if ((this.wars || []).some(war => sameWar(war, kingdom, target))) continue;
        if (this.borderPair?.(kingdom, target)) this.startWar?.(kingdom, target);
      }
      return true;
    };

    const humanMilitaryVariety = installHumanMilitaryVariety(sim);

    sim.__kw2LivePrelaunchPatch = VERSION;
    window.__KW2_LIVE_PRELAUNCH_PATCH = Object.freeze({
      installed: true,
      version: VERSION,
      randomAutomaticWars: false,
      explicitAttackPreserved: true,
      blockedPrefabs: Object.freeze(['stable', 'forge']),
      hiddenRenderPrefabs: Object.freeze(['warehouse']),
      castleEliminationCleanupPreserved: true,
      visibleArmyCaps: Object.freeze({ peace: 8, war: 12 }),
      humanMilitaryVariety,
      humanMilitaryVisuals: Object.freeze([
        'SwordMan', 'SpearMan', 'ShieldMan', 'HalberdMan',
        'ArcherMan', 'CrossBowMan', 'HorseMan', 'CavalierMan',
        'Mage', 'ArchMage', 'KingMan', 'PrinceMan'
      ])
    });
    document.documentElement.dataset.kw2LivePrelaunch = VERSION;
  }

  install().catch(error => {
    window.__KW2_LIVE_PRELAUNCH_PATCH_ERROR = String(error?.stack || error?.message || error);
    console.error('[Kingdom War 2 live prelaunch]', error);
  });
})();
