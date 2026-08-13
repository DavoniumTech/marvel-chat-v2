export const state = {
  user: null,
  profile: null,
  page: "home",
  posts: [],
  conversations: [],
  activeConversation: null,
  messages: [],
  skills: [],
  requests: [],
  listings: [],
  notifications: [],
  unreadNotificationsCount: 0,
  search: "",
  marketCategory: "all",
  timeTab: "offers",
  lowData: localStorage.getItem("marvel_low_data") === "1",
  theme: localStorage.getItem("marvel_theme") || "light",
  installPrompt: null,
  unsubs: {
    posts: null,
    conversations: null,
    messages: null,
    skills: null,
    requests: null,
    listings: null,
    notifications: null
  }
};

export const countries = [
  ["NG", "🇳🇬 Nigeria"],
  ["GH", "🇬🇭 Ghana"],
  ["KE", "🇰🇪 Kenya"],
  ["ZA", "🇿🇦 South Africa"],
  ["US", "🇺🇸 United States"],
  ["GB", "🇬🇧 United Kingdom"],
  ["CA", "🇨🇦 Canada"],
  ["IN", "🇮🇳 India"],
  ["OTHER", "🌍 Other"]
];

export const categories = [
  "all",
  "Electronics",
  "Fashion",
  "Books",
  "Services",
  "Food",
  "Other"
];

export function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function initials(n) {
  return String(n || "User")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(x => x[0]?.toUpperCase() || "")
    .join("") || "U";
}

export function formatDate(v) {
  if (!v) return "";
  const d = v?.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

export function friendly(e) {
  const c = e?.code || "";
  const m = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "No account was found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/network-request-failed": "Network connection failed. Check your internet.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "permission-denied": "Firestore permission denied. Check your Firestore Rules.",
    "failed-precondition": "Firestore needs an index for this query. Check the Firebase console."
  };
  return m[c] || e?.message || "Something went wrong. Please try again.";
}
