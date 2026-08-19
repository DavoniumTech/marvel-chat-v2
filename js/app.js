import {
  state,
  countries,
  applyTheme,
  escapeHtml,
  initials,
  friendly
} from "./state.js";

import {
  auth,
  loadProfile,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "./firebase/auth.js";

import {
  db,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp
} from "./firebase/firestore.js";

import {
  subscribeAll
} from "./firebase/listeners.js";

import {
  renderHome,
  showCreatePost,
  showEditPost,
  showDeletePostConfirmation,
  toggleLike,
  savePost,
  sharePost,
  showComments
} from "./features /home.js";

import {
  renderChat,
  showNewChat,
  sendMessage,
  openConversation,
  editMessage,
  deleteMessage,
  copyMessage,
  togglePinConversation
} from "./features /chat.js";

import {
  renderMarket,
  showSellModal,
  attachMarketEvents
} from "./features /market.js";

import {
  renderProfile,
  showEditProfile,
  showSaved
} from "./features /profile.js";

import {
  showNotifications
} from "./features /notifications.js";

import {
  showSearch
} from "./features /search.js";

import {
  showSettings
} from "./features /settings.js";

import {
  renderTimeTrust,
  showSkillModal,
  attachTimeTrustEvents
} from "./features /timetrust.js";

import {
  toast
} from "./components/toast.js";


const root =
  document.getElementById(
    "root"
  );


export function renderApp() {
  applyTheme();

  if (!state.user) {
    renderAuth();
    return;
  }

  if (!state.profile?.country) {
    renderOnboarding();
    return;
  }

  const pages = {
    home: () =>
      renderHome(
        renderApp
      ),

    chat: () =>
      renderChat(
        renderApp
      ),

    timetrust: () =>
      renderTimeTrust(
        renderApp
      ),

    market: () =>
      renderMarket(
        renderApp
      ),

    profile: () =>
      renderProfile()
  };

  const fn =
    pages[state.page] ||
    pages.home;

  root.innerHTML = `
    <div class="app">
      <header class="topbar">

        <div class="brand">
          <div class="brand-logo">
            M
          </div>

          <div>
            <div class="brand-name">
              Marvel Chat
            </div>

            <div class="brand-sub">
              FUTURE COMMUNITY
            </div>
          </div>
        </div>

        <div class="top-actions">

          <button
            class="icon-btn"
            id="searchBtn"
            title="Search"
          >
            ⌕
          </button>

          <button
            class="icon-btn"
            id="notificationBtn"
            title="Notifications"
            style="position:relative;"
          >
            🔔

            <span
              id="notificationBadge"
              style="
                position:absolute;
                top:4px;
                right:4px;
                background:var(--danger);
                color:#fff;
                font-size:10px;
                font-weight:bold;
                padding:2px 5px;
                border-radius:999px;
                display:${
                  state.unreadNotificationsCount > 0
                    ? "inline-block"
                    : "none"
                };
              "
            >
              ${
                state.unreadNotificationsCount > 0
                  ? state.unreadNotificationsCount
                  : ""
              }
            </span>
          </button>

          <button
            class="icon-btn"
            id="themeBtn"
            title="Theme"
          >
            ${
              state.theme === "dark"
                ? "☀️"
                : "🌙"
            }
          </button>

        </div>
      </header>

      <main class="main">
        ${fn()}
      </main>

      <nav class="bottom-nav">
        <div class="bottom-inner">

          ${navButton(
            "home",
            "⌂",
            "Home"
          )}

          ${navButton(
            "chat",
            "💬",
            "Chat"
          )}

          ${navButton(
            "timetrust",
            "⏱",
            "TimeTrust"
          )}

          ${navButton(
            "market",
            "🛍",
            "Market"
          )}

          ${navButton(
            "profile",
            "◉",
            "Profile"
          )}

        </div>
      </nav>
    </div>
  `;


  document
    .getElementById(
      "searchBtn"
    )
    ?.addEventListener(
      "click",
      showSearch
    );


  document
    .getElementById(
      "notificationBtn"
    )
    ?.addEventListener(
      "click",
      showNotifications
    );


  document
    .getElementById(
      "themeBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        state.theme =
          state.theme === "dark"
            ? "light"
            : "dark";

        localStorage.setItem(
          "marvel_theme",
          state.theme
        );

        renderApp();
      }
    );


  document
    .querySelectorAll(
      "[data-nav]"
    )
    .forEach(
      btn => {

        btn.addEventListener(
          "click",
          () => {

            state.page =
              btn.dataset.nav;

            if (
              state.page !== "chat" &&
              state.activeConversation
            ) {

              state.unsubs.messages?.();

              state.unsubs.messages =
                null;

              state.activeConversation =
                null;

              state.messages =
                [];
            }

            renderApp();
          }
        );
      }
    );


  attachEvents();
}


function navButton(
  page,
  icon,
  label
) {
  return `
    <button
      class="nav-btn ${
        state.page === page
          ? "active"
          : ""
      }"
      data-nav="${page}"
    >
      <span class="nav-icon">
        ${icon}
      </span>

      <span>
        ${label}
      </span>
    </button>
  `;
}


/* =========================================================
   AUTHENTICATION PAGE
   ========================================================= */

function renderAuth() {
  applyTheme();

  root.innerHTML = `
    <div class="auth-shell">

      <div class="auth-card">

        <div class="auth-logo">
          M
        </div>

        <h1>
          Marvel Chat
        </h1>

        <p>
          A futuristic community for people to connect, chat,
          exchange skills and discover opportunities.
        </p>

        <div id="authMessage"></div>

        <div class="segmented">

          <button
            class="btn btn-primary"
            id="loginTab"
            type="button"
          >
            Sign in
          </button>

          <button
            class="btn btn-ghost"
            id="signupTab"
            type="button"
          >
            Create account
          </button>

        </div>

        <form id="authForm">

          <div class="field">

            <label for="authEmail">
              Email
            </label>

            <input
              class="input"
              id="authEmail"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              required
            >

          </div>

          <div class="field">

            <label for="authPassword">
              Password
            </label>

            <div style="position:relative;">

              <input
                class="input"
                id="authPassword"
                type="password"
                autocomplete="current-password"
                placeholder="Your password"
                minlength="6"
                required
                style="padding-right:52px;"
              >

              <button
                type="button"
                id="togglePassword"
                aria-label="Show password"
                title="Show password"
                style="
                  position:absolute;
                  right:8px;
                  top:50%;
                  transform:translateY(-50%);
                  width:38px;
                  height:38px;
                  border:0;
                  border-radius:11px;
                  background:transparent;
                  color:var(--muted);
                  cursor:pointer;
                  display:grid;
                  place-items:center;
                  font-size:18px;
                "
              >
                👁️
              </button>

            </div>
          </div>

          <div
            id="signupFields"
            class="hidden"
          >

            <div class="field">

              <label for="authUsername">
                Username
              </label>

              <input
                class="input"
                id="authUsername"
                placeholder="Choose a username"
                autocomplete="username"
              >

            </div>

            <div class="field">

              <label for="authDisplayName">
                Display name
              </label>

              <input
                class="input"
                id="authDisplayName"
                placeholder="Your name"
                autocomplete="name"
              >

            </div>

          </div>

          <button
            class="btn btn-primary btn-block"
            id="authSubmit"
            type="submit"
          >
            Sign in
          </button>

        </form>

        <div
          class="notice"
          style="margin-top:15px"
        >
          🚀 Your account is powered by Firebase Authentication.
        </div>

        <!-- LEGAL / INFORMATION LINKS -->
        <div
          style="
            margin-top:18px;
            text-align:center;
            font-size:12px;
            line-height:1.6;
            color:var(--muted);
          "
        >
          <button
            type="button"
            id="privacyLink"
            style="
              border:0;
              background:transparent;
              color:var(--muted);
              cursor:pointer;
              padding:2px 4px;
              font:inherit;
              text-decoration:underline;
            "
          >
            Privacy
          </button>

          <span>•</span>

          <button
            type="button"
            id="termsLink"
            style="
              border:0;
              background:transparent;
              color:var(--muted);
              cursor:pointer;
              padding:2px 4px;
              font:inherit;
              text-decoration:underline;
            "
          >
            Terms
          </button>

          <span>•</span>

          <button
            type="button"
            id="contactLink"
            style="
              border:0;
              background:transparent;
              color:var(--muted);
              cursor:pointer;
              padding:2px 4px;
              font:inherit;
              text-decoration:underline;
            "
          >
            Contact
          </button>
        </div>

        <div
          style="
            margin-top:8px;
            text-align:center;
            font-size:11px;
            color:var(--muted);
          "
        >
          © ${new Date().getFullYear()} Davonium Technologies.
          All rights reserved.
        </div>

      </div>
    </div>
  `;


  let signup =
    false;


  const loginTab =
    document.getElementById(
      "loginTab"
    );

  const signupTab =
    document.getElementById(
      "signupTab"
    );

  const signupFields =
    document.getElementById(
      "signupFields"
    );

  const submit =
    document.getElementById(
      "authSubmit"
    );

  const passwordInput =
    document.getElementById(
      "authPassword"
    );

  const togglePassword =
    document.getElementById(
      "togglePassword"
    );


  togglePassword?.addEventListener(
    "click",
    () => {

      const isHidden =
        passwordInput.type ===
        "password";

      passwordInput.type =
        isHidden
          ? "text"
          : "password";

      togglePassword.textContent =
        isHidden
          ? "🙈"
          : "👁️";

      togglePassword.setAttribute(
        "aria-label",
        isHidden
          ? "Hide password"
          : "Show password"
      );

      togglePassword.setAttribute(
        "title",
        isHidden
          ? "Hide password"
          : "Show password"
      );
    }
  );


  function setMode(v) {

    signup = v;

    loginTab.className =
      v
        ? "btn btn-ghost"
        : "btn btn-primary";

    signupTab.className =
      v
        ? "btn btn-primary"
        : "btn btn-ghost";

    signupFields.classList.toggle(
      "hidden",
      !v
    );

    submit.textContent =
      v
        ? "Create account"
        : "Sign in";

    passwordInput.autocomplete =
      v
        ? "new-password"
        : "current-password";
  }


  loginTab.addEventListener(
    "click",
    () =>
      setMode(false)
  );

  signupTab.addEventListener(
    "click",
    () =>
      setMode(true)
  );


  /* =======================================================
     LEGAL / INFORMATION PAGE EVENTS
     ======================================================= */

  document
    .getElementById(
      "privacyLink"
    )
    ?.addEventListener(
      "click",
      () =>
        renderLegalPage(
          "privacy"
        )
    );


  document
    .getElementById(
      "termsLink"
    )
    ?.addEventListener(
      "click",
      () =>
        renderLegalPage(
          "terms"
        )
    );


  document
    .getElementById(
      "contactLink"
    )
    ?.addEventListener(
      "click",
      () =>
        renderLegalPage(
          "contact"
        )
    );


  document.getElementById(
    "authForm"
  ).onsubmit = async e => {

    e.preventDefault();

    const email =
      document
        .getElementById(
          "authEmail"
        )
        .value
        .trim();

    const password =
      passwordInput.value;

    const message =
      document.getElementById(
        "authMessage"
      );

    message.innerHTML =
      "";

    submit.disabled =
      true;

    submit.textContent =
      "Connecting…";


    try {

      if (signup) {

        const username =
          document
            .getElementById(
              "authUsername"
            )
            .value
            .trim();

        const displayName =
          document
            .getElementById(
              "authDisplayName"
            )
            .value
            .trim();

        if (!username) {
          throw new Error(
            "Username is required."
          );
        }


        const {
          createUserWithEmailAndPassword
        } =
          await import(
            "./firebase/auth.js"
          );


        const cred =
          await createUserWithEmailAndPassword(
            auth,
            email,
            password
          );


        await updateProfile(
          cred.user,
          {
            displayName:
              displayName ||
              username
          }
        );


        await setDoc(
          doc(
            db,
            "users",
            cred.user.uid
          ),
          {
            uid:
              cred.user.uid,

            displayName:
              displayName ||
              username,

            username,

            email,

            country:
              "",

            bio:
              "",

            createdAt:
              serverTimestamp()
          },
          {
            merge: true
          }
        );


        toast(
          "Account created successfully 🚀"
        );

      } else {

        const {
          signInWithEmailAndPassword
        } =
          await import(
            "./firebase/auth.js"
          );


        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );


        toast(
          "Welcome back 👋"
        );
      }

    } catch (err) {

      message.innerHTML =
        `<div class="status error">${escapeHtml(
          friendly(err)
        )}</div>`;

    } finally {

      submit.disabled =
        false;

      submit.textContent =
        signup
          ? "Create account"
          : "Sign in";
    }
  };
}


/* =========================================================
   LEGAL / INFORMATION PAGE
   ========================================================= */

function renderLegalPage(
  section = "privacy"
) {

  applyTheme();

  const content = {

    privacy: {
      title:
        "Privacy Policy",

      icon:
        "🔐",

      body: `
        <h2>Your Privacy Matters</h2>

        <p>
          Marvel Chat is designed to provide a community
          experience while respecting the privacy of its users.
        </p>

        <h3>Information We Collect</h3>

        <p>
          When you create an account, Marvel Chat may store
          information that you provide, such as your email
          address, username, display name, country and profile
          information.
        </p>

        <h3>How Information Is Used</h3>

        <p>
          Information associated with your account is used to
          operate the Marvel Chat service, provide community
          features, maintain your profile and improve the
          experience.
        </p>

        <h3>Firebase Services</h3>

        <p>
          Marvel Chat uses Firebase services for authentication
          and application data. Information necessary for these
          services may be processed through the relevant Firebase
          infrastructure.
        </p>

        <h3>Your Responsibility</h3>

        <p>
          Do not share passwords, private credentials or other
          sensitive information publicly through the community.
        </p>

        <h3>Policy Updates</h3>

        <p>
          This privacy information may be updated as Marvel Chat
          develops. Important changes should be reflected on this
          page.
        </p>
      `
    },

    terms: {
      title:
        "Terms of Use",

      icon:
        "📜",

      body: `
        <h2>Using Marvel Chat</h2>

        <p>
          By using Marvel Chat, you agree to use the service
          responsibly and respectfully.
        </p>

        <h3>Community Conduct</h3>

        <p>
          Users should not use Marvel Chat to harass, threaten,
          deceive, impersonate or intentionally harm other users.
        </p>

        <h3>Your Account</h3>

        <p>
          You are responsible for maintaining the security of
          your account and for activity performed through your
          account.
        </p>

        <h3>Content</h3>

        <p>
          Users are responsible for content they create,
          publish, send or otherwise share through Marvel Chat.
        </p>

        <h3>Service Changes</h3>

        <p>
          Marvel Chat may be improved, changed, expanded or
          temporarily unavailable as development and maintenance
          take place.
        </p>

        <h3>Responsible Use</h3>

        <p>
          Use Marvel Chat in accordance with applicable laws and
          respect the rights and privacy of other members of the
          community.
        </p>
      `
    },

    contact: {
      title:
        "Contact & About",

      icon:
        "📬",

      body: `
        <h2>About Marvel Chat</h2>

        <p>
          Marvel Chat is a community platform created to help
          people connect, communicate, exchange skills and
          discover opportunities.
        </p>

        <h3>Built By</h3>

        <p>
          <strong>Davonium Technologies</strong>
        </p>

        <p>
          Marvel Chat is an independent product and platform
          developed under Davonium Technologies.
        </p>

        <h3>Contact</h3>

        <p>
          For questions, feedback, partnership discussions,
          support requests or other enquiries, contact the
          Marvel Chat team through the official contact channel
          provided by Davonium Technologies.
        </p>

        <p>
          Your official contact email or support address can be
          added to this section when you are ready.
        </p>

        <h3>Copyright</h3>

        <p>
          © ${new Date().getFullYear()}
          Davonium Technologies.
          All rights reserved.
        </p>

        <p>
          Marvel Chat, its branding, interface, original
          application code and original product materials are
          associated with Davonium Technologies, subject to
          applicable rights and ownership.
        </p>
      `
    }

  };


  const active =
    content[section] ||
    content.privacy;


  root.innerHTML = `
    <div class="auth-shell">

      <div
        class="auth-card"
        style="
          max-width:720px;
          text-align:left;
        "
      >

        <div
          style="
            text-align:center;
            margin-bottom:20px;
          "
        >

          <div class="auth-logo">
            ${active.icon}
          </div>

          <h1>
            ${escapeHtml(
              active.title
            )}
          </h1>

          <p>
            Marvel Chat • Davonium Technologies
          </p>

        </div>


        <div
          class="notice"
          style="
            line-height:1.75;
            margin-bottom:18px;
          "
        >

          ${active.body}

        </div>


        <div
          style="
            display:flex;
            gap:8px;
            flex-wrap:wrap;
            margin-bottom:18px;
          "
        >

          <button
            class="btn ${
              section === "privacy"
                ? "btn-primary"
                : "btn-ghost"
            }"
            id="legalPrivacy"
            type="button"
          >
            🔐 Privacy
          </button>

          <button
            class="btn ${
              section === "terms"
                ? "btn-primary"
                : "btn-ghost"
            }"
            id="legalTerms"
            type="button"
          >
            📜 Terms
          </button>

          <button
            class="btn ${
              section === "contact"
                ? "btn-primary"
                : "btn-ghost"
            }"
            id="legalContact"
            type="button"
          >
            📬 Contact
          </button>

        </div>


        <button
          class="btn btn-primary btn-block"
          id="backToAuth"
          type="button"
        >
          ← Back to Sign in
        </button>


        <div
          style="
            text-align:center;
            margin-top:15px;
            font-size:11px;
            color:var(--muted);
          "
        >
          © ${new Date().getFullYear()}
          Davonium Technologies.
          All rights reserved.
        </div>

      </div>

    </div>
  `;


  document
    .getElementById(
      "legalPrivacy"
    )
    ?.addEventListener(
      "click",
      () =>
        renderLegalPage(
          "privacy"
        )
    );


  document
    .getElementById(
      "legalTerms"
    )
    ?.addEventListener(
      "click",
      () =>
        renderLegalPage(
          "terms"
        )
    );


  document
    .getElementById(
      "legalContact"
    )
    ?.addEventListener(
      "click",
      () =>
        renderLegalPage(
          "contact"
        )
    );


  document
    .getElementById(
      "backToAuth"
    )
    ?.addEventListener(
      "click",
      () =>
        renderAuth()
    );
}


function renderOnboarding() {

  root.innerHTML = `
    <div class="auth-shell">

      <div class="auth-card">

        <div class="auth-logo">
          🌍
        </div>

        <h1>
          Welcome to Marvel Chat
        </h1>

        <p>
          One last thing before entering the community:
          choose your country.
        </p>

        <div class="country-grid">

          ${countries
            .map(
              c => `
                <button
                  class="country-option"
                  data-country="${c[0]}"
                >
                  ${escapeHtml(
                    c[1]
                  )}
                </button>
              `
            )
            .join("")}

        </div>

        <div
          id="selectedCountry"
          class="status info"
          style="margin-top:14px"
        >
          Choose one country.
        </div>

        <button
          class="btn btn-primary btn-block"
          id="continueCountry"
          disabled
        >
          Enter Marvel Chat 🚀
        </button>

        <button
          class="btn btn-ghost btn-block"
          style="margin-top:8px"
          id="onboardingLogout"
        >
          Sign out
        </button>

      </div>
    </div>
  `;


  let selected =
    "";


  document
    .querySelectorAll(
      "[data-country]"
    )
    .forEach(
      btn => {

        btn.addEventListener(
          "click",
          () => {

            selected =
              btn.dataset.country;

            document
              .querySelectorAll(
                "[data-country]"
              )
              .forEach(
                x =>
                  x.classList.remove(
                    "selected"
                  )
              );

            btn.classList.add(
              "selected"
            );

            const label =
              countries.find(
                x =>
                  x[0] ===
                  selected
              )?.[1] ||
              selected;

            document.getElementById(
              "selectedCountry"
            ).textContent =
              `Selected: ${label}`;

            document.getElementById(
              "continueCountry"
            ).disabled =
              false;
          }
        );
      }
    );


  document
    .getElementById(
      "continueCountry"
    )
    .addEventListener(
      "click",
      async () => {

        if (!selected)
          return;

        try {

          await updateDoc(
            doc(
              db,
              "users",
              state.user.uid
            ),
            {
              country:
                selected
            }
          );

          state.profile.country =
            selected;

          toast(
            "Welcome to the community 🌍"
          );

          renderApp();

        } catch (e) {

          toast(
            friendly(e)
          );
        }
      }
    );


  document
    .getElementById(
      "onboardingLogout"
    )
    .addEventListener(
      "click",
      () =>
        signOut()
    );
}


function attachEvents() {

  if (
    state.page ===
    "home"
  ) {

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
        "[data-like]"
      )
      .forEach(
        b =>
          b.addEventListener(
            "click",
            () =>
              toggleLike(
                b.dataset.like
              )
          )
      );


    document
      .querySelectorAll(
        "[data-comment]"
      )
      .forEach(
        b =>
          b.addEventListener(
            "click",
            () =>
              showComments(
                b.dataset.comment
              )
          )
      );


    document
      .querySelectorAll(
        "[data-share]"
      )
      .forEach(
        b =>
          b.addEventListener(
            "click",
            () =>
              sharePost(
                b.dataset.share
              )
          )
      );


    document
      .querySelectorAll(
        "[data-save]"
      )
      .forEach(
        b =>
          b.addEventListener(
            "click",
            () =>
              savePost(
                b.dataset.save
              )
          )
      );


    document
      .querySelectorAll(
        ".post-menu-btn"
      )
      .forEach(
        btn => {

          btn.addEventListener(
            "click",
            e => {

              e.stopPropagation();

              const postId =
                btn.dataset.menuPost;

              const menu =
                document.getElementById(
                  `postMenu-${postId}`
                );

              if (menu) {

                document
                  .querySelectorAll(
                    ".dropdown-menu"
                  )
                  .forEach(
                    m => {

                      if (
                        m !==
                        menu
                      ) {
                        m.classList.add(
                          "hidden"
                        );
                      }
                    }
                  );

                menu.classList.toggle(
                  "hidden"
                );
              }
            }
          );
        }
      );


    document
      .querySelectorAll(
        "[data-edit-post]"
      )
      .forEach(
        btn => {

          btn.addEventListener(
            "click",
            () =>
              showEditPost(
                btn.dataset.editPost
              )
          );
        }
      );


    document
      .querySelectorAll(
        "[data-delete-post]"
      )
      .forEach(
        btn => {

          btn.addEventListener(
            "click",
            () =>
              showDeletePostConfirmation(
                btn.dataset.deletePost
              )
          );
        }
      );


    document
      .querySelectorAll(
        "[data-quick]"
      )
      .forEach(
        b => {

          b.addEventListener(
            "click",
            () => {

              const a =
                b.dataset.quick;


              if (
                a ===
                "post"
              ) {
                showCreatePost();
              }


              if (
                a ===
                "chat"
              ) {

                state.page =
                  "chat";

                renderApp();

                setTimeout(
                  showNewChat,
                  50
                );
              }


              if (
                a ===
                "skill"
              ) {
                showSkillModal(
                  "offer"
                );
              }


              if (
                a ===
                "sell"
              ) {
                showSellModal();
              }
            }
          );
        }
      );
  }


  if (
    state.page ===
    "chat"
  ) {

    if (
      state.activeConversation
    ) {

      document
        .getElementById(
          "backChats"
        )
        ?.addEventListener(
          "click",
          () => {

            state.unsubs.messages?.();

            state.unsubs.messages =
              null;

            state.activeConversation =
              null;

            state.messages =
              [];

            renderApp();
          }
        );


      document
        .getElementById(
          "sendMessage"
        )
        ?.addEventListener(
          "click",
          sendMessage
        );


      document
        .getElementById(
          "messageInput"
        )
        ?.addEventListener(
          "keydown",
          e => {

            if (
              e.key ===
              "Enter"
            ) {

              e.preventDefault();

              sendMessage();
            }
          }
        );


      document
        .querySelectorAll(
          "[data-copy-msg]"
        )
        .forEach(
          btn =>
            btn.addEventListener(
              "click",
              () =>
                copyMessage(
                  btn.dataset.copyMsg
                )
            )
        );


      document
        .querySelectorAll(
          "[data-edit-msg]"
        )
        .forEach(
          btn =>
            btn.addEventListener(
              "click",
              () =>
                editMessage(
                  btn.dataset.editMsg
                )
            )
        );


      document
        .querySelectorAll(
          "[data-delete-msg]"
        )
        .forEach(
          btn =>
            btn.addEventListener(
              "click",
              () =>
                deleteMessage(
                  btn.dataset.deleteMsg
                )
            )
        );

    } else {

      document
        .getElementById(
          "newChatBtn"
        )
        ?.addEventListener(
          "click",
          () =>
            showNewChat(
              renderApp
            )
        );


      document
        .getElementById(
          "newChatEmpty"
        )
        ?.addEventListener(
          "click",
          () =>
            showNewChat(
              renderApp
            )
        );


      document
        .querySelectorAll(
          "[data-conversation]"
        )
        .forEach(
          x => {

            x.addEventListener(
              "click",
              e => {

                if (
                  e.target.closest(
                    "[data-pin-toggle]"
                  )
                ) {
                  return;
                }

                /*
                 * IMPORTANT:
                 * Chat menu buttons/options are
                 * handled by the delegated menu
                 * listener inside chat.js.
                 *
                 * Do not manually handle those
                 * clicks here.
                 */

                if (
                  e.target.closest(
                    "[data-chat-menu]"
                  ) ||
                  e.target.closest(
                    "[data-chat-action]"
                  ) ||
                  e.target.closest(
                    "[data-chat-options]"
                  )
                ) {
                  return;
                }

                openConversation(
                  x.dataset.conversation,
                  renderApp
                );
              }
            );
          }
        );


      document
        .querySelectorAll(
          "[data-pin-toggle]"
        )
        .forEach(
          btn => {

            btn.addEventListener(
              "click",
              e => {

                e.stopPropagation();

                togglePinConversation(
                  btn.dataset.pinToggle
                );
              }
            );
          }
        );


      document
        .getElementById(
          "chatSearch"
        )
        ?.addEventListener(
          "input",
          e => {

            state.chatSearchQuery =
              e.target.value;

            renderApp();
          }
        );
    }
  }


  if (
    state.page ===
    "timetrust"
  ) {
    attachTimeTrustEvents(
      renderApp
    );
  }


  if (
    state.page ===
    "market"
  ) {
    attachMarketEvents(
      renderApp
    );
  }


  if (
    state.page ===
    "profile"
  ) {

    document
      .getElementById(
        "editProfileBtn"
      )
      ?.addEventListener(
        "click",
        () =>
          showEditProfile(
            renderApp
          )
      );


    document
      .getElementById(
        "savedBtn"
      )
      ?.addEventListener(
        "click",
        showSaved
      );


    document
      .getElementById(
        "settingsBtn"
      )
      ?.addEventListener(
        "click",
        () =>
          showSettings(
            renderApp
          )
      );


    document
      .getElementById(
        "logoutBtn"
      )
      ?.addEventListener(
        "click",
        () =>
          signOut()
      );
  }
}


async function startApplication(
  user
) {

  state.user =
    user;

  try {

    await loadProfile(
      user
    );

    subscribeAll(
      renderApp
    );

    renderApp();

  } catch (e) {

    root.innerHTML = `
      <div class="auth-shell">

        <div class="auth-card">

          <div class="auth-logo">
            !
          </div>

          <h1>
            Connection problem
          </h1>

          <p>
            Marvel Chat could not load your profile.
          </p>

          <div class="status error">
            ${escapeHtml(
              friendly(e)
            )}
          </div>

          <button
            class="btn btn-primary btn-block"
            id="retryApp"
          >
            Retry
          </button>

          <div style="height:8px"></div>

          <button
            class="btn btn-danger btn-block"
            id="retryLogout"
          >
            Sign out
          </button>

        </div>
      </div>
    `;


    document
      .getElementById(
        "retryApp"
      )
      ?.addEventListener(
        "click",
        () =>
          startApplication(
            user
          )
      );


    document
      .getElementById(
        "retryLogout"
      )
      ?.addEventListener(
        "click",
        () =>
          signOut()
      );
  }
}


onAuthStateChanged(
  auth,
  async user => {

    state.user =
      user;

    if (!user) {

      Object
        .values(
          state.unsubs
        )
        .forEach(
          fn =>
            fn?.()
        );


      state.unsubs = {
        posts:
          null,

        conversations:
          null,

        messages:
          null,

        skills:
          null,

        requests:
          null,

        listings:
          null,

        notifications:
          null,

        preferences:
          null
      };


      state.profile =
        null;

      state.posts =
        [];

      state.conversations =
        [];

      state.skills =
        [];

      state.requests =
        [];

      state.listings =
        [];

      state.notifications =
        [];

      state.unreadNotificationsCount =
        0;

      state.activeConversation =
        null;

      state.messages =
        [];

      state.conversationPreferences =
        {};

      renderAuth();

      return;
    }


    await startApplication(
      user
    );
  }
);


window.addEventListener(
  "online",
  () => {

    if (state.user) {

      toast(
        "Back online ⚡"
      );

      renderApp();
    }
  }
);


window.addEventListener(
  "offline",
  () => {

    if (state.user) {

      toast(
        "Offline mode. Some features may be unavailable."
      );

      renderApp();
    }
  }
);


window.addEventListener(
  "beforeinstallprompt",
  e => {

    e.preventDefault();

    state.installPrompt =
      e;
  }
);


window.addEventListener(
  "appinstalled",
  () => {

    state.installPrompt =
      null;

    toast(
      "MarvelChat installed 📲"
    );
  }
);


if (
  "serviceWorker" in
  navigator
) {

  window.addEventListener(
    "load",
    () => {

      navigator.serviceWorker
        .register(
          "./serviceworker.js",
          {
            scope: "./",
            updateViaCache:
              "none"
          }
        )
        .then(
          r =>
            console.log(
              "Service worker:",
              r.scope
            )
        )
        .catch(
          e =>
            console.warn(
              "Service worker:",
              e
            )
        );
    }
  );
}


const startupStatus =
  document.getElementById(
    "startupStatus"
  );


if (
  startupStatus
) {

  startupStatus.textContent =
    "Initializing the MarvelChat universe…";
}
