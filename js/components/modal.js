/*
 * Marvel Chat V2
 *
 * Reusable modal component.
 */


function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function showModal(title, body, onClose) {
  const modalRoot = document.getElementById('modalRoot');
  if (!modalRoot) return;

  const safeTitle = escapeHtml(title);

  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-head">
          <h3>${safeTitle}</h3>
          <button class="icon-btn" id="modalCloseBtn">&times;</button>
        </div>
        <div class="modal-body">
          ${body}
        </div>
      </div>
    </div>
  `;

  const closeBtn = modalRoot.querySelector('#modalCloseBtn');
  const backdrop = modalRoot.querySelector('.modal-backdrop');

  const closeModal = () => {
    modalRoot.innerHTML = '';
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal();
      }
    });
  }
}

export function close() {
  const modalRoot = document.getElementById('modalRoot');
  if (modalRoot) {
    modalRoot.innerHTML = '';
  }
}
