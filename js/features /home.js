import { state, escapeHtml, initials, formatDate, friendly } from "../state.js";
import { db, collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, increment, arrayUnion, arrayRemove, getDocs, query, orderBy, limit } from "../firebase/firestore.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";

export function renderHome(renderApp) {
  const me = state.profile?.displayName || state.profile?.username || "there";
  const posts = state.posts;

  return `
    <div class="page">
      <section class="hero">
        <h1>Hey ${escapeHtml(me)} 👋</h1>
        <p>Welcome to your futuristic community. Connect, chat, trade skills and discover what people around you are building.</p>
      </section>
      <div class="quick-grid">
        <button class="quick" data-quick="post">
          <div class="quick-icon">✍️</div>
          <strong>Create post</strong>
          <span>Share something</span>
        </button>
        <button class="quick" data-quick="chat">
          <div class="quick-icon">💬</div>
          <strong>Start chat</strong>
          <span>Talk to someone</span>
        </button>
        <button class="quick" data-quick="skill">
          <div class="quick-icon">⏱️</div>
          <strong>Offer a skill</strong>
          <span>Trade your time</span>
        </button>
        <button class="quick" data-quick="sell">
          <div class="quick-icon">🛍️</div>
          <strong>Sell something</strong>
          <span>Open the market</span>
        </button>
      </div>
      <div class="section-title">
        <h2>Community feed</h2>
        <button class="btn btn-primary" id="createPostBtn">+ Post</button>
      </div>
      ${
        posts.length
          ? posts.map(renderPost).join("")
          : `
            <div class="card empty">
              <div style="font-size:38px">🌌</div>
              <h3>The community is quiet…</h3>
              <p>Be the first person to start the conversation.</p>
              <button class="btn btn-primary" id="emptyCreatePost">Create the first post</button>
            </div>
          `
      }
    </div>
  `;
}

export function renderPost(p) {
  const liked = Array.isArray(p.likedBy) && p.likedBy.includes(state.user.uid);
  const saved = Array.isArray(p.savedBy) && p.savedBy.includes(state.user.uid);
  const isOwner = p.uid === state.user.uid;

  return `
    <article class="card post" data-post-id="${p.id}">
      <div class="post-head">
        <div class="avatar">${escapeHtml(initials(p.username))}</div>
        <div class="profile-meta">
          <strong>${escapeHtml(p.username || "User")}</strong>
          <span class="small">${escapeHtml(formatDate(p.createdAt))} ${p.editedAt ? `<span class="edited-indicator">(Edited)</span>` : ""}</span>
        </div>
        ${isOwner ? `
          <div class="dropdown-container" style="margin-left: auto; position: relative;">
            <button class="icon-btn post-menu-btn" aria-label="Post options" data-menu-post="${p.id}">⋮</button>
            <div class="dropdown-menu hidden" id="postMenu-${p.id}" style="position: absolute; right: 0; background: var(--surface2); border: 1px solid var(--border); border-radius: 12px; padding: 6px; z-index: 10; box-shadow: var(--shadow);">
              <button class="btn-text edit-post-btn" data-edit-post="${p.id}" style="display: block; width: 100%; text-align: left; padding: 8px 12px; background: none; border: none; color: var(--text); cursor: pointer; font-weight: 700; font-size: 13px;">Edit post</button>
              <button class="btn-text delete-post-btn" data-delete-post="${p.id}" style="display: block; width: 100%; text-align: left; padding: 8px 12px; background: none; border: none; color: var(--danger); cursor: pointer; font-weight: 700; font-size: 13px;">Delete post</button>
            </div>
          </div>
        ` : ""}
      </div>
      <div class="post-body">${escapeHtml(p.text || "")}</div>
      <div class="post-actions">
        <button class="action ${liked ? "active" : ""}" data-like="${p.id}">
          ${liked ? "❤️" : "♡"} ${Number(p.likes || 0)}
        </button>
        <button class="action" data-comment="${p.id}">
          💬 ${Number(p.comments || 0)}
        </button>
        <button class="action" data-share="${p.id}">↗ Share</button>
        <button class="action ${saved ? "active" : ""}" data-save="${p.id}">
          ${saved ? "🔖 Saved" : "🔖 Save"}
        </button>
      </div>
    </article>
  `;
}

export function showCreatePost() {
  showModal(
    "Create a community post",
    `
      <div class="field">
        <label>What's happening?</label>
        <textarea class="textarea" id="postText" maxlength="1000" placeholder="Share an idea, question, achievement or opportunity…"></textarea>
      </div>
      <button class="btn btn-primary btn-block" id="publishPost">Publish 🚀</button>
    `
  );

  document.getElementById("publishPost")?.addEventListener("click", async () => {
    const text = document.getElementById("postText")?.value.trim();
    if (!text) { toast("Write something first."); return; }
    const btn = document.getElementById("publishPost");
    btn.disabled = true;
    btn.textContent = "Publishing…";
    try {
      const docRef = await addDoc(collection(db, "posts"), {
        uid: state.user.uid,
        username: state.profile.displayName || state.profile.username || "User",
        text,
        likes: 0,
        comments: 0,
        likedBy: [],
        savedBy: [],
        createdAt: serverTimestamp()
      });
      
      const newPost = {
        id: docRef.id,
        uid: state.user.uid,
        username: state.profile.displayName || state.profile.username || "User",
        text,
        likes: 0,
        comments: 0,
        likedBy: [],
        savedBy: [],
        createdAt: new Date()
      };
      state.posts = [newPost, ...state.posts];
      
      closeModal();
      toast("Posted successfully 🚀");
    } catch (e) {
      toast(friendly(e));
      btn.disabled = false;
      btn.textContent = "Publish 🚀";
    }
  });
}

export function showEditPost(postId) {
  const post = state.posts.find(p => p.id === postId);
  if (!post || post.uid !== state.user.uid) return;

  showModal(
    "Edit post",
    `
      <div class="field">
        <label>Edit your post</label>
        <textarea class="textarea" id="editPostText" maxlength="1000">${escapeHtml(post.text || "")}</textarea>
      </div>
      <button class="btn btn-primary btn-block" id="saveEditPost">Save Changes</button>
    `
  );

  document.getElementById("saveEditPost")?.addEventListener("click", async () => {
    const text = document.getElementById("editPostText")?.value.trim();
    if (!text) { toast("Post cannot be empty."); return; }
    const btn = document.getElementById("saveEditPost");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await updateDoc(doc(db, "posts", postId), {
        text,
        editedAt: serverTimestamp()
      });

      state.posts = state.posts.map(p => p.id === postId ? { ...p, text, editedAt: new Date() } : p);
      closeModal();
      toast("Post updated ✓");
    } catch (e) {
      toast(friendly(e));
      btn.disabled = false;
      btn.textContent = "Save Changes";
    }
  });
}

export function showDeletePostConfirmation(postId) {
  const post = state.posts.find(p => p.id === postId);
  if (!post || post.uid !== state.user.uid) return;

  showModal(
    "Delete this post?",
    `
      <p class="small">This action cannot be undone.</p>
      <div style="display: flex; gap: 10px; margin-top: 16px;">
        <button class="btn btn-ghost" id="cancelDeletePost" style="flex: 1;">Cancel</button>
        <button class="btn btn-danger" id="confirmDeletePost" style="flex: 1;">Delete</button>
      </div>
    `
  );

  document.getElementById("cancelDeletePost")?.addEventListener("click", closeModal);
  document.getElementById("confirmDeletePost")?.addEventListener("click", async () => {
    const btn = document.getElementById("confirmDeletePost");
    btn.disabled = true;
    btn.textContent = "Deleting…";
    try {
      await deleteDoc(doc(db, "posts", postId));
      state.posts = state.posts.filter(p => p.id !== postId);
      closeModal();
      toast("Post deleted.");
    } catch (e) {
      toast(friendly(e));
      btn.disabled = false;
      btn.textContent = "Delete";
    }
  });
}

export async function toggleLike(id) {
  const post = state.posts.find(x => x.id === id);
  if (!post) return;
  const liked = Array.isArray(post.likedBy) && post.likedBy.includes(state.user.uid);
  try {
    await updateDoc(doc(db, "posts", id), {
      likes: increment(liked ? -1 : 1),
      likedBy: liked ? arrayRemove(state.user.uid) : arrayUnion(state.user.uid)
    });

    state.posts = state.posts.map(p => {
      if (p.id === id) {
        const newLikedBy = liked ? p.likedBy.filter(uid => uid !== state.user.uid) : [...(p.likedBy || []), state.user.uid];
        return { ...p, likes: Number(p.likes || 0) + (liked ? -1 : 1), likedBy: newLikedBy };
      }
      return p;
    });

    if (!liked && post.uid && post.uid !== state.user.uid) {
      try {
        await addDoc(collection(db, "users", post.uid, "notifications"), {
          type: "like",
          actorUid: state.user.uid,
          actorName: state.profile.displayName || state.profile.username || "Someone",
          targetId: id,
          text: `${state.profile.displayName || state.profile.username || "Someone"} liked your post.`,
          read: false,
          createdAt: serverTimestamp()
        });
      } catch (notifErr) {
        console.warn("Could not create like notification:", notifErr);
      }
    }
  } catch (e) {
    toast(friendly(e));
  }
}

export async function savePost(id) {
  const post = state.posts.find(x => x.id === id);
  if (!post) return;
  const saved = Array.isArray(post.savedBy) && post.savedBy.includes(state.user.uid);
  try {
    await updateDoc(doc(db, "posts", id), {
      savedBy: saved ? arrayRemove(state.user.uid) : arrayUnion(state.user.uid)
    });
    state.posts = state.posts.map(p => {
      if (p.id === id) {
        const newSavedBy = saved ? p.savedBy.filter(uid => uid !== state.user.uid) : [...(p.savedBy || []), state.user.uid];
        return { ...p, savedBy: newSavedBy };
      }
      return p;
    });
    toast(saved ? "Removed from saved posts." : "Saved to your vault 🔖");
  } catch (e) {
    toast(friendly(e));
  }
}

export async function sharePost(id) {
  const post = state.posts.find(x => x.id === id);
  if (!post) return;
  const text = `${post.username || "Someone"} on Marvel Chat:\n\n${post.text}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Marvel Chat", text });
    } else {
      await navigator.clipboard.writeText(text);
      toast("Post copied to clipboard 📋");
    }
  } catch (e) {
    if (e?.name !== "AbortError") toast("Could not share this post.");
  }
}

export async function showComments(id) {
  const post = state.posts.find(x => x.id === id);
  showModal(
    "Comments",
    `
      <div id="commentsList" class="list"><div class="empty">Loading comments…</div></div>
      <div style="height:14px"></div>
      <textarea class="textarea" id="commentText" placeholder="Write a comment…"></textarea>
      <button class="btn btn-primary btn-block" id="addComment" style="margin-top:8px">Add comment</button>
    `
  );

  try {
    const snap = await getDocs(query(collection(db, "posts", id, "comments"), orderBy("createdAt", "asc"), limit(50)));
    const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const list = document.getElementById("commentsList");
    if (list) {
      list.className = comments.length ? "list" : "empty";
      list.innerHTML = comments.length
        ? comments.map(c => `
            <div class="list-item">
              <strong>${escapeHtml(c.username || "User")}</strong>
              <div>${escapeHtml(c.text || "")}</div>
              <div class="small">${escapeHtml(formatDate(c.createdAt))}</div>
            </div>
          `).join("")
        : "No comments yet. Start the conversation.";
    }
  } catch (e) {
    const list = document.getElementById("commentsList");
    if (list) list.innerHTML = `<div class="status error">${escapeHtml(friendly(e))}</div>`;
  }

  document.getElementById("addComment")?.addEventListener("click", async () => {
    const input = document.getElementById("commentText");
    const text = input.value.trim();
    if (!text) { toast("Write a comment first."); return; }
    try {
      const actorName = state.profile.displayName || state.profile.username || "User";
      await addDoc(collection(db, "posts", id, "comments"), {
        uid: state.user.uid,
        username: actorName,
        text,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, "posts", id), { comments: increment(1) });
      
      if (post && post.uid && post.uid !== state.user.uid) {
        try {
          await addDoc(collection(db, "users", post.uid, "notifications"), {
            type: "comment",
            actorUid: state.user.uid,
            actorName,
            targetId: id,
            text: `${actorName} commented on your post.`,
            read: false,
            createdAt: serverTimestamp()
          });
        } catch (notifErr) {
          console.warn("Could not create comment notification:", notifErr);
        }
      }

      input.value = "";
      toast("Comment added 💬");
      showComments(id);
    } catch (e) {
      toast(friendly(e));
    }
  });
}

FILE: js/features/chat.js
```javascript
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
