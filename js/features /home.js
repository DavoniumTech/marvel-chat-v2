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
  setDoc,
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


/* =========================================================
   HOME STATE
   ========================================================= */

let savedPostIds = new Set();

let savedPostsLoadedForUid = null;

let savedPostsLoading = null;

const pendingLikeIds = new Set();

const pendingSaveIds = new Set();


/* =========================================================
   SAVED POSTS
   ========================================================= */

async function loadSavedPostIds() {

  const uid =
    state.user?.uid;

  if (!uid) {

    savedPostIds =
      new Set();

    savedPostsLoadedForUid =
      null;

    return;
  }

  if (
    savedPostsLoadedForUid ===
    uid
  ) {
    return;
  }

  if (savedPostsLoading) {
    return savedPostsLoading;
  }

  savedPostsLoading =
    (async () => {

      try {

        const snap =
          await getDocs(
            collection(
              db,
              "users",
              uid,
              "savedPosts"
            )
          );

        savedPostIds =
          new Set(
            snap.docs.map(
              item =>
                String(item.id)
            )
          );

        savedPostsLoadedForUid =
          uid;

      } catch (error) {

        console.warn(
          "Could not load saved posts:",
          error
        );

      } finally {

        savedPostsLoading =
          null;

      }

    })();

  return savedPostsLoading;
}


/* =========================================================
   HOME
   ========================================================= */

export function renderHome(
  renderApp
) {

  const me =
    state.profile?.displayName ||
    state.profile?.username ||
    "there";

  const posts =
    Array.isArray(state.posts)
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
          data-quick="skill"
          type="button"
        >
          <div class="quick-icon">
            ⏱️
          </div>

          <strong>
            Offer a skill
          </strong>

          <span>
            Trade your time
          </span>
        </button>


        <button
          class="quick"
          data-quick="sell"
          type="button"
        >
          <div class="quick-icon">
            🛍️
          </div>

          <strong>
            Sell something
          </strong>

          <span>
            Open the market
          </span>
        </button>

      </div>


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
            <div
              class="card empty"
            >

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

export function renderPost(
  p
) {

  const user =
    state.user;

  const liked =
    !!user &&
    Array.isArray(
      p.likedBy
    ) &&
    p.likedBy.includes(
      user.uid
    );

  const saved =
    !!user &&
    savedPostIds.has(
      String(p.id)
    );

  const isOwner =
    !!user &&
    p.uid === user.uid;

  return `
    <article
      class="card post"
      data-post-id="${escapeHtml(p.id)}"
    >

      <div class="post-head">

        <div class="avatar">
          ${escapeHtml(
            initials(
              p.username
            )
          )}
        </div>


        <div class="profile-meta">

          <strong>
            ${escapeHtml(
              p.username ||
              "User"
            )}
          </strong>

          <span class="small">
            ${escapeHtml(
              formatDate(
                p.createdAt
              )
            )}

            ${
              p.editedAt
                ? `
                  <span
                    class="edited-indicator"
                  >
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
                  type="button"
                  aria-label="Post options"
                  data-menu-post="${escapeHtml(
                    p.id
                  )}"
                >
                  ⋮
                </button>


                <div
                  class="dropdown-menu hidden"
                  id="postMenu-${escapeHtml(
                    p.id
                  )}"
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
                    type="button"
                    data-edit-post="${escapeHtml(
                      p.id
                    )}"
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
                    type="button"
                    data-delete-post="${escapeHtml(
                      p.id
                    )}"
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
        ${escapeHtml(
          p.text || ""
        )}
      </div>


      <div class="post-actions">

        <button
          class="action ${liked ? "active" : ""}"
          type="button"
          data-like="${escapeHtml(
            p.id
          )}"
          ${
            pendingLikeIds.has(
              String(p.id)
            )
              ? "disabled"
              : ""
          }
        >
          ${liked ? "❤️" : "♡"}
          ${Number(
            p.likes || 0
          )}
        </button>


        <button
          class="action"
          type="button"
          data-comment="${escapeHtml(
            p.id
          )}"
        >
          💬
          ${Number(
            p.comments || 0
          )}
        </button>


        <button
          class="action"
          type="button"
          data-share="${escapeHtml(
            p.id
          )}"
        >
          ↗ Share
        </button>


        <button
          class="action ${saved ? "active" : ""}"
          type="button"
          data-save="${escapeHtml(
            p.id
          )}"
          ${
            pendingSaveIds.has(
              String(p.id)
            )
              ? "disabled"
              : ""
          }
        >
          ${
            saved
              ? "🔖 Saved"
              : "🔖 Save"
          }
        </button>

      </div>

    </article>
  `;
}


/* =========================================================
   CREATE POST
   ========================================================= */

export function showCreatePost() {

  showModal(
    "Create a community post",
    `
      <div class="field">

        <label>
          What's happening?
        </label>

        <textarea
          class="textarea"
          id="postText"
          maxlength="1000"
          placeholder="Share an idea, question, achievement or opportunity…"
        ></textarea>

      </div>

      <button
        class="btn btn-primary btn-block"
        id="publishPost"
        type="button"
      >
        Publish 🚀
      </button>
    `
  );


  document
    .getElementById(
      "publishPost"
    )
    ?.addEventListener(
      "click",
      async () => {

        const input =
          document.getElementById(
            "postText"
          );

        const text =
          input?.value
            .trim();

        if (!text) {

          toast(
            "Write something first."
          );

          return;
        }


        if (
          text.length >
          1000
        ) {

          toast(
            "Posts can contain up to 1000 characters."
          );

          return;
        }


        if (
          !state.user?.uid
        ) {

          toast(
            "Please sign in first."
          );

          return;
        }


        const btn =
          document.getElementById(
            "publishPost"
          );

        if (!btn) {
          return;
        }


        btn.disabled =
          true;

        btn.textContent =
          "Publishing…";


        try {

          const username =
            state.profile?.displayName ||
            state.profile?.username ||
            "User";


          const docRef =
            await addDoc(
              collection(
                db,
                "posts"
              ),
              {
                uid:
                  state.user.uid,

                username:
                  username,

                text:
                  text,

                likes:
                  0,

                comments:
                  0,

                likedBy:
                  [],

                createdAt:
                  serverTimestamp()
              }
            );


          const newPost =
            {
              id:
                docRef.id,

              uid:
                state.user.uid,

              username:
                username,

              text:
                text,

              likes:
                0,

              comments:
                0,

              likedBy:
                [],

              createdAt:
                new Date()
            };


          state.posts = [
            newPost,
            ...(Array.isArray(
              state.posts
            )
              ? state.posts
              : [])
          ];


          closeModal();

          toast(
            "Posted successfully 🚀"
          );

        } catch (error) {

          console.error(
            "Create post failed:",
            error
          );

          toast(
            friendly(error)
          );

          btn.disabled =
            false;

          btn.textContent =
            "Publish 🚀";
        }

      }
    );
}


/* =========================================================
   EDIT POST
   ========================================================= */

export function showEditPost(
  postId
) {

  const post =
    state.posts.find(
      p =>
        p.id ===
        postId
    );

  if (
    !post ||
    !state.user?.uid
  ) {
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

        <label>
          Edit your post
        </label>

        <textarea
          class="textarea"
          id="editPostText"
          maxlength="1000"
        >${escapeHtml(
          post.text || ""
        )}</textarea>

      </div>

      <button
        class="btn btn-primary btn-block"
        id="saveEditPost"
        type="button"
      >
        Save Changes
      </button>
    `
  );


  document
    .getElementById(
      "saveEditPost"
    )
    ?.addEventListener(
      "click",
      async () => {

        const input =
          document.getElementById(
            "editPostText"
          );

        const text =
          input?.value
            .trim();

        if (!text) {

          toast(
            "Post cannot be empty."
          );

          return;
        }


        if (
          text.length >
          1000
        ) {

          toast(
            "Posts can contain up to 1000 characters."
          );

          return;
        }


        const btn =
          document.getElementById(
            "saveEditPost"
          );

        if (!btn) {
          return;
        }


        btn.disabled =
          true;

        btn.textContent =
          "Saving…";


        try {

          await updateDoc(
            doc(
              db,
              "posts",
              postId
            ),
            {
              text:
                text,

              editedAt:
                serverTimestamp()
            }
          );


          state.posts =
            state.posts.map(
              p =>
                p.id === postId
                  ? {
                      ...p,
                      text:
                        text,

                      editedAt:
                        new Date()
                    }
                  : p
            );


          closeModal();

          toast(
            "Post updated ✓"
          );

        } catch (error) {

          console.error(
            "Edit post failed:",
            error
          );

          toast(
            friendly(error)
          );

          btn.disabled =
            false;

          btn.textContent =
            "Save Changes";
        }

      }
    );
}


/* =========================================================
   DELETE POST
   ========================================================= */

export function showDeletePostConfirmation(
  postId
) {

  const post =
    state.posts.find(
      p =>
        p.id ===
        postId
    );

  if (
    !post ||
    !state.user?.uid
  ) {
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
    "Delete this post?",
    `
      <p class="small">
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

        const btn =
          document.getElementById(
            "confirmDeletePost"
          );

        if (!btn) {
          return;
        }


        btn.disabled =
          true;

        btn.textContent =
          "Deleting…";


        try {

          await deleteDoc(
            doc(
              db,
              "posts",
              postId
            )
          );


          state.posts =
            state.posts.filter(
              p =>
                p.id !==
                postId
            );


          closeModal();

          toast(
            "Post deleted."
          );

        } catch (error) {

          console.error(
            "Delete post failed:",
            error
          );

          toast(
            friendly(error)
          );

          btn.disabled =
            false;

          btn.textContent =
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

  const user =
    state.user;

  const post =
    state.posts.find(
      x =>
        x.id ===
        id
    );

  if (
    !user ||
    !post ||
    pendingLikeIds.has(id)
  ) {
    return;
  }


  const liked =
    Array.isArray(
      post.likedBy
    ) &&
    post.likedBy.includes(
      user.uid
    );


  pendingLikeIds.add(id);


  try {

    await updateDoc(
      doc(
        db,
        "posts",
        id
      ),
      {
        likes:
          increment(
            liked
              ? -1
              : 1
          ),

        likedBy:
          liked
            ? arrayRemove(
                user.uid
              )
            : arrayUnion(
                user.uid
              )
      }
    );


    state.posts =
      state.posts.map(
        p => {

          if (
            p.id !==
            id
          ) {
            return p;
          }


          const currentLikedBy =
            Array.isArray(
              p.likedBy
            )
              ? p.likedBy
              : [];


          const newLikedBy =
            liked
              ? currentLikedBy.filter(
                  uid =>
                    uid !==
                    user.uid
                )
              : [
                  ...currentLikedBy,
                  user.uid
                ];


          return {
            ...p,

            likes:
              Math.max(
                0,
                Number(
                  p.likes ||
                  0
                ) +
                  (
                    liked
                      ? -1
                      : 1
                  )
              ),

            likedBy:
              newLikedBy
          };

        }
      );


    if (
      !liked &&
      post.uid &&
      post.uid !==
        user.uid
    ) {

      try {

        const actorName =
          state.profile?.displayName ||
          state.profile?.username ||
          "Someone";


        await addDoc(
          collection(
            db,
            "users",
            post.uid,
            "notifications"
          ),
          {
            type:
              "like",

            actorUid:
              user.uid,

            actorName:
              actorName,

            targetId:
              id,

            text:
              `${actorName} liked your post.`,

            read:
              false,

            createdAt:
              serverTimestamp()
          }
        );

      } catch (
        notificationError
      ) {

        console.warn(
          "Could not create like notification:",
          notificationError
        );

      }

    }

  } catch (error) {

    console.error(
      "Like operation failed:",
      error
    );

    toast(
      friendly(error)
    );

  } finally {

    pendingLikeIds.delete(
      id
    );

  }
}


/* =========================================================
   SAVE POST
   ========================================================= */

export async function savePost(
  id
) {

  const user =
    state.user;

  const post =
    state.posts.find(
      x =>
        x.id ===
        id
    );

  if (
    !user ||
    !post ||
    pendingSaveIds.has(id)
  ) {
    return;
  }


  const postId =
    String(id);


  pendingSaveIds.add(
    postId
  );


  const saved =
    savedPostIds.has(
      postId
    );


  const savedRef =
    doc(
      db,
      "users",
      user.uid,
      "savedPosts",
      postId
    );


  try {

    if (saved) {

      await deleteDoc(
        savedRef
      );

      savedPostIds.delete(
        postId
      );

    } else {

      await setDoc(
        savedRef,
        {
          postId:
            postId,

          uid:
            user.uid,

          createdAt:
            serverTimestamp()
        }
      );

      savedPostIds.add(
        postId
      );

    }


    const buttons =
      document.querySelectorAll(
        `[data-save="${CSS.escape(
          postId
        )}"]`
      );


    buttons.forEach(
      button => {

        button.classList.toggle(
          "active",
          !saved
        );

        button.textContent =
          !saved
            ? "🔖 Saved"
            : "🔖 Save";

        button.disabled =
          false;

      }
    );


    toast(
      saved
        ? "Removed from saved posts."
        : "Saved to your vault 🔖"
    );

  } catch (error) {

    console.error(
      "Save operation failed:",
      error
    );

    toast(
      friendly(error)
    );

  } finally {

    pendingSaveIds.delete(
      postId
    );


    document
      .querySelectorAll(
        `[data-save="${CSS.escape(
          postId
        )}"]`
      )
      .forEach(
        button => {
          button.disabled =
            false;
        }
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
      x =>
        x.id ===
        id
    );

  if (!post) {
    return;
  }


  const text =
    `${post.username || "Someone"} on Marvel Chat:\n\n${post.text || ""}`;


  try {

    if (
      navigator.share &&
      typeof navigator.share ===
        "function"
    ) {

      await navigator.share(
        {
          title:
            "Marvel Chat",

          text:
            text
        }
      );

    } else if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText ===
        "function"
    ) {

      await navigator.clipboard.writeText(
        text
      );

      toast(
        "Post copied to clipboard 📋"
      );

    } else {

      toast(
        "Sharing is not available on this device."
      );

    }

  } catch (error) {

    if (
      error?.name !==
      "AbortError"
    ) {

      toast(
        "Could not share this post."
      );

    }

  }
}


/* =========================================================
   COMMENTS
   ========================================================= */

export async function showComments(
  id
) {

  const post =
    state.posts.find(
      x =>
        x.id ===
        id
    );


  showModal(
    "Comments",
    `
      <div
        id="commentsList"
        class="list"
      >
        <div class="empty">
          Loading comments…
        </div>
      </div>

      <div
        style="height:14px"
      ></div>

      <textarea
        class="textarea"
        id="commentText"
        maxlength="500"
        placeholder="Write a comment…"
      ></textarea>

      <button
        class="btn btn-primary btn-block"
        id="addComment"
        type="button"
        style="margin-top:8px"
      >
        Add comment
      </button>
    `
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
          limit(50)
        )
      );


    const comments =
      snap.docs.map(
        d => ({
          id:
            d.id,
          ...d.data()
        })
      );


    const list =
      document.getElementById(
        "commentsList"
      );


    if (list) {

      list.className =
        comments.length
          ? "list"
          : "empty";


      list.innerHTML =
        comments.length
          ? comments
              .map(
                comment => `
                  <div
                    class="list-item"
                  >

                    <strong>
                      ${escapeHtml(
                        comment.username ||
                        comment.displayName ||
                        "User"
                      )}
                    </strong>

                    <div>
                      ${escapeHtml(
                        comment.text ||
                        ""
                      )}
                    </div>

                    <div
                      class="small"
                    >
                      ${escapeHtml(
                        formatDate(
                          comment.createdAt
                        )
                      )}
                    </div>

                  </div>
                `
              )
              .join("")
          : "No comments yet. Start the conversation.";

    }

  } catch (error) {

    const list =
      document.getElementById(
        "commentsList"
      );

    if (list) {

      list.innerHTML =
        `
          <div class="status error">
            ${escapeHtml(
              friendly(error)
            )}
          </div>
        `;

    }

  }


  document
    .getElementById(
      "addComment"
    )
    ?.addEventListener(
      "click",
      async () => {

        const input =
          document.getElementById(
            "commentText"
          );

        const text =
          input?.value
            .trim();


        if (!text) {

          toast(
            "Write a comment first."
          );

          return;
        }


        if (
          text.length >
          500
        ) {

          toast(
            "Comments can contain up to 500 characters."
          );

          return;
        }


        if (
          !state.user?.uid
        ) {

          toast(
            "Please sign in first."
          );

          return;
        }


        const button =
          document.getElementById(
            "addComment"
          );

        if (!button) {
          return;
        }


        button.disabled =
          true;

        button.textContent =
          "Adding…";


        try {

          const actorName =
            state.profile?.displayName ||
            state.profile?.username ||
            "User";


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
                actorName,

              text:
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
              comments:
                increment(1)
            }
          );


          if (
            post?.uid &&
            post.uid !==
              state.user.uid
          ) {

            try {

              await addDoc(
                collection(
                  db,
                  "users",
                  post.uid,
                  "notifications"
                ),
                {
                  type:
                    "comment",

                  actorUid:
                    state.user.uid,

                  actorName:
                    actorName,

                  targetId:
                    id,

                  text:
                    `${actorName} commented on your post.`,

                  read:
                    false,

                  createdAt:
                    serverTimestamp()
                }
              );

            } catch (
              notificationError
            ) {

              console.warn(
                "Could not create comment notification:",
                notificationError
              );

            }

          }


          state.posts =
            state.posts.map(
              item =>
                item.id === id
                  ? {
                      ...item,

                      comments:
                        Math.max(
                          0,
                          Number(
                            item.comments ||
                            0
                          ) + 1
                        )
                    }
                  : item
            );


          if (input) {
            input.value =
              "";
          }


          toast(
            "Comment added 💬"
          );


          button.disabled =
            false;

          button.textContent =
            "Add comment";


          await showComments(
            id
          );

        } catch (error) {

          console.error(
            "Comment operation failed:",
            error
          );

          toast(
            friendly(error)
          );

          button.disabled =
            false;

          button.textContent =
            "Add comment";
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
   * Load saved-post state after
   * the Home DOM has rendered.
   */

  loadSavedPostIds()
    .catch(
      error => {
        console.warn(
          "Saved posts load failed:",
          error
        );
      }
    );


  /* =======================================================
     LIKE
     ======================================================= */

  document
    .querySelectorAll(
      "[data-like]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            toggleLike(
              button.dataset.like
            );

          }
        );

      }
    );


  /* =======================================================
     SAVE
     ======================================================= */

  document
    .querySelectorAll(
      "[data-save]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            savePost(
              button.dataset.save
            );

          }
        );

      }
    );


  /* =======================================================
     SHARE
     ======================================================= */

  document
    .querySelectorAll(
      "[data-share]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            sharePost(
              button.dataset.share
            );

          }
        );

      }
    );


  /* =======================================================
     COMMENTS
     ======================================================= */

  document
    .querySelectorAll(
      "[data-comment]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            showComments(
              button.dataset.comment
            );

          }
        );

      }
    );


  /* =======================================================
     POST MENUS
     ======================================================= */

  document
    .querySelectorAll(
      "[data-menu-post]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          event => {

            event.stopPropagation();


            const menu =
              document.getElementById(
                `postMenu-${button.dataset.menuPost}`
              );


            if (!menu) {
              return;
            }


            document
              .querySelectorAll(
                ".dropdown-menu"
              )
              .forEach(
                item => {

                  if (
                    item !==
                    menu
                  ) {

                    item.classList.add(
                      "hidden"
                    );

                  }

                }
              );


            menu.classList.toggle(
              "hidden"
            );

          }
        );

      }
    );


  /* =======================================================
     EDIT POST
     ======================================================= */

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


  /* =======================================================
     DELETE POST
     ======================================================= */

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


  /* =======================================================
     CLOSE POST MENUS
     ======================================================= */

  document.addEventListener(
    "click",
    event => {

      if (
        !event.target.closest(
          ".dropdown-container"
        )
      ) {

        document
          .querySelectorAll(
            ".dropdown-menu"
          )
          .forEach(
            menu => {

              menu.classList.add(
                "hidden"
              );

            }
          );

      }

    },
    {
      once: true
    }
  );


  /* =======================================================
     CREATE POST BUTTON
     ======================================================= */

  document
    .getElementById(
      "createPostBtn"
    )
    ?.addEventListener(
      "click",
      showCreatePost
    );


  document
    .getElementById(
      "emptyCreatePost"
    )
    ?.addEventListener(
      "click",
      showCreatePost
    );


  /* =======================================================
     QUICK CREATE POST
     ======================================================= */

  document
    .querySelectorAll(
      '[data-quick="post"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          showCreatePost
        );

      }
    );


  /* =======================================================
     QUICK CHAT
     ======================================================= */

  document
    .querySelectorAll(
      '[data-quick="chat"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            state.page =
              "chat";

            renderApp();

          }
        );

      }
    );


  /* =======================================================
     QUICK TIMETRUST
     ======================================================= */

  document
    .querySelectorAll(
      '[data-quick="skill"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            state.page =
              "timetrust";

            renderApp();

          }
        );

      }
    );


  /* =======================================================
     QUICK MARKET
     ======================================================= */

  document
    .querySelectorAll(
      '[data-quick="sell"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            state.marketBrowseMode =
              false;

            state.page =
              "market";

            renderApp();

          }
        );

      }
    );

}
