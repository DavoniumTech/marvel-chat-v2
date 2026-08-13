import { escapeHtml, initials } from "../state.js";

export function renderAvatar(name, className = "avatar") {
  return `<div class="${className}">${escapeHtml(initials(name))}</div>`;
}
