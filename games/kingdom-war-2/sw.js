const CACHE = 'kw2-auto-war-perf-1';
const SHELL = [
  './', 'index.html', 'styles.css', 'v65-overrides.css',
  'latest/runtime-stability.js', 'asset-recovery.js', 'latest/world-npc-expansion.js', 'game.js',
  'latest/world-base.js', 'latest/world-shape.js', 'latest/flora-loader.js', 'latest/flora.js',
  'living-kingdoms-v65.js', 'v651-ground-contact.js', 'v66-living-battles.js', 'v661-battle-stability.js',
  'interface-v63.js', 'world-effects.js', 'music.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'v67-w1.js', 'v67-w2.js', 'v67-w3.js', 'v67-w4.js', 'v67-w5.js', 'v67-w6.js', 'v67-w7.js',
  'v67-assets-church.js', 'v67-assets-port.js', 'v67-pixel-buildings.js', 'v68-fishing-asset.js', 'v68-fishing-boats.js',
  'latest/war-peace-cleanup.js', 'latest/gameplay.js', 'latest/water-base.js', 'latest/visuals.js', 'latest/farmer-direction.js', 'latest/building-scale.js',
  'latest/live-power.js', 'latest/performance-kernel.js', 'minifolks-world.js',
  'live-prelaunch-surgical.js', 'live-war-expedition-surgical.js', 'live-auto-war-performance.js',
  'assets/map/world.json', 'assets/map/world.png', 'assets/buildings/manifest.json', 'assets/minifolks/manifest.json',
  'assets/vegetation/flora-atlas.part0', 'assets/vegetation/flora-atlas.part1', 'assets/vegetation/flora-atlas.part2', 'assets/vegetation/flora-atlas.part3',
  'assets/buildings/barracks.png', 'assets/buildings/castle.png', 'assets/buildings/church.png', 'assets/buildings/farm.png', 'assets/buildings/forge.png', 'assets/buildings/gate.png',
  'assets/buildings/house_a.png', 'assets/buildings/house_b.png', 'assets/buildings/house_c.png', 'assets/buildings/keep.png', 'assets/buildings/market.png', 'assets/buildings/silo.png',
  'assets/buildings/stable.png', 'assets/buildings/stone_tower.png', 'assets/buildings/wall.png', 'assets/buildings/wall_corner.png', 'assets/buildings/warehouse.png', 'assets/buildings/watchtower.png', 'assets/buildings/windmill.png',
  'assets/minifolks/villagers/MiniNobleMan.png', 'assets/minifolks/villagers/MiniNobleWoman.png', 'assets/minifolks/villagers/MiniOldMan.png', 'assets/minifolks/villagers/MiniOldWoman.png',
  'assets/minifolks/villagers/MiniPeasant.png', 'assets/minifolks/villagers/MiniPrincess.png', 'assets/minifolks/villagers/MiniQueen.png', 'assets/minifolks/villagers/MiniVillagerMan.png',
  'assets/minifolks/villagers/MiniVillagerWoman.png', 'assets/minifolks/villagers/MiniWorker.png',
  'assets/minifolks/humans/MiniArcherMan.png', 'assets/minifolks/humans/MiniArchMage.png', 'assets/minifolks/humans/MiniCavalierMan.png', 'assets/minifolks/humans/MiniCrossBowMan.png',
  'assets/minifolks/humans/MiniHalberdMan.png', 'assets/minifolks/humans/MiniHorseMan.png', 'assets/minifolks/humans/MiniKingMan.png', 'assets/minifolks/humans/MiniMage.png',
  'assets/minifolks/humans/MiniPrinceMan.png', 'assets/minifolks/humans/MiniShieldMan.png', 'assets/minifolks/humans/MiniSpearMan.png', 'assets/minifolks/humans/MiniSwordMan.png',
  'assets/minifolks/animals/MiniBear.png', 'assets/minifolks/animals/MiniBird.png', 'assets/minifolks/animals/MiniBoar.png', 'assets/minifolks/animals/MiniBunny.png',
  'assets/minifolks/animals/MiniDeer1.png', 'assets/minifolks/animals/MiniDeer2.png', 'assets/minifolks/animals/MiniFox.png', 'assets/minifolks/animals/MiniWolf.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(SHELL.map(url => cache.add(url)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('kw2-') && k !== CACHE).map(k => caches.delete(k))))
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
