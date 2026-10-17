---
id: REV-0011
title: Intro landscape hint and fullscreen behavior - Final Acceptance
status: COMPLETED
created: 2026-10-17
updated: 2026-10-17
scope: Shared Intro player (public visitor Intro and editor Preview Intro) mobile landscape hint and tap-to-landscape fullscreen, checkpoint 77cfe4f
summary: Mazen gave final acceptance of the Intro landscape hint and fullscreen behavior exactly as implemented, superseding his provisional approval; Chrome's fullscreen notice stays a browser limitation.
related: [REV-0010, REV-0009]
save_approval: Mazen 2026-10-17
review_type: ACCEPTANCE
outcome: PASS
reviewer: Mazen
truth_refs: [intro-landscape-hint]
checkpoints: [77cfe4fb90d51e321e3954ac10bcc6cdfb62f4d3, be6fa4ba93aa40c006b514eb45b7475112d0c0aa]
sources: [docs/INTRO-LANDSCAPE-HINT.md, PROJECT_HANDOFF.md, gamid-truth.json]
---

## Subject

Final acceptance of the mobile Intro landscape hint in the shared Intro player: the animated phone-rotation hint, its 6-second window, tap-to-landscape fullscreen where the browser supports it, and the unchanged playback, transitions and controls. Product checkpoint `77cfe4fb90d51e321e3954ac10bcc6cdfb62f4d3` (implementation `30653d1`, 6-second refinement); delivered to TESTING as `be6fa4b` (run 39021570794). Later TESTING deliveries keep the Intro code unchanged.

## Method

- **Android Emulator (Chrome 154):** the hint appears, turns and is gone after about 6 s; a tap enters landscape fullscreen (rotation 90°); system Back returns to the portrait Intro, still paused (handoff §75). Mazen reviewed it there himself and approved it provisionally (§76).
- **Isolated experiments (Chrome 154, Emulator, outside the repository, no product change):**
  - Every real-fullscreen variant (Intro layer, `<video>`, whole document, same-origin iframe, page title set to `Intro / @handle`) showed Chrome's notice with the page origin, never the title or path.
  - Orientation lock without fullscreen is refused (`SecurityError: The page needs to be fullscreen`).
  - An inline player without fullscreen, using the real player in its real iframe, showed no notice and kept playback, Skip and Back. But it does not rotate the phone automatically, Chrome's address bar stays, and the video area was about 65% of fullscreen (about 89% after a swipe collapses the bar, which then needs a scroll reset and returns on swipe down).

## Results

PASS. Mazen explicitly accepted the current Intro landscape hint and fullscreen behavior exactly as implemented on 2026-10-17, superseding his provisional approval. Truth `intro-landscape-hint` is ACCEPTED, with its checkpoint, contracts and limits unchanged.

- **Why fullscreen was retained:** it is the only tested approach that gives automatic landscape rotation and the full screen for the video. The inline alternative removes the notice but loses both.
- **Chrome's notice:** browser-owned and not suppressible. It shows the origin, so the long Cloudflare TESTING hostname makes it long. A shorter future custom origin (e.g. `www.gamid.gg`) is expected to shorten the displayed address; the notice itself will remain.

## Follow-up

None. No code change, alternative player, domain migration or deployment is authorized by this record.

## History

- 2026-10-17 COMPLETED — Mazen gave final acceptance of the Intro landscape hint and fullscreen behavior as implemented, superseding the provisional approval; he explicitly approved saving this review.
