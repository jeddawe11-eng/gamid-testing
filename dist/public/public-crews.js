// MY CREW on the Personal GamID (public.js). The server's public identity carries a 'crews' section (20261003234309_personal_gamid_crews) ONLY for a PUBLIC GamID's
// ACTIVE memberships in existing Crews whose Crew Wall is PUBLISHED - automatically, there is no switch. Each entry: crew_id, crew_name, game, role, member_count.
// This module only presents what the server sent (text only) and links each Crew to its published Crew Wall (/crew/?c=<id>), where member cards lead on to the
// members' GamIDs with "Back to <Crew>". A Crew of every game the person plays appears (one Crew per game). Anything malformed is simply not shown.
import { crewWallHref } from "./identity-link.js";

const CREW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const plain = (value, max) => (typeof value === "string" && value.trim() && !/[<>\u0000-\u001f]/.test(value) ? value.trim().slice(0, max) : "");

// the server section -> clean entries
export function publicCrews(section) {
  return (Array.isArray(section) ? section : [])
    .map(row => ({
      id: typeof row?.crew_id === "string" ? row.crew_id.toLowerCase() : "", name: plain(row?.crew_name, 40), gameName: plain(row?.game_name, 120) || plain(row?.game_key, 64),
      role: row?.role === "OWNER" ? "OWNER" : row?.role === "MEMBER" ? "MEMBER" : "", members: Number.isInteger(row?.member_count) && row.member_count > 0 ? row.member_count : null,
    }))
    .filter(crew => CREW_ID.test(crew.id) && crew.name && crew.gameName && crew.role);
}

export function crewsSection(section, { pathname = "/", doc = globalThis.document } = {}) {
  const crews = publicCrews(section);
  if (!crews.length || !doc) return null;
  const node = (tag, className, text) => { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const block = node("section", "public-crews");
  block.setAttribute("aria-label", "My Crew");
  block.hidden = true;
  block.append(node("p", "public-section-label", crews.length > 1 ? "MY CREWS" : "MY CREW"));
  const list = node("div", "public-crews-list");
  for (const crew of crews) {
    const href = crewWallHref(crew.id, { pathname });
    if (!href) continue;
    const card = node("a", "public-crew-card");
    card.href = href;
    card.setAttribute("aria-label", `My Crew for ${crew.gameName}: ${crew.name}, ${crew.role === "OWNER" ? "owner" : "member"}${crew.members ? `, ${crew.members} members` : ""}. Open the Crew Wall`);
    const copy = node("span", "public-crew-copy");
    copy.append(node("span", "public-crew-eyebrow", "MY CREW"), node("span", "public-crew-game", crew.gameName.toUpperCase()), node("strong", "public-crew-name", crew.name));
    const meta = node("span", "public-crew-meta");
    meta.append(node("span", `public-crew-role${crew.role === "OWNER" ? " is-owner" : ""}`, crew.role));
    if (crew.members) meta.append(node("span", "public-crew-count", `${crew.members} member${crew.members === 1 ? "" : "s"}`));
    copy.append(meta);
    card.append(copy, node("span", "public-crew-chevron", "›"));
    list.append(card);
  }
  block.append(list);
  return list.children?.length === 0 ? null : block;
}
