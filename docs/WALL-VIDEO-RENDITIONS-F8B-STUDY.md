# F8-B: Wall video renditions, feasibility study (2026-10-21; study only, NOTHING implemented)

Mazen's task "GAMID — F6–F8 Acceptance, Product Memory & F8-B Feasibility Study".
- **No change was made** to any video, upload policy, database, storage object, quota (200 MB, 60 Wall assets, 15 Wall videos) or accepted media contract.
- **The experiments ran locally** on isolated copies of @black's published Wall videos (read as an anonymous visitor reads them; never committed) and on synthetic clips.
- **Reference:** `docs/WALL-BANDWIDTH-FINAL-BENCHMARK.md` (TESTING `5600d06`).

## 1. Where the video bytes are today (measured)

- **A cold view of all stages of @black's Wall** transfers 79.79 MB of Wall video:
  - 30.00 MB for the 10 baseline videos;
  - 49.79 MB for the new 4K MP4 (50.55 MB file).
- **Repeat visits** cost about 0 MB of Wall video (F6-A), except the measured throttled refetch of the 4K file (49.51 MB).

| Source (Wall) | Size | Video rate | Content |
|---|---:|---:|---|
| new MP4, stage 3, 3840×2160 H.264 30 fps, 11.0 s, plus an AAC track | 50.55 MB | **35.9 Mbit/s** | dark bokeh particle field, constant motion |
| background MP4, stage 2, 1920×1080, 32.2 s | 9.77 MB | 2.4 Mbit/s | animated character art, drifting smoke (cover-cropped background) |
| layer MP4, stage 3, 1920×1080, 14.6 s | 4.68 MB | 2.6 Mbit/s | high-detail character close-up |
| layer MP4, stage 2, 848×360, 30.3 s, plus AAC | 5.95 MB | 1.5 Mbit/s | dark 3D cinematic, particles |
| background MP4, stage 3, 720×1280, 20 s | 1.99 MB | 0.8 Mbit/s | (not re-encoded here) |
| 6 WebMs (VP9; 4 with alpha) | 7.62 MB | — | stage 1 layers; the 6.65 MB 720×1280 alpha WebM was measured earlier (F6–F8 plan §2) |

**The decisive fact:** the three older 1080p/360p MP4s are already efficient, at 1.5–2.6 Mbit/s. The new 4K upload runs at 36 Mbit/s for a Wall element that is never shown wider than about 1800 device px:
- the desktop Wall is 900 CSS px (1800 at DPR 2);
- a phone is about 1080 device px.

## 2. Method (local, isolated)

- **Machine and tools:** Intel i5-12400F (12 threads), FFmpeg 7.1.1 (libx264, libvpx-vp9, SVT-AV1, libvmaf v0.6.1).
- **Sources:** the four real MP4s above, trimmed to 11–14.6 s, plus a **synthetic gameplay stress clip**: 1920×1080 at 60 fps, a fast pan over real high-detail art, small HUD text (14, 16 and 18 px), a minimap and bars, and temporal film grain. A **grain-free** variant was used for the text test.
- **Candidates** (video only; GOP 2 s; MP4 with faststart):
  - H.264 High, `slow`, CRF 20 / 23 / 26;
  - VP9 CRF 33;
  - AV1 (SVT preset 6) CRF 30 / 35 / 40;
  - each at 1080p, plus 720p for H.264 CRF 23, VP9 CRF 33 and AV1 CRF 35.
- **Quality:**
  - VMAF mean and **5th percentile** (to catch fast-motion drops), against the source scaled losslessly to **1920×1080**. That is the highest resolution any Wall display needs, and for the cover-cropped background it is the honest native measure.
  - Also VMAF at **960×540** (about the 900 CSS px desktop Wall at DPR 1).
  - SSIM on the HUD text crops, and zoomed crops inspected by eye.
  - Frames were paired by index. Timestamp pairing mis-paired every third frame on these files: a measurement trap, recorded so it isn't repeated.
- **CPU:** FFmpeg `-benchmark` user + system seconds on this machine, including decoding the source.

**Limits of the method:**
- The real Wall clips are stylized game art. There is **no real HUD gameplay capture**; the synthetic clip stands in for it.
- No physical device and no Safari or Firefox playback test were done.
- The rates were not tuned per title.

## 3. Results (measured)

**VMAF** = mean / 5th percentile at 1920×1080 (native for the 848×360 clip). "Size" is relative to the source's own video stream.

**4K 36 Mbit/s bokeh (11 s, video 49.36 MB):**

| Candidate | MB | vs source | VMAF | VMAF @960×540 | CPU-s per video-s |
|---|---:|---:|---|---:|---:|
| H.264 CRF 20, 1080p | 17.86 | −64% | 99.8 / 99.8 | — | 11.3 |
| **H.264 CRF 23, 1080p** | **13.21** | **−73%** | **99.5 / 96.1** | 99.9 | 10.3 |
| H.264 CRF 26, 1080p | 9.86 | −80% | 98.3 / 90.3 | 99.7 | 9.7 |
| VP9 CRF 33, 1080p | 10.42 | −79% | 99.6 / 96.9 | — | 15.0 |
| AV1 CRF 30, 1080p | 9.23 | −81% | 99.6 / 96.8 | — | 20.9 |
| **AV1 CRF 35, 1080p** | **6.91** | **−86%** | 98.9 / 92.2 | 99.9 | 20.0 |
| AV1 CRF 40, 1080p | 5.06 | −90% | 97.4 / 87.1 | — | 22.0 |
| H.264 CRF 23, 720p | 7.50 | −85% | 97.3 / 88.2 | 99.7 | 6.0 |
| AV1 CRF 35, 720p | 4.49 | −91% | 96.0 / 84.2 | 99.5 | 7.5 |

**Already-efficient 1080p sources:** animated art 2.55 Mbit/s (3.83 MB / 12 s); close-up 2.56 Mbit/s (4.68 MB / 14.6 s).

| Candidate | Animated art: MB, vs source, VMAF | Close-up: MB, vs source, VMAF |
|---|---|---|
| H.264 CRF 20 | 5.32, **+39%**, 95.4 / 93.9 | 7.07, **+51%**, 96.1 / 95.2 |
| H.264 CRF 23 | 3.93, +3%, 94.0 / 92.3 (96.3 @540) | 5.26, +12%, 95.2 / 94.1 (96.7 @540) |
| H.264 CRF 26 | 2.80, −27%, 91.7 / 89.7 | 3.82, −18%, 93.4 / 92.2 |
| VP9 CRF 33 | 1.99, −48%, 92.3 / 90.6 | 2.97, −37%, 93.7 / 91.3 |
| AV1 CRF 30 | 2.00, −48%, 93.5 / 92.1 | 3.56, −24%, 95.2 / 94.3 |
| AV1 CRF 35 | 1.44, −62%, 92.4 / 90.8 (95.3 @540) | 2.57, −45%, 94.5 / 93.5 (96.2 @540) |
| any codec at 720p | VMAF 85.6–86.4 native; 93.8–94.5 @540 | VMAF 87.9–89.7 native; 94.8–95.7 @540 |

**Dark 3D cinematic, 848×360 at 1.5 Mbit/s:**
- H.264 CRF 20 is −62% at VMAF 94.6 / 93.2.
- AV1 CRF 30 is −84% at VMAF 93.4 / 91.3.
- Nothing reaches 95. A low-CRF point (≤ 18) was not tested.

**Synthetic 60 fps gameplay with grain** (CRF 10 reference, 460 Mbit/s):
- **Sizes swing wildly with grain:** H.264 CRF 20 = 120 MB / 10 s, CRF 23 = 15 MB, VP9 CRF 33 = 50 MB, AV1 CRF 35 = 4.6 MB. Every candidate scores VMAF ≥ 93.5 at 1080p.
- **Lesson:** grainy or noisy captures make H.264 and VP9 sizes unpredictable. A size gate is needed, not just a CRF.

**Small HUD text, grain-free 60 fps pan:**

| Candidate | Rate | VMAF | HUD SSIM (18 px / 14 px) | Inspection |
|---|---:|---:|---|---|
| H.264 CRF 23, 1080p | 8.8 Mbit/s | 100.0 | 0.971 / 0.959 | crisp |
| H.264 CRF 26, 1080p | 6.6 Mbit/s | 100.0 | 0.960 / 0.940 | crisp |
| VP9 CRF 33, 1080p | 2.1 Mbit/s | 100.0 | 0.984 / 0.976 | crisp |
| AV1 CRF 35, 1080p | 2.5 Mbit/s | 100.0 | 0.985 / 0.976 | crisp |
| H.264 CRF 23, **720p** | 3.2 Mbit/s | 99.3 | 0.923 / **0.869** | 14 px text visibly soft and haloed |
| AV1 CRF 35, **720p** | 1.6 Mbit/s | 99.9 | 0.936 / **0.873** | 14 px text visibly soft |

**Quality conclusions:**
1. **A 1080p rendition of an oversized source is visually lossless for the Wall:** the 4K file at CRF 23 is VMAF 99.5 / p5 96.1 at a 1080 display.
2. **720p is not acceptable as the general rendition:**
   - it measures VMAF 86–89 on real 1080p art at native resolution;
   - small HUD text visibly degrades;
   - it is only acceptable for small or DPR 1 elements (about 94–96 at 960×540).
3. **Re-encoding an already-efficient upload is not worth it:**
   - with H.264 it is larger or barely smaller below VMAF 95;
   - AV1 / VP9 save 24–62% but land at VMAF 92–95 native (generation loss);
   - the gain is small in absolute bytes (≈ 1–3 MB per clip).
4. **AV1 is about half the size of H.264** at equal VMAF on the 4K source (6.9 vs 13.2 MB), at about twice the CPU.

## 4. Bandwidth estimates (estimates derived from the measured ratios; @black's Wall)

| Scenario | Today (measured) | A: conditional H.264 1080p | B: A + AV1 1080p for AV1 browsers | C: re-encode every video (AV1 CRF 35; VP9-alpha CRF 36 for WebMs) |
|---|---:|---:|---:|---:|
| Wall video, cold view of all stages | 79.79 MB | **≈ 43.2 MB** (−46%) | ≈ 36.9 MB (−54%) | ≈ 19–20 MB (−75%), but VMAF 92–95 on the 1080p art: fails the gate |
| Comparable baseline set only (excl. new MP4) | 30.00 MB | 30.00 MB (no file triggers) | 30.00 MB | ≈ 12–13 MB, but fails the quality gate |
| New-tab repeat visit | 0.08 MB; 49.51 MB in the throttled refetch case | 0.08; the refetch case ≈ 13.2 MB if it still occurs (smaller file; unmeasured) | same | same |
| Complete 11-scenario session, desktop (incl. the 6.97 MB × 3 Intro) | 106.87 MB | ≈ 70.3 MB (−34%) | ≈ 64 MB | — |

- **A** re-encodes only the 4K file (≈ 13.2 MB instead of 50.55). The 1080p MP4s, the 360p clip and the WebMs stay original.
- **Optional:** the 6.65 MB alpha WebM re-encode measured earlier (VP9 alpha CRF 30, −30% at VMAF 97.9, alpha SSIM 0.996) would add about −2.0 MB.
- **Who benefits:** the saving exists only where an owner uploads an oversized video. The visitors' other Walls gain nothing unless they hold such files.

## 5. Infrastructure cost (estimates; assumptions stated)

**Prices:**
- Supabase: Pro includes 100 GB storage, then $0.0213 / GB-month; 250 GB uncached + 250 GB cached egress included, then $0.09 / $0.03 per GB. Free: 1 GB storage, 5 + 5 GB egress.
- Cloud Run Jobs: $0.000018 per vCPU-s and $0.000002 per GiB-s; 240,000 vCPU-s free per month.
- R2: about $0.015 / GB-month, no egress fees.
- Sources: section 9.

**Supabase storage:**
- Option A keeps the original **and** adds a rendition: +13.2 MB for this 4K file (+26% of it); zero for files that don't trigger.
- **Money is negligible; the constraints are elsewhere.** At $0.0213 / GB-month that is under $0.001 per month per file. The real constraints are:
  - **(i) Mazen's decision whether renditions count toward the owner's 200 MB quota.** If they do, an owner's oversized upload costs 1.26× its size.
  - **(ii) the project-wide 1 GB if TESTING is on the Free plan.**

**Supabase egress, per 1,000 cold full-Wall views of this Wall (Wall video only; browser bytes are not billed bytes):**
- **Today:** 79.8 GB. The benchmark saw the new file almost entirely as CDN HITs, i.e. cached egress: about $2.39 at $0.03 if all cached, $7.18 if all uncached, beyond the plan quota.
- **Option A:** 43.2 GB, about $1.30 / $3.89.
- **Reality check:** Free-plan egress (10 GB in total) covers only about 125 such views per month today, about 230 with A.
- **These are illustrations.** The billed figure needs the owner's Usage page.

**Processing (Cloud Run Job, 2 vCPU, the existing worker image pattern):**
- **Time and money:** H.264 1080p from this 4K clip took 114 CPU-s, about 57 s wall on 2 vCPU if a Cloud Run vCPU matches this desktop core (an unverified assumption). That is ≈ $0.0021 CPU + ≈ $0.0002 memory per clip, and the free 240,000 vCPU-s cover about 2,000 such clips per month.
- **The worst-case delay is long uploads:** a 50 MiB 1080p clip at 2.5 Mbit/s is about 160 s of video ≈ 700 CPU-s ≈ 6 min on 2 vCPU. Only clips above the trigger are processed.
- **AV1 / VP9** need about 2× / 1.5× the CPU of H.264 per output.
- **The quality gate** (VMAF in the worker) adds roughly a third more CPU, and needs libvmaf in the worker image (not verified to be present).

**CDN caching:** renditions are ordinary objects, so the Smart CDN, leases and F6-A reuse apply unchanged. A smaller object fills the CDN and the browser cache faster. Whether it avoids the large-file media-cache refetch is unmeasured.

**Cloudflare R2 (not approved; only a comparison):**
- **The gain:** serving renditions from R2 would remove Supabase egress for them.
- **What it would need:** new infrastructure, and a re-implementation of the visitor access rules (published-only, PRIVATE / unpublish revocation) in a Worker.
- **Terms:** R2-hosted video served by a Worker is the case Cloudflare's terms allow.
- **Not recommended before** the rendition step itself is measured.

## 6. Product experience

| Topic | Option A (H.264 1080p rendition) | AV1 / VP9 additions | HLS / DASH adaptive streaming |
|---|---|---|---|
| Startup | earlier: 13 MB instead of 50 MB; faststart; hardware decode everywhere | AV1 software decode on non-AV1 phones costs CPU / battery | segments + manifest; more requests; one signed URL per segment does not fit `public-media`'s one-object lease |
| Seeking | GOP 2 s; progressive Range seeking as today | same | good, but no gain for ≤ 50 MiB clips that are buffered whole |
| Mobile | **better**: today phones decode a 36 Mbit/s 4K stream for a ≈ 1080 px box | AV1 hardware only on recent SoCs | needs hls.js outside Safari (≈ 100+ KB JS) |
| Browser compatibility | H.264: every browser and iOS version | AV1: Chrome / Edge / Firefox / Android; Safari only with hardware AV1 (iPhone 15 Pro+, M3 Macs), so an H.264 fallback is mandatory. VP9 WebM: Safari 16+, iOS 17.4+ | HLS native in Safari only |
| Quality | gate: VMAF ≥ 95 and p5 ≥ 90 at 1080p, HUD-safe at 1080p | the same gate | ABR may drop below the gate on slow links |
| Upload delay | none for the owner: the original plays until the rendition is READY, then the manifest switches | longer encode | longest |
| Storage | +1 rendition per oversized upload | +2 renditions | +N segments |
| Existing media | unchanged; renditions for new uploads first; existing files only through a separately approved migration | — | — |

**Original versus derivative-only:**
- **Keep the original** for exactness, reversibility and the editor, and serve the rendition to visitors. This is the recommendation.
- **Derivative-only** saves the +26% storage, but is irreversible and contradicts the lossless principle F8-A was accepted on.
- The HEVC conversion path replaces its source only because HEVC is unplayable, which is a different reason.

## 7. Recommended approach

**Option A first: "conditional 1080p H.264 visitor rendition, quality-gated, original kept".**

1. **Trigger,** for a new MP4 upload only: coded size above 1920×1080 (either axis, rotated included), or a video rate above about 8 Mbit/s at 1080p30-equivalent (scaled by pixels × fps). Already-efficient uploads are left alone.
2. **Encode:** H.264 High, CRF 23, `slow`, GOP 2 s, faststart, no audio (the Wall plays muted; the original keeps its audio), long edge ≤ 1920. Same frame rate; no HDR (skip, as the HEVC path refuses HDR).
3. **Accept the rendition only if:**
   - VMAF ≥ 95 and p5 ≥ 90 against the source scaled to the rendition size;
   - **and** it is at least 25% smaller.
   Otherwise visitors keep the original.
4. **Delivery:**
   - the publication manifest lists the rendition only when READY;
   - `public-media` leases it like any Wall video, so F6-A applies;
   - the editor and owner keep the original;
   - delete / unpublish rules cover both objects.
5. **AV1 (option B) only after A is measured on TESTING,** as a second rendition with H.264 fallback, if egress makes it worthwhile.

## 8. Unknowns and required measurements

- **Real content:** real gameplay captures with HUDs (FPS, MOBA, racing) from real uploads. The synthetic clip is a stand-in.
- **Devices:**
  - physical Android (low-end and mid-range) and iPhone playback, CPU and battery, for the 4K original versus the 1080p rendition;
  - Safari and Firefox playback of the renditions.
- **Infrastructure:**
  - the Cloud Run vCPU speed versus this desktop;
  - the memory needed for 4K decoding;
  - whether libvmaf is in the worker image;
  - Google Cloud access, which this machine lacks today.
- **Cache:** whether a 13 MB rendition avoids the throttled large-file refetch.
- **Billing and plan:**
  - billed egress before and after (the owner's Usage page);
  - the TESTING project's plan (the 1 GB storage limit if Free).
- **Decisions for Mazen:** quota counting of renditions, the trigger thresholds and the VMAF gate.
- **Out of scope here:** HDR, variable frame rate and odd frame rates (the 4K file is 331000/11033 fps), and alpha WebM renditions (earlier data only).

## 9. Sources

- [caniuse: WebM](https://caniuse.com/webm)
- [Bitmovin: Apple AV1 support](https://bitmovin.com/apple-av1-support)
- [Supabase: storage size](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size)
- [Supabase: egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- R2 figures from third-party summaries: confirm on Cloudflare's own R2 pricing page before relying on them.

**Local evidence (not committed):** scratchpad `f8b-results.json`, `f8b-extra.json`, `f8b-frames/` (frame grid, HUD crop stack), `f8b-encode.mjs`, `f8b-extra.mjs`.

**GamID Truth: NO CHANGE** (study only).
