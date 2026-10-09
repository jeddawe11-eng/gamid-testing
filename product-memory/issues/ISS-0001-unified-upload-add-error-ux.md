---
id: ISS-0001
title: Unified Upload & Add Error UX
status: OPEN
created: 2026-10-09
updated: 2026-10-09
scope: All GamID file upload and Add surfaces (including Wall, Avatar, Intro, backgrounds, and future supported media)
summary: Standardize persistent, contextual and actionable error feedback for every file upload or Add action across GamID.
related: []
save_approval: Mazen 2026-10-09
kind: IMPROVEMENT
authorization: NONE
truth_refs: []
checkpoints: []
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

## Evidence

Product discussion on 2026-10-09: Mazen explicitly chose the full scope, “all, anything that involves uploading.” This is an approved memory record for a future improvement, not evidence that every existing screen is broken. Implementation requires a separate code audit and explicit authorization.

## Resolution

Unresolved. No implementation authorized.

## History

- 2026-10-09 OPEN — Scope agreed for every GamID upload/Add surface; Mazen explicitly approved saving this Product Memory improvement only.
