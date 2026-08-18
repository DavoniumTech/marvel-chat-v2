import { escapeHtml } from "../state.js";

const modalRoot = document.getElementById("modalRoot");

export function showModal(title, body, options = {}) {
  const isFullscreen = options.size === "fullscreen" || options.variant === "fullscreen";

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal ${isFullscreen ? "modal-fullscreen" : ""}">
        <div class="modal-head">
          <h2>${escapeHtml(title)}</h2>
          <button class="icon-btn" id="closeModal" aria-label="Close">✕</button>
        </div>
        <div class="${isFullscreen ? "modal-body-scroll" : ""}">
          ${body}
        </div>
      </div>
    </div>
  `;
  document.getElementById("closeModal")?.addEventListener("click", closeModal);
  document.getElementById("modalBackdrop")?.addEventListener("click", e => {
    if (e.target.id === "modalBackdrop") closeModal();
  });
}

export function closeModal() {
  modalRoot.innerHTML = "";
}
