const CACHE_NAME = 'marvel-chat-v2-cache-v1';

const ASSETS_TO_PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/responsive.css',
  './js/app.js',
  './js/state.js',
  './js/router.js',
  './js/firebase/config.js',
  './js/firebase/auth.js',
  './js/firebase/firestore.js',
  './js/firebase/listeners.js',
  './js/features/home.js',
  './js/features/chat.js',
  './js/features/market.js',
  './js/features/profile.js',
  './js/features/notifications.js',
  './js/features/search.js',
  './js/features/settings.js',
  './js/features/timetrust.js',
  './js/components/modal.js',
  './js/components/toast.js',
  './js/components/loader.js',
  './js/components/avatar.js',
  './pwa/install.js',
  './pwa/updates.js',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_PRECACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip cross-origin requests, Firebase APIs, and Firestore real-time connections
  if (
    url.origin !== location.origin ||
    url.pathname.includes('/firestore.googleapis.com') ||
    url.pathname.includes('/identitytoolkit') ||
    url.pathname.includes('/securetoken')
  ) {
    return;
  }

  // Network-first strategy for documents/HTML, cache-first for static assets
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
});
