// Сервис-воркер «В Точку»: позволяет установить игру как приложение.
// Сначала сеть (всегда свежая версия), кэш — только если связи нет.
const CACHE = 'vtochku-v1';
const SHELL = ['/', '/style.css', '/client.js', '/cards.js', '/cards-light.js', '/brand.js', '/fx.js', '/qrcode.js', '/voice.js', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('/'))));
});
