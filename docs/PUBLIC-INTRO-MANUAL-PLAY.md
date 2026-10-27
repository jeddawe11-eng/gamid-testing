# Public Intro waits for Play

Status: **ACCEPTED** (GamID Truth `public-intro-manual-play`): Mazen's final acceptance on TESTING, 2026-10-27.
- **Production:** release authorized the same day but **not performed**. No GamID Production environment exists (`PROJECT_HANDOFF.md` §139).
- **Product:** `4b0ac98` and `aefa2da` on `feature/discord-share-card-v2`, under Mazen's task of 2026-10-27, "Final Discord Acceptance + Public Intro Manual Play".
- **Deployed:** `aefa2da` by `deploy-cloudflare-testing.yml` run `40370232675`.
- Not merged; Production untouched.

## Why

Since the Intro foundation (`37812de`, 2026-09-16), the shared Intro player called `play()` as soon as a public Intro loaded. It showed "Tap to play" only when the browser refused autoplay with sound. So whether a visitor saw the Intro start depended on their browser. Chrome, for example, allows it on sites where the visitor has watched a lot of video.

The Discord Thumbnail deployment did not cause this. Mazen asked that the visitor always decides when the Intro starts.

## Behaviour

| Profile | First view |
|---|---|
| Intro + published, enabled Wall | paused Intro → Play or Skip → Wall |
| Intro, no active Wall | paused Intro → Play or Skip → Classic Profile |
| No Intro, active Wall | the Wall directly (unchanged) |
| No Intro, no Wall | the Classic Profile directly (unchanged) |

The same applies whether the visitor arrives from Discord, a direct link or another platform.

- **The poster:** the existing full-screen Intro player shows a static frame of the Intro itself: the same video element, paused.
  - It keeps the same size, fit, ambient glow and responsive layout on desktop and mobile.
  - The frame is the owner's chosen Intro Thumbnail frame while its Discord share copy is ready.
  - Otherwise it is the Intro's first frame: no choice made, a copy still being prepared, or a failed lookup.
- **The Play button:** centred, with a Play icon and the label "Play Intro". It is the player's existing button, which before only appeared when a browser blocked autoplay.
- **Play:** starts the Intro from 0:00 with sound.
- **Skip:** stays available before and during playback. Skip and the Intro's end run the existing transition.
- **Replay Intro:** an explicit click, so it plays at once, as before.
- **Unchanged:** the owner's Preview Intro in the editor, the landscape hint and the accepted Discord card (`discord-share-card`).

## Code

- **`dist/account/intro-preview.js`:** with `config.awaitPlay`, the player seeks to `config.posterMs` and shows the button. Its only `play()` call is in the button's `start()`.
- **The 120 s lease** is unchanged:
  - A waiting Intro isn't ended by it.
  - If less than the resolver's 35 s playback margin is left when Play is pressed, the player asks the page (`gamid-intro-preview-play`) for a fresh lease.
  - The page revalidates the public Intro and signs again, without stopping the Intro first, so the profile never flashes.
  - The renewed config plays at once and is never asked to wait again, so no renewal loop is possible.
- **`dist/public/public.js`:**
  - The first presentation sends `awaitPlay: true` with `posterMs` from the existing anonymous `get_public_intro_share`, through `getPublicIntroPosterMs` in `supabase-client.js`, which returns only the time.
  - Replay sends `awaitPlay: false`.
- **Player markup and CSS:** `intro-preview.html` / `intro-preview.css` hold the button's icon and label.
- **Tests:** `tests/public-intro-manual-play.test.js`.

No database, Worker, Cloud Run or Discord change.

## TESTING checks (2026-10-27)

Live TESTING, read-only. The profiles were only viewed:
- @black: Mazen's, with an Intro, a Wall and a chosen frame at 4.402 s;
- @nmk: an Intro, no Wall and no chosen frame.

The two combinations without an Intro used those profiles with the Intro removed from the identity response, in the test browser only.

| Check | Result |
|---|---|
| Chromium (Playwright, autoplay explicitly allowed), 1440×900 and 390×844 phone | PASS: no `play()` call before Play; paused on 4.402 s (@black) / 0 s (@nmk); button centred (0, 0 px off); stage = viewport; Skip shown |
| Play | PASS: starts from 0:00, unmuted, volume 1 |
| Skip before / during playback | PASS: @black's Wall |
| Intro end | PASS: Wall (@black), Classic (@nmk) |
| No Intro + Wall / no Intro + Classic | PASS: opened directly |
| Replay Intro | PASS: plays at once |
| Waiting 97 s, then Play (lease renewal) | PASS: still paused with Play until then; plays from 0:00; no profile in between |
| Mazen's own Chrome 156 (returning visitor; it previously autoplayed) | PASS: paused on the chosen frame, Play Intro shown (Play not pressed) |
| Android Chrome 154 (emulator, real touch tap) | PASS: paused on the chosen frame at full screen; the tap starts from 0:00, unmuted |
| WebKit (Playwright, Windows) | PARTIAL: no `play()` call, Play and Skip shown; this build decodes no WebM, so the poster frame could not be checked |
| Discord card | PASS: unchanged (no Worker diff; same components, B1, accent, share-copy URL) |

**Not tested:**
- **Firefox:** its binary does not start on this machine.
- **Real Safari** on macOS and iOS.
- **A physical iPhone or Android phone.**

iOS Safari may not draw a paused frame before the first tap; the button is shown either way.
