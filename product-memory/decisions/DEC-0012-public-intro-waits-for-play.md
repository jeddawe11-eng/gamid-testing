---
id: DEC-0012
title: Public Intro waits for Play — the visitor always decides when the Intro starts
status: ACCEPTED
created: 2026-10-27
updated: 2026-10-27
scope: The public GamID profile's Intro presentation for visitors (desktop and mobile, whatever link they arrive from)
summary: The public Intro never autoplays. It opens full screen on the owner's chosen thumbnail frame, or else its first frame, with a mandatory Play Intro button. Play starts it from 0:00 with sound; Skip stays available; Replay Intro plays at once; the end or Skip routes to the Wall or the Classic Profile.
related: [REV-0029, REV-0011, DEC-0003]
save_approval: Mazen 2026-10-27
authorization: Mazen 2026-10-27, task "Final Discord Acceptance + Public Intro Manual Play" (implementation and TESTING deployment)
acceptance: Mazen 2026-10-27 approved the final TESTING results and accepted it (PROJECT_HANDOFF.md §139)
supersedes: []
truth_refs: [public-intro-manual-play, discord-share-card]
checkpoints: [4b0ac981f67f58c76a296111fa65236f95970482, aefa2da62936344f3e3ede796aecce16b807a41c]
sources: [docs/PUBLIC-INTRO-MANUAL-PLAY.md, gamid-truth.json, PROJECT_HANDOFF.md]
---

## Context

Since the Intro foundation (2026-09-16), the shared Intro player called `play()` as soon as a public Intro loaded. It showed "Tap to play" only when the browser refused autoplay with sound, so whether a visitor saw the Intro start on its own depended on their browser. Chrome, for example, allows it on sites where the visitor has watched a lot of video. Mazen asked that the visitor always decides.

## Decision

- **Poster:** the public Intro opens full screen and paused on a frame of the Intro itself.
  - The frame is the owner's chosen Intro Thumbnail frame while its Discord share copy is ready.
  - Otherwise it is the Intro's first frame.
- **Mandatory Play button:** a centred "Play Intro" button. There is no autoplay, on any browser or device.
- **Play** starts the Intro from 0:00 with sound.
- **Skip** stays available before and during playback.
- **Replay Intro** is an explicit click, so it plays at once.
- **Routing:** Skip or the Intro's end goes to the published, enabled Wall, otherwise to the Classic Profile. A profile without an Intro opens directly, as before.
- **Unchanged:** the owner's Preview Intro in the editor, the landscape hint (REV-0011) and the accepted Discord card.

## Reasoning

A visitor-initiated start gives the same experience on every browser. It never surprises anyone with sound, and it shows the frame the owner chose. Reusing the existing player and its button keeps the accepted layout and fallbacks. The 120 s lease is renewed on Play when needed, so a visitor who waits never sees the Intro fail.

## Alternatives considered

- **Keep autoplay with the browser-block fallback:** rejected, because it behaves differently per browser.
- **A separate static poster image:** not chosen, because the paused video frame already gives the same size, fit and glow without a new asset.

## History

- 2026-10-27 APPROVED — Mazen asked that the public visitor always decides when the Intro starts.
- 2026-10-27 AUTHORIZED — His task "Final Discord Acceptance + Public Intro Manual Play" authorized implementation and TESTING deployment.
- 2026-10-27 IMPLEMENTED — 4b0ac981f67f58c76a296111fa65236f95970482 and aefa2da62936344f3e3ede796aecce16b807a41c, deployed on TESTING by run 40370232675 (PROJECT_HANDOFF.md §138).
- 2026-10-27 ACCEPTED — Mazen's final acceptance on TESTING (§139). He approved saving this record; it was proposed under a later number and saved under the next free ID (see INDEX.md, 2026-10-27).
