const CACHE='world-kingdoms-live-2';
const SHELL=['./','index.html','styles.css','game.js','manifest.webmanifest','version.json','../kingdom-war-2/assets/buildings/manifest.json','../kingdom-war-2/assets/minifolks/manifest.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>Promise.allSettled(SHELL.map(path=>cache.add(path)))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('world-kingdoms-live-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response;}).catch(()=>caches.match(event.request,{ignoreSearch:true})));});
