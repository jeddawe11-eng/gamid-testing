// The Wall `gamid` element type: a GamID BLOCK - REAL structured identity data shown on the Wall (unlike creator-page builders that only place links). The element
// stores no data at all: only WHICH block it is and a few display choices. The data is resolved when the Wall is drawn, from the person's own GamID (see
// gamid-blocks.js / dist/wall-editor/gamid-data.js), so it is never a stale copy and never invented.
//   block: profile | roles | games | connections | duo   (duo = My Duo: the owner's mutually accepted Duo, a GamID-to-GamID identity relationship; it opens that GamID)
//   optional: layout (card | compact), initial (how many games show before "Show all": 3..24, default 8), showPlaytime (boolean; default OFF - hours are hidden unless the
//   owner explicitly turns them on, and even then only when the owner's existing playtime setting allows it)
// Not offered yet, by design (no fake data): verified stats, ranks, achievements, Play Together, teams, tournaments, gaming history. New blocks are one more entry here.
import { elementRegistry } from "../wall/elements.js";
import { isSet, isPlainObject, isHex, inRange } from "../wall/fields.js";

export const GAMID_BLOCKS = Object.freeze(["profile", "roles", "games", "connections", "duo"]);
export const GAMID_LAYOUTS = Object.freeze(["card", "compact"]);
export const GAMES_INITIAL = Object.freeze({ min: 3, max: 24, default: 8 });

// Round 2 - presentation styling. `style` is OPTIONAL, typed data only (never CSS, HTML or a URL): a fixed set of keys, each an enum, a #rrggbb colour, a number in a
// safe range or a boolean. Unknown keys are refused. Absent keys (and a Wall saved before styling existed) mean the default look, which is exactly the accepted one
// (GAMID_STYLE_DEFAULTS). The database validator mirrors this table (migration *_wall_gamid_block_style.sql, kept identical by the shared corpus).
//   background  bgMode solid | gradient | none (transparent), bgColor, bgColor2 (gradient end), bgAngle 0..360, bgOpacity 0..1 - the CONTAINER only, never its text
//   border      border on/off, borderColor, borderOpacity 0..1, borderWidth 0..8 units;   corners  radius 0..60 units
//   text        headingColor (block title), primaryColor (names, game names), secondaryColor (supporting text), accentColor (chips, rows, highlights)
//   chips/rows  chipStyle outline | filled | plain, rowStyle card | plain | divided
//   profile     avatarShape circle | rounded | square, nameSize s | m | l, showHandle (the @GamID line)
//   spacing     padding 0..60 units, gap 0..40 units
// Trust indicators (Verified / Connected / Manual / Unverified ...) and the Private label keep their own fixed, legible colours whatever the style.
export const GAMID_STYLE_ENUMS = Object.freeze({ bgMode: ["solid", "gradient", "none"], chipStyle: ["outline", "filled", "plain"], rowStyle: ["card", "plain", "divided"], avatarShape: ["circle", "rounded", "square"], nameSize: ["s", "m", "l"] });
export const GAMID_STYLE_COLORS = Object.freeze(["bgColor", "bgColor2", "borderColor", "headingColor", "primaryColor", "secondaryColor", "accentColor"]);
export const GAMID_STYLE_RANGES = Object.freeze({ bgAngle: [0, 360], bgOpacity: [0, 1], borderOpacity: [0, 1], borderWidth: [0, 8], radius: [0, 60], padding: [0, 60], gap: [0, 40] });
export const GAMID_STYLE_FLAGS = Object.freeze(["border", "showHandle"]);
export const GAMID_STYLE_KEYS = Object.freeze([...Object.keys(GAMID_STYLE_ENUMS), ...GAMID_STYLE_COLORS, ...Object.keys(GAMID_STYLE_RANGES), ...GAMID_STYLE_FLAGS]);
export const GAMID_STYLE_DEFAULTS = Object.freeze({
  bgMode: "gradient", bgColor: "#1b1430", bgColor2: "#0d0b14", bgAngle: 145, bgOpacity: 0.95,
  border: true, borderColor: "#8b5dff", borderOpacity: 0.5, borderWidth: 1, radius: 29,
  headingColor: "#62e7ff", primaryColor: "#f7f5ff", secondaryColor: "#aaa4b7", accentColor: "#8b5dff",
  chipStyle: "outline", rowStyle: "card", avatarShape: "circle", nameSize: "m", showHandle: true, padding: 20, gap: 13,
});

export function validateGamidStyle(style) {
  if (!isPlainObject(style)) return ["INVALID_STYLE"];
  const errors = [];
  for (const [key, value] of Object.entries(style)) {
    if (!GAMID_STYLE_KEYS.includes(key)) { errors.push("INVALID_STYLE_KEY"); continue; }
    if (!isSet(value)) continue;
    const ok = Object.hasOwn(GAMID_STYLE_ENUMS, key) ? GAMID_STYLE_ENUMS[key].includes(value)
      : GAMID_STYLE_COLORS.includes(key) ? isHex(value)
      : Object.hasOwn(GAMID_STYLE_RANGES, key) ? inRange(value, ...GAMID_STYLE_RANGES[key])
      : typeof value === "boolean";
    if (!ok) errors.push(`INVALID_STYLE_${key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()}`);
  }
  return errors;
}

export function validateGamidPayload(payload) {
  if (!isPlainObject(payload)) return ["PAYLOAD_NOT_OBJECT"];
  const errors = [];
  if (!GAMID_BLOCKS.includes(payload.block)) errors.push("INVALID_BLOCK");
  if (isSet(payload.layout) && !GAMID_LAYOUTS.includes(payload.layout)) errors.push("INVALID_LAYOUT");
  if (isSet(payload.showPlaytime) && typeof payload.showPlaytime !== "boolean") errors.push("INVALID_SHOW_PLAYTIME");
  if (isSet(payload.initial) && !(Number.isInteger(payload.initial) && payload.initial >= GAMES_INITIAL.min && payload.initial <= GAMES_INITIAL.max)) errors.push("INVALID_INITIAL");
  if (isSet(payload.style)) errors.push(...validateGamidStyle(payload.style));
  return errors;
}

// The render content carries the style with every default filled in, so the painter never guesses.
export const resolveGamidStyle = style => {
  const out = { ...GAMID_STYLE_DEFAULTS };
  if (isPlainObject(style)) for (const key of GAMID_STYLE_KEYS) if (isSet(style[key])) out[key] = style[key];
  return out;
};

export function renderGamidPayload(payload) {
  return {
    kind: "gamid", block: payload.block, layout: payload.layout ?? "card", showPlaytime: payload.showPlaytime === true, initial: payload.initial ?? GAMES_INITIAL.default,
    ...(isPlainObject(payload.style) ? { style: resolveGamidStyle(payload.style) } : {}),
  };
}

export const createGamidPayload = (block, overrides = {}) => ({ block, layout: "card", ...overrides });
// minSize (canonical units): the smallest box that still shows the block's title and a first row of its real content. Blocks are laid out in em of a 26-unit base
// with 20-unit padding (gamid-blocks.js / wall-kit.css): every block = 40 padding + ~19 title + 13 gap, then
//   profile      + the 3.2em-at-1.3em avatar row (108)                                        -> 180
//   roles        + one role chip (~33)                                                        -> 110
//   connections  + one two-line connection row (~57)                                          -> 130
//   games        + list header (22) + two game rows (~76) + the Show all control (~41) + gaps -> 240
//   duo          + the avatar / name / @handle row with its relationship badge (~108)       -> 180
// Widths keep the avatar + name / a chip / a row readable. The text size follows the Wall scale, not the box, so a minimum-size block is as legible as a big one.
export const GAMID_BLOCK_INFO = Object.freeze({
  profile: { label: "Profile", description: "Your avatar, display name and @GamID.", size: { width: 800, height: 260 }, minSize: { width: 300, height: 180 } },
  roles: { label: "Gaming roles", description: "The gaming roles you chose for your GamID.", size: { width: 800, height: 200 }, minSize: { width: 240, height: 110 } },
  games: { label: "Games", description: "Your games. Collapsed by default, safe for hundreds of games. Hours stay hidden unless you turn them on.", size: { width: 800, height: 520 }, minSize: { width: 300, height: 240 } },
  connections: { label: "Connections", description: "The accounts you have chosen to show on your GamID.", size: { width: 800, height: 260 }, minSize: { width: 240, height: 130 } },
  duo: { label: "My Duo", description: "Your mutually accepted Duo. Visitors can open their GamID.", size: { width: 800, height: 260 }, minSize: { width: 300, height: 180 } },
});

elementRegistry.register("gamid", { validatePayload: validateGamidPayload, render: renderGamidPayload });
