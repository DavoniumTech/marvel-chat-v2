import { db } from "./config.js";

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  Timestamp,
  enableMultiTabIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* =========================================================
   FIRESTORE OFFLINE PERSISTENCE
   ========================================================= */

/*
 * Enable persistent Firestore storage using IndexedDB.
 *
 * This allows Firestore data that has already been loaded
 * by the application to remain available locally when the
 * device temporarily loses internet connectivity.
 *
 * Multi-tab persistence allows Marvel Chat to share the
 * Firestore persistence cache between supported tabs/windows.
 *
 * Persistence is optional. If the browser does not support
 * it, or another Firestore client already owns the lease,
 * the application continues normally.
 */

enableMultiTabIndexedDbPersistence(db)
  .then(() => {

    console.log(
      "Marvel Chat: Firestore offline persistence enabled."
    );

  })
  .catch(error => {

    /*
     * Another tab/window may already own
     * the persistence lease.
     */

    if (
      error?.code === "failed-precondition"
    ) {

      console.warn(
        "Marvel Chat: Firestore offline persistence could not be enabled because another browser tab may already be using it."
      );

      return;
    }


    /*
     * The browser/device does not support
     * the required IndexedDB functionality.
     */

    if (
      error?.code === "unimplemented"
    ) {

      console.warn(
        "Marvel Chat: Firestore offline persistence is not supported by this browser."
      );

      return;
    }


    /*
     * Persistence must never prevent Marvel Chat
     * from starting.
     */

    console.warn(
      "Marvel Chat: Firestore offline persistence could not be enabled.",
      error
    );

  });


/* =========================================================
   FIRESTORE EXPORTS
   ========================================================= */

/*
 * Keep this file as the central Firestore API wrapper
 * used by the rest of Marvel Chat V2.
 *
 * IMPORTANT:
 * Do not import Firebase Firestore directly inside feature
 * modules when an existing wrapper export is available.
 */

export {
  db,

  // References
  collection,
  doc,

  // Reads
  getDoc,
  getDocs,

  // Writes
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,

  // Queries
  query,
  where,
  orderBy,
  limit,

  // Realtime
  onSnapshot,

  // Field/server helpers
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,

  // Timestamp support
  Timestamp
};
