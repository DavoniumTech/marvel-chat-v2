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

import {
  toast
} from "../components/toast.js";

import {
  createConversation
} from "./chat.js";


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
   MARKET ACCOUNT
   ========================================================= */

/*
 * A user is a Market seller when:
 *
 * 1. Their user profile has an active Market Account.
 * 2. OR they already own an existing listing.
 *
 * The second condition protects existing sellers during
 * the migration to the new Market Account system.
 */

export function hasMarketAccount() {
  const uid = state.user?.uid;

  if (!uid) return false;

  const account =
    state.profile?.marketAccount;

  if (account?.active === true) {
    return true;
  }

  return (state.listings || []).some(
    listing =>
      listing.uid === uid
  );
}


/*
 * Existing sellers are migrated automatically.
 *
 * This writes only the user's own profile document.
 * Existing listing documents are NOT changed.
 */

async function ensureExistingSellerAccount() {
  const uid = state.user?.uid;

  if (!uid || !state.profile) {
    return;
  }

  const account =
    state.profile.marketAccount;

  if (account?.active === true) {
    return;
  }

  const existingListing =
    (state.listings || []).find(
      listing =>
        listing.uid === uid
    );

  if (!existingListing) {
    return;
  }

  const marketAccount = {
    active: true,

    storeName:
      account?.storeName ||
      state.profile.displayName ||
      state.profile.username ||
      "Market Seller",

    bio:
      account?.bio || "",

    location:
      account?.location ||
      state.profile.country ||
      "",

    createdAt:
      account?.createdAt ||
      serverTimestamp(),

    migratedFromListing: true
  };

  try {

    await updateDoc(
      doc(
        db,
        "users",
        uid
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
          account?.createdAt ||
          new Date()
      }
    };

    console.log(
      "[Market] Existing seller migrated."
    );

  } catch (error) {

    console.warn(
      "[Market] Seller migration failed:",
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
    toast("Please sign in first.");
    return;
  }

  const account =
    state.profile?.marketAccount || {};

  const isActive =
    account.active === true;

  showModal(
    isActive
      ? "Market Account"
      : "Create Market Account",

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
          placeholder="Tell buyers what you sell…"
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
          background:var(--surface2);
          padding:12px;
          margin:12px 0;
          box-shadow:none;
        "
      >

        <div
          style="
            font-size:20px;
            margin-bottom:4px;
          "
        >
          🛍️
        </div>

        <strong>
          Market Account
        </strong>

        <p
          class="small"
          style="margin:5px 0 0;"
        >
          Your Market Account lets you
          create and manage listings.
          Everyone can still browse
          the marketplace.
        </p>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="saveMarketAccount"
      >
        ${
          isActive
            ? "Save Market Account"
            : "Create Market Account 🛍️"
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

        const storeNameInput =
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
          storeNameInput?.value
            .trim() || "";

        const bio =
          bioInput?.value
            .trim() || "";

        const location =
          locationInput?.value
            .trim() || "";

        if (!storeName) {

          toast(
            "Enter your seller or store name."
          );

          storeNameInput?.focus();

          return;
        }


        const button =
          document.getElementById(
            "saveMarketAccount"
          );

        button.disabled = true;

        button.textContent =
          isActive
            ? "Saving…"
            : "Creating…";


        try {

          const marketAccount = {

            active: true,

            storeName,

            bio,

            location,

            createdAt:
              account.createdAt ||
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
            marketAccount
          };


          closeModal();


          toast(
            isActive
              ? "Market Account updated ✨"
              : "Market Account created 🛍️"
          );


          if (
            typeof renderApp ===
            "function"
          ) {
            renderApp();
          }

        } catch (error) {

          console.error(
            "[Market] Account save error:",
            error
          );

          toast(
            friendly(error)
          );

          button.disabled =
            false;

          button.textContent =
            isActive
              ? "Save Market Account"
              : "Create Market Account 🛍️";
        }
      }
    );
}


/* =========================================================
   MARKET RENDER
   ========================================================= */

export function renderMarket(
  renderApp
) {

  /*
   * This migration runs only when the user already owns
   * a listing and has no Market Account.
   */
  ensureExistingSellerAccount();


  const queryText =
    (state.search || "")
      .toLowerCase();

  const selectedCategory =
    state.marketCategory || "All";

  const marketTab =
    state.marketTab || "browse";

  const sortBy =
    state.marketSort || "newest";

  const sellerAccount =
    hasMarketAccount();


  let filtered =
    (state.listings || [])
      .filter(listing => {

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


        if (
          marketTab === "mine"
        ) {

          return (
            matchesSearch &&
            matchesCategory &&
            listing.uid ===
              state.user?.uid
          );
        }


        return (
          matchesSearch &&
          matchesCategory &&
          listing.status !== "sold"
        );
      });


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
    (state.listings || [])
      .filter(
        listing =>
          listing.uid ===
          state.user?.uid
      )
      .length;


  return `
    <div class="page market-page">

      <section class="hero">

        <h1>
          Marvel Market 🛍️
        </h1>

        <p>
          Buy, sell, and discover
          trusted items from
          community members.
        </p>

      </section>


      ${
        sellerAccount

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

                  <strong>
                    🛍️ ${
                      escapeHtml(
                        state.profile
                          ?.marketAccount
                          ?.storeName ||
                        state.profile
                          ?.displayName ||
                        state.profile
                          ?.username ||
                        "Market Seller"
                      )
                    }
                  </strong>

                  <div class="small">
                    Market Account active
                  </div>

                </div>


                <button
                  class="btn btn-ghost"
                  id="manageMarketAccountBtn"
                  style="font-size:13px;"
                >
                  Manage
                </button>

              </div>

            </div>

          `

          : `

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

                  <strong>
                    🛍️ Want to sell?
                  </strong>

                  <div class="small">
                    Create your free
                    Market Account.
                  </div>

                </div>


                <button
                  class="btn btn-primary"
                  id="createMarketAccountBtn"
                  style="font-size:13px;"
                >
                  Create Account
                </button>

              </div>

            </div>

          `
      }


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
          placeholder="Search the marketplace…"
        >

        <button
          class="btn btn-primary"
          id="sellBtn"
        >
          + Sell
        </button>

      </div>


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
          My Listings (${myListingsCount})
        </button>

      </div>


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
              sortBy === "newest"
                ? "selected"
                : ""
            }
          >
            Newest first
          </option>

          <option
            value="oldest"
            ${
              sortBy === "oldest"
                ? "selected"
                : ""
            }
          >
            Oldest first
          </option>

        </select>


        <div
          style="
            display:flex;
            gap:5px;
            overflow-x:auto;
            flex:1;
            padding-bottom:4px;
            white-space:nowrap;
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
                      padding:4px 10px;
                      font-size:12px;
                      border-radius:999px;
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
                          style="cursor:pointer;"
                          data-view-listing="${escapeHtml(
                            listing.id
                          )}"
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
                                🛍
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

                                  <strong
                                    style="
                                      font-size:15px;
                                      overflow-wrap:anywhere;
                                      word-break:break-word;
                                    "
                                  >
                                    ${escapeHtml(
                                      listing.title
                                    )}
                                  </strong>


                                  <span
                                    class="badge"
                                    style="
                                      background:var(--surface2);
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
                                      background:var(--surface2);
                                      color:var(--text);
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
                                    display:block;
                                    margin-top:2px;
                                  "
                                >

                                  By @${escapeHtml(
                                    listing.username ||
                                    "User"
                                  )}

                                  ·

                                  ${escapeHtml(
                                    listing.location
                                      ? listing.location +
                                        ", "
                                      : ""
                                  )}

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
                                    color:var(--text-secondary);
                                    display:-webkit-box;
                                    -webkit-line-clamp:2;
                                    -webkit-box-orient:vertical;
                                    overflow:hidden;
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


                            <strong
                              style="
                                color:var(--primary);
                                font-size:16px;
                                white-space:nowrap;
                                margin-left:8px;
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
                    marketTab === "mine"
                      ? "You have no listings yet."
                      : "The marketplace is quiet."
                  }
                </h3>

                <p
                  style="
                    color:var(--text-secondary);
                    margin-bottom:16px;
                  "
                >
                  ${
                    marketTab === "mine"
                      ? "Create a listing to start selling to the community."
                      : "Be the first person to list something."
                  }
                </p>

                <button
                  class="btn btn-primary"
                  id="emptySellBtn"
                >
                  ${
                    sellerAccount
                      ? "Sell something"
                      : "Create Market Account"
                  }
                </button>

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

  const isEditing =
    Boolean(existingListing);


  if (!state.user) {
    toast("Please sign in first.");
    return;
  }


  if (
    isEditing &&
    existingListing.uid !==
      state.user.uid
  ) {

    toast(
      "You can only edit your own listings."
    );

    return;
  }


  /*
   * New listings require an active Market Account.
   */
  if (
    !isEditing &&
    !hasMarketAccount()
  ) {

    showMarketAccountModal(
      renderApp
    );

    return;
  }


  const pCountry =
    state.profile?.country ||
    "Nigeria";


  showModal(
    isEditing
      ? "Edit listing"
      : "Create marketplace listing",

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
          placeholder="Describe your product or service clearly…"
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
            value="${
              existingListing?.price ??
              ""
            }"
            placeholder="e.g. 25000"
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
              pCountry
            )}"
            placeholder="Country"
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
            ""
          )}"
          placeholder="e.g. Gwale LGA, Kano State"
        >

      </div>


      <button
        class="btn btn-primary btn-block"
        id="publishListing"
      >
        ${
          isEditing
            ? "Save changes"
            : "Publish listing 🛍️"
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
          titleInput.value.trim();

        const description =
          descriptionInput.value.trim();

        const price =
          parseFloat(
            priceInput.value
          );

        const category =
          categoryInput.value;

        const condition =
          conditionInput.value;

        const country =
          countryInput.value.trim();

        const location =
          locationInput.value.trim();


        if (!title) {
          toast("Enter a title.");
          titleInput.focus();
          return;
        }

        if (!description) {
          toast("Enter a description.");
          descriptionInput.focus();
          return;
        }

        if (
          Number.isNaN(price) ||
          price < 0
        ) {
          toast("Enter a valid price.");
          priceInput.focus();
          return;
        }

        if (!category) {
          toast("Select a category.");
          return;
        }

        if (!condition) {
          toast("Select condition.");
          return;
        }

        if (!country) {
          toast("Enter a country.");
          countryInput.focus();
          return;
        }


        /*
         * Re-check account immediately before
         * the write.
         */
        if (
          !isEditing &&
          !hasMarketAccount()
        ) {

          closeModal();

          showMarketAccountModal(
            renderApp
          );

          return;
        }


        const button =
          document.getElementById(
            "publishListing"
          );

        button.disabled = true;

        button.textContent =
          isEditing
            ? "Saving…"
            : "Publishing…";


        try {

          const account =
            state.profile
              ?.marketAccount ||
            {};

          const username =
            account.storeName ||
            state.profile?.displayName ||
            state.profile?.username ||
            "User";


          if (isEditing) {

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

            /*
             * Update local state immediately.
             */
            const index =
              state.listings.findIndex(
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
                location
              };

            }

            closeModal();

            toast(
              "Listing updated successfully ✨"
            );

          } else {

            const ref =
              await addDoc(
                collection(
                  db,
                  "listings"
                ),
                {
                  uid:
                    state.user.uid,

                  username,

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


            state.listings = [
              {
                id: ref.id,
                uid:
                  state.user.uid,
                username,
                title,
                description,
                price,
                category,
                condition,
                country,
                location,
                status: "active",
                createdAt:
                  new Date(),
                updatedAt:
                  new Date()
              },
              ...(state.listings || [])
            ];


            closeModal();

            toast(
              "Listing published 🛍️"
            );
          }


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
            isEditing
              ? "Save changes"
              : "Publish listing 🛍️";
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
    (state.listings || []).find(
      item =>
        item.id === listingId
    );

  if (!listing) {
    toast("Listing not found.");
    return;
  }


  const isOwner =
    listing.uid ===
    state.user?.uid;


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
          display:flex;
          flex-direction:column;
          gap:16px;
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

            <div
              style="
                font-size:28px;
                font-weight:900;
                color:var(--primary);
                margin-bottom:4px;
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


        <div
          class="small"
          style="
            background:var(--surface2);
            padding:14px;
            border-radius:16px;
            display:flex;
            flex-direction:column;
            gap:4px;
          "
        >

          <div>
            📍 Location:
            <strong>
              ${escapeHtml(
                listing.location ||
                "Not specified"
              )}
              (
              ${escapeHtml(
                listing.country ||
                "Nigeria"
              )}
              )
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
                @${escapeHtml(
                  listing.username ||
                  "Seller"
                )}
              </button>

            `
        }

      </div>
    `
  );


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


            const index =
              state.listings.findIndex(
                item =>
                  item.id ===
                  listing.id
              );

            if (index >= 0) {

              state.listings[index] = {
                ...state.listings[index],
                status:
                  newStatus
              };

            }


            closeModal();

            toast(
              newStatus === "sold"
                ? "Marked as sold 🏷️"
                : "Listing reactivated 🚀"
            );

            renderApp?.();

          } catch (error) {

            console.error(
              "[Market] Status update error:",
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
            "Delete listing?",

            `
              <p class="small">
                Are you sure you want to delete
                "${escapeHtml(
                  listing.title
                )}"?
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
                  id="cancelDelete"
                >
                  Cancel
                </button>

                <button
                  class="btn btn-danger"
                  style="flex:1;"
                  id="confirmDelete"
                >
                  Delete
                </button>

              </div>
            `
          );


          document
            .getElementById(
              "cancelDelete"
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
              "confirmDelete"
            )
            ?.addEventListener(
              "click",
              async () => {

                const button =
                  document.getElementById(
                    "confirmDelete"
                  );

                button.disabled =
                  true;

                button.textContent =
                  "Deleting…";


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
                    "[Market] Delete error:",
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

          button.disabled =
            true;

          button.textContent =
            "Opening seller chat…";


          try {

            const sellerUid =
              listing.uid;


            const userSnap =
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
              !userSnap.empty
            ) {

              sellerProfile = {
                id:
                  userSnap.docs[0].id,

                ...userSnap.docs[0].data()
              };
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
                  state.user.uid,

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

                read:false,

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
              `Interest sent to @${listing.username} 🛍️`
            );

          } catch (error) {

            console.error(
              "[Market] Contact seller error:",
              error
            );

            toast(
              "Could not open chat with seller."
            );

            button.disabled =
              false;

            button.textContent =
              `💬 Contact Seller @${listing.username || "Seller"}`;
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

  document
    .getElementById(
      "sellBtn"
    )
    ?.addEventListener(
      "click",
      () =>
        showSellModal(
          renderApp
        )
    );


  document
    .getElementById(
      "emptySellBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        if (
          hasMarketAccount()
        ) {

          showSellModal(
            renderApp
          );

        } else {

          showMarketAccountModal(
            renderApp
          );

        }
      }
    );


  document
    .getElementById(
      "createMarketAccountBtn"
    )
    ?.addEventListener(
      "click",
      () =>
        showMarketAccountModal(
          renderApp
        )
    );


  document
    .getElementById(
      "manageMarketAccountBtn"
    )
    ?.addEventListener(
      "click",
      () =>
        showMarketAccountModal(
          renderApp
        )
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

        renderApp();

        setTimeout(
          () => {

            const input =
              document.getElementById(
                "marketSearch"
              );

            if (input) {

              input.focus();

              input.selectionStart =
                input.selectionEnd =
                  input.value.length;
            }

          },
          0
        );
      }
    );
  }


  const sortSelect =
    document.getElementById(
      "marketSortSelect"
    );

  if (sortSelect) {

    sortSelect.addEventListener(
      "change",
      event => {

        state.marketSort =
          event.target.value;

        renderApp();
      }
    );
  }


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
