---
id: ISS-0004
title: Intro upload messages reference the removed SAVE GAMID button
status: AUTHORIZED
created: 2026-10-09
updated: 2026-10-09
scope: Profile Editor Intro section
summary: Intro upload errors tell the owner to "try SAVE GAMID again", but the Profile Editor removed that button in favour of per-section Save Changes.
related: [ISS-0001]
save_approval: Mazen 2026-10-09
kind: BUG
authorization: Mazen 2026-10-09, explicit task "GAMID — ISS-0001 FULL IMPLEMENTATION + PRODUCT MEMORY" (audit phase 2)
truth_refs: [intro-identity, your-gamid-editor]
checkpoints: [1a9d072d733dc8774e9a45c0247ecbca87c9bb84]
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

Unresolved. Fix authorized (audit phase 2); not yet implemented.

## History

- 2026-10-09 OPEN — Found in the read-only upload error audit.
- 2026-10-09 AUTHORIZED — Mazen explicitly authorized the fix as part of the five-phase implementation.
