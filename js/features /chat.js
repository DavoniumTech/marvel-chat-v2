import { state, escapeHtml, initials, formatDate, friendly } from "../state.js";
import { db, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, query, where, orderBy, limit, getDocs, onSnapshot, serverTimestamp } from "../firebase/firestore.js";
import { showModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";

/* =========================================================
   NEW CHAT
   ========================================================= */

export function showNewChat(renderApp) {
  showModal(
    "Start a new chat",
    `
      <div class="field">
        <label>Enter the person's username</label>
        <input class="input" id="chatUsername" placeholder="username">
      </div>
      <button class="btn btn-primary btn-block" id="findChatUser">Find user</button>
      <div id="chatUserResult" style="margin-top:14px"></div>
    `
  );

  document.getElementById("findChatUser")?.addEventListener("click", async () => {
    const username = document.getElementById("chatUsername").value.trim();
    const result = document.getElementById("chatUserResult");

    if (!username) {
      result.innerHTML = `<div class="status error">Enter a username.</div>`;
      return;
    }

    result.innerHTML = `<div class="empty">Searching…</div>`;

    try {
      const snap = await getDocs(
        query(
          collection(db, "users"),
          where("username", "==", username),
          limit(5)
        )
      );

      if (snap.empty) {
        result.innerHTML = `<div class="empty">No user found.</div>`;
        return;
      }

      result.innerHTML = snap.docs
        .filter(d => d.id !== state.user.uid)
        .map(d => {
          const u = { id: d.id, ...d.data() };

          return `
            <div class="list-item">
              <div class="profile-row">
                <div class="avatar">
                  ${escapeHtml(initials(u.displayName || u.username))}
                </div>

                <div class="profile-meta">
                  <strong>${escapeHtml(u.displayName || u.username || "User")}</strong>
                  <span class="small">@${escapeHtml(u.username || "")}</span>
                </div>

                <button class="btn btn-primary" data-start-chat="${u.id}">
                  Chat
                </button>
              </div>
            </div>
          `;
        })
        .join("");

      result.querySelectorAll("[data-start-chat]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const uid = btn.dataset.startChat;

          try {
            const profileSnap = await getDoc(doc(db, "users", uid));

            if (!profileSnap.exists()) {
              toast("User profile disappeared.");
              return;
            }

            await createConversation(
              { uid, ...profileSnap.data() },
              renderApp
            );
          } catch (e) {
            console.error("START CHAT ERROR:", e);
            toast(friendly(e));
          }
        });
      });
    } catch (e) {
      result.innerHTML = `
        <div class="status error">
          ${escapeHtml(friendly(e))}
        </div>
      `;
    }
  });
}


/* =========================================================
   CREATE CONVERSATION
   ========================================================= */

export async function createConversation(other, renderApp) {
  try {
    const existing = state.conversations.find(c =>
      Array.isArray(c.participants) &&
      c.participants.length === 2 &&
      c.participants.includes(state.user.uid) &&
      c.participants.includes(other.uid)
    );

    if (existing) {
      /*
       * If this conversation was previously hidden by the user,
       * restore it when they intentionally start the chat again.
       */
      const existingPref =
        state.conversationPreferences[existing.id] || {};

      if (existingPref.deleted) {
        const prefRef = doc(
          db,
          "users",
          state.user.uid,
          "conversationPreferences",
          existing.id
        );

        await setDoc(
          prefRef,
          {
            deleted: false,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );

        state.conversationPreferences[existing.id] = {
          ...existingPref,
          deleted: false
        };
      }

      closeModal();
      await openConversation(existing, renderApp);
      return;
    }

    const ref = await addDoc(collection(db, "conversations"), {
      participants: [state.user.uid, other.uid],

      participantProfiles: {
        [state.user.uid]: {
          displayName:
            state.profile.displayName ||
            state.profile.username ||
            "User",
          username: state.profile.username || ""
        },

        [other.uid]: {
          displayName:
            other.displayName ||
            other.username ||
            "User",
          username: other.username || ""
        }
      },

      lastMessage: "",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    });

    const localConversation = {
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
          username: state.profile.username || ""
        },

        [other.uid]: {
          displayName:
            other.displayName ||
            other.username ||
            "User",
          username: other.username || ""
        }
      },

      lastMessage: "",
      updatedAt: null,
      createdAt: null
    };

    state.conversations = [
      localConversation,
      ...state.conversations.filter(c => c.id !== ref.id)
    ];

    closeModal();

    await openConversation(localConversation, renderApp);
  } catch (e) {
    console.error("CREATE CONVERSATION ERROR:", e);
    toast(friendly(e));
  }
}


/* =========================================================
   OPEN CONVERSATION
   ========================================================= */

export async function openConversation(conversation, renderApp) {
  let c =
    typeof conversation === "string"
      ? state.conversations.find(x => x.id === conversation)
      : conversation;

  if (!c) {
    toast("Conversation could not be opened.");
    return;
  }

  /*
   * Opening a conversation means the user intentionally wants
   * to see it again, so restore it if it was hidden.
   */
  const pref = state.conversationPreferences[c.id];

  if (pref?.deleted) {
    const prefRef = doc(
      db,
      "users",
      state.user.uid,
      "conversationPreferences",
      c.id
    );

    try {
      await setDoc(
        prefRef,
        {
          deleted: false,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      state.conversationPreferences[c.id] = {
        ...pref,
        deleted: false
      };
    } catch (e) {
      console.warn("Could not restore conversation:", e);
    }
  }

  state.activeConversation = c;
  state.messages = [];

  state.unsubs.messages?.();
  state.unsubs.messages = null;

  state.unsubs.messages = onSnapshot(
    query(
      collection(
        db,
        "conversations",
        c.id,
        "messages"
      ),
      orderBy("createdAt", "asc"),
      limit(100)
    ),

    snap => {
      state.messages = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      const latest =
        state.messages[state.messages.length - 1];

      if (latest) {
        const index =
          state.conversations.findIndex(
            x => x.id === c.id
          );

        if (index >= 0) {
          state.conversations[index] = {
            ...state.conversations[index],
            lastMessage: latest.text || "",
            updatedAt: latest.createdAt || null
          };

          state.activeConversation =
            state.conversations[index];
        }
      }

      if (state.page === "chat") {
        renderApp();

        setTimeout(() => {
          const el =
            document.getElementById("messages");

          if (el) {
            el.scrollTop = el.scrollHeight;
          }
        }, 50);
      }
    },

    err => {
      console.error(
        "MESSAGE LISTENER ERROR:",
        err
      );

      toast(friendly(err));
    }
  );

  state.page = "chat";

  renderApp();

  setTimeout(() => {
    const el =
      document.getElementById("messages");

    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, 50);
}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

export async function sendMessage() {
  const input =
    document.getElementById("messageInput");

  const text =
    input?.value.trim();

  if (!text || !state.activeConversation) {
    return;
  }

  const id =
    state.activeConversation.id;

  try {
    input.disabled = true;

    const docRef = await addDoc(
      collection(
        db,
        "conversations",
        id,
        "messages"
      ),
      {
        uid: state.user.uid,
        text,
        createdAt: serverTimestamp()
      }
    );

    await updateDoc(
      doc(db, "conversations", id),
      {
        lastMessage: text,
        updatedAt: serverTimestamp()
      }
    );

    const newMsg = {
      id: docRef.id,
      uid: state.user.uid,
      text,
      createdAt: new Date()
    };

    state.messages.push(newMsg);

    const recipientUid =
      state.activeConversation.participants?.find(
        x => x !== state.user.uid
      );

    if (recipientUid) {
      try {
        const actorName =
          state.profile.displayName ||
          state.profile.username ||
          "Someone";

        await addDoc(
          collection(
            db,
            "users",
            recipientUid,
            "notifications"
          ),
          {
            type: "message",
            actorUid: state.user.uid,
            actorName,
            targetId: id,
            text: `${actorName} sent you a message.`,
            read: false,
            createdAt: serverTimestamp()
          }
        );
      } catch (notifErr) {
        console.warn(
          "Could not create message notification:",
          notifErr
        );
      }
    }

    input.value = "";
  } catch (e) {
    console.error(
      "SEND MESSAGE ERROR:",
      e
    );

    toast(friendly(e));
  } finally {
    input.disabled = false;
    input.focus();
  }
}


/* =========================================================
   EDIT MESSAGE
   ========================================================= */

export async function editMessage(messageId) {
  const msg =
    state.messages.find(
      m => m.id === messageId
    );

  if (
    !msg ||
    msg.uid !== state.user.uid
  ) {
    return;
  }

  showModal(
    "Edit message",
    `
      <div class="field">
        <textarea
          class="textarea"
          id="editMessageText"
          maxlength="5000"
        >${escapeHtml(msg.text || "")}</textarea>
      </div>

      <button
        class="btn btn-primary btn-block"
        id="saveEditMessage"
      >
        Save
      </button>
    `
  );

  document
    .getElementById("saveEditMessage")
    ?.addEventListener(
      "click",
      async () => {
        const text =
          document
            .getElementById(
              "editMessageText"
            )
            ?.value.trim();

        if (!text) {
          toast("Message cannot be empty.");
          return;
        }

        try {
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
              editedAt: serverTimestamp()
            }
          );

          state.messages =
            state.messages.map(
              m =>
                m.id === messageId
                  ? {
                      ...m,
                      text,
                      editedAt: new Date()
                    }
                  : m
            );

          closeModal();

          toast("Message updated");
        } catch (e) {
          console.error(
            "EDIT MESSAGE ERROR:",
            e
          );

          toast(
            "Could not update message."
          );
        }
      }
    );
}


/* =========================================================
   DELETE MESSAGE
   ========================================================= */

export async function deleteMessage(messageId) {
  const msg =
    state.messages.find(
      m => m.id === messageId
    );

  if (
    !msg ||
    msg.uid !== state.user.uid
  ) {
    return;
  }

  showModal(
    "Delete this message?",
    `
      <p class="small">
        This message will be permanently removed.
      </p>

      <div
        style="
          display:flex;
          gap:10px;
          margin-top:16px;
        "
      >
        <button
          class="btn btn-ghost"
          id="cancelDelMsg"
          style="flex:1;"
        >
          Cancel
        </button>

        <button
          class="btn btn-danger"
          id="confirmDelMsg"
          style="flex:1;"
        >
          Delete
        </button>
      </div>
    `
  );

  document
    .getElementById("cancelDelMsg")
    ?.addEventListener(
      "click",
      closeModal
    );

  document
    .getElementById("confirmDelMsg")
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

          state.messages =
            state.messages.filter(
              m => m.id !== messageId
            );

          const latest =
            state.messages[
              state.messages.length - 1
            ];

          const newLastMsg =
            latest
              ? latest.text
              : "";

          await updateDoc(
            doc(
              db,
              "conversations",
              state.activeConversation.id
            ),
            {
              lastMessage: newLastMsg,
              updatedAt:
                latest
                  ? latest.createdAt
                  : serverTimestamp()
            }
          );

          closeModal();

          toast(
            "Message deleted."
          );
        } catch (e) {
          console.error(
            "DELETE MESSAGE ERROR:",
            e
          );

          toast(
            "Could not delete message."
          );
        }
      }
    );
}


/* =========================================================
   COPY SINGLE MESSAGE
   ========================================================= */

export async function copyMessage(text) {
  try {
    await navigator.clipboard.writeText(
      text
    );

    toast(
      "Message copied 📋"
    );
  } catch (e) {
    toast(
      "Could not copy message."
    );
  }
}


/* =========================================================
   PIN / UNPIN CONVERSATION
   ========================================================= */

export async function togglePinConversation(
  conversationId
) {
  const isPinned =
    !!state.conversationPreferences[
      conversationId
    ]?.pinned;

  try {
    const prefRef = doc(
      db,
      "users",
      state.user.uid,
      "conversationPreferences",
      conversationId
    );

    if (isPinned) {
      await setDoc(
        prefRef,
        {
          pinned: false,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      state.conversationPreferences[
        conversationId
      ] = {
        ...(
          state.conversationPreferences[
            conversationId
          ] || {}
        ),
        pinned: false
      };

      toast(
        "Conversation unpinned."
      );
    } else {
      await setDoc(
        prefRef,
        {
          pinned: true,
          deleted: false,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      state.conversationPreferences[
        conversationId
      ] = {
        ...(
          state.conversationPreferences[
            conversationId
          ] || {}
        ),
        pinned: true,
        deleted: false
      };

      toast(
        "Conversation pinned 📌"
      );
    }

    /*
     * Re-render the chat list so the visual state updates
     * immediately without requiring a page refresh.
     */
    if (
      state.page === "chat" &&
      !state.activeConversation
    ) {
      const root =
        document.getElementById("root");

      if (root) {
        /*
         * app.js normally handles rendering.
         * Triggering a click is intentionally avoided here.
         * The listener/state update is enough for the next render.
         */
      }
    }
  } catch (e) {
    console.error(
      "PIN ERROR:",
      e
    );

    toast(friendly(e));
  }
}


/* =========================================================
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

    if (messagesSnap.empty) {
      toast(
        "There are no messages to copy."
      );
      return;
    }

    const lines =
      messagesSnap.docs.map(d => {
        const data = d.data();

        return data.text || "";
      });

    const text =
      lines
        .filter(Boolean)
        .join("\n\n");

    if (!text) {
      toast(
        "There are no messages to copy."
      );
      return;
    }

    await navigator.clipboard.writeText(
      text
    );

    toast(
      "Entire chat copied 📋"
    );
  } catch (e) {
    console.error(
      "COPY ALL CHAT ERROR:",
      e
    );

    toast(
      "Could not copy the chat."
    );
  }
}


/* =========================================================
   DELETE / HIDE CONVERSATION FOR CURRENT USER
   ========================================================= */

export async function deleteChat(
  conversationId,
  renderApp
) {
  showModal(
    "Delete this chat?",
    `
      <p class="small">
        This removes the conversation from your chat list.
        It does not delete the other person's copy.
      </p>

      <div
        style="
          display:flex;
          gap:10px;
          margin-top:16px;
        "
      >
        <button
          class="btn btn-ghost"
          id="cancelDeleteChat"
          style="flex:1;"
        >
          Cancel
        </button>

        <button
          class="btn btn-danger"
          id="confirmDeleteChat"
          style="flex:1;"
        >
          Delete
        </button>
      </div>
    `
  );

  document
    .getElementById("cancelDeleteChat")
    ?.addEventListener(
      "click",
      closeModal
    );

  document
    .getElementById("confirmDeleteChat")
    ?.addEventListener(
      "click",
      async () => {
        try {
          const prefRef = doc(
            db,
            "users",
            state.user.uid,
            "conversationPreferences",
            conversationId
          );

          /*
           * We intentionally hide the conversation for this
           * user instead of deleting the shared Firestore
           * conversation and damaging the other participant's
           * chat.
           */
          await setDoc(
            prefRef,
            {
              deleted: true,
              pinned: false,
              updatedAt: serverTimestamp()
            },
            { merge: true }
          );

          state.conversationPreferences[
            conversationId
          ] = {
            ...(
              state.conversationPreferences[
                conversationId
              ] || {}
            ),
            deleted: true,
            pinned: false
          };

          /*
           * If the user somehow deletes the currently opened
           * conversation, safely leave it.
           */
          if (
            state.activeConversation?.id ===
            conversationId
          ) {
            state.unsubs.messages?.();
            state.unsubs.messages = null;

            state.activeConversation =
              null;

            state.messages = [];
          }

          closeModal();

          toast(
            "Chat deleted from your list."
          );

          if (typeof renderApp === "function") {
            renderApp();
          }
        } catch (e) {
          console.error(
            "DELETE CHAT ERROR:",
            e
          );

          toast(
            "Could not delete chat."
          );
        }
      }
    );
}


/* =========================================================
   CHAT LIST
   ========================================================= */

export function renderChat(renderApp) {
  if (state.activeConversation) {
    return renderConversation();
  }

  const searchQuery =
    (state.chatSearchQuery || "")
      .toLowerCase();

  /*
   * Deleted conversations are hidden only for the current user.
   */
  let conversations =
    state.conversations.filter(c => {
      const preference =
        state.conversationPreferences[
          c.id
        ] || {};

      if (preference.deleted) {
        return false;
      }

      if (!searchQuery) {
        return true;
      }

      const other =
        c.participants?.find(
          x => x !== state.user.uid
        );

      const profile =
        c.participantProfiles?.[other] ||
        {};

      const name =
        (
          profile.displayName ||
          ""
        ).toLowerCase();

      const username =
        (
          profile.username ||
          ""
        ).toLowerCase();

      const lastMsg =
        (
          c.lastMessage ||
          ""
        ).toLowerCase();

      return (
        name.includes(searchQuery) ||
        username.includes(searchQuery) ||
        lastMsg.includes(searchQuery)
      );
    });

  /*
   * Pinned chats remain at the top.
   */
  conversations.sort((a, b) => {
    const aPinned =
      !!state.conversationPreferences[
        a.id
      ]?.pinned;

    const bPinned =
      !!state.conversationPreferences[
        b.id
      ]?.pinned;

    if (
      aPinned &&
      !bPinned
    ) {
      return -1;
    }

    if (
      !aPinned &&
      bPinned
    ) {
      return 1;
    }

    return 0;
  });

  return `
    <div class="page">

      <div class="section-title">
        <div>
          <h2>Messages</h2>
          <div class="small">
            Private conversations
          </div>
        </div>

        <button
          class="btn btn-primary"
          id="newChatBtn"
        >
          + New chat
        </button>
      </div>

      <div class="search">
        <input
          class="input"
          id="chatSearch"
          placeholder="Search conversations…"
          value="${escapeHtml(
            state.chatSearchQuery || ""
          )}"
        >
      </div>

      ${
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

                  const profile =
                    c.participantProfiles?.[
                      other
                    ] || {};

                  const name =
                    profile.displayName ||
                    profile.username ||
                    "User";

                  const pinned =
                    !!state
                      .conversationPreferences[
                        c.id
                      ]?.pinned;

                  return `
                    <div
                      class="chat-item ${
                        pinned
                          ? "pinned-chat"
                          : ""
                      }"
                      data-conversation="${escapeHtml(
                        c.id
                      )}"
                      style="
                        position:relative;
                        cursor:pointer;
                        min-width:0;
                      "
                    >

                      <div
                        class="avatar"
                        style="flex:none;"
                      >
                        ${escapeHtml(
                          initials(name)
                        )}
                      </div>

                      <div
                        class="chat-content"
                        style="
                          flex:1;
                          min-width:0;
                          overflow:hidden;
                        "
                      >
                        <strong
                          style="
                            display:block;
                            overflow:hidden;
                            text-overflow:ellipsis;
                            white-space:nowrap;
                          "
                        >
                          ${escapeHtml(
                            name
                          )}
                          ${
                            pinned
                              ? " 📌"
                              : ""
                          }
                        </strong>

                        <p
                          style="
                            overflow:hidden;
                            text-overflow:ellipsis;
                            white-space:nowrap;
                            margin:4px 0 0;
                          "
                        >
                          ${escapeHtml(
                            c.lastMessage ||
                              "Start chatting"
                          )}
                        </p>
                      </div>

                      <div
                        style="
                          display:flex;
                          flex-direction:column;
                          align-items:flex-end;
                          justify-content:center;
                          gap:5px;
                          flex:none;
                        "
                      >
                        <span class="small">
                          ${escapeHtml(
                            formatDate(
                              c.updatedAt
                            )
                          )}
                        </span>

                        <!-- THREE DOTS MENU -->
                        <button
                          type="button"
                          class="icon-btn chat-menu-btn"
                          aria-label="Conversation options"
                          aria-expanded="false"
                          data-chat-menu="${escapeHtml(
                            c.id
                          )}"
                          style="
                            width:34px;
                            height:34px;
                            border-radius:11px;
                            font-size:20px;
                            line-height:1;
                            padding:0;
                            display:grid;
                            place-items:center;
                          "
                        >
                          ⋮
                        </button>
                      </div>

                      <!-- CHAT OPTIONS MENU -->
                      <div
                        class="chat-options-menu"
                        data-chat-options="${escapeHtml(
                          c.id
                        )}"
                        style="
                          display:none;
                          position:absolute;
                          right:10px;
                          top:52px;
                          z-index:100;
                          min-width:190px;
                          max-width:calc(100% - 20px);
                          background:var(--surface);
                          border:1px solid var(--border);
                          border-radius:15px;
                          box-shadow:var(--shadow2);
                          padding:6px;
                        "
                      >

                        <button
                          type="button"
                          class="chat-option-btn"
                          data-chat-action="pin"
                          data-chat-id="${escapeHtml(
                            c.id
                          )}"
                          style="
                            width:100%;
                            border:0;
                            background:transparent;
                            color:var(--text);
                            text-align:left;
                            padding:11px 12px;
                            border-radius:10px;
                            font-weight:750;
                            cursor:pointer;
                          "
                        >
                          ${
                            pinned
                              ? "📌 Unpin chat"
                              : "📌 Pin chat"
                          }
                        </button>

                        <button
                          type="button"
                          class="chat-option-btn"
                          data-chat-action="copy"
                          data-chat-id="${escapeHtml(
                            c.id
                          )}"
                          style="
                            width:100%;
                            border:0;
                            background:transparent;
                            color:var(--text);
                            text-align:left;
                            padding:11px 12px;
                            border-radius:10px;
                            font-weight:750;
                            cursor:pointer;
                          "
                        >
                          📋 Copy all chat
                        </button>

                        <button
                          type="button"
                          class="chat-option-btn"
                          data-chat-action="delete"
                          data-chat-id="${escapeHtml(
                            c.id
                          )}"
                          style="
                            width:100%;
                            border:0;
                            background:transparent;
                            color:var(--danger);
                            text-align:left;
                            padding:11px 12px;
                            border-radius:10px;
                            font-weight:750;
                            cursor:pointer;
                          "
                        >
                          🗑️ Delete chat
                        </button>

                      </div>

                    </div>
                  `;
                })
                .join("")}
            </div>
          `
          : `
            <div class="card empty">
              <div
                style="font-size:42px"
              >
                💬
              </div>

              <h3>
                No conversations found
              </h3>

              <p>
                Try searching or start a
                new conversation.
              </p>

              <button
                class="btn btn-primary"
                id="newChatEmpty"
              >
                Start a chat
              </button>
            </div>
          `
      }

    </div>
  `;
}


/* =========================================================
   CHAT CONVERSATION VIEW
   ========================================================= */

export function renderConversation() {
  const c =
    state.activeConversation;

  const other =
    c?.participants?.find(
      x => x !== state.user.uid
    );

  const profile =
    c?.participantProfiles?.[
      other
    ] || {};

  const name =
    profile.displayName ||
    profile.username ||
    "User";

  return `
    <div class="page">

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
              Private chat
            </div>
          </div>

        </div>

      </div>

      <div class="card">

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

                    return `
                      <div
                        class="bubble ${
                          isMine
                            ? "mine"
                            : ""
                        }"
                        data-message-id="${escapeHtml(
                          m.id
                        )}"
                        style="
                          position:relative;
                        "
                      >

                        <div>
                          ${escapeHtml(
                            m.text || ""
                          )}
                        </div>

                        <div
                          class="bubble-time"
                        >
                          ${escapeHtml(
                            formatDate(
                              m.createdAt
                            )
                          )}

                          ${
                            m.editedAt
                              ? `
                                <span
                                  class="edited-indicator"
                                >
                                  (Edited)
                                </span>
                              `
                              : ""
                          }
                        </div>

                        <div
                          class="message-actions-dropdown"
                          style="
                            margin-top:4px;
                            display:flex;
                            gap:8px;
                            font-size:11px;
                          "
                        >

                          <button
                            class="btn-text"
                            data-copy-msg="${escapeHtml(
                              m.text || ""
                            )}"
                          >
                            Copy
                          </button>

                          ${
                            isMine
                              ? `
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
                              `
                              : ""
                          }

                        </div>

                      </div>
                    `;
                  })
                  .join("")
              : `
                <div class="empty">
                  👋 Say hello and start
                  the conversation.
                </div>
              `
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


/* =========================================================
   CHAT LIST EVENT DELEGATION
   =========================================================
   This is intentionally installed once.
   It means app.js does NOT need a new chat-menu listener
   just for these new menu actions.
   ========================================================= */

if (!window.__marvelChatListMenuInstalled) {
  window.__marvelChatListMenuInstalled = true;

  document.addEventListener(
    "click",
    async event => {

      /* -----------------------------------------
         THREE DOTS BUTTON
         ----------------------------------------- */

      const menuButton =
        event.target.closest(
          "[data-chat-menu]"
        );

      if (menuButton) {
        event.stopPropagation();

        const conversationId =
          menuButton.dataset.chatMenu;

        const menu =
          document.querySelector(
            `[data-chat-options="${CSS.escape(
              conversationId
            )}"]`
          );

        if (!menu) {
          return;
        }

        const currentlyOpen =
          menu.style.display === "block";

        /*
         * Close every other menu first.
         */
        document
          .querySelectorAll(
            "[data-chat-options]"
          )
          .forEach(m => {
            m.style.display = "none";
          });

        document
          .querySelectorAll(
            "[data-chat-menu]"
          )
          .forEach(btn => {
            btn.setAttribute(
              "aria-expanded",
              "false"
            );
          });

        if (!currentlyOpen) {
          menu.style.display = "block";

          menuButton.setAttribute(
            "aria-expanded",
            "true"
          );
        }

        return;
      }


      /* -----------------------------------------
         MENU OPTION
         ----------------------------------------- */

      const option =
        event.target.closest(
          "[data-chat-action]"
        );

      if (option) {
        event.stopPropagation();

        const action =
          option.dataset.chatAction;

        const conversationId =
          option.dataset.chatId;

        /*
         * Close menu immediately.
         */
        document
          .querySelectorAll(
            "[data-chat-options]"
          )
          .forEach(m => {
            m.style.display = "none";
          });

        document
          .querySelectorAll(
            "[data-chat-menu]"
          )
          .forEach(btn => {
            btn.setAttribute(
              "aria-expanded",
              "false"
            );
          });


        if (action === "pin") {
          await togglePinConversation(
            conversationId
          );

          /*
           * Re-render the current chat page
           * so Pin becomes Unpin immediately.
           */
          if (
            state.page === "chat" &&
            !state.activeConversation
          ) {
            const root =
              document.getElementById(
                "root"
              );

            if (root) {
              /*
               * Locate app controller indirectly
               * through the existing navigation.
               * The next state update will also keep
               * the data correct.
               */
              window.dispatchEvent(
                new CustomEvent(
                  "marvel-chat-refresh"
                )
              );
            }
          }

          return;
        }


        if (action === "copy") {
          await copyAllChat(
            conversationId
          );

          return;
        }


        if (action === "delete") {
          /*
           * renderApp is not directly available
           * inside this global listener.
           *
           * The conversation is removed from the
           * visible state immediately and the normal
           * application listener will reflect it.
           */
          await deleteChat(
            conversationId,
            () => {
              const root =
                document.getElementById(
                  "root"
                );

              if (
                root &&
                state.page === "chat" &&
                !state.activeConversation
              ) {
                /*
                 * The app's normal rendering lifecycle
                 * remains untouched.
                 */
                window.dispatchEvent(
                  new CustomEvent(
                    "marvel-chat-refresh"
                  )
                );
              }
            }
          );

          return;
        }

        return;
      }


      /* -----------------------------------------
         CLICK OUTSIDE MENU
         ----------------------------------------- */

      if (
        !event.target.closest(
          "[data-chat-options]"
        )
      ) {
        document
          .querySelectorAll(
            "[data-chat-options]"
          )
          .forEach(menu => {
            menu.style.display = "none";
          });

        document
          .querySelectorAll(
            "[data-chat-menu]"
          )
          .forEach(btn => {
            btn.setAttribute(
              "aria-expanded",
              "false"
            );
          });
      }

    }
  );
}


/* =========================================================
   PREVENT MENU CLICKS FROM OPENING CHAT
   ========================================================= */

if (!window.__marvelChatContainerGuardInstalled) {
  window.__marvelChatContainerGuardInstalled = true;

  document.addEventListener(
    "click",
    event => {
      const insideMenu =
        event.target.closest(
          "[data-chat-options]"
        );

      const menuButton =
        event.target.closest(
          "[data-chat-menu]"
        );

      if (
        insideMenu ||
        menuButton
      ) {
        event.stopPropagation();
      }
    },
    true
  );
}


/* =========================================================
   OPTIONAL APP REFRESH BRIDGE
   ========================================================= */

if (!window.__marvelChatRefreshBridgeInstalled) {
  window.__marvelChatRefreshBridgeInstalled = true;

  window.addEventListener(
    "marvel-chat-refresh",
    () => {
      /*
       * app.js already owns renderApp().
       *
       * If app.js exposes renderApp globally,
       * use it. Otherwise the current state remains
       * correct and the next normal render reflects it.
       */
      if (
        typeof window.renderApp ===
        "function"
      ) {
        window.renderApp();
      }
    }
  );
}
