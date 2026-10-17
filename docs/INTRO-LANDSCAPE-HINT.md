# Mobile Intro landscape rotation hint (TESTING)

Mazen's task "GAMID — MOBILE INTRO LANDSCAPE ROTATION HINT" (2026-10-17): a TikTok-inspired animated phone that turns from portrait to landscape, inviting the viewer to watch a horizontal Intro in landscape fullscreen. Branch `feature/play-together-notifications`; product checkpoint `77cfe4fb90d51e321e3954ac10bcc6cdfb62f4d3` (6-second refinement, 2026-10-17), on top of `c3113d0e887ee12878fdd9ec6e09501728c72749` (implementation `30653d1`; `c3113d0` restores LF line endings in `intro-preview.html`, with no content change). **PENDING_ACCEPTANCE** (Truth `intro-landscape-hint`).

## Where it lives

The Intro playback surface is the shared Intro player `dist/account/intro-preview.html` + `intro-preview.js`. Two hosts use it:

- the public visitor Intro (`dist/public/index.html`, `#experienceFrame`, `publicMode`);
- the Account editor's Preview Intro (`#introPreviewFrame` in the Preview dialog).

The Account editor's Intro *thumbnail* (Mobile V2 card, `editor-media.js`) is a different thing and is unchanged.

**New:**

- `dist/account/intro-landscape.js`: the eligibility rule and the hint / fullscreen controller.
- `#landscapeHint` and `#landscapeExit` inside the existing Intro layer.
- Styles appended to `intro-preview.css`.

**Changed:**

- Both host iframes now carry `allow="autoplay; fullscreen"`; before it was `autoplay`.

Nothing else changed in the player. It keeps its single `<video>`, its contain-fit 16:9 foreground with the synchronized blurred ambient canvas drawn from the same video (`video-fit.js`), its transitions, and its manual Play ("Tap to play" when the browser refuses the start). No second video stream, no backend, privacy or infrastructure change.

## Behavior

- **When.** The hint is offered once per presentation (each Intro start or Replay), as soon as the video's metadata is known, and only while the Intro is playing or waiting for Play. All of these must hold:
  - a touch-first screen (`pointer: coarse`) held in portrait (viewport height > width);
  - a landscape video (width / height ≥ 1.2, so 4:3 and wider). Portrait and square clips never get it.
  - Before metadata, nothing is shown.
  - A phone already in landscape, and Desktop, never get it.
- **Look.**
  - A 52 × 52 px rounded glass button, bottom-left above the progress bar, clear of Tap to play (centre), Skip and the public host's Back / Skip group (top-right), and the editor's Return to editor (bottom-right).
  - A phone outline turns 0° → 90° in about 1.2 s and holds, with a cyan rotation arc.
  - Since Mazen's refinement (2026-10-17) it shows for 6 s in all: fully visible for 5.5 s, then a 0.5 s fade during which it is still tappable, and gone at 6.0 s. (It was 3 s: fade at 2.6 s.) It never loops.
  - It stays for its window even if Play is pressed (it does not cover Play).
  - Reduced motion: a static landscape phone that appears and goes without animation or fade.
- **Tap (Fullscreen API available).**
  1. The hint closes, and `requestFullscreen` is called on the existing Intro layer (same video element, ambient canvas, Skip, Tap to play, progress).
  2. Then `screen.orientation.lock('landscape')` is tried.
  3. A refused or unsupported lock is ignored: fullscreen stays, and the viewer can rotate manually. The layout re-fits on resize as before.
  4. The video is never played, paused, seeked or reloaded. A paused Intro stays paused until Play; a playing Intro keeps playing from the same position with the same volume and mute.
- **Exit.**
  - **Exit fullscreen** (top-left, fullscreen only) or the system Back / gesture leaves fullscreen and unlocks the orientation.
  - Skip Intro, a stop / lease end, page hide and a new presentation also leave fullscreen and cancel the hint timers.
  - When the Intro ends in fullscreen, the player first leaves fullscreen, then runs its normal transition to the profile / Wall in the portrait frame, so the completion behavior is unchanged.
- **Without the Fullscreen API** (e.g. iPhone Safari, which has no element fullscreen): the same animated hint is a manual-rotation cue labelled "Rotate your phone to watch in landscape". Tapping it only dismisses it, and playback is unaffected.
- **Accessibility.**
  - It is a real `<button>`, so it is keyboard reachable, with label "Watch in landscape fullscreen" (or the rotation label) and visible focus.
  - Exit is a labelled 44 px button.
  - Fullscreen has no focus trap; its own Exit and system Back always work.

**Browser limits.**

- **Orientation lock.** Forced rotation is not universal. It works only where the browser grants `screen.orientation.lock` during fullscreen (typically Android Chrome), and is otherwise ignored.
- **Fullscreen from an iframe.** It relies on the iframes' `fullscreen` permission.
- **iPhone Safari** cannot fullscreen a page element, so it gets the manual-rotation cue.

## Validation

- **Unit tests** (`tests/intro-landscape.test.js`, 6 tests):
  - eligibility: landscape / 4:3 yes; portrait, square, no metadata, landscape viewport and desktop no;
  - one showing per presentation, the 5.5 s fade, gone at 6.0 s, still tappable while fading, and cancelled timers;
  - fullscreen and landscape lock on tap, Exit and unlock;
  - a refused lock and an external exit;
  - the manual-rotation fallback;
  - the player wiring, one `<video>`, and both iframes' `allow` lists;
  - a guard that the controller never calls play / pause / currentTime / src / load.
- **`scripts/intro-landscape-browser.mjs`:**
  - **Setup:** Chrome with mobile touch emulation, playing the real player in a host iframe with the production `allow` list. The test videos are generated in the browser with an audio track.
  - **Widths:** 320, 360, 390, 430 and 768px, each checking:
    - the hint appears, has turned to 90°, and is clear of Tap to play, Skip and progress;
    - no horizontal overflow, and gone after its 6 s window (fade measured at about 5.5 s; a tap during the fade still enters fullscreen);
    - paused tap → fullscreen without any `play()` call, same source and position, Exit back;
    - playing tap → still playing, position continued, same source, volume and mute, Exit still playing;
    - Skip from fullscreen leaves it, and the profile shows;
    - an Intro ending in fullscreen leaves fullscreen, then transitions to the profile;
    - portrait and square clips get no hint;
    - rapid replays leave no stacked hints or timers.
  - **Also:** reduced motion (static 90°, no animation), phone already in landscape (no hint) and Desktop (no hint).
  - **Limit:** headless Chrome cannot rotate, so the orientation lock stayed portrait there, which exercises the refused-lock path.
- **Regression (`--mobile-deck`):** now also opens Preview Intro from the Intro sheet and checks that Return to editor and the frame's Skip both return to the editor.

## TESTING delivery and device check

- **Deployment:** source `d10ca52e5d20e6d6745e726945a931ca4ba71af9`, [workflow 39013335904](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39013335904) SUCCESS. Served files are exact, and the `--live` hint review passes 8 of 8.
- **Android Emulator (Chrome 154), real device:**
  - **Verified:** manual Tap to play; the hint appears, turns from portrait to landscape and is gone after its window; layout clear of every control.
  - **Not verified (needs Mazen):** tap → fullscreen / orientation lock. The one scripted tap fell in the fade, and the result was inconclusive.

## Chrome's fullscreen notice ("… To exit full screen, press Esc")

Mazen saw this notice in the Android Emulator when the Intro entered landscape fullscreen (2026-10-17). It is the browser's own security UI, not GamID's, and **a site cannot remove it**:

- **The standard.** The Fullscreen API Standard (§8, Security and privacy considerations) asks user agents to make sure, "e.g. by means of an overlay", that the user knows something is fullscreen. It also asks them to "provide a means of exiting fullscreen that always works and advertise this to the user". `requestFullscreen` may "optionally display a message how the end user can revert this", at the browser's discretion.
- **What a page can pass.** `FullscreenOptions` holds only `navigationUI` and `keyboardLock`, and neither controls the notice:
  - `navigationUI` is a screen-space hint, and we already pass `"hide"`.
  - `keyboardLock` would only change the wording, toward "press and hold Esc".
- **No site-level switch.** There is no header, Permissions Policy, manifest field for a tab, or other supported site setting that turns the notice off. Hiding it with CSS / DOM is impossible (it is browser chrome) and would be against the anti-spoofing intent.
- **Wording.** The wording depends on the browser and device. The Emulator has a hardware keyboard, hence "press Esc"; a touch-only phone may show a swipe instruction instead.

**What GamID already does to keep it rare.** Fullscreen is entered only when the viewer taps the hint, never automatically, so the notice appears only after that deliberate tap, once per entry. Nothing re-enters fullscreen during the Intro. Orientation changes inside fullscreen do not re-request it. Leaving happens only through Exit, system Back, Skip, a stop or the Intro's end.

No change was made for this item: there is no supported way to suppress the notice, and a custom replacement notice was explicitly not wanted.
