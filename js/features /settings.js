import { state, countries, escapeHtml, friendly } from "../state.js";
import { db, addDoc, collection, serverTimestamp } from "../firebase/firestore.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { installPwa } from "../../pwa/install.js";

export function showSettings(renderApp) {
  showModal(
    "Settings & About",
    `
      <div class="feature-line">
        <div class="feature-icon">🌙</div>
        <div style="flex:1">
          <strong>Appearance</strong>
          <div class="small">Switch between light and dark mode.</div>
          <button class="btn btn-secondary" id="settingsTheme" style="margin-top:8px">
            ${state.theme === "dark" ? "☀️ Use light mode" : "🌙 Use dark mode"}
          </button>
        </div>
      </div>
      <div class="feature-line">
        <div class="feature-icon">📶</div>
        <div style="flex:1">
          <strong>Low-data mode</strong>
          <div class="small">Helps reduce unnecessary network usage.</div>
          <button class="btn btn-secondary" id="settingsLowData" style="margin-top:8px">
            ${state.lowData ? "📶 Low-data mode: ON" : "📶 Low-data mode: OFF"}
          </button>
        </div>
      </div>
      <div class="feature-line">
        <div class="feature-icon">📲</div>
        <div style="flex:1">
          <strong>Install Marvel Chat</strong>
          <div class="small">Install the PWA on your phone for a more app-like experience.</div>
          <button class="btn btn-primary" id="settingsInstall" style="margin-top:8px">Install app</button>
        </div>
      </div>
      <div class="feature-line">
        <div class="feature-icon">🧭</div>
        <div>
          <strong>About Marvel Chat</strong>
          <div class="small">Marvel Chat is a community platform designed to connect people through conversation, skill exchange, opportunities and community interaction.</div>
        </div>
      </div>
      <div class="feature-line">
        <div class="feature-icon">🚀</div>
        <div>
          <strong>What you can do</strong>
          <div class="small">
            • Create community posts<br>
            • Like and save posts<br>
            • Comment and share<br>
            • Chat privately<br>
            • Exchange skills with TimeTrust<br>
            • Explore the marketplace<br>
            • Manage your profile<br>
            • Install Marvel Chat as a PWA
          </div>
        </div>
      </div>
      <div class="feature-line">
        <div class="feature-icon">🔐</div>
        <div>
          <strong>Security</strong>
          <div class="small">Authentication is handled by Firebase Authentication. Community data is stored through Cloud Firestore according to your Firebase security rules.</div>
        </div>
      </div>
      <div class="feature-line">
        <div class="feature-icon">🌍</div>
        <div>
          <strong>Your country</strong>
          <div class="small">${countries.find(x => x[0] === state.profile?.country)?.[1] || "Not selected"}</div>
        </div>
      </div>
      <div class="notice" style="margin-top:14px">
        <strong>Marvel Chat</strong><br>
        <span class="small">Version 2.0 · Built for the future of community connection.</span>
      </div>
      <div style="margin-top:14px">
        <button class="btn btn-ghost btn-block" id="reportProblemBtn">🛠️ Report a problem</button>
      </div>
    `
  );

  document.getElementById("settingsTheme")?.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("marvel_theme", state.theme);
    closeModal();
    renderApp();
  });

  document.getElementById("settingsLowData")?.addEventListener("click", () => {
    state.lowData = !state.lowData;
    localStorage.setItem("marvel_low_data", state.lowData ? "1" : "0");
    toast(state.lowData ? "Low-data mode enabled 📶" : "Low-data mode disabled.");
    closeModal();
    showSettings(renderApp);
  });

  document.getElementById("settingsInstall")?.addEventListener("click", installPwa);
  document.getElementById("reportProblemBtn")?.addEventListener("click", showReportProblem);
}

export function showReportProblem() {
  showModal(
    "Report a problem",
    `
      <div class="field">
        <label>What went wrong?</label>
        <textarea class="textarea" id="problemText" maxlength="1000" placeholder="Tell us what happened…"></textarea>
      </div>
      <button class="btn btn-primary btn-block" id="submitProblem">Send report</button>
    `
  );

  document.getElementById("submitProblem")?.addEventListener("click", async () => {
    const textInput = document.getElementById("problemText");
    const submitBtn = document.getElementById("submitProblem");
    const text = textInput.value.trim();
    if (!text) { toast("Describe the problem first."); return; }
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";

      const username = state.profile?.displayName || state.profile?.username || "User";
      const email = state.user?.email || "";

      await addDoc(collection(db, "reports"), {
        uid: state.user.uid,
        username,
        email,
        message: text,
        status: "open",
        createdAt: serverTimestamp()
      });
      closeModal();
      toast("Report submitted successfully. Thank you.");
    } catch (e) {
      console.error("Report submit error:", e);
      toast(friendly(e));
      submitBtn.disabled = false;
      submitBtn.textContent = "Send report";
    }
  });
}
