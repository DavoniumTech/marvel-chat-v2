// GitHub Pages deployment synchronization marker.



import { state } from '../state.js';
import { db } from '../firebase/config.js';
import { 
  collection, 
  doc, 
  updateDoc, 
  addDoc, 
  query, 
  orderBy, 
  getDocs, 
  serverTimestamp, 
  increment, 
  arrayUnion, 
  arrayRemove 
} from '../firebase/firestore.js';
import { createListener } from '../firebase/listeners.js';
import { renderLoader } from '../components/loader.js';
import { showToast } from '../components/toast.js';
import { showModal } from '../components/modal.js';
import { renderAvatar } from '../components/avatar.js';

let currentPostsUnsub = null;
let eventDelegationInitialized = false;

export function initializeHome() {
  renderHome();
  setupHomeListeners();
  setupEventDelegation();
}

export function renderHome() {
  const container = document.getElementById('mainContent') || document.getElementById('app');
  if (!container) return;

  container.innerHTML = `
    <div class="home-container">
      <div class="post-composer-card card">
        <form id="postForm">
          <textarea id="postInput" placeholder="What's happening?" rows="3" required></textarea>
          <div class="composer-actions">
            <button type="submit" class="btn btn-primary">Post</button>
          </div>
        </form>
      </div>

      <div class="feed-header">
        <h3>Feed</h3>
      </div>

      <div id="feedContainer" class="feed-list">
        ${!state.posts || state.posts.length === 0 ? `<div class="loading-wrapper">${renderLoader()}</div>` : renderPostsList()}
      </div>
    </div>
  `;
}

function renderPostsList() {
  if (!state.posts || state.posts.length === 0) {
    return `<p class="empty-state">No posts found.</p>`;
  }

  return state.posts.map(post => {
    const authorName = post.displayName || post.username || 'Anonymous';
    const timestamp = post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString() : 'Just now';
    const textContent = escapeHtml(post.text || '');
    const likesCount = typeof post.likes === 'number' ? post.likes : (Array.isArray(post.likedBy) ? post.likedBy.length : 0);
    const isLiked = state.user && Array.isArray(post.likedBy) && post.likedBy.includes(state.user.uid);

    return `
      <div class="post-card card" data-id="${post.id}">
        <div class="post-header">
          <div class="post-author-info">
            ${renderAvatar(authorName, 'avatar-sm')}
            <div>
              <h4 class="post-author-name">${escapeHtml(authorName)}</h4>
              <span class="post-timestamp">${timestamp}</span>
            </div>
          </div>
        </div>
        <div class="post-body">
          <p>${textContent}</p>
        </div>
        <div class="post-footer">
          <button class="btn-action like-btn ${isLiked ? 'active' : ''}" data-id="${post.id}" type="button">
            ❤️ <span class="like-count">${likesCount}</span>
          </button>
          <button class="btn-action comment-btn" data-id="${post.id}" type="button">
            💬 Comments
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function setupHomeListeners() {
  if (typeof currentPostsUnsub === 'function') {
    currentPostsUnsub();
    currentPostsUnsub = null;
  }

  try {
    const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    
    currentPostsUnsub = createListener(postsQuery, (snapshot) => {
      const postsData = [];
      snapshot.forEach(docSnap => {
        postsData.push({ id: docSnap.id, ...docSnap.data() });
      });

      state.posts = postsData;

      const feedContainer = document.getElementById('feedContainer');
      if (feedContainer) {
        feedContainer.innerHTML = renderPostsList();
      }
    }, (error) => {
      console.error('[Home] Error listening to posts feed:', error);
      showToast('Error loading live feed.');
    });
  } catch (err) {
    console.error('[Home] Failed to set up posts listener:', err);
  }
}

function setupEventDelegation() {
  if (eventDelegationInitialized) return;
  eventDelegationInitialized = true;

  document.addEventListener('submit', async (e) => {
    if (state.page !== 'home') return;

    if (e.target && e.target.id === 'postForm') {
      e.preventDefault();
      const input = document.getElementById('postInput');
      if (!input) return;

      const text = input.value.trim();
      if (!text) return;

      if (!state.user) {
        showToast('You must be signed in to post.');
        return;
      }

      try {
        input.disabled = true;
        await addDoc(collection(db, 'posts'), {
          text: text,
          uid: state.user.uid,
          username: state.profile?.username || state.user.email?.split('@')[0] || 'user',
          displayName: state.profile?.displayName || state.user.displayName || 'Member',
          createdAt: serverTimestamp(),
          likes: 0,
          likedBy: [],
          savedBy: []
        });

        input.value = '';
        showToast('Post created successfully!');
      } catch (error) {
        console.error('[Home] Error creating post:', error);
        showToast('Failed to create post.');
      } finally {
        input.disabled = false;
      }
    } else if (e.target && e.target.id === 'commentForm') {
      e.preventDefault();
      const postId = e.target.getAttribute('data-post-id');
      if (!postId) return;

      const input = document.getElementById('commentInput');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      if (!state.user) {
        showToast('Sign in required to comment.');
        return;
      }

      try {
        await addDoc(collection(db, 'posts', postId, 'comments'), {
          text: text,
          uid: state.user.uid,
          username: state.profile?.username || state.user.email?.split('@')[0] || 'user',
          displayName: state.profile?.displayName || state.user.displayName || 'Member',
          createdAt: serverTimestamp()
        });

        input.value = '';
        showToast('Comment added!');
        handleOpenComments(postId);
      } catch (err) {
        console.error('[Home] Error adding comment:', err);
        showToast('Failed to add comment.');
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (state.page !== 'home') return;

    const likeBtn = e.target.closest('.like-btn');
    if (likeBtn) {
      const postId = likeBtn.getAttribute('data-id');
      if (postId) handleLikePost(postId);
      return;
    }

    const commentBtn = e.target.closest('.comment-btn');
    if (commentBtn) {
      const postId = commentBtn.getAttribute('data-id');
      if (postId) handleOpenComments(postId);
      return;
    }
  });
}

async function handleLikePost(postId) {
  if (!state.user) {
    showToast('Sign in required to like posts.');
    return;
  }

  const post = state.posts.find(p => p.id === postId);
  if (!post) return;

  const userId = state.user.uid;
  const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
  const isLiked = likedBy.includes(userId);

  try {
    const postRef = doc(db, 'posts', postId);
    if (isLiked) {
      await updateDoc(postRef, {
        likedBy: arrayRemove(userId),
        likes: increment(-1)
      });
    } else {
      await updateDoc(postRef, {
        likedBy: arrayUnion(userId),
        likes: increment(1)
      });
    }
  } catch (error) {
    console.error('[Home] Error updating like:', error);
    showToast('Failed to update like.');
  }
}

async function handleOpenComments(postId) {
  const modalBody = `
    <div class="comments-container">
      <div id="modalCommentsList" class="comments-list">
        ${renderLoader()}
      </div>
      <form id="commentForm" class="comment-form" data-post-id="${postId}">
        <input type="text" id="commentInput" placeholder="Write a comment..." required />
        <button type="submit" class="btn btn-primary">Send</button>
      </form>
    </div>
  `;

  showModal('Comments', modalBody);

  const commentsListEl = document.getElementById('modalCommentsList');
  try {
    const commentsQuery = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(commentsQuery);

    if (snapshot.empty) {
      commentsListEl.innerHTML = `<p class="empty-state">No comments yet.</p>`;
    } else {
      let html = '';
      snapshot.forEach(docSnap => {
        const comment = docSnap.data();
        const author = comment.displayName || comment.username || 'User';
        html += `
          <div class="comment-item">
            <strong>${escapeHtml(author)}</strong>
            <p>${escapeHtml(comment.text || '')}</p>
          </div>
        `;
      });
      commentsListEl.innerHTML = html;
    }
  } catch (error) {
    console.error('[Home] Error loading comments:', error);
    if (commentsListEl) {
      commentsListEl.innerHTML = `<p class="error-state">Failed to load comments.</p>`;
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
