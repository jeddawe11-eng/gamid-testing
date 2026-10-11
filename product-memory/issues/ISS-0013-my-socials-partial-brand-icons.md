---
id: ISS-0013
title: Some My Socials icons show initials instead of logos
status: VERIFIED
created: 2026-10-11
updated: 2026-10-11
scope: Public GamID My Socials icons
summary: Some platform icons used abbreviations while others showed recognizable logos. Fixed on TESTING (desktop marks for TikTok, Twitch, Kick and Snapchat) and accepted by Mazen.
related: [REV-0005]
save_approval: Mazen 2026-10-11
kind: BUG
authorization: Mazen 2026-10-11, explicit task "GamID — Fix ISS-0013: My Socials Brand Logos" (TESTING only)
acceptance: Mazen 2026-10-11 tested on TESTING and accepted that the TikTok, Twitch, Kick and Snapchat logos display correctly (deployed checkpoint 514e462)
truth_refs: [my-socials, classic-profile-desktop]
checkpoints: [ec3fda41f035d519109dd257e157e6b2f6497767, 514e4622b6405c69a815db93d4439556924028ed]
sources: [dist/public/public.css, dist/account/socials.js, tests/my-socials-brand-marks.test.js, PROJECT_HANDOFF.md]
---

## Description
On the visitor-facing SOCIALS row, TikTok (TT), Twitch (TW), Kick (K) and Snapchat (SC) show letters instead of official platform logos. Discord, Instagram, YouTube and X appear recognizable. Only some icons are affected. Mazen reports he previously addressed this issue; inspect existing icon implementation before fixing.

## Evidence
Mazen supplied a screenshot (kept outside the repository) and confirmed the links themselves work (REV-0005 PASS).

## Resolution
**Root cause.**
- My Socials badges are text glyphs from the catalogue in `dist/account/socials.js` (TT, TW, K, SC, IG, DC, ▶, X, f) on brand-coloured circles.
- The Classic Profile visual review gave only Discord and Instagram a desktop logo mark: a static CSS mask in `dist/public/public.css`, Truth contract `desktop-social-marks`.
- YouTube and X read as recognizable from their glyphs, while TikTok, Twitch, Kick and Snapchat fell back to their letters.
- It was a missing mapping, not asset loading, a fallback bug or CSS breakage.

**Implementation** (`ec3fda4`, CSS only):
- The same mask mechanism now covers TikTok and Twitch (simple-icons paths, CC0) and Kick (its blocky K) and Snapchat (the ghost), both drawn in the repository.
- Each mark uses the badge's existing text colour: white on TikTok and Twitch, black on Kick and Snapchat.
- Unchanged: sizes (44 px), links, accessible names, the YouTube, X and Facebook glyphs, and the mobile text marks.
- Tests: `tests/my-socials-brand-marks.test.js` and the extended visual-review test.

**Deployment:** TESTING run 38152454496, stamp `514e462`, a tree containing `ec3fda4`. The served CSS is byte-identical to the repository.
- Live `/@black` at 1440 px: all four marks render, the other icons are unchanged, and the links are intact.
- At 375 px the text marks are unchanged.

**Acceptance:** Mazen tested on TESTING and accepted the fix on 2026-10-11.

## History
- 2026-10-11 OPEN — Mazen approved documenting partial brand-icon defect separately.
- 2026-10-11 AUTHORIZED — Mazen authorized the fix ("GamID — Fix ISS-0013: My Socials Brand Logos", TESTING only).
- 2026-10-11 FIXED — Fix ec3fda4 deployed to TESTING as 514e462 (run 38152454496) after the Product Memory validation corrections.
- 2026-10-11 VERIFIED — Mazen tested on TESTING and accepted that the TikTok, Twitch, Kick and Snapchat logos display correctly.
