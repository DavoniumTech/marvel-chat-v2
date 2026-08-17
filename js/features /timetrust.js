import { state, escapeHtml, friendly, initials, formatDate } from "../state.js";
import { db, collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where, getDocs, limit } from "../firebase/firestore.js";
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

  const filterAndSort = (arr) => {
    return arr
      .filter(x => {
        const title = (x.title || x.skill || "").toLowerCase();
        const desc = (x.description || "").toLowerCase();
        const uname = (x.username || "").toLowerCase();
        const cat = (x.category || "Other").toLowerCase();
        
        const matchesSearch = !searchQuery || title.includes(searchQuery) || desc.includes(searchQuery) || uname.includes(searchQuery) || cat.includes(searchQuery);
        const matchesCategory = selectedCategory === "All" || (x.category || "Other") === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return sortBy === "newest" ? timeB - timeA : timeA - timeB;
      });
  };

  const offers = filterAndSort(state.skills.filter(x => x.type === "offer" || !x.type));
  const requests = filterAndSort(state.requests);
  const items = state.timeTab === "offers" ? offers : requests;

  return `
    <div class="page">
      <section class="hero">
        <h1>TimeTrust ⏱️</h1>
        <p>Your time is valuable. Exchange skills, knowledge and useful help with other members.</p>
      </section>

      <div class="grid grid2" style="margin-bottom:15px;">
        <div class="card" style="padding:15px; margin:0;">
          <span class="small">Time Balance System</span>
          <strong style="display:block; font-size:20px; color:var(--primary); margin:4px 0;">Community Ledger</strong>
          <span class="small">Contributed skill hours build community trust and foundational credit for future peer trading.</span>
        </div>
        <div class="card" style="padding:15px; margin:0;">
          <span class="small">Community Offers</span>
          <strong style="display:block; font-size:20px; color:var(--primary); margin:4px 0;">${offers.length} Active</strong>
          <span class="small">Skills ready to exchange now.</span>
        </div>
      </div>

      <div class="search" style="margin-bottom:12px;">
        <input class="input" id="timeSearch" value="${escapeHtml(state.search || "")}" placeholder="Search skills, topics or helpers…">
        <div style="display:flex; gap:7px">
          <button class="btn btn-secondary" id="requestSkillBtn">+ Request</button>
          <button class="btn btn-primary" id="offerSkillBtn">+ Offer</button>
        </div>
      </div>

      <div class="segmented" style="margin-bottom:12px;">
        <button class="btn ${state.timeTab === "offers" ? "btn-primary" : "btn-ghost"}" id="tabOffersBtn" style="flex:1;">Skill Offers</button>
        <button class="btn ${state.timeTab === "requests" ? "btn-primary" : "btn-ghost"}" id="tabRequestsBtn" style="flex:1;">Skill Requests</button>
      </div>

      <div style="display:flex; gap:8px; align-items:center; margin-bottom:14px; flex-wrap:wrap;">
        <select class="select" id="timeSortSelect" style="width:auto; padding:6px 12px; font-size:12px;">
          <option value="newest" ${sortBy === "newest" ? "selected" : ""}>Newest first</option>
          <option value="oldest" ${sortBy === "oldest" ? "selected" : ""}>Oldest first</option>
        </select>
        <div style="display:flex; gap:5px; overflow-x:auto; flex:1; padding-bottom:4px;">
          ${
            skillCategories
              .map(
                cat => `
                  <button class="btn ${selectedCategory === cat ? "btn-primary" : "btn-ghost"}" data-time-cat="${escapeHtml(cat)}" style="font-size:11px; padding:6px 10px; white-space:nowrap;">
                    ${escapeHtml(cat)}
                  </button>
                `
              )
              .join("")
          }
        </div>
      </div>

      <div id="timeTrustItems">
        ${
          items.length
            ? `
              <div class="list">
                ${
                  items
                    .map(
                      x => `
                        <div class="list-item" style="cursor:pointer;" data-view-skill="${x.id}" data-skill-type="${x.type || 'offer'}">
                          <div class="profile-row">
                            <div class="avatar">${escapeHtml(initials(x.username || "User"))}</div>
                            <div class="profile-meta">
                              <strong>${escapeHtml(x.title || x.skill || "Skill")}</strong>
                              <span class="small">${escapeHtml(x.username || "User")} · ${escapeHtml(formatDate(x.createdAt))}</span>
                            </div>
                            <span class="badge" style="background:var(--surface2); color:var(--text);">${escapeHtml(x.hours || "1 hour")}</span>
                          </div>

                          <p class="small" style="margin:8px 0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                            ${escapeHtml(x.description || "")}
                          </p>

                          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                            <span class="badge">${escapeHtml(x.category || "Other")}</span>
                            <span class="badge" style="background:${x.type === 'request' ? 'var(--warning, #f59e0b)' : 'var(--primary)'}; color:#fff;">
                              ${x.type === 'request' ? 'Request' : 'Offer'}
                            </span>
                          </div>
                        </div>
                      `
                    )
                    .join("")
                }
              </div>
            `
            : `
              <div class="card empty">
                <div style="font-size:40px">⏱️</div>
                <h3>${state.timeTab === "offers" ? "No skill offers match your filter." : "No skill requests match your filter."}</h3>
                <p>Be the first person to publish one for the community.</p>
                <button class="btn btn-primary" id="emptyTimeBtn" style="margin-top:12px;">Publish ${state.timeTab === "offers" ? "an offer" : "a request"}</button>
              </div>
            `
        }
      </div>
    </div>
  `;
}

export function showSkillModal(type, existingItem = null) {
  const isOffer = type === "offer" || (existingItem && existingItem.type === "offer");
  const isEditing = Boolean(existingItem);

  showModal(
    isEditing ? (isOffer ? "Edit skill offer" : "Edit skill request") : (isOffer ? "Offer your skill" : "Request a skill"),
    `
      <div class="field">
        <label>${isOffer ? "Skill title *" : "What do you need? *"}</label>
        <input class="input" id="skillTitle" value="${escapeHtml(existingItem?.title || existingItem?.skill || "")}" placeholder="${isOffer ? "e.g. Advanced Mathematics Tutoring" : "e.g. UI/UX Figma Review"}">
      </div>

      <div class="grid grid2">
        <div class="field">
          <label>Category *</label>
          <select class="select" id="skillCategory">
            ${
              skillCategories
                .filter(c => c !== "All")
                .map(c => `<option value="${escapeHtml(c)}" ${existingItem?.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`)
                .join("")
            }
          </select>
        </div>

        <div class="field">
          <label>Time estimate</label>
          <input class="input" id="skillHours" value="${escapeHtml(existingItem?.hours || "1 hour")}" placeholder="e.g. 2 hours">
        </div>
      </div>

      <div class="field">
        <label>Description *</label>
        <textarea class="textarea" id="skillDescription" placeholder="Explain what you can teach, share or need help with…">${escapeHtml(existingItem?.description || "")}</textarea>
      </div>

      <button class="btn btn-primary btn-block" id="saveSkillBtn">
        ${isEditing ? "Save changes" : (isOffer ? "Publish offer ⏱️" : "Publish request ⏱️")}
      </button>
    `
  );

  document.getElementById("saveSkillBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("skillTitle").value.trim();
    const category = document.getElementById("skillCategory").value;
    const hours = document.getElementById("skillHours").value.trim() || "1 hour";
    const description = document.getElementById("skillDescription").value.trim();

    if (!title) { toast("Enter a skill title."); return; }
    if (!description) { toast("Enter a description."); return; }

    const btn = document.getElementById("saveSkillBtn");
    btn.disabled = true;
    btn.textContent = isEditing ? "Saving…" : "Publishing…";

    try {
      const col = isOffer ? "skills" : "skillRequests";
      const username = state.profile?.displayName || state.profile?.username || "User";

      if (isEditing) {
        await updateDoc(doc(db, col, existingItem.id), {
          title,
          category,
          hours,
          description,
          updatedAt: serverTimestamp()
        });
        toast("Updated successfully ✨");
      } else {
        await addDoc(collection(db, col), {
          uid: state.user.uid,
          username,
          title,
          category,
          hours,
          description,
          type: isOffer ? "offer" : "request",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast(isOffer ? "Skill offer published ⏱️" : "Skill request published ⏱️");
      }

      closeModal();
      if (typeof window.renderMarvelApp === "function") window.renderMarvelApp();
    } catch (e) {
      toast(friendly(e));
      btn.disabled = false;
      btn.textContent = isEditing ? "Save changes" : (isOffer ? "Publish offer ⏱️" : "Publish request ⏱️");
    }
  });
}

export async function showSkillDetails(itemId, itemType, renderApp) {
  const collectionName = itemType === "request" ? "skillRequests" : "skills";
  const item = (itemType === "request" ? state.requests : state.skills).find(x => x.id === itemId);

  if (!item) {
    toast("Item not found.");
    return;
  }

  const isOwner = item.uid === state.user.uid;

  showModal(
    item.title || item.skill || "Skill Exchange",
    `
      <div style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
          <div>
            <h3 style="font-size:20px; color:var(--text); margin:0 0 4px;">${escapeHtml(item.title || item.skill || "")}</h3>
            <div class="small">Posted by <strong>${escapeHtml(item.username || "User")}</strong> · ${escapeHtml(formatDate(item.createdAt))}</div>
          </div>
          <div>
            <span class="badge">${escapeHtml(item.category || "Other")}</span>
            <span class="badge" style="background:var(--surface2); color:var(--text); margin-left:4px;">${escapeHtml(item.hours || "1 hour")}</span>
          </div>
        </div>
      </div>

      <div class="card" style="background:var(--surface2); margin-bottom:15px; box-shadow:none;">
        <strong style="display:block; margin-bottom:6px; font-size:13px;">Description</strong>
        <p class="post-body" style="margin:0;">${escapeHtml(item.description || "")}</p>
      </div>

      <div id="timeTrustActionArea">
        ${
          isOwner
            ? `
              <div class="grid grid2" style="gap:8px;">
                <button class="btn btn-secondary" id="editSkillBtn">✏️ Edit</button>
                <button class="btn btn-danger" id="deleteSkillBtn">🗑️ Delete</button>
              </div>
            `
            : `
              <button class="btn btn-primary btn-block" id="connectUserBtn">
                💬 Connect with ${escapeHtml(item.username || "User")}
              </button>
            `
        }
      </div>
    `
  );

  if (isOwner) {
    document.getElementById("editSkillBtn")?.addEventListener("click", () => {
      closeModal();
      showSkillModal(item.type || (collectionName === "skillRequests" ? "request" : "offer"), item);
    });

    document.getElementById("deleteSkillBtn")?.addEventListener("click", () => {
      showModal(
        "Delete entry?",
        `
          <p class="small">Are you sure you want to delete this ${escapeHtml(item.type || "skill")}? This action cannot be undone.</p>
          <div style="display:flex; gap:8px; margin-top:15px;">
            <button class="btn btn-ghost" style="flex:1;" id="cancelDelSkill">Cancel</button>
            <button class="btn btn-danger" style="flex:1;" id="confirmDelSkill">Delete</button>
          </div>
        `
      );

      document.getElementById("cancelDelSkill")?.addEventListener("click", () => {
        showSkillDetails(itemId, itemType, renderApp);
      });

      document.getElementById("confirmDelSkill")?.addEventListener("click", async () => {
        try {
          await deleteDoc(doc(db, collectionName, item.id));
          toast("Successfully deleted.");
          closeModal();
          if (typeof renderApp === "function") renderApp();
        } catch (e) {
          toast(friendly(e));
        }
      });
    });
  } else {
    document.getElementById("connectUserBtn")?.addEventListener("click", async () => {
      try {
        closeModal();
        const targetUid = item.uid;
        const userSnap = await getDocs(query(collection(db, "users"), where("uid", "==", targetUid), limit(1)));
        let profile = { uid: targetUid, username: item.username || "User", displayName: item.username || "User" };
        if (!userSnap.empty) {
          profile = { id: userSnap.docs[0].id, ...userSnap.docs[0].data() };
        }
        await createConversation(profile, renderApp);
      } catch (e) {
        console.error("Connect error:", e);
        toast("Could not open chat with this user.");
      }
    });
  }
}

export function attachTimeTrustEvents(renderApp) {
  window.renderMarvelApp = renderApp;

  document.getElementById("offerSkillBtn")?.addEventListener("click", () => showSkillModal("offer"));
  document.getElementById("requestSkillBtn")?.addEventListener("click", () => showSkillModal("request"));
  document.getElementById("emptyTimeBtn")?.addEventListener("click", () => showSkillModal(state.timeTab === "offers" ? "offer" : "request"));

  document.getElementById("tabOffersBtn")?.addEventListener("click", () => {
    state.timeTab = "offers";
    renderApp();
  });

  document.getElementById("tabRequestsBtn")?.addEventListener("click", () => {
    state.timeTab = "requests";
    renderApp();
  });

  document.getElementById("timeSearch")?.addEventListener("input", e => {
    state.search = e.target.value;
    renderApp();
  });

  document.getElementById("timeSortSelect")?.addEventListener("change", e => {
    state.timeSort = e.target.value;
    renderApp();
  });

  document.querySelectorAll("[data-time-cat]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.timeCategory = btn.dataset.timeCat;
      renderApp();
    });
  });

  document.querySelectorAll("[data-view-skill]").forEach(item => {
    item.addEventListener("click", () => {
      showSkillDetails(item.dataset.viewSkill, item.dataset.skillType, renderApp);
    });
  });
}
