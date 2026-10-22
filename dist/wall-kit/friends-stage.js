// The empty Friends Stage (DEC-0011; Mazen's UX addition 2026-10-23): a Friends Stage the owner explicitly created that has no visible approved stickers shows a
// display-only message inside it. It is painted with the stage (paint.js) and never part of the Wall Document: no element, no layer, no asset, no storage. Nothing in
// it is clickable and nothing pretends stickers already exist.
//   audience "owner"   - the owner's own editor canvas and Preview (they open only for the signed-in owner, whose Wall the server resolved);
//   audience "visitor" - everywhere else, the public Wall included (the default: owner wording never shows without that trusted context).
export const FRIENDS_EMPTY_COPY = Object.freeze({
  visitor: Object.freeze({ eyebrow: "Friends Stage", title: "Good friends leave their mark! ✨", line: "“This stage is waiting for a little love from friends like you.”", badge: "Stickers coming soon" }),
  owner: Object.freeze({ eyebrow: "Your Friends Stage", title: "Waiting for your squad! 🎮", line: "“Your friends will leave their mark here. Every sticker will tell a story.”", badge: "Friends stickers · Coming soon" }),
});

export function paintFriendsEmptyState(createNode, audience = "visitor") {
  const copy = audience === "owner" ? FRIENDS_EMPTY_COPY.owner : FRIENDS_EMPTY_COPY.visitor;
  const part = (tag, className, text) => { const node = createNode(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const overlay = part("div", "wall-friends-empty");
  overlay.setAttribute("data-audience", audience === "owner" ? "owner" : "visitor");
  overlay.setAttribute("role", "note");
  overlay.setAttribute("aria-label", `${copy.eyebrow}. ${copy.title} ${copy.line} ${copy.badge}.`);
  const card = part("div", "wall-friends-empty-card");
  card.setAttribute("aria-hidden", "true");   // read once, through the note's label
  const icon = part("span", "wall-friends-empty-icon");
  icon.append(part("span", "wall-friends-empty-star"));
  card.append(icon, part("p", "wall-friends-empty-eyebrow", copy.eyebrow), part("p", "wall-friends-empty-title", copy.title), part("p", "wall-friends-empty-line", copy.line), part("span", "wall-friends-empty-badge", copy.badge));
  overlay.append(card);
  return overlay;
}
