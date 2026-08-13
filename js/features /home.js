import { state, escapeHtml, initials, formatDate, friendly } from "../state.js";
import { db, collection, addDoc, updateDoc, doc, serverTimestamp, increment, arrayUnion, arrayRemove, getDocs, query, orderBy, limit } from "../firebase/firestore.js";
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

  return `
    <article class="card post">
      <div class="post-head">
        <div class="avatar">${escapeHtml(initials(p.username))}</div>
        <div class="profile-meta">
          <strong>${escapeHtml(p.username || "User")}</strong>
          <span class="small">${escapeHtml(formatDate(p.createdAt))}</span>
        </div>
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
      await addDoc(collection(db, "posts"), {
        uid: state.user.uid,
        username: state.profile.displayName || state.profile.username || "User",
        text,
        likes: 0,
        comments: 0,
        likedBy: [],
        savedBy: [],
        createdAt: serverTimestamp()
      });
      closeModal();
      toast("Posted successfully 🚀");
    } catch (e) {
      toast(friendly(e));
      btn.disabled = false;
      btn.textContent = "Publish 🚀";
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
  } catch (e) {
    document.getElementById("commentsList").innerHTML = `<div class="status error">${escapeHtml(friendly(e))}</div>`;
  }

  document.getElementById("addComment")?.addEventListener("click", async () => {
    const input = document.getElementById("commentText");
    const text = input.value.trim();
    if (!text) { toast("Write a comment first."); return; }
    try {
      await addDoc(collection(db, "posts", id, "comments"), {
        uid: state.user.uid,
        username: state.profile.displayName || state.profile.username || "User",
        text,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, "posts", id), { comments: increment(1) });
      input.value = "";
      toast("Comment added 💬");
      showComments(id);
    } catch (e) {
      toast(friendly(e));
    }
  });
}
