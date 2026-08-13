import { state, countries, applyTheme, escapeHtml, initials, friendly } from "./state.js";
import { auth, loadProfile, onAuthStateChanged, signOut, updateProfile } from "./firebase/auth.js";
import { db, doc, updateDoc, setDoc, serverTimestamp } from "./firebase/firestore.js";
import { subscribeAll } from "./firebase/listeners.js";
import { renderHome, showCreatePost, toggleLike, savePost, sharePost, showComments } from "./features/home.js";
import { renderChat, showNewChat, sendMessage, openConversation } from "./features/chat.js";
import { renderMarket, showSellModal } from "./features/market.js";
import { renderProfile, showEditProfile, showSaved } from "./features/profile.js";
import { showNotifications } from "./features/notifications.js";
import { showSearch } from "./features/search.js";
import { showSettings } from "./features/settings.js";
import { renderTimeTrust, showSkillModal } from "./features/timetrust.js";
import { toast } from "./components/toast.js";

const root = document.getElementById("root");

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
    home: () => renderHome(renderApp),
    chat: () => renderChat(renderApp),
    timetrust: () => renderTimeTrust(),
    market: () => renderMarket(),
    profile: () => renderProfile()
  };

  const fn = pages[state.page] || pages.home;

  root.innerHTML = `
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <div class="brand-logo">M</div>
          <div>
            <div class="brand-name">Marvel Chat</div>
            <div class="brand-sub">FUTURE COMMUNITY</div>
          </div>
        </div>
        <div class="top-actions">
          <button class="icon-btn" id="searchBtn" title="Search">⌕</button>
          <button class="icon-btn" id="notificationBtn" title="Notifications" style="position:relative;">
            🔔
            <span id="notificationBadge" style="position:absolute; top:4px; right:4px; background:var(--danger); color:#fff; font-size:10px; font-weight:bold; padding:2px 5px; border-radius:999px; display:${state.unreadNotificationsCount > 0 ? 'inline-block' : 'none'};">${state.unreadNotificationsCount > 0 ? state.unreadNotificationsCount : ''}</span>
          </button>
          <button class="icon-btn" id="themeBtn" title="Theme">${state.theme === "dark" ? "☀️" : "🌙"}</button>
        </div>
      </header>
      <main class="main">${fn()}</main>
      <nav class="bottom-nav">
        <div class="bottom-inner">
          ${navButton("home", "⌂", "Home")}
          ${navButton("chat", "💬", "Chat")}
          ${navButton("timetrust", "⏱", "TimeTrust")}
          ${navButton("market", "🛍", "Market")}
          ${navButton("profile", "◉", "Profile")}
        </div>
      </nav>
    </div>
  `;

  document.getElementById("searchBtn")?.addEventListener("click", showSearch);
  document.getElementById("notificationBtn")?.addEventListener("click", showNotifications);
  document.getElementById("themeBtn")?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("marvel_theme", state.theme);
    renderApp();
  });

  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.page = btn.dataset.nav;
      if (state.page !== "chat" && state.activeConversation) {
        state.unsubs.messages?.();
        state.unsubs.messages = null;
        state.activeConversation = null;
        state.messages = [];
      }
      renderApp();
    });
  });

  attachEvents();
}

function navButton(page, icon, label) {
  return `
    <button class="nav-btn ${state.page === page ? "active" : ""}" data-nav="${page}">
      <span class="nav-icon">${icon}</span>
      <span>${label}</span>
    </button>
  `;
}

function renderAuth() {
  applyTheme();
  root.innerHTML = `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-logo">M</div>
        <h1>Marvel Chat</h1>
        <p>A futuristic community for people to connect, chat, exchange skills and discover opportunities.</p>
        <div id="authMessage"></div>
        <div class="segmented">
          <button class="btn btn-primary" id="loginTab">Sign in</button>
          <button class="btn btn-ghost" id="signupTab">Create account</button>
        </div>
        <form id="authForm">
          <div class="field">
            <label>Email</label>
            <input class="input" id="authEmail" type="email" autocomplete="email" placeholder="you@example.com" required>
          </div>
          <div class="field">
            <label>Password</label>
            <input class="input" id="authPassword" type="password" autocomplete="current-password" placeholder="Your password" minlength="6" required>
          </div>
          <div id="signupFields" class="hidden">
            <div class="field">
              <label>Username</label>
              <input class="input" id="authUsername" placeholder="Choose a username">
            </div>
            <div class="field">
              <label>Display name</label>
              <input class="input" id="authDisplayName" placeholder="Your name">
            </div>
          </div>
          <button class="btn btn-primary btn-block" id="authSubmit" type="submit">Sign in</button>
        </form>
        <div class="notice" style="margin-top:15px">🚀 Your account is powered by Firebase Authentication.</div>
      </div>
    </div>
  `;

  let signup = false;
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const signupFields = document.getElementById("signupFields");
  const submit = document.getElementById("authSubmit");

  function setMode(v) {
    signup = v;
    loginTab.className = v ? "btn btn-ghost" : "btn btn-primary";
    signupTab.className = v ? "btn btn-primary" : "btn btn-ghost";
    signupFields.classList.toggle("hidden", !v);
    submit.textContent = v ? "Create account" : "Sign in";
  }

  loginTab.addEventListener("click", () => setMode(false));
  signupTab.addEventListener("click", () => setMode(true));

  document.getElementById("authForm").onsubmit = async e => {
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const message = document.getElementById("authMessage");
    submit.disabled = true;
    submit.textContent = "Connecting…";

    try {
      if (signup) {
        const username = document.getElementById("authUsername").value.trim();
        const displayName = document.getElementById("authDisplayName").value.trim();
        if (!username) throw new Error("Username is required.");
        const { createUserWithEmailAndPassword } = await import("./firebase/auth.js");
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: displayName || username });
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid,
          displayName: displayName || username,
          username,
          email,
          country: "",
          bio: "",
          createdAt: serverTimestamp()
        }, { merge: true });
        toast("Account created successfully 🚀");
      } else {
        const { signInWithEmailAndPassword } = await import("./firebase/auth.js");
        await signInWithEmailAndPassword(auth, email, password);
        toast("Welcome back 👋");
      }
    } catch (err) {
      message.innerHTML = `<div class="status error">${escapeHtml(friendly(err))}</div>`;
    } finally {
      submit.disabled = false;
      submit.textContent = signup ? "Create account" : "Sign in";
    }
  };
}

function renderOnboarding() {
  root.innerHTML = `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-logo">🌍</div>
        <h1>Welcome to Marvel Chat</h1>
        <p>One last thing before entering the community: choose your country.</p>
        <div class="country-grid">
          ${countries.map(c => `<button class="country-option" data-country="${c[0]}">${escapeHtml(c[1])}</button>`).join("")}
        </div>
        <div id="selectedCountry" class="status info" style="margin-top:14px">Choose one country.</div>
        <button class="btn btn-primary btn-block" id="continueCountry" disabled>Enter Marvel Chat 🚀</button>
        <button class="btn btn-ghost btn-block" style="margin-top:8px" id="onboardingLogout">Sign out</button>
      </div>
    </div>
  `;

  let selected = "";
  document.querySelectorAll("[data-country]").forEach(btn => {
    btn.addEventListener("click", () => {
      selected = btn.dataset.country;
      document.querySelectorAll("[data-country]").forEach(x => x.classList.remove("selected"));
      btn.classList.add("selected");
      const label = countries.find(x => x[0] === selected)?.[1] || selected;
      document.getElementById("selectedCountry").textContent = `Selected: ${label}`;
      document.getElementById("continueCountry").disabled = false;
    });
  });

  document.getElementById("continueCountry").addEventListener("click", async () => {
    if (!selected) return;
    try {
      await updateDoc(doc(db, "users", state.user.uid), { country: selected });
      state.profile.country = selected;
      toast("Welcome to the community 🌍");
      renderApp();
    } catch (e) {
      toast(friendly(e));
    }
  });

  document.getElementById("onboardingLogout").addEventListener("click", () => signOut());
}

function attachEvents() {
  if (state.page === "home") {
    document.getElementById("createPostBtn")?.addEventListener("click", showCreatePost);
    document.getElementById("emptyCreatePost")?.addEventListener("click", showCreatePost);
    document.querySelectorAll("[data-like]").forEach(b => b.addEventListener("click", () => toggleLike(b.dataset.like)));
    document.querySelectorAll("[data-comment]").forEach(b => b.addEventListener("click", () => showComments(b.dataset.comment)));
    document.querySelectorAll("[data-share]").forEach(b => b.addEventListener("click", () => sharePost(b.dataset.share)));
    document.querySelectorAll("[data-save]").forEach(b => b.addEventListener("click", () => savePost(b.dataset.save)));
    document.querySelectorAll("[data-quick]").forEach(b => b.addEventListener("click", () => {
      const a = b.dataset.quick;
      if (a === "post") showCreatePost();
      if (a === "chat") { state.page = "chat"; renderApp(); setTimeout(showNewChat, 50); }
      if (a === "skill") showSkillModal("offer");
      if (a === "sell") showSellModal();
    }));
  }

  if (state.page === "chat") {
    if (state.activeConversation) {
      document.getElementById("backChats")?.addEventListener("click", () => {
        state.unsubs.messages?.();
        state.unsubs.messages = null;
        state.activeConversation = null;
        state.messages = [];
        renderApp();
      });
      document.getElementById("sendMessage")?.addEventListener("click", sendMessage);
      document.getElementById("messageInput")?.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); sendMessage(); }
      });
    } else {
      document.getElementById("newChatBtn")?.addEventListener("click", () => showNewChat(renderApp));
      document.getElementById("newChatEmpty")?.addEventListener("click", () => showNewChat(renderApp));
      document.querySelectorAll("[data-conversation]").forEach(x => {
        x.addEventListener("click", () => openConversation(x.dataset.conversation, renderApp));
      });
      document.getElementById("chatSearch")?.addEventListener("input", e => {
        state.search = e.target.value.toLowerCase();
        const list = document.getElementById("chatList");
        const filtered = state.conversations.filter(c =>
          Object.values(c.participantProfiles || {}).map(p => `${p.displayName || ""} ${p.username || ""}`).join(" ").toLowerCase().includes(state.search)
        );
        if (!list) return;
        list.innerHTML = filtered.length ? filtered.map(c => {
          const o = c.participants?.find(x => x !== state.user.uid) || "";
          const p = c.participantProfiles?.[o] || {};
          const n = p.displayName || p.username || "User";
          return `
            <div class="chat-item" data-conversation="${c.id}">
              <div class="avatar">${escapeHtml(initials(n))}</div>
              <div class="chat-content">
                <strong>${escapeHtml(n)}</strong>
                <p>${escapeHtml(c.lastMessage || "Start chatting")}</p>
              </div>
            </div>
          `;
        }).join("") : `<div class="empty">No matching conversations.</div>`;

        list.querySelectorAll("[data-conversation]").forEach(x => {
          x.addEventListener("click", () => openConversation(x.dataset.conversation, renderApp));
        });
      });
    }
  }

  if (state.page === "timetrust") {
    document.getElementById("offerSkillBtn")?.addEventListener("click", () => showSkillModal("offer"));
    document.getElementById("requestSkillBtn")?.addEventListener("click", () => showSkillModal("request"));
    document.querySelectorAll("[data-time-tab]").forEach(b => {
      b.addEventListener("click", () => {
        state.timeTab = b.dataset.timeTab;
        renderApp();
      });
    });
  }

  if (state.page === "market") {
    document.getElementById("sellBtn")?.addEventListener("click", showSellModal);
    document.getElementById("marketSearch")?.addEventListener("input", e => {
      state.search = e.target.value;
      const el = document.getElementById("marketItems");
      if (!el) return;
      const filtered = state.listings.filter(x =>
        (`${x.title || ""} ${x.description || ""} ${x.username || ""}`).toLowerCase().includes(state.search.toLowerCase()) &&
        (state.marketCategory === "all" || x.category === state.marketCategory)
      );
      el.innerHTML = filtered.length ? `
        <div class="list">
          ${filtered.map(x => `
            <div class="list-item">
              <div class="profile-row">
                <div class="avatar">🛍</div>
                <div class="profile-meta">
                  <strong>${escapeHtml(x.title)}</strong>
                  <span class="small">${escapeHtml(x.username || "User")} · ${escapeHtml(x.country || "Community")}</span>
                </div>
                <strong>${escapeHtml(String(x.price ?? 0))}</strong>
              </div>
              <p class="small">${escapeHtml(x.description || "")}</p>
              <span class="badge">${escapeHtml(x.category || "Other")}</span>
            </div>
          `).join("")}
        </div>
      ` : `<div class="empty">No matching listings.</div>`;
    });

    document.querySelectorAll("[data-category]").forEach(b => {
      b.addEventListener("click", () => {
        state.marketCategory = b.dataset.category;
        renderApp();
      });
    });
  }

  if (state.page === "profile") {
    document.getElementById("editProfileBtn")?.addEventListener("click", () => showEditProfile(renderApp));
    document.getElementById("savedBtn")?.addEventListener("click", showSaved);
    document.getElementById("settingsBtn")?.addEventListener("click", () => showSettings(renderApp));
    document.getElementById("logoutBtn")?.addEventListener("click", () => signOut());
  }
}

async function startApplication(user) {
  state.user = user;
  try {
    await loadProfile(user);
    subscribeAll(renderApp);
    renderApp();
  } catch (e) {
    root.innerHTML = `
      <div class="auth-shell">
        <div class="auth-card">
          <div class="auth-logo">!</div>
          <h1>Connection problem</h1>
          <p>Marvel Chat could not load your profile.</p>
          <div class="status error">${escapeHtml(friendly(e))}</div>
          <button class="btn btn-primary btn-block" id="retryApp">Retry</button>
          <div style="height:8px"></div>
          <button class="btn btn-danger btn-block" id="retryLogout">Sign out</button>
        </div>
      </div>
    `;
    document.getElementById("retryApp")?.addEventListener("click", () => startApplication(user));
    document.getElementById("retryLogout")?.addEventListener("click", () => signOut());
  }
}

onAuthStateChanged(auth, async user => {
  state.user = user;
  if (!user) {
    Object.values(state.unsubs).forEach(fn => fn?.());
    state.unsubs = { posts: null, conversations: null, messages: null, skills: null, requests: null, listings: null, notifications: null };
    state.profile = null;
    state.posts = [];
    state.conversations = [];
    state.skills = [];
    state.requests = [];
    state.listings = [];
    state.notifications = [];
    state.unreadNotificationsCount = 0;
    state.activeConversation = null;
    state.messages = [];
    renderAuth();
    return;
  }
  await startApplication(user);
});

window.addEventListener("online", () => {
  if (state.user) { toast("Back online ⚡"); renderApp(); }
});
window.addEventListener("offline", () => {
  if (state.user) { toast("Offline mode. Some features may be unavailable."); renderApp(); }
});
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  state.installPrompt = e;
});
window.addEventListener("appinstalled", () => {
  state.installPrompt = null;
  toast("MarvelChat installed 📲");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./serviceworker.js", { scope: "./", updateViaCache: "none" })
      .then(r => console.log("Service worker:", r.scope))
      .catch(e => console.warn("Service worker:", e));
  });
}

const startupStatus = document.getElementById("startupStatus");
if (startupStatus) startupStatus.textContent = "Initializing the MarvelChat universe…";
