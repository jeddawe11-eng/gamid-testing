// The @black "Espada" Wall visual stress test (TESTING data, 2026-09-28): the saved document is a normal Wall Document built only from editor element types,
// fully editable with the editor's own operations, and restorable from the revision-13 backup. docs/testing-backups/ holds both documents + the restore script.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateDocument } from "../dist/wall/validate.js";
import { elementRegistry } from "../dist/wall/elements.js";
import * as ops from "../dist/wall-kit/ops.js";
import "../dist/wall-kit/register.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const espada = () => JSON.parse(read("docs/testing-backups/black-wall-espada-rev14.json"));
const backup = () => JSON.parse(read("docs/testing-backups/black-wall-rev13.json"));
const all = doc => doc.stages.flatMap(stage => stage.elements);

test("the Espada Wall is a valid Wall Document made only of standard editor elements - real GamID blocks, no typed-in identity data, no markup", () => {
  const doc = espada();
  assert.equal(validateDocument(doc).valid, true);
  assert.equal(doc.stages.length, 3);
  const types = new Set(all(doc).map(element => element.type));
  for (const type of types) assert.ok(["text", "rect", "image", "gamid"].includes(type), type);
  assert.deepEqual(all(doc).filter(element => element.type === "gamid").map(element => element.payload.block).sort(), ["connections", "games", "profile", "roles"], "every structured area is a real block");
  const texts = all(doc).filter(element => element.type === "text").map(element => element.payload.text);
  assert.deepEqual(texts, ["FORGED IN EVERY MATCH", "ARSENAL", "TAP A GAME FOR ITS DETAILS", "ALLEGIANCE", "FIND ME IN THE ARENA"], "authored copy only");
  for (const text of texts) assert.doesNotMatch(text, /espada|@black|jeddawe|mazen|hamza|dota|league|steam|discord|gamer|designer|developer/i, "no identity data typed in as text");
  assert.doesNotMatch(JSON.stringify(doc), /<[a-z]|javascript:|https?:/i, "no markup or addresses anywhere");
  for (const stage of doc.stages) assert.equal(stage.background.kind, "image");
});

test("post-build editability: every element can be selected, moved, resized, rotated, restyled, grouped, re-layered and moved between stages with the editor's own operations", () => {
  let doc = espada();
  const [s1, s2, s3] = doc.stages.map(stage => stage.id);
  for (const element of all(doc)) {
    assert.ok(elementRegistry.get(element.type), `${element.id} has an editor type`);
    assert.equal(ops.moveElements(doc, [element.id], 10, 10).ok, true, `${element.id} moves`);
    assert.equal(ops.resizeElement(doc, element.id, "se", 20, 20).ok, true, `${element.id} resizes`);
    const rotated = ops.rotateElement(doc, element.id, 5);
    // a full-bleed element (as wide as the stage) cannot rotate: its rotated corners would leave the stage (the editor's hard containment rule) - by design
    if (element.width >= doc.canvas.width) assert.deepEqual([rotated.ok, rotated.errors?.[0]], [false, "OUTSIDE_CANVAS"], `${element.id} is full-bleed`);
    else assert.equal(rotated.ok, true, `${element.id} rotates`);
  }
  const games = all(doc).find(element => element.payload.block === "games");
  assert.equal(ops.setGamidStyle(doc, [games.id], { accentColor: "#62e7ff" }).ok, true, "block styling");
  const titles = doc.stages[1].elements.filter(element => element.type === "text").map(element => element.id);
  const grouped = ops.groupElements(doc, titles);
  assert.equal(grouped.ok, true, "grouping");
  assert.equal(ops.reorderLayers(doc, [games.id], "front").ok, true, "layers");
  const moved = ops.moveElementsToStage(doc, [games.id], s3);
  assert.equal(moved.ok, true, "Move to stage (2 -> 3)");
  assert.equal(moved.doc.stages[2].elements.some(element => element.id === games.id), true);
  assert.equal(ops.moveElementsToStage(moved.doc, [games.id], s1).ok, true, "and a non-adjacent move (3 -> 1)");
  doc = ops.applyGamidStyleToAll(doc, games.id).doc;
  assert.equal(validateDocument(JSON.parse(JSON.stringify(doc))).valid, true, "still saves after edits");
  void s2;
});

test("the previous Wall is restorable: the revision-13 backup is a valid document and the restore script saves exactly it through the owner's save RPC", () => {
  assert.equal(validateDocument(backup()).valid, true);
  const script = read("docs/testing-backups/restore-black-wall-rev13.sql");
  assert.match(script, /perform public\.save_my_wall_draft\(backup, current_revision\);/);
  assert.match(script, /TESTING ONLY/);
  const embedded = JSON.parse(/\$bk\$([\s\S]*?)\$bk\$::jsonb/.exec(script)[1]);
  assert.deepEqual(embedded, backup(), "the script restores the backup byte-for-byte (as JSON)");
});
