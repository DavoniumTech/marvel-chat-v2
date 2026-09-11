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
      .filter(
        value =>
          Number.isFinite(value) &&
          value >= cutoff
      )
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function saveDiscoveryHistory(history) {
  try {
    localStorage.setItem(
      DISCOVERY_STORAGE_KEY,
      JSON.stringify(
        history.slice(-DISCOVERY_MAX_IMPRESSIONS)
      )
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
    now - history[history.length - 1] <
      DISCOVERY_MIN_INTERVAL_MS
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

  if (
    history.length >=
    DISCOVERY_MAX_IMPRESSIONS
  ) {
    return false;
  }

  return (
    Date.now() -
      history[history.length - 1] >=
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

function openDiscoveryDestination(
  destination,
  renderApp
) {
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

  discoveryStartedAt = Date.now();

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
    <style>
      @keyframes marvelDiscoveryPulse {
        0%, 100% {
          transform:scale(1);
          filter:drop-shadow(0 0 0 transparent);
        }
        50% {
          transform:scale(1.035);
          filter:drop-shadow(0 0 14px currentColor);
        }
      }

      @keyframes marvelDiscoveryOrbit {
        from {
          transform:rotate(0deg);
        }
        to {
          transform:rotate(360deg);
        }
      }

      #discoveryRing {
        animation:
          marvelDiscoveryPulse
          2.4s ease-in-out infinite;
      }

      #discoveryOrbit {
        animation:
          marvelDiscoveryOrbit
          7s linear infinite;
      }

      @media (prefers-reduced-motion: reduce) {
        #discoveryRing,
        #discoveryOrbit {
          animation:none !important;
        }
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
            Discover people, conversations, skills,
            TimeTrust and the Market — all from one place.
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
              class="btn"
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
              inset:-8px;
              border:1px dashed currentColor;
              border-radius:50%;
              opacity:.35;
            "
          ></div>

          <div
            style="
              position:absolute;
              inset:-2px;
              border-radius:50%;
              border:1px solid currentColor;
              opacity:.18;
            "
          ></div>

          <div
            id="discoveryRing"
            style="
              position:absolute;
              inset:8px;
              border-radius:50%;
              color:currentColor;
              display:grid;
              place-items:center;
              transition:background .2s linear;
            "
          >
            <div
              style="
                width:112px;
                height:112px;
                border-radius:50%;
                background:var(--card);
                display:flex;
                align-items:center;
                justify-content:center;
                flex-direction:column;
                box-shadow:
                  inset 0 0 0 1px
                  rgba(255,255,255,.08);
              "
            >
              <strong
                id="discoveryCountdown"
                style="
                  font-size:34px;
                  line-height:1;
                "
              >
                ${DISCOVERY_DURATION_SECONDS}
              </strong>

              <span
                class="small"
                style="
                  margin-top:7px;
                  opacity:.7;
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
  const uid = state.user?.uid;

  if (!uid) {
    savedPostIds = new Set();
    savedPostsLoadedForUid = null;
    savedPostsLoadPromise = null;
    savedPostsLoadingUid = null;
    return;
  }

  if (
    savedPostsLoadedForUid === uid
  ) {
    return;
  }

  if (
    savedPostsLoadPromise &&
    savedPostsLoadingUid === uid
  ) {
    return savedPostsLoadPromise;
  }

  savedPostsLoadingUid = uid;

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

        savedPostIds =
          new Set(
            snapshot.docs.map(
              item => item.id
            )
          );

        savedPostsLoadedForUid =
          uid;

        updateRenderedSaveButtons();
      } finally {
        savedPostsLoadPromise = null;
        savedPostsLoadingUid = null;
      }
    })();

  return savedPostsLoadPromise;
}

function updateRenderedSaveButtons() {
  document
    .querySelectorAll(
      "[data-save]"
    )
    .forEach(button => {
      const postId =
        button.dataset.save;

      const saved =
        savedPostIds.has(postId);

      button.textContent =
        saved
          ? "🔖 Saved"
          : "🔖 Save";

      button.setAttribute(
        "aria-pressed",
        String(saved)
      );

      button.classList.toggle(
        "active",
        saved
      );
    });
}

function filterRenderedPosts(
  searchTerm
) {
  const term =
    String(
      searchTerm || ""
    )
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

function formatPostDate(
  post
) {
  if (!post) {
    return "";
  }

  const value =
    post.createdAt;

  if (!value) {
    return "Just now";
  }

  try {
    return formatDate(value);
  } catch {
    return "Just now";
  }
}

function renderPost(post) {
  const id =
    String(post.id || "");

  const owner =
    post.uid ===
    state.user?.uid;

  const liked =
    Array.isArray(
      post.likedBy
    ) &&
    post.likedBy.includes(
      state.user?.uid
    );

  const saved =
    savedPostIds.has(id);

  const likes =
    Number(
      post.likes || 0
    );

  const comments =
    Number(
      post.comments || 0
    );

  const authorName =
    post.username ||
    "User";

  const avatarInitials =
    initials(authorName);

  const expiryLabel =
    formatExpiryLabel(post);

  const imageHtml =
    post.imageUrl
      ? `
        <div
          style="
            margin-top:14px;
            overflow:hidden;
            border-radius:18px;
          "
        >
          <img
            src="${escapeHtml(post.imageUrl)}"
            alt="Post image"
            loading="lazy"
            style="
              width:100%;
              max-height:520px;
              object-fit:cover;
              display:block;
            "
          >
        </div>
      `
      : "";

  return `
    <article
      class="card post-card"
      data-post-card="${escapeHtml(id)}"
      style="
        margin-bottom:16px;
        overflow:visible;
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
            gap:11px;
            min-width:0;
          "
        >
          <div
            class="avatar"
            style="
              flex:0 0 42px;
              width:42px;
              height:42px;
            "
          >
            ${escapeHtml(avatarInitials)}
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
                white-space:nowrap;
              "
            >
              ${escapeHtml(authorName)}
            </strong>

            <div class="small">
              ${escapeHtml(formatPostDate(post))}
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
          style="
            position:relative;
          "
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
            class="dropdown-menu hidden"
            id="postMenu-${escapeHtml(id)}"
          >
            <button
              type="button"
              data-share="${escapeHtml(id)}"
            >
              Share
            </button>

            ${
              owner
                ? `
                  <button
                    type="button"
                    data-edit-post="${escapeHtml(id)}"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    data-delete-post="${escapeHtml(id)}"
                  >
                    Delete
                  </button>
                `
                : ""
            }
          </div>
        </div>
      </div>

      <div
        style="
          margin-top:14px;
          line-height:1.65;
          white-space:pre-wrap;
          overflow-wrap:anywhere;
        "
      >
        ${escapeHtml(post.text || "")}
      </div>

      ${imageHtml}

      <div
        class="small"
        style="
          display:grid;
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
          gap:8px;
          margin-top:16px;
        "
      >
        <button
          type="button"
          class="btn"
          data-like="${escapeHtml(id)}"
          aria-pressed="${String(liked)}"
          ${
            liked
              ? 'class="btn active"'
              : ""
          }
        >
          ${liked ? "❤️" : "🤍"}
          ${likes}
        </button>

        <button
          type="button"
          class="btn"
          data-comment="${escapeHtml(id)}"
        >
          💬 ${comments}
        </button>

        <button
          type="button"
          class="btn"
          data-save="${escapeHtml(id)}"
          aria-pressed="${String(saved)}"
        >
          ${saved ? "🔖 Saved" : "🔖 Save"}
        </button>

        <button
          type="button"
          class="btn"
          data-share="${escapeHtml(id)}"
        >
          ↗️ Share
        </button>
      </div>
    </article>
  `;
}

function updatePostLikeUi(
  postId,
  liked,
  likes
) {
  const card =
    document.querySelector(
      `[data-post-card="${cssEscape(postId)}"]`
    );

  if (!card) {
    return;
  }

  const button =
    card.querySelector(
      `[data-like="${cssEscape(postId)}"]`
    );

  if (!button) {
    return;
  }

  button.textContent =
    `${liked ? "❤️" : "🤍"} ${Number(likes || 0)}`;

  button.setAttribute(
    "aria-pressed",
    String(liked)
  );

  button.classList.toggle(
    "active",
    liked
  );
}

async function toggleLike(
  postId
) {
  if (
    !state.user?.uid ||
    pendingLikeIds.has(postId)
  ) {
    return;
  }

  const post =
    state.posts.find(
      item =>
        item.id === postId
    );

  if (!post) {
    toast("Post not found.");
    return;
  }

  pendingLikeIds.add(postId);

  const uid =
    state.user.uid;

  const currentLiked =
    Array.isArray(
      post.likedBy
    ) &&
    post.likedBy.includes(uid);

  const nextLiked =
    !currentLiked;

  const currentLikes =
    Number(
      post.likes || 0
    );

  const nextLikes =
    Math.max(
      0,
      currentLikes +
        (nextLiked ? 1 : -1)
    );

  try {
    await updateDoc(
      doc(
        db,
        "posts",
        postId
      ),
      {
        likes:
          increment(
            nextLiked
              ? 1
              : -1
          ),
        likedBy:
          nextLiked
            ? arrayUnion(uid)
            : arrayRemove(uid)
      }
    );

    post.likes =
      nextLikes;

    const likedBy =
      Array.isArray(
        post.likedBy
      )
        ? [...post.likedBy]
        : [];

    if (nextLiked) {
      if (
        !likedBy.includes(uid)
      ) {
        likedBy.push(uid);
      }
    } else {
      const index =
        likedBy.indexOf(uid);

      if (index >= 0) {
        likedBy.splice(
          index,
          1
        );
      }
    }

    post.likedBy =
      likedBy;

    updatePostLikeUi(
      postId,
      nextLiked,
      nextLikes
    );

    markHomeActivity();

    if (
      nextLiked &&
      post.uid &&
      post.uid !== uid
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
            actorUid: uid,
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
      } catch (notificationError) {
        console.warn(
          "Could not create like notification:",
          notificationError
        );
      }
    }
  } catch (error) {
    toast(
      friendly(error)
    );
  } finally {
    pendingLikeIds.delete(
      postId
    );
  }
}

async function savePost(
  postId
) {
  if (
    !state.user?.uid ||
    pendingSaveIds.has(postId)
  ) {
    return;
  }

  pendingSaveIds.add(
    postId
  );

  const uid =
    state.user.uid;

  const alreadySaved =
    savedPostIds.has(
      postId
    );

  try {
    const savedRef =
      doc(
        db,
        "users",
        uid,
        "savedPosts",
        postId
      );

    if (alreadySaved) {
      await deleteDoc(
        savedRef
      );

      savedPostIds.delete(
        postId
      );

      toast(
        "Post removed from saved posts."
      );
    } else {
      await setDoc(
        savedRef,
        {
          postId,
          savedAt:
            serverTimestamp()
        }
      );

      savedPostIds.add(
        postId
      );

      toast(
        "Post saved 🔖"
      );
    }

    markHomeActivity();
    updateRenderedSaveButtons();
  } catch (error) {
    toast(
      friendly(error)
    );
  } finally {
    pendingSaveIds.delete(
      postId
    );
  }
}

async function sharePost(
  postId
) {
  const post =
    state.posts.find(
      item =>
        item.id === postId
    );

  if (!post) {
    toast("Post not found.");
    return;
  }

  const text =
    `${post.username || "User"} on Marvel Chat:\n\n${post.text || ""}`;

  try {
    if (
      navigator.share
    ) {
      await navigator.share(
        {
          title:
            "Marvel Chat",
          text
        }
      );

      markHomeActivity();
      return;
    }
  } catch (error) {
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

    markHomeActivity();
  } catch {
    showModal(
      "Share Post",
      `
        <div
          style="
            white-space:pre-wrap;
            line-height:1.6;
            overflow-wrap:anywhere;
          "
        >
          ${escapeHtml(text)}
        </div>
      `
    );
  }
}

function renderExpiryOptions(
  selectedValue
) {
  return POST_EXPIRY_OPTIONS
    .map(
      option => `
        <option
          value="${escapeHtml(option.value)}"
          ${
            option.value ===
            selectedValue
              ? "selected"
              : ""
          }
        >
          ${escapeHtml(option.label)}
        </option>
      `
    )
    .join("");
}

function showCreatePost() {
  if (!state.user?.uid) {
    toast(
      "Please sign in first."
    );
    return;
  }

  showModal(
    "Create Post",
    `
      <form id="createPostForm">
        <label
          class="small"
          for="createPostText"
        >
          What would you like to share?
        </label>

        <textarea
          id="createPostText"
          rows="6"
          maxlength="5000"
          placeholder="Write something for the community..."
          required
          style="
            width:100%;
            margin-top:8px;
            resize:vertical;
          "
        ></textarea>

        <div
          style="
            margin-top:14px;
          "
        >
          <label
            class="small"
            for="createPostExpiry"
          >
            Post duration
          </label>

          <select
            id="createPostExpiry"
            style="
              width:100%;
              margin-top:8px;
            "
          >
            ${renderExpiryOptions("1d")}
          </select>
        </div>

        <div
          style="
            display:flex;
            justify-content:flex-end;
            gap:10px;
            margin-top:18px;
          "
        >
          <button
            type="button"
            class="btn"
            id="cancelCreatePost"
          >
            Cancel
          </button>

          <button
            type="submit"
            class="btn btn-primary"
          >
            Publish
          </button>
        </div>
      </form>
    `
  );

  document
    .getElementById(
      "cancelCreatePost"
    )
    ?.addEventListener(
      "click",
      closeModal
    );

  document
    .getElementById(
      "createPostForm"
    )
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

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

        if (!text) {
          toast(
            "Write something first."
          );
          return;
        }

        const expiresAt =
          getPostExpiryDate(
            expiryInput?.value ||
              "1d"
          );

        const submitButton =
          event.currentTarget.querySelector(
            'button[type="submit"]'
          );

        if (submitButton) {
          submitButton.disabled =
            true;
          submitButton.textContent =
            "Publishing…";
        }

        try {
          const createdAt =
            new Date();

          const postData =
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
            };

          const result =
            await addDoc(
              collection(
                db,
                "posts"
              ),
              postData
            );

          state.posts.unshift(
            {
              id: result.id,
              ...postData,
              createdAt
            }
          );

          closeModal();
          markHomeActivity();

          toast(
            "Post published 🎉"
          );
        } catch (error) {
          toast(
            friendly(error)
          );

          if (
            submitButton
          ) {
            submitButton.disabled =
              false;
            submitButton.textContent =
              "Publish";
          }
        }
      }
    );
}

function showEditPost(
  postId
) {
  const post =
    state.posts.find(
      item =>
        item.id === postId
    );

  if (!post) {
    toast("Post not found.");
    return;
  }

  if (
    post.uid !==
    state.user?.uid
  ) {
    toast(
      "You can only edit your own posts."
    );
    return;
  }

  const expiryDate =
    timestampToDate(
      post.expiresAt
    );

  let defaultExpiry =
    "1d";

  if (expiryDate) {
    const remaining =
      expiryDate.getTime() -
      Date.now();

    if (
      remaining <=
      12 * 60 * 60 * 1000
    ) {
      defaultExpiry =
        "12h";
    } else if (
      remaining <=
      24 * 60 * 60 * 1000
    ) {
      defaultExpiry =
        "1d";
    } else if (
      remaining <=
      7 * 24 * 60 * 60 * 1000
    ) {
      defaultExpiry =
        "7d";
    } else {
      defaultExpiry =
        "30d";
    }
  }

  showModal(
    "Edit Post",
    `
      <form id="editPostForm">
        <textarea
          id="editPostText"
          rows="6"
          maxlength="5000"
          required
          style="
            width:100%;
            resize:vertical;
          "
        >${escapeHtml(
          post.text || ""
        )}</textarea>

        <div
          style="
            margin-top:14px;
          "
        >
          <label
            class="small"
            for="editPostExpiry"
          >
            Post duration
          </label>

          <select
            id="editPostExpiry"
            style="
              width:100%;
              margin-top:8px;
            "
          >
            ${renderExpiryOptions(
              defaultExpiry
            )}
          </select>
        </div>

        <div
          style="
            display:flex;
            justify-content:flex-end;
            gap:10px;
            margin-top:18px;
          "
        >
          <button
            type="button"
            class="btn"
            id="cancelEditPost"
          >
            Cancel
          </button>

          <button
            type="submit"
            class="btn btn-primary"
          >
            Save changes
          </button>
        </div>
      </form>
    `
  );

  document
    .getElementById(
      "cancelEditPost"
    )
    ?.addEventListener(
      "click",
      closeModal
    );

  document
    .getElementById(
      "editPostForm"
    )
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const input =
          document.getElementById(
            "editPostText"
          );

        const expiryInput =
          document.getElementById(
            "editPostExpiry"
          );

        const text =
          String(
            input?.value || ""
          ).trim();

        if (!text) {
          toast(
            "Post text cannot be empty."
          );
          return;
        }

        const expiresAt =
          getPostExpiryDate(
            expiryInput?.value ||
              defaultExpiry
          );

        const submitButton =
          event.currentTarget.querySelector(
            'button[type="submit"]'
          );

        if (submitButton) {
          submitButton.disabled =
            true;
          submitButton.textContent =
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
                serverTimestamp(),
              expiresAt
            }
          );

          post.text =
            text;
          post.expiresAt =
            expiresAt;

          closeModal();
          markHomeActivity();

          toast(
            "Post updated."
          );
        } catch (error) {
          toast(
            friendly(error)
          );

          if (
            submitButton
          ) {
            submitButton.disabled =
              false;
            submitButton.textContent =
              "Save changes";
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
      item =>
        item.id === postId
    );

  if (!post) {
    toast("Post not found.");
    return;
  }

  if (
    post.uid !==
    state.user?.uid
  ) {
    toast(
      "You can only delete your own posts."
    );
    return;
  }

  showModal(
    "Delete Post",
    `
      <div
        style="
          line-height:1.6;
        "
      >
        Are you sure you want to delete this post?
        This action cannot be undone.
      </div>

      <div
        style="
          display:flex;
          justify-content:flex-end;
          gap:10px;
          margin-top:20px;
        "
      >
        <button
          type="button"
          class="btn"
          id="cancelDeletePost"
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
      async event => {
        const button =
          event.currentTarget;

        button.disabled =
          true;
        button.textContent =
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

async function showComments(
  postId
) {
  const post =
    state.posts.find(
      item =>
        item.id === postId
    );

  if (!post) {
    toast("Post not found.");
    return;
  }

  showModal(
    "Comments",
    `
      <div
        id="commentsList"
        class="list"
        style="
          max-height:45vh;
          overflow:auto;
        "
      >
        <div
          class="small"
          style="
            padding:18px 0;
          "
        >
          Loading comments…
        </div>
      </div>

      <form
        id="commentForm"
        style="
          margin-top:16px;
        "
      >
        <textarea
          id="commentInput"
          rows="3"
          maxlength="2000"
          placeholder="Write a comment..."
          required
          style="
            width:100%;
            resize:vertical;
          "
        ></textarea>

        <div
          style="
            display:flex;
            justify-content:flex-end;
            margin-top:10px;
          "
        >
          <button
            type="submit"
            class="btn btn-primary"
            id="addComment"
          >
            Add comment
          </button>
        </div>
      </form>
    `
  );

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
      !snapshot.docs.length
    ) {
      list.className =
        "list empty";

      list.innerHTML = `
        <div
          class="small"
          style="
            padding:18px 0;
          "
        >
          No comments yet.
        </div>
      `;
    } else {
      list.className =
        "list";

      list.innerHTML =
        snapshot.docs
          .map(
            commentDoc => {
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
                      formatPostDate({
                        createdAt:
                          comment.createdAt
                      })
                    )}
                  </div>
                </div>
              `;
            }
          )
          .join("");
    }
  } catch (error) {
    list.className =
      "list";

    list.innerHTML = `
      <div
        class="small"
        style="
          padding:18px 0;
        "
      >
        Could not load comments.
      </div>
    `;

    console.warn(
      "Could not load comments:",
      error
    );
  }

  document
    .getElementById(
      "commentForm"
    )
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const input =
          document.getElementById(
            "commentInput"
          );

        const btn =
          document.getElementById(
            "addComment"
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

        if (btn) {
          btn.disabled =
            true;
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

          /*
           * Do not immediately call showComments() again.
           * The comment was just written successfully, so re-reading
           * the entire comments collection would spend another batch
           * of reads for no user-visible benefit.
           */

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
            } catch (
              notificationError
            ) {
              console.warn(
                "Could not create comment notification:",
                notificationError
              );
            }
          }

          input.value = "";

          markHomeActivity();

          toast(
            "Comment added 💬"
          );

          if (list) {
            const emptyMessage =
              list.classList.contains(
                "empty"
              ) ||
              list.textContent.includes(
                "No comments yet"
              );

            const itemHtml = `
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
              list.className =
                "list";

              list.innerHTML =
                itemHtml;
            } else {
              list.insertAdjacentHTML(
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
                `💬 ${Number(
                  currentPost?.comments ||
                    0
                )}`;
            }
          }
        } catch (error) {
          toast(
            friendly(error)
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

async function cleanupExpiredPosts() {
  if (!state.user?.uid) {
    return;
  }

  const now =
    Date.now();

  const expiredOwnedPosts =
    state.posts.filter(
      post => {
        if (
          post.uid !==
          state.user.uid
        ) {
          return false;
        }

        const expiry =
          timestampToDate(
            post.expiresAt
          );

        return (
          expiry &&
          expiry.getTime() <=
            now
        );
      }
    );

  if (
    !expiredOwnedPosts.length
  ) {
    return;
  }

  await Promise.all(
    expiredOwnedPosts.map(
      post =>
        deleteDoc(
          doc(
            db,
            "posts",
            post.id
          )
        )
    )
  );
}

export function renderHome(
  renderApp
) {
  const me =
    state.profile || {};

  const posts =
    Array.isArray(
      state.posts
    )
      ? state.posts
      : [];

  const showDiscovery =
    shouldShowDiscovery();

  const activePosts =
    posts
      .filter(
        post =>
          !isPostExpired(post)
      )
      .sort(
        (a, b) => {
          const aDate =
            timestampToDate(
              a.createdAt
            )?.getTime() || 0;

          const bDate =
            timestampToDate(
              b.createdAt
            )?.getTime() || 0;

          return (
            bDate - aDate
          );
        }
      );

  const displayName =
    me.displayName ||
    me.username ||
    "there";

  return `
    <div
      class="page home-page"
      style="
        padding-bottom:30px;
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
          margin-bottom:20px;
          overflow:hidden;
          position:relative;
          padding:26px;
        "
      >
        <div
          style="
            position:absolute;
            inset:0;
            pointer-events:none;
            opacity:.06;
            background:
              radial-gradient(
                circle at 85% 20%,
                currentColor 0,
                transparent 35%
              );
          "
        ></div>

        <div
          style="
            position:relative;
            z-index:1;
          "
        >
          <div
            class="small"
            style="
              text-transform:uppercase;
              letter-spacing:.08em;
              font-weight:800;
            "
          >
            MARVEL CHAT
          </div>

          <h1
            style="
              margin:6px 0 8px;
              font-size:clamp(30px, 7vw, 48px);
              line-height:1.05;
            "
          >
            Hey ${escapeHtml(displayName)} 👋
          </h1>

          <p
            class="small"
            style="
              margin:0;
              font-size:15px;
              line-height:1.6;
            "
          >
            Connect, chat, share, trade skills,
            and discover what is happening in your community.
          </p>
        </div>
      </section>

      <section
        class="card"
        style="
          margin-bottom:20px;
        "
      >
        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            margin-bottom:14px;
          "
        >
          <div>
            <h2
              style="
                margin:0;
              "
            >
              Quick access
            </h2>

            <div class="small">
              Jump straight into Marvel Chat.
            </div>
          </div>
        </div>

        <div class="quick-grid">
          <button
            type="button"
            class="quick"
            data-quick="post"
          >
            <span
              style="
                font-size:26px;
              "
            >
              ✍️
            </span>

            <strong>
              Create Post
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
            <span
              style="
                font-size:26px;
              "
            >
              💬
            </span>

            <strong>
              Chat
            </strong>

            <span class="small">
              Message people
            </span>
          </button>

          <button
            type="button"
            class="quick"
            data-quick="timetrust"
          >
            <span
              style="
                font-size:26px;
              "
            >
              ⏱️
            </span>

            <strong>
              TimeTrust
            </strong>

            <span class="small">
              Exchange skills
            </span>
          </button>

          <button
            type="button"
            class="quick"
            data-quick="market"
          >
            <span
              style="
                font-size:26px;
              "
            >
              🛍️
            </span>

            <strong>
              Market
            </strong>

            <span class="small">
              Browse listings
            </span>
          </button>
        </div>
      </section>

      <section
        class="card"
        style="
          margin-bottom:20px;
        "
      >
        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            flex-wrap:wrap;
            margin-bottom:16px;
          "
        >
          <div>
            <h2
              style="
                margin:0;
              "
            >
              Community Feed
            </h2>

            <div class="small">
              See what your community is sharing.
            </div>
          </div>

          <button
            type="button"
            class="btn btn-primary"
            id="createPostBtn"
          >
            + Create Post
          </button>
        </div>

        <input
          id="communityFeedSearch"
          type="search"
          placeholder="Search posts..."
          aria-label="Search community posts"
          style="
            width:100%;
            margin-bottom:18px;
          "
        />

        ${
          activePosts.length
            ? `
              <div>
                ${activePosts
                  .map(
                    post =>
                      renderPost(
                        post
                      )
                  )
                  .join("")}
              </div>
            `
            : `
              <div
                class="empty"
                style="
                  padding:28px 10px;
                  text-align:center;
                "
              >
                <div
                  style="
                    font-size:34px;
                    margin-bottom:8px;
                  "
                >
                  🌟
                </div>

                <strong>
                  No posts yet
                </strong>

                <div
                  class="small"
                  style="
                    margin-top:6px;
                  "
                >
                  Be the first person to share something.
                </div>

                <button
                  type="button"
                  class="btn btn-primary"
                  id="emptyCreatePost"
                  style="
                    margin-top:14px;
                  "
                >
                  Create the first post
                </button>
              </div>
            `
        }
      </section>

      <section
        class="card"
        style="
          margin-bottom:20px;
        "
      >
        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
          "
        >
          <div>
            <h2
              style="
                margin:0;
              "
            >
              YouTube Live
            </h2>

            <div class="small">
              Find Marvel live streams and community content.
            </div>
          </div>

          <button
            type="button"
            class="btn"
            id="youtubeLiveSearchBtn"
          >
            ▶️ Search Live
          </button>
        </div>
      </section>

      <section
        class="card"
        style="
          margin-bottom:20px;
        "
      >
        <h2
          style="
            margin:0 0 8px;
          "
        >
          Quick Access
        </h2>

        <div class="small">
          Market and TimeTrust are available whenever you need them.
        </div>
      </section>
    </div>
  `;
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
