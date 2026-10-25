# Desktop Text editor upgrade: Text Effects, Properties accordion, Living Fire V3 (TESTING)

Mazen's task "GAMID — Desktop Text Editor Upgrade: Text Effects + Living Fire V3 + Accordion Properties" (2026-10-18). It has three phases:

- **Phase A:** the panel reorganisation, implemented and on TESTING.
- **Phase B:** the Living Fire V3 readiness report, below.
- **Phase C:** integration of Living Fire (Organic default, Cinematic, Mythic), done 2026-10-19; see the Phase C section at the end.

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

## Phase C: Living Fire integrated (2026-10-19)

Mazen's task "Living Fire V3 Phase C" (2026-10-18; resumed twice after interruptions). Variants: Organic (default), Cinematic and Mythic. Phase A is preserved.

- **Product:** `5c0371f3b47b256918aa6cb3c0768c679d584f1f`.
- **TESTING static:** run `39147118537`; all 9 changed files are served byte-identical.
- **Migration:** `20261019100000_wall_text_living_fire`, applied on TESTING after a rolled-back rehearsal.

### What it is

- **Visuals unchanged:** `dist/wall-kit/living-fire-engine.js` holds the V3 package's vertex and fragment shaders **verbatim**, and `living-fire-sdf.js` its exact distance transform. Both were extracted by script, not retyped, and are pinned by SHA-256 in `tests/wall-living-fire.test.js`; the fragment shader equals the package's `source/living-inferno-v3.frag`. The three styles are the shader's `uDirection` 0 / 1 / 2. Choosing a style applies that style's own V3 tuning (the package's `setDirection` presets).
- **Saved setting:** `payload.fire = { style, intensity, speed, turbulence, color, sparks, mode }`. Every key is required and no other key is allowed. The rule lives in `living-fire.js` `validateFire` and is mirrored in SQL by `private.wall_fire_ok` (`INVALID_FIRE`). Shared corpus: +15 fire cases, and the database and JavaScript agree on all 621.
- **Editor (desktop only):**
  - the Text panel's Living Fire card toggles the effect and opens Text Effects in Properties;
  - the controls there are Living Fire, Style, Intensity %, Speed ×, Turbulence %, Colour (Natural combustion / Deep crimson / Blue flame), Flames (Full fire / Letters only) and Sparks;
  - there are two notes: one about the one-line / 80-character rule, and one about the live limit and the fallbacks.
  - The phone panel is unchanged. The V3 "silhouette" proof mode and its quality selector are deliberately not Wall options: quality is automatic.
- **Rendering:** there is one painter (`paint.js` → `attachFire`), so the editor canvas, Preview and the published Wall share it.
  - One WebGL2 context per page draws every fire text in turn, then copies each frame into that text's own 2D canvas.
  - There is one distance-field texture per distinct text / font / size. It is shared and cached across editor repaints (8 unused fields are kept), and an element's flame time continues across repaints.
  - The letters are drawn in the text's own font, so library fonts and custom WOFF2 / TTF / OTF fonts both work. Since `24e2d78` they use the painted text's own lines as well: see "Bounding box fix" below. (Originally they were drawn on one centred line, aligned by alignment and first-line centre.)

### Safeguards, each measured

| Safeguard | Why (measured) |
|---|---|
| Renderer loaded only for a Wall with a fire text (dynamic import) | A Wall without fire requests none of the renderer files (audit `requests`) |
| Distance field computed in a module Worker | 116–131 ms per text on the main thread otherwise |
| `KHR_parallel_shader_compile` (non-blocking) | The shader compile blocked the page for **787 ms** on the RTX 3060 (ANGLE / D3D11); the first long task fell from 1052 ms to 127 ms |
| First WebGL2 context created when the page is idle | Context creation itself takes 134–185 ms (one-time per page) |
| At most `FIRE_LIVE_LIMIT` = 4 live, plus an adaptive budget (down to 1) | Software rendering: 2 texts give 29 fps flames, 4 give 17 fps (page 41 fps); adapted to 3, it gives 24 fps flames and a 61 fps page |
| Other texts show a still V3 frame; off-screen and hidden pages pause; reduced motion gives a still frame (0 draws) | — |
| Canvas out of layout until placed | CLS from fire 0 (the only shifts measured are the web-font swap, with or without fire) |
| Context released after 15 s with no fire text; a lost context gives the static fallback | — |
| Static fallback: the same words in a fixed fire gradient | WebGL disabled, a failed shader, a lost context, or text over 80 characters |

### Measurements (Chrome; harness = the real `paintDocument` view path, 640 px column, Bebas Neue, size 150)

**Capacity, all animating (limit raised for the measurement):**

| Fire texts | RTX 3060: flames / page fps | RTX: main-thread CPU | RTX: GPU process memory | SwiftShader (no GPU): flames / page fps |
|---|---|---|---|---|
| 0 | — / 143 | 1.3 % | 89 MB | — / 144 |
| 1 | 28.8 / 142 | 2.2 % | 88 MB | 28.8 / 144 |
| 2 | 28.8 / 143 | 3.3 % | 93 MB | 28.8 / 83 |
| 4 | 28.8 / 143 | 2.8 % | 110 MB | 16.6 / 41 |
| 8 | 28.8 / 143 | 3.2 % | 134 MB | 9.2 / 24 |
| 16 | 28.8 / 143 | 4.2 % | 177 MB | — |
| 24 | 28.8 / 141 | 5.0 % | 193 MB | — |

(The V3 engine caps its own animation at 32 fps; rAF at 144 Hz quantises that to 28.8.)

**With the shipped limit and the adaptive budget:**

| Device | Fire texts | Live / still | Flame fps | Page fps |
|---|---|---|---|---|
| RTX | 8 | 4 / 4 | 28.8 | 142 |
| SwiftShader | 4 | 3 / 1 | 24.2 | 61 |
| SwiftShader | 8 | 3 / 5 | 23.8 | 26 |

At 8 fire texts with no GPU at all, page fps falls to 26 even with only 3 live, so 8 fire texts are not recommended there.

**Memory:**
- GPU memory is about +4.5 MB per fire text: its 1.5 MB R16F field plus its canvas.
- The JS heap rises to about 5–17 MB, transient during field builds.

**Recommended simultaneous-animation limit:** 4. It is enforced, and the adaptive budget lowers it on slow devices.

### Bandwidth (TESTING, Cloudflare Brotli; served sizes measured after deployment)

| What | Bytes on the wire |
|---|---|
| `living-fire.js`, loaded with every Wall (painter + validation) | 2,995 |
| `paint.js` / `text.js` / `wall-kit.css` growth | +58 / +132 / +358 (paint.js against its served HEAD size; text.js and wall-kit.css against Brotli-4 of HEAD) |
| `living-fire-engine.js`, only for a Wall with fire | 9,100 |
| `living-fire-sdf.js` (Worker), only for a Wall with fire | 1,274 |
| Fonts | 0 new (the text's own font) |
| Database / API | the setting is about 120 bytes per fire text inside the existing Wall document; no new request, nothing per frame |

**Live reference, @black's public page (read-only visitor, before Phase C):**
- First visit: 5,463 KB total, 327 KB static.
- Repeat visit: 78 KB (84 revalidations).

**With fire:**
- First visit: about +13.9 KB (0.25 %).
- Repeat visit: 2–3 more conditional requests (304, headers only).

**Caching:** unchanged site-wide policy (`max-age=0, must-revalidate` plus ETag). Long-lived immutable caching with versioned file names would need a hosting configuration change and was not made.

### Validation

- **Tests:**
  - `npm test`: 2000 tests, 1999 passed, 1 skipped, 0 failed. Lint and both typechecks pass.
  - The W0 prototype checks moved to `typecheck:prototypes`, chained, because the script hit Windows' command-line limit.
  - New `tests/wall-living-fire.test.js` (10).
- **Editor lab walk-through (18 checks, all PASS):**
  - the card is enabled, opens Text Effects, and the canvas draws live;
  - Organic is the default; Cinematic and Mythic tuning are applied;
  - every control is saved exactly, and the typography is untouched;
  - Neon works together with fire, and the painted glow is hidden while live;
  - undo works;
  - after reload, Preview and the visitor view all draw live;
  - with 6 fire texts, 4 are live and 2 still, sharing 1 field;
  - a custom TTF (Imperial Script) burns in its own letterforms.
- **Fallbacks:** WebGL disabled shows the static gradient, readable; reduced motion gives a still frame (0 draws in 3 s, identical frames); 81 characters gives static and 80 gives live.
- **Regression against the Phase A baseline `4e59f20`:**
  - 59 screen states pixel-identical, including every phone and tablet panel;
  - phone / tablet text Properties identical;
  - the other element types' Properties identical;
  - the 27-step behaviour transcript identical;
  - My Fonts 18 / 18 and TTF / OTF 6 / 6 pass;
  - the desktop text Properties only gained the Living Fire controls.
- **Live TESTING database (rolled back; the synthetic persona GM-TEST-01 was confirmed unchanged afterwards):**
  - the owner saves and publishes Organic, Cinematic and Mythic fire texts;
  - an anonymous visitor reads them exactly as saved;
  - a plain text is unchanged;
  - an invalid setting is refused at save;
  - the new helper is not executable by `anon` / `authenticated`;
  - 0 existing drafts carry fire.

### Rollback

1. Remove `fire` from any saved or published Wall (re-save / re-publish without it).
2. Restore `private.wall_text_payload_errors` from `20260930160000_wall_video_layers_other_link.sql`.
3. Drop `private.wall_fire_ok(jsonb)`.
4. Revert `5c0371f`.

No table or row was changed by the migration.

### Limitations

- **Lines:** superseded by the bounding box fix (`24e2d78`). Living Fire now draws the text's own lines; the 80-character limit still applies.
- **Readability:** thin scripts break apart, and Mythic's tall flames reach furthest (Phase B).
- **Untested:** Safari / iOS, Firefox and Android GPUs.
- **Phone editor:** the phone editor shows and keeps the effect but has no Living Fire controls (phone UI unchanged by design).

## Bounding box fix (2026-10-19)

Mazen's report "GAMID — FIX LIVING FIRE BOUNDING BOX BUG": Living Fire letters rendered much wider than the blue selection box, while normal text stayed inside it.

**Accepted by Mazen on 2026-10-19** after his own TESTING test (Product Memory REV-0012). This accepted the fix independently (REV-0012). Mazen subsequently accepted the complete Living Fire V3 capability on 2026-10-19 (REV-0013); Truth `living-fire-text` is ACCEPTED.

- **Product:** `24e2d78a35cd5e2605014da700ebd568de85e8b7`, TESTING run `39150052877`. The changed files are served byte-identical.
- No schema, shader, normal text or Neon change.

**Root cause.** It was not the metrics, the scale, the canvas size or the shader. When the text fits on one line, the fire letters matched the painted glyphs to within 3 px (218–479 vs 221–479). But Living Fire always laid the whole text out as **one line** at full size and ignored the box width, while the painted text wraps at it. With "GAME ON STARTS" in Metal Mania 110 and a 358 px box:
- the painted text broke into lines inside the box;
- the fire drew one 485 px line, 64 px past each side.

**Fix (only how the letter mask is laid out; the V3 shader, its tuning and the three styles are unchanged).** `layoutLetters` now lays the letters out exactly like `paint.js` paints the text:
- **Line breaks:** wrap on breaks at the box width, word by word, and a word wider than the box is broken anywhere (as `overflow-wrap: anywhere`); wrap off uses only the text's own line breaks.
- **Alignment and lines:** the same alignment, with an overflowing line starting at its start edge as CSS does; the same CSS line boxes (half-leading, font ascent); the same line height.
- **Size:** it is drawn at a design size that fits the V3 frame, using V3's own rules (lines at most 1000 design units, room above for the flames, the inked block at 58 %).
- **Placement:** the field records where the box's top-left corner is in the frame, and `place()` pins that corner to the element's. Everything follows the box: move, resize, rotation (the canvas is inside the rotated element) and alignment.
- **Unchanged case:** a single centred line that fits is V3's own layout, exactly as before.
- **No flash on resize:** the field key now includes the wrap width, line height and alignment. During an editor resize, the element keeps showing its last field until the new one is ready (sampled during a drag: always live, never static).

**Measured after the fix** (visible fire, alpha > 40, against the box; flames may extend a few px past the letters):
- narrow box with wrap on, at left, centre and right: inside the box, following the painted lines;
- wrap off with a line too long: it overflows exactly like the painted text;
- forced line breaks, an over-long word, a script font, a small serif, the custom TTF Imperial Script, rotation 12–15°, and the Organic, Cinematic and Mythic styles: all inside, 0–8 px;
- editor resize drag, move, reload, Preview and the visitor view: inside, 0–5 px.

If the box is shorter than its lines, the fire hangs below exactly as the painted text does; "Fit box height to text" fits it.

**Tests:**
- `tests/wall-living-fire.test.js` +2 tests: the line breaker, and the placement, key and interim rules.
- `npm test`: 2002 tests, 2001 passed, 1 skipped. Lint and typecheck pass.
- The fire editor walk-through (18 / 18), the bounding-box editor walk-through (14 / 14), and 59 screen states pixel-identical to `4e59f20`, phone panels included.

## Pro Effects (2026-10-25, feature branch - not on TESTING)

The Text panel's Text Effects became **Pro Effects** (Neon, Living Fire, Living Ice, Living Radiation): see `docs/WALL-PRO-EFFECTS.md`.
- Choosing a card applies its effect instead of toggling it. The Living Fire controls moved from the Text Effects section into their own LIVING FIRE EFFECTS section, first in Properties, with Remove effect. The rest of that section is now **Text Style** (Outline, Shadow, Gradient fill).
- The live limit of 4 is now shared with every animated effect on a page; a Fire-only Wall still animates 4.
- Living Fire's shaders, transform, setting and fallbacks are unchanged.

## Text panel accordion (2026-10-25, TESTING `9ee23d8`)

Mazen's task "GamID — Text Panel Accordion UX Improvement". In the Text panel, **Pro Effects**, **My Fonts** and **Upload My Font** are now accordions.

- **Headings:** each existing heading holds a real button (`aria-expanded`, `aria-controls`) with a chevron: the font library's on desktop, a 44px CSS chevron on phones. Its content sits in a labelled region.
- **One open at a time:** opening one closes the others, and clicking the open heading closes it. Pro Effects is open at first, and the choice is kept while the editor is open.
- **Unchanged:** content, ids and behaviour - the four effect cards, My Fonts (list, n/3, choose, delete) and Upload My Font (licence, upload, limits).
- **Font status line:** the shared upload / delete message shows in whichever font section is open, so an upload's result appears in Upload My Font and a deletion's in My Fonts.
- **Font library:** unchanged.
- **The 600-899px panel** still hides all three sections.
- **Code:** `dist/wall-editor/tools.js` (it wraps the existing markup; `index.html` is unchanged), `editor-desktop.css` and `editor-mobile.css`.

## Pro Effects inside the Font Library (2026-10-25, feature branch - not deployed)

Pro Effects is now the Font Library's **first category**, above Gaming. Its header uses the same component, style, count (4) and chevron as the font categories, and the standalone Pro Effects section is gone.

- **Desktop:** the category is collapsed at first; expanding it shows the four effect cards. A font search hides it, because effects are not fonts.
- **Phones:** a plain heading with its cards, like the other categories there.
- **Tablet (600-899px):** hidden, as before.
- **Unchanged:** My Fonts and Upload My Font keep their places and stay one-open-at-a-time (both start closed). Effect behaviour, Properties, rendering and saving are unchanged.
