import {
state,
escapeHtml,
initials,
formatDate,
friendly
} from "../state.js";
import {
db,
collection,
doc,
getDoc,
setDoc,
updateDoc,
deleteDoc,
addDoc,
query,
where,
orderBy,
limit,
getDocs,
onSnapshot,
serverTimestamp
} from "../firebase/firestore.js";
import {
showModal,
closeModal
} from "../components/modal.js";
import {
toast
} from "../components/toast.js";
​/* =========================================================
INTERNAL APP RENDER BRIDGE
========================================================= */
let currentRenderApp = null;
​/* =========================================================
NEW CHAT
========================================================= */
export function showNewChat(renderApp) {
currentRenderApp =
typeof renderApp === "function"
? renderApp
: currentRenderApp;
​showModal(
"Start a new chat",
<div class="field"> <label>Enter the person's username</label> <input class="input" id="chatUsername" placeholder="username"> </div> <button class="btn btn-primary btn-block" id="findChatUser" > Find user </button> <div id="chatUserResult" style="margin-top:14px" ></div>
);
​document
.getElementById("findChatUser")
?.addEventListener(
"click",
async () => {
const username =
document
.getElementById("chatUsername")
?.value
.trim();
​const result =
document.getElementById(
"chatUserResult"
);
​if (!username) {
if (result) {
result.innerHTML =
<div class="status error">Enter a username.</div>;
}
return;
}
​if (result) {
result.innerHTML =
<div class="empty">Searching…</div>;
}
​try {
const snap =
await getDocs(
query(
collection(db, "users"),
where(
"username",
"==",
username
),
limit(5)
)
);
​if (snap.empty) {
if (result) {
result.innerHTML =
<div class="empty">No user found.</div>;
}
return;
}
​if (result) {
result.innerHTML =
snap.docs
.filter(
d =>
d.id !==
state.user.uid
)
.map(d => {
const u = {
id: d.id,
...d.data()
};
​return <div class="list-item"> <div class="profile-row"> <div class="avatar"> ${escapeHtml( initials( u.displayName || u.username ) )} </div> <div class="profile-meta"> <strong> ${escapeHtml( u.displayName || u.username || "User" )} </strong> <span class="small"> @${escapeHtml( u.username || "" )} </span> </div> <button class="btn btn-primary" data-start-chat="${escapeHtml( u.id )}" > Chat </button> </div> </div>;
})
.join("");
}
​result
?.querySelectorAll(
"[data-start-chat]"
)
.forEach(btn => {
btn.addEventListener(
"click",
async () => {
const uid =
btn.dataset.startChat;
​try {
const profileSnap =
await getDoc(
doc(
db,
"users",
uid
)
);
​if (
!profileSnap.exists()
) {
toast(
"User profile disappeared."
);
return;
}
​await createConversation(
{
uid,
...profileSnap.data()
},
renderApp
);
} catch (e) {
console.error(
"START CHAT ERROR:",
e
);
​toast(
friendly(e)
);
}
}
);
});
} catch (e) {
if (result) {
result.innerHTML = <div class="status error">${escapeHtml(friendly(e))}</div>;
}
}
}
);
}
​/* =========================================================
CREATE CONVERSATION
========================================================= */
export async function createConversation(
other,
renderApp
) {
currentRenderApp =
typeof renderApp === "function"
? renderApp
: currentRenderApp;
​try {
const existing =
state.conversations.find(
c =>
Array.isArray(
c.participants
) &&
c.participants.length === 2 &&
c.participants.includes(
state.user.uid
) &&
c.participants.includes(
other.uid
)
);
​if (existing) {
const existingPref =
state.conversationPreferences[
existing.id
] || {};
​if (existingPref.deleted) {
const prefRef =
doc(
db,
"users",
state.user.uid,
"conversationPreferences",
existing.id
);
​await setDoc(
prefRef,
{
deleted: false,
updatedAt:
serverTimestamp()
},
{ merge: true }
);
​state.conversationPreferences[
existing.id
] = {
...existingPref,
deleted: false
};
}
​closeModal();
​await openConversation(
existing,
renderApp
);
​return;
}
​const ref =
await addDoc(
collection(
db,
"conversations"
),
{
participants: [
state.user.uid,
other.uid
],
participantProfiles: {
[state.user.uid]: {
displayName:
state.profile.displayName ||
state.profile.username ||
"User",
username:
state.profile.username ||
""
},
[other.uid]: {
displayName:
other.displayName ||
other.username ||
"User",
username:
other.username ||
""
}
},
lastMessage: "",
updatedAt:
serverTimestamp(),
createdAt:
serverTimestamp()
}
);
​const localConversation = {
id: ref.id,
participants: [
state.user.uid,
other.uid
],
participantProfiles: {
[state.user.uid]: {
displayName:
state.profile.displayName ||
state.profile.username ||
"User",
username:
state.profile.username ||
""
},
[other.uid]: {
displayName:
other.displayName ||
other.username ||
"User",
username:
other.username ||
""
}
},
lastMessage: "",
updatedAt: null,
createdAt: null
};
​state.conversations = [
localConversation,
...state.conversations.filter(
c =>
c.id !==
ref.id
)
];
​closeModal();
​await openConversation(
localConversation,
renderApp
);
} catch (e) {
console.error(
"CREATE CONVERSATION ERROR:",
e
);
​toast(
friendly(e)
);
}
}
​/* =========================================================
OPEN CONVERSATION
========================================================= */
export async function openConversation(
conversation,
renderApp
) {
currentRenderApp =
typeof renderApp === "function"
? renderApp
: currentRenderApp;
​let c =
typeof conversation === "string"
? state.conversations.find(
x =>
x.id ===
conversation
)
: conversation;
​if (!c) {
toast(
"Conversation could not be opened."
);
return;
}
​const pref =
state.conversationPreferences[
c.id
];
​if (pref?.deleted) {
const prefRef =
doc(
db,
"users",
state.user.uid,
"conversationPreferences",
c.id
);
​try {
await setDoc(
prefRef,
{
deleted: false,
updatedAt:
serverTimestamp()
},
{ merge: true }
);
​state.conversationPreferences[
c.id
] = {
...pref,
deleted: false
};
} catch (e) {
console.warn(
"Could not restore conversation:",
e
);
}
}
​state.activeConversation = c;
state.messages = [];
​state.unsubs.messages?.();
state.unsubs.messages = null;
​state.unsubs.messages =
onSnapshot(
query(
collection(
db,
"conversations",
c.id,
"messages"
),
orderBy(
"createdAt",
"asc"
),
limit(100)
),
snap => {
state.messages =
snap.docs.map(
d => ({
id: d.id,
...d.data()
})
);
​const latest =
state.messages[
state.messages.length - 1
];
​if (latest) {
const index =
state.conversations.findIndex(
x =>
x.id ===
c.id
);
​if (index >= 0) {
state.conversations[
index
] = {
...state.conversations[
index
],
lastMessage:
latest.text ||
"",
updatedAt:
latest.createdAt ||
null
};
​state.activeConversation =
state.conversations[
index
];
}
}
​if (
state.page ===
"chat"
) {
if (
typeof renderApp ===
"function"
) {
renderApp();
} else if (
typeof currentRenderApp ===
"function"
) {
currentRenderApp();
}
​setTimeout(
() => {
const el =
document.getElementById(
"messages"
);
​if (el) {
el.scrollTop =
el.scrollHeight;
}
},
50
);
}
},
err => {
console.error(
"MESSAGE LISTENER ERROR:",
err
);
​toast(
friendly(err)
);
}
);
​state.page = "chat";
​if (
typeof renderApp ===
"function"
) {
renderApp();
} else if (
typeof currentRenderApp ===
"function"
) {
currentRenderApp();
}
​setTimeout(
() => {
const el =
document.getElementById(
"messages"
);
​if (el) {
el.scrollTop =
el.scrollHeight;
}
},
50
);
}
​/* =========================================================
SEND MESSAGE
========================================================= */
export async function sendMessage() {
const input =
document.getElementById(
"messageInput"
);
​const text =
input?.value.trim();
​if (
!text ||
!state.activeConversation
) {
return;
}
​const id =
state.activeConversation.id;
​try {
input.disabled = true;
​const docRef =
await addDoc(
collection(
db,
"conversations",
id,
"messages"
),
{
uid:
state.user.uid,
text,
createdAt:
serverTimestamp()
}
);
​await updateDoc(
doc(
db,
"conversations",
id
),
{
lastMessage: text,
updatedAt:
serverTimestamp()
}
);
​const newMsg = {
id: docRef.id,
uid:
state.user.uid,
text,
createdAt:
new Date()
};
​state.messages.push(
newMsg
);
​const recipientUid =
state.activeConversation
.participants
?.find(
x =>
x !==
state.user.uid
);
​const recipientPref =
state.conversationPreferences[id] || {};
​if (recipientUid && !recipientPref.muted) {
try {
const actorName =
state.profile.displayName ||
state.profile.username ||
"Someone";
​await addDoc(
collection(
db,
"users",
recipientUid,
"notifications"
),
{
type:
"message",
actorUid:
state.user.uid,
actorName,
targetId:
id,
text:
${actorName} sent you a message.,
read:
false,
createdAt:
serverTimestamp()
}
);
} catch (
notifErr
) {
console.warn(
"Could not create message notification:",
notifErr
);
}
}
​input.value = "";
} catch (e) {
console.error(
"SEND MESSAGE ERROR:",
e
);
​toast(
friendly(e)
);
} finally {
input.disabled =
false;
​input.focus();
}
}
​/* =========================================================
EDIT MESSAGE
========================================================= */
export async function editMessage(
messageId
) {
const msg =
state.messages.find(
m =>
m.id ===
messageId
);
​if (
!msg ||
msg.uid !==
state.user.uid
) {
return;
}
​showModal(
"Edit message",
<div class="field"> <textarea class="textarea" id="editMessageText" maxlength="5000" >${escapeHtml( msg.text || "" )}</textarea> </div> <button class="btn btn-primary btn-block" id="saveEditMessage" > Save </button>
);
​document
.getElementById(
"saveEditMessage"
)
?.addEventListener(
"click",
async () => {
const text =
document
.getElementById(
"editMessageText"
)
?.value
.trim();
​if (!text) {
toast(
"Message cannot be empty."
);
return;
}
​try {
await updateDoc(
doc(
db,
"conversations",
state.activeConversation.id,
"messages",
messageId
),
{
text,
editedAt:
serverTimestamp()
}
);
​state.messages =
state.messages.map(
m =>
m.id ===
messageId
? {
...m,
text,
editedAt:
new Date()
}
: m
);
​closeModal();
​toast(
"Message updated"
);
} catch (e) {
console.error(
"EDIT MESSAGE ERROR:",
e
);
​toast(
"Could not update message."
);
}
}
);
}
​/* =========================================================
DELETE MESSAGE
========================================================= */
export async function deleteMessage(
messageId
) {
const msg =
state.messages.find(
m =>
m.id ===
messageId
);
​if (
!msg ||
msg.uid !==
state.user.uid
) {
return;
}
​showModal(
"Delete this message?",
<p class="small"> This message will be permanently removed. </p> <div style=" display:flex; gap:10px; margin-top:16px; " > <button class="btn btn-ghost" id="cancelDelMsg" style="flex:1;" > Cancel </button> <button class="btn btn-danger" id="confirmDelMsg" style="flex:1;" > Delete </button> </div>
);
​document
.getElementById(
"cancelDelMsg"
)
?.addEventListener(
"click",
closeModal
);
​document
.getElementById(
"confirmDelMsg"
)
?.addEventListener(
"click",
async () => {
try {
await deleteDoc(
doc(
db,
"conversations",
state.activeConversation.id,
"messages",
messageId
)
);
​state.messages =
state.messages.filter(
m =>
m.id !==
messageId
);
​const latest =
state.messages[
state.messages.length - 1
];
​const newLastMsg =
latest
? latest.text
: "";
​await updateDoc(
doc(
db,
"conversations",
state.activeConversation.id
),
{
lastMessage:
newLastMsg,
updatedAt:
latest
? latest.createdAt
: serverTimestamp()
}
);
​closeModal();
​toast(
"Message deleted."
);
} catch (e) {
console.error(
"DELETE MESSAGE ERROR:",
e
);
​toast(
"Could not delete message."
);
}
}
);
}
​/* =========================================================
COPY SINGLE MESSAGE
========================================================= */
export async function copyMessage(
text
) {
try {
await navigator.clipboard.writeText(
text
);
​toast(
"Message copied 📋"
);
} catch (e) {
toast(
"Could not copy message."
);
}
}
​/* =========================================================
PIN / UNPIN CONVERSATION
========================================================= */
export async function togglePinConversation(
conversationId
) {
const isPinned =
!!state
.conversationPreferences[
conversationId
]?.pinned;
​try {
const prefRef =
doc(
db,
"users",
state.user.uid,
"conversationPreferences",
conversationId
);
​if (isPinned) {
await setDoc(
prefRef,
{
pinned: false,
updatedAt:
serverTimestamp()
},
{ merge: true }
);
​state.conversationPreferences[
conversationId
] = {
...(
state
.conversationPreferences[
conversationId
] || {}
),
pinned: false
};
​toast(
"Conversation unpinned."
);
} else {
await setDoc(
prefRef,
{
pinned: true,
deleted: false,
updatedAt:
serverTimestamp()
},
{ merge: true }
);
​state.conversationPreferences[
conversationId
] = {
...(
state
.conversationPreferences[
conversationId
] || {}
),
pinned: true,
deleted: false
};
​toast(
"Conversation pinned 📌"
);
}
} catch (e) {
console.error(
"PIN ERROR:",
e
);
​toast(
friendly(e)
);
}
}
​/* =========================================================
ARCHIVE / UNARCHIVE CONVERSATION
========================================================= */
export async function toggleArchiveConversation(
conversationId
) {
const isArchived =
!!state
.conversationPreferences[
conversationId
]?.archived;
​try {
const prefRef =
doc(
db,
"users",
state.user.uid,
"conversationPreferences",
conversationId
);
​await setDoc(
prefRef,
{
archived: !isArchived,
updatedAt:
serverTimestamp()
},
{ merge: true }
);
​state.conversationPreferences[
conversationId
] = {
...(
state
.conversationPreferences[
conversationId
] || {}
),
archived: !isArchived
};
​toast(
!isArchived ? "Conversation archived 📦" : "Conversation unarchived"
);
} catch (e) {
console.error(
"ARCHIVE ERROR:",
e
);
​toast(
friendly(e)
);
}
}
​/* =========================================================
MUTE / UNMUTE NOTIFICATIONS
========================================================= */
export async function toggleMuteConversation(
conversationId
) {
const isMuted =
!!state
.conversationPreferences[
conversationId
]?.muted;
​try {
const prefRef =
doc(
db,
"users",
state.user.uid,
"conversationPreferences",
conversationId
);
​await setDoc(
prefRef,
{
muted: !isMuted,
updatedAt:
serverTimestamp()
},
{ merge: true }
);
​state.conversationPreferences[
conversationId
] = {
...(
state
.conversationPreferences[
conversationId
] || {}
),
muted: !isMuted
};
​toast(
!isMuted ? "Notifications muted 🔕" : "Notifications unmuted 🔔"
);
} catch (e) {
console.error(
"MUTE ERROR:",
e
);
​toast(
friendly(e)
);
}
}
​/* =========================================================
CHAT BACKGROUND SELECTOR
========================================================= */
export function showChatBackgroundModal(conversationId, renderApp) {
currentRenderApp =
typeof renderApp === "function"
? renderApp
: currentRenderApp;
​const currentBg =
state.conversationPreferences[
conversationId
]?.background || "classic";
​const backgrounds = [
{ id: "classic", name: "Classic / Default", color: "var(--surface)" },
{ id: "midnight", name: "Midnight", color: "#0d1117" },
{ id: "purple", name: "Marvel Purple", color: "#2d1b4e" },
{ id: "ocean", name: "Ocean", color: "#0f2c39" },
{ id: "softlight", name: "Soft Light", color: "#f3f4f6" }
];
​showModal(
"Chat background",
<p class="small">Choose a lightweight background style for this chat:</p> <div style="display:flex; flex-direction:column; gap:8px; margin:16px 0;"> ${backgrounds.map(b =>
<button
type="button"
class="btn {currentBg === b.id ? "btn-primary" : "btn-ghost"}"
data-select-bg="{b.id}"
style="justify-content:flex-start; text-align:left;"
>
${currentBg === b.id ? "✓ " : "○ "} ${b.name}
</button>
).join("")} </div> 
);
​document
.querySelectorAll("[data-select-bg]")
.forEach(btn => {
btn.addEventListener("click", async () => {
const bgId = btn.dataset.selectBg;
try {
const prefRef =
doc(
db,
"users",
state.user.uid,
"conversationPreferences",
conversationId
);
​await setDoc(
prefRef,
{
background: bgId,
updatedAt: serverTimestamp()
},
{ merge: true }
);
​state.conversationPreferences[
conversationId
] = {
...(
state.conversationPreferences[
conversationId
] || {}
),
background: bgId
};
​closeModal();
toast("Chat background updated 🎨");
​const renderer =
typeof renderApp === "function"
? renderApp
: currentRenderApp;
​if (typeof renderer === "function") {
renderer();
}
} catch (e) {
console.error("BACKGROUND ERROR:", e);
toast(friendly(e));
}
});
});
}
​/* =========================================================
BLOCK / UNBLOCK USER
========================================================= */
export async function toggleBlockUser(
conversationId,
renderApp
) {
currentRenderApp =
typeof renderApp === "function"
? renderApp
: currentRenderApp;
​const isBlocked =
!!state
.conversationPreferences[
conversationId
]?.blocked;
​if (!isBlocked) {
showModal(
"Block user?",
<p class="small"> Blocking this user will hide the conversation from your active list and prevent new interactions. </p> <div style="display:flex; gap:10px; margin-top:16px;"> <button class="btn btn-ghost" id="cancelBlock" style="flex:1;">Cancel</button> <button class="btn btn-danger" id="confirmBlock" style="flex:1;">Block</button> </div>
);
​document.getElementById("cancelBlock")?.addEventListener("click", closeModal);
document.getElementById("confirmBlock")?.addEventListener("click", async () => {
await executeBlock(conversationId, true, renderApp);
});
} else {
await executeBlock(conversationId, false, renderApp);
}
}
​async function executeBlock(conversationId, blockState, renderApp) {
try {
const prefRef =
doc(
db,
"users",
state.user.uid,
"conversationPreferences",
conversationId
);
​await setDoc(
prefRef,
{
blocked: blockState,
deleted: blockState,
updatedAt: serverTimestamp()
},
{ merge: true }
);
​state.conversationPreferences[
conversationId
] = {
...(
state.conversationPreferences[
conversationId
] || {}
),
blocked: blockState,
deleted: blockState
};
​if (
state.activeConversation?.id ===
conversationId
) {
state.unsubs.messages?.();
state.unsubs.messages = null;
state.activeConversation = null;
state.messages = [];
}
​closeModal();
toast(blockState ? "User blocked 🚫" : "User unblocked");
​const renderer =
typeof renderApp === "function"
? renderApp
: currentRenderApp;
​if (typeof renderer === "function") {
renderer();
}
} catch (e) {
console.error("BLOCK ERROR:", e);
toast(friendly(e));
}
}
​/* =========================================================
REPORT USER
========================================================= */
export async function reportUserModal(
conversationId
) {
const c =
state.conversations.find(
x => x.id === conversationId
);
​if (!c) return;
​const otherUid =
c.participants?.find(
x => x !== state.user.uid
);
​if (!otherUid) return;
​showModal(
"Report conversation / user",
<p class="small">Select a reason for reporting:</p> <div class="field" style="margin:12px 0;"> <select class="input" id="reportReason"> <option value="Spam">Spam</option> <option value="Harassment">Harassment</option> <option value="Inappropriate behavior">Inappropriate behavior</option> <option value="Scam/fraud concern">Scam/fraud concern</option> <option value="Other">Other</option> </select> </div> <button class="btn btn-danger btn-block" id="submitReport"> Submit Report </button>
);
​document
.getElementById("submitReport")
?.addEventListener("click", async () => {
const reason =
document.getElementById("reportReason")
?.value || "Other";
​try {
await addDoc(
collection(db, "reports"),
{
reporterUid: state.user.uid,
reportedUid: otherUid,
conversationId,
reason,
createdAt: serverTimestamp()
}
);
​closeModal();
toast("Report submitted successfully. Thank you.");
} catch (e) {
console.error("REPORT ERROR:", e);
toast(
"Could not submit report. Note that security rules may require specific report permissions."
);
}
});
}
​/* =========================================================
COPY ENTIRE CONVERSATION
========================================================= */
export async function copyAllChat(
conversationId
) {
try {
const messagesSnap =
await getDocs(
query(
collection(
db,
"conversations",
conversationId,
"messages"
),
orderBy(
"createdAt",
"asc"
),
limit(500)
)
);
​if (
messagesSnap.empty
) {
toast(
"There are no messages to copy."
);
return;
}
​const lines =
messagesSnap.docs.map(
d => {
const data =
d.data();
​return (
data.text ||
""
);
}
);
​const text =
lines
.filter(Boolean)
.join("\n\n");
​if (!text) {
toast(
"There are no messages to copy."
);
return;
}
​await navigator.clipboard.writeText(
text
);
​toast(
"Entire chat copied 📋"
);
} catch (e) {
console.error(
"COPY ALL CHAT ERROR:",
e
);
​toast(
"Could not copy the chat."
);
}
}
​/* =========================================================
DELETE / HIDE CONVERSATION FOR CURRENT USER
========================================================= */
export async function deleteChat(
conversationId,
renderApp
) {
currentRenderApp =
typeof renderApp === "function"
? renderApp
: currentRenderApp;
​showModal(
"Delete this chat?",
<p class="small"> This removes the conversation from your chat list. It does not delete the other person's copy. </p> <div style=" display:flex; gap:10px; margin-top:16px; " > <button class="btn btn-ghost" id="cancelDeleteChat" style="flex:1;" > Cancel </button> <button class="btn btn-danger" id="confirmDeleteChat" style="flex:1;" > Delete </button> </div>
);
​document
.getElementById(
"cancelDeleteChat"
)
?.addEventListener(
"click",
closeModal
);
​document
.getElementById(
"confirmDeleteChat"
)
?.addEventListener(
"click",
async () => {
try {
const prefRef =
doc(
db,
"users",
state.user.uid,
"conversationPreferences",
conversationId
);
​await setDoc(
prefRef,
{
deleted: true,
pinned: false,
updatedAt:
serverTimestamp()
},
{ merge: true }
);
​state.conversationPreferences[
conversationId
] = {
...(
state
.conversationPreferences[
conversationId
] || {}
),
deleted: true,
pinned: false
};
​if (
state
.activeConversation
?.id ===
conversationId
) {
state.unsubs.messages?.();
​state.unsubs.messages =
null;
​state.activeConversation =
null;
​state.messages = [];
}
​closeModal();
​toast(
"Chat deleted from your list."
);
​const renderer =
typeof renderApp ===
"function"
? renderApp
: currentRenderApp;
​if (
typeof renderer ===
"function"
) {
renderer();
}
} catch (e) {
console.error(
"DELETE CHAT ERROR:",
e
);
​toast(
"Could not delete chat."
);
}
}
);
}
​/* =========================================================
CHAT LIST
========================================================= */
export function renderChat(
renderApp
) {
currentRenderApp =
typeof renderApp === "function"
? renderApp
: currentRenderApp;
​if (
state.activeConversation
) {
return renderConversation();
}
​const searchQuery =
(
state.chatSearchQuery ||
""
).toLowerCase();
​const viewingArchived =
!!state.viewingArchivedChats;
​let conversations =
state.conversations.filter(
c => {
const preference =
state
.conversationPreferences[
c.id
] || {};
​if (
preference.deleted ||
preference.blocked
) {
return false;
}
​const isArchived =
!!preference.archived;
​if (viewingArchived && !isArchived) {
return false;
}
​if (!viewingArchived && isArchived) {
return false;
}
​if (!searchQuery) {
return true;
}
​const other =
c.participants?.find(
x =>
x !==
state.user.uid
);
​const profile =
c
.participantProfiles?.[
other
] || {};
​const name =
(
profile.displayName ||
""
).toLowerCase();
​const username =
(
profile.username ||
""
).toLowerCase();
​const lastMsg =
(
c.lastMessage ||
""
).toLowerCase();
​return (
name.includes(
searchQuery
) ||
username.includes(
searchQuery
) ||
lastMsg.includes(
searchQuery
)
);
}
);
​conversations.sort(
(a, b) => {
const aPinned =
!!state
.conversationPreferences[
a.id
]?.pinned;
​const bPinned =
!!state
.conversationPreferences[
b.id
]?.pinned;
​if (
aPinned &&
!bPinned
) {
return -1;
}
​if (
!aPinned &&
bPinned
) {
return 1;
}
​return 0;
}
);
​const archivedCount =
state.conversations.filter(c => {
const p = state.conversationPreferences[c.id] || {};
return p.archived && !p.deleted && !p.blocked;
}).length;
​return <div class="page"> <div class="section-title"> <div> <h2>${viewingArchived ? "Archived Chats" : "Messages"}</h2> <div class="small"> ${viewingArchived ? "Archived conversations" : "Private conversations"} </div> </div> <div style="display:flex; gap:8px;"> ${ !viewingArchived ?
<button
class="btn btn-ghost"
id="toggleArchivedViewBtn"
style="position:relative;"
>
📦 Archived ${archivedCount > 0 ? (${archivedCount}) : ""}
</button>
:
<button class="btn btn-ghost" id="toggleArchivedViewBtn">
← Active Chats
</button>
`
}
<button
class="btn btn-primary"
id="newChatBtn"
>
+ New chat
</button>
</div>
</div>
​<div class="search">
<input
class="input"
id="chatSearch"
placeholder="Search conversations…"
value="${escapeHtml(
state.chatSearchQuery ||
""
)}"
>
</div>
​${
conversations.length
? `
<div
class="chat-list"
id="chatList"
>
${conversations
.map(c => {
const other =
c.participants?.find(
x =>
x !==
state.user.uid
);
​const profile =
c
.participantProfiles?.[
other
] || {};
​const name =
profile.displayName ||
profile.username ||
"User";
​const preference =
state.conversationPreferences[
c.id
] || {};
​const pinned =
!!preference.pinned;
​const muted =
!!preference.muted;
​const archived =
!!preference.archived;
​return <div class="chat-item ${ pinned ? "pinned-chat" : "" }" data-conversation="${escapeHtml( c.id )}" style=" position:relative; cursor:pointer; min-width:0; " > <div class="avatar" style="flex:none;" > ${escapeHtml( initials(name) )} </div> <div class="chat-content" style=" flex:1; min-width:0; overflow:hidden; " > <strong style=" display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; " > ${escapeHtml( name )} ${ pinned ? " 📌" : "" } ${ muted ? " 🔕" : "" } ${ archived ? " 📦" : "" } </strong> <p style=" overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:4px 0 0; " > ${escapeHtml( c.lastMessage || "Start chatting" )} </p> </div> <div style=" display:flex; flex-direction:column; align-items:flex-end; justify-content:center; gap:5px; flex:none; " > <span class="small"> ${escapeHtml( formatDate( c.updatedAt ) )} </span> <button type="button" class="icon-btn chat-menu-btn" aria-label="Conversation options" aria-expanded="false" data-chat-menu="${escapeHtml( c.id )}" style=" width:34px; height:34px; border-radius:11px; font-size:20px; line-height:1; padding:0; display:grid; place-items:center; " > ⋮ </button> </div> <div class="chat-options-menu" data-chat-options="${escapeHtml( c.id )}" style=" display:none; position:absolute; right:10px; top:52px; z-index:100; min-width:210px; max-width:calc(100% - 20px); background:var(--surface); border:1px solid var(--border); border-radius:15px; box-shadow:var(--shadow2); padding:6px; " > <div style="padding:6px 12px; font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase;"> Conversation </div> <button type="button" class="chat-option-btn" data-chat-action="pin" data-chat-id="${escapeHtml( c.id )}" style=" width:100%; border:0; background:transparent; color:var(--text); text-align:left; padding:9px 12px; border-radius:8px; font-weight:600; cursor:pointer; " > ${ pinned ? "📌 Unpin chat" : "📌 Pin chat" } </button> <button type="button" class="chat-option-btn" data-chat-action="archive" data-chat-id="${escapeHtml( c.id )}" style=" width:100%; border:0; background:transparent; color:var(--text); text-align:left; padding:9px 12px; border-radius:8px; font-weight:600; cursor:pointer; " > ${ archived ? "📦 Unarchive chat" : "📦 Archive chat" } </button> <button type="button" class="chat-option-btn" data-chat-action="mute" data-chat-id="${escapeHtml( c.id )}" style=" width:100%; border:0; background:transparent; color:var(--text); text-align:left; padding:9px 12px; border-radius:8px; font-weight:600; cursor:pointer; " > ${ muted ? "🔔 Unmute notifications" : "🔕 Mute notifications" } </button> <button type="button" class="chat-option-btn" data-chat-action="background" data-chat-id="${escapeHtml( c.id )}" style=" width:100%; border:0; background:transparent; color:var(--text); text-align:left; padding:9px 12px; border-radius:8px; font-weight:600; cursor:pointer; " > 🎨 Chat background </button> <div style="height:1px; background:var(--border); margin:4px 0;"></div> <div style="padding:6px 12px; font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase;"> Tools </div> <button type="button" class="chat-option-btn" data-chat-action="copy" data-chat-id="${escapeHtml( c.id )}" style=" width:100%; border:0; background:transparent; color:var(--text); text-align:left; padding:9px 12px; border-radius:8px; font-weight:600; cursor:pointer; " > 📋 Copy all chat </button> <div style="height:1px; background:var(--border); margin:4px 0;"></div> <div style="padding:6px 12px; font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase;"> Safety & Danger </div> <button type="button" class="chat-option-btn" data-chat-action="block" data-chat-id="${escapeHtml( c.id )}" style=" width:100%; border:0; background:transparent; color:var(--danger); text-align:left; padding:9px 12px; border-radius:8px; font-weight:600; cursor:pointer; " > 🚫 Block user </button> <button type="button" class="chat-option-btn" data-chat-action="report" data-chat-id="${escapeHtml( c.id )}" style=" width:100%; border:0; background:transparent; color:var(--danger); text-align:left; padding:9px 12px; border-radius:8px; font-weight:600; cursor:pointer; " > ⚠️ Report user </button> <button type="button" class="chat-option-btn" data-chat-action="delete" data-chat-id="${escapeHtml( c.id )}" style=" width:100%; border:0; background:transparent; color:var(--danger); text-align:left; padding:9px 12px; border-radius:8px; font-weight:600; cursor:pointer; " > 🗑️ Delete chat </button> </div> </div>;
})
.join("")}
</div>
:
<div class="card empty">
<div
style="font-size:42px"
>
💬
</div>
<h3>
${viewingArchived ? "No archived conversations" : "No conversations found"}
</h3>
<p>
${viewingArchived ? "Archived chats will appear here." : "Try searching or start a new conversation."}
</p>
${
!viewingArchived
? <button class="btn btn-primary" id="newChatEmpty">Start a chat</button>
: ""
}
</div>
} </div>;
}
​/* =========================================================
CHAT CONVERSATION VIEW
========================================================= */
export function renderConversation() {
const c =
state.activeConversation;
​const other =
c?.participants?.find(
x =>
x !==
state.user.uid
);
​const profile =
c
?.participantProfiles?.[
other
] || {};
​const name =
profile.displayName ||
profile.username ||
"User";
​const preference =
state.conversationPreferences[c.id] || {};
​const bgStyles = {
classic: "",
midnight: "background-color: #0d1117 !important;",
purple: "background-color: #2d1b4e !important;",
ocean: "background-color: #0f2c39 !important;",
softlight: "background-color: #f3f4f6 !important; color: #111 !important;"
};
​const activeBgStyle = bgStyles[preference.background] || "";
​return `
<div class="page" style="${activeBgStyle}">
<div class="section-title">
<div class="profile-row">
<button
class="icon-btn"
id="backChats"
>
←
</button>
<div class="avatar">
${escapeHtml(
initials(name)
)}
</div>
<div>
<h2 style="margin:0">
${escapeHtml(name)}
</h2>
<div class="small">
Private chat ${preference.muted ? " (Muted 🔕)" : ""}
</div>
</div>
</div>
</div>
<div class="card" style="${activeBgStyle}">
<div
class="messages"
id="messages"
>
${
state.messages.length
? state.messages
.map(m => {
const isMine =
m.uid ===
state.user.uid;
​return <div class="bubble ${ isMine ? "mine" : "" }" data-message-id="${escapeHtml( m.id )}" style=" position:relative; " > <div> ${escapeHtml( m.text || "" )} </div> <div class="bubble-time" > ${escapeHtml( formatDate( m.createdAt ) )} ${ m.editedAt ?<span class="edited-indicator">(Edited)</span>: "" } </div> <div class="message-actions-dropdown" style=" margin-top:4px; display:flex; gap:8px; font-size:11px; " > <button class="btn-text" data-copy-msg="${escapeHtml( m.text || "" )}" > Copy </button> ${ isMine ?
<button
class="btn-text"
data-edit-msg="${escapeHtml(
m.id
)}"
>
Edit
</button>
<button
class="btn-text"
data-delete-msg="${escapeHtml(
m.id
)}"
style="
color:#ff5c5c;
"
>
Delete
</button>
: "" } </div> </div>;
})
.join("")
: <div class="empty"> 👋 Say hello and start the conversation. </div>
}
</div>
<div class="message-box">
<input
class="input"
id="messageInput"
maxlength="5000"
autocomplete="off"
placeholder="Write a message…"
>
<button
class="btn btn-primary"
id="sendMessage"
>
Send
</button>
</div>
</div>
</div>
`;
}
​/* =========================================================
CHAT LIST MENU EVENT DELEGATION
========================================================= */
if (
!window.__marvelChatListMenuInstalledV3
) {
window.__marvelChatListMenuInstalledV3 =
true;
​document.addEventListener(
"click",
async event => {
const toggleArchivedBtn =
event.target.closest(
"#toggleArchivedViewBtn"
);
​if (toggleArchivedBtn) {
event.preventDefault();
state.viewingArchivedChats =
!state.viewingArchivedChats;
​if (typeof currentRenderApp === "function") {
currentRenderApp();
}
return;
}
​const menuButton =
event.target.closest(
"[data-chat-menu]"
);
​if (menuButton) {
event.preventDefault();
event.stopPropagation();
​const conversationId =
menuButton.dataset.chatMenu;
​const menu =
document.querySelector(
[data-chat-options="${CSS.escape(conversationId)}"]
);
​if (!menu) {
return;
}
​const isOpen =
menu.getAttribute(
"data-open"
) === "true";
​document
.querySelectorAll(
"[data-chat-options]"
)
.forEach(
otherMenu => {
otherMenu.style.display =
"none";
​otherMenu.setAttribute(
"data-open",
"false"
);
}
);
​document
.querySelectorAll(
"[data-chat-menu]"
)
.forEach(
button => {
button.setAttribute(
"aria-expanded",
"false"
);
}
);
​if (!isOpen) {
menu.style.display =
"block";
​menu.setAttribute(
"data-open",
"true"
);
​menuButton.setAttribute(
"aria-expanded",
"true"
);
}
​return;
}
​const option =
event.target.closest(
"[data-chat-action]"
);
​if (option) {
event.preventDefault();
event.stopPropagation();
​const action =
option.dataset.chatAction;
​const conversationId =
option.dataset.chatId;
​if (!conversationId) {
return;
}
​document
.querySelectorAll(
"[data-chat-options]"
)
.forEach(
menu => {
menu.style.display =
"none";
​menu.setAttribute(
"data-open",
"false"
);
}
);
​document
.querySelectorAll(
"[data-chat-menu]"
)
.forEach(
button => {
button.setAttribute(
"aria-expanded",
"false"
);
}
);
​if (
action === "pin"
) {
try {
await togglePinConversation(
conversationId
);
​if (
state.page === "chat" &&
!state.activeConversation &&
typeof currentRenderApp ===
"function"
) {
currentRenderApp();
}
} catch (e) {
console.error(
"CHAT PIN ACTION ERROR:",
e
);
​toast(
"Could not update chat pin."
);
}
​return;
}
​if (
action === "archive"
) {
try {
await toggleArchiveConversation(
conversationId
);
​if (
state.page === "chat" &&
!state.activeConversation &&
typeof currentRenderApp ===
"function"
) {
currentRenderApp();
}
} catch (e) {
console.error(
"CHAT ARCHIVE ACTION ERROR:",
e
);
​toast(
"Could not archive chat."
);
}
​return;
}
​if (
action === "mute"
) {
try {
await toggleMuteConversation(
conversationId
);
​if (
state.page === "chat" &&
!state.activeConversation &&
typeof currentRenderApp ===
"function"
) {
currentRenderApp();
}
} catch (e) {
console.error(
"CHAT MUTE ACTION ERROR:",
e
);
​toast(
"Could not mute chat."
);
}
​return;
}
​if (
action === "background"
) {
showChatBackgroundModal(
conversationId,
currentRenderApp
);
​return;
}
​if (
action === "copy"
) {
try {
await copyAllChat(
conversationId
);
} catch (e) {
console.error(
"CHAT COPY ACTION ERROR:",
e
);
​toast(
"Could not copy the chat."
);
}
​return;
}
​if (
action === "block"
) {
await toggleBlockUser(
conversationId,
currentRenderApp
);
​return;
}
​if (
action === "report"
) {
await reportUserModal(
conversationId
);
​return;
}
​if (
action === "delete"
) {
try {
await deleteChat(
conversationId,
currentRenderApp
);
} catch (e) {
console.error(
"CHAT DELETE ACTION ERROR:",
e
);
​toast(
"Could not delete chat."
);
}
​return;
}
​return;
}
​if (
!event.target.closest(
"[data-chat-options]"
)
) {
document
.querySelectorAll(
"[data-chat-options]"
)
.forEach(
menu => {
menu.style.display =
"none";
​menu.setAttribute(
"data-open",
"false"
);
}
);
​document
.querySelectorAll(
"[data-chat-menu]"
)
.forEach(
button => {
button.setAttribute(
"aria-expanded",
"false"
);
}
);
}
}
);
}
