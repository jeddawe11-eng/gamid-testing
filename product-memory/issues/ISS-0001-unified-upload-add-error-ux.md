---
id: ISS-0001
title: Unified Upload & Add Error UX
status: FIXED
created: 2026-10-09
updated: 2026-10-09
scope: All GamID file upload and Add surfaces (including Wall, Avatar, Intro, backgrounds, and future supported media)
summary: Standardize persistent, contextual and actionable error feedback for every file upload or Add action across GamID.
related: [ISS-0002, ISS-0003, ISS-0004, ISS-0005]
save_approval: Mazen 2026-10-09
kind: IMPROVEMENT
authorization: Mazen 2026-10-09, explicit task "GAMID — ISS-0001 FULL IMPLEMENTATION + PRODUCT MEMORY" (all five audit phases, TESTING only)
truth_refs: [game-id-wall, global-usage, intro-identity, your-gamid-editor]
checkpoints: [d2c24b9dede6614a84f98bdec22ca3c7ea11995d]
sources: []
---

## Description

Product-wide UX improvement proposal, not a confirmed audit finding about every existing screen. Any supported upload or Add action for files/media across GamID should show a clear, persistent error near the relevant item or control when it fails. This includes Wall images/videos, Avatar, Intro, cover/background media and future upload surfaces; apply each feature's actual server-authoritative limits and rules, not Wall-specific limits elsewhere.

Expected interaction:
- Idle → Adding/Uploading (show progress and prevent duplicate submissions) → Success or Persistent Error.
- On failure, explain the specific cause and next step, staying visible until dismissed or the underlying condition is resolved.
- Examples: video limit reached (show actual usage and suggest deleting a video), insufficient storage (show actual usage and suggest freeing space), unsupported format (show accepted format), and network/server error.
- Show Retry only for retryable failures, never for hard quota or format errors; offer View Usage where applicable.
- Dismiss (×) restores the normal Add control without bypassing enforcement. A corrected condition may clear the error automatically.
- Apply consistent behavior without silently redesigning accepted UI.

Scope clarification (2026-10-09 audit, approved by Mazen): "Add" here means adding a file or media upload only. Excluded: non-file Add actions (manual games, links, GamID data blocks) and placing an existing asset on the stage. Surfaces in scope today: sign-up Avatar, Profile Editor Avatar, Intro video, Wall Assets (images and videos, including Add > Image) and Wall background video.

## Evidence

Product discussion on 2026-10-09: Mazen explicitly chose the full scope, “all, anything that involves uploading.” This is an approved memory record for a future improvement, not evidence that every existing screen is broken. Implementation requires a separate code audit and explicit authorization.

The read-only code audit of 2026-10-09 confirmed the gaps above and four concrete defects, recorded as ISS-0002 to ISS-0005.

## Resolution

Fixed at `d2c24b9` (TESTING run 37876188206): one shared persistent inline upload error box (`dist/app/upload-feedback.js`) on every in-scope surface - reason and next step, Retry only for retryable failures, View Usage for the storage quota and Wall limits, Dismiss; one upload at a time on Wall; no hardcoded limit figures. Evidence: `tests/upload-feedback.test.js`, `scripts/profile-editor-browser.mjs`, `scripts/wall-upload-browser.mjs` (mocked backend, local and served TESTING files). Awaiting Mazen's manual acceptance (VERIFIED).

## History

- 2026-10-09 OPEN — Scope agreed for every GamID upload/Add surface; Mazen explicitly approved saving this Product Memory improvement only.
- 2026-10-09 AUTHORIZED — Audit clarification saved with Mazen's approval; Mazen explicitly authorized implementing all five audit phases.
- 2026-10-09 FIXED — Implemented at d2c24b9 and deployed to TESTING (run 37876188206); acceptance pending.
