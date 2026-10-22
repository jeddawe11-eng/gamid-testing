# My Wall Desktop Editor visual redesign, Phase 1 (TESTING)

Mazen's task "GAMID — My Wall Desktop Visual Redesign — Phase 1" (2026-10-18). A fantasy-gaming client look for the **desktop** Wall Editor at `/wall-editor/` (viewport 900px and wider), in GamID's own identity, following Mazen's approved reference image. **Phase 1 only:** the outer shell, the editor's interface icons and the Add panel. Branch `feature/play-together-notifications`. Visual review by Mazen is pending; this is cosmetic, so GamID Truth is unchanged.

## What changed

**One new stylesheet, `dist/wall-editor/editor-desktop.css`**, linked after the existing editor styles with `media="(min-width: 900px)"`. Below 900px the browser does not apply it at all, so the phone and tablet editor cannot change. The only edits to existing files:

- `index.html`: the `<link>` above, and one supporting line in Add (`<p class="ed-add-sub">Add elements to your wall</p>`).
- `editor.css`: one rule hiding that line below 900px (`.ed-add-sub { display: none; }`).

**Outer shell** (presentation only; same elements, same order):

- **Header.** Deep-navy bar with a gold hairline, a crown mark beside "My Wall / PRIVATE DRAFT", framed Back, Undo and Redo buttons, gold-framed Preview and Save, and Publish in purple with a gold frame and a diamond icon.
- **Panels.** The tool rail, the tool drawer, the canvas column and the Properties panel are separate framed panels (thin gold border, gold corner marks, navy surface) with a small gap, over a deep navy background with soft purple and magenta glow.
- **Canvas bar.** The existing stage label, Multi-select and save / publish status, restyled as the strip above the canvas: the stage label as the active purple tab, Multi-select as a second tab.
- **Rail.** Icon above label; hover, and a purple active state with a gold frame.
- **Canvas surroundings.** A gold-and-navy frame glow around the stage, as editor chrome only.
- **Properties outer.** The framed panel, a gold heading and an empty state with an icon. **The controls inside are not touched.**
- **States.** Hover, focus-visible (gold ring), active, selected and disabled styles; reduced-motion and forced-colors rules; no continuous animation.
- **Size.** The header is 3.7rem; side panels narrow below 1200px so the canvas stays as large as before (see Validation).

**Icons.** One original line-icon family, drawn as CSS masks from inline `data:` SVGs (24-unit grid, stroke 1.7, round caps and joins): Add, Text, Media & Links, Shapes, Background, GamID, Layout, Assets, Templates, plus Artwork, Link, GamID data, Undo, Redo, Back, a chevron, Publish and the crown. They replace the text glyphs (`+`, `T`, `▶`, `■`…) on desktop only: the glyphs stay in the markup for the phone layout. The page CSP already allows `data:` images, so nothing in the CSP changed. No existing shared editor icon set exists (`wall-kit/icons.js` is the Wall's Icon Group element, `platform-icons.js` the social brand marks), so nothing was duplicated.

**Add panel** (inventory unchanged: Text, Shape, Artwork, Link / Embed, GamID block, GamID data): a gold heading, the supporting line, and framed cards with an icon tile, a title, a description and a chevron; hover (purple and gold glow), active, focus and an expanded / on state.

## Deliberately preserved

- **Behavior and structure:** no JavaScript changed. Every element id and every `data-add-action` / `data-tool` is as before; no tool, category, Add action, element type or media format was added or removed.
- **Out of scope, untouched:** element Properties controls, Layers, stages and the stage data model, the text / media / shapes / background / GamID / layout / assets / templates editors, the Wall renderer, the published Wall, the Classic Profile, the public visitor page, the mobile editor, Account, the database, authentication, storage and billing.
- **Social icons:** the Wall's social-media brand icons, Icon Groups and the DEC-0006 contracts are not referenced by the redesign.
- **Reference items that do not exist in the editor are not invented:** the zoom control, Guides / Snap toggles, the bottom stage-thumbnail strip, "Wall Canvas 1080 × 1920", the Add search box, the header stage tabs and a Properties / Layers tab pair. Stages stay in the Layout panel, Layers in the Layout panel, and the stage label and Multi-select stay in the canvas bar.

## Validation

- **`tests/wall-editor-desktop-ui.test.js`** (8 tests): the stylesheet is linked for 900px and wider and loaded last; the Add inventory, rail and editor ids are unchanged; no rule reaches Properties controls, Layers, the stage internals or the renderer; no inline style, remote resource, font, animation or hidden / click-through control (only the decorative header hairline is click-through); the icon family (consistent grid, stroke, round joins, an icon for every rail tool, Add action and header action); social icons are not referenced; focus / hover / active / disabled / reduced-motion rules; the shared stylesheet changed by one rule.
- **Existing suites:** `npm run build` (lint, typecheck, voice typecheck, all tests): 1938 tests, 1937 passed, 0 failed, 1 skipped (as before).
- **Browser checks** (real editor in a local lab with a stand-in session client; no network, nothing reaches TESTING):
  - **Phone and tablet unchanged:** 16 editor states (Add, Text, Media, Layout at 390, 599, 768 and 899px) rendered from `HEAD` and from the change are **byte-identical**.
  - **Behavior unchanged:** one scripted session on both builds, 27 observed steps (every tool, every Add action, Undo / Redo, Multi-select, stage add and switch, Save, Preview open and close, Publish), gives **identical** transcripts, with no page errors. The lab has no live backend, so Publish and Unpublish are checked for parity, not end to end.
  - **Fit:** at 900×700, 1024×768, 1280×720, 1366×768, 1440×900, 1920×1080 and 2560×1440 there is no horizontal overflow, the rail does not scroll, no label is clipped, and the stage is inside the workspace. The canvas is as large as or larger than before below 1200px width and about 2% smaller on tall screens (the taller header).

## Limitations and deviations from the reference

- Fidelity is by styling alone: the frames are thin gold borders with corner marks rather than the reference's ornate, illustrated frames, the corners of controls are rounded rather than chamfered, and the background is gradients, not artwork (no Riot assets or art were used).
- The reference's extra controls above are absent because they are not existing features.
- The reference's wall artwork is illustrative and not part of the editor.

## TESTING delivery

- **Deployment:** source `716b4e74df33b9bd50ee2f802dea2442f69a001a`, [workflow 39044158099](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39044158099) SUCCESS (full project validation and the deployed-site smoke check passed), at <https://gamid-testing-static.gamid.workers.dev/wall-editor/> (it needs the owner's login).
- **Served files:** `wall-editor/editor-desktop.css`, `editor.css` and `index.html` are byte-identical to the commit. The editor itself was not opened with a real account (real accounts are protected); the visual checks above ran on the local lab.
- **Status:** awaiting Mazen's visual review. Phase 2 is not started and not authorized.
- **Update (2026-10-18):** Mazen's Phase 2 task states that this Phase 1 appearance is visually approved and must be preserved. Phase 2 (Text panel and fonts) is in [`WALL-EDITOR-TEXT-FONTS.md`](WALL-EDITOR-TEXT-FONTS.md).

## Media & Links and Icon Group Properties (2026-10-19)

Mazen's task "GAMID — Desktop Media & Links / Icon Group UI Refinement". It covers organisation and look only, desktop only (900px and wider).

- **Product:** `0615a4cc1a082bdaafc82d7eee18c9594de822e7`.
- **TESTING static:** run `39153509185`; changed files served byte-identical.
- **Files changed:**
  - `dist/wall-editor/controls.js`: the Icon Group accordion;
  - `dist/wall-editor/editor-desktop.css`: the Media panel and Icon rows;
  - `dist/wall-editor/tools.js`: the card modes rendered as pieces on desktop;
  - tests.

**Media & Links panel:**
- **Cards:** the platform cards are one even two-column grid in the editor's card style (gold frame, purple hover / open state). Every card is now the same height: 60 px at 1440 and at 1280, where before they were mixed 55 / 46 px. The less prominent platforms keep a dimmer frame.
- **Modes:** "Player · Card · Link · Icon" wraps in whole pieces, so a line never starts with a separator and no word is orphaned. These pieces are rendered only on desktop; below 900px the card keeps the plain text it always had, so the phone and tablet render pixel-identically.
- **Open form:** the open platform / Icon Group / Other form is a framed card with even spacing between the description, link rows, buttons and messages.
- **Unchanged:** platforms, options, paste and detection, and how an Icon Group is created.
- **Scroll height:** the panel scrolls 972 px instead of 866 px at 1440 × 900, because the cards are larger and readable.

**Icon Group Properties** (desktop, one group selected). The same accordion as the text Properties, with its own remembered open / closed state:

| Section | Controls |
|---|---|
| Icons & Links (open) | the "Icons (n of 24)" count, each icon's badge, link, ↑ / ↓ / ✕; Add an icon and its button; the hint |
| Appearance & Spacing (open) | Icon size, Spacing, Align, the wrap hint |
| Position & Size | X, Y, Width, Height, Rotation, Reset rotation, Smaller / Bigger / 2× bigger |
| Arrange | Duplicate, Delete, Forward / Backward / To front / To back, Group / Ungroup |
| Align to Stage | the six align buttons, Keep inside stage and its note |

- **Order:** the existing control order is kept. Each icon row gives the link the full width, with its buttons under it, so the address is readable.
- **Move to stage:** it stays the first control in Properties, above the sections, when the Wall has more than one stage. That is the accepted post-Round 2 rule (pinned by a test), and the text Properties work the same way. So it is not inside Arrange, as the task's example grouping suggested.
- **Unchanged:** the phone panel, and a multi-selection, keep the flat panel.

**Validation:**
- **Tests:** `npm test`: 2005 tests, 2004 passed, 1 skipped. Lint and typecheck pass. New `tests/wall-editor-media-desktop.test.js` (3); the Phase 1 scope guard now allows exactly these two scopes.
- **Controls preserved:** the control inventory equals the pre-change one. The only difference is the three group titles that became section headings: 61 entries before, 58 after.
- **Icon Group walk-through (20 / 20):**
  - creation unchanged; the sections open and close independently, several at once, remembered across rebuilds and selections, separate from the text sections;
  - a link edit re-detects its platform; move down, remove and Add icon work;
  - size / spacing / align / X are saved; undo / redo work;
  - Duplicate, Align Left and Keep inside stage work;
  - Move to stage is first;
  - reload, Preview and the visitor view paint the groups unchanged.
- **Regression:**
  - 59 screen states: only the four desktop Media states changed (intended), and the phone / tablet Media panel is pixel-identical;
  - phone / tablet Icon Group Properties pixel-identical with identical controls;
  - text, Shape, Embed, GamID block and GamID data Properties identical;
  - the 27-step behaviour transcript identical.


### Media & Links / Icon Group UI — acceptance (2026-10-19)

Mazen explicitly accepted the desktop-only visual organization delivered at product `0615a4c` (TESTING run `39153509185`): equal-height platform cards, cleaner spacing, and independently collapsible Icon Group Properties accordions matching Text Properties. All controls remain available; Move to Stage remains above the accordions per the earlier accepted rule. Phone/tablet are unchanged. Product Memory REV-0014. This is scoped acceptance, not final acceptance of the entire desktop Wall redesign. GamID Truth unchanged (`wall-icons` already ACCEPTED).

## Background panel (2026-10-19)

Mazen's task "GAMID — MY WALL DESKTOP BACKGROUND REDESIGN". It covers organisation and look only, desktop only (900px and wider).

- **Product:** `c59a9228019e9724f3adc357e3f94fa69e8dee10`.
- **TESTING static:** run `39199875542`; changed files served byte-identical.
- **Files changed:** `dist/wall-editor/tools.js` (the desktop branch of `renderBackground`), `dist/wall-editor/editor-desktop.css`, and tests.

**Left panel:**
- **Choices:** Whole Wall / This stage only and the five types (None, Colour, Gradient, Image, Video) are the editor's card buttons, with the purple / gold selected state. The type buttons form one even grid of two rows (no lone button).
- **Remove background** is a full-width button.
- **Uploads:** the Images and Videos upload groups are accordion sections (the font library's heading button: name, count, chevron).
  - Images starts open and Videos closed. The state is kept for the editor session, including when switching tools.
  - Choosing the Image or Video type opens that section, so the current upload is always in view.
- **Upload cards:** equal size with a fixed 5.2rem cover thumbnail, the selected card framed.
  - **Use / Selected** and **Delete** sit in one row.
  - "In use: …" (Whole Wall / Stage n background / images on a stage) is a gold badge.
  - The delete confirmation stays inside its card.
  - Video details are two lines ("Video 1" / "1080×1920 · 2 MB").
- **Settings:** a picture or video background's settings are two sections:
  - **Fit & Position:** Fit, now a full-width menu, so "Fill (cover, recommended)" is readable; Position X; Position Y.
  - **Appearance:** Opacity, Flip horizontal / vertical, Darken, and its Overlay colour / %.
  - Colour and Gradient keep their few controls as they are.

**Right panel:** unchanged. Background settings are handled only in this panel by design; no Properties panel was added.

**Not changed:**
- the phone / tablet panel (its exact DOM);
- every control and its order;
- scope / priority / inheritance;
- upload, conversion and deletion rules, usage references and the uploaded files;
- rendering, Preview, the visitor view, save, undo / redo and publishing.

**Validation:**
- **Tests:** `npm test` 2017 (2016 passed, 1 skipped); lint and typecheck pass. New `tests/wall-editor-background-desktop.test.js` (3). The existing B5 safe-deletion guard still holds: Delete is offered for background images and videos only, through the same `deleteControls`.
- **Lab (with opt-in fixture uploads; 4 images, 2 MP4s), Background checks 43 / 43:**
  - every state has the same controls as before, collapsed sections included;
  - section defaults, independence and keyboard, and the state kept across tools;
  - Colour / Gradient controls;
  - Image: auto-open, Selected + In use; Use another upload frees the previous one; Darken / Overlay; Fit; a settings section collapses;
  - delete confirmation and Cancel;
  - Video: auto-open, Selected + In use, Upload MP4;
  - This stage only (inherit note, "In use: Stage 1"); the Whole Wall keeps its video;
  - save / reload / Preview / visitor; no errors;
  - phone / tablet at 390 / 768 / 899 in four states pixel-identical (the panel region; a playing background video is excluded).
- **Regression:** 59 screen states, of which only the four desktop Background states changed; the behaviour transcript is identical.


### Background desktop panel — final acceptance (2026-10-19)

Mazen explicitly accepted the desktop Background visual refinement (product `c59a922`, TESTING run `39199875542`), including consistent scope/type buttons, collapsible Images and Videos, aligned asset cards, and Fit & Position / Appearance sections. This is scoped UI acceptance, not acceptance of the entire Wall Editor. Mobile/tablet UI and background behavior are unchanged. Product Memory `REV-0016`; GamID Truth unchanged because no authoritative capability or contract changed.

*Later (2026-10-21/22):* the Background panel now lives inside Assets as its Background area. It keeps the same controls, and the same CSS rules re-scoped from `[data-tool-panel="background"]` to `[data-assets-area="background"]`. There is no separate Background rail tool any more. See `docs/WALL-BACKGROUND-INSIDE-ASSETS.md`; GamID Truth `wall-assets-background` (PENDING_ACCEPTANCE).

## My Gamer Data panel (2026-10-19)

Mazen's task "GAMID — MY GAMER DATA — PHASE 1 IMPLEMENTATION": desktop only (900px and wider). Phase 1 of `docs/CLASSIC-WALL-IMPORT-AUDIT.md`. Product `e1a43c22d06526e498cdb67326ce90733d83b2db`, TESTING run `39203875352`.

- **Naming:** the rail button reads **My Gamer Data** (on two lines) and the panel heading reads **Import from Classic**. Both are desktop text swaps; the phone keeps "GamID" and "GamID blocks".
- **Library:** one accordion per Classic section. Each heading is the font library's button (name, number of choices, chevron). Profile starts open and the rest closed; any number can be open; the state is kept for the visit. The headings are real buttons with `aria-expanded` / `aria-controls`.
  - **Profile:** Avatar, Display Name, @GamID, Bio, Profile Card.
  - **Gaming Roles:** One Role, All Roles.
  - **My Games:** One Game, All Games.
  - **Connections:** One Connection, All Connections.
  - **My Duo:** My Duo.
  - **My Crews:** My Crews.
- **One entry per choice** (`GAMER_DATA_SECTIONS`, `tools.js`):
  - Single fields add the GamID data element.
  - "One …" adds the GamID data element bound to the item chosen in the owner-only picker.
  - "All …", Profile Card, My Duo and My Crews add the GamID block.
  - Payloads, sizes and placement are the same as the phone lists.
  - Earlier data-collection elements (Roles / Games / Connections) stay valid, drawn and editable.
- **Cards:**
  - Each card has an icon, a name and a note. It shows a count tag from the loaded data, or "Not on your GamID yet" when that data is empty.
  - The card that made the current selection is marked (`aria-current`).
  - A single item uses a picker with an Add button, which is disabled when there are no items.
- **Refresh from Classic:**
  - It runs the same authorised reads as the editor's first load (`loadGamidSnapshot`).
  - Only one read runs at a time: `refreshGamid` joins a read already in progress.
  - The current data stays on screen while the read runs. A read that cannot load the GamID leaves it in place.
  - Feedback is a progress line, then a success or error line (the shared transient-message rule).
  - Linked elements repaint with the new data. They are bindings, so their saved geometry and style are untouched.
- **Unchanged:**
  - the phone and tablet panel (pixel-identical at 390, 768 and 899);
  - data, contracts and schema;
  - the Classic editor and the visitor Wall.
- **Validation:**
  - 2024 tests (0 failures, 1 pre-existing environment skip);
  - lint and typecheck;
  - 43 browser checks in the local lab with a synthetic GamID, all passing. They cover every choice against the old panel, the accordion, keyboard use, the selected state, Refresh (loading, one read, success, error kept, retry), save / reload, Preview, the visitor view, a legacy collection, and phone / tablet pixels.

## Stages bar (2026-10-20)

Mazen's task "GAMID — MY WALL EDITOR — GLOBAL STAGES BAR + APPEND-ONLY STAGE CREATION", on **all** screen sizes. Product `60ca21c`, deployed `2430282` (run `39382427651`).

- **One stage interface:** `<nav id="stageBar">` sits between the header and the workspace, and is shown and hidden with the workspace (never on the sign-in gate). It holds:
  - the strip of **Stage 1 … N** tabs (`#stageChips`, `role="tablist"`), with the current tab highlighted;
  - **+ Add stage**;
  - **← Stage earlier** / **Stage later →** and **Delete stage**, for the current stage.
  - The Delete confirmation, unchanged in wording and rules, now opens anchored under the bar.
  - The element ids are the same as before; the controls moved and are not duplicated.
  - **Layout** keeps Layers and a hint about Move to stage; Move to stage stays first in Properties.
- **Add stage appends:** `ops.addStage(session.doc)` with no position puts the new empty stage after the last one, whichever stage is open. The open stage stays open, and the new tab scrolls into view.
  - It is announced through a polite live region (`#stageStatus`), so no banner shifts the layout.
  - Reordering is only Stage earlier / later. `ops.addStage`'s optional `afterIndex` remains in the op API, but the editor never uses it.
- **Keyboard:** the strip is one tab stop. Left / Right / Home / End open the previous, next, first or last stage, and the event stops at the strip, so it never nudges selected elements.
- **Responsive:**
  - The bar's fixed height (`--stages`: 3.25rem, 3.3rem on desktop) is subtracted from the workspace, so there is no page overflow and the header, rail and tool sheets are unchanged (pixel-identical at 390 / 768 / 899).
  - Tabs scroll sideways inside the strip when they do not fit.
  - Below 600px, Add, earlier / later and Delete show as `+` `←` `→` `✕` (the labels stay as `aria-label`).
  - Touch targets are at least 2.5rem.
  - The desktop theme matches the canvas bar (navy / gold / purple).
- **Validation:**
  - 2047 tests, including `tests/wall-editor-stages-bar.test.js` (append-only from Stages 1, 2 and 3, wiring, layout), lint and typecheck;
  - lab browser checks: 40 / 40;
  - @zshot's real published 3-stage Wall as the draft at 1440 / 1280 / 768 / 390: 16 / 16;
  - the deployed signed-out editor shows the gate with no bar;
  - Shapes, Icon Group and Display Style functional checks pass. Pixel comparisons that include the canvas differ, as intended: the canvas area is 52px shorter.

## Stages bar final TESTING acceptance (2026-10-20)

Mazen explicitly confirmed the deployed global responsive Stages bar and append-only Add Stage behavior are correct and granted final TESTING acceptance. Product checkpoint `60ca21c`; TESTING deployment `39382427651`; acceptance review `product-memory/reviews/REV-0018-stages-bar-final-acceptance.md`. This does not authorize Production release.

## Theme consistency pass (2026-10-20)

Mazen's task "GAMID — MY WALL EDITOR — FINAL THEME CONSISTENCY PASS". Desktop only (900px and wider), presentation only, in `editor-desktop.css`, reusing the approved tokens (navy cards with thin gold frames, purple for selected / primary, `--font-ui`, the line-icon family). Product `39ed7a7`, deployed `b2352fe` (run `39412009748`).

- **Layers:**
  - rows take the panel-card frame; the selected layer is purple with gold;
  - the drag markers are gold;
  - Bring forward / Send backward and Lock / Unlock keep their buttons, labels and `aria` but draw line icons (new `--i-lock`, `--i-unlock`) instead of ▲ ▼ 🔒 🔓;
  - a dashed empty state.
- **Assets:**
  - the primary Upload button;
  - the Background panel's upload cards: framed thumbnails, an Add / Delete row, a gold IN USE badge.
- **Templates:**
  - a framed card with the name in the UI font and a gold category line;
  - the Apply to `<select>` in the Properties field look;
  - the primary Review replacement button;
  - a danger-framed confirmation with themed buttons.
- **Properties:**
  - only the controls that kept the legacy look: Move to stage's select and Move button;
  - checkboxes, which stay native `<input>`, drawn framed and filled purple with a check (`--i-check`), with keyboard and focus unchanged; also in Background;
  - dark option lists where the browser allows.
- **Stages bar:** the delete confirmation uses the theme surface instead of the old maroon box.
- **Safety:** every new `display` rule respects `[hidden]` (`:not([hidden])`). Native controls stay native.
- **Guard:** `tests/wall-editor-desktop-ui.test.js` was extended deliberately to exactly these panels and controls. Wall content, the shared field controls and global control rules stay forbidden.
- **Validation:**
  - 2047 tests, lint and typecheck;
  - behaviour checks 21 / 21: Layers select / reorder / lock, Assets Add / IN USE / Delete, template Apply to by keyboard, review / cancel / replace / undo, checkbox by keyboard, Move to stage, append-only Add stage, save / reload / Preview;
  - Stages 40 / 40; Display Style 24 / 24; Shapes and Icon Group pass; Background passes except the known video-frame noise;
  - phone / tablet pixel-identical (390 / 768 / 899 for Layout, Assets, Templates, Background);
  - in the 59-state grid only Layout / Assets / Templates at 1280–1920 changed.

## Canvas bar at 900–1199px (2026-10-22)

The canvas column is only about 264px wide at 900px. The canvas bar used to clip its right end there: the status, View public page, Unpublish and the selection count. It now wraps onto a second row, with its items kept whole on one line, and uses slightly tighter sizes at ≤1099px.
- Where everything fits, nothing changes.
- Panel widths and the tool order are unchanged.

See `docs/WALL-EDITOR-900-LANDSCAPE-FIXES.md`.