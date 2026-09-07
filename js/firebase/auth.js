import { auth, db } from "./config.js";

export { auth };
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state } from "../state.js";

export { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, updateProfile };

export async function signOut() {
  return fbSignOut(auth);
}

export async function loadProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    state.profile = { uid: user.uid, ...snap.data() };
    return;
  }
  const profile = {
    uid: user.uid,
    displayName: user.displayName || "User",
    username: "",
    email: user.email || "",
    country: "",
    bio: "",
    createdAt: serverTimestamp()
  };
  await setDoc(ref, profile);
  state.profile = { uid: user.uid, ...profile };
}
