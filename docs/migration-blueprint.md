# Marvel Chat V2 — Functional & Migration Blueprint

## 1. Purpose

Marvel Chat V2 is a controlled production modernization of the existing Marvel Chat application.

The existing Marvel Chat application is already functional and has real users.

Therefore, V2 must not be treated as a blind rewrite.

The existing production application is the functional reference.

V2 must preserve verified existing behavior while improving architecture, reliability, security, usability, and feature depth.

---

# 2. Production Safety Rule

The existing Marvel Chat production repository must remain untouched during V2 development.

V2 is developed in:

marvel-chat-v2

The existing production application remains the live application for current users until V2 has passed the required testing gates.

No experimental V2 deployment should replace the existing production application.

No V2 migration should destructively modify existing production Firestore data.

---

# 3. Current V1 Reference

The V1 application currently consists primarily of:

- index.html
- firebaseconfig.js
- manifest.json
- serviceworker.js

The current index.html is a large monolithic application containing:

- HTML
- CSS
- application state
- Firebase initialization
- authentication
- Firestore operations
- routing
- rendering
- Home
- Chat
- TimeTrust
- Marketplace
- Profile
- Notifications
- Search
- Settings
- PWA integration

The V2 migration must separate these responsibilities.

---

# 4. V1 Functional Baseline

The following existing capabilities are considered part of the V1 functional baseline.

## Authentication

Existing capabilities include:

- account creation
- sign in
- sign out
- persistent authentication state
- user profile initialization
- profile information
- country information
- onboarding behavior

These capabilities must not disappear during migration.

---

# 5. Home / Social Feed

Existing Home functionality includes:

- feed rendering
- post creation
- text posts
- likes
- comments
- saved posts
- sharing
- post timestamps
- user information
- real-time feed behavior

V2 must preserve these capabilities.

V2 will additionally introduce:

- photo posts
- media preview before publishing
- post editing
- post deletion
- improved post cards
- improved comments
- improved interaction states
- better loading states
- better empty states
- better error states
- improved mobile experience

Photo architecture must be designed before implementation.

Images must not be stored as Base64 strings inside Firestore documents.

---

# 6. Chat

Existing Chat functionality includes:

- conversation discovery
- user search
- conversation creation
- real-time conversation updates
- real-time message updates
- message sending
- conversation preview
- timestamps
- automatic message scrolling

The current implementation writes messages to:

conversations/{conversationId}/messages

and updates the parent conversation with the latest message preview and updated timestamp.

V2 must preserve this data model unless a documented migration decision changes it.

V2 Chat upgrades:

- edit own message
- delete own message
- edited-message indicator
- message action menu
- copy message
- improved unread indicators
- improved conversation list
- conversation search
- safer conversation management
- better loading states
- better error handling
- better mobile chat interface

Important:

Deleting a conversation must not accidentally destroy another user's message history.

Conversation deletion behavior must be explicitly designed before implementation.

---

# 7. Marvel Market

Marvel Market is a primary V2 development area.

The existing V1 marketplace supports:

- listings
- listing title
- description
- price
- category
- seller information
- country
- active listing state
- search
- category filtering
- listing creation

V2 will transform Marvel Market into a more complete online marketplace.

Target capabilities:

## Listing

- title
- description
- price
- category
- condition
- location
- seller
- images
- status
- createdAt
- updatedAt

## Seller actions

- create listing
- edit listing
- delete listing
- mark as sold
- reactivate listing
- manage own listings

## Buyer actions

- search
- category filtering
- price filtering
- location filtering
- condition filtering
- view listing details
- save listing
- contact seller
- share listing

## Marketplace experience

- dedicated listing details
- seller profile preview
- image gallery
- marketplace search
- filters
- sorting
- active/sold state
- empty states
- loading states
- error states

Marketplace ownership must be enforced by Firestore Security Rules.

---

# 8. TimeTrust

TimeTrust is not a primary V2 expansion area.

Existing TimeTrust functionality should remain functional.

The initial V2 objective is:

- preserve existing functionality
- modularize the feature
- avoid unnecessary redesign

Major TimeTrust expansion is deferred.

---

# 9. Profile

Profile functionality should be preserved and modularized.

Target responsibilities:

- profile information
- display name
- username
- bio
- country
- profile statistics
- saved content
- user settings access

Future profile improvements must not compromise existing user data.

---

# 10. Notifications

Notifications should become a dedicated V2 module.

Responsibilities:

- notification retrieval
- real-time notification updates where appropriate
- unread state
- notification display
- notification cleanup
- safe user ownership

Only authorized users may access their notification data.

---

# 11. Search

Search must become a reusable feature rather than scattered search logic.

V2 should separate:

- global search state
- marketplace search
- user search
- conversation search
- future searchable content

Search behavior must not unnecessarily read the entire database.

---

# 12. Application State

The current V1 application already maintains centralized state.

V2 will extract state into:

js/state.js

State must contain shared application state only.

Feature modules must not create uncontrolled global state.

---

# 13. Router

Navigation must be separated from feature rendering.

Target:

js/router.js

The router controls:

- current page
- navigation
- route transitions
- active navigation state

Feature modules control feature behavior.

---

# 14. Firebase Architecture

Firebase responsibilities must be separated from UI code.

Target:

js/firebase/config.js
js/firebase/auth.js
js/firebase/firestore.js
js/firebase/listeners.js

Responsibilities:

## config.js

Firebase application initialization and configuration.

## auth.js

Authentication operations.

## firestore.js

Reusable Firestore operations.

## listeners.js

Controlled real-time listener lifecycle.

Every listener must have a corresponding unsubscribe path.

---

# 15. Data Compatibility

Existing production Firestore collections must not be renamed or deleted during initial V2 migration.

Known existing collections include:

- users
- posts
- conversations
- skills
- skillRequests
- trades
- listings

Known nested collections include:

- users/{uid}/notifications
- posts/{postId}/comments
- posts/{postId}/likes
- conversations/{conversationId}/messages

Existing document fields must be preserved unless a migration is explicitly approved.

Any new fields must be additive whenever possible.

---

# 16. Firestore Security

Firestore Security Rules are part of the backend security boundary.

Frontend checks are not authorization.

V2 must preserve ownership protections for:

- users
- posts
- comments
- likes
- conversations
- messages
- skills
- skill requests
- trades
- marketplace listings
- notifications

Any new feature requiring new Firestore paths must include corresponding Security Rule design before production use.

---

# 17. Media Architecture

Photo functionality is a V2 feature.

Before implementing photo uploads, the project must define:

- where images are stored
- how upload authorization works
- maximum image size
- accepted image types
- image compression/resizing strategy
- image metadata
- deletion behavior
- security rules
- marketplace image limits
- post image limits

The application must not store large images as Base64 strings inside Firestore documents.

---

# 18. CSS Architecture

The current V1 application contains a large embedded CSS system inside index.html.

V2 must extract styling into:

css/base.css
css/layout.css
css/components.css
css/responsive.css

Responsibilities:

base.css
- reset
- typography
- variables
- theme tokens
- global defaults

layout.css
- application shell
- page layout
- grids
- navigation
- structural layout

components.css
- buttons
- cards
- forms
- modals
- avatars
- alerts
- post cards
- chat components
- marketplace components

responsive.css
- mobile adaptations
- tablet adaptations
- larger-screen adaptations

---

# 19. Reusable Components

Target:

js/components/

Initial components:

- modal.js
- toast.js
- loader.js
- avatar.js

Additional components may be added when justified.

Components must remain reusable and must not contain unrelated business logic.

---

# 20. Feature Modules

Target:

js/features/

Initial modules:

- home.js
- chat.js
- market.js
- profile.js
- notifications.js
- search.js
- settings.js
- timetrust.js

Each feature module must own its feature-specific rendering and behavior.

Cross-feature logic belongs in appropriate shared services.

---

# 21. PWA Architecture

The existing application already uses:

- manifest.json
- serviceworker.js
- standalone PWA display
- icons
- caching
- service-worker activation
- network-first behavior

V2 must preserve PWA functionality.

PWA logic will eventually be separated into:

pwa/install.js
pwa/updates.js

The service worker itself remains separate.

---

# 22. PWA Update System

The professional update system is deferred until the modular application is stable.

Target behavior:

1. New application version is deployed.
2. Service worker detects the new version.
3. New worker installs.
4. Application detects that an update is available.
5. User receives an update notification.
6. User chooses Update.
7. New service worker activates safely.
8. Application reloads.
9. New version becomes active.

The update system must not be introduced before basic application stability is established.

---

# 23. Target V2 Structure

marvel-chat-v2/

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
├── pwa/
│   ├── install.js
│   └── updates.js
│
└── docs/
    ├── architecture.md
    └── migration-blueprint.md

---

# 24. Migration Strategy

The migration must occur in controlled stages.

Stage 1:
Understand V1.

Stage 2:
Extract CSS.

Stage 3:
Extract Firebase configuration and services.

Stage 4:
Extract application state.

Stage 5:
Extract reusable components.

Stage 6:
Extract routing and application shell.

Stage 7:
Extract Home.

Stage 8:
Extract Chat.

Stage 9:
Extract Marketplace.

Stage 10:
Extract Profile, Notifications, Search, Settings and TimeTrust.

Stage 11:
Integrate PWA.

Stage 12:
Test functional parity.

Stage 13:
Implement approved feature upgrades.

Stage 14:
Security review.

Stage 15:
Performance review.

Stage 16:
Production acceptance testing.

Stage 17:
Controlled production deployment.

---

# 25. Functional Parity Requirement

Before V2 is considered ready for production, existing verified V1 functionality must continue to work.

Minimum parity areas:

- authentication
- profile
- Home
- posts
- likes
- comments
- saved posts
- sharing
- Chat
- conversations
- messages
- TimeTrust
- Marketplace
- notifications
- search
- settings
- theme
- PWA installation

A feature must not disappear simply because the code has been modularized.

---

# 26. Testing Gates

Every major migration stage must pass testing before the next stage.

Testing categories:

## Authentication

- signup
- login
- logout
- session restoration

## Home

- feed loading
- create post
- like
- comment
- save
- share
- real-time update

## Chat

- create conversation
- open conversation
- send message
- receive message
- real-time update
- message editing
- message deletion

## Marketplace

- create listing
- edit listing
- delete listing
- search
- filtering
- listing details
- seller contact
- sold state

## PWA

- installation
- startup
- cache behavior
- update behavior

## Security

- unauthorized reads
- unauthorized writes
- ownership violations
- cross-user conversation access
- cross-user listing modification

---

# 27. V2 Feature Priority

Priority A — Required foundation:

- modular architecture
- Firebase separation
- state separation
- routing separation
- CSS separation
- listener lifecycle management
- functional parity

Priority B — Core product upgrades:

- Home photo posts
- post editing
- post deletion
- Chat editing
- Chat deletion
- improved unread behavior
- improved conversation management

Priority C — Major Marketplace upgrade:

- listing images
- listing details
- seller information
- conditions
- location
- search
- filters
- saved listings
- seller contact
- edit listing
- delete listing
- sold state
- better marketplace experience

Priority D — Later:

- PWA update notification
- advanced notifications
- further TimeTrust improvements
- additional marketplace features

---

# 28. Gemini Development Rules

Gemini must not:

- rewrite the entire application blindly
- delete existing functionality without approval
- invent Firestore collections
- invent Firebase fields
- change production data
- modify production Firestore Rules without explicit instruction
- place all logic back into index.html
- create circular module dependencies
- use uncontrolled global variables
- duplicate Firebase initialization
- create zombie onSnapshot listeners
- store large images as Base64 in Firestore
- introduce unnecessary dependencies
- change the production application directly

Gemini must:

- work incrementally
- follow this architecture
- preserve existing behavior
- explain structural changes
- maintain module boundaries
- ensure imports match exports
- ensure every referenced file exists
- test each stage before moving forward
- identify assumptions instead of silently inventing behavior

---

# 29. Definition of Done

Marvel Chat V2 is not complete merely because the application loads.

A stage is complete only when:

- required files exist
- imports and exports are valid
- Firebase integration works
- Firestore operations work
- real-time listeners work
- existing functionality works
- new functionality works
- errors are handled
- mobile UI works
- security rules support the feature
- no known regression remains

---

# 30. Core Principle

Marvel Chat V2 is a real product.

Therefore:

SAFE MIGRATION > FAST MIGRATION

FUNCTIONALITY > DEMO APPEARANCE

TESTED CHANGES > BLIND REWRITES

REAL USERS > EXPERIMENTAL DEPLOYMENTS

MODULAR ARCHITECTURE > MONOLITHIC CODE

SECURITY > FRONTEND CONVENIENCE

The existing production application remains protected until V2 has earned the right to replace it.
