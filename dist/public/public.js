import { getPublicIdentity, getPublicIdentityByQr, loadPublicAvatar, loadPublicIntroMedia } from "../account/supabase-client.js";
import { createFlowLayout } from "../flow-layout.js";

const catalogLabel = (catalog, key) => catalog?.find(item => item.key === key)?.label || key || "";

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

export function renderPublicSections(panel, sections) {
  const blocks = [];
  const discord = sections?.discord;
  if (discord && (discord.display_name || discord.username)) {
    const block = node("section", "public-section");
    block.append(node("p", "public-section-label", "DISCORD"), node("strong", "", discord.display_name || `@${discord.username}`));
    if (discord.username && discord.display_name && discord.username !== discord.display_name) block.append(node("span", "public-section-sub", `@${discord.username}`));
    block.append(node("span", "public-chip", "CONNECTED"));
    blocks.push(block);
  }
  // Steam: only the SteamID64 the owner chose to show, as text. It says the account is connected - nothing about any game.
  const steam = sections?.steam;
  if (steam && typeof steam.steam_id === "string" && /^[0-9]{17}$/.test(steam.steam_id)) {
    const block = node("section", "public-section");
    block.append(node("p", "public-section-label", "STEAM"), node("strong", "", steam.steam_id), node("span", "public-section-sub", "SteamID64"), node("span", "public-chip", "CONNECTED"));
    blocks.push(block);
  }
  const league = sections?.league;
  if (league && league.game_name) {
    const block = node("section", "public-section");
    block.append(node("p", "public-section-label", "LEAGUE OF LEGENDS"), node("strong", "", `${league.game_name}#${league.tag_line} · ${league.platform_id}`), node("span", "public-section-sub", leagueRankLine(league)));
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
  const [avatarUrl, videoUrl] = await Promise.all([
    loadPublicAvatar(identity.avatar_media_reference).catch(() => null),
    loadPublicIntroMedia(identity.intro_derivative_path).catch(() => null),
  ]);
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

async function render() {
  const loading = document.getElementById("loadingState");
  const notFound = document.getElementById("notFoundState");
  const experienceWrap = document.getElementById("experienceWrap");
  const frame = document.getElementById("experienceFrame");
  const replayButton = document.getElementById("replayIntroButton");
  const sectionsPanel = document.getElementById("publicSections");
  const shell = document.getElementById("publicShell");
  let hasSections = false;

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
  const sendReplay = () => { if (config) frame.contentWindow?.postMessage({ type: "gamid-intro-preview", config }, location.origin); };
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
      layout.setProfileShowing(event.data.state === "profile");
    }
    if (event.data?.type === "gamid-intro-preview-height") {
      // the profile reports how tall its content really is (initially, and again whenever wrapping / fonts / content change); flow-layout.js ignores anything but a sane number
      layout.setHeight(event.data.height);
    }
  });
  frame.addEventListener("load", () => { frameReady = true; sendInitial(); });
  replayButton.addEventListener("click", layout.enterExperience);   // the Intro needs the full viewport again (registered first, so it runs before the config is sent)
  replayButton.addEventListener("click", sendReplay);

  const params = new URLSearchParams(location.search);
  const handle = (params.get("handle") || "").trim().replace(/^@/, "");
  const qrToken = (params.get("qr") || "").trim();

  let identity = null;
  if (handle) {
    try { identity = await getPublicIdentity(handle); } catch { identity = null; }
  } else if (qrToken) {
    try { identity = await getPublicIdentityByQr(qrToken); } catch { identity = null; }
  }

  if (!identity) { loading.hidden = true; notFound.hidden = false; return; }

  hasSections = renderPublicSections(sectionsPanel, identity.public_sections) > 0;
  config = await buildConfig(identity);
  hasIntro = Boolean(config.videoUrl);
  sendInitial();
}

render();
