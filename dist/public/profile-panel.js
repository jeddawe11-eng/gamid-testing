// A full-screen panel over the public Classic Profile (My Crews, all Connected Games), built like the accepted My Games library dialog and reusing its styles
// (pg-modal / pg-panel): role=dialog + aria-modal, Close button, backdrop click and Escape close it, Tab stays inside, focus returns to the opener, and the page
// does not scroll behind it. Read-only: it presents what the server sent; nothing in it edits anything. Built with createElement / textContent only.
export function createProfilePanel({ doc = globalThis.document, mount = root => doc.body.append(root), lockScroll = () => {}, className = "" } = {}) {
  const h = (tag, cls, text) => { const el = doc.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
  const root = h("div", `pg-modal profile-panel ${className}`.trim()); root.hidden = true;
  const backdrop = h("div", "pg-backdrop");
  const panel = h("div", "pg-panel profile-panel-body");
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.tabIndex = -1;
  const head = h("div", "pg-modal-head");
  const title = h("h2", "pg-modal-title"); title.id = `profilePanelTitle-${Math.random().toString(36).slice(2, 8)}`;
  const close = h("button", "pg-close", "Close"); close.type = "button";
  head.append(title, close);
  const body = h("div", "pg-scroll profile-panel-content");
  panel.append(head, body); panel.setAttribute("aria-labelledby", title.id);
  root.append(backdrop, panel);
  mount(root);
  let opener = null, isOpen = false;
  function hide() {
    if (!isOpen) return;
    isOpen = false; root.hidden = true; lockScroll(false);
    opener?.focus?.(); opener = null;
  }
  close.addEventListener("click", hide);
  backdrop.addEventListener("click", hide);
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault?.(); hide(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll("button, [href], [tabindex]:not([tabindex='-1'])")].filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1], active = doc.activeElement;
    if (event.shiftKey && (active === first || active === panel)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  });
  return {
    root, body,
    open(label, content, nextOpener) {
      title.textContent = label; close.setAttribute("aria-label", `Close ${label}`); panel.setAttribute("aria-label", label);
      body.replaceChildren(...[content].flat().filter(Boolean));
      if (isOpen) return;   // refreshed content: focus stays where the visitor is
      isOpen = true; opener = nextOpener || null; root.hidden = false; lockScroll(true);
      body.scrollTop = 0; panel.focus?.();
    },
    close: hide,
    isOpen: () => isOpen,
  };
}
