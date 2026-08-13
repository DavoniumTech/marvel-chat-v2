import { state, escapeHtml } from "../state.js";
import { showModal } from "../components/modal.js";

export function showSearch() {
  showModal(
    "Search Marvel Chat",
    `
      <div class="field">
        <input id="globalSearch" class="input" placeholder="Search loaded community posts…">
      </div>
      <button class="btn btn-primary btn-block" id="runSearch">Search</button>
      <div id="searchResults" style="margin-top:15px"></div>
    `
  );

  document.getElementById("runSearch")?.addEventListener("click", () => {
    const t = document.getElementById("globalSearch")?.value.trim().toLowerCase();
    if (!t) return;
    const r = state.posts.filter(p => (`${p.text || ""} ${p.username || ""}`).toLowerCase().includes(t));
    document.getElementById("searchResults").innerHTML = r.length ? r.map(p => `
      <div class="list-item">
        <strong>${escapeHtml(p.username || "User")}</strong>
        <div>${escapeHtml(p.text || "")}</div>
      </div>
    `).join("") : `<div class="empty">No matching posts found.</div>`;
  });
}
