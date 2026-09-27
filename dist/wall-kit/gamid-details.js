// Game Details and Connection Details for GamID blocks in VIEW mode (Preview, and later a visitor's Wall). Pure DOM building through an injected `element` helper
// (text only, never markup), mounted once at page level:
//   - Game Details IS the accepted public-profile component (public-games.js createGamesLibrary().openGame): the same sections (platforms, sources, playtime, rank &
//     stats with their trust label), fed by the same anonymous public function, so a game on the Wall shows exactly what the public profile shows - no second copy.
//   - Connection Details uses the same .pg-* sheet (dist/wall-kit/game-details.css). It shows only what the snapshot's public view carries (dist/wall-editor/gamid-data.js)
//     and offers only the actions listed there: open a real https address in a new tab, copy a value, or open the game the connection enriches.
// This module names no provider.
import { createGamesLibrary, normalizeLibrary } from "../public/public-games.js";

const safeHttps = url => { try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null; } catch { return null; } };

export function createWallDetails({ element, handle, api, mount, lockScroll = () => {}, clipboard = globalThis.navigator?.clipboard, sourceLabels = {} }) {
  const games = createGamesLibrary({ element, handle, api, mount, sourceLabels, lockScroll, libraryCount: 0 });
  games.root.className = `${games.root.className} wall-details`;

  // ---- the connection sheet ----
  const root = element("div", "pg-modal wall-details");
  root.hidden = true;
  const backdrop = element("div", "pg-backdrop");
  const panel = element("div", "pg-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "wallConnectionTitle");
  panel.tabIndex = -1;
  const head = element("div", "pg-modal-head");
  const title = element("h2", "pg-modal-title");
  title.id = "wallConnectionTitle";
  const close = element("button", "pg-close", "Close");
  close.type = "button";
  close.setAttribute("aria-label", "Close connection details");
  head.append(title, close);
  const body = element("div", "pg-detail-body");
  panel.append(head, body);
  root.append(backdrop, panel);
  mount?.(root);
  let opener = null;

  function hide() {
    if (root.hidden) return;
    root.hidden = true;
    lockScroll(false);
    opener?.focus?.();
    opener = null;
  }
  close.addEventListener("click", hide);
  backdrop.addEventListener("click", hide);
  root.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault?.(); hide(); } });

  async function openGameByName(name, from) {
    let found = null;
    try {
      const page = normalizeLibrary(await api.getPublicMyGames(handle, { query: name, limit: 10, offset: 0 }), sourceLabels);
      found = page?.games.find(game => game.name.toLowerCase() === String(name).toLowerCase()) ?? null;
    } catch { found = null; }
    if (found) { games.openGame(found, from); return true; }
    return false;
  }

  function openConnection(connection, nextOpener = null) {
    opener = nextOpener;
    title.textContent = connection.label;
    const detail = element("div", "pg-detail");
    const name = element("h2", "pg-detail-title");
    name.append(element("span", "pg-detail-name", connection.name));
    detail.append(name);
    if (connection.sub) detail.append(element("p", "pg-source-line", connection.sub));
    const section = element("section", "pg-section");
    section.append(element("span", `pg-trust is-${connection.tone === "caution" ? "caution" : "neutral"}`, connection.trust));
    for (const line of connection.lines ?? []) section.append(element("p", "pg-source-line", line));
    detail.append(section);
    const actions = element("div", "pg-connection-actions");
    const status = element("p", "pg-connection-note");
    status.setAttribute("role", "status");
    for (const action of connection.actions ?? []) {
      if (action.kind === "open") {
        const url = safeHttps(action.url);
        if (!url) continue;
        const link = element("a", "pg-connection-action", `${action.label} ↗`);
        link.setAttribute("href", url);
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer nofollow");
        actions.append(link);
      } else if (action.kind === "copy" && typeof action.value === "string") {
        const button = element("button", "pg-connection-action", action.label);
        button.type = "button";
        button.addEventListener("click", async () => {
          try { await clipboard.writeText(action.value); status.textContent = "Copied."; } catch { status.textContent = `Copy this: ${action.value}`; }
        });
        actions.append(button);
      } else if (action.kind === "game" && action.gameName) {
        const button = element("button", "pg-connection-action", action.label);
        button.type = "button";
        button.addEventListener("click", async () => {
          status.textContent = "Opening…";
          const ok = await openGameByName(action.gameName, nextOpener);
          if (ok) { root.hidden = true; lockScroll(false); } else status.textContent = `${action.gameName} is not on this GamID's public games list.`;
        });
        actions.append(button);
      }
    }
    if (actions.children.length) detail.append(actions);
    detail.append(status);
    body.replaceChildren(detail);
    root.hidden = false;
    lockScroll(true);
    close.focus?.();
  }

  return {
    openGame: (game, nextOpener) => games.openGame(game, nextOpener),
    openGameByName,
    openConnection,
    closeAll() { hide(); games.close(); },
    roots: [games.root, root],
  };
}
