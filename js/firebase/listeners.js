/*
 * Marvel Chat V2
 *
 * Real-time listener management.
 *
 * Every onSnapshot listener must have
 * a controlled unsubscribe lifecycle.
 */


import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function createListener(queryRef, onNext, onError) {
  return onSnapshot(
    queryRef,
    (snapshot) => {
      if (typeof onNext === "function") {
        onNext(snapshot);
      }
    },
    (error) => {
      if (typeof onError === "function") {
        onError(error);
      } else {
        console.error("Real-time listener error:", error);
      }
    }
  );
}
