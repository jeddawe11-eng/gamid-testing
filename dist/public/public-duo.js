// My Duo on the Public Profile (public.js): present only when the server's public 'duo' section is (the Duo is accepted, this owner shows it, and the Duo's GamID is
// published). A link to the Duo's GamID that carries `from` (the destination's Back control). Text only (textContent); the avatar arrives later through the same
// anonymous public avatar read the profile uses (`loadAvatar`) and only a blob: URL is ever shown - until then (or without one) the initial shows.
import { normalizeDuo, gamidHref, relationshipBadge, RELATIONSHIP_LABELS } from "./identity-link.js";

export function duoSection(section, { ownerHandle = "", pathname = "/", loadAvatar = null, doc = globalThis.document } = {}) {
  const duo = normalizeDuo(section);
  const href = duo ? gamidHref(duo.handle, { from: ownerHandle, pathname }) : null;
  if (!duo || !href || !doc) return null;
  const node = (tag, className, text) => { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const block = node("section", "public-section public-duo");
  const head = node("div", "public-duo-head");
  head.append(node("p", "public-section-label", RELATIONSHIP_LABELS.duo), relationshipBadge("duo", tag => doc.createElement(tag), doc));
  const link = node("a", "public-duo-card");
  link.href = href;
  link.setAttribute("aria-label", `My Duo: ${duo.displayName} (@${duo.handle}). Open their GamID`);
  const avatar = node("span", "public-duo-avatar", duo.displayName.replace(/^@/, "").charAt(0).toUpperCase() || "G");
  const names = node("span", "public-duo-names");
  names.append(node("strong", "", duo.displayName), node("span", "public-section-sub", `@${duo.handle}`));
  link.append(avatar, names, node("span", "public-duo-chevron", "›"));
  block.append(head, link);
  if (duo.avatarPath && typeof loadAvatar === "function") {
    Promise.resolve(loadAvatar(duo.avatarPath)).then(url => {
      if (typeof url !== "string" || !/^blob:/.test(url)) return;
      const img = doc.createElement("img");
      img.src = url; img.alt = "";
      avatar.replaceChildren(img);
    }, () => {});
  }
  return block;
}
