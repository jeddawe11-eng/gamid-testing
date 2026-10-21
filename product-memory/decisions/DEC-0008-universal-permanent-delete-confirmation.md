---
id: DEC-0008
title: Confirm every permanent Wall resource deletion
status: ACCEPTED
created: 2026-10-21
updated: 2026-10-21
scope: Wall Editor Assets, Background, custom fonts
summary: Every permanent media or custom font deletion requires confirmation, with a usage-aware warning and irreversible deletion.
related: [ISS-0015]
save_approval: Mazen 2026-10-21
authorization: Mazen 2026-10-21 authorized implementation and TESTING deployment of Universal Delete UX and final adjustments
acceptance: Mazen 2026-10-21 manually verified confirmation behavior on TESTING and said it works
supersedes: []
truth_refs: [wall-universal-delete, custom-wall-fonts]
checkpoints: [da4cc5a2f1ad785260309cb6022cdebbba6a6dd1]
sources: [docs/UNIVERSAL-DELETE-UX.md, gamid-truth.json]
---

## Context

Deleting used Wall media previously failed or left references; unused media initially deleted without warning. Mazen requested a consistent, explicit confirmation before any irreversible library deletion.

## Decision

All permanent deletions of uploaded Wall images, GIFs, videos and custom fonts require confirmation. Unused items show a short irreversible-action warning without a usage list. Used items show the existing detailed locations and consequences, including published Wall impact. Cancel changes nothing. Confirm removes media references across draft and publication, or preserves text with library-font fallback for deleted fonts. Deleted library resources cannot be restored by Undo; removing a canvas element remains undoable. Stage deletion keeps its separate confirmation. A server-discovered usage conflict switches to detailed confirmation without deleting.

## Reasoning

Protect against accidental permanent loss while retaining clear explanations when resources are in use. Reuse one dialog and authoritative server-side validation.

## Alternatives considered

- Delete unused resources immediately — rejected by Mazen after hands-on testing.
- Prevent deletion of used resources — replaced by confirmed reference-safe deletion.

## History

- 2026-10-21 ACCEPTED — Implemented and deployed to TESTING at da4cc5a2f1ad785260309cb6022cdebbba6a6dd1; Mazen manually confirmed the revised behavior and approved this memory save.
