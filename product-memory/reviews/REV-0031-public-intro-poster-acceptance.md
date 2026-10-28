---
id: REV-0031
title: Public Intro poster - real-Intro visual acceptance on @black, then rollout to all TESTING accounts
status: COMPLETED
created: 2026-10-28
updated: 2026-10-28
scope: Truth public-intro-poster on TESTING - the still poster of the public Intro's waiting frame, its frame accuracy, visitor behavior and bandwidth, the acceptance gate and the rollout to every account
summary: PASS - Mazen approved the poster experience on his real profile @black after the frame rule was corrected (ISS-0020); the deployed worker's posters match Chrome's paused video, no Intro video is downloaded before Play, Play / Skip / Replay / routing are unchanged; then rolled out to every TESTING account with all 4 active Intros covered and no failures.
related: [REV-0030, ISS-0020, ISS-0019, DEC-0012]
save_approval: Mazen 2026-10-28
review_type: ACCEPTANCE
outcome: PASS
reviewer: Mazen (visual acceptance); Claude Code (measurements)
truth_refs: [public-intro-poster, public-intro-manual-play, intro-discord-thumbnail]
checkpoints: [8895ed01cf158e8fccb5740f34c2b9d63dde6962, e52de5a79021de906690c424d4fffda68c9eec53, ef1eef2949ea713e7e00f9c2514509e5516103aa]
sources: [PROJECT_HANDOFF.md, docs/INFRA-OPTIMIZATION-V1.md]
---

## Subject

The public Intro still poster (Infrastructure Optimization & Security Hardening V1). It was built gated to the GM-TEST-01 fixture, and Mazen judged it on his real TESTING profile @black because the synthetic fixture could not show visual quality. On the same day he authorized rolling it out to every TESTING account.

## Method

- **Browser:** an anonymous Chrome harness (Playwright), desktop 1440×900 and Pixel 7 emulation.
- **Bytes:** CDP wire bytes before Play, after Play, on Skip and on a repeat visit.
- **Same frame:** pixel PSNR of the poster against the earlier paused-video waiting frame (the poster lookup blocked) on the same page.
- **Frame identity:** checked against the derivative's frames with ffmpeg, and against Chrome's paused frame in a seek lab on the same file.
- **Integrity:** before/after database snapshots of @black's Intro, settings, share copy and Wall.

## Results

- **Frame accuracy:** the first @black run showed a one-frame-late poster (ISS-0020). After the fix, the deployed worker's poster is frame 131 at 4,402 ms, byte-identical to the verified local output.
- **@black (chosen frame), desktop / mobile:**

  | Check | Desktop | Mobile |
  |---|---|---|
  | Poster | 208.5 KB | 208.5 KB |
  | Video bytes before Play | 0 | 0 |
  | Earlier path, for comparison | 1.76 MB of video | 1.78 MB of video |
  | Same frame: whole screen | 44.0 dB | 32.7 dB |

  - On mobile the Intro area scores 27.4 dB. That is Chrome's image vs video scaling filter: the same frame and composition, slightly softer fine edges. Mazen judged it acceptable.
- **Mazen's decision:** he approved the @black Intro poster visual experience; Truth `public-intro-poster` ACCEPTED.
- **Rollout (all TESTING accounts):**
  - one reversible switch;
  - a bounded backfill queued 2 posters (@nmk, @zshot, first frame), ready in 10–18 s each, on the first attempt;
  - coverage 4 of 4 active Intros; 0 failed or stuck; storage 6 objects, 1.0 MB.
- **After the rollout, desktop and mobile** (@nmk and @zshot without a chosen frame, @black with one):
  - 0 Intro video bytes before Play (before: 0.11–1.22 MB per visit for @nmk / @zshot);
  - the same frame (desktop 44.3 / 49.1 dB);
  - Play from 0:00 with audio; Skip with 0 video bytes; Replay without the poster;
  - Wall / Classic routing unchanged; repeat visits 0 bytes.
- **Failure fallback:** a failed poster read gives the earlier paused-video frame (@nmk at 0 s, @black at 4.402 s), and Play works.
- **No original changed:** no original Intro, chosen frame, setting or Wall changed. @black's share copy was regenerated only for ISS-0020, with Mazen's authorization.

## Follow-up

- **Not released:** Production does not exist; nothing here is a Production release.
- **Still pending:** Truth `public-media-route-protection` (ISS-0019) awaits Mazen's acceptance.

## History

- 2026-10-28 COMPLETED — Mazen approved the poster experience on @black and authorized the rollout; recorded with his approval (task "Roll Out Public Intro Poster to All TESTING Accounts").
