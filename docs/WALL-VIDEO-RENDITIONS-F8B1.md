# F8-B1: conditional internal visitor renditions (implemented on a branch; NOT deployed, migration NOT applied)

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

**GamID Truth: NO CHANGE** (not deployed). At deployment, the implementing task adds a PENDING_ACCEPTANCE capability with the two contracts in §1–§2.
