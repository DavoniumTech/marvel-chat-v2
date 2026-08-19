import { state, escapeHtml, friendly, initials, formatDate } from "../state.js";
import { db, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp, query, where, getDocs, limit } from "../firebase/firestore.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { createConversation } from "./chat.js";

const skillCategories = [
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

export function renderTimeTrust(renderApp) {
  const searchQuery = (state.search || "").toLowerCase();
  const selectedCategory = state.timeCategory || "All";
  const sortBy = state.timeSort || "newest"; // 'newest' or 'oldest'
  const timeTab = state.timeTab || "offers"; // "offers" or "my"

  const processItem = (item) => ({
    id: item.id,
    uid: item.uid || "",
    username: item.username || "User",
    title: item.title || item.skill || "Untitled Skill",
    description: item.description || "",
    hours: item.hours || "1 hour",
    category: item.category || "Other",
    type: item.type || "offer",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  });

  const rawOffers = (state.skills || []).map(processItem);

  let pool = timeTab === "my" 
    ? rawOffers.filter(x => x.uid === state.user?.uid) 
    : rawOffers;

  // Category filtering
  if (selectedCategory !== "All" && timeTab !== "my") {
    pool = pool.filter(x => (x.category || "Other").toLowerCase() === selectedCategory.toLowerCase());
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
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    return sortBy === "newest" ? timeB - timeA : timeA - timeB;
  });

  const myOffersCount = rawOffers.filter(x => x.uid === state.user?.uid).length;

  return `
    <div class="page timetrust-page">
      <section class="hero">
        <h1>TimeTrust ⏱️</h1>
        <p>Discover skilled community members, offer your own expertise, and exchange useful knowledge.</p>
      </section>

      <div class="grid grid2" style="margin-bottom: 16px;">
        <div class="card stat" style="padding: 14px; margin:0;">
          <span class="small">Provider Marketplace</span>
          <strong style="font-size: 18px; display:block; margin: 4px 0;">Skill Exchange</strong>
          <span class="small">Connect directly with expert peers.</span>
        </div>
        <div class="card stat" style="padding: 14px; margin:0;">
          <span class="small">Available Offers</span>
          <strong style="font-size: 18px; display:block; margin: 4px 0;">${rawOffers.length} Active</strong>
          <span class="small">Ready for private connection.</span>
        </div>
      </div>

      <div class="section-title">
        <h2>Skill Offers</h2>
        <button class="btn btn-primary" id="offerSkillBtn">+ Offer a skill</button>
      </div>

      <!-- Main Tabs -->
      <div class="segmented" style="margin-bottom: 12px;">
        <button class="btn ${timeTab === "offers" ? "btn-primary" : "btn-ghost"}" data-time-tab="offers" style="flex:1;">Community Offers (${rawOffers.length})</button>
        <button class="btn ${timeTab === "my" ? "btn-primary" : "btn-ghost"}" data-time-tab="my" style="flex:1;">My Offers (${myOffersCount})</button>
      </div>

      <!-- Search & Sort Bar -->
      <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
        <div class="search" style="flex: 1; min-width: 200px; margin: 0;">
          <input class="input" id="timeSearch" placeholder="Search skills, topics or providers…" value="${escapeHtml(state.search || "")}">
        </div>
        <select class="select" id="timeSortSelect" style="width: auto; padding: 6px 12px; font-size: 13px;">
          <option value="newest" ${sortBy === "newest" ? "selected" : ""}>Newest first</option>
          <option value="oldest" ${sortBy === "oldest" ? "selected" : ""}>Oldest first</option>
        </select>
      </div>

      <!-- Category Filter Pills -->
      ${timeTab !== "my" ? `
        <div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 16px; white-space: nowrap;">
          ${skillCategories.map(cat => `
            <button class="btn ${selectedCategory.toLowerCase() === cat.toLowerCase() ? "btn-primary" : "btn-ghost"}" data-time-cat="${escapeHtml(cat)}" style="padding: 4px 10px; font-size: 12px; border-radius: 999px;">
              ${escapeHtml(cat)}
            </button>
          `).join("")}
        </div>
      ` : ""}

      <!-- Item List or Empty State -->
      <div id="timeTrustItems">
        ${
          pool.length
            ? `
              <div class="list">
                ${pool.map(x => {
                  const isOwner = x.uid === state.user?.uid;
                  return `
                    <div class="list-item" style="cursor: pointer;" data-view-skill="${x.id}">
                      <div class="profile-row" style="align-items: flex-start; justify-content: space-between;">
                        <div style="display: flex; gap: 10px; align-items: flex-start; flex: 1;">
                          <div class="avatar" style="font-size: 16px;">${escapeHtml(initials(x.username))}</div>
                          <div class="profile-meta" style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                              <strong style="font-size: 15px;">${escapeHtml(x.title)}</strong>
                              <span class="badge" style="background: var(--surface2);">${escapeHtml(x.category)}</span>
                            </div>
                            <div class="small" style="margin-top: 2px;">Provider: @${escapeHtml(x.username)} · ${escapeHtml(formatDate(x.createdAt))}</div>
                            <p class="small" style="margin: 6px 0; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(x.description)}</p>
                            <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px;">
                              <span class="badge" style="font-weight: 600; background: var(--surface2);">⏱️ Session: ${escapeHtml(x.hours)}</span>
                              ${isOwner ? `<span class="badge" style="background: rgba(79, 70, 229, 0.1); color: var(--primary);">Your Offer</span>` : ""}
                            </div>
                          </div>
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
                <h3>${timeTab === "my" ? "You haven't published any skill offers yet." : "No skill offers found."}</h3>
                <p style="color: var(--text-secondary); margin-bottom: 16px;">${timeTab === "my" ? "Publish your first skill offer to start helping members." : "Try adjusting your search or category filters."}</p>
                <button class="btn btn-primary" id="emptyOfferBtn">Offer a skill</button>
              </div>
            `
        }
      </div>
    </div>
  `;
}

export function showSkillModal(type = "offer", renderApp, existingItem = null) {
  const isEdit = !!existingItem;

  showModal(
    isEdit ? "Edit skill offer" : "Offer your skill",
    `
      <div class="field">
        <label>Skill title *</label>
        <input class="input" id="skillTitle" placeholder="e.g. Advanced Coding assisting" value="${escapeHtml(existingItem?.title || existingItem?.skill || "")}">
      </div>

      <div class="grid grid2">
        <div class="field">
          <label>Category *</label>
          <select class="select" id="skillCategory">
            ${skillCategories.filter(c => c !== "All").map(c => `
              <option value="${escapeHtml(c)}" ${((existingItem?.category || "Other") === c) ? "selected" : ""}>${escapeHtml(c)}</option>
            `).join("")}
          </select>
        </div>

        <div class="field">
          <label>Estimated time / session</label>
          <input class="input" id="skillHours" placeholder="e.g. 1 hour" value="${escapeHtml(existingItem?.hours || "1 hour")}">
        </div>
      </div>

      <div class="field">
        <label>Description *</label>
        <textarea class="textarea" id="skillDescription" rows="4" placeholder="Describe what you can teach or help with, and what learners can expect…">${escapeHtml(existingItem?.description || "")}</textarea>
      </div>

      <button class="btn btn-primary btn-block" id="saveSkillBtn">${isEdit ? "Save Changes" : "Publish offer ⏱️"}</button>
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
      toast("Please enter a skill title.");
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
      saveBtn.textContent = isEdit ? "Saving…" : "Publishing…";

      const username = state.profile?.displayName || state.profile?.username || "User";

      if (isEdit) {
        await updateDoc(doc(db, "skills", existingItem.id), {
          title,
          description,
          hours,
          category,
          updatedAt: serverTimestamp()
        });
        closeModal();
        toast("Skill offer updated successfully ✨");
      } else {
        await addDoc(collection(db, "skills"), {
          uid: state.user.uid,
          username,
          title,
          description,
          hours,
          category,
          type: "offer",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        closeModal();
        toast("Skill offer published ⏱️");
      }
      if (typeof renderApp === "function") renderApp();
    } catch (e) {
      console.error("SKILL SAVE ERROR:", e);
      toast(friendly(e));
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? "Save Changes" : "Publish offer ⏱️";
    }
  });
}

export function showSkillDetails(item, renderApp) {
  const isOwner = item.uid === state.user?.uid;

  showModal(
    "Skill Offer Details",
    `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="avatar" style="font-size: 18px;">${escapeHtml(initials(item.username))}</div>
          <div>
            <strong style="font-size: 16px; display: block;">${escapeHtml(item.title)}</strong>
            <span class="small">Offered by @${escapeHtml(item.username)} · ${escapeHtml(formatDate(item.createdAt))}</span>
          </div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <span class="badge" style="background: var(--surface2);">📂 ${escapeHtml(item.category || "Other")}</span>
          <span class="badge" style="background: var(--surface2);">⏱️ Session: ${escapeHtml(item.hours || "1 hour")}</span>
        </div>

        <div class="card" style="background: var(--surface2); padding: 12px; margin: 0; box-shadow: none;">
          <span class="small" style="font-weight: 600; display: block; margin-bottom: 4px;">About this skill offer</span>
          <p style="white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 14px;">${escapeHtml(item.description)}</p>
        </div>

        <div style="margin-top: 8px;">
          ${isOwner ? `
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" id="editSkillDetail" style="flex: 1;">Edit offer</button>
              <button class="btn btn-danger" id="deleteSkillDetail" style="flex: 1;">Delete offer</button>
            </div>
          ` : `
            <button class="btn btn-primary btn-block" id="messageProviderBtn">Message Provider @${escapeHtml(item.username)} 💬</button>
          `}
        </div>
      </div>
    `
  );

  if (isOwner) {
    document.getElementById("editSkillDetail")?.addEventListener("click", () => {
      closeModal();
      showSkillModal("offer", renderApp, item);
    });

    document.getElementById("deleteSkillDetail")?.addEventListener("click", () => {
      showDeleteSkillConfirmation(item, renderApp);
    });
  } else {
    document.getElementById("messageProviderBtn")?.addEventListener("click", async () => {
      const connectBtn = document.getElementById("messageProviderBtn");
      try {
        connectBtn.disabled = true;
        connectBtn.textContent = `Opening chat with ${item.username}…`;
        
        const targetUid = item.uid;
        const userSnap = await getDocs(query(collection(db, "users"), where("uid", "==", targetUid), limit(1)));
        let profile = { uid: targetUid, username: item.username || "User", displayName: item.username || "User" };
        if (!userSnap.empty) {
          profile = { id: userSnap.docs[0].id, ...userSnap.docs[0].data() };
        }
        
        closeModal();
        await createConversation(profile, renderApp);
      } catch (e) {
        console.error("CONNECT PROVIDER ERROR:", e);
        toast("Could not open this conversation. Please try again.");
        connectBtn.disabled = false;
        connectBtn.textContent = `Message Provider @${escapeHtml(item.username)} 💬`;
      }
    });
  }
}

function showDeleteSkillConfirmation(item, renderApp) {
  showModal(
    "Delete this skill offer?",
    `
      <p class="small">Are you sure you want to delete <strong>${escapeHtml(item.title)}</strong>? This action cannot be undone.</p>
      <div style="display: flex; gap: 10px; margin-top: 16px;">
        <button class="btn btn-ghost" id="cancelDelSkill" style="flex: 1;">Cancel</button>
        <button class="btn btn-danger" id="confirmDelSkill" style="flex: 1;">Delete</button>
      </div>
    `
  );

  document.getElementById("cancelDelSkill")?.addEventListener("click", () => {
    showSkillDetails(item, renderApp);
  });

  document.getElementById("confirmDelSkill")?.addEventListener("click", async () => {
    const confirmBtn = document.getElementById("confirmDelSkill");
    try {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Deleting…";

      await deleteDoc(doc(db, "skills", item.id));

      closeModal();
      toast("Skill offer deleted successfully.");
      if (typeof renderApp === "function") renderApp();
    } catch (e) {
      console.error("DELETE SKILL ERROR:", e);
      toast("Could not delete skill offer.");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Delete";
    }
  });
}

export function attachTimeTrustEvents(renderApp) {
  document.getElementById("offerSkillBtn")?.addEventListener("click", () => showSkillModal("offer", renderApp));
  document.getElementById("emptyOfferBtn")?.addEventListener("click", () => showSkillModal("offer", renderApp));

  document.querySelectorAll("[data-time-tab]").forEach(b => {
    b.addEventListener("click", () => {
      state.timeTab = b.dataset.timeTab;
      renderApp();
    });
  });

  document.querySelectorAll("[data-time-cat]").forEach(b => {
    b.addEventListener("click", () => {
      state.timeCategory = b.dataset.timeCat;
      renderApp();
    });
  });

  const searchInput = document.getElementById("timeSearch");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      state.search = e.target.value;
      renderApp();
      setTimeout(() => {
        const input = document.getElementById("timeSearch");
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

  document.querySelectorAll("[data-view-skill]").forEach(card => {
    card.addEventListener("click", () => {
      const id = card.dataset.viewSkill;
      const item = (state.skills || []).find(x => x.id === id);
      if (item) {
        showSkillDetails(item, renderApp);
      }
    });
  });
}
