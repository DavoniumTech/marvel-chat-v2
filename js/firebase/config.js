// js/firebase/config.js
// Marvel Chat V2 Firebase configuration.
// Firebase configuration is kept here so the V2 Firebase module
// has a single, self-contained configuration source.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDx0PKX6TXpd2BPOZaNCtkRCqD8qw34gL0",
  authDomain: "marvel-chat-49f23.firebaseapp.com",
  projectId: "marvel-chat-49f23",
  storageBucket: "marvel-chat-49f23.firebasestorage.app",
  messagingSenderId: "93489441194",
  appId: "1:93489441194:web:761b0830d025633d5823d3",
  measurementId: "G-QDYWQ78M14"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export {app, firebaseConfig };
