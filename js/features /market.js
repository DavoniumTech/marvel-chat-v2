import { state, escapeHtml, friendly, formatDate } from "../state.js";
import {
  db,
  collection,
  doc,
  getDoc,
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
   BASIC HELPERS
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
   * Preserve existing sellers from before the
   * Market Account system existed.
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
          Shop / Store name *
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
          account.bio || ""
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
          🏪
        </div>

        <strong>
          Your Marvel Market Shop
        </strong>

        <p
          class="small"
          style="margin:5px 0 0;"
        >
          Your shop is where your marketplace
          products and services are displayed.
          Buyers can browse your shop and
          contact you about your listings.
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
            : "Create Marketplace Shop 🛍️"
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
          nameInput?.value.trim() ||
          "";

        const bio =
          bioInput?.value.trim() ||
          "";

        const location =
          locationInput?.value.trim() ||
          "";


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


          button.disabled =
            false;

          button.textContent =
            accountExists
              ? "Save Marketplace Account"
              : "Create Marketplace Shop 🛍️";
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
   MARKET PAGE
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
    seller || browse;


  const queryText =
    showMarketplaceTools
      ? (
          state.search || ""
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


  let filtered =
    (state.listings || [])
      .filter(
        listing =>
          listing.status !== "sold"
      );


  /*
   * Seller → My Listings
   */
  if (
    seller &&
    marketTab === "mine"
  ) {

    filtered =
      getMyListings()
        .filter(
          listing =>
            listing.status !== "sold"
        );
  }


  filtered =
    filtered.filter(
      listing => {

        const searchHaystack =
          `
            ${listing.title || ""}
            ${listing.description || ""}
            ${listing.username || ""}
            ${listing.shopName || ""}
            ${listing.category || ""}
            ${listing.location || ""}
            ${listing.country || ""}
          `
            .toLowerCase();


        const matchesSearch =
          !queryText ||
          searchHaystack.includes(
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


  const account =
    state.profile?.marketAccount ||
    {};


  const shopName =
    account.storeName ||
    state.profile?.displayName ||
    state.profile?.username ||
    "Market Shop";


  return `

    <div class="page market-page">

      <section class="hero">

        <h1>
          Marvel Market 🛍️
        </h1>

        <p>
          Discover products and services
          from Marvel Chat community shops.
        </p>

      </section>


      ${
        seller
          ? `

            <div
              class="card"
              style="
                margin-bottom:12px;
                background:var(--surface2);
                box-shadow:none;
              "
            >

              <div
                class="profile-row"
                style="
                  justify-content:space-between;
                  align-items:flex-start;
                "
              >

                <div
                  style="
                    min-width:0;
                  "
                >

                  <strong
                    style="
                      display:block;
                      font-size:20px;
                      font-weight:900;
                      overflow-wrap:anywhere;
                    "
                  >
                    🏪
                    ${escapeHtml(
                      shopName
                    )}
                  </strong>


                  ${
                    account.bio
                      ? `
                        <div
                          class="small"
                          style="
                            margin-top:5px;
                          "
                        >
                          ${escapeHtml(
                            account.bio
                          )}
                        </div>
                      `
                      : ""
                  }


                  ${
                    account.location
                      ? `
                        <div
                          class="small"
                          style="
                            margin-top:5px;
                          "
                        >
                          📍
                          ${escapeHtml(
                            account.location
                          )}
                        </div>
                      `
                      : ""
                  }

                </div>


                <button
                  class="btn btn-ghost"
                  id="manageMarketAccountBtn"
                  type="button"
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


              <h3>
                Explore Marvel Market
              </h3>


              <p
                class="small"
              >
                Browse products and services
                from community shops.
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
          : `

            <div
              class="search"
              style="
                margin-bottom:12px;
              "
            >

              <input
                class="input"
                id="marketSearch"
                value="${escapeHtml(
                  state.search || ""
                )}"
                placeholder="Search shops, products or listings..."
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
                    style="
                      margin-bottom:12px;
                    "
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
                      My Shop
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
                  display:flex;
                  gap:5px;
                  overflow-x:auto;
                  flex:1;
                  padding-bottom:4px;
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
                    "
                  >
                    ← Back
                  </button>

                `
                : ""
            }

          `
      }


      <div id="marketItems">

        ${
          filtered.length
            ? `

              <div class="list">

                ${
                  filtered
                    .map(
                      listing => {

                        const listingShop =
                          listing.shopName ||
                          listing.username ||
                          "Market Shop";


                        return `

                          <div
                            class="list-item"
                            data-view-listing="${escapeHtml(
                              listing.id
                            )}"
                            style="
                              cursor:pointer;
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
                                >
                                  🏪
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
                                      font-size:18px;
                                      font-weight:900;
                                      overflow-wrap:anywhere;
                                    "
                                  >
                                    ${escapeHtml(
                                      listingShop
                                    )}
                                  </strong>


                                  <span
                                    class="small"
                                  >
                                    Shop
                                    ${
                                      listing.location
                                        ? ` · ${escapeHtml(
                                            listing.location
                                          )}`
                                        : ""
                                    }
                                  </span>


                                  <strong
                                    style="
                                      display:block;
                                      margin-top:5px;
                                      font-size:16px;
                                    "
                                  >
                                    ${escapeHtml(
                                      listing.title ||
                                      "Untitled listing"
                                    )}
                                  </strong>


                                  <p
                                    class="small"
                                    style="
                                      margin:5px 0;
                                    "
                                  >
                                    ${escapeHtml(
                                      listing.description ||
                                      ""
                                    )}
                                  </p>


                                  <span class="badge">
                                    ${escapeHtml(
                                      listing.category ||
                                      "Other"
                                    )}
                                  </span>


                                  ${
                                    listing.condition
                                      ? `
                                        <span
                                          class="badge"
                                          style="
                                            background:var(--surface2);
                                            color:var(--text);
                                          "
                                        >
                                          ${escapeHtml(
                                            listing.condition
                                          )}
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

                        `;
                      }
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
                  "
                >
                  🛍️
                </div>


                <h3>
                  ${
                    seller &&
                    marketTab === "mine"
                      ? "Your shop is empty"
                      : "No products found"
                  }
                </h3>


                <p
                  class="small"
                >
                  ${
                    seller &&
                    marketTab === "mine"
                      ? "Add your first product or service to your shop."
                      : "Try another shop, product, search or category."
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
                        Add Product
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
   CREATE / EDIT LISTING
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
      ? "Edit Listing"
      : "Add Product to Shop",

    `

      <div class="field">

        <label>
          Product / Service title *
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
                    category !== "All"
                )
                .map(
                  category => `

                    <option
                      value="${escapeHtml(
                        category
                      )}"
                      ${
                        existingListing?.category ===
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
                        existingListing?.condition ===
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
          margin:10px 0 14px;
        "
      >

        <strong>
          🏪
          ${escapeHtml(
            account.storeName ||
            "Your Market Shop"
          )}
        </strong>

        <p
          class="small"
          style="
            margin:5px 0 0;
          "
        >
          This product will appear inside your shop.
        </p>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="publishListing"
        type="button"
      >
        ${
          editing
            ? "Save Changes"
            : "Add to My Shop 🛍️"
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
            "Enter a product or service title."
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


        if (
          !editing &&
          !hasMarketAccount()
        ) {

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
            : "Adding to Shop...";


        try {

          const shopName =
            state.profile
              ?.marketAccount
              ?.storeName ||
            state.profile
              ?.displayName ||
            state.profile
              ?.username ||
            "Market Shop";


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

                shopName,

                updatedAt:
                  serverTimestamp()
              }
            );


            toast(
              "Listing updated ✨"
            );

          } else {

            await addDoc(
              collection(
                db,
                "listings"
              ),
              {

                uid:
                  state.user.uid,

                username:
                  shopName,

                shopName,

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
              ? "Save Changes"
              : "Add to My Shop 🛍️";
        }
      }
    );
}


/* =========================================================
   SHOP / LISTING DETAILS
   ========================================================= */

export async function showListingDetails(
  listingId,
  renderApp
) {

  /*
   * First search the current state.
   * If the listing is not currently loaded,
   * read it directly from Firestore.
   */
  let listing =
    (state.listings || [])
      .find(
        item =>
          item.id === listingId
      );


  if (!listing) {

    try {

      const snapshot =
        await getDoc(
          doc(
            db,
            "listings",
            listingId
          )
        );


      if (
        snapshot.exists()
      ) {

        listing = {
          id:
            snapshot.id,

          ...snapshot.data()
        };
      }

    } catch (error) {

      console.error(
        "[Market] Listing detail read failed:",
        error
      );
    }
  }


  if (!listing) {

    toast(
      "Listing not found."
    );

    return;
  }


  const isOwner =
    listing.uid === getUid();


  /*
   * Load the actual seller/shop profile.
   */
  let shopProfile = {

    uid:
      listing.uid,

    displayName:
      listing.username ||
      "Market Seller",

    marketAccount: {

      active: true,

      storeName:
        listing.shopName ||
        listing.username ||
        "Market Shop",

      bio: "",

      location:
        listing.location ||
        listing.country ||
        ""
    }
  };


  try {

    if (listing.uid) {

      const sellerSnapshot =
        await getDoc(
          doc(
            db,
            "users",
            listing.uid
          )
        );


      if (
        sellerSnapshot.exists()
      ) {

        shopProfile = {

          uid:
            sellerSnapshot.id,

          ...sellerSnapshot.data()
        };
      }
    }

  } catch (error) {

    console.warn(
      "[Market] Shop profile read failed:",
      error
    );
  }


  const account =
    shopProfile.marketAccount ||
    {};


  const shopName =
    account.storeName ||
    account.shopName ||
    listing.shopName ||
    listing.username ||
    shopProfile.displayName ||
    "Market Shop";


  const shopBio =
    account.bio ||
    account.description ||
    account.shopDescription ||
    "";


  const shopLocation =
    account.location ||
    listing.location ||
    listing.country ||
    "";


  /*
   * Load every listing belonging to this shop.
   */
  let shopListings =
    (state.listings || [])
      .filter(
        item =>
          item.uid === listing.uid &&
          item.status !== "sold"
      );


  if (
    !shopListings.some(
      item =>
        item.id === listing.id
    )
  ) {

    try {

      const shopSnapshot =
        await getDocs(
          query(
            collection(
              db,
              "listings"
            ),
            where(
              "uid",
              "==",
              listing.uid
            )
          )
        );


      shopListings =
        shopSnapshot.docs
          .map(
            shopDoc => ({

              id:
                shopDoc.id,

              ...shopDoc.data()
            })
          )
          .filter(
            item =>
              item.status !== "sold"
          );

    } catch (error) {

      console.warn(
        "[Market] Shop listings read failed:",
        error
      );
    }
  }


  /*
   * Always keep the clicked listing available.
   */
  if (
    !shopListings.some(
      item =>
        item.id === listing.id
    )
  ) {

    shopListings.unshift(
      listing
    );
  }


  shopListings.sort(
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


      return timeB - timeA;
    }
  );


  const postedDate =
    formatDate(
      listing.createdAt
    );


  const shopListingMarkup =
    shopListings
      .map(
        item => `

          <button
            class="list-item"
            type="button"
            data-shop-listing="${escapeHtml(
              item.id
            )}"
            style="
              width:100%;
              text-align:left;
              cursor:pointer;
            "
          >

            <div
              class="profile-row"
              style="
                justify-content:space-between;
                align-items:flex-start;
              "
            >

              <div
                style="
                  min-width:0;
                "
              >

                <strong
                  style="
                    display:block;
                    font-size:16px;
                    font-weight:900;
                  "
                >
                  ${escapeHtml(
                    item.title ||
                    "Untitled listing"
                  )}
                </strong>


                <div
                  class="small"
                  style="
                    margin-top:3px;
                  "
                >
                  ${escapeHtml(
                    item.category ||
                    "Other"
                  )}

                  ·

                  ${escapeHtml(
                    formatDate(
                      item.createdAt
                    )
                  )}
                </div>


                <p
                  class="small"
                  style="
                    margin:5px 0 0;
                  "
                >
                  ${escapeHtml(
                    item.description ||
                    ""
                  )}
                </p>

              </div>


              <strong
                style="
                  color:var(--primary);
                  white-space:nowrap;
                "
              >
                ₦${Number(
                  item.price ||
                  0
                ).toLocaleString()}
              </strong>

            </div>

          </button>

        `
      )
      .join("");


  showModal(

    shopName,

    `

      <!-- SHOP HEADER -->

      <div
        class="card"
        style="
          background:var(--surface2);
          box-shadow:none;
          margin:0 0 14px;
          padding:16px;
        "
      >

        <strong
          style="
            display:block;
            font-size:24px;
            font-weight:900;
            overflow-wrap:anywhere;
          "
        >
          🏪
          ${escapeHtml(
            shopName
          )}
        </strong>


        <div
          class="small"
          style="
            margin-top:4px;
          "
        >
          Marvel Market Shop
        </div>


        ${
          shopBio
            ? `

              <p
                class="small"
                style="
                  margin:9px 0 0;
                  white-space:pre-wrap;
                  word-break:break-word;
                "
              >
                ${escapeHtml(
                  shopBio
                )}
              </p>

            `
            : ""
        }


        ${
          shopLocation
            ? `

              <div
                class="small"
                style="
                  margin-top:8px;
                "
              >
                📍
                ${escapeHtml(
                  shopLocation
                )}
              </div>

            `
            : ""
        }


        <div
          class="small"
          style="
            margin-top:8px;
          "
        >
          ${shopListings.length}
          ${
            shopListings.length === 1
              ? "listing"
              : "listings"
          }
          in this shop
        </div>

      </div>


      <!-- SELECTED PRODUCT -->

      <div
        class="card"
        style="
          margin:0 0 14px;
          box-shadow:none;
        "
      >

        <span class="badge">
          Selected listing
        </span>


        <h3
          style="
            margin:8px 0 6px;
            overflow-wrap:anywhere;
          "
        >
          ${escapeHtml(
            listing.title ||
            "Listing"
          )}
        </h3>


        <strong
          style="
            display:block;
            font-size:28px;
            color:var(--primary);
            font-weight:900;
          "
        >
          ₦${Number(
            listing.price ||
            0
          ).toLocaleString()}
        </strong>


        <p
          style="
            white-space:pre-wrap;
            word-break:break-word;
            line-height:1.5;
          "
        >
          ${escapeHtml(
            listing.description ||
            ""
          )}
        </p>


        <div
          class="small"
        >
          ${escapeHtml(
            listing.category ||
            "Other"
          )}

          ·

          ${escapeHtml(
            listing.condition ||
            "Good"
          )}

          ·

          ${escapeHtml(
            postedDate
          )}
        </div>


        <div
          class="small"
          style="
            margin-top:10px;
          "
        >
          📍
          ${escapeHtml(
            listing.location ||
            shopLocation ||
            "Not specified"
          )}

          ${
            listing.country
              ? `, ${escapeHtml(
                  listing.country
                )}`
              : ""
          }
        </div>

      </div>


      <!-- ALL SHOP PRODUCTS -->

      <div
        class="section-title"
      >

        <h3>
          All products from
          ${escapeHtml(
            shopName
          )}
        </h3>

      </div>


      <div class="list">

        ${shopListingMarkup}

      </div>


      <!-- ACTIONS -->

      <div
        style="
          margin-top:14px;
        "
      >

        ${
          isOwner
            ? `

              <div
                class="grid grid3"
                style="
                  gap:8px;
                "
              >

                <button
                  class="btn btn-secondary"
                  id="editListingBtn"
                  type="button"
                >
                  ✏️ Edit
                </button>


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
            : `

              <button
                class="btn btn-primary btn-block"
                id="messageSellerBtn"
                type="button"
              >
                💬 Contact Seller / Buy
              </button>

            `
        }

      </div>

    `
  );


  /*
   * Open another product from this same shop.
   */
  document
    .querySelectorAll(
      "[data-shop-listing]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const nextId =
              button.dataset
                .shopListing;


            if (
              !nextId ||
              nextId === listing.id
            ) {
              return;
            }


            showListingDetails(
              nextId,
              renderApp
            );
          }
        );
      }
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
                ? "Listing marked as sold 🏷️"
                : "Listing reactivated 🚀"
            );


            renderApp?.();

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
                    listing.title ||
                    "this listing"
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
                  id="cancelDeleteListing"
                  type="button"
                  style="flex:1"
                >
                  Cancel
                </button>


                <button
                  class="btn btn-danger"
                  id="confirmDeleteListing"
                  type="button"
                  style="flex:1"
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
                    "Listing deleted."
                  );


                  renderApp?.();

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

  } else {

    /* =====================================================
       BUYER → CONTACT SHOP / BUY
       ===================================================== */

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
            "Opening shop chat...";


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
                "💬 Contact Seller / Buy";

              return;
            }


            let sellerProfile = {

              uid:
                sellerUid,

              username:
                shopProfile.username ||
                listing.username ||
                "Seller",

              displayName:
                shopName
            };


            try {

              const sellerSnapshot =
                await getDoc(
                  doc(
                    db,
                    "users",
                    sellerUid
                  )
                );


              if (
                sellerSnapshot.exists()
              ) {

                sellerProfile = {

                  id:
                    sellerSnapshot.id,

                  uid:
                    sellerSnapshot.id,

                  ...sellerSnapshot.data()
                };


                sellerProfile.uid =
                  sellerProfile.uid ||
                  sellerProfile.id;
              }

            } catch (profileError) {

              console.warn(
                "[Market] Seller profile fallback:",
                profileError
              );
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
              `Interest sent to ${shopName} 🛍️`
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
              "💬 Contact Seller / Buy";
          }
        }
      );
  }
}


/* =========================================================
   LIVE SEARCH FILTER
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
      "[data-view-listing]"
    );


  cards.forEach(
    card => {

      const haystack =
        (
          card.textContent ||
          ""
        )
          .toLowerCase();


      const visible =
        !queryText ||
        haystack.includes(
          queryText
        );


      card.style.display =
        visible
          ? ""
          : "none";
    }
  );
}


/* =========================================================
   MARKET EVENTS
   ========================================================= */

export function attachMarketEvents(
  renderApp
) {

  /*
   * Browse Market
   */
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


  /*
   * Back from Browse
   */
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


  /*
   * Sell / Add Product
   */
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


  /*
   * Empty Shop → Add Product
   */
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


  /*
   * Manage Shop
   */
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


  /*
   * Browse tab
   */
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


  /*
   * My Shop tab
   */
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


  /*
   * Search
   */
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
         * Do not re-render on every
         * keystroke because that would
         * steal keyboard focus.
         */
        filterMarketListingsDom();
      }
    );
  }


  /*
   * Sort
   */
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


  /*
   * Categories
   */
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


  /*
   * Listing / Shop details
   */
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
