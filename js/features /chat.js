import { state, escapeHtml, initials, formatDate, friendly } from "../state.js";
import { db, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, query, where, orderBy, limit, getDocs, onSnapshot, serverTimestamp } from "../firebase/firestore.js";
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
    const docRef = await addDoc(collection(db, "conversations", id, "messages"), {
      uid: state.user.uid,
      text,
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "conversations", id), {
      lastMessage: text,
      updatedAt: serverTimestamp()
    });

    const newMsg = {
      id: docRef.id,
      uid: state.user.uid,
      text,
      createdAt: new Date()
    };
    state.messages.push(newMsg);

    const recipientUid = state.activeConversation.participants?.find(x => x !== state.user.uid);
    if (recipientUid) {
      try {
        const actorName = state.profile.displayName || state.profile.username || "Someone";
        await addDoc(collection(db, "users", recipientUid, "notifications"), {
          type: "message",
          actorUid: state.user.uid,
          actorName,
          targetId: id,
          text: `${actorName} sent you a message.`,
          read: false,
          createdAt: serverTimestamp()
        });
      } catch (notifErr) {
        console.warn("Could not create message notification:", notifErr);
      }
    }

    input.value = "";
  } catch (e) {
    console.error("SEND MESSAGE ERROR:", e);
    toast(friendly(e));
  } finally {
    input.disabled = false;
    input.focus();
  }
}

export async function editMessage(messageId) {
  const msg = state.messages.find(m => m.id === messageId);
  if (!msg || msg.uid !== state.user.uid) return;

  showModal(
    "Edit message",
    `
      <div class="field">
        <textarea class="textarea" id="editMessageText" maxlength="5000">${escapeHtml(msg.text || "")}</textarea>
      </div>
      <button class="btn btn-primary btn-block" id="saveEditMessage">Save</button>
    `
  );

  document.getElementById("saveEditMessage")?.addEventListener("click", async () => {
    const text = document.getElementById("editMessageText")?.value.trim();
    if (!text) { toast("Message cannot be empty."); return; }
    try {
      await updateDoc(doc(db, "conversations", state.activeConversation.id, "messages", messageId), {
        text,
        editedAt: serverTimestamp()
      });
      state.messages = state.messages.map(m => m.id === messageId ? { ...m, text, editedAt: new Date() } : m);
      closeModal();
      toast("Message updated");
    } catch (e) {
      console.error("EDIT MESSAGE ERROR:", e);
      toast("Could not update message.");
    }
  });
}

export async function deleteMessage(messageId) {
  const msg = state.messages.find(m => m.id === messageId);
  if (!msg || msg.uid !== state.user.uid) return;

  showModal(
    "Delete this message?",
    `
      <p class="small">This message will be permanently removed.</p>
      <div style="display: flex; gap: 10px; margin-top: 16px;">
        <button class="btn btn-ghost" id="cancelDelMsg" style="flex: 1;">Cancel</button>
        <button class="btn btn-danger" id="confirmDelMsg" style="flex: 1;">Delete</button>
      </div>
    `
  );

  document.getElementById("cancelDelMsg")?.addEventListener("click", closeModal);
  document.getElementById("confirmDelMsg")?.addEventListener("click", async () => {
    try {
      await deleteDoc(doc(db, "conversations", state.activeConversation.id, "messages", messageId));
      state.messages = state.messages.filter(m => m.id !== messageId);
      
      const latest = state.messages[state.messages.length - 1];
      const newLastMsg = latest ? latest.text : "";
      await updateDoc(doc(db, "conversations", state.activeConversation.id), {
        lastMessage: newLastMsg,
        updatedAt: latest ? latest.createdAt : serverTimestamp()
      });

      closeModal();
      toast("Message deleted.");
    } catch (e) {
      console.error("DELETE MESSAGE ERROR:", e);
      toast("Could not delete message.");
    }
  });
}

export async function copyMessage(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Message copied 📋");
  } catch (e) {
    toast("Could not copy message.");
  }
}

export async function togglePinConversation(conversationId) {
  const isPinned = !!state.conversationPreferences[conversationId]?.pinned;
  try {
    const prefRef = doc(db, "users", state.user.uid, "conversationPreferences", conversationId);
    if (isPinned) {
      await updateDoc(prefRef, { pinned: false });
      state.conversationPreferences[conversationId] = { pinned: false };
      toast("Conversation unpinned.");
    } else {
      await setDoc(prefRef, { pinned: true, updatedAt: serverTimestamp() }, { merge: true });
      state.conversationPreferences[conversationId] = { pinned: true };
      toast("Conversation pinned 📌");
    }
  } catch (e) {
    console.error("PIN ERROR:", e);
    toast(friendly(e));
  }
}

export function renderChat(renderApp) {
  if (state.activeConversation) {
    return renderConversation();
  }
  const searchQuery = (state.chatSearchQuery || "").toLowerCase();
  let conversations = state.conversations.filter(c => {
    if (!searchQuery) return true;
    const other = c.participants?.find(x => x !== state.user.uid);
    const profile = c.participantProfiles?.[other] || {};
    const name = (profile.displayName || "").toLowerCase();
    const username = (profile.username || "").toLowerCase();
    const lastMsg = (c.lastMessage || "").toLowerCase();
    return name.includes(searchQuery) || username.includes(searchQuery) || lastMsg.includes(searchQuery);
  });

  conversations.sort((a, b) => {
    const aPinned = !!state.conversationPreferences[a.id]?.pinned;
    const bPinned = !!state.conversationPreferences[b.id]?.pinned;
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

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
        <input class="input" id="chatSearch" placeholder="Search conversations…" value="${escapeHtml(state.chatSearchQuery || "")}">
      </div>
      ${
        conversations.length
          ? `
            <div class="chat-list" id="chatList">
              ${conversations.map(c => {
                const other = c.participants?.find(x => x !== state.user.uid);
                const profile = c.participantProfiles?.[other] || {};
                const name = profile.displayName || profile.username || "User";
                const pinned = !!state.conversationPreferences[c.id]?.pinned;
                return `
                  <div class="chat-item ${pinned ? "pinned-chat" : ""}" data-conversation="${c.id}" style="position: relative;">
                    <div class="avatar">${escapeHtml(initials(name))}</div>
                    <div class="chat-content">
                      <strong>${escapeHtml(name)} ${pinned ? "📌" : ""}</strong>
                      <p>${escapeHtml(c.lastMessage || "Start chatting")}</p>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                      <span class="small">${escapeHtml(formatDate(c.updatedAt))}</span>
                      <button class="icon-btn chat-menu-btn" aria-label="Conversation options" data-pin-toggle="${c.id}" style="font-size: 11px; padding: 2px 6px;">${pinned ? "Unpin" : "Pin"}</button>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          `
          : `
            <div class="card empty">
              <div style="font-size:42px">💬</div>
              <h3>No conversations found</h3>
              <p>Try searching or start a new conversation.</p>
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
              ? state.messages.map(m => {
                  const isMine = m.uid === state.user.uid;
                  return `
                    <div class="bubble ${isMine ? "mine" : ""}" data-message-id="${m.id}" style="position: relative;">
                      <div>${escapeHtml(m.text || "")}</div>
                      <div class="bubble-time">
                        ${escapeHtml(formatDate(m.createdAt))} 
                        ${m.editedAt ? `<span class="edited-indicator">(Edited)</span>` : ""}
                      </div>
                      <div class="message-actions-dropdown" style="margin-top: 4px; display: flex; gap: 8px; font-size: 11px;">
                        <button class="btn-text" data-copy-msg="${escapeHtml(m.text || "")}">Copy</button>
                        ${isMine ? `
                          <button class="btn-text" data-edit-msg="${m.id}">Edit</button>
                          <button class="btn-text" data-delete-msg="${m.id}" style="color: #ff5c5c;">Delete</button>
                        ` : ""}
                      </div>
                    </div>
                  `;
                }).join("")
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
