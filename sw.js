const CACHE = 'cross-college-v15';
const LOCAL = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon-180.png','./apple-touch-icon.png','./cross-logo-v2.png','./cross-apple-touch-icon-v2.png','./bib-v0.js','./bib-v1.js','./bib-v2.js','./bib-v3.js','./bib-v4.js','./bib-v5.js'];
const EXTERNAL = [
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@3.0.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.2/dist/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.12.1/dist/JsBarcode.all.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install', event => event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(LOCAL);
  await Promise.all(EXTERNAL.map(async url=>{
    try{
      const response=await fetch(url,{mode:'no-cors'});
      await cache.put(url,response);
    }catch(_){}
  }));
  await self.skipWaiting();
})()));

self.addEventListener('activate', event => event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);

    // Jour J : priorité au cache local pour ne jamais attendre une 4G faible.
    if(url.origin===self.location.origin){
      const cached=await cache.match(event.request);
      if(cached){
        event.waitUntil(fetch(event.request).then(r=>{if(r.ok) return cache.put(event.request,r.clone());}).catch(()=>{}));
        return cached;
      }
      try{
        const response=await fetch(event.request);
        if(response.ok) await cache.put(event.request,response.clone());
        return response;
      }catch(_){
        if(event.request.mode==='navigate') return cache.match('./index.html');
        return new Response('Hors connexion',{status:503,statusText:'Offline'});
      }
    }

    // Bibliothèques externes : cache d'abord, réseau en secours.
    const cached=await cache.match(event.request);
    if(cached) return cached;
    try{
      const response=await fetch(event.request);
      if(response.ok||response.type==='opaque') await cache.put(event.request,response.clone());
      return response;
    }catch(_){
      return new Response('Hors connexion',{status:503,statusText:'Offline'});
    }
  })());
});