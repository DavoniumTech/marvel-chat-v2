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
  Timestamp,
  runTransaction
} from "../firebase/firestore.js";

import { toast } from "../components/toast.js";

const CLOUDINARY_CLOUD_NAME = "rzfgrd6q";
const CLOUDINARY_UPLOAD_PRESET = "marvel_chat_images";
const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

const HOME_MEDIA_USAGE_KEY = "marvel_media_usage_v2";
const HOME_MEDIA_MAX_FILE_BYTES = 10 * 1024 * 1024;
const HOME_MEDIA_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const HOME_MEDIA_MAX_DIMENSION = 1920;
const HOME_MEDIA_WINDOW_MS = 24 * 60 * 60 * 1000;
const POST_TEXT_COLLAPSE_LENGTH = 520;

const POST_TEXT_COLLAPSED_MEDIA_HEIGHT_PX = 72;
const POST_TEXT_COLLAPSED_TEXT_ONLY_HEIGHT_PX = 217;

const DISCOVERY_STORAGE_KEY = "marvel_discovery_seen_v2";
const DISCOVERY_LAST_ACTIVE_KEY = "marvel_home_last_active_v1";
const DISCOVERY_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DISCOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DISCOVERY_MAX_IMPRESSIONS = 3;
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
let pendingHomeImage = null;
let pendingHomeImagePreviewUrl = "";
let editPendingImage = null;
let editPendingImagePreviewUrl = "";
let editRemoveExistingPhoto = false;
let searchPostsCache = null;
let searchPostsLoadPromise = null;
let homeResizeObserver = null;
let homeOverflowSyncFrame = null;

const pendingLikeIds = new Set();
const pendingSaveIds = new Set();

function uid() {
  return state.user?.uid || null;
}

function postId(id) {
  return String(id ?? "");
}

function getPosts() {
  return Array.isArray(state.posts)
    ? state.posts
    : [];
}

function getPost(id) {
  const recent = getPosts().find(
    p => postId(p.id) === postId(id)
  );

  if (recent) {
    return recent;
  }

  return (
    Array.isArray(searchPostsCache)
      ? searchPostsCache
      : []
  ).find(
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
    return new Date(
      value.seconds * 1000
    );
  }

  return null;
}

function isPostExpired(post) {
  const date = toDate(
    post?.expiresAt
  );

  return !!date &&
    date.getTime() <= Date.now();
}

function expiryLabel(post) {
  const date = toDate(
    post?.expiresAt
  );

  if (!date) {
    return "";
  }

  const remaining =
    date.getTime() - Date.now();

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
  const hour =
    new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return "Good morning";
  }

  if (hour >= 12 && hour < 17) {
    return "Good afternoon";
  }

  if (hour >= 17 && hour < 21) {
    return "Good evening";
  }

  return "Good night";
}

function safeMediaUrl(value) {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "";
  }

  try {
    const url = new URL(
      raw,
      window.location.href
    );

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function getPostMedia(post) {
  const media =
    post?.media ||
    post?.attachment ||
    null;

  if (!media) {
    return null;
  }

  if (typeof media === "string") {
    const url =
      safeMediaUrl(media);

    return url
      ? {
          type: "image",
          url
        }
      : null;
  }

  if (Array.isArray(media)) {
    const first =
      media.find(
        item =>
          item?.url ||
          item?.secure_url
      );

    if (!first) {
      return null;
    }

    const url =
      safeMediaUrl(
        first.url ||
        first.secure_url
      );

    return url
      ? {
          type:
            first.type ||
            "image",
          url
        }
      : null;
  }

  const url =
    safeMediaUrl(
      media.url ||
      media.secure_url
    );

  return url
    ? {
        type:
          media.type ||
          "image",
        url
      }
    : null;
}

function renderPostMedia(post) {
  const media =
    getPostMedia(post);

  if (!media) {
    return "";
  }

  if (
    media.type === "image" ||
    media.type === "photo"
  ) {
    return `
      <div
        class="post-media"
        data-media-slot="image"
        style="
          margin-top:13px;
          overflow:hidden;
          border-radius:16px;
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
      style="
        display:inline-flex;
        margin-top:12px;
      "
    >
      Open attachment ↗
    </a>
  `;
}

function homeHasMarketAccount() {
  if (
    state.profile?.marketAccount?.active === true
  ) {
    return true;
  }

  const listings =
    Array.isArray(state.listings)
      ? state.listings
      : [];

  return listings.some(
    item =>
      String(item?.uid || "") ===
      String(uid() || "")
  );
}

function readHomeMediaUsage() {
  const currentUid = uid();

  if (!currentUid) {
    return {
      homeTimestamps: [],
      marketTimestamps: []
    };
  }

  try {
    const raw =
      localStorage.getItem(
        `${HOME_MEDIA_USAGE_KEY}_${currentUid}`
      );

    const parsed =
      raw
        ? JSON.parse(raw)
        : null;

    const cutoff =
      Date.now() -
      HOME_MEDIA_WINDOW_MS;

    const homeTimestamps =
      Array.isArray(
        parsed?.homeTimestamps
      )
        ? parsed.homeTimestamps
            .map(
              value =>
                Number(value) || 0
            )
            .filter(
              value =>
                value > cutoff
            )
        : [];

    const marketTimestamps =
      Array.isArray(
        parsed?.marketTimestamps
      )
        ? parsed.marketTimestamps
            .map(
              value =>
                Number(value) || 0
            )
            .filter(
              value =>
                value > cutoff
            )
        : [];

    return {
      homeTimestamps,
      marketTimestamps
    };
  } catch {
    return {
      homeTimestamps: [],
      marketTimestamps: []
    };
  }
}

function saveHomeMediaUsage(usage) {
  const currentUid = uid();

  if (!currentUid) {
    return;
  }

  try {
    localStorage.setItem(
      `${HOME_MEDIA_USAGE_KEY}_${currentUid}`,
      JSON.stringify({
        homeTimestamps:
          Array.isArray(
            usage.homeTimestamps
          )
            ? usage.homeTimestamps
            : [],
        marketTimestamps:
          Array.isArray(
            usage.marketTimestamps
          )
            ? usage.marketTimestamps
            : []
      })
    );
  } catch {}
}

function homePhotoLimit() {
  /*
   * This is intentionally only a UI hint.
   *
   * The authoritative Home photo limit is enforced
   * by Firestore rules together with the atomic
   * mediaUsage transaction.
   */
  return 2;
}

function homePhotosRemaining() {
  const usage =
    readHomeMediaUsage();

  return Math.max(
    0,
    homePhotoLimit() -
      usage.homeTimestamps.length
  );
}

function homePhotoRetryText(
  oldestTimestamp
) {
  const elapsed =
    Date.now() -
    oldestTimestamp;

  const remainingMs =
    Math.max(
      0,
      HOME_MEDIA_WINDOW_MS -
        elapsed
    );

  const remainingMinutes =
    Math.ceil(
      remainingMs / 60000
    );

  if (
    remainingMinutes >= 60
  ) {
    const hours =
      Math.ceil(
        remainingMinutes / 60
      );

    return `Try again in about ${hours} hour${hours === 1 ? "" : "s"}.`;
  }

  return `Try again in about ${Math.max(
    1,
    remainingMinutes
  )} minute${remainingMinutes === 1 ? "" : "s"}.`;
}

function pruneLocalHomeUsage() {
  const usage =
    readHomeMediaUsage();

  saveHomeMediaUsage(
    usage
  );

  return usage;
}

function recordLocalHomePhotoUse(
  timestamp = Date.now()
) {
  const usage =
    pruneLocalHomeUsage();

  usage.homeTimestamps =
    [
      ...usage.homeTimestamps,
      timestamp
    ]
      .filter(
        value =>
          value >
          Date.now() -
            HOME_MEDIA_WINDOW_MS
      )
      .slice(-homePhotoLimit());

  saveHomeMediaUsage(
    usage
  );
}

function hasHomePhoto(post) {
  return !!getPostMedia(post);
}

function normalizePostText(text) {
  return String(
    text || ""
  ).trim();
}

function postNeedsTextToggle(
  textElement
) {
  if (!textElement) {
    return false;
  }

  /*
   * scrollHeight/clientHeight is the important check.
   * Do not use text.length here because wrapping depends
   * on the actual device width, font, and browser.
   */
  return (
    textElement.scrollHeight >
    textElement.clientHeight + 1
  );
}

function syncOnePostTextOverflow(
  card
) {
  if (!card) {
    return;
  }

  const textElement =
    card.querySelector(
      "[data-post-text]"
    );

  const toggle =
    card.querySelector(
      "[data-home-action='toggle-text']"
    );

  if (
    !textElement ||
    !toggle
  ) {
    return;
  }

  const isExpanded =
    textElement.dataset.expanded ===
    "true";

  const hasOverflow =
    postNeedsTextToggle(
      textElement
    );

  /*
   * If a previously expanded element becomes smaller
   * because the viewport changed, temporarily collapse it
   * before measuring again. This prevents the toggle from
   * disappearing while leaving the post expanded.
   */
  if (
    isExpanded &&
    !hasOverflow
  ) {
    toggle.hidden = true;
    toggle.setAttribute(
      "aria-hidden",
      "true"
    );
    return;
  }

  toggle.hidden =
    !hasOverflow;

  toggle.setAttribute(
    "aria-hidden",
    hasOverflow
      ? "false"
      : "true"
  );

  if (!hasOverflow) {
    textElement.dataset.expanded =
      "false";

    textElement.style.maxHeight =
      textElement.classList.contains(
        "post-text-with-media"
      )
        ? `${POST_TEXT_COLLAPSED_MEDIA_HEIGHT_PX}px`
        : `${POST_TEXT_COLLAPSED_TEXT_ONLY_HEIGHT_PX}px`;

    toggle.textContent =
      "Show more";

    toggle.setAttribute(
      "aria-expanded",
      "false"
    );

    return;
  }

  if (isExpanded) {
    textElement.style.maxHeight =
      `${textElement.scrollHeight}px`;

    toggle.textContent =
      "Show less";

    toggle.setAttribute(
      "aria-expanded",
      "true"
    );
  } else {
    toggle.textContent =
      "Show more";

    toggle.setAttribute(
      "aria-expanded",
      "false"
    );
  }
}

function syncPostTextOverflow(
  root = document
) {
  if (!root) {
    return;
  }

  root
    .querySelectorAll(
      "[data-post-card]"
    )
    .forEach(
      syncOnePostTextOverflow
    );
}

function schedulePostTextOverflowSync(
  root = document
) {
  if (homeOverflowSyncFrame) {
    cancelAnimationFrame(
      homeOverflowSyncFrame
    );
  }

  /*
   * Two animation frames are intentional:
   *
   * frame 1 = DOM exists
   * frame 2 = browser has completed layout
   *
   * This fixes the original bug where the feed was
   * rendered AFTER syncPostTextOverflow() had already run.
   */
  homeOverflowSyncFrame =
    requestAnimationFrame(
      () => {
        homeOverflowSyncFrame =
          requestAnimationFrame(
            () => {
              syncPostTextOverflow(
                root
              );

              homeOverflowSyncFrame =
                null;
            }
          );
      }
    );
}

function observeHomePostOverflow(
  homePage
) {
  if (
    homeResizeObserver
  ) {
    homeResizeObserver.disconnect();
    homeResizeObserver = null;
  }

  if (
    typeof ResizeObserver !==
      "undefined"
  ) {
    homeResizeObserver =
      new ResizeObserver(
        entries => {
          if (
            entries.length
          ) {
            schedulePostTextOverflowSync(
              homePage
            );
          }
        }
      );

    homeResizeObserver.observe(
      homePage
    );
  }

  if (
    !homePage.__marvelHomeResizeBound
  ) {
    const resizeHandler =
      () =>
        schedulePostTextOverflowSync(
          homePage
        );

    window.addEventListener(
      "resize",
      resizeHandler,
      {
        passive: true
      }
    );

    homePage.__marvelHomeResizeBound =
      true;

    homePage.__marvelHomeResizeHandler =
      resizeHandler;
  }
}

export function toggleHomePostText(
  id
) {
  const card =
    document.querySelector(
      `[data-post-card="${CSS.escape(
        postId(id)
      )}"]`
    );

  if (!card) {
    return;
  }

  const textElement =
    card.querySelector(
      "[data-post-text]"
    );

  const toggle =
    card.querySelector(
      "[data-home-action='toggle-text']"
    );

  if (
    !textElement ||
    !toggle
  ) {
    return;
  }

  const currentlyExpanded =
    textElement.dataset.expanded ===
    "true";

  if (currentlyExpanded) {
    textElement.dataset.expanded =
      "false";

    const collapsedHeight =
      textElement.classList.contains(
        "post-text-with-media"
      )
        ? POST_TEXT_COLLAPSED_MEDIA_HEIGHT_PX
        : POST_TEXT_COLLAPSED_TEXT_ONLY_HEIGHT_PX;

    textElement.style.maxHeight =
      `${collapsedHeight}px`;

    toggle.textContent =
      "Show more";

    toggle.setAttribute(
      "aria-expanded",
      "false"
    );

    requestAnimationFrame(
      () =>
        syncOnePostTextOverflow(
          card
        )
    );

    return;
  }

  textElement.dataset.expanded =
    "true";

  textElement.style.maxHeight =
    `${textElement.scrollHeight}px`;

  toggle.textContent =
    "Show less";

  toggle.setAttribute(
    "aria-expanded",
    "true"
  );

  requestAnimationFrame(
    () => {
      textElement.style.maxHeight =
        `${textElement.scrollHeight}px`;
    }
  );
}

function renderPostText(
  post
) {
  const text =
    getPostText(post);

  if (!text) {
    return "";
  }

  const media =
    getPostMedia(post);

  const longText =
    text.length >
    POST_TEXT_COLLAPSE_LENGTH;

  const mediaClass =
    media
      ? "post-text-with-media"
      : "post-text-text-only";

  const initialHeight =
    media
      ? POST_TEXT_COLLAPSED_MEDIA_HEIGHT_PX
      : POST_TEXT_COLLAPSED_TEXT_ONLY_HEIGHT_PX;

  return `
    <div
      class="post-text-wrap"
      style="
        margin-top:12px;
      "
    >
      <div
        class="post-text-surface ${mediaClass}"
        data-post-text
        data-expanded="false"
        style="
          max-height:${initialHeight}px;
          overflow:hidden;
          transition:max-height .24s ease;
          padding:16px;
          border-radius:16px;
          line-height:1.65;
          white-space:pre-wrap;
          overflow-wrap:anywhere;
          background:var(--surface-2,rgba(127,127,127,.08));
          box-sizing:border-box;
        "
      >${escapeHtml(text)}</div>

      <button
        type="button"
        class="btn secondary post-text-toggle"
        data-home-action="toggle-text"
        data-id="${escapeHtml(postId(post.id))}"
        aria-expanded="false"
        ${longText ? "" : "hidden"}
        style="
          margin-top:8px;
          min-height:36px;
          padding:7px 13px;
        "
      >Show more</button>
    </div>
  `;
}

function renderPostCard(
  post
) {
  if (!post || isPostExpired(post)) {
    return "";
  }

  const id =
    postId(post.id);

  const author =
    getPostAuthor(post);

  const text =
    getPostText(post);

  const date =
    getPostDate(post);

  const media =
    getPostMedia(post);

  const liked =
    Array.isArray(post.likes)
      ? post.likes.includes(uid())
      : !!post.likedByCurrentUser;

  const saved =
    savedPostIds.has(id);

  const ownPost =
    String(post.uid || "") ===
    String(uid() || "");

  const likeCount =
    Number(post.likeCount) ||
    (
      Array.isArray(post.likes)
        ? post.likes.length
        : 0
    );

  const commentCount =
    Number(post.commentCount) ||
    (
      Array.isArray(
        post.comments
      )
        ? post.comments.length
        : 0
    );

  const displayDate =
    date
      ? formatDate(date)
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
        class="post-card-header"
        style="
          display:flex;
          align-items:center;
          gap:11px;
        "
      >
        <div
          class="avatar"
          aria-hidden="true"
        >
          ${escapeHtml(
            initials(author)
          )}
        </div>

        <div
          style="
            flex:1;
            min-width:0;
          "
        >
          <div
            style="
              font-weight:700;
              overflow:hidden;
              text-overflow:ellipsis;
              white-space:nowrap;
            "
          >
            ${escapeHtml(author)}
          </div>

          <div
            class="small"
            style="
              display:flex;
              gap:7px;
              flex-wrap:wrap;
              align-items:center;
            "
          >
            <span>
              ${escapeHtml(displayDate)}
            </span>

            ${
              expiryLabel(post)
                ? `
                  <span>
                    • ${escapeHtml(
                      expiryLabel(post)
                    )}
                  </span>
                `
                : ""
            }
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
            aria-label="Post menu"
            data-home-action="menu"
            data-id="${escapeHtml(id)}"
          >
            ⋮
          </button>

          <div
            id="postMenu-${escapeHtml(id)}"
            class="dropdown-menu hidden"
            style="
              right:0;
              top:42px;
              min-width:170px;
              z-index:50;
            "
          >
            ${
              ownPost
                ? `
                  <button
                    type="button"
                    class="dropdown-item"
                    data-home-action="edit"
                    data-id="${escapeHtml(id)}"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    class="dropdown-item danger"
                    data-home-action="delete"
                    data-id="${escapeHtml(id)}"
                  >
                    Delete
                  </button>
                `
                : ""
            }

            <button
              type="button"
              class="dropdown-item"
              data-home-action="share"
              data-id="${escapeHtml(id)}"
            >
              Share
            </button>

            ${
              media
                ? `
                  <button
                    type="button"
                    class="dropdown-item"
                    data-home-action="share-image"
                    data-id="${escapeHtml(id)}"
                  >
                    Share image
                  </button>
                `
                : ""
            }
          </div>
        </div>
      </div>

      <div
        class="post-content"
        style="
          margin-top:3px;
        "
      >
        ${renderPostText(post)}

        ${renderPostMedia(post)}
      </div>

      <div
        class="post-actions"
        style="
          display:flex;
          align-items:center;
          flex-wrap:wrap;
          gap:8px;
          margin-top:13px;
        "
      >
        <button
          type="button"
          class="btn secondary"
          data-home-action="like"
          data-id="${escapeHtml(id)}"
          aria-pressed="${liked ? "true" : "false"}"
        >
          ${liked ? "♥" : "♡"}
          ${likeCount}
        </button>

        <button
          type="button"
          class="btn secondary"
          data-home-action="comment"
          data-id="${escapeHtml(id)}"
        >
          💬 ${commentCount}
        </button>

        <button
          type="button"
          class="btn secondary"
          data-home-action="save"
          data-id="${escapeHtml(id)}"
          aria-pressed="${saved ? "true" : "false"}"
        >
          ${saved ? "★ Saved" : "☆ Save"}
        </button>

        <button
          type="button"
          class="btn secondary"
          data-home-action="share"
          data-id="${escapeHtml(id)}"
        >
          ↗ Share
        </button>
      </div>
    </article>
  `;
}

function renderEmptyHomeState() {
  return `
    <div
      class="card"
      style="
        text-align:center;
        padding:32px 18px;
      "
    >
      <div
        style="
          font-size:42px;
          margin-bottom:10px;
        "
      >
        🌍
      </div>

      <h3
        style="
          margin:0 0 7px;
        "
      >
        No posts yet
      </h3>

      <p
        class="small"
        style="
          margin:0 0 16px;
        "
      >
        Be the first person to share something.
      </p>

      <button
        type="button"
        class="btn btn-primary"
        id="emptyCreatePost"
      >
        Create a post
      </button>
    </div>
  `;
}

function renderHomeHeader() {
  return `
    <section
      class="card"
      style="
        margin-bottom:16px;
      "
    >
      <div
        style="
          display:flex;
          align-items:center;
          gap:12px;
        "
      >
        <div class="avatar">
          ${escapeHtml(
            initials(
              currentUserName()
            )
          )}
        </div>

        <div>
          <div class="small">
            ${escapeHtml(
              currentUserGreeting()
            )}
          </div>

          <h2
            style="
              margin:2px 0 0;
            "
          >
            ${escapeHtml(
              currentUserName()
            )}
          </h2>
        </div>
      </div>
    </section>
  `;
}

function renderComposerPreview() {
  return `
    <button
      type="button"
      class="card"
      id="openComposerPreview"
      style="
        width:100%;
        text-align:left;
        border:0;
        cursor:pointer;
        margin-bottom:16px;
      "
    >
      <div
        style="
          display:flex;
          align-items:center;
          gap:11px;
        "
      >
        <div class="avatar">
          ${escapeHtml(
            initials(
              currentUserName()
            )
          )}
        </div>

        <div
          class="small"
          style="
            flex:1;
          "
        >
          What would you like to share?
        </div>
      </div>
    </button>
  `;
}

function renderHomeFeedControls() {
  return `
    <div
      class="card"
      style="
        margin-bottom:16px;
      "
    >
      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-bottom:11px;
        "
      >
        <button
          type="button"
          class="btn ${
            homeFeedFilter === "all"
              ? "btn-primary"
              : "secondary"
          }"
          data-feed-filter="all"
          aria-selected="${
            homeFeedFilter === "all"
          }"
        >
          All
        </button>

        <button
          type="button"
          class="btn ${
            homeFeedFilter === "mine"
              ? "btn-primary"
              : "secondary"
          }"
          data-feed-filter="mine"
          aria-selected="${
            homeFeedFilter === "mine"
          }"
        >
          My posts
        </button>

        <button
          type="button"
          class="btn ${
            homeFeedFilter === "saved"
              ? "btn-primary"
              : "secondary"
          }"
          data-feed-filter="saved"
          aria-selected="${
            homeFeedFilter === "saved"
          }"
        >
          Saved
        </button>
      </div>

      <div
        style="
          position:relative;
        "
      >
        <input
          id="communityFeedSearch"
          type="search"
          value="${escapeHtml(
            homeSearchTerm
          )}"
          placeholder="Search posts..."
          autocomplete="off"
          style="
            width:100%;
            box-sizing:border-box;
          "
        />

        ${
          homeSearchTerm
            ? `
              <button
                type="button"
                class="icon-btn"
                id="clearCommunitySearch"
                aria-label="Clear search"
                style="
                  position:absolute;
                  right:5px;
                  top:50%;
                  transform:translateY(-50%);
                "
              >
                ×
              </button>
            `
            : ""
        }
      </div>

      <div
        id="communitySearchStatus"
        class="small"
        style="
          margin-top:8px;
        "
      ></div>
    </div>
  `;
}

function renderHomePage() {
  const posts =
    getPosts().filter(
      post =>
        post &&
        !isPostExpired(post)
    );

  return `
    <main
      id="homePage"
      class="page"
    >
      ${renderHomeHeader()}

      ${renderComposerPreview()}

      ${renderHomeFeedControls()}

      <section
        id="communityFeed"
      >
        ${
          posts.length
            ? posts
                .map(
                  renderPostCard
                )
                .join("")
            : renderEmptyHomeState()
        }
      </section>

      ${
        homeHasMarketAccount()
          ? `
            <section
              class="card"
              style="
                margin-top:16px;
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
                  <strong>
                    Your marketplace
                  </strong>
                  <div class="small">
                    Manage or browse your listings.
                  </div>
                </div>

                <button
                  type="button"
                  class="btn secondary"
                  data-quick="sell"
                >
                  Open market
                </button>
              </div>
            </section>
          `
          : ""
      }
    </main>
  `;
}

export function renderHome() {
  return renderHomePage();
}

function getHomeFeedContainer() {
  return document.getElementById(
    "communityFeed"
  );
}

function getHomeSearchStatus() {
  return document.getElementById(
    "communitySearchStatus"
  );
}

function matchesHomeFilter(post) {
  if (
    homeFeedFilter ===
    "mine"
  ) {
    return (
      String(post?.uid || "") ===
      String(uid() || "")
    );
  }

  if (
    homeFeedFilter ===
    "saved"
  ) {
    return savedPostIds.has(
      postId(post?.id)
    );
  }

  return true;
}

function matchesHomeSearch(
  post,
  term
) {
  const normalized =
    String(term || "")
      .trim()
      .toLowerCase();

  if (!normalized) {
    return true;
  }

  const searchable = [
    getPostText(post),
    getPostAuthor(post),
    post?.username || "",
    post?.displayName || ""
  ]
    .join(" ")
    .toLowerCase();

  return searchable.includes(
    normalized
  );
}

async function loadSearchPosts() {
  if (
    searchPostsCache
  ) {
    return searchPostsCache;
  }

  if (
    searchPostsLoadPromise
  ) {
    return searchPostsLoadPromise;
  }

  searchPostsLoadPromise =
    (async () => {
      try {
        const postsRef =
          collection(
            db,
            "posts"
          );

        const snapshot =
          await getDocs(
            query(
              postsRef,
              orderBy(
                "createdAt",
                "desc"
              ),
              limit(100)
            )
          );

        searchPostsCache =
          snapshot.docs.map(
            item => ({
              id: item.id,
              ...item.data()
            })
          );

        return searchPostsCache;
      } catch (error) {
        console.warn(
          "Could not load older posts:",
          error
        );

        return [];
      } finally {
        searchPostsLoadPromise =
          null;
      }
    })();

  return searchPostsLoadPromise;
}

async function filterRenderedPosts(
  term = ""
) {
  homeSearchTerm =
    String(term || "").trim();

  const container =
    getHomeFeedContainer();

  const status =
    getHomeSearchStatus();

  if (!container) {
    return;
  }

  let source =
    getPosts().filter(
      post =>
        post &&
        !isPostExpired(post)
    );

  const localMatches =
    source.filter(
      post =>
        matchesHomeFilter(post) &&
        matchesHomeSearch(
          post,
          homeSearchTerm
        )
    );

  /*
   * When searching, fetch the larger history set.
   * This preserves the existing "search older posts too"
   * behavior while making sure every newly rendered card
   * gets its overflow measurement after rendering.
   */
  if (
    homeSearchTerm
  ) {
    const older =
      await loadSearchPosts();

    source = Array.from(
      new Map(
        [
          ...source,
          ...(Array.isArray(older)
            ? older
            : [])
        ].map(
          post => [
            postId(post.id),
            post
          ]
        )
      ).values()
    );
  }

  const matches =
    source
      .filter(
        post =>
          post &&
          !isPostExpired(post)
      )
      .filter(
        post =>
          matchesHomeFilter(
            post
          )
      )
      .filter(
        post =>
          matchesHomeSearch(
            post,
            homeSearchTerm
          )
      );

  /*
   * Preserve the local result if there is no search term.
   */
  const finalMatches =
    homeSearchTerm
      ? matches
      : localMatches;

  container.innerHTML =
    finalMatches.length
      ? finalMatches
          .map(
            renderPostCard
          )
          .join("")
      : `
          <div
            class="card"
            style="
              text-align:center;
              padding:30px 18px;
            "
          >
            <div
              style="
                font-size:32px;
              "
            >
              🔎
            </div>

            <h3
              style="
                margin:8px 0;
              "
            >
              No matching posts
            </h3>

            <p
              class="small"
              style="
                margin:0;
              "
            >
              ${
                homeSearchTerm
                  ? "No matching posts were found across your post history."
                  : "There are no posts in this section yet."
              }
            </p>
          </div>
        `;

  /*
   * CRITICAL FIX:
   * filterRenderedPosts() replaces container.innerHTML.
   * Therefore every replacement creates brand-new hidden
   * Show More buttons. We MUST sync after the replacement.
   */
  schedulePostTextOverflowSync(
    container
  );

  if (status) {
    if (
      homeSearchTerm
    ) {
      status.textContent =
        `${finalMatches.length} matching post${
          finalMatches.length === 1
            ? ""
            : "s"
        } found across your post history.`;
    } else {
      status.textContent =
        "";
    }
  }
}

function closeHomeModal() {
  const modal =
    document.getElementById(
      "homeModal"
    );

  if (modal) {
    modal.remove();
  }

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

  clearPendingHomeImage();
  clearEditPendingImage();
}

function clearPendingHomeImage() {
  pendingHomeImage =
    null;

  if (
    pendingHomeImagePreviewUrl
  ) {
    URL.revokeObjectURL(
      pendingHomeImagePreviewUrl
    );

    pendingHomeImagePreviewUrl =
      "";
  }
}

function clearEditPendingImage() {
  editPendingImage =
    null;
  editRemoveExistingPhoto =
    false;

  if (
    editPendingImagePreviewUrl
  ) {
    URL.revokeObjectURL(
      editPendingImagePreviewUrl
    );

    editPendingImagePreviewUrl =
      "";
  }
}

function markHomeActivity() {
  try {
    localStorage.setItem(
      DISCOVERY_LAST_ACTIVE_KEY,
      String(Date.now())
    );
  } catch {}
}

function getDiscoveryState() {
  try {
    const raw =
      localStorage.getItem(
        DISCOVERY_STORAGE_KEY
      );

    const parsed =
      raw
        ? JSON.parse(raw)
        : null;

    return {
      impressions:
        Number(
          parsed?.impressions
        ) || 0,
      firstSeen:
        Number(
          parsed?.firstSeen
        ) || 0,
      lastShown:
        Number(
          parsed?.lastShown
        ) || 0
    };
  } catch {
    return {
      impressions: 0,
      firstSeen: 0,
      lastShown: 0
    };
  }
}

function saveDiscoveryState(
  value
) {
  try {
    localStorage.setItem(
      DISCOVERY_STORAGE_KEY,
      JSON.stringify(value)
    );
  } catch {}
}

function recordDiscoveryImpression() {
  const now =
    Date.now();

  const current =
    getDiscoveryState();

  const firstSeen =
    current.firstSeen &&
    now -
      current.firstSeen <=
      DISCOVERY_WINDOW_MS
      ? current.firstSeen
      : now;

  const impressions =
    current.firstSeen &&
    now -
      current.firstSeen <=
      DISCOVERY_WINDOW_MS
      ? current.impressions + 1
      : 1;

  saveDiscoveryState({
    impressions,
    firstSeen,
    lastShown: now
  });
}

function startDiscoveryCountdown() {
  stopDiscoveryCountdown();

  const timerElement =
    document.getElementById(
      "discoveryCountdown"
    );

  if (!timerElement) {
    return;
  }

  discoveryStartedAt =
    Date.now();

  const update =
    () => {
      const elapsed =
        Math.floor(
          (
            Date.now() -
            discoveryStartedAt
          ) / 1000
        );

      const remaining =
        Math.max(
          0,
          DISCOVERY_DURATION_SECONDS -
            elapsed
        );

      timerElement.textContent =
        `${remaining}s`;

      if (
        remaining <= 0
      ) {
        stopDiscoveryCountdown();
        dismissDiscovery();
      }
    };

  update();

  discoveryTimer =
    window.setInterval(
      update,
      1000
    );
}

function stopDiscoveryCountdown() {
  if (
    discoveryTimer
  ) {
    clearInterval(
      discoveryTimer
    );

    discoveryTimer =
      null;
  }

  discoveryStartedAt =
    0;
}

function dismissDiscovery() {
  stopDiscoveryCountdown();

  const banner =
    document.getElementById(
      "discoveryBanner"
    );

  banner?.remove();
}

function openDiscoveryDestination(
  destination,
  renderApp
) {
  const map = {
    chat: "chat",
    market: "market",
    skill: "timetrust",
    timetrust: "timetrust"
  };

  const page =
    map[destination];

  if (!page) {
    return;
  }

  closeHomeModal();

  if (
    page === "market"
  ) {
    state.marketBrowseMode =
      false;
  }

  state.page =
    page;

  renderApp?.();
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
              item => item.id
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

async function toggleLike(
  id
) {
  const currentUid =
    uid();

  if (
    !currentUid ||
    pendingLikeIds.has(id)
  ) {
    return;
  }

  const post =
    getPost(id);

  if (!post) {
    return;
  }

  pendingLikeIds.add(id);

  const currentlyLiked =
    Array.isArray(post.likes)
      ? post.likes.includes(
          currentUid
        )
      : !!post.likedByCurrentUser;

  try {
    await updateDoc(
      doc(
        db,
        "posts",
        id
      ),
      {
        likes:
          currentlyLiked
            ? arrayRemove(
                currentUid
              )
            : arrayUnion(
                currentUid
              ),
        likeCount:
          increment(
            currentlyLiked
              ? -1
              : 1
          )
      }
    );

    const localPost =
      getPosts().find(
        item =>
          postId(item.id) ===
          postId(id)
      );

    if (localPost) {
      localPost.likes =
        Array.isArray(
          localPost.likes
        )
          ? localPost.likes
          : [];

      if (
        currentlyLiked
      ) {
        localPost.likes =
          localPost.likes.filter(
            value =>
              value !==
              currentUid
          );
      } else if (
        !localPost.likes.includes(
          currentUid
        )
      ) {
        localPost.likes.push(
          currentUid
        );
      }

      localPost.likeCount =
        Math.max(
          0,
          Number(
            localPost.likeCount
          ) +
            (
              currentlyLiked
                ? -1
                : 1
            )
        );
    }

    await filterRenderedPosts(
      homeSearchTerm
    );
  } catch (error) {
    console.error(
      "Like failed:",
      error
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
  const currentUid =
    uid();

  if (
    !currentUid ||
    pendingSaveIds.has(id)
  ) {
    return;
  }

  pendingSaveIds.add(id);

  const currentlySaved =
    savedPostIds.has(id);

  try {
    const savedRef =
      doc(
        db,
        "users",
        currentUid,
        "savedPosts",
        id
      );

    if (
      currentlySaved
    ) {
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
          postId: id,
          uid: currentUid,
          createdAt:
            serverTimestamp()
        }
      );

      savedPostIds.add(
        id
      );
    }

    await filterRenderedPosts(
      homeSearchTerm
    );
  } catch (error) {
    console.error(
      "Save post failed:",
      error
    );

    toast(
      friendly(error)
    );
  } finally {
    pendingSaveIds.delete(id);
  }
}

async function sharePost(
  id
) {
  const post =
    getPost(id);

  if (!post) {
    return;
  }

  const text =
    getPostText(post);

  const shareData = {
    title:
      getPostAuthor(post),
    text:
      text || "Marvel post"
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

    await navigator.clipboard.writeText(
      text
        ? text
        : "Marvel post"
    );

    toast(
      "Post copied to clipboard."
    );
  } catch (error) {
    if (
      error?.name !==
      "AbortError"
    ) {
      console.warn(
        "Share failed:",
        error
      );
    }
  }
}

async function sharePostImage(
  id
) {
  const post =
    getPost(id);

  const media =
    getPostMedia(post);

  if (!media) {
    toast(
      "This post has no image."
    );

    return;
  }

  try {
    if (
      navigator.share
    ) {
      await navigator.share({
        title:
          getPostAuthor(post),
        text:
          getPostText(post) ||
          "Marvel post",
        url:
          media.url
      });

      return;
    }

    await navigator.clipboard.writeText(
      media.url
    );

    toast(
      "Image link copied."
    );
  } catch (error) {
    if (
      error?.name !==
      "AbortError"
    ) {
      console.warn(
        "Image share failed:",
        error
      );
    }
  }
}

async function showComments(
  id
) {
  const post =
    getPost(id);

  if (!post) {
    return;
  }

  const comments =
    Array.isArray(
      post.comments
    )
      ? post.comments
      : [];

  const commentsHtml =
    comments.length
      ? comments
          .map(
            comment => `
              <div
                style="
                  padding:10px 0;
                  border-bottom:1px solid var(--border,rgba(127,127,127,.18));
                "
              >
                <strong>
                  ${escapeHtml(
                    comment.displayName ||
                    comment.username ||
                    "User"
                  )}
                </strong>

                <div
                  style="
                    margin-top:4px;
                    white-space:pre-wrap;
                    overflow-wrap:anywhere;
                  "
                >
                  ${escapeHtml(
                    comment.text ||
                    ""
                  )}
                </div>
              </div>
            `
          )
          .join("")
      : `
          <div
            class="small"
            style="
              padding:16px 0;
              text-align:center;
            "
          >
            No comments yet.
          </div>
        `;

  showHomeModal(
    `
      <div
        class="card"
        style="
          max-width:620px;
          width:min(620px,calc(100vw - 24px));
          max-height:min(85vh,760px);
          overflow:auto;
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
          <h3
            style="margin:0;"
          >
            Comments
          </h3>

          <button
            type="button"
            class="icon-btn"
            data-modal-close
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div
          style="
            margin-top:12px;
          "
        >
          ${commentsHtml}
        </div>

        <form
          id="homeCommentForm"
          style="
            margin-top:14px;
            display:flex;
            gap:8px;
          "
        >
          <input
            id="homeCommentInput"
            maxlength="1000"
            placeholder="Write a comment..."
            style="
              flex:1;
              min-width:0;
            "
            required
          />

          <button
            type="submit"
            class="btn btn-primary"
          >
            Send
          </button>
        </form>
      </div>
    `,
    {
      onOpen: modal => {
        modal
          .querySelector(
            "#homeCommentForm"
          )
          ?.addEventListener(
            "submit",
            async event => {
              event.preventDefault();

              const input =
                modal.querySelector(
                  "#homeCommentInput"
                );

              const value =
                String(
                  input?.value ||
                  ""
                ).trim();

              if (!value) {
                return;
              }

              try {
                await addDoc(
                  collection(
                    db,
                    "posts",
                    id,
                    "comments"
                  ),
                  {
                    uid:
                      uid(),
                    displayName:
                      currentUserName(),
                    text:
                      value,
                    createdAt:
                      serverTimestamp()
                  }
                );

                toast(
                  "Comment added."
                );

                closeHomeModal();
              } catch (error) {
                console.error(
                  "Comment failed:",
                  error
                );

                toast(
                  friendly(error)
                );
              }
            }
          );
      }
    }
  );
}

function showDeletePostConfirmation(
  id
) {
  showHomeModal(
    `
      <div
        class="card"
        style="
          width:min(440px,calc(100vw - 24px));
        "
      >
        <h3
          style="
            margin-top:0;
          "
        >
          Delete post?
        </h3>

        <p
          class="small"
        >
          This action cannot be undone.
        </p>

        <div
          style="
            display:flex;
            justify-content:flex-end;
            gap:8px;
            margin-top:18px;
          "
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
            class="btn danger"
            id="confirmHomeDelete"
          >
            Delete
          </button>
        </div>
      </div>
    `,
    {
      onOpen: modal => {
        modal
          .querySelector(
            "#confirmHomeDelete"
          )
          ?.addEventListener(
            "click",
            async () => {
              try {
                await deleteDoc(
                  doc(
                    db,
                    "posts",
                    id
                  )
                );

                state.posts =
                  getPosts().filter(
                    post =>
                      postId(
                        post.id
                      ) !==
                      postId(id)
                  );

                searchPostsCache =
                  Array.isArray(
                    searchPostsCache
                  )
                    ? searchPostsCache.filter(
                        post =>
                          postId(
                            post.id
                          ) !==
                          postId(id)
                      )
                    : searchPostsCache;

                closeHomeModal();

                await filterRenderedPosts(
                  homeSearchTerm
                );

                toast(
                  "Post deleted."
                );
              } catch (error) {
                console.error(
                  "Delete post failed:",
                  error
                );

                toast(
                  friendly(error)
                );
              }
            }
          );
      }
    }
  );
}

function showEditPost(
  id
) {
  const post =
    getPost(id);

  if (!post) {
    return;
  }

  const existingMedia =
    getPostMedia(post);

  editRemoveExistingPhoto =
    false;

  showHomeModal(
    `
      <div
        class="card"
        style="
          width:min(620px,calc(100vw - 24px));
          max-height:88vh;
          overflow:auto;
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
          <h3
            style="margin:0;"
          >
            Edit post
          </h3>

          <button
            type="button"
            class="icon-btn"
            data-modal-close
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form
          id="editHomePostForm"
          style="
            margin-top:15px;
          "
        >
          <textarea
            id="editHomePostText"
            maxlength="5000"
            rows="7"
            style="
              width:100%;
              box-sizing:border-box;
              resize:vertical;
            "
          >${escapeHtml(
            getPostText(post)
          )}</textarea>

          ${
            existingMedia
              ? `
                <div
                  id="editExistingMedia"
                  style="
                    margin-top:12px;
                  "
                >
                  <div
                    class="small"
                    style="
                      margin-bottom:6px;
                    "
                  >
                    Current photo
                  </div>

                  <img
                    src="${escapeHtml(
                      existingMedia.url
                    )}"
                    alt="Current post photo"
                    style="
                      display:block;
                      width:100%;
                      max-height:280px;
                      object-fit:cover;
                      border-radius:14px;
                    "
                  />

                  <button
                    type="button"
                    class="btn secondary"
                    id="removeExistingHomePhoto"
                    style="
                      margin-top:8px;
                    "
                  >
                    Remove photo
                  </button>
                </div>
              `
              : ""
          }

          <input
            id="editHomePhotoInput"
            type="file"
            accept="image/*"
            style="
              display:block;
              margin-top:14px;
            "
          />

          <div
            id="editHomePhotoPreview"
            style="
              margin-top:10px;
            "
          ></div>

          <div
            style="
              display:flex;
              justify-content:flex-end;
              gap:8px;
              margin-top:18px;
            "
          >
            <button
              type="button"
              class="btn secondary"
              data-modal-close
            >
              Cancel
            </button>

            <button
              type="submit"
              class="btn btn-primary"
              id="saveEditedHomePost"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    `,
    {
      onOpen: modal => {
        const input =
          modal.querySelector(
            "#editHomePhotoInput"
          );

        const preview =
          modal.querySelector(
            "#editHomePhotoPreview"
          );

        input?.addEventListener(
          "change",
          () => {
            const file =
              input.files?.[0];

            if (!file) {
              clearEditPendingImage();
              if (preview) {
                preview.innerHTML =
                  "";
              }
              return;
            }

            if (
              file.size >
              HOME_MEDIA_MAX_FILE_BYTES
            ) {
              toast(
                "Image is too large. Maximum size is 10 MB."
              );

              input.value =
                "";

              return;
            }

            clearEditPendingImage();

            editPendingImage =
              file;

            editPendingImagePreviewUrl =
              URL.createObjectURL(
                file
              );

            if (preview) {
              preview.innerHTML = `
                <img
                  src="${escapeHtml(
                    editPendingImagePreviewUrl
                  )}"
                  alt="New photo preview"
                  style="
                    display:block;
                    width:100%;
                    max-height:280px;
                    object-fit:cover;
                    border-radius:14px;
                  "
                />
              `;
            }
          }
        );

        modal
          .querySelector(
            "#removeExistingHomePhoto"
          )
          ?.addEventListener(
            "click",
            () => {
              editRemoveExistingPhoto =
                true;

              toast(
                "The existing photo will be removed when you save."
              );
            }
          );

        modal
          .querySelector(
            "#editHomePostForm"
          )
          ?.addEventListener(
            "submit",
            async event => {
              event.preventDefault();

              const text =
                normalizePostText(
                  modal.querySelector(
                    "#editHomePostText"
                  )?.value
                );

              const button =
                modal.querySelector(
                  "#saveEditedHomePost"
                );

              if (
                !text &&
                !existingMedia &&
                !editPendingImage
              ) {
                toast(
                  "Add some text or a photo."
                );

                return;
              }

              if (button) {
                button.disabled =
                  true;
              }

              try {
                let media =
                  existingMedia;

                if (
                  editRemoveExistingPhoto
                ) {
                  media =
                    null;
                }

                if (
                  editPendingImage
                ) {
                  media =
                    await uploadHomeImage(
                      editPendingImage
                    );
                }

                const update = {
                  text,
                  updatedAt:
                    serverTimestamp()
                };

                if (
                  media
                ) {
                  update.media =
                    media;
                } else {
                  update.media =
                    null;
                }

                await updateDoc(
                  doc(
                    db,
                    "posts",
                    id
                  ),
                  update
                );

                const localPost =
                  getPosts().find(
                    item =>
                      postId(
                        item.id
                      ) ===
                      postId(id)
                  );

                if (
                  localPost
                ) {
                  localPost.text =
                    text;
                  localPost.content =
                    text;
                  localPost.media =
                    media;
                  localPost.updatedAt =
                    new Date();
                }

                searchPostsCache =
                  Array.isArray(
                    searchPostsCache
                  )
                    ? searchPostsCache.map(
                        item =>
                          postId(
                            item.id
                          ) ===
                          postId(id)
                            ? {
                                ...item,
                                ...update,
                                text,
                                content:
                                  text,
                                media
                              }
                            : item
                      )
                    : searchPostsCache;

                closeHomeModal();

                await filterRenderedPosts(
                  homeSearchTerm
                );

                toast(
                  "Post updated."
                );
              } catch (error) {
                console.error(
                  "Edit post failed:",
                  error
                );

                toast(
                  friendly(error)
                );
              } finally {
                if (button) {
                  button.disabled =
                    false;
                }
              }
            }
          );
      }
    }
  );
}

function showCreatePost() {
  clearPendingHomeImage();

  const defaultExpiry =
    POST_EXPIRY_OPTIONS[1];

  showHomeModal(
    `
      <div
        class="card"
        style="
          width:min(640px,calc(100vw - 24px));
          max-height:90vh;
          overflow:auto;
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
            <h3
              style="margin:0;"
            >
              Create a post
            </h3>

            <div
              class="small"
              style="
                margin-top:4px;
              "
            >
              Share something with the community.
            </div>
          </div>

          <button
            type="button"
            class="icon-btn"
            data-modal-close
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form
          id="createHomePostForm"
          style="
            margin-top:16px;
          "
        >
          <textarea
            id="homePostText"
            maxlength="5000"
            rows="7"
            placeholder="What's on your mind?"
            style="
              width:100%;
              box-sizing:border-box;
              resize:vertical;
            "
          ></textarea>

          <div
            style="
              margin-top:12px;
            "
          >
            <label
              for="homePostPhoto"
              class="small"
            >
              Add a photo
            </label>

            <input
              id="homePostPhoto"
              type="file"
              accept="image/*"
              style="
                display:block;
                width:100%;
                margin-top:6px;
              "
            />

            <div
              class="small"
              style="
                margin-top:5px;
              "
            >
              Up to 2 Home photo posts per rolling 24 hours.
            </div>

            <div
              id="homePostPhotoPreview"
              style="
                margin-top:10px;
              "
            ></div>
          </div>

          <div
            style="
              margin-top:13px;
            "
          >
            <label
              for="homePostExpiry"
              class="small"
            >
              Post expiry
            </label>

            <select
              id="homePostExpiry"
              style="
                display:block;
                width:100%;
                margin-top:6px;
              "
            >
              ${POST_EXPIRY_OPTIONS.map(
                option => `
                  <option
                    value="${escapeHtml(
                      option.value
                    )}"
                    ${
                      option.value ===
                      defaultExpiry.value
                        ? "selected"
                        : ""
                    }
                  >
                    ${escapeHtml(
                      option.label
                    )}
                  </option>
                `
              ).join("")}
            </select>
          </div>

          <div
            style="
              display:flex;
              justify-content:flex-end;
              gap:8px;
              margin-top:18px;
            "
          >
            <button
              type="button"
              class="btn secondary"
              data-modal-close
            >
              Cancel
            </button>

            <button
              type="submit"
              class="btn btn-primary"
              id="publishHomePost"
            >
              Publish
            </button>
          </div>
        </form>
      </div>
    `,
    {
      onOpen: modal => {
        const fileInput =
          modal.querySelector(
            "#homePostPhoto"
          );

        const preview =
          modal.querySelector(
            "#homePostPhotoPreview"
          );

        fileInput?.addEventListener(
          "change",
          () => {
            const file =
              fileInput.files?.[0];

            clearPendingHomeImage();

            if (!file) {
              if (preview) {
                preview.innerHTML =
                  "";
              }

              return;
            }

            if (
              file.size >
              HOME_MEDIA_MAX_FILE_BYTES
            ) {
              toast(
                "Image is too large. Maximum size is 10 MB."
              );

              fileInput.value =
                "";

              return;
            }

            pendingHomeImage =
              file;

            pendingHomeImagePreviewUrl =
              URL.createObjectURL(
                file
              );

            if (preview) {
              preview.innerHTML = `
                <img
                  src="${escapeHtml(
                    pendingHomeImagePreviewUrl
                  )}"
                  alt="Photo preview"
                  style="
                    display:block;
                    width:100%;
                    max-height:300px;
                    object-fit:cover;
                    border-radius:14px;
                  "
                />
              `;
            }
          }
        );

        modal
          .querySelector(
            "#createHomePostForm"
          )
          ?.addEventListener(
            "submit",
            async event => {
              event.preventDefault();

              const text =
                normalizePostText(
                  modal.querySelector(
                    "#homePostText"
                  )?.value
                );

              const button =
                modal.querySelector(
                  "#publishHomePost"
                );

              if (
                !text &&
                !pendingHomeImage
              ) {
                toast(
                  "Write something or add a photo."
                );

                return;
              }

              if (button) {
                button.disabled =
                  true;
                button.textContent =
                  "Publishing...";
              }

              try {
                await createHomePost({
                  text,
                  image:
                    pendingHomeImage,
                  expiry:
                    modal.querySelector(
                      "#homePostExpiry"
                    )?.value ||
                    "1d"
                });

                closeHomeModal();

                toast(
                  "Post published."
                );
              } catch (error) {
                console.error(
                  "Create post failed:",
                  error
                );

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
    }
  );
}

async function uploadHomeImage(
  file
) {
  if (!file) {
    return null;
  }

  if (
    file.size >
    HOME_MEDIA_MAX_FILE_BYTES
  ) {
    throw new Error(
      "Image is larger than the 10 MB limit."
    );
  }

  const prepared =
    await prepareHomeImage(
      file
    );

  const form =
    new FormData();

  form.append(
    "file",
    prepared
  );

  form.append(
    "upload_preset",
    CLOUDINARY_UPLOAD_PRESET
  );

  const response =
    await fetch(
      CLOUDINARY_UPLOAD_URL,
      {
        method: "POST",
        body: form
      }
    );

  if (!response.ok) {
    throw new Error(
      "Image upload failed."
    );
  }

  const result =
    await response.json();

  const secureUrl =
    safeMediaUrl(
      result.secure_url ||
      result.url
    );

  if (!secureUrl) {
    throw new Error(
      "Cloudinary did not return a valid image URL."
    );
  }

  return {
    type: "image",
    url: secureUrl,
    secure_url:
      secureUrl,
    public_id:
      result.public_id || "",
    width:
      Number(
        result.width
      ) || null,
    height:
      Number(
        result.height
      ) || null,
    bytes:
      Number(
        result.bytes
      ) || null,
    format:
      result.format || null
  };
}

async function prepareHomeImage(
  file
) {
  if (
    typeof createImageBitmap !==
      "function"
  ) {
    return file;
  }

  if (
    typeof OffscreenCanvas ===
      "undefined"
  ) {
    return file;
  }

  try {
    const bitmap =
      await createImageBitmap(
        file
      );

    const scale =
      Math.min(
        1,
        HOME_MEDIA_MAX_DIMENSION /
          Math.max(
            bitmap.width,
            bitmap.height
          )
      );

    const width =
      Math.max(
        1,
        Math.round(
          bitmap.width *
            scale
        )
      );

    const height =
      Math.max(
        1,
        Math.round(
          bitmap.height *
            scale
        )
      );

    const canvas =
      new OffscreenCanvas(
        width,
        height
      );

    const context =
      canvas.getContext(
        "2d"
      );

    if (!context) {
      bitmap.close?.();
      return file;
    }

    context.drawImage(
      bitmap,
      0,
      0,
      width,
      height
    );

    bitmap.close?.();

    const blob =
      await canvas.convertToBlob({
        type:
          "image/jpeg",
        quality:
          0.82
      });

    if (
      blob.size >
      HOME_MEDIA_MAX_OUTPUT_BYTES
    ) {
      const smallerCanvas =
        new OffscreenCanvas(
          Math.max(
            1,
            Math.round(
              width * 0.8
            )
          ),
          Math.max(
            1,
            Math.round(
              height * 0.8
            )
          )
        );

      const smallerContext =
        smallerCanvas.getContext(
          "2d"
        );

      smallerContext.drawImage(
        canvas,
        0,
        0,
        smallerCanvas.width,
        smallerCanvas.height
      );

      return smallerCanvas.convertToBlob({
        type:
          "image/jpeg",
        quality:
          0.72
      });
    }

    return blob;
  } catch {
    return file;
  }
}

function expiryDateFromValue(
  value
) {
  const option =
    POST_EXPIRY_OPTIONS.find(
      item =>
        item.value ===
        value
    ) ||
    POST_EXPIRY_OPTIONS[1];

  return new Date(
    Date.now() +
      option.milliseconds
  );
}

async function createHomePost({
  text,
  image,
  expiry
}) {
  const currentUid =
    uid();

  if (!currentUid) {
    throw new Error(
      "You must be signed in to create a post."
    );
  }

  /*
   * Cloudinary upload happens before the Firestore
   * transaction because Firestore cannot roll back a
   * Cloudinary upload.
   *
   * The important security boundary is still Firestore:
   * the post write and the user's mediaUsage update must
   * occur atomically.
   */
  let media = null;

  if (image) {
    media =
      await uploadHomeImage(
        image
      );
  }

  const postRef =
    doc(
      collection(
        db,
        "posts"
      )
    );

  const usageRef =
    doc(
      db,
      "users",
      currentUid,
      "mediaUsage",
      "home"
    );

  const expiresAt =
    expiryDateFromValue(
      expiry
    );

  const nowMs =
    Date.now();

  await runTransaction(
    db,
    async transaction => {
      const usageSnap =
        await transaction.get(
          usageRef
        );

      const usageData =
        usageSnap.exists()
          ? usageSnap.data()
          : {};

      const timestamps =
        Array.isArray(
          usageData.photoTimestamps
        )
          ? usageData.photoTimestamps
              .map(
                value => {
                  if (
                    typeof value ===
                    "number"
                  ) {
                    return value;
                  }

                  if (
                    typeof value?.toMillis ===
                    "function"
                  ) {
                    return value.toMillis();
                  }

                  if (
                    typeof value?.seconds ===
                    "number"
                  ) {
                    return (
                      value.seconds *
                      1000
                    );
                  }

                  return Number(
                    value
                  ) || 0;
                }
              )
              .filter(
                value =>
                  value >
                  nowMs -
                    HOME_MEDIA_WINDOW_MS
              )
          : [];

      /*
       * Text-only Home posts do not consume the photo quota.
       */
      if (media) {
        if (
          timestamps.length >=
          homePhotoLimit()
        ) {
          const oldest =
            Math.min(
              ...timestamps
            );

          throw new Error(
            `Home photo limit reached. ${homePhotoRetryText(
              oldest
            )}`
          );
        }

        timestamps.push(
          nowMs
        );
      }

      const postData = {
        uid:
          currentUid,
        displayName:
          currentUserName(),
        text:
          text || "",
        content:
          text || "",
        media:
          media || null,
        createdAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp(),
        expiresAt:
          Timestamp.fromDate(
            expiresAt
          ),
        likeCount:
          0,
        commentCount:
          0,
        likes:
          []
      };

      /*
       * When there is no media, we don't consume a quota
       * slot. When there is media, both writes are part of
       * the same transaction.
       */
      if (media) {
        transaction.set(
          usageRef,
          {
            photoTimestamps:
              timestamps,
            updatedAt:
              serverTimestamp()
          },
          {
            merge: true
          }
        );
      }

      transaction.set(
        postRef,
        postData
      );
    }
  );

  /*
   * LocalStorage is updated only after Firestore accepts
   * the transaction. It is not used for authorization.
   */
  if (media) {
    recordLocalHomePhotoUse(
      nowMs
    );
  }

  const optimisticPost = {
    id:
      postRef.id,
    uid:
      currentUid,
    displayName:
      currentUserName(),
    text:
      text || "",
    content:
      text || "",
    media:
      media || null,
    createdAt:
      new Date(),
    updatedAt:
      new Date(),
    expiresAt,
    likeCount:
      0,
    commentCount:
      0,
    likes:
      []
  };

  state.posts = [
    optimisticPost,
    ...getPosts()
  ];

  searchPostsCache =
    Array.isArray(
      searchPostsCache
    )
      ? [
          optimisticPost,
          ...searchPostsCache.filter(
            item =>
              postId(
                item.id
              ) !==
              postId(
                optimisticPost.id
              )
          )
        ]
      : searchPostsCache;

  await filterRenderedPosts(
    homeSearchTerm
  );
}

function showHomeModal(
  content,
  options = {}
) {
  closeHomeModal();

  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    "homeModal";

  modal.innerHTML = `
    <div
      class="home-modal-backdrop"
      style="
        position:fixed;
        inset:0;
        z-index:9999;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:12px;
        background:rgba(0,0,0,.55);
        overflow:auto;
      "
    >
      ${content}
    </div>
  `;

  document.body.appendChild(
    modal
  );

  const backdrop =
    modal.querySelector(
      ".home-modal-backdrop"
    );

  backdrop?.addEventListener(
    "click",
    event => {
      if (
        event.target ===
        backdrop
      ) {
        closeHomeModal();
      }
    }
  );

  modal
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

  options.onOpen?.(
    modal
  );
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
        event.target?.closest?.(
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

  /*
   * Initial sync is kept, but it is no longer the only sync.
   * The critical post-render sync happens after every feed
   * replacement through schedulePostTextOverflowSync().
   */
  syncPostTextOverflow(
    homePage
  );

  observeHomePostOverflow(
    homePage
  );

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
          toggleLike(
            id
          );
        } else if (
          action ===
          "save"
        ) {
          savePost(
            id
          );
        } else if (
          action ===
          "share"
        ) {
          sharePost(
            id
          );
        } else if (
          action ===
          "share-image"
        ) {
          sharePostImage(
            id
          );
        } else if (
          action ===
          "comment"
        ) {
          showComments(
            id
          );
        } else if (
          action ===
          "edit"
        ) {
          showEditPost(
            id
          );
        } else if (
          action ===
          "delete"
        ) {
          showDeletePostConfirmation(
            id
          );
        } else if (
          action ===
          "toggle-text"
        ) {
          toggleHomePostText(
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
          feedFilter.dataset
            .feedFilter ||
          "all";

        document
          .querySelectorAll(
            "#homePage [data-feed-filter]"
          )
          .forEach(
            button => {
              const active =
                button.dataset
                  .feedFilter ===
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
          "#openComposerPreview,#openComposerButton,#emptyCreatePost"
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

  /*
   * Initial render also goes through the same code path
   * that fixes the Show More/Show Less lifecycle.
   */
  filterRenderedPosts(
    homeSearchTerm
  );

  schedulePostTextOverflowSync(
    homePage
  );

  markHomeActivity();
}
