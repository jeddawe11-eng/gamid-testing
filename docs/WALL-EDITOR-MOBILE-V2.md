# Mobile Wall Editor V2 (2026-10-20, PENDING Mazen's acceptance)

Mazen's task "GAMID — MOBILE WALL EDITOR V2 — Complete Mobile-First Redesign, Implementation & TESTING Deployment". Scope: **the Wall Editor on phones only**. Classic Editor, Classic Visitor, the Desktop Wall Editor, the Desktop Wall Visitor and the Mobile Wall Visitor are untouched.

GamID Truth: `wall-editor-mobile-v2` (PENDING_ACCEPTANCE). Handoff: `PROJECT_HANDOFF.md` §101.

## 1. Breakpoint (the phone scope)

`dist/wall-editor/phone.js` defines the one phone query:

```
(max-width: 599px), (max-width: 899px) and (max-height: 500px)
```

- Portrait phones (below 600px wide) and landscape phones narrower than 900px and at most 500px tall get the new editor.
- Tablets (600–899px wide, taller than 500px) keep their existing editor, and so do desktops (900px and wider). Both are byte-identical or style-identical to the baseline (section 7).
- `index.html` loads `editor-mobile.css` with exactly this media query.
  - The base `editor.css` hides every phone-shell element (`.mw-only`) on the exact complement of the query.
  - A test keeps the query and the stylesheet link identical.
- **Limitation:** a phone that is 900px or wider in landscape (e.g. 932×430, 915×412) falls on the desktop side of the accepted 900px editor breakpoint, so it shows the desktop layout. Moving that line would change the desktop stylesheet's pinned media query, which is outside this task.

## 2. Architecture: a new shell over the same Wall engine

Nothing in the Wall engine changed:
- the document model, ops, session, undo / redo;
- persistence (save / load / conflict);
- validation, permissions;
- assets and uploads, fonts;
- the renderer and Preview.

There is no mobile document format: a Wall edited on a phone reopens identically on desktop, which the E2E test verifies.

- `mobile-shell.js` is the phone interface. Every action either clicks the editor's own button or runs the same ops the desktop uses:
  - the buttons are Save, Undo, Redo, Preview, Publish, Unpublish, Multi-select, Add stage, Stage earlier / later, Delete stage and its confirmation;
  - the ops are `duplicateElements`, `deleteElements`, `reorderLayers`, `updatePayload` (lock), `moveElementsToStage` and `stageMoveOptions`.
  - The shell never calls persistence, never publishes, and keeps no state of its own beyond which sheet is open.
- `canvas.js` gained a **view-only zoom**:
  - it is a multiplier on the fitted scale, between 1 and 6 and at most 3 screen px per stage unit, used only when the shell enables it;
  - every gesture still converts pixels to stage units through `scale`, so moves and resizes stay accurate at any zoom;
  - zoom, pan and Fit only redraw and scroll; they never touch the document.
  - On a tablet or desktop, pointer handling is exactly as before: only the stage reacts.
- `controls.js` has a phone branch (`phoneRebuild`) that reuses the existing control builders.
- `editor.js` wires the shell in and drops a gesture that is interrupted (the app going to the background, or the window losing focus).

## 3. The phone interface

- **Top toolbar:**
  - Back;
  - the stage indicator (`1/3`; it opens the Stages sheet);
  - Undo, Redo;
  - **Save**. Its label is the save status: *Save* when there are unsaved changes, *Saved*, *Saving…*, *Retry save*, *Conflict*. Status changes are also announced.
  - Preview (the real Preview);
  - the **Wall menu**: draft and visitor status, Publish / Publish changes, View public page, Unpublish, Fit canvas, and the gesture help.
  - Save and Publish stay separate: nothing publishes unless Publish is tapped.
- **Stages bar:** the accepted global Stages bar is kept on phones (contract `stages-bar-global`), compact and in the phone theme.
  - It holds the stage tabs, + Add stage (always appends at the end), ← / → and Delete (always asks first).
  - The **Stages sheet** adds a list of stages (element count, own background, open), the same Add / Move earlier / Move later / Delete with confirmation, and a note that stages have no names.
- **Canvas:**
  - it is fitted to the space the toolbars and any open sheet leave;
  - in landscape, sheets open at the side and the canvas stays beside them;
  - its stacking is isolated, so nothing on the Wall can cover the shell;
  - a slim vertical zoom pill: −, Fit / percentage, +.
- **Gestures:**
  - Elements:
    - tap selects; tap on empty canvas deselects;
    - one-finger drag moves; the touch handles resize (minimum sizes and locked aspects kept) and rotate (rotation exists in the model);
    - two fingers whose first finger is on the **already selected** element scale it (the W0 gesture).
  - Canvas:
    - two fingers anywhere else zoom the canvas around their midpoint and pan with it;
    - one finger on empty canvas pans a zoomed canvas.
  - Interruptions:
    - an element drag interrupted by a second finger, `touchcancel`, the app going to the background or a lost focus commits nothing;
    - a pinch on the toolbars or sheets never zooms the page (`touch-action: pan-x pan-y` there).
- **Selection quick actions** (above the bottom toolbar while nothing is open):
  - name, Edit, Duplicate, Bring forward, Send backward, Lock / Unlock (artwork), Delete (undoable, announced), Deselect.
- **Bottom toolbar:** Add, Assets, Layers, Stages, More *(final order since 2026-10-22: Assets directly before Layers; originally Add, Layers, Stages, Assets, More)*. The tool sheets are the editor's own panels as bottom sheets:
  - half height, or full height with the grab handle (tap or drag);
  - Close and Escape close them;
  - a closed sheet is hidden from focus and screen readers.
  - **Add:** Text, Artwork (images and GIFs), Video (the same upload; MP4 / WebM), Shape, Icons (Media & Links: Icon / Icon Group), Link / Embed, GamID block, GamID data, Template.
    - A new element is placed by the existing code, selected, and its Edit sheet opens.
  - **Layers:** the existing list (top first, ▲ ▼, artwork lock as a line icon), plus the selected layer's actions at the top: Duplicate, Delete, Lock / Unlock, Move to stage.
  - **Assets:** the existing panel. It covers:
    - upload with progress;
    - the persistent upload error with its actions;
    - thumbnails, Add;
    - IN USE and delete safeguards;
    - the existing size limits text.
  - **More:** Text & fonts (with font search, My Fonts and upload, and the Text Effects list), Media & Links, Shapes (the full shape library; the Freeform pen stays a desktop tool), GamID, Templates, Multi-select. *(Since 2026-10-21 Background is no longer here: it is the Background area of the Assets sheet, see `docs/WALL-BACKGROUND-INSIDE-ASSETS.md`.)*
- **Edit (Properties) sheet:** the same controls, common ones first. Collapsible:
  - **Text effects** (Outline, Shadow, Neon glow, **Living Fire** with all its settings, Gradient fill);
  - **Position & size** (X / Y / W / H, rotation, size steps, **Nudge** by 1 or 10 units);
  - **Arrange & align** (duplicate / delete, layer order, group, align to stage, Keep inside stage).
  - Artwork keeps its own sections (Crop, Mask, Split, Appearance, Effects, Layering).
  - Move to stage stays first.
  - Another element's sheet opens at its top.
- **Keyboard:**
  - while the software keyboard is up (visual viewport), the open sheet sits on top of it and fills the visible space above it;
  - the focused field is scrolled into view;
  - toolbars hide behind it;
  - inputs use 16px text so phones do not zoom the page;
  - closing the keyboard restores everything with the draft kept.
- **Theme:** GamID identity as in the accepted desktop editor:
  - deep navy surfaces, purple primary / active, gold highlights and frames;
  - one family of line icons, no emoji;
  - targets of at least 44px, safe-area insets, `dvh`, reduced motion.
- **Not offered (not in the model):** stage names (Rename), layer show / hide, Living Ice. The Freeform pen and Edit Points stay desktop-only.

## 4. Files

- **New:**
  - `dist/wall-editor/phone.js`, `mobile-shell.js`, `editor-mobile.css`;
  - `tests/wall-editor-mobile-v2.test.js`.
- **Changed:**
  - `dist/wall-editor/index.html`: phone markup, all `mw-only`, plus the stylesheet link;
  - `canvas.js`: view zoom, events read on the viewport for the phone only;
  - `controls.js`: phone branch, nudge;
  - `editor.js`: wiring, interrupted gestures;
  - `editor.css`: one rule hiding the shell outside phones;
  - `package.json`: typecheck list.
- **Guard tests updated deliberately:**
  - `wall-editor-desktop-ui` (the stylesheet list gains `editor-mobile.css`);
  - `wall-editor-text-effects` (rebuild key gains the phone flag);
  - `wall-living-fire` (Living Fire also on the phone panel).

## 5. Truth reconciliation

- **New:** `wall-editor-mobile-v2`, PENDING_ACCEPTANCE.
- **Phone clauses repointed** (statuses untouched):
  - `wall-shapes-v2` / `shapes-v2-library`: "the phone keeps its three shape buttons" becomes "phones: the library, see wall-editor-mobile-v2";
  - `living-fire-text` / `living-fire-editor`: "the phone editor's controls are unchanged" becomes "phones: Living Fire in Edit > Text effects, see wall-editor-mobile-v2".
- `wall-editor-stages-bar` is preserved as it stands: the bar is still shown on phones.

## 6. Validation (lab = the real editor with the local fake client; Chrome)

- **End-to-end touch workflow** (`scratchpad wallui/mw-func.mjs`, real multi-finger gestures through CDP touch events):
  - **71 checks** at each of 320×568, 360×740, 375×667, 390×844, 430×932 and 412×915: ALL PASS.
  - The 20 steps of the task: open, switch stages, add / edit text and font, finger move, resize, add / adjust an image, add / customize a shape, reorder, lock / unlock, background, template with confirmation, undo / redo, save, reload, Preview and return, then desktop reopen and consistency.
  - Plus:
    - zoom, pan and Fit, all view-only;
    - zoomed drag accuracy;
    - interrupted gestures (`touchcancel`, background);
    - a failed upload, long text;
    - the keyboard (simulated visual viewport);
    - sheet height, Escape;
    - landscape side sheet, crossing to the desktop layout and back;
    - Stages Add / Delete with confirmation;
    - publishing kept separate;
    - no browser page zoom; no page errors.
- **Android Emulator** (Medium_Phone, Chrome, the lab served via `adb reverse`; an emulator, **not a physical device**):
  - the phone shell rendered;
  - Add > Text by touch;
  - the real software keyboard lifted the Edit sheet with the field visible and Save reachable;
  - typing worked; closing the keyboard restored the layout with the draft kept.
  - iOS Safari was not available and was **not tested**.
- **Non-regression** (`wallui/mw-nonreg.mjs` against the baseline `e387e68`, 11 states each, at 1440×900, 1280×800, 1024×768, 900×700, 899×1000, 768×1024, 600×900 and 820×1180):
  - every visible element has the same box, colours, borders, fonts and text;
  - tablets are pixel-identical;
  - desktop pixel differences also occur baseline-against-baseline (font, sample and thumbnail loading).
  - Desktop behaviour scripts (`th-func`, `st-func`): ALL PASS.
  - No file outside `dist/wall-editor/` changed, so the Classic Editor, Classic Visitor and Wall Visitor (desktop and mobile) are unchanged by construction.
- **Repository:**
  - `npm test`: 2055 tests, 2054 pass, 0 fail, 1 skipped (pre-existing);
  - `npm run typecheck`, `npm run lint` and `npm run build`: pass.
- **Screenshots:** `scratchpad mw-review2/` (21 states at 320, 375, 390 and 430, plus landscape and the emulator), via `wallui/mw-shots.mjs`.

## Landscape fixes (2026-10-22)

See `docs/WALL-EDITOR-900-LANDSCAPE-FIXES.md`.
- In landscape the keyboard sheet now runs from the top toolbar to the keyboard, as in portrait and as `wall-mobile-keyboard-a11y` requires. Before, it started below the Stages bar.
- The selection quick actions are a compact block in the left gutter beside the Fit stage, not a strip across the stage's lower part.
- The phone E2E (`wallui/mw-func.mjs`) had portrait-sized geometry assumptions; they were corrected without weakening its assertions. It gained:
  - selection-bar checks;
  - a portrait ↔ landscape rotation check with an unsaved edit;
  - a check that the keyboard sheet fills the space.
- Result: 81/81 at 844×390, 812×375, 740×360, 360×640 and 390×844.