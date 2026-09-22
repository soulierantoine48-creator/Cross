const CACHE = 'cross-college-v3';
const LOCAL = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest'];
const EXTERNAL = [
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@3.0.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.2/dist/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.12.1/dist/JsBarcode.all.min.js'
];
self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(LOCAL);
  await Promise.all(EXTERNAL.map(async url => {
    try {
      const response = await fetch(url, { mode: 'no-cors' });
      await cache.put(url, response);
    } catch (_) {}
  }));
  await self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
    return res;
  })));
});
