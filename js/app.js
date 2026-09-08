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
  subscribeForPage,
  stopAllListeners
} from "./firebase/listeners.js";

import {
  renderHome,
  attachHomeEvents
} from "./features /home.js";

import {
  renderChat,
  showNewChat,
  sendMessage,
  openConversation,
  editMessage,
  deleteMessage,
  copyMessage,
  togglePinConversation,
  totalUnreadCount
} from "./features /chat.js";

import {
  renderMarket,
  attachMarketEvents
} from "./features /market.js";

import {
  renderProfile,
  attachProfileEvents
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
  attachTimeTrustEvents
} from "./features /timetrust.js";

import {
  toast
} from "./components/toast.js";


const root =
  document.getElementById(
    "root"
  );


/* =========================================================
   MAIN APPLICATION RENDERER
   ========================================================= */

export function renderApp() {

  applyTheme();


  /*
   * AUTHENTICATION GATE
   */

  if (!state.user) {

    renderAuth();

    return;

  }


  /*
   * ONBOARDING GATE
   */

  if (!state.profile?.country) {

    renderOnboarding();

    return;

  }


  /*
   * PAGE-SCOPED FIRESTORE LISTENERS
   *
   * Only the data required by the current page
   * is subscribed to.
   *
   * subscribeForPage() is idempotent, so repeated
   * renderApp() calls do not create duplicate listeners.
   */

  subscribeForPage(
    state.page,
    renderApp
  );


  /*
   * PAGE RENDER MAP
   */

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
      renderProfile(
        renderApp
      )

  };


  const fn =
    pages[state.page] ||
    pages.home;


  /*
   * CHAT FULLSCREEN MODE
   *
   * When an active conversation is open,
   * Chat becomes the entire application viewport.
   */

  const chatFullscreen =
    state.page === "chat" &&
    !!state.activeConversation;


  const chatUnread =
    totalUnreadCount();


  root.innerHTML = `
    <div class="app">

      <header
        class="topbar"
        style="${
          chatFullscreen
            ? "display:none;"
            : ""
        }"
      >

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
            aria-label="Search"
            type="button"
          >
            ⌕
          </button>


          <button
            class="icon-btn"
            id="notificationBtn"
            title="Notifications"
            aria-label="Notifications"
            type="button"
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
            aria-label="Toggle theme"
            type="button"
          >
            ${
              state.theme === "dark"
                ? "☀️"
                : "🌙"
            }
          </button>

        </div>

      </header>


      <main
        class="main"
        style="${
          chatFullscreen
            ? "padding:0;height:100vh;min-height:0;overflow:hidden;"
            : ""
        }"
      >
        ${fn()}
      </main>


      <nav
        class="bottom-nav"
        style="${
          chatFullscreen
            ? "display:none;"
            : ""
        }"
      >

        <div class="bottom-inner">

          ${navButton(
            "home",
            "⌂",
            "Home"
          )}

          ${navButton(
            "chat",
            "💬",
            "Chat",
            chatUnread
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


  /*
   * GLOBAL SEARCH
   */

  document
    .getElementById(
      "searchBtn"
    )
    ?.addEventListener(
      "click",
      () => showSearch(renderApp)
    );


  /*
   * NOTIFICATIONS
   */

  document
    .getElementById(
      "notificationBtn"
    )
    ?.addEventListener(
      "click",
      () => showNotifications(renderApp)
    );


  /*
   * THEME
   */

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


        try {

          localStorage.setItem(
            "marvel_theme",
            state.theme
          );

        } catch {
          /* Ignore storage errors. */
        }


        renderApp();

      }
    );


  /*
   * BOTTOM NAVIGATION
   */

  document
    .querySelectorAll(
      "[data-nav]"
    )
    .forEach(
      btn => {

        btn.addEventListener(
          "click",
          () => {

            const nextPage =
              btn.dataset.nav;


            if (
              !nextPage
            ) {
              return;
            }


            state.page =
              nextPage;


            /*
             * If leaving an active conversation,
             * clean up only the message listener/state.
             */

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


  /*
   * PAGE-SPECIFIC EVENTS
   */

  attachEvents();

}


/* =========================================================
   BOTTOM NAVIGATION BUTTON
   ========================================================= */

function navButton(
  page,
  icon,
  label,
  badgeCount = 0
) {

  const count =
    Number(badgeCount) || 0;


  return `
    <button
      class="nav-btn ${
        state.page === page
          ? "active"
          : ""
      }"
      data-nav="${page}"
      type="button"
      style="position:relative;"
    >

      <span class="nav-icon">
        ${icon}
      </span>

      <span>
        ${label}
      </span>

      ${
        count > 0
          ? `
            <span
              style="
                position:absolute;
                top:4px;
                right:10px;
                background:var(--danger);
                color:#fff;
                font-size:10px;
                font-weight:bold;
                padding:1px 5px;
                border-radius:999px;
                min-width:16px;
                line-height:1.4;
              "
            >
              ${count > 99 ? "99+" : count}
            </span>
          `
          : ""
      }

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


            <div
              id="forgotPasswordContainer"
              style="
                margin-top:6px;
                text-align:right;
              "
            >

              <button
                type="button"
                id="forgotPasswordLink"
                style="
                  border:0;
                  background:transparent;
                  color:var(--muted);
                  cursor:pointer;
                  font-size:12px;
                  padding:2px 0;
                  font:inherit;
                  text-decoration:underline;
                "
              >
                Forgot password?
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
          © ${new Date().getFullYear()}
          Davonium Technologies.
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


  const forgotPasswordContainer =
    document.getElementById(
      "forgotPasswordContainer"
    );


  const forgotPasswordLink =
    document.getElementById(
      "forgotPasswordLink"
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

    signup =
      v;


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


    if (
      forgotPasswordContainer
    ) {

      forgotPasswordContainer.style.display =
        v
          ? "none"
          : "block";

    }


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


  forgotPasswordLink?.addEventListener(
    "click",
    () =>
      renderForgotPassword()
  );


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
            merge:
              true
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
   FORGOT PASSWORD SCREEN
   ========================================================= */

function renderForgotPassword() {

  applyTheme();


  root.innerHTML = `

    <div class="auth-shell">

      <div class="auth-card">

        <div class="auth-logo">
          M
        </div>


        <h1>
          Reset your password
        </h1>


        <p>
          Enter the email address connected to your
          Marvel Chat account and we'll send you a
          secure password reset link.
        </p>


        <div id="forgotMessage"></div>


        <form id="forgotForm">

          <div class="field">

            <label for="forgotEmail">
              Email
            </label>

            <input
              class="input"
              id="forgotEmail"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              required
            >

          </div>


          <button
            class="btn btn-primary btn-block"
            id="forgotSubmit"
            type="submit"
          >
            Send reset link
          </button>

        </form>


        <div
          style="
            margin-top:14px;
            text-align:center;
          "
        >

          <button
            type="button"
            class="btn btn-ghost btn-block"
            id="backToSignInBtn"
          >
            ← Back to Sign in
          </button>

        </div>


        <div
          style="
            margin-top:18px;
            text-align:center;
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
      "backToSignInBtn"
    )
    ?.addEventListener(
      "click",
      () => {
        renderAuth();
      }
    );


  document.getElementById(
    "forgotForm"
  ).onsubmit = async e => {

    e.preventDefault();


    const emailInput =
      document.getElementById(
        "forgotEmail"
      );


    const email =
      emailInput.value.trim();


    const message =
      document.getElementById(
        "forgotMessage"
      );


    const submitBtn =
      document.getElementById(
        "forgotSubmit"
      );


    message.innerHTML =
      "";


    if (!email) {

      message.innerHTML =
        `<div class="status error">
          Please enter your email address.
        </div>`;

      return;

    }


    submitBtn.disabled =
      true;


    submitBtn.textContent =
      "Sending reset link…";


    try {

      const {
        sendPasswordResetEmail
      } =
        await import(
          "./firebase/auth.js"
        );


      await sendPasswordResetEmail(
        auth,
        email
      );


      message.innerHTML =
        `<div
          class="status success"
          style="margin-bottom:14px;"
        >
          <strong>
            Reset link sent 📧
          </strong>

          <br><br>

          We've sent a password reset link
          to your email address.

          Check your inbox and follow the
          instructions to choose a new password.
        </div>`;


      emailInput.disabled =
        true;


      submitBtn.style.display =
        "none";

    } catch (err) {

      message.innerHTML =
        `<div class="status error">
          ${escapeHtml(
            friendly(err)
          )}
        </div>`;


      submitBtn.disabled =
        false;


      submitBtn.textContent =
        "Send reset link";

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

        <h2>
          Your Privacy Matters
        </h2>

        <p>
          Marvel Chat is designed to help people
          connect, communicate, exchange skills and
          discover opportunities while respecting
          user privacy.
        </p>


        <h3>
          Information We Collect
        </h3>

        <p>
          Depending on the features you use,
          Marvel Chat may store information you
          provide, including your email address,
          username, display name, country, profile
          information, posts, messages, marketplace
          listings and related activity.
        </p>


        <h3>
          How Information Is Used
        </h3>

        <p>
          We use account and application information
          to provide authentication, profiles,
          community features, Chat, TimeTrust,
          Market and other features of Marvel Chat,
          and to maintain and improve the service.
        </p>


        <h3>
          Firebase
        </h3>

        <p>
          Marvel Chat uses Firebase services for
          authentication and application data.
          Information required to operate these
          services may be processed through Firebase
          infrastructure.
        </p>


        <h3>
          Marketplace Information
        </h3>

        <p>
          If you create a Market listing,
          information included in that listing may
          be visible to signed-in Marvel Chat users
          so they can discover the listing and
          contact the seller.

          Do not publish private information that
          you do not want other users to see.
        </p>


        <h3>
          Your Responsibility
        </h3>

        <p>
          Keep your password and private credentials
          confidential.

          Avoid posting sensitive personal
          information publicly in the community.
        </p>


        <h3>
          Data and Policy Updates
        </h3>

        <p>
          Marvel Chat may update its privacy
          practices as the platform develops.

          Changes to this policy should be reflected
          on this page.
        </p>

      `

    },


    terms: {

      title:
        "Terms of Use",

      icon:
        "📜",

      body: `

        <h2>
          Using Marvel Chat
        </h2>

        <p>
          By creating an account or using
          Marvel Chat, you agree to use the service
          responsibly, lawfully and respectfully.
        </p>


        <h3>
          Community Conduct
        </h3>

        <p>
          Do not use Marvel Chat to harass,
          threaten, deceive, impersonate, abuse,
          spam or intentionally harm other users.
        </p>


        <h3>
          Your Account
        </h3>

        <p>
          You are responsible for protecting your
          account credentials and for activity
          performed through your account.

          Provide accurate information where
          required for the service to operate.
        </p>


        <h3>
          User Content
        </h3>

        <p>
          You are responsible for content you
          create, publish, send or share through
          Marvel Chat.

          Do not upload or share content that
          violates applicable law or the rights
          of others.
        </p>


        <h3>
          Market
        </h3>

        <p>
          Market listings must be truthful and
          lawful.

          Sellers are responsible for their
          listings and transactions.

          Marvel Chat provides the marketplace
          feature but does not guarantee the
          quality, legality or completion of
          transactions between users.
        </p>


        <h3>
          Service Changes
        </h3>

        <p>
          Marvel Chat may be improved, changed,
          expanded or temporarily unavailable as
          development, maintenance and security
          work take place.
        </p>


        <h3>
          Responsible Use
        </h3>

        <p>
          Use Marvel Chat in accordance with
          applicable laws and respect the privacy,
          safety and rights of other members of
          the community.
        </p>

      `

    },


    contact: {

      title:
        "Contact & About",

      icon:
        "📬",

      body: `

        <h2>
          About Marvel Chat
        </h2>

        <p>
          Marvel Chat is a community platform
          created to help people connect,
          communicate, exchange skills, trade time
          through TimeTrust, and discover
          opportunities.
        </p>


        <h3>
          Built By
        </h3>

        <p>
          <strong>
            Davonium Technologies
          </strong>
        </p>


        <p>
          Marvel Chat is an independent product
          and platform developed under
          Davonium Technologies.
        </p>


        <h3>
          Contact & Support
        </h3>

        <p>
          For questions, feedback, bug reports,
          partnership discussions, support requests
          or other enquiries, use the official
          contact channel published by Davonium
          Technologies.
        </p>


        <p>
          When an official support email or support
          address is published, it can be added to
          this section.
        </p>


        <h3>
          Copyright
        </h3>

        <p>
          © ${new Date().getFullYear()}
          Davonium Technologies.
          All rights reserved.
        </p>


        <p>
          Marvel Chat, its branding, interface,
          original application code and original
          product materials are associated with
          Davonium Technologies, subject to
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
            Marvel Chat •
            Davonium Technologies
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


/* =========================================================
   ONBOARDING
   ========================================================= */

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
          One last thing before entering the
          community: choose your country.
        </p>


        <div class="country-grid">

          ${countries
            .map(
              c =>
                `<button
                  class="country-option"
                  data-country="${c[0]}"
                  type="button"
                >
                  ${escapeHtml(c[1])}
                </button>`
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
          type="button"
        >
          Enter Marvel Chat 🚀
        </button>


        <button
          class="btn btn-ghost btn-block"
          style="margin-top:8px"
          id="onboardingLogout"
          type="button"
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


            const selectedCountry =
              document.getElementById(
                "selectedCountry"
              );


            if (
              selectedCountry
            ) {

              selectedCountry.textContent =
                `Selected: ${label}`;

            }


            const continueButton =
              document.getElementById(
                "continueCountry"
              );


            if (
              continueButton
            ) {

              continueButton.disabled =
                false;

            }

          }
        );

      }
    );


  document
    .getElementById(
      "continueCountry"
    )
    ?.addEventListener(
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
    ?.addEventListener(
      "click",
      () =>
        signOut()
    );

}


/* =========================================================
   PAGE EVENT ATTACHMENT
   ========================================================= */

function attachEvents() {


  /* =======================================================
     HOME
     ======================================================= */

  if (
    state.page ===
    "home"
  ) {

    /*
     * Home owns all of its own listeners:
     * quick actions (create post), like, comment,
     * share, save, post menus, edit/delete post,
     * dropdown cleanup, discovery overlay, and
     * expired-post cleanup.
     *
     * app.js must not duplicate any of these —
     * it only hands control to attachHomeEvents().
     */

    attachHomeEvents(
      renderApp
    );

  }


  /* =======================================================
     CHAT
     ======================================================= */

  if (
    state.page ===
    "chat"
  ) {

    if (
      state.activeConversation
    ) {

      /*
       * BACK FROM ACTIVE CONVERSATION
       */

      document
        .getElementById(
          "backChats"
        )
        ?.addEventListener(
          "click",
          closeActiveConversation
        );


      /*
       * Some Chat versions expose a separate close
       * control for the active conversation.
       */

      document
        .getElementById(
          "closeConversation"
        )
        ?.addEventListener(
          "click",
          closeActiveConversation
        );


      /*
       * SEND MESSAGE
       */

      document
        .getElementById(
          "sendMessage"
        )
        ?.addEventListener(
          "click",
          () =>
            sendMessage()
        );


      /*
       * ENTER TO SEND
       */

      document
        .getElementById(
          "messageInput"
        )
        ?.addEventListener(
          "keydown",
          event => {

            if (
              event.key ===
              "Enter"
            ) {

              event.preventDefault();

              sendMessage();

            }

          }
        );


      /*
       * COPY MESSAGE
       */

      document
        .querySelectorAll(
          "[data-copy-msg]"
        )
        .forEach(
          button =>
            button.addEventListener(
              "click",
              () =>
                copyMessage(
                  button.dataset.copyMsg
                )
            )
        );


      /*
       * EDIT MESSAGE
       */

      document
        .querySelectorAll(
          "[data-edit-msg]"
        )
        .forEach(
          button =>
            button.addEventListener(
              "click",
              () =>
                editMessage(
                  button.dataset.editMsg
                )
            )
        );


      /*
       * DELETE MESSAGE
       */

      document
        .querySelectorAll(
          "[data-delete-msg]"
        )
        .forEach(
          button =>
            button.addEventListener(
              "click",
              () =>
                deleteMessage(
                  button.dataset.deleteMsg
                )
            )
        );

    } else {

      /*
       * NEW CHAT
       */

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


      /*
       * EXISTING CONVERSATIONS
       */

      document
        .querySelectorAll(
          "[data-conversation]"
        )
        .forEach(
          conversation => {

            conversation.addEventListener(
              "click",
              event => {

                /*
                 * Pin controls belong to their own
                 * event handler.
                 */

                if (
                  event.target.closest(
                    "[data-pin-toggle]"
                  )
                ) {

                  return;

                }


                /*
                 * Chat menu buttons/options are
                 * handled inside chat.js.
                 *
                 * Do not open the conversation when
                 * a menu action is clicked.
                 */

                if (
                  event.target.closest(
                    "[data-chat-menu]"
                  ) ||
                  event.target.closest(
                    "[data-chat-action]"
                  ) ||
                  event.target.closest(
                    "[data-chat-options]"
                  )
                ) {

                  return;

                }


                const conversationId =
                  conversation.dataset.conversation;


                if (
                  !conversationId
                ) {

                  return;

                }


                openConversation(
                  conversationId,
                  renderApp
                );

              }
            );

          }
        );


      /*
       * PIN CONVERSATION
       */

      document
        .querySelectorAll(
          "[data-pin-toggle]"
        )
        .forEach(
          button => {

            button.addEventListener(
              "click",
              event => {

                event.stopPropagation();


                togglePinConversation(
                  button.dataset.pinToggle
                );

              }
            );

          }
        );


      /*
       * CHAT SEARCH
       *
       * Existing behavior preserved.
       */

      document
        .getElementById(
          "chatSearch"
        )
        ?.addEventListener(
          "input",
          event => {

            state.chatSearchQuery =
              event.target.value;


            renderApp();

          }
        );

    }

  }


  /* =======================================================
     TIMETRUST
     ======================================================= */

  if (
    state.page ===
    "timetrust"
  ) {

    attachTimeTrustEvents(
      renderApp
    );

  }


  /* =======================================================
     MARKET
     ======================================================= */

  if (
    state.page ===
    "market"
  ) {

    attachMarketEvents(
      renderApp
    );

  }


  /* =======================================================
     PROFILE
     ======================================================= */

  if (
    state.page ===
    "profile"
  ) {

    attachProfileEvents(
      renderApp
    );


    /*
     * Settings remains owned by app.js because
     * Settings is an application-level feature.
     */

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

  }

}


/* =========================================================
   CLOSE ACTIVE CHAT CONVERSATION
   ========================================================= */

function closeActiveConversation() {

  /*
   * Stop only the active messages listener.
   */

  state.unsubs.messages?.();


  state.unsubs.messages =
    null;


  state.activeConversation =
    null;


  state.messages =
    [];


  renderApp();

}


/* =========================================================
   APPLICATION START
   ========================================================= */

async function startApplication(
  user
) {

  state.user =
    user;


  try {

    await loadProfile(
      user
    );


    subscribeForPage(
      state.page,
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
            type="button"
          >
            Retry
          </button>


          <div style="height:8px"></div>


          <button
            class="btn btn-danger btn-block"
            id="retryLogout"
            type="button"
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


/* =========================================================
   AUTH STATE
   ========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    state.user =
      user;


    if (!user) {

      stopAllListeners();


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


/* =========================================================
   NETWORK EVENTS
   ========================================================= */

window.addEventListener(
  "online",
  () => {

    if (
      state.user
    ) {

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

    if (
      state.user
    ) {

      toast(
        "Offline mode. Some features may be unavailable."
      );


      renderApp();

    }

  }
);


/* =========================================================
   PWA INSTALL
   ========================================================= */

window.addEventListener(
  "beforeinstallprompt",
  event => {

    event.preventDefault();


    state.installPrompt =
      event;

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


/* =========================================================
   SERVICE WORKER
   ========================================================= */

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
            scope:
              "./",

            updateViaCache:
              "none"
          }
        )
        .then(
          registration =>
            console.log(
              "Service worker:",
              registration.scope
            )
        )
        .catch(
          error =>
            console.warn(
              "Service worker:",
              error
            )
        );

    }
  );

}


/* =========================================================
   STARTUP STATUS
   ========================================================= */

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
