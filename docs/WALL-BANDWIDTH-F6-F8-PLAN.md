# F6–F8 bandwidth optimization plan (research and planning only, 2026-10-21)

Mazen's task "GAMID — F6–F8 Engineering Research & Optimization Plan". **Nothing here is implemented, deployed or accepted.**
- Measured facts come from the baseline (`docs/WALL-BANDWIDTH-BASELINE.md`) and from the research measurements in section 2.
- Every number marked *estimate* is not a measured saving.
- **State verified:**
  - branch `feature/play-together-notifications` at `88ff341`, clean and in sync with its origin;
  - TESTING serves page stamp `22cbc85` (the baseline checkpoint);
  - GamID Truth read and reconciled (section 8). Mobile Wall Editor V2 stays PENDING_ACCEPTANCE and is untouched.

## 1. Current architecture and bottlenecks

How the visitor page (`/@<handle>`) gets each medium today:

| Medium | Path | URL | Browser caching | Authorization |
|---|---|---|---|---|
| Wall pictures, avatars, custom fonts | `fetch` → `blob:` from Storage `object/authenticated/<bucket>/<path>` with the publishable `apikey` header; one CORS preflight each | stable, no token | `private, no-cache` + ETag: revalidated on every load, about 620 B per object, CDN `HIT` | RLS on every request ("published wall media is readable", avatar / font policies). Access ends immediately for new requests (`visitor-no-signing`). |
| Wall videos | `public-media` Edge Function lease (6 h, server-chosen) → signed URL (`?token=`) in `<video src>` | **new token per tab session** (F4 cache = sessionStorage) | reused only while the same URL is reused (same tab); a new tab = new URL = **new cache key** in the browser and at the Supabase CDN | lease decision with the public predicates; a lease stays valid until it expires (accepted residual, ISS-0009 (a)) |
| Intro | `public-media` lease (120 s, memory-only, F5) → signed URL | **new token on every load** | never reused | as above |
| Favorite Games covers | SteamGridDB CDN `<img loading=lazy>`, the grid's full-size `url`, no MIME filter (PNG) | provider URL | provider headers; disk-cached (8 cache reads on later loads) | provider |
| HTML / JS / CSS | Cloudflare Worker static assets | stable | `public, max-age=0, must-revalidate`: 88 module requests per load, 304s on reload | — |

**Verified constraints:**
1. **Each signed-URL token is a separate CDN cache key.** Supabase says so ("Smart CDN treats each unique token as a separate cache key"), and the baseline shows it: the first request of every object was a CDN `MISS` in every new session. Revoking or expiring a token does **not** purge its CDN entry; deleting the object does, within about 60 s. Smart CDN itself is Pro-plan only.
2. **A `<video>` element cannot send the `apikey` header, and Supabase rejects the key as a query parameter.** Research probe: `object/authenticated/wall-video/…?apikey=…` returned **HTTP 400**, the same as no key, and the element failed with `MEDIA_ERR_SRC_NOT_SUPPORTED`. So a token-free, RLS-checked, stable video URL is impossible directly against Supabase. It needs a lease, or a same-origin proxy that adds the header.
3. **Precedent:** the site Worker already has a same-origin proxy for media. `/@<handle>/intro.webm?v=<content-hash>`:
   - checks the identity on every request;
   - streams the Intro from the RLS-checked `authenticated/intro-media` endpoint;
   - passes Range through and forwards `ETag`;
   - sets `Cache-Control: public, max-age=60`;
   - is used today only for social-card crawlers (`og:video`) and is not recorded in Truth.
4. **Chrome's media disk cache needs the MP4 index at the front.** With a reused URL, Chrome served every faststart file (moov before mdat) from disk at 0 bytes. For the two moov-at-end MP4s, its open-ended tail-range read failed against the cached sparse entry (`net::ERR_CACHE_OPERATION_NOT_SUPPORTED`), and the rest was downloaded again (section 2).
5. **Plan limits:** TESTING is on Supabase's Free plan (5 GB uncached + 5 GB cached egress per month).
   - Supabase Image Transformations are Pro-only, WebP-only, 100 origin images included and then $5 per 1,000.
   - The Cloudflare Workers Cache API works for Workers on **custom domains**; TESTING runs on `workers.dev`. Its contents stay per data center, and `cache.put` rejects 206 responses.
   - Cloudflare's service terms say video and other large files must be served through paid services (for example the Developer Platform, Images, Stream). Whether a free-plan Worker streaming video qualifies is **not clear**.

**Bottlenecks** (measured on @black, from the baseline ranking):

| # | Problem | Bytes |
|---|---|---:|
| B1 | A new-tab revisit downloads every Wall video again | 30.00 MB |
| B2 | Cold view: Wall video | 30.00 MB of 41.46 MB (72%) |
| B3 | The Intro is downloaded again on every load | 2.20 MB per load |
| B4 | Pictures of every stage load up front | 4.41 MB, incl. 2.01 MB for stage 3 |
| B5 | Third-party covers | 3.56 MB |
| B6 | Two moov-at-end MP4s: 3 requests each, an aborted first request, and (constraint 4) they defeat cache reuse | — |

## 2. Research measurements (2026-10-21, TESTING, anonymous, read-only)

**(a) Simulated cross-tab lease reuse.** `harness.mjs desktop rvX --plan revisit [--simulate-shared-leases]`: a cold view of all stages, then a new tab of the same profile viewing all stages. With the flag, the new tab starts with the first tab's F4 URL cache. This is instrumentation only; no product code changed.

| | Cold + all stages | Revisit (new tab) + all stages |
|---|---:|---:|
| Today (rv0) | 41.46 MB | **32.28 MB** |
| URLs reused (rv1) | 41.46 MB | **15.70 MB** |

- rv1 revisit = 2.20 MB Intro + 9.65 MB (`7643a7a2dd.mp4`, moov at end) + 3.82 MB (`af9c148ad2.mp4`, moov at end) + about 0.03 MB of revalidations and the rest.
- All six WebMs and both faststart MP4s: **0 bytes** (disk cache).
- Same-tab reload, baseline: 0 Wall-video bytes.

**(b) Encoding experiments on this Wall's own published files.** Fetched as the visitor page does (about 30 MB); FFmpeg 7.1.1 with libwebp, libaom, SVT-AV1 3.0, libvpx and libvmaf.

| Source | Candidate | Size | Change | Quality |
|---|---|---:|---:|---|
| PNG 941×1672 opaque, 2.40 MB | WebP lossless | 1.99 MB | −17% | pixel-exact |
| | WebP q90 | 0.41 MB | −83% | VMAF 96.2, PSNR 33.8 dB (grainy image) |
| | AVIF 4:4:4 CRF 20 | 0.29 MB | −88% | PSNR 43.3 dB, VMAF 94.1 (4:2:0 metric) |
| GIF 498×211, 32 frames, no transparency used, 2.01 MB | animated WebP lossless | 1.45 MB | −28% | pixel-exact |
| | animated AVIF 4:4:4 CRF 18 | 0.71 MB | −65% | not measured (frame timing) |
| MP4 848×360 30 s with **AAC 128 kbit/s stereo** (Wall video always plays muted), 5.95 MB | video-only remux (lossless) | 5.46 MB | −8.3% | identical picture |
| MP4 1920×1080 moov-at-end, 9.77 MB | faststart remux (lossless) | 9.77 MB | 0% | identical; enables constraint 4 |
| MP4 1920×1080 **contain**-fitted (900×520 / 412×238 CSS), 4.68 MB | AV1 CRF 32 | 2.62 MB | −44% | VMAF 96.5 at 900×506, 96.2 at 1082×608, 94.8 native |
| | H.264 CRF 23 slow | 4.49 MB | −4% | VMAF 96.7 / 96.5 / 95.1 |
| MP4 1920×1080 **cover**-cropped background (visible crop is enlarged on screen), 9.77 MB | AV1 CRF 32 | 4.06 MB | −58% | **native VMAF 93.2** (the honest measure here), 95.4 at 1082×608 |
| | AV1 CRF 38 | 2.68 MB | −73% | native 91.8 |
| | VP9 CRF 32 / 36 | 5.10 / 3.61 MB | — | native 88.1 / 86.5 |
| WebM VP9 + alpha 720×1280 10 s (5.3 Mbit/s), 6.65 MB | VP9 + alpha CRF 30 | 4.64 MB | −30% | VMAF 97.9, alpha SSIM 0.996 |
| | VP9 + alpha CRF 36 | 2.93 MB | −56% | VMAF 95.4, alpha SSIM 0.994 |

- Quality bar used: VMAF ≥ 95 on the measure that matches how the file is shown, and alpha SSIM ≥ 0.99.
- These are one Wall's files. Ratios differ per file, so the estimates below are ranges, not promises.

## 3. Feasible solutions compared

| Option | What it does | Repeat-visit saving | Security vs today | Cost / risk | Verdict |
|---|---|---|---|---|---|
| **F6-A cross-tab lease reuse** | keep F4's anonymous published-video URL cache in `localStorage` (same bounds: reuse ends 30 min before the earlier of the token expiry and the 6 h lease; only for assets in the fresh publication manifest; never an authorization decision), shared across tabs | measured −16.6 MB per revisit today; *estimate* −30 MB (32.3 → ~2.3 MB) once B6 is fixed | **unchanged lifetimes**. The URL now survives tab close (still ≤ lease expiry) on that browser | client only, low | **Recommended (step 2)** |
| F6-B Intro via the existing same-origin route | visitors play `/@<handle>/intro.webm?v=<version>`, changed to `private, no-cache` + ETag, with `If-None-Match` / `If-Range` forwarded and 304 passed through | *estimate* −2.2 MB per reload and per revisit | **stronger**: identity + RLS checked on every request, no bearer lease at all | Worker becomes an Intro media path (Cloudflare video-terms question); one identity RPC per range request; Workers free plan 100k req/day | **Recommended after terms confirmation (step 3)** |
| F6-C Wall video via the Worker proxy | the same pattern for every Wall video (stable `/@<handle>/wall/<asset>?v=` URL) | *estimate* revisits ≈ revalidations only, at any age (not bounded by the lease) | stronger (per-request RLS) | all Wall video (30 MB per view) through Workers: terms risk, about 15 range requests per view, no edge cache on `workers.dev` (first views still full Supabase egress) | **Defer**; only if F6-A's window proves too short |
| F6-D server-shared lease (same signed URL for every visitor in a window) | `public-media` returns a cached signed URL per object | browser same as F6-A; CDN `HIT`s across visitors (Cached instead of uncached Egress) | **weaker**: one bearer URL shared by all visitors; CDN entries outlive token expiry (Supabase docs) | migration (lease table), billing gain only | **Reject** |
| F6-E public bucket / long immutable caching | stable public URLs | large | **violates** `visitor-no-signing` / `wall-toggle-preserves` (access must end when unpublished, disabled or PRIVATE) | — | **Reject** |
| F6-F `apikey` query parameter, or a Service Worker injecting headers | stable direct URL | — | — | measured 400; a Service Worker for Range media is complex and fragile | **Reject** |
| **F7-A stage-aware picture loading** | fetch stage N's pictures when the stage is within an IntersectionObserver margin (stage 1 stays eager, during the Intro) | saves pictures of stages never reached (2.01 MB here; 0 when every stage is viewed) | unchanged | client only, low; pop-in risk handled by the margin | **Recommended** |
| **F7-B picture display derivatives** | server-made WebP / AVIF copies (≤ 1280 px or the original size), originals kept, original as fallback | cold view: measured 0.97 MB lossless-only / *estimate* about 3.3 MB quality-gated lossy (−75%) on this Wall | unchanged (same bucket policies; derivative published with its asset) | Cloud Run FFmpeg worker (exists); storage +10–60% of picture originals | **Recommended (lossless first)** |
| F7-C SteamGridDB `mimes=image/webp` (fallback: today's request) | provider sends WebP covers | *unknown* (provider content) | unchanged (provider CDN, no storage) | one parameter in `game-artwork` | **Recommended, measure** |
| Supabase Image Transformations | on-the-fly WebP | — | — | Pro plan + $5 per 1,000 beyond quota, WebP only | **Not on the current plan** |
| GIF → `<video>` | smallest | — | — | changes the element type and its behaviour | **Reject** (animation stays in `<img>`) |
| **F8-A lossless video container hygiene** | for every Wall video upload: a faststart remux (moov first), and drop the audio track (Wall video is always muted) | 0 bytes for faststart itself, but it unlocks F6-A (13.5 MB of the measured revisit); audio −0.49 MB on one file here | unchanged | Cloud Run worker remux (`-c copy`), seconds per file; storage ≈ +1× video until originals policy is decided | **Recommended (step 1)** |
| F8-B quality-gated renditions | per file, keep a re-encode only if it passes VMAF ≥ 95 (display-matched) / alpha SSIM ≥ 0.99 | *estimate* −4 to −6 MB of the 30 MB on this Wall (−13 to −20%) | unchanged | AV1 needs an H.264 fallback (Safari decodes AV1 only on hardware-AV1 devices) → more storage; heavy encode compute | **Later, optional** |
| F8-C persistent posters | a still frame before the video | **adds** bytes (no saving) | — | — | only if a UX need appears (F3 accepted without posters) |
| F8-D HLS / DASH / AV1-only | adaptive streaming | none here: clips ≤ 32 s and ≤ 10 MB are buffered whole; ABR adds player JS, segment requests and cache fragmentation | — | high | **Not justified** |

## 4. Recommended F6 design (secure media caching)

**F6-A (client, `dist/public/published-video-url-cache.js`):**
- Persist the anonymous **published-Wall** video URL cache in `localStorage`, with memory fallback, instead of `sessionStorage`. Keep every F4 rule:
  - key = project origin + bucket + exact object path;
  - consult it only for assets in the **current** server publication manifest (a fresh `get_public_wall` on every load);
  - reuse ends 30 minutes before the earlier of the JWT expiry and issue + 6 h;
  - reject invalid, wrong-object and expired entries;
  - prune on access; cap 120 entries.
- Never used for owner, draft or private signing, and never as an authorization decision.
- No server, migration, lifetime or Truth-contract change. `visitor-media-leases` is unchanged: same lifetimes, and a lease is still valid until expiry.

**F6-B (Worker, `cf-worker/worker.mjs` + the Intro playback path):**
- The public page plays `/@<handle>/intro.webm?v=<computeContentVersion>`, the route that already exists, instead of a 120 s lease.
- The route changes to:
  - `Cache-Control: private, no-cache` (not `public`), so no shared cache stores it;
  - forward `If-None-Match` / `If-Range`;
  - pass 304 through;
  - keep the per-request identity check.
- Revocation becomes immediate for new requests: an Intro that stops being public returns the same 404.
- **Changes the accepted F5 contract `intro-native-delivery`** (memory-only 120 s leases) and the Intro part of `visitor-media-leases`. It needs Mazen's explicit approval, then a Truth update in the implementing task.
- Before F6-B, Mazen confirms that streaming the Intro (≤ 15 MiB derivative) through the free-plan Worker is acceptable under Cloudflare's terms.

**F6-C (Wall video through the Worker):** not proposed now. Revisit it after F6-A + F8-A are measured.

## 5. Recommended F7 design (optimized images)

**F7-A (client, `dist/public/public-wall.js`):**
- `preparePublicWall` keeps fetching stage-1 pictures immediately; they load during the Intro.
- Later stages' pictures are fetched when their stage comes within about one viewport (an IntersectionObserver on the painted stage, the F3 pattern, with the placeholder until ready).
- Pictures already fetched are kept for the page's life (`blob:`), so returning to a stage costs nothing.

**F7-B (worker + data):**
- **Source:** for each new picture asset, the existing Cloud Run worker (FFmpeg) writes display derivatives to a derived bucket with the same read policies and publication rule (the `wall-video-derived` pattern).
- **Formats:**
  - opaque stills → AVIF 4:4:4 (and WebP);
  - stills with alpha → WebP lossless or AVIF with alpha;
  - animated GIF → animated WebP **lossless** (exact; measured −28%), with lossy animated AVIF only after its quality is measured.
- **Size:** at most 1280 px on the long display edge, or the original if smaller. The Wall's maximum is 900 CSS px; phones are about 1080 device px.
- **Delivery:** the publication manifest lists the derivative next to the original. The visitor page requests the derivative and falls back to the original on error or if the browser doesn't support the format.
- **Originals:** never replaced or deleted. The editor and full-resolution viewing use the original.
- **Product decisions for Mazen:** quality thresholds, and whether derivatives count toward the owner's storage quota.

**F7-C (`supabase/functions/_shared/game-artwork.js`):**
- Add `mimes=image/webp` with the current request as fallback.
- Keep `600x900`-class covers: about 520 device px is needed on phones.

## 6. Recommended F8 design (intelligent video loading)

**F8-A (worker, on upload / registration):**
- **Existing pipeline:** `worker/wall-video.mjs` adds a `wall_video_jobs` queue to the **same** Cloud Run Job image as the Intro worker. Its HEVC path already writes faststart, audio-free H.264 (`-an`, `+faststart`, validated by ffprobe). It then *replaces* the HEVC source.
- F8-A would add a remux-only job type for H.264 MP4s that **keeps** the original. Whether a byte-identical-stream remux may instead become the stored copy, to avoid doubling storage, is Mazen's decision.
- For each Wall video, write a playback derivative that is a **lossless remux**: `-c copy -movflags +faststart` for MP4. Drop the audio stream, because Wall video always plays muted.
- WebMs are already index-first; keep them as they are unless the audio rule applies.
- Visitors play the derivative; owners keep their original.
- This is the prerequisite that makes F6-A's measured savings complete: about 13.5 MB of the remaining revisit.
- No quality change by construction.

**F8-B (optional, later):**
- Per-file renditions accepted only by the quality gate: VMAF ≥ 95 on the display-matched measure (native for cover-cropped backgrounds), alpha SSIM ≥ 0.99, alpha kept as VP9 alpha.
- AV1 always ships with an H.264 / VP9 fallback (`<source>` order).

**Unchanged:**
- F3 viewport gating;
- autoplay, muted, loop and inline behaviour;
- Whole-Wall clocks;
- transparent WebM;
- existing 4K support (renditions never replace the original).

## 7. Order, dependencies, cost and benefit

| Step | Work | Depends on | Measured / *estimated* saving (this Wall) | Browser vs billed | Costs | Complexity |
|---|---|---|---|---|---|---|
| 1 | **F8-A** lossless faststart + audio-strip derivatives | the existing `wall_video_jobs` queue in the Cloud Run worker image (redeploying it needs Mazen's Google Cloud access) | 0.49 MB per view of the affected file (measured); enables step 2 | avoided bytes = avoided Supabase egress | storage ≈ video originals ×2 unless only remuxed files are kept; seconds of CPU | medium |
| 2 | **F6-A** cross-tab lease reuse | none (works alone: −16.6 MB measured); full benefit after step 1 | revisit 32.3 → 15.7 MB (measured simulation) → *about 2.3 MB* after step 1 | equal (requests that never leave the browser) | none | low |
| 3 | **F6-B** Intro stable URL + revalidation | Mazen: F5 contract change + Cloudflare terms | *−2.2 MB per reload and per revisit* | first fetch still Supabase egress (via Worker); repeats are headers only | Worker requests | low–medium |
| 4 | **F7-A** stage-aware pictures, **F7-C** WebP covers | none | up to 2.01 MB (unreached stage); covers *unknown* | F7-A = Supabase egress; F7-C = third-party only | none | low |
| 5 | **F7-B** picture derivatives | worker (as step 1) | 0.97 MB lossless (measured); *about 3.3 MB* gated lossy | Supabase egress | storage +10–60% of pictures | medium |
| 6 | **F8-B** renditions (optional) | worker; Mazen's quality review | *−4 to −6 MB* | Supabase egress | storage, AV1 compute | high |

**Session-level estimate** (complete 11-scenario session on this Wall, steps 1–5, not measured):
- 76.04 MB → about 40 MB, roughly −47%;
- most of it from the revisit (−30 MB) and the Intro (−4.4 MB over two extra loads).

**A cold first view gains much less:**
- *about 1.5–3.8 MB* from F7 / F8-A;
- 2.01 MB more only if stage 3 is never reached;
- 4–6 MB more with F8-B.

Today video is mostly paid for once per visitor-browser; the caching steps stop paying for it again.

## 8. Security and privacy assessment

| Item | Risk | Mitigation / verdict |
|---|---|---|
| F6-A persistent lease | A signed published-video URL stays in `localStorage` after the tab closes; anyone with the device could reuse it until expiry (≤ 6 h). The object is public while published anyway. After unpublishing it works until expiry, the **existing** accepted residual (ISS-0009 (a), `visitor-media-leases`). | Same lifetimes and margins. Only used for assets in the fresh manifest, so an unpublished Wall is never rendered from the cache. Cleared on expiry. |
| F6-B Intro via Worker | The Worker streams video. A `public` cache directive would let shared caches keep an Intro after it stops being public. | `private, no-cache` + ETag; the identity check on every request (as today); the same 404 for every refusal. Terms question to confirm. |
| F6-C / F6-D | Shared bearer URL, or CDN entries outliving tokens or unpublishing (Supabase: expiry does not purge the CDN) | Rejected or deferred. |
| F7-B / F8-A derivatives | A derivative could stay readable after its original is unpublished, or be readable without publication | Derived bucket with the **same** published-object policy and lease predicate; deleted with the asset; the editor's delete rules extended to derivatives. |
| Revocation in general | Bytes already downloaded or browser-cached cannot be revoked (already stated in F5). | Unchanged; documented. |
| Third-party covers | Provider CDN, no referrer, no storage | Unchanged by F7-C. |

## 9. Proposed acceptance criteria

Run the harness against the deployed TESTING change. The same Wall, or a synthetic fixture Wall if @black changes.

**F8-A:**
- Every new Wall MP4 playback copy is moov-first, with no audio stream.
- The `revisit` plan (with F6-A) shows 0 bytes for every video object on the revisit.
- Picture identical: frame-hash equality with the original's video stream.
- Playback unchanged on desktop and mobile emulation, plus Mazen's device check.

**F6-A:**
- `harness.mjs desktop r --plan revisit`: the revisit is ≤ 2.5 MB (after F8-A), or ≤ 16 MB before F8-A.
- Zero additional `public-media` video leases on the revisit.
- Reuse never past the expiry margin; an unpublished or disabled Wall shows no video from the cache. Unit tests plus a synthetic-fixture live check.
- No change to the owner's signing.

**F6-B:**
- The reload of the full plan is ≤ 0.2 MB.
- The Intro on revisit costs only revalidation bytes.
- An Intro that becomes non-public returns 404 on the next request (synthetic fixture).
- The 30 s / 31 s timing and Replay are unchanged.
- Truth `intro-streaming-f5` updated.

**F7-A:**
- The cold initial load (before scrolling) drops by the bytes of later-stage pictures.
- Scrolling to a stage shows its pictures without a visible blank (screenshots at every stage, desktop and mobile).

**F7-B:**
- Every derivative passes its format's gate: lossless = pixel-exact; lossy = Mazen's visual review plus the agreed metric bar.
- Transparency and animation preserved.
- The original is still served to the editor.
- Cold view bytes reported per object.

**F7-C:**
- Covers byte count reported, with no initials-only regressions.

**F8-B:**
- Per-file VMAF / alpha-SSIM report with no file below the gate.
- Playback on Chrome, Firefox and Safari (fallback path).

## 10. Before / after benchmark plan

Use the same protocol as the baseline (`docs/WALL-BANDWIDTH-BASELINE.md` section 7): same Wall, same Chrome channel, same plans. Plus the new `revisit` plan:

```
node scripts/wall-bandwidth/harness.mjs desktop r1 --plan full --out <dir>
node scripts/wall-bandwidth/harness.mjs mobile r1 --plan full --out <dir>
node scripts/wall-bandwidth/harness.mjs desktop r2 --plan key --out <dir>
node scripts/wall-bandwidth/harness.mjs mobile r2 --plan key --out <dir>
node scripts/wall-bandwidth/harness.mjs mobile t1 --plan full --throttle --out <dir>
node scripts/wall-bandwidth/harness.mjs desktop rv --plan revisit --out <dir>
node scripts/wall-bandwidth/summary.mjs <dir>/*.json
```

- Run after each step (1 → 5), and record the page stamp (`deployStamp`) and the Wall composition each time.
- Compare against the baseline rows: initial load, all stages, reload, second visit, session, and per-object fetched / size ratios.
- If @black's Wall has changed, compare per object instead of totals.
- `--simulate-shared-leases` is research-only. After F6-A ships, the plain `revisit` plan measures it for real.
- Read the Supabase Usage page (Egress, Cached Egress) before and after each benchmark batch. Budget about 0.4 GB per batch against the Free plan's 5 + 5 GB.

## 11. Prioritized recommendation

1. **F8-A then F6-A.** Lossless and client-light, with the largest repeat-visit saving: measured −16.6 MB per revisit today, *about −30 MB* together.
2. **F6-B.** −2.2 MB per reload or revisit, stronger revocation. Needs the F5 contract decision and the terms confirmation.
3. **F7-A + F7-C**, then **F7-B lossless**. Cheap, no quality risk; lossy picture derivatives only after a visual review.
4. **F8-B** only if cold-view bytes remain the priority after 1–3, with the quality gate.
5. Not recommended: F6-C (for now), F6-D, F6-E, posters as a byte saving, HLS / DASH.

## 12. Opportunities outside F6–F8 (not in scope)

- **Owner avatar:** a 0.64 MB JPEG shown as a small circle, from the accepted Classic avatar pipeline.
- **CORS preflights:** 24 per cold load. They come from cross-origin `fetch` with the `apikey` header; preflight caching is Supabase's `Access-Control-Max-Age`.
- **JS:** 88 unbundled ES modules per load, `max-age=0, must-revalidate`, 304s on reload and 200s again in a new tab (about 0.3 MB). Bundling or versioned immutable asset URLs would cut requests rather than bytes.
- **Wall reveal:** the Wall appears only after the Intro (30–34 s). That is a product design and is not a bandwidth issue.

## 13. Truth reconciliation and sources

- **GamID Truth:** NO CHANGE REQUIRED (research only).
- Implementing **F6-B** would change `intro-streaming-f5` / `intro-native-delivery` and the Intro part of `visitor-media-access` / `visitor-media-leases` (Truth update in that task).
- **F6-A** keeps every Truth contract. F4 is a documented implementation baseline, not a Truth contract.
- **F7-B / F8-A** add derivatives under the existing visibility contracts; record them in Truth only when implemented.

**Repository evidence:**
- `dist/public/public-wall.js`, `dist/public/published-video-url-cache.js`;
- `dist/account/supabase-client.js`;
- `dist/wall-kit/video-background.js`, `dist/wall-kit/video-viewport.js`;
- `cf-worker/worker.mjs`;
- `supabase/functions/_shared/public-media.js`, `supabase/functions/_shared/game-artwork.js`;
- `worker/wall-video.mjs`;
- migrations `20261002120000_wall_public_publishing.sql`, `20260918130500_public_profile_intro_media_read.sql`, `20261010141000_visitor_storage_signing_ban.sql`;
- Product Memory ISS-0009;
- `docs/WALL-VIDEO-URL-REUSE-F4.md`, `docs/WALL-VIDEO-VIEWPORT-F3.md`, `docs/INTRO-STREAMING-F5.md`, `docs/WALL-BANDWIDTH-BASELINE.md`.

**External sources (consulted 2026-10-21):**
- Supabase: [Storage CDN fundamentals](https://supabase.com/docs/guides/storage/cdn/fundamentals), [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn), [Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [Image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations).
- Cloudflare: [Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/), [Service-specific terms (CDN)](https://www.cloudflare.com/service-specific-terms-application-services/).
- IETF: [RFC 9111 HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html).
- MDN: [`<video>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video).
- web.dev: [Browser-level lazy loading](https://web.dev/articles/browser-level-image-lazy-loading).
- caniuse: [AVIF](https://caniuse.com/avif), [WebP](https://caniuse.com/webp).
- SteamGridDB: [OpenAPI](https://www.steamgriddb.com/static/openapi.yml).
- AV1 in Safari: [WebKit bug 311593](https://bugs.webkit.org/show_bug.cgi?id=311593), [testmuai summary](https://www.testmuai.com/learning-hub/av1-browser-support/).

**Not verified:**
- browser support for animated AVIF;
- Chrome's revalidation behaviour for `no-cache` media range entries (to measure in F6-B);
- whether free-plan Workers count as the Cloudflare "Developer Platform" for video.
