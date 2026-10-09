import { getPublicIdentity, getPublicIdentityByQr, getPublicMyGames, loadPublicAvatar, signPublicIntroMedia, SUPABASE_URL, getPublicWall, getPublicCrewWall, getPublicSocialLinks } from "../account/supabase-client.js";
import { renderPublicSocials } from "../account/socials.js";
import { createIntroSourceResolver } from "../account/intro-source.js";
import { createFlowLayout } from "../flow-layout.js";
import { normalizeLibrary, renderGamesPreview, createGamesLibrary } from "./public-games.js";
import { preparePublicWall, createPublicWallView } from "./public-wall.js";
import { backHandle, crewIdFromSearch } from "./identity-link.js";
import { createVisitorNav } from "./visitor-nav.js";
import { duoSection } from "./public-duo.js";

const catalogLabel = (catalog, key) => catalog?.find(item => item.key === key)?.label || key || "";

// My Socials leads the panel: the owner's OWN accounts (saved links of a published GamID only, from get_public_social_links), as clickable icons. -> drawn?
export function prependPublicSocials(panel, socialLinks) {
  const socials = node("div", "public-socials");
  if (renderPublicSocials(socials, socialLinks, document) === 0) return false;
  const block = node("section", "public-section public-socials-block");
  block.setAttribute("aria-label", "Social accounts");
  block.append(node("p", "public-section-label", "SOCIALS"), socials);
  panel.prepend(block);
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Optional public sections (Phase 1: visibility foundation). The server only ever returns a section when its owner switched
// "Show on my GamID" ON (and the GamID is published); a hidden section is simply absent from `public_sections`, so there is
// nothing here to hide. This is the MINIMUM presentation needed to verify visible sections; the full public-profile visual
// composition is a separate phase. Everything is rendered as text.
// ---------------------------------------------------------------------------------------------------------------------------
const LEAGUE_APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const LEAGUE_SOURCE_LABELS = { OPGG_TEMPORARY: "OP.GG" };
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
const titleCase = value => `${String(value).charAt(0)}${String(value).slice(1).toLowerCase()}`;

function leagueRankLine(league) {
  if (league.rank_state !== "RANKED" || !league.tier) return "No ranked Solo/Duo rank reported";
  const division = !LEAGUE_APEX_TIERS.has(league.tier) && league.division ? ` ${league.division}` : "";
  const record = Number.isInteger(league.wins) && Number.isInteger(league.losses) ? ` · ${league.wins}W ${league.losses}L` : "";
  return `${titleCase(league.tier)}${division} · ${league.lp} LP${record}`;
}

export function renderPublicSections(panel, sections, duoOptions = null) {
  const blocks = [];
  // My Duo (public-duo.js) leads: it is the GamID's own identity relationship, not an external account
  const duo = duoOptions ? duoSection(sections?.duo, duoOptions) : null;
  if (duo) blocks.push(duo);
  const discord = sections?.discord;
  if (discord && (discord.display_name || discord.username)) {
    const block = node("section", "public-section");
    block.append(node("p", "public-section-label", "DISCORD"), node("strong", "", discord.display_name || `@${discord.username}`));
    if (discord.username && discord.display_name && discord.username !== discord.display_name) block.append(node("span", "public-section-sub", `@${discord.username}`));
    block.append(node("span", "public-chip", "CONNECTED"));
    blocks.push(block);
  }
  // Steam: the account's public persona name as Steam's own player summary returned it (Round 2) - never the SteamID64 - or, before one is stored, a neutral
  // "Steam account". It says the account is connected - nothing about any game.
  const steam = sections?.steam;
  if (steam && typeof steam === "object" && (steam.trust_status === "CONNECTED" || /^[0-9]{17}$/.test(steam.steam_id ?? "") || (typeof steam.persona_name === "string" && steam.persona_name.trim()))) {
    const persona = typeof steam.persona_name === "string" ? steam.persona_name.trim().slice(0, 64) : "";
    const block = node("section", "public-section");
    block.append(node("p", "public-section-label", "STEAM"), node("strong", "", persona || "Steam account"), node("span", "public-chip", "CONNECTED"));
    blocks.push(block);
  }
  const league = sections?.league;
  if (league && league.game_name) {
    const block = node("section", "public-section");
    block.append(node("p", "public-section-label", "LEAGUE OF LEGENDS"), node("strong", "", `${league.game_name}#${league.tag_line} · ${league.platform_id}`));
    // The rank / stat values are their own privacy scope ("Show ranks & stats on my GamID"): while that is OFF the server sends no rank_state at all, so there is
    // nothing to show and NO rank line is drawn (not even "no ranked rank reported" - that would also be a statement about the stats).
    if (league.rank_state) block.append(node("span", "public-section-sub", leagueRankLine(league)));
    block.append(node("span", "public-chip is-caution", "PROTOTYPE / UNVERIFIED"));
    const when = league.updated_at ? new Date(league.updated_at) : null;
    const source = LEAGUE_SOURCE_LABELS[league.data_source] || "a third-party source";
    block.append(node("span", "public-section-sub", `Data: ${source}${when && !Number.isNaN(when.getTime()) ? ` · Updated ${when.toLocaleDateString()}` : ""}`));
    blocks.push(block);
  }
  panel.replaceChildren(...blocks);
  return blocks.length;
}

async function buildConfig(identity) {
  const primaryLabel = catalogLabel(identity.role_catalog, identity.primary_role_key);
  const secondaryLabels = (identity.role_keys || [])
    .filter(key => key !== identity.primary_role_key)
    .map(key => catalogLabel(identity.role_catalog, key));
  const educationLabel = catalogLabel(identity.education_work_catalog, identity.education_work_status);
  const education = [educationLabel, identity.institution, identity.field_of_study].filter(Boolean).join(" · ");
  const avatarUrl = await loadPublicAvatar(identity.avatar_media_reference).catch(() => null);
  const videoUrl = identity.intro_derivative_path ? "pending" : "";
  return {
    publicMode: true,
    videoUrl: videoUrl || "",
    transitionKey: identity.intro_transition_key || "fade",
    avatarUrl: avatarUrl || "",
    displayName: identity.display_name || "Gamer",
    handle: `@${identity.gamid_handle}`,
    primaryRole: primaryLabel,
    secondaryRoles: secondaryLabels,
    education,
    bio: identity.bio || "",
  };
}

// The temporary `?handle=` route (GitHub Pages, via the 404.html client-side redirect) stays the primary source, so its exact prior behavior is unchanged. The
// permanent `/@<handle>` route, served directly (no redirect) by the Phase 1 Cloudflare Worker, carries the handle in the path instead - used only when no query
// handle is present. A malformed percent-encoding in the path never throws: it is simply treated as no handle, same as an empty query.
export function resolveHandle(search, pathname) {
  const params = new URLSearchParams(search);
  const queryHandle = (params.get("handle") || "").trim();
  if (queryHandle) return queryHandle.replace(/^@/, "");
  const match = /^\/@([^/]+)\/?$/.exec(pathname);
  if (!match) return "";
  try { return decodeURIComponent(match[1]).trim().replace(/^@/, ""); } catch { return ""; }
}

async function render() {
  const loading = document.getElementById("loadingState");
  const notFound = document.getElementById("notFoundState");
  const experienceWrap = document.getElementById("experienceWrap");
  const frame = document.getElementById("experienceFrame");
  const replayButton = document.getElementById("replayIntroButton");
  const sectionsPanel = document.getElementById("publicSections");
  const gamesBlock = document.getElementById("publicGames");
  const shell = document.getElementById("publicShell");
  let hasSections = false;
  let hasGames = false;
  let gamesLibrary = null;
  // The owner's PUBLISHED Wall (the published-Wall module), when there is one: once the Intro is over it replaces the profile body (the profile card, sections and My Games);
  // Replay Intro still plays the Intro. Without one, `wall` stays null and every line below behaves exactly as before.
  let wall = null;
  let visitorNav = null;   // Back to @previous + Skip Intro, when the visitor came from another GamID

  // Layout mode. While the Intro plays (and before anything is known) the stage is a full-viewport overlay ("experience"). Once the profile shows, the page becomes
  // ordinary document flow ("flow"): the iframe takes exactly the height the profile inside it reports, so the profile, the provider panel and Replay Intro are simply
  // stacked content and the PAGE scrolls. Without a reported height the overlay is kept (the old behavior), never a guessed height.
  const requestMeasure = () => frame.contentWindow?.postMessage({ type: "gamid-intro-preview-measure" }, location.origin);
  // Entering flow can change the frame's width (a page scrollbar may appear) and so how its text wraps. The profile re-measures on resize by itself; these two bounded
  // re-checks make the result independent of when the browser delivers that resize (fonts and late layout included). A value that did not change sends nothing.
  const layout = createFlowLayout({ shell, frame, root: document.documentElement, scrollToTop: () => scrollTo(0, 0), onEnterFlow: () => { setTimeout(requestMeasure, 250); setTimeout(requestMeasure, 1200); } });

  let frameReady = false;
  let config = null;
  let hasIntro = false;
  let initialSendDone = false;
  let revealed = false;
  let introSource = null, introRequest = 0, latestIntroIdentity = null, introResolving = false;
  const stopIntro = () => { introRequest++; frame.contentWindow?.postMessage({ type: "gamid-intro-preview-stop" }, location.origin); };
  const sendReplay = async () => {
    if (!config) return;
    stopIntro();
    const current = introRequest;
    introResolving = true;
    let source = null;
    try { source = await introSource.resolve(); } catch { /* Signing fails closed; no stale URL fallback. */ }
    if (current !== introRequest || !config) return;
    introResolving = false;
    if (!latestIntroIdentity) {
      introSource.invalidate(); hasIntro = false; config = null;
      wall?.hide(); experienceWrap.hidden = true; sectionsPanel.hidden = true; gamesBlock.hidden = true;
      notFound.hidden = false; loading.hidden = true;
      return;
    }
    config = { ...config, videoUrl: source?.url || "", sourceExpiresAt: source?.expiresAt,
      transitionKey: latestIntroIdentity.intro_transition_key || "fade" };
    hasIntro = Boolean(config.videoUrl);
    frame.contentWindow?.postMessage({ type: "gamid-intro-preview", config }, location.origin);
  };
  const checkIntro = async () => {
    if (document.visibilityState !== "visible" || !introSource || introResolving || !config?.videoUrl || config.videoUrl === "pending") return;
    const current = introRequest;
    const valid = await introSource.isCurrent();
    if (current !== introRequest || !config || introResolving) return;
    if (!valid) {
      stopIntro(); introSource.invalidate(); config.videoUrl = ""; hasIntro = false;
      if (!latestIntroIdentity) { config = null; wall?.hide(); experienceWrap.hidden = true; sectionsPanel.hidden = true; gamesBlock.hidden = true; notFound.hidden = false; }
    }
  };
  addEventListener("focus", checkIntro);
  document.addEventListener("visibilitychange", checkIntro);
  addEventListener("pagehide", () => { stopIntro(); introSource?.invalidate(); });

  const sendInitial = () => { if (initialSendDone || !frameReady || !config) return; initialSendDone = true; sendReplay(); };

  addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "gamid-intro-preview-ready") { frameReady = true; sendInitial(); }
    if (event.data?.type === "gamid-intro-preview-state") {
      // The child only ever broadcasts a state after play() has actually applied a config, so this is
      // the proof (not a guess) that the iframe now shows this identity rather than its raw placeholder markup.
      if (!revealed) { revealed = true; loading.hidden = true; experienceWrap.hidden = false; }
      document.documentElement.classList.add("is-public-live");
      // a hidden (display:none) frame has no layout, so a height measured before the reveal is 0: ask for a fresh measurement now that the stage is showing
      requestMeasure();
      replayButton.hidden = !hasIntro || event.data.state !== "profile";
      sectionsPanel.hidden = !hasSections || event.data.state !== "profile";
      gamesBlock.hidden = !hasGames || event.data.state !== "profile";
      if (event.data.state !== "profile") gamesLibrary?.close();
      layout.setProfileShowing(event.data.state === "profile");
      if (wall) showWall(event.data.state);
      visitorNav?.setIntroState(event.data.state);
    }
    if (event.data?.type === "gamid-intro-preview-height") {
      // the profile reports how tall its content really is (initially, and again whenever wrapping / fonts / content change); flow-layout.js ignores anything but a sane number
      layout.setHeight(event.data.height);
    }
  });
  // the Wall takes the profile's place after the Intro (html.is-public-wall hides the profile frame and makes the Wall ordinary scrolling content), and gives it
  // back while the Intro replays. The frame was asked for hostReveal (no profile card, transparent), so during the Intro's own transition the Wall is already
  // drawn BEHIND it (html.is-public-wall-reveal keeps the transparent frame on top): the transition reveals the Wall - the old profile is never on screen.
  function showWall(state) {
    const root = document.documentElement;
    if (state === "profile" || state === "transitioning") {
      sectionsPanel.hidden = true; gamesBlock.hidden = true;   // the Wall IS the profile body (the sections / My Games are what it replaces)
      if (!wall.showing) { root.classList.add("is-public-wall"); wall.show(); scrollTo(0, 0); }
      root.classList.toggle("is-public-wall-reveal", state === "transitioning");
      experienceWrap.hidden = state === "profile";
    } else if (wall.showing) { wall.hide(); root.classList.remove("is-public-wall", "is-public-wall-reveal"); experienceWrap.hidden = false; }
  }
  frame.addEventListener("load", () => { frameReady = true; sendInitial(); });
  replayButton.addEventListener("click", layout.enterExperience);   // the Intro needs the full viewport again (registered first, so it runs before the config is sent)
  replayButton.addEventListener("click", sendReplay);

  const params = new URLSearchParams(location.search);
  const handle = resolveHandle(location.search, location.pathname);
  const qrToken = (params.get("qr") || "").trim();

  let identity = null;
  if (handle) {
    try { identity = await getPublicIdentity(handle); } catch { identity = null; }
  } else if (qrToken) {
    try { identity = await getPublicIdentityByQr(qrToken); } catch { identity = null; }
  }

  // Came from another GamID (a Duo link carries ?from=<handle>): Back to it, and - while this GamID's Intro plays - Skip Intro (visitor-nav.js), above everything.
  // ... or from a Crew Wall (?crew=<id>): Back to that Crew (its name comes from the public Crew Wall; until then / if it is not public, "Back to Crew"). A `from`
  // beside ?crew= is the Personal GamID the visitor entered that Crew from: it rides along on Back to Crew, so the Crew Wall still offers "Back to @<from>".
  const fromCrew = crewIdFromSearch(location.search);
  visitorNav = createVisitorNav({ crew: fromCrew, from: fromCrew ? backHandle(location.search, "") : backHandle(location.search, identity?.gamid_handle ?? handle), pathname: location.pathname, referrer: document.referrer, origin: location.origin, history,
    onSkip: () => frame.contentWindow?.postMessage({ type: "gamid-intro-preview-skip" }, location.origin) });
  if (visitorNav) document.body.append(visitorNav.element);
  if (visitorNav && fromCrew) getPublicCrewWall(fromCrew).then(view => visitorNav.setBackName(view?.crew_name), () => {});

  if (!identity) { loading.hidden = true; notFound.hidden = false; return; }
  introSource = createIntroSourceResolver({
    baseUrl: SUPABASE_URL,
    current: async () => {
      latestIntroIdentity = null;
      latestIntroIdentity = await getPublicIdentity(identity.gamid_handle);
      return latestIntroIdentity?.intro_derivative_path ? { key: identity.gamid_handle, path: latestIntroIdentity.intro_derivative_path } : null;
    },
    sign: signPublicIntroMedia,
  });

  // My Socials: shown on the public profile even when the owner has no Wall (a published Wall, when there is one, replaces this whole body); a failed read shows none
  const socialLinks = await getPublicSocialLinks(identity.gamid_handle).catch(() => []);
  hasSections = renderPublicSections(sectionsPanel, identity.public_sections, { ownerHandle: identity.gamid_handle, pathname: location.pathname, loadAvatar: loadPublicAvatar }) > 0;
  hasSections = prependPublicSocials(sectionsPanel, socialLinks) || hasSections;
  // My Games: the server sends the section only when the owner switched it ON (and there is at least one game): the first six games + the true count. The full
  // library, its search and Game Details load through the same public function, page by page, only when a visitor asks for them.
  const gamesPreview = normalizeLibrary(identity.public_sections?.my_games, LEAGUE_SOURCE_LABELS);
  if (gamesPreview && gamesPreview.libraryCount > 0 && gamesPreview.games.length > 0) {
    gamesLibrary = createGamesLibrary({
      element: node, handle: identity.gamid_handle, api: { getPublicMyGames }, libraryCount: gamesPreview.libraryCount, sourceLabels: LEAGUE_SOURCE_LABELS,
      mount: modal => document.body.append(modal),
      lockScroll: locked => document.documentElement.classList.toggle("is-games-open", locked),
    });
    renderGamesPreview({ element: node, container: gamesBlock, library: gamesPreview, onOpenGame: (game, opener) => gamesLibrary.openGame(game, opener), onViewAll: opener => gamesLibrary.openLibrary(opener) });
    hasGames = true;
  }
  // the published Wall is looked up alongside the Intro config (one anonymous call); its media and data load while the Intro plays
  const [built, published] = await Promise.all([buildConfig(identity), getPublicWall(identity.gamid_handle).catch(() => null)]);
  if (published?.document) {
    const host = node("section", "public-wall");
    host.id = "publicWall";
    host.setAttribute("aria-label", "GamID Wall");
    host.hidden = true;
    replayButton.before(host);
    wall = createPublicWallView({ host, prepared: preparePublicWall(published, identity.gamid_handle).catch(() => null), handle: identity.gamid_handle });
  }
  // with a published Wall the Intro frame shows no profile card and stays transparent (hostReveal): its transition reveals the Wall behind it
  config = wall ? { ...built, hostReveal: true } : built;
  if (visitorNav) config = { ...config, hostSkip: true };   // the frame hides its own Skip: the visitor's Skip Intro sits beside Back
  hasIntro = Boolean(config.videoUrl);
  sendInitial();
}

render();
