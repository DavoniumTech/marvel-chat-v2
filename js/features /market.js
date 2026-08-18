import { state, escapeHtml, friendly, formatDate } from "../state.js";
import { db, collection, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, getDocs, query, where, limit } from "../firebase/firestore.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { createConversation } from "./chat.js";

const marketCategories = [
  "All",
  "Electronics",
  "Phones",
  "Computers",
  "Fashion",
  "Books",
  "Education",
  "Home",
  "Food",
  "Services",
  "Beauty",
  "Sports",
  "Vehicles",
  "Other"
];

const conditions = [
  "New",
  "Like New",
  "Good",
  "Fair",
  "Used"
];

export function renderMarket(renderApp) {
  const queryText = (state.search || "").toLowerCase();
  const selectedCategory = state.marketCategory || "All";
  const marketTab = state.marketTab || "browse"; // 'browse' or 'mine'
  const sortBy = state.marketSort || "newest"; // 'newest' or 'oldest'

  let filtered = (state.listings || []).filter(x => {
    const matchesSearch = !queryText || (
      `${x.title || ""} ${x.description || ""} ${x.username || ""} ${x.category || ""} ${x.location || ""} ${x.country || ""}`
    ).toLowerCase().includes(queryText);

    const matchesCategory = selectedCategory === "All" || (x.category || "Other") === selectedCategory;
    
    if (marketTab === "mine") {
      const isOwner = x.uid === state.user?.uid;
      return matchesSearch && matchesCategory && isOwner;
    } else {
      const isActive = x.status !== "sold";
      return matchesSearch && matchesCategory && isActive;
    }
  });

  // Sorting
  filtered.sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    return sortBy === "oldest" ? timeA - timeB : timeB - timeA;
  });

  const myListingsCount = (state.listings || []).filter(x => x.uid === state.user?.uid).length;

  return `
    <div class="page market-page">
      <section class="hero">
        <h1>Marvel Market 🛍️</h1>
        <p>Buy, sell, and discover trusted items from community members.</p>
      </section>

      <div class="search" style="margin-bottom: 12px;">
        <input
          class="input"
          id="marketSearch"
          value="${escapeHtml(state.search || "")}"
          placeholder="Search the marketplace…"
        >
        <button class="btn btn-primary" id="sellBtn">+ Sell</button>
      </div>

      <div class="segmented" style="margin-bottom: 12px;">
        <button class="btn ${marketTab === "browse" ? "btn-primary" : "btn-ghost"}" id="browseTabBtn" style="flex:1;">Browse Market</button>
        <button class="btn ${marketTab === "mine" ? "btn-primary" : "btn-ghost"}" id="myListingsTabBtn" style="flex:1;">My Listings (${myListingsCount})</button>
      </div>

      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap;">
        <select class="select" id="marketSortSelect" style="width: auto; padding: 6px 12px; font-size: 13px;">
          <option value="newest" ${sortBy === "newest" ? "selected" : ""}>Newest first</option>
          <option value="oldest" ${sortBy === "oldest" ? "selected" : ""}>Oldest first</option>
        </select>
        <div style="display: flex; gap: 5px; overflow-x: auto; flex: 1; padding-bottom: 4px; white-space: nowrap;">
          ${
            marketCategories
              .map(
                c => `
                  <button
                    class="btn ${selectedCategory === c ? "btn-primary" : "btn-ghost"}"
                    data-market-category="${escapeHtml(c)}"
                    style="padding: 4px 10px; font-size: 12px; border-radius: 999px;"
                  >
                    ${escapeHtml(c)}
                  </button>
                `
              )
              .join("")
          }
        </div>
      </div>

      <div id="marketItems">
        ${
          filtered.length
            ? `
              <div class="list">
                ${
                  filtered
                    .map(
                      x => `
                        <div class="list-item" style="cursor: pointer;" data-view-listing="${x.id}">
                          <div class="profile-row" style="align-items: flex-start; justify-content: space-between;">
                            <div style="display: flex; gap: 10px; align-items: flex-start; flex: 1;">
                              <div class="avatar" style="font-size: 16px;">🛍</div>
                              <div class="profile-meta" style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                  <strong style="font-size: 15px;">${escapeHtml(x.title)}</strong>
                                  <span class="badge" style="background: var(--surface2);">${escapeHtml(x.category || "Other")}</span>
                                  <span class="badge" style="background: var(--surface2); color: var(--text);">${escapeHtml(x.condition || "Good")}</span>
                                </div>
                                <span class="small" style="display: block; margin-top: 2px;">
                                  By @${escapeHtml(x.username || "User")} · ${escapeHtml(x.location ? x.location + ", " : "")}${escapeHtml(x.country || "Community")} · ${escapeHtml(formatDate(x.createdAt))}
                                </span>
                                <p class="small" style="margin: 6px 0; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                                  ${escapeHtml(x.description || "")}
                                </p>
                                ${x.status === "sold" ? `<span class="badge" style="background: var(--danger); color: #fff;">Sold</span>` : ``}
                              </div>
                            </div>
                            <strong style="color: var(--primary); font-size: 16px; white-space: nowrap; margin-left: 8px;">
                              ₦${Number(x.price || 0).toLocaleString()}
                            </strong>
                          </div>
                        </div>
                      `
                    )
                    .join("")
                }
              </div>
            `
            : `
              <div class="card empty" style="padding: 40px 20px; text-align: center;">
                <div style="font-size: 40px; margin-bottom: 8px;">🛍️</div>
                <h3>${marketTab === "mine" ? "You have no active listings yet." : "The marketplace is quiet."}</h3>
                <p style="color: var(--text-secondary); margin-bottom: 16px;">${marketTab === "mine" ? "List something to start selling to the community." : "Be the first person to list something."}</p>
                <button class="btn btn-primary" id="emptySellBtn">Sell something</button>
              </div>
            `
        }
      </div>
    </div>
  `;
}

export function showSellModal(renderApp, existingListing = null) {
  const isEditing = Boolean(existingListing);
  const pCountry = state.profile?.country || "Nigeria";

  showModal(
    isEditing ? "Edit listing" : "Create marketplace listing",
    `
      <div class="field">
        <label>Title *</label>
        <input class="input" id="listingTitle" value="${escapeHtml(existingListing?.title || "")}" placeholder="What are you selling?">
      </div>

      <div class="field">
        <label>Description *</label>
        <textarea class="textarea" id="listingDescription" rows="4" placeholder="Describe your product or service clearly…">${escapeHtml(existingListing?.description || "")}</textarea>
      </div>

      <div class="grid grid2">
        <div class="field">
          <label>Price (₦) *</label>
          <input class="input" id="listingPrice" type="number" min="0" value="${existingListing?.price ?? ""}" placeholder="e.g. 25000">
        </div>

        <div class="field">
          <label>Category *</label>
          <select class="select" id="listingCategory">
            ${
              marketCategories
                .filter(x => x !== "All")
                .map(x => `<option value="${escapeHtml(x)}" ${existingListing?.category === x ? "selected" : ""}>${escapeHtml(x)}</option>`)
                .join("")
            }
          </select>
        </div>
      </div>

      <div class="grid grid2">
        <div class="field">
          <label>Condition *</label>
          <select class="select" id="listingCondition">
            ${
              conditions
                .map(x => `<option value="${escapeHtml(x)}" ${existingListing?.condition === x ? "selected" : ""}>${escapeHtml(x)}</option>`)
                .join("")
            }
          </select>
        </div>

        <div class="field">
          <label>Country *</label>
          <input class="input" id="listingCountry" value="${escapeHtml(existingListing?.country || pCountry)}" placeholder="Country">
        </div>
      </div>

      <div class="field">
        <label>Location / City</label>
        <input class="input" id="listingLocation" value="${escapeHtml(existingListing?.location || "")}" placeholder="e.g. Ikeja, Lagos">
      </div>

      <button class="btn btn-primary btn-block" id="publishListing">
        ${isEditing ? "Save changes" : "Publish listing 🛍️"}
      </button>
    `
  );

  document.getElementById("publishListing")?.addEventListener("click", async () => {
    const titleInput = document.getElementById("listingTitle");
    const descInput = document.getElementById("listingDescription");
    const priceInput = document.getElementById("listingPrice");
    const categoryInput = document.getElementById("listingCategory");
    const conditionInput = document.getElementById("listingCondition");
    const countryInput = document.getElementById("listingCountry");
    const locationInput = document.getElementById("listingLocation");

    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const priceVal = parseFloat(priceInput.value);
    const category = categoryInput.value;
    const condition = conditionInput.value;
    const country = countryInput.value.trim();
    const location = locationInput.value.trim();

    if (!title) { toast("Enter a title."); titleInput.focus(); return; }
    if (!description) { toast("Enter a description."); descInput.focus(); return; }
    if (Number.isNaN(priceVal) || priceVal < 0) { toast("Enter a valid price."); priceInput.focus(); return; }
    if (!category) { toast("Select a category."); return; }
    if (!condition) { toast("Select condition."); return; }
    if (!country) { toast("Enter a country."); countryInput.focus(); return; }

    const btn = document.getElementById("publishListing");
    btn.disabled = true;
    btn.textContent = isEditing ? "Saving…" : "Publishing…";

    try {
      const username = state.profile?.displayName || state.profile?.username || "User";

      if (isEditing) {
        await updateDoc(doc(db, "listings", existingListing.id), {
          title,
          description,
          price: priceVal,
          category,
          condition,
          country,
          location,
          updatedAt: serverTimestamp()
        });
        closeModal();
        toast("Listing updated successfully ✨");
      } else {
        await addDoc(collection(db, "listings"), {
          uid: state.user.uid,
          username,
          title,
          description,
          price: priceVal,
          category,
          condition,
          country,
          location,
          status: "active",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        closeModal();
        toast("Listing published 🛍️");
      }

      if (typeof renderApp === "function") renderApp();
    } catch (e) {
      console.error("[Marketplace] Save error:", e);
      toast(friendly(e));
      btn.disabled = false;
      btn.textContent = isEditing ? "Save changes" : "Publish listing 🛍️";
    }
  });
}

export async function showListingDetails(listingId, renderApp) {
  const listing = (state.listings || []).find(x => x.id === listingId);
  if (!listing) {
    toast("Listing not found.");
    return;
  }

  const isOwner = listing.uid === state.user?.uid;
  const postedDate = formatDate(listing.createdAt);
  const updatedDate = listing.updatedAt ? formatDate(listing.updatedAt) : null;

  const detailBody = `
    <div style="display: flex; flex-direction: column; gap: 16px; padding: 4px 0;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
        <div>
          <h2 style="font-size: clamp(26px, 5vw, 32px); color: var(--primary); margin: 0 0 6px;">₦${Number(listing.price || 0).toLocaleString()}</h2>
          <div class="small">Posted by <strong>@${escapeHtml(listing.username || "User")}</strong> · ${escapeHtml(postedDate)}${updatedDate && updatedDate !== postedDate ? ` (Updated ${escapeHtml(updatedDate)})` : ""}</div>
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
          <span class="badge">${escapeHtml(listing.category || "Other")}</span>
          <span class="badge" style="background: var(--surface2); color: var(--text);">${escapeHtml(listing.condition || "Good")}</span>
          ${listing.status === "sold" ? `<span class="badge" style="background: var(--danger); color: #fff;">Sold</span>` : ``}
        </div>
      </div>

      <div class="card" style="background: var(--surface2); padding: 16px; margin: 0; box-shadow: none; border-radius: 16px;">
        <strong style="display: block; margin-bottom: 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted);">Description</strong>
        <p style="white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 15px; line-height: 1.6;">${escapeHtml(listing.description || "")}</p>
      </div>

      <div class="small" style="background: var(--surface2); padding: 14px; border-radius: 16px; display: flex; flex-direction: column; gap: 6px;">
        <div>📍 Location: <strong>${escapeHtml(listing.location || "Not specified")} (${escapeHtml(listing.country || "Nigeria")})</strong></div>
        <div>📋 Status: <strong>${escapeHtml(listing.status === "sold" ? "Sold" : "Active")}</strong></div>
      </div>

      <div id="listingActionArea" style="margin-top: auto; padding-top: 12px;">
        ${
          isOwner
            ? `
              <div class="grid grid3" style="gap: 10px;">
                <button class="btn btn-secondary" id="editListingBtn" style="padding: 13px;">✏️ Edit</button>
                <button class="btn ${listing.status === "sold" ? "btn-secondary" : "btn-ghost"}" id="toggleSoldBtn" style="padding: 13px;">
                  ${listing.status === "sold" ? "Reactivate" : "Mark as Sold"}
                </button>
                <button class="btn btn-danger" id="deleteListingBtn" style="padding: 13px;">🗑️ Delete</button>
              </div>
            `
            : `
              <button class="btn btn-primary btn-block" id="messageSellerBtn" style="padding: 15px; font-size: 16px;">
                💬 Contact Seller @${escapeHtml(listing.username || "Seller")}
              </button>
            `
        }
      </div>
    </div>
  `;

  // Open using fullscreen modal size variant
  showModal(listing.title || "Listing Details", detailBody, { size: "fullscreen" });

  if (isOwner) {
    document.getElementById("editListingBtn")?.addEventListener("click", () => {
      closeModal();
      showSellModal(renderApp, listing);
    });

    document.getElementById("toggleSoldBtn")?.addEventListener("click", async () => {
      try {
        const toggleBtn = document.getElementById("toggleSoldBtn");
        toggleBtn.disabled = true;
        const newStatus = listing.status === "sold" ? "active" : "sold";
        await updateDoc(doc(db, "listings", listing.id), {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
        toast(newStatus === "sold" ? "Marked as sold 🏷️" : "Listing reactivated 🚀");
        closeModal();
        if (typeof renderApp === "function") renderApp();
      } catch (e) {
        console.error("[Marketplace] Toggle sold error:", e);
        toast(friendly(e));
      }
    });

    document.getElementById("deleteListingBtn")?.addEventListener("click", () => {
      showModal(
        "Delete listing?",
        `
          <p class="small">Are you sure you want to delete "${escapeHtml(listing.title)}"? This action cannot be undone.</p>
          <div style="display: flex; gap: 8px; margin-top: 15px;">
            <button class="btn btn-ghost" style="flex: 1;" id="cancelDelete">Cancel</button>
            <button class="btn btn-danger" style="flex: 1;" id="confirmDelete">Delete</button>
          </div>
        `
      );

      document.getElementById("cancelDelete")?.addEventListener("click", () => {
        showListingDetails(listingId, renderApp);
      });

      document.getElementById("confirmDelete")?.addEventListener("click", async () => {
        const delBtn = document.getElementById("confirmDelete");
        try {
          delBtn.disabled = true;
          delBtn.textContent = "Deleting…";
          await deleteDoc(doc(db, "listings", listing.id));
          toast("Listing deleted.");
          closeModal();
          if (typeof renderApp === "function") renderApp();
        } catch (e) {
          console.error("[Marketplace] Delete error:", e);
          toast(friendly(e));
          delBtn.disabled = false;
          delBtn.textContent = "Delete";
        }
      });
    });
  } else {
    document.getElementById("messageSellerBtn")?.addEventListener("click", async () => {
      const contactBtn = document.getElementById("messageSellerBtn");
      try {
        contactBtn.disabled = true;
        contactBtn.textContent = `Opening chat with @${listing.username}…`;

        const sellerUid = listing.uid;
        const userSnap = await getDocs(query(collection(db, "users"), where("uid", "==", sellerUid), limit(1)));
        let sellerProfile = { uid: sellerUid, username: listing.username || "Seller", displayName: listing.username || "Seller" };
        if (!userSnap.empty) {
          sellerProfile = { id: userSnap.docs[0].id, ...userSnap.docs[0].data() };
        }

        closeModal();
        await createConversation(sellerProfile, renderApp);
        toast(`Connected with @${listing.username} 💬`);
      } catch (e) {
        console.error("[Marketplace] Contact seller error:", e);
        toast("Could not open chat with seller.");
        contactBtn.disabled = false;
        contactBtn.textContent = `💬 Contact Seller @${escapeHtml(listing.username || "Seller")}`;
      }
    });
  }
}

export function attachMarketEvents(renderApp) {
  document.getElementById("sellBtn")?.addEventListener("click", () => showSellModal(renderApp));
  document.getElementById("emptySellBtn")?.addEventListener("click", () => showSellModal(renderApp));

  document.getElementById("browseTabBtn")?.addEventListener("click", () => {
    state.marketTab = "browse";
    renderApp();
  });

  document.getElementById("myListingsTabBtn")?.addEventListener("click", () => {
    state.marketTab = "mine";
    renderApp();
  });

  const searchInput = document.getElementById("marketSearch");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      state.search = e.target.value;
      renderApp();
      setTimeout(() => {
        const input = document.getElementById("marketSearch");
        if (input) {
          input.focus();
          input.selectionStart = input.selectionEnd = input.value.length;
        }
      }, 0);
    });
  }

  const sortSelect = document.getElementById("marketSortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", e => {
      state.marketSort = e.target.value;
      renderApp();
    });
  }

  document.querySelectorAll("[data-market-category]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.marketCategory = btn.dataset.marketCategory;
      renderApp();
    });
  });

  document.querySelectorAll("[data-view-listing]").forEach(item => {
    item.addEventListener("click", () => {
      showListingDetails(item.dataset.viewListing, renderApp);
    });
  });
}
