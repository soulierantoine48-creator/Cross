const CACHE='cross-college-v33';
const LOCAL=['/icon-180.png','/index.html','/styles.css','/app.js','/manifest.webmanifest','/apple-touch-icon.png','/favicon.png','/bib-v0.js','/bib-v1.js','/bib-v2.js','/bib-v3.js','/bib-v4.js','/bib-v5.js'];
const EXTERNAL=[
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@3.0.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.2/dist/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.12.1/dist/JsBarcode.all.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(LOCAL);
  await Promise.all(EXTERNAL.map(async url=>{
    try{const response=await fetch(url,{mode:'no-cors'});await cache.put(url,response);}catch(_){}
  }));
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('cross-college-')&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);

  // La navigation doit être réseau d'abord : Safari reçoit toujours le HEAD/PWA le plus récent.
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await fetch(event.request,{cache:'no-store'});
        if(response.ok) await cache.put('/index.html',response.clone());
        return response;
      }catch(_){
        return (await cache.match('/index.html')) || new Response('Hors connexion',{status:503});
      }
    })());
    return;
  }

  // Manifest : réseau d'abord pour éviter une ancienne identité PWA.
  if(url.origin===self.location.origin && url.pathname==='/manifest.webmanifest'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await fetch(event.request,{cache:'no-store'});
        if(response.ok) await cache.put('/manifest.webmanifest',response.clone());
        return response;
      }catch(_){
        return (await cache.match('/manifest.webmanifest')) || new Response('{}',{headers:{'Content-Type':'application/manifest+json'}});
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(event.request,{ignoreSearch:url.origin===self.location.origin});
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