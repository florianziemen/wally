// Wally service worker: keeps the app usable offline.
// Serves files from the cache first, then quietly fetches fresh copies,
// so an update you upload appears on the next launch after it's fetched.
const CACHE = 'wally-v4';
const FILES = [
  './',
  './index.html',
  './app.css',
  './js/main.js',
  './js/feedback.js',
  './js/fight.js',
  './js/format.js',
  './js/groups.js',
  './js/log.js',
  './js/motivation.js',
  './js/seasons.js',
  './js/settings.js',
  './js/stats.js',
  './js/storage.js',
  './js/store.js',
  './js/workout.js',
  './js/ui/backup-view.js',
  './js/ui/dom.js',
  './js/ui/fight-view.js',
  './js/ui/groups-view.js',
  './js/ui/history-view.js',
  './js/ui/settings-view.js',
  './js/ui/timer-view.js',
  './js/ui/wallaby-view.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './wallaby.svg',
  './zombie.svg',
  './outfits/cricket.svg',
  './outfits/easter-eggs.svg',
  './outfits/helmet.svg',
  './outfits/party-hat.svg',
  './outfits/rainbow.svg',
  './outfits/santa-hat.svg',
  './outfits/witch-hat.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Fetch a fresh copy in the background and store it for next time.
  const fresh = fetch(req)
    .then((res) => {
      if (!res || !res.ok) return res;
      const copy = res.clone();
      return caches
        .open(CACHE)
        .then((cache) => cache.put(req, copy))
        .then(() => res);
    })
    .catch(() => null);
  event.waitUntil(fresh);

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fresh.then((res) => {
        if (res) return res;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    }),
  );
});
