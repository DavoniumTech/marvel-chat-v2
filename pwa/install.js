import { state } from "../js/state.js";
import { toast } from "../js/components/toast.js";
import { closeModal } from "../js/components/modal.js";

export async function installPwa() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    const result = await state.installPrompt.userChoice;
    if (result.outcome === "accepted") {
      toast("Marvel Chat installed 📲");
    }
    state.installPrompt = null;
    closeModal();
    return;
  }
  toast("If your browser supports installation, use its browser menu and choose Install app.");
}
