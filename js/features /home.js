import { state, escapeHtml, initials, formatDate, friendly } from "../state.js";
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
  limit,
  Timestamp
} from "../firebase/firestore.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";

const DISCOVERY_STORAGE_KEY = "marvel_discovery_seen_v1";
const DISCOVERY_LAST_ACTIVE_KEY = "marvel_home_last_active_v1";
const DISCOVERY_INACTIVE_DAYS = 2;
const DISCOVERY_DURATION_SECONDS = 40;

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

function shouldShowDiscovery() {
  try {
    const lastActiveRaw = localStorage.getItem(
      DISCOVERY_LAST_ACTIVE_KEY
    );

    if (!lastActiveRaw) {
      return true;
    }

    const lastActive = Number(lastActiveRaw);

    if (!Number.isFinite(lastActive)) {
      return true;
    }

    const inactiveMilliseconds = Date.now() - lastActive;
    const inactiveThreshold =
      DISCOVERY_INACTIVE_DAYS * 24 * 60 * 60 * 1000;

    return inactiveMilliseconds >= inactiveThreshold;
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

  if (window.__marvelDiscoveryTimer) {
    clearInterval(window.__marvelDiscoveryTimer);
    window.__marvelDiscoveryTimer = null;
  }

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

function startDiscoveryCountdown(renderApp) {
  const banner = document.getElementById("discoveryBanner");
  const ring = document.getElementById("discoveryRing");
  const counter = document.getElementById("discoveryCountdown");

  if (!banner || !ring || !counter) {
    return;
  }

  if (window.__marvelDiscoveryTimer) {
    clearInterval(window.__marvelDiscoveryTimer);
  }

  const startedAt = Date.now();
  const duration = DISCOVERY_DURATION_SECONDS * 1000;

  const update = () => {
    const elapsed = Date.now() - startedAt;
    const remainingMilliseconds = Math.max(
      0,
      duration - elapsed
    );

    const remainingSeconds = Math.ceil(
      remainingMilliseconds / 1000
    );

    const progress =
      remainingMilliseconds / duration;

    const percentage =
      Math.max(0, Math.min(100, progress * 100));

    ring.style.background =
      `conic-gradient(currentColor ${percentage}%, rgba(255,255,255,.10) ${percentage}% 100%)`;

    counter.textContent = String(remainingSeconds);

    if (remainingMilliseconds <= 0) {
      clearInterval(window.__marvelDiscoveryTimer);
      window.__marvelDiscoveryTimer = null;

      dismissDiscovery();

      if (state.page === "home") {
        markHomeActivity();
      }

      return;
    }
  };

  update();

  window.__marvelDiscoveryTimer = setInterval(
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
                  font-size:11px;
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

function renderFeedSearch() {
  return `
    <div
      class="card"
      style="
        margin-bottom:16px;
        padding:14px;
      "
    >
      <div
        style="
          display:flex;
          gap:10px;
          align-items:center;
          flex-wrap:wrap;
        "
      >
        <div
          style="
            flex:1 1 240px;
            position:relative;
          "
        >
          <input
            id="communityFeedSearch"
            class="input"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Search posts..."
            aria-label="Search community posts"
            style="
              width:100%;
              padding-right:42px;
            "
          />

          <span
            aria-hidden="true"
            style="
              position:absolute;
              right:13px;
              top:50%;
              transform:translateY(-50%);
              opacity:.6;
              pointer-events:none;
            "
          >
            🔎
          </span>
        </div>

        <button
          type="button"
          class="btn btn-ghost"
          id="youtubeLiveSearchBtn"
          title="Search YouTube Live"
        >
          ▶️ YouTube Live
        </button>
      </div>

      <div
        id="communitySearchStatus"
        class="small"
        aria-live="polite"
        style="
          margin-top:8px;
          min-height:18px;
          opacity:.7;
        "
      ></div>
    </div>
  `;
}

function filterRenderedPosts(searchTerm) {
  const term = String(searchTerm || "")
    .trim()
    .toLowerCase();

  const articles = Array.from(
    document.querySelectorAll("[data-post-id]")
  );

  let visible = 0;

  for (const article of articles) {
    const username =
      article.querySelector(".profile-meta strong")?.textContent || "";

    const body =
      article.querySelector(".post-body")?.textContent || "";

    const searchable =
      `${username} ${body}`.toLowerCase();

    const matches =
      !term || searchable.includes(term);

    article.style.display = matches ? "" : "none";

    if (matches) {
      visible += 1;
    }
  }

  const status =
    document.getElementById("communitySearchStatus");

  if (status) {
    if (!term) {
      status.textContent = "";
    } else if (visible === 0) {
      status.textContent =
        "No matching posts found.";
    } else {
      status.textContent =
        `${visible} matching post${visible === 1 ? "" : "s"}.`;
    }
  }
}

function openYouTubeLiveSearch() {
  const input =
    document.getElementById("communityFeedSearch");

  const queryText =
    input?.value.trim() || "";

  if (!queryText) {
    toast("Enter something to search for YouTube Live.");
    input?.focus();
    return;
  }

  const youtubeUrl =
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(queryText) +
    "&sp=EgJAAQ%253D%253D";

  window.open(
    youtubeUrl,
    "_blank",
    "noopener,noreferrer"
  );
}

async function cleanupExpiredPosts() {
  if (!Array.isArray(state.posts) || !state.posts.length) {
    return;
  }

  const expiredPosts =
    state.posts.filter(isPostExpired);

  if (!expiredPosts.length) {
    return;
  }

  state.posts =
    state.posts.filter(post => !isPostExpired(post));

  for (const post of expiredPosts) {
    if (post.uid !== state.user.uid) {
      continue;
    }

    try {
      await deleteDoc(
        doc(db, "posts", post.id)
      );
    } catch (error) {
      console.warn(
        "Could not remove expired post:",
        error
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

  return `
    <div class="page">

      <section class="hero">
        <h1>Hey ${escapeHtml(me)} 👋</h1>
        <p>
          Welcome to your futuristic community.
          Connect, chat, trade skills and discover
          what people around you are building.
        </p>
      </section>

      ${
        showDiscovery
          ? renderDiscoveryBanner()
          : ""
      }

      <div class="quick-grid">

        <button
          class="quick"
          data-quick="post"
          type="button"
        >
          <div class="quick-icon">✍️</div>
          <strong>Create post</strong>
          <span>Share something</span>
        </button>

        <button
          class="quick"
          data-quick="chat"
          type="button"
        >
          <div class="quick-icon">💬</div>
          <strong>Start chat</strong>
          <span>Talk to someone</span>
        </button>

        <button
          class="quick"
          data-quick="timetrust"
          type="button"
        >
          <div class="quick-icon">⏱️</div>
          <strong>Explore TimeTrust</strong>
          <span>Trade your time</span>
        </button>

        <button
          class="quick"
          data-quick="market"
          type="button"
        >
          <div class="quick-icon">🛍️</div>
          <strong>Explore Market</strong>
          <span>Browse the market</span>
        </button>

      </div>

      <div class="section-title">
        <div>
          <h2>Community feed</h2>
          <div class="small">
            Discover conversations, ideas and opportunities.
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

      ${renderFeedSearch()}

      <div id="communityFeed">

        ${
          posts.length
            ? posts.map(renderPost).join("")
            : `
              <div
                class="card empty"
                id="emptyCommunityFeed"
              >
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
    </div>
  `;
}

export function renderPost(p) {
  const liked =
    Array.isArray(p.likedBy) &&
    p.likedBy.includes(state.user.uid);

  const saved =
    Array.isArray(p.savedBy) &&
    p.savedBy.includes(state.user.uid);

  const isOwner =
    p.uid === state.user.uid;

  const expiryLabel =
    formatExpiryLabel(p);

  return `
    <article
      class="card post"
      data-post-id="${escapeHtml(p.id)}"
    >

      <div class="post-head">

        <div class="avatar">
          ${escapeHtml(initials(p.username))}
        </div>

        <div class="profile-meta">
          <strong>
            ${escapeHtml(p.username || "User")}
          </strong>

          <span class="small">
            ${escapeHtml(formatDate(p.createdAt))}

            ${
              p.editedAt
                ? `<span class="edited-indicator">(Edited)</span>`
                : ""
            }

            ${
              expiryLabel
                ? `
                  <span
                    style="
                      margin-left:6px;
                      opacity:.7;
                    "
                  >
                    · ${escapeHtml(expiryLabel)}
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
        ${escapeHtml(p.text || "")}
      </div>

      <div class="post-actions">

        <button
          class="action ${liked ? "active" : ""}"
          data-like="${escapeHtml(p.id)}"
          type="button"
        >
          ${liked ? "❤️" : "♡"}
          ${Number(p.likes || 0)}
        </button>

        <button
          class="action"
          data-comment="${escapeHtml(p.id)}"
          type="button"
        >
          💬 ${Number(p.comments || 0)}
        </button>

        <button
          class="action"
          data-share="${escapeHtml(p.id)}"
          type="button"
        >
          ↗ Share
        </button>

        <button
          class="action ${saved ? "active" : ""}"
          data-save="${escapeHtml(p.id)}"
          type="button"
        >
          ${saved ? "🔖 Saved" : "🔖 Save"}
        </button>

      </div>

    </article>
  `;
}

function renderExpiryOptions(selected = "30d") {
  return POST_EXPIRY_OPTIONS.map(option => `
    <option
      value="${option.value}"
      ${option.value === selected ? "selected" : ""}
    >
      ${option.label}
    </option>
  `).join("");
}

export function showCreatePost() {
  showModal(
    "Create a community post",
    `
      <div class="field">
        <label for="postText">
          What's happening?
        </label>

        <textarea
          class="textarea"
          id="postText"
          maxlength="1000"
          placeholder="Share an idea, question, achievement or opportunity…"
        ></textarea>
      </div>

      <div class="field">
        <label for="postExpiry">
          Keep this post for
        </label>

        <select
          class="input"
          id="postExpiry"
        >
          ${renderExpiryOptions("30d")}
        </select>

        <div
          class="small"
          style="margin-top:6px"
        >
          Maximum lifetime is 30 days.
          Your post will store an expiration time.
        </div>
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
    .getElementById("publishPost")
    ?.addEventListener("click", async () => {
      const text =
        document
          .getElementById("postText")
          ?.value
          .trim();

      if (!text) {
        toast("Write something first.");
        return;
      }

      const expiryValue =
        document
          .getElementById("postExpiry")
          ?.value || "30d";

      const expiresAt =
        getPostExpiryDate(expiryValue);

      const btn =
        document.getElementById("publishPost");

      if (!btn) return;

      btn.disabled = true;
      btn.textContent = "Publishing…";

      try {
        const postData = {
          uid: state.user.uid,
          username: getCurrentUserName(),
          text,
          likes: 0,
          comments: 0,
          likedBy: [],
          savedBy: [],
          createdAt: serverTimestamp(),
          expiresAt: expiresAt
            ? Timestamp.fromDate(expiresAt)
            : null
        };

        const docRef = await addDoc(
          collection(db, "posts"),
          postData
        );

        const newPost = {
          id: docRef.id,
          uid: state.user.uid,
          username: getCurrentUserName(),
          text,
          likes: 0,
          comments: 0,
          likedBy: [],
          savedBy: [],
          createdAt: new Date(),
          expiresAt
        };

        state.posts = [
          newPost,
          ...(Array.isArray(state.posts)
            ? state.posts
            : [])
        ];

        closeModal();

        toast(
          `Posted successfully 🚀 Expires in ${
            POST_EXPIRY_OPTIONS.find(
              option => option.value === expiryValue
            )?.label || "30 days"
          }.`
        );
      } catch (e) {
        toast(friendly(e));
        btn.disabled = false;
        btn.textContent = "Publish 🚀";
      }
    });
}

export function showEditPost(postId) {
  const post =
    state.posts.find(
      p => p.id === postId
    );

  if (
    !post ||
    post.uid !== state.user.uid
  ) {
    return;
  }

  const existingExpiry =
    timestampToDate(post.expiresAt);

  let selectedExpiry = "30d";

  if (existingExpiry) {
    const remaining =
      existingExpiry.getTime() - Date.now();

    if (remaining <= 12 * 60 * 60 * 1000) {
      selectedExpiry = "12h";
    } else if (remaining <= 24 * 60 * 60 * 1000) {
      selectedExpiry = "1d";
    } else if (remaining <= 7 * 24 * 60 * 60 * 1000) {
      selectedExpiry = "7d";
    } else {
      selectedExpiry = "30d";
    }
  }

  showModal(
    "Edit post",
    `
      <div class="field">
        <label for="editPostText">
          Edit your post
        </label>

        <textarea
          class="textarea"
          id="editPostText"
          maxlength="1000"
        >${escapeHtml(post.text || "")}</textarea>
      </div>

      <div class="field">
        <label for="editPostExpiry">
          Expiration
        </label>

        <select
          class="input"
          id="editPostExpiry"
        >
          ${renderExpiryOptions(selectedExpiry)}
        </select>

        <div
          class="small"
          style="margin-top:6px"
        >
          Maximum lifetime is 30 days.
        </div>
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
    .getElementById("saveEditPost")
    ?.addEventListener("click", async () => {
      const text =
        document
          .getElementById("editPostText")
          ?.value
          .trim();

      if (!text) {
        toast("Post cannot be empty.");
        return;
      }

      const expiryValue =
        document
          .getElementById("editPostExpiry")
          ?.value || "30d";

      const expiresAt =
        getPostExpiryDate(expiryValue);

      const btn =
        document.getElementById("saveEditPost");

      if (!btn) return;

      btn.disabled = true;
      btn.textContent = "Saving…";

      try {
        await updateDoc(
          doc(db, "posts", postId),
          {
            text,
            editedAt: serverTimestamp(),
            expiresAt: expiresAt
              ? Timestamp.fromDate(expiresAt)
              : null
          }
        );

        state.posts =
          state.posts.map(p =>
            p.id === postId
              ? {
                  ...p,
                  text,
                  editedAt: new Date(),
                  expiresAt
                }
              : p
          );

        closeModal();
        toast("Post updated ✓");
      } catch (e) {
        toast(friendly(e));
        btn.disabled = false;
        btn.textContent = "Save Changes";
      }
    });
}

export function showDeletePostConfirmation(postId) {
  const post =
    state.posts.find(
      p => p.id === postId
    );

  if (
    !post ||
    post.uid !== state.user.uid
  ) {
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
          style="flex:1;"
          type="button"
        >
          Cancel
        </button>

        <button
          class="btn btn-danger"
          id="confirmDeletePost"
          style="flex:1;"
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
        const btn =
          document.getElementById(
            "confirmDeletePost"
          );

        if (!btn) return;

        btn.disabled = true;
        btn.textContent = "Deleting…";

        try {
          await deleteDoc(
            doc(db, "posts", postId)
          );

          state.posts =
            state.posts.filter(
              p => p.id !== postId
            );

          closeModal();
          toast("Post deleted.");
        } catch (e) {
          toast(friendly(e));
          btn.disabled = false;
          btn.textContent = "Delete";
        }
      }
    );
}

export async function toggleLike(id) {
  const post =
    state.posts.find(
      x => x.id === id
    );

  if (!post) return;

  const liked =
    Array.isArray(post.likedBy) &&
    post.likedBy.includes(
      state.user.uid
    );

  try {
    await updateDoc(
      doc(db, "posts", id),
      {
        likes: increment(
          liked ? -1 : 1
        ),
        likedBy: liked
          ? arrayRemove(
              state.user.uid
            )
          : arrayUnion(
              state.user.uid
            )
      }
    );

    state.posts =
      state.posts.map(p => {
        if (p.id === id) {
          const newLikedBy =
            liked
              ? (p.likedBy || []).filter(
                  uid =>
                    uid !== state.user.uid
                )
              : [
                  ...(p.likedBy || []),
                  state.user.uid
                ];

          return {
            ...p,
            likes:
              Number(p.likes || 0) +
              (liked ? -1 : 1),
            likedBy: newLikedBy
          };
        }

        return p;
      });

    if (
      !liked &&
      post.uid &&
      post.uid !== state.user.uid
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
            actorUid: state.user.uid,
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
      } catch (notifErr) {
        console.warn(
          "Could not create like notification:",
          notifErr
        );
      }
    }
  } catch (e) {
    toast(friendly(e));
  }
}

export async function savePost(id) {
  const post =
    state.posts.find(
      x => x.id === id
    );

  if (!post) return;

  const saved =
    Array.isArray(post.savedBy) &&
    post.savedBy.includes(
      state.user.uid
    );

  try {
    await updateDoc(
      doc(db, "posts", id),
      {
        savedBy: saved
          ? arrayRemove(
              state.user.uid
            )
          : arrayUnion(
              state.user.uid
            )
      }
    );

    state.posts =
      state.posts.map(p => {
        if (p.id === id) {
          const newSavedBy =
            saved
              ? (p.savedBy || []).filter(
                  uid =>
                    uid !== state.user.uid
                )
              : [
                  ...(p.savedBy || []),
                  state.user.uid
                ];

          return {
            ...p,
            savedBy: newSavedBy
          };
        }

        return p;
      });

    toast(
      saved
        ? "Removed from saved posts."
        : "Saved to your vault 🔖"
    );
  } catch (e) {
    toast(friendly(e));
  }
}

export async function sharePost(id) {
  const post =
    state.posts.find(
      x => x.id === id
    );

  if (!post) return;

  const text =
    `${post.username || "Someone"} on Marvel Chat:\n\n${post.text}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: "Marvel Chat",
        text
      });
    } else if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      toast(
        "Post copied to clipboard 📋"
      );
    } else {
      toast(
        "Sharing is not available on this device."
      );
    }
  } catch (e) {
    if (e?.name !== "AbortError") {
      toast(
        "Could not share this post."
      );
    }
  }
}

export async function showComments(id) {
  const post =
    state.posts.find(
      x => x.id === id
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
      snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

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
                        c.username || "User"
                      )}
                    </strong>

                    <div>
                      ${escapeHtml(
                        c.text || ""
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

        if (!input) return;

        const text =
          input.value.trim();

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
              id,
              "comments"
            ),
            {
              uid: state.user.uid,
              username: actorName,
              text,
              createdAt:
                serverTimestamp()
            }
          );

          await updateDoc(
            doc(db, "posts", id),
            {
              comments:
                increment(1)
            }
          );

          if (
            post &&
            post.uid &&
            post.uid !== state.user.uid
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
                  type: "comment",
                  actorUid:
                    state.user.uid,
                  actorName,
                  targetId: id,
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

          toast(
            "Comment added 💬"
          );

          await showComments(id);
        } catch (e) {
          toast(friendly(e));

          if (btn) {
            btn.disabled = false;
            btn.textContent =
              "Add comment";
          }
        }
      }
    );
}

export function attachHomeEvents(renderApp) {
  markHomeActivity();

  const discoveryBanner =
    document.getElementById(
      "discoveryBanner"
    );

  if (discoveryBanner) {
    startDiscoveryCountdown(
      renderApp
    );
  }

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
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          openDiscoveryDestination(
            button.dataset.discoveryNav,
            renderApp
          );
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
      "youtubeLiveSearchBtn"
    )
    ?.addEventListener(
      "click",
      openYouTubeLiveSearch
    );

  document
    .getElementById("createPostBtn")
    ?.addEventListener(
      "click",
      showCreatePost
    );

  document
    .getElementById("emptyCreatePost")
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

          const postId =
            button.dataset.menuPost;

          const menu =
            document.getElementById(
              `postMenu-${postId}`
            );

          if (!menu) return;

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

          const postId =
            button.dataset.editPost;

          showEditPost(postId);
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

          const postId =
            button.dataset.deletePost;

          showDeletePostConfirmation(
            postId
          );
        }
      );
    });

  document
    .querySelectorAll("[data-like]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          toggleLike(
            button.dataset.like
          );
        }
      );
    });

  document
    .querySelectorAll("[data-save]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          savePost(
            button.dataset.save
          );
        }
      );
    });

  document
    .querySelectorAll("[data-share]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          sharePost(
            button.dataset.share
          );
        }
      );
    });

  document
    .querySelectorAll("[data-comment]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          showComments(
            button.dataset.comment
          );
        }
      );
    });

  document.addEventListener(
    "click",
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
        .forEach(menu => {
          menu.classList.add(
            "hidden"
          );
        });
    },
    {
      once: true
    }
  );

  cleanupExpiredPosts().catch(
    error => {
      console.warn(
        "Expired post cleanup failed:",
        error
      );
    }
  );
}
