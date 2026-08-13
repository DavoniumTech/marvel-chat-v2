import { escapeHtml } from "../state.js";

const toastRoot = document.getElementById("toastRoot");

export function toast(m) {
  toastRoot.innerHTML = `<div class="toast">${escapeHtml(m)}</div>`;
  setTimeout(() => { toastRoot.innerHTML = ""; }, 2800);
}
