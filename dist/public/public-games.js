// Public My Games: the compact game list on a public GamID, the full searchable library, and Game Details.
//
// It only ever presents what the server returned for THIS identity (public.get_public_my_games / the my_games section of get_public_identity). The server has already
// enforced every privacy switch (Show My Games, Show playtime, Show ranks & stats): a value that is switched off is simply not in the response, so nothing here hides
// anything, and nothing here can reveal anything the server did not send. It is provider-neutral: a provider it has never heard of still renders as
// "<Provider> · Discovered". Everything is rendered as text (no innerHTML). It knows no DOM by itself: the caller injects `element` (and the mount / scroll-lock hooks).
//
// Trust vocabulary (never blurred):
//   DISCOVERED_FROM_<PROVIDER>  a connected provider reported the game. Shown as "<Provider> · Discovered". Never VERIFIED, never a checkmark.
//   MANUAL                      the owner declared it. Shown as "Manual". Never verified.
//   VERIFIED                    reserved for a genuine future verification mechanism; nothing in the data can produce it today, and no code path here labels a game with it.
import { normalizeGameProfile, dataSourceLabel, trustPresentation, displayValue, DATA_SOURCE_CLASS_LABELS } from "../account/game-profile.js";
import { leagueRowToGameProfileRow } from "../account/game-profile-league-compat.js";

export const PREVIEW_LIMIT = 6;          // games shown directly on the public profile
export const PAGE_SIZE = 30;             // games per page inside the full library (the server caps a page at 50)
export const SEARCH_DELAY_MS = 250;
export const SEARCH_MAX_CHARS = 80;
export const LEAGUE_TRUST_LABEL = "PROTOTYPE / UNVERIFIED";          // the League prototype truth is unchanged everywhere it is shown

const SOURCE = /^(MANUAL|DISCOVERED_FROM_[A-Z][A-Z0-9_]{0,30})$/;
const PLATFORM_KEY = /^[a-z][a-z0-9_]{1,31}$/;
const plainWords = token => String(token).toLowerCase().replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
const PROVIDER_NAMES = { STEAM: "Steam" };
export const providerName = provider => PROVIDER_NAMES[provider] || plainWords(provider);

// ---- normalization: anything malformed is dropped (fail safe), nothing is invented -----------------------------------------------------------------------------

function normalizePlatform(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.key !== "string" || !PLATFORM_KEY.test(raw.key)) return null;
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!label || label.length > 40) return null;
  const source = typeof raw.source === "string" && SOURCE.test(raw.source) ? raw.source : null;
  return source ? { key: raw.key, label, source } : null;
}

// sourceLabels: readable names for data-source tokens, supplied by the page (this module names no stats provider)
function normalizeStats(raw, sourceLabels) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    if (raw.league && typeof raw.league === "object") {
      // League: the EXISTING accepted row, shaped by the existing compatibility layer (no second copy of League stats)
      const profile = normalizeGameProfile(leagueRowToGameProfileRow(raw.league));
      if (profile) {
        const when = profile.fetchedAt ? ` · Updated ${profile.fetchedAt.toLocaleDateString()}` : "";
        const source = sourceLabels?.[profile.dataSource] || "a third-party source";
        return { kind: "league", fields: profile.fields.map(field => ({ label: field.label, value: displayValue(field) })), trust: LEAGUE_TRUST_LABEL, tone: "caution", source: `Data: ${source}${when}` };
      }
    }
    if (raw.profile && typeof raw.profile === "object") {
      const profile = normalizeGameProfile(raw.profile);
      if (profile) {
        const trust = trustPresentation(profile);
        const when = profile.fetchedAt ? ` · Updated ${profile.fetchedAt.toLocaleDateString()}` : "";
        return {
          kind: "profile", fields: profile.fields.map(field => ({ label: field.label, value: displayValue(field) })), trust: trust.label, tone: trust.tone,
          source: `Source: ${dataSourceLabel(profile, { dataSources: sourceLabels })} (${DATA_SOURCE_CLASS_LABELS[profile.dataSourceClass] || "Source"})${when}`,
        };
      }
    }
  } catch { /* a malformed stats object simply shows no stats */ }
  return null;
}

export function normalizePublicGame(raw, sourceLabels = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name || name.length > 200) return null;
  const sources = [...new Set((Array.isArray(raw.sources) ? raw.sources : []).filter(source => typeof source === "string" && SOURCE.test(source)))];
  if (!sources.length) return null;    // a game must say where GamID learned about it
  const platforms = [];
  for (const item of Array.isArray(raw.platforms) ? raw.platforms : []) {
    const platform = normalizePlatform(item);
    if (platform && !platforms.some(existing => existing.key === platform.key && existing.source === platform.source)) platforms.push(platform);
  }
  return {
    name,
    year: Number.isInteger(raw.year) && raw.year >= 1950 && raw.year <= 2100 ? raw.year : null,
    sources,
    platforms,
    playtimeMinutes: Number.isInteger(raw.playtime_minutes) && raw.playtime_minutes > 0 ? raw.playtime_minutes : null,
    stats: normalizeStats(raw.stats, sourceLabels),
  };
}

// {library_count, total_count, games} (or a bare {library_count, games} preview) -> normalized, or null when there is nothing usable
export function normalizeLibrary(raw, sourceLabels = {}) {
  if (!raw || typeof raw !== "object") return null;
  const games = (Array.isArray(raw.games) ? raw.games : []).map(game => normalizePublicGame(game, sourceLabels)).filter(Boolean);
  const libraryCount = Number.isSafeInteger(raw.library_count) && raw.library_count >= 0 ? raw.library_count : null;
  if (libraryCount === null) return null;
  const totalCount = Number.isSafeInteger(raw.total_count) && raw.total_count >= 0 ? raw.total_count : libraryCount;
  return { libraryCount, totalCount, games };
}

// ---- view models (pure) ---------------------------------------------------------------------------------------------------------------------------------------

// The compact source indicators of a row: icon + text, never colour alone. Steam / any provider = "Discovered"; the owner's own declarations = "Manual".
export function sourceBadges(game) {
  const badges = [];
  for (const source of game.sources) {
    if (!source.startsWith("DISCOVERED_FROM_")) continue;
    const provider = source.slice("DISCOVERED_FROM_".length);
    badges.push({
      kind: provider === "STEAM" ? "steam" : "provider",
      text: `${providerName(provider)} · Discovered`,
      description: `Discovered through a connected ${providerName(provider)} account. Not verified.`,
    });
  }
  if (game.sources.includes("MANUAL")) {
    const manual = game.platforms.filter(platform => platform.source === "MANUAL").map(platform => platform.label);
    badges.push({ kind: "manual", text: manual.length ? `Manual · ${manual.join(", ")}` : "Manual", description: "Added manually by the owner. Not verified." });
  }
  return badges;
}

export function formatPlaytime(minutes) {
  if (!Number.isInteger(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = minutes / 60;
  const value = hours < 100 ? Math.round(hours * 10) / 10 : Math.round(hours);
  return `${value} ${value === 1 ? "hour" : "hours"}`;
}

const rowLabel = game => `${game.name}${game.year ? `, ${game.year}` : ""}. ${sourceBadges(game).map(badge => badge.text).join(". ")}. Open game details`;

// What Game Details shows: ONLY what the server sent. A section with nothing to say is absent (never "N/A", never an empty card).
export function gameDetails(game) {
  const sources = [];
  for (const source of game.sources) {
    if (!source.startsWith("DISCOVERED_FROM_")) continue;
    const provider = source.slice("DISCOVERED_FROM_".length);
    sources.push({ kind: provider === "STEAM" ? "steam" : "provider", heading: providerName(provider), text: `Discovered through the connected ${providerName(provider)} account. It does not verify ownership on any other platform.` });
  }
  for (const platform of game.platforms.filter(item => item.source === "MANUAL")) sources.push({ kind: "manual", heading: platform.label, text: "Added manually · Not verified" });
  if (game.sources.includes("MANUAL") && !sources.some(item => item.kind === "manual")) sources.push({ kind: "manual", heading: "Manual", text: "Added manually · Not verified" });
  return {
    title: game.name,
    year: game.year,
    platforms: game.platforms.map(platform => platform.label),
    sources,
    playtime: formatPlaytime(game.playtimeMinutes),
    stats: game.stats,
  };
}

// ---- DOM builders (element(tag, className, text) is injected by the caller) -----------------------------------------------------------------------------------

function badgeNode(element, badge) {
  const node = element("span", `pg-badge is-${badge.kind}`);
  const icon = element("span", `pg-icon is-${badge.kind}`);
  icon.setAttribute("aria-hidden", "true");
  node.append(icon, element("span", "pg-badge-text", badge.text));
  return node;
}

export function buildGameRow({ element, game, onOpen }) {
  const item = element("li", "pg-item");
  const button = element("button", "pg-row");
  button.type = "button";
  button.setAttribute("aria-label", rowLabel(game));
  const copy = element("span", "pg-copy");
  const title = element("span", "pg-title");
  title.append(element("span", "pg-name", game.name));
  if (game.year) title.append(element("span", "pg-year", `(${game.year})`));
  const badges = element("span", "pg-badges");
  badges.append(...sourceBadges(game).map(badge => badgeNode(element, badge)));
  copy.append(title, badges);
  const chevron = element("span", "pg-chevron", "›");
  chevron.setAttribute("aria-hidden", "true");
  button.append(copy, chevron);
  button.addEventListener("click", () => onOpen(game, button));
  item.append(button);
  return item;
}

// The compact section on the public profile: at most PREVIEW_LIMIT rows, the true count, and a View all button only when there is more than fits.
export function renderGamesPreview({ element, container, library, onOpenGame, onViewAll }) {
  const games = library.games.slice(0, PREVIEW_LIMIT);
  const head = element("div", "pg-head");
  head.append(element("p", "pg-label", "MY GAMES"), element("span", "pg-count", String(library.libraryCount)));
  const list = element("ul", "pg-list");
  list.append(...games.map(game => buildGameRow({ element, game, onOpen: onOpenGame })));
  const nodes = [head, list];
  if (library.libraryCount > games.length) {
    const more = element("button", "pg-viewall", `View all ${library.libraryCount} games`);
    more.type = "button";
    more.addEventListener("click", () => onViewAll(more));
    nodes.push(more);
  }
  container.replaceChildren(...nodes);
  return games.length;
}

function detailNode({ element, game }) {
  const details = gameDetails(game);
  const root = element("div", "pg-detail");
  const title = element("h2", "pg-detail-title");
  title.id = "pgDetailTitle";
  title.append(element("span", "pg-detail-name", details.title));
  if (details.year) title.append(element("span", "pg-year", `(${details.year})`));
  root.append(title);
  const section = (heading, ...content) => { const box = element("section", "pg-section"); box.append(element("h3", "pg-section-title", heading), ...content); root.append(box); return box; };
  if (details.platforms.length) {
    const chips = element("ul", "pg-chips");
    chips.append(...details.platforms.map(label => element("li", "pg-chip", label)));
    section("Platforms", chips);
  }
  if (details.sources.length) {
    const list = element("ul", "pg-sources");
    for (const source of details.sources) {
      const row = element("li", "pg-source");
      const heading = element("span", "pg-source-heading");
      const icon = element("span", `pg-icon is-${source.kind}`);
      icon.setAttribute("aria-hidden", "true");
      heading.append(icon, element("span", "pg-source-name", source.heading));
      row.append(heading, element("span", "pg-source-text", source.text));
      list.append(row);
    }
    section(details.sources.length === 1 ? "Source" : "Sources", list);
  }
  if (details.playtime) section("Playtime", element("p", "pg-playtime", details.playtime));
  if (details.stats) {
    const stats = details.stats;
    const table = element("dl", "pg-stats");
    for (const field of stats.fields) table.append(element("dt", "pg-stat-label", field.label), element("dd", "pg-stat-value", String(field.value)));
    section("Rank & stats", element("span", `pg-trust is-${stats.tone}`, stats.trust), table, element("p", "pg-source-line", stats.source));
  }
  return root;
}

// The full library (search + pages) and Game Details, in one modal. api.getPublicMyGames(handle, {query, limit, offset}) -> the raw server object (or null).
export function createGamesLibrary({ element, handle, api, mount, sourceLabels = {}, lockScroll = () => {}, schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id), pageSize = PAGE_SIZE, libraryCount = 0 }) {
  const root = element("div", "pg-modal");
  root.hidden = true;
  const backdrop = element("div", "pg-backdrop");
  const panel = element("div", "pg-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "My Games");
  panel.tabIndex = -1;
  root.append(backdrop, panel);
  mount?.(root);

  // -- library view (built once, so typing never loses the input's focus)
  const libraryView = element("div", "pg-view pg-library");
  const libraryHead = element("div", "pg-modal-head");
  const titleEl = element("h2", "pg-modal-title");
  const closeLibrary = element("button", "pg-close", "Close");
  closeLibrary.type = "button";
  closeLibrary.setAttribute("aria-label", "Close My Games");
  libraryHead.append(titleEl, closeLibrary);
  const searchWrap = element("label", "pg-search");
  searchWrap.append(element("span", "pg-sr", "Search games"));
  const input = element("input", "pg-search-input");
  input.type = "search";
  input.maxLength = SEARCH_MAX_CHARS;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("placeholder", "Search games…");
  input.setAttribute("enterkeyhint", "search");
  input.setAttribute("autocapitalize", "off");
  searchWrap.append(input);
  const scroller = element("div", "pg-scroll");
  const statusEl = element("p", "pg-status");
  statusEl.setAttribute("role", "status");
  const listEl = element("ul", "pg-list is-library");
  const moreButton = element("button", "pg-more");
  moreButton.type = "button";
  scroller.append(statusEl, listEl, moreButton);
  libraryView.append(libraryHead, searchWrap, scroller);

  // -- detail view
  const detailView = element("div", "pg-view pg-detail-view");
  detailView.hidden = true;
  const detailHead = element("div", "pg-modal-head");
  const backButton = element("button", "pg-back", "‹ Back");
  backButton.type = "button";
  backButton.setAttribute("aria-label", "Back to all games");
  const closeDetail = element("button", "pg-close", "Close");
  closeDetail.type = "button";
  closeDetail.setAttribute("aria-label", "Close My Games");
  detailHead.append(backButton, closeDetail);
  const detailBody = element("div", "pg-detail-body");
  detailView.append(detailHead, detailBody);
  panel.append(libraryView, detailView);

  let isOpen = false;
  let view = "library";
  let detailFrom = "library";
  let opener = null;
  let query = "";
  let games = [];
  let total = 0;
  let library = libraryCount;
  let status = "idle";       // idle | loading | ready | empty | error
  let token = 0;
  let timer = null;
  let loadedOnce = false;
  let savedScroll = 0;

  function paint() {
    titleEl.textContent = `MY GAMES · ${library}`;
    titleEl.id = "pgLibraryTitle";
    panel.setAttribute("aria-labelledby", view === "library" ? "pgLibraryTitle" : "pgDetailTitle");
    listEl.setAttribute("aria-busy", String(status === "loading"));
    listEl.dataset.stale = String(status === "loading" && games.length > 0);
    listEl.replaceChildren(...games.map(game => buildGameRow({ element, game, onOpen: game2 => showDetail(game2, "library") })));
    const searching = query.trim() !== "";
    statusEl.textContent = status === "loading" && !games.length ? (searching ? "Searching…" : "Loading games…")
      : status === "empty" ? (searching ? "No matching games" : "No games to show.")
      : status === "error" ? "Couldn't load games right now."
      : status === "ready" && searching ? `${total} of ${library} games` : "";
    statusEl.hidden = !statusEl.textContent;
    const remaining = total - games.length;
    if (status === "error") { moreButton.textContent = "Try again"; moreButton.hidden = false; }
    else { moreButton.textContent = `Show more games (${remaining} left)`; moreButton.hidden = !(status === "ready" && remaining > 0); }
    moreButton.disabled = status === "loading";
  }

  async function load(reset) {
    const mine = ++token;
    status = "loading";
    if (reset) games = [];
    paint();
    try {
      const page = normalizeLibrary(await api.getPublicMyGames(handle, { query: query.trim(), limit: pageSize, offset: reset ? 0 : games.length }), sourceLabels);
      if (mine !== token) return;
      if (!page) { status = "error"; games = reset ? [] : games; paint(); return; }
      library = page.libraryCount;
      total = page.totalCount;
      games = reset ? page.games : games.concat(page.games);
      status = total === 0 ? "empty" : "ready";
      loadedOnce = true;
    } catch {
      if (mine !== token) return;
      status = "error";
    }
    paint();
  }

  function showLibrary() {
    view = "library";
    detailView.hidden = true;
    libraryView.hidden = false;
    if (!loadedOnce && status !== "loading") load(true); else paint();
    scroller.scrollTop = savedScroll;
  }

  function showDetail(game, from) {
    if (view === "library") savedScroll = scroller.scrollTop;
    view = "detail";
    detailFrom = from;
    backButton.hidden = from !== "library";
    libraryView.hidden = true;
    detailView.hidden = false;
    detailBody.replaceChildren(detailNode({ element, game }));
    panel.setAttribute("aria-labelledby", "pgDetailTitle");
    detailBody.scrollTop = 0;
    (from === "library" ? backButton : closeDetail).focus?.();
  }

  function open(nextOpener) {
    if (isOpen) return;
    isOpen = true;
    opener = nextOpener || null;
    root.hidden = false;
    lockScroll(true);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    token += 1;                      // anything still in flight is ignored
    cancel(timer);
    root.hidden = true;
    lockScroll(false);
    if (status === "loading") status = "idle";
    opener?.focus?.();
    opener = null;
  }

  input.addEventListener("input", () => {
    query = input.value.slice(0, SEARCH_MAX_CHARS);
    cancel(timer);
    status = "loading";
    paint();
    timer = schedule(() => load(true), SEARCH_DELAY_MS);
  });
  moreButton.addEventListener("click", () => load(status === "error"));
  closeLibrary.addEventListener("click", close);
  closeDetail.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  backButton.addEventListener("click", showLibrary);
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault?.(); if (view === "detail" && detailFrom === "library") showLibrary(); else close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...(panel.querySelectorAll?.("button, input, [href], [tabindex]:not([tabindex='-1'])") || [])].filter(node => !node.disabled && !node.hidden && node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    const active = root.ownerDocument?.activeElement;
    if (event.shiftKey && (active === first || active === panel)) { event.preventDefault?.(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault?.(); first.focus(); }
  });

  paint();
  return {
    root,
    // the "View all N games" button: opens the searchable library
    openLibrary(nextOpener) { open(nextOpener); showLibrary(); panel.focus?.(); },
    // a row of the compact preview: opens that game's details directly
    openGame(game, nextOpener) { open(nextOpener); showDetail(game, "preview"); },
    close,
    isOpen: () => isOpen,
    view: () => view,
  };
}
