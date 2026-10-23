---
id: REV-0022
title: F1–F8 Final Bandwidth Benchmark
status: COMPLETED
created: 2026-10-21
updated: 2026-10-23
scope: TESTING Public Wall Visitor (@black, anonymous); F6-A, F7-A, F7-C, F8-A against the REV-0021 baseline; Mazen's scoped acceptance decisions
summary: Claude Code re-ran the baseline protocol on TESTING 5600d06 and measured large comparable savings on new-tab visits, covers and pre-interaction pictures; Mazen accepted F6-A, F7-A and F7-C and functionally accepted F8-A, while F8-A performance claims stay unaccepted and F1–F8 stays incomplete. Reconciled 2026-10-23 - F8-B1 was accepted later the same day (REV-0023); the authorized scope is complete, with F6-B, F7-B, the existing-MP4 migration and further F8-B options deferred and not authorized.
related: [REV-0021, REV-0023, DEC-0007]
save_approval: Mazen 2026-10-21
review_type: AUDIT
outcome: PARTIAL
reviewer: Claude Code (measurement); Mazen (acceptance decisions)
truth_refs: [wall-video-url-reuse, wall-picture-stage-loading, game-cover-thumbnails, wall-video-faststart]
checkpoints: [22cbc85b86b8f2eddf4cfb0c1a077e5f59c75b5e, 5600d0677c5f68a4b9a81c418d644173dfeaf662, cd3180b7179ebd1e9bc772d9e9d8c4f8c78fa6ed]
sources: [docs/WALL-BANDWIDTH-FINAL-BENCHMARK.md, docs/WALL-BANDWIDTH-BASELINE.md, PROJECT_HANDOFF.md]
---

## Subject

The F1–F8 bandwidth and performance results on the anonymous TESTING Public Wall Visitor at /@black:
- **Baseline:** REV-0021, TESTING `22cbc85`.
- **Current:** TESTING `5600d06`.
- **Benchmark record:** docs `cd3180b`.

Also recorded: Mazen's scoped acceptance decisions taken on this evidence.

## Method

The baseline's own protocol and harness (`scripts/wall-bandwidth/harness.mjs`), with the same Chrome 155, profiles and byte rule (CDP encoded wire bytes). Five runs:
- `full` desktop (1440×900, DPR 1);
- `full` mobile (Pixel 7 emulation);
- `key` desktop;
- `key` mobile;
- `full --throttle` mobile (9 Mbit/s down, 150 ms RTT).

**Composition read anonymously.** Two content changes since the baseline are separated from the comparable figures:
- **The F8-A smoke-test upload:** a new 3840×2160 H.264 MP4 on stage 3, 50.55 MB. Its bytes are excluded exactly, by object hash.
- **A replaced Intro:** VP9 1920×1080, 11.04 s, 6.97 MB, within F2 (the old one was 2.20 MB, 29.6 s). Intro bytes and Intro-length timings are non-comparable and excluded on both sides.

**Regression:** the 15 live security / privacy scenarios (`scripts/wall-bandwidth/f6a-security.mjs`).

## Results

Comparable figures (excl. the new MP4 and the Intro; repeats within 0.5 MB):
- **New-tab repeat visit:** 30.10 → 0.08 MB (−99.7%), browser cache through F6-A's stable URLs. Wall video per complete session 60.00 → 30.00 MB.
- **Cold first visit before interaction:**
  - desktop 16.86 → 11.60 MB (−31%): covers −3.26 (F7-C) and stage-3 GIF −2.01 deferred (F7-A);
  - mobile ≈ −3.1 MB (−12%): covers only, since the GIF's stage is within the F7-A margin.
- **All three stages, cold:** −3.2 to −3.4 MB (−8 to −9%).
- **Covers:** 3.56 → 0.30 MB (−92%), the same artwork.
- **Same-tab reload:** unchanged, 0.08 MB.
- **Supabase-origin bytes excl. Intro:** 65.34 → 35.33 MB per desktop session. Third-party 3.59 → 0.33 MB, never Supabase traffic.
- **Full profile now:** 92.77 MB for a cold view of all stages, because of the new 4K MP4 (+49.79 MB, almost all CDN hits). The new Intro (6.97 MB) is still downloaded on every load and reload (F5 by design; F6-B not implemented).
- **Large-file cache limitation:** on the throttled run, the new fast-start 4K MP4 was re-downloaded in full (49.51 MB) on the new-tab visit. The URL was reused, but Chrome's media cache could not serve the large, range-filled entry.
- **F8-A:**
  - the published new MP4 is independently verified fast start (`ftyp, moov, mdat`; server inspection H.264 3840×2160) and played without errors;
  - whether the remux or the source made it fast start cannot be determined;
  - existing @black MP4s were not migrated (still 3 requests each);
  - the first-frame improvement was measured only in a local lab;
  - a repeat-visit byte saving is not proven, and the throttled refetch above argues against it.
- **Security / privacy:** all 15 regression scenarios PASS; 0 video errors, 0 page errors; only the pre-existing favicon 404s.
- **Not measured:**
  - Browser-received bytes are not billed Supabase Egress, which is read only on the owner's Usage page.
  - Physical devices, Safari and Firefox were not tested.
  - First-frame and "Wall shown" timings are non-comparable (the Intro changed).

**Mazen's acceptance decisions (2026-10-21):**
- **F6-A:** ACCEPTED, with the documented large-file cache limitation.
- **F7-A:** ACCEPTED.
- **F7-C:** ACCEPTED.
- **F8-A:** FUNCTIONALLY ACCEPTED, for fast start of new MP4 uploads only:
  - functional correctness and playback: accepted;
  - local first-frame improvement: measured, not accepted as a guarantee;
  - reduced repeat-visit bandwidth: NOT PROVEN;
  - existing-MP4 migration: NOT APPROVED.
- **The F1–F8 program is NOT complete.**

## Follow-up

- **Still open:** F6-B (Intro reuse; 6.97 MB per load now), F7-B (picture display copies), F8-B (video renditions; feasibility study only) and the existing-MP4 fast-start migration. Each needs Mazen's separate authorization.
- **Future benchmarks** must keep separating the new 4K MP4 and the replaced Intro, or re-baseline.
- **Billed egress:** read the Usage page before and after a run.

**Reconciliation (2026-10-23, Mazen's documentation reconciliation task).** The findings and decisions above are unchanged and describe 2026-10-21. This review predates F8-B1: later that day F8-B1 (conditional 1080p renditions of new oversized MP4s) was implemented, deployed and fully ACCEPTED (REV-0023, DEC-0007). F8-B is therefore no longer "feasibility study only".

Current status:
- **The authorized F1–F8 scope is complete:**
  - F2, F3, F4 (mechanism superseded by F6-A), F5, F6-A, F7-A and F7-C are accepted;
  - F8-A is functionally accepted, for new uploads only;
  - F8-B1 is accepted.
- **F1** (Monitor media-light scans) is implemented and verified; formal acceptance evidence was not found.
- **Deferred and not authorized** (not completed, rejected or cancelled):
  - F6-B;
  - F7-B;
  - the existing-MP4 migration;
  - further F8-B options beyond F8-B1.
- **Details:** `docs/WALL-BANDWIDTH-FINAL-BENCHMARK.md` §8.

## History

- 2026-10-21 COMPLETED — Claude Code final benchmark and Mazen's scoped acceptance decisions recorded with his explicit save approval; Truth wall-video-url-reuse, wall-video-faststart (functional), wall-picture-stage-loading and game-cover-thumbnails ACCEPTED.
