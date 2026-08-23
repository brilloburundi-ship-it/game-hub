const CACHE = "game-hub-studio-v6-world-conflict-refresh";
const SHELL = [
  "./",
  "./index.html",
  "./src/studio.css",
  "./src/studio.js",
  "./src/account.css",
  "./src/account-client.js",
  "./src/github.js",
  "./data/projects.json",
  "./data/runtime-config.json",
  "./assets/icon.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("game-hub-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Never let the Game Hub shell service worker replace a game document or
  // game asset with the studio index. Each game must load its real deployed
  // files, otherwise iOS/PWA previews can appear to stop launching every game.
  if (url.origin === self.location.origin && url.pathname.includes("/games/")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  if (url.hostname === "api.github.com") return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const match = await caches.match(event.request);
        if (match) return match;
        if (event.request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
