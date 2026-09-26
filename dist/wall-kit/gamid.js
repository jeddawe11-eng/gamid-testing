// The Wall `gamid` element type: a GamID BLOCK - REAL structured identity data shown on the Wall (unlike creator-page builders that only place links). The element
// stores no data at all: only WHICH block it is and a few display choices. The data is resolved when the Wall is drawn, from the person's own GamID (see
// gamid-blocks.js / dist/wall-editor/gamid-data.js), so it is never a stale copy and never invented.
//   block: profile | roles | games | connections
//   optional: layout (card | compact), initial (how many games show before "Show all": 3..24, default 8), showPlaytime (boolean; default OFF - hours are hidden unless the
//   owner explicitly turns them on, and even then only when the owner's existing playtime setting allows it)
// Not offered yet, by design (no fake data): verified stats, ranks, achievements, Play Together, teams, tournaments, gaming history. New blocks are one more entry here.
import { elementRegistry } from "../wall/elements.js";
import { isSet, isPlainObject } from "../wall/fields.js";

export const GAMID_BLOCKS = Object.freeze(["profile", "roles", "games", "connections"]);
export const GAMID_LAYOUTS = Object.freeze(["card", "compact"]);
export const GAMES_INITIAL = Object.freeze({ min: 3, max: 24, default: 8 });

export function validateGamidPayload(payload) {
  if (!isPlainObject(payload)) return ["PAYLOAD_NOT_OBJECT"];
  const errors = [];
  if (!GAMID_BLOCKS.includes(payload.block)) errors.push("INVALID_BLOCK");
  if (isSet(payload.layout) && !GAMID_LAYOUTS.includes(payload.layout)) errors.push("INVALID_LAYOUT");
  if (isSet(payload.showPlaytime) && typeof payload.showPlaytime !== "boolean") errors.push("INVALID_SHOW_PLAYTIME");
  if (isSet(payload.initial) && !(Number.isInteger(payload.initial) && payload.initial >= GAMES_INITIAL.min && payload.initial <= GAMES_INITIAL.max)) errors.push("INVALID_INITIAL");
  return errors;
}

export function renderGamidPayload(payload) {
  return { kind: "gamid", block: payload.block, layout: payload.layout ?? "card", showPlaytime: payload.showPlaytime === true, initial: payload.initial ?? GAMES_INITIAL.default };
}

export const createGamidPayload = (block, overrides = {}) => ({ block, layout: "card", ...overrides });
// minSize (canonical units): the smallest box that still shows the block's title and a first row of its real content. Blocks are laid out in em of a 26-unit base
// with 20-unit padding (gamid-blocks.js / wall-kit.css): every block = 40 padding + ~19 title + 13 gap, then
//   profile      + the 3.2em-at-1.3em avatar row (108)                                        -> 180
//   roles        + one role chip (~33)                                                        -> 110
//   connections  + one two-line connection row (~57)                                          -> 130
//   games        + list header (22) + two game rows (~76) + the Show all control (~41) + gaps -> 240
// Widths keep the avatar + name / a chip / a row readable. The text size follows the Wall scale, not the box, so a minimum-size block is as legible as a big one.
export const GAMID_BLOCK_INFO = Object.freeze({
  profile: { label: "Profile", description: "Your avatar, display name and @GamID.", size: { width: 800, height: 260 }, minSize: { width: 300, height: 180 } },
  roles: { label: "Gaming roles", description: "The gaming roles you chose for your GamID.", size: { width: 800, height: 200 }, minSize: { width: 240, height: 110 } },
  games: { label: "Games", description: "Your games. Collapsed by default, safe for hundreds of games. Hours stay hidden unless you turn them on.", size: { width: 800, height: 520 }, minSize: { width: 300, height: 240 } },
  connections: { label: "Connections", description: "The accounts you have chosen to show on your GamID.", size: { width: 800, height: 260 }, minSize: { width: 240, height: 130 } },
});

elementRegistry.register("gamid", { validatePayload: validateGamidPayload, render: renderGamidPayload });
