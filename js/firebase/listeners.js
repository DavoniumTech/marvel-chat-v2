import { db } from "./config.js";
import { collection, query, orderBy, limit, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state } from "../state.js";

export function sub(name, q, handler) {
  state.unsubs[name]?.();
  state.unsubs[name] = onSnapshot(q, s => handler(s), e => {
    console.error(name, e);
  });
}

export function subscribeAll(renderCallback) {
  sub("posts", query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50)), s => {
    state.posts = s.docs.map(d => ({ id: d.id, ...d.data() }));
    if (state.page === "home") renderCallback();
  });

  sub("conversations", query(collection(db, "conversations"), where("participants", "array-contains", state.user.uid), limit(50)), s => {
    state.conversations = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
      const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return bTime - aTime;
    });
    if (state.activeConversation) {
      const current = state.conversations.find(c => c.id === state.activeConversation.id);
      if (current) state.activeConversation = current;
    }
    if (state.page === "chat" && !state.activeConversation) renderCallback();
  });

  sub("listings", query(collection(db, "listings"), where("status", "==", "active"), orderBy("createdAt", "desc"), limit(50)), s => {
    state.listings = s.docs.map(d => ({ id: d.id, ...d.data() }));
    if (state.page === "market") renderCallback();
  });

  sub("skills", query(collection(db, "skills"), orderBy("createdAt", "desc"), limit(50)), s => {
    state.skills = s.docs.map(d => ({ id: d.id, ...d.data() }));
    if (state.page === "timetrust") renderCallback();
  });

  sub("requests", query(collection(db, "skillRequests"), orderBy("createdAt", "desc"), limit(50)), s => {
    state.requests = s.docs.map(d => ({ id: d.id, ...d.data() }));
    if (state.page === "timetrust") renderCallback();
  });
}
