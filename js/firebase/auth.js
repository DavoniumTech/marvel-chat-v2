/*
 * Marvel Chat V2
 *
 * Authentication service.
 *
 * Firebase Authentication operations
 * will be migrated here.
 */



import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./config.js";

export async function registerUser(email, password) {
  return await createUserWithEmailAndPassword(auth, email, password);
}

export async function loginUser(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}

export async function logoutUser() {
  return await signOut(auth);
}

export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function updateUserProfile(user, profileData) {
  return await updateProfile(user, profileData);
}

export { auth };
