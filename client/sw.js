// Сервис-воркер «В Точку»: игру можно установить как приложение, и она открывается, даже пока сервер спит.
// Сначала сеть (свежая версия), но если сервер не ответил за 2,5 с или вместо игры прислал чужую страницу
// (например, заставку хостинга, пока сервер просыпается) — берём сохранённую копию, а игра сама покажет экран загрузки.
const CACHE = 'vtochku-v36';
const SHELL = ['/', '/style.css', '/client.js', '/cards.js', '/cards-light.js', '/cards-sil.js', '/cards-royal.js', '/room-cozy.js', '/room-office.js', '/room-picnic.js', '/i18n.js', '/brand.js', '/viewport.js', '/fx.js', '/qrcode.js', '/voice.js', '/music.js', '/engine.js', '/tutorial.js', '/manifest.webmanifest', '/icons/icon-192.png', '/img/logo.webp?v=1'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
// Файлы игры с сервера помечены заголовком X-VT; со статического хостинга заголовка нет — там проверяем только код ответа.
const fromGameServer = () => location.hostname === 'pousham.onrender.com' || location.hostname === 'localhost';
const genuine = res => res && res.ok && (!fromGameServer() || res.headers.get('X-VT') === '1');
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/health' || url.pathname.startsWith('/music/')) return; // музыку кэширует сам браузер
  const cached = () => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('/') : null));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const net = fetch(e.request).then(res => {
      if (genuine(res)) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        finish(res);
        return;
      }
      return cached().then(r => finish(r || res));
    }).catch(() => cached().then(r => finish(r || Response.error())));
    // Сервер долго молчит (просыпается) — отдаём сохранённую копию, если она есть.
    setTimeout(() => { if (!done) cached().then(r => { if (r) finish(r); else net.then(() => {}); }); }, 2500);
  }));
});
