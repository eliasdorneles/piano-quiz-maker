// Shared toast notifications.
// notify(text, kind) — kind: undefined/"success", "error".

function notify(text, kind) {
  let toastRoot = document.getElementById("toast-root");
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.id = "toast-root";
    toastRoot.setAttribute("aria-live", "polite");
    document.body.appendChild(toastRoot);
  }

  const toast = document.createElement("div");
  toast.className = "toast" + (kind ? " " + kind : "");
  toast.setAttribute("role", "status");
  toast.textContent = text;
  toastRoot.appendChild(toast);

  setTimeout(() => toast.classList.add("leaving"), 2400);
  toast.addEventListener("transitionend", (event) => {
    if (event.target === toast) {
      toast.remove();
    }
  });
  // Safety net in case transitionend never fires.
  setTimeout(() => toast.remove(), 3200);
}
