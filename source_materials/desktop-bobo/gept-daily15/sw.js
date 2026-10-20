const CACHE='gept15-gept-verb-audit-1';
const FILES=['./verb-answers.html','./verb-answers.csv','./','./index.html','./style.css?v=gept-library-themes-1','./engine.js?v=gept-verb-audit-1','./app.js?v=gept-verb-audit-1','./words.json?v=gept-verb-audit-1','./manifest-monster-v2.webmanifest','./manifest.webmanifest','./icon-monster-192.png','./icon-monster-512.png','./gept-monster.png','./LICENSE-ECDICT.txt'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gept15-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>r.ok&&!r.redirected?r:caches.match('./index.html').then(x=>x||r)).catch(()=>caches.match('./index.html')));return;}
 e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request)));
});
