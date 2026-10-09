---
id: ISS-0002
title: Wall video limit text says 10 instead of the authoritative 15
status: AUTHORIZED
created: 2026-10-09
updated: 2026-10-09
scope: Wall Editor (Assets and background video)
summary: The Wall client still declares and displays a 10-video limit while the server and GamID Truth enforce 15.
related: [ISS-0001]
save_approval: Mazen 2026-10-09
kind: BUG
authorization: Mazen 2026-10-09, explicit task "GAMID — ISS-0001 FULL IMPLEMENTATION + PRODUCT MEMORY" (audit phase 1)
truth_refs: [global-usage, game-id-wall]
checkpoints: [1a9d072d733dc8774e9a45c0247ecbca87c9bb84]
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

Unresolved. Fix authorized (audit phase 1); not yet implemented.

## History

- 2026-10-09 OPEN — Found in the read-only upload error audit.
- 2026-10-09 AUTHORIZED — Mazen explicitly authorized the fix as part of the five-phase implementation.
