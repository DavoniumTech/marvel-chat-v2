import {
  state,
  countries,
  escapeHtml,
  initials,
  friendly
} from "../state.js";


import {
  db,
  collection,
  doc,
  updateDoc,
  getDocs,
  query,
  where,
  limit
} from "../firebase/firestore.js";


import {
  updateProfile,
  signOut
} from "../firebase/auth.js";


import {
  showModal,
  closeModal
} from "../components/modal.js";


import {
  toast
} from "../components/toast.js";


import {
  renderPost
} from "./home.js";


/*
 * =========================================================
 * MARKET CONNECTION
 * =========================================================
 *
 * Profile depends on Market for:
 *
 * 1. Detecting whether the user has a Market Account.
 * 2. Creating a Market Account.
 * 3. Opening listing details.
 *
 * Market owns the actual seller/listing management logic.
 */

import {
  hasMarketAccount,
  showMarketAccountModal,
  showListingDetails
} from "./market.js";


/* =========================================================
   PROFILE
   ========================================================= */

export function renderProfile(
  renderApp
) {

  const p =
    state.profile || {};


  const name =
    p.displayName ||
    p.username ||
    "User";


  const savedCount =
    state.posts.filter(
      post =>
        Array.isArray(
          post.savedBy
        ) &&
        post.savedBy.includes(
          state.user?.uid
        )
    ).length;


  const marketAccount =
    p.marketAccount || {};


  const marketActive =
    hasMarketAccount();


  const ownListings =
    (state.listings || [])
      .filter(
        listing =>
          listing.uid ===
          state.user?.uid
      );


  return `

    <div class="page">


      <!-- =================================================
           PROFILE HERO
           ================================================= -->

      <section class="hero">

        <div class="profile-row">

          <div
            class="avatar avatar-lg"
            style="
              background:rgba(255,255,255,.18);
              color:#fff;
            "
          >
            ${escapeHtml(
              initials(name)
            )}
          </div>


          <div>

            <h1 style="margin:0">
              ${escapeHtml(name)}
            </h1>


            <p>
              @${escapeHtml(
                p.username ||
                "user"
              )}
            </p>

          </div>

        </div>

      </section>


      <!-- =================================================
           PROFILE STATS
           ================================================= -->

      <div class="grid grid3">

        <div class="stat">

          <span class="small">
            Posts
          </span>


          <strong>
            ${
              state.posts.filter(
                post =>
                  post.uid ===
                  state.user?.uid
              ).length
            }
          </strong>

        </div>


        <div class="stat">

          <span class="small">
            Saved
          </span>


          <strong>
            ${savedCount}
          </strong>

        </div>


        <div class="stat">

          <span class="small">
            Country
          </span>


          <strong>

            ${
              countries.find(
                country =>
                  country[0] ===
                  p.country
              )?.[1] ||
              "—"
            }

          </strong>

        </div>

      </div>


      <!-- =================================================
           PROFILE INFORMATION
           ================================================= -->

      <div class="section-title">

        <h2>
          Profile
        </h2>

      </div>


      <div class="card">

        <div class="profile-row">

          <div class="avatar avatar-lg">

            ${escapeHtml(
              initials(name)
            )}

          </div>


          <div class="profile-meta">

            <strong>
              ${escapeHtml(name)}
            </strong>


            <span class="small">
              @${escapeHtml(
                p.username ||
                "user"
              )}
            </span>


            <span class="small">
              ${escapeHtml(
                p.email ||
                ""
              )}
            </span>

          </div>

        </div>


        ${
          p.bio

            ? `

              <p class="small">
                ${escapeHtml(
                  p.bio
                )}
              </p>

            `

            : `

              <p class="small">
                You haven't added
                a bio yet.
              </p>

            `
        }

      </div>


      <!-- =================================================
           MARVEL MARKET
           ================================================= -->

      <div class="section-title">

        <h2>
          Marvel Market 🛍️
        </h2>

      </div>


      <div class="card">

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

            <strong>

              ${
                marketActive

                  ? escapeHtml(
                      marketAccount.storeName ||
                      p.displayName ||
                      p.username ||
                      "Market Seller"
                    )

                  : "No Market Account"
              }

            </strong>


            <p
              class="small"
              style="margin:5px 0 0;"
            >

              ${
                marketActive

                  ? "Your Market Account is active."

                  : "Create a Market Account to start selling."
              }

            </p>

          </div>


          <span
            class="badge"
            style="
              ${
                marketActive
                  ? "background:var(--primary);color:#fff;"
                  : "background:var(--surface2);"
              }
            "
          >

            ${
              marketActive
                ? "Seller"
                : "Buyer"
            }

          </span>

        </div>


        <div
          class="grid ${
            marketActive
              ? "grid2"
              : ""
          }"
          style="margin-top:12px;"
        >

          <!-- ============================================
               CREATE MARKET ACCOUNT
               ============================================ -->

          ${
            !marketActive
              ? `

                <button
                  class="btn btn-primary"
                  id="marketAccountBtn"
                  type="button"
                >
                  🏪 Create Market Account
                </button>

              `
              : ""
          }


          <!-- ============================================
               MY LISTINGS
               ============================================ -->

          ${
            marketActive
              ? `

                <button
                  class="btn btn-ghost"
                  id="myListingsBtn"
                  type="button"
                >

                  📋 My Listings

                  ${
                    ownListings.length
                      ? `(${ownListings.length})`
                      : ""
                  }

                </button>

              `
              : ""
          }

        </div>

      </div>


      <!-- =================================================
           ACCOUNT
           ================================================= -->

      <div class="section-title">

        <h2>
          Account
        </h2>

      </div>


      <div class="grid">

        <button
          class="btn btn-ghost"
          id="editProfileBtn"
          type="button"
        >
          ✏️ Edit profile
        </button>


        <button
          class="btn btn-ghost"
          id="savedBtn"
          type="button"
        >
          🔖 Saved posts
        </button>


        <button
          class="btn btn-ghost"
          id="settingsBtn"
          type="button"
        >
          ⚙️ Settings & About
        </button>


        <button
          class="btn btn-danger"
          id="logoutBtn"
          type="button"
        >
          🚪 Sign out
        </button>

      </div>

    </div>

  `;
}


/* =========================================================
   EDIT PROFILE
   ========================================================= */

export function showEditProfile(
  renderApp
) {

  const p =
    state.profile || {};


  showModal(

    "Edit profile",

    `

      <div class="field">

        <label>
          Display name
        </label>


        <input
          class="input"
          id="editDisplayName"
          value="${escapeHtml(
            p.displayName ||
            ""
          )}"
        >

      </div>


      <div class="field">

        <label>
          Username
        </label>


        <input
          class="input"
          id="editUsername"
          value="${escapeHtml(
            p.username ||
            ""
          )}"
        >

      </div>


      <div class="field">

        <label>
          Bio
        </label>


        <textarea
          class="textarea"
          id="editBio"
          maxlength="300"
          placeholder="Tell the community about yourself…"
        >${escapeHtml(
          p.bio ||
          ""
        )}</textarea>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="saveProfile"
        type="button"
      >
        Save changes
      </button>

    `
  );


  document
    .getElementById(
      "saveProfile"
    )
    ?.addEventListener(
      "click",
      async () => {

        const displayName =
          document
            .getElementById(
              "editDisplayName"
            )
            ?.value
            .trim() || "";


        const username =
          document
            .getElementById(
              "editUsername"
            )
            ?.value
            .trim() || "";


        const bio =
          document
            .getElementById(
              "editBio"
            )
            ?.value
            .trim() || "";


        if (!username) {

          toast(
            "Username cannot be empty."
          );

          return;
        }


        try {

          await updateDoc(
            doc(
              db,
              "users",
              state.user.uid
            ),
            {
              displayName,
              username,
              bio
            }
          );


          await updateProfile(
            state.user,
            {
              displayName
            }
          );


          state.profile = {

            ...state.profile,

            displayName,

            username,

            bio

          };


          closeModal();


          toast(
            "Profile updated ✨"
          );


          renderApp?.();

        } catch (error) {

          console.error(
            "[Profile] Update error:",
            error
          );


          toast(
            friendly(error)
          );
        }

      }
    );
}


/* =========================================================
   MY LISTINGS
   ========================================================= */

/*
 * IMPORTANT:
 *
 * This function is VIEW-ONLY from Profile.
 *
 * It does NOT create, edit, delete, or mark listings.
 *
 * Those actions remain inside Market.
 */

async function showMyListings(
  renderApp
) {

  if (!state.user) {

    toast(
      "Please sign in first."
    );

    return;
  }


  const button =
    document.getElementById(
      "myListingsBtn"
    );


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Loading listings…";
  }


  try {

    /*
     * One explicit read when the user opens
     * My Listings.
     */

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "listings"
          ),

          where(
            "uid",
            "==",
            state.user.uid
          ),

          limit(50)
        )
      );


    const listings =
      snapshot.docs.map(
        listingDoc => ({

          id:
            listingDoc.id,

          ...listingDoc.data()

        })
      );


    /*
     * Replace only this user's listing portion
     * of local state.
     */

    const otherListings =
      (state.listings || [])
        .filter(
          listing =>
            listing.uid !==
            state.user.uid
        );


    state.listings = [

      ...listings,

      ...otherListings

    ];


    showProfileListingsModal(
      renderApp
    );

  } catch (error) {

    console.error(
      "[Profile] My listings error:",
      error
    );


    toast(
      friendly(error)
    );

  } finally {

    if (button) {

      button.disabled =
        false;

      button.innerHTML =
        "📋 My Listings";
    }
  }
}


/* =========================================================
   MY LISTINGS MODAL
   ========================================================= */

function showProfileListingsModal(
  renderApp
) {

  const listings =
    (state.listings || [])
      .filter(
        listing =>
          listing.uid ===
          state.user?.uid
      );


  showModal(

    "My Listings",

    listings.length

      ? `

        <div
          style="
            display:flex;
            flex-direction:column;
            gap:8px;
          "
        >

          ${
            listings
              .map(
                listing => `

                  <button
                    type="button"
                    class="list-item"
                    data-profile-listing="${escapeHtml(
                      listing.id
                    )}"
                    style="
                      width:100%;
                      border:0;
                      text-align:left;
                      cursor:pointer;
                      background:var(--surface);
                    "
                  >

                    <div
                      style="
                        display:flex;
                        justify-content:space-between;
                        gap:10px;
                        align-items:flex-start;
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
                            overflow-wrap:anywhere;
                          "
                        >
                          ${escapeHtml(
                            listing.title ||
                            "Untitled listing"
                          )}
                        </strong>


                        <span class="small">

                          ${
                            listing.status ===
                            "sold"

                              ? "🏷️ Sold"

                              : "🟢 Active"
                          }

                          ·

                          ${escapeHtml(
                            listing.category ||
                            "Other"
                          )}

                        </span>

                      </div>


                      <strong
                        style="
                          color:var(--primary);
                          white-space:nowrap;
                        "
                      >
                        ₦${Number(
                          listing.price ||
                          0
                        ).toLocaleString()}
                      </strong>

                    </div>

                  </button>

                `
              )
              .join("")
          }

        </div>


        <div
          class="notice"
          style="margin-top:12px;"
        >
          💡 To edit, mark as sold,
          reactivate, or delete a listing,
          open it from Marvel Market.
        </div>

      `

      : `

        <div
          class="empty"
          style="
            text-align:center;
            padding:20px 8px;
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
            No listings yet
          </h3>


          <p class="small">
            Open Marvel Market to
            create your first listing.
          </p>

        </div>

      `
  );


  /*
   * Profile listing view is deliberately
   * connected to Market's details function.
   *
   * Market controls all seller actions.
   */

  document
    .querySelectorAll(
      "[data-profile-listing]"
    )
    .forEach(
      item => {

        item.addEventListener(
          "click",
          () => {

            const listingId =
              item.dataset
                .profileListing;


            closeModal();


            showListingDetails(
              listingId,
              renderApp
            );

          }
        );

      }
    );
}


/* =========================================================
   SAVED POSTS
   ========================================================= */

export function showSaved() {

  const saved =
    state.posts.filter(
      post =>
        Array.isArray(
          post.savedBy
        ) &&
        post.savedBy.includes(
          state.user?.uid
        )
    );


  showModal(

    "Saved posts",

    saved.length

      ? saved
          .map(renderPost)
          .join("")

      : `

        <div class="empty">

          <div
            style="
              font-size:40px;
            "
          >
            🔖
          </div>


          <p>
            You have no saved posts yet.
          </p>

        </div>

      `
  );
}


/* =========================================================
   PROFILE EVENTS
   ========================================================= */

export function attachProfileEvents(
  renderApp
) {

  /* =======================================================
     EDIT PROFILE
     ======================================================= */

  document
    .getElementById(
      "editProfileBtn"
    )
    ?.addEventListener(
      "click",
      () =>
        showEditProfile(
          renderApp
        )
    );


  /* =======================================================
     SAVED POSTS
     ======================================================= */

  document
    .getElementById(
      "savedBtn"
    )
    ?.addEventListener(
      "click",
      showSaved
    );


  /* =======================================================
     CREATE MARKET ACCOUNT
     ======================================================= */

  document
    .getElementById(
      "marketAccountBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        /*
         * This button exists only when the user
         * does not already have a Market Account.
         */

        showMarketAccountModal(
          renderApp
        );

      }
    );


  /* =======================================================
     MY LISTINGS
     ======================================================= */

  document
    .getElementById(
      "myListingsBtn"
    )
    ?.addEventListener(
      "click",
      () =>
        showMyListings(
          renderApp
        )
    );


  /* =======================================================
     SETTINGS
     =======================================================
     
     app.js owns Settings & About.
     We intentionally do not duplicate
     the Settings event here.
     ======================================================= */


  /* =======================================================
     SIGN OUT
     ======================================================= */

  document
    .getElementById(
      "logoutBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        try {

          await signOut();

        } catch (error) {

          console.error(
            "[Profile] Sign out error:",
            error
          );


          toast(
            friendly(error)
          );
        }

      }
    );
}
