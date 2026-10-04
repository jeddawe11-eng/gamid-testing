// Builds the SNAPSHOT of the owner's real GamID data that GamID blocks are drawn from (see dist/wall-kit/gamid-blocks.js). It only calls the accepted account APIs (the
// owner's own reads through their own session) and only keeps public-safe fields:
//   profile      display name, @handle, avatar (a blob: URL from the owner's own avatar read)
//   roles        the gaming roles the owner chose
//   connections  ONLY connections the owner made public (with their existing public display name) - never a provider account id or token
//   games        game NAMES (and minutes only if the owner's existing playtime setting is on) from discovered games and the owner's own manual games; total count
//   visibility   whether each section is currently public on the owner's GamID (the editor shows a "Private" tag when it is not - the block still previews for its owner)
// Nothing is invented: a section with no data is empty. A failure to read one section never breaks the others.
//
// It ALSO builds `public`: exactly what a VISITOR of this GamID may see, read through the same two ANONYMOUS calls the accepted public profile makes
// (get_public_identity + the paged get_public_my_games). The server has already applied every privacy switch there (published GamID, "Show on my GamID", Show My
// Games, Show playtime, Show ranks & stats), so Preview's Games and Connections blocks can never show the owner more than a visitor would get - no owner data is mixed in.
import { normalizeLibrary } from "../public/public-games.js";
import { LEAGUE_LABELS } from "../account/game-profile-league-compat.js";
import { gameRef } from "../wall-kit/gamid-data.js";
import { normalizeDuo, normalizeCrews, gamidHref, crewWallHref, isHandle, normalizeHandle } from "../public/identity-link.js";

const PROVIDER_LABELS = { steam: "Steam", discord: "Discord", riot: "Riot", league: "League of Legends", xbox: "Xbox", playstation: "PlayStation" };
export const providerLabel = key => PROVIDER_LABELS[key] ?? String(key).replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
const roleLabel = key => String(key).replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
// readable data-source names: the accepted labels (the League compatibility layer is the one place that names its temporary source), never a copy here
export const PUBLIC_SOURCE_LABELS = LEAGUE_LABELS.dataSources;
export const PUBLIC_PAGE_SIZE = 50;

async function safely(read, fallback) { try { return (await read()) ?? fallback; } catch { return fallback; } }

// ---- the visitor view --------------------------------------------------------------------------------------------------------------------------------
const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const titleCase = value => `${String(value).charAt(0)}${String(value).slice(1).toLowerCase()}`;
const text = (value, max = 80) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "");

// Steam's own profile address exactly as its player summary returned it (vanity /id/ or this account's /profiles/) - anything else is not followed.
export function steamProfileUrl(value, steamId) {
  if (typeof value !== "string") return null;
  if (/^https:\/\/steamcommunity\.com\/id\/[A-Za-z0-9_-]{2,32}\/?$/.test(value)) return value;
  return typeof steamId === "string" && /^[0-9]{17}$/.test(steamId) && (value === `https://steamcommunity.com/profiles/${steamId}/` || value === `https://steamcommunity.com/profiles/${steamId}`) ? value : null;
}
// A Steam avatar address -> the media-poster query for GamID's own image proxy (only the 40-hex hash is sent), or null.
export function steamAvatarQuery(value) {
  const match = /^https:\/\/avatars\.(?:akamai\.|cloudflare\.|fastly\.)?steamstatic\.com\/([0-9a-f]{40})(?:_full|_medium)?\.jpg$/.exec(typeof value === "string" ? value : "");
  return match ? `steam_avatar=${match[1]}` : null;
}

// A public connection, shaped for the Wall (generic fields only; the painter names no provider). Only what the public profile itself shows, plus ACTIONS that exist
// for real: Steam's own profile address (as Steam returned it), copying a Discord username, and the League game entity. Nothing is invented.
export function publicConnections(sections) {
  const list = [];
  const discord = sections?.discord;
  const discordName = text(discord?.display_name), discordUser = text(discord?.username, 40);
  if (discordName || discordUser) {
    list.push({
      key: "discord", label: "Discord", name: discordName || `@${discordUser}`, sub: discordUser && discordName && discordUser !== discordName ? `@${discordUser}` : "", trust: "CONNECTED", tone: "ok", lines: [],
      actions: discordUser ? [{ kind: "copy", label: "Copy username", value: discordUser }] : [],
    });
  }
  // Steam (Round 2): the persona name, avatar and Steam's own profile address, as stored from Steam's official player summary. The SteamID64 is never shown to a
  // visitor; without a stored persona the row says plainly "Steam account", and the profile opens only through the address Steam itself returned (never built here).
  const steam = sections?.steam;
  if (steam && typeof steam === "object" && (steam.trust_status === "CONNECTED" || /^[0-9]{17}$/.test(steam.steam_id ?? "") || text(steam.persona_name, 64))) {
    const profileUrl = steamProfileUrl(steam.profile_url, steam.steam_id);
    const avatar = steamAvatarQuery(steam.avatar_url);
    list.push({
      key: "steam", label: "Steam", name: text(steam.persona_name, 64) || "Steam account", sub: "", trust: "CONNECTED", tone: "ok", lines: [],
      ...(avatar ? { avatarQuery: avatar } : {}),
      actions: profileUrl ? [{ kind: "open", label: "Open Steam profile", url: profileUrl }] : [],
    });
  }
  const league = sections?.league;
  if (text(league?.game_name)) {
    const lines = [];
    // the rank is its own privacy scope ("Show ranks & stats"): when it is off the server sends no rank_state, and no rank line is drawn at all
    if (league.rank_state === "RANKED" && league.tier) {
      const division = !APEX.has(league.tier) && league.division ? ` ${league.division}` : "";
      const record = Number.isInteger(league.wins) && Number.isInteger(league.losses) ? ` · ${league.wins}W ${league.losses}L` : "";
      lines.push(`${titleCase(league.tier)}${division}${Number.isInteger(league.lp) ? ` · ${league.lp} LP` : ""}${record}`);
    } else if (league.rank_state) lines.push("No ranked Solo/Duo rank reported");
    const when = league.updated_at ? new Date(league.updated_at) : null;
    lines.push(`Data: ${PUBLIC_SOURCE_LABELS[league.data_source] || "a third-party source"}${when && !Number.isNaN(when.getTime()) ? ` · Updated ${when.toLocaleDateString()}` : ""}`);
    list.push({
      key: "league", label: "League of Legends", name: `${text(league.game_name)}${text(league.tag_line, 10) ? `#${text(league.tag_line, 10)}` : ""}`, sub: text(league.platform_id, 10) ? `Region ${text(league.platform_id, 10)}` : "",
      trust: "PROTOTYPE / UNVERIFIED", tone: "caution", lines, actions: [{ kind: "game", label: "View League of Legends game", gameName: "League of Legends" }],
    });
  }
  return list;
}

// My Duo as a visitor sees it: only what the server's public 'duo' section holds (it is there only while the Duo is accepted, shown by this owner and published), the
// Duo's public avatar through the same anonymous read, and the address of the Duo's GamID. `link` decides that address and whether it opens in a new tab: a visitor's
// Wall navigates in place and carries `from` (Back control); the editor's Preview opens a new tab.
async function publicDuo(api, section, link) {
  const duo = normalizeDuo(section);
  if (!duo) return null;
  const avatarUrl = duo.avatarPath && typeof api.loadPublicAvatar === "function" ? await safely(() => api.loadPublicAvatar(duo.avatarPath), null) : null;
  const href = (link?.href ?? (h => gamidHref(h)))(duo.handle);
  return { handle: duo.handle, displayName: duo.displayName, avatarUrl, href: typeof href === "string" ? href : null, newTab: link?.newTab === true };
}

// My Crew as a visitor sees it: only the server's public 'crews' section (a PUBLIC GamID's ACTIVE memberships in existing Crews with a PUBLISHED Crew Wall), each
// with the address of its Crew Wall. `link` decides that address and whether it opens in a new tab: a visitor's Wall navigates in place; the editor's Preview opens a
// new tab. Only same-origin paths are kept.
export function publicCrewList(section, link) {
  const href = link?.href ?? (id => crewWallHref(id));
  return normalizeCrews(section).map(crew => {
    const address = href(crew.id);
    return { ...crew, href: typeof address === "string" && /^\/(?!\/)/.test(address) ? address : null, newTab: link?.newTab === true };
  });
}

// The visitor's view of this GamID. `games` is null when the owner's My Games is off (or there are none); its list grows page by page (50 at a time, the public
// function's own paging) only when a visitor asks for more, so a library of thousands never loads at once.
export async function loadPublicView(api, handle, { duoLink = null, crewLink = null } = {}) {
  if (!handle || typeof api.getPublicIdentity !== "function") return { available: false, handle: handle || "", games: null, connections: [], crews: [] };
  const identity = await safely(() => api.getPublicIdentity(handle), null);
  if (!identity) return { available: false, handle, games: null, connections: [], crews: [] };
  const sections = identity.public_sections ?? {};
  const preview = normalizeLibrary(sections.my_games, PUBLIC_SOURCE_LABELS);
  let games = null;
  if (preview && preview.libraryCount > 0) {
    const first = normalizeLibrary(await safely(() => api.getPublicMyGames(handle, { limit: PUBLIC_PAGE_SIZE, offset: 0 }), null), PUBLIC_SOURCE_LABELS);
    games = {
      libraryCount: preview.libraryCount,
      totalCount: first?.totalCount ?? preview.libraryCount,
      items: first?.games?.length ? first.games : preview.games,
      loading: false,
      async loadMore() {
        if (games.loading || games.items.length >= games.totalCount) return false;
        games.loading = true;
        try {
          const page = normalizeLibrary(await api.getPublicMyGames(handle, { limit: PUBLIC_PAGE_SIZE, offset: games.items.length }), PUBLIC_SOURCE_LABELS);
          if (!page?.games?.length) return false;
          games.items = games.items.concat(page.games);
          games.totalCount = page.totalCount;
          return true;
        } catch { return false; } finally { games.loading = false; }
      },
    };
  }
  // Round 3 - live GamID Data elements: the public identity fields a visitor already sees on the public profile (display name, @GamID, bio, chosen roles and the
  // public avatar through the same ANONYMOUS read the public profile uses). A single game is looked up in this identity's own public library (its own search).
  const catalog = new Map((Array.isArray(identity.role_catalog) ? identity.role_catalog : []).map(role => [role.key, role.label]));
  const roleKeys = Array.isArray(identity.role_keys) ? identity.role_keys : [];
  const avatarUrl = identity.avatar_media_reference && typeof api.loadPublicAvatar === "function" ? await safely(() => api.loadPublicAvatar(identity.avatar_media_reference), null) : null;
  const displayName = text(identity.display_name, 80);
  const profile = { displayName, handle: identity.gamid_handle || handle, bio: typeof identity.bio === "string" ? identity.bio.trim().slice(0, 1000) : "", initial: (displayName || "G")[0].toUpperCase(), avatarUrl };
  const roles = roleKeys.map(key => ({ key, label: catalog.get(key) || roleLabel(key), primary: key === identity.primary_role_key }));
  const found = new Map();
  async function findGame(ref) {
    if (!games) return null;
    const local = games.items.find(game => gameRef(game.name) === ref);
    if (local) return local;
    if (found.has(ref)) return found.get(ref);
    const lookup = safely(async () => {
      const page = normalizeLibrary(await api.getPublicMyGames(handle, { query: ref, limit: 12, offset: 0 }), PUBLIC_SOURCE_LABELS);
      return page?.games?.find(game => gameRef(game.name) === ref) ?? null;
    }, null);
    found.set(ref, lookup);
    return lookup;
  }
  const duo = await publicDuo(api, sections.duo, duoLink);
  return { available: true, handle, games, connections: publicConnections(sections), profile, roles, findGame, duo, crews: publicCrewList(sections.crews, crewLink) };
}

// The owner's own Duo for designing (EDIT mode): only an ACCEPTED Duo (get_my_duo relation DUO), its public avatar when its GamID is published, and whether visitors
// would see it now (the owner's switch is ON and the Duo's GamID is published).
export function ownerDuo(rows, avatarUrl = null) {
  const row = (Array.isArray(rows) ? rows : []).find(item => item?.relation === "DUO");
  const handle = normalizeHandle(row?.gamid_handle);
  if (!row || !isHandle(handle)) return null;
  const displayName = typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim().slice(0, 60) : `@${handle}`;
  return { handle, displayName, avatarUrl, isPublished: row.is_published === true, showPublic: row.show_public === true, shownToVisitors: row.is_published === true && row.show_public === true };
}

// The owner's own Crews for designing (EDIT mode): every ACTIVE membership (get_my_crews), each marked `shownToVisitors` when the server's public section lists it
// (its Crew Wall is published and the GamID is public) - the block draws the others as "not on your GamID yet" instead of hiding them.
export function ownerCrews(rows, publicList = []) {
  const shown = new Set((Array.isArray(publicList) ? publicList : []).map(crew => crew.id));
  return normalizeCrews((Array.isArray(rows) ? rows : []).filter(row => row?.my_status === "ACTIVE").map(row => ({ ...row, role: row.my_role })))
    .map(crew => ({ ...crew, shownToVisitors: shown.has(crew.id) }))
    .sort((a, b) => a.gameName.localeCompare(b.gameName));
}

export async function loadGamidSnapshot(api, { duoLink = null, crewLink = null } = {}) {
  const [account, profile, connections, publicSettings, display, discovered, manual, duoRows, crewRows] = await Promise.all([
    safely(() => api.getIdentity(), null),
    safely(() => api.getIdentityProfile(), null),
    safely(() => api.getMyConnections(), []),
    safely(() => api.getMyPublicGamesSettings(), null),
    safely(() => api.getMyGameDisplaySettings(), { show_game_playtime: false }),
    safely(() => api.getMyDiscoveredGames("steam", 1000), []),
    safely(() => api.getMyManualGames(), []),
    safely(() => (typeof api.getMyDuo === "function" ? api.getMyDuo() : []), []),
    safely(() => (typeof api.getMyCrews === "function" ? api.getMyCrews() : []), []),
  ]);
  const identity = { ...(account ?? {}), ...(profile ?? {}) };
  let avatarUrl = null;
  if (identity.avatar_media_reference) avatarUrl = await safely(() => api.loadAvatar(identity.avatar_media_reference), null);

  const roleKeys = Array.isArray(identity.role_keys) ? identity.role_keys : [];
  const roleCatalog = new Map((Array.isArray(identity.role_catalog) ? identity.role_catalog : []).map(role => [role.key, role.label]));
  const publicConnections = (Array.isArray(connections) ? connections : []).filter(row => row.connected && row.is_public);
  const seen = new Set();
  const items = [];
  for (const game of Array.isArray(discovered) ? discovered : []) {
    const name = String(game.game_name ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    // `ref` / `refName`: how the game is named in the owner's PUBLIC library (the catalog's name when GamID recognizes the game) - what a live Game element binds to
    const refName = String(game.recognized_name ?? "").trim() || name;
    items.push({ name, minutes: Number.isInteger(game.playtime_minutes) ? game.playtime_minutes : null, ref: gameRef(refName), refName });
  }
  for (const game of Array.isArray(manual) ? manual : []) {
    const name = String(game.display_name ?? game.name ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    items.push({ name, minutes: null, ref: gameRef(name), refName: name });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  const publicView = await safely(() => loadPublicView(api, identity.gamid_handle, { duoLink: duoLink ?? { newTab: true }, crewLink: crewLink ?? { newTab: true } }), { available: false, handle: identity.gamid_handle ?? "", games: null, connections: [], duo: null, crews: [] });
  let duo = ownerDuo(duoRows);
  if (duo) {
    const avatarPath = duoRows.find(row => row?.relation === "DUO")?.avatar_media_reference;
    if (avatarPath && typeof api.loadPublicAvatar === "function") duo = { ...duo, avatarUrl: await safely(() => api.loadPublicAvatar(avatarPath), null) };
  }

  const crews = ownerCrews(crewRows, publicView.crews);

  return {
    duo,
    crews,
    public: publicView,
    profile: { displayName: identity.display_name ?? "", handle: identity.gamid_handle ?? "", initial: (identity.display_name ?? "G").trim()[0]?.toUpperCase() ?? "G", avatarUrl, bio: typeof identity.bio === "string" ? identity.bio.trim() : "" },
    roles: roleKeys.map(key => ({ key, label: roleCatalog.get(key) || roleLabel(key), primary: key === identity.primary_role_key })),
    // Steam's provider_username is its SteamID64: never shown - the persona (provider_display_name) or a neutral "Steam account"
    connections: publicConnections.map(row => {
      const avatarQuery = row.provider_key === "steam" ? steamAvatarQuery(row.provider_avatar_url) : null;
      return { key: row.provider_key, label: providerLabel(row.provider_key), name: row.provider_key === "steam" ? (row.provider_display_name || "Steam account") : (row.provider_display_name || row.provider_username || ""), ...(avatarQuery ? { avatarQuery } : {}) };
    }),
    games: { total: items.length, items, playtimeAllowed: display?.show_game_playtime === true },
    connectionLabels: Object.fromEntries(Object.keys(PROVIDER_LABELS).map(key => [key, PROVIDER_LABELS[key]])),   // for "<provider> connection is no longer available."
    visibility: { profile: true, roles: true, connections: publicConnections.length > 0, games: publicSettings?.show_my_games === true, duo: duo?.shownToVisitors === true, crews: crews.some(crew => crew.shownToVisitors) },
  };
}
