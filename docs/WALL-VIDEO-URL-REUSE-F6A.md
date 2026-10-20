# F6-A: cross-tab reuse of published Wall video URLs (TESTING, ACCEPTED 2026-10-21)

> **2026-10-21:** ACCEPTED by Mazen, with the documented large-file cache limitation: reuse lets the browser use its cache but cannot force it; a large range-filled video may still be re-downloaded. See `docs/WALL-BANDWIDTH-FINAL-BENCHMARK.md`, Product Memory REV-0022 and Truth `wall-video-url-reuse`. The text below is the delivery record.

Mazen's task "GAMID — AUTHORIZED F8-A + F6-A IMPLEMENTATION AND PRODUCT MEMORY SYNC" (2026-10-21).

- **F6-A:** implemented and deployed to TESTING.
- **F8-A:** paused by Mazen's decision (section 6).
- **Not started:** F6-B, F7, F8-B.
- **Truth:** `wall-video-url-reuse`, PENDING_ACCEPTANCE.
- Handoff: `PROJECT_HANDOFF.md` §104. Plan: `docs/WALL-BANDWIDTH-F6-F8-PLAN.md`. Baseline: `docs/WALL-BANDWIDTH-BASELINE.md`.

## 1. What changed

**`dist/public/published-video-url-cache.js`** (F4's anonymous published-Wall URL cache):
- **Storage:** `localStorage` key `gamid.testing.published-wall-video-urls.v2`, shared by the tabs of one browser and kept across a restart. It was `sessionStorage` (one tab).
  - F4's per-tab key `…v1` is removed when seen.
  - Memory fallback when storage is blocked.
- **Key:** `[project origin, bucket, exact object path, Wall handle, publication published_at, asset id]`. Another Wall, a republished Wall, another asset or another object never matches.
- **Validity (unchanged F4 rules):**
  - the URL must be the project's own `…/object/sign/<bucket>/<path>?token=` for that object;
  - reuse ends **30 minutes before the earlier** of the token's `exp` and issue + 6 h;
  - lifetimes are the server's (`public-media`: Wall video 6 h) and are never extended.
- **Defensive handling:**
  - concurrent tabs merge their entries (the later issue wins) instead of overwriting each other;
  - corrupt, foreign-origin, tampered or wrong-object entries are ignored, and the page signs again;
  - capped at 120 entries;
  - nothing is logged or transmitted.
- **New:** `retain(handle, items)` and `forget(handle)` on the cache, and `forgetPublishedWallVideos(handle)` for the page.

**`dist/public/public-wall.js`** (`preparePublicWall`):
- Every lookup carries its scope `{ handle, publishedAt, assetId }` from the **fresh** `get_public_wall` answer.
- Before signing, `retain()` keeps only the entries that answer lists. Removed or replaced media and earlier publications are forgotten.
- An invalid or missing published document forgets the Wall's entries.

**`dist/public/public.js`:** when the server **answers** that the GamID is not public / unknown, or that it has no published, enabled Wall, every cached URL of that handle is forgotten.
- A **failed or aborted** lookup forgets nothing; the page still falls back to the Public Profile exactly as before.
- Two fixes came out of the live security validation:
  - `a788607`: a navigation abort had looked like "not public";
  - `5d599b4`: that change used a flag it never declared, so a non-public GamID page threw a `ReferenceError` (live S8). A test now checks that both flags are declared before use.

**`dist/account/supabase-client.js`:** `signOut()` also removes the cache key.

**Unchanged:**
- `public-media`, lease lifetimes, RLS, the storage policies;
- the owner / editor signing path;
- F3 viewport loading;
- the Intro (its 120 s lease stays memory-only, F5).

## 2. Security assessment

**A signed URL is a bearer capability.** F6-A does not change what one grants or for how long. It changes only which tabs of the same browser may reuse one, and for how long it may stay stored (never past its reuse margin).

| Concern | Behaviour |
|---|---|
| Lease extension | impossible: validity is computed from the token's own `exp` and the canonical 6 h, minus 30 min |
| Stale URL revives an unpublished asset | impossible: only assets in the fresh manifest consult the cache; a removed asset's entry is dropped and its object is never requested (live S5) |
| Wall disabled / unpublished / GamID PRIVATE | every entry of that Wall is dropped on the next visit and nothing is requested (live S7, S8). Server-side, an already issued lease stays valid until expiry, which is the **existing** accepted residual (`visitor-media-access` / ISS-0009 (a)). Strict immediate revocation would need a server-side change (F6-B-style proxy) outside F6-A. |
| Persistence | ≤ the reuse window (at most 5.5 h after issue), pruned on every page open; cleared on sign-out |
| Leakage | no console output, no transmission of the cache, signed URLs only ever go to the Supabase host (live S12) |
| Corrupt / blocked storage | never trusted, never fatal (unit tests, live S10, S14) |

## 3. Validation

**Unit tests** (`tests/wall-video-url-reuse-f6a.test.js`, 10 tests, plus the 7 F4 tests):
- cross-tab and restart reuse;
- the margin and token-expiry rules;
- scope separation;
- manifest retention and forgetting;
- forget by handle;
- `preparePublicWall`: republish, removal, missing Wall;
- concurrent-tab merge;
- corrupt, foreign, tampered and blocked storage;
- legacy cleanup;
- sign-out;
- no logging;
- the page hooks.

**Full suite:** 2065 tests, 2064 pass, 0 fail, 1 skipped (pre-existing). Lint and typecheck pass.

**Guard tests updated deliberately:** `wall-public-publishing` (the `getPublicWall … .catch` line now notes the failure). The intro handshake's `if (!identity)` line is kept verbatim.

**Live security validation** (`scripts/wall-bandwidth/f6a-security.mjs`): TESTING, anonymous, @black / @zshot read-only. Server state is never changed; unpublished, private, removed and republished states are simulated by rewriting the anonymous RPC responses in the test browser only.

| # | Scenario | Result |
|---|---|---|
| S1 | entries scoped per video | **PASS** |
| S2 | same-tab reload: no new lease | **PASS** (after `a788607`; run again on the final `8ebacef`: all 15 pass) |
| S3 | new tab: no new lease | **PASS** |
| S4 | inside the 30-minute margin: re-signed | **PASS** |
| S5 | removed media | **PASS** |
| S6 | republished | **PASS** |
| S7 | unpublished / disabled | **PASS** |
| S8 | PRIVATE | **PASS** |
| S9 | different Wall | **PASS** |
| S10 | corrupt storage | **PASS** |
| S11 | sign-out | **PASS** |
| S12 | leakage | **PASS** |
| S13 | concurrent tabs | **PASS** |
| S14 | blocked storage | **PASS** |
| S15 | browser restart | **PASS** |

**Expired lease on the server:** not forced live (a lease is 6 h); covered by the token-expiry unit tests. Server-side lease expiry itself is unchanged.

## 4. Bandwidth: before / after

Playwright + CDP harness, deployed TESTING, @black. Wire bytes; cache reads are not counted.

| Scenario | Baseline (`22cbc85`) | F6-A (`a142afe`, revisits re-run on the final `8ebacef`) | Change |
|---|---:|---:|---:|
| Cold visit, all stages (desktop / mobile) | 41.46 / 41.46 MB | 41.45 / 41.41 MB | 0 (as expected) |
| Same-tab reload | 2.28 MB | 2.28 MB | 0 (already reused by F4) |
| **New-tab revisit, desktop** (three runs) | 32.30 MB (32.29 in the revisit plan) | **2.28 MB** each | **−30.0 MB (−93%)** |
| **New-tab revisit, mobile** (two runs) | 32.30 MB | **2.28 MB and 8.13 MB** | **−24.2 to −30.0 MB (−75% to −93%)** |
| **Browser restart revisit, desktop** | not measured before (expected ≈ new tab) | **2.29 MB** | — |
| **Complete 11-scenario session** (desktop / mobile) | 76.04 / 76.04 MB | **46.02 / 45.98 MB** | **−30.0 MB (−39.5%)** |
| Wall video lease requests on a revisit | 10 | **0** | −10 |
| Intro on every load | 2.20 MB | 2.20 MB | unchanged (F6-B, not authorized) |

- **Estimate vs measurement:** the plan's estimate was a revisit of about 2.3 MB after F8-A, or 15.7 MB with F6-A alone (simulation). Measured with F6-A alone: **2.28 MB on desktop** (revisit, full and final runs) and **2.28 MB / 8.13 MB on mobile** (two runs).
- **The mobile residual:**
  - It is the moov-at-end background MP4 `7643a7a2dd` (9.77 MB, no faststart), and it is **intermittent**: one of two mobile revisits. Chrome's cache refused its open-ended tail-range read (`net::ERR_CACHE_OPERATION_NOT_SUPPORTED`), so its last 5.80 MB were downloaded again; the first 3.9 MB came from cache.
  - On desktop the same file was served entirely from cache in all three runs.
  - This is exactly the B6 dependency that F8-A (faststart) addresses.
- **Remaining revisit bytes** are the Intro (2.20 MB, F6-B) and about 0.1 MB of revalidations, JS and API.
- **Ranges, CDN and health:**
  - every video request is still a 206 Range request;
  - on the first visit the CDN reports MISS for each object's first request, and HIT for the tail and range fills;
  - revisits make 0 requests for faststart videos;
  - 0 playback errors, 0 stalls, 0 page errors.
- **Billing:** a revisit's avoided requests never reach Supabase, so the browser bytes avoided are also Supabase egress avoided. Billed Egress and Cached Egress are not readable here (dashboard only).

## 5. Visual quality and media integrity

- F6-A does not touch media bytes. The same objects are served, from the browser cache on reuse.
- Decoded resolutions and durations are identical to the baseline (harness video telemetry).

## 6. F8-A: paused (Mazen's decision 2026-10-21)

**What F8-A needs:** a faststart and, for always-muted Wall video, an audio-free playback copy kept **next to** the untouched original.

**Blockers:**
1. **Storage contract.** Global Usage (`global-usage`, ACCEPTED: 200 MB, enforced) counts every object under the owner's `<uid>/` folder in every bucket (`private.usage_stored_bytes`, `get_my_usage_impl`). A playback copy in the existing derived bucket would therefore double-count. Not counting it means storing it outside quota accounting, which is a new storage contract.
2. **Deployment.** The playback copy would come from the existing `wall_video_jobs` queue in the Cloud Run worker image, which needs a worker redeploy. This machine has no Google Cloud access (`gcloud` not installed).

**Options for Mazen:**
- (a) Count playback copies toward the quota, like the Intro derivative.
- (b) Exclude internal playback copies from the quota, bounded by the 15-video limit. This is a new Truth wording under `global-usage`.
- (c) Container-only remux of new uploads in the browser before upload; existing files unaffected.

**Measured stake for this Wall:**
- the mobile revisit residual, 5.80 MB;
- 0.49 MB of never-played audio per view of one file;
- two extra range requests per moov-at-end MP4.
