import { state, escapeHtml, formatDate, friendly } from "../state.js";
import { db, getDocs, query, collection, orderBy, limit, doc, updateDoc } from "../firebase/firestore.js";
import { showModal } from "../components/modal.js";

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
      <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
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

  document.getElementById("markAllReadBtn")?.addEventListener("click", async () => {
    await markAllNotificationsRead();
    showNotifications();
  });

  // Mark all unread as read upon viewing
  markAllNotificationsRead();
}
