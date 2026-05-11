/* ============================================================
   Service Worker — Wedding Check-in PWA
   Caches the app shell for fast loading.
   API calls are always fetched from network (never cached).
   ============================================================ */

const CACHE_NAME = 'wedding-checkin-v19';

// App shell files to cache on install
const SHELL_FILES = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // External CDN scripts cached on first use
];

// ── Install: cache app shell ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for shell ───────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always go to network for API calls and socket.io
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for app shell
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
