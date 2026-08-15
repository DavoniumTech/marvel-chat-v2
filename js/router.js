import { state } from "./state.js";

export function setPage(pageName) {
  state.page = pageName;
  if (state.page !== "chat" && state.activeConversation) {
    state.unsubs.messages?.();
    state.unsubs.messages = null;
    state.activeConversation = null;
    state.messages = [];
  }
}
