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
              id="discoveryOrbit"
              aria-hidden="true"
              style="
                position:absolute;
                inset:-5px;
                border-radius:50%;
                border:1px dashed currentColor;
                opacity:.42;
                pointer-events:none;
              "
            ></div>

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

export function renderPost(p) {
  const user = state.user;
  const liked =
    !!user &&
    Array.isArray(p.likedBy) &&
    p.likedBy.includes(user.uid);

  const saved =
    !!user &&
    (
      savedPostIds.has(p.id) ||
      (
        Array.isArray(p.savedBy) &&
        p.savedBy.includes(user.uid)
      )
    );

  const isOwner =
    !!user &&
    p.uid === user.uid;

  const expiryLabel = formatExpiryLabel(p);

  return `
    <article
      class="card post-card"
      data-post-card="${escapeHtml(p.id)}"
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
        <div
          style="
            display:flex;
            gap:10px;
            min-width:0;
            align-items:center;
          "
        >
          <div class="avatar">
            ${escapeHtml(
              initials(
                p.username ||
                p.displayName ||
                "User"
              )
            )}
          </div>

          <div style="min-width:0;">
            <strong>
              ${escapeHtml(
                p.username ||
                p.displayName ||
                "User"
              )}
            </strong>

            <div class="small">
              ${escapeHtml(
                formatDate(p.createdAt)
              )}
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
            class="icon-btn"
            type="button"
            data-menu-post="${escapeHtml(p.id)}"
            aria-label="Post menu"
            title="Post menu"
          >
            ⋮
          </button>

          <div
            id="postMenu-${escapeHtml(p.id)}"
            class="dropdown-menu hidden"
            style="
              position:absolute;
              right:0;
              top:42px;
              z-index:20;
              min-width:150px;
            "
          >
            ${
              isOwner
                ? `
                  <button
                    type="button"
                    class="dropdown-item"
                    data-edit-post="${escapeHtml(p.id)}"
                  >
                    ✏️ Edit
                  </button>

                  <button
                    type="button"
                    class="dropdown-item"
                    data-delete-post="${escapeHtml(p.id)}"
                  >
                    🗑️ Delete
                  </button>
                `
                : ""
            }

            <button
              type="button"
              class="dropdown-item"
              data-share="${escapeHtml(p.id)}"
            >
              📤 Share
            </button>
          </div>
        </div>
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
        ${escapeHtml(p.text || "")}
      </div>

      ${
        p.imageUrl
          ? `
            <div style="margin-top:14px;">
              <img
                src="${escapeHtml(p.imageUrl)}"
                alt="Post image"
                loading="lazy"
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

      <div
        style="
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:8px;
          margin-top:16px;
          padding-top:12px;
          border-top:1px solid var(--border);
        "
      >
        <button
          class="btn btn-ghost ${liked ? "active" : ""}"
          type="button"
          data-like="${escapeHtml(p.id)}"
          style="min-width:0;padding:10px 5px;white-space:nowrap;"
        >
          ${liked ? "❤️" : "♡"} ${Number(p.likes || 0)}
        </button>

        <button
          class="btn btn-ghost"
          type="button"
          data-comment="${escapeHtml(p.id)}"
          style="min-width:0;padding:10px 5px;white-space:nowrap;"
        >
          💬 ${Number(p.comments || 0)}
        </button>

        <button
          class="btn btn-ghost"
          type="button"
          data-share="${escapeHtml(p.id)}"
          style="min-width:0;padding:10px 5px;white-space:nowrap;"
        >
          📤 Share
        </button>

        <button
          class="btn btn-ghost ${saved ? "active" : ""}"
          type="button"
          data-save="${escapeHtml(p.id)}"
          style="min-width:0;padding:10px 5px;white-space:nowrap;"
        >
          ${saved ? "🔖 Saved" : "🔖 Save"}
        </button>
      </div>
    </article>
  `;
}

function filterRenderedPosts(value) {
  const term = String(value || "")
    .trim()
    .toLowerCase();

  document
    .querySelectorAll("[data-post-card]")
    .forEach(card => {
      const text =
        card.textContent.toLowerCase();

      card.style.display =
        !term || text.includes(term)
          ? ""
          : "none";
    });
}

async function cleanupExpiredPosts() {
  const user = state.user;

  if (!user || !Array.isArray(state.posts)) {
    return;
  }

  const expiredOwnedPosts =
    state.posts.filter(
      post =>
        post.uid === user.uid &&
        isPostExpired(post)
    );

  if (!expiredOwnedPosts.length) {
    return;
  }

  for (const post of expiredOwnedPosts) {
    try {
      await deleteDoc(
        doc(db, "posts", post.id)
      );
    } catch (error) {
      console.warn(
        "Could not clean up expired post:",
        {
          postId: post.id,
          code: error?.code,
          error
        }
      );
    }
  }
}

export function renderHome(renderApp) {
  const me =
    state.profile?.displayName ||
    state.profile?.username ||
    "there";

  const posts =
    Array.isArray(state.posts)
      ? state.posts.filter(post => !isPostExpired(post))
      : [];

  const showDiscovery =
    shouldShowDiscovery();

  const sortedPosts =
    [...posts].sort((a, b) => {
      const aDate =
        timestampToDate(a.createdAt)?.getTime() ||
        0;

      const bDate =
        timestampToDate(b.createdAt)?.getTime() ||
        0;

      return bDate - aDate;
    });

  return `
    <main
      class="page"
      style="padding-bottom:90px;"
    >
      ${
        showDiscovery
          ? renderDiscoveryBanner()
          : ""
      }

      <section
        class="card"
        style="
          margin-bottom:18px;
          padding:24px;
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

async function loadSavedPostIds() {
  const user = state.user;

  if (!user?.uid) {
    savedPostIds = new Set();
    savedPostsLoadedForUid = null;
    savedPostsLoadPromise = null;
    savedPostsLoadingUid = null;
    return;
  }

  if (savedPostsLoadedForUid === user.uid) {
    return;
  }

  if (
    savedPostsLoadPromise &&
    savedPostsLoadingUid === user.uid
  ) {
    return savedPostsLoadPromise;
  }

  savedPostsLoadingUid = user.uid;

  savedPostsLoadPromise =
    getDocs(
      collection(
        db,
        "users",
        user.uid,
        "savedPosts"
      )
    )
      .then(snapshot => {
        const next = new Set();

        snapshot.forEach(savedDoc => {
          next.add(savedDoc.id);
        });

        savedPostIds = next;
        savedPostsLoadedForUid = user.uid;

        document
          .querySelectorAll("[data-save]")
          .forEach(button => {
            const postId =
              button.dataset.save;

            const saved =
              savedPostIds.has(postId);

            button.classList.toggle(
              "active",
              saved
            );

            button.textContent =
              saved
                ? "🔖 Saved"
                : "🔖 Save";
          });
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
          user.uid
        ) {
          savedPostsLoadPromise = null;
          savedPostsLoadingUid = null;
        }
      });

  return savedPostsLoadPromise;
}

function updateLikeButton(postId) {
  const post =
    state.posts.find(
      item => item.id === postId
    );

  if (!post) {
    return;
  }

  const liked =
    !!state.user &&
    Array.isArray(post.likedBy) &&
    post.likedBy.includes(
      state.user.uid
    );

  document
    .querySelectorAll(
      `[data-like="${cssEscape(postId)}"]`
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        liked
      );

      button.textContent =
        `${liked ? "❤️" : "♡"} ${Number(post.likes || 0)}`;
    });
}

async function toggleLike(postId) {
  const user = state.user;

  if (!user?.uid) {
    toast("Please sign in first.");
    return;
  }

  if (pendingLikeIds.has(postId)) {
    return;
  }

  const post =
    state.posts.find(
      item => item.id === postId
    );

  if (!post) {
    return;
  }

  pendingLikeIds.add(postId);

  const liked =
    Array.isArray(post.likedBy) &&
    post.likedBy.includes(user.uid);

  const previousLikes =
    Number(post.likes || 0);

  const previousLikedBy =
    Array.isArray(post.likedBy)
      ? [...post.likedBy]
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
          uid => uid !== user.uid
        )
      : [
          ...previousLikedBy,
          user.uid
        ];

  post.likes = nextLikes;
  post.likedBy = nextLikedBy;

  updateLikeButton(postId);

  try {
    await updateDoc(
      doc(
        db,
        "posts",
        postId
      ),
      {
        likes: increment(
          liked ? -1 : 1
        ),
        likedBy: liked
          ? arrayRemove(user.uid)
          : arrayUnion(user.uid)
      }
    );

    if (
      !liked &&
      post.uid &&
      post.uid !== user.uid
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
            type: "like",
            actorUid: user.uid,
            actorName:
              getCurrentUserName(),
            targetId: postId,
            text:
              `${getCurrentUserName()} liked your post.`,
            read: false,
            createdAt:
              serverTimestamp()
          }
        );
      } catch (notifErr) {
        console.warn(
          "Could not create like notification:",
          notifErr
        );
      }
    }

    markHomeActivity();
  } catch (error) {
    post.likes = previousLikes;
    post.likedBy = previousLikedBy;

    updateLikeButton(postId);

    toast(
      friendly(error)
    );
  } finally {
    pendingLikeIds.delete(postId);
  }
}

async function savePost(postId) {
  const user = state.user;

  if (!user?.uid) {
    toast("Please sign in first.");
    return;
  }

  if (pendingSaveIds.has(postId)) {
    return;
  }

  pendingSaveIds.add(postId);

  const saved =
    savedPostIds.has(postId);

  try {
    const savedRef =
      doc(
        db,
        "users",
        user.uid,
        "savedPosts",
        postId
      );

    if (saved) {
      await deleteDoc(savedRef);
      savedPostIds.delete(postId);
    } else {
      await setDoc(
        savedRef,
        {
          postId,
          savedAt:
            serverTimestamp()
        }
      );

      savedPostIds.add(postId);
    }

    document
      .querySelectorAll(
        `[data-save="${cssEscape(postId)}"]`
      )
      .forEach(button => {
        const nowSaved =
          savedPostIds.has(postId);

        button.classList.toggle(
          "active",
          nowSaved
        );

        button.textContent =
          nowSaved
            ? "🔖 Saved"
            : "🔖 Save";
      });

    markHomeActivity();
  } catch (error) {
    toast(
      friendly(error)
    );
  } finally {
    pendingSaveIds.delete(postId);
  }
}

async function sharePost(postId) {
  const post =
    state.posts.find(
      item => item.id === postId
    );

  if (!post) {
    return;
  }

  const text =
    post.text ||
    "Check out this Marvel Chat post.";

  const shareData = {
    title: "Marvel Chat",
    text
  };

  try {
    if (
      navigator.share &&
      typeof navigator.share === "function"
    ) {
      await navigator.share(
        shareData
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
        "Post copied to clipboard."
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
  const expiryOptions =
    POST_EXPIRY_OPTIONS
      .map(
        option =>
          `
            <option value="${option.value}">
              ${option.label}
            </option>
          `
      )
      .join("");

  showModal(`
    <div class="modal-card">
      <div class="modal-header">
        <div>
          <div class="small">
            COMMUNITY
          </div>

          <h2>
            Create Post
          </h2>
        </div>

        <button
          type="button"
          class="icon-btn"
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
          rows="6"
          maxlength="4000"
          placeholder="What's on your mind?"
        ></textarea>

        <label
          class="small"
          for="createPostExpiry"
          style="
            display:block;
            margin-top:14px;
            margin-bottom:6px;
          "
        >
          Post visibility duration
        </label>

        <select
          id="createPostExpiry"
          class="input"
        >
          ${expiryOptions}
        </select>
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="btn btn-ghost"
          data-close-modal
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary"
          id="submitCreatePost"
        >
          Publish
        </button>
      </div>
    </div>
  `);

  document
    .getElementById(
      "submitCreatePost"
    )
    ?.addEventListener(
      "click",
      async () => {
        const user =
          state.user;

        if (!user?.uid) {
          toast(
            "Please sign in first."
          );
          return;
        }

        const input =
          document.getElementById(
            "createPostText"
          );

        const expiryInput =
          document.getElementById(
            "createPostExpiry"
          );

        const text =
          String(
            input?.value || ""
          ).trim();

        const expiryValue =
          expiryInput?.value ||
          "1d";

        if (!text) {
          toast(
            "Write something first."
          );
          return;
        }

        const expiryDate =
          getPostExpiryDate(
            expiryValue
          );

        const button =
          document.getElementById(
            "submitCreatePost"
          );

        if (button) {
          button.disabled = true;
          button.textContent =
            "Publishing…";
        }

        try {
          const createdPost = {
            uid: user.uid,
            username:
              getCurrentUserName(),
            text,
            likes: 0,
            comments: 0,
            likedBy: [],
            createdAt:
              serverTimestamp(),
            expiresAt:
              expiryDate
          };

          const postRef =
            await addDoc(
              collection(
                db,
                "posts"
              ),
              createdPost
            );

          state.posts.unshift({
            id: postRef.id,
            ...createdPost,
            createdAt:
              new Date(),
            expiresAt:
              expiryDate
          });

          closeModal();
          markHomeActivity();

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

function showEditPost(postId) {
  const post =
    state.posts.find(
      item => item.id === postId
    );

  if (!post) {
    return;
  }

  if (
    !state.user ||
    post.uid !==
      state.user.uid
  ) {
    toast(
      "You can only edit your own posts."
    );
    return;
  }

  showModal(`
    <div class="modal-card">
      <div class="modal-header">
        <div>
          <div class="small">
            COMMUNITY
          </div>

          <h2>
            Edit Post
          </h2>
        </div>

        <button
          type="button"
          class="icon-btn"
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
          maxlength="4000"
        >${escapeHtml(post.text || "")}</textarea>
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="btn btn-ghost"
          data-close-modal
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary"
          id="submitEditPost"
        >
          Save Changes
        </button>
      </div>
    </div>
  `);

  document
    .getElementById(
      "submitEditPost"
    )
    ?.addEventListener(
      "click",
      async () => {
        const input =
          document.getElementById(
            "editPostText"
          );

        const text =
          String(
            input?.value || ""
          ).trim();

        if (!text) {
          toast(
            "Post cannot be empty."
          );
          return;
        }

        const button =
          document.getElementById(
            "submitEditPost"
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
              postId
            ),
            {
              text,
              editedAt:
                serverTimestamp()
            }
          );

          post.text = text;
          post.editedAt =
            new Date();

          closeModal();
          markHomeActivity();

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

function showDeletePostConfirmation(
  postId
) {
  const post =
    state.posts.find(
      item => item.id === postId
    );

  if (!post) {
    return;
  }

  if (
    !state.user ||
    post.uid !==
      state.user.uid
  ) {
    toast(
      "You can only delete your own posts."
    );
    return;
  }

  showModal(`
    <div class="modal-card">
      <div class="modal-header">
        <div>
          <div class="small">
            COMMUNITY
          </div>

          <h2>
            Delete Post?
          </h2>
        </div>

        <button
          type="button"
          class="icon-btn"
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
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="btn btn-ghost"
          data-close-modal
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary"
          id="confirmDeletePost"
        >
          Delete
        </button>
      </div>
    </div>
  `);

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
              postId
            )
          );

          state.posts =
            state.posts.filter(
              item =>
                item.id !==
                postId
            );

          closeModal();
          markHomeActivity();

          document
            .querySelector(
              `[data-post-card="${cssEscape(postId)}"]`
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

async function showComments(postId) {
  const post =
    state.posts.find(
      item => item.id === postId
    );

  if (!post) {
    return;
  }

  showModal(`
    <div class="modal-card">
      <div class="modal-header">
        <div>
          <div class="small">
            COMMUNITY
          </div>

          <h2>
            Comments
          </h2>
        </div>

        <button
          type="button"
          class="icon-btn"
          data-close-modal
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div
        class="modal-body"
        style="padding-top:8px;"
      >
        <div
          id="commentsList"
          class="list"
        >
          <div class="small">
            Loading comments…
          </div>
        </div>

        <div
          style="
            display:flex;
            gap:8px;
            margin-top:16px;
            align-items:flex-end;
          "
        >
          <textarea
            id="newComment"
            class="input"
            rows="3"
            maxlength="2000"
            placeholder="Write a comment…"
            style="flex:1;"
          ></textarea>

          <button
            type="button"
            class="btn btn-primary"
            id="addComment"
          >
            Add comment
          </button>
        </div>
      </div>
    </div>
  `);

  const list =
    document.getElementById(
      "commentsList"
    );

  try {
    const commentsQuery =
      query(
        collection(
          db,
          "posts",
          postId,
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

    if (
      !document.getElementById(
        "commentsList"
      )
    ) {
      return;
    }

    if (snapshot.empty) {
      list.className =
        "list empty";

      list.innerHTML =
        `
          <div class="small">
            No comments yet.
          </div>
        `;
    } else {
      list.className = "list";

      list.innerHTML =
        snapshot.docs
          .map(commentDoc => {
            const comment =
              commentDoc.data();

            return `
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
            `;
          })
          .join("");
    }
  } catch (error) {
    if (list) {
      list.className =
        "list empty";

      list.innerHTML =
        `
          <div class="small">
            Could not load comments.
          </div>
        `;
    }

    console.warn(
      "Could not load comments:",
      error
    );
  }

  document
    .getElementById(
      "addComment"
    )
    ?.addEventListener(
      "click",
      async () => {
        const user =
          state.user;

        if (!user?.uid) {
          toast(
            "Please sign in first."
          );
          return;
        }

        const input =
          document.getElementById(
            "newComment"
          );

        const text =
          String(
            input?.value || ""
          ).trim();

        if (!text) {
          toast(
            "Write a comment first."
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
              postId,
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
              postId
            ),
            {
              comments:
                increment(1)
            }
          );

          const currentPost =
            state.posts.find(
              item =>
                item.id ===
                postId
            );

          if (currentPost) {
            currentPost.comments =
              Math.max(
                0,
                Number(
                  currentPost.comments ||
                  0
                ) + 1
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
                    postId,
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

          const commentsList =
            document.getElementById(
              "commentsList"
            );

          if (commentsList) {
            const emptyMessage =
              commentsList.classList.contains(
                "empty"
              ) ||
              commentsList.textContent.includes(
                "No comments yet"
              );

            const itemHtml = `
              <div class="list-item">
                <strong>${escapeHtml(actorName)}</strong>
                <div>${escapeHtml(text)}</div>
                <div class="small">Just now</div>
              </div>
            `;

            if (emptyMessage) {
              commentsList.className =
                "list";
              commentsList.innerHTML =
                itemHtml;
            } else {
              commentsList.insertAdjacentHTML(
                "beforeend",
                itemHtml
              );
            }
          }

          const postCard =
            document.querySelector(
              `[data-post-card="${cssEscape(postId)}"]`
            );

          if (postCard) {
            const commentButton =
              postCard.querySelector(
                `[data-comment="${cssEscape(postId)}"]`
              );

            if (commentButton) {
              commentButton.textContent =
                `💬 ${Number(currentPost?.comments || 0)}`;
            }
          }

          if (btn) {
            btn.disabled =
              false;
            btn.textContent =
              "Add comment";
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

function openYouTubeLiveSearch() {
  const url =
    "https://www.youtube.com/results?search_query=Marvel+live";

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
