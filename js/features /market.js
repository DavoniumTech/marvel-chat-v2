import { state, categories, escapeHtml, friendly } from "../state.js";
import { db, collection, addDoc, serverTimestamp } from "../firebase/firestore.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";

export function renderMarket() {
  const filtered = state.listings.filter(x =>
    (`${x.title || ""} ${x.description || ""} ${x.username || ""}`).toLowerCase().includes(state.search.toLowerCase()) &&
    (state.marketCategory === "all" || x.category === state.marketCategory)
  );

  return `
    <div class="page">
      <section class="hero">
        <h1>Marvel Market 🛍️</h1>
        <p>A community marketplace for useful products, services, books and more.</p>
      </section>
      <div class="search">
        <input class="input" id="marketSearch" value="${escapeHtml(state.search)}" placeholder="Search the market…">
        <button class="btn btn-primary" id="sellBtn">+ Sell</button>
      </div>
      <div class="segmented">
        ${categories.map(c => `
          <button class="btn ${state.marketCategory === c ? "btn-primary" : "btn-ghost"}" data-category="${escapeHtml(c)}">
            ${escapeHtml(c === "all" ? "All" : c)}
          </button>
        `).join("")}
      </div>
      <div id="marketItems">
        ${
          filtered.length
            ? `
              <div class="list">
                ${filtered.map(x => `
                  <div class="list-item">
                    <div class="profile-row">
                      <div class="avatar">🛍</div>
                      <div class="profile-meta">
                        <strong>${escapeHtml(x.title)}</strong>
                        <span class="small">${escapeHtml(x.username || "User")} · ${escapeHtml(x.country || "Community")}</span>
                      </div>
                      <strong>${escapeHtml(String(x.price ?? 0))}</strong>
                    </div>
                    <p class="small">${escapeHtml(x.description || "")}</p>
                    <span class="badge">${escapeHtml(x.category || "Other")}</span>
                  </div>
                `).join("")}
              </div>
            `
            : `
              <div class="card empty">
                <div style="font-size:40px">🛍️</div>
                <h3>Nothing here yet.</h3>
                <p>Create the first marketplace listing.</p>
              </div>
            `
        }
      </div>
    </div>
  `;
}

export function showSellModal() {
  showModal(
    "Create marketplace listing",
    `
      <div class="field">
        <label>Title</label>
        <input class="input" id="listingTitle" placeholder="What are you selling?">
      </div>
      <div class="field">
        <label>Description</label>
        <textarea class="textarea" id="listingDescription" placeholder="Describe your product or service…"></textarea>
      </div>
      <div class="grid grid2">
        <div class="field">
          <label>Price</label>
          <input class="input" id="listingPrice" placeholder="e.g. 500">
        </div>
        <div class="field">
          <label>Category</label>
          <select class="select" id="listingCategory">
            ${categories.filter(x => x !== "all").map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("")}
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="publishListing">Publish listing 🛍️</button>
    `
  );

  document.getElementById("publishListing")?.addEventListener("click", async () => {
    const title = document.getElementById("listingTitle").value.trim();
    const description = document.getElementById("listingDescription").value.trim();
    const price = document.getElementById("listingPrice").value.trim();
    const category = document.getElementById("listingCategory").value;
    if (!title) { toast("Enter a title."); return; }
    try {
      await addDoc(collection(db, "listings"), {
        uid: state.user.uid,
        username: state.profile.displayName || state.profile.username || "User",
        country: state.profile.country || "",
        title,
        description,
        price,
        category,
        status: "active",
        createdAt: serverTimestamp()
      });
      closeModal();
      toast("Listing published 🛍️");
    } catch (e) {
      toast(friendly(e));
    }
  });
}
