---
id: ISS-0015
title: Orphan Wall media file continues counting toward storage
status: VERIFIED
created: 2026-10-21
updated: 2026-10-22
scope: Wall media storage and Usage Gateway
summary: Deleted Wall media could leave unregistered storage objects and consume quota; safe orphan cleanup was implemented and verified on TESTING.
related: [DEC-0008]
save_approval: Mazen 2026-10-21
kind: BUG
authorization: Mazen 2026-10-21 authorized safe orphan cleanup implementation and TESTING deployment
acceptance: Mazen 2026-10-21 accepted the Universal Delete UX task following the TESTING E2E report and his signed-in UI verification; cleanup itself was validated by synthetic TESTING E2E
truth_refs: [wall-universal-delete]
checkpoints: [54e3b439b96c3dabd228840dc2045596455705fd, da4cc5a2f1ad785260309cb6022cdebbba6a6dd1]
sources: [docs/UNIVERSAL-DELETE-UX.md, gamid-truth.json]
---

## Description

If a Wall asset database deletion succeeded but its storage deletion failed, the object could remain in storage and continue counting against the 200 MB quota.

## Evidence

TESTING synthetic E2E intentionally left a 74-byte image object after deleting its asset row. It remained counted within the one-hour grace period. After aging the fixture, the cleanup claimed and removed it and Usage dropped to 0 B.

## Resolution

Existing Usage Gateway cleanup was extended to discover eligible unregistered Wall media objects older than one hour, with ownership and lifecycle exclusions, rechecks, at most 10 files per run, 5 tries and 15-minute retry spacing. Originals and registered assets are protected; Intro/avatar/banner/fonts and renditions are excluded. Cleanup was deployed and verified on TESTING at 54e3b43. Known limit: an object exhausting all five attempts remains counted and needs follow-up.

## History

- 2026-10-21 OPEN — Found during the universal deletion audit: a Wall file whose removal failed after its asset row was deleted kept counting, with no cleanup (PROJECT_HANDOFF.md §113).
- 2026-10-21 AUTHORIZED — Mazen approved and authorized the safe orphan cleanup in "Universal Delete UX Final Completion, Safe Orphan Cleanup, TESTING Deployment & Acceptance Verification" (§114).
- 2026-10-21 FIXED — Deployed to TESTING at 54e3b439b96c3dabd228840dc2045596455705fd (run 39595702093; migration 20261022110000_usage_media_orphans; usage-upload v13).
- 2026-10-21 VERIFIED — Synthetic TESTING cleanup passed and Mazen accepted the parent deletion task; save explicitly approved.
