import { state, escapeHtml, friendly } from "../state.js";
import { db, collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs, query, where, limit } from "../firebase/firestore.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { openConversation } from "./chat.js";

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

  const filtered = state.listings.filter(x => {
    const matchesSearch = !queryText || (
      `${x.title || ""} ${x.description || ""} ${x.username || ""} ${x.category || ""} ${x.location || ""} ${x.country || ""}`
    ).toLowerCase().includes(queryText);

    const matchesCategory = selectedCategory === "All" || x.category === selectedCategory;
    
    if (marketTab === "mine") {
      const isOwner = x.uid === state.user.uid;
      return matchesSearch && matchesCategory && isOwner;
    } else {
      // General browse: show active listings, or sold if viewing user's own
      const isActive = x.status !== "sold";
      return matchesSearch && matchesCategory && isActive;
    }
  });

  return `
    <div class="page">
      <section class="hero">
        <h1>Marvel Market 🛍️</h1>
        <p>Buy, sell and discover things from the community.</p>
      </section>

      <div class="search">
        <input
          class="input"
          id="marketSearch"
          value="${escapeHtml(state.search || "")}"
          placeholder="Search the marketplace…"
        >
        <button class="btn btn-primary" id="sellBtn">+ Sell</button>
      </div>

      <div class="segmented" style="margin-bottom:10px;">
        <button class="btn ${marketTab === "browse" ? "btn-primary" : "btn-ghost"}" id="browseTabBtn">Browse Market</button>
        <button class="btn ${marketTab === "mine" ? "btn-primary" : "btn-ghost"}" id="myListingsTabBtn">My Listings</button>
      </div>

      <div class="segmented" style="overflow-x:auto; padding-bottom:4px;">
        ${
          marketCategories
            .map(
              c => `
                <button
                  class="btn ${selectedCategory === c ? "btn-primary" : "btn-ghost"}"
                  data-market-category="${escapeHtml(c)}"
                >
                  ${escapeHtml(c)}
                </button>
              `
            )
            .join("")
        }
      </div>

      <div id="marketItems" style="margin-top:14px;">
        ${
          filtered.length
            ? `
              <div class="list">
                ${
                  filtered
                    .map(
                      x => `
                        <div class="list-item" style="cursor:pointer;" data-view-listing="${x.id}">
                          <div class="profile-row">
                            <div class="avatar">🛍</div>
                            <div class="profile-meta">
                              <strong>${escapeHtml(x.title)}</strong>
                              <span class="small">
                                ${escapeHtml(x.username || "User")} · ${escapeHtml(x.location ? x.location + ", " : "")}${escapeHtml(x.country || "Community")}
                              </span>
                            </div>
                            <strong style="color:var(--primary); font-size:16px;">
                              ₦${Number(x.price || 0).toLocaleString()}
                            </strong>
                          </div>

                          <p class="small" style="margin:8px 0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                            ${escapeHtml(x.description || "")}
                          </p>

                          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                            <span class="badge">${escapeHtml(x.category || "Other")}</span>
                            <span class="badge" style="background:var(--surface2); color:var(--text);">${escapeHtml(x.condition || "Good")}</span>
                            ${x.status === "sold" ? `<span class="badge" style="background:var(--danger); color:#fff;">Sold</span>` : ``}
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
                <div style="font-size:40px">🛍️</div>
                <h3>${marketTab === "mine" ? "You have no listings yet." : "The marketplace is quiet."}</h3>
                <p>${marketTab === "mine" ? "List something to start selling to the community." : "Be the first person to list something."}</p>
                <button class="btn btn-primary" id="emptySellBtn" style="margin-top:12px;">Sell something</button>
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
        <textarea class="textarea" id="listingDescription" placeholder="Describe your product or service…">${escapeHtml(existingListing?.description || "")}</textarea>
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
        <input class="input" id="listingLocation" value="${escapeHtml(existingListing?.location || "")}" placeholder="e.g. Abuja">
      </div>

      <button class="btn btn-primary btn-block" id="publishListing">
        ${isEditing ? "Save changes" : "Publish listing 🛍️"}
      </button>
    `
  );

  document.getElementById("publishListing")?.addEventListener("click", async () => {
    const title = document.getElementById("listingTitle").value.trim();
    const description = document.getElementById("listingDescription").value.trim();
    const priceVal = parseFloat(document.getElementById("listingPrice").value);
    const category = document.getElementById("listingCategory").value;
    const condition = document.getElementById("listingCondition").value;
    const country = document.getElementById("listingCountry").value.trim();
    const location = document.getElementById("listingLocation").value.trim();

    if (!title) { toast("Enter a title."); return; }
    if (!description) { toast("Enter a description."); return; }
    if (Number.isNaN(priceVal) || priceVal < 0) { toast("Enter a valid price."); return; }
    if (!category) { toast("Select a category."); return; }
    if (!condition) { toast("Select condition."); return; }
    if (!country) { toast("Enter a country."); return; }

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
        toast("Listing published 🛍️");
      }

      closeModal();
      renderApp();
    } catch (e) {
      toast(friendly(e));
      btn.disabled = false;
      btn.textContent = isEditing ? "Save changes" : "Publish listing 🛍️";
    }
  });
}

export async function showListingDetails(listingId, renderApp) {
  const listing = state.listings.find(x => x.id === listingId);
  if (!listing) {
    toast("Listing not found.");
    return;
  }

  const isOwner = listing.uid === state.user.uid;

  showModal(
    listing.title,
    `
      <div style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
          <div>
            <h2 style="font-size:24px; color:var(--primary); margin:0 0 4px;">₦${Number(listing.price || 0).toLocaleString()}</h2>
            <div class="small">${escapeHtml(listing.location ? listing.location + ", " : "")}${escapeHtml(listing.country || "Community")} · Posted by <strong>${escapeHtml(listing.username || "User")}</strong></div>
          </div>
          <div>
            <span class="badge">${escapeHtml(listing.category || "Other")}</span>
            <span class="badge" style="background:var(--surface2); color:var(--text); margin-left:4px;">${escapeHtml(listing.condition || "Good")}</span>
            ${listing.status === "sold" ? `<span class="badge" style="background:var(--danger); color:#fff; margin-left:4px;">Sold</span>` : ``}
          </div>
        </div>
      </div>

      <div class="card" style="background:var(--surface2); margin-bottom:15px; box-shadow:none;">
        <strong style="display:block; margin-bottom:6px; font-size:13px;">Description</strong>
        <p class="post-body" style="margin:0;">${escapeHtml(listing.description || "")}</p>
      </div>

      <div class="small" style="margin-bottom:15px;">
        Condition: <strong>${escapeHtml(listing.condition || "Good")}</strong><br>
        Location: <strong>${escapeHtml(listing.location || "Not specified")} (${escapeHtml(listing.country || "")})</strong><br>
        Status: <strong>${escapeHtml(listing.status === "sold" ? "Sold" : "Active")}</strong>
      </div>

      <div id="listingActionArea">
        ${
          isOwner
            ? `
              <div class="grid grid3" style="gap:8px;">
                <button class="btn btn-secondary" id="editListingBtn">✏️ Edit</button>
                <button class="btn ${listing.status === "sold" ? "btn-secondary" : "btn-ghost"}" id="toggleSoldBtn">
                  ${listing.status === "sold" ? "Reactivate" : "Mark as Sold"}
                </button>
                <button class="btn btn-danger" id="deleteListingBtn">🗑️ Delete</button>
              </div>
            `
            : `
              <button class="btn btn-primary btn-block" id="messageSellerBtn">
                💬 Message Seller
              </button>
            `
        }
      </div>
    `
  );

  if (isOwner) {
    document.getElementById("editListingBtn")?.addEventListener("click", () => {
      closeModal();
      showSellModal(renderApp, listing);
    });

    document.getElementById("toggleSoldBtn")?.addEventListener("click", async () => {
      try {
        const newStatus = listing.status === "sold" ? "active" : "sold";
        await updateDoc(doc(db, "listings", listing.id), {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
        toast(newStatus === "sold" ? "Marked as sold 🏷️" : "Listing reactivated 🚀");
        closeModal();
        renderApp();
      } catch (e) {
        toast(friendly(e));
      }
    });

    document.getElementById("deleteListingBtn")?.addEventListener("click", () => {
      showModal(
        "Delete listing?",
        `
          <p class="small">Are you sure you want to delete "${escapeHtml(listing.title)}"? This action cannot be undone.</p>
          <div style="display:flex; gap:8px; margin-top:15px;">
            <button class="btn btn-ghost" style="flex:1;" id="cancelDelete">Cancel</button>
            <button class="btn btn-danger" style="flex:1;" id="confirmDelete">Delete</button>
          </div>
        `
      );

      document.getElementById("cancelDelete")?.addEventListener("click", () => {
        showListingDetails(listingId, renderApp);
      });

      document.getElementById("confirmDelete")?.addEventListener("click", async () => {
        try {
          await deleteDoc(doc(db, "listings", listing.id));
          toast("Listing deleted.");
          closeModal();
          renderApp();
        } catch (e) {
          toast(friendly(e));
        }
      });
    });
  } else {
    document.getElementById("messageSellerBtn")?.addEventListener("click", async () => {
      try {
        closeModal();
        // Check existing conversations or create new one with seller
        const sellerUid = listing.uid;
        // Fetch user profile for seller
        const userSnap = await getDocs(query(collection(db, "users"), where("uid", "==", sellerUid), limit(1)));
        let sellerProfile = { uid: sellerUid, username: listing.username || "Seller", displayName: listing.username || "Seller" };
        if (!userSnap.empty) {
          sellerProfile = { id: userSnap.docs[0].id, ...userSnap.docs[0].data() };
        }

        // Import chat creation helper dynamically or via state/modules
        const { createConversation } = await import("./chat.js");
        await createConversation(sellerProfile, renderApp);
      } catch (e) {
        toast("Could not open chat with seller.");
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

  document.getElementById("marketSearch")?.addEventListener("input", e => {
    state.search = e.target.value;
    renderApp();
  });

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
