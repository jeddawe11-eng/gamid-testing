---
id: DEC-0007
title: F8-B1 conditional internal visitor renditions — quality and storage contract
status: ACCEPTED
created: 2026-10-21
updated: 2026-10-21
scope: Wall Video — F8-B1, TESTING
summary: New eligible H.264 Wall MP4 uploads may receive a quality-gated internal 1080p visitor rendition while originals remain authoritative and counted.
related: [REV-0023, REV-0022]
save_approval: Mazen 2026-10-21
authorization: Mazen explicitly authorized F8-B1 implementation on TESTING, as recorded in docs/WALL-VIDEO-RENDITIONS-F8B1.md and PROJECT_HANDOFF.md
acceptance: Mazen 2026-10-21 explicitly accepted F8-B1 on TESTING after synthetic E2E and his own 4K upload verification; REV-0023
supersedes: []
truth_refs: [wall-video-renditions]
checkpoints: [3bb2871dc4eafa0bca67ba039e7d02aad87c9729, 764e3b8]
sources: [gamid-truth.json, docs/WALL-VIDEO-RENDITIONS-F8B1.md, PROJECT_HANDOFF.md]
---

## Context

F8-B1 followed the F1–F8 bandwidth investigation (REV-0022). Large Wall MP4 originals can impose substantial visitor transfer even when playback works. This decision documents the approved conditional-rendition contract, not a blanket re-encode or an existing-video migration.

## Decision

- Eligibility: NEW direct H.264 Wall MP4s exceeding 1920×1080 in either orientation or the scaled 8 Mbit/s at 1080p30 threshold are candidates. Already efficient, non-H.264, HDR, alpha and 10-bit videos are excluded; existing assets are not migrated.
- Encoding: at most one internal rendition per asset, H.264 CRF 23, within 1920×1080, source frame rate and all audio streams preserved.
- Quality and savings gate: worker AND database verify VMAF mean at least 95, fifth percentile at least 90, and at least 25% smaller than original. Rejected candidates continue to use originals.
- Measurement: a separately pinned static FFmpeg with libvmaf measures quality; the established Debian FFmpeg handles encoding. Do not replace the existing Intro encoder.
- Storage: original is retained and counted toward the owner's 200 MB; internal rendition is private, uncounted in Usage and asset/video slots (60/15 unchanged), capped at 37.5 MiB, with at most one live rendition and storage-driven orphan cleanup.
- Delivery: anonymous visitors receive READY rendition only while the original remains publicly leasable. If unavailable, the original is the fallback. PRIVATE, Disable, Unpublish and Delete revoke new leases; owners and editor always see the original.

The authoritative current contract and thresholds remain in gamid-truth.json; this record explains the decision.

## Reasoning

Quality-gated conditional conversion targets costly oversized transfers without changing originals, user quotas or existing editor behavior. An explicit fallback protects playback. Separate measurement FFmpeg avoids changing the accepted encoding path.

## Alternatives considered

- Re-encode every video — rejected: unnecessary conversion and compute for efficient files.
- Replace the original — rejected: loss of owner source and change to quota/quality semantics.
- Convert existing stored videos automatically — not approved; a separate future task.
- Deliver an unverified rendition — rejected: fails the quality and size requirements.
- Use rendition for editor/owner — rejected: editor remains original-based.

## History

- 2026-10-21 APPROVED — Mazen approved the conditional rendition scope and quality/storage contract before implementation.
- 2026-10-21 AUTHORIZED — Mazen authorized the F8-B1 TESTING implementation documented in the technical handoff.
- 2026-10-21 IMPLEMENTED — Deployed TESTING pipeline including worker and dispatcher; checkpoint 3bb2871 and frontend 764e3b8.
- 2026-10-21 ACCEPTED — Mazen gave final TESTING acceptance after synthetic E2E and his own 4K upload; see REV-0023.
