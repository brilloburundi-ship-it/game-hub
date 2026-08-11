const CACHE = "game-hub-studio-v3";
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
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.hostname === "api.github.com" || event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(match => match || caches.match("./index.html")))
  );
});
