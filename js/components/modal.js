// 1. js/components/modal.js

import { escapeHtml } from "../state.js";

const modalRoot = document.getElementById("modalRoot");

export function showModal(title, body, options = {}) {
  const isFullscreen =
    options.size === "fullscreen" ||
    options.variant === "fullscreen";

  /*
   * Backward compatibility for older feature modules that still
   * pass a complete modal HTML document as the first argument.
   * Only trusted internal templates should use this form.
   * Modern callers should continue using showModal(title, body).
   */
  if (
    body === undefined &&
    typeof title === "string" &&
    /<div\s+class=["']modal-(?:header|body)["']/.test(title)
  ) {
    modalRoot.innerHTML = title;

    modalRoot
      .querySelectorAll("[data-close-modal]")
      .forEach(button => {
        button.addEventListener(
          "click",
          closeModal
        );
      });

    modalRoot
      .querySelector("#closeModal")
      ?.addEventListener(
        "click",
        closeModal
      );

    modalRoot
      .querySelector("#modalBackdrop")
      ?.addEventListener(
        "click",
        event => {
          if (
            event.target.id ===
            "modalBackdrop"
          ) {
            closeModal();
          }
        }
      );

    return;
  }

  modalRoot.innerHTML = `
    <div
      class="modal-backdrop"
      id="modalBackdrop"
    >
      <div
        class="modal ${
          isFullscreen
            ? "modal-fullscreen"
            : ""
        }"
      >
        <div class="modal-head">
          <h2>${escapeHtml(title)}</h2>

          <button
            class="icon-btn"
            id="closeModal"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div
          class="${
            isFullscreen
              ? "modal-body-scroll"
              : ""
          }"
        >
          ${body || ""}
        </div>
      </div>
    </div>
  `;

  document
    .getElementById("closeModal")
    ?.addEventListener(
      "click",
      closeModal
    );

  document
    .getElementById("modalBackdrop")
    ?.addEventListener(
      "click",
      e => {
        if (
          e.target.id ===
          "modalBackdrop"
        ) {
          closeModal();
        }
      }
    );
}

export function closeModal() {
  modalRoot.innerHTML = "";
}
