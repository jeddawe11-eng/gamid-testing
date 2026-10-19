# My Wall desktop Shapes V2 (TESTING)

Mazen's task "GAMID — MY WALL DESKTOP SHAPES V2" (2026-10-19). Desktop editor only (900px and wider); the phone and tablet editor is unchanged.

**Product:**
- `f77e76e462674079267d13dd977699d3d62e9678`: the feature.
- `b08d538`: line endings only, no content change.
- `da7dd1c1813d29ab9dc4068e626216af97e69e23`: hides the move / resize handles while points are edited.

**TESTING static:** run `39194776098`, with 12 of 12 changed files served byte-identical.

**Truth:** `wall-shapes-v2`, PENDING_ACCEPTANCE.

## Data contract (compatible; no database change)

Shapes V2 are optional fields of the existing `rect` element, owned by `dist/wall/shapes.js` (core, pure):

| Field | Rule |
|---|---|
| `shape` | one of 29 vector shape keys, or `custom` (freeform) |
| `params` | the shape's own Smart Shape numbers, and only those it uses: `sides` 3–12 and `points` 3–16 (integers); `inner` 0.2–0.9; `shaft` / `head` / `thickness` 0.1–0.9; `tail` 0.05–0.95; `cut` 0–0.45 |
| `path` | custom only: `{ closed, points: [{ x, y, ix?, iy?, ox?, oy? }] }`, with anchors in 0..1 of the element box and curve handles in −1..2. It has 2–100 points (3+ when closed); open paths are stroked only. |
| `lockAspect` | the width / height ratio to hold, 0.05–20; absent means free |

- **Error codes:** `INVALID_SHAPE`, `INVALID_SHAPE_PARAMS`, `INVALID_SHAPE_PATH` and `INVALID_LOCK_ASPECT`, with messages in `messages.js`.
- **Compatibility:** a rect without these fields is exactly what it always was: Rectangle / Rounded / Circle painted as the CSS box (fill, gradient, border, corner radius, opacity). Every saved Wall therefore paints unchanged.
- **Painting:** a vector shape paints as one inline SVG (`paint.js` `paintShape`). Its path data comes only from `shapePath` (numbers and fixed path letters). Fill / gradient / border / opacity are the same fields, and the border is drawn inside the box.
- **Database:**
  - A rect payload has no key list in either validator, so the TESTING database **already stores these fields unchanged**. A rolled-back live run of `tests/integration/wall-w2-db.sql` stored all six new valid corpus documents unchanged (627 entries).
  - The database does not yet *check* them; the painter only uses validated numbers.
  - The parity migration (`private.wall_shape_errors`, with the same codes) is prepared in `docs/proposals/wall-shapes-v2-db-parity.sql`. It is outside `supabase/migrations`, so it cannot be applied by accident.
  - It was rehearsed in a rolled-back transaction: it matches the JavaScript rule on 19 of 19 cases, and the full contract is unchanged with it. Nothing persisted.
  - **It needs Mazen's authorisation** before it is applied; at that point the invalid Shapes V2 cases join the shared corpus.

## Shape library (left panel)

On desktop the three quick buttons are replaced (on the phone they stay) by a **Freeform Shape** entry, then **38 shapes in 6 categories**:

| Category | Shapes |
|---|---|
| Basic | Rectangle, Rounded, Circle (the existing shapes), Ellipse, Triangle, Right triangle, Diamond, Parallelogram, Trapezoid |
| Polygons & stars | Pentagon, Hexagon, Octagon, 4- / 5- / 6- / 8-point star, Burst |
| Arrows | Arrow right / left / up / down, Double arrow, Chevron right / left |
| Callouts | Speech bubble, Round bubble, Callout box |
| Badges & banners | Shield, Ribbon banner, Pennant, Tag, Plaque |
| Gaming | Lightning, Crown, Gem, Heart, Health cross, Ring |

- **Categories (since `bb50aef`):** each category is an accordion with the font library's heading button (name, shape count, chevron). Basic starts open and the others closed; several may be open, and the choice is kept for the editor session. A collapsed category shows a gold diamond when it holds the selected shape. Freeform stays above the categories.
- **Cards:** an even 3-column grid of preview cards, each drawn with the same geometry as the Wall. Hover, keyboard focus and the current shape (purple / gold card with a diamond) are marked.
- **Default lock:** proportion-sensitive shapes start with their aspect locked: Circle, Triangle, Diamond, the polygons and stars, Shield and the Gaming shapes.

## Freeform pen and Edit Points (`dist/wall-editor/path-editor.js`)

A layer over the stage takes the pointer, so drawing and point editing never move the element. While it is on, the element's own move / resize handles step aside. A bar under the canvas bar shows the state and the actions.

**Pen:**
- Click adds a point; press-and-drag makes a smooth point (mirrored curve handles).
- Clicking the first point closes the shape. **Finish open** makes a stroked line (2+ points); **Close shape** closes it (3+ points).
- **Undo point** (also Backspace / Ctrl+Z) and **Cancel** (also Esc) are available, and Enter finishes.
- The result is an ordinary element, one undo step.

**Edit Points** (the Properties button, or a double-click on a freeform shape):
- select a point; drag a point (its handles follow) or a curve handle;
- **Add point**, an exact de Casteljau split, so the curve does not change;
- **Delete point** (also Delete / Backspace), keeping the minimum count;
- **Smooth / Corner**;
- **Done** (also Enter / Esc).

Each edit refits the element's box around the path and is one undoable edit. On a rotated shape the box centre is carried through the rotation, so the other points stay where they are (measured: 0–1 px). If an edit would push the shape past the stage edge with Keep inside stage on, it is nudged back inside, like any resize.

## Lock aspect ratio

In Position & Size, right after Width and Height:
- **On:** it stores the ratio the box has at that moment. Handle drags (through the existing `ops.lockedAspect` hook; corner and side handles) and typed Width / Height keep it.
- **Off:** the shape stretches freely.
- The setting survives save / reload / undo / redo. Other element types are unchanged.
- A shape created on the phone has no default lock, so phone behaviour is unchanged.

## Shape Properties (right panel, desktop)

The same accordion as Text and Icon Group, with its own remembered state:

| Section | Starts | Contents |
|---|---|---|
| Shape & Geometry | open | **Shape type** (the 38 shapes by category); its Smart Shape sliders, or Corner radius for the classic shapes; for a freeform shape its point count and **Edit points** |
| Appearance | open | Fill, Gradient, Opacity, Border, in their existing order |
| Position & Size | closed | X, Y, Width, Height, **Lock aspect ratio**, Rotation, Reset rotation, Smaller / Bigger / 2× |
| Arrange | closed | the existing Arrange controls |
| Align to Stage | closed | the existing Align to Stage controls |

Move to stage stays the first control, above the sections (accepted post-Round 2 rule). Every existing control is present: the pre-change inventory of 60 controls, plus Shape type and Lock aspect ratio.

## Validation

**Tests:**
- `npm test`: 2013 tests, 2012 passed, 1 skipped. Lint and typecheck pass.
- New `tests/wall-shapes-v2.test.js` (8): the library, validation, path syntax, Smart Shapes, Lock aspect ratio (typed and five drags), the Edit Points math, documents, and wiring.
- The shared corpus has +6 valid Shapes V2 cases.

**Every shape:** all 38 library shapes and 3 freeform samples (with gradient, border and an open line) paint through the visitor pipeline at 640 and 375 px: 38 SVG shapes, 3 classic, 0 empty paths, 0 errors.

**Editor walk-through (33 / 33):**
- the library and the five sections; Smart Shape sides saved; Shape type switching;
- the lock: typed Width and Height, three edge drags at 1:1, unlocked independence, undo / redo of the lock;
- the pen: points, a curve, Backspace, closing on the first point, the saved path;
- Edit Points: drag, add, delete, smooth / corner, handle drag, Esc, saved and undoable; double-click, also on a rotated shape;
- an open line; Cancel; Duplicate / Delete;
- reload, Preview and the visitor view.

**Regression against `ab20189`:**
- 59 screen states: only the four desktop Shapes states changed (intended).
- Phone / tablet: the Shapes panel, and adding a rectangle or circle with its Properties, are pixel-identical with identical controls.
- Text / Embed / GamID Properties are identical, and the 27-step transcript is identical.

## Limitations and unsupported edge cases

- **Boolean operations:** shape union / subtraction are not included, as the task allows.
- **Corner radius:** it applies to the classic shapes only; the vector shapes have their own Smart Shape numbers.
- **Freeform paths:** a path cannot be switched between open and closed after it is finished (redraw it). Curve handles move independently: a smooth point's two handles are not kept mirrored after the pen.
- **Database checks:** they wait for the authorised parity migration (see above).
- **Phone editor:** it shows and keeps every new shape but has no Shapes V2 controls (by design).

## Category accordions (2026-10-19)

Mazen's task "GAMID — Shapes V2 Left Panel Accordion Fix" (desktop Shapes panel only).

- **Product:** `bb50aef267a38cf6cb799e243a435133828bf851`, TESTING run `39196387512`, changed files served byte-identical.
- **Change:** the six category headings are accordions (see "Shape library" above). The cards, previews, current-shape mark and creation are unchanged, and Properties and the other tools are untouched.
- **Panel height:** 823 px at 1440 × 900 with only Basic open (it fits without scrolling), against 1552 px before, and 1667 px with every category open.
- **Validation:**
  - accordion walk-through 36 / 36 at 1440 and 1280: default state, counts (9 + 8 + 7 + 3 + 5 + 6 = 38), Freeform on top, independent and multiple open, creation from an opened category, the current card and the heading mark when collapsed, the state kept across tools, Enter / Space, `aria-controls`, all 38 reachable and creatable, nothing clipped, no errors;
  - the Shapes walk-through 33 / 33;
  - 59 screen states: only the four desktop Shapes states changed;
  - phone / tablet shapes pixel-identical;
  - `npm test` 2014 (2013 passed, 1 skipped); lint and typecheck pass.


## Final acceptance — 2026-10-19

Mazen explicitly accepted Shapes V2 after testing aspect-ratio lock and reviewing the desktop left-category accordion refinement (product `bb50aef`, TESTING run `39196387512`). The 38-shape library, Freeform Pen/Edit Points, Smart Shapes, aspect-ratio lock, and left/right desktop accordion UI are **ACCEPTED**; Product Memory `REV-0015`. This is scoped acceptance, not approval of the entire desktop Wall editor. The proposed database parity rule (`docs/proposals/wall-shapes-v2-db-parity.sql`) remains **unapplied** pending separate authorization.
