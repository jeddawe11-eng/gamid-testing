# Desktop Text editor upgrade: Text Effects, Properties accordion, Living Fire V3 (TESTING)

Mazen's task "GAMID — Desktop Text Editor Upgrade: Text Effects + Living Fire V3 + Accordion Properties" (2026-10-18). It has three phases:

- **Phase A:** the panel reorganisation, implemented and on TESTING.
- **Phase B:** the Living Fire V3 readiness report, below.
- **Phase C:** integration of Living Fire. It is **not started**: it waits for Mazen's choice of variant(s), and needs a separate approval.

## Phase A: what changed (desktop only, 900px and wider)

**Left Text panel**, top to bottom:

1. **Add Text:** Heading, Text, Gaming Title.
   - Behaviour is unchanged.
   - The desktop wording makes clear these add text **boxes**, not fonts. The headline reads "Each one adds a new text box to your stage. Choose its font below." Each preset has a new note, for example "A large title box for your name or a headline".
2. **Font Library:** the same search, curated fonts, groups and accordions.
3. **Text Effects (new):** a registry of effect cards, `TEXT_EFFECTS` in `dist/wall-editor/tools.js`. A new effect is one entry; the cards wrap in a two-column grid.
   - **Neon:** toggles the existing glow (`payload.glow`, the same `#62e7ff` / 22 neon the Gaming Title preset uses) on the selected text element(s).
     - Turning it on keeps any glow a text already has.
     - Turning it off removes the glow.
     - It is undoable.
     - The card shows as pressed when every selected text glows.
     - With nothing selected, it shows the usual "Select a text element first" guidance.
     - Choosing it opens **Text Effects** in Properties and scrolls that section into view.
   - **Living Fire:** a disabled "Coming soon" card. It writes nothing, and no fire renderer is loaded (approval gate).
4. **My Fonts:** the uploaded fonts, with their previews, selection, delete confirmation, the n/3 count and messages. Unchanged except for one line of copy.
5. **Upload My Font**, at the very bottom.
   - Its copy is shortened, but keeps the formats, the 3-font limit, the 8 MB source / 2 MB stored limits, the storage and privacy statement, and the licence confirmation.
   - The gateway, the validation, the conversion, the quota and the permissions are untouched.

**Right Properties panel, text selections only.** There are five independent collapsible sections, holding exactly the controls that were already there:

| Section | Controls |
|---|---|
| Content & Typography | text, Fit box height, link, font, size, weight, B / I / U / Wrap, colour, alignment, direction, line height, letter space, opacity |
| Text Effects | Outline, Shadow, Neon glow (the Glow control, relabelled on desktop), Gradient fill |
| Position & Size | X, Y, Width, Height, rotation, Smaller / Bigger / 2× |
| Arrange | Duplicate, Delete, Forward / Backward / To front / To back, Group / Ungroup |
| Align to Stage | the six align buttons, Keep inside stage |

How the sections behave:

- **Opening:** several sections can be open at once. At first, Content & Typography and Text Effects are open.
- **Memory:** the open / closed state is kept for every later text selection in the editor session.
- **Accessibility:** each heading is a real button with `aria-expanded` / `aria-controls` and a labelled region.
  - Enter / Space toggle a section.
  - Up / Down / Home / End move between headings.
- **Layout:** a toggle never moves the heading you clicked.
- **Unchanged areas:** the move-to-stage row and the error box stay above the sections. A multi-selection shows its usual note in Position & Size. Every other element type, and every phone or tablet layout, keeps the existing panel.

**Not changed:**

- the saved Wall format;
- the JS / SQL validators;
- the database, Edge Functions and published rendering;
- custom fonts and their storage contracts;
- the phone and tablet editor.

Files changed: `dist/wall-editor/index.html`, `tools.js`, `controls.js`, `editor.js` (one line), `editor.css` (one hiding rule) and `editor-desktop.css`.

### Validation

- **Tests:** `npm run lint`, `npm run typecheck` and `node --test` pass: 1990 tests, 1989 passed, 1 skipped, 0 failed.
  - New `tests/wall-editor-text-effects.test.js` (4).
  - `tests/wall-custom-fonts.test.js` now pins the new Text panel order.
- **Lab, real editor with the fake client, baseline `9ff94f2` vs new:**
  - 59 regression states are pixel-identical: every other tool at 7 widths, plus the Text panel at 390 / 768 / 899.
  - Text Properties at 390 / 768 / 899 are pixel-identical and have the same control inventory.
  - Desktop Shape, Link / Embed, GamID block and GamID data Properties are identical.
  - The behaviour transcript (27 steps) is identical.
  - My Fonts (18 checks) and TTF / OTF (6 checks) all PASS.
  - The desktop text accordion has the same control inventory as the old flat panel.
  - The accordion state is kept across selections. ARIA wiring, keyboard navigation, no heading jump, Neon on / undo / off and the inert Living Fire card all work, with no page errors.

## Phase B: Living Fire V3 integration readiness (report; nothing integrated)

**Package handling:** `GAMID_LIVING_INFERNO_V3.zip` was extracted into an isolated scratch folder outside the repository and is left unchanged. All 57 files listed in its `MANIFEST.json` match their SHA-256. The V1 / V2 history is recorded by the package's `PREVIOUS-VERSIONS-*` files and `Living-Inferno-V2-Baseline.html`. The package's QA scripts (Python / Node) were **not run**: the demos were inspected with Playwright from outside the package, with all network blocked.

**What it is:**

- **One engine for all three variants:** `dist/engine.js` (class `LivingFire`, about 24 KB) and one WebGL2 fragment shader (`source/living-inferno-v3.frag`). There are no imports, no external requests and no third-party code.
- **Organic, Cinematic and Mythic are not three fonts.** They are three art directions of the same shader, switched by one uniform (`uDirection` 0 / 1 / 2). The three demo pages are identical apart from that default.
- **How it draws:** the letters are rasterised on a canvas, turned into a signed-distance field on the CPU (exact EDT, on the main thread), uploaded as an R16F texture, then animated procedurally. There is no static letter layer.
- **Built-in behaviour:**
  - adaptive render resolution;
  - pause while off-screen (IntersectionObserver);
  - a still frame for `prefers-reduced-motion`;
  - a static text fallback without WebGL2;
  - recovery from a lost context.
- **Licences:** the bundled fonts are Bebas Neue and Russo One (OFL 1.1; GamID already ships both). The package states no licence for the engine or shader themselves, so **Mazen should confirm their provenance / ownership before shipping**.

**The effect controls that actually exist** (from the engine API and lab UI):

- text, size (36–320 px) and font (Russo One, Bebas Neue, System);
- intensity, speed, turbulence;
- colour preset;
- quality;
- direction (Organic / Cinematic / Mythic);
- sparks;
- transparent background;
- mode.

Text is single-line and at most 80 characters.

**Measured, three variants, 960×512, network blocked:**

| Profile | Organic | Cinematic | Mythic | Notes |
|---|---|---|---|---|
| Chrome, real GPU (RTX 3060) | 32.3 draws/s | 32.0 | 32.0 | the engine caps its own frame rate; 0 errors |
| Chrome, software GL (SwiftShader) | 19.3 | 20.8 | 20.5 | stays usable without a GPU; 0 errors |
| Chrome, WebGL disabled | static fallback text shown | same | same | 0 errors |

Memory per effect: about 3 MB CPU SDF plus a 1.54 MB texture at 960×512. One WebGL2 context per effect instance.

**Font compatibility and readability:** the variants were rendered with GamID fonts loaded through the same canvas-font path, using the word "Espada":

- **Bold or heavy display fonts** (Russo One, Bebas Neue, Metal Mania) read well in all three variants.
- **Serif display fonts** (Cinzel Decorative) read well in Organic, with mild loss in Mythic.
- **Thin scripts** (Great Vibes) lose legibility: the strokes break into flame. Script fonts should be warned about or limited.
- **Cinematic and Mythic** add tall flames and embers that can cover nearby elements and reduce legibility at small sizes. Organic is the most legible.
- Custom fonts (My Fonts) would work through the same canvas-font path once loaded. This was not tested with a user font.

**Browser / GPU compatibility:**

- It requires WebGL2; its R16F texture is core WebGL2. Measured only on desktop Chrome (RTX 3060 and SwiftShader).
- Not measured: Safari / iOS, Firefox, Android GPUs, low-end integrated GPUs.
- Browsers limit live WebGL contexts (typically 8–16 per page), so many fire texts on one Wall cannot each own a context.

**What integration (Phase C) would require** (none of it done):

1. **A saved effect setting on the text payload** (for example `fire: { variant, intensity, speed, turbulence, palette, sparks }`). It must pass both the JS validator (`dist/wall-kit/text.js`) and the SQL validator (`private.wall_element_payload_errors`), so it needs a **database migration**, which requires authorisation.
2. **A per-element renderer:** refactor the engine from a page demo into a per-element layer that follows the element's box, rotation, scale and stage clipping in the editor, in Preview and on the published Wall.
3. **A shared or limited context strategy:**
   - either one shared WebGL2 canvas that draws every fire text, or a cap on live fire texts per stage;
   - the static fallback beyond the cap, and when WebGL2 is unavailable.
4. **Move the CPU SDF off the main thread** (a Worker / OffscreenCanvas), or cache it per text / font / size, so typing and resizing stay smooth.
5. **Visitors:**
   - the published Wall draws the same effect, with the fallback for reduced motion / no WebGL2;
   - off-screen pausing is kept.
6. **Properties:** the controls go into the Text Effects section built in Phase A. The Living Fire card becomes a toggle like Neon.

**Readiness by variant:**

| Variant | Technically ready as an effect | Readability | Recommendation |
|---|---|---|---|
| Organic | yes (same engine) | best | ship first / default |
| Cinematic | yes | good at large sizes | ship as an option, with a minimum-size note |
| Mythic | yes | lowest (tall flames, embers) | ship as an option, or hold |

**Is integrating all three as selectable variants practical?** Yes. They share one engine and one shader, so offering all three costs a single selector (`direction`) and adds no extra code, weight or performance cost over shipping one.

The integration work itself (items 1–5 above) is the same whichever variants are chosen.

**Decision needed from Mazen:** which variant(s) to ship (Organic / Cinematic / Mythic, or all three), and authorisation for the migration that the saved setting needs.
