const cacheName='po-mobile-store-v2';
const files=['./','index.html','scanner.css','phone.js','common.js','install.js','vendor/html5-qrcode.min.js','icon-192.png','icon-512.png','manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(cacheName).then(c=>c.addAll(files)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(hit=>hit || (e.request.mode==='navigate'?caches.match(new URL('./',self.registration.scope)):Response.error()))));
});