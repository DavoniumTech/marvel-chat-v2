# Marvel Chat V2 — Production Architecture

## 1. Project Purpose

Marvel Chat V2 is the controlled modernization of the existing Marvel Chat application.

The existing Marvel Chat application is already in production and has real users.

Therefore, V2 must be developed separately from the existing production application.

The existing production application must remain stable while V2 is being developed.

---

## 2. Production Protection

The existing Marvel Chat repository is the production baseline.

V2 development must not directly modify the production repository during the development and stabilization phase.

The production Firebase project and its real user data must also be protected.

No experimental V2 feature should be allowed to damage production data.

---

## 3. Development Repository

Repository:

marvel-chat-v2

This repository is the development workspace for Marvel Chat V2.

V2 will be tested independently before production deployment.

---

## 4. Core Product Areas

Marvel Chat V2 consists of:

1. Home / Social Feed
2. Real-Time Private Chat
3. Marvel Market
4. User Profiles
5. Notifications
6. Search
7. Settings
8. TimeTrust
9. PWA infrastructure

The primary V2 development priorities are:

1. Architecture stabilization
2. Home
3. Chat
4. Marvel Market
5. Notifications
6. Security hardening
7. PWA update system

---

## 5. Architecture Principle

The current Marvel Chat application contains a very large monolithic index.html.

V2 must gradually separate responsibilities into maintainable modules.

The application must not depend on one giant index.html file for all application logic.

The target architecture separates:

- HTML
- CSS
- application state
- routing
- Firebase services
- feature logic
- reusable UI components
- PWA infrastructure

---

## 6. Target Structure

```text
marvel-chat-v2/
│
├── index.html
├── manifest.json
├── serviceworker.js
├── .gitignore
│
├── css/
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   └── responsive.css
│
├── js/
│   ├── app.js
│   ├── state.js
│   ├── router.js
│   │
│   ├── firebase/
│   │   ├── config.js
│   │   ├── auth.js
│   │   ├── firestore.js
│   │   └── listeners.js
│   │
│   ├── features/
│   │   ├── home.js
│   │   ├── chat.js
│   │   ├── market.js
│   │   ├── profile.js
│   │   ├── notifications.js
│   │   ├── search.js
│   │   ├── settings.js
│   │   └── timetrust.js
│   │
│   └── components/
│       ├── modal.js
│       ├── toast.js
│       ├── loader.js
│       └── avatar.js
│
└── docs/
    └── architecture.md
