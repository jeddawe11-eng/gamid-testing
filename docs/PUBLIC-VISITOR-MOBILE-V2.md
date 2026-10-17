# Mobile Public Visitor V2 (TESTING)

Mazen's task "GAMID — PROVISIONAL INTRO ACCEPTANCE + MOBILE PUBLIC VISITOR V2" (2026-10-17), Phase 2: a premium, mobile-first public profile at `/@handle` with the existing desktop visitor profile's functionality. It applies to the public visitor page only; the owner's `/account/` editor is unchanged. Branch `feature/play-together-notifications`; product checkpoint `ace098218bef771cd5b34afff2a9681cb4afb4b3`. **PENDING_ACCEPTANCE** (Truth `public-profile-mobile-v2`); Mazen's manual visual and functional acceptance is required.

## What changed

**Before.** Below 1280px (`DESKTOP_QUERY`, 80rem) the visitor saw the profile card drawn inside the Intro iframe, then a plain panel (Socials with text-mark icons, My Duo, a separate Discord card, Steam, a League card) and My Games without tiles. About Me, Favorite Games, My Crews, Connected Games, game artwork and most brand marks existed only on the desktop.

**Now.** Without a published, enabled Wall, the page draws its Classic Profile at every width:

- **Same components and data as the desktop.** The same `public-desktop.js` hero and About Me, Favorite Games, the sections panel, Connected Games and My Games, built from exactly the data the server already sends visitors.
- **Layouts.** From 1280px the accepted desktop two-column layout, unchanged. Below 1280px **Mobile V2**: one mobile-first column (`html.is-public-mobile`, the `/* MOBILE PUBLIC VISITOR V2` block at the end of `public.css`).
- **Intro.** The Intro frame now only plays the Intro at every width (`hostReveal`); its transition reveals the page's profile, exactly as on the desktop.

Mobile V2 order and design:

1. **Hero:**
   - the Banner (5:2 on phones, 4:1 from 600px; gradient without one);
   - the Avatar (conic ring, initial without one) overlapping it beside the name and @handle;
   - the role chips (primary highlighted), education / work and bio;
   - a **stats row** showing only real public counts: My Games (when public), the public Crews and the Duo. Each opens what it counts: My Games scrolls there and takes focus; Crews opens the existing My Crews view; Duo scrolls to My Duo.
2. **Socials**, as adaptive icons (below). As on the desktop, a connected Discord without a Discord link appears inside Socials, and the separate Discord card is not shown.
3. **My Duo** (Mutual Duo badge, link to the Duo's GamID), **My Crews** (opens My Crews), **Steam**.
4. **About Me:** Member Since always; Location, Languages and Favorite Genres only when public.
5. **Favorite Games:** a swipeable row of portrait covers on phones (the row scrolls, the page never does sideways); four columns from 600px. A card opens Game Details.
6. **Connected Games:** League prototype with PROTOTYPE / UNVERIFIED; opens Game Details. The separate League card is not shown, as on the desktop.
7. **My Games** with game tiles (artwork where the server matched one, initials otherwise), View all, Game Details.
8. **Replay Intro.**

**Adaptive social icons** (`public-mobile.js` `socialSizing`, CSS container query units):

- each count gets an aim-per-row and a maximum size;
- the icons fill the card and stay ≥ 44px;
- from six accounts the size is also bounded by five-in-a-row, so it never grows as the count rises;
- rows are balanced (8 → 4 + 4, 12 → 6 + 6) and wrap naturally on narrow phones.

Measured sizes (px; rows in brackets when more than one):

| Accounts | 320px | 390px | 768px |
| --- | --- | --- | --- |
| 1 | 80 | 80 | 80 |
| 2 | 76 | 76 | 76 |
| 3 | 72 | 72 | 72 |
| 5 | 47 | 58 | 60 |
| 8 | 47 (2) | 54 (2) | 54 (2) |
| 12 | 44 (3) | 47 (2) | 48 (2) |

**Brand marks.** Every platform shows its recognisable mark on Mobile V2. The mobile rules are an exact copy of the accepted desktop mark rules (`tests/public-mobile-v2.test.js` keeps them identical), so the desktop CSS is byte for byte unchanged.

**Unchanged:**

- **Intro:** it plays first and full screen, with Skip, Back / Skip Intro (visitor-nav), Replay Intro, the landscape hint and manual Play.
- **Wall:** a published, enabled Wall replaces the profile body exactly as before.
- **Breakpoint:** crossing 1280px switches the layout in place, without replaying the Intro.
- **Data:** no backend, RPC, visibility, privacy, subscription or data-contract change. Nothing private, owner-only or unpublished is shown, and the owner's Classic Preview shows the same page.
- **Desktop:** its CSS rules and layout are unchanged.

## Desktop → Mobile V2 parity checklist

| Desktop visitor element | Mobile V2 |
| --- | --- |
| Banner (and gradient fallback) | ✓ hero Banner (5:2 / 4:1) |
| Avatar (initial fallback), name, @handle | ✓ |
| Roles (primary highlighted), education / work, bio | ✓ |
| Game count → My Games | ✓ stats row, plus Crews and Duo counts (real public data only) |
| About Me (Location, Member Since, Languages, Favorite Genres) | ✓ (was absent on mobile) |
| Favorite Games (covers, Game Details) | ✓ swipe row / 4 columns (was absent) |
| My Games (tiles, artwork, View all, search, Game Details) | ✓ (tiles were absent) |
| Socials with brand marks, Discord Profile Card | ✓ adaptive sizes, all marks |
| Discord without a link inside Socials | ✓ (was a separate card) |
| My Duo (Mutual Duo, link) | ✓ |
| My Crews entry → My Crews view → Crew Walls | ✓ (was absent) |
| Steam | ✓ |
| Connected Games (League, Game Details, View all) | ✓ (was a League card) |
| Replay Intro, Skip, visitor Back | ✓ unchanged |
| Published Wall replaces the profile | ✓ unchanged |
| No Follow, messaging, activity or other invented actions | ✓ none added (the reference image's Follow / Activity / share link do not exist in GamID) |

## Validation

- **Unit:** `tests/public-mobile-v2.test.js` covers the sizing table, the marks copy, the scoping of every new rule, the stats row and the host wiring.
- **Updated guard tests.** Six pinned the old "mobile visitor untouched" wiring. They now assert the Mobile V2 contract with a dated note, keeping their desktop assertions:
  - `classic-profile-redesign`;
  - `classic-profile-visual-review`;
  - `intro-preview-editor-end`;
  - `gaming-roles-favorites-crews`;
  - `wall-crews-block`;
  - the `classic-preview-browser.mjs` 390px Classic Preview branch.
- **`scripts/public-mobile-browser.mjs`** (mocked anonymous reads, synthetic data only):
  - **Rich profile** at 320, 360, 375, 390, 430, 600, 768, 1023, 1024 and 1152px:
    - every section is present, with no Discord or League duplicates;
    - no horizontal page scroll, content inside the viewport, touch targets ≥ 44px;
    - 12 socials with marks and no letters;
    - game artwork.
  - **Socials:** 1 / 2 / 3 / 5 / 8 / 12 accounts at 320 / 390 / 768.
  - **Interactions at 390:**
    - the stats (focus, My Crews dialog);
    - the My Crews card, Favorite → Game Details, Connected → Game Details, View all;
    - social links (new tab, `noopener noreferrer`);
    - crossing 390 → 1440 → 390 without an Intro replay.
  - **Empty profile:** missing Avatar / Banner, no socials / games / Crews / Duo.
  - **Intro, Wall and reduced motion:**
    - the Intro plays first, Skip reveals Mobile V2, Replay;
    - a published Wall still replaces the profile;
    - with reduced motion the stats jump instantly.
  - **Desktop:** 1280 / 1440 / 1920 screenshots compared with the starting `dist`.

Chrome headless with mobile emulation only.

## TESTING delivery

- **Deployment:** source `2889d3b44197751efe16617736b514117d3875da`, [workflow 39025962088](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39025962088) SUCCESS, at <https://gamid-testing-static.gamid.workers.dev/@black>.
- **Served files:** exact.
- **Post-deploy review:** the live review passes at 320, 390, 430, 768 and 1023px.
- **Status:** awaiting Mazen's manual visual and functional acceptance.
