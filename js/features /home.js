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
  "marvel_discovery_seen_v2";

const DISCOVERY_LAST_ACTIVE_KEY =
  "marvel_home_last_active_v1";

const DISCOVERY_MIN_INTERVAL_MS =
  24 * 60 * 60 * 1000;

const DISCOVERY_WINDOW_MS =
  7 * 24 * 60 * 60 * 1000;

const DISCOVERY_MAX_IMPRESSIONS =
  3;

const DISCOVERY_DURATION_SECONDS =
  40;

let discoveryTimer =
  null;

let discoveryStartedAt =
  0;

let savedPostIds =
  new Set();

let savedPostsLoadedForUid =
  null;

let savedPostsLoadPromise =
  null;

let savedPostsLoadingUid =
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
      .map(value => Number(value))
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

  if (
    history.length &&
    now -
      history[
        history.length - 1
      ] <
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

function stopDiscoveryCountdown() {
  if (discoveryTimer) {
    clearInterval(
      discoveryTimer
    );

    discoveryTimer =
      null;
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

    savedPostsLoadPromise =
      null;

    savedPostsLoadingUid =
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
    savedPostsLoadPromise &&
    savedPostsLoadingUid ===
      uid
  ) {
    return savedPostsLoadPromise;
  }

  savedPostsLoadingUid =
    uid;

  savedPostsLoadPromise =
    getDocs(
      collection(
        db,
        "users",
        uid,
        "savedPosts"
      )
    )
      .then(snapshot => {
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
      })
      .catch(error => {
        console.warn(
          "Could not load saved posts:",
          error
        );
      })
      .finally(() => {
        if (
          savedPostsLoadingUid ===
          uid
        ) {
          savedPostsLoadPromise =
            null;

          savedPostsLoadingUid =
            null;
        }
      });

  return savedPostsLoadPromise;
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
          TimeTrust
        </strong>

        <span
          class="small"
          style="
            display:block;
            margin-top:6px;
          "
        >
          Exchange skills and time
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
          Market
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
                <section
                  class="card empty"
                  style="
                    padding:38px 22px;
                    text-align:center;
                  "
                >
                  <div style="font-size:42px;">
                    ✨
                  </div>

                  <h3>
                    Your community feed is quiet.
                  </h3>

                  <p class="small">
                    Be the first to start a conversation.
                  </p>

                  <button
                    class="btn btn-primary"
                    type="button"
                    id="emptyCreatePost"
                  >
                    Create the first post
                  </button>
                </section>
              `
          }
        </div>
      </section>
    </div>
  `;
}

function updateLikeButton(
  postId
) {
  const post =
    state.posts.find(
      item =>
        item.id === postId
    );

  if (!post) {
    return;
  }

  const liked =
    !!state.user &&
    Array.isArray(
      post.likedBy
    ) &&
    post.likedBy.includes(
      state.user.uid
    );

  document
    .querySelectorAll(
      `[data-like="${cssEscape(postId)}"]`
    )
    .forEach(
      button => {
        button.classList.toggle(
          "btn-primary",
          liked
        );

        button.classList.toggle(
          "btn-ghost",
          !liked
        );

        button.textContent =
          `❤️ ${Number(
            post.likes || 0
          )}`;
      }
    );
}

async function toggleLike(
  id
) {
  if (!state.user) {
    toast(
      "Please sign in first."
    );

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
    return;
  }

  pendingLikeIds.add(id);

  const liked =
    Array.isArray(
      post.likedBy
    ) &&
    post.likedBy.includes(
      state.user.uid
    );

  const previousLikes =
    Number(
      post.likes || 0
    );

  const previousLikedBy =
    Array.isArray(
      post.likedBy
    )
      ? [
          ...post.likedBy
        ]
      : [];

  const nextLikes =
    Math.max(
      0,
      previousLikes +
        (liked ? -1 : 1)
    );

  const nextLikedBy =
    liked
      ? previousLikedBy.filter(
          uid =>
            uid !==
            state.user.uid
        )
      : [
          ...previousLikedBy,
          state.user.uid
        ];

  state.posts =
    state.posts.map(
      item =>
        item.id === id
          ? {
              ...item,
              likes:
                nextLikes,
              likedBy:
                nextLikedBy
            }
          : item
    );

  updateLikeButton(
    id
  );

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

    const updatedPost =
      state.posts.find(
        item =>
          item.id === id
      );

    if (
      updatedPost?.uid &&
      updatedPost.uid !==
        state.user.uid &&
      !liked
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
    state.posts =
      state.posts.map(
        item =>
          item.id === id
            ? {
                ...item,
                likes:
                  previousLikes,
                likedBy:
                  previousLikedBy
              }
            : item
      );

    updateLikeButton(
      id
    );

    toast(
      friendly(error)
    );
  } finally {
    pendingLikeIds.delete(id);
  }
}

async function savePost(
  id
) {
  if (!state.user) {
    toast(
      "Please sign in first."
    );

    return;
  }

  if (
    pendingSaveIds.has(id)
  ) {
    return;
  }

  pendingSaveIds.add(id);

  const alreadySaved =
    savedPostIds.has(id);

  try {
    const savedRef =
      doc(
        db,
        "users",
        state.user.uid,
        "savedPosts",
        id
      );

    if (alreadySaved) {
      await deleteDoc(
        savedRef
      );

      savedPostIds.delete(
        id
      );
    } else {
      await setDoc(
        savedRef,
        {
          postId:
            id,
          savedAt:
            serverTimestamp()
        }
      );

      savedPostIds.add(
        id
      );
    }

    state.savedPostCount =
      savedPostIds.size;

    state.posts =
      state.posts.map(
        post =>
          post.id === id
            ? {
                ...post,
                savedBy:
                  alreadySaved
                    ? (
                        Array.isArray(
                          post.savedBy
                        )
                          ? post.savedBy.filter(
                              uid =>
                                uid !==
                                state.user.uid
                            )
                          : []
                      )
                    : Array.from(
                        new Set([
                          ...(Array.isArray(
                            post.savedBy
                          )
                            ? post.savedBy
                            : []),
                          state.user.uid
                        ])
                      )
              }
            : post
      );

    refreshSavedButtons();

    refreshPostCard(
      id
    );

    toast(
      alreadySaved
        ? "Post removed from saved."
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

async function sharePost(
  id
) {
  const post =
    state.posts.find(
      item =>
        item.id === id
    );

  if (!post) {
    return;
  }

  const text =
    post.text ||
    post.content ||
    "";

  const shareData = {
    title:
      "Marvel Chat",
    text
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
  } catch (
    error
  ) {
    if (
      error?.name ===
      "AbortError"
    ) {
      return;
    }
  }

  try {
    await navigator.clipboard.writeText(
      text
    );

    toast(
      "Post copied to clipboard."
    );
  } catch {
    toast(
      text
    );
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
}

function showCreatePost() {
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
        <textarea
          id="createPostText"
          class="input"
          rows="7"
          maxlength="1000"
          placeholder="What's on your mind?"
        ></textarea>

        <div
          style="
            margin-top:14px;
          "
        >
          <label
            class="small"
            for="postExpiry"
          >
            Post visibility
          </label>

          <select
            id="postExpiry"
            class="input"
            style="
              margin-top:6px;
            "
          >
            <option value="">
              No expiry
            </option>

            ${POST_EXPIRY_OPTIONS.map(
              option => `
                <option value="${escapeHtml(
                  option.value
                )}">
                  ${escapeHtml(
                    option.label
                  )}
                </option>
              `
            ).join("")}
          </select>
        </div>

        <button
          class="btn btn-primary"
          id="publishPostBtn"
          type="button"
          style="
            margin-top:14px;
            width:100%;
          "
        >
          Publish
        </button>
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
        const input =
          document.getElementById(
            "createPostText"
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
          input?.value.trim() ||
          "";

        if (!text) {
          toast(
            "Write something first."
          );

          return;
        }

        if (!state.user) {
          toast(
            "Please sign in first."
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

async function showEditPost(
  id
) {
  const post =
    state.posts.find(
      item =>
        item.id === id
    );

  if (!post) {
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
        <textarea
          id="editPostText"
          class="input"
          rows="7"
          maxlength="1000"
        >${escapeHtml(
          post.text ||
          post.content ||
          ""
        )}</textarea>

        <button
          class="btn btn-primary"
          id="savePostEdit"
          type="button"
          style="
            margin-top:14px;
            width:100%;
          "
        >
          Save changes
        </button>
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
      "savePostEdit"
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
            "savePostEdit"
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

        if (!state.user) {
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
              "Save changes";
          }
        }
      }
    );
}

function showDeletePostConfirmation(
  id
) {
  const post =
    state.posts.find(
      item =>
        item.id === id
    );

  if (!post) {
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
          This will permanently delete your post.
        </p>

        <div
          style="
            display:flex;
            gap:10px;
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
            id="confirmDeletePost"
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
      "confirmDeletePost"
    )
    ?.addEventListener(
      "click",
      async () => {
        const button =
          document.getElementById(
            "confirmDeletePost"
          );

        if (!state.user) {
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

          closeModal();

          const card =
            document.querySelector(
              `[data-post-card="${cssEscape(id)}"]`
            );

          card?.remove();

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

async function showComments(
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

          const currentPost =
            state.posts.find(
              item =>
                item.id === id
            );

          if (currentPost) {
            state.posts =
              state.posts.map(
                item =>
                  item.id === id
                    ? {
                        ...item,
                        comments:
                          Number(
                            item.comments ||
                              0
                          ) + 1
                      }
                    : item
              );
          }

          const commentsList =
            document.getElementById(
              "commentsList"
            );

          if (commentsList) {
            const emptyMessage =
              commentsList.textContent?.trim() ===
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

          if (button) {
            button.disabled =
              false;

            button.textContent =
              "Add comment";
          }
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
  stopDiscoveryCountdown();

  loadSavedPostIds();

  cleanupExpiredPosts();

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
      "youtubeLiveSearchBtn"
    )
    ?.addEventListener(
      "click",
      openYouTubeLiveSearch
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
