// The Crew Mini Wall renderer (20261003120000_crew_wall.sql). A Crew Wall is stored as a small typed model - stages + which ACTIVE members are placed where - never as a
// free-form Wall document. Here that model becomes an ordinary Wall document at render time and is painted by the ACCEPTED Wall engine (wall-kit/paint.js
// paintDocument: stages, the one responsive scale, backgrounds). The engine is not modified: two element types are registered in THIS module only (so the personal
// Wall editor, which never imports it, never learns them), the engine paints each as an empty positioned box (data-el = element id), and this module fills those boxes.
//
// Member cards show ONLY what that member's own public GamID already shows (resolved live by the page through get_public_identity), never a stored copy: avatar,
// display name, @handle, primary role, and the Crew game's public section when that member made it public. A card links to the member's real GamID with ?crew=<id>,
// so their page offers "Back to <Crew>" + "Skip Intro" (public/visitor-nav.js).
import { elementRegistry } from "../wall/elements.js";
import { isPlainObject } from "../wall/fields.js";
import { paintDocument } from "../wall-kit/paint.js";
import { markInteractive } from "../wall-kit/interaction.js";
import { isHandle, normalizeHandle } from "../public/identity-link.js";

export const CREW_CANVAS_WIDTH = 1000;
export const CREW_CANVAS_MIN_HEIGHT = 1000;   // a Crew stage is as tall as its cards need (at least this), not the personal Wall's 9:16 artboard
export const CARD = Object.freeze({ width: 440, height: 250, gap: 40, margin: 40, top: 360, columns: 2 });
export const CREW_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const onlyKeys = (payload, keys) => isPlainObject(payload) && Object.keys(payload).every(key => keys.includes(key));
if (!elementRegistry.get("crewTitle")) {
  elementRegistry.register("crewTitle", {
    validatePayload: payload => (onlyKeys(payload, ["stage"]) && Number.isInteger(payload.stage) && payload.stage >= 1 && payload.stage <= 20 ? [] : ["INVALID_CREW_TITLE"]),
    render: payload => ({ kind: "crewTitle", stage: payload.stage }),
  });
  elementRegistry.register("crewMember", {
    validatePayload: payload => (onlyKeys(payload, ["handle"]) && isHandle(payload.handle) ? [] : ["INVALID_CREW_MEMBER"]),
    render: payload => ({ kind: "crewMember", handle: payload.handle }),
  });
}

// the server's view (get_public_crew_wall / get_crew_wall_preview) -> a clean model; anything malformed is dropped
export function crewWallModel(view) {
  if (!isPlainObject(view) || typeof view.crew_id !== "string" || !CREW_UUID.test(view.crew_id)) return null;
  const stageCount = Math.min(Math.max(Number.parseInt(view.stage_count, 10) || 1, 1), 20);
  const cards = (Array.isArray(view.cards) ? view.cards : [])
    .map(card => ({ handle: normalizeHandle(card?.handle), stage: Number(card?.stage), position: Number(card?.position), owner: card?.role === "OWNER", hidden: card?.public === false }))
    .filter(card => isHandle(card.handle) && Number.isInteger(card.stage) && card.stage >= 1 && card.stage <= stageCount && Number.isInteger(card.position))
    .sort((a, b) => a.stage - b.stage || a.position - b.position);
  const text = (value, max) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "");
  return {
    crewId: view.crew_id, crewName: text(view.crew_name, 40) || "Crew", gameKey: text(view.game_key, 64), gameName: text(view.game_name, 120) || "Game",
    accent: typeof view.accent_color === "string" && /^#[0-9a-fA-F]{6}$/.test(view.accent_color) ? view.accent_color : "#3d2a8a",
    stageCount, cards, published: view.published === true, memberCount: Number(view.member_count) || 0,
    ownerHandle: isHandle(normalizeHandle(view.owner_handle)) ? normalizeHandle(view.owner_handle) : "",
  };
}

// the model -> a valid Wall document (validated by the Wall core like any other): a title on every stage, member cards in a two-column grid in their saved order
export function buildCrewWallDocument(model) {
  const perStage = Array.from({ length: model.stageCount }, (_, index) => model.cards.filter(card => card.stage === index + 1));
  const rows = Math.max(1, ...perStage.map(cards => Math.ceil(cards.length / CARD.columns)));
  const height = Math.max(CREW_CANVAS_MIN_HEIGHT, CARD.top + rows * (CARD.height + CARD.gap) + CARD.margin);
  const stages = perStage.map((cards, index) => ({
    id: `s${index + 1}`,
    elements: [
      { id: `t${index + 1}`, type: "crewTitle", x: CARD.margin, y: CARD.margin, width: CREW_CANVAS_WIDTH - 2 * CARD.margin, height: CARD.top - 2 * CARD.margin, z: 1, payload: { stage: index + 1 } },
      ...cards.map((card, at) => ({
        id: `m-${card.handle}`, type: "crewMember", z: 2,
        x: CARD.margin + (at % CARD.columns) * (CARD.width + CARD.gap), y: CARD.top + Math.floor(at / CARD.columns) * (CARD.height + CARD.gap),
        width: CARD.width, height: CARD.height, payload: { handle: card.handle },
      })),
    ],
  }));
  return { schemaVersion: 1, canvas: { width: CREW_CANVAS_WIDTH, height }, background: { kind: "gradient", from: model.accent, to: "#07060b", angle: 165 }, stages };
}

// paints the Crew Wall into `host` at `width` px. `people` maps @handle -> the member's PUBLIC data (resolved by the page); `cardHref(handle)` gives the link (view
// mode) or null (an owner preview of a hidden member).
export function paintCrewWall(host, model, people, { width, cardHref = () => null, doc = globalThis.document, preview = false } = {}) {
  const make = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const painted = paintDocument(buildCrewWallDocument(model), width, tag => doc.createElement(tag), { mode: "view" });
  if (!painted.ok) return { ok: false, errors: painted.errors };
  const scale = width / CREW_CANVAS_WIDTH;
  const byHandle = new Map(model.cards.map(card => [card.handle, card]));
  painted.stages.forEach((stage, index) => {
    stage.classList.add("crew-stage");
    stage.setAttribute("id", `crew-stage-${index + 1}`);
    for (const node of stage.querySelectorAll("[data-el]")) {
      const id = node.getAttribute("data-el");
      node.style.setProperty("font-size", `${Math.round(26 * scale * 100) / 100}px`);
      if (id.startsWith("t")) node.append(titleBlock(model, index + 1, make));
      else if (id.startsWith("m-")) node.append(memberCard(byHandle.get(id.slice(2)), people.get(id.slice(2)), model, make, cardHref, preview));
    }
  });
  const column = make("div", "crew-wall-column");
  column.style.setProperty("width", `${width}px`);
  column.append(...painted.stages);
  host.replaceChildren(column);
  return { ok: true };
}

function titleBlock(model, stage, make) {
  const box = make("div", "crew-title");
  const game = make("p", "crew-title-game", model.gameName.toUpperCase());
  const name = make("h1", "crew-title-name", model.crewName);
  const meta = make("p", "crew-title-meta", `${model.memberCount} member${model.memberCount === 1 ? "" : "s"} · Crew${model.stageCount > 1 ? ` · Stage ${stage} / ${model.stageCount}` : ""}`);
  box.append(game, name, meta);
  return box;
}

function memberCard(card, person, model, make, cardHref, preview) {
  const handle = card?.handle ?? "";
  const href = card && !card.hidden ? cardHref(handle) : null;
  const root = make(href ? "a" : "div", `crew-card${card?.owner ? " is-owner" : ""}${card?.hidden ? " is-hidden" : ""}`);
  if (href && typeof href === "string" && /^\/(?!\/)|^https?:\/\/[^/]+\/@/.test(href)) {
    root.setAttribute("href", href);
    root.setAttribute("aria-label", `${person?.displayName || `@${handle}`} (@${handle}). Open their GamID`);
    markInteractive(root);
  }
  const avatar = make("div", "crew-card-avatar");
  if (typeof person?.avatarUrl === "string" && /^blob:/.test(person.avatarUrl)) { const img = make("img"); img.setAttribute("src", person.avatarUrl); img.setAttribute("alt", ""); avatar.append(img); }
  else avatar.textContent = (person?.displayName || handle || "G").replace(/^@/, "").charAt(0).toUpperCase() || "G";
  const body = make("div", "crew-card-body");
  const top = make("div", "crew-card-top");
  top.append(make("span", "crew-card-chip", card?.owner ? "CREW OWNER" : "CREW MEMBER"));
  body.append(top, make("strong", "crew-card-name", person?.displayName || `@${handle}`), make("span", "crew-card-handle", `@${handle}`));
  if (card?.hidden && preview) body.append(make("span", "crew-card-note", "Hidden from visitors - their GamID isn't public"));
  else {
    if (person?.role) body.append(make("span", "crew-card-role", person.role));
    if (person?.gameLine) body.append(make("span", "crew-card-game", person.gameLine));
  }
  root.append(avatar, body);
  return root;
}
