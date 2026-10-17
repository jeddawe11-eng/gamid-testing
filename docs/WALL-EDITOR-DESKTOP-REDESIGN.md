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
