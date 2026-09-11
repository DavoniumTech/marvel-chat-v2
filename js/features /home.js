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

import { toast } from "../components/toast.js";

const DISCOVERY_STORAGE_KEY = "marvel_discovery_seen_v2";
const DISCOVERY_LAST_ACTIVE_KEY = "marvel_home_last_active_v1";
const DISCOVERY_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DISCOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DISCOVERY_MAX_IMPRESSIONS = 3;
const DISCOVERY_DURATION_SECONDS = 40;

const POST_EXPIRY_OPTIONS = [
  { value: "12h", label: "12 hours", milliseconds: 12 * 60 * 60 * 1000 },
  { value: "1d", label: "1 day", milliseconds: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "1 week", milliseconds: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "30 days", milliseconds: 30 * 24 * 60 * 60 * 1000 }
];

let discoveryTimer = null;
let discoveryStartedAt = 0;
let savedPostIds = new Set();
let savedPostsLoadedForUid = null;
let savedPostsLoadPromise = null;
let homeSearchTerm = "";
let homeFeedFilter = "all";
let homeClickHandler = null;
let homeNavigationHandler = null;
let homeModalEscapeHandler = null;

const pendingLikeIds = new Set();
const pendingSaveIds = new Set();

function uid() {
  return state.user?.uid || null;
}

function postId(id) {
  return String(id ?? "");
}

function getPosts() {
  return Array.isArray(state.posts) ? state.posts : [];
}

function getPost(id) {
  return getPosts().find(
    p => postId(p.id) === postId(id)
  ) || null;
}

function getPostText(post) {
  return post?.text || post?.content || "";
}

function getPostAuthor(post) {
  return (
    post?.displayName ||
    post?.authorName ||
    post?.username ||
    "Marvel User"
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

function toDate(value) {
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
    const d = new Date(value);

    return Number.isNaN(d.getTime())
      ? null
      : d;
  }

  if (typeof value?.seconds === "number") {
    return new Date(
      value.seconds * 1000
    );
  }

  return null;
}

function isPostExpired(post) {
  const d = toDate(
    post?.expiresAt
  );

  return !!d &&
    d.getTime() <= Date.now();
}

function expiryLabel(post) {
  const d = toDate(
    post?.expiresAt
  );

  if (!d) {
    return "";
  }

  const remaining =
    d.getTime() - Date.now();

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

  if (days) {
    return `${days}d remaining`;
  }

  if (hours) {
    return `${hours}h remaining`;
  }

  if (minutes) {
    return `${minutes}m remaining`;
  }

  return "Ending soon";
}

function currentUserName() {
  return (
    state.profile?.displayName ||
    state.profile?.username ||
    "User"
  );
}

function currentUserGreeting() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

function safeMediaUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

function getPostMedia(post) {
  const media = post?.media || post?.attachment || null;
  if (!media) return null;

  if (typeof media === "string") {
    const url = safeMediaUrl(media);
    return url ? { type: "image", url } : null;
  }

  if (Array.isArray(media)) {
    const first = media.find(item => item?.url || item?.secure_url);
    if (!first) return null;
    const url = safeMediaUrl(first.url || first.secure_url);
    return url ? { type: first.type || "image", url } : null;
  }

  const url = safeMediaUrl(media.url || media.secure_url);
  return url ? { type: media.type || "image", url } : null;
}

function renderPostMedia(post) {
  const media = getPostMedia(post);
  if (!media) return "";

  if (media.type === "image" || media.type === "photo") {
    return `
      <div
        class="post-media"
        data-media-slot="image"
        style="
          margin-top:13px;
          overflow:hidden;
          border-radius:16px;
          border:1px solid var(--border);
          background:var(--surface);
        "
      >
        <img
          src="${escapeHtml(media.url)}"
          alt="Post media"
          loading="lazy"
          style="
            display:block;
            width:100%;
            max-height:520px;
            object-fit:cover;
          "
        >
      </div>
    `;
  }

  return `
    <a
      class="btn secondary"
      href="${escapeHtml(media.url)}"
      target="_blank"
      rel="noopener noreferrer"
      style="display:inline-flex;margin-top:12px;"
    >
      Open attachment ↗
    </a>
  `;
}

function getExpiryDate(value) {
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
  } catch {}
}

function discoveryHistory() {
  try {
    const parsed =
      JSON.parse(
        localStorage.getItem(
          DISCOVERY_STORAGE_KEY
        ) || "[]"
      );

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

function saveDiscoveryHistory(history) {
  try {
    localStorage.setItem(
      DISCOVERY_STORAGE_KEY,
      JSON.stringify(
        history.slice(
          -DISCOVERY_MAX_IMPRESSIONS
        )
      )
    );
  } catch {}
}

function shouldShowDiscovery() {
  const history =
    discoveryHistory();

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

function recordDiscoveryImpression() {
  const now =
    Date.now();

  const history =
    discoveryHistory();

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

function stopDiscoveryCountdown() {
  if (discoveryTimer) {
    clearInterval(
      discoveryTimer
    );
  }

  discoveryTimer =
    null;
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

  const tick = () => {
    if (
      !document.getElementById(
        "discoveryBanner"
      )
    ) {
      stopDiscoveryCountdown();
      return;
    }

    const remaining =
      Math.max(
        0,
        duration -
          (
            Date.now() -
            discoveryStartedAt
          )
      );

    const percentage =
      Math.max(
        0,
        Math.min(
          100,
          remaining /
            duration *
            100
        )
      );

    ring.style.background =
      `conic-gradient(currentColor ${percentage}%, rgba(255,255,255,.10) ${percentage}% 100%)`;

    counter.textContent =
      String(
        Math.ceil(
          remaining /
          1000
        )
      );

    if (remaining <= 0) {
      stopDiscoveryCountdown();
      dismissDiscovery();
    }
  };

  tick();

  discoveryTimer =
    setInterval(
      tick,
      250
    );
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

    renderApp?.();

    return;
  }

  if (
    destination ===
    "timetrust"
  ) {
    state.page =
      "timetrust";

    renderApp?.();
  }
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
        margin:0 0 18px;
        padding:24px 20px;
        border-radius:22px;
        box-shadow:var(--shadow);
      "
    >
      <button
        type="button"
        class="icon-btn"
        id="discoveryClose"
        aria-label="Close discovery"
        style="
          position:absolute;
          top:12px;
          right:12px;
          z-index:2;
        "
      >
        ✕
      </button>

      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:18px;
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
              margin-bottom:6px;
            "
          >
            MARVEL CHAT DISCOVERY
          </div>

          <h2
            style="
              margin:0 0 8px;
              font-size:clamp(25px,6vw,38px);
              line-height:1.05;
            "
          >
            Explore what your community can do ✨
          </h2>

          <p
            style="
              margin:0;
              line-height:1.55;
              max-width:560px;
            "
          >
            Discover people, conversations, skills,
            TimeTrust and the Market — all from one
            Marvel Chat universe.
          </p>

          <div
            style="
              display:flex;
              gap:8px;
              flex-wrap:wrap;
              margin-top:15px;
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
            width:76px;
            height:76px;
            border-radius:50%;
            display:grid;
            place-items:center;
            color:var(--primary);
            background:rgba(124,58,237,.08);
            flex:0 0 auto;
          "
        >
          <div
            id="discoveryRing"
            style="
              width:62px;
              height:62px;
              border-radius:50%;
              display:grid;
              place-items:center;
              background:
                conic-gradient(
                  currentColor 100%,
                  rgba(255,255,255,.10) 100%
                );
            "
          >
            <div
              style="
                inset:5px;
                position:relative;
                width:52px;
                height:52px;
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

function isLiked(post) {
  return (
    !!uid() &&
    Array.isArray(
      post?.likedBy
    ) &&
    post.likedBy
      .map(String)
      .includes(
        String(uid())
      )
  );
}

function isSaved(post) {
  return savedPostIds.has(
    postId(post?.id)
  );
}

function postLikes(post) {
  const n =
    Number(post?.likes);

  return Number.isFinite(n)
    ? n
    : 0;
}

function postComments(post) {
  const n =
    Number(post?.comments);

  return Number.isFinite(n)
    ? n
    : 0;
}

function cssEscape(value) {
  if (
    typeof CSS !==
      "undefined" &&
    typeof CSS.escape ===
      "function"
  ) {
    return CSS.escape(
      String(value)
    );
  }

  return String(value)
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "\\$&"
    );
}

function refreshPostCard(id) {
  const card =
    document.querySelector(
      `#homePage [data-post-card="${cssEscape(
        postId(id)
      )}"]`
    );

  const post =
    getPost(id);

  if (
    !card ||
    !post ||
    isPostExpired(post)
  ) {
    card?.remove();
    return;
  }

  const holder =
    document.createElement(
      "div"
    );

  holder.innerHTML =
    renderPostCard(post);

  card.replaceWith(
    holder.firstElementChild
  );
}

function renderPostCard(post) {
  const id = postId(post.id);
  const owner = String(post.uid) === String(uid());
  const liked = isLiked(post);
  const saved = isSaved(post);
  const date = getPostDate(post);
  const text = escapeHtml(getPostText(post)).replace(/\n/g, "<br>");
  const name = escapeHtml(getPostAuthor(post));
  const initialsText = escapeHtml(initials(getPostAuthor(post)));
  const expiry = expiryLabel(post);
  const edited = !!post?.editedAt;

  return `
    <article
      class="card post-card"
      data-post-card="${escapeHtml(id)}"
      data-post-owner="${owner ? "true" : "false"}"
      data-post-saved="${saved ? "true" : "false"}"
      style="margin-bottom:14px;overflow:hidden;"
    >
      <div
        style="
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:10px;
        "
      >
        <div
          style="
            display:flex;
            align-items:center;
            gap:10px;
            min-width:0;
          "
        >
          <div class="avatar" aria-hidden="true">
            ${initialsText}
          </div>

          <div style="min-width:0;">
            <strong
              style="
                display:block;
                overflow:hidden;
                text-overflow:ellipsis;
                white-space:nowrap;
              "
            >
              ${name}
            </strong>

            <div
              class="small"
              style="
                display:flex;
                gap:5px;
                align-items:center;
                flex-wrap:wrap;
              "
            >
              <span>
                ${escapeHtml(date ? formatDate(date) : "")}
              </span>
              ${edited ? `<span aria-label="Edited">· edited</span>` : ""}
              ${expiry ? `<span>· ${escapeHtml(expiry)}</span>` : ""}
            </div>
          </div>
        </div>

        <div
          class="dropdown-container"
          style="position:relative;flex:0 0 auto;"
        >
          <button
            type="button"
            class="icon-btn"
            data-home-action="menu"
            data-id="${escapeHtml(id)}"
            aria-label="Post menu"
            title="Post options"
          >
            ⋯
          </button>

          <div
            id="postMenu-${escapeHtml(id)}"
            class="dropdown-menu hidden"
            style="
              position:absolute;
              right:0;
              top:42px;
              z-index:30;
              min-width:170px;
            "
          >
            ${
              owner
                ? `
                  <button
                    type="button"
                    class="dropdown-item"
                    data-home-action="edit"
                    data-id="${escapeHtml(id)}"
                  >
                    ✏️ Edit post
                  </button>

                  <button
                    type="button"
                    class="dropdown-item"
                    data-home-action="delete"
                    data-id="${escapeHtml(id)}"
                  >
                    🗑️ Delete post
                  </button>
                `
                : `
                  <button
                    type="button"
                    class="dropdown-item"
                    data-home-action="save"
                    data-id="${escapeHtml(id)}"
                  >
                    ${saved ? "🔖 Remove saved" : "🔖 Save post"}
                  </button>

                  <button
                    type="button"
                    class="dropdown-item"
                    data-home-action="share"
                    data-id="${escapeHtml(id)}"
                  >
                    ↗️ Share post
                  </button>
                `
            }
          </div>
        </div>
      </div>

      <div
        class="post-content"
        style="margin-top:13px;line-height:1.65;overflow-wrap:anywhere;"
      >
        ${text}
      </div>

      ${renderPostMedia(post)}

      <div
        class="post-engagement"
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          flex-wrap:wrap;
          margin-top:13px;
          padding-top:10px;
          color:var(--muted);
          font-size:12px;
        "
      >
        <span>
          ${postLikes(post)}
          ${postLikes(post) === 1 ? "like" : "likes"}
        </span>

        <span>
          ${postComments(post)}
          ${postComments(post) === 1 ? "comment" : "comments"}
        </span>
      </div>

      <div
        class="post-actions"
        style="
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:6px;
          margin-top:8px;
          padding-top:9px;
          border-top:1px solid var(--border);
        "
      >
        <button
          type="button"
          class="btn secondary"
          data-home-action="like"
          data-id="${escapeHtml(id)}"
          ${pendingLikeIds.has(id) ? "disabled" : ""}
          style="
            min-width:0;
            padding:8px 3px;
            font-size:12px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          "
        >
          ${liked ? "❤️" : "🤍"}
          ${liked ? "Liked" : "Like"} ·
          ${postLikes(post)}
        </button>

        <button
          type="button"
          class="btn secondary"
          data-home-action="comment"
          data-id="${escapeHtml(id)}"
          style="
            min-width:0;
            padding:8px 3px;
            font-size:12px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          "
        >
          💬 Comment · ${postComments(post)}
        </button>

        <button
          type="button"
          class="btn secondary"
          data-home-action="save"
          data-id="${escapeHtml(id)}"
          ${pendingSaveIds.has(id) ? "disabled" : ""}
          style="
            min-width:0;
            padding:8px 3px;
            font-size:12px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          "
        >
          ${saved ? "🔖 Saved" : "🔖 Save"}
        </button>

        <button
          type="button"
          class="btn secondary"
          data-home-action="share"
          data-id="${escapeHtml(id)}"
          style="
            min-width:0;
            padding:8px 3px;
            font-size:12px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          "
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
      style="
        margin-bottom:20px;
      "
    >
      <button
        type="button"
        class="quick"
        data-quick="post"
      >
        <span class="quick-icon">
          ✍️
        </span>

        <strong>
          Create post
        </strong>

        <span class="small">
          Share something
        </span>
      </button>

      <button
        type="button"
        class="quick"
        data-quick="chat"
      >
        <span class="quick-icon">
          💬
        </span>

        <strong>
          Start chat
        </strong>

        <span class="small">
          Talk to someone
        </span>
      </button>

      <button
        type="button"
        class="quick"
        data-quick="skill"
      >
        <span class="quick-icon">
          ⏱️
        </span>

        <strong>
          Discover a skill
        </strong>

        <span class="small">
          Trade your time
        </span>
      </button>

      <button
        type="button"
        class="quick"
        data-quick="sell"
      >
        <span class="quick-icon">
          🛍️
        </span>

        <strong>
          Explore Marvel Market 
        </strong>

        <span class="small">
          Open the market
        </span>
      </button>
    </section>
  `;
}

function renderSearchCard() {
  const filters = [
    ["all", "All"],
    ["mine", "My posts"],
    ["saved", "Saved"]
  ];

  return `
    <section
      class="card home-search-card"
      style="
        margin-bottom:14px;
        padding:13px;
        border:1px solid rgba(124,58,237,.20);
        background:
          linear-gradient(
            135deg,
            rgba(124,58,237,.10),
            rgba(139,92,246,.035)
          );
      "
    >
      <div
        style="
          display:flex;
          align-items:center;
          gap:8px;
          margin-bottom:9px;
        "
      >
        <span aria-hidden="true" style="font-size:18px;">🔎</span>
        <strong>Find something in your feed</strong>
      </div>

      <div style="position:relative;">
        <input
          id="communityFeedSearch"
          class="input"
          type="search"
          value="${escapeHtml(homeSearchTerm)}"
          placeholder="Search posts or people…"
          autocomplete="off"
          aria-label="Search community posts"
          style="
            width:100%;
            min-height:45px;
            padding-right:44px;
            border-radius:14px;
            box-sizing:border-box;
          "
        >

        <button
          id="clearCommunitySearch"
          class="icon-btn"
          type="button"
          aria-label="Clear search"
          title="Clear search"
          style="
            display:${homeSearchTerm ? "inline-flex" : "none"};
            position:absolute;
            right:6px;
            top:50%;
            transform:translateY(-50%);
            width:34px;
            height:34px;
          "
        >
          ✕
        </button>
      </div>

      <div
        class="home-filter-row"
        style="
          display:flex;
          gap:7px;
          overflow:auto;
          padding:9px 0 2px;
          scrollbar-width:none;
        "
        role="tablist"
        aria-label="Feed filters"
      >
        ${filters.map(
          ([value, label]) => `
            <button
              type="button"
              class="btn ${
                homeFeedFilter === value
                  ? "btn-primary"
                  : "secondary"
              }"
              data-feed-filter="${value}"
              role="tab"
              aria-selected="${
                homeFeedFilter === value
                  ? "true"
                  : "false"
              }"
              style="
                flex:0 0 auto;
                padding:7px 11px;
                font-size:12px;
                border-radius:999px;
              "
            >
              ${label}
            </button>
          `
        ).join("")}
      </div>

      <div
        id="communitySearchStatus"
        class="small"
        aria-live="polite"
        style="margin:6px 2px 0;min-height:15px;"
      ></div>
    </section>
  `;
}

function renderPosts() {
  if (!Array.isArray(state.posts)) {
    return `
      <section
        class="card"
        aria-live="polite"
        style="text-align:center;padding:34px 18px;"
      >
        <div style="font-size:34px;">⏳</div>
        <h3 style="margin:8px 0 5px;">
          Loading your community
        </h3>
        <p class="small" style="margin:0;">
          Getting the latest posts ready for you…
        </p>
      </section>
    `;
  }

  const posts =
    getPosts()
      .filter(
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
          padding:32px 18px;
        "
      >
        <div
          style="
            font-size:40px;
          "
        >
          🌌
        </div>

        <h3
          style="
            margin:8px 0;
          "
        >
          Your community feed is quiet
        </h3>

        <p
          class="small"
          style="
            max-width:520px;
            margin:0 auto 16px;
          "
        >
          Be the first to share something
          with the Marvel Chat universe.
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
    <section id="communityPosts">
      ${
        posts
          .map(renderPostCard)
          .join("")
      }
    </section>
  `;
}

export function renderHome() {
  stopDiscoveryCountdown();
  closeHomeModal();

  const me = currentUserName();
  const greeting = currentUserGreeting();

  return `
    <div
      class="page home-page"
      id="homePage"
      style="
        padding-bottom:90px;
      "
    >
      <style>
        #homePage .home-hero{
          position:relative;
          overflow:hidden;
          margin-bottom:18px;
          padding:25px 21px;
          border-radius:24px;
          color:#fff;
          background:
            radial-gradient(
              circle at 88% 15%,
              rgba(255,255,255,.18),
              transparent 34%
            ),
            radial-gradient(
              circle at 12% 88%,
              rgba(255,255,255,.12),
              transparent 36%
            ),
            linear-gradient(
              135deg,
              #4c1d95,
              #7c3aed 55%,
              #8b5cf6
            );
          box-shadow:
            0 18px 44px
            rgba(91,33,182,.22);
        }

        #homePage .home-hero h1{
          position:relative;
          z-index:1;
          margin:0 0 8px;
          font-size:
            clamp(
              28px,
              7vw,
              42px
            );
          line-height:1.05;
        }

        #homePage .home-hero p{
          position:relative;
          z-index:1;
          max-width:650px;
          margin:0;
          line-height:1.55;
          font-size:15px;
          opacity:.93;
        }

        #homePage .home-section-head{
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:10px;
          margin:2px 0 10px;
        }

        #homePage .home-section-head h2{
          margin:0;
          font-size:
            clamp(
              22px,
              5vw,
              30px
            );
        }

        #homePage .home-section-head .small{
          margin-top:3px;
        }

        #homePage .post-actions button{
          touch-action:manipulation;
        }

        #homePage .post-actions button:disabled{
          opacity:.6;
        }

        #homePage .home-filter-row{
          -ms-overflow-style:none;
        }

        #homePage .home-filter-row::-webkit-scrollbar{
          display:none;
        }

        @media(max-width:520px){
          #homePage .home-hero{
            padding:21px 17px;
            border-radius:20px;
          }

          #homePage .home-composer-row{
            align-items:stretch!important;
          }

          #homePage .home-composer-row .avatar{
            display:none;
          }

          #homePage .home-composer-row #openComposerButton{
            padding:9px 10px!important;
          }

          #homePage .post-actions{
            gap:5px!important;
          }

          #homePage .post-actions button{
            font-size:10.5px!important;
            padding-left:2px!important;
            padding-right:2px!important;
          }

          #homePage .post-engagement{
            font-size:11px!important;
          }
        }
      </style>

      <section
        class="home-hero"
        aria-label="Marvel Chat welcome"
      >
        <h1>
          ${escapeHtml(greeting)}, ${escapeHtml(me)} 👋
        </h1>

        <p>
          Your community is moving. Share ideas, meet people,
          trade skills, explore the Market and keep the
          conversation going — all in one place.
        </p>
      </section>

      ${
        shouldShowDiscovery()
          ? renderDiscoveryBanner()
          : ""
      }

      ${renderQuickActions()}

      <section
        class="card home-composer-preview"
        style="margin-bottom:18px;padding:12px;"
        aria-label="Create a post"
      >
        <div
          class="home-composer-row"
          style="
            display:flex;
            align-items:center;
            gap:10px;
          "
        >
          <div class="avatar" aria-hidden="true">
            ${escapeHtml(initials(me))}
          </div>

          <button
            type="button"
            class="input"
            id="openComposerPreview"
            style="
              flex:1;
              text-align:left;
              min-height:44px;
              border-radius:14px;
              cursor:pointer;
            "
          >
            What’s on your mind, ${escapeHtml(me)}?
          </button>

          <button
            type="button"
            class="btn btn-primary"
            id="openComposerButton"
            style="
              flex:0 0 auto;
              padding:9px 12px;
            "
          >
            + Post
          </button>
        </div>

        <div
          style="
            display:flex;
            align-items:center;
            gap:8px;
            flex-wrap:wrap;
            margin-top:9px;
          "
        >
          <span class="small">
            ✍️ Text post
          </span>

          <span
            class="small"
            data-media-slot="future"
          >
            📷 Photo & media ready for the next media update
          </span>
        </div>
      </section>

      <div
        class="home-section-head"
      >
        <div>
          <h2>
            Community feed
          </h2>

          <div class="small">
            Discover conversations,
            ideas and opportunities.
          </div>
        </div>

        <button
          class="btn btn-primary"
          id="createPostBtn"
          type="button"
        >
          + Post
        </button>
      </div>

      ${renderSearchCard()}


      ${renderPosts()}
    </div>
  `;
}

async function loadSavedPostIds() {
  const currentUid =
    uid();

  if (!currentUid) {
    savedPostIds =
      new Set();

    savedPostsLoadedForUid =
      null;

    return;
  }

  if (
    savedPostsLoadedForUid ===
    currentUid
  ) {
    return;
  }

  if (
    savedPostsLoadPromise
  ) {
    return savedPostsLoadPromise;
  }

  savedPostsLoadPromise =
    (async () => {
      try {
        const snapshot =
          await getDocs(
            collection(
              db,
              "users",
              currentUid,
              "savedPosts"
            )
          );

        savedPostIds =
          new Set(
            snapshot.docs.map(
              item =>
                String(item.id)
            )
          );

        savedPostsLoadedForUid =
          currentUid;
      } catch (error) {
        console.warn(
          "Could not load saved posts:",
          error
        );
      } finally {
        savedPostsLoadPromise =
          null;
      }
    })();

  return savedPostsLoadPromise;
}

export async function toggleLike(
  id
) {
  if (!uid()) {
    return toast(
      "Please sign in first."
    );
  }

  const post =
    getPost(id);

  if (!post) {
    return toast(
      "Post is no longer available."
    );
  }

  const idString =
    postId(id);

  if (
    pendingLikeIds.has(
      idString
    )
  ) {
    return;
  }

  pendingLikeIds.add(
    idString
  );

  const liked =
    isLiked(post);

  const previousLikes =
    postLikes(post);

  const previousLikedBy =
    Array.isArray(
      post.likedBy
    )
      ? [
          ...post.likedBy
        ]
      : [];

  const nextLikedBy =
    liked
      ? previousLikedBy.filter(
          value =>
            String(value) !==
            String(uid())
        )
      : [
          ...previousLikedBy,
          uid()
        ];

  state.posts =
    getPosts().map(
      item =>
        postId(item.id) ===
        idString
          ? {
              ...item,
              likes:
                Math.max(
                  0,
                  previousLikes +
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

  refreshPostCard(
    idString
  );

  try {
    await updateDoc(
      doc(
        db,
        "posts",
        idString
      ),
      liked
        ? {
            likes:
              increment(-1),
            likedBy:
              arrayRemove(
                uid()
              )
          }
        : {
            likes:
              increment(1),
            likedBy:
              arrayUnion(
                uid()
              )
          }
    );

    markHomeActivity();
  } catch (error) {
    state.posts =
      getPosts().map(
        item =>
          postId(item.id) ===
          idString
            ? {
                ...item,
                likes:
                  previousLikes,
                likedBy:
                  previousLikedBy
              }
            : item
      );

    refreshPostCard(
      idString
    );

    toast(
      friendly(error)
    );
  } finally {
    pendingLikeIds.delete(
      idString
    );

    refreshPostCard(
      idString
    );
  }
}

export async function savePost(
  id
) {
  if (!uid()) {
    return toast(
      "Please sign in first."
    );
  }

  const post =
    getPost(id);

  if (!post) {
    return toast(
      "Post is no longer available."
    );
  }

  const idString =
    postId(id);

  if (
    pendingSaveIds.has(
      idString
    )
  ) {
    return;
  }

  pendingSaveIds.add(
    idString
  );

  const wasSaved =
    savedPostIds.has(
      idString
    );

  if (wasSaved) {
    savedPostIds.delete(
      idString
    );
  } else {
    savedPostIds.add(
      idString
    );
  }

  refreshPostCard(
    idString
  );

  try {
    const ref =
      doc(
        db,
        "users",
        uid(),
        "savedPosts",
        idString
      );

    if (wasSaved) {
      await deleteDoc(
        ref
      );
    } else {
      await setDoc(
        ref,
        {
          postId:
            idString,
          savedAt:
            serverTimestamp()
        }
      );
    }

    savedPostsLoadedForUid =
      uid();

    markHomeActivity();

    toast(
      wasSaved
        ? "Post removed from saved posts."
        : "Post saved."
    );
  } catch (error) {
    if (wasSaved) {
      savedPostIds.add(
        idString
      );
    } else {
      savedPostIds.delete(
        idString
      );
    }

    refreshPostCard(
      idString
    );

    toast(
      friendly(error)
    );
  } finally {
    pendingSaveIds.delete(
      idString
    );

    refreshPostCard(
      idString
    );
  }
}

export async function sharePost(
  id
) {
  const post =
    getPost(id);

  if (!post) {
    return toast(
      "Post is no longer available."
    );
  }

  const text =
    getPostText(post);

  try {
    const shareUrl = (() => {
      try {
        const url = new URL(window.location.href);
        url.hash = `post-${postId(id)}`;
        return url.href;
      } catch {
        return window.location.href;
      }
    })();

    if (navigator.share) {
      await navigator.share({
        title: "Marvel Chat post",
        text,
        url: shareUrl
      });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(
        `${text}\n\n${shareUrl}`
      );

      toast(
        "Post link copied."
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

function closeHomeModal() {
  if (
    homeModalEscapeHandler
  ) {
    document.removeEventListener(
      "keydown",
      homeModalEscapeHandler
    );

    homeModalEscapeHandler =
      null;
  }

  document
    .getElementById(
      "homeModalHost"
    )
    ?.remove();
}

function showHomeModal(
  rawHtml
) {
  closeHomeModal();

  const homePage =
    document.getElementById(
      "homePage"
    );

  if (!homePage) {
    return;
  }

  const host =
    document.createElement(
      "div"
    );

  host.id =
    "homeModalHost";

  host.innerHTML = `
    <style>
      #homeModalHost{
        position:fixed;
        inset:0;
        z-index:99999;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:14px;
        box-sizing:border-box;
        background:
          rgba(20,12,45,.50);
        backdrop-filter:blur(7px);
        -webkit-backdrop-filter:blur(7px);
      }

      #homeModalHost
      .home-modal-shell{
        width:min(640px,100%);
        max-height:90vh;
        overflow:auto;
        border:
          1px solid
          var(--border);
        border-radius:22px;
        background:
          var(--card,var(--surface));
        color:var(--text);
        box-shadow:
          0 24px 70px
          rgba(0,0,0,.30);
      }

      #homeModalHost
      .modal-content{
        width:100%;
        max-width:none!important;
        box-sizing:border-box;
      }

      #homeModalHost
      .modal-header{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-bottom:12px;
      }

      #homeModalHost
      .modal-header h3{
        margin:0;
      }

      #homeModalHost
      .modal-body{
        padding:0;
      }

      #homeModalHost
      .modal-footer{
        display:flex;
        justify-content:flex-end;
        align-items:center;
        gap:9px;
        flex-wrap:wrap;
        margin-top:16px;
      }

      #homeModalHost
      textarea,
      #homeModalHost
      input,
      #homeModalHost
      select{
        box-sizing:border-box;
        max-width:100%;
      }

      @media(max-width:520px){
        #homeModalHost{
          align-items:flex-end;
          padding:8px;
        }

        #homeModalHost
        .home-modal-shell{
          max-height:93vh;
          border-radius:
            20px 20px 12px 12px;
        }
      }
    </style>

    <div
      class="home-modal-shell"
      role="dialog"
      aria-modal="true"
    >
      ${rawHtml}
    </div>
  `;

  homePage.appendChild(
    host
  );

  host
    .querySelectorAll(
      "[data-modal-close]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          closeHomeModal
        )
    );

  host.addEventListener(
    "click",
    event => {
      if (
        event.target ===
        host
      ) {
        closeHomeModal();
      }
    }
  );

  homeModalEscapeHandler =
    event => {
      if (
        event.key ===
        "Escape"
      ) {
        closeHomeModal();
      }
    };

  document.addEventListener(
    "keydown",
    homeModalEscapeHandler
  );
}

function showCreatePost() {
  showHomeModal(`
    <div
      class="modal-content"
      style="
        padding:18px;
      "
    >
      <div
        class="modal-header"
      >
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

      <div
        class="modal-body"
      >
        <div
          class="small"
          style="
            margin-bottom:9px;
          "
        >
          Posting as
          ${escapeHtml(
            currentUserName()
          )}
        </div>

        <textarea
          id="createPostText"
          class="input"
          rows="6"
          maxlength="1000"
          placeholder="What's happening in your Marvel universe?"
        ></textarea>

        <div
          data-media-slot="future"
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
            flex-wrap:wrap;
            margin-top:10px;
            padding:10px 12px;
            border:1px dashed var(--border);
            border-radius:14px;
          "
        >
          <span class="small">
            📷 Add photo or media
          </span>

          <span class="small">
            Coming with Cloudinary media upload
          </span>
        </div>

        <div
          style="
            display:flex;
            align-items:flex-end;
            justify-content:space-between;
            gap:10px;
            flex-wrap:wrap;
            margin-top:10px;
          "
        >
          <label
            class="small"
          >
            Post expiry

            <select
              id="createPostExpiry"
              class="input"
              style="
                margin-top:5px;
              "
            >
              <option
                value=""
              >
                No expiry
              </option>

              ${
                POST_EXPIRY_OPTIONS
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
                  .join("")
              }
            </select>
          </label>

          <span
            class="small"
          >
            Maximum 1000 characters
          </span>
        </div>
      </div>

      <div
        class="modal-footer"
      >
        <button
          type="button"
          class="btn secondary"
          data-modal-close
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

  const input =
    document.getElementById(
      "createPostText"
    );

  const expiryInput =
    document.getElementById(
      "createPostExpiry"
    );

  const button =
    document.getElementById(
      "submitCreatePost"
    );

  input?.focus();

  button?.addEventListener(
    "click",
    async () => {
      if (!uid()) {
        return toast(
          "Please sign in first."
        );
      }

      const text =
        String(
          input?.value ||
          ""
        ).trim();

      if (!text) {
        return toast(
          "Write something before publishing."
        );
      }

      if (
        text.length >
        1000
      ) {
        return toast(
          "Posts must be 1000 characters or less."
        );
      }

      button.disabled =
        true;

      button.textContent =
        "Publishing...";

      try {
        const username =
          currentUserName();

        const payload = {
          uid:
            uid(),
          username:
            username,
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

        const expiryDate =
          getExpiryDate(
            expiryInput?.value ||
            ""
          );

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

        const ref =
          await addDoc(
            collection(
              db,
              "posts"
            ),
            payload
          );

        state.posts = [
          {
            id:
              ref.id,
            uid:
              uid(),
            username:
              username,
            text:
              text,
            createdAt:
              new Date(),
            likes:
              0,
            likedBy:
              [],
            comments:
              0,

            ...(expiryDate
              ? {
                  expiresAt:
                    expiryDate,

                  expiryDurationHours:
                    Math.round(
                      (
                        expiryDate.getTime() -
                        Date.now()
                      ) /
                      3600000
                    )
                }
              : {})
          },

          ...getPosts()
        ];

        closeHomeModal();
        markHomeActivity();

        toast(
          "Post published ✨"
        );
      } catch (error) {
        button.disabled =
          false;

        button.textContent =
          "Publish";

        toast(
          friendly(error)
        );
      }
    }
  );
}

export function showEditPost(
  id
) {
  const post =
    getPost(id);

  if (!post) {
    return toast(
      "Post is no longer available."
    );
  }

  if (
    String(post.uid) !==
    String(uid())
  ) {
    return toast(
      "You can only edit your own posts."
    );
  }

  showHomeModal(`
    <div
      class="modal-content"
      style="
        padding:18px;
      "
    >
      <div
        class="modal-header"
      >
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

      <div
        class="modal-body"
      >
        <textarea
          id="editPostText"
          class="input"
          rows="6"
          maxlength="1000"
        >${escapeHtml(
          getPostText(post)
        )}</textarea>
      </div>

      <div
        class="modal-footer"
      >
        <button
          type="button"
          class="btn secondary"
          data-modal-close
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary"
          id="submitEditPost"
        >
          Save changes
        </button>
      </div>
    </div>
  `);

  const input =
    document.getElementById(
      "editPostText"
    );

  const button =
    document.getElementById(
      "submitEditPost"
    );

  input?.focus();

  button?.addEventListener(
    "click",
    async () => {
      const text =
        String(
          input?.value ||
          ""
        ).trim();

      if (!text) {
        return toast(
          "Post text cannot be empty."
        );
      }

      if (
        text.length >
        1000
      ) {
        return toast(
          "Posts must be 1000 characters or less."
        );
      }

      button.disabled =
        true;

      button.textContent =
        "Saving...";

      try {
        await updateDoc(
          doc(
            db,
            "posts",
            postId(id)
          ),
          {
            text:
              text,
            editedAt:
              serverTimestamp()
          }
        );

        state.posts =
          getPosts().map(
            item =>
              postId(item.id) ===
              postId(id)
                ? {
                    ...item,
                    text:
                      text,
                    editedAt:
                      new Date()
                  }
                : item
          );

        closeHomeModal();
        markHomeActivity();

        refreshPostCard(
          id
        );

        toast(
          "Post updated."
        );
      } catch (error) {
        button.disabled =
          false;

        button.textContent =
          "Save changes";

        toast(
          friendly(error)
        );
      }
    }
  );
}

export function showDeletePostConfirmation(
  id
) {
  const post =
    getPost(id);

  if (!post) {
    return toast(
      "Post is no longer available."
    );
  }

  if (
    String(post.uid) !==
    String(uid())
  ) {
    return toast(
      "You can only delete your own posts."
    );
  }

  showHomeModal(`
    <div
      class="modal-content"
      style="
        padding:18px;
      "
    >
      <div
        class="modal-header"
      >
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

      <div
        class="modal-body"
      >
        <p
          style="
            line-height:1.6;
            margin:0;
          "
        >
          This will permanently remove
          your post from the community feed.
        </p>
      </div>

      <div
        class="modal-footer"
      >
        <button
          type="button"
          class="btn secondary"
          data-modal-close
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
              postId(id)
            )
          );

          state.posts =
            getPosts().filter(
              item =>
                postId(item.id) !==
                postId(id)
            );

          closeHomeModal();
          markHomeActivity();

          document
            .querySelector(
              `#homePage [data-post-card="${cssEscape(
                postId(id)
              )}"]`
            )
            ?.remove();

          toast(
            "Post deleted."
          );
        } catch (error) {
          button.disabled =
            false;

          button.textContent =
            "Delete";

          toast(
            friendly(error)
          );
        }
      }
    );
}

export async function showComments(
  id
) {
  const post =
    getPost(id);

  if (!post) {
    return toast(
      "Post is no longer available."
    );
  }

  let comments = [];

  try {
    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "posts",
            postId(id),
            "comments"
          ),
          orderBy(
            "createdAt",
            "asc"
          ),
          limit(50)
        )
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
    return toast(
      friendly(error)
    );
  }

  const commentsHtml =
    comments.length
      ? comments
          .map(
            comment => {
              const own =
                String(
                  comment.uid
                ) ===
                String(
                  uid()
                );

              return `
                <div
                  class="list-item"
                >
                  <div
                    style="
                      display:flex;
                      justify-content:space-between;
                      gap:8px;
                    "
                  >
                    <strong>
                      ${escapeHtml(
                        comment.displayName ||
                        comment.authorName ||
                        comment.username ||
                        "Marvel User"
                      )}
                    </strong>

                    ${
                      own
                        ? `
                          <button
                            type="button"
                            class="icon-btn"
                            data-delete-comment="${escapeHtml(
                              comment.id
                            )}"
                            aria-label="Delete comment"
                          >
                            🗑️
                          </button>
                        `
                        : ""
                    }
                  </div>

                  <div
                    style="
                      margin-top:4px;
                      overflow-wrap:anywhere;
                    "
                  >
                    ${escapeHtml(
                      comment.text ||
                      ""
                    )}
                  </div>

                  <div class="small">
                    ${escapeHtml(
                      comment.createdAt
                        ? formatDate(
                            comment.createdAt
                          )
                        : ""
                    )}
                  </div>
                </div>
              `;
            }
          )
          .join("")
      : `
        <div
          class="small"
          style="
            padding:10px 0;
          "
        >
          No comments yet.
          Start the conversation.
        </div>
      `;

  showHomeModal(`
    <div
      class="modal-content"
      style="
        padding:18px;
      "
    >
      <div
        class="modal-header"
      >
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

      <div
        class="modal-body"
      >
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
            margin-top:15px;
          "
        >
          <textarea
            id="commentText"
            class="input"
            rows="3"
            maxlength="500"
            placeholder="Write a comment..."
          ></textarea>

          <div
            style="
              display:flex;
              justify-content:flex-end;
              margin-top:9px;
            "
          >
            <button
              type="button"
              class="btn btn-primary"
              id="submitComment"
            >
              Add comment
            </button>
          </div>
        </div>
      </div>
    </div>
  `);

  const input =
    document.getElementById(
      "commentText"
    );

  const button =
    document.getElementById(
      "submitComment"
    );

  input?.focus();

  document
    .querySelectorAll(
      "[data-delete-comment]"
    )
    .forEach(
      commentButton =>
        commentButton.addEventListener(
          "click",
          () =>
            deleteComment(
              id,
              commentButton.dataset
                .deleteComment
            )
        )
    );

  button?.addEventListener(
    "click",
    async () => {
      if (!uid()) {
        return toast(
          "Please sign in first."
        );
      }

      const text =
        String(
          input?.value ||
          ""
        ).trim();

      if (!text) {
        return toast(
          "Write a comment first."
        );
      }

      if (
        text.length >
        500
      ) {
        return toast(
          "Comments must be 500 characters or less."
        );
      }

      button.disabled =
        true;

      button.textContent =
        "Adding...";

      try {
        const actorName =
          currentUserName();

        await addDoc(
          collection(
            db,
            "posts",
            postId(id),
            "comments"
          ),
          {
            uid:
              uid(),
            displayName:
              actorName,
            text:
              text,
            createdAt:
              serverTimestamp()
          }
        );

        if (
          String(post.uid) !==
          String(uid())
        ) {
          await updateDoc(
            doc(
              db,
              "posts",
              postId(id)
            ),
            {
              comments:
                increment(1)
            }
          );
        }

        state.posts =
          getPosts().map(
            item =>
              postId(item.id) ===
              postId(id)
                ? {
                    ...item,
                    comments:
                      postComments(
                        item
                      ) + 1
                  }
                : item
          );

        input.value =
          "";

        markHomeActivity();

        refreshPostCard(
          id
        );

        const list =
          document.getElementById(
            "commentsList"
          );

        if (list) {
          list.insertAdjacentHTML(
            "beforeend",
            `
              <div
                class="list-item"
              >
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
            `
          );
        }

        button.disabled =
          false;

        button.textContent =
          "Add comment";

        toast(
          "Comment added 💬"
        );
      } catch (error) {
        button.disabled =
          false;

        button.textContent =
          "Add comment";

        toast(
          friendly(error)
        );
      }
    }
  );
}

async function deleteComment(
  postIdValue,
  commentId
) {
  if (!uid()) {
    return;
  }

  try {
    await deleteDoc(
      doc(
        db,
        "posts",
        postId(postIdValue),
        "comments",
        String(commentId)
      )
    );

    const post =
      getPost(postIdValue);

    if (
      post &&
      String(post.uid) !==
      String(uid())
    ) {
      await updateDoc(
        doc(
          db,
          "posts",
          postId(postIdValue)
        ),
        {
          comments:
            increment(-1)
        }
      );
    }

    state.posts =
      getPosts().map(
        item =>
          postId(item.id) ===
          postId(postIdValue)
            ? {
                ...item,
                comments:
                  Math.max(
                    0,
                    postComments(
                      item
                    ) - 1
                  )
              }
            : item
      );

    markHomeActivity();

    refreshPostCard(
      postIdValue
    );

    toast(
      "Comment deleted."
    );

    await showComments(
      postIdValue
    );
  } catch (error) {
    toast(
      friendly(error)
    );
  }
}

function postMatchesFilter(post) {
  if (homeFeedFilter === "mine") {
    return String(post?.uid || "") === String(uid() || "");
  }

  if (homeFeedFilter === "saved") {
    return isSaved(post);
  }

  return true;
}

function filterRenderedPosts(
  value
) {
  homeSearchTerm =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  const cards =
    Array.from(
      document.querySelectorAll(
        "#homePage [data-post-card]"
      )
    );

  let visible =
    0;

  cards.forEach(card => {
    const post = getPost(
      card.dataset.postCard
    );

    const textMatches =
      !homeSearchTerm ||
      card.textContent
        .toLowerCase()
        .includes(homeSearchTerm);

    const filterMatches =
      !!post &&
      postMatchesFilter(post);

    const matches =
      textMatches &&
      filterMatches;

    card.style.display =
      matches
        ? ""
        : "none";

    if (matches) {
      visible++;
    }
  });

  const status =
    document.getElementById(
      "communitySearchStatus"
    );

  if (
    status &&
    !Array.isArray(state.posts)
  ) {
    status.textContent =
      "Loading the latest posts…";
  }

  if (status && Array.isArray(state.posts)) {
    const filterLabel =
      homeFeedFilter === "mine"
        ? "my posts"
        : homeFeedFilter === "saved"
          ? "saved posts"
          : "recent posts";

    if (visible === 0) {
      status.textContent =
        homeSearchTerm
          ? "No matching posts in the loaded feed."
          : homeFeedFilter === "saved"
            ? "You have no saved posts in this feed yet."
            : homeFeedFilter === "mine"
              ? "You have no posts in the loaded feed yet."
              : "No posts are available right now.";
    } else {
      status.textContent =
        homeSearchTerm
          ? `${visible} matching ${filterLabel}.`
          : `Showing ${visible} ${filterLabel}.`;
    }
  }

  const clear =
    document.getElementById(
      "clearCommunitySearch"
    );

  if (clear) {
    clear.style.display =
      homeSearchTerm
        ? "inline-flex"
        : "none";
  }
}

export function attachHomeEvents(
  renderApp
) {
  if (
    homeNavigationHandler
  ) {
    document.removeEventListener(
      "click",
      homeNavigationHandler,
      true
    );
  }

  homeNavigationHandler =
    event => {
      if (
        event.target
          ?.closest?.(
            "[data-nav]"
          )
      ) {
        closeHomeModal();
        stopDiscoveryCountdown();
      }
    };

  document.addEventListener(
    "click",
    homeNavigationHandler,
    true
  );

  if (
    homeClickHandler
  ) {
    document
      .getElementById(
        "homePage"
      )
      ?.removeEventListener(
        "click",
        homeClickHandler
      );
  }

  const homePage =
    document.getElementById(
      "homePage"
    );

  if (!homePage) {
    return;
  }

  homeClickHandler =
    event => {
      const quick =
        event.target.closest(
          "[data-quick]"
        );

      if (quick) {
        const action =
          quick.dataset.quick;

        markHomeActivity();

        if (
          action ===
          "post"
        ) {
          showCreatePost();
        } else if (
          action ===
          "chat"
        ) {
          closeHomeModal();

          state.page =
            "chat";

          renderApp?.();
        } else if (
          action ===
          "skill"
        ) {
          closeHomeModal();

          state.page =
            "timetrust";

          renderApp?.();
        } else if (
          action ===
          "sell"
        ) {
          closeHomeModal();

          state.marketBrowseMode =
            false;

          state.page =
            "market";

          renderApp?.();
        }

        return;
      }

      const actionButton =
        event.target.closest(
          "[data-home-action]"
        );

      if (
        actionButton &&
        homePage.contains(
          actionButton
        )
      ) {
        event.stopPropagation();

        const action =
          actionButton.dataset
            .homeAction;

        const id =
          actionButton.dataset
            .id;

        if (
          action ===
          "like"
        ) {
          toggleLike(id);
        } else if (
          action ===
          "save"
        ) {
          savePost(id);
        } else if (
          action ===
          "share"
        ) {
          sharePost(id);
        } else if (
          action ===
          "comment"
        ) {
          showComments(id);
        } else if (
          action ===
          "edit"
        ) {
          showEditPost(id);
        } else if (
          action ===
          "delete"
        ) {
          showDeletePostConfirmation(
            id
          );
        } else if (
          action ===
          "menu"
        ) {
          const menu =
            document.getElementById(
              `postMenu-${id}`
            );

          if (!menu) {
            return;
          }

          document
            .querySelectorAll(
              "#homePage .dropdown-menu"
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

        return;
      }

      const feedFilter =
        event.target.closest(
          "[data-feed-filter]"
        );

      if (feedFilter) {
        homeFeedFilter =
          feedFilter.dataset.feedFilter ||
          "all";

        document
          .querySelectorAll(
            "#homePage [data-feed-filter]"
          )
          .forEach(
            button => {
              const active =
                button.dataset.feedFilter ===
                homeFeedFilter;

              button.classList.toggle(
                "btn-primary",
                active
              );

              button.classList.toggle(
                "secondary",
                !active
              );

              button.setAttribute(
                "aria-selected",
                active
                  ? "true"
                  : "false"
              );
            }
          );

        filterRenderedPosts(
          homeSearchTerm
        );

        return;
      }

      if (
        event.target.closest(
          "#openComposerPreview,#openComposerButton,#createPostBtn,#emptyCreatePost"
        )
      ) {
        showCreatePost();
        return;
      }

      if (
        event.target.closest(
          "#clearCommunitySearch"
        )
      ) {
        homeSearchTerm =
          "";

        const input =
          document.getElementById(
            "communityFeedSearch"
          );

        if (input) {
          input.value =
            "";

          input.focus();
        }

        filterRenderedPosts(
          ""
        );

        return;
      }

      const discovery =
        event.target.closest(
          "[data-discovery-nav]"
        );

      if (discovery) {
        openDiscoveryDestination(
          discovery.dataset
            .discoveryNav,
          renderApp
        );

        return;
      }

      if (
        event.target.closest(
          "#discoveryClose"
        )
      ) {
        dismissDiscovery();
        return;
      }

      if (
        !event.target.closest(
          ".dropdown-container"
        )
      ) {
        document
          .querySelectorAll(
            "#homePage .dropdown-menu"
          )
          .forEach(
            menu =>
              menu.classList.add(
                "hidden"
              )
          );
      }
    };

  homePage.addEventListener(
    "click",
    homeClickHandler
  );

  const search =
    document.getElementById(
      "communityFeedSearch"
    );

  search?.addEventListener(
    "input",
    event => {
      markHomeActivity();

      filterRenderedPosts(
        event.target.value
      );
    }
  );

  search?.addEventListener(
    "keydown",
    event => {
      if (
        event.key ===
        "Escape"
      ) {
        homeSearchTerm =
          "";

        search.value =
          "";

        filterRenderedPosts(
          ""
        );
      }
    }
  );

  loadSavedPostIds()
    .then(
      () => {
        if (
          state.page ===
            "home" &&
          document.getElementById(
            "homePage"
          )
        ) {
          document
            .querySelectorAll(
              "#homePage [data-post-card]"
            )
            .forEach(
              card => {
                const id =
                  card.dataset
                    .postCard;

                const post =
                  getPost(id);

                if (!post) {
                  return;
                }

                const holder =
                  document.createElement(
                    "div"
                  );

                holder.innerHTML =
                  renderPostCard(
                    post
                  );

                card.replaceWith(
                  holder.firstElementChild
                );
              }
            );

          filterRenderedPosts(
            homeSearchTerm
          );
        }
      }
    )
    .catch(
      error =>
        console.warn(
          "Saved posts load failed:",
          error
        )
    );

  if (
    document.getElementById(
      "discoveryBanner"
    )
  ) {
    recordDiscoveryImpression();
    startDiscoveryCountdown();
  }

  filterRenderedPosts(
    homeSearchTerm
  );

  markHomeActivity();
}
