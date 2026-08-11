(() => {
  'use strict';

  const VERSION = '6.5.1-ground-contact';

  function removeFloatingBase(building, renderer) {
    if (!building) return;

    // The old diamond/foundation underneath the artwork made buildings look
    // as if they were standing on a platform. Hide it completely.
    if (building._foundation) {
      building._foundation.visible = false;
      building._foundation.alpha = 0;
    }

    // Keep only a very small contact shadow so the sprite visually touches
    // the terrain instead of hovering above it.
    if (building._shadow) {
      building._shadow.visible = true;
      building._shadow.y = Math.round(building.sy + 1);
      building._shadow.alpha = 0.24;
      building._shadow.scale.x = 0.68;
      building._shadow.scale.y = 0.20;
    }

    if (building._sprite) {
      building._sprite.y = Math.round(building.sy + (building.type === 'farm' ? 0 : 1));
      building._sprite.roundPixels = true;
    }

    // Canvas compatibility mode has no separate Pixi foundation objects; keep
    // its entity at the same ground contact point.
    if (Array.isArray(renderer?.entities)) {
      const entity = renderer.entities.find(entry => entry?.b === building);
      if (entity) entity.y = Math.round(building.sy + 1);
    }
  }

  function install(sim) {
    if (!sim || sim.__v651GroundContactInstalled) return;
    sim.__v651GroundContactInstalled = true;
    window.__BUILD_VERSION = VERSION;

    for (const kingdom of sim.kingdoms || []) {
      for (const building of kingdom.buildings || []) removeFloatingBase(building, sim.r);
    }

    const previousAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = async function (...args) {
      const building = await previousAddBuilding(...args);
      if (building) removeFloatingBase(building, this.r);
      return building;
    };
  }

  function wait() {
    const sim = window.__SIM;
    if (!sim || !sim.__v65Installed) {
      setTimeout(wait, 25);
      return;
    }
    install(sim);
  }

  wait();
})();
