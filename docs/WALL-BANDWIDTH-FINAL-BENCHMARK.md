# F1–F8 final bandwidth and performance benchmark (TESTING, 2026-10-21; measurement only, PENDING Mazen's review)

> **Reconciled 2026-10-23 (§8).** §1–§7 are the original benchmark of 2026-10-21, kept as measured. The title's "PENDING" and the §6 status matrix describe that day, before Mazen's acceptance decisions (REV-0022) and before F8-B1 was implemented and accepted (REV-0023). For the current status, read §8.

Mazen's task "GAMID — F1–F8 FINAL BANDWIDTH & PERFORMANCE BENCHMARK".
- **Scope:** measurement, verification and reporting only. No deployment, migration, product change, Truth change or Product Memory write.
- **Baseline:** `docs/WALL-BANDWIDTH-BASELINE.md` (TESTING `22cbc85`, 2026-10-20). It is preserved unchanged.

## 1. Environment and comparability

| Item | Baseline | Now |
|---|---|---|
| Deployed stamp | `22cbc85` | `5600d06` (= `5600d0677c5f68a4b9a81c418d644173dfeaf662`, run `39492020998`; verified on the page) |
| Browser, profiles, network | Chrome 155 (Playwright `channel: "chrome"`); desktop 1440×900 DPR 1; Pixel 7 emulation; unthrottled + one Fast-4G-like mobile run | identical |
| Protocol | §7 of the baseline: `full` desktop + mobile, `key` desktop + mobile, `full --throttle` mobile | identical; the harness is unchanged |
| Wall video objects | 11 (one is the Intro), Wall videos 30.00 MB | the same 10 Wall videos (same objects, same bytes) **plus one new MP4** |
| Intro | VP9 1280×720, 25 fps, 29.6 s, 2.20 MB | **a different Intro**: VP9 1920×1080, 30 fps, 11.04 s, 5.05 Mbit/s, 6.97 MB |

**What changed in the content since the baseline** (the anonymous manifest, read exactly as a visitor's page reads it):

1. **One new Wall video:** the F8-A smoke-test upload, on stage 3.
   - H.264 3840×2160, 50.55 MB (48.2 MiB).
   - Identified as the one manifest asset absent from the baseline (object hash `feef7322ef`).
   - Its bytes are counted separately and removed from every comparable figure. Identification is exact: the run files record a hashed object path for each request.
2. **The Intro was replaced** after the baseline.
   - It is within the accepted F2 bound (≤ 1920×1080; VP9 CRF 40 without a bitrate cap, so its bitrate depends on the content).
   - Intro bytes, and every timing that depends on the Intro's length ("Wall shown", video start), are therefore **not comparable**.
   - The comparable figures below exclude the Intro on both sides, and the Intro is reported separately.

Everything else is the same set of objects with the same sizes:
- the 10 Wall videos, the PNG, the GIF, the two avatars, the custom font;
- the four SteamGridDB covers, which are now served as thumbnails.

Every comparable figure repeated within 0.5 MB across the 5 runs.

**Not measured:**
- **Billed Supabase Egress:** shown only on the owner's Usage page, which needs his sign-in. The figures here are bytes received by the browser, split by `cf-cache-status`.
- **Physical devices, iOS / Safari, Firefox:** not tested.
- **Monitor scan egress (F1):** F1 is not part of the visitor page.

## 2. Baseline versus now

**Byte rule:**
- **Wire bytes:** CDP `encodedDataLength`, including headers and range fills flagged as cache that carry real bytes.
- **Cache read:** a cache-flagged response with < 1 KiB from the network; not counted.
- **Unit:** MB = 10^6 bytes.

| Metric | Original baseline | Current measured | Change | Cause | Confidence |
|---|---|---|---|---|---|
| **Cold first visit**, before interaction, excl. Intro, desktop | 16.86 MB | 11.60 MB | **−5.26 MB (−31%)** | covers −3.26 (smaller files, F7-C); stage-3 GIF −2.01 (deferred, F7-A) | high (3 runs each, ±0.0) |
| … mobile | 26.30–26.57 MB | 23.22–23.45 MB | **−3.08 to −3.12 MB (−12%)** | covers (F7-C); on mobile the GIF's stage is within the F7-A margin, so it still loads | high |
| … the same, full profile now (incl. Intro, new MP4) | 19.06 / 28.50–28.77 MB | 18.57 / 30.19–30.42 MB | non-comparable | the new Intro is +4.77 MB; the new MP4 adds 0 before interaction | — |
| **Full three-stage visit**, cold, excl. Intro, excl. new MP4 | 39.03–39.26 MB | 35.65–36.02 MB | **−3.24 to −3.38 MB (−8 to −9%)** | covers (F7-C); the GIF still loads once stage 3 is reached | high |
| … full profile now (incl. new Intro + new MP4) | 41.46 MB | **92.77 MB** desktop / mobile | non-comparable | +49.79 MB new MP4, +4.77 MB new Intro | — |
| **Same-tab reload**, excl. Intro | 0.08 MB | 0.08 MB | 0 | unchanged (F4: videos from disk cache; revalidations only) | high |
| … Intro on each reload | 2.20 MB | 6.97 MB | non-comparable (new Intro) | **every load still downloads the whole Intro** (F5 contract; F6-B not implemented) | high |
| **New-tab repeat visit**, excl. Intro, excl. new MP4 | 30.10 MB (desktop, mobile, throttled) | **0.08 MB** | **−30.02 MB (−99.7%)** | browser cache through stable URLs (F6-A); 0 new Wall video leases | high (unthrottled + throttled) |
| … new MP4 on the new-tab visit | — | 0.00 MB unthrottled (2 runs); **49.51 MB throttled** (1 run) | — | Chrome's media cache could not serve the large, partly range-filled entry (same URL, cache-flagged attempts, then a network refetch from byte 1,048,576) | medium |
| **Video transfer**, the 10 baseline Wall videos, cold, all stages | 30.00 MB | 29.87–30.00 MB | 0 | no smaller files (F8-B not implemented; existing MP4s not migrated) | high |
| … per complete 11-scenario session | 60.00 MB | 30.00 MB | **−30.00 MB (−50%)** | the new-tab visit is served from cache (F6-A) | high |
| … the two moov-at-end MP4s | 3 requests each per load | 3 requests each | 0 | not migrated (F8-A covers new uploads only) | high |
| **Image and cover transfer**, cold, all stages | 8.71 MB (pictures 4.41 + avatars 0.71 + covers 3.56 + Discord 0.03) | 5.45 MB (4.41 + 0.71 + 0.30 + 0.03) | **−3.26 MB (−37%)** | covers 3.56 → 0.30 MB, −92% (same artwork, provider thumbnail, F7-C); pictures and avatars unchanged in size | high |
| … pictures before interaction, desktop | 4.41 MB | 2.40 MB | −2.01 MB | GIF deferred until stage 3 is near (F7-A) | high |
| **Intro transfer** per load | 2.20 MB (1 request, CDN MISS) | 6.97 MB (1 request, CDN MISS) | non-comparable | different Intro; delivery unchanged (downloaded whole every load) | high (behaviour) |
| **First-frame performance** (Wall videos, loadstart → playing) | 0.03–1.61 s (0.47–1.92 s throttled) | 0.03–0.31 s (0.04–0.55 s throttled) | non-comparable | with the 11-s Intro, stage-1 sources now start 1.6–2.1 s **before** the Wall reveal (baseline: 3 s before, or 4 s after when throttled) | low |
| … "Wall shown after" | 31.3–34.1 s | 11.6–16.1 s | non-comparable | the Intro is 11.0 s instead of 29.6 s; not an optimization | — |
| … TTFB / FCP (cold) | 0.15–2.05 s / 0.28–2.16 s | 0.19–0.86 s / 0.30–0.95 s | within lab variance | no shell change in F6–F8 | low |
| … F8-A fast start (local lab, not TESTING) | 413–430 ms (9 Mbit/s) | 262–269 ms | −35 to −45% | fewer requests (3 → 1) on a remuxed copy | medium (local only) |

**Origins, complete desktop session (comparable set, excl. new MP4):**

| Origin | Baseline | Now | Note |
|---|---|---|---|
| Supabase (`*.supabase.co`) | 71.95 MB (CDN HIT 33.96, MISS 37.84) | 56.23 MB (HIT 19.58, MISS 36.52) | includes the Intro: 6.61 then, 20.90 now. **Excl. Intro: 65.34 → 35.33 MB (−30.01 MB, −46%)** |
| … new MP4 | — | +49.79 MB (HIT 49.74, MISS 0.05) | almost entirely Supabase CDN hits |
| Site worker (Cloudflare) | 0.51 MB | 0.52 MB | HTML / JS / CSS / fonts |
| Third-party (SteamGridDB, Discord) | 3.59 MB | 0.33 MB | **not Supabase traffic** |

**Requests (desktop full session):** 406 → 388 requests; preflights 24 → 25; cache reads 58 → 65.

**Not the same as billed egress:**
- HIT / MISS indicate Supabase's cached / uncached split. Billing additionally depends on headers, retries, rounding and the plan quotas.
- To get the billed delta, read the Usage page (Egress, Cached Egress) before and after a run, as the baseline protocol says.

## 3. Where each saving comes from

| Saving | Mechanism | Measured |
|---|---|---|
| −30.0 MB per new-tab / restart visit (Wall videos) | **browser caching**, through stable published-Wall lease URLs (F6-A) | yes, every profile |
| −3.26 MB per cold visit (covers) | **smaller files**: the same artwork at 267 px (F7-C). Third-party bytes, not Supabase | yes |
| −2.01 MB before interaction, desktop (GIF) | **deferred loading** (F7-A); paid later if the visitor reaches stage 3 | yes; 0 on this mobile Wall |
| Fewer requests, earlier first frame on fast-start files | **fewer network requests** (F8-A) | local lab only; the 2 existing moov-at-end files still make 3 requests |
| Same-tab reload (0.08 MB excl. Intro) | browser caching (F4, unchanged) | yes, as in the baseline |

## 4. F8-A verification

**The published test video:**
- **Independently verified fast start:** its top-level boxes are `ftyp, moov, mdat`, read by Range requests through an ordinary anonymous visitor lease. The check read 0.85 MB: box headers, plus the moov for the server's inspector.
- **The server's own inspector:** H.264 3840×2160, accepted.
- **Playback:** plays with no video errors in all 5 runs.

**Not verifiable:** whether F8-A remuxed it or the source was already fast start. The original file is not available, and its layout (no `free` box before the moov) fits either.

**Existing @black videos:** they did **not** receive F8-A. The two moov-at-end MP4s are byte-identical to the baseline and still make 3 requests each.

**Revisit bytes: not confirmed.** In the throttled run, the new **fast-start** MP4 was downloaded again in full on the new-tab visit (49.51 MB). Chrome's media cache failed on a large entry that had been filled through several ranges; the URL itself was reused. The moov-at-end files revisited from cache in the same run. The earlier assumption that fast start removes the revisit refetch is therefore **not supported**. The refetch appears tied to Chrome's sparse media-cache handling of large, range-filled files, not to moov position.

## 5. Regression checks

- **Visibility, publication, privacy and cache scope:** `scripts/wall-bandwidth/f6a-security.mjs`, 15 live scenarios, all PASS on `5600d06` with the 11-video Wall:
  - published / removed / republished / unpublished-disabled Wall;
  - PRIVATE / unknown GamID;
  - other Wall, corrupt and blocked storage;
  - sign-out, concurrent tabs, browser restart;
  - no signed URL logged or sent elsewhere.
- **Playback:** 0 video errors and 0 page errors in all 5 runs. The only console errors are the pre-existing `favicon.ico` 404s, identical to the baseline.
  - Replay, pause / resume and seek cost 0 MB, as before.
  - Exception: the new 4K MP4 under throttling streamed in ranges (25.64 MB during play, 4.51 MB on replay) instead of being fully buffered at first view.
- **F3 viewport gating:** unchanged. On desktop, stages 2–3 load on scroll; on mobile, stage 2 is on screen at reveal.

## 6. Status matrix

| Item | What | State | Evidence |
|---|---|---|---|
| F1 | Monitor media-light scans (gamid-monitor, approved V2 exception 2026-10-06) | implemented in the Monitor; not part of the visitor page | not re-measured here |
| F2 | bounded Intro derivatives | **ACCEPTED** (Mazen 2026-10-07) | the new Intro is 1920×1080, within the bound |
| F3 | Wall video viewport gating | **ACCEPTED** | behaviour unchanged |
| F4 | tab-scoped video URL reuse | accepted as the implementation baseline | same-tab reload 0 video bytes |
| F5 | native Intro delivery (120 s memory-only lease) | **ACCEPTED** | Intro re-downloaded each load, by design |
| F6-A | cross-tab / restart video URL reuse | implemented, **PENDING_ACCEPTANCE** (Truth `wall-video-url-reuse`) | −30.0 MB per new-tab visit; 15 security scenarios pass; large-file media-cache caveat |
| F6-B | Intro reuse | **not implemented** (Cloudflare terms; the R2 option needs approval) | Intro still 1× per load |
| F7-A | stage-aware picture loading | implemented, **PENDING** Mazen's acceptance (no Truth entry) | −2.01 MB pre-interaction on desktop |
| F7-B | picture display copies | **not implemented** (storage / quality decision) | pictures 4.41 MB unchanged |
| F7-C | same-art cover thumbnails | implemented, **PENDING** (no Truth entry) | covers −92% |
| F8-A | lossless fast start for **new** MP4 uploads | implemented, **PENDING_ACCEPTANCE** (Truth `wall-video-faststart`); Mazen's smoke test passed (not performance acceptance) | the new video is fast start; existing files not migrated; revisit saving not shown |
| F8-B | quality-gated video renditions | **not implemented** (lossy; approval) | Wall video bytes unchanged |

**F1–F8 is therefore not complete:** F6-B, F7-B, F8-B and the existing-file F8-A migration remain open.

## 7. Raw evidence (local only, not committed: they hold hashed paths but the screenshots show a real profile)

- **Current runs:** scratchpad `bw/runs-final/desktop-r1, desktop-r2, mobile-r1, mobile-r2, mobile-t1` (`.json` + stage screenshots).
- **Baseline runs:** `bw/runs/…`.
- **Analysis:** `bw-final.mjs --exclude feef7322ef <runs>` (summary.mjs's byte rule, plus a split for the new object and a per-object table). It reproduces the baseline's published figures exactly: 76.04 / 41.46 / 2.28 / 32.30 MB.
- **Composition and fast-start check:** `bw-composition.mjs`.
- **Intro probe:** `bw-intro.mjs`.

**Per-run totals (MB, comparable set excl. new MP4, incl. Intro):**

| Run | Total | Before interaction | All stages | Reload | Second visit | New MP4 |
|---|---:|---:|---:|---:|---:|---:|
| desktop-r1 (full) | 57.08 | 18.57 | 42.98 | 7.05 | 7.05 | 49.79 |
| mobile-r1 (full) | 57.08 | 30.19 | 42.98 | 7.05 | 7.05 | 49.78 |
| desktop-r2 (key) | 49.90 | 18.57 | 42.62 | 7.05 | — | 49.78 |
| mobile-r2 (key) | 50.03 | 30.42 | 42.99 | 7.05 | — | 49.78 |
| mobile-t1 (full, throttled) | 57.09 | 14.99 | 42.99 | 7.05 | 7.05 | 99.29 (incl. 49.51 on the second visit) |

Baseline, same columns: 76.04 / 19.06 / 41.46 / 2.28 / 32.30 (desktop-r1); mobile-t1 76.06 / 13.26 / 41.47 / 2.28 / 32.30.

**GamID Truth: NO CHANGE REQUIRED** (measurement only).

## 8. Final reconciliation (2026-10-23; documentation only)

Mazen's task "GAMID — F1–F8 DOCUMENTATION RECONCILIATION & CLOSURE". It approves documentation reconciliation, not implementation. The basis is the read-only F1–F8 audit of 2026-10-23 on `feature/mobile-public-wall-visitor-v2` at `7cd3b25`, with TESTING serving `a084cb1`. Nothing was measured again: the figures in §1–§7 remain those of 2026-10-21.

### 8.1 Historical findings (this record, 2026-10-21)

§1–§7 were measured on TESTING `5600d06`, before any acceptance decision and before F8-B1 existed. Their numbers and observations stand as recorded. So does the §6 statement "F1–F8 is therefore not complete", which was correct on that day.

### 8.2 Acceptance decisions taken after this benchmark

- **2026-10-21, REV-0022** (on this benchmark's evidence):
  - F6-A ACCEPTED, with the large-file cache limitation;
  - F7-A and F7-C ACCEPTED;
  - F8-A FUNCTIONALLY ACCEPTED, for new MP4 uploads only;
  - the existing-MP4 migration NOT APPROVED.
- **2026-10-21, later, REV-0023 and DEC-0007:** F8-B1 (conditional, quality-gated 1080p renditions of new oversized MP4s) was implemented, deployed and fully ACCEPTED on TESTING.
  - **REV-0022 predates this.** Its "F8-B: feasibility study only" was accurate when written. F8-B1 is now accepted; only the further F8-B options remain open.

### 8.3 Current verified status (2026-10-23)

| Item | Status | Evidence |
|---|---|---|
| F1 Monitor media-light scans | **IMPLEMENTED and VERIFIED. Formal acceptance evidence not found.** | `gamid-monitor` `9fe1950` (branch `feature/v3-observer-gemini`, not on Monitor `main`). `acceptance/v2/FREEZE.md` records the change as approved by Mazen (2026-10-06). Tests 7 (suite 215/215); one TESTING run with 0 Supabase video bytes. Not GamID product state, so not in Truth. |
| F2 bounded Intro derivatives | ACCEPTED (2026-10-07) | Truth `intro-derivative-f2`: product tip `04877c2`, encoding introduced at `04a67c2`. |
| F3 viewport-gated Wall videos | ACCEPTED (2026-10-06) | `3b9d8b1`; recorded in Truth `public-wall-publishing` notes; served `video-viewport.js` matches the commit except one trailing newline. |
| F4 per-tab video URL reuse | ACCEPTED as the implementation baseline (2026-10-06); mechanism **superseded by F6-A** | `2ccb0f8`; Truth `wall-video-url-reuse` notes. |
| F5 native Intro delivery | ACCEPTED (2026-10-07) | Truth `intro-streaming-f5`; served `intro-source.js` identical. |
| F6-A cross-tab video URL reuse | ACCEPTED (2026-10-21), with the documented limitation | Truth `wall-video-url-reuse`; served file identical. |
| F7-A stage-aware pictures | ACCEPTED (2026-10-21) | Truth `wall-picture-stage-loading`. |
| F7-C same-art cover thumbnails | ACCEPTED (2026-10-21) | Truth `game-cover-thumbnails`. |
| F8-A fast start, new MP4 uploads | FUNCTIONALLY ACCEPTED (2026-10-21), new uploads only | Truth `wall-video-faststart`; served `mp4-faststart.js` identical. |
| F8-B1 conditional renditions | ACCEPTED (2026-10-21) | Truth `wall-video-renditions`; REV-0023, DEC-0007. Live now: migration `20261021120000`, `wall-asset-register` v13, `public-media` v3. TESTING database: 1 READY rendition, 1 rendition object. |

**Read-only checks on 2026-10-23:**
- **Served files:** byte-identical to `a084cb1`, except `video-viewport.js` (one extra trailing newline).
- **Database:** counts only.
- **Edge Function and migration lists:** read.
- **Not verified:**
  - **The deployed worker image** (no Google Cloud access here). Its effect is visible only through the READY rendition.
  - **Physical devices, Safari and Firefox**, as before.

### 8.4 Deferred, not authorized

None of these is completed, rejected, cancelled or approved for implementation. Each would need Mazen's separate authorization.

1. **F6-B, Intro reuse.**
   - The visitor's Intro still comes from a fresh `public-media` lease (at most 120 s) on every load, so the browser cannot reuse it.
   - The worker-proxy plan was not recommended under Cloudflare's CDN terms. Its terms-clean alternative, an R2-hosted Intro, is a separate infrastructure decision. No R2 binding exists.
2. **F7-B, Wall picture display derivatives.** No picture-derivative bucket or code exists under any name; visitors load the original pictures. F7-A changes only when later pictures load, and F7-C uses the provider's own cover thumbnails.
3. **F8-A, migration of existing stored MP4s.**
   - Only new uploads are converted. There is no migration code.
   - The TESTING database holds 5 MP4s that predate F8-A (25.04 MB, 3 of them in published Walls). None of these files has changed since 2026-10-07.
   - The proposed plan stays in `docs/WALL-VIDEO-FASTSTART-F8A.md`.
4. **Further F8-B options beyond F8-B1:** an AV1 rendition, re-encoding every video (WebM / alpha included), renditions for existing videos, and HDR / alpha / 10-bit sources (`docs/WALL-VIDEO-RENDITIONS-F8B-STUDY.md`). None of the 5 existing MP4s exceeds 1080p.

**Review item (not an implementation):** the public crawler route `/@<handle>/intro.webm` (accepted with `public-handle-url`) is live and streams the Intro through the Worker with `Cache-Control: public, max-age=60`. A review against Cloudflare's CDN terms, asked for in `PROJECT_HANDOFF.md` §105, has not been recorded. No change to the route is approved.

### 8.5 Conclusion

**The authorized F1–F8 implementation scope is complete:**
- F2, F3, F4 (superseded by F6-A), F5, F6-A, F7-A, F7-C, F8-A (new uploads, functional) and F8-B1 are accepted.
- F1 is implemented and verified, but its formal acceptance is unverified.

**The broader original F1–F8 proposal is not 100% implemented:** the four scopes in §8.4 are deferred and not authorized.

No performance implementation is currently requested. Nothing here implies Production acceptance.
