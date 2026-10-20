const CACHE='pet15-pet-library-themes-1';
const FILES=['./','./index.html','./style.css?v=pet-library-themes-1','./engine.js?v=pet-mixed-scenes-1','./app.js?v=pet-library-themes-1','./words.json?v=pet-mixed-scenes-1','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./LICENSE-ECDICT.txt'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('pet15-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>r.ok&&!r.redirected?r:caches.match('./index.html').then(x=>x||r)).catch(()=>caches.match('./index.html')));return;}
 e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request)));
});
