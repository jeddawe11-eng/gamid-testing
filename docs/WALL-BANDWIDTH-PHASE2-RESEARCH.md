# Wall bandwidth, phase 2: full resource audit and two pending decisions (research only, 2026-10-21)

Mazen's task "Continue GamID Wall bandwidth optimization on TESTING only", including his mid-task clarification: audit **every** resource of the Public Wall and the Intro. Anything that changes visual quality, storage accounting, an approved contract or infrastructure waits for his approval.

- **Implemented in this task:** F7-A and F7-C only (`docs/WALL-PICTURES-COVERS-F7.md`).
- **Not implemented:** F7-B, F8-A, F8-B, F6-B.

**Sources:**
- the measured baseline (`docs/WALL-BANDWIDTH-BASELINE.md`, desktop full session, cold load);
- live checks on TESTING, anonymous visitor of @black;
- ffprobe of this Wall's published files;
- Supabase / Cloudflare documentation (section 4).

## 1. Every resource of the Public Wall + Intro (cold load of @black, wire bytes)

| Resource | Where it comes from | Cold bytes | Caching on repeat | State / opportunity | Needs approval? |
|---|---|---:|---|---|---|
| **Wall videos** (6 alpha WebMs, 4 MP4s; backgrounds and layers) | Supabase Storage via `public-media` 6 h leases | 30.00 MB to view all stages | F6-A: same URL across tabs → disk cache (revisit 2.28 MB desktop) | 2 MP4s not faststart → intermittent re-download (F8-A); one MP4 carries never-played AAC audio (0.49 MB); bitrates already moderate, renditions F8-B only with the quality gate | F8-A: yes (section 2). F8-B: yes |
| **Intro** (VP9 1280×720, 25 fps, 29.6 s, Opus stereo, 595 kbit/s, 2.20 MB) | `public-media` 120 s lease, memory-only (F5) | 2.20 MB per load | none: new URL on every load, CDN MISS every time | the derivative is already efficient (D3); the only lever is reuse (F6-B, section 3) | yes |
| **Intro poster** (`gamid-intro-poster.webp`) | site | 24.6 KB | 304 revalidation | fine | — |
| **Wall pictures** (PNG 941×1672 2.40 MB on stage 1; GIF 498×211 32 frames 2.01 MB on stage 3, split into 4 pieces) | Storage `authenticated/wall-media`, RLS on every read | 4.41 MB | revalidation (≈620 B each) | F7-A defers later stages (done). Display copies: PNG → WebP lossless −17% (exact) / WebP q90 −83%; GIF → animated WebP lossless −28% (exact) (F7-B) | F7-B: yes (storage + quality) |
| **Stickers / transparent media** | alpha WebM layers (the 4 small 0.09–0.42 MB WebMs, the 6.65 MB 720×1280 WebM) | in the 30 MB above | as Wall videos | VP9 + alpha re-encode CRF 30: −30% at VMAF 97.9, alpha SSIM 0.996 (F8-B) | yes |
| **Favorite Games covers** (SteamGridDB 600×900 PNGs) | provider CDN, no referrer, `max-age=31536000` | 3.56 MB, now **0.30 MB** at DPR ≤ 1.44 (F7-C) | disk cache | done (F7-C); DPR ≥ 1.5 screens keep the full image by design | — |
| **Avatars** (owner 447×447 shown 97×97; a 1224×2700 picture shown 97×215, 0.64 MB) | Storage `authenticated/avatars` (accepted avatar pipeline) | 0.71 MB (+ tiny revalidations) | revalidation | a display-sized copy would save most of the 0.64 MB; it touches the accepted avatar pipeline (Classic) | yes |
| **Discord avatar** (Discord card) | `cdn.discordapp.com`, `max-age=31536000` | 28.5 KB | disk cache | fine | — |
| **Embed posters** (player facades) | GamID `media-poster` function, `public, max-age=21600` | 39.6 KB | disk cache (6 h) | fine | — |
| **Fonts: GamID UI** (Rajdhani, Bebas Neue, Orbitron WOFF2) | site | 37.8 KB | 304 revalidation | fine (already WOFF2, subset-size) | — |
| **Fonts: custom Wall font** (owner's WOFF2, used by "GAME ON START") | Storage `authenticated/wall-fonts`, RLS | 67.5 KB | revalidation | fine | — |
| **Fire effects / animated typography** (Living Fire) | procedural: `living-fire-engine.js` 11.4 KB (+ shared kit modules), drawn in the browser; **no image or video assets** | ≈ 12 KB of JS | 304 revalidation | no network cost beyond the script; CPU / GPU only | — |
| **Text effects** (outline, shadow, neon, gradient) | CSS from validated document data | 0 | — | none | — |
| **Shapes, icons, GamID blocks** | inline SVG / DOM from the document and live public data | ≈ 25 KB of RPC JSON | — | fine | — |
| **JavaScript** (88 unbundled ES modules: wall-kit 156 KB, account 63 KB, public 51 KB, wall 21 KB, other ≈ 15 KB; compressed) | site, `public, max-age=0, must-revalidate` | ≈ 0.31 MB | 88 × 304 on reload; re-sent (200) in a new tab | bundling or immutable versioned URLs would remove about 88 conditional requests per view, but saves few bytes | yes (build / infrastructure change) |
| **CSS** (public, wall-kit, game-details, styles, intro-preview) | site | ≈ 33 KB | 304 | fine | — |
| **HTML** (`/@black` Worker shell, intro-preview frame) | Cloudflare Worker, `max-age=60` | ≈ 3.4 KB | short cache | fine | — |
| **API** (12 RPCs, `public-media` ×11, `game-artwork`, `media-poster`) | Supabase | ≈ 80 KB | no-store / short | 24 CORS preflights per cold load (the `apikey` header on cross-origin `fetch`) — latency, not bytes; preflight caching is Supabase-side | — |
| **Audio** | the Intro's Opus track (intended: the Intro plays sound); the AAC track inside one muted Wall MP4 (never audible) | 0.49 MB unused | — | strip only in a playback copy (F8-A option B) | yes |
| **Third-party players** (YouTube / Twitch / … iframes) | provider, tap to play | 0 until tapped | — | fine (facade + GamID poster) | — |

**Where a cold view's 41.46 MB goes (before F6-A / F7):**
- Wall video 72.4%;
- pictures and avatars 12.3%;
- covers 8.7% (now about 0.7% at DPR ≤ 1.44);
- Intro 5.3%;
- everything else (JS, CSS, fonts, API, posters) about 1.2%.

**Conclusion:** the remaining large items are all media, and every one of them now needs a product decision. The F8-A storage choice, the F6-B Intro contract, F7-B / F8-B derivatives and quality bars, and avatar copies are covered in sections 2–3 and 5.

## 2. F8-A decision: one optimized faststart file vs the original plus a playback copy

> **Outcome (2026-10-21):** Mazen authorized the single-copy lossless direction. It is implemented for **new** uploads as a verified remux in the owner's browser, so no worker is needed (`docs/WALL-VIDEO-FASTSTART-F8A.md`, handoff §106). Existing files wait for a separately approved migration plan.

**The problem (measured):**
- 2 of @black's 4 MP4s are moov-at-end (not faststart).
- Chrome then needs 3 requests per file (an aborted first request, the tail, the middle).
- After F6-A, its media cache can intermittently fail to serve such a file from disk (`net::ERR_CACHE_OPERATION_NOT_SUPPORTED`): 5.80 MB re-downloaded in one of two mobile revisits.
- One MP4 also carries a never-played AAC track (0.49 MB).

| | **A. One optimized file** (in-place lossless remux of the stored object) | **B. Original + playback copy** |
|---|---|---|
| What is stored | the same object path, rewritten with `-c copy -movflags +faststart`; **every audio and video packet bit-identical**; only the container layout changes | the original untouched, plus `<owner>/<asset>.play.mp4` (faststart, optionally audio-free) |
| Exact-file preservation | **no**: the file's bytes and hash change (content identical, provable by stream hashes, e.g. FFmpeg `-f streamhash` before vs after) | **yes** |
| Quality | identical (no re-encode) | identical |
| Audio removal | not possible without losing the original's audio (the original *is* the file) | possible in the copy only |
| Storage accounting | unchanged (size ± a few bytes); **no quota contract needed** | copy ≈ +100% per MP4 (+92% if audio stripped). Either counted toward the owner's 200 MB (doubles video usage) or excluded (a **new storage contract** under `global-usage`) |
| Project storage cost | none | grows against the Free plan's **1 GB project storage** (Pro: 100 GB, then $0.0213 / GB) |
| Reversibility | a remux back is possible but pointless; the old byte layout is not kept unless a temporary backup is made | fully reversible: delete the copies |
| Existing media dependencies | `wall_assets.byte_size` must be updated. Every cached copy of the object changes its ETag: browsers / CDN refetch once (`If-Range` protects range mixing; must be tested). Published snapshots keep the same path; leases unchanged; F6-A entries stay valid (same path) | new column (`playback_path`) on `wall_assets`. `get_public_wall`, `public_media_lease_allowed`, `wall_object_is_published` and the delete / cleanup paths must all know the copy. Worker job type, manifest change, F6-A scope by the copy's path |
| Migration | one worker pass over existing H.264 MP4s that are not faststart (idempotent: inspect box order first, skip faststart files and HEVC jobs); new uploads remuxed at registration | schema migration plus backfill for all MP4s; ongoing double storage |
| Processing cost | seconds per file (stream copy) | the same, plus storage |
| Blockers (both) | worker redeploy needs Google Cloud access (not on this machine) | same, plus the storage-contract decision |

**Recommendation: A. It is the safest *and* cheapest, with three conditions:**
1. Mazen accepts that the stored file's bytes change while every media packet stays bit-identical. The worker proves this per file with stream hashes before replacing it, and refuses otherwise.
2. Audio is kept, so nothing is lost. The 0.49 MB audio saving is dropped from F8-A, or becomes a separate decision.
3. A one-time cache refetch per changed file is acceptable. The ETag change must be tested against F6-A reuse before rollout.

B is only better if exact-file preservation is a hard requirement. In that case it needs the storage contract and costs Free-plan storage.

## 3. F6-B evaluation: Intro delivery

**Today:**
- each Intro view gets a fresh `public-media` lease (120 s, memory-only; F5 `intro-native-delivery`, ISS-0009 remediation);
- a new token is a new browser and CDN cache key, so 2.20 MB is downloaded on **every** load, reload and revisit (measured, always CDN MISS).

**Cloudflare terms (verified 2026-10-21):**
- The Service-Specific Terms (CDN section) say video and large files must be served via specific paid services ("e.g., the Developer Platform, Images, and Stream").
- Cloudflare's own explanation of that clause ("Goodbye, section 2.8") says video is allowed "so long as that content is hosted by a Cloudflare service like Stream, Images, or R2", and "Video and large files hosted outside of Cloudflare will still be restricted on our CDN".
- Workers are not named as a qualifying host.
- **So streaming the Supabase-hosted Intro to visitors through the Worker (the plan's F6-B) appears to conflict with the terms.**
- **Pre-existing finding:** the existing `/@<handle>/intro.webm` route already streams the Supabase-hosted Intro through the Worker for social-card crawlers (low volume). Its compliance should be reviewed by Mazen as well.

**Options:**

| Option | Bandwidth | Security / revocation | Contract / infrastructure | Verdict |
|---|---|---|---|---|
| F6-B as planned (Worker proxy with `private, no-cache` + ETag) | −2.2 MB per reload / revisit (estimate; Chrome media revalidation untested) | stronger (per-request identity + RLS) | changes F5 `intro-native-delivery`; **terms conflict** | **not recommended** |
| Longer Intro lease plus F6-A-style reuse | −2.2 MB per repeat view within the lease | **weaker**: an Intro would keep playing for up to the new lease after the GamID goes PRIVATE (ISS-0009 chose 120 s deliberately) | changes `visitor-media-leases` / F5 | not recommended |
| Same-tab reuse of the existing 120 s lease | only reloads within ≈ 90 s | unchanged | small F5 wording change (memory-only becomes tab-session) | marginal |
| Host the Intro derivative in **R2** behind the Worker (identity check per request, `private, no-cache` + ETag) | −2.2 MB per repeat view; R2 has no egress fees | stronger (per-request check; deleting the object revokes) | new infrastructure (R2 bucket, copy on Intro activation, deletion on change / removal), storage duplication, F5 contract change; terms-compliant (R2-hosted) | the only clean route, but a separate infrastructure decision |
| Do nothing | 2.2 MB per view | unchanged | none | the current state |

**Recommendation:** do **not** implement F6-B as planned. If Intro reuse is worth an infrastructure step, evaluate the R2-hosted option as its own authorized project. Otherwise keep today's delivery: it is already a compact derivative, about 5% of a cold view. Also review the crawler `intro.webm` route against the same terms.

## 4. External sources

- Cloudflare: [Service-specific terms (CDN)](https://www.cloudflare.com/service-specific-terms-application-services/), [Goodbye, section 2.8 (updated ToS)](https://blog.cloudflare.com/updated-tos/), [Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).
- Supabase: [Storage size](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size), [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn), [Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress).
- SteamGridDB: [OpenAPI](https://www.steamgriddb.com/static/openapi.yml) (`thumb` field; the thumbnails were measured live).

## 5. Recommendations waiting for Mazen's approval (not implemented)

1. **F8-A option A** (section 2), after a Google Cloud deployment path exists.
2. **F7-B** display copies for Wall pictures: lossless WebP first, −22% on this Wall; lossy only after a visual review and a storage decision.
3. **Avatar display copies** (the accepted avatar pipeline): a 1224×2700 picture is shown at 97×215.
4. **F8-B** quality-gated renditions (VMAF ≥ 95, alpha SSIM ≥ 0.99).
5. **F6-B:** not as planned; the R2 option only as a separate infrastructure project. Also a review of the crawler Intro route against the terms.
6. **JS delivery:** bundling or immutable asset URLs. A build / infrastructure change; requests rather than bytes.
