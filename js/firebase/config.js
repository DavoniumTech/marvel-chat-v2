/*
=========================================================
Marvel Chat V2
Firebase Configuration and Initialization
=========================================================

Responsibility:
- Store Firebase Web App configuration
- Initialize Firebase
- Provide the Firebase App instance
- Provide Firebase Authentication
- Provide Cloud Firestore

This module is the single Firebase initialization point
for Marvel Chat V2.

It does NOT import firebaseConfig.js from V1.
=========================================================
*/

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/*
=========================================================
Firebase Web App Configuration
=========================================================
*/

const firebaseConfig = {
    apiKey: "AIzaSyDx0PKX6TXpd2BPOZaNCtkRCqD8qw34gL0",
    authDomain: "marvel-chat-49f23.firebaseapp.com",
    projectId: "marvel-chat-49f23",
    storageBucket: "marvel-chat-49f23.firebasestorage.app",
    messagingSenderId: "93489441194",
    appId: "1:93489441194:web:761b0830d025633d5823d3",
    measurementId: "G-QDYWQ78M14"
};


/*
=========================================================
Initialize Firebase
=========================================================
*/

const app = initializeApp(firebaseConfig);


/*
=========================================================
Initialize Firebase Services
=========================================================
*/

const auth = getAuth(app);

const db = getFirestore(app);


/*
=========================================================
Public Exports
=========================================================
*/

export {
    app,
    auth,
    db
};
