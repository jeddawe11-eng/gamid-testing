---
id: DEC-0001
title: Implement the approved Profile Editor notes (My Socials, Save All Changes, Account Settings menu)
status: IMPLEMENTED
created: 2026-10-09
updated: 2026-10-09
scope: Profile Editor and the public profile (My Socials)
summary: Mazen authorized completing the Profile Editor from the DIS-0003 notes - My Socials, Save All Changes beside section saves, and Account Settings moved to the ⋯ menu - without starting the deferred dashboard redesign.
related: [DIS-0003, IDEA-0001]
save_approval: Mazen 2026-10-09
authorization: Mazen 2026-10-09, explicit task "GAMID — PROFILE EDITOR COMPLETION + MY SOCIALS" (TESTING only)
supersedes: []
truth_refs: [your-gamid-editor, my-socials]
checkpoints: [9e11076bb1ea19eb09e911030ad1dcc6cdd09150]
sources: [docs/PROFILE-EDITOR-UX.md, supabase/migrations/20261009120000_my_socials.sql]
---

## Context

DIS-0003 recorded four Profile Editor notes from Mazen's review, without implementation authorization. Mazen then explicitly authorized implementing them, based on the mockup he approved. The deferred gaming-dashboard redesign (IDEA-0001) stays deferred.

## Decision

- Replace IDENTITY BOARD · FUTURE with **My Socials**: the owner's own accounts on named platforms, with no Other. Users add, edit and remove links. They show as clickable icons on the public profile, also without a Wall. Links are validated on the server and protected by RLS.
- Keep **both** save methods: section **Save Changes**, and **Save All Changes** at the end of the editor. Save All saves every changed section once, never shows a misleading overall success, and keeps the drafts of sections that failed.
- Remove the standalone **Account Settings** section. Language and Sign Out move to the **⋯** menu; save buttons do not.
- Keep every existing section and field, and preserve the mobile design.

## Reasoning

- A stable profile identity is kept separate from free-form Wall content, which may link to other people or content.
- Account navigation becomes simpler.
- Saving several sections takes one click, while the per-section boundaries that protect other drafts stay in place.

## Alternatives considered

- Replace section saves with a single Save All — rejected: Mazen decided to keep both.
- Add an Other platform to My Socials — rejected: free-form links belong to the Wall.
- Extend get_public_identity with the links — not chosen: a separate anonymous reader keeps the accepted public identity contract and its tests unchanged.

## History

- 2026-10-09 APPROVED — Mazen approved the notes and the mockup (DIS-0003).
- 2026-10-09 AUTHORIZED — Mazen explicitly authorized the implementation on TESTING, and asked for the decision to be recorded without changing IDEA-0001.
- 2026-10-09 IMPLEMENTED — Implemented at 9e11076 and deployed to TESTING (runs 37883751545 and 37884326476). DIS-0003 described Save All Changes as existing, but none existed: it was added new, at the end of the editor. The desktop Play Together / My Wall card typography note from DIS-0003 was outside this task's scope and is not implemented. Acceptance pending.
