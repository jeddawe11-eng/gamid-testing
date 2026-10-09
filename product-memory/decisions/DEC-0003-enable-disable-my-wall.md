---
id: DEC-0003
title: Enable / Disable My Wall without unpublishing
status: IMPLEMENTED
created: 2026-10-09
updated: 2026-10-09
scope: Profile Editor My Wall section, public profile resolution, Wall publication
summary: The owner can hide a published Wall so visitors see the Classic Profile, and show the same Wall again, independent of the GamID's Publish / Unpublish.
related: [DEC-0001, DEC-0002]
save_approval: Mazen 2026-10-09
authorization: Mazen 2026-10-09, explicit task "GamID — Enable / Disable My Wall" (TESTING only)
supersedes: []
truth_refs: [wall-visibility-toggle, public-wall-publishing, your-gamid-editor]
checkpoints: [85146e679faaa88de46e0271f0ec5f16fbebf409]
sources: [supabase/migrations/20261009170000_wall_public_publishing_toggle.sql, docs/PROFILE-EDITOR-UX.md]
---

## Context

A published Wall always replaced the Classic Profile for visitors. The only way back was Unpublish, which deletes the published snapshot. Showing it again then needed a new Publish of the current draft, not the Wall as it was.

## Decision

- An owner setting on the published snapshot (`wall_publications.is_enabled`, default true) decides whether visitors get the Wall or the Classic Profile. The server applies it in `get_public_wall` and in the published-media read policy.
- The Profile Editor's My Wall section shows the saved state with Edit and Disable / Enable My Wall, using the approved confirmation texts. The owner RPCs act only on the caller's own published Wall, and a Wall that was never published cannot be toggled.
- Unchanged: the GamID's Publish / Unpublish, the Wall editor's Publish / Unpublish, the snapshot and the draft. Republishing keeps the choice.

## Reasoning

Reusing the published snapshot keeps the Wall exactly as it was, and the change stays small and additive. Deciding on the server makes the result hold after a refresh, in a new session and for signed-out visitors. Hiding the media of a disabled Wall keeps "disabled" truly private.

## Alternatives considered

- Reuse Unpublish — rejected: it deletes the snapshot, so Enable could not restore the same Wall.
- A browser-only switch on the public page — rejected: not authoritative, so visitors in other sessions would still get the Wall.
- A flag on the GamID (entities) — rejected: it would couple Wall visibility to the identity's own Publish / Unpublish.

## History

- 2026-10-09 APPROVED — Mazen specified the feature, its texts and the public-profile rules.
- 2026-10-09 AUTHORIZED — Mazen explicitly authorized the implementation on TESTING.
- 2026-10-09 IMPLEMENTED — Implemented at 85146e6 and deployed to TESTING (run 37894870969); migration 20261009170000 applied. The existing published Walls (@black, @zshot) were verified unchanged and enabled. Acceptance pending.
