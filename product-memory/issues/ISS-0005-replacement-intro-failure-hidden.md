---
id: ISS-0005
title: Replacement Intro processing failure may be hidden
status: FIXED
created: 2026-10-09
updated: 2026-10-09
scope: Profile Editor Intro section
summary: When a new Intro fails processing while an older Intro is still active, the section only says the active Intro is ready and the failure is not shown.
related: [ISS-0001]
save_approval: Mazen 2026-10-09
kind: BUG
authorization: Mazen 2026-10-09, explicit task "GAMID — ISS-0001 FULL IMPLEMENTATION + PRODUCT MEMORY" (audit phase 3)
truth_refs: [intro-identity]
checkpoints: [d2c24b9dede6614a84f98bdec22ca3c7ea11995d]
sources: [dist/account/account.js]
---

## Description

An owner who replaces an existing Intro is not told when the replacement fails processing. Where a failure is shown, it uses the raw failure code. Expected: the failure is visible with an understandable reason, and the existing active Intro stays active and is described as such.

## Evidence

At checkpoint `1a9d072`, `renderIntroState` in [`account.js`](../../dist/account/account.js):
- line 249 shows the failure only when `latestJobState === "failed"` and there is no `activeJobId`;
- line 250 shows the raw code: "Processing failed (CODE)";
- line 252 otherwise shows "Optimized D3 Intro is active." whenever an active job exists, including after a failed replacement.

This is verified from code only; not reproduced on TESTING.

## Resolution

Fixed at `d2c24b9` (TESTING run 37876188206): a failed latest job is shown even when an Intro is active ("Your new Intro could not be processed: ... Your current Intro stays active."); known worker failure codes are mapped to reasons, unknown ones keep a short reference. Evidence: `tests/upload-feedback.test.js`, `scripts/profile-editor-browser.mjs` (mocked). Not reproduced with a real failed job on TESTING. Awaiting Mazen's manual acceptance (VERIFIED).

## History

- 2026-10-09 OPEN — Found in the read-only upload error audit.
- 2026-10-09 AUTHORIZED — Mazen explicitly authorized the fix as part of the five-phase implementation.
- 2026-10-09 FIXED — Implemented at d2c24b9 and deployed to TESTING (run 37876188206); acceptance pending.
