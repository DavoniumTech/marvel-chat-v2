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
