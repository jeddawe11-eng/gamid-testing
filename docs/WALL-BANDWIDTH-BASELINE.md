# Public Wall bandwidth baseline (TESTING, after F1–F5, before F6–F8)

Mazen's task "GAMID — FULL WALL BANDWIDTH BASELINE AUDIT" (2026-10-20/21). **Measurement only**: no feature, database, storage, cache-header or deployment change.

- F6 (private-media caching), F7 (picture derivatives) and F8 (lightweight previews) are not implemented.
- Tools: `scripts/wall-bandwidth/` (`harness.mjs`, `analyze.mjs`, `summary.mjs`).

## 1. Environment

| Item | Value |
|---|---|
| Site | `https://gamid-testing-static.gamid.workers.dev/@black` (the deployed TESTING Public Wall Visitor, anonymous) |
| Deployed checkpoint | page stamp `22cbc85` (= `22cbc85b86b8f2eddf4cfb0c1a077e5f59c75b5e`, run `39440094448`; it carries the Mobile Wall Editor V2 product `81c06ba`, whose acceptance is still pending; nothing in this audit touches it) |
| Browser | Google Chrome 155.0.8059.85 (Playwright `channel: "chrome"`, headless), a fresh empty profile per session |
| Desktop | 1440×900, DPR 1 |
| Mobile | Playwright `devices["Pixel 7"]`: 412×915, DPR 2.625, touch, Android Chrome UA. This is browser emulation, not a device |
| Network | unthrottled lab connection; one mobile session repeated with a Fast-4G-like link (9 Mbit/s down, 1.5 Mbit/s up, 150 ms RTT, CDP `Network.emulateNetworkConditions`) |
| Measurement | CDP `Network.*` events per tab: request, response (status, cache flags, selected headers), `dataReceived`, `loadingFinished` / `loadingFailed`, `requestServedFromCache` |
| Date | 2026-10-20 to 2026-10-21 (local time) |

**The Wall (@black, published snapshot, read as an anonymous visitor; nothing was changed):**
- 3 stages, canvas 1000×1778. 10 Wall `<video>` elements.

| Stage | Pictures | Videos |
|---|---|---|
| 1 | one full-stage PNG (941×1672) | a full-stage WebM 720×1280 (10 s), a WebM 1000×439 (4.2 s), four small alpha WebMs (232–290 px, 4 s each) |
| 2 | — | an MP4 848×360 (30.3 s) and a background MP4 1920×1080 (32.2 s) |
| 3 | a GIF 498×211, split into four pieces | an MP4 1920×1080 (14.6 s) and a background MP4 720×1280 (20 s) |

- Also on the Wall: text, GamID blocks and data (Favorite Games covers from SteamGridDB, Duo, Crew), three player embeds (tap to play, never started in these tests), icons and a custom font.
- The page first plays the owner's Intro (a WebM, 2.20 MB); the Wall replaces it about 30–34 s after navigation.
- Media object sizes: Wall videos 30.00 MB in total (11 objects), pictures 4.41 MB, Intro 2.20 MB.

## 2. Method

**How bytes are counted:**
- **Wire bytes** = CDP `encodedDataLength`: bytes received from the network, including response headers.
- Aborted requests count the bytes received before the abort.
- MB = 10^6 bytes; MiB = 2^20 bytes.
- A **cache read** is a response Chrome flags as from the memory, disk or prefetch cache with fewer than 1 KiB from the network. These are never counted as transfers.
- **Correction found during the audit:** Chrome flags some media range fills "from disk cache" while they still carry megabytes from the network. One example is a `bytes=38992-9732095` response with 9.7 MB on the wire, a sparse-cache fill. Those responses are counted as network bytes, never as cache reads.
- Decoded / resource sizes are recorded separately and not used as transfer figures.
- Bytes are attributed to the phase in which they arrived (per `dataReceived` chunk).

**Scenarios** (`--plan full`, one tab, in this order):
1. Cold first visit: empty profile; wait until the Intro ends and the Wall is shown, then 5 s more.
3. Idle 30 s.
4. Every stage: scroll to each stage and stay 8 s.
5. Return to the earlier stages, 5 s each.
6. Play every video completely: per stage, until each visible video's played ranges cover at least 97% of its duration.
7. Replay: one more full loop per stage.
8. Pause all playing videos 10 s, then resume.
9. Seek each video to 80% then 20% of its duration.
2 + 10. Warm reload in the same tab (sessionStorage keeps F4's signed URLs), then play every stage again.
11. Second visit: a new tab in the same browser profile (warm disk cache, new tab session), then play every stage.

- `--plan key` = 1, 4, 6, then a warm reload with every stage.
- Runs: full ×1 desktop, full ×1 mobile, key ×2 desktop, key ×2 mobile, so scenarios 1, 4, 6 and the warm reload ran three times on each profile. Plus the full plan once on mobile with throttling.
- Total measured transfer for the audit: about 0.5 GB, including a smoke run and three short composition reads.

**Not measured:**
- **Supabase billed Egress / Cached Egress:** they are shown only on the Supabase dashboard Usage page, which needs the owner's sign-in. They are not exposed by the CLI, and no stored token or undocumented API was used. This report gives the bytes the browser received from `*.supabase.co`, split by the response's `cf-cache-status` (HIT / MISS), which indicates the cached / uncached split. It is not the billed figure; headers, retries and billing rounding differ.
- **Physical devices and iOS Safari:** not tested.

## 3. Baseline results

Every repeat agreed within 0.01 MB. All media requests were HTTP Range requests answered with 206.

| Measure (cold profile unless stated) | Desktop | Mobile | Repeats |
|---|---:|---:|---|
| **Initial Wall load**, no interaction (Intro, Wall shown, +5 s) | **19.06 MB** (18.18 MiB) | **28.50–28.77 MB** (27.2–27.4 MiB) | 3 / 3 |
| … of which during the Intro, before the Wall shows | 7.83 MB | 21.49 MB (by request start) | full runs |
| **Total to view all stages** | **41.46 MB** (39.54 MiB) | **41.46 MB** | 3 / 3 |
| Idle 30 s at the top | 0.00 MB | 0.00 MB | full |
| Return to visited stages | 0.00 MB | 0.00 MB | full |
| **Watch every video completely** (after viewing the stages) | 0.00 MB (0–0.23) | 0.00 MB | 3 / 3 |
| Replay every video | 0.00 MB | 0.00 MB | full |
| Pause and resume | 0.00 MB | 0.00 MB | full |
| Seek forward / backward | 0.00 MB | 0.00 MB | full |
| **Warm reload, same tab**, then everything again | **2.28 MB** (2.17 MiB) | **2.28 MB** | 3 / 3 |
| **Second visit, new tab** (warm disk cache), then everything again | **32.30 MB** (30.80 MiB) | **32.30 MB** | full |
| Complete 11-scenario session | 76.04 MB (72.52 MiB), 406 requests | 76.04 MB, 405 requests | — |
| Video share of the traffic: cold view of all stages / complete session | 77.7% / 87.6% | 77.7% / 87.6% | — |

- **Throttled mobile (Fast-4G-like):** total 76.06 MB, identical. Bytes shift later in time (13.26 MB before interaction instead of 28.5 MB), but every file is still downloaded once, whole, and replay, pause and seek again cost 0 MB.

**Categories of a cold view of all stages:**

| Category | MB | Share |
|---|---:|---:|
| Wall video | 30.00 | 72.4% |
| Wall pictures + avatars | 5.12 | 12.3% |
| Third-party Favorite Games covers (SteamGridDB) and the Discord avatar | 3.59 | 8.7% |
| Intro | 2.20 | 5.3% |
| JavaScript (88 ES modules) | ~0.31 | 0.7% |
| CSS | ~0.03 | <0.1% |
| API (RPC, `public-media`, `media-poster`, `game-artwork`) | ~0.1 | 0.3% |

**Origins** (complete session, 76.04 MB):

| Origin | MB | `cf-cache-status` HIT | MISS |
|---|---:|---:|---:|
| Supabase (`*.supabase.co`) | 71.95 | 33.96 | 37.84 |
| Cloudflare site worker (HTML, JS, CSS, fonts) | 0.51 | — | — |
| Third-party CDNs (SteamGridDB, Discord) | 3.59 | — | — |

**Initial performance** (cold, per load; the Intro plays first):

| Profile | TTFB | FCP | Wall shown after |
|---|---|---|---|
| Desktop | 0.17–2.05 s | 0.28–2.16 s | 31.7–34.1 s |
| Mobile | 0.15–0.53 s (0.65 s throttled) | 0.30–0.65 s (0.92 s throttled) | 30.8–31.4 s (32.7 s throttled) |

LCP is the Wall itself, just after it appears.

**Playback** (headless Chrome, software decode):
- 0 errors, 0 `stalled`, 0 page errors.
- `waiting` (buffering) events: 36–39 per tab unthrottled, 58 throttled. These are mostly at each video's start and after each seek.
- Dropped frames: 0–13 of 240–1150 per video.
- Decoded resolutions equal the stored sources: 1920×1080, 720×1280, 848×360, 1000×439 and 232–290 px alpha WebMs.
- Displayed boxes: desktop 900 px wide; mobile 412 CSS px, about 1080 device px. For example, the 1920×1080 stage-3 MP4 shows at 900×520 CSS px on desktop and 412×238 CSS px on mobile.
- **Visual quality:** the stage screenshots (local evidence, section 6) show sharp text, artwork and video frames, with no visible degradation. Quality is not inferred from file sizes.

## 4. Network analysis (evidence)

**Video objects:**
- Each Wall video object is downloaded **exactly once, whole, per tab session**: fetched / object size = 1.00× on cold.
- Chrome buffers the complete file on the first view, even throttled (no file exceeds about 10 MB). So every later play, loop, pause, resume and seek in that tab is served from the media buffer or disk cache: 19–40 cache reads, 0 bytes.

**MP4 moov at the end:** two MP4s (9.77 MB and 4.68 MB) have their index at the end of the file. Chrome:
- opens `bytes=0-` and cancels it after about 35–40 KB;
- reads the tail (`bytes=9732096-9772750`);
- then fills `bytes=38992-9732095`.

That is 3 requests instead of 1 and a few tens of KB of overlap. It costs latency rather than bandwidth.

**F3 viewport gating works as accepted:**
- Desktop: stages 2–3 load only when scrolled near (22.40 MB on scroll).
- Mobile: a stage is 733 px tall in a 915 px viewport, so stage 2 is on screen at reveal and its two MP4s (15.7 MB) load before any interaction. That is the whole mobile/desktop difference before interaction.
- Stage 3's videos stay source-free until scrolled to, on both profiles.

**Warm reload, same tab (2.28 MB):**
- Wall videos: 0 bytes. F4 reuses the same signed URLs, so they come from the disk cache.
- JS / CSS: 88 conditional 304s. The site sends `public, max-age=0, must-revalidate`.
- Pictures, avatars and the font: about 620-byte revalidations each (`private, no-cache`, CDN HIT).
- **The Intro is downloaded again whole (2.20 MB, MISS)**: its lease is a new short-lived signed URL on every load.

**Second visit in a new tab (32.30 MB):**
- F4's URL cache is tab-scoped (sessionStorage), so the new tab gets new signed URLs for every video. Their query strings differ, so they miss both the browser disk cache and the Supabase CDN cache: the first request of each object was `cf-cache-status: MISS` in every session.
- **All 30.00 MB of Wall video and the 2.20 MB Intro are downloaded again**, byte-identical, 2.00× / 3.00× per object over the session.
- Pictures and fonts are not re-downloaded (revalidation only). JS was re-sent with 200, about 0.3 MB.

**Pictures:**
- All Wall pictures are fetched at page open, during the Intro, for every stage. Fetches are made with `fetch` → `blob:` from the Storage `authenticated` endpoint, each with a CORS preflight; 24 preflights per cold load.
- This includes the stage-3 GIF (2.01 MB), which is downloaded even if the visitor never reaches stage 3.
- The 941×1672 PNG is 2.40 MB. The owner avatar JPEG is 0.64 MB for a small circle; the Duo avatar is 0.07 MB.

**Third-party:** the four SteamGridDB Favorite Games covers are 3.56 MB (about 0.9 MB each), shown at about 200 px. They are disk-cached by the browser afterwards (8 cache reads on later loads) and are **not Supabase traffic**.

**Requests:** a cold load makes about 137 requests before the Wall shows, plus 24 preflights. 88 are ES modules from the site worker (about 0.31 MB in total).

## 5. Largest measured bandwidth problems (ranked by bytes)

1. **New-tab / repeat visits re-download every Wall video.** 30.00 MB per visit for this Wall, because every visit signs new URLs that miss the browser and CDN caches. Confirmed avoidable at the transport level: identical bytes.
2. **Cold first view: video is 72% of the bytes.** 30.00 MB to see this Wall's three stages, including full-length 1080p backgrounds (9.77 MB for 32 s) shown at 900 or 412 CSS px. Measured, not judged: whether a smaller rendition would look the same needs a quality comparison.
3. **The Intro is re-downloaded on every load**, including a same-tab reload: 2.20 MB × every view, always a CDN MISS. Confirmed avoidable at the transport level: identical bytes, new URL each time.
4. **Pictures of every stage load up front.** 4.41 MB during the Intro, including 2.01 MB for a stage the visitor may never reach. Large originals: a 2.40 MB PNG, a 0.64 MB avatar.
5. **Third-party covers:** 3.56 MB for four covers. Not Supabase Egress.
6. **Lesser:** the moov-at-end MP4s (3 requests each, latency), and 88 JS modules plus 24 preflights per cold load (request count, little bytes).

**Not problems in this measurement:**
- idle, returning to stages, loops / replay, pause / resume and seeking (all 0 MB after the first view);
- pictures, fonts and avatars on reload / revisit (revalidation only);
- the F3 lead-in (it only loads videos that are on screen or within its margin).

## 6. Relevance to F6–F8 (observations only, nothing implemented or assumed)

- **F6 (safe private-media caching):** problems 1 and 3 are exactly cache-key / URL-stability effects. For this Wall that is up to 32.3 MB per repeat visit and 2.2 MB per reload. Any F6 design must keep the accepted visibility rules (ISS-0009, F4's publication gating). Whether a stable cache key can coexist with them is for the F6 design, not this audit.
- **F7 (resized picture derivatives):** problem 4 (a 2.40 MB PNG, a 2.01 MB GIF, a 0.64 MB avatar) is the measurable picture opportunity, about 5.1 MB per cold view. The SteamGridDB covers (3.56 MB) are third-party and outside Supabase.
- **F8 (lightweight previews):** stage-1 videos only start once the Wall is shown. This baseline cannot say whether previews would reduce or add bytes. Measure F8 against the "Initial Wall load" and "Wall shown after" rows.
- **Video renditions** (problem 2) are not F6–F8 as defined in the earlier records. It is listed for completeness only.

## 7. Reproducible post-F6–F8 protocol

Run from the repository root, with Playwright resolved from the sibling `gamid-monitor` checkout (or `--playwright <dir>`). Same Wall (@black, anonymous), same Chrome channel, the same five commands (about 330 MB):

```
node scripts/wall-bandwidth/harness.mjs desktop r1 --plan full --out <dir>
node scripts/wall-bandwidth/harness.mjs mobile r1 --plan full --out <dir>
node scripts/wall-bandwidth/harness.mjs desktop r2 --plan key --out <dir>
node scripts/wall-bandwidth/harness.mjs mobile r2 --plan key --out <dir>
node scripts/wall-bandwidth/harness.mjs mobile t1 --plan full --throttle --out <dir>
node scripts/wall-bandwidth/summary.mjs <dir>/*.json
node scripts/wall-bandwidth/analyze.mjs <dir>/desktop-r1.json --detail
```

- Before comparing, record the deployed page stamp (it is in each run file as `deployStamp`) and the published Wall composition.
- If the owner changed the Wall, the totals are not comparable; compare per-object ratios instead (fetched / object size per load).
- Compare the rows of section 3 one to one. Add a third key repeat only if a result differs by more than 1%.
- To compare Supabase billing, read the Supabase Usage page (Egress, Cached Egress) before and after the runs. Run nothing else in between.
- Run files and screenshots stay outside the repository. They hold hashed object paths only (no URLs, tokens or signed queries), but the screenshots show the owner's real public profile.

## 8. Evidence

- **Local only** (not committed): the run files and stage screenshots, from the 2026-10-20 runs.
  - Run files: `desktop-r1/r2/r3`, `mobile-r1/r2/r3`, `mobile-t1`.
  - Stage screenshots: `desktop-r1-stage1..3.png`, `mobile-r1-stage1..3.png`, `mobile-t1-stage1..3.png`.
- Logged per request: sanitized host + path (Storage object paths hashed, queries dropped), CDP type, method, `Range`, status, cache flags, the selected response headers (`content-range`, `cache-control`, `cf-cache-status`, `age`, `content-type`, `content-length`), encoded and decoded bytes, phases.
- Never logged: apikey / authorization headers or tokens.
