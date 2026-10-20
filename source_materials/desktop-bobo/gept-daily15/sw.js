const CACHE='gept15-v1.0.5';
const FILES=['./','./index.html','./style.css?v=1.0.5','./engine.js?v=1.0.4','./app.js?v=1.0.4','./words.json','./manifest.webmanifest','./icon-monster-192.png','./icon-monster-512.png','./gept-monster.png','./LICENSE-ECDICT.txt'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gept15-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>r.ok&&!r.redirected?r:caches.match('./index.html').then(x=>x||r)).catch(()=>caches.match('./index.html')));return;}
 e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request)));
});
