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
   HELPERS
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
    listing => listing?.uid === uid
  );
}


function listingTime(listing) {
  if (listing?.createdAt?.toMillis) {
    return listing.createdAt.toMillis();
  }

  if (listing?.createdAt?.toDate) {
    return listing.createdAt.toDate().getTime();
  }

  if (listing?.createdAt) {
    const time = new Date(
      listing.createdAt
    ).getTime();

    return Number.isFinite(time)
      ? time
      : 0;
  }

  return 0;
}


function getShopName(listing, profile = null) {
  return (
    profile?.marketAccount?.storeName ||
    profile?.displayName ||
    profile?.username ||
    listing?.username ||
    "Market Seller"
  );
}


function getShopDescription(profile, listing = null) {
  return (
    profile?.marketAccount?.bio ||
    profile?.marketAccount?.description ||
    listing?.shopDescription ||
    "Community marketplace shop."
  );
}


function getShopLocation(profile, listing = null) {
  return (
    profile?.marketAccount?.location ||
    profile?.country ||
    listing?.location ||
    listing?.country ||
    "Location not specified"
  );
}


/* =========================================================
   MARKET ACCOUNT
   ========================================================= */

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

  /*
   * Keep older sellers working.
   */
  return getMyListings().length > 0;
}


/* =========================================================
   EXISTING SELLER MIGRATION
   ========================================================= */

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

  const listings = getMyListings();

  if (!listings.length) {
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

    createdAt: serverTimestamp(),

    updatedAt: serverTimestamp()
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
          id="marketStoreName"
          maxlength="80"
          value="${escapeHtml(
            account.storeName ||
            state.profile?.displayName ||
            state.profile?.username ||
            ""
          )}"
          placeholder="Your shop name"
        >
      </div>


      <div class="field">
        <label>
          Shop description
        </label>

        <textarea
          class="textarea"
          id="marketSellerBio"
          maxlength="300"
          rows="4"
          placeholder="Tell buyers what your shop sells..."
        >${escapeHtml(
          account.bio ||
          account.description ||
          ""
        )}</textarea>
      </div>


      <div class="field">
        <label>
          Shop location
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
          background:var(--surface2);
          padding:12px;
          margin:12px 0;
          box-shadow:none;
        "
      >
        <div
          style="
            font-size:22px;
            margin-bottom:5px;
          "
        >
          🛍️
        </div>

        <strong>
          Your Marketplace Shop
        </strong>

        <p
          class="small"
          style="margin:5px 0 0;"
        >
          Your shop is where your products and
          services are displayed to buyers.
        </p>
      </div>


      <button
        class="btn btn-primary btn-block"
        id="saveMarketAccount"
        type="button"
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
            "Enter your shop name."
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
        button.textContent = "Saving...";

        try {
          const marketAccount = {
            active: true,

            storeName,

            bio,

            location,

            createdAt:
              account.createdAt ||
              new Date(),

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
              ? "Marketplace Shop updated ✨"
              : "Marketplace Shop created 🛍️"
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


function enterBrowseMode(
  renderApp
) {
  state.marketBrowseMode = true;

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
   GROUP LISTINGS INTO SHOPS
   ========================================================= */

function buildShopGroups(
  listings
) {
  const map = new Map();

  listings.forEach(
    listing => {
      if (!listing) {
        return;
      }

      const shopId =
        listing.uid ||
        `legacy:${listing.username || listing.id}`;

      if (!map.has(shopId)) {
        map.set(
          shopId,
          {
            id: shopId,

            uid:
              listing.uid ||
              null,

            name:
              listing.username ||
              "Community Shop",

            listings: [],

            latest: listing
          }
        );
      }

      const shop =
        map.get(shopId);

      shop.listings.push(
        listing
      );

      if (
        listingTime(listing) >
        listingTime(shop.latest)
      ) {
        shop.latest = listing;
      }
    }
  );

  return Array.from(
    map.values()
  );
}


/* =========================================================
   MARKET RENDER
   ========================================================= */

export function renderMarket(
  renderApp
) {
  migrateExistingSeller();

  const seller =
    hasMarketAccount();

  const browse =
    isBrowseMode();

  const showMarketplaceTools =
    seller ||
    browse;

  const queryText =
    showMarketplaceTools
      ? (
          state.search ||
          ""
        )
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


  /*
   * First filter individual products.
   * Then group the matching products by shop.
   */
  let matchingListings =
    (state.listings || [])
      .filter(
        listing => {
          if (!listing) {
            return false;
          }

          /*
           * Sold products remain inside the shop,
           * but are not shown on the public market
           * shop cards.
           */
          if (
            listing.status ===
            "sold"
          ) {
            return false;
          }

          if (
            seller &&
            marketTab === "mine" &&
            listing.uid !== getUid()
          ) {
            return false;
          }

          const haystack =
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
            }`.toLowerCase();

          const matchesSearch =
            !queryText ||
            haystack.includes(
              queryText
            );

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


  matchingListings.sort(
    (a, b) => {
      const timeA =
        listingTime(a);

      const timeB =
        listingTime(b);

      return sortBy === "oldest"
        ? timeA - timeB
        : timeB - timeA;
    }
  );


  const shops =
    buildShopGroups(
      matchingListings
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
          Discover shops, products and services
          from the Marvel Chat community.
        </p>
      </section>


      ${
        seller
          ? `
            <div
              class="card"
              style="
                margin-bottom:12px;
                padding:12px 14px;
                box-shadow:none;
                background:var(--surface2);
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
                  <strong
                    style="
                      font-size:17px;
                      font-weight:900;
                    "
                  >
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
                    Marketplace Shop active
                  </div>
                </div>

                <button
                  class="btn btn-ghost"
                  id="manageMarketAccountBtn"
                  type="button"
                  style="font-size:13px;"
                >
                  Manage Shop
                </button>
              </div>
            </div>
          `
          : ""
      }


      ${
        !showMarketplaceTools
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
                style="margin:0 0 6px;"
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
                Browse shops, products and
                services from community members.
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
        showMarketplaceTools
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
                placeholder="Search shops and products..."
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
                      My Shop (${myListingsCount})
                    </button>
                  </div>
                `
                : ""
            }


            <div
              class="category-row"
              style="
                margin-bottom:12px;
                display:flex;
                gap:6px;
                flex-wrap:wrap;
              "
            >
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
                            selectedCategory === category
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


            <div
              style="
                display:flex;
                justify-content:flex-end;
                margin-bottom:12px;
              "
            >
              <select
                class="select"
                id="marketSortSelect"
                style="
                  max-width:170px;
                  width:100%;
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
                  Newest shops
                </option>

                <option
                  value="oldest"
                  ${
                    sortBy === "oldest"
                      ? "selected"
                      : ""
                  }
                >
                  Oldest shops
                </option>
              </select>
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
          showMarketplaceTools &&
          shops.length
            ? `
              <div class="list">

                ${
                  shops
                    .map(
                      shop => {
                        const latest =
                          shop.latest ||
                          shop.listings[0];

                        const shopName =
                          shop.uid === getUid()
                            ? (
                                state.profile
                                  ?.marketAccount
                                  ?.storeName ||
                                shop.name
                              )
                            : shop.name;

                        const productCount =
                          shop.listings.length;

                        const categories =
                          Array.from(
                            new Set(
                              shop.listings
                                .map(
                                  item =>
                                    item.category
                                )
                                .filter(
                                  Boolean
                                )
                            )
                          );

                        return `
                          <div
                            class="list-item"
                            data-view-shop="${escapeHtml(
                              shop.uid || ""
                            )}"
                            data-view-listing="${escapeHtml(
                              latest?.id || ""
                            )}"
                            style="
                              cursor:pointer;
                              width:100%;
                            "
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
                                  style="font-size:16px;"
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

                                  <strong
                                    style="
                                      display:block;
                                      font-size:19px;
                                      font-weight:900;
                                      overflow-wrap:anywhere;
                                    "
                                  >
                                    ${escapeHtml(
                                      shopName
                                    )}
                                  </strong>


                                  <span
                                    class="small"
                                    style="
                                      display:block;
                                      margin-top:3px;
                                    "
                                  >
                                    ${productCount}
                                    ${
                                      productCount === 1
                                        ? "product"
                                        : "products"
                                    }

                                    ${
                                      categories.length
                                        ? ` · ${escapeHtml(
                                            categories
                                              .slice(
                                                0,
                                                3
                                              )
                                              .join(
                                                " · "
                                              )
                                          )}`
                                        : ""
                                    }
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
                                      latest
                                        ?.description ||
                                      "Open this shop to see all products and services."
                                    )}
                                  </p>


                                  <span class="small">
                                    ${
                                      latest?.location
                                        ? `📍 ${escapeHtml(
                                            latest.location
                                          )}`
                                        : latest?.country
                                          ? `📍 ${escapeHtml(
                                              latest.country
                                            )}`
                                          : ""
                                    }
                                  </span>

                                </div>

                              </div>

                            </div>

                          </div>
                        `;
                      }
                    )
                    .join("")
                }

              </div>
            `
            : showMarketplaceTools
              ? `
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
                      marketTab === "mine"
                        ? "Your shop has no products yet"
                        : "No shops found"
                    }
                  </h3>

                  <p
                    class="small"
                    style="
                      margin-bottom:16px;
                      color:var(--text-secondary);
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
                          type="button"
                        >
                          Sell something
                        </button>
                      `
                      : ""
                  }

                </div>
              `
              : ""
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

  if (
    editing &&
    existingListing.uid !== getUid()
  ) {
    toast(
      "You can only edit your own listings."
    );

    return;
  }

  if (
    !editing &&
    !hasMarketAccount()
  ) {
    toast(
      "Create a Marketplace Shop before selling."
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
      ? "Edit Product"
      : "Add Product to Your Shop",

    `
      <div class="field">

        <label>
          Product / Service name *
        </label>

        <input
          class="input"
          id="listingTitle"
          maxlength="100"
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
          maxlength="1000"
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


      <div
        class="card"
        style="
          background:var(--surface2);
          box-shadow:none;
          padding:12px;
          margin-bottom:12px;
        "
      >
        <strong>
          Shop
        </strong>

        <div
          class="small"
          style="margin-top:4px;"
        >
          ${escapeHtml(
            account.storeName ||
            state.profile?.displayName ||
            state.profile?.username ||
            "Your Shop"
          )}
        </div>
      </div>


      <button
        class="btn btn-primary btn-block"
        id="publishListing"
        type="button"
      >
        ${
          editing
            ? "Save Changes"
            : "Add Product to Shop 🛍️"
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
          "";

        const condition =
          conditionInput?.value ||
          "";

        const country =
          countryInput?.value.trim() ||
          "";

        const location =
          locationInput?.value.trim() ||
          "";


        if (!title) {
          toast(
            "Enter a product or service name."
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
          description.length >
          1000
        ) {
          toast(
            "Description must be 1000 characters or less."
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


        if (
          !editing &&
          !hasMarketAccount()
        ) {
          closeModal();

          showMarketAccountModal(
            renderApp
          );

          toast(
            "A Marketplace Shop is required to sell."
          );

          return;
        }


        const button =
          document.getElementById(
            "publishListing"
          );

        if (!button) {
          return;
        }

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
              "Product updated ✨"
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
              "Product added to your shop 🛍️"
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

          button.disabled =
            false;

          button.textContent =
            editing
              ? "Save Changes"
              : "Add Product to Shop 🛍️";
        }
      }
    );
}


/* =========================================================
   SHOP DETAILS
   ========================================================= */

export async function showListingDetails(
  listingId,
  renderApp
) {
  const listing =
    (state.listings || [])
      .find(
        item =>
          item?.id ===
          listingId
      );

  if (!listing) {
    toast(
      "Listing not found."
    );

    return;
  }

  /*
   * The old exported function remains available.
   * It now opens the complete shop belonging to
   * the selected product.
   */
  if (listing.uid) {
    await showShopDetails(
      listing.uid,
      renderApp,
      listing
    );

    return;
  }

  await showSingleListingDetails(
    listing,
    renderApp
  );
}


/* =========================================================
   SHOW COMPLETE SHOP
   ========================================================= */

async function showShopDetails(
  sellerUid,
  renderApp,
  selectedListing = null
) {
  if (!sellerUid) {
    await showSingleListingDetails(
      selectedListing,
      renderApp
    );

    return;
  }


  try {
    /*
     * Read the current seller profile so the shop
     * banner always reflects the current account.
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

      displayName:
        selectedListing?.username ||
        "Market Seller",

      username:
        selectedListing?.username ||
        "Seller",

      marketAccount: {}
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
        sellerUid;
    }


    /*
     * Read every listing belonging to this shop.
     *
     * This prevents the shop from depending only
     * on the currently loaded feed.
     */
    const listingSnapshot =
      await getDocs(
        query(
          collection(
            db,
            "listings"
          ),
          where(
            "uid",
            "==",
            sellerUid
          )
        )
      );


    let shopListings =
      listingSnapshot.docs
        .map(
          snapshot => ({
            id:
              snapshot.id,

            ...snapshot.data()
          })
        );


    if (!shopListings.length) {
      shopListings =
        (state.listings || [])
          .filter(
            listing =>
              listing.uid ===
              sellerUid
          );
    }


    shopListings.sort(
      (a, b) =>
        listingTime(b) -
        listingTime(a)
    );


    const storeName =
      getShopName(
        selectedListing,
        sellerProfile
      );


    const shopDescription =
      getShopDescription(
        sellerProfile,
        selectedListing
      );


    const shopLocation =
      getShopLocation(
        sellerProfile,
        selectedListing
      );


    const isOwner =
      sellerUid ===
      getUid();


    const activeListings =
      shopListings.filter(
        listing =>
          listing.status !==
          "sold"
      );


    showModal(
      storeName,

      `
        <div
          style="
            display:flex;
            flex-direction:column;
            gap:14px;
          "
        >

          <!-- SHOP BANNER -->

          <div
            class="card"
            style="
              margin:0;
              background:var(--surface2);
              box-shadow:none;
            "
          >

            <div
              style="
                display:flex;
                align-items:flex-start;
                gap:12px;
              "
            >

              <div class="avatar avatar-lg">
                🛍️
              </div>


              <div
                class="profile-meta"
                style="
                  min-width:0;
                  flex:1;
                "
              >

                <strong
                  style="
                    display:block;
                    font-size:23px;
                    font-weight:900;
                    overflow-wrap:anywhere;
                  "
                >
                  ${escapeHtml(
                    storeName
                  )}
                </strong>


                <p
                  class="small"
                  style="
                    margin:5px 0 0;
                  "
                >
                  ${escapeHtml(
                    shopDescription
                  )}
                </p>


                <span class="small">
                  📍 ${escapeHtml(
                    shopLocation
                  )}
                </span>


                <span class="small">
                  ${shopListings.length}
                  ${
                    shopListings.length === 1
                      ? "product"
                      : "products"
                  }
                </span>

              </div>

            </div>

          </div>


          <!-- SHOP PRODUCTS -->

          <div
            class="section-title"
            style="margin:0;"
          >
            <h2 style="margin:0;">
              Products from
              ${escapeHtml(
                storeName
              )}
            </h2>
          </div>


          <div
            style="
              display:flex;
              flex-direction:column;
              gap:10px;
            "
          >

            ${
              shopListings.length
                ? shopListings
                    .map(
                      listing => `
                        <button
                          class="list-item"
                          data-shop-product="${escapeHtml(
                            listing.id
                          )}"
                          type="button"
                          style="
                            width:100%;
                            text-align:left;
                            cursor:pointer;
                            background:var(--surface);
                          "
                        >

                          <div
                            style="
                              display:flex;
                              justify-content:space-between;
                              align-items:flex-start;
                              gap:10px;
                              width:100%;
                            "
                          >

                            <div
                              style="
                                min-width:0;
                                flex:1;
                              "
                            >

                              <strong
                                style="
                                  display:block;
                                  font-size:17px;
                                  font-weight:900;
                                  overflow-wrap:anywhere;
                                "
                              >
                                ${escapeHtml(
                                  listing.title ||
                                  "Untitled product"
                                )}
                              </strong>


                              <span class="small">
                                ${escapeHtml(
                                  listing.category ||
                                  "Other"
                                )}

                                ·

                                ${escapeHtml(
                                  formatDate(
                                    listing.createdAt
                                  )
                                )}

                                ·

                                ${
                                  listing.status ===
                                  "sold"
                                    ? "Sold"
                                    : "Available"
                                }
                              </span>


                              <p
                                class="small"
                                style="
                                  margin:5px 0 0;
                                  color:var(
                                    --text-secondary
                                  );
                                "
                              >
                                ${escapeHtml(
                                  listing.description ||
                                  ""
                                )}
                              </p>

                            </div>


                            <strong
                              style="
                                color:var(--primary);
                                font-size:17px;
                                white-space:nowrap;
                                flex-shrink:0;
                                min-width:max-content;
                                overflow:visible;
                                display:inline-block;
                                font-variant-numeric:tabular-nums;
                              "
                            >
                              ₦${Number(
                                listing.price ||
                                0
                              ).toLocaleString(
                                "en-NG"
                              )}
                            </strong>

                          </div>

                        </button>
                      `
                    )
                    .join("")
                : `
                    <div
                      class="empty"
                      style="
                        text-align:center;
                        padding:20px;
                      "
                    >
                      <h3>
                        No products yet
                      </h3>

                      <p class="small">
                        This shop has not published
                        a product yet.
                      </p>
                    </div>
                  `
            }

          </div>


          ${
            isOwner
              ? `
                <div class="notice">
                  This is your shop.
                  Open a product to edit,
                  mark it sold, or delete it.
                </div>
              `
              : `
                <button
                  class="btn btn-primary btn-block"
                  id="messageSellerBtn"
                  type="button"
                  ${
                    activeListings.length
                      ? ""
                      : "disabled"
                  }
                >
                  💬 Contact Seller / Buy
                </button>
              `
          }

        </div>
      `
    );


    /*
     * Product inside shop.
     */
    document
      .querySelectorAll(
        "[data-shop-product]"
      )
      .forEach(
        item => {
          item.addEventListener(
            "click",
            () => {
              const productId =
                item.dataset
                  .shopProduct;

              const product =
                shopListings.find(
                  listing =>
                    listing.id ===
                    productId
                );

              closeModal();

              if (product) {
                showSingleListingDetails(
                  product,
                  renderApp,
                  sellerProfile
                );
              }
            }
          );
        }
      );


    /*
     * Buyer → existing chat or new chat.
     *
     * createConversation() already checks whether
     * a conversation exists and opens it when found.
     */
    if (!isOwner) {
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
              const contactListing =
                selectedListing ||
                activeListings[0] ||
                shopListings[0];


              if (!contactListing) {
                throw new Error(
                  "This shop has no product."
                );
              }


              await sendMarketplaceInterest(
                sellerUid,
                contactListing
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
                friendly(error)
              );

              button.disabled =
                false;

              button.textContent =
                "💬 Contact Seller / Buy";
            }
          }
        );
    }

  } catch (error) {
    console.error(
      "[Market] Shop details failed:",
      error
    );

    if (selectedListing) {
      await showSingleListingDetails(
        selectedListing,
        renderApp
      );

      return;
    }

    toast(
      friendly(error)
    );
  }
}


/* =========================================================
   MARKETPLACE INTEREST NOTIFICATION
   ========================================================= */

async function sendMarketplaceInterest(
  sellerUid,
  listing
) {
  if (!sellerUid || !listing) {
    throw new Error(
      "Seller or listing not found."
    );
  }

  if (
    sellerUid ===
    getUid()
  ) {
    throw new Error(
      "This is your listing."
    );
  }


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
        `is interested in your marketplace listing "${listing.title || "Product"}" 🛍️`,

      type:
        "marketplace_interest",

      listingId:
        listing.id,

      listingTitle:
        listing.title ||
        "Product",

      read:
        false,

      createdAt:
        serverTimestamp()
    }
  );
}


/* =========================================================
   SINGLE PRODUCT DETAILS
   ========================================================= */

async function showSingleListingDetails(
  listing,
  renderApp,
  sellerProfile = null
) {
  if (!listing) {
    toast(
      "Listing not found."
    );

    return;
  }


  const isOwner =
    listing.uid ===
    getUid();


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


  const sellerName =
    getShopName(
      listing,
      sellerProfile
    );


  const sellerBio =
    getShopDescription(
      sellerProfile,
      listing
    );


  const sellerLocation =
    getShopLocation(
      sellerProfile,
      listing
    );


  showModal(
    listing.title ||
      "Product Details",

    `
      <div
        style="
          display:flex;
          flex-direction:column;
          gap:14px;
        "
      >

        <!-- SHOP HEADER -->

        <div
          class="card"
          style="
            margin:0;
            background:var(--surface2);
            box-shadow:none;
          "
        >

          <strong
            style="
              display:block;
              font-size:21px;
              font-weight:900;
            "
          >
            🛍️ ${escapeHtml(
              sellerName
            )}
          </strong>


          ${
            sellerBio
              ? `
                <p
                  class="small"
                  style="
                    margin:4px 0 0;
                  "
                >
                  ${escapeHtml(
                    sellerBio
                  )}
                </p>
              `
              : ""
          }


          <span class="small">
            📍 ${escapeHtml(
              sellerLocation
            )}
          </span>

        </div>


        <!-- PRICE -->

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

            <div
              style="
                font-size:28px;
                font-weight:900;
                color:var(--primary);
                white-space:nowrap;
                min-width:max-content;
                display:inline-block;
                overflow:visible;
                font-variant-numeric:tabular-nums;
              "
            >
              ₦${Number(
                listing.price ||
                0
              ).toLocaleString(
                "en-NG"
              )}
            </div>


            <div class="small">
              ${escapeHtml(
                postedDate
              )}

              ${
                updatedDate &&
                updatedDate !==
                  postedDate
                  ? `
                    · Updated
                    ${escapeHtml(
                      updatedDate
                    )}
                  `
                  : ""
              }
            </div>

          </div>


          <div
            style="
              display:flex;
              gap:6px;
              flex-wrap:wrap;
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
                background:var(--surface2);
                color:var(--text);
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
                      background:var(--danger);
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


        <!-- DESCRIPTION -->

        <div
          class="card"
          style="
            background:var(--surface2);
            padding:16px;
            margin:0;
            box-shadow:none;
          "
        >

          <strong
            style="
              display:block;
              margin-bottom:6px;
              font-size:13px;
              text-transform:uppercase;
              color:var(--muted);
            "
          >
            Description
          </strong>


          <p
            style="
              white-space:pre-wrap;
              word-break:break-word;
              margin:0;
              font-size:14px;
              line-height:1.5;
            "
          >
            ${escapeHtml(
              listing.description ||
              ""
            )}
          </p>

        </div>


        <!-- LOCATION -->

        <div
          class="small"
          style="
            background:var(--surface2);
            padding:14px;
            border-radius:16px;
            display:flex;
            flex-direction:column;
            gap:5px;
          "
        >

          <div>
            📍 Location:

            <strong>
              ${escapeHtml(
                listing.location ||
                sellerLocation ||
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


        ${
          isOwner
            ? `
              <div
                class="grid grid3"
                style="gap:8px;"
              >

                <button
                  class="btn btn-secondary"
                  id="editListingBtn"
                  type="button"
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
            : `
              <button
                class="btn btn-primary btn-block"
                id="messageSellerBtn"
                type="button"
                ${
                  listing.status ===
                  "sold"
                    ? "disabled"
                    : ""
                }
              >
                💬 Contact Seller / Buy
              </button>
            `
        }

      </div>
    `
  );


  /* =======================================================
     OWNER
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

          if (!button) {
            return;
          }

          button.disabled =
            true;

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
              newStatus ===
              "sold"
                ? "Product marked as sold 🏷️"
                : "Product reactivated 🚀"
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
            "Delete Product?",

            `
              <p class="small">
                Delete
                <strong>
                  "${escapeHtml(
                    listing.title ||
                    "Untitled product"
                  )}"
                </strong>
                permanently?
              </p>


              <div
                style="
                  display:flex;
                  gap:8px;
                  margin-top:15px;
                "
              >

                <button
                  class="btn btn-ghost"
                  style="flex:1;"
                  id="cancelDeleteListing"
                  type="button"
                >
                  Cancel
                </button>


                <button
                  class="btn btn-danger"
                  style="flex:1;"
                  id="confirmDeleteListing"
                  type="button"
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
                showSingleListingDetails(
                  listing,
                  renderApp,
                  sellerProfile
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

                if (!button) {
                  return;
                }

                button.disabled =
                  true;

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
                    "Product deleted."
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

    return;
  }


  /* =======================================================
     BUYER
     ======================================================= */

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
          if (!listing.uid) {
            throw new Error(
              "Seller account not found."
            );
          }

          await sendMarketplaceInterest(
            listing.uid,
            listing
          );

          let contactProfile =
            sellerProfile;


          if (!contactProfile) {
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
                    listing.uid
                  ),
                  limit(1)
                )
              );


            contactProfile = {
              uid:
                listing.uid,

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
              contactProfile = {
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

              contactProfile.uid =
                contactProfile.uid ||
                listing.uid;
            }
          }


          closeModal();


          /*
           * Existing conversation:
           * createConversation() opens it.
           *
           * No existing conversation:
           * createConversation() creates one.
           */
          await createConversation(
            contactProfile,
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
            friendly(error)
          );

          button.disabled =
            false;

          button.textContent =
            "💬 Contact Seller / Buy";
        }
      }
    );
}


/* =========================================================
   SEARCH FILTER
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
    (
      state.search ||
      ""
    )
      .toLowerCase()
      .trim();


  const cards =
    root.querySelectorAll(
      "[data-view-shop]"
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
        ).toLowerCase();

      const show =
        !queryText ||
        haystack.includes(
          queryText
        );

      card.style.display =
        show
          ? ""
          : "none";

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
        `
          <h3>
            No shops found
          </h3>

          <p class="small">
            Try another shop or product search.
          </p>
        `;

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
     Back
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
     Empty My Shop
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
     Manage Shop
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
     Browse Tab
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


  /* -------------------------------------------------------
     My Shop Tab
     ------------------------------------------------------- */

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

        /*
         * Do not re-render while typing.
         * This keeps the keyboard focused.
         */
        filterMarketListingsDom();
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
     SHOP CARDS
     ------------------------------------------------------- */

  document
    .querySelectorAll(
      "[data-view-shop]"
    )
    .forEach(
      item => {
        item.addEventListener(
          "click",
          () => {
            const sellerUid =
              item.dataset
                .viewShop;

            const listingId =
              item.dataset
                .viewListing;

            const listing =
              (state.listings || [])
                .find(
                  current =>
                    current.id ===
                    listingId
                );


            if (sellerUid) {
              showShopDetails(
                sellerUid,
                renderApp,
                listing || null
              );

              return;
            }


            if (listing) {
              showListingDetails(
                listing.id,
                renderApp
              );
            }
          }
        );
      }
    );
}
