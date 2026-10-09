// Discord Profile Card (Classic Profile -> My Socials -> Discord icon). The server returns a card only when the owner opted in AND the My Socials Discord link is
// the very Discord account they connected (get_public_discord_card); otherwise there is no card and the icon stays the ordinary link. The card opens on click
// only, as a modal dialog: focus moves into it, and Esc, Close or a click outside dismiss it (focus returns to the icon). A modified or middle click still opens
// the plain link. Built with createElement/textContent only; the only external addresses are Discord's own profile page and its avatar CDN.
const DISCORD_ID = /^[0-9]{17,20}$/;

export function discordProfileUrl(id) {
  return typeof id === "string" && DISCORD_ID.test(id) ? `https://discord.com/users/${id}` : null;
}

// A Discord-CDN avatar of exactly this account, or null (the card then shows the initial instead).
export function discordAvatar(id, address) {
  if (!discordProfileUrl(id) || typeof address !== "string") return null;
  return new RegExp(`^https://cdn\\.discordapp\\.com/avatars/${id}/(a_)?[0-9a-f]{32}\\.png\\?size=128$`).test(address) ? address : null;
}

// -> true when the card was attached to this anchor (its address must be the card's own Discord profile), false when the ordinary link stays.
export function attachDiscordCard(anchor, card, doc = anchor.ownerDocument) {
  const url = discordProfileUrl(card?.discord_id);
  const username = typeof card?.username === "string" ? card.username.trim() : "";
  if (!url || !username || anchor.getAttribute("href") !== url) return false;
  const displayName = typeof card.display_name === "string" && card.display_name.trim() ? card.display_name.trim() : username;
  const h = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

  const dialog = h("dialog", "discord-card-dialog");
  dialog.id = "discordCardDialog";
  dialog.setAttribute("aria-labelledby", "discordCardName");
  dialog.setAttribute("aria-describedby", "discordCardHandle");
  const body = h("div", "discord-card");
  const close = h("button", "discord-card-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  const avatar = h("div", "discord-card-avatar");
  const initial = () => { avatar.replaceChildren(); avatar.textContent = (displayName[0] || "?").toUpperCase(); };
  const picture = discordAvatar(card.discord_id, card.avatar);
  if (picture) {
    const image = h("img");
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.decoding = "async";
    image.addEventListener("error", initial, { once: true });
    image.src = picture;
    avatar.append(image);
  } else initial();
  const name = h("strong", "discord-card-name", displayName);
  name.id = "discordCardName";
  const handle = h("span", "discord-card-handle", `@${username}`);
  handle.id = "discordCardHandle";
  const badge = h("span", "discord-card-badge", "Connected account");
  const head = h("div", "discord-card-head");
  const copy = h("div", "discord-card-copy");
  copy.append(name, handle, badge);
  head.append(avatar, copy);
  const open = h("a", "discord-card-open", "Open on Discord");
  open.href = url;
  open.target = "_blank";
  open.rel = "noopener noreferrer nofollow";
  open.setAttribute("aria-label", "Open on Discord (opens in a new tab)");
  const note = h("p", "discord-card-note", "Opens Discord in a new tab. Discord may ask you to sign in.");
  body.append(close, head, open, note);
  dialog.append(body);
  doc.body.append(dialog);

  const dismiss = () => { if (dialog.open) dialog.close(); };
  close.addEventListener("click", dismiss);
  dialog.addEventListener("click", event => { if (event.target === dialog) dismiss(); });   // the backdrop, outside the card
  dialog.addEventListener("close", () => anchor.focus());
  anchor.setAttribute("aria-haspopup", "dialog");
  anchor.setAttribute("aria-label", "Discord profile card");
  anchor.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;   // new tab / window: the ordinary link
    event.preventDefault();
    if (!dialog.open) dialog.showModal();
    open.focus();
  });
  return true;
}
