/*
 * Marvel Chat V2
 *
 * Reusable toast / notification component.
 */

export function showToast(message) {
  const toastRoot = document.getElementById('toastRoot');
  if (!toastRoot) return;

  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.textContent = message;

  toastRoot.appendChild(toastEl);

  setTimeout(() => {
    if (toastEl.parentElement) {
      toastEl.remove();
    }
  }, 3000);
}

