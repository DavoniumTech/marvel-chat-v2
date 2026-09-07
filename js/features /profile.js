import {
  state,
  countries,
  escapeHtml,
  initials,
  friendly
} from "../state.js";

import {
  db,
  doc,
  updateDoc
} from "../firebase/firestore.js";

import {
  updateProfile,
  signOut
} from "../firebase/auth.js";

import {
  showModal,
  closeModal
} from "../components/modal.js";

import { toast } from "../components/toast.js";

import { renderPost } from "./home.js";

import {
  hasMarketAccount,
  showMarketAccountModal
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
      x =>
        Array.isArray(
          x.savedBy
        ) &&
        x.savedBy.includes(
          state.user.uid
        )
    ).length;


  const marketAccount =
    p.marketAccount || {};

  const marketActive =
    hasMarketAccount();


  const myListingsCount =
    (state.listings || []).filter(
      x =>
        x.uid ===
        state.user?.uid
    ).length;


  return `
    <div class="page">

      <!-- PROFILE HERO -->

      <section class="hero">

        <div class="profile-row">

          <div
            class="avatar avatar-lg"
            style="
              background:
                rgba(255,255,255,.18);
              color:#fff;
            "
          >
            ${escapeHtml(
              initials(name)
            )}
          </div>

          <div>

            <h1
              style="margin:0"
            >
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


      <!-- PROFILE STATS -->

      <div class="grid grid3">

        <div class="stat">
          <span class="small">
          My Posts
          </span>

          <strong>
            ${
              state.posts.filter(
                x =>
                  x.uid ===
                  state.user.uid
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
                x =>
                  x[0] ===
                  p.country
              )?.[0] ||
              "—"
            }
          </strong>
        </div>

      </div>


      <!-- PROFILE -->

      <div class="section-title">

        <h2>
          Profile
        </h2>

      </div>


      <div class="card">

        <div class="profile-row">

          <div
            class="avatar avatar-lg"
          >
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
                p.email || ""
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


      <!-- MARKET ACCOUNT -->

      <div class="section-title">

        <h2>
          Market 🛍️
        </h2>

      </div>


      <div class="card">

        ${
          marketActive
            ? `
              <div
                class="profile-row"
                style="
                  align-items:flex-start;
                  justify-content:
                    space-between;
                  gap:12px;
                "
              >

                <div
                  style="
                    display:flex;
                    gap:10px;
                    align-items:
                      flex-start;
                    flex:1;
                  "
                >

                  <div
                    class="avatar"
                    style="
                      font-size:18px;
                    "
                  >
                    🛍️
                  </div>

                  <div
                    class="profile-meta"
                  >

                    <strong>
                      ${escapeHtml(
                        marketAccount.storeName ||
                        p.displayName ||
                        p.username ||
                        "Market Seller"
                      )}
                    </strong>

                    <span
                      class="small"
                    >
                      Market Account
                      active
                    </span>

                    ${
                      marketAccount
                        .bio
                        ? `
                          <span
                            class="small"
                          >
                            ${escapeHtml(
                              marketAccount
                                .bio
                            )}
                          </span>
                        `
                        : ""
                    }

                  </div>

                </div>


                <button
                  class="btn btn-ghost"
                  id="marketAccountBtn"
                  style="
                    font-size:13px;
                  "
                >
                  Manage
                </button>

              </div>


              <div
                style="
                  display:flex;
                  gap:8px;
                  margin-top:12px;
                  flex-wrap:wrap;
                "
              >

                <button
                  class="btn btn-secondary"
                  id="profileMyListingsBtn"
                  style="flex:1;"
                >
                  🛍️ My Listings
                  (${myListingsCount})
                </button>

                <button
                  class="btn btn-ghost"
                  id="profileMarketBtn"
                  style="flex:1;"
                >
                  Explore Market
                </button>

              </div>
            `
            : `
              <div
                style="
                  display:flex;
                  gap:12px;
                  align-items:
                    flex-start;
                "
              >

                <div
                  class="avatar"
                  style="
                    font-size:18px;
                  "
                >
                  🛍️
                </div>

                <div
                  class="profile-meta"
                  style="flex:1;"
                >

                  <strong>
                    Sell on Marvel Market
                  </strong>

                  <span
                    class="small"
                  >
                    Create a Market
                    Account to list
                    products or services.
                  </span>

                </div>

              </div>


              <button
                class="btn btn-primary btn-block"
                id="createMarketAccountProfileBtn"
                style="
                  margin-top:12px;
                "
              >
                Create Market Account
                🛍️
              </button>


              <button
                class="btn btn-ghost btn-block"
                id="profileMarketBtn"
                style="
                  margin-top:8px;
                "
              >
                Explore Market
              </button>
            `
        }

      </div>


      <!-- ACCOUNT -->

      <div class="section-title">

        <h2>
          Account
        </h2>

      </div>


      <div class="grid">

        <button
          class="btn btn-ghost"
          id="editProfileBtn"
        >
          ✏️ Edit profile
        </button>

        <button
          class="btn btn-ghost"
          id="savedBtn"
        >
          🔖 Saved posts
        </button>

        <button
          class="btn btn-ghost"
          id="settingsBtn"
        >
          ⚙️ Settings & About
        </button>

        <button
          class="btn btn-danger"
          id="logoutBtn"
        >
          🚪 Sign out
        </button>

      </div>

    </div>
  `;
}


/* =========================================================
   PROFILE EVENTS
   ========================================================= */

export function attachProfileEvents(
  renderApp
) {

  document
    .getElementById(
      "marketAccountBtn"
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
      "createMarketAccountProfileBtn"
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
      "profileMarketBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        /*
         * The existing router/app navigation should
         * handle the Market page through the normal
         * application navigation.
         *
         * We dispatch a navigation event rather than
         * rebuilding the router here.
         */
        window.dispatchEvent(
          new CustomEvent(
            "marvel-navigate",
            {
              detail: {
                page: "market"
              }
            }
          )
        );
      }
    );


  document
    .getElementById(
      "profileMyListingsBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        window.dispatchEvent(
          new CustomEvent(
            "marvel-navigate",
            {
              detail: {
                page: "market",
                marketTab: "mine"
              }
            }
          )
        );
      }
    );


  document
    .getElementById(
      "editProfileBtn"
    )
    ?.addEventListener(
      "click",
      () => {
        showEditProfile(
          renderApp
        );
      }
    );


  document
    .getElementById(
      "savedBtn"
    )
    ?.addEventListener(
      "click",
      () => {
        showSaved();
      }
    );


  document
    .getElementById(
      "settingsBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        window.dispatchEvent(
          new CustomEvent(
            "marvel-navigate",
            {
              detail: {
                page: "settings"
              }
            }
          )
        );
      }
    );


  document
    .getElementById(
      "logoutBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        try {
          await signOut();

        } catch (e) {
          toast(
            friendly(e)
          );
        }
      }
    );
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
          p.bio || ""
        )}</textarea>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="saveProfile"
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
            .value.trim();

        const username =
          document
            .getElementById(
              "editUsername"
            )
            .value.trim();

        const bio =
          document
            .getElementById(
              "editBio"
            )
            .value.trim();


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

          renderApp();

        } catch (e) {

          toast(
            friendly(e)
          );
        }
      }
    );
}


/* =========================================================
   SAVED POSTS
   ========================================================= */

export function showSaved() {

  const saved =
    state.posts.filter(
      x =>
        Array.isArray(
          x.savedBy
        ) &&
        x.savedBy.includes(
          state.user.uid
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
            style="font-size:40px"
          >
            🔖
          </div>

          <p>
            You have no saved
            posts yet.
          </p>

        </div>
      `
  );
}
