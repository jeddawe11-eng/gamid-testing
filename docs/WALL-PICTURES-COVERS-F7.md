# F7-A stage-aware Wall pictures + F7-C same-art cover thumbnails (TESTING, PENDING Mazen's final acceptance)

Mazen's task "Continue GamID Wall bandwidth optimization on TESTING only" (2026-10-21).

- **Product:** `97b3fdc`, deployed (run `39486918858`); served files byte-identical.
- **Not implemented:** F7-B, F8-A, F8-B, F6-B.
- **Comprehensive benchmark and cross-browser acceptance:** reserved for the final optimization phase (Mazen's instruction).
- Research for the next decisions: `docs/WALL-BANDWIDTH-PHASE2-RESEARCH.md`.

## F7-A: stage-aware picture loading (visitor page only)

**What changes:**
- `preparePublicWall` still reads, during the Intro, every picture used by stage 1 and the whole-Wall background.
- A picture used **only** by later stages (artwork elements or a stage's own image background) waits:
  - `createPublicWallView` observes each painted stage (`IntersectionObserver`, `rootMargin: "100% 0px"`, one viewport above and below);
  - when a stage comes that near, its pictures are read once each and every frame showing them is filled in place;
  - without `IntersectionObserver`, everything is read at once (the old behaviour).
- **The painter** (`dist/wall-kit/paint.js`) gained an optional resolver hook, `assets.whenPicture(id, fill)`:
  - only the visitor page passes it;
  - a waiting artwork keeps an empty frame, then gets its picture, or the usual "Image" placeholder if the read fails;
  - a waiting stage background is added under its overlay;
  - there's no repaint, so a running player embed is never reset;
  - the editor and Preview don't pass the hook and are unchanged.

**Unchanged:**
- the read itself (`loadPublicWallPicture`, the RLS-checked anonymous `authenticated/wall-media` endpoint);
- only assets in the fresh publication manifest are read; a document picture missing from the manifest is never read;
- an unpublished Wall's late read fails like any other read and shows the placeholder;
- F3 video gating, F6-A, Templates, Game Covers rendering.

**Measured** (deployed TESTING, @black, live check; not the final benchmark):
- **Desktop:** at reveal only the stage-1 PNG is read. The stage-3 GIF (2.01 MB) is read once the visitor scrolls within one viewport of stage 3, and all 4 split pieces are drawn, with no placeholder visible.
- **Mobile (412 px):** stage 3 is within one viewport at reveal, so the GIF is read then; there's no saving on this short Wall.
- The saving grows with the number of stages a visitor never reaches.

## F7-C: same-art cover thumbnails (Mazen's choice over a WebP filter)

**Why not WebP:** a `mimes=image/webp` filter would make SteamGridDB pick its top *WebP* grid, which can be different artwork from today's (including the accepted Classic Favorite Games). The chosen design keeps the same grid.

**What changes** (`dist/public/game-artwork.js`):
- Favorite Games covers (`[data-game-cover]`) get the provider's own thumbnail of the **same** grid: `cdn2.steamgriddb.com/thumb/<hash>.jpg`, measured 267×400 JPEG, 49–94 KB.
- They're offered beside the full 600×900 image (0.71–1.08 MB):
  - `srcset="<thumb> 267w, <full> 600w"`;
  - `sizes="auto, <slot width>px"`, falling back to 600 px when the slot isn't laid out.
- So the browser uses the thumbnail only when *displayed width × device-pixel ratio ≤ 267*.
- A failing thumbnail falls back to the full image once; a failing full image leaves the initials, as before.
- `src` stays the full image for browsers without `srcset`.
- Icons, grids and heroes are unchanged. Provider CDN and no-referrer loading are unchanged; CSP is unaffected (the same host).

**Measured live:**

| Profile | Covers chosen | Bytes |
|---|---|---:|
| Desktop DPR 1 (185 CSS px) | thumbnails | 0.30 MB, was 3.56 MB (−92%) |
| Desktop DPR 2 | full images | quality first, unchanged |
| Mobile (85 CSS px × 2.625) | thumbnails | about 0.30 MB |

Screenshots: covers sharp at DPR 1, artwork unchanged.

## Tests

- **F7-A:** `tests/wall-picture-stages-f7a.test.js`, 5 tests:
  - the stage map;
  - the loader (one read per asset, failure → placeholder, late frames);
  - `preparePublicWall` reads only stage 1 and never reads assets outside the manifest;
  - the painter fill and background-under-overlay, with the editor / Preview unchanged;
  - the observer settings.
- **F7-C:** `tests/game-cover-thumb-f7c.test.js`, 4 tests: thumbnail derivation and rejection, `srcset`/`sizes`, the fallback chain, icons unchanged.
- **Full suite:** 2074 tests, 2073 pass, 0 fail, 1 skipped (pre-existing). Lint and typecheck pass.
- **F6-A live security regression after F7:** `scripts/wall-bandwidth/f6a-security.mjs` (result in `PROJECT_HANDOFF.md` §105).

## GamID Truth

**NO CHANGE REQUIRED.** These are delivery optimizations: no capability, limit or contract changes.
- `game-artwork-provisional` still holds: provider CDN, no referrer, no storage.
- F3 was recorded the same way.
