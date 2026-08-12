const CACHE = 'god-world-stable-integrated-island-style-3';
const SHELL = [
  './', 'index.html', 'styles.css', 'v65-overrides.css', 'asset-recovery.js', 'game.js', 'living-kingdoms-v65.js', 'v66-living-battles.js', 'v661-battle-stability.js', 'tree-depth.js',
  'interface-v63.js', 'world-effects.js', 'music.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'assets/map/world.json', 'assets/map/world.png', 'assets/map/vegetation.json', 'assets/buildings/manifest.json', 'assets/npc/manifest.json',
  'assets/buildings/barracks.png', 'assets/buildings/castle.png', 'assets/buildings/church.png', 'assets/buildings/farm.png', 'assets/buildings/forge.png', 'assets/buildings/gate.png',
  'assets/buildings/house_a.png', 'assets/buildings/house_b.png', 'assets/buildings/house_c.png', 'assets/buildings/keep.png', 'assets/buildings/market.png', 'assets/buildings/silo.png',
  'assets/buildings/stable.png', 'assets/buildings/stone_tower.png', 'assets/buildings/wall.png', 'assets/buildings/wall_corner.png', 'assets/buildings/warehouse.png', 'assets/buildings/watchtower.png', 'assets/buildings/windmill.png',
  'assets/npc/idle.png', 'assets/npc/walk_down.png', 'assets/npc/walk_up.png', 'assets/npc/walk_left.png', 'assets/npc/walk_right.png', 'assets/npc/harvest.png', 'assets/npc/water.png',
  'assets/npc/pickaxe.png', 'assets/npc/dig.png', 'assets/npc/chop_wood.png', 'assets/npc/carry_sack.png',
  'assets/units/knight_idle.png', 'assets/units/knight_walk.png', 'assets/units/knight_attack.png', 'assets/units/knight_hurt.png', 'assets/units/knight_death.png',
  'assets/units/archer_idle.png', 'assets/units/archer_walk.png', 'assets/units/archer_attack.png', 'assets/units/archer_hurt.png', 'assets/units/archer_death.png',
  'assets/vegetation/pine.png', 'assets/vegetation/pine-snow.png', 'assets/vegetation/round.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('god-world-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response?.ok) cache.put(event.request, response.clone()).catch(() => {});
      if (response?.ok) return response;
      return (await cache.match(event.request, { ignoreSearch: true })) || response;
    } catch (error) {
      const hit = await cache.match(event.request, { ignoreSearch: true });
      if (hit) return hit;
      throw error;
    }
  })());
});
