/* =========================================================
   MARVEL CHAT V2 — PROFILE
   ========================================================= */

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
  getDoc,
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

import {
  hasMarketAccount,
  showMarketAccountModal
} from "./market.js";

import {
  hasTimeTrustAccount,
  showTimeTrustAccountModal
} from "./timetrust.js";


/* =========================================================
   PROFILE STATE
   =========================================================

   IMPORTANT — SAVED POST COUNT ARCHITECTURE (updated):

   The Profile page no longer reads the
   users/{uid}/savedPosts subcollection at all.

   The saved-post count now lives directly on the user's
   own profile document:

     users/{uid}
         savedPostCount: number

   That document is already loaded into state.profile by
   the rest of the app (sign-in / profile load), so
   displaying the count costs ZERO additional Firestore
   reads in the common case — we just read
   state.profile.savedPostCount.

   NOTE FOR THE SAVE/UNSAVE IMPLEMENTATION (in Home.js,
   which is out of scope for this change):

   Whatever code currently writes to
   users/{uid}/savedPosts/{postId} on save/unsave should
   ALSO atomically increment/decrement
   users/{uid}.savedPostCount, e.g.:

     await updateDoc(doc(db, "users", uid), {
       savedPostCount: increment(1)   // on save
     });

     await updateDoc(doc(db, "users", uid), {
       savedPostCount: increment(-1)  // on unsave
     });

   savedPostCount must never be allowed to go negative;
   Home.js should guard against decrementing below 0
   (e.g. only decrement if a locally-known saved state was
   true, or clamp with a transaction).
   ========================================================= */

let profileSavedCountRefreshing = false;


/* =========================================================
   HELPERS
   ========================================================= */

function getCurrentUser() {
  return state.user || null;
}


function getCurrentUid() {
  return getCurrentUser()?.uid || "";
}


function getProfile() {
  return state.profile || {};
}


function getDisplayName(profile = getProfile()) {
  return (
    profile.displayName ||
    profile.username ||
    getCurrentUser()?.displayName ||
    "Marvel User"
  );
}


function getUsername(profile = getProfile()) {
  return (
    profile.username ||
    profile.displayName ||
    getCurrentUser()?.displayName ||
    "User"
  );
}


function getCountry(profile = getProfile()) {
  return (
    profile.country ||
    "Not set"
  );
}


function getProfileInitials(profile = getProfile()) {
  return initials(
    getDisplayName(profile)
  );
}


/* =========================================================
   POSTS COUNT
   ========================================================= */

function getMyPostCount() {
  const uid = getCurrentUid();

  if (!uid) {
    return 0;
  }

  const posts =
    Array.isArray(state.posts)
      ? state.posts
      : [];

  return posts.filter(
    post =>
      String(post?.uid || "") ===
      String(uid)
  ).length;
}


/* =========================================================
   SAVED POSTS COUNT
   =========================================================

   Reads ONLY the already-loaded profile field. No
   Firestore reads happen here.
   ========================================================= */

function getSavedPostCount() {
  const profile = getProfile();

  const count = profile.savedPostCount;

  if (
    typeof count === "number" &&
    Number.isFinite(count)
  ) {
    return Math.max(0, count);
  }

  return 0;
}


/* =========================================================
   EDIT PROFILE MODAL
   ========================================================= */

function showEditProfile(
  renderApp
) {
  const profile =
    getProfile();

  const currentName =
    profile.displayName ||
    getCurrentUser()?.displayName ||
    "";

  const currentCountry =
    profile.country ||
    "";

  const currentUsername =
    profile.username ||
    "";

  const countryOptions =
    Array.isArray(countries)
      ? countries
      : [];

  showModal(
    "Edit Profile",
    `
      <div
        style="
          display:flex;
          flex-direction:column;
          gap:14px;
        "
      >

        <div class="field">
          <label>
            Display name
          </label>

          <input
            class="input"
            id="profileDisplayName"
            maxlength="80"
            value="${escapeHtml(
              currentName
            )}"
            placeholder="Your display name"
            autocomplete="name"
          >
        </div>


        <div class="field">
          <label>
            Username
          </label>

          <input
            class="input"
            id="profileUsername"
            maxlength="40"
            value="${escapeHtml(
              currentUsername
            )}"
            placeholder="Your username"
            autocomplete="off"
          >
        </div>


        <div class="field">
          <label>
            Country
          </label>

          <select
            class="input"
            id="profileCountry"
          >
            <option value="">
              Select country
            </option>

            ${
              countryOptions
                .map(
                  country => `
                    <option
                      value="${escapeHtml(
                        String(country)
                      )}"
                      ${
                        String(
                          country
                        ) ===
                        String(
                          currentCountry
                        )
                          ? "selected"
                          : ""
                      }
                    >
                      ${escapeHtml(
                        String(country)
                      )}
                    </option>
                  `
                )
                .join("")
            }
          </select>
        </div>


        <button
          class="btn btn-primary btn-block"
          id="saveProfileBtn"
          type="button"
        >
          Save Profile
        </button>

      </div>
    `
  );


  document
    .getElementById(
      "saveProfileBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        const nameInput =
          document.getElementById(
            "profileDisplayName"
          );

        const usernameInput =
          document.getElementById(
            "profileUsername"
          );

        const countryInput =
          document.getElementById(
            "profileCountry"
          );

        const displayName =
          nameInput
            ?.value
            ?.trim() ||
          "";

        const username =
          usernameInput
            ?.value
            ?.trim() ||
          "";

        const country =
          countryInput
            ?.value
            ?.trim() ||
          "";

        if (!displayName) {
          toast(
            "Enter your display name."
          );

          nameInput?.focus();

          return;
        }

        if (
          displayName.length >
          80
        ) {
          toast(
            "Display name must be 80 characters or less."
          );

          nameInput?.focus();

          return;
        }

        if (
          username.length >
          40
        ) {
          toast(
            "Username must be 40 characters or less."
          );

          usernameInput?.focus();

          return;
        }

        const button =
          document.getElementById(
            "saveProfileBtn"
          );

        if (!button) {
          return;
        }

        button.disabled =
          true;

        button.textContent =
          "Saving...";


        try {
          const user =
            getCurrentUser();

          if (!user) {
            throw new Error(
              "Please sign in first."
            );
          }


          /*
           * Keep Firebase Authentication displayName
           * synchronized with the Firestore profile.
           */
          await updateProfile(
            user,
            {
              displayName
            }
          );


          await updateDoc(
            doc(
              db,
              "users",
              user.uid
            ),
            {
              displayName,
              username,
              country
            }
          );


          state.profile = {
            ...state.profile,
            displayName,
            username,
            country
          };


          /*
           * Keep the local auth user reference current
           * when the object is mutable in the current
           * Firebase implementation.
           */
          try {
            user.displayName =
              displayName;
          } catch (_) {
            /* no-op */
          }


          closeModal();

          toast(
            "Profile updated successfully."
          );


          if (
            typeof renderApp ===
            "function"
          ) {
            renderApp();
          }

        } catch (error) {
          console.error(
            "[Profile] Profile update failed:",
            error
          );

          toast(
            friendly(error)
          );

          button.disabled =
            false;

          button.textContent =
            "Save Profile";
        }
      }
    );
}


/* =========================================================
   SETTINGS & ABOUT
   ========================================================= */

function showSettingsAbout() {
  showModal(
    "Settings & About",
    `
      <div
        style="
          display:flex;
          flex-direction:column;
          gap:14px;
        "
      >

        <div
          class="card"
          style="
            margin:0;
            padding:16px;
          "
        >
          <strong>
            Marvel Chat
          </strong>

          <p
            class="small"
            style="
              margin:
                6px 0 0;
            "
          >
            Your community universe for
            conversations, TimeTrust and
            Marvel Market.
          </p>
        </div>


        <div
          class="card"
          style="
            margin:0;
            padding:16px;
          "
        >
          <strong>
            Account
          </strong>

          <p
            class="small"
            style="
              margin:
                6px 0 0;
            "
          >
            Manage your profile, TimeTrust
            account and Marvel Market account
            from your Profile page.
          </p>
        </div>

      </div>
    `
  );
}


/* =========================================================
   SIGN OUT
   ========================================================= */

async function handleSignOut(
  renderApp
) {
  try {
    await signOut();

    if (
      typeof renderApp ===
      "function"
    ) {
      renderApp();
    }

  } catch (error) {
    console.error(
      "[Profile] Sign out failed:",
      error
    );

    toast(
      friendly(error)
    );
  }
}


/* =========================================================
   PROFILE PAGE
   ========================================================= */

export function renderProfile(
  renderApp
) {
  const user =
    getCurrentUser();

  if (!user) {
    return `
      <div
        class="page"
        id="profilePage"
      >

        <div
          class="card"
          style="
            text-align:center;
            padding:32px 20px;
          "
        >

          <div
            style="
              font-size:42px;
              margin-bottom:10px;
            "
          >
            👤
          </div>

          <h2>
            Sign in to view your profile
          </h2>

        </div>

      </div>
    `;
  }


  const profile =
    getProfile();

  const displayName =
    getDisplayName(
      profile
    );

  const username =
    getUsername(
      profile
    );

  const country =
    getCountry(
      profile
    );

  const postCount =
    getMyPostCount();

  const savedPostCount =
    getSavedPostCount();


  const timeTrustActive =
    hasTimeTrustAccount();


  const marketActive =
    hasMarketAccount();


  /*
   * NOTE:
   *
   * There is intentionally NO Firestore read triggered
   * here. savedPostCount comes straight from the profile
   * document already held in state.profile.
   *
   * The Profile page ALSO intentionally does not expose:
   *   - a Saved Posts list/viewer
   *   - a My Posts list/viewer
   *   - a My Listings list/viewer
   *
   * Only the numeric counts are shown.
   */


  return `
    <div
      class="page"
      id="profilePage"
    >

      <!-- =================================================
           PROFILE HEADER
           ================================================= -->

      <section
        class="card"
        style="
          margin-bottom:14px;
          padding:20px;
        "
      >

        <div
          style="
            display:flex;
            align-items:center;
            gap:14px;
          "
        >

          <div
            class="avatar"
            style="
              width:64px;
              height:64px;
              min-width:64px;
              font-size:22px;
              display:flex;
              align-items:center;
              justify-content:center;
            "
          >
            ${escapeHtml(
              getProfileInitials(
                profile
              )
            )}
          </div>


          <div
            style="
              min-width:0;
              flex:1;
            "
          >

            <h2
              style="
                margin:
                  0 0 4px;
                overflow-wrap:anywhere;
              "
            >
              ${escapeHtml(
                displayName
              )}
            </h2>


            <p
              class="small"
              style="
                margin:0;
                overflow-wrap:anywhere;
              "
            >
              @${escapeHtml(
                username
              )}
            </p>

          </div>

        </div>


        <!-- =================================================
             PROFILE COUNTS
             ================================================= -->

        <div
          style="
            display:grid;
            grid-template-columns:
              repeat(3, 1fr);
            gap:8px;
            margin-top:18px;
          "
        >

          <div
            class="card"
            style="
              margin:0;
              padding:13px 8px;
              text-align:center;
              box-shadow:none;
            "
          >

            <strong
              style="
                display:block;
                font-size:20px;
                line-height:1.1;
              "
            >
              ${escapeHtml(
                String(
                  postCount
                )
              )}
            </strong>

            <span
              class="small"
            >
              Posts
            </span>

          </div>


          <div
            class="card"
            style="
              margin:0;
              padding:13px 8px;
              text-align:center;
              box-shadow:none;
            "
          >

            <strong
              style="
                display:block;
                font-size:20px;
                line-height:1.1;
              "
            >
              ${escapeHtml(
                String(
                  savedPostCount
                )
              )}
            </strong>

            <span
              class="small"
            >
              Saved
            </span>

          </div>


          <div
            class="card"
            style="
              margin:0;
              padding:13px 8px;
              text-align:center;
              box-shadow:none;
            "
          >

            <strong
              style="
                display:block;
                font-size:20px;
                line-height:1.1;
              "
            >
              🌍
            </strong>

            <span
              class="small"
              style="
                display:block;
                overflow:hidden;
                text-overflow:ellipsis;
                white-space:nowrap;
              "
              title="${escapeHtml(
                country
              )}"
            >
              ${escapeHtml(
                country
              )}
            </span>

          </div>

        </div>

      </section>


      <!-- =================================================
           PROFILE ACTIONS
           ================================================= -->

      <section
        class="card"
        style="
          margin-bottom:14px;
        "
      >

        <h3
          style="
            margin:
              0 0 12px;
          "
        >
          Profile
        </h3>


        <div
          style="
            display:flex;
            flex-direction:column;
            gap:9px;
          "
        >

          <button
            class="btn btn-primary btn-block"
            id="editProfileBtn"
            type="button"
          >
            ✏️ Edit Profile
          </button>


          <button
            class="btn btn-ghost btn-block"
            id="settingsAboutBtn"
            type="button"
          >
            ⚙️ Settings & About
          </button>

        </div>

      </section>


      <!-- =================================================
           TIMETRUST ACCOUNT
           ================================================= -->

      <section
        class="card"
        style="
          margin-bottom:14px;
        "
      >

        <div
          style="
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:12px;
          "
        >

          <div
            style="
              min-width:0;
              flex:1;
            "
          >

            <div
              style="
                font-size:28px;
                margin-bottom:6px;
              "
            >
              ⏱️
            </div>

            <h3
              style="
                margin:
                  0 0 5px;
              "
            >
              TimeTrust
            </h3>

            <p
              class="small"
              style="
                margin:0;
              "
            >
              ${
                timeTrustActive
                  ? "Your TimeTrust account is active. Manage your account whenever you need."
                  : "Create your TimeTrust account to manage your skills and time-based exchanges."
              }
            </p>

          </div>

        </div>


        <button
          class="
            btn
            ${
              timeTrustActive
                ? "btn-ghost"
                : "btn-primary"
            }
            btn-block
          "
          id="timeTrustAccountBtn"
          type="button"
          style="
            margin-top:14px;
          "
        >
          ${
            timeTrustActive
              ? "⚙️ Manage TimeTrust Account"
              : "⏱️ Activate TimeTrust Account"
          }
        </button>

      </section>


      <!-- =================================================
           MARVEL MARKET ACCOUNT
           ================================================= -->

      <section
        class="card"
        style="
          margin-bottom:14px;
        "
      >

        <div
          style="
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:12px;
          "
        >

          <div
            style="
              min-width:0;
              flex:1;
            "
          >

            <div
              style="
                font-size:28px;
                margin-bottom:6px;
              "
            >
              🛍️
            </div>

            <h3
              style="
                margin:
                  0 0 5px;
              "
            >
              Marvel Market
            </h3>

            <p
              class="small"
              style="
                margin:0;
              "
            >
              ${
                marketActive
                  ? "Your Marvel Market account is active. Manage your shop account here."
                  : "Create a Marvel Market account before selling products or services."
              }
            </p>

          </div>

        </div>


        <button
          class="
            btn
            ${
              marketActive
                ? "btn-ghost"
                : "btn-primary"
            }
            btn-block
          "
          id="marketAccountBtn"
          type="button"
          style="
            margin-top:14px;
          "
        >
          ${
            marketActive
              ? "⚙️ Manage Market Account"
              : "🏪 Create Market Account"
          }
        </button>

      </section>


      <!-- =================================================
           ACCOUNT
           ================================================= -->

      <section
        class="card"
        style="
          margin-bottom:14px;
        "
      >

        <h3
          style="
            margin:
              0 0 12px;
          "
        >
          Account
        </h3>


        <button
          class="btn btn-danger btn-block"
          id="profileSignOutBtn"
          type="button"
        >
          🚪 Sign Out
        </button>

      </section>

    </div>
  `;
}


/* =========================================================
   PROFILE EVENTS
   ========================================================= */

export function attachProfileEvents(
  renderApp
) {
  const page =
    document.getElementById(
      "profilePage"
    );

  if (!page) {
    return;
  }


  /* ---------------------------------------------------------
     EDIT PROFILE
     --------------------------------------------------------- */

  page
    .querySelector(
      "#editProfileBtn"
    )
    ?.addEventListener(
      "click",
      () => {
        showEditProfile(
          renderApp
        );
      }
    );


  /* ---------------------------------------------------------
     SETTINGS & ABOUT
     --------------------------------------------------------- */

  page
    .querySelector(
      "#settingsAboutBtn"
    )
    ?.addEventListener(
      "click",
      () => {
        showSettingsAbout();
      }
    );


  /* ---------------------------------------------------------
     TIMETRUST ACCOUNT
     --------------------------------------------------------- */

  page
    .querySelector(
      "#timeTrustAccountBtn"
    )
    ?.addEventListener(
      "click",
      () => {
        showTimeTrustAccountModal(
          renderApp
        );
      }
    );


  /* ---------------------------------------------------------
     MARVEL MARKET ACCOUNT
     --------------------------------------------------------- */

  page
    .querySelector(
      "#marketAccountBtn"
    )
    ?.addEventListener(
      "click",
      () => {
        showMarketAccountModal(
          renderApp
        );
      }
    );


  /* ---------------------------------------------------------
     SIGN OUT
     --------------------------------------------------------- */

  page
    .querySelector(
      "#profileSignOutBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        const confirmed =
          window.confirm(
            "Are you sure you want to sign out?"
          );

        if (!confirmed) {
          return;
        }

        await handleSignOut(
          renderApp
        );
      }
    );
}


/* =========================================================
   OPTIONAL PROFILE REFRESH
   =========================================================

   Other modules (e.g. Home.js, after a save/unsave write)
   can call this to force a single fresh read of the user's
   OWN profile document (not the savedPosts subcollection)
   and re-render Profile with the up-to-date count.

   This is a single-document getDoc — never a subcollection
   scan — and is only needed if the rest of the app does not
   already keep state.profile in sync via a live listener.
   ========================================================= */

export async function refreshProfileSavedPostCount(
  renderApp
) {
  const uid =
    getCurrentUid();

  if (!uid) {
    return;
  }

  if (profileSavedCountRefreshing) {
    return;
  }

  profileSavedCountRefreshing = true;

  try {
    const snap =
      await getDoc(
        doc(
          db,
          "users",
          uid
        )
      );

    if (snap.exists()) {
      state.profile = {
        ...state.profile,
        ...snap.data()
      };
    }

    if (
      typeof renderApp ===
      "function"
    ) {
      renderApp();
    }
  } catch (error) {
    console.warn(
      "[Profile] Could not refresh saved post count:",
      error
    );
  } finally {
    profileSavedCountRefreshing = false;
  }
}
