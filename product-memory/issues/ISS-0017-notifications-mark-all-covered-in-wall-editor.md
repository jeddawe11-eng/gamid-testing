---
id: ISS-0017
title: Notifications "Mark all as read" covered by the Wall editor's stage bar
status: VERIFIED
created: 2026-10-25
updated: 2026-10-25
scope: Shared Notifications panel (bell dropdown) on authenticated surfaces; Wall Editor desktop header
summary: In the Wall editor the stage bar painted over the Notifications panel's head, hiding "Mark all as read" while the individual Mark read buttons stayed visible; fixed at 1aba378 and verified by Mazen on TESTING on 2026-10-25.
related: [REV-0025, DEC-0011]
save_approval: Mazen 2026-10-25
kind: BUG
authorization: Mazen 2026-10-25, task "GAMID — Notifications & Friends Stickers UI Fix" (TESTING only)
acceptance: Mazen 2026-10-25 personally tested on TESTING 1aba378 and accepted it - the button is visible and works correctly (REV-0025)
truth_refs: [notifications, authenticated-shell]
checkpoints: [1aba37844405d5c66e7777d453725b308b74a1f6]
sources: [PROJECT_HANDOFF.md, docs/GLOBAL_AUTHENTICATED_SHELL.md]
---

## Description

Mazen reported that the notifications dropdown showed the individual Mark read buttons but no visible "Mark all as read". The bulk action already existed and was accepted (Truth `notifications`): a button in the panel head calling `mark_all_my_notifications_read`. In the Wall editor (desktop) it could not be seen. Classic (`/account/`), Crew and Play Together showed it, small and pale. The public Wall has no notifications by design, and the phone Wall editor hides the desktop header (and its bell) while editing; both unchanged.

## Evidence

- Lab render of the real Wall editor: the element on top of the button's centre was the stage bar (`.ed-stage-long` inside `.ed-stage-bar`), not the button.
- Stacking: the Notifications panel (`.gn-panel`) had `z-index: 45`. Wall Stages V2 (DEC-0011) added `.ed-stage-bar` with the same `z-index: 45`, later in the page.
- On Classic, Crew and Play Together nothing covered the button (lab, desktop and phone sizes).

## Resolution

**Root cause:** equal z-index; the later stage bar covered the panel head (title and "Mark all as read"), while the rows below with Mark read stayed visible.

**Fix** (product `1aba37844405d5c66e7777d453725b308b74a1f6`, TESTING run `40182003937`; no database change):
- The panel uses `z-index: 10000`, as the Usage panel beside it. A test keeps it above the page bars.
- The button is a clearer cyan pill.
- The existing bulk read is reused, unchanged on the server: the signed-in person's own unread notifications up to the newest loaded id, older unlisted ones included.
- It is now shown as done only after the server confirms it. A failure changes nothing and says so for ~3 s.
- After it, the list and count are re-read, so a notification arriving meanwhile stays unread. Individual Mark read is unchanged.

**Claude Code's automated checks** (before acceptance; not Mazen's testing):
- `npm test`: 2,205 tests, 0 failures, including the new notification tests.
- `tests/integration/notifications-db.sql` on TESTING (rolled back): 31/31, including another user cannot mark your notifications and a newer one stays unread.
- Lab browser: 88/88 on the Wall editor (1024–1920 px), Classic (desktop and phone), Crew and Play Together.
- Deployment: the live files are byte-identical to the commit; the live stamp is `1aba378`.

**Mazen's acceptance (2026-10-25):** he personally tested on TESTING. The button is visible and works correctly. No further scenarios, devices or browsers are claimed.

No GamID Truth change: the accepted `notifications` behaviour was restored.

## History

- 2026-10-25 OPEN — Mazen reported "Mark all read" not visible in the notifications dropdown.
- 2026-10-25 AUTHORIZED — Mazen's task "GAMID — Notifications & Friends Stickers UI Fix" (investigate, fix, TESTING only).
- 2026-10-25 FIXED — Root cause found; fix deployed to TESTING at 1aba378 (run 40182003937), docs 611af72 (PROJECT_HANDOFF.md section 126).
- 2026-10-25 VERIFIED — Mazen personally tested on TESTING and accepted it; he authorized saving this record (REV-0025).
