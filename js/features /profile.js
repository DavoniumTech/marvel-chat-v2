import {
  state,
  countries,
  escapeHtml,
  initials,
  friendly,
  formatDate
} from "../state.js";

import {
  db,
  collection,
  doc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  limit
} from "../firebase/firestore.js";

import { updateProfile, signOut } from "../firebase/auth.js";

import {
  showModal,
  closeModal
} from "../components/modal.js";

import { toast } from "../components/toast.js";

import {
  showEditPost,
  showDeletePostConfirmation,
  savePost,
  sharePost,
  showComments
} from "./home.js";

import {
  hasMarketAccount,
  showMarketAccountModal,
  showListingDetails
} from "./market.js";

import {
  hasTimeTrustAccount,
  showTimeTrustAccountModal
} from "./timetrust.js";


let savedPostIds = new Set();
let savedPostsLoadedForUid = null;


async function loadProfileSavedPostIds(renderApp) {
  const uid = state.user?.uid;

  if (!uid) {
    savedPostIds = new Set();
    savedPostsLoadedForUid = null;
    state.savedPostCount = null;
    return;
  }

  if (
    savedPostsLoadedForUid === uid &&
    state.savedPostCount !== null &&
    state.savedPostCount !== undefined
  ) {
    return;
  }

  savedPostsLoadedForUid = uid;
  savedPostIds = new Set();
  state.savedPostCount = null;

  try {
    const snapshot = await getDocs(
      collection(
        db,
        "users",
        uid,
        "savedPosts"
      )
    );

    snapshot.forEach(savedDoc => {
      if (savedDoc.id) {
        savedPostIds.add(savedDoc.id);
      }
    });

    state.savedPostCount = savedPostIds.size;

    if (state.page === "profile") {
      renderApp?.();
    }
  } catch (error) {
    savedPostsLoadedForUid = null;
    state.savedPostCount = null;

    console.error(
      "[Profile] Saved posts load error:",
      error
    );
  }
}


export function renderProfile(renderApp) {
  loadProfileSavedPostIds(renderApp);

  const profile = state.profile || {};

  const name =
    profile.displayName ||
    profile.username ||
    "User";

  const marketAccount =
    profile.marketAccount || {};

  const marketActive =
    hasMarketAccount();

  const ownListings =
    (state.listings || []).filter(
      listing =>
        listing.uid ===
        state.user?.uid
    );

  const savedCount =
    state.savedPostCount === null ||
    state.savedPostCount === undefined
      ? "…"
      : state.savedPostCount;

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
        <h2>My Posts</h2>
      </div>


      <div class="card">

        <p
          class="small"
          style="margin-top:0;"
        >
          View, edit, or delete posts belonging to your authenticated account.
        </p>

        <button
          class="btn btn-ghost btn-block"
          id="myPostsBtn"
          type="button"
        >
          📝 Open My Posts
        </button>

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
          class="grid ${
            marketActive
              ? "grid2"
              : ""
          }"
          style="margin-top:12px;"
        >

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
              : `
                <button
                  class="btn btn-ghost"
                  id="myListingsBtn"
                  type="button"
                >
                  📋 My Listings${
                    ownListings.length
                      ? ` (${ownListings.length})`
                      : ""
                  }
                </button>
              `
          }

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
          id="savedBtn"
          type="button"
        >
          🔖 Saved posts${
            state.savedPostCount == null
              ? ""
              : ` (${state.savedPostCount})`
          }
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


function postTime(value) {
  if (value?.toMillis) {
    return value.toMillis();
  }

  if (value?.toDate) {
    return value.toDate().getTime();
  }

  if (!value) {
    return 0;
  }

  const time =
    new Date(value).getTime();

  return Number.isFinite(time)
    ? time
    : 0;
}


function mergePostsIntoState(posts) {
  const map =
    new Map(
      (state.posts || []).map(
        post => [
          post.id,
          post
        ]
      )
    );

  posts.forEach(post => {
    if (post?.id) {
      map.set(
        post.id,
        post
      );
    }
  });

  state.posts =
    Array.from(
      map.values()
    );
}


function renderProfilePost(
  post,
  mode = "my"
) {
  const isOwner =
    post?.uid ===
    state.user?.uid;


  return `
    <article
      class="card post-card"
      data-profile-post="${escapeHtml(
        post?.id || ""
      )}"
      style="margin-bottom:14px;"
    >

      <div
        style="
          display:flex;
          justify-content:space-between;
          gap:12px;
          align-items:flex-start;
        "
      >

        <div style="min-width:0;">

          <strong>
            ${escapeHtml(
              post?.username ||
              post?.displayName ||
              "User"
            )}
          </strong>

          <div class="small">
            ${escapeHtml(
              formatDate(
                post?.createdAt
              )
            )}
          </div>

        </div>


        ${
          isOwner
            ? `
              <span class="badge">
                Your post
              </span>
            `
            : ""
        }

      </div>


      <div
        class="post-content"
        style="
          margin-top:14px;
          line-height:1.65;
          white-space:pre-wrap;
          word-break:break-word;
        "
      >
        ${escapeHtml(
          post?.text || ""
        )}
      </div>


      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:14px;
        "
      >

        ${
          mode === "saved"
            ? `
              <button
                class="btn btn-ghost"
                type="button"
                data-share="${escapeHtml(
                  post.id
                )}"
              >
                📤 Share
              </button>
            `
            : `
              ${
                isOwner
                  ? `
                    <button
                      class="btn btn-ghost"
                      type="button"
                      data-edit-post="${escapeHtml(
                        post.id
                      )}"
                    >
                      ✏️ Edit
                    </button>

                    <button
                      class="btn btn-danger"
                      type="button"
                      data-delete-post="${escapeHtml(
                        post.id
                      )}"
                    >
                      🗑️ Delete
                    </button>
                  `
                  : ""
              }


              <button
                class="btn btn-ghost"
                type="button"
                data-share="${escapeHtml(
                  post.id
                )}"
              >
                📤 Share
              </button>


              <button
                class="btn btn-ghost"
                type="button"
                data-comment="${escapeHtml(
                  post.id
                )}"
              >
                💬 ${Number(
                  post?.comments || 0
                )}
              </button>
            `
        }

      </div>

    </article>
  `;
}


function attachProfilePostEvents() {

  document
    .querySelectorAll(
      "[data-edit-post]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          event => {

            event.stopPropagation();

            showEditPost(
              button.dataset.editPost
            );

          }
        );

      }
    );


  document
    .querySelectorAll(
      "[data-delete-post]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          event => {

            event.stopPropagation();

            showDeletePostConfirmation(
              button.dataset.deletePost
            );

          }
        );

      }
    );


  document
    .querySelectorAll(
      "[data-save]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            savePost(
              button.dataset.save
            )
        );

      }
    );


  document
    .querySelectorAll(
      "[data-share]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            sharePost(
              button.dataset.share
            )
        );

      }
    );


  document
    .querySelectorAll(
      "[data-comment]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            showComments(
              button.dataset.comment
            )
        );

      }
    );
}


function showProfilePostsModal(
  title,
  posts,
  renderApp,
  emptyMessage
) {
  const sorted =
    [...posts].sort(
      (a, b) =>
        postTime(b?.createdAt) -
        postTime(a?.createdAt)
    );


  showModal(
    title,

    sorted.length
      ? `
        <div
          style="
            display:flex;
            flex-direction:column;
            gap:10px;
          "
        >
          ${sorted
            .map(
              post =>
                renderProfilePost(
                  post,
                  title === "Saved posts"
                    ? "saved"
                    : "my"
                )
            )
            .join("")}
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
            📝
          </div>

          <p>
            ${escapeHtml(
              emptyMessage
            )}
          </p>

        </div>
      `
  );


  attachProfilePostEvents(
    renderApp
  );
}


export async function showMyPosts(
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
      "myPostsBtn"
    );


  if (button) {
    button.disabled = true;
    button.textContent =
      "Loading your posts…";
  }


  try {

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "posts"
          ),
          where(
            "uid",
            "==",
            state.user.uid
          ),
          limit(50)
        )
      );


    const posts =
      snapshot.docs.map(
        postDoc => ({
          id: postDoc.id,
          ...postDoc.data()
        })
      );


    mergePostsIntoState(
      posts
    );


    showProfilePostsModal(
      "My Posts",
      posts,
      renderApp,
      "You have not published any posts yet."
    );

  } catch (error) {

    console.error(
      "[Profile] My Posts load error:",
      error
    );

    toast(
      friendly(error)
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.innerHTML =
        "📝 Open My Posts";
    }

  }
}


export async function showSaved(
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
      "savedBtn"
    );


  if (button) {
    button.disabled = true;
    button.textContent =
      "Loading saved posts…";
  }


  try {

    const savedSnapshot =
      await getDocs(
        collection(
          db,
          "users",
          state.user.uid,
          "savedPosts"
        )
      );


    const savedIds =
      savedSnapshot.docs
        .map(
          savedDoc =>
            savedDoc.id
        )
        .filter(Boolean);


    savedPostIds =
      new Set(savedIds);

    state.savedPostCount =
      savedIds.length;

    savedPostsLoadedForUid =
      state.user.uid;


    const resolvedPosts =
      await Promise.all(
        savedIds.map(
          async postId => {

            try {

              const postSnapshot =
                await getDoc(
                  doc(
                    db,
                    "posts",
                    postId
                  )
                );


              if (
                !postSnapshot.exists()
              ) {
                return null;
              }


              return {
                id:
                  postSnapshot.id,
                ...postSnapshot.data()
              };

            } catch (error) {

              console.warn(
                "[Profile] Could not resolve saved post:",
                {
                  postId,
                  code:
                    error?.code,
                  error
                }
              );

              return null;
            }
          }
        )
      );


    const posts =
      resolvedPosts.filter(
        Boolean
      );


    mergePostsIntoState(
      posts
    );


    showProfilePostsModal(
      "Saved posts",
      posts,
      renderApp,
      "You have no saved posts yet."
    );

  } catch (error) {

    console.error(
      "[Profile] Saved posts load error:",
      error
    );

    toast(
      friendly(error)
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.innerHTML =
        `🔖 Saved posts${
          state.savedPostCount == null
            ? ""
            : ` (${state.savedPostCount})`
        }`;

    }

  }
}


async function showMyListings(
  renderApp
) {
  if (!state.user) {
    toast(
      "Please sign in first."
    );
    return;
  }

  const listings =
    (state.listings || [])
      .filter(
        listing =>
          listing.uid ===
          state.user.uid
      );

  if (!listings.length) {
    showModal(
      "My Listings",
      `
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

          <p>
            You have no listings yet.
          </p>
        </div>
      `
    );
    return;
  }

  showModal(
    "My Listings",
    `
      <div
        style="
          display:flex;
          flex-direction:column;
          gap:10px;
        "
      >
        ${listings
          .map(
            listing => `
              <button
                class="btn btn-ghost"
                type="button"
                data-profile-listing="${escapeHtml(
                  listing.id
                )}"
                style="
                  text-align:left;
                  width:100%;
                "
              >
                <strong>
                  ${escapeHtml(
                    listing.title ||
                    listing.name ||
                    "Listing"
                  )}
                </strong>

                <span class="small">
                  ${escapeHtml(
                    listing.description ||
                    ""
                  )}
                </span>
              </button>
            `
          )
          .join("")}
      </div>
    `
  );


  document
    .querySelectorAll(
      "[data-profile-listing]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            showListingDetails(
              button.dataset.profileListing,
              renderApp
            );

          }
        );

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
      "savedBtn"
    )
    ?.addEventListener(
      "click",
      () =>
        showSaved(
          renderApp
        )
    );


  document
    .getElementById(
      "myPostsBtn"
    )
    ?.addEventListener(
      "click",
      () =>
        showMyPosts(
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
      "myListingsBtn"
    )
    ?.addEventListener(
      "click",
      () =>
        showMyListings(
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
