// GAME ID WALL - W1 FOUNDATION. Tests the real modules directly (dist/wall/*.js) - nothing here is a reimplementation. Covers the Wall Document
// schema/versioning, element/stage validation, the deterministic static renderer, and the universal element-type and embed-provider extension points
// (proving a brand-new type/provider can be registered from a TEST, with zero changes to any dist/wall/*.js file, and the same validate/render pipeline
// handles it). Also proves the Wall core carries no dependency on any specific external provider.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { CURRENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS, CANONICAL_CANVAS, createDocument, createStage, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { renderDocument, computeScale } from "../dist/wall/render.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { providerRegistry } from "../dist/wall/providers.js";
import { createRegistry } from "../dist/wall/registry.js";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const wallDir = new URL("../dist/wall/", import.meta.url);
const wallFiles = readdirSync(wallDir).filter(name => name.endsWith(".js"));
const wallSource = wallFiles.map(name => read(`dist/wall/${name}`)).join("\n");

const rectEl = (id, overrides = {}) => createElement({ id, type: "rect", x: 0, y: 0, width: 100, height: 100, z: 0, payload: { fill: "#ff00ff" }, ...overrides });

// ------------------------------------------------------------------------------------------------------------------------------ schema version
test("createDocument produces an already-valid document with the current schema version and the canonical canvas", () => {
  const doc = createDocument();
  assert.equal(doc.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(doc.canvas, CANONICAL_CANVAS);
  assert.equal(doc.stages.length, 1);
  assert.deepEqual(validateDocument(doc), { valid: true, errors: [] });
});
test("supported schema version passes; an unsupported one is rejected outright, before anything else is inspected", () => {
  const doc = createDocument();
  assert.equal(validateDocument(doc).valid, true);
  const futureVersion = { ...doc, schemaVersion: 999 };
  assert.deepEqual(validateDocument(futureVersion), { valid: false, errors: ["UNSUPPORTED_SCHEMA_VERSION"] });
  const missingVersion = { ...doc }; delete missingVersion.schemaVersion;
  assert.equal(validateDocument(missingVersion).valid, false);
});
test("SUPPORTED_SCHEMA_VERSIONS includes the current version (a document created today is never immediately unsupported)", () => {
  assert.ok(SUPPORTED_SCHEMA_VERSIONS.includes(CURRENT_SCHEMA_VERSION));
});

// ------------------------------------------------------------------------------------------------------------------------------ malformed documents (never throws)
test("malformed documents are rejected safely - never throws, always returns { valid: false, errors }", () => {
  for (const bad of [null, undefined, "a string", 42, [], {}, { schemaVersion: 1 }, { schemaVersion: 1, canvas: {} }, { schemaVersion: 1, canvas: CANONICAL_CANVAS, stages: "not-an-array" }]) {
    assert.doesNotThrow(() => validateDocument(bad), JSON.stringify(bad));
    const result = validateDocument(bad);
    assert.equal(result.valid, false, JSON.stringify(bad));
    assert.ok(Array.isArray(result.errors) && result.errors.length > 0, JSON.stringify(bad));
  }
});
test("a document must have at least one stage; zero stages is rejected", () => {
  const doc = createDocument();
  assert.equal(validateDocument({ ...doc, stages: [] }).valid, false);
});
test("there is NO architectural maximum on stage count: a document with many more stages than W0's own 3-stage editor UX is still valid", () => {
  const many = { ...createDocument(), stages: Array.from({ length: 25 }, (_, i) => createStage(`s${i}`)) };
  assert.deepEqual(validateDocument(many), { valid: true, errors: [] });
  const rendered = renderDocument(many, { viewportWidth: 500 });
  assert.equal(rendered.ok, true);
  assert.equal(rendered.stages.length, 25);
});
test("createDocument accepts a stageCount beyond W0's 3-stage default without being silently clamped", () => {
  const doc = createDocument({ stageCount: 7 });
  assert.equal(doc.stages.length, 7);
  assert.equal(validateDocument(doc).valid, true);
});

// ------------------------------------------------------------------------------------------------------------------------------ stable element identity / duplicate IDs
test("stable element identity: an element keeps its id through validation and rendering untouched", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(rectEl("el_stable"));
  assert.equal(validateDocument(doc).valid, true);
  const rendered = renderDocument(doc, { viewportWidth: 500 });
  assert.equal(rendered.stages[0].elements[0].id, "el_stable");
});
test("duplicate element IDs (even across different stages) invalidate the document", () => {
  const doc = createDocument({ stageCount: 2 });
  doc.stages[0].elements.push(rectEl("dup"));
  doc.stages[1].elements.push(rectEl("dup"));
  const result = validateDocument(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("DUPLICATE_ELEMENT_ID:dup"));
});
test("a missing or empty element id is rejected", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(rectEl(""));
  assert.equal(validateDocument(doc).valid, false);
});

// ------------------------------------------------------------------------------------------------------------------------------ canonical coordinates / dimensions
test("canonical coordinates: elements are stored and validated in design-space UNITS, not device pixels - CANONICAL_CANVAS is unit-based (1000x1778)", () => {
  assert.equal(CANONICAL_CANVAS.width, 1000);
  assert.equal(CANONICAL_CANVAS.height, 1778);
});
test("valid dimensions and positions pass; a box that exactly fills the canvas is valid (inclusive boundary)", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(rectEl("full", { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height }));
  assert.equal(validateDocument(doc).valid, true);
});
test("invalid dimensions (zero, negative, NaN, non-finite) are rejected", () => {
  for (const [width, height] of [[0, 100], [100, 0], [-10, 100], [100, -10], [NaN, 100], [100, Infinity]]) {
    const doc = createDocument();
    doc.stages[0].elements.push(rectEl("bad_dims", { width, height }));
    const result = validateDocument(doc);
    assert.equal(result.valid, false, `${width}x${height}`);
    assert.ok(result.errors.includes("INVALID_DIMENSIONS:bad_dims"), `${width}x${height}`);
  }
});
test("invalid positions/coordinates (NaN, negative, out of the canvas) are rejected", () => {
  const doc1 = createDocument();
  doc1.stages[0].elements.push(rectEl("bad_pos", { x: NaN, y: 0 }));
  assert.ok(validateDocument(doc1).errors.includes("INVALID_POSITION:bad_pos"));

  const doc2 = createDocument();
  doc2.stages[0].elements.push(rectEl("negative", { x: -5, y: 0 }));
  assert.ok(validateDocument(doc2).errors.includes("OUTSIDE_CANVAS:negative"));

  const doc3 = createDocument();
  doc3.stages[0].elements.push(rectEl("overflow", { x: 950, y: 0, width: 100, height: 100 }));   // 950 + 100 > 1000
  assert.ok(validateDocument(doc3).errors.includes("OUTSIDE_CANVAS:overflow"));
});

// ------------------------------------------------------------------------------------------------------------------------------ z-order / layer / deterministic ordering
test("z-order controls paint order within a stage: lower z renders first (bottom), higher z last (top)", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(rectEl("top", { z: 5 }), rectEl("bottom", { z: 1 }), rectEl("middle", { z: 3 }));
  const rendered = renderDocument(doc, { viewportWidth: 1000 });
  assert.deepEqual(rendered.stages[0].elements.map(e => e.id), ["bottom", "middle", "top"]);
});
test("a non-finite z-order is rejected", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(rectEl("bad_z", { z: NaN }));
  assert.ok(validateDocument(doc).errors.includes("INVALID_Z_ORDER:bad_z"));
});
test("deterministic ordering: elements sharing the same z are ordered by id, not by array/insertion position", () => {
  const docA = createDocument();
  docA.stages[0].elements.push(rectEl("b", { z: 1 }), rectEl("a", { z: 1 }));
  const docB = createDocument();
  docB.stages[0].elements.push(rectEl("a", { z: 1 }), rectEl("b", { z: 1 }));   // same elements, inserted in the OPPOSITE order
  const renderedA = renderDocument(docA, { viewportWidth: 500 });
  const renderedB = renderDocument(docB, { viewportWidth: 500 });
  assert.deepEqual(renderedA.stages[0].elements.map(e => e.id), ["a", "b"]);
  assert.deepEqual(renderedB.stages[0].elements.map(e => e.id), ["a", "b"], "insertion order must not matter - only z, then id, decide paint order");
});

// ------------------------------------------------------------------------------------------------------------------------------ unknown types / malformed payloads
test("an unknown element type is rejected - safe handling of an unsupported type, never a crash, never a guess at rendering it", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(createElement({ id: "mystery", type: "not_a_real_type", x: 0, y: 0, width: 10, height: 10, payload: {} }));
  const result = validateDocument(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("UNKNOWN_ELEMENT_TYPE:mystery"));
});
test("malformed element payloads are rejected per-type: a rect with a non-hex fill, or a non-object payload", () => {
  const doc1 = createDocument();
  doc1.stages[0].elements.push(rectEl("bad_fill", { payload: { fill: "not-a-color" } }));
  assert.ok(validateDocument(doc1).errors.includes("INVALID_FILL:bad_fill"));

  const doc2 = createDocument();
  doc2.stages[0].elements.push(rectEl("bad_payload", { payload: "a string, not an object" }));
  assert.ok(validateDocument(doc2).errors.includes("PAYLOAD_NOT_OBJECT:bad_payload"));
});
test("a malformed element (not an object at all) in a stage's elements array is rejected without throwing", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(null, "garbage", 42);
  assert.doesNotThrow(() => validateDocument(doc));
  assert.equal(validateDocument(doc).valid, false);
});

// ------------------------------------------------------------------------------------------------------------------------------ deterministic rendering / responsive scaling
test("renderDocument refuses to render an invalid document instead of guessing at partial output", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(rectEl("bad", { width: -1 }));
  const result = renderDocument(doc, { viewportWidth: 500 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});
test("renderDocument refuses an invalid viewport width", () => {
  const doc = createDocument();
  for (const bad of [0, -100, NaN, Infinity, undefined]) {
    const result = renderDocument(doc, { viewportWidth: bad });
    assert.equal(result.ok, false, String(bad));
  }
});
test("responsive scaling: the same document renders proportionally at different viewport widths, preserving composition", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(rectEl("box", { x: 100, y: 200, width: 300, height: 150 }));
  const narrow = renderDocument(doc, { viewportWidth: 360 });
  const wide = renderDocument(doc, { viewportWidth: 1080 });
  assert.equal(computeScale(doc.canvas, 360), 0.36);
  assert.equal(computeScale(doc.canvas, 1080), 1.08);
  const nBox = narrow.stages[0].elements[0], wBox = wide.stages[0].elements[0];
  assert.equal(wBox.x / nBox.x, 3);
  assert.equal(wBox.width / nBox.width, 3);
  assert.equal(narrow.stages[0].width, 360);
  assert.equal(wide.stages[0].width, 1080);
});
test("repeated rendering of the same document produces equivalent output (pure function, no hidden state)", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(rectEl("a", { z: 2 }), rectEl("b", { z: 1 }));
  const first = renderDocument(doc, { viewportWidth: 500 });
  const second = renderDocument(doc, { viewportWidth: 500 });
  assert.deepEqual(first, second);
});
test("rendering does not mutate the source document", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(rectEl("a"));
  const before = JSON.stringify(doc);
  renderDocument(doc, { viewportWidth: 500 });
  assert.equal(JSON.stringify(doc), before);
});

// ------------------------------------------------------------------------------------------------------------------------------ generic embed contract
test("a well-formed embed referencing a registered provider validates and renders through the SAME pipeline as any other element", () => {
  providerRegistry.register("w1_test_provider", {
    validatePayload: data => (typeof data.ref === "string" && data.ref ? [] : ["MISSING_REF"]),
    render: data => ({ ref: data.ref }),
  });
  try {
    const doc = createDocument();
    doc.stages[0].elements.push(createElement({ id: "e1", type: "embed", x: 0, y: 0, width: 200, height: 200, payload: { providerKey: "w1_test_provider", data: { ref: "abc123" } } }));
    assert.deepEqual(validateDocument(doc), { valid: true, errors: [] });
    const rendered = renderDocument(doc, { viewportWidth: 1000 });
    assert.equal(rendered.ok, true);
    assert.deepEqual(rendered.stages[0].elements[0].content, { kind: "embed", providerKey: "w1_test_provider", content: { ref: "abc123" } });
  } finally {
    providerRegistry.unregister("w1_test_provider");
  }
});
test("invalid provider keys are rejected: missing, empty, non-string, or simply not currently registered", () => {
  const base = { x: 0, y: 0, width: 200, height: 200 };
  for (const providerKey of [undefined, "", 42, "definitely_not_registered_anywhere"]) {
    const doc = createDocument();
    doc.stages[0].elements.push(createElement({ id: "e1", type: "embed", ...base, payload: { providerKey, data: {} } }));
    const result = validateDocument(doc);
    assert.equal(result.valid, false, String(providerKey));
  }
});
test("malformed generic embed payloads are rejected: non-object payload, non-object data, and the provider's own validation errors surface", () => {
  providerRegistry.register("w1_test_provider2", { validatePayload: data => (data.ok ? [] : ["NOT_OK"]) });
  try {
    const doc1 = createDocument();
    doc1.stages[0].elements.push(createElement({ id: "e1", type: "embed", x: 0, y: 0, width: 10, height: 10, payload: "not-an-object" }));
    assert.ok(validateDocument(doc1).errors.includes("PAYLOAD_NOT_OBJECT:e1"));

    const doc2 = createDocument();
    doc2.stages[0].elements.push(createElement({ id: "e1", type: "embed", x: 0, y: 0, width: 10, height: 10, payload: { providerKey: "w1_test_provider2", data: "not-an-object" } }));
    assert.ok(validateDocument(doc2).errors.includes("PROVIDER_DATA_NOT_OBJECT:e1"));

    const doc3 = createDocument();
    doc3.stages[0].elements.push(createElement({ id: "e1", type: "embed", x: 0, y: 0, width: 10, height: 10, payload: { providerKey: "w1_test_provider2", data: { ok: false } } }));
    assert.ok(validateDocument(doc3).errors.includes("PROVIDER:NOT_OK:e1"), "the provider's own validation error surfaces, prefixed so it's traceable to the adapter, not the Wall core");
  } finally {
    providerRegistry.unregister("w1_test_provider2");
  }
});

// ------------------------------------------------------------------------------------------------------------------------------ security: never allow raw HTML/JS/iframe content in ANY payload
test("rejection of arbitrary/raw HTML in an element payload, of ANY type - a Wall-core guarantee, not a per-type one", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(rectEl("evil", { payload: { fill: "#ffffff", extra: "<div>hello</div>" } }));
  assert.ok(validateDocument(doc).errors.some(e => e.startsWith("UNSAFE_PAYLOAD_CONTENT")));
});
test("rejection of JavaScript/script content and javascript: URIs, however deeply nested in the payload", () => {
  const script = createDocument();
  script.stages[0].elements.push(rectEl("s1", { payload: { fill: "#ffffff", nested: { deeper: "<script>alert(1)</script>" } } }));
  assert.ok(validateDocument(script).errors.some(e => e.startsWith("UNSAFE_PAYLOAD_CONTENT")));

  const jsUri = createDocument();
  jsUri.stages[0].elements.push(rectEl("s2", { payload: { fill: "#ffffff", link: "javascript:alert(1)" } }));
  assert.ok(validateDocument(jsUri).errors.some(e => e.startsWith("UNSAFE_PAYLOAD_CONTENT")));

  const handler = createDocument();
  handler.stages[0].elements.push(rectEl("s3", { payload: { fill: "#ffffff", attr: 'onclick="doEvil()"' } }));
  assert.ok(validateDocument(handler).errors.some(e => e.startsWith("UNSAFE_PAYLOAD_CONTENT")));
});
test("rejection of raw iframe markup, including inside an embed element's provider data", () => {
  providerRegistry.register("w1_test_provider3", { validatePayload: () => [] });
  try {
    const doc = createDocument();
    doc.stages[0].elements.push(createElement({
      id: "e1", type: "embed", x: 0, y: 0, width: 10, height: 10,
      payload: { providerKey: "w1_test_provider3", data: { raw: '<iframe src="https://evil.example"></iframe>' } },
    }));
    assert.ok(validateDocument(doc).errors.some(e => e.startsWith("UNSAFE_PAYLOAD_CONTENT")));
  } finally {
    providerRegistry.unregister("w1_test_provider3");
  }
});
test("plain text values that merely CONTAIN angle brackets as ordinary punctuation, not tag-shaped markup, are not falsely rejected", () => {
  const doc = createDocument();
  doc.stages[0].elements.push(rectEl("ok", { payload: { fill: "#ffffff", note: "2 < 3 and 5 > 4" } }));
  assert.equal(validateDocument(doc).valid, true);
});

// ------------------------------------------------------------------------------------------------------------------------------ the universal extension point: a BRAND NEW type/provider, registered from the test, with zero core changes
test("a completely new element type can be registered from outside dist/wall/ and the SAME validate/render pipeline handles it immediately", () => {
  elementRegistry.register("w1_test_future_type", {
    validatePayload: payload => (payload && payload.value > 0 ? [] : ["INVALID_VALUE"]),
    render: payload => ({ kind: "future", doubled: payload.value * 2 }),
  });
  try {
    const doc = createDocument();
    doc.stages[0].elements.push(createElement({ id: "future1", type: "w1_test_future_type", x: 0, y: 0, width: 50, height: 50, payload: { value: 21 } }));
    assert.deepEqual(validateDocument(doc), { valid: true, errors: [] });
    const rendered = renderDocument(doc, { viewportWidth: 1000 });
    assert.deepEqual(rendered.stages[0].elements[0].content, { kind: "future", doubled: 42 });

    const invalidPayload = createDocument();
    invalidPayload.stages[0].elements.push(createElement({ id: "future2", type: "w1_test_future_type", x: 0, y: 0, width: 50, height: 50, payload: { value: -1 } }));
    assert.ok(validateDocument(invalidPayload).errors.includes("INVALID_VALUE:future2"));
  } finally {
    elementRegistry.unregister("w1_test_future_type");
  }
});
test("a completely new embed provider can be registered from outside dist/wall/, with no change to the embed element type itself", () => {
  providerRegistry.register("w1_totally_new_provider", {
    validatePayload: data => (typeof data.token === "string" ? [] : ["MISSING_TOKEN"]),
    render: data => ({ token: data.token, safe: true }),
  });
  try {
    const doc = createDocument();
    doc.stages[0].elements.push(createElement({ id: "e1", type: "embed", x: 0, y: 0, width: 300, height: 300, payload: { providerKey: "w1_totally_new_provider", data: { token: "xyz" } } }));
    assert.equal(validateDocument(doc).valid, true);
    const rendered = renderDocument(doc, { viewportWidth: 1000 });
    assert.deepEqual(rendered.stages[0].elements[0].content.content, { token: "xyz", safe: true });
  } finally {
    providerRegistry.unregister("w1_totally_new_provider");
  }
});

// ------------------------------------------------------------------------------------------------------------------------------ typography extensibility proof
// Proves a future, Canva/Word-style Text element - font family/size/weight, bold/italic, color, alignment, RTL, line height, letter spacing, visual
// effects (outline/shadow/glow/gradient), and a reference to a future custom/user-uploaded font - can be registered exactly like any other element type,
// with NO change to schema.js, registry.js, providers.js, elements.js, validate.js, or render.js. Nothing here builds the typography editor or font
// upload; it only proves the element-registry contract (payload is an opaque, type-owned object) already carries this without a core redesign.
test("typography extensibility: a realistic future 'text' element type - rich typography payload, RTL, effects, a custom-font reference - plugs into the SAME unchanged pipeline", () => {
  elementRegistry.register("w1_test_future_text", {
    // A representative slice of real typography validation - bounds/enums are entirely this (future) type's own business, never the Wall core's.
    validatePayload(payload) {
      const errors = [];
      if (!payload || typeof payload !== "object") return ["PAYLOAD_NOT_OBJECT"];
      if (typeof payload.text !== "string") errors.push("INVALID_TEXT");
      if (!Number.isFinite(payload.fontSize) || payload.fontSize < 8 || payload.fontSize > 500) errors.push("INVALID_FONT_SIZE");
      if (!Number.isFinite(payload.fontWeight) || payload.fontWeight < 100 || payload.fontWeight > 900) errors.push("INVALID_FONT_WEIGHT");
      if (!["ltr", "rtl"].includes(payload.direction)) errors.push("INVALID_DIRECTION");
      if (!/^#[0-9a-fA-F]{6}$/.test(payload.color)) errors.push("INVALID_COLOR");
      return errors;
    },
    render(payload) { return { kind: "text", text: payload.text, direction: payload.direction, fontRef: payload.fontRef }; },
  });
  try {
    const doc = createDocument();
    doc.stages[0].elements.push(createElement({
      id: "headline", type: "w1_test_future_text", x: 40, y: 60, width: 900, height: 260, z: 4,
      payload: {
        text: "مرحبا Hello GamID",
        direction: "rtl",                          // Arabic / RTL
        fontFamily: "Custom Display",
        fontRef: "fonts/user_42/custom-display.woff2",   // an opaque REFERENCE, never raw font bytes/CSS in the document itself
        fontSize: 96,
        fontWeight: 700,                            // bold, expressed as weight
        italic: true,
        color: "#ffffff",
        align: "center",
        lineHeight: 1.2,
        letterSpacing: 0.5,
        effects: {
          outline: { color: "#000000", width: 3 },
          shadow: { color: "#000000", x: 2, y: 2, blur: 6 },
          glow: { color: "#62e7ff", radius: 24 },
          gradient: { from: "#62e7ff", to: "#ff2fd0", angle: 90 },
        },
      },
    }));
    const result = validateDocument(doc);
    assert.deepEqual(result, { valid: true, errors: [] });
    const rendered = renderDocument(doc, { viewportWidth: 1000 });
    assert.equal(rendered.ok, true);
    assert.deepEqual(rendered.stages[0].elements[0].content, { kind: "text", text: "مرحبا Hello GamID", direction: "rtl", fontRef: "fonts/user_42/custom-display.woff2" });
  } finally {
    elementRegistry.unregister("w1_test_future_text");
  }
});
test("typography extensibility: the future text type's OWN bounds (font size/weight/direction/color) are enforced by ITS validator, not the Wall core", () => {
  elementRegistry.register("w1_test_future_text2", {
    validatePayload: payload => (Number.isFinite(payload.fontSize) && payload.fontSize >= 8 && payload.fontSize <= 500 ? [] : ["INVALID_FONT_SIZE"]),
  });
  try {
    const doc = createDocument();
    doc.stages[0].elements.push(createElement({ id: "bad_text", type: "w1_test_future_text2", x: 0, y: 0, width: 100, height: 100, payload: { fontSize: 5000 } }));
    assert.ok(validateDocument(doc).errors.includes("INVALID_FONT_SIZE:bad_text"));
  } finally {
    elementRegistry.unregister("w1_test_future_text2");
  }
});
test("typography extensibility: a custom-font reference is just an opaque string field - resolving it to real font data is a future, type-owned concern, not a Wall-core one", () => {
  // The Wall core has no concept of "font": it never inspects fontRef, never fetches it, never renders it. It is exactly as opaque to the core as an
  // embed's provider `data` is - proving the SAME "opaque, type/provider-owned payload" principle covers both extension points asked about in this review.
  assert.doesNotMatch(wallSource, /\bfont\b/i);
});

// ------------------------------------------------------------------------------------------------------------------------------ the generic registry primitive itself
test("createRegistry: register/get/has/unregister/keys behave as a plain named-capability map; an empty/invalid key is rejected", () => {
  const registry = createRegistry();
  assert.equal(registry.has("x"), false);
  registry.register("x", { a: 1 });
  assert.equal(registry.has("x"), true);
  assert.deepEqual(registry.get("x"), { a: 1 });
  assert.deepEqual(registry.keys(), ["x"]);
  registry.unregister("x");
  assert.equal(registry.has("x"), false);
  assert.equal(registry.get("x"), null);
  assert.throws(() => registry.register("", {}));
  assert.throws(() => registry.register(null, {}));
});

// ------------------------------------------------------------------------------------------------------------------------------ no provider-specific dependency in the Wall core
test("source-level guarantee: no Wall-core file names any specific external provider - the core only knows about registered capabilities", () => {
  assert.doesNotMatch(wallSource, /youtube|spotify|twitch|\bkick\b|tiktok|vimeo|soundcloud/i);
});
test("source-level guarantee: the built-in element types are registered generically (through the registry), not special-cased with if/else type branching in validate.js or render.js", () => {
  const validateSource = read("dist/wall/validate.js");
  const renderSource = read("dist/wall/render.js");
  for (const source of [validateSource, renderSource]) {
    assert.doesNotMatch(source, /type\s*===\s*["']rect["']/);
    assert.doesNotMatch(source, /type\s*===\s*["']embed["']/);
  }
});

// ------------------------------------------------------------------------------------------------------------------------------ isolation: nothing in the real product references the still-unlaunched Wall foundation
test("isolation: no real product page/script references dist/wall/ (no live route exists yet - foundation only)", () => {
  for (const path of ["dist/index.html", "dist/public/public.js", "dist/account/account.js"]) {
    assert.doesNotMatch(read(path), /dist\/wall|\bwall\.js\b/i, path);
  }
});
