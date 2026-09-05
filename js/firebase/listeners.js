import { db } from "./config.js";

import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { state } from "../state.js";

import {
  playNotificationSound
} from "../features /notifications.js";


/* =========================================================
   MARVEL CHAT — PAGE-SCOPED FIRESTORE LISTENERS
   =========================================================

   OLD BEHAVIOUR:
   After login, the application subscribed to:

   - posts
   - conversations
   - conversationPreferences
   - listings
   - skills
   - skillRequests
   - notifications

   all at the same time.

   NEW BEHAVIOUR:

   HOME
     -> posts

   CHAT
     -> conversations
     -> conversationPreferences

   MARKET
     -> listings

   TIMETRUST
     -> skills
     -> skillRequests

   PROFILE
     -> no collection listener

   NOTIFICATIONS
     -> one user-specific listener kept globally
        so the existing notification badge can remain
        real-time.

   ACTIVE CHAT MESSAGES
     -> still owned by chat.js

   IMPORTANT:
   This file does NOT rewrite the feature modules.
   ========================================================= */


/* =========================================================
   INTERNAL SUBSCRIPTION STATE
   ========================================================= */

let activePage = null;

let activeUid = null;

let notificationUid = null;


/* =========================================================
   CLEAR PAGE-SPECIFIC LISTENERS
   ========================================================= */

function clearPageListeners() {

  const pageListeners = [
    "posts",
    "conversations",
    "preferences",
    "listings",
    "skills",
    "requests"
  ];

  pageListeners.forEach(
    name => {

      if (
        state.unsubs[name]
      ) {

        state.unsubs[name]();

        state.unsubs[name] =
          null;
      }

    }
  );
}


/* =========================================================
   GENERIC SNAPSHOT SUBSCRIBER
   ========================================================= */

function sub(
  name,
  firestoreQuery,
  handler
) {

  /*
   * Safety:
   * If this listener already exists,
   * stop it before creating another one.
   */

  state.unsubs[name]?.();

  state.unsubs[name] =
    onSnapshot(

      firestoreQuery,

      snapshot => {

        try {

          handler(snapshot);

        } catch (error) {

          console.error(
            `MARVEL LISTENER HANDLER ERROR [${name}]:`,
            error
          );

        }

      },

      error => {

        console.error(
          `MARVEL FIRESTORE LISTENER ERROR [${name}]:`,
          error
        );

      }

    );

  return state.unsubs[name];
}


/* =========================================================
   NOTIFICATION LISTENER
   =========================================================

   This is the only collection listener that remains active
   while the user moves between pages.

   Why?

   Because your existing UI has a notification badge in the
   top bar and the application expects notifications to arrive
   in real time.

   We deliberately DO NOT re-render the whole application
   whenever a notification arrives.

   The badge is updated directly.
   ========================================================= */

function ensureNotificationListener() {

  if (!state.user) {
    return;
  }


  const uid =
    state.user.uid;


  /*
   * Already subscribed for this user.
   */

  if (
    notificationUid === uid &&
    state.unsubs.notifications
  ) {

    return;
  }


  /*
   * If another user's notification listener exists,
   * remove it first.
   */

  state.unsubs.notifications?.();


  notificationUid =
    uid;


  let isInitialNotificationLoad =
    true;


  state.unsubs.notifications =
    onSnapshot(

      query(
        collection(
          db,
          "users",
          uid,
          "notifications"
        ),
        orderBy(
          "createdAt",
          "desc"
        ),
        limit(50)
      ),

      snapshot => {

        const list =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );


        state.notifications =
          list;


        state.unreadNotificationsCount =
          list.filter(
            notification =>
              !notification.read
          ).length;


        /*
         * Do not play a sound for the initial
         * notification load.
         */

        if (
          isInitialNotificationLoad
        ) {

          isInitialNotificationLoad =
            false;

        } else {

          /*
           * Only play sound for genuinely new,
           * unread notification documents.
           */

          const hasNewUnread =
            snapshot.docChanges().some(
              change =>
                change.type === "added" &&
                !change.doc.data().read
            );


          if (
            hasNewUnread
          ) {

            playNotificationSound();

          }

        }


        /*
         * Update existing notification badge
         * without rebuilding the entire page.
         */

        const badgeEl =
          document.getElementById(
            "notificationBadge"
          );


        if (
          badgeEl
        ) {

          badgeEl.textContent =
            state.unreadNotificationsCount > 0
              ? state.unreadNotificationsCount
              : "";


          badgeEl.style.display =
            state.unreadNotificationsCount > 0
              ? "inline-block"
              : "none";

        }

      },

      error => {

        console.error(
          "MARVEL FIRESTORE LISTENER ERROR [notifications]:",
          error
        );

      }

    );

}


/* =========================================================
   PAGE-SCOPED SUBSCRIPTIONS
   ========================================================= */

export function subscribeForPage(
  page,
  renderCallback
) {

  /*
   * No authenticated user:
   * there is nothing to subscribe to.
   */

  if (!state.user) {
    return;
  }


  const uid =
    state.user.uid;


  /*
   * Keep notifications available everywhere.
   *
   * This is ONE listener per authenticated user,
   * not one listener per application feature.
   */

  ensureNotificationListener();


  /*
   * IMPORTANT:
   *
   * renderApp() can run many times.
   *
   * If we are still on the same page and the same
   * user is authenticated, DO NOT create listeners again.
   */

  if (
    activeUid === uid &&
    activePage === page
  ) {

    return;
  }


  /*
   * Page changed.
   *
   * Stop the old page's listeners first.
   */

  clearPageListeners();


  activeUid =
    uid;

  activePage =
    page;


  /* =======================================================
     HOME
     ======================================================= */

  if (
    page === "home"
  ) {

    sub(

      "posts",

      query(
        collection(
          db,
          "posts"
        ),
        orderBy(
          "createdAt",
          "desc"
        ),
        limit(50)
      ),

      snapshot => {

        state.posts =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );


        /*
         * Only redraw Home when Home is actually visible.
         */

        if (
          state.page === "home" &&
          typeof renderCallback ===
            "function"
        ) {

          renderCallback();

        }

      }

    );


    return;
  }


  /* =======================================================
     CHAT
     ======================================================= */

  if (
    page === "chat"
  ) {

    /*
     * Conversation list
     */

    sub(

      "conversations",

      query(
        collection(
          db,
          "conversations"
        ),
        where(
          "participants",
          "array-contains",
          uid
        ),
        limit(50)
      ),

      snapshot => {

        state.conversations =
          snapshot.docs

            .map(
              d => ({
                id: d.id,
                ...d.data()
              })
            )

            .sort(
              (a, b) => {

                const aTime =
                  a.updatedAt?.toMillis
                    ? a.updatedAt.toMillis()
                    : 0;


                const bTime =
                  b.updatedAt?.toMillis
                    ? b.updatedAt.toMillis()
                    : 0;


                return bTime - aTime;

              }
            );


        /*
         * Keep currently open conversation
         * synchronized with its latest conversation data.
         */

        if (
          state.activeConversation
        ) {

          const current =
            state.conversations.find(
              conversation =>
                conversation.id ===
                state.activeConversation.id
            );


          if (
            current
          ) {

            state.activeConversation =
              current;

          }

        }


        /*
         * If the user is on Chat's conversation
         * list, update the UI.
         *
         * If an individual conversation is open,
         * chat.js owns the message listener.
         */

        if (
          state.page === "chat" &&
          !state.activeConversation &&
          typeof renderCallback ===
            "function"
        ) {

          renderCallback();

        }

      }

    );


    /*
     * Conversation preferences
     *
     * This is intentionally only loaded while Chat
     * is the active page.
     */

    sub(

      "preferences",

      query(
        collection(
          db,
          "users",
          uid,
          "conversationPreferences"
        )
      ),

      snapshot => {

        const preferences = {};


        snapshot.docs.forEach(
          d => {

            preferences[d.id] =
              d.data();

          }
        );


        state.conversationPreferences =
          preferences;


        if (
          state.page === "chat" &&
          typeof renderCallback ===
            "function"
        ) {

          renderCallback();

        }

      }

    );


    return;
  }


  /* =======================================================
     MARKET
     ======================================================= */

  if (
    page === "market"
  ) {

    sub(

      "listings",

      query(
        collection(
          db,
          "listings"
        ),
        where(
          "status",
          "==",
          "active"
        ),
        orderBy(
          "createdAt",
          "desc"
        ),
        limit(50)
      ),

      snapshot => {

        state.listings =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );


        if (
          state.page === "market" &&
          typeof renderCallback ===
            "function"
        ) {

          renderCallback();

        }

      }

    );


    return;
  }


  /* =======================================================
     TIMETRUST
     ======================================================= */

  if (
    page === "timetrust"
  ) {

    /*
     * Available skills
     */

    sub(

      "skills",

      query(
        collection(
          db,
          "skills"
        ),
        orderBy(
          "createdAt",
          "desc"
        ),
        limit(50)
      ),

      snapshot => {

        state.skills =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );


        if (
          state.page === "timetrust" &&
          typeof renderCallback ===
            "function"
        ) {

          renderCallback();

        }

      }

    );


    /*
     * Skill requests
     */

    sub(

      "requests",

      query(
        collection(
          db,
          "skillRequests"
        ),
        orderBy(
          "createdAt",
          "desc"
        ),
        limit(50)
      ),

      snapshot => {

        state.requests =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );


        if (
          state.page === "timetrust" &&
          typeof renderCallback ===
            "function"
        ) {

          renderCallback();

        }

      }

    );


    return;
  }


  /* =======================================================
     PROFILE / OTHER STATIC PAGES
     =======================================================

     No Firestore collection listener is required.
     ======================================================= */

}


/* =========================================================
   STOP EVERYTHING
   =========================================================

   Used during logout or authentication changes.
   ========================================================= */

export function stopAllListeners() {

  const allListeners = [
    "posts",
    "conversations",
    "messages",
    "skills",
    "requests",
    "listings",
    "notifications",
    "preferences"
  ];


  allListeners.forEach(
    name => {

      if (
        state.unsubs[name]
      ) {

        state.unsubs[name]();

        state.unsubs[name] =
          null;
      }

    }
  );


  activePage =
    null;


  activeUid =
    null;


  notificationUid =
    null;

}
