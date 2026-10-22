# Background inside Assets (2026-10-21/22)

Mazen's task: "GAMID — BACKGROUND INSIDE ASSETS, full implementation, desktop + mobile, TESTING only".

Branch `feature/background-inside-assets`, from `52da242` (`feature/universal-delete-ux`). Not merged.

**Status: ACCEPTED by Mazen on TESTING (2026-10-22).** He accepted after successfully testing the four scenarios requested of him on `93a86d9` (run `39699314811`; product `a623067`). The final navigation order he then authorized (§8) is live at `c832c5ba751dcd1e50771d98482c3ff1d5a898ee` (run `39702253574`). No migration and no Edge Function change. GamID Truth: `wall-assets-background` ACCEPTED. Product Memory: DEC-0010, REV-0024.

## 1. Navigation, before and after

| | Before | After |
|---|---|---|
| Desktop and tablet rail | Add, Text, Media & Links, Shapes, **Background**, GamID / My Gamer Data, Layout, Assets, Templates (+ phone Edit) | Add, Text, Media & Links, Shapes, GamID / My Gamer Data, **Assets**, Layout, Templates (+ phone Edit) (final order, §8) |
| Phone bottom bar | Add, Layers, Stages, Assets, More | Add, **Assets**, Layers, Stages, More (final order, §8) |
| Phone More sheet | Text & fonts, Media & Links, Shapes, GamID, **Background**, Templates, Multi-select | Text & fonts, Media & Links, Shapes, GamID, Templates, Multi-select |
| Assets panel or sheet | upload + library | **My Assets** \| **Background** switch: My Assets = upload + library; Background = everything the Background tool had |

Old ways in still work:
- Anything that opens the old Background tool (`openTool("background")`, including a cached page or a future shortcut) now opens **Assets on its Background area** (`editor.js`).
- The area last shown is kept for the editor session, like the accordions.
- My Assets is shown first.

## 2. Background capabilities preserved

Every existing control, id and rule moved unchanged into the Background area:
- Whole Wall / This stage only;
- the five types: None, Colour, Gradient, Image, Video;
- colour and gradient pickers and the angle;
- the Images / Videos lists with Use and Delete;
- Fit & Position;
- Appearance: opacity, flip horizontal / vertical, darken overlay;
- Remove background;
- the inheritance note ("This stage uses the Whole Wall background…");
- Upload MP4 for a video background, with HEVC conversion.

The same Wall document, save, reload, Preview and published rendering apply.

The accepted desktop look (REV-0016) is **the same CSS rules**, re-scoped mechanically:
- `[data-tool-panel="background"]` → `[data-assets-area="background"]` (47 selectors);
- `[data-tool-panel="assets"]` → `[data-assets-area="library"]` (25), so the library-card styling never reaches the background cards.

The scope buttons stay the area's first `.ed-seg`, which keeps their 2-column rule. The new switch shares the card-button look.

## 3. Shared asset library

- **Two explicit actions on every My Assets item:**
  - **Add to Canvas** creates an independent element (unchanged behaviour).
  - **Set as Background** assigns *the same stored file* to the background chosen under Background (Whole Wall, or the current stage only). A picture or video background already there keeps its fit, position and appearance and only changes its file. A line in My Assets says where Set as Background applies.
- **Nothing is copied or uploaded again.** One file can be an element, the Whole Wall background and a stage background at once; it is still one asset.
- **Uploading from Background** goes through the same asset store, checks, limits and quota:
  - "Upload image" with the Image type;
  - "Upload image or video" when there is no background;
  - the existing "Upload MP4" with the Video type.

  There is one upload at a time across both areas. The new file appears in My Assets and becomes the background of the scope chosen when it was picked; this also applies to a converted HEVC video when it is ready. Choosing Image with no image yet opens the image picker instead of sending the owner to Assets.
- **Separate operations:**
  - Remove background clears the assignment only; the file stays.
  - Delete is the accepted universal deletion flow in both areas: always confirmed, detailed when in use, server-resolved, not undoable.
  - Removing a canvas element is unchanged and undoable.

## 4. Desktop and phone

- **Desktop / tablet:** the rail loses Background, and the Assets drawer holds both areas at the same width as before.
- **Phone:** the Assets sheet holds both areas. More loses Background. In the Assets sheet the switch, the scope and type buttons and the upload-card buttons are 44 px touch targets (`editor-mobile.css`, scoped to Assets). Before, the Background scope and type buttons were 42 px and the video cards' Use 38 px.
- **Keyboard:** the switch and all controls are native buttons with `aria-pressed` and `aria-controls`; focus and scrolling are unchanged. The Assets panel has no text fields, so the software keyboard does not open there.
- **Sound:** no sound is introduced; the silent-UI guard passes.

## 5. Files

- `dist/wall-editor/index.html`: rail and More entries removed; the Assets panel with the area switch, `#assetsLibrary` and `#assetsBackground`.
- `dist/wall-editor/tools.js`:
  - `showAssetsArea`;
  - Set as Background and the Add to Canvas label;
  - the background upload path (`uploadForBackground`, `uploadBackgroundImage`, `pickForBackground`);
  - the background video upload now assigns to the scope it was picked for;
  - one upload at a time across both areas.
- `dist/wall-editor/editor.js`: the `background` alias.
- `dist/wall-editor/mobile-shell.js`: More and titles.
- `dist/wall-editor/editor.css`, `editor-desktop.css` and `editor-mobile.css`.
- Tests:
  - `tests/wall-background-inside-assets.test.js` (7 tests);
  - deliberate updates to the guards that pinned the nine-tool rail and the old selector scopes: `wall-editor-desktop-ui`, `wall-w4-editor`, `wall-editor-background-desktop`, `wall-post-qa-gif`, `upload-feedback`.

## 6. Validation

- **`npm run build`**, the deploy workflow's own validation: lint, typecheck, voice typecheck and the full suite pass. **2142 tests, 0 failures** (2 pre-existing skips).
- **Lab browser E2E** (`ba-func`): **73 / 73**. It uses the real editor code with a local fake client; it is **not signed in and not TESTING**. It covers all 22 required items:
  - the control inventory equals the `52da242` baseline in all five type states at desktop and phone, with only the new upload buttons added;
  - Assets navigation on desktop and phone; no standalone Background;
  - every type; Whole Wall and This stage only; inheritance and its note;
  - colour and gradient edits; an existing image and video as background;
  - a new upload set as the background, uploaded once and listed in My Assets;
  - one file used as element + Whole Wall + stage;
  - Add to Canvas versus Set as Background;
  - Remove background never deleting a file;
  - deleting an unused asset (simple confirmation, Cancel, Confirm) and a used background asset (detailed confirmation, resolved; Undo cannot restore it);
  - save + reload; Preview; Publish equal to the draft;
  - layouts at 1920 / 1280 / 900 / 768 / 390 / 360 / 844×390 with no overflow or clipped labels;
  - no UI sound.
- **Other panels** (`ba-nonreg`): **36 / 36** pixel-identical to the baseline at 1440, 1280, 768 and 390 for Add, Text, Media & Links, Shapes, GamID, Layout, Templates and the canvas. Some runs show 1–3 random mismatches in different panels from rendering timing; a clean run passes 36 / 36.
- **Phone workflow** (`mw-func`, existing): **71 / 71** at 390×844 and 360×640. Its Background step now goes through Assets, and its "Add" locator reads "Add to Canvas".
- **Screenshots** were reviewed for clipping, overlap and scrolling.

**Not verified:**
- **No signed-in TESTING run**: I never sign in as a persona. TESTING was checked by stamp, by served-file identity with the tested code, and by the live page's navigation.
- **Pre-existing and unchanged** (identical in the baseline): the canvas bar overflows at a 900 px desktop width; `mw-func` has 4 landscape (844×390) failures in canvas gestures and its keyboard simulation.

## 7. Acceptance checklist for Mazen (signed in, TESTING)

1. Desktop: the rail has no Background. Open Assets, then Background: every Background control is there, and it looks the same as before.
2. Set a colour and a gradient on the Whole Wall, then a stage-only image. Check the note and that the other stages still show the Whole Wall background.
3. In My Assets, use **Set as Background** on an image and on a video, and **Add to Canvas** on another. The background and the element are separate.
4. In Background, Upload image: the new file becomes the background and appears once in My Assets.
5. Remove background: the file stays in My Assets.
6. Delete an unused upload (simple confirmation), and a background upload (detailed confirmation).
7. Save, reload, Preview and Publish.
8. Phone: Assets in the bottom bar → My Assets / Background; More has no Background.

## 8. Final navigation order and acceptance (2026-10-22)

**Acceptance.** Mazen manually tested the four scenarios requested of him on TESTING (`93a86d9`), all successfully, and accepted Background inside Assets. His message does not list the four checks individually.

**Final adjustment.** He then authorized one change: **Assets directly above Layout**. It changes markup order only, with no behaviour change, and Assets keeps My Assets and Background.
- Desktop and tablet rail: Add, Text, Media & Links, Shapes, My Gamer Data, Assets, Layout, Templates (+ phone Edit).
- Phone bottom bar: Add, Assets, Layers, Stages, More. The More sheet is unchanged: Text & fonts, Media & Links, Shapes, GamID, Templates, Multi-select.

**Verification by Claude Code.** Mazen did not separately test the reorder.
- `npm run build`: 2143 tests, 0 failures, 2 pre-existing skips.
- Order on screen at 1440 / 900 / 768 / 390 / 360, and Assets › My Assets / Background, Layout and Templates opening: 40/40.
- Background, references, deletion, save, Preview and Publish: 73/73.
- Other panels identical to the baseline: 36/36.
- Phone workflow: 71/71 at 390×844 and 360×640.
- TESTING serves `c832c5b`, and the live rail and bar HTML have the final order.
