/*
 * Marvel Chat V2 - TimeTrust Production Upgrade
 */
import { state, escapeHtml, initials, formatDate, friendly } from "../state.js";
import { 
  db, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, 
  addDoc, serverTimestamp 
} from "../firebase/firestore.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { createConversation } from "./chat.js";

export const TIME_CATEGORIES = [
  "All",
  "Education",
  "Technology",
  "Design",
  "Business",
  "Writing",
  "Languages",
  "Music",
  "Career",
  "Repair & Practical Skills",
  "Other"
];

// Helper to get saved skills subcollection or state reference safely
function getUserSavedSkills() {
  return state.savedSkills || [];
}

export function renderTimeTrust(renderApp = null) {
  const activeTab = state.timeTab || "offers"; // "offers", "requests", "my", "saved"
  const subView = state.timeSubView || "all"; // "all" or category name
  const searchQuery = (state.timeSearchQuery || "").toLowerCase();
  const sortOrder = state.timeSort || "newest";

  const rawOffers = state.skills || [];
  const rawRequests = state.requests || [];

  // Filter and normalize data with safe fallbacks
  const processItem = (item, type) => ({
    id: item.id,
    uid: item.uid || "",
    username: item.username || "User",
    title: item.title || item.skill || "Untitled Skill",
    description: item.description || "",
    hours: item.hours || "1 hour",
    category: item.category || "Other",
    type: item.type || type,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  });

  const offers = rawOffers.map(x => processItem(x, "offer"));
  const requests = rawRequests.map(x => processItem(x, "request"));

  let pool = [];
  if (activeTab === "offers") {
    pool = offers;
  } else if (activeTab === "requests") {
    pool = requests;
  } else if (activeTab === "my") {
    pool = [...offers, ...requests].filter(x => x.uid === state.user?.uid);
  } else if (activeTab === "saved") {
    const savedIds = state.savedSkillIds || [];
    pool = [...offers, ...requests].filter(x => savedIds.includes(x.id));
  } else {
    pool = offers;
  }

  // Category filtering
  if (subView !== "all" && activeTab !== "my" && activeTab !== "saved") {
    pool = pool.filter(x => x.category.toLowerCase() === subView.toLowerCase());
  }

  // Search filtering
  if (searchQuery) {
    pool = pool.filter(x => 
      x.title.toLowerCase().includes(searchQuery) ||
      x.description.toLowerCase().includes(searchQuery) ||
      x.username.toLowerCase().includes(searchQuery) ||
      x.category.toLowerCase().includes(searchQuery)
    );
  }

  // Sorting
  pool.sort((a, b) => {
    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    if (sortOrder === "oldest") {
      return aTime - bTime;
    }
    return bTime - aTime;
  });

  const myOffersCount = offers.filter(x => x.uid === state.user?.uid).length;
  const myRequestsCount = requests.filter(x => x.uid === state.user?.uid).length;

  return `
    <div class="page timetrust-page">
      <section class="hero">
        <h1>TimeTrust ⏱️</h1>
        <p>Exchange skills, knowledge, and collaborative help with community peers. Built on trust and mutual growth.</p>
      </section>

      <div class="grid grid2" style="margin-bottom: 16px;">
        <div class="card stat" style="padding: 14px;">
          <span class="small">Community Ledger Foundation</span>
          <strong style="font-size: 20px;">Peer Exchange</strong>
          <span class="small">Direct skill sharing (Foundational)</span>
        </div>
        <div class="card stat" style="padding: 14px;">
          <span class="small">Active Opportunities</span>
          <strong>${offers.length + requests.length}</strong>
          <span class="small">${offers.length} offers · ${requests.length} requests</span>
        </div>
      </div>

      <div class="section-title">
        <h2>Exchange Directory</h2>
        <div style="display:flex; gap:7px">
          <button class="btn btn-secondary" id="requestSkillBtn">+ Request</button>
          <button class="btn btn-primary" id="offerSkillBtn">+ Offer</button>
        </div>
      </div>

      <!-- Main Tabs -->
      <div class="segmented" style="margin-bottom: 12px;">
        <button class="btn ${activeTab === "offers" ? "btn-primary" : "btn-ghost"}" data-time-tab="offers">Offers (${offers.length})</button>
        <button class="btn ${activeTab === "requests" ? "btn-primary" : "btn-ghost"}" data-time-tab="requests">Requests (${requests.length})</button>
        <button class="btn ${activeTab === "my" ? "btn-primary" : "btn-ghost"}" data-time-tab="my">My Items (${myOffersCount + myRequestsCount})</button>
        <button class="btn ${activeTab === "saved" ? "btn-primary" : "btn-ghost"}" data-time-tab="saved">Saved</button>
      </div>

      <!-- Search & Sort Bar -->
      <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
        <div class="search" style="flex: 1; min-width: 200px; margin: 0;">
          <input class="input" id="timeSearchInput" placeholder="Search title, category, user, description…" value="${escapeHtml(state.timeSearchQuery || "")}">
        </div>
        <select class="input" id="timeSortSelect" style="width: auto; padding: 6px 12px;">
          <option value="newest" ${sortOrder === "newest" ? "selected" : ""}>Newest first</option>
          <option value="oldest" ${sortOrder === "oldest" ? "selected" : ""}>Oldest first</option>
        </select>
      </div>

      <!-- Category Filter Pills (Hidden if viewing My or Saved) -->
      ${activeTab !== "my" && activeTab !== "saved" ? `
        <div class="categories-scroll" style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 16px; white-space: nowrap;">
          ${TIME_CATEGORIES.map(cat => `
            <button class="btn ${subView.toLowerCase() === cat.toLowerCase() ? "btn-primary" : "btn-ghost"}" data-time-cat="${escapeHtml(cat)}" style="padding: 4px 10px; font-size: 12px; border-radius: 999px;">
              ${escapeHtml(cat)}
            </button>
          `).join("")}
        </div>
      ` : ""}

      <!-- Item List or Empty State -->
      ${
        pool.length
          ? `
            <div class="list">
              ${pool.map(x => {
                const isOwner = x.uid === state.user?.uid;
                const isSaved = (state.savedSkillIds || []).includes(x.id);
                return `
                  <div class="list-item" style="cursor: pointer;" data-skill-detail="${x.id}" data-skill-type="${x.type}">
                    <div class="profile-row" style="align-items: flex-start; justify-content: space-between;">
                      <div style="display: flex; gap: 10px; align-items: flex-start; flex: 1;">
                        <div class="avatar" style="font-size: 16px;">${escapeHtml(initials(x.username))}</div>
                        <div class="profile-meta" style="flex: 1;">
                          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <strong style="font-size: 15px;">${escapeHtml(x.title)}</strong>
                            <span class="badge" style="background: var(--surface2);">${escapeHtml(x.category)}</span>
                            <span class="badge" style="background: var(--primary-light, #eef2ff); color: var(--primary, #4f46e5);">${escapeHtml(x.type.toUpperCase())}</span>
                          </div>
                          <div class="small" style="margin-top: 2px;">By @${escapeHtml(x.username)} · ${escapeHtml(formatDate(x.createdAt))}</div>
                          <p class="small" style="margin: 6px 0; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(x.description)}</p>
                          <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px;">
                            <span class="badge" style="font-weight: 600;">⏱️ Est: ${escapeHtml(x.hours)}</span>
                            ${isOwner ? `<span class="badge" style="background: rgba(79, 70, 229, 0.1); color: var(--primary);">Your ${x.type}</span>` : ""}
                          </div>
                        </div>
                      </div>
                      <div style="display: flex; gap: 4px; align-items: center;" onclick="event.stopPropagation()">
                        <button class="icon-btn" data-toggle-save="${x.id}" title="${isSaved ? "Unsave" : "Save"}" style="font-size: 14px;">${isSaved ? "⭐" : "☆"}</button>
                      </div>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          `
          : `
            <div class="card empty" style="padding: 40px 20px; text-align: center;">
              <div style="font-size: 42px; margin-bottom: 8px;">⏱️</div>
              <h3>${
                activeTab === "my" ? "You haven't published any offers or requests yet." :
                activeTab === "saved" ? "No saved skills found." :
                searchQuery || subView !== "all" ? "No matching skills found." :
                activeTab === "offers" ? "No skill offers available yet." : "No skill requests available yet."
              }</h3>
              <p style="color: var(--text-secondary); margin-bottom: 16px;">${activeTab === "my" ? "Publish your first skill offer or request to get started." : "Try adjusting your search filters or create a new entry."}</p>
              ${activeTab !== "my" && activeTab !== "saved" ? `
                <button class="btn btn-primary" id="emptyCreateSkillBtn">Create a ${activeTab === "offers" ? "skill offer" : "skill request"}</button>
              ` : ""}
            </div>
          `
      }
    </div>
  `;
}

// Attach event listeners for TimeTrust interactions
export function attachTimeTrustEvents(renderApp) {
  if (state.page !== "timetrust") return;

  document.getElementById("offerSkillBtn")?.addEventListener("click", () => showSkillModal("offer", renderApp));
  document.getElementById("requestSkillBtn")?.addEventListener("click", () => showSkillModal("request", renderApp));
  document.getElementById("emptyCreateSkillBtn")?.addEventListener("click", () => {
    const type = state.timeTab === "requests" ? "request" : "offer";
    showSkillModal(type, renderApp);
  });

  document.querySelectorAll("[data-time-tab]").forEach(b => {
    b.addEventListener("click", () => {
      state.timeTab = b.dataset.timeTab;
      state.timeSubView = "all";
      renderApp();
    });
  });

  document.querySelectorAll("[data-time-cat]").forEach(b => {
    b.addEventListener("click", () => {
      state.timeSubView = b.dataset.timeCat;
      renderApp();
    });
  });

  const searchInput = document.getElementById("timeSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      state.timeSearchQuery = e.target.value;
      renderApp();
      // Restore focus to search input
      setTimeout(() => {
        const input = document.getElementById("timeSearchInput");
        if (input) {
          input.focus();
          input.selectionStart = input.selectionEnd = input.value.length;
        }
      }, 0);
    });
  }

  const sortSelect = document.getElementById("timeSortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", e => {
      state.timeSort = e.target.value;
      renderApp();
    });
  }

  // Card click to show details
  document.querySelectorAll("[data-skill-detail]").forEach(card => {
    card.addEventListener("click", () => {
      const id = card.dataset.skillDetail;
      const type = card.dataset.skillType;
      const pool = type === "request" ? state.requests : state.skills;
      const item = pool.find(x => x.id === id);
      if (item) {
        showSkillDetails(item, type, renderApp);
      }
    });
  });

  // Toggle save/favorite
  document.querySelectorAll("[data-toggle-save]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.toggleSave;
      if (!state.savedSkillIds) state.savedSkillIds = [];
      const idx = state.savedSkillIds.indexOf(id);
      if (idx > -1) {
        state.savedSkillIds.splice(idx, 1);
        toast("Removed from saved skills.");
      } else {
        state.savedSkillIds.push(id);
        toast("Saved skill to favorites ⭐");
      }
      renderApp();
    });
  });
}

export function showSkillModal(type, renderApp, existingItem = null) {
  const isOffer = type === "offer";
  const isEdit = !!existingItem;

  const titleText = isEdit 
    ? (isOffer ? "Edit skill offer" : "Edit skill request") 
    : (isOffer ? "Offer your skill" : "Request a skill");

  showModal(
    titleText,
    `
      <div class="field">
        <label>${isOffer ? "Skill title" : "What do you need?"}</label>
        <input class="input" id="skillTitle" placeholder="${isOffer ? "e.g. Advanced Mathematics tutoring" : "e.g. Responsive landing page design"}" value="${escapeHtml(existingItem?.title || existingItem?.skill || "")}">
      </div>
      <div class="field">
        <label>Category</label>
        <select class="input" id="skillCategory">
          ${TIME_CATEGORIES.filter(c => c !== "All").map(c => `
            <option value="${escapeHtml(c)}" ${((existingItem?.category || "Other") === c) ? "selected" : ""}>${escapeHtml(c)}</option>
          `).join("")}
        </select>
      </div>
      <div class="field">
        <label>Time Estimate</label>
        <input class="input" id="skillHours" placeholder="e.g. 2 hours" value="${escapeHtml(existingItem?.hours || "1 hour")}">
      </div>
      <div class="field">
        <label>Description</label>
        <textarea class="textarea" id="skillDescription" rows="4" placeholder="Describe clearly what you are offering or looking for…">${escapeHtml(existingItem?.description || "")}</textarea>
      </div>
      <button class="btn btn-primary btn-block" id="saveSkillBtn">${isEdit ? "Save Changes" : (isOffer ? "Publish offer 🚀" : "Publish request 🚀")}</button>
    `
  );

  document.getElementById("saveSkillBtn")?.addEventListener("click", async () => {
    const titleInput = document.getElementById("skillTitle");
    const descInput = document.getElementById("skillDescription");
    const hoursInput = document.getElementById("skillHours");
    const catInput = document.getElementById("skillCategory");
    const saveBtn = document.getElementById("saveSkillBtn");

    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const hours = hoursInput.value.trim() || "1 hour";
    const category = catInput.value || "Other";

    if (!title) {
      toast("Please enter a title.");
      titleInput.focus();
      return;
    }
    if (!description) {
      toast("Please enter a description.");
      descInput.focus();
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "Publishing…";

      const colName = isOffer ? "skills" : "skillRequests";
      const username = state.profile?.displayName || state.profile?.username || "User";

      if (isEdit) {
        const docRef = doc(db, colName, existingItem.id);
        await updateDoc(docRef, {
          title,
          description,
          hours,
          category,
          updatedAt: serverTimestamp()
        });
        closeModal();
        toast("Updated successfully ✨");
      } else {
        await addDoc(collection(db, colName), {
          uid: state.user.uid,
          username,
          title,
          description,
          hours,
          category,
          type: isOffer ? "offer" : "request",
          createdAt: serverTimestamp()
        });
        closeModal();
        toast(isOffer ? "Skill offer published ⏱️" : "Skill request published ⏱️");
      }
      if (renderApp) renderApp();
    } catch (e) {
      console.error("SKILL SAVE ERROR:", e);
      toast(friendly(e));
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? "Save Changes" : (isOffer ? "Publish offer 🚀" : "Publish request 🚀");
    }
  });
}

export function showSkillDetails(item, type, renderApp) {
  const isOwner = item.uid === state.user?.uid;
  const isOffer = type === "offer";

  showModal(
    isOffer ? "Skill Offer Details" : "Skill Request Details",
    `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="avatar" style="font-size: 18px;">${escapeHtml(initials(item.username))}</div>
          <div>
            <strong style="font-size: 16px; display: block;">${escapeHtml(item.title)}</strong>
            <span class="small">Posted by @${escapeHtml(item.username)} · ${escapeHtml(formatDate(item.createdAt))}</span>
          </div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <span class="badge" style="background: var(--surface2);">📂 ${escapeHtml(item.category || "Other")}</span>
          <span class="badge" style="background: var(--surface2);">⏱️ Time: ${escapeHtml(item.hours || "1 hour")}</span>
          <span class="badge" style="background: var(--primary-light, #eef2ff); color: var(--primary, #4f46e5);">🏷️ ${escapeHtml(type.toUpperCase())}</span>
        </div>

        <div class="card" style="background: var(--surface2); padding: 12px; margin: 0;">
          <span class="small" style="font-weight: 600; display: block; margin-bottom: 4px;">Description</span>
          <p style="white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 14px;">${escapeHtml(item.description)}</p>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 8px;">
          ${isOwner ? `
            <button class="btn btn-secondary" id="editSkillDetail" style="flex: 1;">Edit</button>
            <button class="btn btn-danger" id="deleteSkillDetail" style="flex: 1;">Delete</button>
          ` : `
            <button class="btn btn-primary btn-block" id="connectSkillUser">Connect with @${escapeHtml(item.username)} 💬</button>
          `}
        </div>

        <div style="text-align: center; margin-top: 4px;">
          <button class="btn-text small" id="reportSkillBtn" style="color: var(--text-secondary);">Report this entry</button>
        </div>
      </div>
    `
  );

  if (isOwner) {
    document.getElementById("editSkillDetail")?.addEventListener("click", () => {
      closeModal();
      showSkillModal(type, renderApp, item);
    });

    document.getElementById("deleteSkillDetail")?.addEventListener("click", () => {
      showDeleteSkillConfirmation(item, type, renderApp);
    });
  } else {
    document.getElementById("connectSkillUser")?.addEventListener("click", async () => {
      const connectBtn = document.getElementById("connectSkillUser");
      try {
        connectBtn.disabled = true;
        connectBtn.textContent = `Opening chat with ${item.username}…`;
        
        // Fetch user profile or construct target profile object
        const profileSnap = await getDoc(doc(db, "users", item.uid));
        const targetProfile = profileSnap.exists() ? { uid: item.uid, ...profileSnap.data() } : { uid: item.uid, username: item.username, displayName: item.username };
        
        closeModal();
        await createConversation(targetProfile, renderApp);
        toast(`Connected with ${item.username} 💬`);
      } catch (e) {
        console.error("CONNECT SKILL ERROR:", e);
        toast("Could not open this conversation. Please try again.");
        connectBtn.disabled = false;
        connectBtn.textContent = `Connect with @${escapeHtml(item.username)} 💬`;
      }
    });
  }

  document.getElementById("reportSkillBtn")?.addEventListener("click", () => {
    toast("Thank you. Report received for review.");
  });
}

function showDeleteSkillConfirmation(item, type, renderApp) {
  showModal(
    "Delete this entry?",
    `
      <p class="small">Are you sure you want to delete <strong>${escapeHtml(item.title)}</strong>? This action cannot be undone.</p>
      <div style="display: flex; gap: 10px; margin-top: 16px;">
        <button class="btn btn-ghost" id="cancelDelSkill" style="flex: 1;">Cancel</button>
        <button class="btn btn-danger" id="confirmDelSkill" style="flex: 1;">Delete</button>
      </div>
    `
  );

  document.getElementById("cancelDelSkill")?.addEventListener("click", () => {
    showSkillDetails(item, type, renderApp);
  });

  document.getElementById("confirmDelSkill")?.addEventListener("click", async () => {
    const confirmBtn = document.getElementById("confirmDelSkill");
    try {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Deleting…";

      const colName = type === "offer" ? "skills" : "skillRequests";
      await deleteDoc(doc(db, colName, item.id));

      closeModal();
      toast("Entry deleted successfully.");
      if (renderApp) renderApp();
    } catch (e) {
      console.error("DELETE SKILL ERROR:", e);
      toast("Could not delete entry.");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Delete";
    }
  });
}
