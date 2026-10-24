// Wall Stages V2 (DEC-0011, Mazen's task 2026-10-22): My Stage / Friends Stage, the stage allowance (3 for everyone today; the server decides it), the Friends
// Stage restrictions and the conversion / deletion rules. The live database behaviour is in tests/integration/wall-w2-db.sql and wall-publishing-db.sql.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { renderDocument } from "../dist/wall/render.js";
import { STAGE_TYPES, stageType, myStageCount, WALL_STAGE_LIMIT, activeStickerCount, stageTypeErrors } from "../dist/wall/stage-types.js";
import * as ops from "../dist/wall-kit/ops.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import { describeCode, friendsConversionBlocked, stageDeleteQuestion } from "../dist/wall-kit/messages.js";
import { BACKGROUND_CATALOG, CATALOG_TIERS, catalogEntitlement, catalogByTier, catalogAvailable } from "../dist/wall-kit/background-catalog.js";
import { createWallPersistence, toPersistenceError } from "../dist/wall/persistence.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const rect = id => createElement({ id, type: "rect", x: 10, y: 10, width: 100, height: 100, payload: { fill: "#aabbcc" } });
const withTypes = (...types) => { const doc = createDocument({ stageCount: types.length }); types.forEach((type, index) => { if (type === "friends") doc.stages[index].type = "friends"; }); return doc; };

test("stage types: My Stage (no type, as every stage before) and Friends Stage; the allowance default is 3", () => {
  assert.deepEqual(STAGE_TYPES, ["my", "friends"]);
  assert.equal(WALL_STAGE_LIMIT, 3);
  assert.equal(stageType({ id: "s", elements: [] }), "my");
  assert.equal(stageType({ id: "s", type: "my", elements: [] }), "my");
  assert.equal(stageType({ id: "s", type: "friends", elements: [] }), "friends");
  assert.equal(activeStickerCount({ id: "s", type: "friends", elements: [] }), 0, "no sticker system exists, so a stage never has active stickers");
  // every Wall saved before stage types existed is valid as it is and is not rewritten
  const legacy = createDocument({ stageCount: 3 });
  legacy.stages[0].elements.push(rect("r1"));
  legacy.background = { kind: "color", color: "#101010" };
  const before = JSON.stringify(legacy);
  assert.equal(validateDocument(legacy).valid, true);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(myStageCount(legacy), 3);
});

test("limits: 1, 2 and 3 stages can be created; a fourth is refused; the core has no maximum without an allowance", () => {
  let doc = createDocument();
  assert.equal(doc.stages.length, 1);
  for (const expected of [2, 3]) { const result = ops.addStage(doc, { limit: 3 }); assert.equal(result.ok, true); doc = result.doc; assert.equal(doc.stages.length, expected); }
  const fourth = ops.addStage(doc, { limit: 3 });
  assert.deepEqual(fourth.errors, ["STAGE_LIMIT"]);
  assert.equal(fourth.limit, 3);
  assert.equal(fourth.doc, doc, "nothing changes");
  assert.equal(ops.addStage(doc).ok, true, "the document core itself has no maximum (the editor always passes the allowance)");
  assert.equal(ops.addStage(doc, { limit: 5 }).ok, true, "a larger allowance (future Pro) needs no other change");
  // Add stage still appends a My Stage at the end
  const added = ops.addStage(withTypes("my", "friends"), { limit: 3 }).doc;
  assert.deepEqual(added.stages.map(stage => stageType(stage)), ["my", "friends", "my"]);
});

test("distributions: 3/0, 2/1 and 1/2 (My/Friends) are valid; 0/3, and any Wall without a My Stage, is refused", () => {
  for (const types of [["my", "my", "my"], ["my", "my", "friends"], ["friends", "my", "friends"], ["my", "friends", "friends"], ["my", "friends"], ["my"]]) {
    assert.equal(validateDocument(withTypes(...types)).valid, true, types.join("/"));
  }
  for (const types of [["friends", "friends", "friends"], ["friends", "friends"], ["friends"]]) assert.deepEqual(validateDocument(withTypes(...types)).errors, ["NO_MY_STAGE"], types.join("/"));
  const bad = withTypes("my", "my");
  bad.stages[1].type = "guest";
  assert.deepEqual(validateDocument(bad).errors, ["INVALID_STAGE_TYPE:stage_2"]);
  assert.deepEqual(stageTypeErrors([{ id: "a", type: "mine", elements: [] }]), ["INVALID_STAGE_TYPE:a", "NO_MY_STAGE"]);
});

test("Friends Stage: no elements and no background of the owner's own - through every editing path - and never a Move to stage destination", () => {
  const doc = withTypes("my", "friends");
  assert.deepEqual(ops.addElement(doc, "stage_2", "text").errors, ["FRIENDS_STAGE_ELEMENTS:stage_2"]);
  assert.deepEqual(ops.addCustomElement(doc, "stage_2", { type: "rect", payload: { fill: "#112233" }, width: 100, height: 100 }).errors, ["FRIENDS_STAGE_ELEMENTS:stage_2"]);
  assert.deepEqual(ops.setBackground(doc, "stage_2", { kind: "color", color: "#112233" }).errors, ["FRIENDS_STAGE_BACKGROUND:stage_2"]);
  assert.equal(ops.setBackground(doc, "wall", { kind: "color", color: "#112233" }).ok, true, "the Whole-Wall background is the My Stages'");
  const withEl = ops.addElement(doc, "stage_1", "text").doc;
  const id = withEl.stages[0].elements[0].id;
  assert.equal(ops.moveElementsToStage(withEl, [id], "stage_2").ok, false);
  assert.deepEqual(ops.stageMoveOptions(withTypes("my", "friends", "my"), "stage_1").map(option => option.label), ["Stage 3"]);
  // My Stage editing is unchanged
  assert.equal(ops.addElement(doc, "stage_1", "text").ok, true);
  assert.equal(ops.setBackground(doc, "stage_1", { kind: "color", color: "#112233" }).ok, true);
});

test("conversion: never the last My Stage; only an empty stage becomes a Friends Stage (counts reported, nothing removed); Friends -> My is free while it has no stickers", () => {
  const one = createDocument();
  assert.deepEqual(ops.setStageType(one, "stage_1", "friends").errors, ["LAST_MY_STAGE"]);
  const two = createDocument({ stageCount: 2 });
  two.stages[1].elements.push(rect("r1"), rect("r2"));
  two.stages[1].background = { kind: "color", color: "#112233" };
  const blocked = ops.setStageType(two, "stage_2", "friends");
  assert.deepEqual([blocked.errors, blocked.elementCount, blocked.hasBackground], [["STAGE_NOT_EMPTY_FOR_FRIENDS"], 2, true]);
  assert.equal(blocked.doc, two, "nothing on the stage is removed");
  assert.equal(friendsConversionBlocked({ ...blocked, number: 2 }), "Stage 2 still has 2 elements and its own background. Only an empty stage can become a Friends Stage: move its elements to another stage (Move to stage) or delete them, and remove its background (Assets > Background, This stage only), then try again.");
  const empty = createDocument({ stageCount: 2 });
  const converted = ops.setStageType(empty, "stage_2", "friends");
  assert.equal(converted.ok, true);
  assert.equal(converted.doc.stages[1].type, "friends");
  const back = ops.setStageType(converted.doc, "stage_2", "my");
  assert.equal(back.ok, true);
  assert.equal("type" in back.doc.stages[1], false, "a My Stage is stored without a type, exactly as before");
  assert.equal(ops.setStageType(empty, "stage_1", "my").doc, empty, "no change, no new document");
  assert.deepEqual(ops.setStageType(empty, "stage_1", "visitor").errors, ["INVALID_STAGE_TYPE"]);
  assert.deepEqual(ops.setStageType(empty, "nope", "friends").errors, ["STAGE_NOT_FOUND"]);
});

test("deletion: never the last stage or the last My Stage; a Friends Stage is deleted with its (zero) active stickers disclosed first", () => {
  const doc = withTypes("my", "friends");
  assert.deepEqual(ops.deleteStage(doc, "stage_1").errors, ["LAST_MY_STAGE"]);
  const info = ops.stageDeletionInfo(doc, "stage_2");
  assert.deepEqual([info.type, info.isLastMy, info.stickerCount], ["friends", false, 0]);
  assert.equal(stageDeleteQuestion(info), "Stage 2 is a Friends Stage with 0 active stickers. Delete this stage? You can undo this.");
  assert.equal(ops.stageDeletionInfo(doc, "stage_1").isLastMy, true);
  assert.equal(ops.deleteStage(doc, "stage_2").ok, true);
  assert.equal(ops.deleteStage(withTypes("my", "my"), "stage_1").ok, true, "another My Stage remains");
});

test("rendering: a Friends Stage never shows the owner's Whole-Wall background (it shows the official Friends Stage background - Friends Stickers V1); My Stages are unchanged", () => {
  const doc = withTypes("my", "friends", "my");
  doc.background = { kind: "color", color: "#ff0000" };
  const tree = renderDocument(doc, { viewportWidth: 300 });
  assert.deepEqual(tree.stages.map(stage => stage.type ?? null), [null, "friends", null], "only a Friends Stage's tree carries a type");
  const node = tag => { const attrs = new Map(), children = []; return { tag, attrs, children, style: { setProperty() {} }, setAttribute(name, value) { attrs.set(name, String(value)); }, append(...items) { children.push(...items); }, appendChild(item) { children.push(item); return item; }, set className(value) { attrs.set("class", value); }, set textContent(value) { this.text = value; } }; };
  const painted = paintDocument(doc, 300, node, {});
  assert.equal(painted.ok, true);
  assert.deepEqual(painted.stages.map(stage => stage.children.length), [1, 2, 1], "the Whole-Wall background layer on the two My Stages only; the Friends Stage holds the official background and its empty-state message");
  assert.deepEqual(painted.stages[1].children.map(child => child.attrs.get("class")), ["wall-friends-bg", "wall-friends-empty"], "the official Friends Stage background, never the owner's Whole-Wall one");
  assert.equal(painted.stages[1].attrs.get("data-stage-type"), "friends");
  assert.equal(painted.stages[0].attrs.has("data-stage-type"), false);
});

test("the official background catalog: Free and Premium, Premium never eligible (no subscription exists), and today empty - nothing invented", () => {
  assert.deepEqual(CATALOG_TIERS, ["free", "premium"]);
  assert.deepEqual(BACKGROUND_CATALOG, [], "no official GamID backgrounds or files exist yet");
  assert.equal(catalogAvailable(), false);
  assert.deepEqual(catalogEntitlement(), { free: true, premium: false });
  const split = catalogByTier([{ key: "a", label: "A", tier: "free" }, { key: "b", label: "B", tier: "premium" }]);
  assert.deepEqual(split.free.map(entry => entry.eligible), [true]);
  assert.deepEqual(split.premium.map(entry => entry.eligible), [false]);
  const source = read("dist/wall-kit/background-catalog.js").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /fetch\(|rpc\(|price|purchase|unlock|storage|assetId/i, "no network, no prices, no unlock, never an uploaded asset");
});

test("messages: every new code has owner-facing words", () => {
  for (const code of ["STAGE_LIMIT", "WALL_STAGE_LIMIT", "LAST_MY_STAGE", "NO_MY_STAGE", "STAGE_NOT_EMPTY_FOR_FRIENDS", "STAGE_HAS_STICKERS", "FRIENDS_STAGE_ELEMENTS", "FRIENDS_STAGE_BACKGROUND", "INVALID_STAGE_TYPE"]) {
    assert.notEqual(describeCode(code), "Something went wrong.", code);
  }
});

test("persistence: the allowance comes from the server (get_my_wall_stage_allowance); WALL_STAGE_LIMIT is a typed error", async () => {
  const answers = { get_my_wall_stage_allowance: 3 };
  const persistence = createWallPersistence({ rpc: async name => answers[name] });
  assert.equal(await persistence.loadStageAllowance(), 3);
  for (const odd of [0, -1, 2.5, "x", null]) { answers.get_my_wall_stage_allowance = odd; assert.equal(await persistence.loadStageAllowance(), null, String(odd)); }
  const error = toPersistenceError({ message: "WALL_STAGE_LIMIT", payload: { message: "WALL_STAGE_LIMIT", details: "3" } });
  assert.equal(error.code, "WALL_STAGE_LIMIT");
});

test("database: the stage-type rules are the SQL port of stageTypeErrors; the allowance is one function (3 today); save and publish enforce it without ever cutting a Wall", () => {
  const draft = read("supabase/migrations/20261022120000_wall_stage_types.sql"), snapshot = read("supabase/migrations/20261022120100_wall_public_publishing_stage_limit.sql");
  const code = draft.replace(/--.*$/gm, "");
  for (const value of ["'INVALID_STAGE_TYPE:'", "'FRIENDS_STAGE_BACKGROUND:'", "'FRIENDS_STAGE_ELEMENTS:'", "'NO_MY_STAGE'", "('my', 'friends')"]) assert.ok(code.includes(value), value);
  assert.match(code, /errs := errs \|\| private\.wall_stage_type_errors\(doc\);\n  return errs;\nexception when numeric_value_out_of_range/, "appended at the end of wall_document_errors, as in validate.js");
  assert.match(code, /create function private\.wall_stage_allowance\(candidate_entity uuid\)\nreturns integer\nlanguage sql stable\nset search_path = ''\nas \$\$ select 3 \$\$;/);
  const limitCheck = /jsonb_array_length\(candidate_document -> 'stages'\) > private\.wall_stage_allowance\(owned_entity_id\)\n\s+and jsonb_array_length\(candidate_document -> 'stages'\) > coalesce\(\(select jsonb_array_length\(d\.document -> 'stages'\) from public\.wall_drafts d where d\.entity_id = owned_entity_id\), 0\) then\n\s+raise exception using errcode = '22023', message = 'WALL_STAGE_LIMIT'/;
  assert.match(code, limitCheck);
  assert.match(snapshot.replace(/--.*$/gm, ""), /jsonb_array_length\(draft\.document -> 'stages'\) > private\.wall_stage_allowance\(owned_entity_id\)[\s\S]*message = 'WALL_STAGE_LIMIT'/);
  assert.match(code, /grant execute on function private\.get_my_wall_stage_allowance_impl\(\), public\.get_my_wall_stage_allowance\(\) to authenticated;/);
  assert.match(code, /revoke all on function private\.wall_stage_type_errors\(jsonb\), private\.wall_stage_allowance\(uuid\)/);
  assert.doesNotMatch(code + snapshot.replace(/--.*$/gm, ""), /\b(delete from|truncate|drop)\b|update public\.wall_(drafts|publications) set document = (?!candidate_document)/i, "no stored Wall is changed or cut");
});

test("editor: Add stage passes the owner's allowance; the type switch, the count and the Friends panel are wired on desktop and phone", () => {
  const editor = read("dist/wall-editor/editor.js"), html = read("dist/wall-editor/index.html"), shell = read("dist/wall-editor/mobile-shell.js"), css = read("dist/wall-editor/editor.css");
  assert.match(editor, /run\(ops\.addStage\(session\.doc, \{ limit: stageLimit \}\)\)/);
  assert.match(editor, /persistence\.loadStageAllowance\(\)\.then\(limit => \{ if \(limit\) \{ stageLimit = limit; renderAll\(\); \} \}\)/);
  // at the allowance Add stage stays clickable to explain the limit (2026-10-23 acceptance fix): muted, "MAX N STAGES" from the allowance, a click only says so
  assert.doesNotMatch(editor, /\$\("stageAdd"\)\.disabled = /, "never disabled: a disabled button gave no feedback");
  assert.match(editor, /add\.classList\.toggle\("is-max", full\);\n  add\.setAttribute\("aria-disabled", String\(full\)\);/);
  assert.match(editor, /add\.querySelector\("\.ed-stage-long"\)\.textContent = full \? `MAX \$\{stageLimit\} STAGES` : "\+ Add stage";/, "the label comes from the allowance, never a fixed 3");
  assert.match(editor, /if \(session\.doc\.stages\.length >= stageLimit\) \{\n    const message = `You've reached your \$\{stageLimit\}-stage limit\.`;\n    \$\("stageStatus"\)\.textContent = message;\n    notify\(message\);\n    return;\n  \}/, "at the limit nothing is added and the Wall is not changed");
  assert.match(shell, /\$\("mwStageAdd"\)\.classList\.toggle\("is-max", atMax\);/);
  for (const sheet of [read("dist/wall-editor/editor.css"), read("dist/wall-editor/editor-desktop.css"), read("dist/wall-editor/editor-mobile.css")]) assert.match(sheet, /\.ed-stage-add\.is-max/);
  // (Friends Stickers V1: the panel's background catalog note became the stage's sticker requests and stickers)
  for (const id of ["stageTypeMy", "stageTypeFriends", "stageCount", "friendsStagePanel", "friendsRequests", "friendsApproved", "friendsSend", "friendsMakeMy", "mwStageTypeMy", "mwStageTypeFriends", "mwStageCount"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(shell, /proxy\("mwStageTypeMy", "stageTypeMy"\);/);
  assert.match(shell, /proxy\("mwStageTypeFriends", "stageTypeFriends"\);/);
  assert.match(css, /body\[data-stage-type="friends"\] \[data-tool-panel\] \{ display: none !important; \}/, "a Friends Stage replaces every tool panel");
  assert.match(css, /\.ed-friends-panel \{ display: none; \}\nbody\[data-stage-type="friends"\] \.ed-friends-panel \{ display: block; \}/);
  assert.match(editor, /if \(info\.isLastMy\) \{ notify\(describeCode\("LAST_MY_STAGE"\)\); return; \}/);
  assert.doesNotMatch(html + css, /friendsStageNote|ed-friends-note/, "the canvas note was replaced by the in-stage empty-state message (2026-10-23)");
});

test("templates: never applied onto a Friends Stage (no silent conversion); a whole-Wall replacement keeps the 3-stage allowance and the sticker rule", async () => {
  const { applyTemplate } = await import("../dist/wall-kit/templates/apply.js");
  const { TEMPLATES } = await import("../dist/wall-kit/templates/catalog.js");
  const template = TEMPLATES[0];
  const doc = withTypes("my", "friends");
  const onFriends = applyTemplate(doc, template, { scope: "stage", stageId: "stage_2", confirmed: true });
  assert.deepEqual(onFriends.errors, ["FRIENDS_STAGE_ELEMENTS:stage_2"]);
  assert.equal(onFriends.doc, doc, "the Friends Stage stays as it is");
  assert.equal(applyTemplate(doc, template, { scope: "stage", stageId: "stage_1", confirmed: true }).ok, true, "a My Stage takes a template as before");
  const whole = applyTemplate(doc, template, { scope: "wall", confirmed: true });
  assert.equal(whole.ok, true, "a whole-Wall replacement (confirmed) is allowed while no Friends Stage has active stickers");
  assert.ok(whole.doc.stages.length <= WALL_STAGE_LIMIT, "the official template stays within the allowance");
});