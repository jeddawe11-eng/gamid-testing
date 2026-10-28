---
id: ISS-0020
title: Intro share copy (and poster) used the frame after the chosen one when an Intro's first frame is not at 0
status: VERIFIED
created: 2026-10-28
updated: 2026-10-28
scope: Intro worker frame selection - worker/intro-share.mjs (Discord share copy, Truth intro-discord-thumbnail) and worker/intro-poster.mjs (public Intro poster, Truth public-intro-poster)
summary: Both picked the thumbnail frame on a timeline relative to the first frame, but Chrome shows a paused video on the media's own timeline; when the Intro's first video frame is not at 0 (@black: 0.007 s) they used the next frame, 33 ms late. Fixed and deployed on TESTING (poster 8895ed0, share copy e52de5a; worker redeployed from 75df33e); @black's share copy regenerated with Mazen's authorization now starts on the correct frame.
related: [REV-0029, DEC-0012, REV-0030, REV-0031]
save_approval: Mazen 2026-10-28
kind: BUG
authorization: Mazen 2026-10-28, task "GamID - Finish Intro Poster Validation & Discord Frame Bug" (TESTING only; fix the share-copy frame rule, add regression tests; no replacement of real-account Discord media without separate approval)
acceptance: Mazen 2026-10-28 confirmed the fix on TESTING (worker redeployed from 75df33e; @black's poster and regenerated share copy show frame 131, the chosen frame; evidence PROJECT_HANDOFF.md §144-§145)
truth_refs: [intro-discord-thumbnail, public-intro-poster]
checkpoints: [8895ed01cf158e8fccb5740f34c2b9d63dde6962, e52de5a79021de906690c424d4fffda68c9eec53]
sources: [PROJECT_HANDOFF.md, docs/INFRA-OPTIMIZATION-V1.md]
---

## Description

- **The rule both features promise:** the Intro Thumbnail for Discord (share copy) and the public Intro poster must show exactly the frame the owner chose: the frame a paused browser shows at that time.
- **What the code did:** both counted the chosen time from the Intro's first video frame (`times[i] - times[0] <= at`).
- **What Chrome does:** it shows the last frame whose presentation time on the media's own timeline is at or before `currentTime`, and the first frame before that.
- **When they differ:** when the derivative's first video frame is not at 0. @black's Intro starts its video at 0.007 s, because of the Opus pre-skip. The worker then took the following frame.

## Evidence

- **@black, chosen frame 4402 ms (2026-10-28):**
  - Chrome's paused frame is frame 131 (presentation time 4.374 s).
  - The worker chose frame 132 (4.407 s): the poster matched the paused video at about 20 dB on screen, a visibly different motion-blurred frame.
  - The accepted share copy's first frame equals derivative frame 132 (50.4 dB), against 19.1 dB for frame 131.
- **Chrome seek lab on the same file:**

  | currentTime (s) | Frame shown (presentation time, s) |
  |---|---|
  | 4.373 | 4.340 |
  | 4.374 | 4.374 |
  | 4.406 | 4.374 |
  | 4.407 | 4.407 |
  | 0 to 0.006 | the first frame (0.007) |

- **Why earlier tests missed it:** the GM-TEST-01 fixture's first frame is at 0, so the two rules agree there.

## Resolution

- **Poster (`8895ed0`):**
  - deployed by Mazen;
  - the deployed worker regenerated @black's poster as frame 131: byte-identical to the local fixed output (208,466 bytes);
  - 44.0 dB against the paused video on desktop.
- **Share copy (`e52de5a`):**
  - the same media-timeline rule in `sharePlan`;
  - regression tests for a non-zero first frame, an exact frame boundary, one millisecond before it, before the first frame, and @black's real timestamps;
  - generated locally from @black's derivative (not uploaded): the first frame is frame 131 (46.8 dB), the worker's own validation passes, and the rest of the Intro matches the accepted copy (44.47 vs 44.52 dB, 332 frames each).
- **Deployed (2026-10-28):** Mazen redeployed the TESTING worker from `75df33e`, which contains `e52de5a`.
- **@black's share copy, regenerated with Mazen's authorization by the deployed worker (103 s, 1 attempt):**
  - the first frame is frame 131: 46.8 dB, identical to the locally tested output; 19.1 dB against frame 132;
  - the rest of the Intro is intact: 44.52 dB against the derivative, 332 frames, 11.049 s;
  - the audio is offset by exactly one frame (1,600 samples = 33.33 ms, correlation 0.986), matching the one-frame lead-in, so sync is preserved.
- **Discord card:** `/@black/intro-discord.webm` serves the new copy byte for byte, and the card's version tag changed (`?v=03ec022c`).
- **Nothing else changed:** @black's Intro, chosen frame, settings and Wall are unchanged; no other account's share copy changed.

## History

- 2026-10-28 OPEN — found during Mazen's real-Intro poster review on @black (PROJECT_HANDOFF.md §143).
- 2026-10-28 AUTHORIZED — Mazen approved saving this record and authorized the TESTING fix. The poster fix was deployed and verified; the share-copy fix is committed and tested locally, and awaits the worker redeployment.
- 2026-10-28 FIXED — worker redeployed by Mazen (`75df33e`); @black's share copy regenerated with his authorization and verified (frame 131, full Intro, audio sync, Discord route). PROJECT_HANDOFF.md §145. VERIFIED awaits Mazen's confirmation.
- 2026-10-28 VERIFIED — Mazen confirmed (task "Roll Out Public Intro Poster to All TESTING Accounts").
