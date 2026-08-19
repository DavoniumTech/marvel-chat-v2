const CACHE_NAME = 'marvel-chat-v2-cache-v4';

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

  /*
   * Existing entries preserved exactly.
   */
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
  './assets/icon-512.png',

  /*
   * Correct feature paths added in addition to
   * the existing entries above.
   */
  './js/features/home.js',
  './js/features/chat.js',
  './js/features/market.js',
  './js/features/profile.js',
  './js/features/notifications.js',
  './js/features/search.js',
  './js/features/settings.js',
  './js/features/timetrust.js'
];


/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener('install', event => {

  event.waitUntil(

    caches.open(CACHE_NAME)

      .then(async cache => {

        for (
          const asset of ASSETS_TO_PRECACHE
        ) {

          try {

            const response =
              await fetch(
                asset,
                {
                  cache: 'no-cache'
                }
              );


            if (
              response &&
              response.ok
            ) {

              await cache.put(
                asset,
                response
              );

            } else {

              console.warn(
                `[ServiceWorker] Precache skipped for invalid response: ${asset} (status: ${response ? response.status : 'no response'})`
              );

            }

          } catch (err) {

            /*
             * One missing asset must NOT stop the
             * entire service worker installation.
             */

            console.warn(
              `[ServiceWorker] Failed to fetch and cache asset during install: ${asset}`,
              err
            );

          }

        }

      })

      .then(() => {

        return self.skipWaiting();

      })

  );

});


/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener(
  'activate',
  event => {

    event.waitUntil(

      caches.keys().then(keys => {

        return Promise.all(

          keys.map(key => {

            if (
              key !== CACHE_NAME
            ) {

              return caches.delete(
                key
              );

            }

          })

        );

      })

      .then(() => {

        return self.clients.claim();

      })

      .then(async () => {

        /*
         * Tell all currently open Marvel Chat
         * windows that the offline shell is ready.
         */

        const clientsList =
          await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
          });


        for (
          const client of clientsList
        ) {

          client.postMessage({
            type:
              'MARVEL_OFFLINE_READY'
          });

        }

      })

    );

  }
);


/* =========================================================
   PUSH NOTIFICATIONS
   ========================================================= */

// Handle incoming Web Push notifications (FCM background messages) with correct GitHub Pages destination and icon branding

self.addEventListener(
  'push',
  event => {

    let title =
      'Marvel Chat';

    let body =
      'New notification received.';

    let icon =
      './assets/icon-192.png';

    let targetUrl =
      'https://devonim.github.io/marvel-chat-v2/';


    try {

      if (event.data) {

        const payload =
          event.data.json();


        title =
          payload.notification?.title ||
          payload.data?.title ||
          title;


        body =
          payload.notification?.body ||
          payload.data?.body ||
          body;


        icon =
          payload.notification?.icon ||
          icon;


        const rawUrl =
          payload.notification?.click_action ||
          payload.data?.url;


        if (rawUrl) {

          try {

            const parsed =
              new URL(
                rawUrl,
                self.location.origin
              );


            if (
              parsed.origin ===
                self.location.origin &&
              parsed.pathname.includes(
                '/marvel-chat-v2/'
              )
            ) {

              targetUrl =
                parsed.href;

            }

          } catch (e) {

            /*
             * Keep the default target URL.
             */

          }

        }

      }

    } catch (e) {

      console.error(
        'Push parse error:',
        e
      );

    }


    const options = {

      body: body,

      icon: icon,

      badge:
        './assets/icon-192.png',

      vibrate:
        [100, 50, 100],

      data: {
        url: targetUrl
      }

    };


    event.waitUntil(

      self.registration.showNotification(
        title,
        options
      )

    );

  }
);


/* =========================================================
   NOTIFICATION CLICK
   ========================================================= */

self.addEventListener(
  'notificationclick',
  event => {

    event.notification.close();


    const clickTargetUrl =
      event.notification.data?.url ||
      'https://devonim.github.io/marvel-chat-v2/';


    event.waitUntil(

      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      })

      .then(clientList => {

        for (
          const client of clientList
        ) {

          if (
            client.url.startsWith(
              'https://devonim.github.io/marvel-chat-v2/'
            ) &&
            'focus' in client
          ) {

            client.navigate(
              clickTargetUrl
            );

            return client.focus();

          }

        }


        if (clients.openWindow) {

          return clients.openWindow(
            clickTargetUrl
          );

        }

      })

    );

  }
);


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener(
  'fetch',
  event => {

    /*
     * Only GET requests should be handled by
     * this service worker.
     *
     * Firebase writes such as message sends,
     * posts, updates and deletes are therefore
     * NOT intercepted by the service worker.
     */

    if (
      event.request.method !==
      'GET'
    ) {

      return;

    }


    const url =
      new URL(
        event.request.url
      );


    /*
     * Skip cross-origin requests.
     *
     * Firebase APIs and Firestore connections
     * remain under Firebase's own networking and
     * Firestore's IndexedDB persistence system.
     */

    if (
      url.origin !==
        location.origin ||
      url.pathname.includes(
        '/firestore.googleapis.com'
      ) ||
      url.pathname.includes(
        '/identitytoolkit'
      ) ||
      url.pathname.includes(
        '/securetoken'
      )
    ) {

      return;

    }


    /* =====================================================
       DOCUMENT / HTML
       ===================================================== */

    if (
      event.request.mode ===
        'navigate' ||
      event.request.destination ===
        'document'
    ) {

      event.respondWith(

        fetch(
          event.request
        )

        .then(response => {

          if (
            response &&
            response.ok
          ) {

            const responseClone =
              response.clone();


            caches.open(
              CACHE_NAME
            )
            .then(cache => {

              cache.put(
                event.request,
                responseClone
              );

            });

          }


          return response;

        })

        .catch(async () => {

          /*
           * First try the exact page that
           * the user requested.
           */

          const exact =
            await caches.match(
              event.request
            );


          if (exact) {

            return exact;

          }


          /*
           * If that page is not cached,
           * return the application shell.
           */

          const shell =
            await caches.match(
              './index.html'
            );


          if (shell) {

            return shell;

          }


          /*
           * Last-resort offline response.
           */

          return new Response(

            `
              <!DOCTYPE html>

              <html>

                <head>

                  <meta charset="UTF-8">

                  <meta
                    name="viewport"
                    content="width=device-width,initial-scale=1"
                  >

                  <title>
                    Marvel Chat
                  </title>

                </head>

                <body>

                  <h2>
                    Marvel Chat
                  </h2>

                  <p>
                    You are offline.
                    Please connect to the internet
                    once so Marvel Chat can prepare
                    its offline files.
                  </p>

                </body>

              </html>
            `,

            {
              headers: {
                'Content-Type':
                  'text/html; charset=UTF-8'
              }
            }

          );

        })

      );

      return;

    }


    /* =====================================================
       STATIC ASSETS
       ===================================================== */

    event.respondWith(

      caches.match(
        event.request
      )

      .then(cachedResponse => {

        if (cachedResponse) {

          return cachedResponse;

        }


        return fetch(
          event.request
        )

        .then(response => {

          if (
            !response ||
            response.status !== 200 ||
            response.type !== 'basic'
          ) {

            return response;

          }


          const responseToCache =
            response.clone();


          caches.open(
            CACHE_NAME
          )
          .then(cache => {

            cache.put(
              event.request,
              responseToCache
            );

          });


          return response;

        });

      })

    );

  }
);


/* =========================================================
   SERVICE WORKER MESSAGE BRIDGE
   ========================================================= */

self.addEventListener(
  'message',
  event => {

    /*
     * Allows the application/update system to tell
     * the waiting service worker to activate immediately.
     */

    if (
      event.data?.type ===
      'MARVEL_SKIP_WAITING'
    ) {

      self.skipWaiting();

    }

  }
);
