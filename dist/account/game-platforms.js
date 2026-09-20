// Provider-neutral platform selection for a manually declared game (no DOM, no network).
//
// Three separate sets are kept apart for one canonical game, exactly as the database keeps them:
//   supported    the platforms the catalog RELIABLY lists for this game (only these are ever offered)
//   established  platforms a REAL PROVIDER discovery established for this owner (e.g. Steam). Shown, never editable here, never re-declarable.
//   manual       what the owner declared. This is the only set the editor can change. It is MANUAL / user-declared: never verified, never "discovered via".
// Anything malformed from the server is dropped (fail safe); nothing here invents a platform.

export const MANUAL_GAMES_LIMIT = 300;
const GAME_KEY = /^[a-z][a-z0-9_]{1,63}$/;
const PLATFORM_KEY = /^[a-z][a-z0-9_]{1,31}$/;

function platformList(rows, { keep = null } = {}) {
  const seen = new Set();
  const list = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.platform_key !== "string" || !PLATFORM_KEY.test(row.platform_key) || seen.has(row.platform_key)) continue;
    if (keep && !keep.has(row.platform_key)) continue;
    const label = typeof row.display_name === "string" ? row.display_name.trim() : "";
    if (!label || label.length > 40) continue;
    seen.add(row.platform_key);
    list.push({
      key: row.platform_key,
      label,
      family: typeof row.family === "string" ? row.family : null,
      parent: typeof row.parent_platform_key === "string" && PLATFORM_KEY.test(row.parent_platform_key) ? row.parent_platform_key : null,
    });
  }
  return list;
}

export function normalizePlatformState(raw) {
  try {
    if (!raw || typeof raw !== "object" || typeof raw.game_key !== "string" || !GAME_KEY.test(raw.game_key)) return null;
    const name = typeof raw.display_name === "string" ? raw.display_name.trim() : "";
    if (!name || name.length > 120) return null;
    const supported = platformList(raw.supported);
    const supportedKeys = new Set(supported.map(item => item.key));
    return {
      gameKey: raw.game_key,
      name,
      supported,
      established: platformList(raw.established),
      // a stored declaration outside the catalog's current list is not offered for editing (it could only be removed with the whole game)
      manual: platformList(raw.manual, { keep: supportedKeys }),
    };
  } catch {
    return null;
  }
}

// The platforms an owner can tick: supported, minus what a provider already established.
export function selectablePlatforms(state) {
  const locked = new Set(state.established.map(item => item.key));
  return state.supported.filter(item => !locked.has(item.key));
}

export const initialSelection = state => new Set(state.manual.map(item => item.key));

// A key can only be toggled when it is selectable; anything else leaves the selection unchanged.
export function toggleSelection(selection, key, state) {
  const next = new Set(selection);
  if (!selectablePlatforms(state).some(item => item.key === key)) return next;
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

// The exact list sent to the server, in the catalog's order.
export const selectionKeys = (selection, state) => selectablePlatforms(state).filter(item => selection.has(item.key)).map(item => item.key);

export function saveDisabledReason(state, selection) {
  if (!selectablePlatforms(state).length) return "GamID doesn't list any other platforms for this game yet.";
  if (!selectionKeys(selection, state).length) return "Choose at least one platform.";
  return null;
}

export const platformSummary = platforms => platforms.map(item => item.label).join(" · ");

// One canonical row per game: a manual declaration for a game a provider already discovered MERGES into that discovered row, so nothing is listed twice.
// Manual-only games are listed first (a deliberate, usually short list must not disappear behind a long provider library).
export function normalizeManualGames(rows) {
  const seen = new Set();
  const games = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.game_key !== "string" || !GAME_KEY.test(row.game_key) || seen.has(row.game_key)) continue;
    const name = typeof row.display_name === "string" ? row.display_name.trim() : "";
    const platforms = platformList(row.platforms);
    if (!name || name.length > 120 || !platforms.length) continue;
    seen.add(row.game_key);
    // trust is fixed here on purpose: whatever the server said, a declaration is never shown as anything but MANUAL
    games.push({ gameKey: row.game_key, name, platforms, trust: "MANUAL", addedAt: row.added_at || null });
  }
  return games;
}

export function buildLibraryRows(discovered, manual) {
  const declared = new Map((Array.isArray(manual) ? manual : []).map(game => [game.gameKey, game]));
  const merged = new Set();
  const discoveredRows = (Array.isArray(discovered) ? discovered : []).map(game => {
    const key = typeof game.recognized_game_key === "string" ? game.recognized_game_key : null;
    const declaredGame = key && declared.has(key) && !merged.has(key) ? declared.get(key) : null;
    if (declaredGame) merged.add(key);
    return { kind: "discovered", game, manual: declaredGame };
  });
  const manualRows = [...declared.values()].filter(game => !merged.has(game.gameKey)).map(game => ({ kind: "manual", gameKey: game.gameKey, name: game.name, manual: game }));
  return [...manualRows, ...discoveredRows];
}

export const rowGameKey = row => (row.kind === "manual" ? row.gameKey : typeof row.game.recognized_game_key === "string" ? row.game.recognized_game_key : null);
