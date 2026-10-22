# Wall editor: 900px canvas toolbar + landscape phone fixes (2026-10-22)

Mazen's task "GAMID — 900px CANVAS TOOLBAR + LANDSCAPE MOBILE REGRESSION FIX", TESTING only.

- Branch: `feature/editor-900-landscape-fixes`, from `735d3e8`.
- Product baseline: `c832c5b`, Background inside Assets ACCEPTED, with the final navigation order.
- Accepted contracts this task keeps unchanged:
  - Assets directly above Layout;
  - My Assets / Background;
  - the Stages bar;
  - Save / Preview / Publish;
  - Universal Delete UX;
  - Silent UI.

## A. Canvas toolbar at 900px (desktop / tablet layout)

**Symptom.** At 900px the canvas bar above the canvas cut off its right end. In the worst case (a published Wall with unsaved changes and a selection) that end held:
- "Unsaved changes";
- the publish status;
- View public page;
- Unpublish;
- "1 selected".

The stage label also broke onto two lines, and Multi-select overlapped the status pill.

**Root cause.**
- At 900–1199px the desktop grid is `5.1rem 16rem minmax(0, 1fr) 16.5rem`. That leaves the canvas column only about 264px wide at 900px.
- The bar is a single-line flex row. Its items could not shrink below their content.
- `.ed-center` hides overflow, so the overflow was clipped silently. There was no scroll and no wrap.
- Measured on the lab (baseline `c832c5b`, worst case):
  - 495px of overflow at 900;
  - Unpublish unreachable at every width up to 1199;
  - "1 selected" clipped even at 1440.

**Fix (product, `dist/wall-editor/editor-desktop.css`).**
- `.ed-canvas-bar` wraps (`flex-wrap: wrap; row-gap: .4rem`).
- Its items keep their size and stay on one line (`flex: none; white-space: nowrap`).
- At ≤1099px the stage label and the bar buttons use slightly tighter padding and font size. This lets the label and Multi-select share the first row.
- The block sits after the base rules, which have the same specificity, so it wins.
- Nothing changes where everything already fits:
  - 768–899px is unchanged;
  - ≥1200px only gains a second row when a published Wall also shows its links.
- The tool order, the panel widths and the styling are unchanged.

**Result (lab, worst case), bar height:**

| Width | Bar height |
|---|---|
| 900px | 157px |
| 1024px | 124px |
| 1099px | 112px |
| 1199px | 91px |
| 1440px | 91px |

- At every tested width: 0px overflow, no clipped or unreachable item, no overlap and no page scroll.
- Widths tested: 768, 820, 899, 900, 901, 1024, 1099, 1100, 1199, 1200, 1280 and 1440, in three states each (saved, unsaved, published with changes).
- Normal saved state at 900: the bar is 85px. At ≥1200 it stays at 52px, as before.

## B. Landscape phone (844×390 and similar)

The four failing checks of the phone E2E (`wallui/mw-func.mjs`) were reproduced on the baseline and diagnosed one by one.

| Check | Cause | Fix |
|---|---|---|
| 5 drag | **Test.** The text added in step 3 stayed selected. On the small landscape Fit stage (122×217px), its rotate handle's 44px touch area lies over t1's centre, so the tap and drag rotated that element. The handle winning is correct behaviour. A clean session drags correctly: t1 moved 94px for a 90px finger move. A second geometry assumption: the 30px sideways move is about 250 stage units at this scale, past the stage edge, where the drag rightly stops. | The test deselects first. The sideways move is sized to stay inside the stage. The assertions are unchanged. |
| 6 resize | **Test.** This was a knock-on of step 5: the wrong element was selected. | Passes after the step 5 fix. |
| 7 zoom (pinch on an element, zoomed drag) | **Test.** It used portrait-sized fixed margins: a 40px gap from the selection, and a band from 60px below the top to 150px above the bottom. On a 390px-high screen that left a 45px band, so no candidate was found. | Candidates are now chosen point by point. The point must be on the topmost unselected element, outside the selection, and not on a handle's touch area, the selection bar or the zoom buttons (stage elements take no pointer events, so the elements' own rectangles are used). The drag's end point must also be on the open canvas. |
| 8 keyboard | **Both.** Test: a 330px keyboard on a 390px screen is not realistic. Product: in landscape the keyboard sheet kept starting below the Stages bar (top 86px) instead of filling the visible space above the keyboard, as `wall-mobile-keyboard-a11y` requires and portrait does. | Test: keyboard height is `min(330, 55% of the screen height)`, so portrait is unchanged. Product (B1): in landscape the keyboard sheet runs from the top toolbar to the keyboard. A new check pins this in both orientations. |

**Found during the diagnosis (B2, product).**
- In landscape the selection quick-action bar sat across the lower part of the Fit stage: at 844×390 it spanned x 8–391 and y 278–332, while the stage spanned x 341–463 and y 105–321.
- At 740×360 it covered the centre of an element near the stage bottom, so that element could not be tapped.

**Fix (`dist/wall-editor/editor-mobile.css`, landscape block):**
- **B1.** `body.is-mw-keyboard .ed-panel, body.is-mw-keyboard .mw-sheet { top: calc(var(--mtop) + var(--safe-t)); bottom: var(--mw-kb); height: auto; }`
- **B2.** The selection bar becomes a compact block in the left gutter: `width: 12.75rem; max-width: calc(50vw - 1rem); flex-wrap: wrap`. The element's name is on its own line and the actions wrap below it, all 44px.
  - It stays clear of the Fit stage at 844×390, 812×375, 740×360 and 640×360 (measured).
  - Portrait keeps the full-width scrollable strip.

## Validation

All of the following ran on the lab editor: the real editor code with a local fake client, Chrome with touch emulation. It is not a physical device, not signed in and not TESTING.

- **Phone E2E `mw-func.mjs`: 81/81 at each of 844×390, 812×375, 740×360, 360×640 and 390×844.** New checks:
  - the selection bar shows every action fully on screen and tappable, and does not cover the Fit stage in landscape (text, and a picture with Lock);
  - rotation portrait ↔ landscape with an unsaved edit: still unsaved, same stage, same selection, the edit painted, undo kept, no overflow, and Save afterwards saves the edit;
  - the keyboard sheet fills the space from the top toolbar to the keyboard;
  - in landscape the side sheet has no grab handle (by design) and already uses the full height.
- **The same E2E on the baseline `c832c5b`** fails only the product checks:
  - the landscape keyboard sheet (2 checks);
  - the selection bar covering the stage.

  So the drag, resize and zoom failures were test-only.
- **Desktop / tablet / phone pixel non-regression (`ba-nonreg.mjs`): 36/36.** Every tool panel and the canvas are identical to the baseline at 1440×900, 1280×720, 768×1024 and 390×844. One 768×1024 Media mismatch on the first run was the known timing flake and was identical on the re-run.
- **Background inside Assets E2E (`ba-func.mjs`): 73/73.**
- **Navigation order (`nav-order.mjs`): 40/40.**
- **Repo guards:** `tests/wall-editor-900-landscape.test.js` has 5 tests. `npm run build` passes: lint, typecheck and 2,148 tests (2,146 pass, 2 pre-existing skips).

## Limitations

- These are browser emulation results. iOS Safari and a physical device were not tested. The keyboard is simulated through the visual viewport.
- When zoomed in on landscape, the stage is larger than the gutter, so the selection bar can lie over part of it. The canvas pans with one finger.
- **Unchanged and reported, not in scope:** in portrait at 360–375px the selection strip is 5–20px wider than the screen (up to about 37px with the picture's Lock action, even at 390px). Deselect then needs a sideways swipe; the strip scrolls with a hidden scrollbar. This is identical on the baseline.
