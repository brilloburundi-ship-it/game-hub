const CACHE = 'god-world-v6-6-living-battles';
const SHELL = [
  './', 'index.html', 'styles.css', 'v65-overrides.css', 'game.js', 'living-kingdoms-v65.js', 'v651-ground-contact.js', 'v66-living-battles.js', 'tree-depth.js',
  'interface-v63.js', 'world-effects.js', 'music.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png'
];

// Do not let a single protected/401 asset break service-worker installation.
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

// Network-first during active development. Cache only successful 2xx responses.
// Crucially, 401/403 responses are NEVER persisted.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response && response.ok) {
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch (err) {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      throw err;
    }
  })());
});
