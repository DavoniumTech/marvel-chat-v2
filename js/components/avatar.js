/*
 * Marvel Chat V2
 *
 * Reusable avatar component.
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

export function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export function renderAvatar(name, sizeClass = '') {
  const initials = escapeHtml(getInitials(name));
  const safeSizeClass = escapeHtml(sizeClass);
  const className = safeSizeClass ? `avatar ${safeSizeClass}` : 'avatar';
  return `<div class="${className}">${initials}</div>`;
}
