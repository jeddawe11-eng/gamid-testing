# Pro Effects: Neon, Living Fire, Living Ice and Living Radiation (on TESTING 2026-10-25; PENDING Mazen's acceptance)

Mazen's task "GamID Pro Effects Integration" (2026-10-25). It authorises implementation on `feature/mobile-public-wall-visitor-v2` only: no deployment, merge or Production.

- **Product:** `dcd5236055141dd3c9b2ba45b4de1ee0bf32b3c6`.
- **Status:** on TESTING since 2026-10-25 (site `fb8708e`, run `40191766463`; migration applied); see §8. Mazen's manual acceptance is pending.

## 1. What changed for the owner

**Pro Effects category.** In the Text panel, "Text Effects" is now **Pro Effects**, a dedicated category separate from fonts. It shows on desktop and phones; the 600–899px tablet keeps its existing panel. It has four cards:

| Card | Saved as | Origin |
|---|---|---|
| Neon | `payload.glow` | the existing glow (the Gaming Title neon) |
| Living Fire | `payload.fire` | V3, accepted (`docs/WALL-EDITOR-TEXT-EFFECTS.md`) |
| Living Ice | `payload.ice` | package `GAMID_LIVING_ICE_V5_MATERIALS` |
| Living Radiation | `payload.radiation` | package `GAMID_LIVING_RADIATION_V1_WAVEFORM_REFINEMENT` |

- **Free.** All four are free and fully usable. `dist/wall-kit/pro-effects.js` gives each a `tier: "free"` that only identifies it for a future entitlement. No code reads it, and nothing restricts, prompts, or changes save or publish. A test asserts this.

**Choosing an effect** applies it at once, as one undo step:
- **Text(s) selected:** each gets the effect and keeps its words.
- **Empty text:** it gets "Write something about yourself here".
- **No text selected:** one new text with that placeholder is added and selected. It uses Bebas Neue 110 in a 900 × 280 box: a bold display face the effects read well in.
- **Choosing the effect a text already shows:** nothing changes, so no duplicate and no reset of its settings.
- **One Pro Effect per text.** Choosing an animated effect removes the other animated ones. An earlier glow is kept, as Living Fire always allowed: it is hidden while the animated effect draws and shows in its fallback. Choosing Neon removes the animated effect.

**Properties.** A text showing a Pro Effect gets that effect's own section first, expanded:
- the section is titled NEON EFFECTS, LIVING FIRE EFFECTS, LIVING ICE EFFECTS or LIVING RADIATION EFFECTS;
- it holds only that effect's controls, then **Remove effect**;
- then come the general sections, collapsed: Content & Typography, Text Style (Outline, Shadow, Gradient fill), Position & Size, Arrange, Align to Stage.

How the sections behave:
- Choosing an effect resets the panel to that state.
- What the owner opens afterwards is remembered for later effect texts.
- An ordinary text keeps its own remembered state, unchanged (Content & Typography and Text Style open at first).
- Switching effect rebuilds the panel with the new heading and controls.
- **Phone:** the same panel, as the Edit sheet's first section, open; Content & typography and Text style follow, collapsed.
- **Desktop vs phone:** the Neon glow and Living Fire controls left the general section on both. A GamID data text and the 600–899px panel keep their Glow as before.

**Controls**, each the package's own:

| Effect | Controls |
|---|---|
| Neon | Colour, Glow size |
| Living Fire | unchanged: Style, Intensity %, Speed ×, Turbulence %, Colour, Flames, Sparks |
| Living Ice | Preset (Glacier Blue / Arctic White / Deep Ice) with the package's "· edited" indicator; Ice base, Frost / snow, Deep ice shadow and Crystal highlight colours; Ice depth ×, Transparency %, Frost coverage %, Crystal density %, Crystal size / spike length ×, Refraction / internal scattering ×, Surface roughness %; Reset to preset |
| Living Radiation | Style (a new style starts from its own defaults and keeps the colour, as the package's lab); Colour (10 presets + Custom colour); Waveform; the 11 values in the package's groups (Wave, Letter transformation, Glow & recovery); Atmosphere (Energy particles, Energy mist, Scan lines, Gentle glitch) |

**Package controls deliberately not carried.** These are the packages' review tools, not Wall settings:
- **Radiation:** Pause, Restart wave, Glyph shape only, Waveform only, Hold horizontal travel, Still preview. Its renderer keeps uProof / uWaveOnly off, and both clocks always run.
- **Radiation text and font controls:** replaced by the text element's own typography; local font upload by My Fonts.
- **Ice:** playback speed, Restart initial freeze, the close-up camera and isolated letter R, the silhouette proof, the cinema view.
- **Ice Save / Restore / Export / Import JSON:** replaced by the Wall's own persistence.

## 2. The two packages

Both were extracted outside the repository and left untouched. Every file matched its MANIFEST: Radiation 74/74, Ice 47/47. Their QA scripts were not run.

**Living Radiation** (`dist/wall-kit/living-radiation*.js`):
- The package was built on Living Fire's hosting code, so it fits the same way.
- Its vertex and fragment shaders are copied verbatim, by script, and pinned by SHA-256.
- Also verbatim: its uniforms, noise seed, frame cap (32 fps), two independent clocks (the waveform refinement) and settings contract (`source/settings.js`).
- Its distance-field Worker is Living Fire's (`living-fire-sdf.js`): the package's `distance-field.js` is the same code.
- It lays the letters out with `effect-layout.js`, Living Fire's layout, which the package ships unchanged.

**Living Ice** (`dist/wall-kit/living-ice*.js`) is verbatim, by script and pinned, in:
- its vertex shader;
- its fragment shader, with **one** change described below;
- its regional freezing clocks (`regionState`) and crystal-root placement;
- its seeded generator, 30 fps cap and 6.5 s starting moment (also its reduced-motion still frame);
- its material uniforms and its signed-distance cap (150).

Adapted to the Wall, because the package is a fixed study:
- **Letters:** the text's own (font, lines, alignment, wrap), instead of the study's word "FROZEN" stretched into the frame. They sit at the package's letter size (430) in its 1920 × 800 frame: widest line ≤ 1740 units, inked block ≤ 560 units, centred.
- **The one shader change:** where no ice is hit, it returns a transparent pixel instead of the study's dark-blue backdrop, so the Wall shows behind the letters. The test undoes exactly that change and gets the package's `source/freezing.frag` back. The backdrop still lights what is seen through the ice.
- **Camera:** only the master camera (the whole frame) is drawn.
- **Sampling:** drawn at 2× its displayed resolution, never above the package's 1536 px camera. The ice is ray-marched with fine facets and has no anti-aliasing, so at Wall sizes 1× sampling looked speckled; 2× shows the material.
- **Distance field:** the same Worker as Living Fire, with its identical exact transform capped at 150 (an additive `limit` parameter; Living Fire keeps 256).

## 3. Saved settings and the database

**Shapes.** Both follow the packages' contracts exactly, with every key required and no other key allowed:
- `ice`: `{ preset, base, frostColor, shadow, highlight, depth, transparency, frost, density, size, scattering, roughness }` (12 keys).
- `radiation`: `{ style, color, customColor, waveform, speed, intensity, width, interval, distortion, ripple, fragmentation, recovery, glow, cracks, afterglow, particles, mist, scanLines, flicker }` (19 keys).

**Validators.**
- JavaScript: `validateIce` and `validateRadiation`, used by `text.js` (`INVALID_ICE` / `INVALID_RADIATION`).
- Database: migration **`20261025120000_wall_text_ice_radiation`**, in the same shape as Living Fire's.
  - Two helpers, revoked from every API role: `private.wall_ice_ok` and `private.wall_radiation_ok`.
  - `private.wall_text_payload_errors`, re-created with exactly two new lines.
  - It touches no table or row, and reads no plan or entitlement.
- **Parity:** tested on an isolated Postgres (PGlite). Each validator's latest definition from the Wall migrations is loaded, then this migration; the database and JavaScript agree on every text of the shared corpus (+26 Pro Effects cases) and the edge cases.

**Not applied to TESTING.** Until it is, saving a Wall with an Ice or Radiation text on TESTING would be refused (`INVALID_TEXT_PAYLOAD`).

**Rollback.**
1. Remove `ice` / `radiation` from saved Walls.
2. Restore `private.wall_text_payload_errors` from `20261019100000`.
3. Drop the two helpers.

Existing Neon (glow-only) and Living Fire texts keep exactly the same format and meaning.

## 4. Rendering, performance and safeguards

**One painter** (`paint.js`) serves the editor canvas, Preview and the published Wall. A text with `fire` gets Living Fire, else `ice` Living Ice, else `radiation` Living Radiation.

**Loading.** Each engine is fetched only when a painted Wall has such a text:

| File | Brotli-4 size |
|---|---|
| `living-ice-engine.js` | 11.7 KB |
| `living-radiation-engine.js` | 8.9 KB |

`living-ice.js` and `living-radiation.js` (3.4 KB and 3.3 KB) load with every Wall, because `text.js` validates with them (as `living-fire.js`). Nothing is requested per frame.

**One live budget** (`effects-budget.js`): at most 4 animated texts move at once on a page, whichever effects they are. Each engine keeps its adaptive budget and its own WebGL2 context, so there are at most three per page. Living Fire joins with a two-line change; its shader and transform are untouched. Measured: a Fire-only Wall still animates 4 of 6 at 28.7 fps.

**Per engine,** as Living Fire:
- off-screen texts and hidden pages pause;
- reduced motion shows a drawn still frame (0 animated, identical frames);
- the context and Worker are released 15 s after the last such text;
- an editor resize keeps the last field until the new one is ready;
- the canvas never takes a tap and causes no layout shift;
- the live state hides the painted letters but keeps them for assistive technology;
- the static fallback is the same words, readable, in the effect's colours.

**Measured performance.** Chrome, the real editor in the lab, 1440 × 900, texts spread on one stage:

| Renderer | Effect | 1 text | 2 | 4 | 6 (4 live, 2 still) |
|---|---|---|---|---|---|
| RTX 3060 | Living Ice: page fps / per-text fps | 142 / 28.7 | 144 / 28.8 | 142 / 28.7 | 143 / 28.7 |
| RTX 3060 | Living Radiation | 142 / 28.7 | 142 / 28.7 | 143 / 28.7 | 143 / 28.7 |
| Software (SwiftShader) | Living Radiation | 60 / 30 | 60 / 30 | 57 / 29.5 | 60 / 30 |
| Software (SwiftShader) | Living Ice, before the safeguards | 2.7 / 2.7 | 1.2 / 1.3 | 1.1 / 1.2 | 1.2 / 1.2 |
| Software (SwiftShader) | Living Ice, with the safeguards | 60 (static) | 60 | 60 | 60 |

**Living Ice device safeguards**, added because of the software-rendering row above:
- One Ice draw costs about 0.2 ms of main-thread time on the GPU, but 400–550 ms with software rendering.
- So a software renderer (SwiftShader, llvmpipe, softpipe, "Basic Render") never draws Living Ice.
- A device whose Ice draws take over 100 ms three times in a row gives up. Tested with the renderer name hidden: it gave up after 3 draws (1.9 s), and the page returned to 60 fps.
- Both cases show the static fallback, as a device without WebGL2 does.
- Living Ice's adaptive budget may also step down to 0 (still frames) when one text cannot keep about 10 fps.
- Living Radiation needed none of this.

**Placement.** The visible effect against the painted text, Russo One 120, one line and wrapped left:

| Effect | Centre offset |
|---|---|
| Living Fire | 0–2 px |
| Living Radiation | 0–1 px |
| Living Ice, one line | 1 px |
| Living Ice, wrapped | 9 px: its crystals grow outward from the letters, as in the package |

## 5. Verification (local; lab with the fake client; nothing on TESTING)

- **`npm run build`** (lint, typecheck, `node --test`): 2219 tests, 2217 pass, 0 failures, 2 pre-existing skips.
  - New `tests/wall-pro-effects.test.js` (14) covers:
    - the package hashes;
    - the contracts and validators;
    - the database parity;
    - the migration shape;
    - the free category, with no restriction code;
    - the apply / switch / placeholder / no-duplicate rules;
    - the Properties structure;
    - the painter and loading;
    - the shared budget;
    - the Ice safeguards;
    - the layout.
  - Updated: the tests pinning the old card toggle, the "Text Effects" section and the Fire budget line.
  - `typecheck`: 15 tool / fixture checks moved to a chained `typecheck:tools`, because the script had passed Windows' command-line limit.
- **Desktop editor walk-through (1440 × 900, Chrome): 36/36.** It covers:
  - the category and its four free cards;
  - no selection → a new selected placeholder text with Ice live;
  - LIVING ICE EFFECTS first and expanded, the general sections collapsed, only Ice's controls;
  - choosing it again adds nothing;
  - switching to Radiation, Neon and Fire, with heading and controls following and no leftover canvas;
  - undo / redo of an effect;
  - an existing text kept, and an empty text given the placeholder;
  - Radiation Meltdown defaults; Ice preset, "edited" and Reset to preset;
  - Remove effect;
  - save stores the exact settings;
  - after reload, in Preview and in the public visitor view, everything draws live;
  - reopen, modify and save;
  - a mixed Wall of fire, ice and radiation never animates more than 4;
  - deleting the Ice texts empties its renderer, and its context is released.
- **Phone (390 × 844 and 844 × 390, touch): 16/16,** plus reduced motion 1/1:
  - the four cards in the Text sheet;
  - choosing one opens the Edit sheet on the effect section (open, heading visible), with the general sections collapsed;
  - live on the canvas;
  - switching;
  - a control by touch;
  - Content & typography one tap away;
  - no horizontal scroll.
- **Non-regression:** Friends Stickers editor 59/59 and visitor 46/46; Wall Stages 60/60; backgrounds 12/12; Friends Stage empty editor 36/36 and visitor 70/70; mobile editor functions 9/9; Mobile Public Wall check 196/196.
- **Visual check** against the packages' evidence:
  - Ice "FROZEN" in a bold serif at Wall size shows the V5 faceted blue body, white frost and crystal spikes.
  - Radiation "GAMID" shows the Reactor trace sweeping the word, deforming and lighting the glyphs, then recovering and resting.
- **Fallbacks:** reduced motion (still frames); software rendering (Ice static, Radiation live); the 80-character static rule (the same as Living Fire's).
- **Not tested:** a signed-in TESTING account, real save / publish through TESTING (the migration is not applied), physical phones, Safari, Firefox, Android GPUs and low-end integrated GPUs. No browser or device compatibility is claimed beyond desktop Chrome (RTX 3060 and SwiftShader).

## 6. Limitations

- **Living Ice reads best on short, bold words,** like the package's one-word study. A long text, the 34-character placeholder included, is scaled down to fit the package's fixed 1920 × 800 frame, while its crystals and facets keep their size. Thin or condensed faces lose some body. This is the package's fixed-frame design; changing it would mean changing the shader.
- **Ice edges:** the package draws no anti-aliasing. 2× sampling softens the edges; it does not remove aliasing at every size.
- **One Pro Effect per text** (the editor's rule). An older text carrying several still validates; the painter draws its first animated one.
- **The 600–899px tablet panel** is unchanged: no Pro Effects cards, and no Ice / Radiation controls there. It keeps Glow.
- **Licensing / provenance:** the packages state no licence for their engine code (as with Living Fire V3), so Mazen should confirm ownership before release. Neither package's fonts, reference image or evidence files are shipped: the effects draw the text's own fonts.

## 7. What deployment needs (not authorised in this task)

1. Mazen's authorisation to apply migration `20261025120000_wall_text_ice_radiation` to TESTING (rehearsed in a rolled-back transaction first) and to deploy `dcd5236` (or later) to TESTING.
2. **GamID Truth, in that deployment task.** Truth records what exists on TESTING, so it is unchanged now. On deployment:
   - **New `pro-effects` (PENDING_ACCEPTANCE), surface `/wall-editor/`, three contracts:**
     - the category: four effects, all free, `tier` only identifies them;
     - applying: placeholder, kept text, one Pro Effect per text, no duplicate, one undo step;
     - Properties: effect section first and expanded, general sections collapsed, phone the same, tablet unchanged.
   - **New `living-ice-text` and `living-radiation-text` (PENDING_ACCEPTANCE), surfaces `/wall-editor/` and `/@handle`:**
     - limits: 80 characters, 3 presets / 3 styles, and the shared live budget 4;
     - contracts: visuals (package code verbatim; Ice's one transparent-miss change and 2× sampling), setting (exact keys and ranges, `INVALID_ICE` / `INVALID_RADIATION`), and rendering (lazy, shared budget, pause, reduced motion, static fallback; Ice's device safeguards).
   - **`living-fire-text` (ACCEPTED), contracts amended, with a note that the amendment awaits acceptance:**
     - `living-fire-editor`: the Pro Effects card applies the effect (it no longer toggles), and the controls are in LIVING FIRE EFFECTS with Remove effect, on desktop and phone;
     - `living-fire-rendering`: "at most 4 fire texts" becomes "at most 4 animated effect texts in all".
3. Mazen's manual acceptance on TESTING, on desktop and Android.

## 8. TESTING deployment (2026-10-25)

Mazen authorised deployment to TESTING only, for his own test.

- **Readiness:** `npm run build` at `fb8708e`: 2219 tests, 0 failures.
- **Database audit before applying.** TESTING held an unrecorded migration from an earlier Radiation experiment, `20261020114332_wall_text_living_radiation`. It is in TESTING's history only, and was already noted as unrelated in `docs/WALL-VIDEO-RENDITIONS-F8B1.md`. It had:
  - created `private.wall_radiation_ok`, with the same rules as this repository's, executable by `postgres` only;
  - added one `INVALID_RADIATION` line to `private.wall_text_payload_errors`. Without that line, the live function is byte-for-byte this repository's `20261019100000` version (md5 of the normalised body).
  - No draft or published Wall used `ice` or `radiation`.
  - `20261025120000` therefore re-creates both with a strict superset: Fire, Ice and Radiation.
- **Rehearsal** (one transaction, always rolled back), 8/8:
  - the validator has the three effects;
  - the helpers are not executable by `anon` / `authenticated`;
  - the synthetic persona GM-TEST-01 saved Ice (glacier, deep edited), Radiation (reactor, phantom custom colour), Fire + glow, Neon and a plain text, exactly as sent;
  - a bad Ice setting is refused (`INVALID_ICE:i1`), as is a bad Radiation one (`INVALID_RADIATION:r1`);
  - the Wall is published, and an anonymous visitor reads every effect exactly as saved.
  - Afterwards: nothing persisted, and GM-TEST-01 was unchanged.
- **Applied** `20261025120000` in one transaction and recorded it (`migration repair --status applied`). Verified live:
  - the three effect lines in the validator;
  - the helpers revoked;
  - a valid Ice setting passes and a bad one is refused.
- **Site:** run `40191766463`, successful; stamp `fb8708e`; all 17 changed files are byte-identical.
- **Live anonymous smoke** on TESTING itself, desktop and phone (`/wall-editor/` loads to its sign-in gate):
  - the editor has the Pro Effects category;
  - the deployed painter draws an in-memory Wall (nothing saved) with Neon glowing and Living Fire, Living Ice and Living Radiation all **live**;
  - the three renderers and the one shared Worker are fetched from TESTING itself.
  - The only console errors are the signed-out editor's existing `get_my_wall_video_jobs` 401 and the favicon.
- **Not tested by Claude Code:** the signed-in editor on TESTING (the agent does not sign in as personas). That is Mazen's test.
- **GamID Truth:** `pro-effects`, `living-ice-text` and `living-radiation-text` are PENDING_ACCEPTANCE; `living-fire-text` stays ACCEPTED, with its editor and rendering contracts amended (noted).
- **Rollback:** redeploy `1aba378` (run `40182003937`), then the database steps of §3. Rolling back the database restores `20261019100000`'s validator, which also drops the old experiment's Radiation line.
