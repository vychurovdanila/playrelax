const CACHE_NAME = 'playrelax-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './particles.js',
  './tetris.js',
  './match3.js',
  './gestures.js',
  './onboarding.js',
  './video.js',
  './audio.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
