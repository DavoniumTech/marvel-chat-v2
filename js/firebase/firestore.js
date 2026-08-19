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
 * Multi-tab persistence is used so Marvel Chat can safely
 * share the Firestore persistence cache between tabs/windows
 * where the browser supports it.
 *
 * If the browser does not support persistence, or another
 * Firestore client already owns the persistence lease,
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
     * failed-precondition:
     * Another tab/window may already be using the
     * persistence lease.
     */

    if (
      error?.code ===
      "failed-precondition"
    ) {

      console.warn(
        "Marvel Chat: Firestore offline persistence could not be enabled because another browser tab may already be using it."
      );

      return;
    }


    /*
     * unimplemented:
     * The current browser/device does not support
     * the required IndexedDB functionality.
     */

    if (
      error?.code ===
      "unimplemented"
    ) {

      console.warn(
        "Marvel Chat: Firestore offline persistence is not supported by this browser."
      );

      return;
    }


    /*
     * Any other persistence problem should not stop
     * the application from starting.
     */

    console.warn(
      "Marvel Chat: Firestore offline persistence could not be enabled.",
      error
    );

  });


/* =========================================================
   EXISTING FIRESTORE EXPORTS
   ========================================================= */

export {
  db,
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
  arrayRemove
};
