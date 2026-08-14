const CACHE_NAME = 'marvel-chat-v2-cache-v2';

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
  './js/features /home.js',
  './js/features /chat.js',
  './js/features /market.js',
  './js/features /profile.js',
  './js/features /notifications.js',
  './js/features /search.js',
  './js/features /settings.js',
  './js/features /timetrust.js',
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
    caches.open(CACHE_NAME).then(async cache => {
      for (const asset of ASSETS_TO_PRECACHE) {
        try {
          const response = await fetch(asset);
          if (response && response.ok) {
            await cache.put(asset, response);
          } else {
            console.warn(`[ServiceWorker] Precache skipped for invalid response: ${asset} (status: ${response ? response.status : 'no response'})`);
          }
        } catch (err) {
          console.warn(`[ServiceWorker] Failed to fetch and cache asset during install: ${asset}`, err);
        }
      }
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

// Handle incoming Web Push notifications (FCM background messages)
self.addEventListener('push', event => {
  let data = { title: 'Marvel Chat', body: 'New notification received.', icon: './assets/icon-192.png' };
  try {
    if (event.data) {
      const payload = event.data.json();
      data.title = payload.notification?.title || payload.data?.title || data.title;
      data.body = payload.notification?.body || payload.data?.body || data.body;
      data.icon = payload.notification?.icon || data.icon;
    }
  } catch (e) {
    console.error('Push parse error:', e);
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: './assets/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: self.location.origin }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
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
