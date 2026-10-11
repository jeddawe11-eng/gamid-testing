// MY CREWS - the consolidated view the sidebar's My Crews entry opens (Classic Profile consolidated update, Mazen 2026-10-11). One large card per Crew the
// server lists for this PUBLIC GamID (get_public_crews: the same Crews, same order, as the public 'crews' section - ACTIVE membership, Crew Wall PUBLISHED), with
// the game's artwork as its background when the provisional artwork source has a reliable match (game-artwork.js; otherwise a calm gradient and the game's
// initials), the Crew's name, the game, the member count and up to five PUBLIC members' avatars. Each card is one link to that existing Crew Wall
// (/crew/?c=<id>&from=<handle>) - there is no second Crew Wall. A failed read still shows the Crews from the profile's own section (without avatars).
import { normalizeCrews, crewWallHref, normalizeHandle, isHandle } from "./identity-link.js";
import { initialsOf } from "./public-desktop.js";

export const MEMBER_AVATARS_SHOWN = 5;
const tone = text => { let hash = 0; for (const ch of String(text)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0; return String(hash % 6); };
const plain = (value, max) => (typeof value === "string" && value.trim() && !/[<>\u0000-\u001f]/.test(value) ? value.trim().slice(0, max) : "");

// get_public_crews rows -> [{ id, name, gameKey, gameName, members, people: [{ handle, name, avatarPath }] }]; anything malformed is dropped
export function normalizeCrewDirectory(rows) {
  const base = normalizeCrews(rows);
  const byId = new Map((Array.isArray(rows) ? rows : []).map(row => [String(row?.crew_id ?? "").toLowerCase(), row]));
  return base.map(crew => {
    const raw = byId.get(crew.id) || {};
    const people = (Array.isArray(raw.members) ? raw.members : []).map(m => {
      const handle = normalizeHandle(m?.handle);
      if (!isHandle(handle)) return null;
      const avatarPath = typeof m?.avatar_media_reference === "string" && m.avatar_media_reference.trim() ? m.avatar_media_reference.trim() : null;
      return { handle, name: plain(m?.display_name, 60) || `@${handle}`, avatarPath };
    }).filter(Boolean);
    return { ...crew, gameKey: typeof raw.game_key === "string" ? raw.game_key : "", people };
  });
}

export function crewCard(h, crew, { ownerHandle, pathname, loadAvatar }) {
  const card = h("a", "crew-card");
  card.href = crewWallHref(crew.id, { pathname, from: ownerHandle });
  const memberText = crew.members ? `${crew.members} ${crew.members === 1 ? "member" : "members"}` : "";
  card.setAttribute("aria-label", `${crew.name}, ${crew.gameName}${memberText ? `, ${memberText}` : ""}. Open the Crew Wall`);
  const bg = h("span", "crew-card-bg"); bg.setAttribute("aria-hidden", "true"); bg.setAttribute("data-tone", tone(crew.gameName));
  if (crew.gameKey) bg.setAttribute("data-game-bg", crew.gameKey);
  const shade = h("span", "crew-card-shade"); shade.setAttribute("aria-hidden", "true");
  const body = h("span", "crew-card-body");
  const icon = h("span", "game-thumb crew-card-icon"); icon.setAttribute("aria-hidden", "true"); icon.setAttribute("data-initials", initialsOf(crew.gameName)); icon.setAttribute("data-tone", tone(crew.gameName));
  if (crew.gameKey) icon.setAttribute("data-game-key", crew.gameKey);
  const text = h("span", "crew-card-text");
  text.append(h("strong", "crew-card-name", crew.name), h("span", "crew-card-game", crew.gameName));
  if (memberText) text.append(h("span", "crew-card-count", memberText));
  body.append(icon, text);
  const people = h("span", "crew-card-members"); people.setAttribute("aria-hidden", "true");
  for (const person of crew.people.slice(0, MEMBER_AVATARS_SHOWN)) {
    const face = h("span", "crew-card-face", person.name.replace(/^@/, "").charAt(0).toUpperCase() || "G");
    face.title = person.name;
    if (person.avatarPath && typeof loadAvatar === "function") {
      Promise.resolve(loadAvatar(person.avatarPath)).then(url => {
        if (typeof url !== "string" || !/^blob:/.test(url)) return;
        const img = h("img"); img.alt = ""; img.src = url; face.replaceChildren(img);
      }, () => {});
    }
    people.append(face);
  }
  const extra = Math.max(0, (crew.members || 0) - Math.min(crew.people.length, MEMBER_AVATARS_SHOWN));
  if (extra > 0 && crew.people.length) people.append(h("span", "crew-card-face is-more", `+${extra}`));
  card.append(bg, shade, body, people);
  return card;
}

export function createCrewsDirectory({ doc = globalThis.document, panel, handle, pathname = "/", section, api, loadAvatar, onRendered = () => {} }) {
  const h = (tag, cls, text) => { const el = doc.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
  let crews = normalizeCrewDirectory(section).map(crew => ({ ...crew, people: [] }));
  let loaded = false;
  const paint = () => {
    const grid = h("div", "crew-grid");
    grid.setAttribute("data-count", String(Math.min(crews.length, 3)));   // CP-01: columns per desktop row (public.css)
    grid.append(...crews.map(crew => crewCard(h, crew, { ownerHandle: handle, pathname, loadAvatar })));
    return grid;
  };
  async function open(opener) {
    const label = `MY CREWS · ${crews.length}`;
    panel.open(label, paint(), opener);
    onRendered(panel.body);
    if (loaded) return;
    try {
      const rows = normalizeCrewDirectory(await api.getPublicCrews(handle));
      loaded = true;
      if (rows.length) crews = rows;
      if (panel.isOpen()) { panel.open(`MY CREWS · ${crews.length}`, paint(), opener); onRendered(panel.body); }
    } catch { /* the profile's own section stays shown */ }
  }
  return { open, crews: () => crews };
}
