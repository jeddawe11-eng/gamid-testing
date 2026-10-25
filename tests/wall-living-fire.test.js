// Living Fire V3 on Wall text (Mazen's task "Living Fire V3 Phase C", 2026-10-19). The approved V3 look is the package's own code, unchanged; what is pinned here is
// that it stays so, that the payload rule is the same in JavaScript and in the database, that the renderer loads only for Walls that use it, and that every
// performance / fallback safeguard measured in the Phase C audit is in place.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { FIRE_STYLES, FIRE_COLORS, FIRE_MODES, FIRE_LIMITS, FIRE_LIVE_LIMIT, FIRE_STYLE_DEFAULTS, createFire, validateFire, fireText, fireTextFits } from "../dist/wall-kit/living-fire.js";
import { validateTextPayload, renderTextPayload, createTextPayload } from "../dist/wall-kit/text.js";
import { buildSdf, SDF_W, SDF_H } from "../dist/wall-kit/living-fire-sdf.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const sha = text => createHash("sha256").update(text).digest("hex");
const engine = read("dist/wall-kit/living-fire-engine.js");
const light = read("dist/wall-kit/living-fire.js");
const sdf = read("dist/wall-kit/living-fire-sdf.js");

// GAMID_LIVING_INFERNO_V3: MANIFEST dist/engine.js sha256 de878316ad000e3180a7607e01d35bfdc61d6ad825b64ab487df8180e16b2e1c, source/living-inferno-v3.frag (trimmed, LF)
test("the V3 visuals are the package's code verbatim: fragment shader = source/living-inferno-v3.frag, vertex shader and exact EDT = dist/engine.js", () => {
  const fs = engine.match(/const FS = `([\s\S]*?)`;/)[1], vs = engine.match(/const VS = `([\s\S]*?)`;/)[1];
  assert.equal(sha(fs.trim()), "8ce82d85c0e15725fba04ec576eafef94dd88fa54930c903c303707a9c5d4194", "fragment shader unchanged");
  assert.equal(sha(vs), "d1eae4bd9f09e46ef3f4b23c2d4c83cba2a46f7860d4fb0200eb5c78a593130d", "vertex shader unchanged");
  const edt = sdf.match(/^function edt1[^\n]*\n^function distanceTransform[^\n]*\n/m)[0];
  assert.equal(sha(edt), "5acf0e934b3e52d7e3295ba53343da7a638c5162f56da64d5eab46e954902538", "distance transform unchanged");
  assert.match(engine, /let seed = 836719;/, "the V3 noise texture seed");
  assert.deepEqual([SDF_W, SDF_H], [1200, 640], "the V3 design frame");
});

test("the three styles are three looks of one effect with the V3 package's own tuning; Organic is the default", () => {
  assert.deepEqual(FIRE_STYLES, ["organic", "cinematic", "mythic"]);
  assert.deepEqual(FIRE_STYLE_DEFAULTS, { organic: { intensity: 1, turbulence: 0.9, speed: 1 }, cinematic: { intensity: 1.08, turbulence: 0.9, speed: 1.05 }, mythic: { intensity: 1, turbulence: 0.95, speed: 0.9 } });
  assert.deepEqual(createFire(), { style: "organic", intensity: 1, turbulence: 0.9, speed: 1, color: "natural", sparks: false, mode: "full" });
  assert.match(engine, /const DIRECTION = \{ organic: 0, cinematic: 1, mythic: 2 \};/, "uDirection 0 / 1 / 2 of the one shader");
  assert.deepEqual(FIRE_COLORS, ["natural", "crimson", "blue"]);
  assert.deepEqual(FIRE_MODES, ["full", "letters"], "the silhouette proof mode is not a Wall option");
  for (const style of FIRE_STYLES) assert.ok(validateFire(createFire(style)), style);
});

test("the fire setting: every key required, no other key, enumerated values and the V3 engine's own ranges", () => {
  const ok = createFire();
  assert.ok(validateFire(ok));
  const bad = [{ ...ok, style: "ice" }, { ...ok, intensity: 1.41 }, { ...ok, intensity: 0.19 }, { ...ok, speed: 2.01 }, { ...ok, speed: 0.1 }, { ...ok, turbulence: 1.6 }, { ...ok, turbulence: "1" },
    { ...ok, color: "green" }, { ...ok, mode: "silhouette" }, { ...ok, sparks: "yes" }, { ...ok, quality: "1200" }, (({ mode, ...rest }) => rest)(ok), null, "organic", [], { ...ok, intensity: NaN }];
  for (const value of bad) assert.equal(validateFire(value), false, JSON.stringify(value));
  assert.deepEqual(FIRE_LIMITS, { intensity: [0.2, 1.4], speed: [0.15, 2], turbulence: [0.15, 1.5], maxText: 80 });
  // in a text payload: optional, INVALID_FIRE when wrong, copied to the painter only when set
  assert.deepEqual(validateTextPayload(createTextPayload({ fire: ok })), []);
  assert.deepEqual(validateTextPayload(createTextPayload({ fire: { ...ok, style: "ice" } })), ["INVALID_FIRE"]);
  assert.deepEqual(validateTextPayload(createTextPayload()), [], "a text without fire is unchanged");
  assert.deepEqual(renderTextPayload(createTextPayload({ fire: ok })).fire, ok);
  assert.equal("fire" in renderTextPayload(createTextPayload()), false);
});

test("one line of at most 80 characters; a longer text keeps the readable static fallback", () => {
  assert.equal(fireText(" LEGEND \n of\tFIRE "), "LEGEND of FIRE");
  assert.ok(fireTextFits("x".repeat(80)));
  assert.equal(fireTextFits("x".repeat(81)), false);
  assert.match(light, /if \(!text \|\| !fireTextFits\(text\)\) \{ node\.setAttribute\("data-fire", "static"\); return; \}/);
});

test("the signed distance field is the V3 one: inside positive, outside negative (the shader reads -256 outside its frame), capped at 256 design units", () => {
  const w = 40, h = 20, mask = new Uint8ClampedArray(w * h * 4);
  for (let y = 5; y < 15; y++) for (let x = 10; x < 30; x++) mask[(y * w + x) * 4 + 3] = 255;
  const field = buildSdf(mask, w, h);
  assert.ok(field[10 * w + 20] > 0, "inside");
  assert.ok(field[0] < 0, "outside");
  assert.ok(field.every(value => value >= -256 && value <= 256));
});

test("bandwidth: the renderer is fetched only when a painted Wall has a Living Fire text; nothing is requested per frame", () => {
  assert.match(read("dist/wall-kit/paint.js"), /if \(content\.fire\) attachFire\(node, content, scale, item\);/);
  assert.match(light, /import\("\.\/living-fire-engine\.js"\)/, "dynamic import only");
  assert.doesNotMatch(light, /from "\.\/living-fire-engine\.js"/, "never a static import");
  assert.doesNotMatch(engine + light + sdf, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|https?:\/\//, "no network use: the animation runs locally");
  assert.match(engine, /new Worker\(new URL\("\.\/living-fire-sdf\.js", import\.meta\.url\), \{ type: "module" \}\)/, "same-origin module Worker (CSP script-src 'self')");
});

test("performance safeguards from the audit: one shared context, shared fields, live budget, offscreen / hidden pause, reduced motion, non-blocking compile, release", () => {
  assert.equal(FIRE_LIVE_LIMIT, 4);
  assert.match(engine, /export const LIVE_LIMIT = FIRE_LIVE_LIMIT;/);
  assert.match(engine, /const animate = !still && entry\.visible && live < available;/, "at most the (adaptive) budget animates; the rest show a still frame");
  // Pro Effects (2026-10-25): the budget is shared with Living Ice and Living Radiation - a Fire-only Wall still animates 4, a mixed Wall never more than 4 in all
  assert.match(engine, /const available = Math\.min\(budget, liveAllowance\("fire"\)\);/);
  assert.match(engine, /reportLive\("fire", live\);/);
  assert.match(engine, /if \(slowWindow\.length === 30 && mean > period \* 1\.6 && budget > 1\) \{ budget--;/, "a slow device steps down");
  assert.equal((engine.match(/getContext\("webgl2"/g) ?? []).length, 1, "one WebGL2 context for the whole page");
  assert.match(engine, /fields\.get\(key\)/, "one distance field per distinct text, shared and cached across repaints");
  assert.match(engine, /const CACHE_KEEP = 8;/);
  assert.match(engine, /new IntersectionObserver\(/, "off-screen texts pause");
  assert.match(engine, /if \(document\.hidden\) \{/, "hidden pages pause");
  assert.match(engine, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/, "reduced motion = the V3 still frame");
  assert.match(engine, /KHR_parallel_shader_compile/, "the 0.8 s shader compile never blocks the page");
  assert.match(engine, /COMPLETION_STATUS_KHR/);
  assert.match(engine, /loseContext\(\)/, "the GPU context is released when no fire text is left");
  assert.match(engine, /const IDLE_RELEASE_MS = 15000;/);
  assert.match(engine, /webglcontextlost/, "a lost context falls back to static");
  assert.match(engine, /const MAX_W = 960, MAX_H = 512/, "render resolution capped at V3 'Balanced 960'");
  assert.match(light, /requestIdleCallback/, "the first context is created when the page is idle, never before the Wall's first paint");
  assert.match(light, /canvas\.hidden = true;/, "no layout shift: the canvas joins the layout only once placed");
});

test("fallback styling: live hides the painted letters but keeps the text for assistive technology; static is a readable fire gradient", () => {
  const css = read("dist/wall-kit/wall-kit.css");
  assert.match(css, /\.wall-el\.is-fire-live > \.wall-text \{ color: transparent !important;/);
  assert.match(css, /\.wall-el\.is-fire-static > \.wall-fire \{ visibility: hidden; \}/);
  assert.match(css, /\.wall-el\.is-fire-static > \.wall-text \{[^}]*linear-gradient\(0deg, #b3260a, #ff7a1a 48%, #ffd36b\)/);
  assert.match(css, /\.wall-el\.has-fire > \.wall-fire \{ position: absolute; max-width: none; pointer-events: none; \}/, "the canvas never takes a tap");
  assert.match(light, /canvas\.setAttribute\("aria-hidden", "true"\);/);
});

test("migration 20261019100000: additive - one revoked helper and the text validator with exactly one new line; nothing else", () => {
  const sql = read("supabase/migrations/20261019100000_wall_text_living_fire.sql");
  const code = sql.replace(/--.*$/gm, "");
  assert.deepEqual([...code.matchAll(/create or replace function (private\.\w+)\(/g)].map(match => match[1]), ["private.wall_fire_ok", "private.wall_text_payload_errors"]);
  assert.match(code, /revoke all on function private\.wall_fire_ok\(jsonb\) from public, anon, authenticated;/);
  assert.doesNotMatch(code, /\b(drop|truncate|alter table|insert into|update public|delete from|grant)\b/i);
  for (const fragment of ["('organic', 'cinematic', 'mythic')", "('natural', 'crimson', 'blue')", "('full', 'letters')", "wall_in_range(v -> 'intensity', 0.2, 1.4)", "wall_in_range(v -> 'speed', 0.15, 2)", "wall_in_range(v -> 'turbulence', 0.15, 1.5)", "jsonb_object_keys(v)) = 7"]) assert.ok(code.includes(fragment), fragment);
  const body = text => text.slice(text.indexOf("create or replace function private.wall_text_payload_errors"), text.indexOf("$$;", text.indexOf("create or replace function private.wall_text_payload_errors")) + 3);
  const previous = read("supabase/migrations/20260930160000_wall_video_layers_other_link.sql");
  assert.equal(body(sql).replace("  if private.wall_is_set(p -> 'fire') and not private.wall_fire_ok(p -> 'fire') then errs := array_append(errs, 'INVALID_FIRE'); end if;\n", ""), body(previous));
});

test("editor: Living Fire controls live in its own LIVING FIRE EFFECTS section (Pro Effects, 2026-10-25) on desktop and the Mobile V2 phone panel; the 600-899px panel is unchanged", () => {
  const controls = read("dist/wall-editor/controls.js");
  assert.match(controls, /else if \(effect\.key === "living-fire"\) livingFireControls\(root\);/, "the effect section of a Living Fire text");
  assert.match(controls, /textControls\(sections\.content, \{ effectsRoot: sections\.effects, proEffects: true \}\);/, "desktop: no fire controls in the general sections");
  assert.match(controls, /if \(types\.length === 1 && types\[0\] === "text"\) textControls\(body\);/, "the 600-899px panel is unchanged");
  for (const label of ['"Style"', '"Intensity %"', '"Speed ×"', '"Turbulence %"', '"Colour"', '"Flames"', '"Sparks"']) assert.ok(controls.includes(`label: ${label}`) || controls.includes(`(${label}`), label);
  assert.match(controls, /set: style => effectSetter\("fire", defaults\)\(\{ style, \.\.\.FIRE_STYLE_DEFAULTS\[style\] \}\)/, "a style starts from its own V3 tuning");
  assert.match(read("dist/wall-kit/messages.js"), /INVALID_FIRE: "/);
});

// ---- bounding box fix (2026-10-19): the fire's letters are laid out like the painted text, so they sit in the text's own box ----------------------------------
test("bounding box: the fire lines are the painted text's lines - wrapped at the box width, own line breaks kept, a word wider than the box broken anywhere", async () => {
  const { breakLines } = await import("../dist/wall-kit/living-fire-engine.js");
  const c = { measureText: text => ({ width: Array.from(text).length * 10 }) };   // 10 units per character
  assert.deepEqual(breakLines(c, "GAME ON STARTS", 75), ["GAME ON", "STARTS"], "wrap on: word by word at the box width");
  assert.deepEqual(breakLines(c, "GAME ON STARTS", 140), ["GAME ON STARTS"], "fits: one line, exactly as before");
  assert.deepEqual(breakLines(c, "GAME ON STARTS", Infinity), ["GAME ON STARTS"], "wrap off: no automatic breaks");
  assert.deepEqual(breakLines(c, "FIRE\nAND ICE", Infinity), ["FIRE", "AND ICE"], "the text's own line breaks always count");
  assert.deepEqual(breakLines(c, "SUPERCALIFRAGILISTIC", 80), ["SUPERCAL", "IFRAGILI", "STIC"], "overflow-wrap: anywhere, like the painted text");
  assert.deepEqual(breakLines(c, "A  B", 25), ["A", "B"], "spaces at a break hang, they do not take width");
  assert.deepEqual(breakLines(c, "ONE\n\nTWO", Infinity), ["ONE", "", "TWO"], "an empty line keeps its line height");
});

test("bounding box: the frame is pinned to the text box by the box's own corner, with the text's line height, alignment and wrap in the field key", () => {
  assert.match(light, /const left = -field\.boxLeft \* f, top = -field\.boxTop \* f;/, "the box's top-left corner in the V3 frame = the element's");
  assert.match(light, /const spec = \{ text: lines, wrap: content\.wrap === true, boxEm, lineHeight: content\.lineHeight, align: content\.align,/);
  assert.match(light, /const key = JSON\.stringify\(\[spec\.text, spec\.wrap \? boxEm : 0, spec\.lineHeight, spec\.align,/, "a different wrap width or layout is a different field");
  assert.match(engine, /const lines = breakLines\(c, spec\.text, spec\.wrap \? spec\.boxEm \* spec\.size : Infinity\);/);
  assert.match(engine, /const baselines = lines\.map\(\(_, i\) => i \* lineBox \+ \(lineBox - ascentFont - descentFont\) \/ 2 \+ ascentFont\);/, "CSS line boxes: half-leading, then the font ascent");
  assert.match(engine, /w > boxWidth \? \(spec\.rtl \? boxWidth - w : 0\)/, "an overflowing line starts at the start edge, as CSS does");
  assert.match(engine, /const boxTop = \(DESIGN_H - \(laid\.bottom - laid\.top\)\) \* 0\.58 - laid\.top;/, "V3's 58% placement rule, applied to the whole block");
  assert.match(engine, /\(DESIGN_W - 200\) \/ widest/, "lines fitted to 1000 design units, as V3 fits its one line");
  // an editor resize that changes the field keeps the element's last field on screen until the new one is ready (no flash to static)
  assert.match(engine, /const interim = lastReady\.get\(entry\.id\);/);
  assert.match(engine, /if \(entry\.interim\) \{ releaseField\(entry\.interim\); entry\.interim = null; \}/);
});