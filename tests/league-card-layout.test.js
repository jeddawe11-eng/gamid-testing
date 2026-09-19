import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = (await readFile(new URL("../dist/account/account.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const controller = (await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const MARKER = "/* League card presentation fix (layout only).";
const fixStart = css.indexOf(MARKER);
const fixWithComment = css.slice(fixStart);
const fix = fixWithComment.replace(/\/\*[\s\S]*?\*\//g, ""); // declarations only
// [selector, declarations] pairs of the fix block, including rules inside its @media block
const rules = [...fix.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(match => [match[1].trim().replace(/^\/\*[\s\S]*?\*\/\s*/, ""), match[2].trim()]);
const rule = selector => rules.filter(([sel]) => sel === selector).map(([, body]) => body).join(";");

test("the League card layout fix exists and documents its root cause", () => {
  assert.ok(fixStart > 0, "the fix block is present");
  assert.match(fixWithComment, /the header reused the Connections row where the chip cannot shrink/);
  assert.match(fixWithComment, /inherited the global bordered, overflow:hidden, unpadded dl\/dd rules/);
  assert.ok(rules.length >= 10);
});

test("every rule in the fix is scoped to .league-card, so no other card (including the Discord panel) is restyled", () => {
  for (const [selector] of rules) {
    for (const part of selector.split(",")) assert.match(part.trim(), /^\.league-card( |$)/, `"${part.trim()}" must be scoped to .league-card`);
  }
  assert.ok(rules.every(([selector]) => selector.split(",").every(part => part.trim().startsWith(".league-card"))), "no unscoped card / dl / dd / dt rule is (re)defined");
});

test("the header can no longer be crushed: the row wraps, the text column has a floor, and the chip can shrink", () => {
  assert.match(rule(".league-card .connection-head"), /flex-wrap:wrap/);
  assert.match(rule(".league-card .connection-copy"), /flex:1 1 9rem/);
  assert.match(rule(".league-card .connection-chip"), /flex:0 1 auto/);
  assert.match(rule(".league-card .connection-chip"), /max-width:100%/);
});

test("the Riot ID, region and other text lines wrap safely instead of being clipped with an ellipsis", () => {
  const body = rule(".league-card .connection-name,.league-card .connection-handle");
  assert.match(body, /white-space:normal/);
  assert.match(body, /overflow:visible/);
  assert.match(body, /text-overflow:clip/);
  assert.match(body, /overflow-wrap:anywhere/);
  assert.match(rule(".league-card .connection-discovery-facts dd"), /overflow-wrap:anywhere/);
});

test("the metadata list no longer inherits the global bordered, clipping, unpadded dl box or the green letter-spaced values", () => {
  const dl = rule(".league-card .connection-discovery-facts");
  assert.match(dl, /border:0/);
  assert.match(dl, /border-radius:0/);
  assert.match(dl, /overflow:visible/, "the list can never clip its own text");
  assert.match(dl, /padding:\.8rem 0 0/);
  assert.match(dl, /grid-template-columns:minmax\(0,1fr\)/, "labels stack above values on phones so long values keep the full width");
  const dd = rule(".league-card .connection-discovery-facts dd");
  assert.match(dd, /color:var\(--text\)/);
  assert.match(dd, /letter-spacing:0/);
  assert.match(dd, /line-height:1\.45/);
  assert.match(rule(".league-card .connection-discovery-facts dt"), /color:var\(--muted\)/);
});

test("the card has real internal padding and roomy spacing around the notes", () => {
  assert.match(rule(".league-card"), /padding:1rem/);
  assert.match(rule(".league-card .connection-privacy"), /margin-top:\.95rem/);
  assert.match(rule(".league-card .league-warning"), /margin-top:\.85rem/);
});

test("from small tablet width the metadata becomes a two-column label/value list", () => {
  assert.match(fix, /@media\(min-width:34rem\)\{[\s\S]*?\.league-card \.connection-discovery-facts\{grid-template-columns:minmax\(0,10\.5rem\) minmax\(0,1fr\);/);
});

test("the fix never reintroduces clipping: no nowrap, no overflow:hidden, no fixed pixel widths", () => {
  assert.doesNotMatch(fix, /nowrap|overflow:hidden|overflow-x:hidden|text-overflow:ellipsis/);
  assert.doesNotMatch(fix, /(?<!min-|max-)width:\s*\d+px/);
});

test("existing rules the fix must not disturb are unchanged: the shared Connections/Discord panel styles and the global dl/dt/dd used elsewhere", () => {
  assert.ok(css.includes(".connection-discovery-facts{display:grid;grid-template-columns:minmax(0,9.5rem) minmax(0,1fr);gap:.3rem .75rem;margin:.2rem 0 0;font-size:.74rem}"));
  assert.ok(css.includes(".connection-discovery{display:grid;gap:.55rem;margin-top:.8rem;padding:.8rem;border:1px dashed #3a334b;border-radius:.8rem;background:rgba(98,231,255,.03)}"));
  assert.ok(css.includes(".connection-name,.connection-handle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:.78rem}"), "the Discord card keeps its own ellipsis rule");
  assert.ok(css.includes("dl{border:1px solid var(--line);border-radius:1rem;overflow:hidden;margin:0}"));
  assert.ok(css.includes("dd{margin:0;color:var(--green);font-size:.7rem;font-weight:800;letter-spacing:.08em}"));
});

test("the CSS targets exactly the class names the League card renders (presentation-only change; no markup or behavior change)", () => {
  const block = controller.slice(controller.indexOf("function leagueProfileView"), controller.indexOf("function renderLeague"));
  for (const cls of ["connection-head", "connection-copy", "connection-chip league-chip", "connection-discovery-facts", "connection-privacy", "league-warning", "connection-actions"]) assert.ok(block.includes(cls), `the card still renders .${cls}`);
  assert.ok(controller.includes('`connection-card league-card${leagueProfile ? " is-connected" : ""}`'), "the card element still carries .league-card");
  assert.match(block, /"PROTOTYPE \/ UNVERIFIED"/);
  assert.match(block, /Data source/);
  assert.match(block, /Last updated/);
});
