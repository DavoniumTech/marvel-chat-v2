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
  limit
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
   MARVEL MARKET LISTING EXPIRY
   ========================================================= */

const listingExpiryOptions = [
  { hours: 720, label: "30 days" },
  { hours: 12, label: "12 hours" },
  { hours: 34, label: "34 hours" },
  { hours: 168, label: "1 week" },
  { hours: 336, label: "2 weeks" }
];


function listingTimestamp(value) {
  if (value?.toMillis) {
    return value.toMillis();
  }

  if (value?.toDate) {
    return value.toDate().getTime();
  }

  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : 0;
}


function isListingExpired(listing) {
  if (!listing?.expiresAt) {
    return false;
  }

  const expiresAt = listingTimestamp(listing.expiresAt);

  return expiresAt > 0 && expiresAt <= Date.now();
}


function formatListingExpiry(listing) {
  if (!listing?.expiresAt) {
    return "No expiry";
  }

  const expiresAt = listingTimestamp(listing.expiresAt);

  if (!expiresAt) {
    return "Expiry unavailable";
  }

  const remaining = expiresAt - Date.now();

  if (remaining <= 0) {
    return "Expired";
  }

  const totalHours = Math.ceil(
    remaining / (60 * 60 * 1000)
  );

  if (totalHours < 24) {
    return `Expires in ${totalHours}h`;
  }

  const totalDays = Math.ceil(
    totalHours / 24
  );

  return `Expires in ${totalDays}d`;
}


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


/*
 * A user is considered a Market Account holder when:
 *
 * 1. Their profile explicitly contains an active
 *    Market Account.
 *
 * OR
 *
 * 2. They already own listings.
 *
 * The second condition preserves existing sellers
 * from before the Market Account system existed.
 */

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


/* =========================================================
   EXISTING SELLER MIGRATION
   ========================================================= */

/*
 * This is intentionally additive.
 *
 * Existing listings are NEVER modified.
 *
 * If an existing seller is detected from listings already
 * loaded into state, only the user's profile receives the
 * Market Account flag.
 */

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
   MARVEL MARKET ACCOUNT MODAL
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
      ? "Manage Marvel Market Account"
      : "Create Marvel Market Account",

    `
      <div class="field">

        <label>
          Seller / Store name *
        </label>

        <input
          class="input"
          id="marketStoreName"
          maxlength="80"
          value="${escapeHtml(
            account.storeName ||
            state.profile?.displayName ||
            state.profile?.username ||
            ""
          )}"
          placeholder="Your seller or store name"
        >

      </div>


      <div class="field">

        <label>
          Seller description
        </label>

        <textarea
          class="textarea"
          id="marketSellerBio"
          maxlength="300"
          rows="4"
          placeholder="Tell buyers what you sell..."
        >${escapeHtml(
          account.bio || ""
        )}</textarea>

      </div>


      <div class="field">

        <label>
          Seller location
        </label>

        <input
          class="input"
          id="marketSellerLocation"
          maxlength="100"
          value="${escapeHtml(
            account.location ||
            state.profile?.country ||
            ""
          )}"
          placeholder="e.g. Kano, Nigeria"
        >

      </div>


      <div
        class="card"
        style="
          background: var(--surface2);
          padding: 12px;
          margin: 12px 0;
          box-shadow: none;
        "
      >

        <div
          style="
            font-size: 22px;
            margin-bottom: 5px;
          "
        >
          🛍️
        </div>

        <strong>
          Your Marvel Market Account
        </strong>

        <p
          class="small"
          style="margin: 5px 0 0;"
        >
          Your account lets you create and manage
          Marvel Market listings. Everyone can still
          browse products.
        </p>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="saveMarketAccount"
      >
        ${
          accountExists
            ? "Save Marvel Market Account"
            : "Create Marvel Market Account 🛍️"
        }
      </button>
    `
  );


  document
    .getElementById(
      "saveMarketAccount"
    )
    ?.addEventListener(
      "click",
      async () => {

        const nameInput =
          document.getElementById(
            "marketStoreName"
          );

        const bioInput =
          document.getElementById(
            "marketSellerBio"
          );

        const locationInput =
          document.getElementById(
            "marketSellerLocation"
          );


        const storeName =
          nameInput?.value.trim() || "";

        const bio =
          bioInput?.value.trim() || "";

        const location =
          locationInput?.value.trim() || "";


        if (!storeName) {

          toast(
            "Enter your seller or store name."
          );

          nameInput?.focus();

          return;
        }


        const button =
          document.getElementById(
            "saveMarketAccount"
          );


        if (!button) {
          return;
        }


        button.disabled = true;

        button.textContent =
          "Saving...";


        try {

          const oldCreatedAt =
            account.createdAt ||
            new Date();


          const marketAccount = {

            active: true,

            storeName,

            bio,

            location,

            createdAt:
              oldCreatedAt,

            updatedAt:
              serverTimestamp()

          };


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

              updatedAt:
                new Date()

            }

          };


          closeModal();


          toast(
            accountExists
              ? "Marvel Market Account updated ✨"
              : "Marvel Market Account created 🛍️"
          );


          if (
            typeof renderApp ===
            "function"
          ) {
            renderApp();
          }

        } catch (error) {

          console.error(
            "[Market] Account save failed:",
            error
          );


          toast(
            friendly(error)
          );


          button.disabled =
            false;


          button.textContent =
            accountExists
              ? "Save Marvel Market Account"
              : "Create Marvel Market Account 🛍️";
        }

      }
    );
}


/* =========================================================
   BROWSE MODE
   ========================================================= */

function isBrowseMode() {
  return state.marketBrowseMode === true;
}


function enterBrowseMode(
  renderApp
) {

  state.marketBrowseMode =
    true;


  if (
    typeof renderApp ===
    "function"
  ) {
    renderApp();
  }
}


function exitBrowseMode(
  renderApp
) {

  state.marketBrowseMode =
    false;


  state.search = "";


  if (
    typeof renderApp ===
    "function"
  ) {
    renderApp();
  }
}


/* =========================================================
   MARVEL MARKET RENDER
   ========================================================= */

export function renderMarket(
  renderApp
) {

  migrateExistingSeller();


  const seller =
    hasMarketAccount();


  const browse =
    isBrowseMode();


  const showMarvelMarketTools =
    seller || browse;


  const queryText =
    showMarvelMarketTools
      ? (state.search || "")
          .toLowerCase()
          .trim()
      : "";


  const selectedCategory =
    state.marketCategory ||
    "All";


  const marketTab =
    seller
      ? (
          state.marketTab ||
          "browse"
        )
      : "browse";


  const sortBy =
    state.marketSort ||
    "newest";


  let filtered =
    (state.listings || [])
      .filter(
        listing => {

          if (
            listing.status ===
            "sold"
          ) {
            return false;
          }


          if (
            isListingExpired(
              listing
            )
          ) {
            return false;
          }


          const matchesSearch =
            !queryText ||
            (
              `${listing.title || ""} ${
                listing.description || ""
              } ${
                listing.username || ""
              } ${
                listing.category || ""
              } ${
                listing.location || ""
              } ${
                listing.country || ""
              }`
            )
              .toLowerCase()
              .includes(
                queryText
              );


          const matchesCategory =
            selectedCategory ===
              "All" ||
            (
              listing.category ||
              "Other"
            ) === selectedCategory;


          return (
            matchesSearch &&
            matchesCategory
          );

        }
      );


  if (
    seller &&
    marketTab === "mine"
  ) {

    filtered =
      getMyListings()
        .filter(
          listing => {

            const matchesSearch =
              !queryText ||
              (
                `${listing.title || ""} ${
                  listing.description || ""
                } ${
                  listing.username || ""
                } ${
                  listing.category || ""
                }`
              )
                .toLowerCase()
                .includes(
                  queryText
                );


            const matchesCategory =
              selectedCategory ===
                "All" ||
              (
                listing.category ||
                "Other"
              ) === selectedCategory;


            return (
              matchesSearch &&
              matchesCategory
            );

          }
        );
  }


  filtered.sort(
    (a, b) => {

      const timeA =
        a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : (
              a.createdAt
                ? new Date(
                    a.createdAt
                  ).getTime()
                : 0
            );


      const timeB =
        b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : (
              b.createdAt
                ? new Date(
                    b.createdAt
                  ).getTime()
                : 0
            );


      return sortBy ===
        "oldest"
        ? timeA - timeB
        : timeB - timeA;

    }
  );


  const myListingsCount =
    getMyListings().length;


  return `

    <div class="page market-page">

      <section class="hero">

        <h1>
          Marvel Market 🛍️
        </h1>

        <p>
          Discover products and services
          from the Marvel Chat community.
        </p>

      </section>


      ${
        seller
          ? `

            <div
              class="card"
              style="
                margin-bottom: 12px;
                padding: 12px 14px;
                box-shadow: none;
                background: var(--surface2);
              "
            >

              <div
                style="
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  gap:10px;
                  flex-wrap:wrap;
                "
              >

                <div>

                  <strong>

                    🛍️ ${escapeHtml(
                      state.profile
                        ?.marketAccount
                        ?.storeName ||
                      state.profile
                        ?.displayName ||
                      "Market Seller"
                    )}

                  </strong>

                  <div class="small">
                    Marvel Market Account active
                  </div>

                </div>


                <button
                  class="btn btn-ghost"
                  id="manageMarketAccountBtn"
                  type="button"
                  style="font-size:13px;"
                >
                  Manage
                </button>

              </div>

            </div>

          `
          : ""
      }


      ${
        !showMarvelMarketTools
          ? `

            <div
              class="card"
              style="
                padding:28px 20px;
                text-align:center;
                margin-bottom:14px;
              "
            >

              <div
                style="
                  font-size:44px;
                  margin-bottom:8px;
                "
              >
                🛍️
              </div>

              <h3
                style="
                  margin:0 0 6px;
                "
              >
                Explore Marvel Market
              </h3>

              <p
                class="small"
                style="
                  max-width:420px;
                  margin:0 auto 18px;
                "
              >
                Browse products and services
                from community members.
              </p>

              <button
                class="btn btn-primary"
                id="browseMarketBtn"
                type="button"
              >
                Browse Market
              </button>

            </div>

          `
          : ""
      }


      ${
        showMarvelMarketTools
          ? `

            <div
              class="search"
              style="margin-bottom:12px;"
            >

              <input
                class="input"
                id="marketSearch"
                value="${escapeHtml(
                  state.search || ""
                )}"
                placeholder="Search products..."
              >

              ${
                seller
                  ? `

                    <button
                      class="btn btn-primary"
                      id="sellBtn"
                      type="button"
                    >
                      + Sell
                    </button>

                  `
                  : ""
              }

            </div>


            ${
              seller
                ? `

                  <div
                    class="segmented"
                    style="margin-bottom:12px;"
                  >

                    <button
                      class="btn ${
                        marketTab === "browse"
                          ? "btn-primary"
                          : "btn-ghost"
                      }"
                      id="browseTabBtn"
                      type="button"
                      style="flex:1;"
                    >
                      Browse Market
                    </button>

                    <button
                      class="btn ${
                        marketTab === "mine"
                          ? "btn-primary"
                          : "btn-ghost"
                      }"
                      id="myListingsTabBtn"
                      type="button"
                      style="flex:1;"
                    >
                      My Listings
                      (${myListingsCount})
                    </button>

                  </div>

                `
                : ""
            }


            <div
              style="
                display:flex;
                gap:8px;
                align-items:center;
                margin-bottom:14px;
                flex-wrap:wrap;
              "
            >

              <select
                class="select"
                id="marketSortSelect"
                style="
                  width:auto;
                  padding:6px 12px;
                  font-size:13px;
                "
              >

                <option
                  value="newest"
                  ${
                    sortBy ===
                    "newest"
                      ? "selected"
                      : ""
                  }
                >
                  Newest
                </option>

                <option
                  value="oldest"
                  ${
                    sortBy ===
                    "oldest"
                      ? "selected"
                      : ""
                  }
                >
                  Oldest
                </option>

              </select>


              <div
                style="
                  display:flex;
                  flex-direction:row;
                  flex-wrap:nowrap;
                  gap:5px;
                  overflow-x:auto;
                  overflow-y:hidden;
                  flex:1 1 auto;
                  min-width:0;
                  width:100%;
                  padding-bottom:4px;
                  white-space:nowrap;
                  scrollbar-width:none;
                "
              >

                ${
                  marketCategories
                    .map(
                      category => `

                        <button
                          class="btn ${
                            selectedCategory ===
                            category
                              ? "btn-primary"
                              : "btn-ghost"
                          }"
                          data-market-category="${escapeHtml(
                            category
                          )}"
                          type="button"
                          style="
                            padding:4px 10px;
                            font-size:12px;
                            border-radius:999px;
                            flex:0 0 auto;
                            white-space:nowrap;
                          "
                        >
                          ${escapeHtml(
                            category
                          )}
                        </button>

                      `
                    )
                    .join("")
                }

              </div>

            </div>


            ${
              !seller && browse
                ? `

                  <button
                    class="btn btn-ghost"
                    id="closeBrowseMarketBtn"
                    type="button"
                    style="
                      margin-bottom:12px;
                      font-size:13px;
                    "
                  >
                    ← Back
                  </button>

                `
                : ""
            }

          `
          : ""
      }


      <div id="marketItems">

        ${
          filtered.length
            ? `

              <div class="list">

                ${
                  filtered
                    .map(
                      listing => `

                        <div
                          class="list-item"
                          data-view-listing="${escapeHtml(
                            listing.id
                          )}"
                          style="cursor:pointer;"
                        >

                          <div
                            class="profile-row"
                            style="
                              align-items:flex-start;
                              justify-content:space-between;
                            "
                          >

                            <div
                              style="
                                display:flex;
                                gap:10px;
                                align-items:flex-start;
                                flex:1;
                                min-width:0;
                              "
                            >

                              <div
                                class="avatar"
                                style="
                                  font-size:16px;
                                "
                              >
                                🛍️
                              </div>


                              <div
                                class="profile-meta"
                                style="
                                  flex:1;
                                  min-width:0;
                                "
                              >

                                <div
                                  style="
                                    display:flex;
                                    align-items:center;
                                    gap:6px;
                                    flex-wrap:wrap;
                                  "
                                >

                                  <strong>
                                    ${escapeHtml(
                                      listing.title ||
                                      "Untitled"
                                    )}
                                  </strong>

                                  <span
                                    class="badge"
                                  >
                                    ${escapeHtml(
                                      listing.category ||
                                      "Other"
                                    )}
                                  </span>

                                </div>


                                <span
                                  class="small"
                                >
                                  ${escapeHtml(
                                    listing.username ||
                                    "Seller"
                                  )}

                                  ·

                                  ${escapeHtml(
                                    listing.condition ||
                                    "Used"
                                  )}

                                  ·

                                  ${
                                    listing.location
                                      ? escapeHtml(
                                          listing.location
                                        ) + ", "
                                      : ""
                                  }

                                  ${escapeHtml(
                                    listing.country ||
                                    "Community"
                                  )}

                                  ·

                                  ${escapeHtml(
                                    formatDate(
                                      listing.createdAt
                                    )
                                  )}

                                </span>


                                <p
                                  class="small"
                                  style="
                                    margin:6px 0;
                                    color:
                                      var(--text-secondary);
                                    display:
                                      -webkit-box;
                                    -webkit-line-clamp:2;
                                    -webkit-box-orient:
                                      vertical;
                                    overflow:hidden;
                                  "
                                >
                                  ${escapeHtml(
                                    listing.description ||
                                    ""
                                  )}
                                </p>


                                <span
                                  class="badge"
                                  style="
                                    background:
                                      var(--surface2);
                                    color:
                                      var(--text-secondary);
                                  "
                                >
                                  ${escapeHtml(
                                    formatListingExpiry(
                                      listing
                                    )
                                  )}
                                </span>


                                ${
                                  listing.status ===
                                  "sold"
                                    ? `

                                      <span
                                        class="badge"
                                        style="
                                          background:
                                            var(--danger);
                                          color:#fff;
                                        "
                                      >
                                        Sold
                                      </span>

                                    `
                                    : ""
                                }

                              </div>

                            </div>


                            <strong
                              style="
                                color:var(--primary);
                                font-size:16px;
                                white-space:nowrap;
                                margin-left:8px;
                              "
                            >
                              ₦${Number(
                                listing.price ||
                                0
                              ).toLocaleString()}
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

              <div
                class="card empty"
                style="
                  padding:40px 20px;
                  text-align:center;
                "
              >

                <div
                  style="
                    font-size:40px;
                    margin-bottom:8px;
                  "
                >
                  🛍️
                </div>


                <h3>

                  ${
                    seller &&
                    marketTab ===
                    "mine"
                      ? "No listings yet"
                      : "No products found"
                  }

                </h3>


                <p
                  class="small"
                  style="
                    margin-bottom:16px;
                    color:
                      var(--text-secondary);
                  "
                >

                  ${
                    seller &&
                    marketTab ===
                    "mine"

                      ? "Create your first Marvel Market listing."

                      : "Try another search or category."
                  }

                </p>


                ${
                  seller &&
                  marketTab ===
                  "mine"
                    ? `

                      <button
                        class="btn btn-primary"
                        id="emptySellBtn"
                        type="button"
                      >
                        Sell something
                      </button>

                    `
                    : ""
                }

              </div>

            `
        }

      </div>

    </div>

  `;
}


/* =========================================================
   SELL / EDIT LISTING
   ========================================================= */

export function showSellModal(
  renderApp,
  existingListing = null
) {

  const editing =
    Boolean(existingListing);


  /*
   * Never allow editing another user's listing.
   */

  if (
    editing &&
    existingListing.uid !==
      getUid()
  ) {

    toast(
      "You can only edit your own listings."
    );

    return;
  }


  /*
   * Creating a listing requires
   * a Marvel Market Account.
   */

  if (
    !editing &&
    !hasMarketAccount()
  ) {

    toast(
      "Create a Marvel Market Account before selling."
    );


    showMarketAccountModal(
      renderApp
    );


    return;
  }


  const account =
    state.profile?.marketAccount ||
    {};


  const defaultCountry =
    state.profile?.country ||
    "Nigeria";


  showModal(

    editing
      ? "Edit Marvel Market Listing"
      : "Create Marvel Market Listing",

    `

      <div class="field">

        <label>
          Title *
        </label>

        <input
          class="input"
          id="listingTitle"
          value="${escapeHtml(
            existingListing?.title ||
            ""
          )}"
          placeholder="What are you selling?"
        >

      </div>


      <div class="field">

        <label>
          Description *
        </label>

        <textarea
          class="textarea"
          id="listingDescription"
          rows="4"
          placeholder="Describe your product clearly..."
        >${escapeHtml(
          existingListing?.description ||
          ""
        )}</textarea>

      </div>


      <div class="grid grid2">

        <div class="field">

          <label>
            Price (₦) *
          </label>

          <input
            class="input"
            id="listingPrice"
            type="number"
            min="0"
            step="1"
            value="${
              existingListing?.price ??
              ""
            }"
            placeholder="25000"
          >

        </div>


        <div class="field">

          <label>
            Category *
          </label>

          <select
            class="select"
            id="listingCategory"
          >

            ${
              marketCategories
                .filter(
                  category =>
                    category !==
                    "All"
                )
                .map(
                  category => `

                    <option
                      value="${escapeHtml(
                        category
                      )}"
                      ${
                        existingListing
                          ?.category ===
                        category
                          ? "selected"
                          : ""
                      }
                    >
                      ${escapeHtml(
                        category
                      )}
                    </option>

                  `
                )
                .join("")
            }

          </select>

        </div>

      </div>


      <div class="grid grid2">

        <div class="field">

          <label>
            Condition *
          </label>

          <select
            class="select"
            id="listingCondition"
          >

            ${
              conditions
                .map(
                  condition => `

                    <option
                      value="${escapeHtml(
                        condition
                      )}"
                      ${
                        existingListing
                          ?.condition ===
                        condition
                          ? "selected"
                          : ""
                      }
                    >
                      ${escapeHtml(
                        condition
                      )}
                    </option>

                  `
                )
                .join("")
            }

          </select>

        </div>


        <div class="field">

          <label>
            Country *
          </label>

          <input
            class="input"
            id="listingCountry"
            value="${escapeHtml(
              existingListing?.country ||
              defaultCountry
            )}"
            placeholder="Nigeria"
          >

        </div>

      </div>


      <div class="field">

        <label>
          Listing duration *
        </label>

        <select
          class="select"
          id="listingExpiryHours"
        >

          ${
            listingExpiryOptions
              .map(
                option => `

                  <option
                    value="${option.hours}"
                    ${
                      Number(
                        existingListing
                          ?.expiryDurationHours
                      ) ===
                      option.hours ||
                      (
                        !existingListing
                          ?.expiryDurationHours &&
                        option.hours ===
                          720
                      )
                        ? "selected"
                        : ""
                    }
                  >
                    ${escapeHtml(
                      option.label
                    )}
                  </option>

                `
              )
              .join("")
          }

        </select>

        <p class="small">
          Your Marvel Market listing will automatically
          expire after the selected duration.
        </p>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="saveListingBtn"
        type="button"
      >
        ${
          editing
            ? "Save Marvel Market Listing"
            : "Publish Marvel Market Listing"
        }
      </button>

    `
  );


  document
    .getElementById(
      "saveListingBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        const button =
          document.getElementById(
            "saveListingBtn"
          );


        if (!button) {
          return;
        }


        const titleInput =
          document.getElementById(
            "listingTitle"
          );

        const descriptionInput =
          document.getElementById(
            "listingDescription"
          );

        const priceInput =
          document.getElementById(
            "listingPrice"
          );

        const categoryInput =
          document.getElementById(
            "listingCategory"
          );

        const conditionInput =
          document.getElementById(
            "listingCondition"
          );

        const countryInput =
          document.getElementById(
            "listingCountry"
          );

        const expiryInput =
          document.getElementById(
            "listingExpiryHours"
          );


        const title =
          titleInput?.value.trim() ||
          "";

        const description =
          descriptionInput?.value.trim() ||
          "";

        const price =
          Number(
            priceInput?.value
          );

        const category =
          categoryInput?.value ||
          "Other";

        const condition =
          conditionInput?.value ||
          "Used";

        const country =
          countryInput?.value.trim() ||
          defaultCountry;

        const expiryDurationHours =
          Number(
            expiryInput?.value
          );


        if (!title) {

          toast(
            "Enter a title."
          );

          titleInput?.focus();

          return;
        }


        if (!description) {

          toast(
            "Enter a description."
          );

          descriptionInput?.focus();

          return;
        }


        if (
          !Number.isFinite(price) ||
          price < 0
        ) {

          toast(
            "Enter a valid price."
          );

          priceInput?.focus();

          return;
        }


        if (
          !listingExpiryOptions.some(
            option =>
              option.hours ===
              expiryDurationHours
          )
        ) {

          toast(
            "Choose a valid listing duration."
          );

          return;
        }


        button.disabled =
          true;

        button.textContent =
          editing
            ? "Saving..."
            : "Publishing...";


        try {

          const now =
            Date.now();

          const expiresAt =
            new Date(
              now +
              (
                expiryDurationHours *
                60 *
                60 *
                1000
              )
            );


          if (editing) {

            await updateDoc(
              doc(
                db,
                "listings",
                existingListing.id
              ),
              {
                title,
                description,
                price,
                category,
                condition,
                country,
                expiryDurationHours,
                expiresAt,
                updatedAt:
                  serverTimestamp()
              }
            );


            const index =
              (
                state.listings ||
                []
              ).findIndex(
                listing =>
                  listing.id ===
                  existingListing.id
              );


            if (index >= 0) {

              state.listings[index] = {
                ...state.listings[index],

                title,
                description,
                price,
                category,
                condition,
                country,
                expiryDurationHours,
                expiresAt,
                updatedAt:
                  new Date()
              };
            }


            closeModal();


            toast(
              "Marvel Market listing updated ✨"
            );


            renderApp?.();

            return;
          }


          if (
            !hasMarketAccount()
          ) {

            closeModal();

            toast(
              "A Marvel Market Account is required to sell."
            );

            showMarketAccountModal(
              renderApp
            );

            return;
          }


          const listing = {

            uid:
              state.user.uid,

            username:
              state.profile?.username ||
              state.profile?.displayName ||
              "Seller",

            title,

            description,

            price,

            category,

            condition,

            country,

            location:
              state.profile?.marketAccount
                ?.location ||
              state.profile?.country ||
              "",

            status:
              "available",

            expiryDurationHours,

            expiresAt,

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()

          };


          const created =
            await addDoc(
              collection(
                db,
                "listings"
              ),
              listing
            );


          state.listings = [
            ...(state.listings || []),

            {
              ...listing,

              id:
                created.id,

              createdAt:
                new Date(),

              updatedAt:
                new Date(),

              expiresAt
            }
          ];


          closeModal();


          toast(
            "Marvel Market listing published 🛍️"
          );


          renderApp?.();

        } catch (error) {

          console.error(
            "[Market] Listing save failed:",
            error
          );


          toast(
            friendly(error)
          );


          button.disabled =
            false;

          button.textContent =
            editing
              ? "Save Marvel Market Listing"
              : "Publish Marvel Market Listing";
        }

      }
    );
}


/* =========================================================
   LISTING DETAILS
   ========================================================= */

async function showListingDetails(
  listingId,
  renderApp
) {

  const listing =
    (state.listings || [])
      .find(
        item =>
          item.id ===
          listingId
      );


  if (!listing) {

    toast(
      "Listing not found."
    );

    return;
  }


  const mine =
    listing.uid ===
    getUid();


  const expired =
    isListingExpired(
      listing
    );


  showModal(

    "Marvel Market",

    `

      <div class="card">

        <div
          style="
            display:flex;
            justify-content:space-between;
            gap:12px;
            align-items:flex-start;
          "
        >

          <div>

            <h3
              style="
                margin:0 0 6px;
              "
            >
              ${escapeHtml(
                listing.title ||
                "Untitled"
              )}
            </h3>

            <span class="badge">
              ${escapeHtml(
                listing.category ||
                "Other"
              )}
            </span>

          </div>


          <strong
            style="
              color:var(--primary);
              font-size:20px;
              white-space:nowrap;
            "
          >
            ₦${Number(
              listing.price ||
              0
            ).toLocaleString()}
          </strong>

        </div>


        <p
          style="
            margin:14px 0;
            white-space:pre-wrap;
          "
        >
          ${escapeHtml(
            listing.description ||
            ""
          )}
        </p>


        <div
          class="small"
          style="
            display:grid;
            gap:5px;
          "
        >

          <span>
            Seller:
            ${escapeHtml(
              listing.username ||
              "Seller"
            )}
          </span>

          <span>
            Condition:
            ${escapeHtml(
              listing.condition ||
              "Used"
            )}
          </span>

          <span>
            Location:
            ${
              listing.location
                ? escapeHtml(
                    listing.location
                  ) + ", "
                : ""
            }
            ${escapeHtml(
              listing.country ||
              "Community"
            )}
          </span>

          <span>
            ${escapeHtml(
              formatListingExpiry(
                listing
              )
            )}
          </span>

        </div>

      </div>


      ${
        expired
          ? `

            <div
              class="notice"
              style="
                margin-top:12px;
              "
            >
              This Marvel Market listing has expired.
            </div>

          `
          : ""
      }


      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:14px;
        "
      >

        ${
          mine
            ? `

              <button
                class="btn btn-primary"
                id="editListingBtn"
                type="button"
              >
                Edit Listing
              </button>


              <button
                class="btn btn-danger"
                id="deleteListingBtn"
                type="button"
              >
                Delete Listing
              </button>

            `
            : `

              <button
                class="btn btn-primary"
                id="messageSellerBtn"
                type="button"
                ${
                  expired
                    ? "disabled"
                    : ""
                }
              >
                💬 Contact Seller
              </button>

            `
        }

      </div>

    `
  );


  if (mine) {

    document
      .getElementById(
        "editListingBtn"
      )
      ?.addEventListener(
        "click",
        () => {

          closeModal();

          showSellModal(
            renderApp,
            listing
          );

        }
      );


    document
      .getElementById(
        "deleteListingBtn"
      )
      ?.addEventListener(
        "click",
        async () => {

          const confirmed =
            window.confirm(
              "Delete this Marvel Market listing?"
            );


          if (!confirmed) {
            return;
          }


          const button =
            document.getElementById(
              "deleteListingBtn"
            );


          if (button) {

            button.disabled =
              true;

            button.textContent =
              "Deleting...";
          }


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
              "Marvel Market listing deleted."
            );


            renderApp?.();

          } catch (error) {

            console.error(
              "[Market] Listing delete failed:",
              error
            );


            toast(
              friendly(error)
            );


            if (button) {

              button.disabled =
                false;

              button.textContent =
                "Delete Listing";
            }

          }

        }
      );

  } else {

    document
      .getElementById(
        "messageSellerBtn"
      )
      ?.addEventListener(
        "click",
        async () => {

          const button =
            document.getElementById(
              "messageSellerBtn"
            );


          if (!button) {
            return;
          }


          button.disabled =
            true;


          button.textContent =
            "Opening chat...";


          try {

            const sellerUid =
              listing.uid;


            if (
              sellerUid ===
              getUid()
            ) {

              toast(
                "This is your listing."
              );


              button.disabled =
                false;


              button.textContent =
                "💬 Contact Seller";


              return;
            }


            const userSnapshot =
              await getDocs(
                query(
                  collection(
                    db,
                    "users"
                  ),

                  where(
                    "uid",
                    "==",
                    sellerUid
                  ),

                  limit(1)
                )
              );


            let sellerProfile = {

              uid:
                sellerUid,

              username:
                listing.username ||
                "Seller",

              displayName:
                listing.username ||
                "Seller"

            };


            if (
              !userSnapshot.empty
            ) {

              sellerProfile = {

                id:
                  userSnapshot
                    .docs[0]
                    .id,

                uid:
                  userSnapshot
                    .docs[0]
                    .id,

                ...userSnapshot
                  .docs[0]
                  .data()

              };

              sellerProfile.uid =
                sellerProfile.uid ||
                sellerProfile.id;

            }


            /*
             * Marvel Market interest notification.
             *
             * The Firestore type remains
             * "marketplace_interest" because it is an
             * internal database identifier used by the
             * existing security rules.
             */

            await addDoc(
              collection(
                db,
                "users",
                sellerUid,
                "notifications"
              ),
              {

                actorUid:
                  getUid(),

                actorName:
                  state.profile
                    ?.displayName ||
                  state.profile
                    ?.username ||
                  "A community member",

                text:
                  `is interested in your Marvel Market listing "${listing.title}" 🛍️`,

                type:
                  "marketplace_interest",

                listingId:
                  listing.id,

                listingTitle:
                  listing.title,

                read:
                  false,

                createdAt:
                  serverTimestamp()

              }
            );


            closeModal();


            await createConversation(
              sellerProfile,
              renderApp
            );


            toast(
              "Interest sent to the seller 🛍️"
            );

          } catch (error) {

            console.error(
              "[Market] Contact seller failed:",
              error
            );


            toast(
              "Could not contact seller."
            );


            button.disabled =
              false;


            button.textContent =
              "💬 Contact Seller";
          }

        }
      );
  }
}


/* =========================================================
   MARVEL MARKET EVENTS
   ========================================================= */

function filterMarketListingsDom() {

  const root =
    document.getElementById(
      "marketItems"
    );


  if (!root) {
    return;
  }


  const queryText =
    (state.search || "")
      .toLowerCase()
      .trim();


  const cards =
    root.querySelectorAll(
      "[data-view-listing]"
    );


  if (!cards.length) {
    return;
  }


  let visible = 0;


  cards.forEach(
    card => {

      const haystack =
        (
          card.textContent ||
          ""
        )
          .toLowerCase();


      const show =
        !queryText ||
        haystack.includes(
          queryText
        );


      card.style.display =
        show ? "" : "none";


      if (show) {
        visible += 1;
      }

    }
  );


  let hint =
    document.getElementById(
      "marketSearchEmptyHint"
    );


  if (
    visible === 0 &&
    queryText
  ) {

    if (!hint) {

      hint =
        document.createElement(
          "div"
        );

      hint.id =
        "marketSearchEmptyHint";

      hint.className =
        "card empty";

      hint.style.padding =
        "24px 16px";

      hint.style.textAlign =
        "center";

      hint.innerHTML =
        "<h3>No products found</h3><p class=\"small\">Try another search or category.</p>";

      root.appendChild(
        hint
      );
    }


    hint.style.display =
      "";

  } else if (hint) {

    hint.style.display =
      "none";
  }
}


export function attachMarketEvents(
  renderApp
) {

  document
    .getElementById(
      "browseMarketBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        enterBrowseMode(
          renderApp
        );

      }
    );


  document
    .getElementById(
      "closeBrowseMarketBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        exitBrowseMode(
          renderApp
        );

      }
    );


  document
    .getElementById(
      "sellBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        showSellModal(
          renderApp
        );

      }
    );


  document
    .getElementById(
      "emptySellBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        showSellModal(
          renderApp
        );

      }
    );


  document
    .getElementById(
      "manageMarketAccountBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        showMarketAccountModal(
          renderApp
        );

      }
    );


  document
    .getElementById(
      "browseTabBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        state.marketTab =
          "browse";

        renderApp();

      }
    );


  document
    .getElementById(
      "myListingsTabBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        state.marketTab =
          "mine";

        renderApp();

      }
    );


  const searchInput =
    document.getElementById(
      "marketSearch"
    );


  if (searchInput) {

    searchInput.addEventListener(
      "input",
      event => {

        state.search =
          event.target.value;

        filterMarketListingsDom();

      }
    );
  }


  document
    .getElementById(
      "marketSortSelect"
    )
    ?.addEventListener(
      "change",
      event => {

        state.marketSort =
          event.target.value;


        renderApp();

      }
    );


  document
    .querySelectorAll(
      "[data-market-category]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            state.marketCategory =
              button.dataset
                .marketCategory;


            renderApp();

          }
        );

      }
    );


  document
    .querySelectorAll(
      "[data-view-listing]"
    )
    .forEach(
      item => {

        item.addEventListener(
          "click",
          () => {

            showListingDetails(
              item.dataset
                .viewListing,
              renderApp
            );

          }
        );

      }
    );
}
