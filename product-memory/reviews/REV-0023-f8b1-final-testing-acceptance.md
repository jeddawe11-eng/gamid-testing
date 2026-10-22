---
id: REV-0023
title: F8-B1 conditional video renditions — final TESTING acceptance
status: COMPLETED
created: 2026-10-21
updated: 2026-10-21
scope: F8-B1 deployed TESTING pipeline, synthetic E2E and Mazen's real 4K upload
summary: PASS — quality-gated rendition creation, visitor delivery and original fallback verified; Mazen formally accepted the implemented TESTING scope on 2026-10-21.
related: [DEC-0007, REV-0022]
save_approval: Mazen 2026-10-21
review_type: ACCEPTANCE
outcome: PASS
reviewer: Claude Code (technical verification); Mazen (real upload and final acceptance)
truth_refs: [wall-video-renditions]
checkpoints: [3bb2871dc4eafa0bca67ba039e7d02aad87c9729, 764e3b8b55eac2ea21a956a38403f0a75f4c043e, 1f7d203c0945b53aa8e9f6b0512c201d682fd9f9]
sources: [docs/WALL-VIDEO-RENDITIONS-F8B1.md, gamid-truth.json, PROJECT_HANDOFF.md]
---

## Subject

Final acceptance of the conditional internal visitor rendition pipeline F8-B1 on TESTING. No Production release is implied.

## Method

- Deployed worker/dispatcher smoke checks and synthetic GM-TEST-01 E2E: eligible READY, quality-gate rejection, efficient-video skip, public visitor rendition/fallback, privacy and revocation, deletion/orphan sweep, editor and Usage exclusions. Synthetic state was restored; protected accounts were not changed by that run.
- Mazen personally uploaded a new 4K MP4 through the live Wall Editor to stage 3 of @black, published it, and confirmed visitor playback. Claude investigated the live result read-only in Chrome.

## Results

- Real upload asset 7f301afd: 3840×2160, 10 s, 25,148,899 bytes; job queued at registration, READY on first attempt after about 68 s total (55 s worker).
- Rendition 1920×1080, 3,285,412 bytes, 86.9% smaller. VMAF mean 95.239, fifth percentile 93.710; quality and savings gates PASS.
- Anonymous visitor streamed the 3.29 MB rendition and played all 10 s, 0 dropped frames; when the rendition lease was refused, the original 25.16 MB file played as fallback.
- Editor listed only the original. Rendition was excluded from Usage and from video slots; observed video slots 12/15.
- Synthetic E2E additionally verified privacy/Disable/Unpublish revocation, rejection, cleanup, and baseline restoration.
- Mazen explicitly ACCEPTED F8-B1 on TESTING on 2026-10-21. gamid-truth.json records wall-video-renditions as ACCEPTED.

## Follow-up

The accepted scope excludes conversion of existing videos and HDR/alpha/10-bit sources. Faster first frame is not guaranteed. Physical phones, Safari and Firefox were not tested; occasional rejected small clips cost compute; pinned FFmpeg archive availability and sweep-on-worker-run timing remain documented limitations. Any improvements require separate future authorization. No new deployment or Production acceptance.

## History

- 2026-10-21 COMPLETED — Synthetic E2E and Mazen's live 4K upload evidence reviewed; Mazen granted final TESTING acceptance and separately approved saving this Product Memory record.
