// Caches the app so it works offline once installed to the home screen.
const CACHE = 'dino-v1';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'dinos.js', 'worker.js', 'icon.png',
  'manifest.json', 'vendor/three.module.js', 'vendor/controls/OrbitControls.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Network first so updates show up when online; cache as fallback offline.
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
