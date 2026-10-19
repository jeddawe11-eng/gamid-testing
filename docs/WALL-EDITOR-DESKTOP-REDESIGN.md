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
