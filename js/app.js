import { initRouter, navigate } from './router.js';

class AppController {
  constructor() {
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    
    console.info('[AppController] Initializing Marvel Chat V2 application shell...');
    
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-route]');
      if (target) {
        e.preventDefault();
        const route = target.getAttribute('data-route');
        if (route) {
          navigate(route);
        }
      }
    });

    initRouter();

    this.initialized = true;
    console.info('[AppController] Application shell successfully initialized.');
  }
}

const app = new AppController();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

export { app };
