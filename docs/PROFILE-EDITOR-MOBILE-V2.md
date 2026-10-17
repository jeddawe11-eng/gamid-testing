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

  Cards summarise the live editors and show UNSAVED when they have a draft. Summaries reuse the sections' own status text, plus the Avatar, Banner and game thumbnails, social marks, connection, Duo and Crew rows, and Game Display ON / OFF chips. Mobile captures no video frames or provider images.
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
