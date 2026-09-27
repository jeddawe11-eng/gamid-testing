// Round 2 - GamID block styling: typed, validated presentation data (dist/wall-kit/gamid.js), painted as CSS custom properties (gamid-blocks.js + wall-kit.css),
// edited per block or applied to all (ops.js), mirrored by the database validator (migration 20260927120000_wall_gamid_block_style.sql).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { GAMID_STYLE_DEFAULTS, GAMID_STYLE_KEYS, validateGamidStyle, resolveGamidStyle } from "../dist/wall-kit/gamid.js";
import { paintGamidBlock, gamidStyleVars, rgba, onColor } from "../dist/wall-kit/gamid-blocks.js";
import * as ops from "../dist/wall-kit/ops.js";
import "../dist/wall-kit/register.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const gamid = (id, payload, geometry = {}) => createElement({ id, type: "gamid", x: 0, y: 0, z: 0, width: 800, height: 260, ...geometry, payload: { layout: "card", ...payload } });
const docOf = (...elements) => { const doc = createDocument(); doc.stages[0].elements = elements; return doc; };
const byId = (doc, id) => doc.stages.flatMap(stage => stage.elements).find(element => element.id === id);

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { props: new Map(), setProperty(n, v) { this.props.set(n, v); }, removeProperty(n) { this.props.delete(n); } }; this.className = ""; this.textContent = ""; this.dataset = {}; this.listeners = {}; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  append(...nodes) { for (const node of nodes) if (node && typeof node === "object") this.children.push(node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
}
const make = tag => new Node(tag);
const all = (root, predicate) => { const out = []; const walk = node => { if (predicate(node)) out.push(node); node.children.forEach(walk); }; walk(root); return out; };
const snapshot = { profile: { displayName: "Espada", handle: "black", initial: "E" }, roles: [{ key: "igl", label: "IGL", primary: true }], connections: [{ label: "Discord", name: "Espada" }], games: { items: [{ name: "Dota 2" }], playtimeAllowed: false }, visibility: {} };

// ---------- H / M: typed, validated data ----------
test("M style is typed data only: enums, #rrggbb colours, numbers in safe ranges, booleans - raw CSS, URLs, markup and unknown keys are refused", () => {
  assert.deepEqual(validateGamidStyle({}), []);
  assert.deepEqual(validateGamidStyle(GAMID_STYLE_DEFAULTS), [], "the defaults themselves are valid");
  assert.deepEqual(validateGamidStyle({ bgColor: "url(https://evil.example/x.png)" }), ["INVALID_STYLE_BG_COLOR"]);
  assert.deepEqual(validateGamidStyle({ css: "background:red" }), ["INVALID_STYLE_KEY"]);
  assert.deepEqual(validateGamidStyle({ bgMode: "image" }), ["INVALID_STYLE_BG_MODE"], "no image / video backgrounds here");
  assert.deepEqual(validateGamidStyle({ padding: 61, gap: 41, radius: -1, borderWidth: 9 }), ["INVALID_STYLE_PADDING", "INVALID_STYLE_GAP", "INVALID_STYLE_RADIUS", "INVALID_STYLE_BORDER_WIDTH"]);
  assert.deepEqual(validateGamidStyle({ bgOpacity: Number.NaN }), ["INVALID_STYLE_BG_OPACITY"]);
  assert.deepEqual(validateGamidStyle("color: red"), ["INVALID_STYLE"]);
  assert.deepEqual(GAMID_STYLE_KEYS.slice().sort(), Object.keys(GAMID_STYLE_DEFAULTS).sort(), "every key has a default");
  const bad = validateDocument(docOf(gamid("g", { block: "profile", style: { bgColor: "javascript:alert(1)" } })));
  assert.equal(bad.valid, false);
});

test("M the database validator mirrors the JS rules key for key (same keys, enums and ranges; codes built the same way)", () => {
  const sql = read("supabase/migrations/20260927120000_wall_gamid_block_style.sql");
  for (const key of GAMID_STYLE_KEYS) assert.ok(sql.includes(`'${key}'`), key);
  for (const [value] of [["'solid', 'gradient', 'none'"], ["'outline', 'filled', 'plain'"], ["'card', 'plain', 'divided'"], ["'circle', 'rounded', 'square'"], ["'s', 'm', 'l'"]]) assert.ok(sql.includes(value), value);
  assert.match(sql, /'INVALID_STYLE_' \|\| upper\(regexp_replace\(k, '\(\[A-Z\]\)', '_\\1', 'g'\)\)/);
  assert.match(sql, /revoke all on function private\.wall_gamid_style_errors\(jsonb\), private\.wall_element_payload_errors\(text, jsonb\) from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /\b(alter|drop|delete|update|insert)\b\s+(table|from|into)?/i, "functions only - no table / data change");
  const corpus = read("tests/wall-w2-corpus.js");
  assert.ok((corpus.match(/name: "gamid style:/g) ?? []).length >= 15, "the shared corpus covers styling (the DB contract runs it)");
});

// ---------- H / N: defaults + old Walls ----------
test("N old Walls load unchanged: a block without style renders with no style at all (the accepted look), and its payload is not rewritten", () => {
  const doc = docOf(gamid("g", { block: "profile" }));
  assert.equal(validateDocument(doc).valid, true);
  const content = elementRegistry.get("gamid").render(doc.stages[0].elements[0].payload);
  assert.equal("style" in content, false);
  const root = paintGamidBlock(content, snapshot, make);
  assert.equal([...root.style.props.keys()].some(name => name.startsWith("--g-")), false, "no custom property: wall-kit.css falls back to the accepted look");
  assert.equal(root.className.includes("is-styled"), false);
  const css = read("dist/wall-kit/wall-kit.css");
  assert.match(css, /background: var\(--g-bg, linear-gradient\(145deg, rgba\(27, 20, 48, \.94\), rgba\(13, 11, 20, \.96\)\)\)/, "the fallback IS the accepted background");
  assert.match(css, /border: var\(--g-border, 1px solid rgba\(139, 93, 255, \.5\)\)/);
  assert.match(css, /\.wall-gamid-title \{ color: var\(--g-heading, #62e7ff\)/);
});

test("H/I a partial style is completed with the defaults; the painter turns it into custom properties + classes on the block root only", () => {
  const content = elementRegistry.get("gamid").render({ block: "profile", layout: "card", style: { bgMode: "solid", bgColor: "#ff0000", bgOpacity: 0.4, radius: 0, avatarShape: "square", showHandle: false } });
  assert.deepEqual(content.style, { ...GAMID_STYLE_DEFAULTS, bgMode: "solid", bgColor: "#ff0000", bgOpacity: 0.4, radius: 0, avatarShape: "square", showHandle: false });
  const root = paintGamidBlock(content, snapshot, make, { scale: 0.5 });
  assert.equal(root.style.props.get("--g-bg"), "rgba(255, 0, 0, 0.4)");
  assert.equal(root.style.props.get("--g-radius"), "0px");
  assert.equal(root.style.props.get("padding"), "10px", "padding in canonical units, scaled with the Wall");
  assert.match(root.className, /is-styled/);
  assert.match(root.className, /avatar-square/);
  assert.match(root.className, /no-handle/);
  assert.equal(root.style.props.has("opacity"), false, "opacity is NEVER applied to the element (that would fade its text)");
});

test("I background opacity applies to the container colours only; transparent and gradient work; the border can be switched off", () => {
  const px = value => `${value}px`;
  const base = { ...GAMID_STYLE_DEFAULTS };
  assert.equal(gamidStyleVars({ ...base, bgMode: "none" }, px)["--g-bg"], "transparent");
  assert.equal(gamidStyleVars({ ...base, bgMode: "gradient", bgColor: "#000000", bgColor2: "#ffffff", bgAngle: 90, bgOpacity: 0.5 }, px)["--g-bg"], "linear-gradient(90deg, rgba(0, 0, 0, 0.5), rgba(255, 255, 255, 0.5))");
  assert.equal(gamidStyleVars({ ...base, border: false }, px)["--g-border"], "none");
  assert.equal(gamidStyleVars({ ...base, border: true, borderWidth: 0 }, px)["--g-border"], "none");
  assert.equal(gamidStyleVars({ ...base, border: true, borderWidth: 3, borderColor: "#00ff00", borderOpacity: 0.25 }, px)["--g-border"], "max(1px, 3px) solid rgba(0, 255, 0, 0.25)");
  assert.equal(rgba("#8b5dff", 0.55), "rgba(139, 93, 255, 0.55)");
  assert.equal(onColor("#ffffff"), "#0b0913", "dark text on a light accent");
  assert.equal(onColor("#1b1430"), "#ffffff", "light text on a dark accent");
});

test("J/K text colours, chips, rows and profile presentation are all driven by the style; trust labels and Private keep their fixed colours", () => {
  const css = read("dist/wall-kit/wall-kit.css");
  for (const rule of [/\.wall-gamid-empty \{ margin: 0; color: var\(--g-muted/, /\.wall-gamid-chips li \{[^}]*var\(--g-chip-border/, /\.wall-gamid\.chips-filled \.wall-gamid-chips li \{ background: var\(--g-accent\)/, /\.wall-gamid\.chips-plain/, /\.wall-gamid\.rows-plain/, /\.wall-gamid\.rows-divided/, /\.wall-gamid\.avatar-rounded/, /\.wall-gamid\.name-l \.wall-gamid-name/, /\.wall-gamid\.no-handle \.wall-gamid-handle \{ display: none; \}/]) assert.match(css, rule);
  assert.match(css, /\.wall-connection-trust \{ font-size: \.7em; font-weight: 800; letter-spacing: \.08em; color: #6ef0b5; \}/, "Verified/Connected stays green");
  assert.match(css, /\.wall-connection-trust\.is-caution \{ color: #ffc857; \}/, "Manual/Unverified stays amber");
  assert.match(css, /\.wall-gamid\.is-styled \.wall-connection \.wall-connection-trust, \.wall-gamid\.is-styled \.wall-gamid-private \{[^}]*background: rgba\(8, 6, 16, \.78\)/, "on any styled background they sit on a dark pill");
  for (const line of css.split(/\r?\n/).filter(text => /wall-connection-trust|wall-gamid-private/.test(text))) assert.doesNotMatch(line, /var\(--g-/, "never themed");
});

// ---------- L: apply to all ----------
test("L 'Apply to all GamID blocks' copies ONLY the style (never block kind, layout, games count, hours, geometry) to every other block on every stage; each stays editable", () => {
  let doc = docOf(gamid("a", { block: "profile", style: { bgMode: "none", accentColor: "#ff00aa" } }), gamid("b", { block: "games", layout: "compact", initial: 5, showPlaytime: true }, { y: 300 }));
  doc = ops.addStage(doc).doc;
  doc.stages[1].elements.push(gamid("c", { block: "connections" }));
  const before = structuredClone(doc);
  const result = ops.applyGamidStyleToAll(doc, "a");
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.deepEqual(byId(result.doc, "b").payload, { block: "games", layout: "compact", initial: 5, showPlaytime: true, style: { bgMode: "none", accentColor: "#ff00aa" } });
  assert.deepEqual(byId(result.doc, "c").payload.style, { bgMode: "none", accentColor: "#ff00aa" });
  for (const id of ["b", "c"]) for (const key of ["x", "y", "width", "height"]) assert.equal(byId(result.doc, id)[key], byId(before, id)[key]);
  assert.deepEqual(doc, before, "the input document is not mutated");
  const edited = ops.setGamidStyle(result.doc, ["b"], { accentColor: "#00ff00" });
  assert.equal(byId(edited.doc, "b").payload.style.accentColor, "#00ff00");
  assert.equal(byId(edited.doc, "c").payload.style.accentColor, "#ff00aa", "copies are independent");
  assert.equal(byId(edited.doc, "a").payload.style.accentColor, "#ff00aa");
  // a source with no style resets the others to the default look
  const reset = ops.applyGamidStyleToAll(ops.setGamidStyle(edited.doc, ["a"], { bgMode: undefined, accentColor: undefined }).doc, "a");
  assert.equal("style" in byId(reset.doc, "b").payload, false);
  assert.equal(ops.applyGamidStyleToAll(docOf(gamid("only", { block: "profile" })), "only").errors[0], "NO_OTHER_GAMID_BLOCKS");
  const withText = docOf(gamid("a", { block: "profile" }), createElement({ id: "t", type: "rect", x: 0, y: 400, z: 1, width: 10, height: 10, payload: { fill: "#000000" } }));
  assert.equal(ops.applyGamidStyleToAll(withText, "t").errors[0], "NOT_A_GAMID_BLOCK");
});

test("H setGamidStyle merges per block, removes keys set to undefined, drops an empty style, and refuses invalid values without changing anything", () => {
  const doc = docOf(gamid("a", { block: "profile" }));
  const one = ops.setGamidStyle(doc, ["a"], { radius: 12 });
  assert.deepEqual(byId(one.doc, "a").payload.style, { radius: 12 });
  const two = ops.setGamidStyle(one.doc, ["a"], { radius: undefined });
  assert.equal("style" in byId(two.doc, "a").payload, false, "back to the exact default payload");
  const bad = ops.setGamidStyle(one.doc, ["a"], { radius: 500 });
  assert.equal(bad.ok, false);
  assert.equal(bad.doc, one.doc);
  assert.equal(ops.setGamidStyle(one.doc, ["a"], { bgColor: "red" }).ok, false);
});

// ---------- editor wiring ----------
test("H editor controls: the Block style section writes typed values through ops (never CSS), offers Apply to all and Reset, and is limited to presentation", () => {
  const controls = read("dist/wall-editor/controls.js");
  assert.match(controls, /function gamidStyleControls\(root, element\)/);
  assert.match(controls, /ops\.setGamidStyle\(session\.doc, session\.state\.selection, \{ \[key\]: value \}\)/);
  assert.match(controls, /ops\.applyGamidStyleToAll\(session\.doc, session\.state\.selection\[0\]\)/);
  assert.match(controls, /text: "Apply to all GamID blocks"/);
  assert.match(controls, /text: "Reset style"/);
  for (const label of ["Background", "Gradient end", "Background opacity %", "Border", "Border colour", "Border opacity %", "Border width", "Corner radius", "Heading colour", "Primary text", "Secondary text", "Accent", "Chips / badges", "Rows", "Avatar", "Name size", "Show @GamID", "Padding", "Spacing"]) assert.ok(controls.includes(`"${label}"`), label);
  assert.doesNotMatch(controls.slice(controls.indexOf("function gamidStyleControls")), /innerHTML|style\.cssText|setAttribute\("style"/);
  assert.match(read("dist/wall-kit/messages.js"), /NO_OTHER_GAMID_BLOCKS/);
});

test("O Preview and the public view use the same styling: the painter applies it in both edit and view modes", () => {
  const content = elementRegistry.get("gamid").render({ block: "connections", layout: "card", style: { accentColor: "#ff0000" } });
  const publicView = { public: { available: true, connections: [{ label: "Steam", name: "Persona", trust: "CONNECTED", tone: "ok" }], games: null } };
  for (const interactive of [false, true]) {
    const root = paintGamidBlock(content, { ...snapshot, ...publicView }, make, { interactive });
    assert.equal(root.style.props.get("--g-accent"), "#ff0000", `interactive=${interactive}`);
  }
});
