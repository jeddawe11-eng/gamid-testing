// The public Crew Wall page: /crew/?c=<crew id>. A visitor gets ONLY a published Wall (get_public_crew_wall, anonymous); the Crew's owner, signed in, also gets a
// preview of an unpublished Wall (get_crew_wall_preview, owner-only on the server). Every member card is filled from that member's own public GamID through the
// accepted public identity function (get_public_identity), so their visibility switches apply and values are current. Tapping a card opens their real GamID with
// ?crew=<id>; that page offers "Back to <Crew>" + "Skip Intro". The scroll position is remembered for this Crew so Back returns to the same place.
import { getPublicCrewWall, getCrewWallPreview, getPublicIdentity, loadPublicAvatar, restoreSession } from "../account/supabase-client.js";
import { crewWallModel, paintCrewWall, CREW_UUID } from "./crew-wall.js";

export const SCROLL_KEY = crewId => `gamid.crewWall.scroll.${crewId}`;
const LEAGUE = "league_of_legends";
const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const title = value => `${String(value).charAt(0)}${String(value).slice(1).toLowerCase()}`;
const text = (value, max = 80) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "");

export const crewIdFromSearch = search => { const id = (new URLSearchParams(search).get("c") || "").trim().toLowerCase(); return CREW_UUID.test(id) ? id : ""; };

// one member's PUBLIC data, from the public identity response only (null when their GamID is not public)
export function publicPerson(identity, gameKey, avatarUrl = null) {
  if (!identity) return null;
  const catalog = new Map((Array.isArray(identity.role_catalog) ? identity.role_catalog : []).map(role => [role.key, role.label]));
  const role = identity.primary_role_key ? catalog.get(identity.primary_role_key) || "" : "";
  let gameLine = "";
  const league = identity.public_sections?.league;
  if (gameKey === LEAGUE && league && text(league.game_name)) {   // the Crew's game: only what this member made public on their GamID (rank only when their stats are public)
    const rank = league.rank_state === "RANKED" && league.tier ? ` · ${title(league.tier)}${!APEX.has(league.tier) && league.division ? ` ${league.division}` : ""}` : "";
    gameLine = `${text(league.game_name)}${text(league.tag_line, 10) ? `#${text(league.tag_line, 10)}` : ""}${rank}`;
  }
  return { displayName: text(identity.display_name, 60), role, gameLine, avatarUrl };
}

async function resolvePeople(model) {
  const people = new Map();
  await Promise.all(model.cards.filter(card => !card.hidden).map(async card => {
    let identity = null;
    try { identity = await getPublicIdentity(card.handle); } catch { identity = null; }
    let avatarUrl = null;
    if (identity?.avatar_media_reference) { try { avatarUrl = await loadPublicAvatar(identity.avatar_media_reference); } catch { avatarUrl = null; } }
    const person = publicPerson(identity, model.gameKey, avatarUrl);
    if (person) people.set(card.handle, person);
  }));
  return people;
}

async function main() {
  const crewId = crewIdFromSearch(location.search);
  const loading = document.getElementById("crewLoading"), missing = document.getElementById("crewMissing"), host = document.getElementById("crewWall"), banner = document.getElementById("crewPreviewBanner");
  const show = state => { loading.hidden = state !== "loading"; missing.hidden = state !== "missing"; host.hidden = state !== "wall"; };
  if (!crewId) { show("missing"); return; }

  let model = null, people = new Map(), preview = false, paintedWidth = 0;
  async function read() {
    let view = null;
    try { view = await getPublicCrewWall(crewId); } catch { view = null; }
    preview = false;
    if (!view) {   // not published: the signed-in owner may preview it (the server refuses everyone else)
      try { await restoreSession(); view = await getCrewWallPreview(crewId); preview = Boolean(view); } catch { view = null; }
    }
    model = crewWallModel(view);
    people = model ? await resolvePeople(model) : new Map();
  }
  // the content width of the page column (its padding excluded), so a stage never overflows the screen
  const width = () => { const shell = document.getElementById("crewShell"); const style = getComputedStyle(shell); const inner = shell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight); return Math.max(280, Math.min(900, Math.floor(inner || innerWidth - 32))); };
  function paint() {
    if (!model) { show("missing"); banner.hidden = true; return; }
    document.title = `${model.crewName} · ${model.gameName} · GamID Crew`;
    banner.hidden = !preview;
    show("wall");
    paintedWidth = width();
    paintCrewWall(host, model, people, {
      width: paintedWidth, preview,
      cardHref: handle => `${new URL(`../@${handle}`, location.href).pathname}?crew=${encodeURIComponent(model.crewId)}`,
    });
    for (const link of host.querySelectorAll("a.crew-card")) link.addEventListener("click", () => { try { sessionStorage.setItem(SCROLL_KEY(crewId), String(scrollY)); } catch { /* storage off: Back still works */ } });
  }

  await read();
  paint();
  // returning from a member's GamID: restore where the visitor was (the browser often does it already; this covers a fresh load of the Crew Wall)
  try { const saved = Number(sessionStorage.getItem(SCROLL_KEY(crewId))); if (saved > 0) requestAnimationFrame(() => scrollTo(0, saved)); } catch { /* ignore */ }
  let resizeTimer;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (model && Math.abs(width() - paintedWidth) > 1) paint(); }, 150); });
  // coming back to the tab re-reads the Wall once (a member removed meanwhile disappears) - an event, not polling
  document.addEventListener("visibilitychange", async () => { if (document.visibilityState === "visible") { await read(); paint(); } });
  addEventListener("pageshow", async event => { if (event.persisted) { await read(); paint(); } });
}

if (typeof document !== "undefined" && document.getElementById("crewShell")) main();
