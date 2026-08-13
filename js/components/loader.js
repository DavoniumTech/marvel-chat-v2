// Loader is styled directly via CSS class .loader
export function createLoader() {
  const div = document.createElement("div");
  div.className = "loader";
  return div;
}
