import {
  state,
  escapeHtml,
  initials,
  formatDate,
  friendly
} from "../state.js";

import {
  db,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  getDocs,
  query,
  orderBy,
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
  showNewChat
} from "./chat.js";

/* =========================================================
   HOME PAGE
   ========================================================= */

export function renderHome(renderApp) {
  const me =
    state.profile?.displayName ||
    state.profile?.username ||
    "there";

  const posts = Array.isArray(state.posts)
    ? state.posts
    : [];

  return `
    <div class="page">

      <section class="hero">
        <h1>
          Hey ${escapeHtml(me)} 👋
        </h1>

        <p>
          Welcome to your futuristic community.
          Connect, chat, trade skills and discover
          what people around you are building.
        </p>
      </section>

      <!-- =================================================
           QUICK ACTIONS
           ================================================= -->

      <div class="quick-grid">

        <button
          class="quick"
          data-quick="post"
          type="button"
        >
          <div class="quick-icon">
            ✍️
          </div>

          <strong>
            Create post
          </strong>

          <span>
            Share something
          </span>
        </button>


        <button
          class="quick"
          data-quick="chat"
          type="button"
        >
          <div class="quick-icon">
            💬
          </div>

          <strong>
            Start chat
          </strong>

          <span>
            Talk to someone
          </span>
        </button>


        <button
          class="quick"
          data-quick="timetrust"
          type="button"
        >
          <div class="quick-icon">
            ⏱️
          </div>

          <strong>
            Explore TimeTrust
          </strong>

          <span>
            Trade time and skills
          </span>
        </button>


        <button
          class="quick"
          data-quick="market"
          type="button"
        >
          <div class="quick-icon">
            🛍️
          </div>

          <strong>
            Explore Market
          </strong>

          <span>
            Discover products
          </span>
        </button>

      </div>


      <!-- =================================================
           COMMUNITY FEED
           ================================================= -->

      <div class="section-title">

        <h2>
          Community feed
        </h2>

        <button
          class="btn btn-primary"
          id="createPostBtn"
          type="button"
        >
          + Post
        </button>

      </div>


      ${
        posts.length
          ? posts
              .map(renderPost)
              .join("")

          : `
            <div class="card empty">

              <div
                style="font-size:38px"
              >
                🌌
              </div>

              <h3>
                The community is quiet…
              </h3>

              <p>
                Be the first person to start
                the conversation.
              </p>

              <button
                class="btn btn-primary"
                id="emptyCreatePost"
                type="button"
              >
                Create the first post
              </button>

            </div>
          `
      }

    </div>
  `;
}


/* =========================================================
   POST CARD
   ========================================================= */

export function renderPost(p) {
  const liked =
    Array.isArray(p.likedBy) &&
    p.likedBy.includes(state.user.uid);

  const saved =
    Array.isArray(p.savedBy) &&
    p.savedBy.includes(state.user.uid);

  const isOwner =
    p.uid === state.user.uid;

  return `
    <article
      class="card post"
      data-post-id="${escapeHtml(p.id)}"
    >

      <div class="post-head">

        <div class="avatar">
          ${escapeHtml(
            initials(
              p.username ||
              p.displayName ||
              "User"
            )
          )}
        </div>

        <div class="profile-meta">

          <strong>
            ${escapeHtml(
              p.username ||
              p.displayName ||
              "User"
            )}
          </strong>

          <span class="small">
            ${escapeHtml(
              formatDate(p.createdAt)
            )}

            ${
              p.editedAt
                ? `
                  <span class="edited-indicator">
                    (Edited)
                  </span>
                `
                : ""
            }
          </span>

        </div>


        ${
          isOwner
            ? `
              <div
                class="dropdown-container"
                style="
                  margin-left:auto;
                  position:relative;
                "
              >

                <button
                  class="icon-btn post-menu-btn"
                  aria-label="Post options"
                  data-menu-post="${escapeHtml(p.id)}"
                  type="button"
                >
                  ⋮
                </button>

                <div
                  class="dropdown-menu hidden"
                  id="postMenu-${escapeHtml(p.id)}"
                  style="
                    position:absolute;
                    right:0;
                    background:var(--surface2);
                    border:1px solid var(--border);
                    border-radius:12px;
                    padding:6px;
                    z-index:10;
                    box-shadow:var(--shadow);
                  "
                >

                  <button
                    class="btn-text edit-post-btn"
                    data-edit-post="${escapeHtml(p.id)}"
                    type="button"
                    style="
                      display:block;
                      width:100%;
                      text-align:left;
                      padding:8px 12px;
                      background:none;
                      border:none;
                      color:var(--text);
                      cursor:pointer;
                      font-weight:700;
                      font-size:13px;
                    "
                  >
                    Edit post
                  </button>

                  <button
                    class="btn-text delete-post-btn"
                    data-delete-post="${escapeHtml(p.id)}"
                    type="button"
                    style="
                      display:block;
                      width:100%;
                      text-align:left;
                      padding:8px 12px;
                      background:none;
                      border:none;
                      color:var(--danger);
                      cursor:pointer;
                      font-weight:700;
                      font-size:13px;
                    "
                  >
                    Delete post
                  </button>

                </div>

              </div>
            `
            : ""
        }

      </div>


      <div class="post-body">

        <p>
          ${escapeHtml(
            p.text ||
            p.content ||
            ""
          )}
        </p>

      </div>


      <div
        class="post-actions"
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          align-items:center;
        "
      >

        <button
          class="btn btn-ghost"
          data-like="${escapeHtml(p.id)}"
          type="button"
        >
          ${liked ? "❤️" : "🤍"}
          ${Number(p.likesCount || 0)}
        </button>


        <button
          class="btn btn-ghost"
          data-comments="${escapeHtml(p.id)}"
          type="button"
        >
          💬
          ${Number(p.commentsCount || 0)}
        </button>


        <button
          class="btn btn-ghost"
          data-save="${escapeHtml(p.id)}"
          type="button"
        >
          ${saved ? "🔖 Saved" : "🔖 Save"}
        </button>


        <button
          class="btn btn-ghost"
          data-share="${escapeHtml(p.id)}"
          type="button"
        >
          ↗️ Share
        </button>

      </div>

    </article>
  `;
}


/* =========================================================
   CREATE POST
   ========================================================= */

export function showCreatePost(renderApp) {
  showModal(
    "Create a post",
    `
      <div class="field">

        <label for="postText">
          What would you like to share?
        </label>

        <textarea
          class="input"
          id="postText"
          rows="5"
          maxlength="5000"
          placeholder="Write something for the community…"
        ></textarea>

      </div>

      <button
        class="btn btn-primary btn-block"
        id="submitPost"
        type="button"
      >
        Publish Post
      </button>
    `
  );


  document
    .getElementById("submitPost")
    ?.addEventListener(
      "click",
      async () => {

        const button =
          document.getElementById(
            "submitPost"
          );

        const textarea =
          document.getElementById(
            "postText"
          );

        const text =
          textarea?.value.trim() ||
          "";

        if (!text) {
          toast(
            "Please write something first."
          );
          textarea?.focus();
          return;
        }


        try {

          button.disabled = true;

          button.textContent =
            "Publishing…";


          await addDoc(
            collection(
              db,
              "posts"
            ),
            {
              uid:
                state.user.uid,

              username:
                state.profile?.username ||
                state.profile?.displayName ||
                "User",

              text,

              likedBy: [],

              savedBy: [],

              likesCount: 0,

              commentsCount: 0,

              createdAt:
                serverTimestamp()
            }
          );


          closeModal();

          toast(
            "Post published 🎉"
          );


          if (
            typeof renderApp ===
            "function"
          ) {
            renderApp();
          }

        } catch (e) {

          console.error(
            "CREATE POST ERROR:",
            e
          );

          toast(
            friendly(e)
          );

          button.disabled =
            false;

          button.textContent =
            "Publish Post";
        }
      }
    );
}


/* =========================================================
   EDIT POST
   ========================================================= */

export function showEditPost(
  postId,
  renderApp
) {

  const post =
    state.posts.find(
      p => p.id === postId
    );

  if (!post) {
    toast(
      "Post not found."
    );
    return;
  }


  if (
    post.uid !==
    state.user.uid
  ) {
    toast(
      "You can only edit your own posts."
    );
    return;
  }


  showModal(
    "Edit post",
    `
      <div class="field">

        <label for="editPostText">
          Post
        </label>

        <textarea
          class="input"
          id="editPostText"
          rows="5"
          maxlength="5000"
        >${escapeHtml(
          post.text ||
          post.content ||
          ""
        )}</textarea>

      </div>

      <button
        class="btn btn-primary btn-block"
        id="saveEditedPost"
        type="button"
      >
        Save Changes
      </button>
    `
  );


  document
    .getElementById(
      "saveEditedPost"
    )
    ?.addEventListener(
      "click",
      async () => {

        const button =
          document.getElementById(
            "saveEditedPost"
          );

        const textarea =
          document.getElementById(
            "editPostText"
          );

        const text =
          textarea?.value.trim() ||
          "";

        if (!text) {
          toast(
            "Post cannot be empty."
          );
          return;
        }


        try {

          button.disabled =
            true;

          button.textContent =
            "Saving…";


          await updateDoc(
            doc(
              db,
              "posts",
              postId
            ),
            {
              text,

              editedAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp()
            }
          );


          closeModal();

          toast(
            "Post updated."
          );


          if (
            typeof renderApp ===
            "function"
          ) {
            renderApp();
          }

        } catch (e) {

          console.error(
            "EDIT POST ERROR:",
            e
          );

          toast(
            friendly(e)
          );

          button.disabled =
            false;

          button.textContent =
            "Save Changes";
        }
      }
    );
}


/* =========================================================
   DELETE POST CONFIRMATION
   ========================================================= */

export function showDeletePostConfirmation(
  postId,
  renderApp
) {

  const post =
    state.posts.find(
      p => p.id === postId
    );

  if (!post) {
    toast(
      "Post not found."
    );
    return;
  }


  if (
    post.uid !==
    state.user.uid
  ) {
    toast(
      "You can only delete your own posts."
    );
    return;
  }


  showModal(
    "Delete post?",
    `
      <p class="small">
        Are you sure you want to delete this post?
        This action cannot be undone.
      </p>

      <div
        style="
          display:flex;
          gap:10px;
          margin-top:16px;
        "
      >

        <button
          class="btn btn-ghost"
          id="cancelDeletePost"
          type="button"
          style="flex:1;"
        >
          Cancel
        </button>

        <button
          class="btn btn-danger"
          id="confirmDeletePost"
          type="button"
          style="flex:1;"
        >
          Delete
        </button>

      </div>
    `
  );


  document
    .getElementById(
      "cancelDeletePost"
    )
    ?.addEventListener(
      "click",
      closeModal
    );


  document
    .getElementById(
      "confirmDeletePost"
    )
    ?.addEventListener(
      "click",
      async () => {

        const button =
          document.getElementById(
            "confirmDeletePost"
          );


        try {

          button.disabled =
            true;

          button.textContent =
            "Deleting…";


          await deleteDoc(
            doc(
              db,
              "posts",
              postId
            )
          );


          closeModal();

          toast(
            "Post deleted."
          );


          if (
            typeof renderApp ===
            "function"
          ) {
            renderApp();
          }

        } catch (e) {

          console.error(
            "DELETE POST ERROR:",
            e
          );

          toast(
            friendly(e)
          );

          button.disabled =
            false;

          button.textContent =
            "Delete";
        }
      }
    );
}


/* =========================================================
   LIKE POST
   ========================================================= */

export async function toggleLike(
  id
) {

  const post =
    state.posts.find(
      p => p.id === id
    );

  if (!post) {
    return;
  }


  const liked =
    Array.isArray(
      post.likedBy
    ) &&
    post.likedBy.includes(
      state.user.uid
    );


  try {

    if (liked) {

      await updateDoc(
        doc(
          db,
          "posts",
          id
        ),
        {
          likedBy:
            arrayRemove(
              state.user.uid
            ),

          likesCount:
            increment(-1)
        }
      );

    } else {

      await updateDoc(
        doc(
          db,
          "posts",
          id
        ),
        {
          likedBy:
            arrayUnion(
              state.user.uid
            ),

          likesCount:
            increment(1)
        }
      );
    }

  } catch (e) {

    console.error(
      "LIKE ERROR:",
      e
    );

    toast(
      friendly(e)
    );
  }
}


/* =========================================================
   SAVE POST
   ========================================================= */

export async function savePost(
  id
) {

  const post =
    state.posts.find(
      p => p.id === id
    );

  if (!post) {
    return;
  }


  const saved =
    Array.isArray(
      post.savedBy
    ) &&
    post.savedBy.includes(
      state.user.uid
    );


  try {

    if (saved) {

      await updateDoc(
        doc(
          db,
          "posts",
          id
        ),
        {
          savedBy:
            arrayRemove(
              state.user.uid
            )
        }
      );

    } else {

      await updateDoc(
        doc(
          db,
          "posts",
          id
        ),
        {
          savedBy:
            arrayUnion(
              state.user.uid
            )
        }
      );
    }

  } catch (e) {

    console.error(
      "SAVE POST ERROR:",
      e
    );

    toast(
      friendly(e)
    );
  }
}


/* =========================================================
   SHARE POST
   ========================================================= */

export async function sharePost(
  id
) {

  const post =
    state.posts.find(
      p => p.id === id
    );

  if (!post) {
    return;
  }


  const text =
    post.text ||
    post.content ||
    "";


  try {

    if (
      navigator.share
    ) {

      await navigator.share({
        title:
          "Marvel Chat",
        text
      });

      return;
    }


    if (
      navigator.clipboard
    ) {

      await navigator.clipboard.writeText(
        text
      );

      toast(
        "Post copied to clipboard 📋"
      );

      return;
    }


    toast(
      "Sharing is not available on this device."
    );

  } catch (e) {

    if (
      e?.name ===
      "AbortError"
    ) {
      return;
    }

    console.error(
      "SHARE ERROR:",
      e
    );

    toast(
      "Could not share this post."
    );
  }
}


/* =========================================================
   COMMENTS
   ========================================================= */

export async function showComments(
  id,
  renderApp
) {

  const post =
    state.posts.find(
      p => p.id === id
    );

  if (!post) {
    toast(
      "Post not found."
    );
    return;
  }


  showModal(
    "Comments",
    `
      <div
        id="commentsContent"
        class="small"
      >
        Loading comments…
      </div>

      <div
        style="
          margin-top:16px;
        "
      >

        <textarea
          class="input"
          id="commentText"
          rows="3"
          maxlength="1000"
          placeholder="Write a comment…"
        ></textarea>

        <button
          class="btn btn-primary btn-block"
          id="submitComment"
          type="button"
          style="margin-top:8px;"
        >
          Add Comment
        </button>

      </div>
    `
  );


  const commentsContent =
    document.getElementById(
      "commentsContent"
    );


  try {

    const snap =
      await getDocs(
        query(
          collection(
            db,
            "posts",
            id,
            "comments"
          ),
          orderBy(
            "createdAt",
            "asc"
          ),
          limit(100)
        )
      );


    if (snap.empty) {

      commentsContent.innerHTML =
        `
          <div class="empty">
            No comments yet.
          </div>
        `;

    } else {

      commentsContent.innerHTML =
        snap.docs
          .map(
            d => {

              const c =
                d.data();

              return `
                <div
                  style="
                    padding:10px 0;
                    border-bottom:
                      1px solid
                      var(--border);
                  "
                >

                  <strong>
                    ${escapeHtml(
                      c.username ||
                      "User"
                    )}
                  </strong>

                  <div
                    class="small"
                    style="
                      margin-top:4px;
                    "
                  >
                    ${escapeHtml(
                      c.text ||
                      ""
                    )}
                  </div>

                  <div
                    class="small"
                    style="
                      margin-top:4px;
                    "
                  >
                    ${escapeHtml(
                      formatDate(
                        c.createdAt
                      )
                    )}
                  </div>

                </div>
              `;
            }
          )
          .join("");
    }

  } catch (e) {

    console.error(
      "COMMENTS LOAD ERROR:",
      e
    );

    commentsContent.innerHTML =
      `
        <div class="status error">
          Could not load comments.
        </div>
      `;
  }


  document
    .getElementById(
      "submitComment"
    )
    ?.addEventListener(
      "click",
      async () => {

        const button =
          document.getElementById(
            "submitComment"
          );

        const textarea =
          document.getElementById(
            "commentText"
          );

        const text =
          textarea?.value.trim() ||
          "";

        if (!text) {

          toast(
            "Write a comment first."
          );

          return;
        }


        try {

          button.disabled =
            true;

          button.textContent =
            "Posting…";


          await addDoc(
            collection(
              db,
              "posts",
              id,
              "comments"
            ),
            {
              uid:
                state.user.uid,

              username:
                state.profile?.username ||
                state.profile?.displayName ||
                "User",

              text,

              createdAt:
                serverTimestamp()
            }
          );


          await updateDoc(
            doc(
              db,
              "posts",
              id
            ),
            {
              commentsCount:
                increment(1)
            }
          );


          toast(
            "Comment added 💬"
          );


          closeModal();


          if (
            typeof renderApp ===
            "function"
          ) {
            renderApp();
          }

        } catch (e) {

          console.error(
            "COMMENT ERROR:",
            e
          );

          toast(
            friendly(e)
          );

          button.disabled =
            false;

          button.textContent =
            "Add Comment";
        }
      }
    );
}


/* =========================================================
   FIRST-OPEN HOME DISCOVERY
   ========================================================= */

const HOME_DISCOVERY_KEY =
  "marvel_home_discovery_seen_v1";

const HOME_DISCOVERY_SECONDS =
  40;


export function showHomeDiscovery(
  renderApp
) {

  if (!state.user) {
    return;
  }


  if (
    state.page !==
    "home"
  ) {
    return;
  }


  try {

    if (
      localStorage.getItem(
        HOME_DISCOVERY_KEY
      ) === "1"
    ) {
      return;
    }

  } catch (e) {

    console.warn(
      "HOME DISCOVERY STORAGE ERROR:",
      e
    );
  }


  if (
    document.getElementById(
      "homeDiscoveryOverlay"
    )
  ) {
    return;
  }


  let remaining =
    HOME_DISCOVERY_SECONDS;


  const overlay =
    document.createElement(
      "div"
    );


  overlay.id =
    "homeDiscoveryOverlay";


  overlay.style.cssText = `
    position:fixed;
    inset:0;
    z-index:10000;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    background:
      linear-gradient(
        135deg,
        rgba(15,23,42,.96),
        rgba(76,29,149,.96)
      );
    box-sizing:border-box;
  `;


  overlay.innerHTML = `
    <div
      style="
        width:min(560px,100%);
        max-height:90vh;
        overflow:auto;
        text-align:center;
        border-radius:24px;
        padding:30px 22px;
        background:var(--surface);
        border:1px solid var(--border);
        box-shadow:0 24px 80px rgba(0,0,0,.35);
      "
    >

      <div
        style="
          font-size:52px;
          margin-bottom:10px;
        "
      >
        🌌
      </div>

      <div
        style="
          font-size:12px;
          font-weight:800;
          letter-spacing:2px;
          color:var(--primary);
          margin-bottom:8px;
        "
      >
        MARVEL CHAT
      </div>

      <h1
        style="
          margin:0 0 12px;
        "
      >
        Discover more 🚀
      </h1>

      <p
        class="small"
        style="
          line-height:1.7;
          margin:0 auto 20px;
          max-width:440px;
        "
      >
        Explore the two places where Marvel Chat
        becomes more than just conversation:
        discover products in Market and exchange
        useful skills through TimeTrust.
      </p>


      <div
        style="
          margin:0 auto 20px;
          width:76px;
          height:76px;
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
          background:var(--surface2);
          border:2px solid var(--primary);
          font-size:24px;
          font-weight:800;
        "
      >
        <span id="homeDiscoveryTimer">
          40
        </span>
      </div>


      <div
        style="
          display:grid;
          gap:10px;
        "
      >

        <button
          class="btn btn-primary btn-block"
          id="homeDiscoveryMarket"
          type="button"
        >
          🛍️ Explore Market
        </button>

        <button
          class="btn btn-ghost btn-block"
          id="homeDiscoveryTimeTrust"
          type="button"
        >
          ⏱️ Explore TimeTrust
        </button>

        <button
          class="btn btn-ghost btn-block"
          id="homeDiscoveryClose"
          type="button"
        >
          ✕ Close
        </button>

      </div>

    </div>
  `;


  document.body.appendChild(
    overlay
  );


  const finish =
    () => {

      if (
        overlay.parentNode
      ) {
        overlay.parentNode.removeChild(
          overlay
        );
      }

      try {

        localStorage.setItem(
          HOME_DISCOVERY_KEY,
          "1"
        );

      } catch (e) {

        console.warn(
          "HOME DISCOVERY SAVE ERROR:",
          e
        );
      }
    };


  const timer =
    document.getElementById(
      "homeDiscoveryTimer"
    );


  const interval =
    setInterval(
      () => {

        remaining--;

        if (timer) {
          timer.textContent =
            String(
              Math.max(
                0,
                remaining
              )
            );
        }


        if (
          remaining <= 0
        ) {

          clearInterval(
            interval
          );

          finish();
        }

      },
      1000
    );


  document
    .getElementById(
      "homeDiscoveryClose"
    )
    ?.addEventListener(
      "click",
      () => {

        clearInterval(
          interval
        );

        finish();
      }
    );


  document
    .getElementById(
      "homeDiscoveryMarket"
    )
    ?.addEventListener(
      "click",
      () => {

        clearInterval(
          interval
        );

        finish();


        state.marketBrowseMode =
          false;

        state.marketTab =
          "browse";

        state.page =
          "market";


        if (
          typeof renderApp ===
          "function"
        ) {
          renderApp();
        }
      }
    );


  document
    .getElementById(
      "homeDiscoveryTimeTrust"
    )
    ?.addEventListener(
      "click",
      () => {

        clearInterval(
          interval
        );

        finish();


        state.page =
          "timetrust";


        if (
          typeof renderApp ===
          "function"
        ) {
          renderApp();
        }
      }
    );
}


/* =========================================================
   HOME EVENT ATTACHMENT
   ========================================================= */

export function attachHomeEvents(
  renderApp
) {

  /*
   * Quick actions are intentionally owned here,
   * not app.js, so there is only one handler.
   */

  document
    .querySelectorAll(
      "[data-quick]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async () => {

            const action =
              button.dataset.quick;


            if (
              action ===
              "post"
            ) {

              showCreatePost(
                renderApp
              );

              return;
            }


            if (
              action ===
              "chat"
            ) {

              state.page =
                "chat";

              if (
                typeof renderApp ===
                "function"
              ) {
                renderApp();
              }


              /*
               * Wait for the Chat page
               * to render before opening
               * the new-chat modal.
               */

              setTimeout(
                () => {

                  showNewChat(
                    renderApp
                  );

                },
                50
              );

              return;
            }


            if (
              action ===
              "timetrust"
            ) {

              state.page =
                "timetrust";

              if (
                typeof renderApp ===
                "function"
              ) {
                renderApp();
              }

              return;
            }


            if (
              action ===
              "market"
            ) {

              state.marketBrowseMode =
                false;

              state.marketTab =
                "browse";

              state.page =
                "market";

              if (
                typeof renderApp ===
                "function"
              ) {
                renderApp();
              }

              return;
            }

          }
        );
      }
    );


  /*
   * First Home visit discovery.
   */

  showHomeDiscovery(
    renderApp
  );
}
