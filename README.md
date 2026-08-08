# marvel-chat-v2
Marvel Chat V2 — production-focused social, real-time messaging, and marketplace PWA.
# Marvel Chat V2

Marvel Chat V2 is a production-focused social platform and Progressive Web App designed around:

- real-time messaging
- social interaction
- user profiles
- marketplace functionality
- notifications
- search
- TimeTrust functionality
- PWA installation and update handling

Marvel Chat V2 is being rebuilt with a structured modular architecture rather than as one large JavaScript file, moving away from legacy monolith constraints into a clean, maintainable browser-based architecture.

---

## Current Project Status

The project is currently in the **architecture and foundation stage**. The directory structure, file placeholders, styling layers, and modular JavaScript entry points have been established. 

*Note: The current files are architectural placeholders. Core features, Firebase integrations, and functional logic are currently being structured and have not yet been fully implemented.*

---

## Architecture

Marvel Chat V2 abandons single-file limitations in favor of a strictly separated, modular vanilla JavaScript and CSS architecture. It runs natively in the browser without requiring build steps, bundlers, or frameworks like React or Vue.

---

## Directory Structure

```text
marvel-chat-v2
│
├── .gitignore
├── README.md
├── index.html
├── manifest.json
├── serviceworker.js
│
├── css
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   └── responsive.css
│
├── js
│   ├── app.js
│   ├── state.js
│   ├── router.js
│   │
│   ├── firebase
│   │   ├── config.js
│   │   ├── auth.js
│   │   ├── firestore.js
│   │   └── listeners.js
│   │
│   ├── features
│   │   ├── home.js
│   │   ├── chat.js
│   │   ├── market.js
│   │   ├── profile.js
│   │   ├── notifications.js
│   │   ├── search.js
│   │   ├── settings.js
│   │   └── timetrust.js
│   │
│   └── components
│       ├── modal.js
│       ├── toast.js
│       ├── loader.js
│       └── avatar.js
│
├── pwa
│   ├── install.js
│   └── updates.js
│
└── docs
    ├── architecture.md
    └── migration-blueprint.md
