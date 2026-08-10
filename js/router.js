/*
 * Marvel Chat V2
 *
 * Application router.
 *
 * Routing controls navigation.
 * Feature modules control feature behavior.
 */

export function navigate(page) {
    console.log(`Navigating to: ${page}`);
}



import { state } from './state.js';

const VALID_PAGES = [
  'home',
  'chat',
  'timetrust',
  'market',
  'profile',
  'notifications',
  'search',
  'settings'
];

export function navigate(page) {
  let targetPage = page;
  if (!VALID_PAGES.includes(targetPage)) {
    targetPage = 'home';
  }

  state.page = targetPage;
  
  window.dispatchEvent(new CustomEvent('app-route-changed', { detail: { page: targetPage } }));
  
  try {
    const historyState = { page: targetPage };
    const url = `#${targetPage}`;
    window.history.pushState(historyState, '', url);
  } catch (e) {
    // Fallback if pushState is restricted
  }

  renderCurrentRoute();
}

export function initRouter() {
  window.addEventListener('popstate', () => {
    const pageFromHash = window.location.hash.replace('#', '');
    if (VALID_PAGES.includes(pageFromHash)) {
      state.page = pageFromHash;
      window.dispatchEvent(new CustomEvent('app-route-changed', { detail: { page: pageFromHash } }));
    } else {
      state.page = 'home';
      window.dispatchEvent(new CustomEvent('app-route-changed', { detail: { page: 'home' } }));
    }
    renderCurrentRoute();
  });

  const initialHash = window.location.hash.replace('#', '');
  if (VALID_PAGES.includes(initialHash)) {
    state.page = initialHash;
  } else {
    state.page = 'home';
  }

  renderCurrentRoute();
}

function renderCurrentRoute() {
  const mainContent = document.getElementById('mainContent') || document.getElementById('app');
  if (!mainContent) return;

  const currentPage = state.page || 'home';

  mainContent.innerHTML = `
    <div class="page-placeholder">
      <h2>${currentPage} View</h2>
      <p>Stage 6 Application Shell & Router Active. Feature module pending extraction.</p>
    </div>
  `;

  document.querySelectorAll('[data-route]').forEach((btn) => {
    const targetPage = btn.getAttribute('data-route');
    if (targetPage === currentPage) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}
