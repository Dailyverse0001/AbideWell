/* Abidewell — offline shell. Bump CACHE when you change the design. */
const CACHE = 'abidewell-v4';
const ROOT = self.registration.scope;

const SHELL = [
  './',
  'index.html',
  'archive.html',
  'admin.html',
  'assets/styles.css',
  'assets/config.js',
  'assets/app.js',
  'assets/archive.js',
  'assets/admin.js',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'manifest.webmanifest'
].map((path) => new URL(path, ROOT).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  /* Verse data: always try the network first so a new post shows up. */
  if (url.pathname.endsWith('/data/verses.json')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  /* Pages and assets: cache first, then network. */
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;

      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') return caches.match(new URL('index.html', ROOT).href);
          return Response.error();
        });
    })
  );
});
