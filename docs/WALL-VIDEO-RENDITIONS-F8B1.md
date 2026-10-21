# F8-B1: conditional internal visitor renditions (PARTLY deployed on TESTING 2026-10-21: no READY until the worker ships)

> **Deployment status (2026-10-21, Mazen's choice "partial now, worker later"; details in §8):**
> - **Live on TESTING:** the migration (applied, history recorded), `wall-asset-register` v13, `public-media` v3, and the site (run `39543363692`, stamp `764e3b8`).
> - **NOT deployed:** the worker image (with the VMAF-only static FFmpeg) and the dispatcher, because the deploying machine has no Google Cloud access.
> - **Effect:** eligible new uploads queue as pending and visitors always receive the original.
> - **Not yet done:** READY renditions, the end-to-end test and the TESTING benchmark wait for the worker.
>
> The sections below were written before deployment; §1 and §2 describe the full design.

Mazen's task "GAMID — F8-B1 CONDITIONAL VIDEO RENDITIONS" (2026-10-21): an isolated implementation and testing slice.

- **Branch:** `feature/f8b1-video-renditions` (from `0975104`).
- **TESTING:** still serves `5600d06`. Nothing was deployed, migrated, merged or changed in infrastructure.
- **Study:** `docs/WALL-VIDEO-RENDITIONS-F8B-STUDY.md`.

## 1. What it does

For a **new** MP4 upload on the direct H.264 path only. HEVC conversion jobs, WebM and existing videos are untouched.

1. **Registration (`wall-asset-register`):** the upload is registered exactly as before. Then, from the server's own `moov` reading (tkhd size, video-track `mdhd` duration, sample count), `renditionEligibility` decides.
   - **Eligible:** larger than 1920×1080 in either orientation (OVERSIZED); or a rate above 8 Mbit/s × (pixels / 1920×1080) × (fps / 30) (HIGH_BITRATE).
   - **Skipped:** SMALL (< 1 MiB), EFFICIENT, unreadable timing, or beyond 60 s of 4K30 (processing budget).
   - **The queue:** an eligible upload is queued with `create_wall_video_rendition`. Best effort: a queue failure is only logged, and the upload response is unchanged.
2. **Database (`20261021120000_video_renditions_f8b1.sql`):** it re-checks ownership, the direct path, the stored object's size, the dimensions and the same eligibility rule. One live rendition per asset (idempotent); dispatch through the existing dispatcher.
3. **Worker (`worker/wall-rendition.mjs`, same image and Job):** it runs when no Intro and no HEVC conversion is waiting.
   1. Claims with a **per-attempt claim token and object path**, and streams the original to disk (its size must equal the registered one).
   2. **Refuses immediately if FFmpeg lacks libvmaf** (`VMAF_UNAVAILABLE`); the gate is never bypassed.
   3. Probes the source. HDR, alpha, 10-bit or other formats, and non-H.264 are rejected.
   4. Encodes: H.264 High, CRF 23, `slow`, 2 s GOP, faststart, scaled only down into 1920×1080 (portrait 1080×1920, rotation applied), frame-rate passthrough. **Every audio stream is kept:** AAC / MP3 / Opus are copied, anything else becomes AAC 192k.
   5. Validates codec, size, timing and audio stream count. Copied audio must be **packet-identical** (SHA-256 stream hashes).
   6. Scores VMAF against the source scaled to the rendition's own size, frames paired by index; every frame must be scored.
   7. **Gate:** mean ≥ 95, worst-5% ≥ 90, and the file at least 25% smaller (and ≤ 37.5 MiB).
   8. **Only then:** a service-role upload to the private `wall-video-renditions` bucket, and the database completion, which re-checks every gate value, the token, the object, the size and that the asset still exists with the same original.
4. **Visitors:**
   - `get_public_wall` adds `rendition_path` for an asset **only while its rendition is READY**. `public-media` leases it (6 h, like any Wall video) **only while the asset's original is leasable** (the accepted published / enabled / PUBLIC predicate).
   - The visitor page plays the rendition, and falls back to the original (its own lease, same predicate) if that lease fails. F6-A caches both objects under the same scope.
   - The owner and editor always use the original.

## 2. Storage and quota (Mazen's contract)

- **What counts:** the original counts toward the unchanged 200 MB; the rendition never does. `usage_stored_bytes` and the Usage page's media summary skip only the renditions bucket.
- **Limits unchanged:** the quota, 60 Wall assets and 15 Wall videos are unchanged. A rendition is not a `wall_assets` row and creates no slot.
- **Tracked and bounded:**
  - `public.wall_video_renditions` holds one live row per asset;
  - each object is ≤ 37.5 MiB (bucket limit + constraint), so at most 15 × 37.5 MiB per owner.
- **The bucket:** private, with **no storage policy at all**. Owners and visitors cannot list, read, write or delete it; only the worker and `public-media`'s server-side signing reach it.
- **Cleanup:** a **storage-driven sweep**, `worker_wall_video_rendition_sweep`, lists every object in the bucket that is not a live READY rendition of a still-existing asset nor the current attempt, after a 30-minute grace. That covers failed, superseded, crashed and detached objects, even ones no row names. Deleting an asset detaches its rendition (`asset_id` set null).

## 3. Measurements (OBSERVED locally on isolated copies; nothing uploaded)

**The real worker functions** (i5-12400F, 2 encoder threads, FFmpeg 7.1.1 with libvmaf):

| Source | Plan | Size | VMAF mean / p5 | Audio | Encode / VMAF time | Result |
|---|---|---|---|---|---|---|
| @black's new 4K MP4 (3840×2160, 11.0 s, 36.7 Mbit/s, AAC) | 1920×1080, 30.001 fps, GOP 60 | 50.55 → **13.34 MB (−73.6%)** | **99.49 / 95.77**, 331/331 frames | AAC copied, **bit-identical** | 33.6 s / 12.5 s | **READY** |
| @black's 848×360 clip (1.5 Mbit/s, AAC) | eligible under the literal pixel-scaled rule | 5.95 → 2.24 MB | **91.97 / 87.55** | bit-identical | 6.4 s / 4.8 s | **rejected (QUALITY_GATE)**; the original stays |

**Local Chrome, original versus rendition** (Range server, no cache, 2 runs each, consistent):

| Link | Original 4K | Rendition 1080p |
|---|---|---|
| 9 Mbit/s, 60 ms | first frame 0.80–0.84 s; **not finished after 40 s**; 45.2 MB transferred; 5 stalls; 46% of frames dropped | first frame 1.10 s; plays to the end; **13.34 MB**; 2 stalls; 0–1 frames dropped |
| 50 Mbit/s, 20 ms | first frame 0.22–0.23 s; 49.8 MB | first frame 0.23–0.24 s; **13.34 MB** |

- **What improves:** transfer (−73%) and playability on slower links.
- **What doesn't:** the first frame is not faster (about 0.3 s slower at 9 Mbit/s).

**Estimates (not measured on TESTING):**
- @black's cold all-stages Wall video would go from 79.79 to about 43.3 MB.
- A complete session from 106.9 to about 70 MB.
- The throttled 49.51 MB revisit refetch of this file would, if it still occurs, cost about 13.3 MB.

## 4. Tests

| File | Tests | Covers |
|---|---:|---|
| `tests/wall-video-renditions-f8b1.test.js` | 13 | eligibility (4K, portrait, ultrawide, high-bitrate 1080p, efficient 1080p and 60 fps, 720p, 360p, small, unreadable, too long); the Edge Function (registered first, queued with the server's facts, a queue failure never affects the upload, small / efficient fixtures never queued); plan, arguments, gate and validation; the whole job with every failure path (VMAF missing → nothing encoded; quality / savings / HDR / alpha → rejected, never uploaded; interrupted encode, lost audio, failed upload, refused completion, changed source → failed; temp files removed); the TESTING-only sweep; the visitor page's original-versus-rendition choice, with fallback and malformed-name rejection; dispatcher, image and worker order |
| `tests/wall-video-renditions-f8b1-db.test.js` | 6 | the REAL migration in PGlite over the REAL accepted published predicate and manifest: the queue rules and idempotency; claim tokens; the DB gate re-checks (object, size, quality, savings, box); a lost worker's reclaim (new token and path; the stale attempt can neither finish nor complete) and the 2-attempt timeout; the manifest only while READY; the lease ends on PRIVATE, Disable, republish-without, Unpublish and Delete, and returns on enable or republish; the sweep (stray, superseded and detached objects; never the live or in-flight one; the grace period); quota exclusion; service-role-only privileges, no storage policy, additive SQL |
| `tests/wall-video-renditions-f8b1-native.test.js` | 1, opt-in `GAMID_NATIVE_FFMPEG=1` | real FFmpeg: soft 4K with AAC → READY (audio identical); rotated 4K → 1080×1920 READY; a razor-sharp pattern → **real QUALITY_GATE refusal**; an already-efficient source → **real INSUFFICIENT_SAVINGS** |

**Updated guards** (deliberately, intent kept):
- the `public-media` lifetime table (+ the renditions bucket, 6 h);
- the F6-A scope regex (either form of the same handle / publication / asset scope);
- the `public-my-games` pinned migration list (+ this migration);
- the migration writes the 50 MiB Wall cap as `50 * 1048576`, so the Intro-limit guard (which forbids the literal) stays meaningful.

**Full suite:** 2099 tests, 2097 pass, 0 fail, 2 skipped (the existing F2 native test + this opt-in native test). Lint and typecheck pass.

## 5. Deployment needs (each needs Mazen's separate authorization; NONE applied)

1. **Database:** the migration `20261021120000_video_renditions_f8b1.sql`. Rehearse it in a rolled-back transaction first. It adds a bucket, a table, functions and a trigger, and replaces 4 functions (bodies otherwise identical).
2. **Edge Functions:** redeploy `wall-asset-register` (eligibility + queue) and `public-media` (the renditions bucket).
3. **Worker image (Cloud Run Job), the blocker:** the image installs Debian bookworm's `ffmpeg`, whose `libavfilter8` has **no libvmaf**; Debian trixie's `libavfilter10` has none either. Checked on packages.debian.org.
   - Until the image has libvmaf, every rendition ends `failed VMAF_UNAVAILABLE` and visitors keep the original (safe, but no saving).
   - **Options:** (a) a pinned, checksum-verified static FFmpeg build that includes libvmaf, copied into the image; (b) a multi-stage build of FFmpeg with libvmaf.
   - The Dockerfile already copies `wall-rendition.mjs`.
   - Building and deploying needs Google Cloud access, which this machine lacks.
4. **Dispatcher (Cloud Run service):** redeploy so it accepts `wall_video_renditions`. Until then, a queued rendition waits for the next worker run (any Intro or HEVC dispatch).
5. **Static site:** `public-wall.js`, `published-video-url-cache.js` and `supabase-client.js`, through the established workflow.

**Order:** any order is safe. Without the migration, the Edge Function's queue call only logs a failure, and without `rendition_path` the page plays the original. Recommended: migration → Edge Functions → worker image + dispatcher → site.

## 6. Acceptance plan (proposed)

1. **Upload:** Mazen uploads a new 4K or high-bitrate MP4 to a stage, saves and publishes. The original must play immediately for visitors.
2. **After the worker run:**
   - a read-only service-role check: `wall_video_renditions` READY with its VMAF and size;
   - the anonymous manifest lists `rendition_path`;
   - the harness shows the visitor downloading the rendition instead of the original;
   - the editor still shows the original.
3. **Revocation (live, response-rewriting / anonymous probes, like `f6a-security.mjs`):** PRIVATE, Disable, Unpublish and Delete each end new rendition leases. After a delete, the sweep removes the object after the grace period.
4. **Usage:** the Usage page counts only the original.
5. **Rejection paths:** an already-efficient upload is never queued; an eligible one that fails the gate stays on the original.
6. **Bandwidth:** the final benchmark protocol, with this new file reported separately.

## 7. Risks and limits

- **No VMAF in the current image:** nothing becomes READY until the image changes.
- **The literal pixel-scaled rule** makes low-resolution clips at modest rates eligible (the 360p example). The gate refuses them (a few CPU-seconds). A sub-linear scaling would be a later tuning decision.
- **First frame:** not improved; the gain is bytes and smooth playback on slower links.
- **Processing time:** about 3 CPU-s per second of 4K30 source for encoding plus about 1.1 for VMAF at 2 threads here; the 60 s-of-4K30 budget is about 4 minutes on 2 vCPU if Cloud Run matches this CPU (unverified). The Job timeout is 10 minutes.
- **Not covered:** HDR, 10-bit and alpha sources are skipped; AV1 is not included; existing videos are not migrated.
- **Leases:** already issued rendition leases stay valid until expiry, as with every visitor lease (accepted `visitor-media-leases`).
- **Sweep timing:** the sweep runs at the end of each worker run, so a deleted asset's rendition object can wait until the next run. It is never leasable meanwhile.

## 8. TESTING deployment record (2026-10-21) and rollback

**Reviewed before applying:**
- **Rehearsal:** the migration was rehearsed twice on TESTING inside a transaction that always aborts. Read-only checks returned only booleans and counts:
  - @black's manifest (13 assets) and its 11 leasable videos unchanged;
  - every owner's storage total and the object count unchanged;
  - bucket, no policy, RLS, privileges, grants, eligibility, empty claim / sweep, trigger.
  - Nothing persisted (table, bucket and functions were absent afterwards).
- **A regression the review caught:**
  - TESTING's live `private.get_my_usage_impl` differs from the repository's first version: the custom-fonts migration patched in the **Custom Fonts** quota line.
  - The prepared migration had copied the older body and would have removed that line.
  - Fixed in `71441be`: both usage functions are now patched **in place** from their live definitions (the custom-fonts pattern; a missing target aborts).
  - The PGlite fixture now reproduces the live state, and the second rehearsal confirmed the line is kept.
- **Unrelated remote migration:** `20261020114332_wall_text_living_radiation` is unrelated to the four replaced functions. The other three live definitions were fingerprinted (md5 of the body) and equal the repository's.

**Applied:**

| Piece | Version / evidence | Rollback |
|---|---|---|
| Migration `20261021120000` | one transaction; `migration repair --status applied`; post-checks all true (bucket, no policy, Custom Fonts line kept, summary exclusion, @black unchanged, 0 rendition rows) | see below |
| `wall-asset-register` | v13 (`verify_jwt` true, unchanged) | redeploy the `0975104` source (v12) |
| `public-media` | v3 (`verify_jwt` false, unchanged) | redeploy the `0975104` source (v2) |
| Site | run `39543363692`, stamp `764e3b8`; `public-wall.js`, `published-video-url-cache.js`, `supabase-client.js` served byte-identical | redeploy `5600d06` through the same workflow |
| Worker Job + dispatcher | **NOT deployed** | — |

**Database rollback** (only if needed, in one transaction):
1. Drop the trigger `dispatch_wall_video_rendition`, the rendition functions and `public.wall_video_renditions`.
2. Restore `private.get_public_wall_impl` (20261009170000) and `private.public_media_lease_allowed` (20261010140000).
3. Patch the two usage functions back: remove ` and o.bucket_id<>'wall-video-renditions'` with the same in-place `replace`.
4. Delete the renditions bucket's objects, then the bucket.
5. `migration repair --status reverted 20261021120000`.

Because no rendition exists yet, the table and bucket are empty.

**Live regression after deployment** (TESTING `764e3b8`, anonymous):
- **Security:** `f6a-security.mjs` passes all 15 scenarios with the 11-video Wall.
- **Leases:** `public-media` answers the uniform 404 for an unknown or malformed rendition path.
- **@black's manifest:** no `rendition_path`; 0 rendition rows.
- **Benchmark key runs:**
  - the comparable set is unchanged: desktop 50.03 vs 49.90 MB before; mobile 50.04 vs 50.03 MB;
  - 0 video and page errors; the only console errors are the pre-existing favicon 404s.
- **A one-off stall:** in 1 of 3 desktop runs, the 4K **original** stalled after about 0.5 MB (no error, never played). The other two runs, and both pre-deployment runs, played it completely (49.78 MB, 11.03 s). This is an intermittent behaviour of the heavy original, not a change: the original's lease and path are unchanged while no rendition exists.

**Prepared for the worker deployment (`cf425a8`):**
- **Worker image:** `worker/Dockerfile` gains a separate stage that downloads ONLY a pinned static FFmpeg 8.1.3 GPL build with libvmaf (BtbN `autobuild-2026-10-20-13-08`, `ffmpeg-n8.1.3-18-g46d899d7a0-linux64-gpl-8.1.tar.xz`, sha256 `e2a70912ed207cf412a28aa83f2efde7f9fb5c65370af5ad007ad60076d704a6`). It verifies the checksum and that `libvmaf` is present, then copies the binary to `/opt/vmaf/ffmpeg` (`GAMID_VMAF_FFMPEG`). All encoding keeps Debian's FFmpeg.
- **Build allowlist:** the Cloud Build allowlist gains `worker/wall-rendition.mjs`; without it the build would have failed.
- **Smoke command:** `rendition-smoke`, an in-image synthetic check (no credentials, Storage or user data). It passed locally: VMAF 96.02 / 95.31, audio identical, gate ok.
- **Deploy script:** `worker/cloud-run/deploy-f8b1-testing.sh`, the established F2 pattern. It records the rollback images, builds with Cloud Build, updates the Job **and** the dispatcher service to the same digest, verifies there is no configuration drift for either, and runs `rendition-smoke` and `f2-smoke` (the accepted Intro encoder) in the deployed image.
- **Worker and dispatcher rollback:** `gcloud run jobs update` / `gcloud run services update` to the printed `ROLLBACK_*` images.
- **Pinning caveat:** BtbN prunes old autobuild tags. Once built, the image digest persists, but a later rebuild needs the archive still available (the checksum makes any substitute fail).

## 9. Costs (OBSERVED versus ESTIMATED)

**Observed in this task:**
- **Processing spend:** none. No worker ran on Google Cloud.
- **Egress:** only the regression and benchmark runs' browser traffic. Billed Supabase Egress is not visible here; it is on the owner's Usage page.
- **Local processing** (i5-12400F, 2 encoder threads; §3): about 46 s per rendition of the 11-s 4K clip (33.6 s encode + 12.5 s VMAF), and about 11 s for the rejected 360p clip.

**Estimates.** Prices as of 2026-10-21:
- Supabase Pro: 250 GB uncached + 250 GB cached egress included, then $0.09 / $0.03 per GB; storage 100 GB included, then $0.0213 / GB-month.
- Cloud Run Jobs: $0.000018 per vCPU-s and $0.000002 per GiB-s; 240,000 vCPU-s free per month.
- The Cloud Run CPU speed is assumed to equal this desktop's: unverified.

**Per rendition (the 11-s 4K upload):**
- **Processing:** about 46 s × 2 vCPU ≈ 92 vCPU-s ≈ $0.0017, plus memory (2 GiB × 46 s) ≈ $0.0002 → **≈ $0.002**. The free tier covers about 2,600 per month.
- **Rejected candidates:** they cost their compute too (the 360p example ≈ $0.0005).
- **Storage:** +13.34 MB internal ≈ $0.0003 per month on Pro. On the Free plan, the 1 GB project limit is the real constraint.
- **Image:** about 80 MB more in Artifact Registry (≈ $0.01 / month).

**Delivery** (Wall video only, @black's current Wall viewed through all stages; measured bytes: 79.79 MB per cold view today, 43.30 MB with this rendition READY; the Intro's 6.97 MB per load is unchanged in both):

| Scenario | Today | With F8-B1 | Saved |
|---|---:|---:|---:|
| 1,000 cold full views | 79.8 GB | 43.3 GB | 36.5 GB |
| … if all CDN-cached ($0.03 / GB beyond quota) | $2.39 | $1.30 | $1.09 |
| … if all uncached ($0.09 / GB beyond quota) | $7.18 | $3.90 | $3.28 |
| 10,000 cold full views | 798 GB | 433 GB | 365 GB |
| … cached / uncached beyond quota | $23.9 / $71.8 | $13.0 / $39.0 | $10.9 / $32.8 |
| 10,000 views, realistic: 40% first visits per browser (60% repeats inside the F6-A lease window cost about 0.08 MB of Wall video), 50% reach stage 3 (where the 4K file is) | ≈ 220 GB | ≈ 147 GB | ≈ 73 GB |

**Reading the table:**
- **Who saves:** only Walls holding an oversized upload; the comparable older set saves nothing (efficient uploads are not re-encoded).
- **Pro quota:** the included 250 + 250 GB per month absorb the realistic 10,000-view case either way.
- **Free plan:** its 5 + 5 GB covers about 125 cold full views of this Wall today versus about 230 with the rendition.
- **Billing:** the benchmark saw this file served almost entirely as CDN HITs (cached egress). Browser bytes are not billed bytes.

**GamID Truth: UPDATED** — `wall-video-renditions` PENDING_ACCEPTANCE (checkpoint `71441be`), with a note that no rendition can become READY until the worker ships.
