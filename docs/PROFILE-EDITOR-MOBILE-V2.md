# Mobile V2: the Profile Deck (TESTING)

Implementation checkpoint: `a0c7c95580e7e3375aa095fdc62de520059236ac`, authorized branch `feature/play-together-notifications`, starting from verified `82c3cd6`. Mazen authorized implementation and TESTING deployment on 2026-10-17 ("GAMID — IMPLEMENT MOBILE V2: THE PROFILE DECK"), using the 11-board "The Profile Deck" design proposal and its recommended choices as the baseline. Arabic / RTL localization was explicitly excluded: Mazen plans ten languages as a separate task. **PENDING_ACCEPTANCE**: Mazen reviews it in his Android Emulator. It is not accepted.

## What changes below 1024px

The accepted Desktop editor (1024px and wider) is unchanged. Below 1024px the flat list of independently expanding sections is replaced by:

- **Page title and identity hero.** The original `YOUR GAMID` heading, then the saved Banner, Avatar, display name and @handle. The hero also holds the existing GamID visibility chip with its Publish / Unpublish button, plus Preview Your GamID Classic and Share. Share opens the existing link / QR section.
- **Sticky section chips:** Media, About, Social, Games, Play, Wall. A chip scrolls smoothly to its group (instantly with reduced motion), and the highlight follows the group in view.
- **Six groups following the accepted Desktop pairs:**

  | Group | Cards |
  | --- | --- |
  | Profile media | Avatar, Your Intro, Banner |
  | About Me | About Me, Gaming Roles, Education & Work, Bio, Identity |
  | Socials & Connections | Connections (with League), My Socials |
  | Games | My Games, Game Display |
  | Play & Community | static Play Together, My Duo, My Crew |
  | My Wall | My Wall |

  Cards summarise the live editors and show UNSAVED when they have a draft. Since the visual parity audit (below), summaries carry the Desktop summary content:
  - the Intro paused frame;
  - Avatar, Banner, and game artwork with names;
  - About Me values (location, languages, genres);
  - Discord / Steam / League photos;
  - the Duo with its badge;
  - rich Crew tiles;
  - social marks and Game Display ON / OFF chips.

  The hero adds the saved location and bio.
- **Editor sheet.** A card opens that section's original panel in a full-screen sheet (a centred 640px sheet from 600px) with a 48px Back. One editor is open at a time. About Me shows its five parts as tabs, each with its own Save Changes. The section's Save Changes is sticky at the bottom of the sheet. Back, Escape, a backdrop tap and Android / browser Back all close the sheet: one history entry is pushed per opened sheet, so Back never leaves the page. Closing never saves or discards; focus returns to the card.
- **Unsaved bar.** The original `#saveAllBar` (Save All Changes and its feedback) is moved into a sticky bottom bar. The bar appears only while a section has unsaved changes, Save All is running, or its result is still shown. It names the unsaved sections in Desktop order; tapping the names opens the first one.
- **Dialogs.** The existing dialogs keep their copy and logic. Below 600px, the Wall visibility and Crew member-removal confirmations become bottom sheets with 52px actions. The Avatar crop, Intro preview, QR and Classic preview dialogs are unchanged and open above the sheet.
- **Responsive.**
  - 320–374px: a 12px gutter, Media in one column, Share on its own row.
  - 375–599px: Avatar and Intro side by side.
  - 600–1023px: the groups' cards in two columns and a centred editor sheet.
  - The shell is a single column below 1024px, which removes the old two-column overflow at 760–879px.

## How it works

`dist/account/mobile-editor.js` mirrors `desktop-editor.js`:

- **Moving, not rebuilding.** It moves the original section cards (with comment restoration slots and explicit `form="profileForm"` ownership) into the deck and sheet. It never clones or rebuilds a control, so drafts, Avatar crop Blobs, Banner positioning, Intro local sources, uploads, save routing, dirty detection, feedback lifecycles and owner cleanup stay with their original controllers.
- **Toggle clicks.** A capture listener turns the original disclosure toggles (including programmatic clicks) into "open this sheet".
- **Mount order.** `profile-editor.js` mounts the deck before the Desktop editor, so at the 1024px boundary the deck hands the cards back first. Going down, it reads the Desktop editor's open section and reopens it as a sheet; going up, it asks Desktop to reveal the sheet's section.
- **Unchanged API.** `account.js` keeps calling `editor.desktop`; every call reaches the unchanged Desktop editor, then the deck.
- **Stylesheet.** `mobile-editor.css` is loaded with `media="(max-width: 1023.98px)"`, and every rule is also inside that media query. It uses logical properties and mirrors chevrons with `:dir(rtl)`, so the coming localization task is not blocked. No language behavior, translation system or setting changed.

No backend, RPC, storage, upload, limit, quota, privacy, provider or publication contract changed. `desktop-editor.js` and `desktop-editor.css` are byte-identical.

## Validation

- **`npm run build`:** lint, both type checks and the full suite; 1917 tests, 1916 pass, one opt-in skip, zero failures. This includes the new `tests/mobile-editor.test.js` (group coverage, media-qualified CSS, mount order, move-not-clone, history handling).
- **`scripts/classic-preview-browser.mjs --mobile-deck`:** all backend traffic intercepted, synthetic fixture only.
  - **Matrix:** 360, 375, 390, 430, 600, 768, 820 and 1023px, each with populated, rich (14 games, 10 Crews, 12 socials, long labels) and empty data: 24 cases, all PASS.
  - **Every case checks:**
    - the hero, the Preview / Share / Publish controls, six groups, six chips and every card;
    - no horizontal page overflow, and content contained inside each sheet;
    - deck controls of at least 40px;
    - the chip scrolling to Games;
    - each of the 16 editors opening alone, with its own Save Changes;
    - no writes from navigation.
  - **The full flow, at all eight widths:**
    - Bio and Identity drafts through tabs, other editors, Back, Escape, browser Back (the page stays) and focus return;
    - the unsaved bar naming the two drafts;
    - crossing to 1280px (the same editor open on Desktop, Save All back in the Desktop heading) and back (the same sheet reopens with its drafts);
    - saving Bio alone (Identity stays unsaved);
    - Save All from the bar, after which the bar disappears;
    - a notification destination opening My Crew;
    - the Wall visibility confirmation as a bottom sheet below 600px;
    - Classic Preview → Back to Edit keeping a draft.
- **Desktop regression:**
  - `--mobile-deck` with `GAMID_DECK_WIDTHS=1024,1280,1440` against the starting `dist` (`GAMID_DECK_ROOT`): 9 of 9 full-page screenshots (empty, populated, rich) are byte-identical.
  - `profile-editor-browser.mjs` at 1024 and 1440 (paired layout, draft restoration, independent save, Save All, partial failure and retry, notifications, Avatar and Intro drafts, Classic Back): PASS.
  - `--media-review` at 1024, 1440 and 1920, plus 390: PASS.
  - `--crew-ux` at 390, 768, 1024, 1440 and 1920 × seven Crew counts: PASS.
  - Default Classic preview at 1440 and 390: PASS.
- **Test-script changes:**
  - The 390 path of `profile-editor-browser.mjs` drives the old flat disclosures. It was already failing at the starting checkpoint, on its EDIT WALL step, before any change, and it is replaced for mobile by the deck review. Its default widths are now 1024 and 1440.
  - `openEditor` (`desktop-layout-review.mjs`) and the Classic preview helper open editors through the deck below 1024px.

## TESTING delivery

- **Deployment:** source `bceb676c1c64f599c980daa4ddc79be9f5dd0bdf`, [workflow 39001472361](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39001472361) SUCCESS. Account: <https://gamid-testing-static.gamid.workers.dev/account/>.
- **Served files:** ten served Account files match the checkpoint exactly, and `index.html` carries the expected asset stamp `bceb676`.
- **Post-deploy review:** the `--mobile-deck --live` review (served frontend, mocked backend) passes at 360, 390, 430, 768 and 1023px × populated / rich. Desktop at 1024 and 1440 is byte-identical to the starting checkpoint.
- **Status:** awaiting Mazen's Android Emulator review.

Chrome headless with touch emulation only. Physical Android devices, the Android Emulator, other browsers and real accounts were not tested. The real Discord / Steam connect, real uploads and real publishing were not exercised (mocked).

## Visual parity audit (2026-10-17)

Mazen authorized a comprehensive visual parity audit with targeted corrections ("GAMID — MOBILE V2 COMPREHENSIVE VISUAL PARITY AUDIT & FIX"), prompted by his Android Emulator screenshots. Product checkpoint `15e204dcc8e324de3d32efc1e747b041424f45aa`; still **PENDING_ACCEPTANCE**.

The reference was the accepted Desktop implementation (`desktop-editor.js`, rendered with the same fixtures), not the proposal mockups.

**Root cause of all three reported issues.** Only `desktop-editor.js` received the owner media configuration. That covers the Intro lease thumbnail, allow-listed provider photos and `game-artwork` matches applied to the live My Games and My Crew panels. Below 1024px, Desktop removes its artwork and Mobile V2 never added any. The data and the approved sources existed.

**The fix.** `profile-editor.js` now also passes `configureMedia` to the deck. `mobile-editor.js` uses the same helpers, guards and fallbacks:

- `createIntroPoster` for the Intro frame;
- `providerAvatar` / `leagueIcon` for provider photos;
- `applyGameArtwork` with a failed-URL set for game artwork;
- the directory `crewCard` renderer for Crew tiles.

Media is active only while the deck is. On teardown it releases the Intro Blob, restores the provider placeholders and removes its My Games artwork, so Desktop starts from the same DOM as before. `desktop-editor.js` and `desktop-editor.css` are unchanged.

Classification: 1 = confirmed Mobile V2 defect (fixed), 2 = pre-existing or shared with Desktop, 3 = intentional mobile adaptation, 4 = missing source data or artwork, 5 = needs Mazen's real account or the Emulator.

| Section / element | Desktop (accepted) | Mobile V2 before | Root cause | Class | Fix |
| --- | --- | --- | --- | --- | --- |
| Your Intro summary | Real paused frame (owner lease), loading / unavailable states | Gradient + icon | No media config below 1024px | 1 | Same `createIntroPoster`; frame, "Preparing thumbnail…" and "Thumbnail unavailable" states; never plays |
| My Games summary | Artwork tiles with names, "+N", count and favorites | Initials only, no names | Artwork applied only by Desktop | 1 | Same artwork on the live panel; covers with names, "+N more" |
| My Games editor (sheet) | `.game-art` over initials | Initials | Same | 1 | Artwork applied to the live panel; overlay CSS scoped to the deck |
| My Crew summary | Rich directory tiles (game background, icon, faces) | Text rows | Summary chose rows; no artwork | 1 | Same `crewCard` renderer (2 tiles + "+N more"), with artwork |
| My Crew editor list / management | Game icon, identity and Crew Wall art | Letter placeholders | Artwork applied only by Desktop | 1 | Applied to `.crew-list` and `.crew-management-columns` |
| Connections | Discord / Steam avatars, League icon | Text rows | Photos decorated only by Desktop | 1 | Same allow-listed photos in the panel and summary rows |
| About Me | Location, languages and genres values | Generic status text | Summary used status text | 1 | Values shown (draft-aware, as on Desktop) |
| My Duo | Partner + "Mutual Duo" badge | Partner only | Badge not copied | 1 | Badge shown |
| Hero / saved profile | Sidebar card with saved location and bio | Name and handle only | Not copied | 1 | Saved location and bio (2-line clamp) |
| Hero name position | n/a | Name text sat on the Banner once a third line existed | Bottom-aligned name block | 1 | Only the Avatar overlaps the Banner |
| Width boundary with an open sheet | n/a | `history.back()` on teardown could abort a following navigation (found by the Crew UX regression at 768→1440) | Asynchronous traversal | 1 | Teardown closes without `history.back()`; the same-URL entry left behind is inert |
| Crew tile refresh with failed artwork | Tiles rebuilt on every summary refresh, so a failed background image is requested again | Same once tiles were added | A CSS background failure cannot be detected | 1 (mobile), 2 (Desktop, unchanged) | Mobile reuses an unchanged tile, so no repeat requests while idle or typing. Desktop is left as accepted. |
| Avatar / Banner quick buttons | Change Avatar, Change Banner / Remove in the summary | Card opens the editor with the same controls | Tap-to-edit sheet design | 3 | None |
| My Socials summary | First five platforms, Added / Not added | Added marks + "N of 12" | Compact phone summary | 3 | None |
| Saved social marks in the sidebar card | Shown | In the My Socials card | Avoid duplication on phones | 3 | None |
| Intro tile tap | Plays Preview Intro | Opens the Intro editor (PREVIEW INTRO there) | One action per card | 3 | None |
| Crew identity artwork size | 24% box, 2.4:1 | Same | Accepted Crew stylesheet at every width | 2 | None |
| Games / Crews without matched artwork | Initials / gradient | Same | No reliable server match | 4 | None (no invented artwork) |
| My Wall images, videos, layers | Wall editor page, status only in the Account | Same | Wall editor is not part of the Account editor | 3 | None |
| Header, notifications, status chips, dialogs, Save Changes / Save All | As accepted | Re-checked: no differences beyond the Mobile V2 design | — | 3 | None |

**Privacy.** Unchanged:

- the existing authenticated 120-second Intro lease, with a memory-only Blob;
- the provider photo URL allow-list, loaded with no referrer;
- the owner `game-artwork` function, with SteamGridDB CDN URLs only.

No media is made public or newly signed, and nothing is generated.

**Validation:**

- **Build:** 1918 tests, 1917 pass, one opt-in skip, zero failures. Includes a new guard that Mobile V2 uses exactly the Desktop media sources.
- **`--mobile-deck`:** now uses the media fixtures, plus a `failed` scenario where every image fails.
  - **Matrix:** 320, 360, 375, 390, 430, 600, 768, 820 and 1023px × populated / rich / empty / failed: 36 cases.
  - **Media checks:**
    - the Intro frame decoded;
    - three provider photos;
    - game artwork in the summary and the live editor, covering the initials;
    - Crew tile and editor artwork;
    - fallbacks (initials, "Thumbnail unavailable");
    - no request loop while idle;
    - zero Intro playback.
  - **Layout and flow:**
    - the hero never covers text on the Banner;
    - the full draft / save / boundary / dialog / preview flow at all nine widths.
- **Desktop:**
  - 12 of 12 screenshots (1024, 1280, 1440 × four scenarios, media on) are byte-identical to the pre-Mobile-V2 checkpoint `82c3cd6`;
  - paired editor functional 1024 / 1440, `--media-review` (1024, 1440, 1920, plus 390 now asserting mobile media and the hand-back to Desktop), `--crew-ux` (35 cases) and Classic preview all PASS.
- **Evidence:** before / after screenshots come from the same fixture: deployed `bceb676` versus the fix at 390px (dashboard, My Games, My Crew and Connections sheets).

**Unverified (class 5):**

- which of Mazen's 14 games and his Crews have server-matched artwork;
- real Intro frame capture from his saved Intro in Android Chrome;
- real provider photos;
- Emulator rendering and touch;
- data use of the thumbnail capture on a phone.

All tests used Chrome headless with mocked data.

**Audit TESTING delivery:** source `4786c5914f7dc8c42deb0d0f3da2f4430d4bd9e0`, [workflow 39007625520](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39007625520) SUCCESS.

- **Served files:** twelve served files are exact.
- **Post-deploy review:** the live review passes at 320, 390, 430, 768 and 1023px × populated / failed media.
- **Desktop:** byte-identical at 1024 and 1440.
- **Status:** awaiting Mazen's manual verification.
