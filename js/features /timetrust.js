import {
  state,
  escapeHtml,
  friendly,
  initials,
  formatDate
} from "../state.js";

import {
  db,
  collection,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp
} from "../firebase/firestore.js";

import {
  showModal,
  closeModal
} from "../components/modal.js";

import { toast } from "../components/toast.js";

import {
  createConversation
} from "./chat.js";


const skillCategories = [
  "All",
  "Education",
  "Technology",
  "Design",
  "Business",
  "Writing",
  "Languages",
  "Music",
  "Career",
  "Repair & Practical Skills",
  "Other"
];


function getTimeTrustAccount() {
  return (
    state.profile?.timeTrustAccount ||
    {}
  );
}


export function hasTimeTrustAccount() {
  return (
    !!state.user &&
    getTimeTrustAccount().active === true
  );
}


export function showTimeTrustAccountRequired(
  renderApp
) {
  if (!state.user) {
    toast(
      "Please sign in first."
    );
    return;
  }


  showModal(
    "TimeTrust account required",
    `
      <div
        class="notice"
        style="margin-bottom:14px;"
      >

        <strong>
          Activate TimeTrust to publish or manage skills.
        </strong>

        <p
          class="small"
          style="margin:6px 0 0;"
        >
          You can continue browsing TimeTrust without creating another account.
          Your Firebase login remains your only account.
        </p>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="timeTrustGoProfile"
        type="button"
      >
        ⏱️ Activate from Profile
      </button>
    `
  );


  document
    .getElementById(
      "timeTrustGoProfile"
    )
    ?.addEventListener(
      "click",
      () => {

        closeModal();

        state.page =
          "profile";

        renderApp?.();

      }
    );
}


export function showTimeTrustAccountModal(
  renderApp
) {
  if (!state.user) {
    toast(
      "Please sign in first."
    );
    return;
  }


  const active =
    getTimeTrustAccount().active === true;


  showModal(
    active
      ? "Manage TimeTrust Account"
      : "Activate TimeTrust Account",

    `
      <div
        class="card"
        style="
          background:var(--surface2);
          padding:14px;
          margin:0 0 14px;
          box-shadow:none;
        "
      >

        <strong>
          One Firebase identity
        </strong>

        <p
          class="small"
          style="margin:6px 0 0;"
        >
          TimeTrust uses your existing authenticated Firebase user.
          No second Firebase Authentication account is created.
        </p>

      </div>


      <div
        class="notice"
        style="margin-bottom:14px;"
      >

        <strong>
          ${
            active
              ? "Your TimeTrust account is active."
              : "Your TimeTrust account is inactive."
          }
        </strong>

        <p
          class="small"
          style="margin:6px 0 0;"
        >
          ${
            active
              ? "You can publish and manage your skill offers."
              : "Activation enables publishing and management while leaving discovery available to everyone."
          }
        </p>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="activateTimeTrustBtn"
        type="button"
      >
        ${
          active
            ? "Close"
            : "Activate TimeTrust Account ⏱️"
        }
      </button>
    `
  );


  document
    .getElementById(
      "activateTimeTrustBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        const button =
          document.getElementById(
            "activateTimeTrustBtn"
          );

        if (!button) {
          return;
        }


        if (
          hasTimeTrustAccount()
        ) {
          closeModal();
          return;
        }


        button.disabled = true;

        button.textContent =
          "Activating…";


        try {

          const current =
            state.profile
              ?.timeTrustAccount ||
            {};


          const account = {
            ...current,
            active: true,
            createdAt:
              current.createdAt ||
              serverTimestamp(),
            updatedAt:
              serverTimestamp()
          };


          await updateDoc(
            doc(
              db,
              "users",
              state.user.uid
            ),
            {
              timeTrustAccount:
                account
            }
          );


          state.profile = {
            ...state.profile,

            timeTrustAccount: {
              ...current,
              active: true,
              createdAt:
                current.createdAt ||
                new Date(),
              updatedAt:
                new Date()
            }
          };


          closeModal();

          toast(
            "TimeTrust account activated ⏱️"
          );

          renderApp?.();

        } catch (error) {

          console.error(
            "[TimeTrust] Account activation failed:",
            error
          );

          toast(
            friendly(error)
          );

          button.disabled =
            false;

          button.textContent =
            "Activate TimeTrust Account ⏱️";

        }

      }
    );
}


function normalizeSkill(item) {
  return {
    id: item.id,
    uid: item.uid || "",
    username:
      item.username ||
      "User",
    title:
      item.title ||
      item.skill ||
      "Untitled Skill",
    description:
      item.description ||
      "",
    hours:
      item.hours ||
      "1 hour",
    category:
      item.category ||
      "Other",
    type:
      item.type ||
      "offer",
    createdAt:
      item.createdAt,
    updatedAt:
      item.updatedAt
  };
}


function timestamp(value) {
  if (value?.toMillis) {
    return value.toMillis();
  }

  if (value?.toDate) {
    return value.toDate().getTime();
  }

  if (!value) {
    return 0;
  }

  const time =
    new Date(value).getTime();

  return Number.isFinite(time)
    ? time
    : 0;
}


export function renderTimeTrust(
  renderApp
) {
  const searchQuery =
    (state.search || "")
      .toLowerCase();

  const selectedCategory =
    state.timeCategory ||
    "All";

  const sortBy =
    state.timeSort ||
    "newest";

  const timeTab =
    state.timeTab ||
    "offers";

  const offers =
    (state.skills || [])
      .map(normalizeSkill);


  let pool =
    timeTab === "my"
      ? offers.filter(
          item =>
            item.uid ===
            state.user?.uid
        )
      : offers;


  if (
    selectedCategory !== "All" &&
    timeTab !== "my"
  ) {

    pool =
      pool.filter(
        item =>
          item.category
            .toLowerCase() ===
          selectedCategory
            .toLowerCase()
      );

  }


  if (searchQuery) {

    pool =
      pool.filter(
        item =>
          item.title
            .toLowerCase()
            .includes(searchQuery) ||

          item.description
            .toLowerCase()
            .includes(searchQuery) ||

          item.username
            .toLowerCase()
            .includes(searchQuery) ||

          item.category
            .toLowerCase()
            .includes(searchQuery)
      );

  }


  pool.sort(
    (a, b) =>
      sortBy === "newest"
        ? timestamp(b.createdAt) -
          timestamp(a.createdAt)
        : timestamp(a.createdAt) -
          timestamp(b.createdAt)
  );


  const myOffersCount =
    offers.filter(
      item =>
        item.uid ===
        state.user?.uid
    ).length;


  const activeAccount =
    hasTimeTrustAccount();


  return `
    <div
      class="page timetrust-page"
    >

      <section class="hero">

        <h1>
          TimeTrust ⏱️
        </h1>

        <p>
          Discover skilled community members, offer your own expertise,
          and discover useful knowledge.
        </p>

      </section>


      <div
        class="notice"
        style="margin-bottom:16px;"
      >

        <strong>
          ${
            activeAccount
              ? "TimeTrust account active."
              : "Browse TimeTrust freely."
          }
        </strong>

        <span class="small">
          ${
            activeAccount
              ? "You can publish and manage your skill offers."
              : "Activate your TimeTrust account from Profile before publishing or managing an offer."
          }
        </span>

      </div>


      <div
        class="grid grid2"
        style="margin-bottom:16px;"
      >

        <div
          class="card stat"
          style="
            padding:14px;
            margin:0;
          "
        >

          <span class="small">
            Provider Marketplace
          </span>

          <strong
            style="
              font-size:18px;
              display:block;
              margin:4px 0;
            "
          >
            Discover Skills
          </strong>

          <span class="small">
            Connect directly with expert peers.
          </span>

        </div>


        <div
          class="card stat"
          style="
            padding:14px;
            margin:0;
          "
        >

          <span class="small">
            Available Offers
          </span>

          <strong
            style="
              font-size:18px;
              display:block;
              margin:4px 0;
            "
          >
            ${offers.length} Active
          </strong>

          <span class="small">
            Ready for private connection.
          </span>

        </div>

      </div>


      <div class="section-title">

        <h2>
          Skill Offers
        </h2>

        ${
          activeAccount
            ? `
              <button
                class="btn btn-primary"
                id="offerSkillBtn"
                type="button"
              >
                + Offer a skill
              </button>
            `
            : ""
        }

      </div>


      <div
        class="segmented"
        style="margin-bottom:12px;"
      >

        <button
          class="btn ${
            timeTab === "offers"
              ? "btn-primary"
              : "btn-ghost"
          }"
          data-time-tab="offers"
          style="flex:1;"
        >
          Community Offers (${offers.length})
        </button>


        <button
          class="btn ${
            timeTab === "my"
              ? "btn-primary"
              : "btn-ghost"
          }"
          data-time-tab="my"
          style="flex:1;"
        >
          My Offers (${myOffersCount})
        </button>

      </div>


      <div
        style="
          display:flex;
          gap:8px;
          margin-bottom:12px;
          flex-wrap:wrap;
        "
      >

        <div
          class="search"
          style="
            flex:1;
            min-width:200px;
            margin:0;
          "
        >

          <input
            class="input"
            id="timeSearch"
            placeholder="Search skills, topics or providers…"
            value="${escapeHtml(
              state.search || ""
            )}"
          >

        </div>


        <select
          class="select"
          id="timeSortSelect"
          style="
            width:auto;
            padding:6px 12px;
            font-size:13px;
          "
        >

          <option
            value="newest"
            ${
              sortBy === "newest"
                ? "selected"
                : ""
            }
          >
            Newest first
          </option>

          <option
            value="oldest"
            ${
              sortBy === "oldest"
                ? "selected"
                : ""
            }
          >
            Oldest first
          </option>

        </select>

      </div>


      ${
        timeTab !== "my"
          ? `
            <div
              style="
                display:flex;
                gap:6px;
                overflow-x:auto;
                padding-bottom:8px;
                margin-bottom:16px;
                white-space:nowrap;
              "
            >

              ${skillCategories
                .map(
                  category => `
                    <button
                      class="btn ${
                        selectedCategory
                          .toLowerCase() ===
                        category.toLowerCase()
                          ? "btn-primary"
                          : "btn-ghost"
                      }"
                      data-time-cat="${escapeHtml(
                        category
                      )}"
                      style="
                        padding:4px 10px;
                        font-size:12px;
                        border-radius:999px;
                      "
                    >
                      ${escapeHtml(
                        category
                      )}
                    </button>
                  `
                )
                .join("")}

            </div>
          `
          : ""
      }


      <div id="timeTrustItems">

        ${
          pool.length
            ? `
              <div class="list">

                ${pool
                  .map(
                    item => {

                      const isOwner =
                        item.uid ===
                        state.user?.uid;


                      return `
                        <div
                          class="list-item"
                          style="cursor:pointer;"
                          data-view-skill="${escapeHtml(
                            item.id
                          )}"
                        >

                          <div
                            class="profile-row"
                            style="
                              align-items:flex-start;
                              justify-content:space-between;
                            "
                          >

                            <div
                              style="
                                display:flex;
                                gap:10px;
                                align-items:flex-start;
                                flex:1;
                              "
                            >

                              <div
                                class="avatar"
                                style="font-size:16px;"
                              >
                                ${escapeHtml(
                                  initials(
                                    item.username
                                  )
                                )}
                              </div>


                              <div
                                class="profile-meta"
                                style="flex:1;"
                              >

                                <div
                                  style="
                                    display:flex;
                                    align-items:center;
                                    gap:6px;
                                    flex-wrap:wrap;
                                  "
                                >

                                  <strong
                                    style="font-size:15px;"
                                  >
                                    ${escapeHtml(
                                      item.title
                                    )}
                                  </strong>

                                  <span
                                    class="badge"
                                    style="
                                      background:var(--surface2);
                                    "
                                  >
                                    ${escapeHtml(
                                      item.category
                                    )}
                                  </span>

                                </div>


                                <div
                                  class="small"
                                  style="margin-top:2px;"
                                >
                                  Provider:
                                  @${escapeHtml(
                                    item.username
                                  )}
                                  ·
                                  ${escapeHtml(
                                    formatDate(
                                      item.createdAt
                                    )
                                  )}
                                </div>


                                <p
                                  class="small"
                                  style="
                                    margin:6px 0;
                                    color:var(--text-secondary);
                                    display:-webkit-box;
                                    -webkit-line-clamp:2;
                                    -webkit-box-orient:vertical;
                                    overflow:hidden;
                                  "
                                >
                                  ${escapeHtml(
                                    item.description
                                  )}
                                </p>


                                <div
                                  style="
                                    display:flex;
                                    gap:8px;
                                    align-items:center;
                                    margin-top:6px;
                                  "
                                >

                                  <span
                                    class="badge"
                                    style="
                                      font-weight:600;
                                      background:var(--surface2);
                                    "
                                  >
                                    ⏱️ Session:
                                    ${escapeHtml(
                                      item.hours
                                    )}
                                  </span>


                                  ${
                                    isOwner
                                      ? `
                                        <span
                                          class="badge"
                                          style="
                                            background:rgba(79,70,229,.1);
                                            color:var(--primary);
                                          "
                                        >
                                          Your Offer
                                        </span>
                                      `
                                      : ""
                                  }

                                </div>

                              </div>

                            </div>

                          </div>

                        </div>
                      `;
                    }
                  )
                  .join("")}

              </div>
            `
            : `
              <div
                class="card empty"
                style="
                  padding:40px 20px;
                  text-align:center;
                "
              >

                <div
                  style="
                    font-size:42px;
                    margin-bottom:8px;
                  "
                >
                  ⏱️
                </div>


                <h3>
                  ${
                    timeTab === "my"
                      ? "You haven't published any skill offers yet."
                      : "No skill offers found."
                  }
                </h3>


                <p
                  style="
                    color:var(--text-secondary);
                    margin-bottom:16px;
                  "
                >
                  ${
                    timeTab === "my"
                      ? "Publish your first skill offer to start helping members."
                      : "Try adjusting your search or category filters."
                  }
                </p>


                ${
                  activeAccount
                    ? `
                      <button
                        class="btn btn-primary"
                        id="emptyOfferBtn"
                        type="button"
                      >
                        Offer a skill
                      </button>
                    `
                    : ""
                }

              </div>
            `
        }

      </div>

    </div>
  `;
}


export function showSkillModal(
  type = "offer",
  renderApp,
  existingItem = null
) {
  const isEdit =
    !!existingItem;


  if (!state.user) {
    toast(
      "Please sign in first."
    );
    return;
  }


  if (!hasTimeTrustAccount()) {
    showTimeTrustAccountRequired(
      renderApp
    );
    return;
  }


  showModal(
    isEdit
      ? "Edit skill offer"
      : "Offer your skill",

    `
      <div class="field">

        <label>
          Skill title *
        </label>

        <input
          class="input"
          id="skillTitle"
          placeholder="e.g. Advanced Coding assisting"
          value="${escapeHtml(
            existingItem?.title ||
            existingItem?.skill ||
            ""
          )}"
        >

      </div>


      <div class="grid grid2">

        <div class="field">

          <label>
            Category *
          </label>

          <select
            class="select"
            id="skillCategory"
          >

            ${skillCategories
              .filter(
                category =>
                  category !== "All"
              )
              .map(
                category => `
                  <option
                    value="${escapeHtml(
                      category
                    )}"
                    ${
                      (
                        existingItem
                          ?.category ||
                        "Other"
                      ) === category
                        ? "selected"
                        : ""
                    }
                  >
                    ${escapeHtml(
                      category
                    )}
                  </option>
                `
              )
              .join("")}

          </select>

        </div>


        <div class="field">

          <label>
            Estimated time / session
          </label>

          <input
            class="input"
            id="skillHours"
            placeholder="e.g. 1 hour"
            value="${escapeHtml(
              existingItem?.hours ||
              "1 hour"
            )}"
          >

        </div>

      </div>


      <div class="field">

        <label>
          Description *
        </label>

        <textarea
          class="textarea"
          id="skillDescription"
          rows="4"
          placeholder="Describe what you can teach or help with, and what learners can expect…"
        >${escapeHtml(
          existingItem?.description ||
          ""
        )}</textarea>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="saveSkillBtn"
        type="button"
      >
        ${
          isEdit
            ? "Save Changes"
            : "Publish offer ⏱️"
        }
      </button>
    `
  );


  document
    .getElementById(
      "saveSkillBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        const titleInput =
          document.getElementById(
            "skillTitle"
          );

        const descriptionInput =
          document.getElementById(
            "skillDescription"
          );

        const hoursInput =
          document.getElementById(
            "skillHours"
          );

        const categoryInput =
          document.getElementById(
            "skillCategory"
          );

        const saveButton =
          document.getElementById(
            "saveSkillBtn"
          );


        const title =
          titleInput
            ?.value
            .trim() || "";

        const description =
          descriptionInput
            ?.value
            .trim() || "";

        const hours =
          hoursInput
            ?.value
            .trim() ||
          "1 hour";

        const category =
          categoryInput
            ?.value ||
          "Other";


        if (!title) {
          toast(
            "Please enter a skill title."
          );

          titleInput?.focus();

          return;
        }


        if (!description) {
          toast(
            "Please enter a description."
          );

          descriptionInput?.focus();

          return;
        }


        try {

          saveButton.disabled =
            true;

          saveButton.textContent =
            isEdit
              ? "Saving…"
              : "Publishing…";


          const username =
            state.profile
              ?.displayName ||
            state.profile
              ?.username ||
            "User";


          if (isEdit) {

            if (
              existingItem.uid !==
              state.user.uid
            ) {
              throw new Error(
                "You can only edit your own skill offers."
              );
            }


            await updateDoc(
              doc(
                db,
                "skills",
                existingItem.id
              ),
              {
                title,
                description,
                hours,
                category,
                updatedAt:
                  serverTimestamp()
              }
            );


            closeModal();

            toast(
              "Skill offer updated successfully ✨"
            );

          } else {

            await addDoc(
              collection(
                db,
                "skills"
              ),
              {
                uid:
                  state.user.uid,
                username,
                title,
                description,
                hours,
                category,
                type:
                  "offer",
                createdAt:
                  serverTimestamp(),
                updatedAt:
                  serverTimestamp()
              }
            );


            closeModal();

            toast(
              "Skill offer published ⏱️"
            );

          }


          renderApp?.();

        } catch (error) {

          console.error(
            "[TimeTrust] Skill save error:",
            error
          );

          toast(
            friendly(error)
          );

          saveButton.disabled =
            false;

          saveButton.textContent =
            isEdit
              ? "Save Changes"
              : "Publish offer ⏱️";

        }

      }
    );
}


export function showSkillDetails(
  item,
  renderApp
) {
  const isOwner =
    item.uid ===
    state.user?.uid;


  showModal(
    "Skill Offer Details",

    `
      <div
        style="
          display:flex;
          flex-direction:column;
          gap:14px;
        "
      >

        <div
          style="
            display:flex;
            align-items:center;
            gap:10px;
          "
        >

          <div
            class="avatar"
            style="font-size:18px;"
          >
            ${escapeHtml(
              initials(
                item.username
              )
            )}
          </div>


          <div>

            <strong
              style="
                font-size:16px;
                display:block;
              "
            >
              ${escapeHtml(
                item.title
              )}
            </strong>

            <span class="small">
              Offered by
              @${escapeHtml(
                item.username
              )}
              ·
              ${escapeHtml(
                formatDate(
                  item.createdAt
                )
              )}
            </span>

          </div>

        </div>


        <div
          style="
            display:flex;
            gap:8px;
            flex-wrap:wrap;
          "
        >

          <span
            class="badge"
            style="
              background:var(--surface2);
            "
          >
            📂
            ${escapeHtml(
              item.category ||
              "Other"
            )}
          </span>


          <span
            class="badge"
            style="
              background:var(--surface2);
            "
          >
            ⏱️ Session:
            ${escapeHtml(
              item.hours ||
              "1 hour"
            )}
          </span>

        </div>


        <div
          class="card"
          style="
            background:var(--surface2);
            padding:12px;
            margin:0;
            box-shadow:none;
          "
        >

          <span
            class="small"
            style="
              font-weight:600;
              display:block;
              margin-bottom:4px;
            "
          >
            About this skill offer
          </span>

          <p
            style="
              white-space:pre-wrap;
              word-break:break-word;
              margin:0;
              font-size:14px;
            "
          >
            ${escapeHtml(
              item.description
            )}
          </p>

        </div>


        <div style="margin-top:8px;">

          ${
            isOwner

              ? hasTimeTrustAccount()

                ? `
                  <div
                    style="
                      display:flex;
                      gap:8px;
                    "
                  >

                    <button
                      class="btn btn-secondary"
                      id="editSkillDetail"
                      style="flex:1;"
                    >
                      Edit offer
                    </button>


                    <button
                      class="btn btn-danger"
                      id="deleteSkillDetail"
                      style="flex:1;"
                    >
                      Delete offer
                    </button>

                  </div>
                `

                : `
                  <div
                    class="notice"
                    style="margin-bottom:10px;"
                  >

                    <strong>
                      Activate TimeTrust to manage this offer.
                    </strong>

                    <p
                      class="small"
                      style="margin:6px 0 0;"
                    >
                      Your existing skill remains readable,
                      but publishing, editing, and deleting
                      require an active TimeTrust account.
                    </p>

                  </div>


                  <button
                    class="btn btn-primary btn-block"
                    id="activateSkillAccountBtn"
                    type="button"
                  >
                    ⏱️ Activate from Profile
                  </button>
                `

              : `
                <button
                  class="btn btn-primary btn-block"
                  id="messageProviderBtn"
                  type="button"
                >
                  Message Provider
                  @${escapeHtml(
                    item.username
                  )}
                  💬
                </button>
              `
          }

        </div>

      </div>
    `
  );


  if (
    isOwner &&
    !hasTimeTrustAccount()
  ) {

    document
      .getElementById(
        "activateSkillAccountBtn"
      )
      ?.addEventListener(
        "click",
        () => {

          closeModal();

          state.page =
            "profile";

          renderApp?.();

        }
      );

    return;
  }


  if (isOwner) {

    document
      .getElementById(
        "editSkillDetail"
      )
      ?.addEventListener(
        "click",
        () => {

          closeModal();

          showSkillModal(
            "offer",
            renderApp,
            item
          );

        }
      );


    document
      .getElementById(
        "deleteSkillDetail"
      )
      ?.addEventListener(
        "click",
        () =>
          showDeleteSkillConfirmation(
            item,
            renderApp
          )
      );

    return;
  }


  document
    .getElementById(
      "messageProviderBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        const button =
          document.getElementById(
            "messageProviderBtn"
          );

        if (!button) {
          return;
        }


        try {

          button.disabled =
            true;

          button.textContent =
            `Opening chat with ${item.username}…`;


          const targetUid =
            item.uid;


          if (
            !targetUid ||
            !state.user?.uid
          ) {
            throw new Error(
              "Missing user information."
            );
          }


          if (
            targetUid ===
            state.user.uid
          ) {

            toast(
              "You cannot contact yourself."
            );

            button.disabled =
              false;

            button.textContent =
              `Message Provider @${item.username} 💬`;

            return;
          }


          const profileSnapshot =
            await getDoc(
              doc(
                db,
                "users",
                targetUid
              )
            );


          let profile = {
            uid:
              targetUid,
            username:
              item.username ||
              "User",
            displayName:
              item.username ||
              "User"
          };


          if (
            profileSnapshot.exists()
          ) {

            const data =
              profileSnapshot.data();

            profile = {
              id:
                profileSnapshot.id,
              ...data,
              uid:
                data.uid ||
                targetUid
            };

          }


          await createConversation(
            profile,
            renderApp
          );


          state.page =
            "chat";

          renderApp?.();


          toast(
            `Interest sent to @${item.username} ⏱️`
          );

        } catch (error) {

          console.error(
            "[TimeTrust] Connect provider error:",
            error
          );

          toast(
            "Could not open this conversation. Please try again."
          );

          button.disabled =
            false;

          button.textContent =
            `Message Provider @${item.username} 💬`;

        }

      }
    );
}


function showDeleteSkillConfirmation(
  item,
  renderApp
) {
  if (!state.user) {
    toast(
      "Please sign in first."
    );
    return;
  }


  if (!hasTimeTrustAccount()) {
    showTimeTrustAccountRequired(
      renderApp
    );
    return;
  }


  if (
    item.uid !==
    state.user.uid
  ) {
    toast(
      "You can only manage your own skill offers."
    );
    return;
  }


  showModal(
    "Delete this skill offer?",

    `
      <p class="small">
        Are you sure you want to delete
        <strong>
          ${escapeHtml(
            item.title
          )}
        </strong>?
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
          id="cancelDelSkill"
          style="flex:1;"
        >
          Cancel
        </button>


        <button
          class="btn btn-danger"
          id="confirmDelSkill"
          style="flex:1;"
        >
          Delete
        </button>

      </div>
    `
  );


  document
    .getElementById(
      "cancelDelSkill"
    )
    ?.addEventListener(
      "click",
      () => {

        closeModal();

        showSkillDetails(
          item,
          renderApp
        );

      }
    );


  document
    .getElementById(
      "confirmDelSkill"
    )
    ?.addEventListener(
      "click",
      async () => {

        const button =
          document.getElementById(
            "confirmDelSkill"
          );


        try {

          button.disabled =
            true;

          button.textContent =
            "Deleting…";


          await deleteDoc(
            doc(
              db,
              "skills",
              item.id
            )
          );


          closeModal();

          toast(
            "Skill offer deleted successfully."
          );

          renderApp?.();

        } catch (error) {

          console.error(
            "[TimeTrust] Delete skill error:",
            error
          );

          toast(
            friendly(error)
          );

          button.disabled =
            false;

          button.textContent =
            "Delete";

        }

      }
    );
}


export function attachTimeTrustEvents(
  renderApp
) {
  document
    .getElementById(
      "offerSkillBtn"
    )
    ?.addEventListener(
      "click",
      () =>
        showSkillModal(
          "offer",
          renderApp
        )
    );


  document
    .getElementById(
      "emptyOfferBtn"
    )
    ?.addEventListener(
      "click",
      () =>
        showSkillModal(
          "offer",
          renderApp
        )
    );


  document
    .querySelectorAll(
      "[data-time-tab]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            state.timeTab =
              button.dataset.timeTab;

            renderApp();

          }
        );

      }
    );


  document
    .querySelectorAll(
      "[data-time-cat]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            state.timeCategory =
              button.dataset.timeCat;

            renderApp();

          }
        );

      }
    );


  const searchInput =
    document.getElementById(
      "timeSearch"
    );


  if (searchInput) {

    searchInput.addEventListener(
      "input",
      event => {

        state.search =
          event.target.value;

        renderApp();


        setTimeout(
          () => {

            const input =
              document.getElementById(
                "timeSearch"
              );

            if (!input) {
              return;
            }


            input.focus();

            input.selectionStart =
              input.value.length;

            input.selectionEnd =
              input.value.length;

          },
          0
        );

      }
    );

  }


  const sortSelect =
    document.getElementById(
      "timeSortSelect"
    );


  if (sortSelect) {

    sortSelect.addEventListener(
      "change",
      event => {

        state.timeSort =
          event.target.value;

        renderApp();

      }
    );

  }


  document
    .querySelectorAll(
      "[data-view-skill]"
    )
    .forEach(
      card => {

        card.addEventListener(
          "click",
          () => {

            const item =
              (state.skills || [])
                .find(
                  skill =>
                    skill.id ===
                    card.dataset
                      .viewSkill
                );


            if (item) {

              showSkillDetails(
                item,
                renderApp
              );

            }

          }
        );

      }
    );
}
