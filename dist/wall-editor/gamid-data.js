// Builds the SNAPSHOT of the owner's real GamID data that GamID blocks are drawn from (see dist/wall-kit/gamid-blocks.js). It only calls the accepted account APIs (the
// owner's own reads through their own session) and only keeps public-safe fields:
//   profile      display name, @handle, avatar (a blob: URL from the owner's own avatar read)
//   roles        the gaming roles the owner chose
//   connections  ONLY connections the owner made public (with their existing public display name) - never a provider account id or token
//   games        game NAMES (and minutes only if the owner's existing playtime setting is on) from discovered games and the owner's own manual games; total count
//   visibility   whether each section is currently public on the owner's GamID (the editor shows a "Private" tag when it is not - the block still previews for its owner)
// Nothing is invented: a section with no data is empty. A failure to read one section never breaks the others.
const PROVIDER_LABELS = { steam: "Steam", discord: "Discord", riot: "Riot", league: "League of Legends", xbox: "Xbox", playstation: "PlayStation" };
export const providerLabel = key => PROVIDER_LABELS[key] ?? String(key).replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
const roleLabel = key => String(key).replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());

async function safely(read, fallback) { try { return (await read()) ?? fallback; } catch { return fallback; } }

export async function loadGamidSnapshot(api) {
  const [account, profile, connections, publicSettings, display, discovered, manual] = await Promise.all([
    safely(() => api.getIdentity(), null),
    safely(() => api.getIdentityProfile(), null),
    safely(() => api.getMyConnections(), []),
    safely(() => api.getMyPublicGamesSettings(), null),
    safely(() => api.getMyGameDisplaySettings(), { show_game_playtime: false }),
    safely(() => api.getMyDiscoveredGames("steam", 1000), []),
    safely(() => api.getMyManualGames(), []),
  ]);
  const identity = { ...(account ?? {}), ...(profile ?? {}) };
  let avatarUrl = null;
  if (identity.avatar_media_reference) avatarUrl = await safely(() => api.loadAvatar(identity.avatar_media_reference), null);

  const roleKeys = Array.isArray(identity.role_keys) ? identity.role_keys : [];
  const publicConnections = (Array.isArray(connections) ? connections : []).filter(row => row.connected && row.is_public);
  const seen = new Set();
  const items = [];
  for (const game of Array.isArray(discovered) ? discovered : []) {
    const name = String(game.game_name ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    items.push({ name, minutes: Number.isInteger(game.playtime_minutes) ? game.playtime_minutes : null });
  }
  for (const game of Array.isArray(manual) ? manual : []) {
    const name = String(game.display_name ?? game.name ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    items.push({ name, minutes: null });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));

  return {
    profile: { displayName: identity.display_name ?? "", handle: identity.gamid_handle ?? "", initial: (identity.display_name ?? "G").trim()[0]?.toUpperCase() ?? "G", avatarUrl },
    roles: roleKeys.map(key => ({ key, label: roleLabel(key), primary: key === identity.primary_role_key })),
    connections: publicConnections.map(row => ({ label: providerLabel(row.provider_key), name: row.provider_display_name || row.provider_username || "" })),
    games: { total: items.length, items, playtimeAllowed: display?.show_game_playtime === true },
    visibility: { profile: true, roles: true, connections: publicConnections.length > 0, games: publicSettings?.show_my_games === true },
  };
}
