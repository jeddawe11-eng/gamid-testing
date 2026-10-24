// Friends Stickers V1 (Mazen's task "GAMID - FRIENDS STICKERS V1" + addendum, 2026-10-24; DEC-0011): the rules a sticker placement follows, shared by the editor,
// the visitor page and the send flow. The database mirrors every rule here (supabase/migrations/20261024100000_friends_stickers_v1.sql): the sticker keys, the
// placement area, the size rule and the clip-link rule - the server decides, the browser only shows the same answer early.
//
// A placement is NOT part of the Wall Document: it lives in its own table, belongs to the recipient's Wall and one of its Friends Stages (by stage id), and is
// positioned in that stage's units (the canonical 1000 x 1778 canvas), so the same placement lands in the same place on every screen.

// The 14 animated stickers (the supplied GAMID_PREMIUM_ANIMATED_14 set - free Standard stickers in V1, Mazen 2026-10-24). `source` is the original file's name,
// `aspect` the animation's width / height. Every sticker is shown in the same square box (contain), so all 14 share one base size.
export const STICKER_CATALOG = Object.freeze([
  { key: "carried-me", name: "Carried Me", source: "P01_CARRIED_ME", aspect: 832 / 576 },
  { key: "legend", name: "Legend", source: "P02_LEGEND", aspect: 1 },
  { key: "clutch-king", name: "Clutch King", source: "P03_CLUTCH_KING", aspect: 1 },
  { key: "my-duo-4ever", name: "My Duo 4Ever", source: "P04_MY_DUO_4EVER", aspect: 1 },
  { key: "rage-buddy", name: "Rage Buddy", source: "P05_RAGE_BUDDY", aspect: 1 },
  { key: "mvp", name: "MVP", source: "P06_MVP", aspect: 1 },
  { key: "gg-bro", name: "GG Bro", source: "P07_GG_BRO", aspect: 1 },
  { key: "space-crew", name: "Space Crew", source: "P08_SPACE_CREW", aspect: 1 },
  { key: "save-me", name: "Save Me", source: "P09_SAVE_ME", aspect: 1 },
  { key: "headshot", name: "Headshot", source: "P10_HEADSHOT", aspect: 1 },
  { key: "diamond-squad", name: "Diamond Squad", source: "P11_DIAMOND_SQUAD", aspect: 1 },
  { key: "final-boss", name: "Final Boss", source: "P12_FINAL_BOSS", aspect: 832 / 576 },
  { key: "chill-squad", name: "Chill Squad", source: "P13_CHILL_SQUAD", aspect: 1 },
  { key: "ghost-mode", name: "Ghost Mode", source: "P14_GHOST_MODE", aspect: 1 },
].map(entry => Object.freeze(entry)));
export const STICKER_KEYS = Object.freeze(STICKER_CATALOG.map(entry => entry.key));
export const stickerByKey = key => STICKER_CATALOG.find(entry => entry.key === key) ?? null;
// the served files, relative to dist/wall-kit/ (the animated WebP and its still: the picker preview and the reduced-motion image)
export const stickerFile = key => `stickers/${key}.webp`;
export const stickerStillFile = key => `stickers/${key}-still.webp`;

// ---- geometry (stage units) ------------------------------------------------------------------------------------------------------------------------------
// A placement is the CENTRE of its sticker box. At 100% the box is STICKER_BASE units square; the sender's avatar and name sit just below it, inside the group.
// The allowed area keeps the whole group (box + attribution) inside the stage at 100% - and so at every smaller size, since a sticker shrinks around its centre.
export const STICKER_BASE = 300;
export const STICKER_ATTRIBUTION = 0.16;   // the attribution row's height below the box, as a share of the box
export const STICKER_AREA = Object.freeze({ minX: 150, maxX: 850, minY: 150, maxY: 1580 });
export const insideStickerArea = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= STICKER_AREA.minX && x <= STICKER_AREA.maxX && y >= STICKER_AREA.minY && y <= STICKER_AREA.maxY;
export const clampToStickerArea = (x, y) => ({
  x: Math.min(STICKER_AREA.maxX, Math.max(STICKER_AREA.minX, Math.round(Number(x) || 0))),
  y: Math.min(STICKER_AREA.maxY, Math.max(STICKER_AREA.minY, Math.round(Number(y) || 0))),
});
// where a new sticker starts in the send flow: the stage's centre
export const STICKER_START = Object.freeze({ x: 500, y: 760 });

// ---- dynamic size ------------------------------------------------------------------------------------------------------------------------------------------
// Each newly approved sticker starts at 100%; every NEWER active approved sticker on the same Wall takes 5 percentage points off an older one, down to 50%.
// Linear, never compounded, never stored: the base box is never changed, so removing a sticker gives the older ones their size back.
export const STICKER_SIZE_STEP = 5;
export const STICKER_SIZE_MIN = 50;
export const stickerSizePercent = newerActiveCount => Math.max(STICKER_SIZE_MIN, 100 - STICKER_SIZE_STEP * Math.max(0, Math.floor(Number(newerActiveCount) || 0)));
// placements -> Map(placement id -> size %), by approval order (`approval_seq`, the Wall's own approval counter) over the ACTIVE approved ones only. Pending,
// rejected and removed placements never count and get no size.
export function stickerSizes(placements) {
  const active = (Array.isArray(placements) ? placements : []).filter(p => p?.status === "approved" && Number.isFinite(Number(p.approval_seq)))
    .sort((a, b) => Number(b.approval_seq) - Number(a.approval_seq));
  return new Map(active.map((p, newer) => [p.placement_id, stickerSizePercent(newer)]));
}

// ---- the optional gaming clip link (addendum, 2026-10-24) ----------------------------------------------------------------------------------------------------
// One link per sticker, to a gaming clip. The accepted link shapes are provider facts, so they live with the provider adapters: wall-kit/embed/providers/clip-links.js.

// ---- who sent it -------------------------------------------------------------------------------------------------------------------------------------------
const HANDLE = /^[a-z0-9][a-z0-9_]{1,22}[a-z0-9]$/;
export const stickerSenderHandle = handle => (typeof handle === "string" && HANDLE.test(handle) ? handle : null);
