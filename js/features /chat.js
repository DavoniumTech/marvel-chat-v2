import { state, escapeHtml, initials, formatDate, friendly } from "../state.js";
import { db, collection, doc, getDoc, setDoc, updateDoc, addDoc, query, where, orderBy, limit, getDocs, onSnapshot, serverTimestamp } from "../firebase/firestore.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";

export function showNewChat(renderApp) {
  showModal(
    "Start a new chat",
    `
      <div class="field">
        <label>Enter the person's username</label>
        <input class="input" id="chatUsername" placeholder="username">
      </div>
      <button class="btn btn-primary btn-block" id="findChatUser">Find user</button>
      <div id="chatUserResult" style="margin-top:14px"></div>
    `
  );

  document.getElementById("findChatUser")?.addEventListener("click", async () => {
    const username = document.getElementById("chatUsername").value.trim();
    const result = document.getElementById("chatUserResult");
    if (!username) {
      result.innerHTML = `<div class="status error">Enter a username.</div>`;
      return;
    }
    result.innerHTML = `<div class="empty">Searching…</div>`;
    try {
      const snap = await getDocs(query(collection(db, "users"), where("username", "==", username), limit(5)));
      if (snap.empty) {
        result.innerHTML = `<div class="empty">No user found.</div>`;
        return;
      }
      result.innerHTML = snap.docs.filter(d => d.id !== state.user.uid).map(d => {
        const u = { id: d.id, ...d.data() };
        return `
          <div class="list-item">
            <div class="profile-row">
              <div class="avatar">${escapeHtml(initials(u.displayName || u.username))}</div>
              <div class="profile-meta">
                <strong>${escapeHtml(u.displayName || u.username || "User")}</strong>
                <span class="small">@${escapeHtml(u.username || "")}</span>
              </div>
              <button class="btn btn-primary" data-start-chat="${u.id}">Chat</button>
            </div>
          </div>
        `;
      }).join("");

      result.querySelectorAll("[data-start-chat]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const uid = btn.dataset.startChat;
          const profileSnap = await getDoc(doc(db, "users", uid));
          if (!profileSnap.exists()) {
            toast("User profile disappeared.");
            return;
          }
          await createConversation({ uid, ...profileSnap.data() }, renderApp);
        });
      });
    } catch (e) {
      result.innerHTML = `<div class="status error">${escapeHtml(friendly(e))}</div>`;
    }
  });
}

export async function createConversation(other, renderApp) {
  try {
    const existing = state.conversations.find(c =>
      Array.isArray(c.participants) &&
      c.participants.length === 2 &&
      c.participants.includes(state.user.uid) &&
      c.participants.includes(other.uid)
    );
    if (existing) {
      closeModal();
      await openConversation(existing, renderApp);
      return;
    }

    const ref = await addDoc(collection(db, "conversations"), {
      participants: [state.user.uid, other.uid],
      participantProfiles: {
        [state.user.uid]: {
          displayName: state.profile.displayName || state.profile.username || "User",
          username: state.profile.username || ""
        },
        [other.uid]: {
          displayName: other.displayName || other.username || "User",
          username: other.username || ""
        }
      },
      lastMessage: "",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    });

    const localConversation = {
      id: ref.id,
      participants: [state.user.uid, other.uid],
      participantProfiles: {
        [state.user.uid]: {
          displayName: state.profile.displayName || state.profile.username || "User",
          username: state.profile.username || ""
        },
        [other.uid]: {
          displayName: other.displayName || other.username || "User",
          username: other.username || ""
        }
      },
      lastMessage: "",
      updatedAt: null,
      createdAt: null
    };

    state.conversations = [localConversation, ...state.conversations.filter(c => c.id !== ref.id)];
    closeModal();
    await openConversation(localConversation, renderApp);
  } catch (e) {
    console.error("CREATE CONVERSATION ERROR:", e);
    toast(friendly(e));
  }
}

export async function openConversation(conversation, renderApp) {
  let c = typeof conversation === "string" ? state.conversations.find(x => x.id === conversation) : conversation;
  if (!c) {
    toast("Conversation could not be opened.");
    return;
  }
  state.activeConversation = c;
  state.messages = [];
  state.unsubs.messages?.();
  state.unsubs.messages = null;

  state.unsubs.messages = onSnapshot(
    query(collection(db, "conversations", c.id, "messages"), orderBy("createdAt", "asc"), limit(100)),
    snap => {
      state.messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const latest = state.messages[state.messages.length - 1];
      if (latest) {
        const index = state.conversations.findIndex(x => x.id === c.id);
        if (index >= 0) {
          state.conversations[index] = {
            ...state.conversations[index],
            lastMessage: latest.text || "",
            updatedAt: latest.createdAt || null
          };
          state.activeConversation = state.conversations[index];
        }
      }
      if (state.page === "chat") {
        renderApp();
        setTimeout(() => {
          const el = document.getElementById("messages");
          if (el) el.scrollTop = el.scrollHeight;
        }, 50);
      }
    },
    err => {
      console.error("MESSAGE LISTENER ERROR:", err);
      toast(friendly(err));
    }
  );

  state.page = "chat";
  renderApp();
  setTimeout(() => {
    const el = document.getElementById("messages");
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);
}

export async function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input?.value.trim();
  if (!text || !state.activeConversation) return;
  const id = state.activeConversation.id;
  try {
    input.disabled = true;
    await addDoc(collection(db, "conversations", id, "messages"), {
      uid: state.user.uid,
      text,
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "conversations", id), {
      lastMessage: text,
      updatedAt: serverTimestamp()
    });
    input.value = "";
  } catch (e) {
    console.error("SEND MESSAGE ERROR:", e);
    toast(friendly(e));
  } finally {
    input.disabled = false;
    input.focus();
  }
}

export function renderChat(renderApp) {
  if (state.activeConversation) {
    return renderConversation();
  }
  const conversations = state.conversations;
  return `
    <div class="page">
      <div class="section-title">
        <div>
          <h2>Messages</h2>
          <div class="small">Private conversations</div>
        </div>
        <button class="btn btn-primary" id="newChatBtn">+ New chat</button>
      </div>
      <div class="search">
        <input class="input" id="chatSearch" placeholder="Search conversations…">
      </div>
      ${
        conversations.length
          ? `
            <div class="chat-list" id="chatList">
              ${conversations.map(c => {
                const other = c.participants?.find(x => x !== state.user.uid);
                const profile = c.participantProfiles?.[other] || {};
                const name = profile.displayName || profile.username || "User";
                return `
                  <div class="chat-item" data-conversation="${c.id}">
                    <div class="avatar">${escapeHtml(initials(name))}</div>
                    <div class="chat-content">
                      <strong>${escapeHtml(name)}</strong>
                      <p>${escapeHtml(c.lastMessage || "Start chatting")}</p>
                    </div>
                    <span class="small">${escapeHtml(formatDate(c.updatedAt))}</span>
                  </div>
                `;
              }).join("")}
            </div>
          `
          : `
            <div class="card empty">
              <div style="font-size:42px">💬</div>
              <h3>No conversations yet</h3>
              <p>Start a private conversation with another Marvel Chat member.</p>
              <button class="btn btn-primary" id="newChatEmpty">Start a chat</button>
            </div>
          `
      }
    </div>
  `;
}

export function renderConversation() {
  const c = state.activeConversation;
  const other = c?.participants?.find(x => x !== state.user.uid);
  const profile = c?.participantProfiles?.[other] || {};
  const name = profile.displayName || profile.username || "User";

  return `
    <div class="page">
      <div class="section-title">
        <div class="profile-row">
          <button class="icon-btn" id="backChats">←</button>
          <div class="avatar">${escapeHtml(initials(name))}</div>
          <div>
            <h2 style="margin:0">${escapeHtml(name)}</h2>
            <div class="small">Private chat</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="messages" id="messages">
          ${
            state.messages.length
              ? state.messages.map(m => `
                  <div class="bubble ${m.uid === state.user.uid ? "mine" : ""}">
                    <div>${escapeHtml(m.text || "")}</div>
                    <div class="bubble-time">${escapeHtml(formatDate(m.createdAt))}</div>
                  </div>
                `).join("")
              : `<div class="empty">👋 Say hello and start the conversation.</div>`
          }
        </div>
        <div class="message-box">
          <input class="input" id="messageInput" maxlength="5000" autocomplete="off" placeholder="Write a message…">
          <button class="btn btn-primary" id="sendMessage">Send</button>
        </div>
      </div>
    </div>
  `;
}
