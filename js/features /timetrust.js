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
  getDocs,
  query,
  where,
  limit,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp
} from "../firebase/firestore.js";

import {
  showModal,
  closeModal
} from "../components/modal.js";

import {
  toast
} from "../components/toast.js";

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

function getAccount() {
  return (
    state.profile?.timeTrustAccount ||
    {}
  );
}

export function hasTimeTrustAccount() {
  return (
    !!state.user &&
    getAccount().active === true
  );
}

function providerProfile() {
  const account =
    getAccount();

  return {
    providerName:
      account.providerName ||
      account.name ||
      state.profile?.displayName ||
      state.profile?.username ||
      "User",

    providerBio:
      account.bio ||
      "",

    providerLocation:
      account.location ||
      state.profile?.country ||
      ""
  };
}

function timeValue(value) {
  if (
    value?.toMillis
  ) {
    return value.toMillis();
  }

  if (
    value?.toDate
  ) {
    return value.toDate().getTime();
  }

  const n =
    new Date(
      value ||
      0
    ).getTime();

  return Number.isFinite(n)
    ? n
    : 0;
}

function normalizeSkill(
  item
) {
  return {
    id:
      item.id,

    uid:
      item.uid ||
      "",

    providerName:
      item.providerName ||
      item.username ||
      "User",

    providerBio:
      item.providerBio ||
      "",

    providerLocation:
      item.providerLocation ||
      "",

    username:
      item.username ||
      item.providerName ||
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
          Activate TimeTrust to
          publish or manage skills.
        </strong>

        <p
          class="small"
          style="margin:6px 0 0;"
        >
          You can browse TimeTrust freely.
          Your Firebase login remains
          your only account.
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

  const account =
    getAccount();

  const active =
    account.active === true;

  const provider =
    providerProfile();

  showModal(
    active
      ? "Manage TimeTrust Account"
      : "Activate TimeTrust Account",

    `
      <div class="field">

        <label
          for="timeTrustProviderName"
        >
          Skill provider name *
        </label>

        <input
          class="input"
          id="timeTrustProviderName"
          maxlength="80"
          value="${escapeHtml(
            provider.providerName
          )}"
          placeholder="Your provider name"
        >

      </div>


      <div class="field">

        <label
          for="timeTrustProviderBio"
        >
          Provider description
        </label>

        <textarea
          class="textarea"
          id="timeTrustProviderBio"
          maxlength="300"
          rows="4"
          placeholder="Tell people what you can teach or help with…"
        >${escapeHtml(
          provider.providerBio
        )}</textarea>

      </div>


      <div class="field">

        <label
          for="timeTrustProviderLocation"
        >
          Provider location
        </label>

        <input
          class="input"
          id="timeTrustProviderLocation"
          maxlength="100"
          value="${escapeHtml(
            provider.providerLocation
          )}"
          placeholder="e.g. Abuja, Nigeria"
        >

      </div>


      <div
        class="card"
        style="
          background:var(--surface2);
          padding:12px;
          margin:12px 0;
          box-shadow:none;
        "
      >

        <strong>
          Your TimeTrust Account
        </strong>

        <p
          class="small"
          style="margin:5px 0 0;"
        >
          This uses your existing
          Firebase identity. These
          details control how you
          appear to people viewing
          your skill offers.
        </p>

      </div>


      <button
        class="btn btn-primary btn-block"
        id="saveTimeTrustAccount"
        type="button"
      >
        ${
          active
            ? "Save TimeTrust Account"
            : "Activate TimeTrust Account ⏱️"
        }
      </button>
    `
  );

  document
    .getElementById(
      "saveTimeTrustAccount"
    )
    ?.addEventListener(
      "click",
      async () => {
        const nameInput =
          document.getElementById(
            "timeTrustProviderName"
          );

        const bioInput =
          document.getElementById(
            "timeTrustProviderBio"
          );

        const locationInput =
          document.getElementById(
            "timeTrustProviderLocation"
          );

        const button =
          document.getElementById(
            "saveTimeTrustAccount"
          );

        const providerName =
          nameInput?.value.trim() ||
          "";

        const bio =
          bioInput?.value.trim() ||
          "";

        const location =
          locationInput?.value.trim() ||
          "";

        if (!providerName) {
          toast(
            "Enter your skill provider name."
          );

          nameInput?.focus();

          return;
        }

        if (button) {
          button.disabled =
            true;

          button.textContent =
            "Saving…";
        }

        try {
          const accountData = {
            ...account,

            active:
              true,

            providerName,

            name:
              providerName,

            bio,

            location,

            createdAt:
              account.createdAt ||
              new Date(),

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
                accountData
            }
          );

          state.profile = {
            ...state.profile,

            timeTrustAccount: {
              ...accountData,

              updatedAt:
                new Date()
            }
          };

          /*
           * Keep the provider identity
           * inside existing skill offers.
           * This makes an edited TimeTrust
           * account appear immediately on
           * the TimeTrust page.
           */
          try {
            const own =
              await getDocs(
                query(
                  collection(
                    db,
                    "skills"
                  ),
                  where(
                    "uid",
                    "==",
                    state.user.uid
                  ),
                  limit(100)
                )
              );

            await Promise.all(
              own.docs.map(
                skillDoc =>
                  updateDoc(
                    doc(
                      db,
                      "skills",
                      skillDoc.id
                    ),
                    {
                      username:
                        providerName,

                      providerName:
                        providerName,

                      providerBio:
                        bio,

                      providerLocation:
                        location,

                      updatedAt:
                        serverTimestamp()
                    }
                  )
              )
            );

            state.skills =
              (
                state.skills ||
                []
              ).map(
                skill =>
                  skill.uid ===
                  state.user.uid
                    ? {
                        ...skill,

                        username:
                          providerName,

                        providerName:
                          providerName,

                        providerBio:
                          bio,

                        providerLocation:
                          location
                      }
                    : skill
              );
          } catch (
            syncError
          ) {
            console.warn(
              "[TimeTrust] Existing skill metadata sync skipped:",
              syncError
            );
          }

          closeModal();

          toast(
            active
              ? "TimeTrust Account updated ✨"
              : "TimeTrust Account activated ⏱️"
          );

          renderApp?.();
        } catch (error) {
          console.error(
            "[TimeTrust] Account save failed:",
            error
          );

          toast(
            friendly(error)
          );

          if (button) {
            button.disabled =
              false;

            button.textContent =
              active
                ? "Save TimeTrust Account"
                : "Activate TimeTrust Account ⏱️";
          }
        }
      }
    );
}

export function renderTimeTrust(
  renderApp
) {
  const searchQuery =
    String(
      state.search ||
      ""
    )
      .trim()
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
    (
      state.skills ||
      []
    ).map(
      normalizeSkill
    );

  const myOffers =
    offers.filter(
      item =>
        item.uid ===
        state.user?.uid
    );

  let pool =
    timeTab === "my"
      ? [...myOffers]
      : [...offers];

  if (
    selectedCategory !==
      "All" &&
    timeTab !==
      "my"
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
          [
            item.providerName,
            item.providerBio,
            item.providerLocation,
            item.title,
            item.description,
            item.username,
            item.category
          ]
            .join(" ")
            .toLowerCase()
            .includes(
              searchQuery
            )
      );
  }

  pool.sort(
    (
      a,
      b
    ) =>
      sortBy ===
      "newest"
        ? timeValue(
            b.createdAt
          ) -
          timeValue(
            a.createdAt
          )
        : timeValue(
            a.createdAt
          ) -
          timeValue(
            b.createdAt
          )
  );

  const active =
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
          Discover skilled community
          members, offer your own
          expertise, and exchange
          useful knowledge.
        </p>

      </section>


      <div
        class="notice"
        style="margin-bottom:16px;"
      >

        <strong>
          ${
            active
              ? "TimeTrust account active."
              : "Browse TimeTrust freely."
          }
        </strong>

        <span class="small">
          ${
            active
              ? "Your provider name and description appear on your skill offers."
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
            Skill Exchange
          </strong>

          <span class="small">
            Connect directly with
            expert peers.
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
            ${offers.length}
            Active
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
          active
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
            timeTab ===
            "offers"
              ? "btn-primary"
              : "btn-ghost"
          }"
          data-time-tab="offers"
          style="flex:1"
          type="button"
        >
          Community Offers
          (${offers.length})
        </button>

        <button
          class="btn ${
            timeTab ===
            "my"
              ? "btn-primary"
              : "btn-ghost"
          }"
          data-time-tab="my"
          style="flex:1"
          type="button"
        >
          My Offers
          (${myOffers.length})
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
              state.search ||
              ""
            )}"
            autocomplete="off"
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
              sortBy ===
              "newest"
                ? "selected"
                : ""
            }
          >
            Newest first
          </option>

          <option
            value="oldest"
            ${
              sortBy ===
              "oldest"
                ? "selected"
                : ""
            }
          >
            Oldest first
          </option>

        </select>

      </div>


      ${
        timeTab !==
        "my"
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
                  category =>
                    `
                      <button
                        class="btn ${
                          selectedCategory
                            .toLowerCase() ===
                          category
                            .toLowerCase()
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
                        type="button"
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


      <div
        id="timeTrustItems"
      >

        ${
          pool.length
            ? `
              <div class="list">

                ${pool
                  .map(
                    item => {
                      const owner =
                        item.uid ===
                        state.user?.uid;

                      const providerName =
                        item.providerName ||
                        item.username ||
                        "User";

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
                            "
                          >

                            <div
                              class="avatar"
                              style="
                                font-size:16px;
                              "
                            >
                              ${escapeHtml(
                                initials(
                                  providerName
                                )
                              )}
                            </div>


                            <div
                              class="profile-meta"
                              style="
                                flex:1;
                              "
                            >

                              <strong
                                style="
                                  display:block;
                                  font-size:18px;
                                  font-weight:900;
                                  line-height:1.2;
                                "
                              >
                                ${escapeHtml(
                                  providerName
                                )}
                              </strong>


                              <div
                                class="small"
                                style="
                                  margin-top:3px;
                                "
                              >
                                @${escapeHtml(
                                  providerName
                                )}

                                ${
                                  item.providerLocation
                                    ? ` · ${escapeHtml(
                                        item.providerLocation
                                      )}`
                                    : ""
                                }

                              </div>


                              ${
                                item.providerBio
                                  ? `
                                    <p
                                      class="small"
                                      style="
                                        margin:5px 0;
                                      "
                                    >
                                      ${escapeHtml(
                                        item.providerBio
                                      )}
                                    </p>
                                  `
                                  : ""
                              }


                              <strong
                                style="
                                  display:block;
                                  font-size:16px;
                                  margin-top:5px;
                                "
                              >
                                ${escapeHtml(
                                  item.title
                                )}
                              </strong>


                              <p
                                class="small"
                                style="
                                  margin:4px 0;
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
                                    item.category
                                  )}
                                </span>

                                <span
                                  class="badge"
                                  style="
                                    background:var(--surface2);
                                  "
                                >
                                  ⏱️
                                  ${escapeHtml(
                                    item.hours
                                  )}
                                </span>

                                ${
                                  owner
                                    ? `
                                      <span
                                        class="badge"
                                        style="
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
                  style="font-size:42px;"
                >
                  ⏱️
                </div>

                <h3>
                  ${
                    timeTab ===
                    "my"
                      ? "You haven't published any skill offers yet."
                      : "No skill offers found."
                  }
                </h3>

                <p class="small">
                  ${
                    timeTab ===
                    "my"
                      ? "Publish your first skill offer to start helping members."
                      : "Try adjusting your search or category filters."
                  }
                </p>

                ${
                  active
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
  if (!state.user) {
    toast(
      "Please sign in first."
    );
    return;
  }

  if (
    !hasTimeTrustAccount()
  ) {
    return showTimeTrustAccountRequired(
      renderApp
    );
  }

  const editing =
    !!existingItem;

  const provider =
    providerProfile();

  showModal(
    editing
      ? "Edit skill offer"
      : "Offer your skill",

    `
      <div
        class="card"
        style="
          background:var(--surface2);
          padding:12px;
          margin:0 0 14px;
          box-shadow:none;
        "
      >

        <strong
          style="font-size:17px;"
        >
          ${escapeHtml(
            provider.providerName
          )}
        </strong>

        ${
          provider.providerBio
            ? `
              <p
                class="small"
                style="margin:5px 0 0;"
              >
                ${escapeHtml(
                  provider.providerBio
                )}
              </p>
            `
            : ""
        }

        ${
          provider.providerLocation
            ? `
              <span class="small">
                ${escapeHtml(
                  provider.providerLocation
                )}
              </span>
            `
            : ""
        }

      </div>


      <div class="field">

        <label
          for="skillTitle"
        >
          Skill title *
        </label>

        <input
          class="input"
          id="skillTitle"
          value="${escapeHtml(
            existingItem?.title ||
            existingItem?.skill ||
            ""
          )}"
          placeholder="e.g. Advanced coding"
        >

      </div>


      <div class="grid grid2">

        <div class="field">

          <label
            for="skillCategory"
          >
            Category *
          </label>

          <select
            class="select"
            id="skillCategory"
          >

            ${skillCategories
              .filter(
                c =>
                  c !==
                  "All"
              )
              .map(
                c =>
                  `
                    <option
                      value="${escapeHtml(
                        c
                      )}"
                      ${
                        (
                          existingItem?.category ||
                          "Other"
                        ) ===
                        c
                          ? "selected"
                          : ""
                      }
                    >
                      ${escapeHtml(
                        c
                      )}
                    </option>
                  `
              )
              .join("")}

          </select>

        </div>


        <div class="field">

          <label
            for="skillHours"
          >
            Estimated time / session
          </label>

          <input
            class="input"
            id="skillHours"
            value="${escapeHtml(
              existingItem?.hours ||
              "1 hour"
            )}"
            placeholder="e.g. 1 hour"
          >

        </div>

      </div>


      <div class="field">

        <label
          for="skillDescription"
        >
          Skill offer description *
        </label>

        <textarea
          class="textarea"
          id="skillDescription"
          rows="4"
          placeholder="Describe what you can teach or help with…"
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
          editing
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

        const descInput =
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

        const button =
          document.getElementById(
            "saveSkillBtn"
          );

        const title =
          titleInput?.value.trim() ||
          "";

        const description =
          descInput?.value.trim() ||
          "";

        const hours =
          hoursInput?.value.trim() ||
          "1 hour";

        const category =
          categoryInput?.value ||
          "Other";

        if (!title) {
          toast(
            "Please enter a skill title."
          );
          return;
        }

        if (!description) {
          toast(
            "Please enter a description."
          );
          return;
        }

        if (button) {
          button.disabled =
            true;

          button.textContent =
            editing
              ? "Saving…"
              : "Publishing…";
        }

        try {
          const providerNow =
            providerProfile();

          const data = {
            title,

            description,

            hours,

            category,

            providerName:
              providerNow.providerName,

            providerBio:
              providerNow.providerBio,

            providerLocation:
              providerNow.providerLocation,

            username:
              providerNow.providerName,

            updatedAt:
              serverTimestamp()
          };

          if (editing) {
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
              data
            );

            state.skills =
              (
                state.skills ||
                []
              ).map(
                s =>
                  s.id ===
                  existingItem.id
                    ? {
                        ...s,
                        ...data,
                        updatedAt:
                          new Date()
                      }
                    : s
              );

            closeModal();

            toast(
              "Skill offer updated successfully ✨"
            );
          } else {
            const ref =
              await addDoc(
                collection(
                  db,
                  "skills"
                ),
                {
                  uid:
                    state.user.uid,

                  ...data,

                  type:
                    "offer",

                  createdAt:
                    serverTimestamp()
                }
              );

            state.skills = [
              {
                id:
                  ref.id,

                uid:
                  state.user.uid,

                ...data,

                type:
                  "offer",

                createdAt:
                  new Date()
              },

              ...(
                state.skills ||
                []
              )
            ];

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

          if (button) {
            button.disabled =
              false;

            button.textContent =
              editing
                ? "Save Changes"
                : "Publish offer ⏱️";
          }
        }
      }
    );
}

export function showSkillDetails(
  item,
  renderApp
) {
  const skill =
    normalizeSkill(
      item
    );

  const owner =
    skill.uid ===
    state.user?.uid;

  const providerName =
    skill.providerName ||
    skill.username ||
    "User";

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
            align-items:flex-start;
            gap:10px;
          "
        >

          <div
            class="avatar"
            style="font-size:18px;"
          >
            ${escapeHtml(
              initials(
                providerName
              )
            )}
          </div>


          <div>

            <strong
              style="
                font-size:20px;
                font-weight:900;
                display:block;
              "
            >
              ${escapeHtml(
                providerName
              )}
            </strong>

            <strong
              style="
                font-size:16px;
                display:block;
                margin-top:3px;
              "
            >
              ${escapeHtml(
                skill.title
              )}
            </strong>

            <span class="small">
              @${escapeHtml(
                providerName
              )}

              ${
                skill.providerLocation
                  ? ` · ${escapeHtml(
                      skill.providerLocation
                    )}`
                  : ""
              }
            </span>

            ${
              skill.providerBio
                ? `
                  <p
                    class="small"
                    style="margin:5px 0 0;"
                  >
                    ${escapeHtml(
                      skill.providerBio
                    )}
                  </p>
                `
                : ""
            }

          </div>

        </div>


        <div
          style="
            display:flex;
            gap:8px;
            flex-wrap:wrap;
          "
        >

          <span class="badge">
            📂
            ${escapeHtml(
              skill.category
            )}
          </span>

          <span class="badge">
            ⏱️
            ${escapeHtml(
              skill.hours
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

          <strong class="small">
            About this skill offer
          </strong>

          <p
            style="
              white-space:pre-wrap;
              word-break:break-word;
              margin:5px 0 0;
            "
          >
            ${escapeHtml(
              skill.description
            )}
          </p>

        </div>


        ${
          owner
            ? `
              <div
                style="
                  display:flex;
                  gap:8px;
                "
              >

                <button
                  class="btn btn-ghost"
                  id="editSkillDetail"
                  style="flex:1"
                  type="button"
                >
                  Edit offer
                </button>

                <button
                  class="btn btn-danger"
                  id="deleteSkillDetail"
                  style="flex:1"
                  type="button"
                >
                  Delete offer
                </button>

              </div>
            `
            : `
              <button
                class="btn btn-primary btn-block"
                id="messageProviderBtn"
                type="button"
              >
                Message
                ${escapeHtml(
                  providerName
                )}
                💬
              </button>
            `
        }

      </div>
    `
  );

  if (owner) {
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
            skill
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
            skill,
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

        if (
          !skill.uid ||
          !state.user?.uid
        ) {
          toast(
            "Missing user information."
          );
          return;
        }

        if (
          skill.uid ===
          state.user.uid
        ) {
          toast(
            "You cannot contact yourself."
          );
          return;
        }

        if (button) {
          button.disabled =
            true;

          button.textContent =
            "Opening chat…";
        }

        try {
          const profileSnap =
            await getDoc(
              doc(
                db,
                "users",
                skill.uid
              )
            );

          const profile =
            profileSnap.exists()
              ? {
                  id:
                    profileSnap.id,

                  ...profileSnap.data(),

                  uid:
                    skill.uid
                }
              : {
                  uid:
                    skill.uid,

                  username:
                    providerName,

                  displayName:
                    providerName
                };

          await createConversation(
            profile,
            renderApp
          );

          closeModal();

          state.page =
            "chat";

          renderApp?.();

          toast(
            `Interest sent to @${providerName} ⏱️`
          );
        } catch (error) {
          console.error(
            "[TimeTrust] Connect provider error:",
            error
          );

          toast(
            "Could not open this conversation. Please try again."
          );

          if (button) {
            button.disabled =
              false;

            button.textContent =
              `Message ${providerName} 💬`;
          }
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

  if (
    item.uid !==
    state.user.uid
  ) {
    toast(
      "You can only delete your own skill offer."
    );
    return;
  }

  showModal(
    "Delete skill offer?",
    `
      <p class="small">
        This action cannot be undone.
      </p>

      <div
        style="
          display:flex;
          gap:8px;
          margin-top:14px;
        "
      >

        <button
          class="btn btn-ghost"
          id="cancelDeleteSkill"
          style="flex:1"
          type="button"
        >
          Cancel
        </button>

        <button
          class="btn btn-danger"
          id="confirmDeleteSkill"
          style="flex:1"
          type="button"
        >
          Delete
        </button>

      </div>
    `
  );

  document
    .getElementById(
      "cancelDeleteSkill"
    )
    ?.addEventListener(
      "click",
      closeModal
    );

  document
    .getElementById(
      "confirmDeleteSkill"
    )
    ?.addEventListener(
      "click",
      async () => {
        const button =
          document.getElementById(
            "confirmDeleteSkill"
          );

        if (button) {
          button.disabled =
            true;

          button.textContent =
            "Deleting…";
        }

        try {
          await deleteDoc(
            doc(
              db,
              "skills",
              item.id
            )
          );

          state.skills =
            (
              state.skills ||
              []
            ).filter(
              s =>
                s.id !==
                item.id
            );

          closeModal();

          toast(
            "Skill offer deleted."
          );

          renderApp?.();
        } catch (error) {
          toast(
            friendly(error)
          );

          if (button) {
            button.disabled =
              false;

            button.textContent =
              "Delete";
          }
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
      button =>
        button.addEventListener(
          "click",
          () => {
            state.timeTab =
              button.dataset.timeTab;

            state.search =
              "";

            renderApp?.();
          }
        )
    );

  document
    .querySelectorAll(
      "[data-time-cat]"
    )
    .forEach(
      button =>
        button.addEventListener(
          "click",
          () => {
            state.timeCategory =
              button.dataset.timeCat;

            renderApp?.();
          }
        )
    );

  const search =
    document.getElementById(
      "timeSearch"
    );

  search?.addEventListener(
    "input",
    event => {
      state.search =
        event.target.value ||
        "";

      renderApp?.();

      setTimeout(
        () => {
          const input =
            document.getElementById(
              "timeSearch"
            );

          if (input) {
            input.focus();

            input.selectionStart =
              input.value.length;

            input.selectionEnd =
              input.value.length;
          }
        },
        0
      );
    }
  );

  document
    .getElementById(
      "timeSortSelect"
    )
    ?.addEventListener(
      "change",
      event => {
        state.timeSort =
          event.target.value;

        renderApp?.();
      }
    );

  document
    .querySelectorAll(
      "[data-view-skill]"
    )
    .forEach(
      card =>
        card.addEventListener(
          "click",
          () => {
            const raw =
              (
                state.skills ||
                []
              ).find(
                skill =>
                  skill.id ===
                  card.dataset.viewSkill
              );

            if (raw) {
              showSkillDetails(
                raw,
                renderApp
              );
            }
          }
        )
    );
}
