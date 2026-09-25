// W3 - the Wall Document model the editor edits: the real text type, the richer shape, and the two optional generic element properties (rotation, groupId).
// Everything here is a COMPATIBLE extension of W1 (schemaVersion is unchanged); the W1 suite (game-id-wall-w1.test.js) still passes unmodified.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../dist/wall/validate.js";
import { renderDocument } from "../dist/wall/render.js";
import { createDocument, createElement, CURRENT_SCHEMA_VERSION } from "../dist/wall/schema.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { createTextPayload, validateTextPayload, renderTextPayload, scaleTextPayload, TEXT_LIMITS, WEIGHTS } from "../dist/wall-kit/text.js";
import { FONT_CATALOG, fontCss, fontKnown, FALLBACK_FONT_CSS, FONT_KEY } from "../dist/wall-kit/fonts.js";

const doc = (...elements) => { const d = createDocument(); d.stages[0].elements = elements; return d; };
const text = (over = {}, id = "t1") => createElement({ id, type: "text", x: 10, y: 10, width: 600, height: 150, z: 0, payload: createTextPayload(over) });
const rect = (payload = { fill: "#112233" }, id = "r1") => createElement({ id, type: "rect", x: 10, y: 10, width: 100, height: 100, z: 0, payload });
const errorsOf = d => validateDocument(d).errors;

// ---------- compatibility ----------
test("compat: schemaVersion stays 1 and a plain W1 element is byte-identical (no rotation/groupId keys are added)", () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 1);
  const plain = createElement({ id: "a", type: "rect", x: 1, y: 2, width: 3, height: 4, payload: { fill: "#000000" } });
  assert.deepEqual(Object.keys(plain).sort(), ["height", "id", "payload", "type", "width", "x", "y", "z"]);
  assert.equal(validateDocument(doc(plain)).valid, true);
});
test("compat: a W1 document renders exactly as before - optional properties are absent from the render tree", () => {
  const tree = renderDocument(doc(rect()), { viewportWidth: 500 });
  assert.deepEqual(tree.stages[0].elements[0].content, { kind: "rect", fill: "#112233" });
  assert.equal("rotation" in tree.stages[0].elements[0], false);
  assert.equal("groupId" in tree.stages[0].elements[0], false);
});
test("compat: the registry now knows rect, embed and text - and the core still has zero embed providers", () => {
  assert.deepEqual(elementRegistry.keys().sort(), ["embed", "rect", "text"]);
  assert.equal(errorsOf(doc(createElement({ id: "e", type: "embed", x: 0, y: 0, width: 10, height: 10, payload: { providerKey: "x", data: {} } })))[0], "UNSUPPORTED_PROVIDER:e");
});

// ---------- text ----------
test("text: a default text payload is valid and renders through the unchanged pipeline", () => {
  assert.equal(validateTextPayload(createTextPayload()).length, 0);
  const tree = renderDocument(doc(text()), { viewportWidth: 500 });
  assert.equal(tree.ok, true);
  assert.deepEqual(tree.stages[0].elements[0].content, renderTextPayload(createTextPayload()));
  assert.equal(tree.stages[0].elements[0].content.kind, "text");
});
test("text: every supported typography field validates at its bounds and is rejected outside them", () => {
  const ok = over => validateTextPayload(createTextPayload(over)).length === 0;
  assert.ok(ok({ text: "Hello" }) && ok({ text: "" }) && !ok({ text: "x".repeat(2001) }) && ok({ text: "x".repeat(2000) }));
  assert.ok(ok({ fontFamily: "bebas-neue" }) && !ok({ fontFamily: "Bad Family" }) && !ok({ fontFamily: "" }));
  assert.ok(ok({ fontSize: 4 }) && ok({ fontSize: 600 }) && !ok({ fontSize: 3 }) && !ok({ fontSize: 601 }) && !ok({ fontSize: NaN }));
  for (const weight of WEIGHTS) assert.ok(ok({ fontWeight: weight }));
  assert.ok(!ok({ fontWeight: 450 }) && !ok({ fontWeight: 0 }) && !ok({ fontWeight: 1000 }) && !ok({ fontWeight: "700" }));
  assert.ok(ok({ italic: true }) && !ok({ italic: "true" }) && ok({ underline: true }) && !ok({ underline: 1 }));
  assert.ok(ok({ color: "#AbCdEf" }) && !ok({ color: "#abc" }) && !ok({ color: "red" }));
  for (const align of ["left", "center", "right"]) assert.ok(ok({ align }));
  assert.ok(!ok({ align: "justify" }));
  for (const direction of ["ltr", "rtl", "auto"]) assert.ok(ok({ direction }));
  assert.ok(!ok({ direction: "vertical" }));
  assert.ok(ok({ lineHeight: 0.5 }) && ok({ lineHeight: 4 }) && !ok({ lineHeight: 0.4 }) && !ok({ lineHeight: 4.1 }));
  assert.ok(ok({ letterSpacing: -20 }) && ok({ letterSpacing: 100 }) && !ok({ letterSpacing: -21 }) && !ok({ letterSpacing: 101 }));
  assert.ok(ok({ opacity: 0 }) && ok({ opacity: 1 }) && !ok({ opacity: 1.1 }) && !ok({ opacity: -0.1 }));
  assert.ok(ok({ wrap: false }) && !ok({ wrap: "yes" }));
});
test("text: the effects (outline, shadow, glow, gradient) and an opaque fontRef are optional and validated", () => {
  const ok = over => validateTextPayload(createTextPayload(over)).length === 0;
  assert.ok(ok({ stroke: { color: "#000000", width: 4 } }) && !ok({ stroke: { color: "#000000", width: 51 } }) && !ok({ stroke: "#000000" }));
  assert.ok(ok({ shadow: { color: "#000000", blur: 8, x: 4, y: -4 } }) && !ok({ shadow: { color: "#000000", blur: 8, x: 101, y: 0 } }));
  assert.ok(ok({ glow: { color: "#62e7ff", blur: 16 } }) && !ok({ glow: { color: "cyan", blur: 16 } }));
  assert.ok(ok({ gradient: { from: "#000000", to: "#ffffff", angle: 45 } }) && !ok({ gradient: { from: "#000000", to: "#ffffff", angle: 400 } }));
  assert.ok(ok({ fontRef: "fonts/user_1/a.woff2" }) && !ok({ fontRef: "" }) && !ok({ fontRef: 3 }));
  assert.ok(ok({ stroke: null, shadow: null, glow: null, gradient: null, fontRef: null }), "null means not set");
});
test("text: the architecture is ready for a future opaque fontRef - it is stored, never resolved, and never reaches the painter's font choice", () => {
  const content = renderTextPayload(createTextPayload({ fontRef: "fonts/user_1/a.woff2", fontFamily: "orbitron" }));
  assert.equal(content.fontRef, "fonts/user_1/a.woff2");
  assert.equal(fontCss("fonts/user_1/a.woff2"), FALLBACK_FONT_CSS);
});
test("text: unknown payload keys never reach a painter", () => {
  const content = renderTextPayload({ ...createTextPayload(), evil: "<script>", __proto__x: 1 });
  assert.equal("evil" in content, false);
});
test("text: unsafe content is rejected - script, iframe, markup, javascript: and event handlers, in the text and anywhere else in the payload", () => {
  for (const bad of ["<script>alert(1)</script>", "<iframe src=x>", "hello <b>world</b>", "javascript:alert(1)", "x onclick=steal()", "<img src=x onerror=alert(1)>"]) {
    const codes = errorsOf(doc(text({ text: bad })));
    assert.ok(codes.includes("UNSAFE_PAYLOAD_CONTENT:t1.payload.text"), `${bad} -> ${codes}`);
  }
  assert.ok(errorsOf(doc(text({ fontRef: "<iframe>" }))).includes("UNSAFE_PAYLOAD_CONTENT:t1.payload.fontRef"));
  assert.ok(errorsOf(doc(text({ fontFamily: "javascript:x" }))).some(code => code.startsWith("UNSAFE_PAYLOAD_CONTENT:t1.payload.fontFamily")));
});
test("text: ordinary gamer text (symbols, hashtags, emoji, RTL) is accepted", () => {
  for (const good of ["GG! <3 #1 @black & friends 100%", "مرحبا GamID", "🎮 Player One 🎮", "a\nb\tc", "it's \"fine\""]) assert.equal(validateDocument(doc(text({ text: good }))).valid, true, good);
});
test("text: the length limit counts characters (code points), not UTF-16 units", () => {
  assert.equal(validateTextPayload(createTextPayload({ text: "😀".repeat(1500) })).length, 0);
  assert.deepEqual(validateTextPayload(createTextPayload({ text: "😀".repeat(2001) })), ["INVALID_TEXT"]);
});
test("text: a group resize scales its sizes and clamps them into the valid range", () => {
  const scaled = scaleTextPayload(createTextPayload({ fontSize: 100, letterSpacing: 2, stroke: { color: "#000000", width: 4 }, shadow: { color: "#000000", blur: 8, x: 4, y: 4 }, glow: { color: "#62e7ff", blur: 10 } }), 2);
  assert.equal(scaled.fontSize, 200);
  assert.equal(scaled.letterSpacing, 4);
  assert.equal(scaled.stroke.width, 8);
  assert.deepEqual([scaled.shadow.blur, scaled.shadow.x, scaled.shadow.y, scaled.glow.blur], [16, 8, 8, 20]);
  assert.equal(scaleTextPayload(createTextPayload({ fontSize: 500 }), 3).fontSize, TEXT_LIMITS.fontSize[1]);
  assert.equal(validateTextPayload(scaleTextPayload(createTextPayload({ fontSize: 500 }), 3)).length, 0);
});

// ---------- shapes ----------
test("shape: the fill-only W1 rect is still valid; the optional style fields validate at their bounds", () => {
  const ok = payload => errorsOf(doc(rect(payload))).length === 0;
  assert.ok(ok({ fill: "#112233" }));
  assert.ok(ok({ fill: "#112233", opacity: 0.5, stroke: "#ffffff", strokeWidth: 4, radius: 48, gradient: { from: "#000000", to: "#ffffff", angle: 90 } }));
  assert.ok(!ok({ fill: "#112233", opacity: 2 }) && !ok({ fill: "#112233", stroke: "white" }) && !ok({ fill: "#112233", strokeWidth: 101 }));
  assert.ok(!ok({ fill: "#112233", radius: 1001 }) && !ok({ fill: "#112233", gradient: { from: "#000000", to: "x", angle: 0 } }) && ok({ fill: "#112233", radius: 1000 }));
});
test("shape: the render tree carries only the style fields that are set", () => {
  assert.deepEqual(renderDocument(doc(rect({ fill: "#112233", radius: 20, unknown: "x" })), { viewportWidth: 500 }).stages[0].elements[0].content, { kind: "rect", fill: "#112233", radius: 20 });
});

// ---------- rotation and groups ----------
test("rotation: an optional finite number on any element type; absent/null is not set", () => {
  assert.equal(validateDocument(doc(createElement({ ...rect(), rotation: 45 }))).valid, true);
  assert.equal(validateDocument(doc(createElement({ ...rect(), rotation: -12.5 }))).valid, true);
  assert.equal(validateDocument(doc(text({}, "t1"))).valid, true);
  assert.equal(validateDocument(doc({ ...rect(), rotation: null })).valid, true);
  for (const bad of ["45", NaN, Infinity, true, {}]) assert.deepEqual(errorsOf(doc({ ...rect(), rotation: bad })), ["INVALID_ROTATION:r1"], String(bad));
});
test("rotation: reaches the render tree and does not change the deterministic order or scaling", () => {
  const tree = renderDocument(doc({ ...rect(), rotation: 30 }), { viewportWidth: 500 });
  assert.equal(tree.stages[0].elements[0].rotation, 30);
  assert.equal(tree.stages[0].elements[0].width, 50);
});
test("groups: elements of one stage sharing a groupId are valid; groupId is validated; a group never spans stages", () => {
  const member = (id, groupId, over = {}) => ({ ...rect({ fill: "#000000" }, id), groupId, ...over });
  assert.equal(validateDocument(doc(member("a", "g1"), member("b", "g1", { x: 200 }))).valid, true);
  for (const bad of ["", "has space", "<b>", "x".repeat(65), 5, true]) assert.deepEqual(errorsOf(doc(member("a", bad))), ["INVALID_GROUP_ID:a"], String(bad));
  const spanning = createDocument({ stageCount: 2 });
  spanning.stages[0].elements = [member("a", "g1")];
  spanning.stages[1].elements = [member("b", "g1")];
  assert.deepEqual(errorsOf(spanning), ["GROUP_SPANS_STAGES:g1"]);
});
test("groups: the group id reaches the render tree", () => {
  assert.equal(renderDocument(doc({ ...rect(), groupId: "g1" }), { viewportWidth: 500 }).stages[0].elements[0].groupId, "g1");
});

// ---------- fonts ----------
test("fonts: a curated built-in catalog (bundled OFL fonts + system stacks) - not a five-font demo - with unique valid keys", () => {
  assert.ok(FONT_CATALOG.length >= 10);
  assert.equal(new Set(FONT_CATALOG.map(font => font.key)).size, FONT_CATALOG.length);
  for (const font of FONT_CATALOG) { assert.match(font.key, FONT_KEY); assert.ok(font.css.length > 10 && font.label); }
  assert.ok(FONT_CATALOG.filter(font => font.bundled).length >= 5);
  assert.ok(fontKnown("orbitron") && !fontKnown("comic-sans-ms"));
  assert.equal(fontCss("does-not-exist"), FALLBACK_FONT_CSS);
});
test("fonts: nothing is loaded from a third-party host - the stylesheet only references files shipped with the site", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const css = readFileSync("dist/wall-kit/wall-kit.css", "utf8");
  const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map(match => match[1]);
  assert.ok(urls.length >= 5);
  for (const url of urls) { assert.doesNotMatch(url, /^(https?:)?\/\//); assert.ok(existsSync(`dist/wall-kit/${url}`), url); }
  assert.ok(existsSync("dist/wall-kit/fonts/LICENSES.txt"));
  assert.match(readFileSync("dist/wall-kit/fonts/LICENSES.txt", "utf8"), /SIL Open Font License/);
});
