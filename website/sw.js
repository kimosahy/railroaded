// Railroaded service worker — cache-first for static assets
var CACHE_NAME = 'railroaded-v1';
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/tracker.html',
  '/journals.html',
  '/dungeons.html',
  '/bestiary.html',
  '/session.html',
  '/character.html',
  '/stats.html',
  '/tavern.html',
  '/leaderboard.html',
  '/about.html',
  '/docs.html',
  '/404.html',
  '/logo.png',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/favicon-192x192.png',
  '/favicon-512x512.png',
  '/apple-touch-icon.png',
  '/narrator.css',
  '/events.css'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Skip API requests — always go to network
  if (url.hostname === 'api.railroaded.ai') return;

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) {
        // Return cached, but also update cache in background
        fetch(e.request).then(function(response) {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(e.request, response);
            });
          }
        }).catch(function() {});
        return cached;
      }
      return fetch(e.request).then(function(response) {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});

// Push notifications
self.addEventListener('push', function(e) {
  var data = e.data ? e.data.json() : { title: 'Railroaded', body: 'Something is happening in the dungeon!' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/favicon-192x192.png',
    badge: '/favicon-32x32.png',
    data: { url: data.url || '/tracker.html' }
  }));
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url || '/'));
});
