import { state, escapeHtml, formatDate, friendly } from "../state.js";
import { db, getDocs, query, collection, orderBy, limit } from "../firebase/firestore.js";
import { showModal } from "../components/modal.js";

export async function showNotifications() {
  showModal(
    "Notifications",
    `<div id="notificationContent" class="empty">Loading notifications…</div>`
  );

  try {
    const snap = await getDocs(query(collection(db, "users", state.user.uid, "notifications"), orderBy("createdAt", "desc"), limit(30)));
    const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const el = document.getElementById("notificationContent");
    if (!el) return;
    el.className = arr.length ? "list" : "empty";
    el.innerHTML = arr.length ? arr.map(n => `
      <div class="list-item">
        <strong>${escapeHtml(n.title || "Notification")}</strong>
        <div>${escapeHtml(n.message || "")}</div>
        <div class="small">${escapeHtml(formatDate(n.createdAt))}</div>
      </div>
    `).join("") : `🔔<p>No notifications yet.</p>`;
  } catch (e) {
    document.getElementById("notificationContent").innerHTML = `<div class="status error">${escapeHtml(friendly(e))}</div>`;
  }
}
