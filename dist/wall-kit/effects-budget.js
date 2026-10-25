// Pro Effects (2026-10-25): ONE live-animation budget for every animated text effect on a page - Living Fire, Living Ice and Living Radiation. Each engine keeps its
// own adaptive budget (a slow device steps it down) and its own WebGL2 context, but how many texts animate AT ONCE is shared: an engine may animate at most what the
// others leave of EFFECT_LIVE_LIMIT, so a Wall with fire, ice and radiation texts never animates more than a Fire-only Wall could (4, the Phase C audit's number,
// docs/WALL-EDITOR-TEXT-EFFECTS.md). Texts over the budget show their effect's still frame. Each engine reports, once per frame, how many it animated; an engine
// with nothing to draw reports 0.
export const EFFECT_LIVE_LIMIT = 4;
const live = new Map();   // engine name -> texts it animated in its latest frame

export function liveAllowance(name) {
  let others = 0;
  for (const [engine, count] of live) if (engine !== name) others += count;
  return Math.max(0, EFFECT_LIVE_LIMIT - others);
}
export function reportLive(name, count) { if (count > 0) live.set(name, count); else live.delete(name); }
export const liveTotal = () => [...live.values()].reduce((sum, count) => sum + count, 0);
