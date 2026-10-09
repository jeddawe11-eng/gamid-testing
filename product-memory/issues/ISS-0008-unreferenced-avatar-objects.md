---
id: ISS-0008
title: Nine apparently unreferenced Avatar objects on TESTING
status: OPEN
created: 2026-10-10
updated: 2026-10-10
scope: Avatar storage lifecycle (replacement / discarded uploads) and storage quota
summary: Nine of the twelve objects in the avatars bucket on TESTING are not referenced by any GamID's Avatar; they may be replaced or discarded Avatars that still count against their owners' storage quota.
related: [ISS-0007, DEC-0005]
save_approval: Mazen 2026-10-10
kind: BUG
authorization: NONE
truth_refs: [your-gamid-editor, global-usage]
checkpoints: []
sources: [supabase/migrations/20260916130000_slice_3b_roles_education_occupation.sql, dist/account/supabase-client.js]
---

## Description

Replacing an Avatar points `entities.avatar_media_reference` at the new object. No code path was found that deletes the replaced object; `discardUnattachedAvatar` deletes only an upload whose attach failed. Every object under `<uid>/` counts toward the 200,000,000-byte quota, so unreferenced Avatars may waste quota.

## Evidence

Read-only TESTING queries (Phase 1A, 2026-10-09; repeated 2026-10-10): 12 objects in `avatars`, all named `<uid>/avatar-…`, of which 9 have no matching `entities.avatar_media_reference`. Owners and paths were not inspected individually. Not yet established: whether these are replacements, discarded uploads or something else, and whether any of them is still needed.

## Resolution

Unresolved. Investigate first. **Delete nothing**, and do not implement any cleanup without separate authorization.

## History

- 2026-10-10 OPEN — Mazen asked for it to be recorded in the Phase 1B task: investigate before any deletion.
