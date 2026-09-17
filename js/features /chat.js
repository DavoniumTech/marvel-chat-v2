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
  serverTimestamp,
  increment,
  arrayUnion
} from "../firebase/firestore.js";

import {
  showModal,
  closeModal
} from "../components/modal.js";

import {
  toast
} from "../components/toast.js";

/* =========================================================
   INTERNAL APP RENDER BRIDGE
   ========================================================= */

let currentRenderApp = null;

function conversationUnreadCount(conversation) {
  const counts = conversation?.unreadCounts;
  const uid = state.user?.uid;

  if (!uid || !counts || typeof counts !== "object") {
    return 0;
  }

  return Number(counts[uid] || 0) || 0;
}

async function clearMyUnreadCount(conversation) {
  if (!conversation?.id || !state.user?.uid) {
    return;
  }

  if (conversationUnreadCount(conversation) <= 0) {
    return;
  }

  try {
    await updateDoc(
      doc(
        db,
        "conversations",
        conversation.id
      ),
      {
        [`unreadCounts.${state.user.uid}`]: 0
      }
    );

    const nextCounts = {
      ...(conversation.unreadCounts || {}),
      [state.user.uid]: 0
    };

    const index =
      state.conversations.findIndex(
        x => x.id === conversation.id
      );

    if (index >= 0) {
      state.conversations[index] = {
        ...state.conversations[index],
        unreadCounts: nextCounts
      };
    }

    if (state.activeConversation?.id === conversation.id) {
      state.activeConversation = {
        ...state.activeConversation,
        unreadCounts: nextCounts
      };
    }
  } catch (e) {
    console.warn(
      "Could not clear unread count:",
      e
    );
  }
}

/* =========================================================
   READ RECEIPT (CONVERSATION-LEVEL, NOT PER-MESSAGE)

   Marvel Chat message status is derived honestly from data
   we can actually prove:

     - "Sent"  -> the message document exists (write to
       Firestore succeeded). This is the only thing we can
       claim the instant a message is written.

     - "Read"  -> the OTHER participant's lastRead timestamp
       (stored once on the conversation document, not on
       every message) is at or after this message's
       createdAt.

   This intentionally does NOT create a Firestore listener
   per message, and does NOT claim "Delivered" as a separate
   state, because this client has no reliable signal for a
   message having reached the recipient's device without a
   listener that is always active for every conversation
   (which would not be honest to add given how this app is
   structured). A single write (this function) replaces what
   would otherwise require per-message read tracking.

   This write is wrapped defensively: older Firestore rules
   deployments may not yet allow the "lastRead" field on the
   conversation document. If so, this fails silently and the
   app simply shows "Sent" instead of "Read" until rules are
   updated — it never breaks the conversation.
   ========================================================= */

async function markConversationRead(conversationId) {
  if (!conversationId || !state.user?.uid) {
    return;
  }

  try {
    await updateDoc(
      doc(
        db,
        "conversations",
        conversationId
      ),
      {
        [`lastRead.${state.user.uid}`]:
          serverTimestamp()
      }
    );

    const index =
      state.conversations.findIndex(
        x => x.id === conversationId
      );

    const nowIso =
      new Date();

    if (index >= 0) {
      state.conversations[index] = {
        ...state.conversations[index],
        lastRead: {
          ...(state.conversations[index].lastRead || {}),
          [state.user.uid]: nowIso
        }
      };
    }

    if (state.activeConversation?.id === conversationId) {
      state.activeConversation = {
        ...state.activeConversation,
        lastRead: {
          ...(state.activeConversation.lastRead || {}),
          [state.user.uid]: nowIso
        }
      };
    }
  } catch (e) {
    /*
     * Non-fatal. Older Firestore rules may not allow the
     * "lastRead" field yet — the app simply shows "Sent"
     * instead of "Read" until rules are updated.
     */
    console.warn(
      "Could not update read receipt (this is safe to ignore until firestore.rules allows the lastRead field):",
      e
    );
  }
}

function toMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? 0
    : d.getTime();
}

/*
 * Returns "sent" or "read" for a message the current user
 * sent. Never returns anything for a message the current
 * user did not send — status is only ever shown on your own
 * messages, exactly like the honest data we have.
 */
function getOwnMessageStatus(message, conversation) {
  const otherUid =
    conversation?.participants?.find(
      x => x !== state.user?.uid
    );

  const otherLastRead =
    otherUid
      ? conversation?.lastRead?.[otherUid]
      : null;

  if (
    otherLastRead &&
    toMillis(otherLastRead) >=
      toMillis(message.createdAt)
  ) {
    return "read";
  }

  return "sent";
}

export function totalUnreadCount() {
  const uid = state.user?.uid;

  if (!uid) {
    return 0;
  }

  return (state.conversations || []).reduce(
    (sum, conversation) => {
      const preference =
        state.conversationPreferences[
          conversation.id
        ] || {};

      if (preference.deleted || conversation.deletedForAll) {
        return sum;
      }

      return (
        sum +
        conversationUnreadCount(
          conversation
        )
      );
    },
    0
  );
}

/* =========================================================
   NEW CHAT
   ========================================================= */

export function showNewChat(renderApp) {
  currentRenderApp =
    typeof renderApp === "function"
      ? renderApp
      : currentRenderApp;

  showModal(
    "Start a new chat",
    `
      <div class="field">
        <label>Enter the person's username</label>
        <input
          class="input"
          id="chatUsername"
          placeholder="username"
        >
      </div>

      <button
        class="btn btn-primary btn-block"
        id="findChatUser"
      >
        Find user
      </button>

      <div
        id="chatUserResult"
        style="margin-top:14px"
      ></div>
    `
  );

  document
    .getElementById("findChatUser")
    ?.addEventListener(
      "click",
      async () => {
        const username =
          document
            .getElementById("chatUsername")
            ?.value
            .trim();

        const result =
          document.getElementById(
            "chatUserResult"
          );

        if (!username) {
          if (result) {
            result.innerHTML =
              `<div class="status error">Enter a username.</div>`;
          }
          return;
        }

        if (result) {
          result.innerHTML =
            `<div class="empty">Searching…</div>`;
        }

        try {
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

          if (snap.empty) {
            if (result) {
              result.innerHTML =
                `<div class="empty">No user found.</div>`;
            }
            return;
          }

          if (result) {
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

                  return `
                    <div class="list-item">
                      <div class="profile-row">
                        <div class="avatar">
                          ${escapeHtml(
                            initials(
                              u.displayName ||
                              u.username
                            )
                          )}
                        </div>

                        <div class="profile-meta">
                          <strong>
                            ${escapeHtml(
                              u.displayName ||
                              u.username ||
                              "User"
                            )}
                          </strong>

                          <span class="small">
                            @${escapeHtml(
                              u.username ||
                              ""
                            )}
                          </span>
                        </div>

                        <button
                          class="btn btn-primary"
                          data-start-chat="${escapeHtml(
                            u.id
                          )}"
                        >
                          Chat
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join("");
          }

          result
            ?.querySelectorAll(
              "[data-start-chat]"
            )
            .forEach(btn => {
              btn.addEventListener(
                "click",
                async () => {
                  const uid =
                    btn.dataset.startChat;

                  try {
                    const profileSnap =
                      await getDoc(
                        doc(
                          db,
                          "users",
                          uid
                        )
                      );

                    if (
                      !profileSnap.exists()
                    ) {
                      toast(
                        "User profile disappeared."
                      );
                      return;
                    }

                    await createConversation(
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

                    toast(
                      friendly(e)
                    );
                  }
                }
              );
            });
        } catch (e) {
          if (result) {
            result.innerHTML =
              `<div class="status error">${escapeHtml(
                friendly(e)
              )}</div>`;
          }
        }
      }
    );
}

/* =========================================================
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

  const otherUid =
    other.uid ||
    other.id;

  if (!otherUid) {
    toast(
      "Could not start chat."
    );
    return;
  }

  try {
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
            otherUid
          )
      );

    if (existing) {
      if (existing.deletedForAll) {
        toast(
          "This conversation was deleted for everyone and can no longer be reopened. Start a new chat instead."
        );
        return;
      }

      const existingPref =
        state.conversationPreferences[
          existing.id
        ] || {};

      /*
       * Opening an existing conversation restores
       * only the user's deleted/hide state.
       *
       * Block is intentionally NOT changed here.
       */
      if (existingPref.deleted) {
        const prefRef =
          doc(
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
            updatedAt:
              serverTimestamp()
          },
          { merge: true }
        );

        state.conversationPreferences[
          existing.id
        ] = {
          ...existingPref,
          deleted: false
        };
      }

      closeModal();

      await openConversation(
        existing,
        renderApp
      );

      return;
    }

    const ref =
      await addDoc(
        collection(
          db,
          "conversations"
        ),
        {
          participants: [
            state.user.uid,
            otherUid
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

            [otherUid]: {
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

          unreadCounts: {
            [state.user.uid]: 0,
            [otherUid]: 0
          },

          updatedAt:
            serverTimestamp(),

          createdAt:
            serverTimestamp()
        }
      );

    const localConversation = {
      id: ref.id,

      participants: [
        state.user.uid,
        otherUid
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

        [otherUid]: {
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
      unreadCounts: {
        [state.user.uid]: 0,
        [otherUid]: 0
      },
      updatedAt: null,
      createdAt: null
    };

    state.conversations = [
      localConversation,
      ...state.conversations.filter(
        c =>
          c.id !==
          ref.id
      )
    ];

    closeModal();

    await openConversation(
      localConversation,
      renderApp
    );
  } catch (e) {
    console.error(
      "CREATE CONVERSATION ERROR:",
      e
    );

    toast(
      friendly(e)
    );
  }
}

/* =========================================================
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

  let c =
    typeof conversation === "string"
      ? state.conversations.find(
          x =>
            x.id ===
            conversation
        )
      : conversation;

  if (!c) {
    toast(
      "Conversation could not be opened."
    );
    return;
  }

  if (c.deletedForAll) {
    toast(
      "This conversation was deleted for everyone."
    );
    return;
  }

  const pref =
    state.conversationPreferences[
      c.id
    ] || {};

  /*
   * If the user previously deleted/hidden this chat,
   * opening it restores it.
   *
   * A blocked state is NOT automatically removed.
   */
  if (pref.deleted) {
    const prefRef =
      doc(
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
          updatedAt:
            serverTimestamp()
        },
        { merge: true }
      );

      state.conversationPreferences[
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

  state.activeConversation = c;
  state.messages = [];

  await clearMyUnreadCount(c);
  markConversationRead(c.id);

  c =
    state.conversations.find(
      x => x.id === c.id
    ) || c;

  state.activeConversation = c;

  state.unsubs.messages?.();
  state.unsubs.messages = null;

  state.unsubs.messages =
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
        /*
         * Capture the reader's scroll position BEFORE we touch
         * state/DOM. #messages is rebuilt (innerHTML) on every
         * renderApp() call, so scrollTop would otherwise reset
         * to 0 on every incoming message — this is what let a
         * new message yank someone back to the bottom while
         * they were reading older messages. We only want that
         * "snap to bottom" behavior when the reader was already
         * near the bottom (or the new message is their own).
         */
        const prevMessagesEl =
          document.getElementById(
            "messages"
          );

        const wasNearBottom =
          !prevMessagesEl ||
          prevMessagesEl.scrollHeight -
            prevMessagesEl.scrollTop -
            prevMessagesEl.clientHeight <
            120;

        const prevScrollRatio =
          prevMessagesEl &&
          prevMessagesEl.scrollHeight >
            prevMessagesEl.clientHeight
            ? prevMessagesEl.scrollTop /
              (prevMessagesEl.scrollHeight -
                prevMessagesEl.clientHeight)
            : 1;

        state.messages =
          snap.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );

        const latest =
          state.messages[
            state.messages.length - 1
          ];

        if (latest) {
          const index =
            state.conversations.findIndex(
              x =>
                x.id ===
                c.id
            );

          if (index >= 0) {
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

            state.activeConversation =
              state.conversations[
                index
              ];
          }

          if (
            latest.uid &&
            latest.uid !==
              state.user.uid
          ) {
            clearMyUnreadCount(
              state.activeConversation ||
                c
            );

            markConversationRead(
              c.id
            );
          }
        }

        if (
          state.page ===
          "chat"
        ) {
          const isOwnLatest =
            !!latest?.uid &&
            latest.uid ===
              state.user?.uid;

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

          setTimeout(
            () => {
              const el =
                document.getElementById(
                  "messages"
                );

              if (!el) {
                return;
              }

              if (
                wasNearBottom ||
                isOwnLatest
              ) {
                el.scrollTop =
                  el.scrollHeight;

                mc2HideNewMessagesPill();

                return;
              }

              /*
               * Reader was scrolled up looking at older
               * messages — do NOT force them to the bottom.
               * Restore their approximate position (the list
               * just got taller) and surface a small "new
               * messages" pill instead of yanking them.
               */
              const maxScroll =
                el.scrollHeight -
                el.clientHeight;

              el.scrollTop =
                maxScroll > 0
                  ? maxScroll *
                    prevScrollRatio
                  : 0;

              if (!isOwnLatest) {
                mc2ShowNewMessagesPill();
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

        toast(
          friendly(err)
        );
      }
    );

  state.page = "chat";

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

  setTimeout(
    () => {
      const el =
        document.getElementById(
          "messages"
        );

      if (el) {
        el.scrollTop =
          el.scrollHeight;
      }
    },
    50
  );
}

/* =========================================================
   SEND MESSAGE
   ========================================================= */

export async function sendMessage() {
  const input =
    document.getElementById(
      "messageInput"
    );

  const text =
    input?.value.trim();

  if (
    !text ||
    !state.activeConversation
  ) {
    return;
  }

  const id =
    state.activeConversation.id;

  if (state.activeConversation.deletedForAll) {
    toast(
      "This conversation was deleted for everyone."
    );
    return;
  }

  const preference =
    state.conversationPreferences[
      id
    ] || {};

  /*
   * Do not allow sending while this user
   * has blocked the conversation.
   */
  if (preference.blocked) {
    toast(
      "User is blocked. Unblock the user to continue chatting."
    );
    return;
  }

  try {
    input.disabled = true;

    const docRef =
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

    await updateDoc(
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

    const newMsg = {
      id: docRef.id,

      uid:
        state.user.uid,

      text,

      createdAt:
        new Date()
    };

    state.messages.push(
      newMsg
    );

    const recipientUid =
      state.activeConversation
        .participants
        ?.find(
          x =>
            x !==
            state.user.uid
        );

    if (recipientUid) {
      try {
        await updateDoc(
          doc(
            db,
            "conversations",
            id
          ),
          {
            [`unreadCounts.${recipientUid}`]:
              increment(1)
          }
        );

        const index =
          state.conversations.findIndex(
            x => x.id === id
          );

        if (index >= 0) {
          const currentCounts =
            state.conversations[index]
              .unreadCounts || {};

          state.conversations[index] = {
            ...state.conversations[index],
            lastMessage: text,
            unreadCounts: {
              ...currentCounts,
              [recipientUid]:
                Number(
                  currentCounts[
                    recipientUid
                  ] || 0
                ) + 1
            }
          };

          if (
            state.activeConversation
              ?.id === id
          ) {
            state.activeConversation =
              state.conversations[index];
          }
        }
      } catch (unreadErr) {
        console.warn(
          "Could not increment unread count:",
          unreadErr
        );
      }
    }

    const recipientPref =
      state.conversationPreferences[
        id
      ] || {};

    if (
      recipientUid &&
      !recipientPref.muted
    ) {
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
            type:
              "message",

            actorUid:
              state.user.uid,

            actorName,

            targetId:
              id,

            text:
              `${actorName} sent you a message.`,

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

    input.value = "";
    mc2ResizeComposerTextarea(input);
  } catch (e) {
    console.error(
      "SEND MESSAGE ERROR:",
      e
    );

    toast(
      friendly(e)
    );
  } finally {
    input.disabled =
      false;

    input.focus();
  }
}

/* =========================================================
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

  if (
    !msg ||
    msg.uid !==
    state.user.uid
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
        >${escapeHtml(
          msg.text || ""
        )}</textarea>
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

        if (!text) {
          toast(
            "Message cannot be empty."
          );
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

              editedAt:
                serverTimestamp()
            }
          );

          state.messages =
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

          closeModal();

          toast(
            "Message updated"
          );
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

/*
 * =========================================================
 * DELETE MESSAGE — "DELETE FOR EVERYONE"
 * =========================================================
 *
 * IMPORTANT COMPATIBILITY NOTE:
 *
 * This used to be a hard `deleteDoc`. It is now a SOFT
 * delete: the message document is preserved (same id, same
 * createdAt) and marked `deletedForEveryone: true` with its
 * text cleared. Existing messages created before this change
 * simply don't have `deletedForEveryone` set, so they render
 * exactly as before — nothing about old messages changes.
 *
 * This keeps the existing export name, the existing
 * `data-delete-msg` wiring in app.js, and the existing
 * owner-only permission check, so nothing else needs to
 * change to keep this working.
 */
export async function deleteMessage(
  messageId
) {
  const msg =
    state.messages.find(
      m =>
        m.id ===
        messageId
    );

  if (
    !msg ||
    msg.uid !==
    state.user.uid
  ) {
    return;
  }

  showModal(
    "Delete for everyone?",
    `
      <p class="small">
        This removes the message for both people in this
        conversation. This cannot be undone.
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
          Delete for everyone
        </button>
      </div>
    `
  );

  document
    .getElementById(
      "cancelDelMsg"
    )
    ?.addEventListener(
      "click",
      closeModal
    );

  document
    .getElementById(
      "confirmDelMsg"
    )
    ?.addEventListener(
      "click",
      async () => {
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
              deletedForEveryone: true,
              deletedForEveryoneBy: state.user.uid,
              deletedForEveryoneAt: serverTimestamp(),
              text: ""
            }
          );

          state.messages =
            state.messages.map(
              m =>
                m.id === messageId
                  ? {
                      ...m,
                      deletedForEveryone: true,
                      deletedForEveryoneBy: state.user.uid,
                      text: ""
                    }
                  : m
            );

          const latestVisible =
            [...state.messages]
              .reverse()
              .find(
                m => !m.deletedForEveryone
              );

          await updateDoc(
            doc(
              db,
              "conversations",
              state.activeConversation.id
            ),
            {
              lastMessage:
                latestVisible
                  ? latestVisible.text
                  : "",

              updatedAt:
                latestVisible
                  ? latestVisible.createdAt
                  : serverTimestamp()
            }
          );

          closeModal();

          toast(
            "Message deleted for everyone."
          );

          if (
            typeof currentRenderApp ===
            "function"
          ) {
            currentRenderApp();
          }
        } catch (e) {
          console.error(
            "DELETE MESSAGE ERROR:",
            e
          );

          toast(
            friendly(e)
          );
        }
      }
    );
}

/*
 * =========================================================
 * DELETE MESSAGE — "DELETE FOR ME"
 * =========================================================
 *
 * New. Available to ANY participant (not just the message
 * owner) — it only affects what the current user sees.
 *
 * Data model: a `deletedFor` array field on the message
 * document, holding the uids of users who have hidden it.
 * Old messages have no `deletedFor` field, which is treated
 * as an empty array, so they display normally.
 *
 * NOTE: because a non-owner participant needs to write to a
 * message document they do not own, this requires
 * firestore.rules to allow updates that ONLY touch the
 * `deletedFor` field and only add the requester's own uid.
 * Until that rule is deployed, this call will fail with a
 * permission error for messages the user does not own; the
 * failure is caught and surfaced as a normal toast rather
 * than breaking the conversation.
 */
export async function deleteMessageForMe(
  messageId
) {
  const msg =
    state.messages.find(
      m => m.id === messageId
    );

  if (!msg || !state.activeConversation?.id) {
    return;
  }

  showModal(
    "Delete this message for you?",
    `
      <p class="small">
        This removes the message from your view only. The
        other participant keeps their copy.
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
          id="cancelDelForMeMsg"
          style="flex:1;"
        >
          Cancel
        </button>

        <button
          class="btn btn-danger"
          id="confirmDelForMeMsg"
          style="flex:1;"
        >
          Delete for me
        </button>
      </div>
    `
  );

  document
    .getElementById("cancelDelForMeMsg")
    ?.addEventListener("click", closeModal);

  document
    .getElementById("confirmDelForMeMsg")
    ?.addEventListener(
      "click",
      async () => {
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
              deletedFor:
                arrayUnion(state.user.uid)
            }
          );

          state.messages =
            state.messages.map(
              m =>
                m.id === messageId
                  ? {
                      ...m,
                      deletedFor: [
                        ...(m.deletedFor || []),
                        state.user.uid
                      ]
                    }
                  : m
            );

          closeModal();

          toast(
            "Message removed from your view."
          );

          if (
            typeof currentRenderApp ===
            "function"
          ) {
            currentRenderApp();
          }
        } catch (e) {
          console.error(
            "DELETE MESSAGE FOR ME ERROR:",
            e
          );

          toast(
            friendly(e)
          );
        }
      }
    );
}

/*
 * =========================================================
 * PIN / UNPIN A SINGLE MESSAGE
 * =========================================================
 *
 * This is intentionally separate from conversation-level
 * pinning (togglePinConversation, below), which pins an
 * entire CHAT in the chat list. This pins one MESSAGE inside
 * an open conversation so it can be highlighted at the top.
 *
 * Data model: `pinned` (bool), `pinnedBy` (uid), `pinnedAt`
 * (server timestamp) on the message document. Old messages
 * have none of these fields, which is treated as unpinned.
 *
 * NOTE: like "delete for me", a participant pinning a
 * message they did not send needs firestore.rules to allow
 * an update that only touches `pinned`/`pinnedBy`/`pinnedAt`
 * from any conversation participant, not just the owner.
 * Until that rule is deployed, pinning another participant's
 * message will fail with a permission error, caught below
 * and surfaced as a toast.
 */
export async function toggleMessagePin(
  messageId
) {
  if (!state.activeConversation?.id) {
    return;
  }

  const msg =
    state.messages.find(
      m => m.id === messageId
    );

  if (!msg) {
    return;
  }

  const nowPinned = !msg.pinned;

  try {
    await updateDoc(
      doc(
        db,
        "conversations",
        state.activeConversation.id,
        "messages",
        messageId
      ),
      nowPinned
        ? {
            pinned: true,
            pinnedBy: state.user.uid,
            pinnedAt: serverTimestamp()
          }
        : {
            pinned: false,
            pinnedBy: null,
            pinnedAt: null
          }
    );

    state.messages =
      state.messages.map(
        m =>
          m.id === messageId
            ? {
                ...m,
                pinned: nowPinned,
                pinnedBy:
                  nowPinned
                    ? state.user.uid
                    : null
              }
            : m
      );

    toast(
      nowPinned
        ? "Message pinned 📌"
        : "Message unpinned"
    );

    if (
      typeof currentRenderApp ===
      "function"
    ) {
      currentRenderApp();
    }
  } catch (e) {
    console.error(
      "PIN MESSAGE ERROR:",
      e
    );

    toast(
      friendly(e)
    );
  }
}

/*
 * =========================================================
 * REPORT A SINGLE MESSAGE (OR ITS SENDER)
 * =========================================================
 *
 * Writes to the existing top-level `reports` collection with
 * `reporterUid == request.auth.uid`, which is already
 * permitted by the current firestore.rules — no rules change
 * needed for this one.
 */
export async function reportMessageModal(
  messageId
) {
  const msg =
    state.messages.find(
      m => m.id === messageId
    );

  if (!msg || !state.activeConversation?.id) {
    return;
  }

  const conversationId =
    state.activeConversation.id;

  showModal(
    "Report message",
    `
      <p class="small">
        Select a reason for reporting this message:
      </p>

      <div
        class="field"
        style="margin:12px 0;"
      >
        <select
          class="input"
          id="reportMsgReason"
        >
          <option value="Spam">Spam</option>
          <option value="Harassment">Harassment</option>
          <option value="Inappropriate behavior">
            Inappropriate behavior
          </option>
          <option value="Scam/fraud concern">
            Scam/fraud concern
          </option>
          <option value="Other">Other</option>
        </select>
      </div>

      <button
        class="btn btn-danger btn-block"
        id="submitMsgReport"
      >
        Submit Report
      </button>
    `
  );

  document
    .getElementById("submitMsgReport")
    ?.addEventListener(
      "click",
      async () => {
        const reason =
          document
            .getElementById("reportMsgReason")
            ?.value || "Other";

        try {
          await addDoc(
            collection(db, "reports"),
            {
              type: "message",
              reporterUid: state.user.uid,
              reportedUid: msg.uid,
              conversationId,
              messageId,
              reason,
              createdAt: serverTimestamp()
            }
          );

          closeModal();

          toast(
            "Report submitted successfully. Thank you."
          );
        } catch (e) {
          console.error(
            "REPORT MESSAGE ERROR:",
            e
          );

          toast(
            "Could not submit report. Note that security rules may require specific report permissions."
          );
        }
      }
    );
}

/* =========================================================
   COPY SINGLE MESSAGE
   ========================================================= */

export async function copyMessage(
  text
) {
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
    !!state
      .conversationPreferences[
        conversationId
      ]?.pinned;

  try {
    const prefRef =
      doc(
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

          updatedAt:
            serverTimestamp()
        },
        { merge: true }
      );

      state.conversationPreferences[
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

      toast(
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

      state.conversationPreferences[
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

      toast(
        "Conversation pinned 📌"
      );
    }
  } catch (e) {
    console.error(
      "PIN ERROR:",
      e
    );

    toast(
      friendly(e)
    );
  }
}

/* =========================================================
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

  try {
    const prefRef =
      doc(
        db,
        "users",
        state.user.uid,
        "conversationPreferences",
        conversationId
      );

    await setDoc(
      prefRef,
      {
        archived:
          !isArchived,

        updatedAt:
          serverTimestamp()
      },
      { merge: true }
    );

    state.conversationPreferences[
      conversationId
    ] = {
      ...(
        state
          .conversationPreferences[
            conversationId
          ] || {}
      ),

      archived:
        !isArchived
    };

    toast(
      !isArchived
        ? "Conversation archived 📦"
        : "Conversation unarchived"
    );
  } catch (e) {
    console.error(
      "ARCHIVE ERROR:",
      e
    );

    toast(
      friendly(e)
    );
  }
}

/* =========================================================
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

  try {
    const prefRef =
      doc(
        db,
        "users",
        state.user.uid,
        "conversationPreferences",
        conversationId
      );

    await setDoc(
      prefRef,
      {
        muted:
          !isMuted,

        updatedAt:
          serverTimestamp()
      },
      { merge: true }
    );

    state.conversationPreferences[
      conversationId
    ] = {
      ...(
        state
          .conversationPreferences[
            conversationId
          ] || {}
      ),

      muted:
        !isMuted
    };

    toast(
      !isMuted
        ? "Notifications muted 🔕"
        : "Notifications unmuted 🔔"
    );
  } catch (e) {
    console.error(
      "MUTE ERROR:",
      e
    );

    toast(
      friendly(e)
    );
  }
}

/* =========================================================
   CHAT BACKGROUND SELECTOR
   ========================================================= */

export function showChatBackgroundModal(
  conversationId,
  renderApp
) {
  currentRenderApp =
    typeof renderApp === "function"
      ? renderApp
      : currentRenderApp;

  const currentBg =
    state.conversationPreferences[
      conversationId
    ]?.background || "classic";

  const backgrounds = [
    {
      id: "classic",
      name: "Classic",
      preview: "var(--surface)"
    },
    {
      id: "midnight",
      name: "Midnight",
      preview: "linear-gradient(135deg, #1f2937, #0b1220)"
    },
    {
      id: "purple",
      name: "Marvel Purple",
      preview: "linear-gradient(135deg, #3b1f6e, #1c0f33)"
    },
    {
      id: "ocean",
      name: "Ocean",
      preview: "linear-gradient(135deg, #124559, #071b22)"
    },
    {
      id: "softlight",
      name: "Soft Light",
      preview: "linear-gradient(135deg, #ffffff, #eef1f5)"
    },
    {
      id: "nebula",
      name: "Marvel Nebula",
      preview:
        "radial-gradient(circle at 30% 30%, #a855f7, #1b1030 70%)"
    }
  ];

  showModal(
    "Chat background",
    `
      <p class="small">
        Choose a simple background for this conversation.
      </p>

      <div
        style="
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:10px;
          margin-top:16px;
        "
      >
        ${backgrounds
          .map(
            bg => `
              <button
                type="button"
                data-select-bg="${bg.id}"
                class="btn ${
                  currentBg === bg.id
                    ? "btn-primary"
                    : "btn-ghost"
                }"
                style="
                  display:flex;
                  align-items:center;
                  gap:10px;
                  justify-content:flex-start;
                  min-height:48px;
                "
              >
                <span
                  style="
                    width:22px;
                    height:22px;
                    flex:none;
                    border-radius:50%;
                    background:${bg.preview};
                    border:1px solid var(--border);
                  "
                ></span>

                <span>
                  ${
                    currentBg === bg.id
                      ? "✓ "
                      : ""
                  }${bg.name}
                </span>
              </button>
            `
          )
          .join("")}
      </div>
    `
  );

  document
    .querySelectorAll(
      "[data-select-bg]"
    )
    .forEach(btn => {
      btn.addEventListener(
        "click",
        async () => {
          const bgId =
            btn.dataset.selectBg;

          try {
            const prefRef =
              doc(
                db,
                "users",
                state.user.uid,
                "conversationPreferences",
                conversationId
              );

            await setDoc(
              prefRef,
              {
                background:
                  bgId,

                updatedAt:
                  serverTimestamp()
              },
              { merge: true }
            );

            state.conversationPreferences[
              conversationId
            ] = {
              ...(
                state
                  .conversationPreferences[
                    conversationId
                  ] || {}
              ),

              background:
                bgId
            };

            closeModal();

            toast(
              "Chat background updated 🎨"
            );

            const renderer =
              typeof renderApp ===
              "function"
                ? renderApp
                : currentRenderApp;

            if (
              typeof renderer ===
              "function"
            ) {
              renderer();
            }
          } catch (e) {
            console.error(
              "BACKGROUND ERROR:",
              e
            );

            toast(
              friendly(e)
            );
          }
        }
      );
    });
}

/* =========================================================
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

  const isBlocked =
    !!state
      .conversationPreferences[
        conversationId
      ]?.blocked;

  /*
   * If already blocked, clicking the menu
   * immediately reverses the block.
   */
  if (isBlocked) {
    await executeBlock(
      conversationId,
      false,
      renderApp
    );

    return;
  }

  showModal(
    "Block user?",
    `
      <p class="small">
        You can unblock this user later.
        The conversation and existing messages
        will not be deleted.
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
          id="cancelBlock"
          style="flex:1;"
        >
          Cancel
        </button>

        <button
          class="btn btn-danger"
          id="confirmBlock"
          style="flex:1;"
        >
          Block
        </button>
      </div>
    `
  );

  document
    .getElementById(
      "cancelBlock"
    )
    ?.addEventListener(
      "click",
      closeModal
    );

  document
    .getElementById(
      "confirmBlock"
    )
    ?.addEventListener(
      "click",
      async () => {
        await executeBlock(
          conversationId,
          true,
          renderApp
        );
      }
    );
}

async function executeBlock(
  conversationId,
  blockState,
  renderApp
) {
  try {
    const prefRef =
      doc(
        db,
        "users",
        state.user.uid,
        "conversationPreferences",
        conversationId
      );

    /*
     * IMPORTANT:
     *
     * Block and Delete are separate.
     *
     * Blocking NEVER sets deleted:true.
     */
    await setDoc(
      prefRef,
      {
        blocked:
          blockState,

        updatedAt:
          serverTimestamp()
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

      blocked:
        blockState
    };

    /*
     * Stop the active message listener when
     * blocking the currently open conversation.
     */
    if (
      state.activeConversation?.id ===
      conversationId
    ) {
      state.unsubs.messages?.();

      state.unsubs.messages =
        null;

      state.activeConversation =
        null;

      state.messages = [];
    }

    closeModal();

    toast(
      blockState
        ? "User blocked 🚫"
        : "User unblocked 🔓"
    );

    const renderer =
      typeof renderApp ===
      "function"
        ? renderApp
        : currentRenderApp;

    if (
      typeof renderer ===
      "function"
    ) {
      renderer();
    }
  } catch (e) {
    console.error(
      "BLOCK ERROR:",
      e
    );

    toast(
      friendly(e)
    );
  }
}

/* =========================================================
   REPORT USER
   ========================================================= */

export async function reportUserModal(
  conversationId
) {
  const c =
    state.conversations.find(
      x =>
        x.id ===
        conversationId
    );

  if (!c) {
    return;
  }

  const otherUid =
    c.participants?.find(
      x =>
        x !==
        state.user.uid
    );

  if (!otherUid) {
    return;
  }

  showModal(
    "Report conversation / user",
    `
      <p class="small">
        Select a reason for reporting:
      </p>

      <div
        class="field"
        style="margin:12px 0;"
      >
        <select
          class="input"
          id="reportReason"
        >
          <option value="Spam">
            Spam
          </option>

          <option value="Harassment">
            Harassment
          </option>

          <option value="Inappropriate behavior">
            Inappropriate behavior
          </option>

          <option value="Scam/fraud concern">
            Scam/fraud concern
          </option>

          <option value="Other">
            Other
          </option>
        </select>
      </div>

      <button
        class="btn btn-danger btn-block"
        id="submitReport"
      >
        Submit Report
      </button>
    `
  );

  document
    .getElementById(
      "submitReport"
    )
    ?.addEventListener(
      "click",
      async () => {
        const reason =
          document
            .getElementById(
              "reportReason"
            )
            ?.value ||
          "Other";

        try {
          await addDoc(
            collection(
              db,
              "reports"
            ),
            {
              reporterUid:
                state.user.uid,

              reportedUid:
                otherUid,

              conversationId,

              reason,

              createdAt:
                serverTimestamp()
            }
          );

          closeModal();

          toast(
            "Report submitted successfully. Thank you."
          );
        } catch (e) {
          console.error(
            "REPORT ERROR:",
            e
          );

          toast(
            "Could not submit report. Note that security rules may require specific report permissions."
          );
        }
      }
    );
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

    if (
      messagesSnap.empty
    ) {
      toast(
        "There are no messages to copy."
      );
      return;
    }

    const lines =
      messagesSnap.docs.map(
        d => {
          const data =
            d.data();

          return (
            data.text ||
            ""
          );
        }
      );

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
   DELETE CONVERSATION — TWO MODES
   =========================================================

   "Delete for me":
     - Existing behavior, unchanged.
     - Sets users/{uid}/conversationPreferences/{id}.deleted
       to true. Hides the conversation from this user's list
       only. The other participant is unaffected.

   "Delete for everyone":
     - New behavior.
     - Firestore rules cannot recursively delete a
       conversation's messages subcollection, and this app
       has no backend/Cloud Function to do it either.
     - Instead we set a conversation-level marker,
       deletedForAll: true (plus who/when), which is only
       settable once, only by a participant, and only
       false -> true (see firestore.rules).
     - Both participants' clients treat a conversation with
       deletedForAll == true as hidden/unopenable, which is
       the honest, frontend-compatible equivalent of shared
       deletion given this architecture.
   ========================================================= */

export function deleteChat(
  conversationId,
  renderApp
) {
  currentRenderApp =
    typeof renderApp === "function"
      ? renderApp
      : currentRenderApp;

  showModal(
    "Delete chat",
    `
      <p class="small" style="margin-bottom:14px;">
        Choose an action:
      </p>

      <div style="display:flex; flex-direction:column; gap:10px;">

        <button
          type="button"
          class="btn btn-ghost"
          id="deleteForMeBtn"
          style="
            display:flex;
            flex-direction:column;
            align-items:flex-start;
            gap:2px;
            padding:12px 14px;
            height:auto;
          "
        >
          <strong>Delete for me</strong>
          <span class="small" style="font-weight:400;">
            Removes this chat from your chat list only. The
            other participant keeps their copy.
          </span>
        </button>

        <button
          type="button"
          class="btn btn-danger"
          id="deleteForEveryoneBtn"
          style="
            display:flex;
            flex-direction:column;
            align-items:flex-start;
            gap:2px;
            padding:12px 14px;
            height:auto;
          "
        >
          <strong>Delete for everyone</strong>
          <span class="small" style="font-weight:400; opacity:0.9;">
            Removes the conversation for both participants.
            This cannot be undone.
          </span>
        </button>

        <button
          type="button"
          class="btn btn-ghost"
          id="cancelDeleteChatModeBtn"
        >
          Cancel
        </button>

      </div>
    `
  );

  document
    .getElementById("cancelDeleteChatModeBtn")
    ?.addEventListener("click", closeModal);

  document
    .getElementById("deleteForMeBtn")
    ?.addEventListener(
      "click",
      () => {
        confirmDeleteForMe(
          conversationId,
          renderApp
        );
      }
    );

  document
    .getElementById("deleteForEveryoneBtn")
    ?.addEventListener(
      "click",
      () => {
        confirmDeleteForEveryone(
          conversationId,
          renderApp
        );
      }
    );
}

/* ---------------------------------------------------------
   DELETE FOR ME (confirmation + existing behavior)
   --------------------------------------------------------- */

function confirmDeleteForMe(
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
    .getElementById(
      "cancelDeleteChat"
    )
    ?.addEventListener(
      "click",
      closeModal
    );

  document
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

          await setDoc(
            prefRef,
            {
              deleted:
                true,

              pinned:
                false,

              updatedAt:
                serverTimestamp()
            },
            { merge: true }
          );

          state.conversationPreferences[
            conversationId
          ] = {
            ...(
              state
                .conversationPreferences[
                  conversationId
                ] || {}
            ),

            deleted:
              true,

            pinned:
              false
          };

          if (
            state
              .activeConversation
              ?.id ===
            conversationId
          ) {
            state.unsubs.messages?.();

            state.unsubs.messages =
              null;

            state.activeConversation =
              null;

            state.messages = [];
          }

          closeModal();

          toast(
            "Chat deleted from your list."
          );

          const renderer =
            typeof renderApp ===
            "function"
              ? renderApp
              : currentRenderApp;

          if (
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

          toast(
            "Could not delete chat."
          );
        }
      }
    );
}

/* ---------------------------------------------------------
   DELETE FOR EVERYONE (extra-destructive confirmation)
   --------------------------------------------------------- */

function confirmDeleteForEveryone(
  conversationId,
  renderApp
) {
  showModal(
    "Delete for everyone?",
    `
      <p class="small">
        This removes the conversation from <strong>both</strong>
        participants' chat lists. Existing messages remain in
        Firestore (this app cannot bulk-delete a message
        subcollection from the client), but neither participant
        will be able to see or reopen this conversation again.
      </p>

      <p class="small" style="color:var(--danger); font-weight:600;">
        This action cannot be undone.
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
          id="cancelDeleteForEveryone"
          style="flex:1;"
        >
          Cancel
        </button>

        <button
          class="btn btn-danger"
          id="confirmDeleteForEveryone"
          style="flex:1;"
        >
          Delete for everyone
        </button>
      </div>
    `
  );

  document
    .getElementById("cancelDeleteForEveryone")
    ?.addEventListener("click", closeModal);

  document
    .getElementById("confirmDeleteForEveryone")
    ?.addEventListener(
      "click",
      async () => {
        try {
          const conversationRef =
            doc(
              db,
              "conversations",
              conversationId
            );

          await updateDoc(
            conversationRef,
            {
              deletedForAll: true,
              deletedForAllBy: state.user.uid,
              deletedForAllAt: serverTimestamp()
            }
          );

          /*
           * Also mark it deleted for the current user's own
           * list immediately (belt-and-braces — the shared
           * deletedForAll flag already hides it for both,
           * but this keeps local state/UI consistent even
           * before the conversations listener refreshes).
           */
          const prefRef =
            doc(
              db,
              "users",
              state.user.uid,
              "conversationPreferences",
              conversationId
            );

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

          const index =
            state.conversations.findIndex(
              x => x.id === conversationId
            );

          if (index >= 0) {
            state.conversations[index] = {
              ...state.conversations[index],
              deletedForAll: true,
              deletedForAllBy: state.user.uid
            };
          }

          if (
            state.activeConversation?.id ===
            conversationId
          ) {
            state.unsubs.messages?.();
            state.unsubs.messages = null;
            state.activeConversation = null;
            state.messages = [];
          }

          closeModal();

          toast(
            "Conversation deleted for everyone."
          );

          const renderer =
            typeof renderApp === "function"
              ? renderApp
              : currentRenderApp;

          if (typeof renderer === "function") {
            renderer();
          }
        } catch (e) {
          console.error(
            "DELETE FOR EVERYONE ERROR:",
            e
          );

          toast(
            friendly(e)
          );
        }
      }
    );
}

/* =========================================================
   CHAT LIST FILTERING / SORTING (shared by full render and
   the lightweight search-only DOM update)
   ========================================================= */

function getVisibleConversations() {
  const searchQuery =
    (
      state.chatSearchQuery ||
      ""
    ).toLowerCase();

  const viewingArchived =
    !!state.viewingArchivedChats;

  let conversations =
    state.conversations.filter(
      c => {
        /*
         * A conversation deleted for everyone is hidden
         * for both participants, no matter what.
         */
        if (c.deletedForAll) {
          return false;
        }

        const preference =
          state
            .conversationPreferences[
              c.id
            ] || {};

        /*
         * Deleted chats are hidden.
         *
         * BLOCKED chats are intentionally NOT
         * hidden. This allows the user to see
         * them and unblock them later.
         */
        if (
          preference.deleted
        ) {
          return false;
        }

        const isArchived =
          !!preference.archived;

        if (
          viewingArchived &&
          !isArchived
        ) {
          return false;
        }

        if (
          !viewingArchived &&
          isArchived
        ) {
          return false;
        }

        if (!searchQuery) {
          return true;
        }

        const other =
          c.participants?.find(
            x =>
              x !==
              state.user.uid
          );

        const profile =
          c
            .participantProfiles?.[
              other
            ] || {};

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

  conversations.sort(
    (a, b) => {
      const aPinned =
        !!state
          .conversationPreferences[
            a.id
          ]?.pinned;

      const bPinned =
        !!state
          .conversationPreferences[
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
    }
  );

  return conversations;
}

/*
 * Shared conversation options menu (pin / archive / mute /
 * background / copy / block / report / delete). Rendered
 * once here so it can be reused both by the chat list item's
 * "⋮" trigger and by the open conversation's premium header
 * "⋮" trigger, without duplicating markup or drifting out of
 * sync. Behavior (data-chat-action / data-chat-options wiring)
 * is unchanged from the original chat-list-only version.
 */
function renderChatOptionsMenuHTML(c) {
  const preference =
    state.conversationPreferences[c.id] || {};

  const pinned = !!preference.pinned;
  const muted = !!preference.muted;
  const archived = !!preference.archived;
  const blocked = !!preference.blocked;

  return `
      <div
        class="chat-options-menu mc2-options-menu"
        data-chat-options="${escapeHtml(
          c.id
        )}"
        style="
          display:none;
          position:absolute;
          right:10px;
          top:52px;
          z-index:100;
          min-width:210px;
          max-width:calc(100% - 20px);
          background:var(--surface);
          border:1px solid var(--border);
          border-radius:15px;
          box-shadow:var(--shadow2);
          padding:6px;
        "
      >

        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:8px;
            padding:4px 6px 2px 12px;
          "
        >
          <div
            style="
              font-size:11px;
              font-weight:bold;
              color:var(--muted);
              text-transform:uppercase;
            "
          >
            Conversation
          </div>

          <button
            type="button"
            class="icon-btn"
            data-chat-action="close"
            data-chat-id="${escapeHtml(
              c.id
            )}"
            aria-label="Close menu"
            title="Close"
            style="
              width:28px;
              height:28px;
              border-radius:8px;
              font-size:16px;
              line-height:1;
              padding:0;
            "
          >
            ✕
          </button>
        </div>

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
            padding:9px 12px;
            border-radius:8px;
            font-weight:600;
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
          data-chat-action="archive"
          data-chat-id="${escapeHtml(
            c.id
          )}"
          style="
            width:100%;
            border:0;
            background:transparent;
            color:var(--text);
            text-align:left;
            padding:9px 12px;
            border-radius:8px;
            font-weight:600;
            cursor:pointer;
          "
        >
          ${
            archived
              ? "📦 Unarchive chat"
              : "📦 Archive chat"
          }
        </button>

        <button
          type="button"
          class="chat-option-btn"
          data-chat-action="mute"
          data-chat-id="${escapeHtml(
            c.id
          )}"
          style="
            width:100%;
            border:0;
            background:transparent;
            color:var(--text);
            text-align:left;
            padding:9px 12px;
            border-radius:8px;
            font-weight:600;
            cursor:pointer;
          "
        >
          ${
            muted
              ? "🔔 Unmute notifications"
              : "🔕 Mute notifications"
          }
        </button>

        <button
          type="button"
          class="chat-option-btn"
          data-chat-action="background"
          data-chat-id="${escapeHtml(
            c.id
          )}"
          style="
            width:100%;
            border:0;
            background:transparent;
            color:var(--text);
            text-align:left;
            padding:9px 12px;
            border-radius:8px;
            font-weight:600;
            cursor:pointer;
          "
        >
          🎨 Chat background
        </button>

        <div
          style="
            height:1px;
            background:var(--border);
            margin:4px 0;
          "
        ></div>

        <div
          style="
            padding:6px 12px;
            font-size:11px;
            font-weight:bold;
            color:var(--muted);
            text-transform:uppercase;
          "
        >
          Tools
        </div>

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
            padding:9px 12px;
            border-radius:8px;
            font-weight:600;
            cursor:pointer;
          "
        >
          📋 Copy all chat
        </button>

        <div
          style="
            height:1px;
            background:var(--border);
            margin:4px 0;
          "
        ></div>

        <div
          style="
            padding:6px 12px;
            font-size:11px;
            font-weight:bold;
            color:var(--muted);
            text-transform:uppercase;
          "
        >
          Safety & Danger
        </div>

        <button
          type="button"
          class="chat-option-btn"
          data-chat-action="block"
          data-chat-id="${escapeHtml(
            c.id
          )}"
          style="
            width:100%;
            border:0;
            background:transparent;
            color:${
              blocked
                ? "var(--text)"
                : "var(--danger)"
            };
            text-align:left;
            padding:9px 12px;
            border-radius:8px;
            font-weight:600;
            cursor:pointer;
          "
        >
          ${
            blocked
              ? "🔓 Unblock user"
              : "🚫 Block user"
          }
        </button>

        <button
          type="button"
          class="chat-option-btn"
          data-chat-action="report"
          data-chat-id="${escapeHtml(
            c.id
          )}"
          style="
            width:100%;
            border:0;
            background:transparent;
            color:var(--danger);
            text-align:left;
            padding:9px 12px;
            border-radius:8px;
            font-weight:600;
            cursor:pointer;
          "
        >
          ⚠️ Report user
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
            padding:9px 12px;
            border-radius:8px;
            font-weight:600;
            cursor:pointer;
          "
        >
          🗑️ Delete chat
        </button>

      </div>
  `;
}

function renderChatListItemHTML(c) {
  const other =
    c.participants?.find(
      x =>
        x !==
        state.user.uid
    );

  const profile =
    c
      .participantProfiles?.[
        other
      ] || {};

  const name =
    profile.displayName ||
    profile.username ||
    "User";

  const preference =
    state
      .conversationPreferences[
        c.id
      ] || {};

  const pinned =
    !!preference.pinned;

  const muted =
    !!preference.muted;

  const archived =
    !!preference.archived;

  const blocked =
    !!preference.blocked;

  const unread =
    conversationUnreadCount(
      c
    );

  return `
    <div
      class="chat-item mc2-chat-item ${
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
          initials(
            name
          )
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

          ${
            muted
              ? " 🔕"
              : ""
          }

          ${
            archived
              ? " 📦"
              : ""
          }

          ${
            blocked
              ? " 🚫"
              : ""
          }
        </strong>

        <p
          class="mc2-chat-preview"
          style="
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            margin:4px 0 0;
            font-weight:${
              unread > 0
                ? "700"
                : "400"
            };
          "
        >
          ${
            blocked
              ? "🚫 User blocked"
              : escapeHtml(
                  c.lastMessage ||
                  "Start chatting"
                )
          }
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

        ${
          unread > 0
            ? `
              <span
                class="badge mc2-unread-badge"
                style="
                  background:var(--danger);
                  color:#fff;
                  min-width:20px;
                  text-align:center;
                "
              >
                ${
                  unread > 99
                    ? "99+"
                    : unread
                }
              </span>
            `
            : ""
        }

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

      ${renderChatOptionsMenuHTML(c)}
    </div>
  `;
}

function renderChatListContainerHTML() {
  const conversations =
    getVisibleConversations();

  const viewingArchived =
    !!state.viewingArchivedChats;

  if (!conversations.length) {
    return `
      <div class="card empty">

        <div
          style="font-size:42px"
        >
          💬
        </div>

        <h3>
          ${
            viewingArchived
              ? "No archived conversations"
              : "No conversations found"
          }
        </h3>

        <p>
          ${
            viewingArchived
              ? "Archived chats will appear here."
              : "Try searching or start a new conversation."
          }
        </p>

        ${
          !viewingArchived
            ? `
              <button
                class="btn btn-primary"
                id="newChatEmpty"
              >
                Start a chat
              </button>
            `
            : ""
        }

      </div>
    `;
  }

  return `
    <div
      class="chat-list mc2-chat-list"
      id="chatList"
    >
      ${conversations
        .map(renderChatListItemHTML)
        .join("")}
    </div>
  `;
}

/*
 * Re-renders ONLY the conversation list/empty-state markup,
 * leaving the search input (and everything else on the page)
 * untouched. This is what keeps the mobile keyboard open and
 * the input focused while the user types a search query.
 */
function updateChatListContainer() {
  const container =
    document.getElementById(
      "chatListContainer"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    renderChatListContainerHTML();
}

/* =========================================================
   CHAT LIST
   ========================================================= */

export function renderChat(
  renderApp
) {
  currentRenderApp =
    typeof renderApp === "function"
      ? renderApp
      : currentRenderApp;

  if (
    state.activeConversation
  ) {
    return renderConversation();
  }

  const viewingArchived =
    !!state.viewingArchivedChats;

  const archivedCount =
    state.conversations.filter(
      c => {
        if (c.deletedForAll) {
          return false;
        }

        const p =
          state
            .conversationPreferences[
              c.id
            ] || {};

        return (
          p.archived &&
          !p.deleted
        );
      }
    ).length;

  return `
    <div class="page">

      <div class="section-title">

        <div>
          <h2>
            ${
              viewingArchived
                ? "Archived Chats"
                : "Messages"
            }
          </h2>

          <div class="small">
            ${
              viewingArchived
                ? "Archived conversations"
                : "Private conversations"
            }
          </div>
        </div>

        <div
          style="
            display:flex;
            gap:8px;
          "
        >
          ${
            !viewingArchived
              ? `
                <button
                  class="btn btn-ghost"
                  id="toggleArchivedViewBtn"
                  style="position:relative;"
                >
                  📦 Archived ${
                    archivedCount > 0
                      ? `(${archivedCount})`
                      : ""
                  }
                </button>
              `
              : `
                <button
                  class="btn btn-ghost"
                  id="toggleArchivedViewBtn"
                >
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

      <div class="search">
        <input
          class="input"
          id="chatSearch"
          placeholder="Search conversations…"
          autocomplete="off"
          value="${escapeHtml(
            state.chatSearchQuery ||
            ""
          )}"
        >
      </div>

      <div id="chatListContainer">
        ${renderChatListContainerHTML()}
      </div>
    </div>
  `;
}

/* =========================================================
   COMPOSER HELPERS (emoji list + auto-grow textarea)
   ========================================================= */

const MC2_EMOJI_LIST = [
  "😀", "😂", "😍", "👍", "🙏", "🔥",
  "🎉", "❤️", "😢", "😮", "😡", "👏",
  "🙌", "💯", "✅", "🤔"
];

/*
 * Resizes the message composer textarea to fit its content,
 * up to a fixed maximum height (after which it becomes
 * internally scrollable). Purely a visual/UI concern — never
 * touches Firestore or any part of the message schema.
 */
function mc2ResizeComposerTextarea(el) {
  if (!el) {
    return;
  }

  const maxHeight = 136;

  el.style.height = "auto";

  const next =
    Math.min(
      el.scrollHeight,
      maxHeight
    );

  el.style.height = `${next}px`;

  el.style.overflowY =
    el.scrollHeight > maxHeight
      ? "auto"
      : "hidden";
}

/* =========================================================
   CHAT CONVERSATION VIEW
   ========================================================= */

export function renderConversation() {
  const c =
    state.activeConversation;

  const other =
    c?.participants?.find(
      x =>
        x !==
        state.user.uid
    );

  const profile =
    c
      ?.participantProfiles?.[
        other
      ] || {};

  const name =
    profile.displayName ||
    profile.username ||
    "User";

  const preference =
    state
      .conversationPreferences[
        c.id
      ] || {};

  const isBlocked =
    !!preference.blocked;

  /*
   * A message hidden via "delete for me" (deletedFor
   * contains the current uid) is simply never rendered for
   * this user. Messages without a deletedFor field at all
   * (every message created before this feature existed)
   * pass straight through unaffected.
   */
  const visibleMessages =
    state.messages.filter(
      m =>
        !(m.deletedFor || []).includes(
          state.user.uid
        )
    );

  const pinnedMessage =
    [...visibleMessages]
      .filter(
        m => m.pinned && !m.deletedForEveryone
      )
      .sort(
        (a, b) =>
          toMillis(b.pinnedAt) -
          toMillis(a.pinnedAt)
      )[0] || null;

  const backgroundClass =
    `mc2-bg-${
      preference.background ||
      "classic"
    }`;

  return `
    <div
      class="page chat-conversation-page mc2-conversation-page ${backgroundClass}"
      style="
        display:flex;
        flex-direction:column;
        min-height:0;
        overflow:hidden;
      "
    >

      <div
        class="section-title mc2-conv-header"
        style="flex:none;position:relative;"
      >

        <div class="profile-row" style="position:relative;">

          <button
            class="icon-btn mc2-glass-icon-btn"
            id="backChats"
            aria-label="Back to conversations"
          >
            ←
          </button>

          <div class="avatar mc2-conv-avatar">
            ${escapeHtml(
              initials(name)
            )}
          </div>

          <div style="min-width:0;flex:1;">
            <h2 style="margin:0;" class="mc2-conv-title">
              ${escapeHtml(name)}
            </h2>

            <div class="small mc2-conv-subtitle">
              ${
                isBlocked
                  ? "Blocked 🚫"
                  : `Private chat${
                      preference.muted
                        ? " (Muted 🔕)"
                        : ""
                    }`
              }
            </div>
          </div>

          <button
            type="button"
            class="icon-btn mc2-glass-icon-btn"
            aria-label="Conversation options"
            aria-expanded="false"
            data-chat-menu="${escapeHtml(
              c.id
            )}"
            style="flex:none;"
          >
            ⋮
          </button>

          ${renderChatOptionsMenuHTML(c)}

        </div>
      </div>

      <div
        class="card mc2-conversation-card ${backgroundClass}"
        style="
          flex:1;
          min-height:0;
          display:flex;
          flex-direction:column;
          overflow:hidden;
          position:relative;
        "
      >

        <div class="mc2-watermark" aria-hidden="true">MARVEL CHAT</div>

        ${
          pinnedMessage
            ? `
              <div
                class="mc2-pinned-bar"
                data-jump-to-message="${escapeHtml(
                  pinnedMessage.id
                )}"
              >
                <span>📌</span>

                <span class="mc2-pinned-bar-text">
                  ${escapeHtml(
                    (pinnedMessage.text || "Pinned message").slice(
                      0,
                      120
                    )
                  )}
                </span>

                <button
                  type="button"
                  class="icon-btn"
                  data-pin-msg="${escapeHtml(
                    pinnedMessage.id
                  )}"
                  aria-label="Unpin message"
                  title="Unpin"
                  style="
                    width:26px;
                    height:26px;
                    font-size:13px;
                    padding:0;
                  "
                >
                  ✕
                </button>
              </div>
            `
            : ""
        }

        <div
          class="messages mc2-messages"
          id="messages"
          style="
            flex:1;
            min-height:0;
            overflow-y:auto;
          "
        >
          ${
            visibleMessages.length
              ? visibleMessages
                  .map(
                    m => {
                      const isMine =
                        m.uid ===
                        state.user.uid;

                      const isDeleted =
                        !!m.deletedForEveryone;

                      if (isDeleted) {
                        return `
                          <div
                            class="bubble mc2-bubble ${
                              isMine
                                ? "mine"
                                : ""
                            }"
                            data-message-id="${escapeHtml(
                              m.id
                            )}"
                            style="position:relative;"
                          >
                            <div class="mc2-bubble-text mc2-bubble-deleted">
                              🚫 This message was deleted
                            </div>

                            <div class="bubble-time mc2-bubble-time">
                              ${escapeHtml(
                                formatDate(
                                  m.createdAt
                                )
                              )}
                            </div>
                          </div>
                        `;
                      }

                      const status =
                        isMine
                          ? getOwnMessageStatus(
                              m,
                              c
                            )
                          : null;

                      return `
                        <div
                          class="bubble mc2-bubble ${
                            isMine
                              ? "mine"
                              : ""
                          }"
                          data-message-id="${escapeHtml(
                            m.id
                          )}"
                          style="
                            position:relative;
                            padding-right:26px;
                          "
                        >

                          ${
                            m.pinned
                              ? `<div class="mc2-pin-flag">📌 Pinned</div>`
                              : ""
                          }

                          <button
                            type="button"
                            class="mc2-msg-menu-btn"
                            data-msg-menu="${escapeHtml(
                              m.id
                            )}"
                            aria-label="Message options"
                            aria-expanded="false"
                          >
                            ⋮
                          </button>

                          <div class="mc2-bubble-text">
                            ${escapeHtml(
                              m.text ||
                              ""
                            )}
                          </div>

                          <div
                            class="bubble-time mc2-bubble-time"
                          >
                            ${escapeHtml(
                              formatDate(
                                m.createdAt
                              )
                            )}

                            ${
                              m.editedAt
                                ? `
                                  <span class="edited-indicator mc2-edited-indicator">
                                    (Edited)
                                  </span>
                                `
                                : ""
                            }

                            ${
                              status
                                ? `<span
                                    class="mc2-status-dot status-${status}"
                                    title="${
                                      status === "read"
                                        ? "Read"
                                        : "Sent"
                                    }"
                                  ></span>`
                                : ""
                            }
                          </div>

                          <div
                            class="mc2-msg-menu"
                            data-msg-options="${escapeHtml(
                              m.id
                            )}"
                            data-open="false"
                          >
                            <button
                              type="button"
                              class="mc2-msg-menu-item"
                              data-copy-msg="${escapeHtml(
                                m.text ||
                                ""
                              )}"
                            >
                              📋 Copy
                            </button>

                            ${
                              isMine
                                ? `
                                  <button
                                    type="button"
                                    class="mc2-msg-menu-item"
                                    data-edit-msg="${escapeHtml(
                                      m.id
                                    )}"
                                  >
                                    ✏️ Edit
                                  </button>
                                `
                                : ""
                            }

                            <button
                              type="button"
                              class="mc2-msg-menu-item"
                              data-delete-for-me-msg="${escapeHtml(
                                m.id
                              )}"
                            >
                              🙈 Delete for me
                            </button>

                            ${
                              isMine
                                ? `
                                  <button
                                    type="button"
                                    class="mc2-msg-menu-item danger"
                                    data-delete-msg="${escapeHtml(
                                      m.id
                                    )}"
                                  >
                                    🗑️ Delete for everyone
                                  </button>
                                `
                                : ""
                            }

                            <button
                              type="button"
                              class="mc2-msg-menu-item"
                              data-pin-msg="${escapeHtml(
                                m.id
                              )}"
                            >
                              ${
                                m.pinned
                                  ? "📌 Unpin message"
                                  : "📌 Pin message"
                              }
                            </button>

                            ${
                              !isMine
                                ? `
                                  <button
                                    type="button"
                                    class="mc2-msg-menu-item danger"
                                    data-report-msg="${escapeHtml(
                                      m.id
                                    )}"
                                  >
                                    ⚠️ Report message
                                  </button>
                                `
                                : ""
                            }
                          </div>
                        </div>
                      `;
                    }
                  )
                  .join("")
              : `
                <div class="empty">
                  ${
                    isBlocked
                      ? "🚫 User blocked."
                      : "👋 Say hello and start the conversation."
                  }
                </div>
              `
          }
        </div>

        <button
          type="button"
          id="mc2NewMessagesPill"
          class="mc2-new-messages-pill"
          data-visible="false"
        >
          ↓ New messages
        </button>

        ${
          isBlocked
            ? `
              <div
                style="
                  padding:12px;
                  text-align:center;
                  border-top:1px solid var(--border);
                "
              >
                <div class="small">
                  🚫 This user is blocked.
                </div>

                <button
                  class="btn btn-ghost"
                  id="unblockFromConversation"
                  style="margin-top:8px;"
                >
                  🔓 Unblock user
                </button>
              </div>
            `
            : `
              <div class="message-box mc2-composer" style="flex:none;">

                <button
                  type="button"
                  class="mc2-composer-emoji"
                  data-emoji-toggle
                  aria-label="Insert emoji"
                  aria-expanded="false"
                >
                  🙂
                </button>

                <div
                  id="mc2EmojiPanel"
                  class="mc2-emoji-panel"
                  data-open="false"
                  role="menu"
                  aria-label="Emoji picker"
                >
                  ${MC2_EMOJI_LIST
                    .map(
                      emoji => `
                        <button
                          type="button"
                          class="mc2-emoji-item"
                          data-emoji-insert="${emoji}"
                          aria-label="Insert ${emoji}"
                        >${emoji}</button>
                      `
                    )
                    .join("")}
                </div>

                <textarea
                  class="textarea mc2-composer-input"
                  id="messageInput"
                  rows="1"
                  maxlength="5000"
                  autocomplete="off"
                  placeholder="Write a message…"
                ></textarea>

                <button
                  type="button"
                  class="btn btn-primary mc2-composer-send"
                  id="sendMessage"
                  aria-label="Send message"
                >
                  Send
                </button>

              </div>
            `
        }

      </div>
    </div>
  `;
}

/* =========================================================
   MC2 VISUAL ENHANCEMENT STYLES
   =========================================================

   Injected once. Adds modern composer / bubble / background /
   chat-list styling on top of the existing classes without
   touching the project's main stylesheet, so nothing that
   already works elsewhere is disturbed.
   ========================================================= */

function ensureMarvelChatV2Styles() {
  if (
    document.getElementById(
      "mc2-chat-styles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id = "mc2-chat-styles";

  style.textContent = `
    /* =====================================================
       MARVEL CHAT — PREMIUM FULL-SCREEN IDENTITY
       Full-viewport conversation, glassmorphism, nebula
       backdrop + subtle watermark, crimson/nebula accents.
       ===================================================== */

    .mc2-conversation-page {
      height:100vh;
      height:100dvh;
      width:100%;
      max-width:100%;
      margin:0;
      overflow-x:hidden;
    }

    /* ---- Premium glass header ---- */
    .mc2-conv-header {
      padding:10px 14px;
      padding-top:calc(10px + env(safe-area-inset-top, 0px));
      background:rgba(20,12,40,0.55);
      border-bottom:1px solid rgba(255,255,255,0.10);
      backdrop-filter:blur(16px) saturate(140%);
      -webkit-backdrop-filter:blur(16px) saturate(140%);
      box-shadow:0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.18);
      z-index:5;
      color:#fff;
    }
    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      .mc2-conv-header {
        background:rgba(20,12,40,0.92);
      }
    }
    .mc2-conv-header .profile-row { gap:11px; }
    .mc2-conv-header h2.mc2-conv-title {
      font-size:19px;
      font-weight:700;
      letter-spacing:.01em;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      color:#fff;
    }
    .mc2-conv-header .mc2-conv-subtitle {
      font-size:13.5px;
      color:rgba(255,255,255,0.62);
    }
    .mc2-conv-avatar {
      box-shadow:
        0 0 0 2px rgba(220,38,38,0.55),
        0 4px 14px rgba(0,0,0,0.30);
    }
    .mc2-glass-icon-btn {
      background:rgba(255,255,255,0.08);
      border:1px solid rgba(255,255,255,0.14);
      color:#fff;
      backdrop-filter:blur(6px);
      -webkit-backdrop-filter:blur(6px);
      transition:background .15s ease, transform .1s ease;
    }
    .mc2-glass-icon-btn:hover,
    .mc2-glass-icon-btn:active {
      background:rgba(255,255,255,0.16);
    }
    .mc2-conv-header .mc2-options-menu {
      right:10px;
      top:56px;
    }
    .mc2-conversation-page.mc2-bg-softlight .mc2-conv-header {
      background:rgba(255,255,255,0.75);
      border-bottom:1px solid rgba(0,0,0,0.08);
      color:#111;
      box-shadow:0 1px 0 rgba(255,255,255,0.5), 0 8px 24px rgba(0,0,0,0.06);
    }
    .mc2-conversation-page.mc2-bg-softlight .mc2-conv-title,
    .mc2-conversation-page.mc2-bg-softlight .mc2-glass-icon-btn {
      color:#111;
    }
    .mc2-conversation-page.mc2-bg-softlight .mc2-conv-subtitle {
      color:rgba(0,0,0,0.55);
    }
    .mc2-conversation-page.mc2-bg-softlight .mc2-glass-icon-btn {
      background:rgba(0,0,0,0.05);
      border-color:rgba(0,0,0,0.10);
    }

    /* ---- Premium conversation surface + nebula backdrop ---- */
    .mc2-conversation-card {
      border:none;
      border-radius:0;
    }
    .mc2-watermark {
      position:absolute;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
      pointer-events:none;
      z-index:0;
      font-size:clamp(28px, 7vw, 52px);
      font-weight:800;
      letter-spacing:.14em;
      color:rgba(255,255,255,0.028);
      transform:rotate(-14deg) scale(1.4);
      white-space:nowrap;
      user-select:none;
    }
    .mc2-bg-softlight .mc2-watermark,
    .mc2-bg-classic .mc2-watermark {
      color:rgba(120,60,60,0.028);
    }
    .mc2-pinned-bar,
    .mc2-messages,
    .mc2-composer {
      position:relative;
      z-index:1;
    }
    .mc2-pinned-bar {
      backdrop-filter:blur(10px);
      -webkit-backdrop-filter:blur(10px);
      background:rgba(127,127,127,0.10);
    }

    /* Default (non-nebula) conversation surfaces still get a
       subtle deep-space tint so the watermark + glass read
       consistently across every chat background option. */
    .mc2-conversation-card {
      background-color:#150c28;
      background-image:
        radial-gradient(circle at 20% 0%, rgba(124,58,237,0.20), transparent 55%),
        radial-gradient(circle at 100% 30%, rgba(220,38,38,0.10), transparent 45%);
    }
    .mc2-conversation-card.mc2-bg-softlight {
      background-color:#f3f1fa;
      background-image:
        radial-gradient(circle at 20% 0%, rgba(124,58,237,0.06), transparent 55%);
    }

    /* ---- Composer (glass, keyboard-safe) ---- */
    .mc2-composer {
      position:relative;
      display:flex;
      align-items:flex-end;
      gap:8px;
      padding:10px 12px;
      padding-bottom:calc(10px + env(safe-area-inset-bottom, 0px));
      border-top:1px solid rgba(255,255,255,0.10);
      background:rgba(20,12,40,0.55);
      backdrop-filter:blur(16px) saturate(140%);
      -webkit-backdrop-filter:blur(16px) saturate(140%);
    }
    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      .mc2-composer {
        background:rgba(20,12,40,0.92);
      }
    }
    .mc2-bg-softlight .mc2-composer {
      background:rgba(255,255,255,0.75);
      border-top:1px solid rgba(0,0,0,0.08);
    }

    /* Emoji button */
    .mc2-composer-emoji {
      flex:none;
      width:42px;
      height:42px;
      min-height:0;
      border-radius:50%;
      border:1px solid rgba(255,255,255,0.14);
      background:rgba(255,255,255,0.08);
      color:inherit;
      font-size:20px;
      line-height:1;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:0;
      cursor:pointer;
      transition:background .15s ease, transform .1s ease;
    }
    .mc2-composer-emoji:active {
      transform:scale(0.93);
    }
    .mc2-bg-softlight .mc2-composer-emoji {
      background:rgba(0,0,0,0.05);
      border-color:rgba(0,0,0,0.10);
    }

    /* Emoji panel */
    .mc2-emoji-panel {
      display:none;
      position:absolute;
      left:10px;
      bottom:calc(100% + 8px);
      z-index:30;
      grid-template-columns:repeat(6, 1fr);
      gap:4px;
      background:var(--surface);
      border:1px solid var(--border);
      border-radius:14px;
      box-shadow:var(--shadow2, 0 10px 30px rgba(0,0,0,0.25));
      padding:8px;
      max-width:calc(100vw - 24px);
    }
    .mc2-emoji-panel[data-open="true"] {
      display:grid;
    }
    .mc2-emoji-item {
      width:36px;
      height:36px;
      border:0;
      background:transparent;
      color:inherit;
      font-size:20px;
      line-height:1;
      border-radius:8px;
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:0;
    }
    .mc2-emoji-item:hover,
    .mc2-emoji-item:active {
      background:var(--surface2, rgba(127,127,127,0.12));
    }

    /* Auto-growing message textarea (rows=1, grows with
       content, becomes internally scrollable past max-height —
       see mc2ResizeComposerTextarea in chat.js). */
    .mc2-composer-input {
      flex:1;
      min-width:0;
      resize:none;
      display:block;
      border-radius:22px;
      min-height:48px;
      max-height:136px;
      height:48px;
      padding:13px 18px;
      border:1px solid rgba(255,255,255,0.14);
      background:rgba(255,255,255,0.08);
      color:#fff;
      font-size:16.5px;
      line-height:1.4;
      white-space:pre-wrap;
      overflow-wrap:anywhere;
      overflow-y:hidden;
      transition:border-color .15s ease, box-shadow .15s ease;
    }
    .mc2-bg-softlight .mc2-composer-input {
      background:#fff;
      border-color:#e2e5ea;
      color:#111;
    }
    .mc2-composer-input::placeholder {
      font-size:16.5px;
      opacity:0.55;
    }
    .mc2-composer-input:focus {
      outline:none;
      border-color:#dc2626;
      box-shadow:0 0 0 3px rgba(220,38,38,0.18);
    }
    .mc2-composer-send {
      flex:none;
      width:48px;
      height:48px;
      min-width:48px;
      min-height:0;
      border-radius:50%;
      padding:0;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:0;
      background:linear-gradient(135deg,#dc2626,#7c3aed);
      border:none;
      box-shadow:0 4px 14px rgba(220,38,38,0.35);
      transition:transform .1s ease;
    }
    .mc2-composer-send:active {
      transform:scale(0.93);
    }
    .mc2-composer-send::before {
      content:"➤";
      font-size:17px;
      line-height:1;
      color:#fff;
    }

    /* ---- Message bubbles ---- */
    .mc2-messages {
      padding:14px 12px;
      display:flex;
      flex-direction:column;
      gap:10px;
    }
    .mc2-bubble {
      max-width:78%;
      align-self:flex-start;
      background:var(--surface);
      border:1px solid var(--border);
      border-radius:16px 16px 16px 4px;
      padding:10px 14px;
      word-break:break-word;
      overflow-wrap:anywhere;
      box-shadow:0 2px 10px rgba(0,0,0,0.10);
    }
    /* Dark, glass-backed presets (nebula default + the existing
       midnight/purple/ocean options) get a translucent glass
       bubble instead of the flat theme surface. */
    .mc2-conversation-card:not(.mc2-bg-classic):not(.mc2-bg-softlight) .mc2-bubble:not(.mine) {
      background:rgba(255,255,255,0.10);
      border-color:rgba(255,255,255,0.16);
      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
      color:#fff;
    }
    .mc2-bubble.mine {
      align-self:flex-end;
      background:linear-gradient(135deg,#b91c1c,#6d28d9);
      color:#fff;
      border-color:transparent;
      border-radius:16px 16px 4px 16px;
      box-shadow:0 4px 16px rgba(185,28,28,0.28);
    }
    .mc2-bubble-text {
      font-size:17.5px;
      line-height:1.5;
      white-space:pre-wrap;
      overflow-wrap:anywhere;
    }
    .mc2-bubble-time {
      margin-top:4px;
      font-size:11.5px;
      opacity:0.7;
    }
    .mc2-edited-indicator {
      opacity:0.8;
      font-style:italic;
    }
    .mc2-message-actions {
      margin-top:5px;
      display:flex;
      gap:12px;
      font-size:11px;
      flex-wrap:wrap;
    }
    .mc2-msg-action {
      min-height:26px;
      display:inline-flex;
      align-items:center;
      opacity:0.85;
    }
    @media (min-width:640px) {
      .mc2-bubble { max-width:60%; }
    }

    /* ---- Chat backgrounds ---- */
    .mc2-conversation-card.mc2-bg-classic {
      background:var(--surface);
    }
    .mc2-conversation-card.mc2-bg-midnight {
      background:linear-gradient(180deg,#161f30,#0b1220);
    }
    .mc2-conversation-card.mc2-bg-purple {
      background:linear-gradient(180deg,#2d1b4e,#1c0f33);
    }
    .mc2-conversation-card.mc2-bg-ocean {
      background:linear-gradient(180deg,#12303a,#071b22);
    }
    .mc2-conversation-card.mc2-bg-softlight {
      background:linear-gradient(180deg,#ffffff,#eef1f5);
      color:#111;
    }
    .mc2-bg-midnight .mc2-bubble:not(.mine),
    .mc2-bg-purple .mc2-bubble:not(.mine),
    .mc2-bg-ocean .mc2-bubble:not(.mine) {
      background:rgba(255,255,255,0.10);
      border-color:rgba(255,255,255,0.16);
      color:#fff;
    }
    .mc2-bg-softlight .mc2-bubble:not(.mine) {
      background:#fff;
      border-color:#e2e5ea;
      color:#111;
    }

    /* ---- Chat list ---- */
    .mc2-chat-list {
      display:flex;
      flex-direction:column;
      gap:6px;
    }
    .mc2-chat-item {
      display:flex;
      align-items:center;
      gap:12px;
      padding:12px;
      border-radius:16px;
      border:1px solid transparent;
      transition:background .12s ease;
    }
    .mc2-chat-item:hover,
    .mc2-chat-item:active {
      background:var(--surface2, rgba(0,0,0,0.03));
      border-color:var(--border);
    }
    /*
     * Red unread indicator — always at least 20x20px, a
     * separate visual concept from the green read/sent
     * status dot above.
     */
    .mc2-unread-badge {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      min-width:20px;
      height:20px;
      padding:0 6px;
      box-sizing:border-box;
      font-size:11px;
      font-weight:700;
      box-shadow:0 2px 8px rgba(220,38,38,0.35);
    }

    /* ---- New Marvel Chat background pattern ---- */
    .mc2-conversation-card.mc2-bg-nebula {
      background-color:#1b1030;
      background-image:
        radial-gradient(circle at 15% 20%, rgba(168,85,247,0.28), transparent 40%),
        radial-gradient(circle at 85% 15%, rgba(99,102,241,0.24), transparent 45%),
        radial-gradient(circle at 50% 90%, rgba(236,72,153,0.16), transparent 50%),
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Ccircle cx='6' cy='6' r='1.4' fill='%23ffffff' fill-opacity='0.10'/%3E%3Ccircle cx='34' cy='24' r='1' fill='%23ffffff' fill-opacity='0.08'/%3E%3Ccircle cx='52' cy='48' r='1.6' fill='%23ffffff' fill-opacity='0.09'/%3E%3Ccircle cx='18' cy='52' r='1' fill='%23ffffff' fill-opacity='0.07'/%3E%3C/svg%3E");
      color:#fff;
    }
    .mc2-bg-nebula .mc2-bubble:not(.mine) {
      background:rgba(255,255,255,0.10);
      border-color:rgba(255,255,255,0.18);
      color:#fff;
    }

    /* ---- Message 3-dot menu (mobile-friendly, clip-proof) ---- */
    .mc2-msg-menu-btn {
      position:absolute;
      top:2px;
      width:22px;
      height:22px;
      min-height:0;
      border:0;
      background:transparent;
      color:inherit;
      opacity:0.6;
      border-radius:8px;
      font-size:15px;
      line-height:1;
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      padding:0;
    }
    .mc2-msg-menu-btn:hover,
    .mc2-msg-menu-btn:active {
      opacity:1;
      background:rgba(127,127,127,0.15);
    }
    .mc2-bubble .mc2-msg-menu-btn { right:2px; }
    .mc2-bubble.mine .mc2-msg-menu-btn { right:2px; }
    .mc2-bubble:not(.mine) .mc2-msg-menu-btn { right:2px; }

    .mc2-msg-menu {
      display:none;
      position:fixed;
      z-index:1200;
      min-width:190px;
      max-width:calc(100vw - 24px);
      max-height:min(60vh, 360px);
      overflow-y:auto;
      -webkit-overflow-scrolling:touch;
      background:var(--surface);
      color:var(--text);
      border:1px solid var(--border);
      border-radius:14px;
      box-shadow:var(--shadow2, 0 10px 30px rgba(0,0,0,0.25));
      padding:6px;
    }
    .mc2-msg-menu[data-open="true"] {
      display:block;
    }
    .mc2-msg-menu-item {
      width:100%;
      border:0;
      background:transparent;
      color:var(--text);
      text-align:left;
      padding:10px 12px;
      border-radius:8px;
      font-size:14px;
      font-weight:600;
      cursor:pointer;
    }
    .mc2-msg-menu-item:hover,
    .mc2-msg-menu-item:active {
      background:var(--surface2, rgba(127,127,127,0.12));
    }
    .mc2-msg-menu-item.danger { color:var(--danger); }

    /* ---- Message status dot (own messages only) ---- */
    .mc2-status-dot {
      display:inline-block;
      width:7px;
      height:7px;
      border-radius:50%;
      margin-left:6px;
      vertical-align:middle;
      position:relative;
    }
    /*
     * Sent-but-not-read uses a neutral gray, not red: red is
     * reserved exclusively for the unread-message badge (see
     * .mc2-unread-badge below), so the two stay visually
     * distinct concepts as required. Read uses green.
     */
    .mc2-status-dot.status-sent {
      background:#9ca3af;
    }
    .mc2-status-dot.status-read {
      background:#22c55e;
      box-shadow:0 0 0 2px rgba(34,197,94,0.28);
    }

    /* ---- Pin indicator + pinned message bar ---- */
    .mc2-pin-flag {
      font-size:11px;
      margin-bottom:3px;
      opacity:0.85;
    }
    .mc2-pinned-bar {
      flex:none;
      display:flex;
      align-items:center;
      gap:8px;
      padding:8px 14px;
      border-bottom:1px solid var(--border);
      background:var(--surface2, rgba(127,127,127,0.06));
      font-size:13px;
      cursor:pointer;
    }
    .mc2-pinned-bar-text {
      flex:1;
      min-width:0;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }

    /* ---- Deleted-for-everyone placeholder ---- */
    .mc2-bubble-deleted {
      font-style:italic;
      opacity:0.65;
    }

    /* ---- Conversation options menu: scrollable + clip-proof ---- */
    .chat-options-menu {
      max-height:min(70vh, 420px);
      overflow-y:auto;
      -webkit-overflow-scrolling:touch;
    }

    /* ---- "New messages" pill (shown only when the reader is
       scrolled up looking at older messages and a new message
       arrives — never forces them back to the bottom). ---- */
    .mc2-new-messages-pill {
      display:none;
      position:absolute;
      left:50%;
      bottom:14px;
      transform:translateX(-50%);
      z-index:4;
      border:1px solid rgba(255,255,255,0.16);
      background:linear-gradient(135deg,#b91c1c,#6d28d9);
      color:#fff;
      font-size:13px;
      font-weight:600;
      padding:8px 16px;
      border-radius:999px;
      box-shadow:0 4px 14px rgba(0,0,0,0.30);
      cursor:pointer;
    }
    .mc2-new-messages-pill[data-visible="true"] {
      display:block;
    }

    /* =====================================================
       LAYOUT HARDENING — guarantees the header / message
       list / composer three-row layout no matter what the
       rest of the app's stylesheet does with a shared class
       name like .message-box or .card. Nothing above this
       point is removed; this section only makes the existing
       rules win the cascade so the composer can never end up
       floating over the conversation again.
       ===================================================== */
    .mc2-conversation-page {
      position:relative !important;
      display:flex !important;
      flex-direction:column !important;
      height:100vh !important;
      height:100dvh !important;
      min-height:0 !important;
      overflow:hidden !important;
    }
    .mc2-conversation-card {
      flex:1 1 auto !important;
      min-height:0 !important;
      display:flex !important;
      flex-direction:column !important;
      position:relative !important;
      overflow:hidden !important;
    }
    .mc2-messages {
      flex:1 1 auto !important;
      min-height:0 !important;
      overflow-y:auto !important;
      position:relative !important;
    }
    .mc2-composer {
      flex:0 0 auto !important;
      position:relative !important;
      inset:auto !important;
      top:auto !important;
      left:auto !important;
      right:auto !important;
      bottom:auto !important;
      width:100% !important;
      max-width:none !important;
      margin:0 !important;
      transform:none !important;
    }
    /* Freezes the page body behind the chat screen so a tall
       document (and any fixed-position element it defines
       elsewhere) can never scroll independently underneath
       the composer and throw its position off. */
    html.mc2-conv-lock,
    body.mc2-conv-lock {
      height:100% !important;
      overflow:hidden !important;
      overscroll-behavior:none !important;
    }
  `;

  document.head.appendChild(style);
}

/* Inject styles as soon as this module loads. */
ensureMarvelChatV2Styles();

/* =========================================================
   CHAT SEARCH — FOCUS-SAFE INPUT HANDLING
   =========================================================

   Root cause of the original keyboard-closing bug: search
   keystrokes triggered a full renderApp()/renderChat() call,
   which re-created the <input id="chatSearch"> DOM node and
   dropped focus (closing the mobile keyboard).

   Fix: the search input is handled via a single delegated
   "input" listener. On each keystroke we ONLY update
   state.chatSearchQuery and re-render the conversation list
   inside #chatListContainer — the <input> element itself is
   never touched, so it never loses focus, its value, or the
   keyboard.
   ========================================================= */

if (
  !window.__marvelChatSearchInstalledV1
) {
  window.__marvelChatSearchInstalledV1 =
    true;

  document.addEventListener(
    "input",
    event => {
      const input =
        event.target.closest(
          "#chatSearch"
        );

      if (!input) {
        return;
      }

      state.chatSearchQuery =
        input.value;

      /*
       * Only touch the list container — never call the
       * full app renderer here.
       */
      updateChatListContainer();
    }
  );
}

/* =========================================================
   CHAT LIST MENU EVENT DELEGATION
   ========================================================= */

if (
  !window.__marvelChatListMenuInstalledV3
) {
  window.__marvelChatListMenuInstalledV3 =
    true;

  document.addEventListener(
    "click",
    async event => {

      /* ===============================================
         UNBLOCK FROM OPEN CONVERSATION
         =============================================== */

      const unblockButton =
        event.target.closest(
          "#unblockFromConversation"
        );

      if (unblockButton) {
        event.preventDefault();
        event.stopPropagation();

        const conversationId =
          state.activeConversation?.id;

        if (conversationId) {
          await toggleBlockUser(
            conversationId,
            currentRenderApp
          );
        }

        return;
      }

      /* ===============================================
         ARCHIVED VIEW
         =============================================== */

      const toggleArchivedBtn =
        event.target.closest(
          "#toggleArchivedViewBtn"
        );

      if (toggleArchivedBtn) {
        event.preventDefault();

        state.viewingArchivedChats =
          !state.viewingArchivedChats;

        if (
          typeof currentRenderApp ===
          "function"
        ) {
          currentRenderApp();
        }

        return;
      }

      /* ===============================================
         CHAT MENU BUTTON
         =============================================== */

      const menuButton =
        event.target.closest(
          "[data-chat-menu]"
        );

      if (menuButton) {
        event.preventDefault();
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

        const isOpen =
          menu.getAttribute(
            "data-open"
          ) === "true";

        document
          .querySelectorAll(
            "[data-chat-options]"
          )
          .forEach(
            otherMenu => {
              otherMenu.style.display =
                "none";

              otherMenu.setAttribute(
                "data-open",
                "false"
              );
            }
          );

        document
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

        if (!isOpen) {
          const rect =
            menuButton.getBoundingClientRect();

          menu.style.position =
            "fixed";
          menu.style.display =
            "block";
          menu.style.visibility =
            "hidden";

          const menuWidth =
            menu.offsetWidth || 210;
          const menuHeight =
            menu.offsetHeight || 300;

          let left =
            rect.right - menuWidth;
          left = Math.max(
            8,
            Math.min(
              left,
              window.innerWidth -
                menuWidth -
                8
            )
          );

          let top =
            rect.bottom + 6;

          if (
            top + menuHeight >
            window.innerHeight - 8
          ) {
            top =
              rect.top -
              menuHeight -
              6;
          }

          top = Math.max(8, top);

          menu.style.left =
            `${left}px`;
          menu.style.top =
            `${top}px`;
          menu.style.right =
            "auto";
          menu.style.visibility =
            "visible";

          menu.setAttribute(
            "data-open",
            "true"
          );

          menuButton.setAttribute(
            "aria-expanded",
            "true"
          );
        }

        return;
      }

      /* ===============================================
         MESSAGE MENU BUTTON (3-dot, on each bubble)
         =============================================== */

      const msgMenuButton =
        event.target.closest(
          "[data-msg-menu]"
        );

      if (msgMenuButton) {
        event.preventDefault();
        event.stopPropagation();

        const messageId =
          msgMenuButton.dataset.msgMenu;

        const msgMenu =
          document.querySelector(
            `[data-msg-options="${CSS.escape(
              messageId
            )}"]`
          );

        if (!msgMenu) {
          return;
        }

        const msgMenuOpen =
          msgMenu.getAttribute(
            "data-open"
          ) === "true";

        document
          .querySelectorAll(
            "[data-msg-options]"
          )
          .forEach(otherMenu => {
            otherMenu.style.display =
              "none";
            otherMenu.setAttribute(
              "data-open",
              "false"
            );
          });

        document
          .querySelectorAll(
            "[data-msg-menu]"
          )
          .forEach(button => {
            button.setAttribute(
              "aria-expanded",
              "false"
            );
          });

        if (!msgMenuOpen) {
          const rect =
            msgMenuButton.getBoundingClientRect();

          msgMenu.style.display =
            "block";
          msgMenu.style.visibility =
            "hidden";

          const menuWidth =
            msgMenu.offsetWidth || 190;
          const menuHeight =
            msgMenu.offsetHeight || 260;

          let left =
            rect.right - menuWidth;
          left = Math.max(
            8,
            Math.min(
              left,
              window.innerWidth -
                menuWidth -
                8
            )
          );

          let top =
            rect.bottom + 4;

          if (
            top + menuHeight >
            window.innerHeight - 8
          ) {
            top =
              rect.top -
              menuHeight -
              4;
          }

          top = Math.max(8, top);

          msgMenu.style.left =
            `${left}px`;
          msgMenu.style.top =
            `${top}px`;
          msgMenu.style.visibility =
            "visible";

          msgMenu.setAttribute(
            "data-open",
            "true"
          );

          msgMenuButton.setAttribute(
            "aria-expanded",
            "true"
          );
        }

        return;
      }

      /* ===============================================
         MESSAGE MENU ACTIONS: DELETE FOR ME / PIN / REPORT

         (Copy / Edit / "Delete for everyone" keep using the
         existing data-copy-msg / data-edit-msg / data-delete-msg
         attributes, which app.js already binds on every
         render — nothing about those changes.)
         =============================================== */

      const deleteForMeBtn =
        event.target.closest(
          "[data-delete-for-me-msg]"
        );

      if (deleteForMeBtn) {
        event.preventDefault();
        event.stopPropagation();

        document
          .querySelectorAll(
            "[data-msg-options]"
          )
          .forEach(m => {
            m.style.display = "none";
            m.setAttribute(
              "data-open",
              "false"
            );
          });

        deleteMessageForMe(
          deleteForMeBtn.dataset
            .deleteForMeMsg
        );

        return;
      }

      const pinMsgBtn =
        event.target.closest(
          "[data-pin-msg]"
        );

      if (pinMsgBtn) {
        event.preventDefault();
        event.stopPropagation();

        document
          .querySelectorAll(
            "[data-msg-options]"
          )
          .forEach(m => {
            m.style.display = "none";
            m.setAttribute(
              "data-open",
              "false"
            );
          });

        toggleMessagePin(
          pinMsgBtn.dataset.pinMsg
        );

        return;
      }

      const reportMsgBtn =
        event.target.closest(
          "[data-report-msg]"
        );

      if (reportMsgBtn) {
        event.preventDefault();
        event.stopPropagation();

        document
          .querySelectorAll(
            "[data-msg-options]"
          )
          .forEach(m => {
            m.style.display = "none";
            m.setAttribute(
              "data-open",
              "false"
            );
          });

        reportMessageModal(
          reportMsgBtn.dataset.reportMsg
        );

        return;
      }

      /* ===============================================
         JUMP TO PINNED MESSAGE
         =============================================== */

      const jumpBtn =
        event.target.closest(
          "[data-jump-to-message]"
        );

      if (
        jumpBtn &&
        !event.target.closest(
          "[data-pin-msg]"
        )
      ) {
        const target =
          document.querySelector(
            `[data-message-id="${CSS.escape(
              jumpBtn.dataset.jumpToMessage
            )}"]`
          );

        target?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });

        return;
      }

      /* ===============================================
         CHAT OPTION
         =============================================== */

      const option =
        event.target.closest(
          "[data-chat-action]"
        );

      if (option) {
        event.preventDefault();
        event.stopPropagation();

        const action =
          option.dataset.chatAction;

        const conversationId =
          option.dataset.chatId;

        if (!conversationId) {
          return;
        }

        document
          .querySelectorAll(
            "[data-chat-options]"
          )
          .forEach(
            menu => {
              menu.style.display =
                "none";

              menu.setAttribute(
                "data-open",
                "false"
              );
            }
          );

        document
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

        /* =============================================
           CLOSE MENU
           ============================================= */

        if (
          action === "close"
        ) {
          return;
        }

        /* =============================================
           PIN
           ============================================= */

        if (
          action === "pin"
        ) {
          try {
            await togglePinConversation(
              conversationId
            );

            if (
              state.page === "chat" &&
              !state.activeConversation
            ) {
              updateChatListContainer();
            }
          } catch (e) {
            console.error(
              "CHAT PIN ACTION ERROR:",
              e
            );

            toast(
              "Could not update chat pin."
            );
          }

          return;
        }

        /* =============================================
           ARCHIVE
           ============================================= */

        if (
          action === "archive"
        ) {
          try {
            await toggleArchiveConversation(
              conversationId
            );

            if (
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

            toast(
              "Could not archive chat."
            );
          }

          return;
        }

        /* =============================================
           MUTE
           ============================================= */

        if (
          action === "mute"
        ) {
          try {
            await toggleMuteConversation(
              conversationId
            );

            if (
              state.page === "chat" &&
              !state.activeConversation
            ) {
              updateChatListContainer();
            }
          } catch (e) {
            console.error(
              "CHAT MUTE ACTION ERROR:",
              e
            );

            toast(
              "Could not mute chat."
            );
          }

          return;
        }

        /* =============================================
           BACKGROUND
           ============================================= */

        if (
          action === "background"
        ) {
          showChatBackgroundModal(
            conversationId,
            currentRenderApp
          );

          return;
        }

        /* =============================================
           COPY
           ============================================= */

        if (
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

            toast(
              "Could not copy the chat."
            );
          }

          return;
        }

        /* =============================================
           BLOCK / UNBLOCK
           ============================================= */

        if (
          action === "block"
        ) {
          await toggleBlockUser(
            conversationId,
            currentRenderApp
          );

          return;
        }

        /* =============================================
           REPORT
           ============================================= */

        if (
          action === "report"
        ) {
          await reportUserModal(
            conversationId
          );

          return;
        }

        /* =============================================
           DELETE CHAT
           ============================================= */

        if (
          action === "delete"
        ) {
          try {
            deleteChat(
              conversationId,
              currentRenderApp
            );
          } catch (e) {
            console.error(
              "CHAT DELETE ACTION ERROR:",
              e
            );

            toast(
              "Could not delete chat."
            );
          }

          return;
        }

        return;
      }

      /* ===============================================
         CLOSE OPEN MENUS WHEN CLICKING OUTSIDE
         =============================================== */

      if (
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

              menu.setAttribute(
                "data-open",
                "false"
              );
            }
          );

        document
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

      /* ===============================================
         CLOSE MESSAGE MENU WHEN CLICKING OUTSIDE
         =============================================== */

      if (
        !event.target.closest(
          "[data-msg-options]"
        ) &&
        !event.target.closest(
          "[data-msg-menu]"
        )
      ) {
        document
          .querySelectorAll(
            "[data-msg-options]"
          )
          .forEach(menu => {
            menu.style.display =
              "none";

            menu.setAttribute(
              "data-open",
              "false"
            );
          });

        document
          .querySelectorAll(
            "[data-msg-menu]"
          )
          .forEach(button => {
            button.setAttribute(
              "aria-expanded",
              "false"
            );
          });
      }
    }
  );
}

/* =========================================================
   NEW-MESSAGES PILL HELPERS
   ========================================================= */

function mc2ShowNewMessagesPill() {
  const pill =
    document.getElementById(
      "mc2NewMessagesPill"
    );

  if (pill) {
    pill.setAttribute(
      "data-visible",
      "true"
    );
  }
}

function mc2HideNewMessagesPill() {
  const pill =
    document.getElementById(
      "mc2NewMessagesPill"
    );

  if (pill) {
    pill.setAttribute(
      "data-visible",
      "false"
    );
  }
}

/* =========================================================
   LAYOUT LOCKDOWN (header / messages / composer)

   Forces the correct flex three-row layout with inline
   !important styles, which win the cascade over any
   conflicting rule elsewhere in the app's stylesheet (e.g. a
   shared ".message-box" or ".card" class) regardless of load
   order or specificity. This is applied via a MutationObserver
   rather than at the end of renderConversation(), because
   renderConversation() only returns an HTML string — the
   actual DOM nodes don't exist until whatever calls it injects
   that string, which happens outside this file. Purely a
   visual safety net: it never touches Firestore, never changes
   the data model, and never interferes with any existing click
   handler.
   ========================================================= */

function mc2LockConversationLayout() {
  const page =
    document.querySelector(
      ".mc2-conversation-page"
    );

  const card =
    document.querySelector(
      ".mc2-conversation-card"
    );

  const messagesEl =
    document.getElementById(
      "messages"
    );

  const composer =
    document.querySelector(
      ".mc2-composer"
    );

  if (!page) {
    document.documentElement.classList.remove(
      "mc2-conv-lock"
    );

    document.body?.classList.remove(
      "mc2-conv-lock"
    );

    return;
  }

  document.documentElement.classList.add(
    "mc2-conv-lock"
  );

  document.body?.classList.add(
    "mc2-conv-lock"
  );

  const setImportant = (
    el,
    props
  ) => {
    if (!el) {
      return;
    }

    Object.keys(props).forEach(
      key => {
        el.style.setProperty(
          key,
          props[key],
          "important"
        );
      }
    );
  };

  setImportant(page, {
    position: "relative",
    display: "flex",
    "flex-direction": "column",
    height: "100dvh",
    "min-height": "0",
    overflow: "hidden"
  });

  setImportant(card, {
    flex: "1 1 auto",
    "min-height": "0",
    display: "flex",
    "flex-direction": "column",
    position: "relative",
    overflow: "hidden"
  });

  setImportant(messagesEl, {
    flex: "1 1 auto",
    "min-height": "0",
    "overflow-y": "auto",
    position: "relative"
  });

  setImportant(composer, {
    position: "relative",
    inset: "auto",
    top: "auto",
    left: "auto",
    right: "auto",
    bottom: "auto",
    width: "100%",
    "max-width": "none",
    margin: "0",
    transform: "none",
    flex: "0 0 auto"
  });
}

if (
  !window.__marvelChatLayoutLockInstalledV1
) {
  window.__marvelChatLayoutLockInstalledV1 =
    true;

  let mc2LockScheduled = false;

  const scheduleLock = () => {
    if (mc2LockScheduled) {
      return;
    }

    mc2LockScheduled = true;

    requestAnimationFrame(() => {
      mc2LockScheduled = false;
      mc2LockConversationLayout();
    });
  };

  const observer =
    new MutationObserver(
      scheduleLock
    );

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );

  window.addEventListener(
    "resize",
    scheduleLock
  );

  scheduleLock();

  /*
   * Clicking the "new messages" pill scrolls to the bottom and
   * hides it — delegated on document so it works no matter how
   * many times the conversation re-renders.
   */
  document.addEventListener(
    "click",
    event => {
      if (
        !event.target.closest(
          "#mc2NewMessagesPill"
        )
      ) {
        return;
      }

      const el =
        document.getElementById(
          "messages"
        );

      if (el) {
        el.scrollTop =
          el.scrollHeight;
      }

      mc2HideNewMessagesPill();
    }
  );
}

/* =========================================================
   CLOSE ANY OPEN MENU ON ESCAPE (mobile-friendly, guarded
   so this is only ever installed once regardless of how many
   times renderChat()/renderConversation() run).
   ========================================================= */

if (
  !window.__marvelChatMenuEscapeInstalledV1
) {
  window.__marvelChatMenuEscapeInstalledV1 =
    true;

  document.addEventListener(
    "keydown",
    event => {
      if (event.key !== "Escape") {
        return;
      }

      document
        .querySelectorAll(
          "[data-chat-options], [data-msg-options]"
        )
        .forEach(menu => {
          menu.style.display = "none";
          menu.setAttribute(
            "data-open",
            "false"
          );
        });

      document
        .querySelectorAll(
          "[data-chat-menu], [data-msg-menu]"
        )
        .forEach(button => {
          button.setAttribute(
            "aria-expanded",
            "false"
          );
        });
    }
  );
}

/* =========================================================
   COMPOSER BEHAVIOR (auto-grow textarea, Enter-to-send on
   desktop, emoji panel). Installed once, delegated on
   document so it survives every renderConversation() call
   without attaching duplicate listeners — same guarded
   pattern as the Escape-key handler above. Purely additive:
   it never removes or replaces whatever already wires up
   #sendMessage's click behavior elsewhere in the app, and it
   never touches Firestore.
   ========================================================= */

if (
  !window.__marvelChatComposerBehaviorInstalledV1
) {
  window.__marvelChatComposerBehaviorInstalledV1 =
    true;

  document.addEventListener(
    "input",
    event => {
      if (
        event.target &&
        event.target.id ===
          "messageInput"
      ) {
        mc2ResizeComposerTextarea(
          event.target
        );
      }
    }
  );

  /*
   * Enter sends, Shift+Enter makes a new line — but only on
   * devices with a real keyboard. On touch devices (coarse
   * pointer) native Enter/newline behavior from the soft
   * keyboard is left completely alone, per spec.
   */
  document.addEventListener(
    "keydown",
    event => {
      if (
        !event.target ||
        event.target.id !==
          "messageInput" ||
        event.key !== "Enter" ||
        event.shiftKey ||
        event.isComposing
      ) {
        return;
      }

      const hasFinePointer =
        typeof window.matchMedia ===
          "function" &&
        window.matchMedia(
          "(pointer: fine)"
        ).matches;

      if (!hasFinePointer) {
        return;
      }

      event.preventDefault();
      sendMessage();
    }
  );

  document.addEventListener(
    "click",
    event => {
      const panel =
        document.getElementById(
          "mc2EmojiPanel"
        );

      const toggle =
        event.target.closest(
          "[data-emoji-toggle]"
        );

      if (toggle) {
        if (panel) {
          const isOpen =
            panel.getAttribute(
              "data-open"
            ) === "true";

          panel.setAttribute(
            "data-open",
            isOpen ? "false" : "true"
          );

          toggle.setAttribute(
            "aria-expanded",
            isOpen ? "false" : "true"
          );
        }

        return;
      }

      const emojiItem =
        event.target.closest(
          "[data-emoji-insert]"
        );

      if (emojiItem) {
        const emoji =
          emojiItem.getAttribute(
            "data-emoji-insert"
          ) || "";

        const input =
          document.getElementById(
            "messageInput"
          );

        if (input) {
          const start =
            input.selectionStart ??
            input.value.length;

          const end =
            input.selectionEnd ??
            input.value.length;

          input.value =
            input.value.slice(
              0,
              start
            ) +
            emoji +
            input.value.slice(end);

          const nextPos =
            start + emoji.length;

          input.focus();

          input.setSelectionRange(
            nextPos,
            nextPos
          );

          mc2ResizeComposerTextarea(
            input
          );
        }

        if (panel) {
          panel.setAttribute(
            "data-open",
            "false"
          );
        }

        return;
      }

      if (
        panel &&
        panel.getAttribute(
          "data-open"
        ) === "true" &&
        !event.target.closest(
          "#mc2EmojiPanel"
        )
      ) {
        panel.setAttribute(
          "data-open",
          "false"
        );

        document
          .querySelectorAll(
            "[data-emoji-toggle]"
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
