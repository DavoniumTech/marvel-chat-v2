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
  increment
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
          }
        }

        if (
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
              m =>
                m.id !==
                messageId
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
              lastMessage:
                newLastMsg,

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
        height:100vh;
        min-height:0;
        overflow:hidden;
      "
    >

      <div
        class="section-title"
        style="flex:none;"
      >

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
        "
      >

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
            state.messages.length
              ? state.messages
                  .map(
                    m => {
                      const isMine =
                        m.uid ===
                        state.user.uid;

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
                          "
                        >

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
                          </div>

                          <div
                            class="message-actions-dropdown mc2-message-actions"
                          >

                            <button
                              class="btn-text mc2-msg-action"
                              data-copy-msg="${escapeHtml(
                                m.text ||
                                ""
                              )}"
                            >
                              Copy
                            </button>

                            ${
                              isMine
                                ? `
                                  <button
                                    class="btn-text mc2-msg-action"
                                    data-edit-msg="${escapeHtml(
                                      m.id
                                    )}"
                                  >
                                    Edit
                                  </button>

                                  <button
                                    class="btn-text mc2-msg-action mc2-msg-action-danger"
                                    data-delete-msg="${escapeHtml(
                                      m.id
                                    )}"
                                    style="
                                      color:var(--danger);
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

                <input
                  class="input mc2-composer-input"
                  id="messageInput"
                  maxlength="5000"
                  autocomplete="off"
                  placeholder="Write a message…"
                >

                <button
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
    /* ---- Composer ---- */
    .mc2-composer {
      display:flex;
      align-items:flex-end;
      gap:10px;
      padding:10px 12px;
      padding-bottom:calc(10px + env(safe-area-inset-bottom, 0px));
      border-top:1px solid var(--border);
      background:var(--surface);
    }
    .mc2-composer-input {
      flex:1;
      min-width:0;
      border-radius:22px;
      min-height:44px;
      max-height:120px;
      padding:11px 18px;
      border:1px solid var(--border);
      background:var(--bg, #fff);
      font-size:15px;
      line-height:1.3;
      transition:border-color .15s ease, box-shadow .15s ease;
    }
    .mc2-composer-input:focus {
      outline:none;
      border-color:var(--primary, #6d28d9);
      box-shadow:0 0 0 3px rgba(109,40,217,0.15);
    }
    .mc2-composer-send {
      flex:none;
      width:44px;
      height:44px;
      min-width:44px;
      border-radius:50%;
      padding:0;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:0;
    }
    .mc2-composer-send::before {
      content:"➤";
      font-size:16px;
      line-height:1;
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
      padding:9px 13px;
      word-break:break-word;
      overflow-wrap:anywhere;
    }
    .mc2-bubble.mine {
      align-self:flex-end;
      background:var(--primary, #6d28d9);
      color:#fff;
      border-color:transparent;
      border-radius:16px 16px 4px 16px;
    }
    .mc2-bubble-text {
      font-size:15px;
      line-height:1.4;
      white-space:pre-wrap;
    }
    .mc2-bubble-time {
      margin-top:4px;
      font-size:11px;
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
    .mc2-unread-badge {
      border-radius:999px;
      padding:2px 7px;
      font-size:11px;
      font-weight:700;
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
          menu.style.display =
            "block";

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
    }
  );
}
