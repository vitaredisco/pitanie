/* Service worker — кэширует приложение для офлайн-работы.
   Данные пользователя тут не хранятся (они в localStorage), только сами файлы. */
const CACHE = 'pitanie-v14';
const ASSETS = [
  './', './index.html', './app.js', './engine.js', './foods.js', './exercises.js', './musclemap.js',
  './vendor/zxing.min.js', './vendor/tesseract.min.js',
  './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Сеть-в-приоритете: всегда пробуем свежую версию, офлайн — из кэша.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
