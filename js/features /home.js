// js/features /home.js

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
  orderBy,
  limit,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove
} from "../firebase/firestore.js";

import {
  showModal,
  closeModal
} from "../components/modal.js";

import { toast } from "../components/toast.js";


const POST_EXPIRY_OPTIONS = [
  {
    value: "12h",
    label: "12 hours",
    milliseconds: 12 * 60 * 60 * 1000
  },
  {
    value: "1d",
    label: "1 day",
    milliseconds: 24 * 60 * 60 * 1000
  },
  {
    value: "7d",
    label: "1 week",
    milliseconds: 7 * 24 * 60 * 60 * 1000
  },
  {
    value: "30d",
    label: "30 days",
    milliseconds: 30 * 24 * 60 * 60 * 1000
  }
];


let savedPostIds = new Set();
let savedPostsLoadedForUid = null;

const pendingLikeIds = new Set();
const pendingSaveIds = new Set();

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


function getCurrentUserName() {
  return (
    state.profile?.displayName ||
    state.profile?.username ||
    "User"
  );
}


function timestampToDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (typeof value === "number") {
    return new Date(value);
  }

  if (typeof value === "string") {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000);
  }

  return null;
}


function isPostExpired(post) {
  if (!post?.expiresAt) {
    return false;
  }

  const expiry = timestampToDate(post.expiresAt);

  if (!expiry) {
    return false;
  }

  return expiry.getTime() <= Date.now();
}


function formatExpiryLabel(post) {
  if (!post?.expiresAt) {
    return "";
  }

  const expiry = timestampToDate(post.expiresAt);

  if (!expiry) {
    return "";
  }

  const remaining =
    expiry.getTime() - Date.now();

  if (remaining <= 0) {
    return "Expired";
  }

  const minutes = Math.floor(
    remaining / 60000
  );

  const hours = Math.floor(
    minutes / 60
  );

  const days = Math.floor(
    hours / 24
  );

  if (days > 0) {
    return `${days}d remaining`;
  }

  if (hours > 0) {
    return `${hours}h remaining`;
  }

  if (minutes > 0) {
    return `${minutes}m remaining`;
  }

  return "Ending soon";
}


function getPostExpiryDate(value) {
  const option =
    POST_EXPIRY_OPTIONS.find(
      item => item.value === value
    );

  if (!option) {
    return null;
  }

  return new Date(
    Date.now() + option.milliseconds
  );
}


function getLikeCount(post) {
  if (typeof post?.likes === "number") {
    return Math.max(0, post.likes);
  }

  if (Array.isArray(post?.likedBy)) {
    return post.likedBy.length;
  }

  return 0;
}


function isLiked(post) {
  if (!state.user) {
    return false;
  }

  return (
    Array.isArray(post?.likedBy) &&
    post.likedBy.includes(
      state.user.uid
    )
  );
}


function isSaved(post) {
  if (!state.user || !post?.id) {
    return false;
  }

  return savedPostIds.has(post.id);
}


async function loadSavedPostIds() {
  const uid = state.user?.uid;

  if (!uid) {
    savedPostIds = new Set();
    savedPostsLoadedForUid = null;
    return;
  }

  if (savedPostsLoadedForUid === uid) {
    return;
  }

  try {
    const snapshot = await getDocs(
      collection(
        db,
        "users",
        uid,
        "savedPosts"
      )
    );

    savedPostIds = new Set(
      snapshot.docs.map(
        item => item.id
      )
    );

    savedPostsLoadedForUid = uid;

    state.savedPostCount =
      savedPostIds.size;

    if (Array.isArray(state.posts)) {
      state.posts = state.posts.map(
        post => ({
          ...post,
          savedBy:
            savedPostIds.has(post.id)
              ? [
                  ...new Set([
                    ...(Array.isArray(
                      post.savedBy
                    )
                      ? post.savedBy
                      : []),
                    uid
                  ])
                ]
              : (
                  Array.isArray(
                    post.savedBy
                  )
                    ? post.savedBy.filter(
                        id => id !== uid
                      )
                    : []
                )
        })
      );
    }

    refreshSavedButtons();
  } catch (error) {
    console.warn(
      "[Home] Could not load saved posts:",
      error
    );
  }
}


function refreshSavedButtons() {
  document
    .querySelectorAll("[data-save]")
    .forEach(button => {
      const id =
        button.dataset.save;

      const saved =
        savedPostIds.has(id);

      button.innerHTML =
        saved
          ? "🔖 Saved"
          : "🔖 Save";

      button.classList.toggle(
        "active",
        saved
      );
    });
}


async function getPostById(id) {
  if (!id) {
    return null;
  }

  const cached =
    (state.posts || []).find(
      post => post?.id === id
    );

  if (cached) {
    return cached;
  }

  try {
    const snapshot =
      await getDoc(
        doc(db, "posts", id)
      );

    if (!snapshot.exists()) {
      return null;
    }

    const post = {
      id: snapshot.id,
      ...snapshot.data()
    };

    state.posts = [
      post,
      ...(Array.isArray(state.posts)
        ? state.posts.filter(
            item => item?.id !== id
          )
        : [])
    ];

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

    </div>
  `;
}


function renderHomeHeader() {
  const name =
    state.profile?.displayName ||
    state.profile?.username ||
    "there";

  return `
    <section class="hero">

      <h1>
        Hey ${escapeHtml(name)} 👋
      </h1>

      <p>
        Welcome to your futuristic community.
        Connect, chat, trade skills and discover
        what people around you are building.
      </p>

    </section>
  `;
}


function renderCommunityFeedHeader() {
  const search =
    state.homeSearch || "";

  return `
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


    <div class="search">

      <input
        class="input"
        id="communityFeedSearch"
        type="search"
        autocomplete="off"
        value="${escapeHtml(search)}"
        placeholder="Search posts…"
        aria-label="Search community posts"
      >

    </div>
  `;
}


function renderPost(post) {
  if (!post?.id) {
    return "";
  }

  const author =
    post.username ||
    post.displayName ||
    post.authorName ||
    "User";

  const text =
    post.text ||
    post.content ||
    "";

  const liked =
    isLiked(post);

  const saved =
    isSaved(post);

  const own =
    post.uid ===
    state.user?.uid;

  const expiry =
    formatExpiryLabel(post);

  const menuId =
    `postMenu-${cssEscape(post.id)}`;

  return `
    <article
      class="card post"
      data-post-card="${cssEscape(post.id)}"
    >

      <div class="post-head">

        <div class="avatar">
          ${escapeHtml(
            initials(author)
          )}
        </div>


        <div class="profile-meta">

          <strong>
            ${escapeHtml(author)}
          </strong>

          <span class="small">
            ${escapeHtml(
              formatDate(
                post.createdAt
              )
            )}

            ${
              expiry
                ? ` · ${escapeHtml(expiry)}`
                : ""
            }

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
                  class="icon-btn post-menu-btn"
                  type="button"
                  aria-label="Post options"
                  data-menu-post="${cssEscape(
                    post.id
                  )}"
                >
                  ⋮
                </button>


                <div
                  class="dropdown-menu hidden"
                  id="${menuId}"
                >

                  <button
                    class="btn-text edit-post-btn"
                    type="button"
                    data-edit-post="${cssEscape(
                      post.id
                    )}"
                  >
                    Edit post
                  </button>


                  <button
                    class="btn-text delete-post-btn"
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
        ${escapeHtml(text)}
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
            liked ? "active" : ""
          }"
          type="button"
          data-like="${cssEscape(
            post.id
          )}"
        >
          ${liked ? "❤️" : "♡"}
          ${getLikeCount(post)}
        </button>


        <button
          class="action"
          type="button"
          data-comment="${cssEscape(
            post.id
          )}"
        >
          💬 ${Number(
            post.comments || 0
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
            saved ? "active" : ""
          }"
          type="button"
          data-save="${cssEscape(
            post.id
          )}"
        >
          🔖 ${
            saved
              ? "Saved"
              : "Save"
          }
        </button>

      </div>

    </article>
  `;
}


export function renderHome(renderApp) {
  const posts =
    Array.isArray(state.posts)
      ? state.posts.filter(
          post =>
            post &&
            !isPostExpired(post)
        )
      : [];

  return `
    <div class="page">

      ${renderHomeHeader()}

      ${renderQuickActions()}

      ${renderCommunityFeedHeader()}


      ${
        posts.length
          ? posts
              .map(renderPost)
              .join("")
          : `
            <div class="card empty">

              <div style="font-size:38px">
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


function filterRenderedPosts(value) {
  state.homeSearch =
    String(value || "");

  const term =
    state.homeSearch
      .trim()
      .toLowerCase();

  document
    .querySelectorAll(
      "[data-post-card]"
    )
    .forEach(card => {
      const text =
        card.textContent
          .toLowerCase();

      card.style.display =
        !term ||
        text.includes(term)
          ? ""
          : "none";
    });
}


export async function toggleLike(id) {
  if (!state.user) {
    toast(
      "Please sign in to like posts."
    );

    return;
  }

  if (!id) {
    return;
  }

  if (pendingLikeIds.has(id)) {
    return;
  }

  const post =
    await getPostById(id);

  if (!post) {
    toast(
      "This post is no longer available."
    );

    return;
  }

  const liked =
    isLiked(post);

  pendingLikeIds.add(id);

  const button =
    document.querySelector(
      `[data-like="${cssEscape(id)}"]`
    );

  if (button) {
    button.disabled = true;
  }

  try {
    await updateDoc(
      doc(db, "posts", id),
      {
        likes:
          increment(
            liked ? -1 : 1
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

    const nextLiked =
      !liked;

    const nextLikes =
      Math.max(
        0,
        getLikeCount(post) +
          (nextLiked ? 1 : -1)
      );

    state.posts =
      (state.posts || []).map(
        item =>
          item.id === id
            ? {
                ...item,
                likes: nextLikes,
                likedBy:
                  nextLiked
                    ? [
                        ...new Set([
                          ...(Array.isArray(
                            item.likedBy
                          )
                            ? item.likedBy
                            : []),
                          state.user.uid
                        ])
                      ]
                    : (
                        Array.isArray(
                          item.likedBy
                        )
                          ? item.likedBy.filter(
                              uid =>
                                uid !==
                                state.user.uid
                            )
                          : []
                      )
              }
            : item
      );

    const updated =
      state.posts.find(
        item => item.id === id
      );

    if (
      nextLiked &&
      updated?.uid &&
      updated.uid !== state.user.uid
    ) {
      try {
        await addDoc(
          collection(
            db,
            "users",
            updated.uid,
            "notifications"
          ),
          {
            type: "like",
            actorUid:
              state.user.uid,
            actorName:
              getCurrentUserName(),
            targetId: id,
            text:
              `${getCurrentUserName()} liked your post.`,
            read: false,
            createdAt:
              serverTimestamp()
          }
        );
      } catch (error) {
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
    pendingLikeIds.delete(id);

    if (button) {
      button.disabled = false;
    }
  }
}


export async function savePost(id) {
  if (!state.user) {
    toast(
      "Please sign in to save posts."
    );

    return;
  }

  if (!id) {
    return;
  }

  if (pendingSaveIds.has(id)) {
    return;
  }

  const post =
    await getPostById(id);

  if (!post) {
    toast(
      "This post is no longer available."
    );

    return;
  }

  await loadSavedPostIds();

  const saved =
    savedPostIds.has(id);

  pendingSaveIds.add(id);

  const button =
    document.querySelector(
      `[data-save="${cssEscape(id)}"]`
    );

  if (button) {
    button.disabled = true;
  }

  try {
    const savedRef =
      doc(
        db,
        "users",
        state.user.uid,
        "savedPosts",
        id
      );

    if (saved) {
      await deleteDoc(savedRef);

      savedPostIds.delete(id);

      state.savedPostCount =
        savedPostIds.size;

      toast(
        "Post removed from Saved."
      );
    } else {
      await setDoc(
        savedRef,
        {
          postId: id,
          uid:
            state.user.uid,
          createdAt:
            serverTimestamp()
        }
      );

      savedPostIds.add(id);

      state.savedPostCount =
        savedPostIds.size;

      toast(
        "Post saved 🔖"
      );
    }

    savedPostsLoadedForUid =
      state.user.uid;

    refreshPostCard(id);
  } catch (error) {
    toast(
      friendly(error)
    );
  } finally {
    pendingSaveIds.delete(id);

    if (button) {
      button.disabled = false;
    }
  }
}


function refreshPostCard(id) {
  const post =
    state.posts.find(
      item => item.id === id
    );

  const card =
    document.querySelector(
      `[data-post-card="${cssEscape(id)}"]`
    );

  if (!post || !card) {
    return;
  }

  const holder =
    document.createElement("div");

  holder.innerHTML =
    renderPost(post);

  const replacement =
    holder.firstElementChild;

  if (!replacement) {
    return;
  }

  card.replaceWith(
    replacement
  );

  attachSinglePostEvents(
    replacement
  );
}


function attachSinglePostEvents(root) {
  root
    .querySelectorAll("[data-like]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          toggleLike(
            button.dataset.like
          )
      );
    });

  root
    .querySelectorAll("[data-save]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          savePost(
            button.dataset.save
          )
      );
    });

  root
    .querySelectorAll("[data-share]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          sharePost(
            button.dataset.share
          )
      );
    });

  root
    .querySelectorAll("[data-comment]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          showComments(
            button.dataset.comment
          )
      );
    });

  root
    .querySelectorAll("[data-edit-post]")
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          showEditPost(
            button.dataset.editPost
          );
        }
      );
    });

  root
    .querySelectorAll("[data-delete-post]")
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          showDeletePostConfirmation(
            button.dataset.deletePost
          );
        }
      );
    });

  root
    .querySelectorAll("[data-menu-post]")
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          const id =
            button.dataset.menuPost;

          const menu =
            document.getElementById(
              `postMenu-${id}`
            );

          if (!menu) {
            return;
          }

          document
            .querySelectorAll(
              ".dropdown-menu"
            )
            .forEach(other => {
              if (other !== menu) {
                other.classList.add(
                  "hidden"
                );
              }
            });

          menu.classList.toggle(
            "hidden"
          );
        }
      );
    });
}


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
          rows="5"
          placeholder="Share an idea, question, achievement or opportunity…"
        ></textarea>

      </div>


      <div class="field">

        <label>
          Post duration
        </label>

        <select
          class="select"
          id="postExpiry"
        >

          <option value="">
            No expiry
          </option>

          ${POST_EXPIRY_OPTIONS.map(
            option => `
              <option value="${option.value}">
                ${escapeHtml(
                  option.label
                )}
              </option>
            `
          ).join("")}

        </select>

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

        const expiryInput =
          document.getElementById(
            "postExpiry"
          );

        const text =
          input?.value.trim() || "";

        if (!text) {
          toast(
            "Write something first."
          );

          input?.focus();

          return;
        }

        if (text.length > 1000) {
          toast(
            "Posts can contain up to 1000 characters."
          );

          return;
        }

        const button =
          document.getElementById(
            "publishPost"
          );

        if (button) {
          button.disabled = true;
          button.textContent =
            "Publishing…";
        }

        try {
          const expiresAt =
            getPostExpiryDate(
              expiryInput?.value
            );

          const data = {
            uid:
              state.user.uid,

            username:
              getCurrentUserName(),

            text,

            likes: 0,

            comments: 0,

            likedBy: [],

            createdAt:
              serverTimestamp()
          };

          if (expiresAt) {
            data.expiresAt =
              expiresAt;
          }

          const reference =
            await addDoc(
              collection(
                db,
                "posts"
              ),
              data
            );

          const localPost = {
            id:
              reference.id,

            ...data,

            createdAt:
              new Date(),

            ...(expiresAt
              ? {
                  expiresAt
                }
              : {})
          };

          state.posts = [
            localPost,
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

          document
            .querySelector(
              ".app-content"
            )
            ?.scrollTo({
              top: 0,
              behavior: "smooth"
            });
        } catch (error) {
          console.error(
            "[Home] Create post failed:",
            error
          );

          toast(
            friendly(error)
          );

          if (button) {
            button.disabled = false;
            button.textContent =
              "Publish 🚀";
          }
        }
      }
    );
}


export async function showEditPost(id) {
  const post =
    await getPostById(id);

  if (
    !post ||
    post.uid !==
      state.user?.uid
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

        <label>
          Edit your post
        </label>

        <textarea
          class="textarea"
          id="editPostText"
          maxlength="1000"
          rows="5"
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
          input?.value.trim() || "";

        if (!text) {
          toast(
            "Post cannot be empty."
          );

          return;
        }

        if (text.length > 1000) {
          toast(
            "Posts can contain up to 1000 characters."
          );

          return;
        }

        const button =
          document.getElementById(
            "saveEditPost"
          );

        if (button) {
          button.disabled = true;
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
            state.posts.map(
              item =>
                item.id === id
                  ? {
                      ...item,
                      text,
                      editedAt:
                        new Date()
                    }
                  : item
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
            button.disabled = false;
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
  const post =
    await getPostById(id);

  if (
    !post ||
    post.uid !==
      state.user?.uid
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
          gap:8px;
          margin-top:15px;
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

        if (button) {
          button.disabled = true;
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
            state.posts.filter(
              item => item.id !== id
            );

          closeModal();

          toast(
            "Post deleted."
          );
        } catch (error) {
          toast(
            friendly(error)
          );

          if (button) {
            button.disabled = false;
            button.textContent =
              "Delete";
          }
        }
      }
    );
}


export async function sharePost(id) {
  const post =
    await getPostById(id);

  if (!post) {
    toast(
      "Post not found."
    );

    return;
  }

  const author =
    post.username ||
    post.displayName ||
    "Someone";

  const text =
    post.text ||
    post.content ||
    "";

  const shareText =
    `${author} on Marvel Chat:\n\n${text}`;

  try {
    if (
      typeof navigator.share ===
      "function"
    ) {
      await navigator.share({
        title:
          "Marvel Chat",
        text:
          shareText
      });

      return;
    }

    if (
      navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(
        shareText
      );

      toast(
        "Post copied to clipboard 📋"
      );

      return;
    }

    toast(
      "Sharing is not available on this device."
    );
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      return;
    }

    toast(
      friendly(error)
    );
  }
}


export async function showComments(id) {
  const post =
    await getPostById(id);

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
        id="commentsList"
        class="list"
      >
        <div class="empty">
          Loading comments…
        </div>
      </div>


      <div style="height:14px;"></div>


      <textarea
        class="textarea"
        id="commentText"
        maxlength="1000"
        rows="4"
        placeholder="Write a comment…"
      ></textarea>


      <button
        class="btn btn-primary btn-block"
        id="addComment"
        type="button"
        style="margin-top:8px;"
      >
        Add comment
      </button>
    `
  );

  try {
    const snapshot =
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
      snapshot.docs.map(
        item => ({
          id: item.id,
          ...item.data()
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
          ? comments.map(
              comment => `
                <div class="list-item">

                  <strong>
                    ${escapeHtml(
                      comment.username ||
                      "User"
                    )}
                  </strong>

                  <div>
                    ${escapeHtml(
                      comment.text || ""
                    )}
                  </div>

                  <div class="small">
                    ${escapeHtml(
                      formatDate(
                        comment.createdAt
                      )
                    )}
                  </div>

                </div>
              `
            ).join("")
          : `
            No comments yet.
            Start the conversation.
          `;
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
          input?.value.trim() || "";

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
          button.disabled = true;
          button.textContent =
            "Adding…";
        }

        try {
          const actorName =
            getCurrentUserName();

          const commentRef =
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
            } catch (notificationError) {
              console.warn(
                "[Home] Comment notification failed:",
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
                        Number(
                          item.comments || 0
                        ) + 1
                    }
                  : item
            );

          toast(
            "Comment added 💬"
          );

          showComments(id);
        } catch (error) {
          toast(
            friendly(error)
          );

          if (button) {
            button.disabled = false;
            button.textContent =
              "Add comment";
          }
        }
      }
    );
}


async function cleanupExpiredPosts() {
  if (!state.user) {
    return;
  }

  const expired =
    (state.posts || []).filter(
      post =>
        post.uid ===
          state.user.uid &&
        isPostExpired(post)
    );

  for (const post of expired) {
    try {
      await deleteDoc(
        doc(
          db,
          "posts",
          post.id
        )
      );

      state.posts =
        state.posts.filter(
          item =>
            item.id !== post.id
        );
    } catch (error) {
      console.warn(
        "[Home] Could not clean up expired post:",
        error
      );
    }
  }
}


export function attachHomeEvents(
  renderApp
) {
  loadSavedPostIds();

  document
    .querySelectorAll(
      "[data-quick]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const action =
            button.dataset.quick;

          if (action === "post") {
            showCreatePost();
            return;
          }

          if (action === "chat") {
            state.page = "chat";
            renderApp();
            return;
          }

          if (action === "timetrust") {
            state.page =
              "timetrust";

            renderApp();

            return;
          }

          if (action === "market") {
            state.marketBrowseMode =
              false;

            state.page =
              "market";

            renderApp();
          }
        }
      );
    });


  document
    .getElementById(
      "communityFeedSearch"
    )
    ?.addEventListener(
      "input",
      event => {
        filterRenderedPosts(
          event.target.value
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
      "[data-menu-post]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          const id =
            button.dataset.menuPost;

          const menu =
            document.getElementById(
              `postMenu-${id}`
            );

          if (!menu) {
            return;
          }

          document
            .querySelectorAll(
              ".dropdown-menu"
            )
            .forEach(other => {
              if (other !== menu) {
                other.classList.add(
                  "hidden"
                );
              }
            });

          menu.classList.toggle(
            "hidden"
          );
        }
      );
    });


  document
    .querySelectorAll(
      "[data-edit-post]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          showEditPost(
            button.dataset.editPost
          );
        }
      );
    });


  document
    .querySelectorAll(
      "[data-delete-post]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          showDeletePostConfirmation(
            button.dataset.deletePost
          );
        }
      );
    });


  document
    .querySelectorAll(
      "[data-like]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          toggleLike(
            button.dataset.like
          )
      );
    });


  document
    .querySelectorAll(
      "[data-save]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          savePost(
            button.dataset.save
          )
      );
    });


  document
    .querySelectorAll(
      "[data-share]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          sharePost(
            button.dataset.share
          )
      );
    });


  document
    .querySelectorAll(
      "[data-comment]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          showComments(
            button.dataset.comment
          )
      );
    });


  if (!homeDocumentClickHandler) {
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
          .forEach(menu => {
            menu.classList.add(
              "hidden"
            );
          });
      };

    document.addEventListener(
      "click",
      homeDocumentClickHandler
    );
  }


  cleanupExpiredPosts().catch(
    error => {
      console.warn(
        "[Home] Expired post cleanup failed:",
        error
      );
    }
  );
}
