// The Wall `gamidData` element type (Round 3): ONE live piece of the owner's GamID placed anywhere on the Wall - the avatar, the display name, the @GamID,
// the bio, one role, one game, one connection, or a whole collection (roles / games / connections). The element stores a BINDING (which field, and for a single
// item a reference to it), never a copy of the data: what is drawn is resolved when the Wall is drawn, so it is always the current value, and a visitor only
// ever gets what the owner's GamID shows publicly right now (the anonymous public view - see dist/wall-editor/gamid-data.js).
//   field      avatar | displayName | handle | bio | role | roles | game | games | connection | connections
//   ref        a single item only:  role -> a gaming-role key or "@primary" (whatever role is primary now);  game -> the game's library name (lower-cased, as the
//              library itself names it - a game a visitor can already see listed, never a store / provider id);  connection -> the connection's provider key
//   text       text-like fields (displayName, handle, bio, role, game, connection): the Text element's own style keys (font, size, colour, effects...) minus `text`
//   look       avatar only: the Artwork look (backdrop, mask, effects, blend, radius, opacity) - one visual engine for every picture
//   style / layout / initial / showPlaytime   collections only: exactly the GamID block's options (gamid.js)
//   withLabel  connection only: show the provider's name before the account name (default on)
//   section    (My Gamer Data Phase 2) a Classic section the server's section catalog offers to the Wall (public.public_section_catalog, wall_importable), such as
//              about_me or favorite_games. `item` (optional) binds ONE of its items by its stable id (a fact key, a catalog game key): with `item` the element is
//              text-like (`text`); without, the whole section is drawn as a block (`style`, `layout`). Sections and items are resolved from the server's projection
//              when the Wall is drawn (get_my_gamer_data / get_public_gamer_data), so a section the catalog no longer offers, or an item that is gone, draws nothing
//              for visitors and is never replaced by another one.
// Everything is typed and allowlisted: an unknown key is refused, no string is ever used as CSS, markup or an address. The database mirrors this validator.
import { elementRegistry } from "../wall/elements.js";
import { isSet, isPlainObject, inRange } from "../wall/fields.js";
import { validateTextPayload } from "./text.js";
import { validateArtworkLook } from "./image.js";
import { GAMID_LAYOUTS, GAMES_INITIAL, validateGamidStyle, resolveGamidStyle } from "./gamid.js";

export const DATA_FIELDS = Object.freeze(["avatar", "displayName", "handle", "bio", "role", "roles", "game", "games", "connection", "connections", "section"]);
export const DATA_TEXT_FIELDS = Object.freeze(["displayName", "handle", "bio", "role", "game", "connection"]);
export const DATA_COLLECTIONS = Object.freeze({ roles: "roles", games: "games", connections: "connections" });
export const DATA_ITEMS = Object.freeze(["role", "game", "connection"]);
export const CONNECTION_REF = /^[a-z][a-z0-9_]{1,30}$/;   // a connection's provider key (the picker only offers the owner's real, public connections)
export const ROLE_REF = /^(?:@primary|[a-z0-9_]{1,40})$/;
export const GAME_REF_MAX = 120;
export const SECTION_REF = /^[a-z][a-z0-9_]{1,31}$/;   // the catalog's own section_key rule
export const SECTION_ITEM_REF = /^[a-z0-9][a-z0-9_]{0,63}$/;   // a fact key or a catalog game key
// A section binding is one item (text-like) when it names an item, otherwise the whole section (drawn as a block).
export const isSectionItem = payload => payload?.field === "section" && isSet(payload.item);
export const isDataCollection = payload => !!DATA_COLLECTIONS[payload?.field] || (payload?.field === "section" && !isSet(payload.item));
export const isDataText = payload => DATA_TEXT_FIELDS.includes(payload?.field) || isSectionItem(payload);
const LOOK_KEYS = ["backdrop", "mask", "effects", "blend", "radius", "opacity"];

// The keys each field may carry (anything else: INVALID_DATA_KEY).
const FIELD_KEYS = Object.freeze({
  avatar: ["look"],
  displayName: ["text"], handle: ["text"], bio: ["text"],
  role: ["ref", "text"], game: ["ref", "text"], connection: ["ref", "text", "withLabel"],
  roles: ["style", "layout"], games: ["style", "layout", "initial", "showPlaytime"], connections: ["style", "layout"],
});
const keysOf = payload => (payload.field !== "section" ? FIELD_KEYS[payload.field] : isSet(payload.item) ? ["section", "item", "text"] : ["section", "style", "layout"]);

// The same normalization everywhere a game name is compared (the picker, the owner's library, the public library): NFKC, lower case, single spaces.
export const gameRef = name => Array.from(String(name ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()).slice(0, GAME_REF_MAX).join("").trim();

export function validateDataText(text) {
  // a live data field shows GamID data, never an external link: a text STYLE never carries `link`
  if (!isPlainObject(text) || Object.hasOwn(text, "text") || Object.hasOwn(text, "link")) return false;
  return validateTextPayload({ ...text, text: "" }).length === 0;
}
export function validateDataLook(look) {
  if (!isPlainObject(look) || Object.keys(look).some(key => !LOOK_KEYS.includes(key))) return false;
  if (isSet(look.opacity) && !inRange(look.opacity, 0, 1)) return false;
  return validateArtworkLook(look, []).length === 0;
}

export function validateGamidDataPayload(payload) {
  if (!isPlainObject(payload)) return ["PAYLOAD_NOT_OBJECT"];
  if (!DATA_FIELDS.includes(payload.field)) return ["INVALID_DATA_FIELD"];
  const errors = [];
  const allowed = keysOf(payload);
  if (Object.keys(payload).some(key => key !== "field" && !allowed.includes(key))) errors.push("INVALID_DATA_KEY");
  if (DATA_ITEMS.includes(payload.field)) {
    const ref = payload.ref;
    const ok = typeof ref === "string" && (payload.field === "role" ? ROLE_REF.test(ref)
      : payload.field === "connection" ? CONNECTION_REF.test(ref)
      : ref.length > 0 && Array.from(ref).length <= GAME_REF_MAX && ref === gameRef(ref));
    if (!ok) errors.push("INVALID_DATA_REF");
  }
  if (payload.field === "section") {
    if (typeof payload.section !== "string" || !SECTION_REF.test(payload.section)) errors.push("INVALID_DATA_SECTION");
    if (isSet(payload.item) && (typeof payload.item !== "string" || !SECTION_ITEM_REF.test(payload.item))) errors.push("INVALID_DATA_ITEM");
  }
  if (isSet(payload.text) && allowed.includes("text") && !validateDataText(payload.text)) errors.push("INVALID_DATA_TEXT");
  if (isSet(payload.look) && allowed.includes("look") && !validateDataLook(payload.look)) errors.push("INVALID_DATA_LOOK");
  if (isSet(payload.withLabel) && allowed.includes("withLabel") && typeof payload.withLabel !== "boolean") errors.push("INVALID_DATA_WITH_LABEL");
  if (isSet(payload.layout) && allowed.includes("layout") && !GAMID_LAYOUTS.includes(payload.layout)) errors.push("INVALID_LAYOUT");
  if (isSet(payload.showPlaytime) && allowed.includes("showPlaytime") && typeof payload.showPlaytime !== "boolean") errors.push("INVALID_SHOW_PLAYTIME");
  if (isSet(payload.initial) && allowed.includes("initial") && !(Number.isInteger(payload.initial) && payload.initial >= GAMES_INITIAL.min && payload.initial <= GAMES_INITIAL.max)) errors.push("INVALID_INITIAL");
  if (isSet(payload.style) && allowed.includes("style")) errors.push(...validateGamidStyle(payload.style));
  return errors;
}

// Default text looks per field (canonical units), so a new element reads well straight away. The owner restyles them like any Text element.
export const DATA_TEXT_DEFAULTS = Object.freeze({
  displayName: { fontFamily: "orbitron", fontSize: 96, fontWeight: 800 },
  handle: { fontFamily: "rajdhani", fontSize: 56, fontWeight: 600, color: "#62e7ff" },
  bio: { fontFamily: "system-sans", fontSize: 44, fontWeight: 400, align: "left", lineHeight: 1.35 },
  role: { fontFamily: "rajdhani", fontSize: 52, fontWeight: 700, color: "#c9b6ff", letterSpacing: 4 },
  game: { fontFamily: "rajdhani", fontSize: 52, fontWeight: 700 },
  connection: { fontFamily: "rajdhani", fontSize: 48, fontWeight: 600 },
  section: { fontFamily: "rajdhani", fontSize: 52, fontWeight: 700 },
});
const TEXT_BASE = { fontFamily: "orbitron", fontSize: 64, fontWeight: 700, italic: false, underline: false, color: "#ffffff", align: "center", lineHeight: 1.2, letterSpacing: 0, opacity: 1, direction: "auto", wrap: true };
export const dataTextStyle = (field, text) => ({ ...TEXT_BASE, ...(DATA_TEXT_DEFAULTS[field] ?? {}), ...(isPlainObject(text) ? text : {}) });

export function renderGamidDataPayload(payload) {
  const content = { kind: "gamidData", field: payload.field };
  if (DATA_ITEMS.includes(payload.field)) content.ref = payload.ref;
  if (payload.field === "section") { content.section = payload.section; if (isSet(payload.item)) content.item = payload.item; }
  if (isDataText(payload)) content.text = dataTextStyle(payload.field, payload.text);
  if (payload.field === "avatar") content.look = { backdrop: "none", ...(isPlainObject(payload.look) ? payload.look : {}) };
  if (payload.field === "connection") content.withLabel = payload.withLabel !== false;
  if (isDataCollection(payload)) {
    content.layout = payload.layout ?? "card";
    content.initial = payload.initial ?? GAMES_INITIAL.default;
    content.showPlaytime = payload.showPlaytime === true;
    if (isPlainObject(payload.style)) content.style = resolveGamidStyle(payload.style);
  }
  return content;
}

export const createGamidDataPayload = (field, overrides = {}) => ({ field, ...overrides });

// Uniform resize: text sizes scale like a Text element's; the picture's effect sizes like an Artwork's.
function scaleGamidDataPayload(payload, factor) {
  const next = { ...payload };
  if (isPlainObject(payload.text)) {
    const base = dataTextStyle(payload.field, payload.text);
    const scaled = elementRegistry.get("text").scale({ ...base, text: "" }, factor);
    next.text = { ...payload.text, fontSize: scaled.fontSize, letterSpacing: scaled.letterSpacing };
    for (const key of ["stroke", "shadow", "glow"]) if (isPlainObject(payload.text[key])) next.text[key] = scaled[key];
  }
  if (isPlainObject(payload.look)) next.look = elementRegistry.get("image").scale({ ...payload.look }, factor);
  return next;
}

// Sizes (canonical units) the editor starts each field at, and the smallest useful box.
export const DATA_FIELD_INFO = Object.freeze({
  avatar: { label: "Avatar", size: { width: 320, height: 320 } },
  displayName: { label: "Display name", size: { width: 800, height: 140 } },
  handle: { label: "@GamID", size: { width: 700, height: 90 } },
  bio: { label: "Bio", size: { width: 800, height: 260 } },
  role: { label: "One role", size: { width: 600, height: 90 } },
  roles: { label: "Roles", size: { width: 800, height: 200 } },
  game: { label: "One game", size: { width: 700, height: 90 } },
  games: { label: "Games", size: { width: 800, height: 520 } },
  connection: { label: "One connection", size: { width: 700, height: 90 } },
  connections: { label: "Connections", size: { width: 800, height: 260 } },
  section: { label: "Classic section", size: { width: 800, height: 300 }, itemSize: { width: 700, height: 90 }, minSize: { width: 260, height: 120 } },
});

elementRegistry.register("gamidData", { validatePayload: validateGamidDataPayload, render: renderGamidDataPayload, scale: scaleGamidDataPayload });
