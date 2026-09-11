// 2. js/features /home.js

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
  limit,
  Timestamp
} from "../firebase/firestore.js";

import {
  showModal,
  closeModal
} from "../components/modal.js";

import { toast } from "../components/toast.js";

const DISCOVERY_STORAGE_KEY = "marvel_discovery_seen_v2";
const DISCOVERY_LAST_ACTIVE_KEY = "marvel_home_last_active_v1";
const DISCOVERY_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DISCOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DISCOVERY_MAX_IMPRESSIONS = 3;
const DISCOVERY_DURATION_SECONDS = 40;

let discoveryTimer = null;
let discoveryStartedAt = 0;
let savedPostIds = new Set();
let savedPostsLoadedForUid = null;
let savedPostsLoadPromise = null;
let savedPostsLoadingUid = null;
let homeDocumentClickHandler = null;

const pendingLikeIds = new Set();
const pendingSaveIds = new Set();

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

function getPosts() {
  return Array.isArray(state.posts)
    ? state.posts
    : [];
}

function getPostById(id) {
  return getPosts().find(
    post =>
      String(post.id) ===
      String(id)
  );
}

function getPostAuthorName(post) {
  return (
    post?.displayName ||
    post?.authorName ||
    post?.username ||
    "Marvel User"
  );
}

function getPostText(post) {
  return (
    post?.text ||
    post?.content ||
    ""
  );
}

function getPostDate(post) {
  return (
    post?.createdAt ||
    post?.timestamp ||
    post?.updatedAt ||
    null
  );
}

function getPostLikes(post) {
  const value =
    Number(post?.likes);

  return Number.isFinite(value)
    ? value
    : 0;
}

function getPostComments(post) {
  const value =
    Number(post?.comments);

  return Number.isFinite(value)
    ? value
    : 0;
}

function getLikedBy(post) {
  return Array.isArray(
    post?.likedBy
  )
    ? post.likedBy
    : [];
}

function isPostLiked(post) {
  return (
    !!state.user?.uid &&
    getLikedBy(post).includes(
      state.user.uid
    )
  );
}

function isPostSaved(post) {
  return savedPostIds.has(
    String(post?.id)
  );
}

function timestampToDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value.toDate();
  }

  if (
    typeof value ===
    "number"
  ) {
    return new Date(value);
  }

  if (
    typeof value ===
    "string"
  ) {
    const parsed =
      new Date(value);

    return Number.isNaN(
      parsed.getTime()
    )
      ? null
      : parsed;
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

function isPostExpired(post) {
  if (!post?.expiresAt) {
    return false;
  }

  const expiry =
    timestampToDate(
      post.expiresAt
    );

  return (
    !!expiry &&
    expiry.getTime() <=
      Date.now()
  );
}

function formatExpiryLabel(post) {
  if (!post?.expiresAt) {
    return "";
  }

  const expiry =
    timestampToDate(
      post.expiresAt
    );

  if (!expiry) {
    return "";
  }

  const remaining =
    expiry.getTime() -
    Date.now();

  if (remaining <= 0) {
    return "Expired";
  }

  const minutes =
    Math.floor(
      remaining / 60000
    );

  const hours =
    Math.floor(
      minutes / 60
    );

  const days =
    Math.floor(
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
      item =>
        item.value === value
    );

  return option
    ? new Date(
        Date.now() +
        option.milliseconds
      )
    : null;
}

function markHomeActivity() {
  try {
    localStorage.setItem(
      DISCOVERY_LAST_ACTIVE_KEY,
      String(Date.now())
    );
  } catch {
    /* ignore storage failures */
  }
}

function getDiscoveryHistory() {
  try {
    const raw =
      localStorage.getItem(
        DISCOVERY_STORAGE_KEY
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const cutoff =
      Date.now() -
      DISCOVERY_WINDOW_MS;

    return parsed
      .map(Number)
      .filter(
        value =>
          Number.isFinite(value) &&
          value >= cutoff
      )
      .sort(
        (a, b) => a - b
      );
  } catch {
    return [];
  }
}

function saveDiscoveryHistory(
  history
) {
  try {
    localStorage.setItem(
      DISCOVERY_STORAGE_KEY,
      JSON.stringify(
        history.slice(
          -DISCOVERY_MAX_IMPRESSIONS
        )
      )
    );
  } catch {
    /* ignore storage failures */
  }
}

function recordDiscoveryImpression() {
  const now =
    Date.now();

  const history =
    getDiscoveryHistory();

  const last =
    history[
      history.length - 1
    ];

  if (
    last &&
    now - last <
      DISCOVERY_MIN_INTERVAL_MS
  ) {
    return;
  }

  history.push(now);

  saveDiscoveryHistory(
    history
  );
}

function shouldShowDiscovery() {
  const history =
    getDiscoveryHistory();

  if (!history.length) {
    return true;
  }

  if (
    history.length >=
    DISCOVERY_MAX_IMPRESSIONS
  ) {
    return false;
  }

  return (
    Date.now() -
      history[
        history.length - 1
      ] >=
    DISCOVERY_MIN_INTERVAL_MS
  );
}

export function isDiscoveryDismissed() {
  return !shouldShowDiscovery();
}

function stopDiscoveryCountdown() {
  if (discoveryTimer) {
    clearInterval(
      discoveryTimer
    );

    discoveryTimer =
      null;
  }
}

export function dismissDiscovery() {
  markHomeActivity();
  recordDiscoveryImpression();
  stopDiscoveryCountdown();

  document
    .getElementById(
      "discoveryBanner"
    )
    ?.remove();
}

function openDiscoveryDestination(
  destination,
  renderApp
) {
  dismissDiscovery();

  if (
    destination ===
    "market"
  ) {
    state.marketBrowseMode =
      false;

    state.page =
      "market";

    renderApp();

    return;
  }

  if (
    destination ===
    "timetrust"
  ) {
    state.page =
      "timetrust";

    renderApp();
  }
}

function startDiscoveryCountdown() {
  const banner =
    document.getElementById(
      "discoveryBanner"
    );

  const ring =
    document.getElementById(
      "discoveryRing"
    );

  const counter =
    document.getElementById(
      "discoveryCountdown"
    );

  if (
    !banner ||
    !ring ||
    !counter
  ) {
    stopDiscoveryCountdown();
    return;
  }

  if (discoveryTimer) {
    return;
  }

  discoveryStartedAt =
    Date.now();

  const duration =
    DISCOVERY_DURATION_SECONDS *
    1000;

  const update = () => {
    if (
      !document.getElementById(
        "discoveryBanner"
      )
    ) {
      stopDiscoveryCountdown();
      return;
    }

    const remainingMilliseconds =
      Math.max(
        0,
        duration -
          (
            Date.now() -
            discoveryStartedAt
          )
      );

    const remainingSeconds =
      Math.ceil(
        remainingMilliseconds /
          1000
      );

    const percentage =
      Math.max(
        0,
        Math.min(
          100,
          (
            remainingMilliseconds /
            duration
          ) * 100
        )
      );

    ring.style.background =
      `conic-gradient(currentColor ${percentage}%, rgba(255,255,255,.10) ${percentage}% 100%)`;

    counter.textContent =
      String(
        remainingSeconds
      );

    if (
      remainingMilliseconds <=
      0
    ) {
      stopDiscoveryCountdown();
      dismissDiscovery();
    }
  };

  update();

  discoveryTimer =
    setInterval(
      update,
      250
    );
}

function renderDiscoveryBanner() {
  return `
    <section
      class="card"
      id="discoveryBanner"
      aria-label="Marvel Chat discovery"
      style="
        position:relative;
        overflow:hidden;
        margin:0 0 22px;
        padding:30px 26px 28px;
        min-height:300px;
        border-radius:24px;
        display:flex;
        flex-direction:column;
        justify-content:center;
        box-shadow:var(--shadow);
      "
    >
      <div
        style="
          position:absolute;
          inset:0;
          pointer-events:none;
          opacity:.08;
          background:
            radial-gradient(
              circle at 15% 20%,
              currentColor 0,
              transparent 35%
            ),
            radial-gradient(
              circle at 85% 80%,
              currentColor 0,
              transparent 40%
            );
        "
      ></div>

      <button
        type="button"
        class="icon-btn"
        id="discoveryClose"
        aria-label="Close discovery"
        title="Close"
        style="
          position:absolute;
          top:14px;
          right:14px;
          width:42px;
          height:42px;
          z-index:2;
          font-size:20px;
        "
      >
        ✕
      </button>

      <div
        style="
          position:relative;
          z-index:1;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:24px;
          flex-wrap:wrap;
        "
      >
        <div
          style="
            flex:1;
            min-width:220px;
          "
        >
          <div
            class="small"
            style="
              font-weight:800;
              letter-spacing:.08em;
              text-transform:uppercase;
              margin-bottom:8px;
            "
          >
            MARVEL CHAT DISCOVERY
          </div>

          <h2
            style="
              margin:0 0 10px;
              font-size:clamp(28px,6vw,42px);
              line-height:1.05;
            "
          >
            Explore what your community can do ✨
          </h2>

          <p
            style="
              margin:0;
              max-width:560px;
              line-height:1.65;
              opacity:.86;
              font-size:15px;
            "
          >
            Discover people, conversations, skills, TimeTrust and the Market — all from one Marvel Chat universe.
          </p>

          <div
            style="
              display:flex;
              gap:10px;
              flex-wrap:wrap;
              margin-top:20px;
            "
          >
            <button
              type="button"
              class="btn"
              data-discovery-nav="market"
            >
              🛍️ Explore Market
            </button>

            <button
              type="button"
              class="btn secondary"
              data-discovery-nav="timetrust"
            >
              ⏱️ Explore TimeTrust
            </button>
          </div>
        </div>

        <div
          style="
            width:92px;
            height:92px;
            border-radius:50%;
            display:grid;
            place-items:center;
            flex:0 0 auto;
            color:var(--primary);
            background:rgba(255,255,255,.04);
          "
        >
          <div
            id="discoveryRing"
            style="
              width:74px;
              height:74px;
              border-radius:50%;
              display:grid;
              place-items:center;
              background:
                conic-gradient(
                  currentColor 100%,
                  rgba(255,255,255,.10) 100%
                );
              position:relative;
            "
          >
            <div
              style="
                position:absolute;
                inset:5px;
                border-radius:50%;
                background:var(--card);
                display:grid;
                place-items:center;
              "
            >
              <span
                id="discoveryCountdown"
                style="
                  font-weight:900;
                  font-size:18px;
                "
              >
                ${DISCOVERY_DURATION_SECONDS}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function updateLocalPost(
  id,
  updater
) {
  if (!Array.isArray(state.posts)) {
    return;
  }

  state.posts =
    state.posts.map(
      post =>
        String(post.id) ===
        String(id)
          ? updater(post)
          : post
    );
}

function refreshPostCard(id) {
  const card =
    document.querySelector(
      `[data-post-card="${cssEscape(id)}"]`
    );

  if (!card) {
    return;
  }

  const post =
    getPostById(id);

  if (!post) {
    card.remove();
    return;
  }

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.innerHTML =
    renderPostCard(post);

  const replacement =
    wrapper.firstElementChild;

  if (replacement) {
    card.replaceWith(
      replacement
    );
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

  if (
    savedPostsLoadingUid ===
      uid &&
    savedPostsLoadPromise
  ) {
    return savedPostsLoadPromise;
  }

  savedPostsLoadingUid =
    uid;

  savedPostsLoadPromise =
    (async () => {
      try {
        const snapshot =
          await getDocs(
            collection(
              db,
              "users",
              uid,
              "savedPosts"
            )
          );

        const ids =
          new Set();

        snapshot.forEach(
          item => {
            ids.add(
              String(item.id)
            );
          }
        );

        savedPostIds =
          ids;

        savedPostsLoadedForUid =
          uid;
      } finally {
        savedPostsLoadingUid =
          null;

        savedPostsLoadPromise =
          null;
      }
    })();

  return savedPostsLoadPromise;
}

function renderPostCard(post) {
  const id =
    String(post.id);

  const owner =
    !!state.user?.uid &&
    String(post.uid) ===
      String(state.user.uid);

  const liked =
    isPostLiked(post);

  const saved =
    isPostSaved(post);

  const likes =
    getPostLikes(post);

  const comments =
    getPostComments(post);

  const expiryLabel =
    formatExpiryLabel(post);

  const created =
    getPostDate(post);

  const dateLabel =
    created
      ? formatDate(created)
      : "";

  const text =
    escapeHtml(
      getPostText(post)
    ).replace(
      /\n/g,
      "<br>"
    );

  const authorName =
    escapeHtml(
      getPostAuthorName(post)
    );

  const authorInitials =
    escapeHtml(
      initials(
        getPostAuthorName(post)
      )
    );

  return `
    <article
      class="card post-card"
      data-post-card="${escapeHtml(id)}"
      style="margin-bottom:16px;"
    >
      <div
        class="post-header"
        style="
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
        "
      >
        <div
          style="
            display:flex;
            align-items:center;
            gap:12px;
            min-width:0;
          "
        >
          <div
            class="avatar"
            aria-hidden="true"
          >
            ${authorInitials}
          </div>

          <div
            style="
              min-width:0;
            "
          >
            <strong
              style="
                display:block;
                overflow:hidden;
                text-overflow:ellipsis;
              "
            >
              ${authorName}
            </strong>

            <div class="small">
              ${escapeHtml(dateLabel)}
              ${
                expiryLabel
                  ? ` · ${escapeHtml(expiryLabel)}`
                  : ""
              }
            </div>
          </div>
        </div>

        <div
          class="dropdown-container"
          style="position:relative;"
        >
          <button
            type="button"
            class="icon-btn"
            data-menu-post="${escapeHtml(id)}"
            aria-label="Post menu"
            title="Post menu"
          >
            ⋯
          </button>

          <div
            id="postMenu-${escapeHtml(id)}"
            class="dropdown-menu hidden"
            style="
              position:absolute;
              right:0;
              top:46px;
              z-index:20;
              min-width:160px;
            "
          >
            ${
              owner
                ? `
                  <button
                    type="button"
                    class="dropdown-item"
                    data-edit-post="${escapeHtml(id)}"
                  >
                    ✏️ Edit
                  </button>

                  <button
                    type="button"
                    class="dropdown-item"
                    data-delete-post="${escapeHtml(id)}"
                  >
                    🗑️ Delete
                  </button>
                `
                : `
                  <button
                    type="button"
                    class="dropdown-item"
                    data-share="${escapeHtml(id)}"
                  >
                    ↗️ Share
                  </button>
                `
            }
          </div>
        </div>
      </div>

      <div
        class="post-content"
        style="
          margin-top:14px;
          line-height:1.65;
          overflow-wrap:anywhere;
        "
      >
        ${text}
      </div>

      <div
        class="post-actions"
        style="
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
          margin-top:16px;
        "
      >
        <button
          type="button"
          class="btn secondary"
          data-like="${escapeHtml(id)}"
          ${pendingLikeIds.has(id) ? "disabled" : ""}
        >
          ${liked ? "❤️" : "🤍"}
          ${likes}
        </button>

        <button
          type="button"
          class="btn secondary"
          data-comment="${escapeHtml(id)}"
        >
          💬 ${comments}
        </button>

        <button
          type="button"
          class="btn secondary"
          data-save="${escapeHtml(id)}"
          ${pendingSaveIds.has(id) ? "disabled" : ""}
        >
          ${saved ? "🔖 Saved" : "🔖 Save"}
        </button>

        <button
          type="button"
          class="btn secondary"
          data-share="${escapeHtml(id)}"
        >
          ↗️ Share
        </button>
      </div>
    </article>
  `;
}

function renderQuickActions() {
  return `
    <section
      class="quick-grid"
      style="margin-bottom:22px;"
    >
      <button
        type="button"
        class="quick"
        data-quick="post"
      >
        <span class="quick-icon">✍️</span>
        <strong>Create Post</strong>
        <span class="small">
          Share something with the community
        </span>
      </button>

      <button
        type="button"
        class="quick"
        data-quick="chat"
      >
        <span class="quick-icon">💬</span>
        <strong>Messages</strong>
        <span class="small">
          Continue your conversations
        </span>
      </button>

      <button
        type="button"
        class="quick"
        data-quick="timetrust"
      >
        <span class="quick-icon">⏱️</span>
        <strong>TimeTrust</strong>
        <span class="small">
          Exchange skills and time
        </span>
      </button>

      <button
        type="button"
        class="quick"
        data-quick="market"
      >
        <span class="quick-icon">🛍️</span>
        <strong>Marvel Market</strong>
        <span class="small">
          Browse community listings
        </span>
      </button>
    </section>
  `;
}

function renderCommunityHeader() {
  return `
    <section
      class="card"
      style="margin-bottom:18px;"
    >
      <div
        style="
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
          flex-wrap:wrap;
        "
      >
        <div>
          <div
            class="small"
            style="
              font-weight:800;
              letter-spacing:.06em;
              text-transform:uppercase;
            "
          >
            Community
          </div>

          <h2
            style="
              margin:5px 0 5px;
            "
          >
            Marvel Community Feed
          </h2>

          <p
            class="small"
            style="
              margin:0;
              line-height:1.5;
            "
          >
            Share updates, ideas and moments with the Marvel Chat community.
          </p>
        </div>

        <button
          type="button"
          class="btn"
          id="createPostBtn"
        >
          ✍️ Create Post
        </button>
      </div>

      <div
        style="
          margin-top:18px;
        "
      >
        <input
          id="communityFeedSearch"
          class="input"
          type="search"
          placeholder="Search posts..."
          autocomplete="off"
        />
      </div>
    </section>
  `;
}

function renderPosts() {
  const posts =
    getPosts().filter(
      post =>
        !isPostExpired(post)
    );

  if (!posts.length) {
    return `
      <section
        class="card"
        id="emptyCommunityFeed"
        style="
          text-align:center;
          padding:36px 20px;
        "
      >
        <div
          style="
            font-size:42px;
            margin-bottom:12px;
          "
        >
          🌌
        </div>

        <h3
          style="
            margin:0 0 8px;
          "
        >
          Your community feed is quiet
        </h3>

        <p
          class="small"
          style="
            max-width:520px;
            margin:0 auto 18px;
            line-height:1.6;
          "
        >
          Be the first to share something with the Marvel Chat universe.
        </p>

        <button
          type="button"
          class="btn"
          id="emptyCreatePost"
        >
          ✍️ Create the first post
        </button>
      </section>
    `;
  }

  return `
    <section
      id="communityPosts"
    >
      ${posts
        .map(
          renderPostCard
        )
        .join("")}
    </section>
  `;
}

export function renderHome() {
  stopDiscoveryCountdown();

  const discovery =
    shouldShowDiscovery()
      ? renderDiscoveryBanner()
      : "";

  return `
    <main
      class="page"
      id="homePage"
    >
      ${discovery}

      ${renderQuickActions()}

      ${renderCommunityHeader()}

      ${renderPosts()}
    </main>
  `;
}

export async function toggleLike(id) {
  if (!state.user?.uid) {
    toast(
      "Please sign in first."
    );
    return;
  }

  const post =
    getPostById(id);

  if (!post) {
    toast(
      "Post is no longer available."
    );
    return;
  }

  const postId =
    String(id);

  if (
    pendingLikeIds.has(
      postId
    )
  ) {
    return;
  }

  pendingLikeIds.add(
    postId
  );

  const liked =
    isPostLiked(post);

  const nextLikes =
    Math.max(
      0,
      getPostLikes(post) +
        (liked ? -1 : 1)
    );

  const nextLikedBy =
    liked
      ? getLikedBy(post).filter(
          uid =>
            String(uid) !==
            String(state.user.uid)
        )
      : [
          ...getLikedBy(post),
          state.user.uid
        ];

  updateLocalPost(
    postId,
    current => ({
      ...current,
      likes:
        nextLikes,
      likedBy:
        nextLikedBy
    })
  );

  refreshPostCard(
    postId
  );

  try {
    await updateDoc(
      doc(
        db,
        "posts",
        postId
      ),
      liked
        ? {
            likes:
              increment(-1),
            likedBy:
              arrayRemove(
                state.user.uid
              )
          }
        : {
            likes:
              increment(1),
            likedBy:
              arrayUnion(
                state.user.uid
              )
          }
    );

    markHomeActivity();
  } catch (error) {
    updateLocalPost(
      postId,
      current => ({
        ...current,
        likes:
          getPostLikes(post),
        likedBy:
          getLikedBy(post)
      })
    );

    refreshPostCard(
      postId
    );

    toast(
      friendly(error)
    );
  } finally {
    pendingLikeIds.delete(
      postId
    );

    refreshPostCard(
      postId
    );
  }
}

export async function savePost(id) {
  if (!state.user?.uid) {
    toast(
      "Please sign in first."
    );
    return;
  }

  const post =
    getPostById(id);

  if (!post) {
    toast(
      "Post is no longer available."
    );
    return;
  }

  const postId =
    String(id);

  if (
    pendingSaveIds.has(
      postId
    )
  ) {
    return;
  }

  pendingSaveIds.add(
    postId
  );

  const wasSaved =
    savedPostIds.has(
      postId
    );

  if (wasSaved) {
    savedPostIds.delete(
      postId
    );
  } else {
    savedPostIds.add(
      postId
    );
  }

  refreshPostCard(
    postId
  );

  try {
    const savedRef =
      doc(
        db,
        "users",
        state.user.uid,
        "savedPosts",
        postId
      );

    if (wasSaved) {
      await deleteDoc(
        savedRef
      );
    } else {
      await setDoc(
        savedRef,
        {
          postId:
            postId,
          savedAt:
            serverTimestamp()
        }
      );
    }

    savedPostsLoadedForUid =
      state.user.uid;

    markHomeActivity();

    toast(
      wasSaved
        ? "Post removed from saved posts."
        : "Post saved."
    );
  } catch (error) {
    if (wasSaved) {
      savedPostIds.add(
        postId
      );
    } else {
      savedPostIds.delete(
        postId
      );
    }

    refreshPostCard(
      postId
    );

    toast(
      friendly(error)
    );
  } finally {
    pendingSaveIds.delete(
      postId
    );

    refreshPostCard(
      postId
    );
  }
}

export async function sharePost(id) {
  const post =
    getPostById(id);

  if (!post) {
    toast(
      "Post is no longer available."
    );
    return;
  }

  const text =
    getPostText(post);

  try {
    if (
      navigator.share
    ) {
      await navigator.share({
        title:
          "Marvel Chat post",
        text
      });
    } else if (
      navigator.clipboard
        ?.writeText
    ) {
      await navigator.clipboard.writeText(
        text
      );

      toast(
        "Post text copied."
      );
    } else {
      toast(
        "Sharing is not available on this device."
      );
    }

    markHomeActivity();
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

function showCreatePost() {
  const defaultName =
    getCurrentUserName();

  showModal(`
    <div
      class="modal-content"
      style="max-width:620px;"
    >
      <div class="modal-header">
        <h3>
          Create a post
        </h3>

        <button
          type="button"
          class="icon-btn"
          data-modal-close
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <div
          class="small"
          style="margin-bottom:10px;"
        >
          Posting as ${escapeHtml(
            defaultName
          )}
        </div>

        <textarea
          id="createPostText"
          class="input"
          rows="7"
          maxlength="1000"
          placeholder="What's happening in your Marvel universe?"
        ></textarea>

        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:12px;
            margin-top:12px;
            flex-wrap:wrap;
          "
        >
          <label class="small">
            Post expiry

            <select
              id="createPostExpiry"
              class="input"
              style="margin-top:6px;"
            >
              <option value="">
                No expiry
              </option>

              ${POST_EXPIRY_OPTIONS
                .map(
                  option => `
                    <option
                      value="${option.value}"
                    >
                      ${escapeHtml(
                        option.label
                      )}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>

          <span class="small">
            Maximum 1000 characters
          </span>
        </div>
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="btn secondary"
          data-modal-close
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn"
          id="submitCreatePost"
        >
          Publish
        </button>
      </div>
    </div>
  `);

  document
    .querySelectorAll(
      "[data-modal-close]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          closeModal
        )
    );

  const textInput =
    document.getElementById(
      "createPostText"
    );

  const expiryInput =
    document.getElementById(
      "createPostExpiry"
    );

  const submitButton =
    document.getElementById(
      "submitCreatePost"
    );

  textInput?.focus();

  submitButton?.addEventListener(
    "click",
    async () => {
      if (!state.user?.uid) {
        toast(
          "Please sign in first."
        );
        return;
      }

      const text =
        String(
          textInput?.value ||
            ""
        ).trim();

      if (!text) {
        toast(
          "Write something before publishing."
        );
        return;
      }

      if (
        text.length >
        1000
      ) {
        toast(
          "Posts must be 1000 characters or less."
        );
        return;
      }

      submitButton.disabled =
        true;

      submitButton.textContent =
        "Publishing...";

      try {
        const expiryDate =
          getPostExpiryDate(
            expiryInput?.value ||
              ""
          );

        const payload = {
          uid:
            state.user.uid,
          text:
            text,
          createdAt:
            serverTimestamp(),
          likes:
            0,
          likedBy:
            [],
          comments:
            0
        };

        if (expiryDate) {
          payload.expiresAt =
            Timestamp.fromDate(
              expiryDate
            );

          payload.expiryDurationHours =
            Math.round(
              (
                expiryDate.getTime() -
                Date.now()
              ) /
                3600000
            );
        }

        await addDoc(
          collection(
            db,
            "posts"
          ),
          payload
        );

        markHomeActivity();

        closeModal();

        toast(
          "Post published ✨"
        );
      } catch (error) {
        toast(
          friendly(error)
        );

        submitButton.disabled =
          false;

        submitButton.textContent =
          "Publish";
      }
    }
  );
}

export function showEditPost(id) {
  const post =
    getPostById(id);

  if (!post) {
    toast(
      "Post is no longer available."
    );
    return;
  }

  if (
    String(post.uid) !==
    String(state.user?.uid)
  ) {
    toast(
      "You can only edit your own posts."
    );
    return;
  }

  showModal(`
    <div
      class="modal-content"
      style="max-width:620px;"
    >
      <div class="modal-header">
        <h3>
          Edit post
        </h3>

        <button
          type="button"
          class="icon-btn"
          data-modal-close
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <textarea
          id="editPostText"
          class="input"
          rows="7"
          maxlength="1000"
        >${escapeHtml(
          getPostText(post)
        )}</textarea>
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="btn secondary"
          data-modal-close
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn"
          id="submitEditPost"
        >
          Save changes
        </button>
      </div>
    </div>
  `);

  document
    .querySelectorAll(
      "[data-modal-close]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          closeModal
        )
    );

  const input =
    document.getElementById(
      "editPostText"
    );

  const submit =
    document.getElementById(
      "submitEditPost"
    );

  input?.focus();

  submit?.addEventListener(
    "click",
    async () => {
      const text =
        String(
          input?.value ||
            ""
        ).trim();

      if (!text) {
        toast(
          "Post text cannot be empty."
        );
        return;
      }

      if (
        text.length >
        1000
      ) {
        toast(
          "Posts must be 1000 characters or less."
        );
        return;
      }

      submit.disabled =
        true;

      submit.textContent =
        "Saving...";

      try {
        await updateDoc(
          doc(
            db,
            "posts",
            String(id)
          ),
          {
            text:
              text,
            editedAt:
              serverTimestamp()
          }
        );

        updateLocalPost(
          id,
          current => ({
            ...current,
            text:
              text
          })
        );

        closeModal();

        markHomeActivity();

        refreshPostCard(
          id
        );

        toast(
          "Post updated."
        );
      } catch (error) {
        toast(
          friendly(error)
        );

        submit.disabled =
          false;

        submit.textContent =
          "Save changes";
      }
    }
  );
}

export function showDeletePostConfirmation(
  id
) {
  const post =
    getPostById(id);

  if (!post) {
    toast(
      "Post is no longer available."
    );
    return;
  }

  if (
    String(post.uid) !==
    String(state.user?.uid)
  ) {
    toast(
      "You can only delete your own posts."
    );
    return;
  }

  showModal(`
    <div
      class="modal-content"
      style="max-width:500px;"
    >
      <div class="modal-header">
        <h3>
          Delete post?
        </h3>

        <button
          type="button"
          class="icon-btn"
          data-modal-close
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <p
          style="
            line-height:1.6;
          "
        >
          This will permanently remove your post from the community feed.
        </p>
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="btn secondary"
          data-modal-close
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn"
          id="confirmDeletePost"
        >
          Delete
        </button>
      </div>
    </div>
  `);

  document
    .querySelectorAll(
      "[data-modal-close]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          closeModal
        )
    );

  document
    .getElementById(
      "confirmDeletePost"
    )
    ?.addEventListener(
      "click",
      async event => {
        const button =
          event.currentTarget;

        button.disabled =
          true;

        button.textContent =
          "Deleting...";

        try {
          await deleteDoc(
            doc(
              db,
              "posts",
              String(id)
            )
          );

          state.posts =
            getPosts().filter(
              item =>
                String(item.id) !==
                String(id)
            );

          closeModal();

          markHomeActivity();

          document
            .querySelector(
              `[data-post-card="${cssEscape(id)}"]`
            )
            ?.remove();

          toast(
            "Post deleted."
          );
        } catch (error) {
          toast(
            friendly(error)
          );

          button.disabled =
            false;

          button.textContent =
            "Delete";
        }
      }
    );
}

export async function showComments(
  id
) {
  const post =
    getPostById(id);

  if (!post) {
    toast(
      "Post is no longer available."
    );
    return;
  }

  let comments = [];

  try {
    const commentsQuery =
      query(
        collection(
          db,
          "posts",
          String(id),
          "comments"
        ),
        orderBy(
          "createdAt",
          "asc"
        ),
        limit(50)
      );

    const snapshot =
      await getDocs(
        commentsQuery
      );

    comments =
      snapshot.docs.map(
        item => ({
          id:
            item.id,
          ...item.data()
        })
      );
  } catch (error) {
    toast(
      friendly(error)
    );
    return;
  }

  const commentsHtml =
    comments.length
      ? comments
          .map(
            comment => {
              const name =
                escapeHtml(
                  comment.displayName ||
                    comment.authorName ||
                    comment.username ||
                    "Marvel User"
                );

              const text =
                escapeHtml(
                  comment.text ||
                    ""
                );

              const date =
                comment.createdAt
                  ? formatDate(
                      comment.createdAt
                    )
                  : "";

              const own =
                String(
                  comment.uid
                ) ===
                String(
                  state.user?.uid
                );

              return `
                <div
                  class="list-item"
                  style="
                    position:relative;
                  "
                >
                  <div
                    style="
                      display:flex;
                      justify-content:space-between;
                      gap:12px;
                    "
                  >
                    <strong>
                      ${name}
                    </strong>

                    ${
                      own
                        ? `
                          <button
                            type="button"
                            class="icon-btn"
                            data-delete-comment="${escapeHtml(comment.id)}"
                            aria-label="Delete comment"
                            title="Delete comment"
                          >
                            🗑️
                          </button>
                        `
                        : ""
                    }
                  </div>

                  <div
                    style="
                      margin-top:5px;
                      overflow-wrap:anywhere;
                    "
                  >
                    ${text}
                  </div>

                  <div class="small">
                    ${escapeHtml(date)}
                  </div>
                </div>
              `;
            }
          )
          .join("")
      : `
        <div
          class="small"
          id="noCommentsMessage"
          style="
            padding:10px 0;
          "
        >
          No comments yet. Start the conversation.
        </div>
      `;

  showModal(`
    <div
      class="modal-content"
      style="max-width:640px;"
    >
      <div class="modal-header">
        <h3>
          Comments
        </h3>

        <button
          type="button"
          class="icon-btn"
          data-modal-close
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <div
          id="commentsList"
          style="
            max-height:45vh;
            overflow:auto;
          "
        >
          ${commentsHtml}
        </div>

        <div
          style="
            margin-top:18px;
          "
        >
          <textarea
            id="commentText"
            class="input"
            rows="4"
            maxlength="500"
            placeholder="Write a comment..."
          ></textarea>

          <div
            style="
              display:flex;
              justify-content:flex-end;
              margin-top:10px;
            "
          >
            <button
              type="button"
              class="btn"
              id="submitComment"
            >
              Add comment
            </button>
          </div>
        </div>
      </div>
    </div>
  `);

  document
    .querySelectorAll(
      "[data-modal-close]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          closeModal
        )
    );

  document
    .querySelectorAll(
      "[data-delete-comment]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            deleteComment(
              id,
              button.dataset
                .deleteComment
            );
          }
        );
      }
    );

  const input =
    document.getElementById(
      "commentText"
    );

  const button =
    document.getElementById(
      "submitComment"
    );

  input?.focus();

  button?.addEventListener(
    "click",
    async () => {
      if (!state.user?.uid) {
        toast(
          "Please sign in first."
        );
        return;
      }

      const text =
        String(
          input?.value ||
            ""
        ).trim();

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
          "Comments must be 500 characters or less."
        );
        return;
      }

      button.disabled =
        true;

      button.textContent =
        "Adding...";

      try {
        const actorName =
          getCurrentUserName();

        await addDoc(
          collection(
            db,
            "posts",
            String(id),
            "comments"
          ),
          {
            uid:
              state.user.uid,
            displayName:
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
            String(id)
          ),
          {
            comments:
              increment(1)
          }
        );

        updateLocalPost(
          id,
          item => ({
            ...item,
            comments:
              getPostComments(
                item
              ) + 1
          })
        );

        const commentsList =
          document.getElementById(
            "commentsList"
          );

        if (commentsList) {
          const emptyMessage =
            commentsList
              .textContent
              ?.trim() ===
            "No comments yet. Start the conversation.";

          const commentHtml = `
            <div class="list-item">
              <strong>
                ${escapeHtml(
                  actorName
                )}
              </strong>

              <div>
                ${escapeHtml(
                  text
                )}
              </div>

              <div class="small">
                Just now
              </div>
            </div>
          `;

          if (emptyMessage) {
            commentsList.innerHTML =
              commentHtml;
          } else {
            commentsList.insertAdjacentHTML(
              "beforeend",
              commentHtml
            );
          }
        }

        input.value =
          "";

        markHomeActivity();

        refreshPostCard(
          id
        );

        toast(
          "Comment added 💬"
        );

        button.disabled =
          false;

        button.textContent =
          "Add comment";
      } catch (error) {
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

async function deleteComment(
  postId,
  commentId
) {
  if (!state.user?.uid) {
    return;
  }

  try {
    await deleteDoc(
      doc(
        db,
        "posts",
        String(postId),
        "comments",
        String(commentId)
      )
    );

    await updateDoc(
      doc(
        db,
        "posts",
        String(postId)
      ),
      {
        comments:
          increment(-1)
      }
    );

    updateLocalPost(
      postId,
      item => ({
        ...item,
        comments:
          Math.max(
            0,
            getPostComments(
              item
            ) - 1
          )
      })
    );

    markHomeActivity();

    toast(
      "Comment deleted."
    );

    refreshPostCard(
      postId
    );

    await showComments(
      postId
    );
  } catch (error) {
    toast(
      friendly(error)
    );
  }
}

export function attachHomeEvents(
  renderApp
) {
  stopDiscoveryCountdown();

  if (state.user?.uid) {
    setTimeout(
      () => {
        loadSavedPostIds()
          .catch(
            error => {
              console.warn(
                "Deferred saved-post hydration failed:",
                error
              );
            }
          );
      },
      0
    );
  }

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

  if (
    homeDocumentClickHandler
  ) {
    document.removeEventListener(
      "click",
      homeDocumentClickHandler
    );
  }

  homeDocumentClickHandler =
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
    };

  document.addEventListener(
    "click",
    homeDocumentClickHandler
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

  document
    .querySelectorAll(
      '[data-quick="timetrust"]'
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

  document
    .querySelectorAll(
      '[data-quick="market"]'
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

  document
    .getElementById(
      "communityFeedSearch"
    )
    ?.addEventListener(
      "input",
      event => {
        const term =
          String(
            event.target.value ||
              ""
          )
            .trim()
            .toLowerCase();

        document
          .querySelectorAll(
            "[data-post-card]"
          )
          .forEach(
            card => {
              const text =
                card.textContent
                  .toLowerCase();

              card.style.display =
                !term ||
                text.includes(
                  term
                )
                  ? ""
                  : "none";
            }
          );
      }
    );

  document
    .querySelectorAll(
      "[data-discovery-nav]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            openDiscoveryDestination(
              button.dataset
                .discoveryNav,
              renderApp
            );
          }
        );
      }
    );

  document
    .getElementById(
      "discoveryClose"
    )
    ?.addEventListener(
      "click",
      dismissDiscovery
    );

  if (
    document.getElementById(
      "discoveryBanner"
    )
  ) {
    recordDiscoveryImpression();

    startDiscoveryCountdown();
  }

  markHomeActivity();
}
