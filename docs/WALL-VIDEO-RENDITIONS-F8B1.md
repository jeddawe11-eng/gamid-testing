# F8-B1: conditional internal visitor renditions (TESTING, ACCEPTED 2026-10-21)

> **Status (2026-10-21):** fully deployed on TESTING and **ACCEPTED by Mazen** as final acceptance of the implemented scope (§12).
> - **Live:** the migration `20261021120000`, `wall-asset-register` v13, `public-media` v3, the site (run `39543363692`, stamp `764e3b8`), and the worker Job + dispatcher image built from `3bb2871` (deployed by Mazen in Cloud Shell, §10).
> - **Validated:** end to end on GM-TEST-01 with synthetic media (§10–§11) and with Mazen's own 4K upload (§12).
> - **Later work:** any further improvement is a separate future task.
> - **2026-10-23 reconciliation:**
>   - F8-B1 has stayed live in every later TESTING checkpoint (now `a084cb1`), and Product Memory DEC-0007 and REV-0023 are saved.
>   - The further F8-B options (AV1, re-encoding every video, existing videos, HDR / alpha / 10-bit) are deferred and not authorized.
>   - See `docs/WALL-BANDWIDTH-FINAL-BENCHMARK.md` §8.
>
> §1–§9 are the implementation and deployment record in the order it happened. The earlier partial-deployment state (database, Edge Functions and site live, worker pending) lasted until §10.

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

## 5. Deployment needs (as prepared before deployment; all applied since: §8, §10)

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
| Worker Job + dispatcher | not deployed at this step; deployed later by Mazen from `3bb2871` (§10) | `gcloud run jobs update` / `gcloud run services update` to the `ROLLBACK_*` images in his Cloud Shell log |

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

## 10. Worker deployment and TESTING end-to-end validation (2026-10-21)

**Worker + dispatcher:** deployed by Mazen in Cloud Shell with `worker/cloud-run/deploy-f8b1-testing.sh 3bb2871dc4eafa0bca67ba039e7d02aad87c9729`, after the script's sha256 check. The run reported:
- `F8B1_BUILD_STATUS=SUCCESS`;
- the image-only updates verified for the Job and the dispatcher;
- `rendition-smoke` ok=true (VMAF mean 95.85) in the deployed image;
- `f2-smoke` ok=true (the accepted Intro encoder is unchanged);
- `F8B1_TESTING_WORKER_AND_DISPATCHER_DEPLOYED`.

The rollback images were printed by the script (`ROLLBACK_JOB_IMAGE` / `ROLLBACK_DISPATCHER_IMAGE`) and stay in that Cloud Shell log.

**End-to-end method:** the synthetic fixture account **GM-TEST-01** (`gm_test_01`) and synthetic media only; @black and @zshot untouched.
- The originals were uploaded into its own `wall-video` folder, with the usage gateway's own COMPLETE receipt.
- They were registered with the live `register_verified_wall_asset`, then queued with `create_wall_video_rendition` using the server parser's facts (the exact Edge Function path).
- The Wall was published temporarily (DRAFT → PUBLIC) and everything restored afterwards (§11).

**Processing on the deployed worker** (`wall_video_renditions` timestamps):

| Clip | Queue → READY / refusal | Worker claim → done | VMAF mean / p5 | Size | Result |
|---|---|---|---|---|---|
| E2E-PASS: 4K30 8 s, 43.02 MB, AAC | 08:57:07 → 08:57:57 (50 s, including the Cloud Run cold start) | 33 s (download, encode, VMAF, upload) | 96.325 / 95.254 | 0.78 MB (−98.2%; soft synthetic content compresses far better than real footage) | **READY** 1920×1080 |
| E2E-REJECT: sharp 4K30 3 s, 32.65 MB | 08:57:07 → 08:57:42 | 18 s | 94.685 / 93.360 | not uploaded | **rejected QUALITY_GATE**; the original stays |
| E2E-EFFICIENT: 1080p30 20 s, 5.47 MB | — | — | — | — | **not queued** (`RENDITION_NOT_ELIGIBLE` from the database's own re-check) |

- The dispatcher accepted both renditions' dispatches (HTTP 202).
- The VMAF values equal the local pre-run to three decimals.

**Visitor delivery on TESTING** (`/@gm_test_01`, Chrome, fresh profile, desktop 1440×900, 30 s window). "Original" = the same page with only the rendition's lease refused in the browser: this is also the **fallback test**.

| Link | Served | First frame | Played in 30 s | Dropped | E2E-PASS bytes |
|---|---|---|---|---|---|
| unthrottled | **rendition**, 1920×1080 | 0.17–0.48 s | all 8 s, looping | 0 / 867 | **0.78 MB** |
| unthrottled | original (fallback), 3840×2160 | 0.29–0.61 s | all 8 s, looping | 0 / 861 | 43.03 MB |
| 9 Mbit/s | **rendition** | 0.17–0.44 s | all 8 s, looping | 0 / 865 | **0.78 MB** |
| 9 Mbit/s | original (fallback) | 1.95–2.20 s | **1.5 s of 8 (stuck)** | 0 / 48 | 16–25 MB and still loading |

- **Supporting checks:**
  - 3 rounds per condition;
  - the "stall" events counted at each loop restart are equal in every condition, so they are excluded as a measure;
  - 0 page errors.
- **The other video:** the REJECT clip played its original in every run, as designed.

**Owner, editor and Usage** (owner RPCs called as GM-TEST-01 through a JWT claim, inside a rolled-back transaction):
- **`list_my_wall_assets`** (what the editor uses) returns only original paths; no rendition is mentioned anywhere.
- **`get_my_usage_impl`:** `used_bytes` and the Wall media line = **81,138,924 = exactly the three originals**. The 776,489-byte rendition is excluded.
- **Asset slots:** 4 = 1 pre-existing + 3 synthetic; the rendition created none.

**Revocation** (anonymous manifest + `public-media` lease status for the rendition and its original after each change):

| State | Manifest | Rendition lease | Original lease |
|---|---|---|---|
| published, PUBLIC | lists the rendition | 200 | 200 |
| GamID PRIVATE | none | 404 | 404 |
| PUBLIC, Wall disabled | none | 404 | 404 |
| Wall enabled | lists the rendition | 200 | 200 |
| unpublished | none | 404 | 404 |
| republished (same document) | lists the rendition | 200 | 200 |

**Deletion:**
- The owner republished without the video, then `delete_my_wall_asset` (real owner RPC) deleted it, and the original was removed as the client does.
- The rendition was detached at once (`asset_id` null), dropped from the manifest, and its lease is 404.

**Cleanup by the real worker:**
- **Waiting out the grace:** once the 30-minute grace had passed (09:28:06), the detached rendition became the single sweep candidate.
- **The trigger:** re-queuing the REJECT clip dispatched one genuine worker run (09:28:21 → 09:28:49, rejected again).
- **The result:** its closing sweep deleted the orphan. By 09:29:05 there were 0 rendition objects and an empty sweep list.

## 11. Restore, costs and remaining items

**Restored:** GM-TEST-01 matches its recorded baseline exactly:
- DRAFT, with only its earlier asset `20694c6e`;
- 0 publications and the same draft fingerprint;
- 0 stored objects, 0 bytes, 41 receipts (the 3 test receipts removed).

**Removed:** the synthetic assets went through the owner RPC and their originals through Storage; the synthetic rendition rows were deleted. The whole project then has 0 rendition rows and 0 rendition objects.

**Protected accounts:** @black and @zshot are untouched: both PUBLIC, @black's manifest still 13 assets with no rendition.

**Processing, OBSERVED** (database timestamps of the deployed worker):
- E2E-PASS: 33 s from claim to READY, 50 s from queue including the Cloud Run start.
- E2E-REJECT: 18 s from claim; 28–35 s from queue.
- Cloud Run billing for these executions is not visible here; read it in Google Cloud Billing.

**Processing, ESTIMATED:** at most about 50 s × 2 vCPU per execution ≈ 100 vCPU-s ≈ $0.0018, plus about $0.0002 memory, so **about $0.002 per rendition attempt** (rejected ones cost the same).
- This test's 4 Job executions plus the 2 deploy smokes are about 600 vCPU-s, inside the free 240,000 vCPU-s per month, so likely $0 billed.

**Delivery, OBSERVED on TESTING** (synthetic E2E-PASS clip): 43.03 → 0.78 MB per view. Soft synthetic content; real footage compresses far less.

**Delivery, real-content figures** (@black's 4K, measured locally in §3): 50.55 → 13.34 MB per view (−73.6%). Wall video bytes for that one file, billed only beyond the plan's included egress (Pro: 250 GB uncached + 250 GB cached):

| Views | Original | Rendition | If all CDN-cached ($0.03 / GB) | If uncached ($0.09 / GB) |
|---|---:|---:|---|---|
| 1,000 cold views | 50.6 GB | 13.3 GB | $1.52 → $0.40 | $4.55 → $1.20 |
| 10,000 cold views | 506 GB | 133 GB | $15.17 → $4.00 | $45.50 → $12.01 |
| 10,000 views, realistic (40% first visits per browser, F6-A serves repeats from cache; 50% reach the video's stage) | 101 GB | 26.7 GB | $3.03 → $0.80 | $9.10 → $2.40 |

- **Storage:** about +13.3 MB internal per such upload ($0.0003 / month); uncounted for the owner.
- **Billing:** browser bytes are not billed bytes; the owner's Supabase Usage page shows the billed figures.

**Remaining before acceptance:**
- **A real browser upload by Mazen:** this test used the Edge Function's exact RPC calls with the server parser's facts, but not the deployed `wall-asset-register` v13 handler itself, because the agent does not sign in as a persona. Upload a new 4K MP4 to a stage and publish, then check READY and the visitor transfer.
- **Physical devices, Safari and Firefox:** not tested.
- **Existing videos:** not migrated, by design.

## 12. Real-user upload verification and final acceptance (2026-10-21)

**Mazen's own upload.** In his Wall Editor, he uploaded a real 4K color-bar MP4 (about 24 MB) on `@black`, placed it on stage 3, saved and published, and confirmed it plays for a visitor. This was investigated read-only; nothing of his was changed.

| Check | Evidence |
|---|---|
| Upload + registration | asset `7f301afd`: 3840×2160, 25,148,899 bytes, 10 s, 300 frames (30 fps); object 09:54:47, registered 09:54:50; direct H.264 path. The file was already fast start (FFmpeg layout `ftyp, moov, free, mdat`), so F8-A correctly left it unchanged. |
| Rendition job | created 09:54:50, the same second as registration, by the deployed `wall-asset-register` v13 |
| Status | **READY**, attempt 1: claimed 09:55:03, READY 09:55:58 (55 s on the worker; about 68 s from upload) |
| Gate | VMAF mean 95.239 (≥ 95), worst-5% 93.710 (≥ 90). Size 3,285,412 bytes = 13.1% of the original (≥ 25% saving). 1920×1080, fast start. Color bars are close to a worst case for the quality metric, hence the narrow margin. |
| Visitor (anonymous Chrome on `/@black`, stage 3) | the stage-3 video streams the **rendition**: 3.29 MB, decoded 1920×1080, all 10 s played, 0 / 438 frames dropped; 0 bytes of the original |
| Fallback (only the rendition lease refused in that browser) | the original plays: 25.16 MB, 3840×2160, all 10 s, 0 / 424 frames dropped |
| Editor | the owner's `list_my_wall_assets` shows the original path; no rendition anywhere |
| Usage | `used_bytes` 119,919,397 = exactly the counted objects; the 3,285,412-byte rendition is uncounted; 12 of 15 video slots, none taken by the rendition |
| Processing cost (estimate) | about $0.003 for this conversion; within the Cloud Run free tier (actual billing in Google Cloud Billing) |

**Acceptance:** Mazen explicitly ACCEPTED F8-B1 on TESTING on 2026-10-21, after the synthetic end-to-end tests and this real-upload verification. This is the final acceptance of the implemented scope; further improvements are separate future tasks.

**Accepted scope** (the contracts in Truth `wall-video-renditions`):
- **Who gets a rendition:** new direct H.264 MP4 uploads above 1920×1080, or above 8 Mbit/s at 1080p30-equivalent.
- **The rendition:** H.264 CRF 23 within 1920×1080, the source frame rate, all audio kept.
- **The gate:** VMAF mean ≥ 95 and worst-5% ≥ 90, at least 25% smaller, checked by the worker and the database.
- **Storage:** the original kept and counted; the internal rendition uncounted, bounded and swept.
- **Visitors:** they receive it only while it is READY and its original is leasable, with the original as fallback; the owner and editor use the original.

**Known limitations** (accepted as is; any change is future work):
- **Existing videos** are not converted.
- **HDR, alpha and 10-bit** sources are never re-encoded.
- **First frame:** not faster on fast links. The gain is smaller transfers and smooth playback on slower links.
- **Wasted compute on small clips:** the linear pixel-scaled bitrate rule makes some low-resolution clips candidates that the gate then rejects (a few CPU-seconds each, no visible effect).
- **Not tested:** physical devices, Safari and Firefox.
- **Pinned FFmpeg build:** a later image rebuild needs the pinned BtbN archive to still exist; the checksum refuses any substitute.
- **Sweep timing:** the sweep runs at the end of worker runs, so a deleted asset's internal rendition can wait until the next run. It is never leasable meanwhile.

**GamID Truth: UPDATED** — `wall-video-renditions` is **ACCEPTED** (checkpoint `3bb2871`).
