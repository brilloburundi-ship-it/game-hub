(() => {
  'use strict';

  const VERSION = '6.6-ground-contact';

  function removeFloatingBase(building, renderer) {
    if (!building) return;

    // No platform, diamond or detached contact shadow. The artwork itself now
    // meets the terrain, which reads much better at phone zoom levels.
    if (building._foundation) {
      building._foundation.visible = false;
      building._foundation.alpha = 0;
    }
    if (building._shadow) {
      building._shadow.visible = false;
      building._shadow.alpha = 0;
    }

    if (building._sprite) {
      building._sprite.y = Math.round(building.sy + (building.type === 'farm' ? 0 : 1));
      building._sprite.roundPixels = true;
    }

    // Canvas fallback keeps the rendered entity on the exact same baseline.
    if (Array.isArray(renderer?.entities)) {
      const entity = renderer.entities.find(entry => entry?.b === building);
      if (entity) entity.y = Math.round(building.sy + 1);
    }
  }

  function enforceKingdoms(sim) {
    for (const kingdom of sim.kingdoms || []) {
      for (const building of kingdom.buildings || []) removeFloatingBase(building, sim.r);
    }
  }

  function install(sim) {
    if (!sim || sim.__v66GroundContactInstalled) return;
    sim.__v66GroundContactInstalled = true;
    window.__BUILD_VERSION = VERSION;

    enforceKingdoms(sim);

    const previousAddBuilding = sim.addBuilding.bind(sim);
    sim.addBuilding = async function (...args) {
      const building = await previousAddBuilding(...args);
      if (building) {
        removeFloatingBase(building, this.r);
      }
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
