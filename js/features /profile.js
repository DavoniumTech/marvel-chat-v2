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

import { updateProfile, signOut } from "../firebase/auth.js";

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


export function renderProfile(renderApp) {

  const profile =
    state.profile || {};

  const name =
    profile.displayName ||
    profile.username ||
    "User";

  const marketAccount =
    profile.marketAccount || {};

  const marketActive =
    hasMarketAccount();

  /*
   * IMPORTANT:
   *
   * Profile no longer loads the savedPosts subcollection.
   *
   * The Saved number shown here must come from state/profile
   * if another existing part of the application already provides it.
   *
   * We intentionally do NOT perform another Firestore read here.
   */
  const savedCount =
    state.savedPostCount !== null &&
    state.savedPostCount !== undefined
      ? state.savedPostCount
      : profile.savedPostCount !== null &&
        profile.savedPostCount !== undefined
        ? profile.savedPostCount
        : "—";


  return `
    <div class="page">

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
                profile.username ||
                "user"
              )}
            </p>

          </div>

        </div>

      </section>


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
                  profile.country
              )?.[1] ||
              "—"
            }
          </strong>
        </div>

      </div>


      <div class="section-title">
        <h2>Profile</h2>
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
                profile.username ||
                "user"
              )}
            </span>

            <span class="small">
              ${escapeHtml(
                profile.email ||
                ""
              )}
            </span>

          </div>

        </div>


        <p class="small">
          ${
            profile.bio
              ? escapeHtml(profile.bio)
              : "You haven't added a bio yet."
          }
        </p>

      </div>


      <div class="section-title">
        <h2>TimeTrust ⏱️</h2>
      </div>


      <div class="card">

        ${
          hasTimeTrustAccount()
            ? `
              <div class="profile-row">

                <div class="avatar">
                  ${escapeHtml(
                    initials(
                      profile.timeTrustAccount?.providerName ||
                      profile.timeTrustAccount?.name ||
                      name
                    )
                  )}
                </div>

                <div class="profile-meta">

                  <strong style="font-size:17px;">
                    ${escapeHtml(
                      profile.timeTrustAccount?.providerName ||
                      profile.timeTrustAccount?.name ||
                      name
                    )}
                  </strong>

                  <span class="small">
                    TimeTrust provider
                  </span>

                  ${
                    profile.timeTrustAccount?.location
                      ? `
                        <span class="small">
                          📍 ${escapeHtml(
                            profile.timeTrustAccount.location
                          )}
                        </span>
                      `
                      : ""
                  }

                </div>

              </div>


              <p class="small">
                ${escapeHtml(
                  profile.timeTrustAccount?.bio ||
                  "No TimeTrust provider description added yet."
                )}
              </p>


              <span class="badge">
                Active
              </span>
            `
            : `
              <strong>
                TimeTrust Account Not Active
              </strong>

              <p class="small">
                Browse TimeTrust freely. Activate your account to publish or manage skill offers.
              </p>

              <span class="badge">
                Inactive
              </span>
            `
        }


        <div style="margin-top:12px;">

          <button
            class="btn ${
              hasTimeTrustAccount()
                ? "btn-ghost"
                : "btn-primary"
            } btn-block"
            id="timeTrustAccountBtn"
            type="button"
          >
            ${
              hasTimeTrustAccount()
                ? "⚙️ Manage TimeTrust Account"
                : "⏱️ Activate TimeTrust Account"
            }
          </button>

        </div>

      </div>


      <div class="section-title">
        <h2>Marvel Market 🛍️</h2>
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
                      profile.displayName ||
                      profile.username ||
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
            style="${
              marketActive
                ? "background:var(--primary);color:#fff;"
                : "background:var(--surface2);"
            }"
          >
            ${
              marketActive
                ? "Seller"
                : "Buyer"
            }
          </span>

        </div>


        <div
          class="grid"
          style="margin-top:12px;"
        >

          <button
            class="btn ${
              marketActive
                ? "btn-ghost"
                : "btn-primary"
            } btn-block"
            id="marketAccountBtn"
            type="button"
          >
            ${
              marketActive
                ? "⚙️ Manage Market Account"
                : "🏪 Create Market Account"
            }
          </button>

        </div>

      </div>


      <div class="section-title">
        <h2>Account</h2>
      </div>


      <div class="grid">

        <button
          class="btn btn-primary"
          id="editProfileBtn"
          type="button"
        >
          ✏️ Edit profile
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


export function showEditProfile(renderApp) {

  const profile =
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
          id="profileDisplayName"
          maxlength="80"
          value="${escapeHtml(
            profile.displayName || ""
          )}"
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
            profile.username || ""
          )}"
        >

      </div>


      <div class="field">

        <label>
          Bio
        </label>

        <textarea
          class="input"
          id="profileBio"
          maxlength="300"
          rows="4"
        >${escapeHtml(
          profile.bio || ""
        )}</textarea>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="saveProfile"
        type="button"
      >
        Save profile
      </button>
    `
  );


  document
    .getElementById("saveProfile")
    ?.addEventListener(
      "click",
      async () => {

        const displayName =
          document
            .getElementById(
              "profileDisplayName"
            )
            ?.value
            .trim() || "";


        const username =
          document
            .getElementById(
              "profileUsername"
            )
            ?.value
            .trim() || "";


        const bio =
          document
            .getElementById(
              "profileBio"
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


          try {

            await updateProfile(
              state.user,
              {
                displayName
              }
            );

          } catch (authError) {

            console.warn(
              "[Profile] Auth display-name update warning:",
              authError
            );

          }


          state.profile = {
            ...state.profile,
            displayName,
            username,
            bio
          };


          closeModal();

          toast(
            "Profile updated."
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


export function attachProfileEvents(
  renderApp
) {

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


  document
    .getElementById(
      "timeTrustAccountBtn"
    )
    ?.addEventListener(
      "click",
      () =>
        showTimeTrustAccountModal(
          renderApp
        )
    );


  document
    .getElementById(
      "marketAccountBtn"
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
