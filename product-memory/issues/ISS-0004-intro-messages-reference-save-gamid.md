---
id: ISS-0004
title: Intro upload messages reference the removed SAVE GAMID button
status: FIXED
created: 2026-10-09
updated: 2026-10-09
scope: Profile Editor Intro section
summary: Intro upload errors tell the owner to "try SAVE GAMID again", but the Profile Editor removed that button in favour of per-section Save Changes.
related: [ISS-0001]
save_approval: Mazen 2026-10-09
kind: BUG
authorization: Mazen 2026-10-09, explicit task "GAMID — ISS-0001 FULL IMPLEMENTATION + PRODUCT MEMORY" (audit phase 2)
truth_refs: [intro-identity, your-gamid-editor]
checkpoints: [d2c24b9dede6614a84f98bdec22ca3c7ea11995d]
sources: [dist/account/domain.js, dist/account/resumable-upload.js, dist/account/profile-editor.js]
---

## Description

An interrupted or failed Intro upload shows an instruction naming a button that no longer exists. Gateway refusals such as an expired upload are also shown as raw technical text. Expected: messages refer to Save Changes and explain each gateway refusal.

## Evidence

At checkpoint `1a9d072`:
- [`domain.js`](../../dist/account/domain.js) lines 160-161 (`INTRO_UPLOAD_NETWORK_ERROR`, `INTRO_UPLOAD_FAILED`) say "try SAVE GAMID again".
- [`resumable-upload.js`](../../dist/account/resumable-upload.js) line 29 throws the same text.
- [`profile-editor.js`](../../dist/account/profile-editor.js) line 53 removes `saveProfileButton` (the SAVE GAMID button); each section has its own Save Changes.

## Resolution

Fixed at `d2c24b9` (TESTING run 37876188206): Intro messages refer to Save Changes; gateway refusal codes (UPLOAD_EXPIRED, UPLOAD_CONFLICT, UPLOAD_GATEWAY_FAILED, CHUNK_TOO_LARGE, quota) have words, and a 4xx chunk refusal keeps its code and is not retried. Evidence: `tests/upload-feedback.test.js`. Awaiting Mazen's manual acceptance (VERIFIED).

## History

- 2026-10-09 OPEN — Found in the read-only upload error audit.
- 2026-10-09 AUTHORIZED — Mazen explicitly authorized the fix as part of the five-phase implementation.
- 2026-10-09 FIXED — Implemented at d2c24b9 and deployed to TESTING (run 37876188206); acceptance pending.
