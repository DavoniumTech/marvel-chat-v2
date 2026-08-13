import { escapeHtml } from "../state.js";

const modalRoot = document.getElementById("modalRoot");

export function showModal(title, body) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal">
        <div class="modal-head">
          <h2>${escapeHtml(title)}</h2>
          <button class="icon-btn" id="closeModal">✕</button>
        </div>
        ${body}
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
