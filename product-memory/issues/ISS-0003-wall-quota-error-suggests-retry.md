---
id: ISS-0003
title: Wall storage quota error incorrectly suggests retry
status: FIXED
created: 2026-10-09
updated: 2026-10-09
scope: Wall Editor (Assets and background video)
summary: A Wall upload refused for the account storage quota shows the generic "could not be added. Try again." instead of a quota message.
related: [ISS-0001]
save_approval: Mazen 2026-10-09
kind: BUG
authorization: Mazen 2026-10-09, explicit task "GAMID — ISS-0001 FULL IMPLEMENTATION + PRODUCT MEMORY" (audit phases 1 and 4)
truth_refs: [global-usage, game-id-wall]
checkpoints: [d2c24b9dede6614a84f98bdec22ca3c7ea11995d]
sources: [dist/account/supabase-client.js, dist/wall-kit/assets.js, supabase/functions/_shared/usage-upload.js]
---

## Description

When the upload gateway refuses a Wall image or video because it would exceed the account storage quota, the editor tells the owner to try again, which cannot succeed. For a video the fallback even says "image". Expected: a quota-specific message, no Retry, and a way to view Usage.

## Evidence

At checkpoint `1a9d072`:
- The gateway answers `{error: "ACCOUNT_STORAGE_QUOTA_EXCEEDED"}` with status 413 ([`usage-upload.js`](../../supabase/functions/_shared/usage-upload.js) lines 160-161).
- [`supabase-client.js`](../../dist/account/supabase-client.js) line 44 keeps that code on the thrown error but replaces its message with readable text.
- `describeAssetError` ([`assets.js`](../../dist/wall-kit/assets.js) line 100) looks up the code, then the message. Neither is in `ASSET_ERROR_MESSAGES`, so it returns the fallback "That image could not be added. Try again."
- No client test covers this path.

## Resolution

Fixed at `d2c24b9` (TESTING run 37876188206): `ACCOUNT_STORAGE_QUOTA_EXCEEDED` and the gateway/network codes are mapped; a quota refusal shows the quota message with View Usage and no Retry; a video fallback says video. Evidence: `tests/upload-feedback.test.js` (real client path with stubbed gateway), `scripts/wall-upload-browser.mjs`. Awaiting Mazen's manual acceptance (VERIFIED).

## History

- 2026-10-09 OPEN — Found in the read-only upload error audit.
- 2026-10-09 AUTHORIZED — Mazen explicitly authorized the fix as part of the five-phase implementation.
- 2026-10-09 FIXED — Implemented at d2c24b9 and deployed to TESTING (run 37876188206); acceptance pending.
