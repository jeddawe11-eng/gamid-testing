// Game artwork for Wall elements that show a Classic section as Game Covers (My Gamer Data). It reuses Classic's own artwork delivery unchanged: GamID's
// game-artwork Edge Function (the owner's /owner/self in the editor, the visitor route of a PUBLIC GamID on a published Wall), whose response names only
// provider-CDN images the server matched. This store asks for it at most once (until reset by Refresh from Classic), only when a Game Covers element is
// actually painted, and keeps nothing beyond the page. Covers are placed by Classic's own applyGameArtwork (dist/public/game-artwork.js: the address check,
// <img loading="lazy"> with no referrer, an image that cannot load removes itself).
// PROVISIONAL: the artwork provider is a TESTING evaluation (written permission outstanding) - see supabase/functions/_shared/game-artwork.js.
export function createArtworkStore(load, { onChange = () => {} } = {}) {
  let data = null, state = "idle", pending = null, stale = false;
  return {
    get: () => data,
    get state() { return state; },
    // starts the one read (no-op while it runs or once it has an answer); a failed or refused read leaves the text fallback
    request() {
      if (state !== "idle" || typeof load !== "function") return pending;
      state = "loading";
      pending = Promise.resolve().then(load).then(result => { data = result ?? null; }, () => { data = null; }).finally(() => { state = stale ? "idle" : "done"; stale = false; pending = null; onChange(); });
      return pending;
    },
    // Refresh from Classic: the next paint asks again (a read already running is answered, then asked again)
    reset() { if (state === "loading") { stale = true; return; } data = null; state = "idle"; },
  };
}
