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
   MARKET STATE
   ========================================================= */

function getUid() {
  return state.user?.uid || null;
}


function getMyListings() {
  const uid = getUid();

  if (!uid) return [];

  return (state.listings || []).filter(
    listing => listing.uid === uid
  );
}


/*
 * A Market Account is normally stored on the user profile.
 *
 * Existing sellers are also recognized automatically from
 * their existing listings. This prevents old sellers from
 * losing access when the new account system is introduced.
 */

export function hasMarketAccount() {
  const uid = getUid();

  if (!uid) return false;

  if (
    state.profile?.marketAccount?.active === true
  ) {
    return true;
  }

  return getMyListings().length > 0;
}


/*
 * This migration is additive only.
 *
 * It NEVER modifies existing listings.
 * It only creates marketAccount on the user's profile
 * when an existing seller is detected.
 */

async function migrateExistingSeller() {
  const uid = getUid();

  if (!uid || !state.profile) return;

  if (
    state.profile.marketAccount?.active === true
  ) {
    return;
  }

  const existingListings = getMyListings();

  if (!existingListings.length) return;

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

    createdAt: serverTimestamp(),

    updatedAt: serverTimestamp()
  };

  try {
    await updateDoc(
      doc(db, "users", uid),
      {
        marketAccount: account
      }
    );

    /*
     * Do not wait for another global listener.
     * Update local state immediately.
     */

    state.profile = {
      ...state.profile,
      marketAccount: {
        ...account,
        createdAt: new Date(),
        updatedAt: new Date()
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

export function showMarketAccountModal(renderApp) {

  if (!state.user) {
    toast("Please sign in first.");
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

        <label>Seller / Store name *</label>

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

        <label>Seller description</label>

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

        <label>Seller location</label>

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
          Your Marketplace Account
        </strong>

        <p
          class="small"
          style="margin: 5px 0 0;"
        >
          Your account lets you create and manage
          marketplace listings. Everyone can still
          browse products.
        </p>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="saveMarketAccount"
      >
        ${
          accountExists
            ? "Save Marketplace Account"
            : "Create Marketplace Account 🛍️"
        }
      </button>
    `
  );


  document
    .getElementById("saveMarketAccount")
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

        if (!button) return;

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
              updatedAt: new Date()
            }

          };


          closeModal();

          toast(
            accountExists
              ? "Marketplace Account updated ✨"
              : "Marketplace Account created 🛍️"
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

          button.disabled = false;

          button.textContent =
            accountExists
              ? "Save Marketplace Account"
              : "Create Marketplace Account 🛍️";
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


function enterBrowseMode(renderApp) {

  state.marketBrowseMode = true;

  if (
    typeof renderApp ===
    "function"
  ) {
    renderApp();
  }
}


function exitBrowseMode(renderApp) {

  state.marketBrowseMode = false;

  state.search = "";

  if (
    typeof renderApp ===
    "function"
  ) {
    renderApp();
  }
}


/* =========================================================
   MARKET RENDER
   ========================================================= */

export function renderMarket(renderApp) {

  /*
   * Existing sellers are silently migrated.
   *
   * This does not read Firestore again.
   * It uses listings already present in state.
   */
  migrateExistingSeller();


  const seller =
    hasMarketAccount();

  const browse =
    isBrowseMode();


  /*
   * Normal users start with a clean marketplace.
   *
   * They only see the browse/search tools after
   * explicitly entering Browse Market.
   *
   * Sellers automatically get the full interface.
   */

  const showMarketplaceTools =
    seller || browse;


  const queryText =
    showMarketplaceTools
      ? (state.search || "")
          .toLowerCase()
          .trim()
      : "";


  const selectedCategory =
    state.marketCategory || "All";


  const marketTab =
    seller
      ? (state.marketTab || "browse")
      : "browse";


  const sortBy =
    state.marketSort || "newest";


  let filtered =
    (state.listings || [])
      .filter(listing => {

        /*
         * Normal users only see active listings
         * in Browse Market.
         */

        if (
          listing.status === "sold"
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
            .includes(queryText);


        const matchesCategory =
          selectedCategory === "All" ||
          (
            listing.category ||
            "Other"
          ) === selectedCategory;


        return (
          matchesSearch &&
          matchesCategory
        );
      });


  /*
   * My Listings is only a seller feature.
   */

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
                .includes(queryText);


            const matchesCategory =
              selectedCategory === "All" ||
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


  /*
   * Sort only the listings already loaded in state.
   * No additional Firestore reads.
   */

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


      return sortBy === "oldest"
        ? timeA - timeB
        : timeB - timeA;
    }
  );


  const myListingsCount =
    getMyListings().length;


  return `

    <div class="page market-page">


      <!-- =================================================
           HERO
           ================================================= -->

      <section class="hero">

        <h1>
          Marvel Market 🛍️
        </h1>

        <p>
          Discover products and services
          from the Marvel Chat community.
        </p>

      </section>


      <!-- =================================================
           SELLER ACCOUNT HEADER
           ================================================= -->

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
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 10px;
                  flex-wrap: wrap;
                "
              >

                <div>

                  <strong>
                    🛍️ ${
                      escapeHtml(
                        state.profile
                          ?.marketAccount
                          ?.storeName ||
                        state.profile
                          ?.displayName ||
                        "Market Seller"
                      )
                    }
                  </strong>

                  <div class="small">
                    Marketplace Account active
                  </div>

                </div>


                <button
                  class="btn btn-ghost"
                  id="manageMarketAccountBtn"
                  style="font-size: 13px;"
                >
                  Manage
                </button>

              </div>

            </div>

          `
          : ""
      }


      <!-- =================================================
           BROWSE BUTTON
           ================================================= -->

      ${
        !showMarketplaceTools
          ? `

            <div
              class="card"
              style="
                padding: 28px 20px;
                text-align: center;
                margin-bottom: 14px;
              "
            >

              <div
                style="
                  font-size: 44px;
                  margin-bottom: 8px;
                "
              >
                🛍️
              </div>

              <h3
                style="
                  margin: 0 0 6px;
                "
              >
                Explore Marvel Market
              </h3>

              <p
                class="small"
                style="
                  max-width: 420px;
                  margin: 0 auto 18px;
                "
              >
                Browse products and services
                from community members.
              </p>

              <button
                class="btn btn-primary"
                id="browseMarketBtn"
              >
                Browse Market
              </button>

            </div>

          `
          : ""
      }


      <!-- =================================================
           MARKET TOOLS
           ================================================= -->

      ${
        showMarketplaceTools
          ? `

            <div
              class="search"
              style="
                margin-bottom: 12px;
              "
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
                    >
                      + Sell
                    </button>
                  `
                  : ""
              }

            </div>


            <!-- TABS -->

            ${
              seller
                ? `

                  <div
                    class="segmented"
                    style="
                      margin-bottom: 12px;
                    "
                  >

                    <button
                      class="btn ${
                        marketTab === "browse"
                          ? "btn-primary"
                          : "btn-ghost"
                      }"
                      id="browseTabBtn"
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
                      style="flex:1;"
                    >
                      My Listings
                      (${myListingsCount})
                    </button>

                  </div>

                `
                : ""
            }


            <!-- SORT + CATEGORY -->

            <div
              style="
                display: flex;
                gap: 8px;
                align-items: center;
                margin-bottom: 14px;
                flex-wrap: wrap;
              "
            >

              <select
                class="select"
                id="marketSortSelect"
                style="
                  width: auto;
                  padding: 6px 12px;
                  font-size: 13px;
                "
              >

                <option
                  value="newest"
                  ${
                    sortBy === "newest"
                      ? "selected"
                      : ""
                  }
                >
                  Newest
                </option>

                <option
                  value="oldest"
                  ${
                    sortBy === "oldest"
                      ? "selected"
                      : ""
                  }
                >
                  Oldest
                </option>

              </select>


              <div
                style="
                  display: flex;
                  gap: 5px;
                  overflow-x: auto;
                  flex: 1;
                  padding-bottom: 4px;
                  white-space: nowrap;
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
                          style="
                            padding: 4px 10px;
                            font-size: 12px;
                            border-radius: 999px;
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
                    style="
                      margin-bottom: 12px;
                      font-size: 13px;
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


      <!-- =================================================
           LISTINGS
           ================================================= -->

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
                          style="cursor: pointer;"
                          data-view-listing="${escapeHtml(
                            listing.id
                          )}"
                        >

                          <div
                            class="profile-row"
                            style="
                              align-items: flex-start;
                              justify-content: space-between;
                            "
                          >

                            <div
                              style="
                                display: flex;
                                gap: 10px;
                                align-items: flex-start;
                                flex: 1;
                                min-width: 0;
                              "
                            >

                              <div
                                class="avatar"
                                style="
                                  font-size: 16px;
                                "
                              >
                                🛍️
                              </div>


                              <div
                                class="profile-meta"
                                style="
                                  flex: 1;
                                  min-width: 0;
                                "
                              >

                                <div
                                  style="
                                    display: flex;
                                    align-items: center;
                                    gap: 6px;
                                    flex-wrap: wrap;
                                  "
                                >

                                  <strong
                                    style="
                                      font-size: 15px;
                                      overflow-wrap: anywhere;
                                    "
                                  >
                                    ${escapeHtml(
                                      listing.title ||
                                      "Untitled listing"
                                    )}
                                  </strong>


                                  <span
                                    class="badge"
                                    style="
                                      background:
                                        var(--surface2);
                                    "
                                  >
                                    ${escapeHtml(
                                      listing.category ||
                                      "Other"
                                    )}
                                  </span>


                                  <span
                                    class="badge"
                                    style="
                                      background:
                                        var(--surface2);
                                      color:
                                        var(--text);
                                    "
                                  >
                                    ${escapeHtml(
                                      listing.condition ||
                                      "Good"
                                    )}
                                  </span>

                                </div>


                                <span
                                  class="small"
                                  style="
                                    display: block;
                                    margin-top: 2px;
                                  "
                                >

                                  By @${escapeHtml(
                                    listing.username ||
                                    "User"
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
                                    margin: 6px 0;
                                    color:
                                      var(--text-secondary);
                                    display:
                                      -webkit-box;
                                    -webkit-line-clamp: 2;
                                    -webkit-box-orient:
                                      vertical;
                                    overflow: hidden;
                                  "
                                >
                                  ${escapeHtml(
                                    listing.description ||
                                    ""
                                  )}
                                </p>


                                ${
                                  listing.status ===
                                  "sold"
                                    ? `

                                      <span
                                        class="badge"
                                        style="
                                          background:
                                            var(--danger);
                                          color:
                                            #fff;
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
                                color:
                                  var(--primary);
                                font-size:
                                  16px;
                                white-space:
                                  nowrap;
                                margin-left:
                                  8px;
                              "
                            >
                              ₦${Number(
                                listing.price || 0
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
                  padding: 40px 20px;
                  text-align: center;
                "
              >

                <div
                  style="
                    font-size: 40px;
                    margin-bottom: 8px;
                  "
                >
                  🛍️
                </div>


                <h3>
                  ${
                    seller &&
                    marketTab === "mine"
                      ? "No listings yet"
                      : "No products found"
                  }
                </h3>


                <p
                  class="small"
                  style="
                    margin-bottom: 16px;
                    color:
                      var(--text-secondary);
                  "
                >
                  ${
                    seller &&
                    marketTab === "mine"
                      ? "Create your first marketplace listing."
                      : "Try another search or category."
                  }
                </p>


                ${
                  seller &&
                  marketTab === "mine"
                    ? `

                      <button
                        class="btn btn-primary"
                        id="emptySellBtn"
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
   * Ownership protection.
   */

  if (
    editing &&
    existingListing.uid !== getUid()
  ) {

    toast(
      "You can only edit your own listings."
    );

    return;
  }


  /*
   * Creating requires a Market Account.
   */

  if (
    !editing &&
    !hasMarketAccount()
  ) {

    toast(
      "Create a Marketplace Account before selling."
    );

    showMarketAccountModal(
      renderApp
    );

    return;
  }


  const account =
    state.profile?.marketAccount || {};


  const defaultCountry =
    state.profile?.country ||
    "Nigeria";


  showModal(

    editing
      ? "Edit Listing"
      : "Create Listing",

    `

      <div class="field">

        <label>
          Title *
        </label>

        <input
          class="input"
          id="listingTitle"
          value="${escapeHtml(
            existingListing?.title || ""
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
          existingListing?.description || ""
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
              existingListing?.price ?? ""
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
                    category !== "All"
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
          Location / City
        </label>

        <input
          class="input"
          id="listingLocation"
          value="${escapeHtml(
            existingListing?.location ||
            account.location ||
            ""
          )}"
          placeholder="e.g. Kano, Nigeria"
        >

      </div>


      <button
        class="btn btn-primary btn-block"
        id="publishListing"
      >
        ${
          editing
            ? "Save Changes"
            : "Publish Listing 🛍️"
        }
      </button>

    `
  );


  document
    .getElementById(
      "publishListing"
    )
    ?.addEventListener(
      "click",
      async () => {

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

        const locationInput =
          document.getElementById(
            "listingLocation"
          );


        const title =
          titleInput?.value.trim() || "";

        const description =
          descriptionInput
            ?.value.trim() || "";

        const price =
          Number(
            priceInput?.value
          );

        const category =
          categoryInput?.value || "";

        const condition =
          conditionInput?.value || "";

        const country =
          countryInput?.value.trim() || "";

        const location =
          locationInput?.value.trim() || "";


        if (!title) {

          toast(
            "Enter a listing title."
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


        if (!category) {

          toast(
            "Select a category."
          );

          return;
        }


        if (!condition) {

          toast(
            "Select the condition."
          );

          return;
        }


        if (!country) {

          toast(
            "Enter a country."
          );

          countryInput?.focus();

          return;
        }


        /*
         * Final seller check.
         */

        if (
          !editing &&
          !hasMarketAccount()
        ) {

          closeModal();

          showMarketAccountModal(
            renderApp
          );

          toast(
            "A Marketplace Account is required to sell."
          );

          return;
        }


        const button =
          document.getElementById(
            "publishListing"
          );


        if (!button) return;


        button.disabled = true;

        button.textContent =
          editing
            ? "Saving..."
            : "Publishing...";


        try {

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

                location,

                updatedAt:
                  serverTimestamp()

              }
            );


            toast(
              "Listing updated ✨"
            );

          } else {

            const sellerName =
              state.profile
                ?.marketAccount
                ?.storeName ||
              state.profile
                ?.displayName ||
              state.profile
                ?.username ||
              "User";


            await addDoc(
              collection(
                db,
                "listings"
              ),
              {

                uid:
                  state.user.uid,

                username:
                  sellerName,

                title,

                description,

                price,

                category,

                condition,

                country,

                location,

                status:
                  "active",

                createdAt:
                  serverTimestamp(),

                updatedAt:
                  serverTimestamp()

              }
            );


            toast(
              "Listing published 🛍️"
            );
          }


          closeModal();


          if (
            typeof renderApp ===
            "function"
          ) {
            renderApp();
          }

        } catch (error) {

          console.error(
            "[Market] Listing save error:",
            error
          );

          toast(
            friendly(error)
          );

          button.disabled = false;

          button.textContent =
            editing
              ? "Save Changes"
              : "Publish Listing 🛍️";
        }

      }
    );
}


/* =========================================================
   LISTING DETAILS
   ========================================================= */

export async function showListingDetails(
  listingId,
  renderApp
) {

  const listing =
    (state.listings || [])
      .find(
        item =>
          item.id === listingId
      );


  if (!listing) {

    toast(
      "Listing not found."
    );

    return;
  }


  const isOwner =
    listing.uid === getUid();


  const postedDate =
    formatDate(
      listing.createdAt
    );


  const updatedDate =
    listing.updatedAt
      ? formatDate(
          listing.updatedAt
        )
      : null;


  showModal(

    listing.title ||
      "Listing Details",

    `

      <div
        style="
          display: flex;
          flex-direction: column;
          gap: 16px;
        "
      >


        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            flex-wrap: wrap;
          "
        >

          <div>

            <div
              style="
                font-size: 28px;
                font-weight: 900;
                color:
                  var(--primary);
                margin-bottom: 4px;
              "
            >
              ₦${Number(
                listing.price || 0
              ).toLocaleString()}
            </div>


            <div class="small">

              Posted by

              <strong>
                @${escapeHtml(
                  listing.username ||
                  "User"
                )}
              </strong>

              ·

              ${escapeHtml(
                postedDate
              )}

              ${
                updatedDate &&
                updatedDate !==
                  postedDate
                  ? `
                    (Updated
                    ${escapeHtml(
                      updatedDate
                    )})
                  `
                  : ""
              }

            </div>

          </div>


          <div
            style="
              display: flex;
              gap: 6px;
              flex-wrap: wrap;
            "
          >

            <span class="badge">
              ${escapeHtml(
                listing.category ||
                "Other"
              )}
            </span>


            <span
              class="badge"
              style="
                background:
                  var(--surface2);
                color:
                  var(--text);
              "
            >
              ${escapeHtml(
                listing.condition ||
                "Good"
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
                      color:
                        #fff;
                    "
                  >
                    Sold
                  </span>

                `
                : ""
            }

          </div>

        </div>


        <div
          class="card"
          style="
            background:
              var(--surface2);
            padding: 16px;
            margin: 0;
            box-shadow: none;
          "
        >

          <strong
            style="
              display: block;
              margin-bottom: 6px;
              font-size: 13px;
              text-transform:
                uppercase;
              color:
                var(--muted);
            "
          >
            Description
          </strong>


          <p
            style="
              white-space: pre-wrap;
              word-break: break-word;
              margin: 0;
              font-size: 14px;
              line-height: 1.5;
            "
          >
            ${escapeHtml(
              listing.description ||
              ""
            )}
          </p>

        </div>


        <div
          class="small"
          style="
            background:
              var(--surface2);
            padding: 14px;
            border-radius: 16px;
            display: flex;
            flex-direction: column;
            gap: 5px;
          "
        >

          <div>
            📍 Location:
            <strong>
              ${escapeHtml(
                listing.location ||
                "Not specified"
              )}
              ${
                listing.country
                  ? `, ${escapeHtml(
                      listing.country
                    )}`
                  : ""
              }
            </strong>
          </div>


          <div>
            📋 Status:
            <strong>
              ${
                listing.status ===
                "sold"
                  ? "Sold"
                  : "Active"
              }
            </strong>
          </div>

        </div>


        <div>

          ${
            isOwner
              ? `

                <div
                  class="grid grid3"
                  style="gap: 8px;"
                >

                  <button
                    class="btn btn-secondary"
                    id="editListingBtn"
                  >
                    ✏️ Edit
                  </button>


                  <button
                    class="btn ${
                      listing.status ===
                      "sold"
                        ? "btn-secondary"
                        : "btn-ghost"
                    }"
                    id="toggleSoldBtn"
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
                  >
                    🗑️ Delete
                  </button>

                </div>

              `
              : `

                <button
                  class="btn btn-primary btn-block"
                  id="messageSellerBtn"
                >
                  💬 Contact Seller
                </button>

              `
          }

        </div>

      </div>

    `
  );


  /* =======================================================
     OWNER ACTIONS
     ======================================================= */

  if (isOwner) {

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
        "toggleSoldBtn"
      )
      ?.addEventListener(
        "click",
        async () => {

          const button =
            document.getElementById(
              "toggleSoldBtn"
            );

          if (!button) return;

          button.disabled = true;

          try {

            const newStatus =
              listing.status ===
              "sold"
                ? "active"
                : "sold";


            await updateDoc(
              doc(
                db,
                "listings",
                listing.id
              ),
              {

                status:
                  newStatus,

                updatedAt:
                  serverTimestamp()

              }
            );


            closeModal();


            toast(
              newStatus === "sold"
                ? "Listing marked as sold 🏷️"
                : "Listing reactivated 🚀"
            );


            if (
              typeof renderApp ===
              "function"
            ) {
              renderApp();
            }

          } catch (error) {

            console.error(
              "[Market] Status update failed:",
              error
            );

            toast(
              friendly(error)
            );

            button.disabled =
              false;
          }

        }
      );


    document
      .getElementById(
        "deleteListingBtn"
      )
      ?.addEventListener(
        "click",
        () => {

          showModal(

            "Delete Listing?",

            `

              <p class="small">
                Delete
                <strong>
                  "${escapeHtml(
                    listing.title
                  )}"
                </strong>
                permanently?
              </p>


              <div
                style="
                  display: flex;
                  gap: 8px;
                  margin-top: 15px;
                "
              >

                <button
                  class="btn btn-ghost"
                  style="flex:1;"
                  id="cancelDeleteListing"
                >
                  Cancel
                </button>


                <button
                  class="btn btn-danger"
                  style="flex:1;"
                  id="confirmDeleteListing"
                >
                  Delete
                </button>

              </div>

            `
          );


          document
            .getElementById(
              "cancelDeleteListing"
            )
            ?.addEventListener(
              "click",
              () => {

                showListingDetails(
                  listingId,
                  renderApp
                );

              }
            );


          document
            .getElementById(
              "confirmDeleteListing"
            )
            ?.addEventListener(
              "click",
              async () => {

                const button =
                  document.getElementById(
                    "confirmDeleteListing"
                  );

                if (!button) return;

                button.disabled = true;

                button.textContent =
                  "Deleting...";


                try {

                  await deleteDoc(
                    doc(
                      db,
                      "listings",
                      listing.id
                    )
                  );


                  closeModal();

                  toast(
                    "Listing deleted."
                  );


                  if (
                    typeof renderApp ===
                    "function"
                  ) {
                    renderApp();
                  }

                } catch (error) {

                  console.error(
                    "[Market] Delete failed:",
                    error
                  );

                  toast(
                    friendly(error)
                  );

                  button.disabled =
                    false;

                  button.textContent =
                    "Delete";
                }

              }
            );

        }
      );

  }


  /* =======================================================
     BUYER → CONTACT SELLER
     ======================================================= */

  else {

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

          if (!button) return;

          button.disabled = true;

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


            /*
             * One user document read.
             * This is only performed when the buyer
             * explicitly chooses Contact Seller.
             */

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
                    .docs[0].id,

                ...userSnapshot
                  .docs[0].data()

              };

            }


            /*
             * Marketplace interest notification.
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
                  `is interested in your marketplace listing "${listing.title}" 🛍️`,

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
   MARKET EVENTS
   ========================================================= */

export function attachMarketEvents(
  renderApp
) {

  /* -------------------------------------------------------
     Browse Market
     ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     Back from Browse
     ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     Sell
     ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     Empty My Listings
     ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     Manage Marketplace Account
     ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     Browse / My Listings
     ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     Search
     ------------------------------------------------------- */

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

        renderApp();


        setTimeout(
          () => {

            const input =
              document.getElementById(
                "marketSearch"
              );

            if (!input) return;

            input.focus();

            input.selectionStart =
              input.selectionEnd =
                input.value.length;

          },
          0
        );

      }
    );
  }


  /* -------------------------------------------------------
     Sort
     ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     Categories
     ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     Listing Details
     ------------------------------------------------------- */

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
