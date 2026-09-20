// Provider-neutral, collapsible game list.
//
// A user can have 200-300+ discovered games (Steam today; PlayStation, Xbox or any future provider later). No profile, editor section or Wall may
// therefore expand every game by default. This module owns the ONE compact/expanded behaviour so every provider reuses it:
//   * collapsed by default: only the first GAME_LIST_PREVIEW games are rendered (the rest are not even created as DOM nodes)
//   * the total count is always shown
//   * a clear chevron control expands the remaining games and collapses them again (aria-expanded / aria-controls)
// It knows nothing about any provider: the caller supplies the games and a row renderer, and keeps its own provenance / trust label per row.

export const GAME_LIST_PREVIEW = 8;

// Pure: what a list of `total` games shows in the collapsed / expanded state.
export function gameListView(total, expanded, preview = GAME_LIST_PREVIEW) {
  const count = Number.isSafeInteger(total) && total > 0 ? total : 0;
  const limit = Number.isSafeInteger(preview) && preview > 0 ? preview : GAME_LIST_PREVIEW;
  const collapsible = count > limit;
  const isExpanded = collapsible && Boolean(expanded);
  const showing = collapsible && !isExpanded ? limit : count;
  return { total: count, showing, hidden: count - showing, collapsible, expanded: isExpanded };
}

export function gameListCountLabel(view) {
  return `${view.total} game${view.total === 1 ? "" : "s"}`;
}

export function gameListToggleLabel(view) {
  if (!view.collapsible) return "";
  return view.expanded ? "Show fewer games" : `Show all ${view.total} games`;
}

// DOM: `element(tag, className, text)` is the caller's own helper (keeps this module free of page dependencies).
//   games      array of game records (already ordered by the caller)
//   renderItem game => <li>
//   expanded   current state (the caller stores it per provider)
//   onToggle   () => void   (the caller re-renders)
//   id         unique element id for the list (aria-controls)
export function buildGameLibrary({ element, games, renderItem, expanded, onToggle, id, preview = GAME_LIST_PREVIEW, title = "GAMES" }) {
  const view = gameListView(games.length, expanded, preview);
  const wrap = element("div", "game-library");
  wrap.dataset.expanded = String(view.expanded);
  const head = element("div", "game-library-head");
  head.append(element("span", "game-library-title", title), element("span", "game-library-count", gameListCountLabel(view)));
  const list = element("ul", "game-list");
  list.id = id;
  list.append(...games.slice(0, view.showing).map(renderItem));
  wrap.append(head, list);
  if (view.collapsible) {
    const toggle = element("button", "game-library-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(view.expanded));
    toggle.setAttribute("aria-controls", id);
    toggle.append(element("span", "game-library-chevron"), element("span", "game-library-toggle-text", gameListToggleLabel(view)));
    if (!view.expanded) toggle.append(element("span", "game-library-more", `${view.hidden} more`));
    toggle.addEventListener("click", onToggle);
    wrap.append(toggle);
  }
  return wrap;
}
