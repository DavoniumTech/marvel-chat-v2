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
  getDoc,
  getDocs,
  query,
  limit,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove
} from "../firebase/firestore.js";

import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";

let savedPostIds = new Set();
let savedPostsLoadedForUid = null;
const pendingLikeIds = new Set();
const pendingSaveIds = new Set();
let homePostSearch = "";
let homeDocumentClickHandler = null;

function cssEscape(value) {
  if (
    typeof CSS !== "undefined" &&
    typeof CSS.escape === "function"
  ) {
    return CSS.escape(String(value));
  }

  return String(value).replace(
    /[^a-zA-Z0-9_-]/g,
    "\\$&"
  );
}

function currentName() {
  return (
    state.profile?.displayName ||
    state.profile?.username ||
    "User"
  );
}

function toDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value.toDate();
  }

  if (typeof value === "number") {
    return new Date(value);
  }

  if (typeof value === "string") {
    const d = new Date(value);

    return Number.isNaN(d.getTime())
      ? null
      : d;
  }

  if (
    typeof value?.seconds ===
    "number"
  ) {
    return new Date(
      value.seconds * 1000
    );
  }

  return null;
}

function isExpired(post) {
  const d = toDate(
    post?.expiresAt
  );

  return (
    !!d &&
    d.getTime() <= Date.now()
  );
}

async function resolvePost(id) {
  if (!id) {
    return null;
  }

  const cached =
    (
      Array.isArray(state.posts)
        ? state.posts
        : []
    ).find(
      p =>
        p?.id === id
    );

  if (cached) {
    return cached;
  }

  try {
    const snap =
      await getDoc(
        doc(
          db,
          "posts",
          id
        )
      );

    if (!snap.exists()) {
      return null;
    }

    const post = {
      id: snap.id,
      ...snap.data()
    };

    const map =
      new Map();

    (
      Array.isArray(state.posts)
        ? state.posts
        : []
    ).forEach(
      p => {
        if (p?.id) {
          map.set(
            p.id,
            p
          );
        }
      }
    );

    map.set(
      post.id,
      post
    );

    state.posts =
      Array.from(
        map.values()
      );

    return post;
  } catch (error) {
    console.warn(
      "[Home] Could not resolve post:",
      id,
      error
    );

    return null;
  }
}

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
        snap.docs
          .map(
            d => d.id
          )
          .filter(Boolean)
      );

    savedPostsLoadedForUid =
      uid;

    state.savedPostCount =
      savedPostIds.size;
  } catch (error) {
    console.warn(
      "[Home] Saved posts load failed:",
      error
    );
  }
}

function isLiked(post) {
  return (
    !!state.user &&
    Array.isArray(
      post?.likedBy
    ) &&
    post.likedBy.includes(
      state.user.uid
    )
  );
}

function isSaved(post) {
  return (
    !!state.user &&
    (
      savedPostIds.has(
        post.id
      ) ||
      (
        Array.isArray(
          post?.savedBy
        ) &&
        post.savedBy.includes(
          state.user.uid
        )
      )
    )
  );
}

function likeCount(post) {
  return typeof post?.likes ===
    "number"
    ? post.likes
    : Array.isArray(
        post?.likedBy
      )
      ? post.likedBy.length
      : 0;
}

export function renderPost(
  post
) {
  if (!post?.id) {
    return "";
  }

  const author =
    post.username ||
    post.displayName ||
    post.authorName ||
    "User";

  const own =
    state.user?.uid ===
    post.uid;

  const liked =
    isLiked(post);

  const saved =
    isSaved(post);

  return `
    <article
      class="card post"
      data-post-card="${cssEscape(
        post.id
      )}"
    >

      <div class="post-head">

        <div class="avatar">
          ${escapeHtml(
            initials(author)
          )}
        </div>

        <div class="profile-meta">

          <strong>
            ${escapeHtml(
              author
            )}
          </strong>

          <span class="small">
            ${escapeHtml(
              formatDate(
                post.createdAt
              )
            )}
            ${
              post.editedAt
                ? " · Edited"
                : ""
            }
          </span>

        </div>

        ${
          own
            ? `
              <div
                class="dropdown-container"
                style="
                  margin-left:auto;
                  position:relative;
                "
              >

                <button
                  class="icon-btn"
                  type="button"
                  data-menu-post="${cssEscape(
                    post.id
                  )}"
                  aria-label="Post options"
                >
                  ⋮
                </button>

                <div
                  class="dropdown-menu hidden"
                  id="postMenu-${cssEscape(
                    post.id
                  )}"
                >

                  <button
                    class="btn-text"
                    type="button"
                    data-edit-post="${cssEscape(
                      post.id
                    )}"
                  >
                    Edit post
                  </button>

                  <button
                    class="btn-text"
                    type="button"
                    data-delete-post="${cssEscape(
                      post.id
                    )}"
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
          post.text ||
          post.content ||
          ""
        )}
      </div>

      ${
        post.imageUrl
          ? `
            <img
              src="${escapeHtml(
                post.imageUrl
              )}"
              alt="Post image"
              style="
                width:100%;
                max-height:520px;
                object-fit:cover;
                border-radius:16px;
                margin-top:14px;
              "
            >
          `
          : ""
      }

      <div class="post-actions">

        <button
          class="action ${
            liked
              ? "active"
              : ""
          }"
          type="button"
          data-like="${cssEscape(
            post.id
          )}"
        >
          ${
            liked
              ? "❤️"
              : "♡"
          }
          ${likeCount(post)}
        </button>

        <button
          class="action"
          type="button"
          data-comment="${cssEscape(
            post.id
          )}"
        >
          💬
          ${Number(
            post.comments ||
            0
          )}
        </button>

        <button
          class="action"
          type="button"
          data-share="${cssEscape(
            post.id
          )}"
        >
          ↗ Share
        </button>

        <button
          class="action ${
            saved
              ? "active"
              : ""
          }"
          type="button"
          data-save="${cssEscape(
            post.id
          )}"
        >
          🔖
          ${
            saved
              ? "Saved"
              : "Save"
          }
        </button>

      </div>

    </article>
  `;
}

function renderQuickActions() {
  return `
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
          Discover products and listings
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
          Discover skills and services
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
          Chat with someone
        </strong>

        <span>
          Talk to someone
        </span>
      </button>

    </div>
  `;
}

export function renderHome(
  renderApp
) {
  const name =
    state.profile?.displayName ||
    state.profile?.username ||
    "there";

  const allPosts =
    (
      Array.isArray(
        state.posts
      )
        ? state.posts
        : []
    ).filter(
      p =>
        p &&
        !isExpired(p)
    );

  const term =
    homePostSearch
      .trim()
      .toLowerCase();

  const posts =
    term
      ? allPosts.filter(
          p =>
            [
              p.username,
              p.displayName,
              p.authorName,
              p.text,
              p.content
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(
                term
              )
        )
      : allPosts;

  return `
    <div class="page">

      <section class="hero">

        <h1>
          Hey ${escapeHtml(
            name
          )} 👋
        </h1>

        <p>
          Welcome to your futuristic
          community. Connect, chat,
          trade skills and discover what
          people around you are building.
        </p>

      </section>


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


      <div
        class="search"
        style="margin:0 0 16px;"
      >

        <input
          class="input"
          id="communityFeedSearch"
          type="search"
          autocomplete="off"
          placeholder="Search posts…"
          value="${escapeHtml(
            homePostSearch
          )}"
          aria-label="Search community posts"
        >

      </div>


      ${renderQuickActions()}


      ${
        posts.length
          ? posts
              .map(
                renderPost
              )
              .join("")
          : term
            ? `
              <div class="card empty">

                <div
                  style="font-size:38px"
                >
                  🔎
                </div>

                <h3>
                  No posts found
                </h3>

                <p>
                  Try another word
                  or search phrase.
                </p>

              </div>
            `
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
                  Be the first person
                  to start the conversation.
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

function refreshPostCard(
  id
) {
  const post =
    (
      state.posts ||
      []
    ).find(
      p =>
        p.id === id
    );

  const card =
    document.querySelector(
      `[data-post-card="${cssEscape(
        id
      )}"]`
    );

  if (
    !post ||
    !card
  ) {
    return;
  }

  const holder =
    document.createElement(
      "div"
    );

  holder.innerHTML =
    renderPost(post);

  const next =
    holder.firstElementChild;

  if (!next) {
    return;
  }

  card.replaceWith(
    next
  );

  attachSinglePostEvents(
    next
  );
}

async function toggleLike(
  id
) {
  if (!state.user) {
    toast(
      "Please sign in to like posts."
    );
    return;
  }

  if (
    !id ||
    pendingLikeIds.has(id)
  ) {
    return;
  }

  const post =
    await resolvePost(id);

  if (!post) {
    toast(
      "This post could not be found in Firestore."
    );
    return;
  }

  pendingLikeIds.add(id);

  const liked =
    isLiked(post);

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
                state.user.uid
              )
            : arrayUnion(
                state.user.uid
              )
      }
    );

    state.posts =
      (
        state.posts ||
        []
      ).map(
        p =>
          p.id === id
            ? {
                ...p,

                likes:
                  Math.max(
                    0,
                    likeCount(p) +
                      (
                        liked
                          ? -1
                          : 1
                      )
                  ),

                likedBy:
                  liked
                    ? (
                        Array.isArray(
                          p.likedBy
                        )
                          ? p.likedBy.filter(
                              x =>
                                x !==
                                state.user.uid
                            )
                          : []
                      )
                    : Array.from(
                        new Set([
                          ...(
                            Array.isArray(
                              p.likedBy
                            )
                              ? p.likedBy
                              : []
                          ),
                          state.user.uid
                        ])
                      )
              }
            : p
      );

    if (
      !liked &&
      post.uid &&
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
              "like",

            actorUid:
              state.user.uid,

            actorName:
              currentName(),

            targetId:
              id,

            text:
              `${currentName()} liked your post.`,

            read:
              false,

            createdAt:
              serverTimestamp()
          }
        );
      } catch (
        error
      ) {
        console.warn(
          "[Home] Like notification failed:",
          error
        );
      }
    }

    refreshPostCard(id);
  } catch (error) {
    toast(
      friendly(error)
    );
  } finally {
    pendingLikeIds.delete(
      id
    );
  }
}

export async function savePost(
  id
) {
  if (!state.user) {
    toast(
      "Please sign in to save posts."
    );
    return;
  }

  if (
    !id ||
    pendingSaveIds.has(id)
  ) {
    return;
  }

  const post =
    await resolvePost(id);

  if (!post) {
    toast(
      "This post could not be found in Firestore."
    );
    return;
  }

  pendingSaveIds.add(id);

  const ref =
    doc(
      db,
      "users",
      state.user.uid,
      "savedPosts",
      id
    );

  const saved =
    isSaved(post);

  try {
    if (saved) {
      await deleteDoc(
        ref
      );

      savedPostIds.delete(
        id
      );

      state.savedPostCount =
        savedPostIds.size;
    } else {
      await setDoc(
        ref,
        {
          postId:
            id,

          uid:
            state.user.uid,

          createdAt:
            serverTimestamp()
        }
      );

      savedPostIds.add(
        id
      );

      state.savedPostCount =
        savedPostIds.size;
    }

    state.posts =
      (
        state.posts ||
        []
      ).map(
        p =>
          p.id === id
            ? {
                ...p,

                savedBy:
                  saved
                    ? (
                        Array.isArray(
                          p.savedBy
                        )
                          ? p.savedBy.filter(
                              x =>
                                x !==
                                state.user.uid
                            )
                          : []
                      )
                    : Array.from(
                        new Set([
                          ...(
                            Array.isArray(
                              p.savedBy
                            )
                              ? p.savedBy
                              : []
                          ),
                          state.user.uid
                        ])
                      )
              }
            : p
      );

    refreshPostCard(
      id
    );

    toast(
      saved
        ? "Post removed from Saved."
        : "Post saved 🔖"
    );
  } catch (error) {
    toast(
      friendly(error)
    );
  } finally {
    pendingSaveIds.delete(
      id
    );
  }
}

export async function sharePost(
  id
) {
  const post =
    await resolvePost(id);

  if (!post) {
    toast(
      "This post could not be found in Firestore."
    );
    return;
  }

  const text =
    post.text ||
    post.content ||
    "";

  const data = {
    title:
      "Marvel Chat",

    text:
      `${currentName()} shared a post on Marvel Chat: ${text}`
  };

  try {
    if (
      navigator.share
    ) {
      return await navigator.share(
        data
      );
    }

    const fallback =
      `${data.title}: ${data.text}`;

    if (
      navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(
        fallback
      );

      toast(
        "Post text copied."
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
        friendly(error)
      );
    }
  }
}

export async function showComments(
  id
) {
  const post =
    await resolvePost(id);

  if (!post) {
    toast(
      "This post could not be found in Firestore."
    );
    return;
  }

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
        style="margin-top:8px"
        type="button"
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
          limit(100)
        )
      );

    const comments =
      snap.docs
        .map(
          d => ({
            id:
              d.id,
            ...d.data()
          })
        )
        .sort(
          (
            a,
            b
          ) => {
            const t =
              value => {
                if (
                  value?.toMillis
                ) {
                  return value.toMillis();
                }

                if (
                  value?.toDate
                ) {
                  return value.toDate().getTime();
                }

                const n =
                  new Date(
                    value ||
                    0
                  ).getTime();

                return Number.isFinite(
                  n
                )
                  ? n
                  : 0;
              };

            return (
              t(a.createdAt) -
              t(b.createdAt)
            );
          }
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
                c => `
                  <div
                    class="list-item"
                  >

                    <strong>
                      ${escapeHtml(
                        c.username ||
                        "User"
                      )}
                    </strong>

                    <div>
                      ${escapeHtml(
                        c.text ||
                        ""
                      )}
                    </div>

                    <div
                      class="small"
                    >
                      ${escapeHtml(
                        formatDate(
                          c.createdAt
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
      list.innerHTML = `
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
          input?.value.trim() ||
          "";

        if (!text) {
          toast(
            "Write a comment first."
          );
          return;
        }

        const button =
          document.getElementById(
            "addComment"
          );

        if (button) {
          button.disabled =
            true;

          button.textContent =
            "Adding…";
        }

        try {
          const actorName =
            currentName();

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

          state.posts =
            (
              state.posts ||
              []
            ).map(
              p =>
                p.id === id
                  ? {
                      ...p,

                      comments:
                        Number(
                          p.comments ||
                          0
                        ) + 1
                    }
                  : p
            );

          if (
            post.uid &&
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
              error
            ) {
              console.warn(
                "[Home] Comment notification failed:",
                error
              );
            }
          }

          toast(
            "Comment added 💬"
          );

          await showComments(
            id
          );
        } catch (error) {
          toast(
            friendly(error)
          );

          if (button) {
            button.disabled =
              false;

            button.textContent =
              "Add comment";
          }
        }
      }
    );
}

export function showCreatePost() {
  showModal(
    "Create a community post",
    `
      <div class="field">

        <label
          for="postText"
        >
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
          input?.value.trim() ||
          "";

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
            "Post must be 1000 characters or less."
          );
          return;
        }

        const button =
          document.getElementById(
            "publishPost"
          );

        if (button) {
          button.disabled =
            true;

          button.textContent =
            "Publishing…";
        }

        try {
          const username =
            currentName();

          const ref =
            await addDoc(
              collection(
                db,
                "posts"
              ),
              {
                uid:
                  state.user.uid,

                username,

                text,

                likes:
                  0,

                comments:
                  0,

                likedBy:
                  [],

                savedBy:
                  [],

                createdAt:
                  serverTimestamp()
              }
            );

          state.posts = [
            {
              id:
                ref.id,

              uid:
                state.user.uid,

              username,

              text,

              likes:
                0,

              comments:
                0,

              likedBy:
                [],

              savedBy:
                [],

              createdAt:
                new Date()
            },

            ...(
              Array.isArray(
                state.posts
              )
                ? state.posts
                : []
            )
          ];

          closeModal();

          toast(
            "Posted successfully 🚀"
          );
        } catch (error) {
          toast(
            friendly(error)
          );

          if (button) {
            button.disabled =
              false;

            button.textContent =
              "Publish 🚀";
          }
        }
      }
    );
}

export async function showEditPost(
  id
) {
  if (!state.user) {
    toast(
      "Please sign in first."
    );
    return;
  }

  const post =
    await resolvePost(id);

  if (
    !post ||
    post.uid !==
      state.user.uid
  ) {
    toast(
      "You can only edit your own post."
    );
    return;
  }

  showModal(
    "Edit post",
    `
      <div class="field">

        <label
          for="editPostText"
        >
          Edit your post
        </label>

        <textarea
          class="textarea"
          id="editPostText"
          maxlength="1000"
        >${escapeHtml(
          post.text ||
          ""
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
          input?.value.trim() ||
          "";

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
            "Post must be 1000 characters or less."
          );
          return;
        }

        const button =
          document.getElementById(
            "saveEditPost"
          );

        if (button) {
          button.disabled =
            true;

          button.textContent =
            "Saving…";
        }

        try {
          await updateDoc(
            doc(
              db,
              "posts",
              id
            ),
            {
              text,

              editedAt:
                serverTimestamp()
            }
          );

          state.posts =
            (
              state.posts ||
              []
            ).map(
              p =>
                p.id === id
                  ? {
                      ...p,
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
          toast(
            friendly(error)
          );

          if (button) {
            button.disabled =
              false;

            button.textContent =
              "Save Changes";
          }
        }
      }
    );
}

export async function showDeletePostConfirmation(
  id
) {
  if (!state.user) {
    toast(
      "Please sign in first."
    );
    return;
  }

  const post =
    await resolvePost(id);

  if (
    !post ||
    post.uid !==
      state.user.uid
  ) {
    toast(
      "You can only delete your own post."
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
          style="flex:1"
          type="button"
        >
          Cancel
        </button>

        <button
          class="btn btn-danger"
          id="confirmDeletePost"
          style="flex:1"
          type="button"
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

        if (button) {
          button.disabled =
            true;

          button.textContent =
            "Deleting…";
        }

        try {
          await deleteDoc(
            doc(
              db,
              "posts",
              id
            )
          );

          state.posts =
            (
              state.posts ||
              []
            ).filter(
              p =>
                p.id !== id
            );

          savedPostIds.delete(
            id
          );

          if (
            state.savedPostCount !=
            null
          ) {
            state.savedPostCount =
              savedPostIds.size;
          }

          closeModal();

          toast(
            "Post deleted."
          );
        } catch (error) {
          toast(
            friendly(error)
          );

          if (button) {
            button.disabled =
              false;

            button.textContent =
              "Delete";
          }
        }
      }
    );
}

function filterRenderedPosts(
  value
) {
  const term =
    String(value || "")
      .trim()
      .toLowerCase();

  document
    .querySelectorAll(
      "[data-post-card]"
    )
    .forEach(
      card => {
        card.style.display =
          !term ||
          card.textContent
            .toLowerCase()
            .includes(term)
            ? ""
            : "none";
      }
    );
}

function attachSinglePostEvents(
  root
) {
  root
    .querySelectorAll(
      "[data-like]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          () =>
            toggleLike(
              button.dataset.like
            )
        )
    );

  root
    .querySelectorAll(
      "[data-save]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          () =>
            savePost(
              button.dataset.save
            )
        )
    );

  root
    .querySelectorAll(
      "[data-share]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          () =>
            sharePost(
              button.dataset.share
            )
        )
    );

  root
    .querySelectorAll(
      "[data-comment]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          () =>
            showComments(
              button.dataset.comment
            )
        )
    );

  root
    .querySelectorAll(
      "[data-edit-post]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          event => {
            event.stopPropagation();

            showEditPost(
              button.dataset.editPost
            );
          }
        )
    );

  root
    .querySelectorAll(
      "[data-delete-post]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          event => {
            event.stopPropagation();

            showDeletePostConfirmation(
              button.dataset.deletePost
            );
          }
        )
    );

  root
    .querySelectorAll(
      "[data-menu-post]"
    )
    .forEach(
      button =>
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
                other => {
                  if (
                    other !==
                    menu
                  ) {
                    other.classList.add(
                      "hidden"
                    );
                  }
                }
              );

            menu.classList.toggle(
              "hidden"
            );
          }
        )
    );
}

export function attachHomeEvents(
  renderApp
) {
  loadSavedPostIds();

  document
    .querySelectorAll(
      "[data-quick]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          () => {
            const action =
              button.dataset.quick;

            if (
              action ===
              "post"
            ) {
              showCreatePost();
              return;
            }

            if (
              action ===
              "chat"
            ) {
              state.page =
                "chat";
            }

            if (
              action ===
              "timetrust"
            ) {
              state.page =
                "timetrust";
            }

            if (
              action ===
              "market"
            ) {
              state.marketBrowseMode =
                false;

              state.page =
                "market";
            }

            renderApp?.();
          }
        )
    );

  document
    .getElementById(
      "communityFeedSearch"
    )
    ?.addEventListener(
      "input",
      event => {
        homePostSearch =
          event.target.value ||
          "";

        filterRenderedPosts(
          homePostSearch
        );
      }
    );

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

  document
    .querySelectorAll(
      "[data-post-card]"
    )
    .forEach(
      card =>
        attachSinglePostEvents(
          card
        )
    );

  if (
    !homeDocumentClickHandler
  ) {
    homeDocumentClickHandler =
      event => {
        if (
          event.target.closest(
            ".dropdown-container"
          )
        ) {
          return;
        }

        document
          .querySelectorAll(
            ".dropdown-menu"
          )
          .forEach(
            menu =>
              menu.classList.add(
                "hidden"
              )
          );
      };

    document.addEventListener(
      "click",
      homeDocumentClickHandler
    );
  }
}

export function isDiscoveryDismissed() {
  return true;
}

export function dismissDiscovery() {}
