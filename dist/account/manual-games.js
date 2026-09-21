// "+ Add Game": search the canonical Game Catalog, pick the game, tick the platform(s) you play it on.
//
// Provider-neutral: this module knows no provider. Everything it shows about a game came from the server's canonical catalog, and everything it saves is a
// canonical game_key plus platform keys (the server validates both and can only ever store a MANUAL / user-declared platform). It never verifies anything, never
// says "discovered via" anything, and never touches a provider-discovered game. All server text is rendered as text (no innerHTML).
//
//   api.searchGames(query, limit)          -> rows {game_key, display_name, matched_alias}
//   api.getPlatformState(gameKey)          -> {game_key, display_name, supported[], established[], manual[]}
//   api.saveGame(gameKey, platformKeys)    -> saves the caller's MANUAL platforms for that game
//   api.removeGame(gameKey)                -> removes the caller's MANUAL declarations for that game (never a provider-discovered game)
import { createGameSearch, GAME_SEARCH_MIN_CHARS, GAME_SEARCH_MAX_RESULTS } from "./game-search.js";
import { normalizePlatformState, selectablePlatforms, initialSelection, toggleSelection, selectionKeys, saveDisabledReason, platformSummary } from "./game-platforms.js";

const ERRORS = {
  INVALID_GAME: "That game isn't in the catalog. Search again and pick it from the list.",
  INVALID_PLATFORM: "One of those platforms isn't available for this game. Reopen it and try again.",
  NO_PLATFORMS: "Choose at least one platform.",
  PLATFORM_ALREADY_DISCOVERED: "That platform is already discovered through your connected account, so it can't be added by hand.",
  GAME_LIMIT_REACHED: "You've reached the limit of games you can add by hand. Remove one first.",
  EMAIL_NOT_VERIFIED: "Verify your email before adding games.",
  IDENTITY_NOT_FOUND: "We couldn't find your GamID. Please refresh the page.",
  AUTH_REQUIRED: "Please sign in again, then try again.",
  NETWORK_ERROR: "The game service couldn't be reached. Check your connection and try again.",
};
const errorText = error => ERRORS[error?.message] || ERRORS[error?.code] || "Couldn't do that right now. Please try again.";

const HINTS = {
  idle: `Type at least ${GAME_SEARCH_MIN_CHARS} characters to search.`,
  short: `Type at least ${GAME_SEARCH_MIN_CHARS} characters to search.`,
  waiting: "Searching…",
  loading: "Searching…",
  results: "Choose your game. Keep typing to narrow the list.",
  empty: "No matching games. Check the spelling or try another name.",
  error: "Couldn't search right now. Please try again.",
};

export function createAddGamePanel({ element, api, isInLibrary = () => false, onDone = () => {}, schedule, cancel }) {
  const root = element("section", "game-add-panel");
  root.hidden = true;
  root.setAttribute("aria-label", "Add a game");

  const head = element("div", "game-add-head");
  const closeButton = element("button", "text-button game-add-close", "Close");
  closeButton.type = "button";
  head.append(element("p", "eyebrow", "ADD A GAME"), closeButton);

  // step 1: search
  const searchStep = element("div", "game-add-search");
  const label = element("label", "game-add-label", "Search games");
  const input = element("input", "game-add-input");
  input.type = "search";
  input.maxLength = 80;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("enterkeyhint", "search");
  input.setAttribute("placeholder", "Search games");
  input.setAttribute("aria-describedby", "gameAddHint");
  label.append(input);
  const hint = element("p", "game-add-hint", HINTS.idle);
  hint.id = "gameAddHint";
  hint.setAttribute("role", "status");
  const results = element("ul", "game-add-results");
  searchStep.append(label, hint, results);

  // step 2: platforms (rebuilt for each game)
  const platformStep = element("div", "game-add-platforms");
  platformStep.hidden = true;

  const message = element("p", "game-add-message");
  message.setAttribute("role", "status");
  message.hidden = true;
  root.append(head, searchStep, platformStep, message);

  let open = false;
  let chosen = null;          // {gameKey, name} while step 2 is showing
  let state = null;           // normalized platform state for the chosen game
  let selection = new Set();
  let busy = false;
  let confirmingRemove = false;
  let fromSearch = true;
  let token = 0;
  let saveButton = null;

  const search = createGameSearch({
    search: (query, limit) => api.searchGames(query, limit),
    onChange: next => paintSearch(next),
    schedule,
    cancel,
    limit: GAME_SEARCH_MAX_RESULTS,
  });

  function setMessage(text, tone = "error") {
    message.textContent = text || "";
    message.className = `game-add-message${tone === "ok" ? " is-ok" : ""}`;
    message.hidden = !text;
  }

  function paintSearch(next) {
    hint.textContent = next.status === "results" && next.results.length >= GAME_SEARCH_MAX_RESULTS ? "Showing the closest matches. Keep typing to narrow the list." : HINTS[next.status] || "";
    results.setAttribute("aria-busy", String(next.status === "waiting" || next.status === "loading"));
    results.dataset.stale = String(next.status === "waiting" || next.status === "loading");
    results.replaceChildren(...next.results.map(game => {
      const item = element("li", "game-add-result-item");
      const button = element("button", "game-result");
      button.type = "button";
      button.append(element("span", "game-result-name", game.name));
      if (game.year !== null && game.year !== undefined) button.append(element("span", "game-result-year", `(${game.year})`));
      if (game.alias) button.append(element("span", "game-result-alias", `Also known as ${game.alias}`));
      if (isInLibrary(game.gameKey)) button.append(element("span", "game-result-badge", "In My Games"));
      button.addEventListener("click", () => choose(game.gameKey, game.name, true));
      item.append(button);
      return item;
    }));
  }

  function showStep(which) {
    searchStep.hidden = which !== "search";
    platformStep.hidden = which !== "platforms";
  }

  function reset() {
    token += 1;
    search.destroy();
    open = false;
    chosen = null; state = null; selection = new Set(); busy = false; confirmingRemove = false; saveButton = null;
    input.value = "";
    paintSearch({ status: "idle", query: "", results: [] });
    platformStep.replaceChildren();
    setMessage("");
  }

  function close(notify) {
    reset();
    root.hidden = true;
    notify?.();
  }

  function openSearch() {
    reset();
    open = true;
    root.hidden = false;
    showStep("search");
    input.focus?.();
  }

  // Opens the platform step directly for a game (the row's "Edit" and a search result both land here).
  async function choose(gameKey, name, cameFromSearch) {
    const mine = ++token;
    open = true;
    root.hidden = false;
    fromSearch = cameFromSearch;
    chosen = { gameKey, name };
    state = null; selection = new Set(); busy = false; confirmingRemove = false;
    setMessage("");
    showStep("platforms");
    paintPlatforms();
    try {
      const next = normalizePlatformState(await api.getPlatformState(gameKey));
      if (mine !== token) return;
      if (!next || next.gameKey !== gameKey) throw new Error("INVALID_GAME");
      state = next;
      selection = initialSelection(next);
      paintPlatforms();
    } catch (error) {
      if (mine !== token) return;
      setMessage(errorText(error));
      paintPlatforms();
    }
  }

  function backOrCancel() {
    if (busy) return;
    if (fromSearch) { token += 1; chosen = null; state = null; confirmingRemove = false; setMessage(""); showStep("search"); input.focus?.(); }
    else close();
  }

  function refreshSave() {
    if (!saveButton || !state) return;
    saveButton.disabled = busy || Boolean(saveDisabledReason(state, selection));
  }

  async function save() {
    if (busy || !state || saveDisabledReason(state, selection)) return;
    busy = true;
    refreshSave();
    setMessage("Saving…", "ok");
    const mode = state.manual.length ? "updated" : "added";
    try {
      await api.saveGame(state.gameKey, selectionKeys(selection, state));
      const done = { mode, gameKey: state.gameKey, name: state.name };
      close(() => onDone(done));
    } catch (error) {
      busy = false;
      setMessage(errorText(error));
      refreshSave();
    }
  }

  async function remove() {
    if (busy || !state) return;
    busy = true;
    paintPlatforms();
    try {
      await api.removeGame(state.gameKey);
      const done = { mode: "removed", gameKey: state.gameKey, name: state.name };
      close(() => onDone(done));
    } catch (error) {
      busy = false;
      confirmingRemove = false;
      setMessage(errorText(error));
      paintPlatforms();
    }
  }

  function paintPlatforms() {
    saveButton = null;
    const nodes = [element("h3", "game-add-title", chosen?.name || "")];
    if (!state) {
      nodes.push(element("p", "game-add-note", message.hidden ? "Loading platforms…" : ""));
      const back = element("button", "secondary game-add-back", fromSearch ? "Back to search" : "Close");
      back.type = "button";
      back.addEventListener("click", backOrCancel);
      nodes.push(back);
      platformStep.replaceChildren(...nodes);
      return;
    }

    nodes.push(element("p", "game-add-sub", "Where do you play?"));
    const set = element("fieldset", "game-platform-set");
    set.append(element("legend", "game-add-legend", `Platforms for ${state.name}`));
    for (const item of state.established) {
      const row = element("label", "game-platform-option is-locked");
      const box = element("input");
      box.type = "checkbox";
      box.checked = true;
      box.disabled = true;
      row.append(box, element("span", "game-platform-name", item.label), element("span", "game-platform-note", "Discovered through your connected account — managed there, not here"));
      set.append(row);
    }
    for (const item of selectablePlatforms(state)) {
      const row = element("label", "game-platform-option");
      const box = element("input");
      box.type = "checkbox";
      box.checked = selection.has(item.key);
      box.disabled = busy || confirmingRemove;
      box.addEventListener("change", () => { selection = toggleSelection(selection, item.key, state); box.checked = selection.has(item.key); refreshSave(); });
      row.append(box, element("span", "game-platform-name", item.label));
      set.append(row);
    }
    nodes.push(set);
    if (!selectablePlatforms(state).length) nodes.push(element("p", "game-add-note", saveDisabledReason(state, selection)));
    nodes.push(element("p", "game-add-note", "MANUAL: platforms you choose here are declared by you. GamID does not verify them, and they never change what your connected accounts discovered."));

    const actions = element("div", "game-add-actions");
    if (confirmingRemove) {
      const merged = state.established.length > 0;
      nodes.push(element("p", "game-add-confirm", merged
        ? `Remove the platforms you added for ${state.name}? ${state.name} stays in My Games because your connected account discovered it.`
        : `Remove ${state.name} from My Games? Only the platforms you added are removed.`));
      const yes = element("button", "secondary danger game-add-remove-confirm", merged ? "Remove what I added" : "Remove game");
      yes.type = "button";
      yes.disabled = busy;
      yes.addEventListener("click", remove);
      const keep = element("button", "text-button game-add-keep", "Keep it");
      keep.type = "button";
      keep.disabled = busy;
      keep.addEventListener("click", () => { confirmingRemove = false; paintPlatforms(); });
      actions.append(yes, keep);
    } else {
      saveButton = element("button", "primary game-add-save", state.manual.length ? "Save platforms" : "Add to My Games");
      saveButton.type = "button";
      saveButton.addEventListener("click", save);
      const back = element("button", "secondary game-add-back", fromSearch ? "Back to search" : "Cancel");
      back.type = "button";
      back.addEventListener("click", backOrCancel);
      actions.append(saveButton, back);
      if (state.manual.length) {
        const start = element("button", "text-button danger game-add-remove", state.established.length ? "Remove what I added" : "Remove from My Games");
        start.type = "button";
        start.addEventListener("click", () => { confirmingRemove = true; setMessage(""); paintPlatforms(); });
        actions.append(start);
      }
    }
    nodes.push(actions);
    platformStep.replaceChildren(...nodes);
    refreshSave();
  }

  input.addEventListener("input", () => search.input(input.value));
  closeButton.addEventListener("click", () => { if (!busy) close(() => onDone({ mode: "closed" })); });
  root.addEventListener("keydown", event => { if (event.key === "Escape" && !busy) close(() => onDone({ mode: "closed" })); });

  return {
    root,
    openSearch,
    openEditor: (gameKey, name) => choose(gameKey, name, false),
    close: () => close(),
    isOpen: () => open,
  };
}

// ---- rows in the ONE My Games library -----------------------------------------------------------------------------------------------------------------------

function editButton({ element, gameName, onEdit }) {
  const button = element("button", "text-button game-edit-button", "Edit");
  button.type = "button";
  button.setAttribute("aria-label", `Edit the platforms you added for ${gameName}`);
  button.addEventListener("click", onEdit);
  return button;
}

// A game that exists ONLY because the owner added it. Its provenance is stated plainly: manual, declared by the owner, not verified.
export function manualGameItem({ element, row, onEdit }) {
  const item = element("li", "game-item is-manual");
  const icon = element("span", "game-icon", (row.name.trim()[0] || "?").toUpperCase());
  const copy = element("span", "game-copy");
  copy.append(
    element("span", "game-name", row.name),
    element("span", "game-meta", `Added by you (manual, not verified)`),
    element("span", "game-meta game-manual-line", platformSummary(row.manual.platforms)),
  );
  item.append(icon, copy, editButton({ element, gameName: row.name, onEdit }));
  return item;
}

// A provider-discovered game that ALSO carries platforms the owner declared: the discovery line is untouched and the owner's platforms are a second, clearly
// labelled line on the same row (never a second row, never "discovered via" anything but the real provider).
export function addManualPlatformsToDiscoveredItem({ element, item, copy, manual, gameName, onEdit }) {
  copy.append(element("span", "game-meta game-manual-line", `Also added by you: ${platformSummary(manual.platforms)}`));
  item.append(editButton({ element, gameName, onEdit }));
}
