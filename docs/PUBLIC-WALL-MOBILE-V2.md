# Mobile Public Wall Visitor V2 (TESTING)

Mazen's task "GAMID — MOBILE PUBLIC WALL VISITOR V2" (2026-10-22).
- **Scope:** the published Wall as a visitor sees it on a phone (`/@handle`), in portrait and landscape.
- **Not in scope:** the signed-in Mobile Wall Editor, the Classic Profile visitor and the desktop Wall.
- **Branch:** `feature/mobile-public-wall-visitor-v2`, from `0e5ec45`. Product commit `f62a1ff2c801b2879dfcb41f4962b51bf3c498be`.
- **Truth:** `public-wall-mobile-v2`, PENDING_ACCEPTANCE.

## 1. Audit of the previous experience

The audit read the code and ran the real `/public/` page with synthetic published Walls (`scripts/public-wall-fixtures.mjs`) at phone, tablet and desktop sizes.

**How the visitor page worked.**
- `/@handle` loads `public.js`.
- `get_public_wall` returns the published snapshot, which the server decides on (PUBLIC GamID, published, enabled).
- After the Intro, `public-wall.js` paints every stage with the same renderer Preview uses (`paintDocument` in view mode). The stages form one vertical column whose width is the page's width, from 280px to at most 900px.
- The Whole-Wall background is laid across the stacked stages, so it runs continuously from one stage into the next.

| Area | Before | Class |
|---|---|---|
| Route, anonymous access, published snapshot only, Wall replaces the profile after the Intro | Correct; drafts never reach the page | Already working |
| Desktop / tablet column (≤ 900px) | Correct | Already working (desktop) |
| Portrait phones | Each stage as wide as the screen. At 390×844 a stage is 390×693, about one screen. At 320×568 it was 1px taller than the screen. | Working; small phones needed adaptation |
| **Landscape phones** | Each stage as wide as the screen: 844×1501 at 844×390, about 3.9 screens per stage, so a visitor never sees one whole stage | **Requires mobile adaptation** |
| **Stage navigation** | None: no indication of the stage or the stage count, only scrolling | **Missing** |
| **Rotation** | A repaint at the new width kept the pixel scroll position. A visitor on stage 2 who rotated landed on stage 1 (measured). | **Present but broken** |
| **Rotation under a player** | Any resize repainted and destroyed every embed player, so rotating while a player is fullscreen ended it (code: `players.destroyAll()` on every repaint) | **Present but broken** |
| **Safe areas** | The page asks for `viewport-fit=cover`, but the Wall column did not keep clear of a landscape notch | **Requires mobile adaptation** |
| **A Wall the page cannot draw** | An empty page | **Present but broken** |
| Text, custom fonts, glow / outline, Living Fire | Correct | Already working |
| Pictures, GIFs, video layers, picture / video / colour / gradient backgrounds, contained backgrounds | Correct | Already working |
| Shapes (library and Freeform), opacity, layering | Correct | Already working |
| Text links, Icon Groups, Cards, players (tap to play) | New tab, `noopener noreferrer`; player only on a tap | Already working |
| GamID blocks | The visitor's public view only | Already working |
| Media access, leases, F3 viewport-gated videos, F6-A URL reuse, F7-A later pictures, F8-B1 renditions | Correct | Already working (unchanged) |
| Touch | Native scrolling; browser pinch-zoom allowed; no custom gestures | Already working |
| Missing media, unpublished / disabled Wall, empty Wall | Placeholders; Classic Profile (`wall-toggle-public-result`); an empty stage | Already working |

## 2. What changed

Everything is in `dist/public/`. Tablets and desktops are unchanged: same column width and same geometry, verified against the baseline `dist/`.

**Phone presentation** (`public-wall.js` `WALL_PHONE_QUERY`, `stageWidthFor`; `html.is-wall-phone`).
- Applies to portrait viewports below 600px wide, and to landscape viewports at most 500px tall and below 1024px wide. This includes 932×430, which the editor's phone query does not.
- **Stage sizing.** Each stage is sized so one whole stage fits the screen's stable usable height. That height is measured as `100svh` minus the safe-area insets, so a browser toolbar sliding in or out never triggers a repaint.
- **Portrait** leaves room for the stage bar. Typical phones are unchanged: 390, 412 and 430 keep the full width. A 320×568 stage is now 283px wide.
- **Landscape** shows the whole stage by default (**Fit**, 219×389 at 844×390). **Wide** fills the column beside the navigator, at most 900px.
- Proportions and saved coordinates are kept exactly: the same painter, only another scale.

**Stage navigator** (`public-wall-nav.js`, `public-wall-mobile.css`).
- **Controls:** Previous, `N / M` and Next, each at least 44px.
- **Placement:** a bar under the stage in portrait; a rail at the right edge in landscape, where it also holds Fit / Wide. A one-stage Wall gets only Fit / Wide, in landscape.
- **Current stage:** the one under the middle of the screen, following the visitor's own scrolling.
- **Moving:** the buttons move the page to that stage, smoothly, or instantly with reduced motion. They never reorder, hide or repaint anything, and stop clear of a notch.
- **Layering:** above the Wall, below the Intro and Back to @previous. Hidden while the Intro plays or replays.
- **Silent:** no sound.

**Rotation and resizing.**
- A repaint at a new size brings the visitor back to the same stage and place.
- Background and layer videos keep playing the same elements: the accepted video pool.
- Nothing is repainted while a player is fullscreen.
- An open inline player keeps playing: the painted Wall is scaled with `zoom` until the player is closed, then repainted.

**Safe areas.** The column keeps clear of notches.

**Free scrolling.** No scroll snapping. A first version used gentle snapping, and the browser E2E caught it pulling the page back from Replay Intro at the end of a landscape Wall, and to the end of the Wall after the Intro. It was removed.

**Unavailable state.** At every size, a Wall that cannot be drawn shows a plain message: "This Wall can't be shown right now. Please try again later."

**Not changed:**
- the renderer and the published snapshot;
- the data, RPCs, storage policies and RLS;
- the media rules;
- `public.css` (the phone rules live in their own stylesheet, loaded with the Wall);
- the Intro, Classic Profile, editors, Assets / Background, delete and publishing.

## 3. Tests

**Repository:** `tests/public-wall-mobile-v2.test.js` (sizing table, stage tracking, scoping, no snapping, wiring); the full suite.

**Browser E2E:** `scripts/public-wall-mobile-check.mjs`.
- What runs: the real `/public/` page and renderer from `dist/`, with every anonymous read mocked.
- Data: synthetic fixtures with one stage, three mixed stages, eight stages, and an empty Wall.
- Environment: Chrome emulation. Not a device and not TESTING.
- Result: **200 / 200**.

| Section | Sizes | Checks |
|---|---|---|
| Sizes | portrait 320×568, 360×640, 375×667, 390×844, 412×915, 430×932; landscape 568×320, 667×375, 740×360, 812×375, 844×390, 932×430 | Phone mode with no horizontal scroll; 9:16 kept; one whole stage fits; centred; elements at their saved coordinates; every element painted; navigator `1 / 3` at 44px, never over the stage; Fit / Wide only in landscape; custom font, GIF, Living Fire, videos, player and links present; links in a new tab without opener / referrer; no page errors |
| Navigation | 390×844, 844×390 (8 stages) | Next walks 2..8 without skipping; ends disabled; Previous; the label follows manual scrolling; reduced motion |
| Rotation | 390↔844 and 430↔932, four rotations | Stays on stage 2; the same video elements continue; landscape Wide / Fit |
| Players | 390↔844 | An open inline player survives a rotation and is repainted after Close; nothing repaints under fullscreen (simulated) |
| States | 390×844, 844×390 | Missing media leaves placeholders and no technical text; empty Wall; one-stage Wall; a Wall that cannot be drawn shows the message |
| Intro | 390×844, 844×390, arriving from another GamID | The Intro plays first with no navigator; Skip lands on stage 1; Back to @previous and the navigator do not collide; Replay Intro is reachable at the end and clear of the navigator; the navigator returns after the replay |
| Media | 390×844, 844×390 | Requests recorded (section 4) |
| Tablet / desktop | 768×1024, 1024×768, 1280×800, 1440×900 | No phone mode, no navigator, column = min(900, page), **geometry identical to the baseline `dist/`** |

**Non-regression:**
- `scripts/public-mobile-browser.mjs` (Classic Mobile V2, including its Wall case, and desktop pixel identity at 1280 / 1440 / 1920): **pass**.
- `scripts/public-desktop-browser.mjs` stops at a Classic desktop assertion ("between About Me and My Games"). It stops at the same place on the untouched baseline, so it is pre-existing and unrelated to the Wall.
- No editor file changed, so the Wall editors are unchanged by construction.

## 4. Media and bandwidth findings (measured requests; no byte totals claimed)

- **The rules are unchanged:**
  - videos are read and played only within 320px of the screen (F3);
  - pictures used only by later stages are read when their stage is within one screen (F7-A);
  - video addresses come only from `public-media` and are reused per F6-A;
  - READY renditions as F8-B1.
- **Requests at load for the 3-stage fixture:**
  - **390×844:** the same as before. The stage-1 and Whole-Wall pictures, both stage-2 video leases and bytes (stage 2 starts within 320px of the screen), and the stage-3 picture (within one screen).
  - **844×390:** the stage-3 picture is now also read at load; before, it was not. In Fit a landscape stage is a whole screen instead of four, so neighbouring stages reach the same unchanged windows sooner. Seeing more of the Wall at once costs those reads earlier.
  - No other request is added: the navigator and the phone stylesheet load no media.
- **Mobile autoplay:** background and layer videos stay muted, inline and looping, as before. Players start only on a tap.
- **Limitation:** a video lease expires after 6 hours. A page left open longer, with a video that had not loaded yet, shows that video's first frame or placeholder until reloaded. This is unchanged.

## 5. Limitations

- Chrome emulation and synthetic fixtures only. iOS Safari, Android Chrome on a device, real notches and real keyboards / toolbars were not tested.
- In landscape Fit a stage is small (219×389 at 844×390). Wide and the browser's own pinch-zoom are the ways to read small text.
- WebM-with-alpha layers depend on the browser's support. This is unchanged.

## 6. TESTING delivery

See `PROJECT_HANDOFF.md` §119.
