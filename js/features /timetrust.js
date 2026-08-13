import { state, escapeHtml, friendly } from "../state.js";
import { db, collection, addDoc, serverTimestamp } from "../firebase/firestore.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";

export function renderTimeTrust() {
  const offers = state.skills.filter(x => x.type === "offer");
  const requests = state.requests;
  const items = state.timeTab === "offers" ? offers : requests;

  return `
    <div class="page">
      <section class="hero">
        <h1>TimeTrust ⏱️</h1>
        <p>Your time is valuable. Exchange skills, knowledge and useful help with other members.</p>
      </section>
      <div class="grid grid2">
        <div class="stat">
          <span class="small">Your time balance</span>
          <strong>0h</strong>
          <span class="small">Start by helping someone.</span>
        </div>
        <div class="stat">
          <span class="small">Community offers</span>
          <strong>${offers.length}</strong>
          <span class="small">Skills available now.</span>
        </div>
      </div>
      <div class="section-title">
        <h2>Skill exchange</h2>
        <div style="display:flex; gap:7px">
          <button class="btn btn-secondary" id="requestSkillBtn">+ Request</button>
          <button class="btn btn-primary" id="offerSkillBtn">+ Offer</button>
        </div>
      </div>
      <div class="segmented">
        <button class="btn ${state.timeTab === "offers" ? "btn-primary" : "btn-ghost"}" data-time-tab="offers">Skill offers</button>
        <button class="btn ${state.timeTab === "requests" ? "btn-primary" : "btn-ghost"}" data-time-tab="requests">Requests</button>
      </div>
      ${
        items.length
          ? `
            <div class="list">
              ${items.map(x => `
                <div class="list-item">
                  <div class="profile-row">
                    <div class="avatar">⏱</div>
                    <div class="profile-meta">
                      <strong>${escapeHtml(x.title || x.skill || "Skill")}</strong>
                      <span class="small">${escapeHtml(x.username || "User")}</span>
                      <span class="badge">${escapeHtml(x.hours || "1 hour")}</span>
                    </div>
                  </div>
                  <p class="small">${escapeHtml(x.description || "")}</p>
                </div>
              `).join("")}
            </div>
          `
          : `
            <div class="card empty">
              <div style="font-size:40px">⏱️</div>
              <h3>${state.timeTab === "offers" ? "No skill offers yet." : "No requests yet."}</h3>
              <p>Be the first person to create one.</p>
            </div>
          `
      }
    </div>
  `;
}

export function showSkillModal(type) {
  const isOffer = type === "offer";
  showModal(
    isOffer ? "Offer your skill" : "Request a skill",
    `
      <div class="field">
        <label>${isOffer ? "Skill title" : "What do you need?"}</label>
        <input class="input" id="skillTitle" placeholder="${isOffer ? "e.g. Mathematics help" : "e.g. Logo design"}">
      </div>
      <div class="field">
        <label>Description</label>
        <textarea class="textarea" id="skillDescription" placeholder="Explain what you can offer or need…"></textarea>
      </div>
      <div class="field">
        <label>Time</label>
        <input class="input" id="skillHours" placeholder="e.g. 1 hour">
      </div>
      <button class="btn btn-primary btn-block" id="saveSkill">${isOffer ? "Publish offer" : "Publish request"}</button>
    `
  );

  document.getElementById("saveSkill")?.addEventListener("click", async () => {
    const title = document.getElementById("skillTitle").value.trim();
    const description = document.getElementById("skillDescription").value.trim();
    const hours = document.getElementById("skillHours").value.trim() || "1 hour";
    if (!title) { toast("Enter a title."); return; }
    try {
      const col = isOffer ? "skills" : "skillRequests";
      await addDoc(collection(db, col), {
        uid: state.user.uid,
        username: state.profile.displayName || state.profile.username || "User",
        title,
        description,
        hours,
        type: isOffer ? "offer" : "request",
        createdAt: serverTimestamp()
      });
      closeModal();
      toast(isOffer ? "Skill offer published ⏱️" : "Skill request published ⏱️");
    } catch (e) {
      toast(friendly(e));
    }
  });
}
