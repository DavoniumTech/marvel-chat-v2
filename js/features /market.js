import {
  state,
  escapeHtml,
  friendly,
  formatDate
} from "../state.js";

import {
  db,
  collection,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  limit,
  getDoc
} from "../firebase/firestore.js";

import {
  showModal,
  closeModal
} from "../components/modal.js";

import { toast } from "../components/toast.js";

import { createConversation } from "./chat.js";

/* =========================================================
   MARVEL MARKET
   ========================================================= */

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

/* =========================================================
   MARKET STATE
   ========================================================= */

function getUid() {
  return state.user?.uid || null;
}

function getMyListings() {
  const uid = getUid();

  if (!uid) {
    return [];
  }

  return (state.listings || []).filter(
    listing => listing.uid === uid
  );
}

export function hasMarketAccount() {
  const uid = getUid();

  if (!uid) {
    return false;
  }

  if (
    state.profile?.marketAccount?.active === true
  ) {
    return true;
  }

  return getMyListings().length > 0;
}

async function migrateExistingSeller() {
  const uid = getUid();

  if (!uid || !state.profile) {
    return;
  }

  if (
    state.profile.marketAccount?.active === true
  ) {
    return;
  }

  const existingListings =
    getMyListings();

  if (!existingListings.length) {
    return;
  }

  const account = {
    active: true,

    storeName:
      state.profile.displayName ||
      state.profile.username ||
      "Market Seller",

    bio: "",

    location:
      state.profile.country || "",

    migratedFromListing: true,

    createdAt:
      serverTimestamp(),

    updatedAt:
      serverTimestamp()
  };

  try {

    await updateDoc(
      doc(
        db,
        "users",
        uid
      ),
      {
        marketAccount: account
      }
    );

    state.profile = {
      ...state.profile,

      marketAccount: {
        ...account,

        createdAt:
          new Date(),

        updatedAt:
          new Date()
      }
    };

  } catch (error) {

    console.warn(
      "[Market] Existing seller migration skipped:",
      error
    );
  }
}

/* =========================================================
   MARKET ACCOUNT MODAL
   ========================================================= */

export function showMarketAccountModal(
  renderApp
) {

  if (!state.user) {

    toast(
      "Please sign in first."
    );

    return;
  }

  const account =
    state.profile?.marketAccount || {};

  const existingSeller =
    getMyListings().length > 0;

  const accountExists =
    account.active === true ||
    existingSeller;

  showModal(

    accountExists
      ? "Manage Marketplace Account"
      : "Create Marketplace Account",

    `
      <div class="field">

        <label>
          Seller / Store name *
        </label>

        <input
          class="input"
          id="storeNameInput"
          placeholder="e.g. Marvel Gadgets"
          value="${escapeHtml(
            account.storeName ||
            state.profile?.displayName ||
            state.profile?.username ||
            ""
          )}"
        >

      </div>


      <div class="field">

        <label>
          Store Bio / Description
        </label>

        <textarea
          class="textarea"
          id="storeBioInput"
          maxlength="300"
          placeholder="What do you sell?"
        >${escapeHtml(
          account.bio || ""
        )}</textarea>

      </div>


      <div class="field">

        <label>
          Location / City
        </label>

        <input
          class="input"
          id="storeLocationInput"
          placeholder="e.g. Lagos, Nigeria"
          value="${escapeHtml(
            account.location ||
            state.profile?.country ||
            ""
          )}"
        >

      </div>


      <button
        class="btn btn-primary btn-block"
        id="saveMarketAccountBtn"
        type="button"
      >
        ${
          accountExists
            ? "Save Changes"
            : "Create Account 🏪"
        }
      </button>
    `
  );

  document
    .getElementById(
      "saveMarketAccountBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        const storeName =
          document
            .getElementById(
              "storeNameInput"
            )
            ?.value
            .trim();

        const bio =
          document
            .getElementById(
              "storeBioInput"
            )
            ?.value
            .trim() || "";

        const location =
          document
            .getElementById(
              "storeLocationInput"
            )
            ?.value
            .trim() || "";

        if (!storeName) {

          toast(
            "Store name is required."
          );

          return;
        }

        const btn =
          document.getElementById(
            "saveMarketAccountBtn"
          );

        if (btn) {

          btn.disabled = true;

          btn.textContent =
            "Saving…";
        }

        try {

          const marketAccount = {

            active: true,

            storeName,

            bio,

            location,

            updatedAt:
              serverTimestamp()
          };

          if (!accountExists) {

            marketAccount.createdAt =
              serverTimestamp();
          }

          await updateDoc(
            doc(
              db,
              "users",
              state.user.uid
            ),
            {
              marketAccount
            }
          );

          state.profile = {

            ...state.profile,

            marketAccount: {

              ...marketAccount,

              createdAt:
                account.createdAt ||
                new Date(),

              updatedAt:
                new Date()
            }
          };

          closeModal();

          toast(

            accountExists
              ? "Marketplace Account updated ✨"
              : "Marketplace Account created! 🏪"
          );

          renderApp?.();

        } catch (error) {

          console.error(
            "[Market] Save account error:",
            error
          );

          toast(
            friendly(error)
          );

        } finally {

          if (btn) {

            btn.disabled = false;

            btn.textContent =
              accountExists
                ? "Save Changes"
                : "Create Account 🏪";
          }
        }

      }
    );
}

/* =========================================================
   CONTACT SELLER
   ========================================================= */

async function contactSeller(
  listing,
  renderApp
) {

  if (!state.user) {

    toast(
      "Please sign in to contact the seller."
    );

    return;
  }

  if (
    listing.uid ===
    state.user.uid
  ) {

    toast(
      "This is your own listing."
    );

    return;
  }

  try {
    let sellerProfile = {
      uid: listing.uid,
      displayName: listing.sellerName || listing.username || "Seller",
      username: listing.username || ""
    };

    if (listing.uid) {
      const uSnap = await getDoc(doc(db, "users", listing.uid));
      if (uSnap.exists()) {
        const uData = uSnap.data();
        sellerProfile = {
          uid: listing.uid,
          displayName: uData.displayName || uData.username || listing.sellerName || "Seller",
          username: uData.username || ""
        };
      }
    }

    await createConversation(sellerProfile, renderApp);
  } catch (e) {
    console.error("CONTACT SELLER ERROR:", e);
    toast(friendly(e));
  }
}

/* =========================================================
   CREATE LISTING MODAL
   ========================================================= */

export function showCreateListing(
  renderApp
) {

  if (!state.user) {

    toast(
      "Please sign in first."
    );

    return;
  }

  if (!hasMarketAccount()) {

    showMarketAccountModal(
      renderApp
    );

    return;
  }

  const account =
    state.profile?.marketAccount || {};

  showModal(

    "Create Market Listing",

    `
      <div class="field">

        <label>
          Item title *
        </label>

        <input
          class="input"
          id="listingTitle"
          maxlength="80"
          placeholder="e.g. iPhone 13 Pro 128GB"
        >

      </div>


      <div class="field">

        <label>
          Category *
        </label>

        <select
          class="input"
          id="listingCategory"
        >

          ${marketCategories

            .filter(
              cat => cat !== "All"
            )

            .map(

              cat => `

                <option value="${escapeHtml(
                  cat
                )}">
                  ${escapeHtml(
                    cat
                  )}
                </option>

              `
            )

            .join("")}

        </select>

      </div>


      <div class="field">

        <label>
          Price (₦) *
        </label>

        <input
          class="input"
          id="listingPrice"
          min="0"
          placeholder="e.g. 250000"
          type="number"
        >

      </div>


      <div class="field">

        <label>
          Condition
        </label>

        <select
          class="input"
          id="listingCondition"
        >

          ${conditions

            .map(

              cond => `

                <option value="${escapeHtml(
                  cond
                )}">
                  ${escapeHtml(
                    cond
                  )}
                </option>

              `
            )

            .join("")}

        </select>

      </div>


      <div class="field">

        <label>
          Location / City
        </label>

        <input
          class="input"
          id="listingLocation"
          placeholder="e.g. Ikeja, Lagos"
          value="${escapeHtml(
            account.location ||
            ""
          )}"
        >

      </div>


      <div class="field">

        <label>
          Description *
        </label>

        <textarea
          class="textarea"
          id="listingDescription"
          maxlength="1000"
          placeholder="Describe condition, specs, reason for selling…"
        ></textarea>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="publishListingBtn"
        type="button"
      >
        Publish Listing 🚀
      </button>
    `
  );

  document
    .getElementById(
      "publishListingBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        const title =
          document
            .getElementById(
              "listingTitle"
            )
            ?.value
            .trim();

        const category =
          document
            .getElementById(
              "listingCategory"
            )
            ?.value;

        const price =
          Number(
            document
              .getElementById(
                "listingPrice"
              )
              ?.value
          ) || 0;

        const condition =
          document
            .getElementById(
              "listingCondition"
            )
            ?.value;

        const location =
          document
            .getElementById(
              "listingLocation"
            )
            ?.value
            .trim() || "";

        const description =
          document
            .getElementById(
              "listingDescription"
            )
            ?.value
            .trim();

        if (!title) {

          toast(
            "Item title is required."
          );

          return;
        }

        if (price <= 0) {

          toast(
            "Enter a valid price."
          );

          return;
        }

        if (!description) {

          toast(
            "Description is required."
          );

          return;
        }

        const btn =
          document.getElementById(
            "publishListingBtn"
          );

        if (btn) {

          btn.disabled = true;

          btn.textContent =
            "Publishing…";
        }

        try {

          const docRef =
            await addDoc(

              collection(
                db,
                "listings"
              ),

              {

                uid:
                  state.user.uid,

                sellerName:
                  account.storeName ||
                  state.profile
                    .displayName ||
                  state.profile
                    .username ||
                  "Seller",

                username:
                  state.profile
                    .username ||
                  "",

                title,

                category,

                price,

                condition,

                location,

                description,

                status: "active",

                createdAt:
                  serverTimestamp(),

                updatedAt:
                  serverTimestamp()
              }
            );

          const newListing = {

            id: docRef.id,

            uid: state.user.uid,

            sellerName:
              account.storeName ||
              state.profile
                .displayName ||
              state.profile
                .username ||
              "Seller",

            username:
              state.profile
                .username || "",

            title,

            category,

            price,

            condition,

            location,

            description,

            status: "active",

            createdAt: new Date(),

            updatedAt: new Date()
          };

          state.listings = [

            newListing,

            ...(state.listings || [])

          ];

          closeModal();

          toast(
            "Listing published! 🛍️"
          );

          renderApp?.();

        } catch (error) {

          console.error(
            "[Market] Publish error:",
            error
          );

          toast(
            friendly(error)
          );

        } finally {

          if (btn) {

            btn.disabled = false;

            btn.textContent =
              "Publish Listing 🚀";
          }
        }

      }
    );
}

/* =========================================================
   LISTING DETAILS MODAL
   ========================================================= */

export function showListingDetails(
  listingId,
  renderApp
) {

  const listing =
    (state.listings || []).find(
      item => item.id === listingId
    );

  if (!listing) {

    toast("Listing not found.");

    return;
  }

  const isOwner =
    listing.uid ===
    state.user?.uid;

  showModal(

    escapeHtml(
      listing.title ||
      "Listing Details"
    ),

    `
      <div
        style="
          display:flex;
          flex-direction:column;
          gap:12px;
        "
      >

        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:flex-start;
            gap:12px;
            flex-wrap:wrap;
          "
        >

          <div>

            <strong
              style="
                font-size:22px;
                color:var(--primary);
              "
            >
              ₦${Number(
                listing.price || 0
              ).toLocaleString()}
            </strong>


            <span
              class="badge"
              style="margin-left:8px;"
            >
              ${escapeHtml(
                listing.condition ||
                "Used"
              )}
            </span>

          </div>


          <span
            class="badge"
            style="
              ${
                listing.status ===
                "sold"
                  ? "background:var(--danger);color:#fff;"
                  : "background:var(--surface2);"
              }
            "
          >
            ${
              listing.status === "sold"
                ? "🏷️ Sold"
                : "🟢 Active"
            }
          </span>

        </div>


        <div
          class="card"
          style="
            padding:10px;
            margin:0;
            background:var(--surface);
          "
        >

          <span class="small">
            Seller:
          </span>


          <strong>
            ${escapeHtml(
              listing.sellerName ||
              "Seller"
            )}
          </strong>


          ${
            listing.username

              ? `

                <span class="small">
                  (@${escapeHtml(
                    listing.username
                  )})
                </span>

              `

              : ""
          }


          ${
            listing.location

              ? `

                <div
                  class="small"
                  style="margin-top:4px;"
                >
                  📍 ${escapeHtml(
                    listing.location
                  )}
                </div>

              `

              : ""
          }

        </div>


        <div>

          <span class="small">
            Category:
            ${escapeHtml(
              listing.category ||
              "Other"
            )}
          </span>


          <span
            class="small"
            style="margin-left:12px;"
          >
            Posted:
            ${escapeHtml(
              formatDate(
                listing.createdAt
              )
            )}
          </span>

        </div>


        <div>

          <label
            style="
              font-weight:bold;
              display:block;
              margin-bottom:4px;
            "
          >
            Description
          </label>


          <p
            class="small"
            style="
              line-height:1.5;
              white-space:pre-wrap;
              word-break:break-word;
            "
          >
            ${escapeHtml(
              listing.description ||
              "No description provided."
            )}
          </p>

        </div>


        ${
          !isOwner

            ? `

              <button
                class="btn btn-primary btn-block"
                id="contactSellerBtn"
                type="button"
              >
                💬 Contact Seller
              </button>

            `

            : `

              <div
                class="grid grid2"
                style="margin-top:8px;"
              >

                <button
                  class="btn btn-ghost"
                  id="toggleSoldBtn"
                  type="button"
                >
                  ${
                    listing.status ===
                    "sold"
                      ? "Reactivate"
                      : "Mark as Sold"
                  }
                </button>


                <button
                  class="btn btn-danger"
                  id="deleteListingBtn"
                  type="button"
                >
                  🗑️ Delete
                </button>

              </div>

            `
        }

      </div>
    `
  );

  if (!isOwner) {

    document
      .getElementById(
        "contactSellerBtn"
      )
      ?.addEventListener(
        "click",
        () => {

          closeModal();

          contactSeller(
            listing,
            renderApp
          );

        }
      );

  } else {

    document
      .getElementById(
        "toggleSoldBtn"
      )
      ?.addEventListener(
        "click",
        async () => {

          const newStatus =
            listing.status === "sold"
              ? "active"
              : "sold";

          try {

            await updateDoc(
              doc(
                db,
                "listings",
                listing.id
              ),
              {
                status: newStatus,

                updatedAt:
                  serverTimestamp()
              }
            );

            state.listings =
              (
                state.listings ||
                []
              ).map(item =>

                item.id ===
                listing.id

                  ? {

                      ...item,

                      status:
                        newStatus

                    }

                  : item
              );

            closeModal();

            toast(

              newStatus === "sold"
                ? "Marked as sold 🏷️"
                : "Listing reactivated 🟢"
            );

            renderApp?.();

          } catch (error) {

            console.error(
              "[Market] Status toggle error:",
              error
            );

            toast(
              friendly(error)
            );
          }

        }
      );

    document
      .getElementById(
        "deleteListingBtn"
      )
      ?.addEventListener(
        "click",
        async () => {

          try {

            await deleteDoc(
              doc(
                db,
                "listings",
                listing.id
              )
            );

            state.listings =
              (
                state.listings ||
                []
              ).filter(

                item =>
                  item.id !==
                  listing.id
              );

            closeModal();

            toast(
              "Listing deleted."
            );

            renderApp?.();

          } catch (error) {

            console.error(
              "[Market] Delete listing error:",
              error
            );

            toast(
              friendly(error)
            );
          }

        }
      );
  }
}

/* =========================================================
   RENDER MARKET PAGE
   ========================================================= */

export function renderMarket(
  renderApp
) {

  migrateExistingSeller();

  const selectedCategory =
    state.marketCategory || "All";

  const searchQuery =
    (
      state.marketSearch || ""
    ).toLowerCase();

  const marketActive =
    hasMarketAccount();

  const rawListings =
    state.listings || [];

  return `

    <div class="page">


      <!-- =================================================
           HEADER
           ================================================= -->

      <div class="section-title">

        <div>

          <h2>
            Marvel Market 🛍️
          </h2>


          <div class="small">
            Buy and sell within your community
          </div>

        </div>


        <div
          style="
            display:flex;
            gap:8px;
          "
        >

          ${
            !marketActive

              ? `

                <button
                  class="btn btn-ghost"
                  id="marketAccountBtn"
                  type="button"
                >
                  🏪 Seller Account
                </button>

              `

              : ""
          }


          <button
            class="btn btn-primary"
            id="createListingBtn"
            type="button"
          >
            + Sell Item
          </button>

        </div>

      </div>


      <!-- =================================================
           SEARCH BAR
           ================================================= -->

      <div class="search">

        <input
          class="input"
          id="marketSearchInput"
          placeholder="Search items, sellers, locations…"
          value="${escapeHtml(
            state.marketSearch || ""
          )}"
        >

      </div>


      <!-- =================================================
           CATEGORY SCROLLER
           ================================================= -->

      <div
        style="
          display:flex;
          gap:8px;
          overflow-x:auto;
          padding-bottom:8px;
          margin-bottom:14px;
          -webkit-overflow-scrolling:touch;
        "
      >

        ${marketCategories

          .map(

            cat => `

              <button
                type="button"
                data-market-cat="${escapeHtml(
                  cat
                )}"
                class="btn ${
                  selectedCategory ===
                  cat
                    ? "btn-primary"
                    : "btn-ghost"
                }"
                style="
                  flex:none;
                  padding:6px 14px;
                  font-size:13px;
                  white-space:nowrap;
                "
              >
                ${escapeHtml(cat)}
              </button>

            `
          )

          .join("")}

      </div>


      <!-- =================================================
           LISTINGS GRID / LIST
           ================================================= -->

      <div id="marketListingsContainer">
        ${renderMarketingsList(rawListings, selectedCategory, searchQuery)}
      </div>

    </div>

  `;
}

function renderMarketingsList(listings, selectedCategory, searchQuery) {
  const filteredListings = listings.filter(
    item => {
      if (
        selectedCategory !== "All" &&
        item.category !== selectedCategory
      ) {
        return false;
      }

      if (!searchQuery) {
        return true;
      }

      const title =
        (item.title || "").toLowerCase();

      const desc =
        (
          item.description || ""
        ).toLowerCase();

      const seller =
        (
          item.sellerName || ""
        ).toLowerCase();

      const location =
        (
          item.location || ""
        ).toLowerCase();

      const category =
        (
          item.category || ""
        ).toLowerCase();

      return (
        title.includes(searchQuery) ||
        desc.includes(searchQuery) ||
        seller.includes(searchQuery) ||
        location.includes(searchQuery) ||
        category.includes(searchQuery)
      );
    }
  );

  if (!filteredListings.length) {
    return `
      <div class="card empty">

        <div style="font-size:38px">
          🛍️
        </div>


        <h3>
          No listings found
        </h3>


        <p class="small">

          ${
            searchQuery ||
            selectedCategory !== "All"

              ? "Try adjusting your search or category filter."

              : "Be the first person to post a listing!"
          }

        </p>


        <button
          class="btn btn-primary"
          id="emptySellBtn"
          type="button"
          style="margin-top:10px;"
        >
          Post a listing
        </button>

      </div>
    `;
  }

  return `
    <div
      class="grid grid2"
      id="marketListingsGrid"
    >

      ${filteredListings

        .map(

          item => `

            <div
              class="card list-item"
              data-listing-id="${escapeHtml(
                item.id
              )}"
              style="
                cursor:pointer;
                display:flex;
                flex-direction:column;
                justify-content:space-between;
                gap:10px;
                margin:0;
              "
            >

              <div>

                <div
                  style="
                    display:flex;
                    justify-content:space-between;
                    align-items:flex-start;
                    gap:8px;
                    margin-bottom:6px;
                  "
                >

                  <strong
                    style="
                      font-size:15px;
                      line-height:1.3;
                      overflow-wrap:anywhere;
                    "
                  >
                    ${escapeHtml(
                      item.title ||
                      "Untitled"
                    )}
                  </strong>


                  <span
                    class="badge"
                    style="
                      flex:none;

                      ${
                        item.status ===
                        "sold"

                          ? "background:var(--danger);color:#fff;"

                          : ""
                      }

                    "
                  >
                    ${
                      item.status ===
                      "sold"

                        ? "Sold"

                        : escapeHtml(
                            item.condition ||
                            "Used"
                          )
                    }
                  </span>

                </div>


                <div
                  style="
                    font-size:18px;
                    font-weight:bold;
                    color:var(--primary);
                    margin-bottom:6px;
                  "
                >
                  ₦${Number(
                    item.price || 0
                  ).toLocaleString()}
                </div>


                <p
                  class="small"
                  style="
                    display:-webkit-box;
                    -webkit-line-clamp:2;
                    -webkit-box-orient:vertical;
                    overflow:hidden;
                    margin:0;
                    line-height:1.4;
                  "
                >
                  ${escapeHtml(
                    item.description ||
                    ""
                  )}
                </p>

              </div>


              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  align-items:center;
                  padding-top:8px;
                  border-top:1px solid var(--border);
                  font-size:12px;
                  color:var(--muted);
                "
              >

                <span>
                  👤 ${escapeHtml(
                    item.sellerName ||
                    "Seller"
                  )}
                </span>


                ${
                  item.location

                    ? `

                      <span>
                        📍 ${escapeHtml(
                          item.location
                        )}
                      </span>

                    `

                    : `

                      <span>
                        ${escapeHtml(
                          item.category ||
                          "Other"
                        )}
                      </span>

                    `
                }

              </div>

            </div>

          `
        )

        .join("")}

    </div>
  `;
}

if (!window.__marvelMarketEventsInstalled) {
  window.__marvelMarketEventsInstalled = true;

  document.addEventListener("input", event => {
    if (event.target && event.target.id === "marketSearchInput") {
      const val = event.target.value;
      state.marketSearch = val;
      const container = document.getElementById("marketListingsContainer");
      if (container) {
        const selectedCategory = state.marketCategory || "All";
        container.innerHTML = renderMarketingsList(state.listings || [], selectedCategory, val.toLowerCase());
      }
    }
  });
}
