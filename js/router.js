import { state } from './state.js';
import { initializeHome } from './features /home.js';

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

  if (currentPage === 'home') {
    initializeHome();
  } else {
    mainContent.innerHTML = `
      <div class="page-placeholder">
        <h2>${currentPage} View</h2>
        <p>${currentPage.charAt(0).toUpperCase() + currentPage.slice(1)} feature module pending extraction.</p>
      </div>
    `;
  }

  document.querySelectorAll('[data-route]').forEach((btn) => {
    const targetPage = btn.getAttribute('data-route');
    if (targetPage === currentPage) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}
