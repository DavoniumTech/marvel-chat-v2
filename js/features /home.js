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

import {
  toast
} from "../components/toast.js";

const DISCOVERY_STORAGE_KEY =
  "marvel_discovery_seen_v1";

const DISCOVERY_LAST_ACTIVE_KEY =
  "marvel_home_last_active_v1";

const DISCOVERY_INACTIVE_DAYS = 2;

const DISCOVERY_DURATION_SECONDS = 40;

let discoveryTimer = null;

let discoveryStartedAt = 0;

let savedPostIds =
  new Set();

let savedPostsLoadedForUid =
  null;

const pendingLikeIds =
  new Set();

const pendingSaveIds =
  new Set();

let homeDocumentClickHandler =
  null;

const POST_EXPIRY_OPTIONS = [
  {
    value: "12h",
    label: "12 hours",
    milliseconds:
      12 * 60 * 60 * 1000
  },
  {
    value: "1d",
    label: "1 day",
    milliseconds:
      24 * 60 * 60 * 1000
  },
  {
    value: "7d",
    label: "1 week",
    milliseconds:
      7 * 24 * 60 * 60 * 1000
  },
  {
    value: "30d",
    label: "30 days",
    milliseconds:
      30 * 24 * 60 * 60 * 1000
  }
];

function cssEscape(value) {
  if (
    typeof CSS !== "undefined" &&
    typeof CSS.escape === "function"
  ) {
    return CSS.escape(
      String(value)
    );
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

function getPostExpiryDate(value) {
  const option =
    POST_EXPIRY_OPTIONS.find(
      item =>
        item.value === value
    );

  if (!option) {
    return null;
  }

  return new Date(
    Date.now() +
      option.milliseconds
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

  if (!expiry) {
    return false;
  }

  return (
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

function shouldShowDiscovery() {
  try {
    const lastActiveRaw =
      localStorage.getItem(
        DISCOVERY_LAST_ACTIVE_KEY
      );

    if (!lastActiveRaw) {
      return true;
    }

    const lastActive =
      Number(lastActiveRaw);

    if (
      !Number.isFinite(
        lastActive
      )
    ) {
      return true;
    }

    const inactiveMilliseconds =
      Date.now() -
      lastActive;

    const inactiveThreshold =
      DISCOVERY_INACTIVE_DAYS *
      24 *
      60 *
      60 *
      1000;

    return (
      inactiveMilliseconds >=
      inactiveThreshold
    );
  } catch {
    return true;
  }
}

export function isDiscoveryDismissed() {
  return !shouldShowDiscovery();
}

export function dismissDiscovery() {
  try {
    localStorage.setItem(
      DISCOVERY_LAST_ACTIVE_KEY,
      String(Date.now())
    );

    localStorage.setItem(
      DISCOVERY_STORAGE_KEY,
      "1"
    );
  } catch {
    /* ignore quota / private mode */
  }

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

function stopDiscoveryCountdown() {
  if (discoveryTimer) {
    clearInterval(
      discoveryTimer
    );

    discoveryTimer = null;
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

    const elapsed =
      Date.now() -
      discoveryStartedAt;

    const remainingMilliseconds =
      Math.max(
        0,
        duration - elapsed
      );

    const remainingSeconds =
      Math.ceil(
        remainingMilliseconds /
          1000
      );

    const progress =
      remainingMilliseconds /
      duration;

    const percentage =
      Math.max(
        0,
        Math.min(
          100,
          progress * 100
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
            radial-gradient(circle at 15% 20%, currentColor 0, transparent 35%),
            radial-gradient(circle at 85% 80%, currentColor 0, transparent 40%);
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
              font-size:clamp(28px, 6vw, 42px);
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
            Discover people, conversations, skills, TimeTrust
            and the Market — all from one place.
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
              class="btn btn-primary"
              type="button"
              data-discovery-nav="market"
            >
              🛍️ Explore Market
            </button>

            <button
              class="btn btn-ghost"
              type="button"
              data-discovery-nav="timetrust"
            >
              ⏱️ Explore TimeTrust
            </button>
          </div>
        </div>

        <div
          style="
            flex:0 0 auto;
            display:flex;
            align-items:center;
            justify-content:center;
            min-width:130px;
          "
        >
          <div
            id="discoveryRing"
            style="
              width:112px;
              height:112px;
              border-radius:50%;
              display:grid;
              place-items:center;
              position:relative;
              color:inherit;
              background:conic-gradient(currentColor 100%, rgba(255,255,255,.10) 100%);
            "
          >
            <div
              style="
                position:absolute;
                inset:7px;
                border-radius:50%;
                background:var(--surface);
                display:flex;
                flex-direction:column;
                align-items:center;
                justify-content:center;
              "
            >
              <strong
                id="discoveryCountdown"
                style="
                  font-size:30px;
                  line-height:1;
                "
              >
                40
              </strong>

              <span
                class="small"
                style="
                  margin-top:5px;
                "
              >
                seconds
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
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
    const snapshot =
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
        snapshot.docs.map(
          item =>
            item.id
        )
      );

    state.savedPostCount =
      savedPostIds.size;

    savedPostsLoadedForUid =
      uid;

    state.posts =
      state.posts.map(
        post => ({
          ...post,
          savedBy:
            savedPostIds.has(
              post.id
            )
              ? Array.from(
                  new Set([
                    ...(Array.isArray(
                      post.savedBy
                    )
                      ? post.savedBy
                      : []),
                    uid
                  ])
                )
              : (
                  Array.isArray(
                    post.savedBy
                  )
                    ? post.savedBy.filter(
                        id =>
                          id !==
                          uid
                      )
                    : []
                )
        })
      );

    refreshSavedButtons();
  } catch (error) {
    console.warn(
      "Could not load saved posts:",
      error
    );
  }
}

function refreshSavedButtons() {
  document
    .querySelectorAll(
      "[data-save]"
    )
    .forEach(
      button => {
        const id =
          button.dataset.save;

        const saved =
          savedPostIds.has(
            id
          );

        button.innerHTML =
          saved
            ? "🔖 Saved"
            : "🔖 Save";

        button.classList.toggle(
          "btn-primary",
          saved
        );

        button.classList.toggle(
          "btn-ghost",
          !saved
        );
      }
    );
}

function getLikeCount(post) {
  if (
    typeof post?.likes ===
    "number"
  ) {
    return post.likes;
  }

  if (
    Array.isArray(
      post?.likedBy
    )
  ) {
    return post.likedBy.length;
  }

  return 0;
}

function isLiked(post) {
  if (!state.user) {
    return false;
  }

  return Array.isArray(
    post?.likedBy
  )
    ? post.likedBy.includes(
        state.user.uid
      )
    : false;
}

function isSaved(post) {
  if (!state.user) {
    return false;
  }

  return (
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
  );
}

function renderPostActions(post) {
  const likeCount =
    getLikeCount(post);

  const commentCount =
    Number(
      post?.comments || 0
    );

  const liked =
    isLiked(post);

  const saved =
    isSaved(post);

  return `
    <div
      style="
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:8px;
        margin-top:16px;
        padding-top:14px;
        border-top:1px solid var(--border);
      "
    >
      <button
        type="button"
        class="btn ${
          liked
            ? "btn-primary"
            : "btn-ghost"
        }"
        data-like="${cssEscape(
          post.id
        )}"
        style="
          min-width:0;
          padding:10px 8px;
          white-space:nowrap;
        "
      >
        ❤️ ${likeCount}
      </button>

      <button
        type="button"
        class="btn btn-ghost"
        data-comment="${cssEscape(
          post.id
        )}"
        style="
          min-width:0;
          padding:10px 8px;
          white-space:nowrap;
        "
      >
        💬 ${commentCount}
      </button>

      <button
        type="button"
        class="btn btn-ghost"
        data-share="${cssEscape(
          post.id
        )}"
        style="
          min-width:0;
          padding:10px 8px;
          white-space:nowrap;
        "
      >
        ↗ Share
      </button>

      <button
        type="button"
        class="btn ${
          saved
            ? "btn-primary"
            : "btn-ghost"
        }"
        data-save="${cssEscape(
          post.id
        )}"
        style="
          min-width:0;
          padding:10px 8px;
          white-space:nowrap;
        "
      >
        🔖 ${
          saved
            ? "Saved"
            : "Save"
        }
      </button>
    </div>
  `;
}

function renderPost(post) {
  if (
    !post ||
    !post.id
  ) {
    return "";
  }

  const author =
    post.username ||
    post.displayName ||
    post.authorName ||
    "User";

  const avatar =
    post.photoURL ||
    post.avatarUrl ||
    "";

  const text =
    post.text ||
    post.content ||
    "";

  const own =
    state.user?.uid ===
    post.uid;

  const expiryLabel =
    formatExpiryLabel(post);

  const menuId =
    `postMenu-${post.id}`;

  return `
    <article
      class="card post-card"
      data-post-card="${cssEscape(
        post.id
      )}"
      style="
        margin-bottom:18px;
        padding:24px;
      "
    >
      <div
        style="
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
        "
      >
        <div
          style="
            display:flex;
            align-items:center;
            gap:14px;
            min-width:0;
          "
        >
          ${
            avatar
              ? `
                <img
                  src="${escapeHtml(
                    avatar
                  )}"
                  alt=""
                  style="
                    width:54px;
                    height:54px;
                    border-radius:50%;
                    object-fit:cover;
                    flex:0 0 54px;
                  "
                >
              `
              : `
                <div
                  style="
                    width:54px;
                    height:54px;
                    border-radius:50%;
                    display:grid;
                    place-items:center;
                    background:var(--primary-soft);
                    color:var(--primary);
                    font-weight:800;
                    font-size:18px;
                    flex:0 0 54px;
                  "
                >
                  ${escapeHtml(
                    initials(author)
                  )}
                </div>
              `
          }

          <div
            style="
              min-width:0;
            "
          >
            <strong
              style="
                display:block;
                font-size:17px;
                line-height:1.25;
                overflow-wrap:anywhere;
              "
            >
              ${escapeHtml(
                author
              )}
            </strong>

            <div
              class="small"
              style="
                margin-top:4px;
              "
            >
              ${escapeHtml(
                formatDate(
                  post.createdAt
                )
              )}
            </div>

            ${
              expiryLabel
                ? `
                  <div
                    class="small"
                    style="
                      margin-top:4px;
                      color:var(--muted);
                    "
                  >
                    ⏳ ${escapeHtml(
                      expiryLabel
                    )}
                  </div>
                `
                : ""
            }
          </div>
        </div>

        ${
          own
            ? `
              <div
                class="dropdown-container"
                style="
                  position:relative;
                  flex:0 0 auto;
                "
              >
                <button
                  type="button"
                  class="icon-btn"
                  data-menu-post="${cssEscape(
                    post.id
                  )}"
                  aria-label="Post options"
                  title="Post options"
                >
                  ⋮
                </button>

                <div
                  class="dropdown-menu hidden"
                  id="${menuId}"
                  style="
                    position:absolute;
                    right:0;
                    top:48px;
                    z-index:20;
                    min-width:150px;
                  "
                >
                  <button
                    type="button"
                    class="btn btn-ghost btn-block"
                    data-edit-post="${cssEscape(
                      post.id
                    )}"
                  >
                    ✏️ Edit
                  </button>

                  <button
                    type="button"
                    class="btn btn-ghost btn-block"
                    data-delete-post="${cssEscape(
                      post.id
                    )}"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            `
            : ""
        }
      </div>

      <div
        style="
          margin-top:24px;
          padding:0 8px;
          font-size:18px;
          line-height:1.7;
          overflow-wrap:anywhere;
        "
      >
        ${escapeHtml(text)}
      </div>

      ${
        post.imageUrl
          ? `
            <div
              style="
                margin-top:18px;
              "
            >
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
                  display:block;
                "
              >
            </div>
          `
          : ""
      }

      ${renderPostActions(
        post
      )}
    </article>
  `;
}

function renderHomeHeader() {
  return `
    <section
      style="
        margin-bottom:22px;
      "
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
              font-weight:700;
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            COMMUNITY FEED
          </div>

          <h1
            style="
              margin:8px 0 0;
              font-size:clamp(30px,7vw,42px);
              line-height:1.1;
            "
          >
            What's happening?
          </h1>
        </div>

        <button
          class="btn btn-primary"
          id="createPostBtn"
          type="button"
        >
          ＋ Create Post
        </button>
      </div>

      <div
        style="
          display:flex;
          gap:10px;
          margin-top:22px;
          flex-wrap:wrap;
        "
      >
        <input
          id="communityFeedSearch"
          class="input"
          type="search"
          placeholder="Search the community feed..."
          autocomplete="off"
          style="
            flex:1 1 280px;
          "
        />

        <button
          class="btn btn-ghost"
          id="youtubeLiveSearchBtn"
          type="button"
        >
          ▶️ YouTube Live
        </button>
      </div>
    </section>
  `;
}

function renderQuickActions() {
  return `
    <section
      style="
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:14px;
        margin-bottom:26px;
      "
    >
      <button
        class="card"
        type="button"
        data-quick="post"
        style="
          text-align:left;
          cursor:pointer;
          padding:20px;
          border:1px solid var(--border);
        "
      >
        <div
          style="
            font-size:28px;
            margin-bottom:12px;
          "
        >
          📝
        </div>

        <strong
          style="
            display:block;
            font-size:18px;
          "
        >
          Create post
        </strong>

        <span
          class="small"
          style="
            display:block;
            margin-top:6px;
          "
        >
          Share something
        </span>
      </button>

      <button
        class="card"
        type="button"
        data-quick="chat"
        style="
          text-align:left;
          cursor:pointer;
          padding:20px;
          border:1px solid var(--border);
        "
      >
        <div
          style="
            font-size:28px;
            margin-bottom:12px;
          "
        >
          💬
        </div>

        <strong
          style="
            display:block;
            font-size:18px;
          "
        >
          Explore Chat
        </strong>

        <span
          class="small"
          style="
            display:block;
            margin-top:6px;
          "
        >
          Meet and talk with people
        </span>
      </button>

      <button
        class="card"
        type="button"
        data-quick="timetrust"
        style="
          text-align:left;
          cursor:pointer;
          padding:20px;
          border:1px solid var(--border);
        "
      >
        <div
          style="
            font-size:28px;
            margin-bottom:12px;
          "
        >
          ⏱️
        </div>

        <strong
          style="
            display:block;
            font-size:18px;
          "
        >
          Explore TimeTrust
        </strong>

        <span
          class="small"
          style="
            display:block;
            margin-top:6px;
          "
        >
          Discover skills and services
        </span>
      </button>

      <button
        class="card"
        type="button"
        data-quick="market"
        style="
          text-align:left;
          cursor:pointer;
          padding:20px;
          border:1px solid var(--border);
        "
      >
        <div
          style="
            font-size:28px;
            margin-bottom:12px;
          "
        >
          🛍️
        </div>

        <strong
          style="
            display:block;
            font-size:18px;
          "
        >
          Explore Market
        </strong>

        <span
          class="small"
          style="
            display:block;
            margin-top:6px;
          "
        >
          Discover products and listings
        </span>
      </button>
    </section>
  `;
}

export function renderHome() {
  markHomeActivity();

  const posts =
    Array.isArray(state.posts)
      ? state.posts.filter(
          post =>
            post &&
            !isPostExpired(post)
        )
      : [];

  const showDiscovery =
    shouldShowDiscovery();

  return `
    <div
      style="
        padding-bottom:24px;
      "
    >
      ${
        showDiscovery
          ? renderDiscoveryBanner()
          : ""
      }

      ${renderQuickActions()}

      ${renderHomeHeader()}

      <section>
        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            margin-bottom:16px;
          "
        >
          <h2
            style="
              margin:0;
              font-size:28px;
            "
          >
            Community feed
          </h2>

          <span
            class="small"
            id="homePostCount"
          >
            ${posts.length}
          </span>
        </div>

        <div id="homePosts">
          ${
            posts.length
              ? posts
                  .map(
                    post =>
                      renderPost(
                        post
                      )
                  )
                  .join("")
              : `
                <div
                  class="card"
                  style="
                    padding:30px 24px;
                    text-align:center;
                  "
                >
                  <div
                    style="
                      font-size:38px;
                      margin-bottom:10px;
                    "
                  >
                    📝
                  </div>

                  <h3
                    style="
                      margin:0 0 8px;
                    "
                  >
                    No posts yet
                  </h3>

                  <p
                    class="small"
                    style="
                      margin:0 0 18px;
                    "
                  >
                    Be the first person to share something with the community.
                  </p>

                  <button
                    class="btn btn-primary"
                    id="emptyCreatePost"
                    type="button"
                  >
                    ＋ Create Post
                  </button>
                </div>
              `
          }
        </div>
      </section>
    </div>
  `;
}

function filterRenderedPosts(value) {
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
        const text =
          card.textContent
            .toLowerCase();

        card.style.display =
          !term ||
          text.includes(term)
            ? ""
            : "none";
      }
    );
}

export async function toggleLike(
  id
) {
  if (!state.user) {
    toast(
      "Please sign in to like posts."
    );

    return;
  }

  if (!id) {
    return;
  }

  if (
    pendingLikeIds.has(id)
  ) {
    return;
  }

  const post =
    state.posts.find(
      item =>
        item.id === id
    );

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
      doc(
        db,
        "posts",
        id
      ),
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
          (
            nextLiked
              ? 1
              : -1
          )
      );

    state.posts =
      state.posts.map(
        item =>
          item.id === id
            ? {
                ...item,
                likes:
                  nextLikes,
                likedBy:
                  nextLiked
                    ? Array.from(
                        new Set([
                          ...(Array.isArray(
                            item.likedBy
                          )
                            ? item.likedBy
                            : []),
                          state.user.uid
                        ])
                      )
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

    const updatedPost =
      state.posts.find(
        item =>
          item.id === id
      );

    if (
      updatedPost?.uid &&
      updatedPost.uid !==
        state.user.uid &&
      nextLiked
    ) {
      try {
        await addDoc(
          collection(
            db,
            "users",
            updatedPost.uid,
            "notifications"
          ),
          {
            type:
              "like",
            actorUid:
              state.user.uid,
            actorName:
              getCurrentUserName(),
            targetId:
              id,
            text:
              `${getCurrentUserName()} liked your post.`,
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

    refreshPostCard(
      id
    );
  } catch (error) {
    toast(
      friendly(error)
    );
  } finally {
    pendingLikeIds.delete(
      id
    );

    if (button) {
      button.disabled =
        false;
    }
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

  if (!id) {
    return;
  }

  if (
    pendingSaveIds.has(id)
  ) {
    return;
  }

  const post =
    state.posts.find(
      item =>
        item.id === id
    );

  if (!post) {
    toast(
      "This post is no longer available."
    );

    return;
  }

  const saved =
    isSaved(post);

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
      await deleteDoc(
        savedRef
      );

      savedPostIds.delete(
        id
      );

      state.savedPostCount =
        savedPostIds.size;

      state.posts =
        state.posts.map(
          item =>
            item.id === id
              ? {
                  ...item,
                  savedBy:
                    Array.isArray(
                      item.savedBy
                    )
                      ? item.savedBy.filter(
                          uid =>
                            uid !==
                            state.user.uid
                        )
                      : []
                }
              : item
        );

      toast(
        "Post removed from Saved."
      );
    } else {
      await setDoc(
        savedRef,
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

      state.posts =
        state.posts.map(
          item =>
            item.id === id
              ? {
                  ...item,
                  savedBy:
                    Array.from(
                      new Set([
                        ...(Array.isArray(
                          item.savedBy
                        )
                          ? item.savedBy
                          : []),
                        state.user.uid
                      ])
                    )
                }
              : item
        );

      toast(
        "Post saved 🔖"
      );
    }

    savedPostsLoadedForUid =
      state.user.uid;

    refreshPostCard(
      id
    );
  } catch (error) {
    toast(
      friendly(error)
    );
  } finally {
    pendingSaveIds.delete(
      id
    );

    if (button) {
      button.disabled =
        false;
    }
  }
}

function refreshPostCard(
  id
) {
  const post =
    state.posts.find(
      item =>
        item.id === id
    );

  const card =
    document.querySelector(
      `[data-post-card="${cssEscape(id)}"]`
    );

  if (!post || !card) {
    return;
  }

  const replacement =
    document.createElement(
      "div"
    );

  replacement.innerHTML =
    renderPost(post);

  const nextCard =
    replacement.firstElementChild;

  if (!nextCard) {
    return;
  }

  card.replaceWith(
    nextCard
  );

  attachSinglePostEvents(
    nextCard
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
      button => {
        button.addEventListener(
          "click",
          () => {
            toggleLike(
              button.dataset
                .like
            );
          }
        );
      }
    );

  root
    .querySelectorAll(
      "[data-save]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            savePost(
              button.dataset
                .save
            );
          }
        );
      }
    );

  root
    .querySelectorAll(
      "[data-share]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            sharePost(
              button.dataset
                .share
            );
          }
        );
      }
    );

  root
    .querySelectorAll(
      "[data-comment]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            showComments(
              button.dataset
                .comment
            );
          }
        );
      }
    );

  root
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
              button.dataset
                .editPost
            );
          }
        );
      }
    );

  root
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
              button.dataset
                .deletePost
            );
          }
        );
      }
    );

  root
    .querySelectorAll(
      "[data-menu-post]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          event => {
            event.stopPropagation();

            const id =
              button.dataset
                .menuPost;

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
        );
      }
    );
}

export function showCreatePost() {
  if (!state.user) {
    toast(
      "Please sign in to create a post."
    );

    return;
  }

  showModal(
    `
      <div class="modal-header">
        <h2>Create Post</h2>

        <button
          class="icon-btn"
          type="button"
          data-close-modal
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <label
          class="label"
          for="postText"
        >
          What would you like to share?
        </label>

        <textarea
          id="postText"
          class="input"
          rows="7"
          maxlength="5000"
          placeholder="Share something with the community..."
        ></textarea>

        <label
          class="label"
          for="postExpiry"
          style="
            margin-top:14px;
          "
        >
          Post duration
        </label>

        <select
          id="postExpiry"
          class="input"
        >
          <option value="12h">
            12 hours
          </option>

          <option
            value="1d"
            selected
          >
            1 day
          </option>

          <option value="7d">
            1 week
          </option>

          <option value="30d">
            30 days
          </option>
        </select>

        <div
          style="
            display:flex;
            gap:10px;
            justify-content:flex-end;
            margin-top:18px;
          "
        >
          <button
            class="btn btn-ghost"
            type="button"
            data-close-modal
          >
            Cancel
          </button>

          <button
            class="btn btn-primary"
            id="publishPostBtn"
            type="button"
          >
            Publish
          </button>
        </div>
      </div>
    `
  );

  document
    .querySelectorAll(
      "[data-close-modal]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          closeModal
        );
      }
    );

  document
    .getElementById(
      "publishPostBtn"
    )
    ?.addEventListener(
      "click",
      async () => {
        const textInput =
          document.getElementById(
            "postText"
          );

        const expiryInput =
          document.getElementById(
            "postExpiry"
          );

        const button =
          document.getElementById(
            "publishPostBtn"
          );

        const text =
          textInput?.value
            ?.trim() || "";

        if (!text) {
          toast(
            "Write something first."
          );

          return;
        }

        if (
          text.length >
          5000
        ) {
          toast(
            "Your post is too long."
          );

          return;
        }

        if (button) {
          button.disabled =
            true;

          button.textContent =
            "Publishing…";
        }

        try {
          const expiryDate =
            getPostExpiryDate(
              expiryInput?.value
            );

          await addDoc(
            collection(
              db,
              "posts"
            ),
            {
              uid:
                state.user.uid,
              username:
                getCurrentUserName(),
              text,
              likes: 0,
              comments: 0,
              likedBy: [],
              createdAt:
                serverTimestamp(),
              ...(expiryDate
                ? {
                    expiresAt:
                      Timestamp.fromDate(
                        expiryDate
                      )
                  }
                : {})
            }
          );

          closeModal();

          toast(
            "Post published 🎉"
          );
        } catch (error) {
          toast(
            friendly(error)
          );

          if (button) {
            button.disabled =
              false;

            button.textContent =
              "Publish";
          }
        }
      }
    );
}

export function showEditPost(
  id
) {
  if (!state.user) {
    toast(
      "Please sign in first."
    );

    return;
  }

  const post =
    state.posts.find(
      item =>
        item.id === id
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
    `
      <div class="modal-header">
        <h2>Edit Post</h2>

        <button
          class="icon-btn"
          type="button"
          data-close-modal
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <label
          class="label"
          for="editPostText"
        >
          Post
        </label>

        <textarea
          id="editPostText"
          class="input"
          rows="7"
          maxlength="5000"
        >${escapeHtml(
          post.text ||
          post.content ||
          ""
        )}</textarea>

        <div
          style="
            display:flex;
            gap:10px;
            justify-content:flex-end;
            margin-top:18px;
          "
        >
          <button
            class="btn btn-ghost"
            type="button"
            data-close-modal
          >
            Cancel
          </button>

          <button
            class="btn btn-primary"
            id="saveEditedPostBtn"
            type="button"
          >
            Save Changes
          </button>
        </div>
      </div>
    `
  );

  document
    .querySelectorAll(
      "[data-close-modal]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          closeModal
        );
      }
    );

  document
    .getElementById(
      "saveEditedPostBtn"
    )
    ?.addEventListener(
      "click",
      async () => {
        const input =
          document.getElementById(
            "editPostText"
          );

        const button =
          document.getElementById(
            "saveEditedPostBtn"
          );

        const text =
          input?.value
            ?.trim() || "";

        if (!text) {
          toast(
            "Write something first."
          );

          return;
        }

        if (
          text.length >
          5000
        ) {
          toast(
            "Your post is too long."
          );

          return;
        }

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
              updatedAt:
                serverTimestamp()
            }
          );

          state.posts =
            state.posts.map(
              item =>
                item.id === id
                  ? {
                      ...item,
                      text
                    }
                  : item
            );

          closeModal();

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

export function showDeletePostConfirmation(
  id
) {
  if (!state.user) {
    toast(
      "Please sign in first."
    );

    return;
  }

  const post =
    state.posts.find(
      item =>
        item.id === id
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
    `
      <div class="modal-header">
        <h2>Delete Post?</h2>

        <button
          class="icon-btn"
          type="button"
          data-close-modal
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <p>
          This will permanently remove your post.
        </p>

        <div
          style="
            display:flex;
            gap:10px;
            justify-content:flex-end;
            margin-top:18px;
          "
        >
          <button
            class="btn btn-ghost"
            type="button"
            data-close-modal
          >
            Cancel
          </button>

          <button
            class="btn btn-primary"
            id="confirmDeletePostBtn"
            type="button"
          >
            Delete
          </button>
        </div>
      </div>
    `
  );

  document
    .querySelectorAll(
      "[data-close-modal]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          closeModal
        );
      }
    );

  document
    .getElementById(
      "confirmDeletePostBtn"
    )
    ?.addEventListener(
      "click",
      async () => {
        const button =
          document.getElementById(
            "confirmDeletePostBtn"
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
            state.posts.filter(
              item =>
                item.id !== id
            );

          savedPostIds.delete(
            id
          );

          closeModal();

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

export async function sharePost(
  id
) {
  const post =
    state.posts.find(
      item =>
        item.id === id
    );

  if (!post) {
    toast(
      "Post not found."
    );

    return;
  }

  const text =
    post.text ||
    post.content ||
    "";

  const shareData = {
    title:
      "Marvel Chat",
    text:
      `${getCurrentUserName()} shared a post on Marvel Chat: ${text}`
  };

  try {
    if (
      navigator.share
    ) {
      await navigator.share(
        shareData
      );

      return;
    }

    const fallback =
      `${shareData.title}: ${shareData.text}`;

    if (
      navigator.clipboard
        ?.writeText
    ) {
      await navigator.clipboard.writeText(
        fallback
      );

      toast(
        "Post text copied."
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

export async function showComments(
  id
) {
  const post =
    state.posts.find(
      item =>
        item.id === id
    );

  showModal(
    `
      <div class="modal-header">
        <h2>Comments</h2>

        <button
          class="icon-btn"
          type="button"
          data-close-modal
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <div
          id="commentsList"
          class="list"
        >
          Loading comments…
        </div>

        ${
          state.user
            ? `
              <div
                style="
                  margin-top:18px;
                "
              >
                <textarea
                  id="commentText"
                  class="input"
                  rows="4"
                  maxlength="2000"
                  placeholder="Write a comment..."
                ></textarea>

                <button
                  class="btn btn-primary"
                  id="addComment"
                  type="button"
                  style="
                    margin-top:10px;
                  "
                >
                  Add comment
                </button>
              </div>
            `
            : `
              <div
                class="notice"
                style="
                  margin-top:18px;
                "
              >
                Sign in to join the conversation.
              </div>
            `
        }
      </div>
    `
  );

  document
    .querySelectorAll(
      "[data-close-modal]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          closeModal
        );
      }
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
          limit(100)
        )
      );

    const comments =
      snapshot.docs.map(
        item => ({
          id:
            item.id,
          ...item.data()
        })
      );

    const list =
      document.getElementById(
        "commentsList"
      );

    if (list) {
      list.innerHTML =
        comments.length
          ? comments
              .map(
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
                        comment.text ||
                        ""
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
        `<div class="status error">${escapeHtml(
          friendly(error)
        )}</div>`;
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

        if (!input) {
          return;
        }

        const text =
          input.value.trim();

        if (!text) {
          toast(
            "Write a comment first."
          );

          return;
        }

        if (!state.user) {
          toast(
            "Please sign in first."
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
            getCurrentUserName();

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
            post &&
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
              notificationError
            ) {
              console.warn(
                "Could not create comment notification:",
                notificationError
              );
            }
          }

          input.value =
            "";

          markHomeActivity();

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

function openYouTubeLiveSearch() {
  const url =
    "https://www.youtube.com/results?search_query=live";

  try {
    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  } catch {
    window.location.href =
      url;
  }
}

async function cleanupExpiredPosts() {
  if (!state.user) {
    return;
  }

  const expired =
    state.posts.filter(
      post =>
        post.uid ===
          state.user.uid &&
        isPostExpired(post)
    );

  for (
    const post of expired
  ) {
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
            item.id !==
            post.id
        );
    } catch (error) {
      console.warn(
        "Could not clean up expired post:",
        error
      );
    }
  }
}

export function attachHomeEvents(
  renderApp
) {
  const discoveryBanner =
    document.getElementById(
      "discoveryBanner"
    );

  if (discoveryBanner) {
    startDiscoveryCountdown();
  }

  loadSavedPostIds();

  document
    .getElementById(
      "discoveryClose"
    )
    ?.addEventListener(
      "click",
      () => {
        dismissDiscovery();
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
    .querySelectorAll(
      "[data-quick]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            markHomeActivity();

            const action =
              button.dataset
                .quick;

            if (
              action ===
              "post"
            ) {
              showCreatePost();
            } else if (
              action ===
              "chat"
            ) {
              state.page =
                "chat";

              renderApp();
            } else if (
              action ===
              "timetrust"
            ) {
              state.page =
                "timetrust";

              renderApp();
            } else if (
              action ===
              "market"
            ) {
              state.marketBrowseMode =
                false;

              state.page =
                "market";

              renderApp();
            }
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
        markHomeActivity();

        filterRenderedPosts(
          event.target.value
        );
      }
    );

  document
    .getElementById(
      "youtubeLiveSearchBtn"
    )
    ?.addEventListener(
      "click",
      () => {
        markHomeActivity();

        openYouTubeLiveSearch();
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
    .forEach(
      button => {
        button.addEventListener(
          "click",
          event => {
            event.stopPropagation();

            const postId =
              button.dataset
                .menuPost;

            const menu =
              document.getElementById(
                `postMenu-${postId}`
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

            const postId =
              button.dataset
                .editPost;

            showEditPost(
              postId
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

            const postId =
              button.dataset
                .deletePost;

            showDeletePostConfirmation(
              postId
            );
          }
        );
      }
    );

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
              button.dataset
                .like
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
              button.dataset
                .save
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
              button.dataset
                .share
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
              button.dataset
                .comment
            );
          }
        );
      }
    );

  if (
    !homeDocumentClickHandler
  ) {
    homeDocumentClickHandler =
      event => {
        const insideMenu =
          event.target.closest(
            ".dropdown-container"
          );

        if (insideMenu) {
          return;
        }

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
      };

    document.addEventListener(
      "click",
      homeDocumentClickHandler
    );
  }

  cleanupExpiredPosts().catch(
    error => {
      console.warn(
        "Expired post cleanup failed:",
        error
      );
    }
  );
}
