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
  getDoc,
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
  showEditPost,
  showDeletePostConfirmation,
  savePost,
  sharePost,
  showComments
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

import {
  hasTimeTrustAccount,
  showTimeTrustAccountModal
} from "./timetrust.js";


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
            —
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
           TIMETRUST ACCOUNT
           ================================================= -->

      <div class="section-title">

        <h2>
          TimeTrust ⏱️
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
                hasTimeTrustAccount()
                  ? "TimeTrust Account Active"
                  : "TimeTrust Account Not Active"
              }
            </strong>


            <p
              class="small"
              style="margin:5px 0 0;"
            >
              ${
                hasTimeTrustAccount()
                  ? "You can publish and manage your TimeTrust skill offers."
                  : "Browse TimeTrust freely. Activate your account to publish or manage skill offers."
              }
            </p>

          </div>


          <span
            class="badge"
            style="
              ${
                hasTimeTrustAccount()
                  ? "background:var(--primary);color:#fff;"
                  : "background:var(--surface2);"
              }
            "
          >
            ${
              hasTimeTrustAccount()
                ? "Active"
                : "Inactive"
            }
          </span>

        </div>


        <div style="margin-top:12px;">

          ${
            hasTimeTrustAccount()
              ? `
                <button
                  class="btn btn-ghost btn-block"
                  id="timeTrustAccountBtn"
                  type="button"
                >
                  ⚙️ Manage TimeTrust Account
                </button>
              `
              : `
                <button
                  class="btn btn-primary btn-block"
                  id="timeTrustAccountBtn"
                  type="button"
                >
                  ⏱️ Activate TimeTrust Account
                </button>
              `
          }

        </div>

      </div>


      <!-- =================================================
           MY POSTS
           ================================================= -->

      <div class="section-title">

        <h2>
          My Posts
        </h2>

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
   PROFILE POST COLLECTION HELPERS
   ========================================================= */

function mergePostsIntoState(posts) {

  const incoming = Array.isArray(posts)
    ? posts
    : [];

  const existing = Array.isArray(state.posts)
    ? state.posts
    : [];

  const byId = new Map();

  existing.forEach(post => {
    if (post?.id) {
      byId.set(post.id, post);
    }
  });

  incoming.forEach(post => {
    if (post?.id) {
      byId.set(post.id, post);
    }
  });

  state.posts = Array.from(byId.values());

  return incoming;
}


function sortPostsByCreatedAt(posts) {

  return [...posts].sort((a, b) => {

    const getTime = value => {

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
    };

    return (
      getTime(b?.createdAt) -
      getTime(a?.createdAt)
    );

  });
}


function renderProfilePost(
  post,
  mode = "my"
) {

  const isOwner =
    post?.uid === state.user?.uid;

  const savedMode =
    mode === "saved";

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

        ${
          savedMode
            ? `
              <button
                class="btn btn-ghost"
                type="button"
                data-save="${escapeHtml(
                  post.id
                )}"
              >
                🔖 Saved
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
      </div>
    </article>
  `;
}


function attachProfilePostEvents(
  renderApp
) {

  document
    .querySelectorAll("[data-edit-post]")
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          const postId =
            button.dataset.editPost;

          showEditPost(postId);

        }
      );

    });


  document
    .querySelectorAll("[data-delete-post]")
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          const postId =
            button.dataset.deletePost;

          showDeletePostConfirmation(
            postId
          );

        }
      );

    });


  document
    .querySelectorAll("[data-save]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          savePost(
            button.dataset.save
          );

        }
      );

    });


  document
    .querySelectorAll("[data-share]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          sharePost(
            button.dataset.share
          );

        }
      );

    });


  document
    .querySelectorAll("[data-comment]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          showComments(
            button.dataset.comment
          );

        }
      );

    });

}


function showProfilePostsModal(
  title,
  posts,
  renderApp,
  emptyMessage
) {

  const sorted =
    sortPostsByCreatedAt(posts);

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
            .map(post =>
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
          id:
            postDoc.id,
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
                ...postSnapshot.data(),
                savedBy: [
                  ...(Array.isArray(
                    postSnapshot.data()?.savedBy
                  )
                    ? postSnapshot.data().savedBy
                    : []),
                  state.user.uid
                ]
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
        "🔖 Saved posts";

    }

  }

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
      () => {

        showTimeTrustAccountModal(
          renderApp
        );

      }
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
