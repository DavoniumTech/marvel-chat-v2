import { state } from "./state.js";
import { renderHome, showCreatePost, showEditPost, showDeletePostConfirmation, toggleLike, savePost, sharePost, showComments, closeDiscoveryOverlay } from "./features/home.js";
import { renderChat, showNewChat, sendMessage, editMessage, deleteMessage, copyMessage } from "./features/chat.js";
import { renderMarket, showCreateListing, showListingDetails, showMarketAccountModal } from "./features/market.js";
import { renderProfile, attachProfileEvents } from "./features/profile.js";
import { renderNotifications } from "./features/notifications.js";
import { renderSettings, attachSettingsEvents } from "./features/settings.js";
import { renderTimeTrust } from "./features/timetrust.js";
import { showSearch } from "./features/search.js";

export function renderApp() {
  const main = document.getElementById("app");
  if (!main) return;

  if (state.page === "home") main.innerHTML = renderHome(renderApp);
  else if (state.page === "chat") main.innerHTML = renderChat(renderApp);
  else if (state.page === "market") main.innerHTML = renderMarket(renderApp);
  else if (state.page === "profile") main.innerHTML = renderProfile(renderApp);
  else if (state.page === "notifications") main.innerHTML = renderNotifications(renderApp);
  else if (state.page === "settings") main.innerHTML = renderSettings(renderApp);
  else if (state.page === "timetrust") main.innerHTML = renderTimeTrust(renderApp);
  else main.innerHTML = renderHome(renderApp);

  attachGlobalEvents();
}

function attachGlobalEvents() {
  document.querySelectorAll("[data-page]").forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const page = btn.dataset.page;
      if (page) {
        if (state.page === "home" && page !== "home") {
          closeDiscoveryOverlay();
        }
        state.page = page;
        renderApp();
      }
    };
  });

  if (state.page === "home") {
    document.getElementById("createPostBtn")?.addEventListener("click", showCreatePost);
    document.getElementById("emptyCreatePost")?.addEventListener("click", showCreatePost);
    document.getElementById("discoveryMarketBtn")?.addEventListener("click", () => {
      closeDiscoveryOverlay();
      state.page = "market";
      renderApp();
    });
    document.getElementById("discoveryTimeTrustBtn")?.addEventListener("click", () => {
      closeDiscoveryOverlay();
      state.page = "timetrust";
      renderApp();
    });

    document.querySelectorAll("[data-quick]").forEach(btn => {
      btn.onclick = () => {
        const action = btn.dataset.quick;
        if (action === "post") showCreatePost();
        else if (action === "chat") {
          state.page = "chat";
          renderApp();
          showNewChat(renderApp);
        } else if (action === "timetrust") {
          state.page = "timetrust";
          renderApp();
        } else if (action === "market") {
          state.page = "market";
          renderApp();
        }
      };
    });

    document.querySelectorAll("[data-like]").forEach(btn => btn.onclick = () => toggleLike(btn.dataset.like));
    document.querySelectorAll("[data-save]").forEach(btn => btn.onclick = () => savePost(btn.dataset.save));
    document.querySelectorAll("[data-share]").forEach(btn => btn.onclick = () => sharePost(btn.dataset.share));
    document.querySelectorAll("[data-comment]").forEach(btn => btn.onclick = () => showComments(btn.dataset.comment));

    document.querySelectorAll("[data-menu-post]").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.menuPost;
        const menu = document.getElementById(`postMenu-${id}`);
        document.querySelectorAll(".dropdown-menu").forEach(m => {
          if (m !== menu) m.classList.add("hidden");
        });
        menu?.classList.toggle("hidden");
      };
    });

    document.querySelectorAll("[data-edit-post]").forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.editPost;
        showEditPost(id);
      };
    });

    document.querySelectorAll("[data-delete-post]").forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.deletePost;
        showDeletePostConfirmation(id);
      };
    });
  } else if (state.page === "chat") {
    document.getElementById("newChatBtn")?.addEventListener("click", () => showNewChat(renderApp));
    document.getElementById("newChatEmpty")?.addEventListener("click", () => showNewChat(renderApp));
    document.getElementById("sendMessage")?.addEventListener("click", sendMessage);
    
    document.getElementById("messageInput")?.addEventListener("keypress", e => {
      if (e.key === "Enter") sendMessage();
    });

    document.getElementById("backChats")?.addEventListener("click", () => {
      state.activeConversation = null;
      renderApp();
    });

    document.querySelectorAll("[data-conversation]").forEach(item => {
      item.onclick = (e) => {
        if (e.target.closest("[data-chat-menu]") || e.target.closest("[data-chat-options]")) {
          return;
        }
        const id = item.dataset.conversation;
        const conv = state.conversations.find(c => c.id === id);
        if (conv) {
          state.activeConversation = conv;
          renderApp();
        }
      };
    });

    document.querySelectorAll("[data-copy-msg]").forEach(btn => btn.onclick = () => copyMessage(btn.dataset.copyMsg));
    document.querySelectorAll("[data-edit-msg]").forEach(btn => btn.onclick = () => editMessage(btn.dataset.editMsg));
    document.querySelectorAll("[data-delete-msg]").forEach(btn => btn.onclick = () => deleteMessage(btn.dataset.deleteMsg));

    const chatSearch = document.getElementById("chatSearch");
    if (chatSearch) {
      chatSearch.oninput = (e) => {
        state.chatSearchQuery = e.target.value;
      };
    }
  } else if (state.page === "market") {
    document.getElementById("createListingBtn")?.addEventListener("click", () => showCreateListing(renderApp));
    document.getElementById("emptySellBtn")?.addEventListener("click", () => showCreateListing(renderApp));
    document.getElementById("marketAccountBtn")?.addEventListener("click", () => showMarketAccountModal(renderApp));

    document.querySelectorAll("[data-market-cat]").forEach(btn => {
      btn.onclick = () => {
        state.marketCategory = btn.dataset.marketCat;
        renderApp();
      };
    });

    document.querySelectorAll("[data-listing-id]").forEach(item => {
      item.onclick = () => showListingDetails(item.dataset.listingId, renderApp);
    });
  } else if (state.page === "profile") {
    attachProfileEvents(renderApp);
  } else if (state.page === "settings") {
    attachSettingsEvents(renderApp);
  }

  document.getElementById("globalSearchBtn")?.addEventListener("click", showSearch);
}
