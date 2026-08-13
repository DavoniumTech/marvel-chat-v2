import { state, countries, escapeHtml, initials, friendly } from "../state.js";
import { db, doc, updateDoc } from "../firebase/firestore.js";
import { updateProfile, signOut } from "../firebase/auth.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { renderPost } from "./home.js";

export function renderProfile() {
  const p = state.profile || {};
  const name = p.displayName || p.username || "User";
  const savedCount = state.posts.filter(x => Array.isArray(x.savedBy) && x.savedBy.includes(state.user.uid)).length;

  return `
    <div class="page">
      <section class="hero">
        <div class="profile-row">
          <div class="avatar avatar-lg" style="background:rgba(255,255,255,.18); color:#fff;">
            ${escapeHtml(initials(name))}
          </div>
          <div>
            <h1 style="margin:0">${escapeHtml(name)}</h1>
            <p>@${escapeHtml(p.username || "user")}</p>
          </div>
        </div>
      </section>
      <div class="grid grid3">
        <div class="stat">
          <span class="small">Posts</span>
          <strong>${state.posts.filter(x => x.uid === state.user.uid).length}</strong>
        </div>
        <div class="stat">
          <span class="small">Saved</span>
          <strong>${savedCount}</strong>
        </div>
        <div class="stat">
          <span class="small">Country</span>
          <strong>${countries.find(x => x[0] === p.country)?.[0] || "—"}</strong>
        </div>
      </div>
      <div class="section-title">
        <h2>Profile</h2>
      </div>
      <div class="card">
        <div class="profile-row">
          <div class="avatar avatar-lg">${escapeHtml(initials(name))}</div>
          <div class="profile-meta">
            <strong>${escapeHtml(name)}</strong>
            <span class="small">@${escapeHtml(p.username || "user")}</span>
            <span class="small">${escapeHtml(p.email || "")}</span>
          </div>
        </div>
        ${p.bio ? `<p class="small">${escapeHtml(p.bio)}</p>` : `<p class="small">You haven't added a bio yet.</p>`}
      </div>
      <div class="section-title">
        <h2>Account</h2>
      </div>
      <div class="grid">
        <button class="btn btn-ghost" id="editProfileBtn">✏️ Edit profile</button>
        <button class="btn btn-ghost" id="savedBtn">🔖 Saved posts</button>
        <button class="btn btn-ghost" id="settingsBtn">⚙️ Settings & About</button>
        <button class="btn btn-danger" id="logoutBtn">🚪 Sign out</button>
      </div>
    </div>
  `;
}

export function showEditProfile(renderApp) {
  const p = state.profile || {};
  showModal(
    "Edit profile",
    `
      <div class="field">
        <label>Display name</label>
        <input class="input" id="editDisplayName" value="${escapeHtml(p.displayName || "")}">
      </div>
      <div class="field">
        <label>Username</label>
        <input class="input" id="editUsername" value="${escapeHtml(p.username || "")}">
      </div>
      <div class="field">
        <label>Bio</label>
        <textarea class="textarea" id="editBio" maxlength="300" placeholder="Tell the community about yourself…">${escapeHtml(p.bio || "")}</textarea>
      </div>
      <button class="btn btn-primary btn-block" id="saveProfile">Save changes</button>
    `
  );

  document.getElementById("saveProfile")?.addEventListener("click", async () => {
    const displayName = document.getElementById("editDisplayName").value.trim();
    const username = document.getElementById("editUsername").value.trim();
    const bio = document.getElementById("editBio").value.trim();
    if (!username) { toast("Username cannot be empty."); return; }
    try {
      await updateDoc(doc(db, "users", state.user.uid), { displayName, username, bio });
      await updateProfile(state.user, { displayName });
      state.profile = { ...state.profile, displayName, username, bio };
      closeModal();
      toast("Profile updated ✨");
      renderApp();
    } catch (e) {
      toast(friendly(e));
    }
  });
}

export function showSaved() {
  const saved = state.posts.filter(x => Array.isArray(x.savedBy) && x.savedBy.includes(state.user.uid));
  showModal(
    "Saved posts",
    saved.length ? saved.map(renderPost).join("") : `
      <div class="empty">
        <div style="font-size:40px">🔖</div>
        <p>You have no saved posts yet.</p>
      </div>
    `
  );
}
