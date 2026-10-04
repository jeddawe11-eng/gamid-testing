// GamID-to-GamID identity navigation (My Duo V1; written to serve future identity relationships too). Pure helpers, no network and no page code, so the public page,
// the Wall painter and the account page share ONE definition of:
//   - a GamID handle (the database's own format: entities_handle_format),
//   - the public "duo" section the server sends (get_public_identity -> public_sections.duo, present only when the Duo is accepted, shown by its owner and published),
//   - the address of another GamID's public page, carrying `from` so that page can offer "Back to @<from>",
//   - the relationship badge (a linked-pair mark - deliberately NOT a check mark: it says only that the relationship was mutually accepted, never that an identity or
//     provider account was verified).
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_]{1,22}[a-z0-9]$/;
export const isHandle = value => typeof value === "string" && HANDLE_PATTERN.test(value) && !value.includes("__");
export const normalizeHandle = value => (typeof value === "string" ? value.trim().replace(/^@/, "").toLowerCase() : "");

export const RELATIONSHIP_LABELS = Object.freeze({ duo: "MY DUO", crews: "MY CREW" });
export const RELATIONSHIP_BADGE_TEXT = Object.freeze({ duo: "Mutual Duo" });

const clean = (value, max) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "");

// The public Duo section -> { handle, displayName, avatarPath } or null (anything malformed is simply not shown).
export function normalizeDuo(section) {
  if (!section || typeof section !== "object") return null;
  const handle = normalizeHandle(section.gamid_handle);
  if (!isHandle(handle)) return null;
  const avatarPath = typeof section.avatar_media_reference === "string" && section.avatar_media_reference.trim() ? section.avatar_media_reference.trim() : null;
  return { handle, displayName: clean(section.display_name, 60) || `@${handle}`, avatarPath };
}

// The public page of `handle`, on the route the current page itself uses: the permanent /@<handle> route, or (the temporary GitHub Pages route) the public page with
// ?handle=. `from` (a valid handle, never the destination itself) lets the destination offer a Back control. Always a same-origin path - never an external address.
export function gamidHref(handle, { from = "", pathname = "/" } = {}) {
  const target = normalizeHandle(handle);
  if (!isHandle(target)) return null;
  const origin = normalizeHandle(from);
  const back = isHandle(origin) && origin !== target ? origin : "";
  if (/\/public\/(index\.html)?$/.test(pathname)) {
    const params = new URLSearchParams({ handle: target });
    if (back) params.set("from", back);
    return `${pathname}?${params}`;
  }
  return `/@${target}${back ? `?from=${encodeURIComponent(back)}` : ""}`;
}

// My Crew: a member card on a Crew Wall links to the member's GamID with ?crew=<crew id>; that page returns to the Crew Wall, /crew/?c=<id> (the permanent route; on
// the temporary GitHub Pages route, the crew/ folder beside public/). Only a well-formed id is ever used.
const CREW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const crewIdFromSearch = search => { const id = String(new URLSearchParams(search).get("crew") ?? "").trim().toLowerCase(); return CREW_ID.test(id) ? id : ""; };
export function crewWallHref(crewId, { pathname = "/" } = {}) {
  if (!CREW_ID.test(String(crewId))) return null;
  const base = /\/public\/(index\.html)?$/.test(pathname) ? pathname.replace(/public\/(index\.html)?$/, "") : "/";
  return `${base}crew/?c=${crewId}`;
}

// The public 'crews' section the server sends (get_public_identity -> public_sections.crews, 20261003234309_personal_gamid_crews): present ONLY for a PUBLIC GamID's
// ACTIVE memberships in existing Crews whose Crew Wall is PUBLISHED - automatically, there is no switch. -> [{ id, name, gameName, role, members }], text only;
// anything malformed is simply not shown. Drawn by the Wall's My Crew GamID block, which the owner places on their Wall.
const plainText = (value, max) => (typeof value === "string" && value.trim() && !/[<>\u0000-\u001f]/.test(value) ? value.trim().slice(0, max) : "");
export function normalizeCrews(section) {
  return (Array.isArray(section) ? section : [])
    .map(row => ({
      id: typeof row?.crew_id === "string" ? row.crew_id.toLowerCase() : "", name: plainText(row?.crew_name, 40), gameName: plainText(row?.game_name, 120) || plainText(row?.game_key, 64),
      role: row?.role === "OWNER" ? "OWNER" : row?.role === "MEMBER" ? "MEMBER" : "", members: Number.isInteger(row?.member_count) && row.member_count > 0 ? row.member_count : null,
    }))
    .filter(crew => CREW_ID.test(crew.id) && crew.name && crew.gameName && crew.role);
}

// The GamID a visitor came from (the `from` the link above added), or "" - ignored when it is malformed or names the page itself.
export function backHandle(search, currentHandle) {
  const from = normalizeHandle(new URLSearchParams(search).get("from") ?? "");
  return isHandle(from) && from !== normalizeHandle(currentHandle) ? from : "";
}

// Back to the GamID the visitor came from: when the previous history entry IS that page (same origin, the address it linked from), go back to it (its scroll position
// and state are kept); otherwise open it.
export function goBack(event, { href, referrer = "", origin = "", history = null } = {}) {
  let previous = null;
  try { previous = referrer ? new URL(referrer) : null; } catch { previous = null; }
  if (!href || !previous || previous.origin !== origin || !history || history.length < 2) return false;
  const wanted = new URL(href, origin);
  // a Crew Wall: the previous page IS that Crew Wall when it is /crew/ with the same ?c= (history.back keeps the stage and scroll position)
  if (/\/crew\/(index\.html)?$/.test(wanted.pathname)) {
    const same = /\/crew\/(index\.html)?$/.test(previous.pathname) && previous.searchParams.get("c") === wanted.searchParams.get("c") && Boolean(wanted.searchParams.get("c"));
    if (!same) return false;
    event?.preventDefault?.();
    history.back();
    return true;
  }
  const previousHandle = /^\/@([^/]+)\/?$/.exec(previous.pathname)?.[1] ?? new URLSearchParams(previous.search).get("handle") ?? "";
  const wantedHandle = /^\/@([^/]+)\/?$/.exec(wanted.pathname)?.[1] ?? new URLSearchParams(wanted.search).get("handle") ?? "";
  if (!previousHandle || normalizeHandle(decodeURIComponent(previousHandle)) !== normalizeHandle(decodeURIComponent(wantedHandle))) return false;
  event?.preventDefault?.();
  history.back();
  return true;
}

// The relationship badge: two linked rings (SVG, aria-hidden) + its plain-language label. `createNode` builds HTML elements; the SVG is built in the SVG namespace.
export function relationshipBadge(kind, createNode, doc = globalThis.document) {
  const badge = createNode("span");
  badge.className = `identity-rel-badge is-${kind}`;
  badge.setAttribute("title", "Mutually accepted on GamID");
  if (doc?.createElementNS) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = doc.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    for (const cx of [8, 16]) {
      const ring = doc.createElementNS(ns, "circle");
      ring.setAttribute("cx", String(cx)); ring.setAttribute("cy", "8"); ring.setAttribute("r", "5.5");
      ring.setAttribute("fill", "none"); ring.setAttribute("stroke", "currentColor"); ring.setAttribute("stroke-width", "2");
      svg.append(ring);
    }
    badge.append(svg);
  }
  const text = createNode("span");
  text.className = "identity-rel-badge-text";
  text.textContent = RELATIONSHIP_BADGE_TEXT[kind] ?? "Mutual";
  badge.append(text);
  return badge;
}
