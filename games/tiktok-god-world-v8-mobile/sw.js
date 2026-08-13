const CACHE = 'kingdom-war-v8-0-5-mobile-1';
const SHELL = [
  './', 'index.html', 'styles.css', 'v65-overrides.css',
  'latest/runtime-stability.js', 'asset-recovery.js', 'latest/world-npc-expansion.js', 'game.js',
  'latest/world-base.js', 'latest/world-shape.js', 'latest/flora-loader.js', 'latest/flora.js',
  'living-kingdoms-v65.js', 'v651-ground-contact.js', 'v66-living-battles.js', 'v661-battle-stability.js',
  'interface-v63.js', 'world-effects.js', 'music.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'v67-w1.js', 'v67-w2.js', 'v67-w3.js', 'v67-w4.js', 'v67-w5.js', 'v67-w6.js', 'v67-w7.js',
  'v67-assets-church.js', 'v67-assets-port.js', 'v67-pixel-buildings.js', 'v68-fishing-asset.js', 'v68-fishing-boats.js',
  'latest/war-peace-cleanup.js', 'latest/gameplay.js', 'latest/water-base.js', 'latest/visuals.js', 'latest/farmer-direction.js', 'latest/building-scale.js',
  'latest/live-power.js', 'latest/performance-kernel.js',
  'assets/map/world.json', 'assets/map/world.png', 'assets/buildings/manifest.json', 'assets/npc/manifest.json',
  'assets/vegetation/flora-atlas.part0', 'assets/vegetation/flora-atlas.part1', 'assets/vegetation/flora-atlas.part2', 'assets/vegetation/flora-atlas.part3',
  'assets/buildings/barracks.png', 'assets/buildings/castle.png', 'assets/buildings/church.png', 'assets/buildings/farm.png', 'assets/buildings/forge.png', 'assets/buildings/gate.png',
  'assets/buildings/house_a.png', 'assets/buildings/house_b.png', 'assets/buildings/house_c.png', 'assets/buildings/keep.png', 'assets/buildings/market.png', 'assets/buildings/silo.png',
  'assets/buildings/stable.png', 'assets/buildings/stone_tower.png', 'assets/buildings/wall.png', 'assets/buildings/wall_corner.png', 'assets/buildings/warehouse.png', 'assets/buildings/watchtower.png', 'assets/buildings/windmill.png',
  'assets/npc/idle.png', 'assets/npc/walk_down.png', 'assets/npc/walk_up.png', 'assets/npc/walk_left.png', 'assets/npc/walk_right.png', 'assets/npc/harvest.png', 'assets/npc/water.png',
  'assets/npc/pickaxe.png', 'assets/npc/dig.png', 'assets/npc/chop_wood.png', 'assets/npc/carry_sack.png',
  'assets/units/knight_idle.png', 'assets/units/knight_walk.png', 'assets/units/knight_attack.png', 'assets/units/knight_hurt.png', 'assets/units/knight_death.png',
  'assets/units/archer_idle.png', 'assets/units/archer_walk.png', 'assets/units/archer_attack.png', 'assets/units/archer_hurt.png', 'assets/units/archer_death.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(SHELL.map(url => cache.add(url)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => (k.startsWith('god-world-') || k.startsWith('kingdom-war-')) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response && response.ok) cache.put(event.request, response.clone()).catch(() => {});
      if (response && response.ok) return response;
      return (await cache.match(event.request, { ignoreSearch: true })) || response;
    } catch (err) {
      const hit = await cache.match(event.request, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
