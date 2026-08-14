import { state, escapeHtml, formatDate, friendly } from "../state.js";
import { db, getDocs, query, collection, orderBy, limit, doc, updateDoc, setDoc } from "../firebase/firestore.js";
import { showModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

export function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {
    // Autoplay or audio context blocked safely
  }
}

export async function enablePushNotifications() {
  console.log("[FCM Diagnostic] Starting enablePushNotifications flow...");
  try {
    if (!("Notification" in window)) {
      console.warn("[FCM Diagnostic] Notification API not supported in this browser.");
      toast("Push notifications are not supported by this browser.");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      console.warn("[FCM Diagnostic] Service Worker API not supported in this browser.");
      toast("Service workers are not supported by this browser.");
      return;
    }

    console.log("[FCM Diagnostic] Requesting Notification permission...");
    const permission = await Notification.requestPermission();
    console.log(`[FCM Diagnostic] Notification permission result: ${permission}`);
    
    if (permission !== "granted") {
      toast("Push notification permission was not granted.");
      return;
    }

    if (!state.user) {
      console.warn("[FCM Diagnostic] User is not authenticated in state.");
      toast("You must be signed in to enable push notifications.");
      return;
    }
    console.log(`[FCM Diagnostic] User authenticated with UID: ${state.user.uid}`);

    console.log("[FCM Diagnostic] Waiting for active service worker registration via navigator.serviceWorker.ready...");
    const registration = await navigator.serviceWorker.ready;
    console.log("[FCM Diagnostic] Service worker registration verified:", registration);

    console.log("[FCM Diagnostic] Initializing Firebase Messaging and calling getToken()...");
    const messaging = getMessaging();
    const currentToken = await getToken(messaging, {
      vapidKey: "BEV7Hou4cU2o2SyyTKUgfTpnNh3yHqPNZo5AM7kCa7wAYCUIlLRPtfIXIiX643hUJ12EAoeZnSBkj_lsHF8nHNY", 
      serviceWorkerRegistration: registration
    }).catch(err => {
      console.error("[FCM Diagnostic] getToken() rejected with error:", err);
      return null;
    });

    if (currentToken) {
      console.log("[FCM Diagnostic] Successfully obtained FCM registration token:", currentToken);
      const tokenDocId = btoa(currentToken).substring(0, 32);
      const tokenRef = doc(db, "users", state.user.uid, "pushTokens", tokenDocId);
      
      console.log(`[FCM Diagnostic] Saving push token to Firestore at path: users/${state.user.uid}/pushTokens/${tokenDocId}`);
      await setDoc(tokenRef, {
        token: currentToken,
        createdAt: new Date(),
        platform: navigator.platform || "Web",
        userAgent: navigator.userAgent,
        active: true
      }, { merge: true });

      console.log("[FCM Diagnostic] Push token successfully saved and verified in Firestore!");
      toast("Push notifications enabled successfully 🔔");
    } else {
      console.warn("[FCM Diagnostic] getToken() returned null or empty token.");
      toast("Failed to retrieve push registration token.");
    }
  } catch (e) {
    console.error("[FCM Diagnostic] Fatal exception in enablePushNotifications:", e);
    toast(friendly(e));
  }
}

export async function markAllNotificationsRead() {
  try {
    const unread = state.notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    
    // We update local state immediately
    state.notifications = state.notifications.map(n => ({ ...n, read: true }));
    state.unreadNotificationsCount = 0;

    const badgeEl = document.getElementById("notificationBadge");
    if (badgeEl) {
      badgeEl.textContent = "";
      badgeEl.style.display = "none";
    }

    // Update in Firestore
    for (const n of unread) {
      await updateDoc(doc(db, "users", state.user.uid, "notifications", n.id), { read: true });
    }
  } catch (e) {
    console.error("Mark read error:", e);
  }
}

export async function showNotifications() {
  showModal(
    "Notifications",
    `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <button class="btn btn-primary" id="enablePushBtn" style="font-size:11px; padding:6px 10px;">🔔 Enable Push</button>
        <button class="btn btn-secondary" id="markAllReadBtn" style="font-size:11px; padding:6px 10px;">Mark all as read</button>
      </div>
      <div id="notificationContent" class="empty">Loading notifications…</div>
    `
  );

  const el = document.getElementById("notificationContent");
  if (!el) return;

  el.className = state.notifications.length ? "list" : "empty";
  el.innerHTML = state.notifications.length ? state.notifications.map(n => `
    <div class="list-item" style="${n.read ? 'opacity:0.8;' : 'border-left:4px solid var(--primary);'}">
      <strong>${escapeHtml(n.actorName || "Community")}</strong>
      <div>${escapeHtml(n.text || "")}</div>
      <div class="small">${escapeHtml(formatDate(n.createdAt))}</div>
    </div>
  `).join("") : `🔔<p>No notifications yet.</p>`;

  document.getElementById("enablePushBtn")?.addEventListener("click", () => {
    enablePushNotifications();
  });

  document.getElementById("markAllReadBtn")?.addEventListener("click", async () => {
    await markAllNotificationsRead();
    showNotifications();
  });

  // Mark all unread as read upon viewing
  markAllNotificationsRead();
}
