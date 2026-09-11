import { state, escapeHtml, initials, formatDate, friendly } from "../state.js";
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
import { showModal, closeModal } from "../components/modal.js";
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
const pendingLikeIds = new Set();
const pendingSaveIds = new Set();
let homeDocumentClickHandler = null;

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
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(String(value));
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function getCurrentUserName() {
  return (
    state.profile?.displayName ||
    state.profile?.username ||
    "User"
  );
}

function getPostExpiryDate(value) {
  const option = POST_EXPIRY_OPTIONS.find(item => item.value === value);

  if (!option) {
    return null;
  }

  return new Date(Date.now() + option.milliseconds);
}

function timestampToDate(value) {
  if (!value) return null;

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
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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

  const remaining = expiry.getTime() - Date.now();

  if (remaining <= 0) {
    return "Expired";
  }

  const minutes = Math.floor(remaining / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

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
    const raw = localStorage.getItem(DISCOVERY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const cutoff = Date.now() - DISCOVERY_WINDOW_MS;
    return parsed
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value >= cutoff)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function saveDiscoveryHistory(history) {
  try {
    localStorage.setItem(
      DISCOVERY_STORAGE_KEY,
      JSON.stringify(history.slice(-DISCOVERY_MAX_IMPRESSIONS))
    );
  } catch {
    /* ignore storage failures */
  }
}

function recordDiscoveryImpression() {
  const now = Date.now();
  const history = getDiscoveryHistory();

  if (
    history.length &&
    now - history[history.length - 1] < DISCOVERY_MIN_INTERVAL_MS
  ) {
    return;
  }

  history.push(now);
  saveDiscoveryHistory(history);
}

function shouldShowDiscovery() {
  const history = getDiscoveryHistory();

  if (!history.length) {
    return true;
  }

  if (history.length >= DISCOVERY_MAX_IMPRESSIONS) {
    return false;
  }

  return (
    Date.now() - history[history.length - 1] >=
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
    .getElementById("discoveryBanner")
    ?.remove();
}

function openDiscoveryDestination(destination, renderApp) {
  dismissDiscovery();

  if (destination === "market") {
    state.marketBrowseMode = false;
    state.page = "market";
    renderApp();
    return;
  }

  if (destination === "timetrust") {
    state.page = "timetrust";
    renderApp();
  }
}

function stopDiscoveryCountdown() {
  if (discoveryTimer) {
    clearInterval(discoveryTimer);
    discoveryTimer = null;
  }
}

function startDiscoveryCountdown() {
  const banner = document.getElementById("discoveryBanner");
  const ring = document.getElementById("discoveryRing");
  const counter = document.getElementById("discoveryCountdown");

  if (!banner || !ring || !counter) {
    stopDiscoveryCountdown();
    return;
  }

  if (discoveryTimer) {
    return;
  }

  discoveryStartedAt = Date.now();
  const duration = DISCOVERY_DURATION_SECONDS * 1000;

  const update = () => {
    if (!document.getElementById("discoveryBanner")) {
      stopDiscoveryCountdown();
      return;
    }

    const elapsed = Date.now() - discoveryStartedAt;
    const remainingMilliseconds = Math.max(0, duration - elapsed);
    const remainingSeconds = Math.ceil(remainingMilliseconds / 1000);
    const progress = remainingMilliseconds / duration;
    const percentage = Math.max(0, Math.min(100, progress * 100));

    ring.style.background =
      `conic-gradient(currentColor ${percentage}%, rgba(255,255,255,.10) ${percentage}% 100%)`;
    counter.textContent = String(remainingSeconds);

    if (remainingMilliseconds <= 0) {
      stopDiscoveryCountdown();
      dismissDiscovery();
    }
  };

  update();
  discoveryTimer = setInterval(update, 250);
}

function renderDiscoveryBanner() {
  return `
    <style>
      @keyframes marvelDiscoveryPulse {
        0%, 100% { transform:scale(1); filter:drop-shadow(0 0 0 transparent); }
        50% { transform:scale(1.035); filter:drop-shadow(0 0 14px currentColor); }
      }
      @keyframes marvelDiscoveryOrbit {
        from { transform:rotate(0deg); }
        to { transform:rotate(360deg); }
      }
      #discoveryRing {
        animation:marvelDiscoveryPulse 2.4s ease-in-out infinite;
      }
      #discoveryOrbit {
        animation:marvelDiscoveryOrbit 7s linear infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        #discoveryRing, #discoveryOrbit { animation:none !important; }
      }
    </style>
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
        <div style="flex:1; min-width:220px;">
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
            position:relative;
            width:150px;
            height:150px;
            flex:0 0 150px;
            display:grid;
            place-items:center;
            margin:auto;
          "
        >
          <div
            id="discoveryOrbit"
            style="
              position:absolute;
              inset:-10px;
              border:1px dashed currentColor;
              border-radius:50%;
              opacity:.35;
            "
          ></div>

          <div
            style="
              position:absolute;
              inset:8px;
              border-radius:50%;
              border:1px solid currentColor;
              opacity:.18;
            "
          ></div>

          <div
            id="discoveryRing"
            style="
              width:120px;
              height:120px;
              border-radius:50%;
              display:grid;
              place-items:center;
              position:relative;
              color:inherit;
            "
          >
            <div
              style="
                position:absolute;
                inset:7px;
                border-radius:50%;
                background:var(--card);
                display:grid;
                place-items:center;
                text-align:center;
              "
            >
              <strong
                id="discoveryCountdown"
                style="
                  display:block;
                  font-size:30px;
                  line-height:1;
                "
              >
                ${DISCOVERY_DURATION_SECONDS}
              </strong>

              <span
                class="small"
                style="margin-top:5px;"
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

function getVisiblePosts() {
  const posts =
    Array.isArray(state.posts)
      ? state.posts
      : [];

  return posts.filter(
    post => !isPostExpired(post)
  );
}

async function cleanupExpiredPosts() {
  if (!state.user) {
    return;
  }

  const posts =
    Array.isArray(state.posts)
      ? state.posts
      : [];

  const expiredOwnedPosts =
    posts.filter(
      post =>
        post?.uid === state.user.uid &&
        isPostExpired(post)
    );

  if (!expiredOwnedPosts.length) {
    return;
  }

  for (const post of expiredOwnedPosts) {
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
        "Could not remove expired post:",
        {
          postId: post.id,
          code: error?.code,
          error
        }
      );
    }
  }
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

        if (!term) {
          card.style.display = "";
          return;
        }

        const text =
          card.textContent
            ?.toLowerCase() ||
          "";

        card.style.display =
          text.includes(term)
            ? ""
            : "none";
      }
    );
}

function renderPost(post) {
  const user = state.user;
  const currentUid = user?.uid || "";

  const liked =
    Array.isArray(post.likedBy) &&
    currentUid &&
    post.likedBy.includes(currentUid);

  const saved =
    savedPostIds.has(post.id);

  const isOwner =
    currentUid &&
    post.uid === currentUid;

  const postInitials =
    initials(
      post.username ||
      "User"
    );

  const expiryLabel =
    formatExpiryLabel(post);

  return `
    <article
      class="card"
      data-post-card="${cssEscape(post.id)}"
      style="
        padding:20px;
        margin-bottom:14px;
      "
    >
      <div
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
            ${escapeHtml(postInitials)}
          </div>

          <div style="min-width:0;">
            <strong>
              ${escapeHtml(post.username || "User")}
            </strong>

            <div class="small">
              ${escapeHtml(formatDate(post.createdAt))}
              ${
                expiryLabel
                  ? ` · ${escapeHtml(expiryLabel)}`
                  : ""
              }
            </div>
          </div>
        </div>

        ${
          isOwner
            ? `
              <div
                class="dropdown-container"
                style="position:relative;"
              >
                <button
                  class="icon-btn"
                  type="button"
                  data-menu-post="${cssEscape(post.id)}"
                  aria-label="Post menu"
                  title="Post menu"
                >
                  ⋮
                </button>

                <div
                  class="dropdown-menu hidden"
                  id="postMenu-${cssEscape(post.id)}"
                  style="
                    position:absolute;
                    right:0;
                    top:46px;
                    z-index:20;
                    min-width:150px;
                  "
                >
                  <button
                    type="button"
                    data-edit-post="${cssEscape(post.id)}"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    data-delete-post="${cssEscape(post.id)}"
                  >
                    Delete
                  </button>
                </div>
              </div>
            `
            : ""
        }
      </div>

      <div
        style="
          margin-top:16px;
          line-height:1.65;
          white-space:pre-wrap;
          overflow-wrap:anywhere;
        "
      >
        ${escapeHtml(post.text || "")}
      </div>

      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:18px;
        "
      >
        <button
          class="btn btn-ghost ${liked ? "active" : ""}"
          type="button"
          data-like="${cssEscape(post.id)}"
        >
          ${liked ? "❤️" : "♡"} ${Number(post.likes || 0)}
        </button>

        <button
          class="btn btn-ghost"
          type="button"
          data-comment="${cssEscape(post.id)}"
        >
          💬 ${Number(post.comments || 0)}
        </button>

        <button
          class="btn btn-ghost ${saved ? "active" : ""}"
          type="button"
          data-save="${cssEscape(post.id)}"
        >
          ${saved ? "🔖 Saved" : "🔖 Save"}
        </button>

        <button
          class="btn btn-ghost"
          type="button"
          data-share="${cssEscape(post.id)}"
        >
          ↗️ Share
        </button>
      </div>
    </article>
  `;
}

export function renderHome() {
  const visiblePosts =
    getVisiblePosts();

  const sortedPosts =
    [...visiblePosts].sort(
      (a, b) => {

        const aTime =
          timestampToDate(
            a.createdAt
          )?.getTime() || 0;

        const bTime =
          timestampToDate(
            b.createdAt
          )?.getTime() || 0;

        return bTime - aTime;
      }
    );

  const showDiscovery =
    shouldShowDiscovery();

  return `
    <main
      class="page"
      style="
        max-width:980px;
        margin:0 auto;
        padding:22px 16px 50px;
      "
    >
      ${
        showDiscovery
          ? renderDiscoveryBanner()
          : ""
      }

      <section
        class="card"
        style="
          padding:22px;
          margin-bottom:20px;
        "
      >
        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:14px;
            flex-wrap:wrap;
          "
        >
          <div>
            <div class="small">
              COMMUNITY FEED
            </div>

            <h1
              style="
                margin:4px 0 0;
                font-size:clamp(25px,5vw,36px);
              "
            >
              What's happening?
            </h1>
          </div>

          <button
            class="btn btn-primary"
            type="button"
            id="createPostBtn"
          >
            ＋ Create Post
          </button>
        </div>

        <div
          style="
            display:flex;
            gap:10px;
            margin-top:18px;
            flex-wrap:wrap;
          "
        >
          <input
            id="communityFeedSearch"
            class="input"
            type="search"
            placeholder="Search the community feed…"
            autocomplete="off"
            style="
              flex:1;
              min-width:220px;
            "
          >

          <button
            class="btn btn-ghost"
            type="button"
            id="youtubeLiveSearchBtn"
          >
            ▶️ YouTube Live
          </button>
        </div>
      </section>

      ${
        sortedPosts.length
          ? `
            <section id="communityFeed">
              ${sortedPosts.map(renderPost).join("")}
            </section>
          `
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

      <section
        class="card"
        style="
          margin-top:20px;
          padding:22px;
        "
      >
        <div class="small">
          QUICK ACCESS
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:
              repeat(auto-fit,minmax(150px,1fr));
            gap:10px;
            margin-top:12px;
          "
        >
          <button
            class="btn btn-ghost"
            type="button"
            data-quick="post"
          >
            ✍️ Post
          </button>

          <button
            class="btn btn-ghost"
            type="button"
            data-quick="chat"
          >
            💬 Chat
          </button>

          <button
            class="btn btn-ghost"
            type="button"
            data-quick="timetrust"
          >
            ⏱️ TimeTrust
          </button>

          <button
            class="btn btn-ghost"
            type="button"
            data-quick="market"
          >
            🛍️ Market
          </button>
        </div>
      </section>
    </main>
  `;
}

export function showCreatePost() {
  const expiryOptions =
    POST_EXPIRY_OPTIONS.map(
      option => `
        <option value="${option.value}">
          ${escapeHtml(option.label)}
        </option>
      `
    ).join("");

  showModal(
    "Create Post",
    `
      <textarea
        id="postText"
        class="textarea"
        placeholder="Share something with the community…"
        maxlength="1000"
        rows="7"
      ></textarea>

      <div style="height:12px"></div>

      <label class="small" for="postExpiry">
        Post visibility duration
      </label>

      <select
        id="postExpiry"
        class="input"
        style="margin-top:6px;"
      >
        ${expiryOptions}
      </select>

      <div style="height:16px"></div>

      <button
        id="submitPost"
        class="btn btn-primary btn-block"
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
        const input =
          document.getElementById("postText");

        const expiry =
          document.getElementById("postExpiry");

        const button =
          document.getElementById("submitPost");

        if (!input || !button) {
          return;
        }

        const text =
          input.value.trim();

        if (!text) {
          toast(
            "Write something before publishing."
          );
          return;
        }

        if (!state.user) {
          toast(
            "Please sign in first."
          );
          return;
        }

        if (text.length > 1000) {
          toast(
            "Posts can contain up to 1000 characters."
          );
          return;
        }

        button.disabled = true;
        button.textContent =
          "Publishing…";

        try {
          const expiresAt =
            getPostExpiryDate(
              expiry?.value || "1d"
            );

          const postRef =
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
                expiresAt
              }
            );

          state.posts = [
            {
              id: postRef.id,
              uid: state.user.uid,
              username:
                getCurrentUserName(),
              text,
              likes: 0,
              comments: 0,
              likedBy: [],
              createdAt: new Date(),
              expiresAt
            },
            ...(Array.isArray(state.posts)
              ? state.posts
              : [])
          ];

          markHomeActivity();
          closeModal();
          toast("Post published ✨");
        } catch (error) {
          console.error(
            "Create post failed:",
            {
              code: error?.code,
              error
            }
          );

          toast(
            friendly(error)
          );

          button.disabled = false;
          button.textContent =
            "Publish Post";
        }
      }
    );
}

export function showEditPost(id) {
  const post =
    state.posts.find(
      item => item.id === id
    );

  if (!post || !state.user) {
    return;
  }

  if (post.uid !== state.user.uid) {
    toast(
      "You can only edit your own posts."
    );
    return;
  }

  const expiryOptions =
    POST_EXPIRY_OPTIONS.map(
      option => `
        <option
          value="${option.value}"
        >
          ${escapeHtml(option.label)}
        </option>
      `
    ).join("");

  showModal(
    "Edit Post",
    `
      <textarea
        id="editPostText"
        class="textarea"
        maxlength="1000"
        rows="7"
      >${escapeHtml(post.text || "")}</textarea>

      <div style="height:12px"></div>

      <label
        class="small"
        for="editPostExpiry"
      >
        Post visibility duration
      </label>

      <select
        id="editPostExpiry"
        class="input"
        style="margin-top:6px;"
      >
        ${expiryOptions}
      </select>

      <div style="height:16px"></div>

      <button
        id="saveEditedPost"
        class="btn btn-primary btn-block"
        type="button"
      >
        Save Changes
      </button>
    `
  );

  document
    .getElementById("saveEditedPost")
    ?.addEventListener(
      "click",
      async () => {
        const input =
          document.getElementById(
            "editPostText"
          );

        const expiry =
          document.getElementById(
            "editPostExpiry"
          );

        const button =
          document.getElementById(
            "saveEditedPost"
          );

        if (!input || !button) {
          return;
        }

        const text =
          input.value.trim();

        if (!text) {
          toast(
            "Post text cannot be empty."
          );
          return;
        }

        if (text.length > 1000) {
          toast(
            "Posts can contain up to 1000 characters."
          );
          return;
        }

        button.disabled = true;
        button.textContent =
          "Saving…";

        try {
          const expiresAt =
            getPostExpiryDate(
              expiry?.value || "1d"
            );

          await updateDoc(
            doc(
              db,
              "posts",
              id
            ),
            {
              text,
              expiresAt
            }
          );

          state.posts =
            state.posts.map(
              item =>
                item.id === id
                  ? {
                      ...item,
                      text,
                      expiresAt
                    }
                  : item
            );

          markHomeActivity();
          closeModal();
          toast(
            "Post updated."
          );
        } catch (error) {
          console.error(
            "Edit post failed:",
            {
              postId: id,
              code: error?.code,
              error
            }
          );

          toast(
            friendly(error)
          );

          button.disabled = false;
          button.textContent =
            "Save Changes";
        }
      }
    );
}

export function showDeletePostConfirmation(id) {
  const post =
    state.posts.find(
      item => item.id === id
    );

  if (!post || !state.user) {
    return;
  }

  if (post.uid !== state.user.uid) {
    toast(
      "You can only delete your own posts."
    );
    return;
  }

  showModal(
    "Delete Post",
    `
      <p>
        Are you sure you want to delete this post?
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
          id="cancelDeletePost"
          class="btn btn-ghost"
          type="button"
        >
          Cancel
        </button>

        <button
          id="confirmDeletePost"
          class="btn btn-primary"
          type="button"
        >
          Delete
        </button>
      </div>
    `
  );

  document
    .getElementById("cancelDeletePost")
    ?.addEventListener(
      "click",
      closeModal
    );

  document
    .getElementById("confirmDeletePost")
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
          console.error(
            "Delete post failed:",
            {
              postId: id,
              code: error?.code,
              error
            }
          );

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

export async function toggleLike(id) {
  const user = state.user;
  const post =
    state.posts.find(
      item => item.id === id
    );

  if (
    !user ||
    !post ||
    pendingLikeIds.has(id)
  ) {
    return;
  }

  const liked =
    Array.isArray(post.likedBy) &&
    post.likedBy.includes(
      user.uid
    );

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
            ? arrayRemove(user.uid)
            : arrayUnion(user.uid)
      }
    );

    const nextLikedBy =
      liked
        ? (
            Array.isArray(
              post.likedBy
            )
              ? post.likedBy.filter(
                  uid =>
                    uid !== user.uid
                )
              : []
          )
        : Array.from(
            new Set([
              ...(Array.isArray(
                post.likedBy
              )
                ? post.likedBy
                : []),
              user.uid
            ])
          );

    state.posts =
      state.posts.map(
        item =>
          item.id === id
            ? {
                ...item,
                likes:
                  Math.max(
                    0,
                    Number(
                      item.likes || 0
                    ) +
                      (
                        liked
                          ? -1
                          : 1
                      )
                  ),
                likedBy:
                  nextLikedBy
              }
            : item
      );

    updateLikeButton(id);

    if (
      !liked &&
      post.uid &&
      post.uid !== user.uid
    ) {
      addDoc(
        collection(
          db,
          "users",
          post.uid,
          "notifications"
        ),
        {
          type: "like",
          actorUid:
            user.uid,
          actorName:
            getCurrentUserName(),
          targetId:
            id,
          text:
            `${getCurrentUserName()} liked your post.`,
          read: false,
          createdAt:
            serverTimestamp()
        }
      ).catch(
        notificationError => {
          console.warn(
            "Like notification failed",
            {
              postId: id,
              code:
                notificationError?.code,
              error:
                notificationError
            }
          );
        }
      );
    }
  } catch (error) {
    console.error(
      "Like operation failed",
      {
        operation:
          liked
            ? "unlike"
            : "like",
        postId:
          id,
        path:
          `posts/${id}`,
        uid:
          user.uid,
        code:
          error?.code,
        error
      }
    );

    if (error?.code === "permission-denied") {
      toast(
        "Like was rejected by Firestore for this post. Your account is still safe; no changes were made."
      );
    } else {
      toast(friendly(error));
    }
  } finally {
    pendingLikeIds.delete(id);
    updateLikeButton(id);
  }
}

function updateLikeButton(id) {
  const post =
    state.posts.find(
      item => item.id === id
    );

  const button =
    document.querySelector(
      `[data-like="${cssEscape(id)}"]`
    );

  if (!post || !button) {
    return;
  }

  const currentUid =
    state.user?.uid;

  if (!currentUid) {
    return;
  }

  const liked =
    Array.isArray(post.likedBy) &&
    post.likedBy.includes(
      currentUid
    );

  button.classList.toggle(
    "active",
    liked
  );

  button.innerHTML =
    `${liked ? "❤️" : "♡"} ${Number(
      post.likes || 0
    )}`;

  button.disabled =
    pendingLikeIds.has(id);
}

async function loadSavedPostIds() {
  const user = state.user;

  if (!user) {
    return;
  }

  if (savedPostsLoadedForUid === user.uid) {
    return;
  }

  if (savedPostsLoadPromise && savedPostsLoadingUid === user.uid) {
    return savedPostsLoadPromise;
  }

  savedPostsLoadingUid = user.uid;
  savedPostsLoadPromise = (async () => {
    try {
      const snap =
        await getDocs(
          collection(
            db,
            "users",
            user.uid,
            "savedPosts"
          )
        );

      savedPostIds = new Set();

      snap.forEach(savedDoc => {
        savedPostIds.add(savedDoc.id);
      });

      savedPostsLoadedForUid = user.uid;

      if (state.page === "home") {
        const posts =
          Array.isArray(state.posts)
            ? state.posts
            : [];

        posts.forEach(post => updateSaveButton(post.id));
      }
    } catch (error) {
      console.error(
        "Saved posts load failed",
        {
          path: `users/${user.uid}/savedPosts`,
          uid: user.uid,
          code: error?.code,
          error
        }
      );
    } finally {
      savedPostsLoadPromise = null;
      savedPostsLoadingUid = null;
    }
  })();

  return savedPostsLoadPromise;
}

export async function savePost(id) {
  const user = state.user;
  const post =
    state.posts.find(
      item => item.id === id
    );

  if (
    !user ||
    !post ||
    pendingSaveIds.has(id)
  ) {
    return;
  }

  const saved =
    savedPostIds.has(id) ||
    (
      Array.isArray(
        post.savedBy
      ) &&
      post.savedBy.includes(
        user.uid
      )
    );

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
        user.uid,
        "savedPosts",
        id
      );

    if (saved) {
      await deleteDoc(
        savedRef
      );

      savedPostIds.delete(id);
    } else {
      await setDoc(
        savedRef,
        {
          postId:
            id,
          uid:
            user.uid,
          createdAt:
            serverTimestamp()
        }
      );

      savedPostIds.add(id);
    }

    updateSaveButton(id);

    markHomeActivity();

    toast(
      saved
        ? "Removed from saved posts."
        : "Saved to your vault 🔖"
    );
  } catch (error) {
    console.error(
      "Save operation failed",
      {
        operation:
          saved
            ? "unsave"
            : "save",
        postId:
          id,
        path:
          `users/${user.uid}/savedPosts/${id}`,
        uid:
          user.uid,
        code:
          error?.code,
        error
      }
    );

    if (error?.code === "permission-denied") {
      toast(
        "Save was rejected by Firestore. No changes were made to your account."
      );
    } else {
      toast(friendly(error));
    }
  } finally {
    pendingSaveIds.delete(id);
    updateSaveButton(id);
  }
}

function updateSaveButton(id) {
  const button =
    document.querySelector(
      `[data-save="${cssEscape(id)}"]`
    );

  if (!button) {
    return;
  }

  const saved =
    savedPostIds.has(id);

  button.classList.toggle(
    "active",
    saved
  );

  button.textContent =
    saved
      ? "🔖 Saved"
      : "🔖 Save";

  button.disabled =
    pendingSaveIds.has(id);
}

export async function sharePost(id) {
  const post =
    state.posts.find(
      item => item.id === id
    );

  if (!post) {
    return;
  }

  const text =
    `${post.username || "User"}: ${post.text || ""}`;

  try {
    if (
      navigator.share &&
      typeof navigator.share ===
        "function"
    ) {
      await navigator.share({
        title:
          "MARVEL CHAT",
        text
      });
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

    markHomeActivity();
  } catch (e) {
    if (
      e?.name !==
      "AbortError"
    ) {
      toast(
        "Could not share this post."
      );
    }
  }
}

function openYouTubeLiveSearch() {
  const queryText =
    "YouTube Live community";

  const url =
    `https://www.youtube.com/results?search_query=${encodeURIComponent(
      queryText
    )}&sp=EgJAAQ%253D%253D`;

  window.open(
    url,
    "_blank",
    "noopener,noreferrer"
  );
}

export async function showComments(id) {
  const post =
    state.posts.find(
      item => item.id === id
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

      <div style="height:14px"></div>

      <textarea
        class="textarea"
        id="commentText"
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
                c => `
                  <div class="list-item">

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

                    <div class="small">
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
  } catch (e) {
    const list =
      document.getElementById(
        "commentsList"
      );

    if (list) {
      list.innerHTML =
        `<div class="status error">${escapeHtml(
          friendly(e)
        )}</div>`;
    }
  }

  document
    .getElementById("addComment")
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

        const btn =
          document.getElementById(
            "addComment"
          );

        if (btn) {
          btn.disabled = true;
          btn.textContent =
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

          /*
           * Do not immediately call showComments() again.
           * The comment was just written successfully, so re-reading
           * the entire comments collection would spend another batch
           * of reads for no user-visible benefit.
           */
          const currentPost =
            state.posts.find(item => item.id === id);

          if (currentPost) {
            currentPost.comments =
              Math.max(
                0,
                Number(currentPost.comments || 0) + 1
              );
          }

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
                  read: false,
                  createdAt:
                    serverTimestamp()
                }
              );
            } catch (notifErr) {
              console.warn(
                "Could not create comment notification:",
                notifErr
              );
            }
          }

          input.value = "";

          markHomeActivity();

          toast(
            "Comment added 💬"
          );

          const list =
            document.getElementById("commentsList");

          if (list) {
            const emptyMessage =
              list.classList.contains("empty") ||
              list.textContent.includes("No comments yet");

            const itemHtml = `
              <div class="list-item">
                <strong>${escapeHtml(actorName)}</strong>
                <div>${escapeHtml(text)}</div>
                <div class="small">Just now</div>
              </div>
            `;

            if (emptyMessage) {
              list.className = "list";
              list.innerHTML = itemHtml;
            } else {
              list.insertAdjacentHTML("beforeend", itemHtml);
            }
          }

          const postCard =
            document.querySelector(
              `[data-post-card="${cssEscape(id)}"]`
            );

          if (postCard) {
            const commentButton =
              postCard.querySelector(
                `[data-comment="${cssEscape(id)}"]`
              );

            if (commentButton) {
              commentButton.textContent =
                `💬 ${Number(currentPost?.comments || 0)}`;
            }
          }
        } catch (e) {
          toast(
            friendly(e)
          );

          if (btn) {
            btn.disabled =
              false;
            btn.textContent =
              "Add comment";
          }
        }
      }
    );
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
    .getElementById("discoveryClose")
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
              button.dataset.quick;

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
