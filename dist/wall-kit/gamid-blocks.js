// Paints GamID blocks from a SNAPSHOT of the owner's real GamID data (built by dist/wall-editor/gamid-data.js from the accepted account APIs). Pure DOM building over plain data,
// text only (textContent), no markup, no network. Privacy rules live in the snapshot builder and here:
//   - only public-safe fields are ever in a snapshot (display name, @handle, avatar, chosen roles, connections the owner made public, game names/counts);
//   - playtime / hours appear ONLY when the block's own `showPlaytime` is on AND the owner's existing playtime setting allows it (`snapshot.games.playtimeAllowed`);
//   - a block whose public switch is off is still drawn for the owner (so they can design it) but is labelled "Private" - it will not appear publicly until they choose;
//   - nothing is faked: a block with no data shows a plain "nothing to show yet" line.
// The Games block reuses the accepted provider-neutral collapsible list (account/game-list.js): a bounded initial count, the total always shown, and an explicit
// control to expand - it never renders hundreds of games by default.
import { buildGameLibrary, gameListView, gameListToggleLabel } from "../account/game-list.js";
import { sourceBadges } from "../public/public-games.js";
import { markInteractive } from "./interaction.js";
import { relationshipBadge, RELATIONSHIP_LABELS } from "../public/identity-link.js";

export const BLOCK_TITLES = Object.freeze({ profile: "GAMID", roles: "GAMING ROLES", games: "GAMES", connections: "CONNECTIONS", duo: RELATIONSHIP_LABELS.duo });

export const hoursLabel = minutes => (Number.isFinite(minutes) && minutes > 0 ? (minutes >= 600 ? `${Math.round(minutes / 60)} h` : `${(Math.round(minutes / 6) / 10).toString()} h`) : "");
export const roleLabel = key => String(key).replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());

// `interactive` (view mode only): the block's own controls opt in to taps through the shared policy in interaction.js. In the editor it is false, so the canvas keeps
// every tap for selecting and dragging.
// VIEW mode draws Games and Connections from `snapshot.public` - exactly what a visitor may see (see dist/wall-editor/gamid-data.js) - and makes them useful: a game
// row opens its Game Details, a connection opens its details (`details`, dist/wall-kit/gamid-details.js). EDIT mode keeps drawing the owner's own data for designing.
export function paintGamidBlock(content, snapshot, createNode, { scale = 1, onChange = () => {}, interactive = false, details = null, posters = null } = {}) {
  const el = (tag, className, text) => { const node = createNode(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const root = el("div", `wall-gamid wall-gamid-${content.block} is-${content.layout}`);
  const px = value => `${Math.round(value * scale * 100) / 100}px`;
  root.style.setProperty("font-size", px(26));
  root.style.setProperty("padding", px(20));
  if (content.style) applyGamidStyle(root, content.style, px);
  const head = el("div", "wall-gamid-head");
  head.append(el("span", "wall-gamid-title", BLOCK_TITLES[content.block] ?? "GAMID"));
  root.append(head);
  if (!snapshot) { root.append(el("p", "wall-gamid-empty", "GamID data is not available here.")); return root; }
  // My Duo: VIEW mode draws ONLY the visitor's view (snapshot.public.duo: accepted, shown by its owner, the Duo's GamID published) and opens that GamID; EDIT mode draws
  // the owner's own Duo (labelled Private while visitors would not see it).
  if (content.block === "duo") {
    head.append(relationshipBadge("duo", createNode));
    if (interactive && snapshot.public) {
      if (!snapshot.public.available) { root.append(el("p", "wall-gamid-empty", "Visitors don't see this yet: your GamID is not public.")); return root; }
      if (!snapshot.public.duo) { root.append(el("p", "wall-gamid-empty", "My Duo isn't shown on this GamID.")); return root; }
      root.append(duoCard(snapshot.public.duo, el, createNode, true));
      return root;
    }
    if (snapshot.visibility && snapshot.visibility.duo === false) head.append(el("span", "wall-gamid-private", "PRIVATE"));
    if (!snapshot.duo) root.append(el("p", "wall-gamid-empty", "No Duo yet. Send a Duo request from your GamID page."));
    else root.append(duoCard(snapshot.duo, el, createNode, false));
    return root;
  }
  if (interactive && snapshot.public && (content.block === "games" || content.block === "connections")) {
    const view = snapshot.public;
    if (!view.available) { root.append(el("p", "wall-gamid-empty", "Visitors don't see this yet: your GamID is not public.")); return root; }
    if (content.block === "games") paintVisitorGames(root, head, content, view, el, details, onChange);
    else paintVisitorConnections(root, view, el, details, posters);
    return root;
  }
  const section = snapshot[content.block];
  if (snapshot.visibility && snapshot.visibility[content.block] === false) head.append(el("span", "wall-gamid-private", "PRIVATE"));

  if (content.block === "profile") {
    const profile = snapshot.profile;
    const row = el("div", "wall-gamid-profile");
    const avatar = el("div", "wall-gamid-avatar");
    if (profile.avatarUrl && /^blob:/.test(profile.avatarUrl)) { const img = createNode("img"); img.setAttribute("src", profile.avatarUrl); img.setAttribute("alt", ""); img.setAttribute("loading", "lazy"); avatar.append(img); }
    else avatar.textContent = profile.initial || "G";
    const names = el("div", "wall-gamid-names");
    names.append(el("strong", "wall-gamid-name", profile.displayName || "Gamer"), el("span", "wall-gamid-handle", profile.handle ? `@${profile.handle}` : ""));
    row.append(avatar, names);
    root.append(row);
  } else if (content.block === "roles") {
    if (!section?.length) root.append(el("p", "wall-gamid-empty", "No gaming roles chosen yet."));
    else {
      const list = el("ul", "wall-gamid-chips");
      for (const role of section) list.append(el("li", role.primary ? "is-primary" : "", role.label || roleLabel(role.key)));
      root.append(list);
    }
  } else if (content.block === "connections") {
    if (!section?.length) root.append(el("p", "wall-gamid-empty", "No connections are shown on your GamID."));
    else {
      const list = el("ul", "wall-gamid-connections");
      for (const item of section) {
        const li = el("li");
        const title = el("strong", "wall-connection-title");
        if (typeof item.avatarQuery === "string" && posters) title.append(connectionAvatar(item.avatarQuery, el, posters));
        title.append(el("span", "wall-connection-label", item.label));
        li.append(title, item.name ? el("span", "", item.name) : el("span", ""));
        list.append(li);
      }
      root.append(list);
    }
  } else if (content.block === "games") {
    const games = section?.items ?? [];
    if (!games.length) root.append(el("p", "wall-gamid-empty", "No games to show yet."));
    else {
      const showHours = content.showPlaytime === true && section.playtimeAllowed === true;
      const state = { expanded: false };
      const mount = () => {
        const lib = buildGameLibrary({
          element: el, games, expanded: state.expanded, id: `wall-games-${Math.abs(games.length * 31 + (games[0]?.name?.length ?? 0))}`, preview: content.initial, title: "",
          onToggle: () => { state.expanded = !state.expanded; root.replaceChildren(head, mount()); onChange(); },
          renderItem: game => { const li = el("li", "wall-game"); li.append(el("span", "wall-game-name", game.name)); if (showHours && hoursLabel(game.minutes)) li.append(el("span", "wall-game-hours", hoursLabel(game.minutes))); return li; },
        });
        // the list scrolls inside the block and holds Show all / Show fewer: the whole list region takes taps and scrolling (re-marked on every re-mount)
        if (interactive) markInteractive(lib);
        return lib;
      };
      root.append(mount());
    }
  }
  return root;
}

// ---- visitor view ------------------------------------------------------------------------------------------------------------------------------------
// A game row a visitor can open: the name, the accepted source badges ("Steam · Discovered", "Manual" - never "verified"), a short rank/stat line when the owner shows
// ranks & stats, and hours only when this block shows them AND the server sent them (the owner's playtime switch). Tapping it opens the accepted Game Details.
function visitorGameRow(game, content, el, details) {
  const item = el("li", "wall-game-item");
  const button = el("button", "wall-game is-row");
  button.type = "button";
  const badges = sourceBadges(game).map(badge => badge.text);
  button.setAttribute("aria-label", `${game.name}. ${badges.join(". ")}. Open game details`);
  const copy = el("span", "wall-game-copy");
  copy.append(el("span", "wall-game-name", game.year ? `${game.name} (${game.year})` : game.name));
  const meta = [...badges];
  if (game.stats?.fields?.length) meta.push(game.stats.fields.slice(0, 2).map(field => `${field.label} ${field.value}`).join(" · "));
  if (meta.length) copy.append(el("span", "wall-game-meta", meta.join(" · ")));
  button.append(copy);
  if (content.showPlaytime === true && hoursLabel(game.playtimeMinutes)) button.append(el("span", "wall-game-hours", hoursLabel(game.playtimeMinutes)));
  button.append(el("span", "wall-game-chevron", "›"));
  button.addEventListener("click", () => details?.openGame?.(game, button));
  item.append(button);
  return item;
}

function paintVisitorGames(root, head, content, view, el, details, onChange) {
  const games = view.games;
  if (!games) { root.append(el("p", "wall-gamid-empty", "Visitors don't see your games: My Games is off on your GamID.")); return; }
  const state = { expanded: false };
  const mount = () => {
    const shown = gameListView(games.libraryCount, state.expanded, content.initial);
    const rows = state.expanded ? games.items : games.items.slice(0, shown.showing);
    const wrap = el("div", "game-library");
    wrap.dataset.expanded = String(shown.expanded);
    const top = el("div", "game-library-head");
    top.append(el("span", "game-library-title", ""), el("span", "game-library-count", `${games.libraryCount} game${games.libraryCount === 1 ? "" : "s"}`));
    const list = el("ul", "game-list");
    list.append(...rows.map(game => visitorGameRow(game, content, el, details)));
    wrap.append(top, list);
    const rerender = () => { root.replaceChildren(head, mount()); onChange(); };
    if (state.expanded && games.items.length < games.totalCount) {
      const more = el("button", "game-library-toggle wall-game-more", `Show more games (${games.totalCount - games.items.length} left)`);
      more.type = "button";
      more.addEventListener("click", async () => { more.disabled = true; await games.loadMore(); rerender(); });
      wrap.append(more);
    }
    if (shown.collapsible) {
      const toggle = el("button", "game-library-toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(shown.expanded));
      toggle.append(el("span", "game-library-chevron"), el("span", "game-library-toggle-text", gameListToggleLabel(shown)));
      if (!shown.expanded) toggle.append(el("span", "game-library-more", `${shown.hidden} more`));
      toggle.addEventListener("click", () => { state.expanded = !state.expanded; rerender(); });
      wrap.append(toggle);
    }
    markInteractive(wrap);   // the list scrolls inside the block and every row, More and Show all / fewer take taps
    return wrap;
  };
  root.append(mount());
}

function paintVisitorConnections(root, view, el, details, posters) {
  if (!view.connections.length) { root.append(el("p", "wall-gamid-empty", "No connections are shown on your GamID.")); return; }
  const list = el("ul", "wall-gamid-connections");
  for (const connection of view.connections) {
    const li = el("li", "is-button");
    const button = el("button", "wall-connection");
    button.type = "button";
    button.setAttribute("aria-label", `${connection.label}: ${connection.name}. ${connection.trust}. Open details`);
    const title = el("strong", "wall-connection-title");
    if (typeof connection.avatarQuery === "string" && posters) title.append(connectionAvatar(connection.avatarQuery, el, posters));
    title.append(el("span", "wall-connection-label", connection.label));
    button.append(title, el("span", "", connection.name), el("span", `wall-connection-trust is-${connection.tone === "caution" ? "caution" : "ok"}`, connection.trust));
    button.addEventListener("click", () => details?.openConnection?.(connection, button));
    li.append(button);
    list.append(li);
  }
  markInteractive(list);
  root.append(list);
}

// The Duo card: avatar (a blob: URL from GamID's own avatar read, else the initial), display name and @handle. In VIEW mode it is a link to that GamID's public page -
// only a same-origin path built by identity-link.js (gamidHref) is ever followed; in the editor's Preview it opens in a new tab so the editor is never left.
function duoCard(duo, el, createNode, interactive) {
  const href = interactive && typeof duo.href === "string" && /^\/(?!\/)/.test(duo.href) ? duo.href : null;
  const card = el(href ? "a" : "div", "wall-duo-card");
  if (href) {
    card.setAttribute("href", href);
    card.setAttribute("aria-label", `My Duo: ${duo.displayName} (@${duo.handle}). Open their GamID`);
    if (duo.newTab) { card.setAttribute("target", "_blank"); card.setAttribute("rel", "noopener"); }
    markInteractive(card);
  }
  const avatar = el("div", "wall-gamid-avatar wall-duo-avatar");
  if (typeof duo.avatarUrl === "string" && /^blob:/.test(duo.avatarUrl)) { const img = createNode("img"); img.setAttribute("src", duo.avatarUrl); img.setAttribute("alt", ""); img.setAttribute("loading", "lazy"); avatar.append(img); }
  else avatar.textContent = (duo.displayName || duo.handle || "G").trim()[0]?.toUpperCase() || "G";
  const names = el("div", "wall-gamid-names");
  names.append(el("strong", "wall-gamid-name", duo.displayName || `@${duo.handle}`), el("span", "wall-gamid-handle", `@${duo.handle}`));
  card.append(avatar, names);
  if (href) card.append(el("span", "wall-duo-chevron", "›"));
  return card;
}

// A connection's own public avatar (e.g. the Steam persona picture), through GamID's image proxy only; shown once decoded, removed on any failure.
function connectionAvatar(query, el, posters) {
  const img = el("img", "wall-connection-avatar");
  img.setAttribute("alt", "");
  img.setAttribute("aria-hidden", "true");
  img.addEventListener?.("load", () => img.setAttribute("data-ready", "true"));
  img.addEventListener?.("error", () => img.remove?.());
  const known = posters.ready?.(query);
  if (known) img.setAttribute("src", known);
  else posters.load(query).then(url => { if (url) img.setAttribute("src", url); else img.remove?.(); }, () => img.remove?.());
  return img;
}

// ---- presentation styling (Round 2) -------------------------------------------------------------------------------------------------------------------------
// The block's typed style (gamid.js, defaults already filled in) becomes CSS custom properties + a few classes on the block's own root; wall-kit.css reads them with
// the accepted look as every fallback, so a block without a style is unchanged. Only validated values are used (#rrggbb, numbers in range, enums), never raw CSS.
// Opacity is applied to the BACKGROUND colours (rgba), never to the element, so text, chips and trust labels stay fully opaque.
const hexToRgb = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
export const rgba = (hex, alpha) => `rgba(${hexToRgb(hex).join(", ")}, ${Math.round(alpha * 1000) / 1000})`;
// Text drawn ON the accent colour (filled chips): black or white, whichever reads better (WCAG relative luminance).
export function onColor(hex) {
  const [r, g, b] = hexToRgb(hex).map(value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#0b0913" : "#ffffff";
}
export function gamidStyleVars(style, px) {
  const background = style.bgMode === "none" ? "transparent"
    : style.bgMode === "gradient" ? `linear-gradient(${style.bgAngle}deg, ${rgba(style.bgColor, style.bgOpacity)}, ${rgba(style.bgColor2, style.bgOpacity)})`
    : rgba(style.bgColor, style.bgOpacity);
  const border = style.border && style.borderWidth > 0 ? `max(1px, ${px(style.borderWidth)}) solid ${rgba(style.borderColor, style.borderOpacity)}` : "none";
  return {
    "--g-bg": background, "--g-border": border, "--g-radius": px(style.radius), "--g-gap": px(style.gap),
    "--g-heading": style.headingColor, "--g-text": style.primaryColor, "--g-muted": style.secondaryColor, "--g-accent": style.accentColor,
    "--g-on-accent": onColor(style.accentColor), "--g-on-heading": onColor(style.headingColor),
    "--g-chip-border": rgba(style.accentColor, 0.55), "--g-chip-bg": rgba(style.accentColor, 0.14),
    "--g-row-border": rgba(style.accentColor, 0.45), "--g-row-bg": rgba(style.primaryColor, 0.05), "--g-row-line": rgba(style.primaryColor, 0.08),
  };
}
function applyGamidStyle(root, style, px) {
  for (const [name, value] of Object.entries(gamidStyleVars(style, px))) root.style.setProperty(name, value);
  root.style.setProperty("padding", px(style.padding));
  root.className += ` is-styled chips-${style.chipStyle} rows-${style.rowStyle} avatar-${style.avatarShape} name-${style.nameSize}${style.showHandle === false ? " no-handle" : ""}`;
}

// Pure helper for tests / the editor's summary: how many rows a block renders before the person expands anything.
export const gamesInitiallyRendered = (total, initial) => gameListView(total, false, initial).showing;
