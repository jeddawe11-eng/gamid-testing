---
id: ISS-0014
title: Desktop Classic Profile could not be scrolled by the user
status: VERIFIED
created: 2026-10-11
updated: 2026-10-11
scope: Public GamID profile (/@<handle>) at 1280 px and wider - the Intro scroll lock and the desktop Classic Profile layout
summary: On the desktop Classic Profile the Intro's scroll lock was never lifted, so wheel, trackpad, keyboard and touch could not reach the lower sections. Fixed on TESTING with one CSS rule and accepted by Mazen.
related: [ISS-0010, ISS-0013]
save_approval: Mazen 2026-10-11
kind: BUG
authorization: Mazen 2026-10-11, explicit task "GAMID — FIX PUBLIC PROFILE SCROLL BUG" (TESTING only)
acceptance: Mazen 2026-10-11 tested on TESTING and accepted that the desktop profile now scrolls naturally to the bottom (deployed checkpoint 5529d17)
truth_refs: [classic-profile-desktop, public-gamid-profile]
checkpoints: [5529d17df626b524c08514f321ee1499af87ff3c]
sources: [dist/public/public.css, dist/flow-layout.js, dist/public/public.js, tests/public-profile-desktop-scroll.test.js, PROJECT_HANDOFF.md]
---

## Description

On `https://gamid-testing-static.gamid.workers.dev/@black` at desktop width, the profile extends below the viewport, but normal scrolling did not reach the remaining sections. Scripted scrolling still worked. Phones and tablets were not affected.

## Evidence

- Live reproduction at 1440 × 900: the page was 1,476 px tall in a 900 px viewport, with `overflow-y: hidden` on the root after the Intro, and a 10-notch mouse-wheel scroll stayed at 0.
- At 375 px the page was in "flow" mode and scrolled normally.

## Resolution

**Root cause.**
- While the Intro plays, `html.is-public-live:not(.is-public-flow){overflow:hidden}` locks the page.
- `createFlowLayout` (`dist/flow-layout.js`) lifts that lock only in "flow", which needs a height reported by the Intro frame.
- At 1280 px and wider the page draws the Classic Profile itself: the frame is asked for `hostReveal`, and `showDesktop` hides it at `profile`. So no height arrives, flow never starts, and the lock stays.
- The published Wall already had its own rule for the same situation; the desktop profile did not.

**CSS fix** (`5529d17`): `html.is-public-live.is-public-desktop:not(.is-public-desktop-reveal){overflow-x:hidden;overflow-y:auto;scrollbar-gutter:stable}` in `dist/public/public.css`.
- It mirrors the Wall rule and is more specific than the lock.
- The Intro and its reveal transition keep the lock, and Replay Intro relocks.
- Only the root scrolls: no nested scrolling containers, no JavaScript or design change.

**Tests:** `tests/public-profile-desktop-scroll.test.js`; 627 related tests and CI passed.

**Deployment:** TESTING run 38153071764, stamp `5529d17`.
- Live `/@black` at 1440 px: the mouse wheel and the End key reach the bottom (571/571), with no horizontal overflow.
- The Intro lifecycle (intro, transition, profile, Replay) locks and unlocks correctly.
- Mobile is unchanged.

**Acceptance:** Mazen tested on TESTING and accepted the fix on 2026-10-11.

## History

- 2026-10-11 OPEN — Mazen reported that the public GamID profile could not scroll vertically on TESTING.
- 2026-10-11 AUTHORIZED — Mazen authorized the fix ("GAMID — FIX PUBLIC PROFILE SCROLL BUG", TESTING only).
- 2026-10-11 FIXED — One CSS rule (5529d17) deployed to TESTING (run 38153071764); live-verified with wheel and keyboard.
- 2026-10-11 VERIFIED — Mazen tested on TESTING and accepted that the desktop profile now scrolls naturally to the bottom.
