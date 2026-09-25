// Paints GamID blocks from a SNAPSHOT of the owner's real GamID data (built by dist/wall-editor/gamid-data.js from the accepted account APIs). Pure DOM building over plain data,
// text only (textContent), no markup, no network. Privacy rules live in the snapshot builder and here:
//   - only public-safe fields are ever in a snapshot (display name, @handle, avatar, chosen roles, connections the owner made public, game names/counts);
//   - playtime / hours appear ONLY when the block's own `showPlaytime` is on AND the owner's existing playtime setting allows it (`snapshot.games.playtimeAllowed`);
//   - a block whose public switch is off is still drawn for the owner (so they can design it) but is labelled "Private" - it will not appear publicly until they choose;
//   - nothing is faked: a block with no data shows a plain "nothing to show yet" line.
// The Games block reuses the accepted provider-neutral collapsible list (account/game-list.js): a bounded initial count, the total always shown, and an explicit
// control to expand - it never renders hundreds of games by default.
import { buildGameLibrary, gameListView } from "../account/game-list.js";

export const BLOCK_TITLES = Object.freeze({ profile: "GAMID", roles: "GAMING ROLES", games: "GAMES", connections: "CONNECTIONS" });

export const hoursLabel = minutes => (Number.isFinite(minutes) && minutes > 0 ? (minutes >= 600 ? `${Math.round(minutes / 60)} h` : `${(Math.round(minutes / 6) / 10).toString()} h`) : "");
export const roleLabel = key => String(key).replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());

export function paintGamidBlock(content, snapshot, createNode, { scale = 1, onChange = () => {} } = {}) {
  const el = (tag, className, text) => { const node = createNode(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const root = el("div", `wall-gamid wall-gamid-${content.block} is-${content.layout}`);
  const px = value => `${Math.round(value * scale * 100) / 100}px`;
  root.style.setProperty("font-size", px(26));
  root.style.setProperty("padding", px(20));
  const head = el("div", "wall-gamid-head");
  head.append(el("span", "wall-gamid-title", BLOCK_TITLES[content.block] ?? "GAMID"));
  root.append(head);
  if (!snapshot) { root.append(el("p", "wall-gamid-empty", "GamID data is not available here.")); return root; }
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
      for (const item of section) { const li = el("li"); li.append(el("strong", "", item.label), item.name ? el("span", "", item.name) : el("span", "")); list.append(li); }
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
        return lib;
      };
      root.append(mount());
    }
  }
  return root;
}

// Pure helper for tests / the editor's summary: how many rows a block renders before the person expands anything.
export const gamesInitiallyRendered = (total, initial) => gameListView(total, false, initial).showing;
