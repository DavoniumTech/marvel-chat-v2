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

   ACTIVE CHAT MESSAGES
     -> still owned by chat.js
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

  pageListeners.forEach(name => {
    if (state.unsubs[name]) {
      state.unsubs[name]();
      state.unsubs[name] = null;
    }
  });
}


/* =========================================================
   GENERIC SNAPSHOT SUBSCRIBER
   ========================================================= */

function sub(name, firestoreQuery, handler) {
  state.unsubs[name]?.();

  state.unsubs[name] = onSnapshot(
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
   ========================================================= */

function ensureNotificationListener() {
  if (!state.user) {
    return;
  }

  const uid = state.user.uid;

  if (
    notificationUid === uid &&
    state.unsubs.notifications
  ) {
    return;
  }

  state.unsubs.notifications?.();

  notificationUid = uid;

  let isInitialNotificationLoad = true;

  state.unsubs.notifications = onSnapshot(
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
      const list = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      state.notifications = list;

      state.unreadNotificationsCount =
        list.filter(
          notification => !notification.read
        ).length;


      /*
       * Do not play a sound for the initial
       * notification load.
       */

      if (isInitialNotificationLoad) {
        isInitialNotificationLoad = false;
      } else {
        const hasNewUnread =
          snapshot.docChanges().some(
            change =>
              change.type === "added" &&
              !change.doc.data().read
          );

        if (hasNewUnread) {
          playNotificationSound();
        }
      }


      /*
       * Update the existing notification badge
       * without rebuilding the whole application.
       */

      const badgeEl =
        document.getElementById(
          "notificationBadge"
        );

      if (badgeEl) {
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
  if (!state.user) {
    return;
  }

  const uid = state.user.uid;


  /*
   * Keep notifications available everywhere.
   */

  ensureNotificationListener();


  /*
   * Do not recreate listeners when renderApp()
   * runs repeatedly on the same page.
   */

  if (
    activeUid === uid &&
    activePage === page
  ) {
    return;
  }


  /*
   * Page changed.
   * Stop listeners belonging to the previous page.
   */

  clearPageListeners();

  activeUid = uid;
  activePage = page;


  /* =======================================================
     HOME
     ======================================================= */

  if (page === "home") {
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
        const recentPosts =
          snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));


        /*
         * Keep track of the posts currently supplied
         * by the Home listener.
         */

        const recentIds = new Set(
          recentPosts.map(
            post => post.id
          )
        );


        /*
         * Preserve posts that were loaded elsewhere,
         * such as older posts from Profile > My Posts
         * or Profile > Saved Posts.
         *
         * This prevents returning to Home from replacing
         * those posts and causing:
         *
         * "Post no longer available"
         */

        const preservedPosts =
          (
            Array.isArray(state.posts)
              ? state.posts
              : []
          ).filter(
            post =>
              post?.id &&
              !state.homePostIds.has(
                post.id
              )
          );


        /*
         * Merge by document ID so that we never create
         * duplicate posts in state.posts.
         */

        const byId = new Map();

        recentPosts.forEach(post => {
          byId.set(
            post.id,
            post
          );
        });

        preservedPosts.forEach(post => {
          if (!byId.has(post.id)) {
            byId.set(
              post.id,
              post
            );
          }
        });


        state.posts =
          Array.from(
            byId.values()
          );

        state.homePostIds =
          recentIds;


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

  if (page === "chat") {

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
            .map(d => ({
              id: d.id,
              ...d.data()
            }))
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
         * Keep the currently open conversation
         * synchronized with its latest data.
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

          if (current) {
            state.activeConversation =
              current;
          }
        }


        /*
         * If no individual conversation is open,
         * update the Chat conversation list.
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

        snapshot.docs.forEach(d => {
          preferences[d.id] =
            d.data();
        });

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

  if (page === "market") {
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
          snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));

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

  if (page === "timetrust") {

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
          snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));

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
          snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));

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

     Profile-specific data is loaded by profile.js.
     No collection listener is required here.
     ======================================================= */
}


/* =========================================================
   STOP EVERYTHING
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

  allListeners.forEach(name => {
    if (state.unsubs[name]) {
      state.unsubs[name]();
      state.unsubs[name] = null;
    }
  });

  activePage = null;

  activeUid = null;

  notificationUid = null;
}
