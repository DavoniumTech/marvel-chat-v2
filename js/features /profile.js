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
  collection,
  doc,
  updateDoc,
  getDocs
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
   ========================================================= */

let profileSavedCountLoading = false;
let profileSavedCountLoadedFor = "";
let profileSavedCountRequestId = 0;


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
   
   IMPORTANT:
   We DO NOT load the saved post documents.
   We only count documents inside:
   
   users/{uid}/savedPosts
   
   This is one Firestore collection read and avoids
   the previous N+1 reads of posts/{postId}.
   ========================================================= */

async function loadProfileSavedPostCount(
  renderApp
) {
  const uid = getCurrentUid();

  if (!uid) {
    state.savedPostCount = 0;
    profileSavedCountLoadedFor = "";
    return;
  }

  /*
   * Do not start another request while the current one
   * is still running.
   */
  if (profileSavedCountLoading) {
    return;
  }

  /*
   * If we already loaded the count for this signed-in
   * user during the current app session, use it.
   */
  if (
    profileSavedCountLoadedFor === uid &&
    state.savedPostCount !== undefined &&
    state.savedPostCount !== null
  ) {
    return;
  }

  profileSavedCountLoading = true;

  const requestId =
    ++profileSavedCountRequestId;

  try {
    const savedPostsRef =
      collection(
        db,
        "users",
        uid,
        "savedPosts"
      );

    const snapshot =
      await getDocs(
        savedPostsRef
      );

    /*
     * Make sure a stale request cannot overwrite
     * a newer request after account changes.
     */
    if (
      requestId !==
      profileSavedCountRequestId
    ) {
      return;
    }

    state.savedPostCount =
      snapshot.size;

    profileSavedCountLoadedFor =
      uid;

    /*
     * Re-render Profile so the number appears.
     */
    if (
      typeof renderApp ===
      "function"
    ) {
      renderApp();
    }
  } catch (error) {
    console.warn(
      "[Profile] Saved post count could not be loaded:",
      error
    );

    /*
     * Do not pretend there are zero saved posts when
     * Firestore failed. Keep any existing value if one
     * already exists; otherwise show an em dash.
     */
    if (
      state.savedPostCount ===
        undefined ||
      state.savedPostCount ===
        null
    ) {
      state.savedPostCount =
        "—";
    }

    profileSavedCountLoadedFor =
      uid;

    if (
      typeof renderApp ===
      "function"
    ) {
      renderApp();
    }
  } finally {
    profileSavedCountLoading =
      false;
  }
}


/* =========================================================
   SAVED COUNT
   ========================================================= */

function getSavedPostCount() {
  if (
    state.savedPostCount !==
      undefined &&
    state.savedPostCount !==
      null
  ) {
    return state.savedPostCount;
  }

  const profile =
    getProfile();

  if (
    profile.savedPostCount !==
      undefined &&
    profile.savedPostCount !==
      null
  ) {
    return profile.savedPostCount;
  }

  return "…";
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

    /*
     * Reset the Profile saved-count cache so the
     * next signed-in account gets its own count.
     */
    profileSavedCountLoadedFor =
      "";

    state.savedPostCount =
      undefined;

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
   * Start the saved-post count read without
   * blocking the initial Profile render.
   *
   * The function is guarded so it does not
   * repeatedly read Firestore.
   */
  if (
    !profileSavedCountLoadedFor ||
    profileSavedCountLoadedFor !==
      user.uid
  ) {
    loadProfileSavedPostCount(
      renderApp
    );
  }


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
   
   Other modules can call this after saving/unsaving a post
   if they want Profile's saved count refreshed immediately.
   ========================================================= */

export function refreshProfileSavedPostCount(
  renderApp
) {
  const uid =
    getCurrentUid();

  if (!uid) {
    state.savedPostCount =
      0;

    profileSavedCountLoadedFor =
      "";

    if (
      typeof renderApp ===
      "function"
    ) {
      renderApp();
    }

    return;
  }

  /*
   * Force the next Profile render to perform
   * one fresh count read.
   */
  profileSavedCountLoadedFor =
    "";

  state.savedPostCount =
    undefined;

  loadProfileSavedPostCount(
    renderApp
  );
}
