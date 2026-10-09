---
id: ISS-0002
title: Wall video limit text says 10 instead of the authoritative 15
status: FIXED
created: 2026-10-09
updated: 2026-10-09
scope: Wall Editor (Assets and background video)
summary: The Wall client still declares and displays a 10-video limit while the server and GamID Truth enforce 15.
related: [ISS-0001]
save_approval: Mazen 2026-10-09
kind: BUG
authorization: Mazen 2026-10-09, explicit task "GAMID — ISS-0001 FULL IMPLEMENTATION + PRODUCT MEMORY" (audit phase 1)
truth_refs: [global-usage, game-id-wall]
checkpoints: [d2c24b9dede6614a84f98bdec22ca3c7ea11995d]
sources: [dist/wall-kit/assets.js, supabase/migrations/20261005025319_wall_video_limit_15.sql]
---

## Description

When the server refuses a Wall video with `WALL_VIDEO_LIMIT`, the editor shows "You can keep up to 10 videos". The real limit is 15. Expected: the message names the Wall video limit without a stale number; the actual figures come from Usage.

## Evidence

At checkpoint `1a9d072`:
- [`dist/wall-kit/assets.js`](../../dist/wall-kit/assets.js) line 37 declares `maxVideos: 10`; line 92 maps `WALL_VIDEO_LIMIT` to "You can keep up to 10 videos".
- [`supabase/migrations/20261005025319_wall_video_limit_15.sql`](../../supabase/migrations/20261005025319_wall_video_limit_15.sql) sets `private.wall_video_limit()` to 15.
- GamID Truth `global-usage` records `wallVideos: 15`.

The client text is stale; Truth and the server agree. No Truth change is needed.

## Resolution

Fixed at `d2c24b9` (TESTING run 37876188206): `VIDEO_LIMITS` no longer declares a video count; `WALL_VIDEO_LIMIT` and `WALL_ASSET_LIMIT` messages name the limit without a figure and offer View Usage. Evidence: `tests/upload-feedback.test.js`, `scripts/wall-upload-browser.mjs`. Awaiting Mazen's manual acceptance (VERIFIED).

## History

- 2026-10-09 OPEN — Found in the read-only upload error audit.
- 2026-10-09 AUTHORIZED — Mazen explicitly authorized the fix as part of the five-phase implementation.
- 2026-10-09 FIXED — Implemented at d2c24b9 and deployed to TESTING (run 37876188206); acceptance pending.
