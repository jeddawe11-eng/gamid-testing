// Pro Effects (Mazen's task "GamID Pro Effects Integration", 2026-10-25): Neon, Living Fire, Living Ice and Living Radiation as one category of Wall text effects.
// Pinned here: the two new effects are their packages' own code (GAMID_LIVING_ICE_V5_MATERIALS, GAMID_LIVING_RADIATION_V1_WAVEFORM_REFINEMENT; every file verified
// against its MANIFEST), their saved settings follow the packages' contracts identically in JavaScript and in the database, every effect is free, the editor applies
// an effect without ever showing an empty result, Properties shows only the chosen effect's controls first, and the renderers keep Living Fire's safeguards.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PRO_EFFECTS, PRO_EFFECT_PLACEHOLDER, NEON_GLOW, proEffect, proEffectOf, proEffectPatch, removeProEffectPatch } from "../dist/wall-kit/pro-effects.js";
import { ICE_PRESETS, ICE_LIMITS, ICE_COLOR_KEYS, ICE_MAX_TEXT, createIce, validateIce, iceMatchesPreset, iceTextFits } from "../dist/wall-kit/living-ice.js";
import { RADIATION_STYLES, RADIATION_COLORS, RADIATION_RANGES, RADIATION_MAX_TEXT, createRadiation, validateRadiation, radiationColor, radiationForStyle, radiationTextFits } from "../dist/wall-kit/living-radiation.js";
import { createFire } from "../dist/wall-kit/living-fire.js";
import { EFFECT_LIVE_LIMIT, liveAllowance, reportLive, liveTotal } from "../dist/wall-kit/effects-budget.js";
import { breakLines, V3_FRAME } from "../dist/wall-kit/effect-layout.js";
import { buildSdf } from "../dist/wall-kit/living-fire-sdf.js";
import { validateTextPayload, renderTextPayload, createTextPayload } from "../dist/wall-kit/text.js";
import { CORPUS } from "./wall-w2-corpus.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const sha = text => createHash("sha256").update(text).digest("hex");
const iceEngine = read("dist/wall-kit/living-ice-engine.js");
const radEngine = read("dist/wall-kit/living-radiation-engine.js");
const fireEngine = read("dist/wall-kit/living-fire-engine.js");
const iceLight = read("dist/wall-kit/living-ice.js");
const radLight = read("dist/wall-kit/living-radiation.js");
const tools = read("dist/wall-editor/tools.js");
const controls = read("dist/wall-editor/controls.js");
const shader = (source, name) => source.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`))[1];

// ---- the packages' code, verbatim -------------------------------------------------------------------------------------------------------------------------------
// SHA-256 of the package pieces (LF), computed from the extracted packages after every file matched its MANIFEST (Radiation 74/74, Ice 47/47).
test("Living Radiation is the V1 waveform-refinement package's own shaders, unchanged", () => {
  assert.equal(sha(shader(radEngine, "FS")), "8714a2032f49429ec6ea48334d3ce4081e90d0fdab57ce132c1e18684a9a05c7", "fragment shader = source/engine.js FS");
  assert.equal(sha(shader(radEngine, "VS")), "d1eae4bd9f09e46ef3f4b23c2d4c83cba2a46f7860d4fb0200eb5c78a593130d", "vertex shader = source/engine.js VS");
  assert.match(radEngine, /let seed = 836719;/, "the package's noise seed");
  assert.match(radEngine, /gl\.uniform1i\(uniform\.uProof, 0\);\n\s+gl\.uniform1i\(uniform\.uWaveOnly, 0\);/, "the review-only proof modes stay off on a Wall");
  assert.match(radEngine, /entry\.time \+= dt; entry\.travelTime \+= dt;/, "the two independent clocks of the waveform refinement both run");
  assert.match(radEngine, /export const TARGET_FPS = 32;/, "the package's frame cap");
});

test("Living Ice is the V5 package's own shaders, freezing clocks and crystal placement; the ONE shader change makes misses transparent", () => {
  const fs = shader(iceEngine, "FS");
  // undo exactly the two documented changes: the result is the package's source/freezing.frag
  const original = fs.replace("if(sd0<-125.){outColor=vec4(0.);return;}", "if(sd0<-125.){outColor=uProof>.5?vec4(0.):vec4(bg,1.);return;}")
    .replace("if(!hit){outColor=vec4(0.);return;}", "if(!hit){outColor=uProof>.5?vec4(0.):vec4(bg,1.);return;}");
  assert.notEqual(original, fs);
  assert.equal(sha(original), "253a3043eff2199aadd6a6e606dee22bd0cff1b94ca503de7dce75ddf16e94e4", "= source/freezing.frag, apart from the two transparent misses");
  assert.equal(sha(shader(iceEngine, "VS")), "eb71fa0cb92da99df2ee054b92628cf850fa693dc8e1672d08a1fefe5cc9d086", "= source/fullscreen.vert");
  const line = regex => iceEngine.match(regex)[1];
  assert.equal(sha(line(/^(function regionState\(x,y,t\)\{.*\})$/m)), "15cf918212fe9029adbdb515da0531fcb2c3d7ef36f690c751f62f87ef9ae34c", "regionState = source/core.js");
  assert.equal(sha(line(/(const clamp=\(x,a=0,b=1\)=>[^;]*,smooth=\(a,b,x\)=>\{[^}]*\};)/)), "aaa876d7c55287f7689bd3d36a9fdb349c3d47bd9b6ab31e4f80a10a1fa1cc06");
  assert.equal(sha(line(/(const sample=\(x,y\)=>field\[[^;]*\];)/)), "e03671d49680a3478ec877e3749af1ea687037c7758aa9b960a4758483c30465", "crystal sampling = source/core.js");
  assert.equal(sha(line(/^\s*(for\(let y=0;y<8;y\+\+\)for\(let x=0;x<20;x\+\+\)\{const cx=x\*100\+50[^\n]*?count\+\+;\})/m)), "d53c3bd7775eefacd72d0e2cb8a9420bb2c5f1586c9021da763d69758678e86f", "crystal roots = source/core.js");
  assert.match(iceEngine, /const random = seeded\(32719\)/, "the package's seeded generator");
  assert.match(iceEngine, /export const TARGET_FPS = 30;/, "the package's frame cap");
  assert.match(iceEngine, /export const START_TIME = 6\.5;/, "the package's starting moment, also its reduced-motion still frame");
  assert.match(iceEngine, /const SDF_LIMIT = 150;/, "the package caps its signed distance at 150");
  assert.match(iceEngine, /gl\.uniform4f\(uniform\.uWindow, 0, 0, W, H\); gl\.uniform1f\(uniform\.uProof, 0\); gl\.uniform1f\(uniform\.uSolo, 0\);/, "the master camera only; the close-up and proof are review tools");
});

test("the packages' settings contracts, values unchanged", () => {
  // Radiation: source/settings.js
  assert.deepEqual(Object.keys(RADIATION_STYLES), ["reactor", "meltdown", "phantom"]);
  assert.equal(Object.keys(RADIATION_COLORS).length, 10);
  assert.deepEqual(RADIATION_COLORS.green, ["Radioactive Green", "#80ff2b"]);
  assert.deepEqual(RADIATION_RANGES, { speed: [.25, 2], intensity: [.2, 1.4], width: [.08, .5], interval: [1, 12], distortion: [0, 1], ripple: [0, 1], fragmentation: [0, .65], recovery: [.4, 2], glow: [0, 1.5], cracks: [0, 1.5], afterglow: [.2, 3] });
  assert.deepEqual(createRadiation("meltdown"), { style: "meltdown", color: "green", customColor: "#80ff2b", waveform: "fracture", speed: 1, intensity: 1.25, width: .29, interval: 3, distortion: .9, ripple: .85, fragmentation: .5, recovery: .75, glow: .8, cracks: 1.2, afterglow: 1.4, particles: true, mist: true, scanLines: false, flicker: false });
  assert.equal(Object.keys(createRadiation()).length, 19);
  assert.deepEqual(radiationForStyle({ ...createRadiation(), color: "custom", customColor: "#123456" }, "phantom"), { ...createRadiation("phantom"), color: "custom", customColor: "#123456" }, "a new style keeps the colour (the package's chooseStyle)");
  assert.equal(radiationColor({ color: "custom", customColor: "#abcdef" }), "#abcdef");
  // Ice: source/materials.js and profiles/*.json
  assert.deepEqual(createIce("glacier"), { preset: "glacier", base: "#2588d2", frostColor: "#effbff", shadow: "#041d49", highlight: "#c8f0ff", depth: 1.25, transparency: .44, frost: .72, density: .92, size: 1.08, scattering: 1.15, roughness: .34 });
  assert.deepEqual(createIce("arctic"), { preset: "arctic", base: "#a2d3e8", frostColor: "#ffffff", shadow: "#235373", highlight: "#f1fdff", depth: .88, transparency: .25, frost: .94, density: .70, size: .84, scattering: .92, roughness: .64 });
  assert.deepEqual(createIce("deep"), { preset: "deep", base: "#145bb0", frostColor: "#b0e9ff", shadow: "#010d32", highlight: "#87dfff", depth: 1.72, transparency: .65, frost: .38, density: .84, size: 1.16, scattering: 1.35, roughness: .23 });
  assert.deepEqual(ICE_LIMITS, { depth: [.3, 2.2], transparency: [0, 1], frost: [0, 1], density: [0, 1], size: [.55, 1.2], scattering: [0, 2], roughness: [0, 1] });
  assert.deepEqual(ICE_COLOR_KEYS, ["base", "frostColor", "shadow", "highlight"]);
  assert.deepEqual(Object.values(ICE_PRESETS).map(preset => preset.name), ["Glacier Blue", "Arctic White", "Deep Ice"]);
  assert.ok(iceMatchesPreset(createIce("deep")));
  assert.equal(iceMatchesPreset({ ...createIce("deep"), frost: .5 }), false, "edited");
});

test("the settings: every key required, no other key, the packages' ranges; a text payload refuses a bad one and keeps a good one for the painter", () => {
  for (const key of Object.keys(ICE_PRESETS)) assert.ok(validateIce(createIce(key)), key);
  for (const key of Object.keys(RADIATION_STYLES)) assert.ok(validateRadiation(createRadiation(key)), key);
  const ice = createIce(), rad = createRadiation();
  const badIce = [{ ...ice, preset: "frozen" }, { ...ice, depth: 2.3 }, { ...ice, size: .5 }, { ...ice, base: "blue" }, { ...ice, roughness: "1" }, { ...ice, speed: 1 }, (({ roughness, ...rest }) => rest)(ice), null, [], "glacier", { ...ice, frost: NaN }];
  for (const value of badIce) assert.equal(validateIce(value), false, JSON.stringify(value));
  const badRad = [{ ...rad, style: "fallout" }, { ...rad, color: "teal" }, { ...rad, customColor: "#fff" }, { ...rad, waveform: "sine" }, { ...rad, interval: 13 }, { ...rad, fragmentation: .66 }, { ...rad, mist: 1 }, { ...rad, proof: true }, (({ flicker, ...rest }) => rest)(rad), null, "reactor"];
  for (const value of badRad) assert.equal(validateRadiation(value), false, JSON.stringify(value));
  assert.deepEqual(validateTextPayload(createTextPayload({ ice })), []);
  assert.deepEqual(validateTextPayload(createTextPayload({ radiation: rad })), []);
  assert.deepEqual(validateTextPayload(createTextPayload({ ice: { ...ice, depth: 9 } })), ["INVALID_ICE"]);
  assert.deepEqual(validateTextPayload(createTextPayload({ radiation: { ...rad, style: "x" } })), ["INVALID_RADIATION"]);
  assert.deepEqual(renderTextPayload(createTextPayload({ ice })).ice, ice);
  assert.deepEqual(renderTextPayload(createTextPayload({ radiation: rad })).radiation, rad);
  assert.equal("ice" in renderTextPayload(createTextPayload()), false, "a text without them is unchanged");
  assert.match(read("dist/wall-kit/messages.js"), /INVALID_ICE: "/);
  assert.match(read("dist/wall-kit/messages.js"), /INVALID_RADIATION: "/);
  assert.equal(ICE_MAX_TEXT, 80); assert.equal(RADIATION_MAX_TEXT, 80);
  assert.ok(iceTextFits("x".repeat(80))); assert.equal(iceTextFits("x".repeat(81)), false);
  assert.ok(radiationTextFits(" a \n b ")); assert.equal(radiationTextFits("y".repeat(81)), false);
});

// ---- the database: the same rule, checked on an isolated Postgres ----------------------------------------------------------------------------------------------
// The text validator and the helpers it calls, each in its latest Wall-migration definition, then the new migration on top.
const WALL_MIGRATIONS = readdirSync("supabase/migrations").filter(name => /_wall_/.test(name)).sort();
function latestDefinition(name) {
  let found = null;
  for (const file of WALL_MIGRATIONS) {
    const sql = read(`supabase/migrations/${file}`);
    for (const match of sql.matchAll(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$;`, "g"))) found = match[0];
  }
  assert.ok(found, name);
  return found.replace(/^create function/, "create or replace function");
}
async function database() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create schema private;");
  for (const name of ["wall_is_set", "wall_is_hex", "wall_in_range", "wall_is_gradient", "wall_keys_within", "wall_link_ok", "wall_fire_ok"]) await db.exec(latestDefinition(name));
  await db.exec(read("supabase/migrations/20261019100000_wall_text_living_fire.sql").replace(/^create or replace function private\.wall_fire_ok[\s\S]*?revoke all on function private\.wall_fire_ok\(jsonb\) from public, anon, authenticated;/m, ""));
  await db.exec(read("supabase/migrations/20261025120000_wall_text_ice_radiation.sql"));
  return db;
}

test("database parity: the migration refuses and accepts exactly what the editor does, on every text of the shared corpus and the edge cases", async () => {
  const db = await database();
  const payloads = [];
  const list = value => (Array.isArray(value) ? value : []);   // the corpus also holds deliberately malformed documents
  for (const entry of CORPUS) for (const stage of list(entry.doc?.stages)) for (const element of list(stage?.elements)) if (element?.type === "text") payloads.push([entry.name, element.payload]);
  const ice = createIce(), rad = createRadiation();
  for (const extra of [{ ice: { ...ice, preset: "deep" } }, { ice: { ...ice, base: "#ABCDEF" } }, { ice: { ...ice, depth: 0.3 } }, { ice: { ...ice, depth: 0.29999 } }, { ice: { ...ice, transparency: true } }, { ice: { ...ice, extra: 1 } },
    { radiation: { ...rad, color: "white" } }, { radiation: { ...rad, afterglow: 3 } }, { radiation: { ...rad, afterglow: 3.0001 } }, { radiation: { ...rad, width: 0.08 } }, { radiation: { ...rad, flicker: null } }, { radiation: "x" },
    { fire: createFire("mythic"), radiation: rad }, { ice: null, radiation: null }]) payloads.push([JSON.stringify(extra).slice(0, 60), createTextPayload(extra)]);
  assert.ok(payloads.length > 60);
  let checked = 0;
  for (const [name, payload] of payloads) {
    const { rows } = await db.query("select private.wall_text_payload_errors($1::jsonb) as errs", [JSON.stringify(payload)]);
    assert.deepEqual([...rows[0].errs].sort(), [...validateTextPayload(payload)].sort(), name);
    checked++;
  }
  assert.ok(checked > 60);
  await db.close();
});

test("migration 20261025120000: additive - two revoked helpers and the text validator with exactly two new lines; nothing else; nothing reads a plan", () => {
  const sql = read("supabase/migrations/20261025120000_wall_text_ice_radiation.sql");
  const code = sql.replace(/--.*$/gm, "");
  assert.deepEqual([...code.matchAll(/create or replace function (private\.\w+)\(/g)].map(match => match[1]), ["private.wall_ice_ok", "private.wall_radiation_ok", "private.wall_text_payload_errors"]);
  for (const name of ["wall_ice_ok", "wall_radiation_ok"]) assert.match(code, new RegExp(`revoke all on function private\\.${name}\\(jsonb\\) from public, anon, authenticated;`));
  assert.doesNotMatch(code, /\b(drop|truncate|alter table|insert into|update public|delete from|grant)\b/i);
  assert.doesNotMatch(code, /subscription|entitle|premium|plan_|billing/i, "every Pro Effect is free: no plan is read");
  const body = text => text.slice(text.indexOf("create or replace function private.wall_text_payload_errors"), text.indexOf("$$;", text.indexOf("create or replace function private.wall_text_payload_errors")) + 3);
  const previous = read("supabase/migrations/20261019100000_wall_text_living_fire.sql");
  assert.equal(body(sql).replace("  if private.wall_is_set(p -> 'ice') and not private.wall_ice_ok(p -> 'ice') then errs := array_append(errs, 'INVALID_ICE'); end if;\n", "")
    .replace("  if private.wall_is_set(p -> 'radiation') and not private.wall_radiation_ok(p -> 'radiation') then errs := array_append(errs, 'INVALID_RADIATION'); end if;\n", ""), body(previous));
});

// ---- the category: four effects, all free ------------------------------------------------------------------------------------------------------------------------
test("Pro Effects: Neon, Living Fire, Living Ice, Living Radiation - one registry, their own payload fields and section titles, all free and never restricted", () => {
  assert.deepEqual(PRO_EFFECTS.map(effect => [effect.key, effect.label, effect.title, effect.field]), [
    ["neon", "Neon", "NEON EFFECTS", "glow"], ["living-fire", "Living Fire", "LIVING FIRE EFFECTS", "fire"], ["living-ice", "Living Ice", "LIVING ICE EFFECTS", "ice"], ["living-radiation", "Living Radiation", "LIVING RADIATION EFFECTS", "radiation"]]);
  assert.ok(PRO_EFFECTS.every(effect => effect.tier === "free"), "every effect is free");
  assert.deepEqual(proEffect("neon").create(), NEON_GLOW);
  assert.deepEqual(proEffect("living-fire").create(), createFire("organic"));
  assert.deepEqual(proEffect("living-ice").create(), createIce("glacier"));
  assert.deepEqual(proEffect("living-radiation").create(), createRadiation("reactor"));
  // nothing restricts them: no code reads the tier, no payment / upgrade / entitlement check, save and publish untouched
  const code = text => text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace('"data-tier": effect.tier', "");   // (the card only names its tier: asserted below)
  for (const [name, source] of [["tools.js", tools], ["controls.js", controls], ["pro-effects.js", read("dist/wall-kit/pro-effects.js")], ["paint.js", read("dist/wall-kit/paint.js")], ["persistence.js", read("dist/wall/persistence.js")]]) {
    assert.doesNotMatch(code(source), /\.tier\b|subscription|entitle|upgrade|paywall|premium|isPro\b|billing/i, name);
  }
  const panel = read("dist/wall-editor/index.html");
  // the category is presented as Pro Effects: the Font Library's FIRST category (2026-10-25), above Gaming, with the font categories' own heading, toggle, count
  // and chevron; no separate section remains
  assert.match(tools, /const proGroup = \{ group: "Pro Effects", heading: h\("div", \{ class: "group ed-fx-group", text: "Pro Effects" \}\), list: h\("div", \{ id: "textEffectList", class: "ed-fx-list ed-fx-group" \}\)/);
  assert.match(tools, /fontList\.append\(proGroup\.heading, proGroup\.list\);\n\s+for \(const entry of fontGroups\) \{\n\s+fontList\.append\(entry\.heading\);/, "first, before the font categories");
  assert.match(tools, /for \(const entry of \[proGroup, \.\.\.fontGroups\]\) \{\n\s+entry\.open = false;/, "the same toggle as the font categories, collapsed at first");
  assert.match(tools, /proGroup\.list\.hidden = Boolean\(query\) \|\| \(accordion && !proGroup\.open\);/, "expanding it reveals the cards; a font search hides it");
  assert.match(tools, /const effectList = proGroup\.list;/);
  assert.doesNotMatch(panel, /id="textEffects"|Pro Effects</, "no standalone Pro Effects section");
  assert.match(read("dist/wall-editor/editor.css"), /\.ed-fx-group \{ display: none; \}/, "the 600-899px panel keeps its layout");
  assert.match(read("dist/wall-editor/editor-mobile.css"), /\.ed-fonts \.group\.ed-fx-group \{ display: block; \}/, "phones: a plain heading like the font categories there");
  assert.match(tools, /const effectCards = PRO_EFFECTS\.map\(effect => \{/, "one card per registered effect");
  assert.match(tools, /"data-tier": effect\.tier/, "the tier only identifies the card");
});

// ---- choosing an effect: never an empty result ------------------------------------------------------------------------------------------------------------------
test("choosing an effect: the text is kept, an empty text gets the placeholder, another animated effect is replaced, choosing it again changes nothing", () => {
  const plain = createTextPayload({ text: "LEGEND" });
  assert.deepEqual(proEffectPatch(plain, "living-ice"), { ice: createIce("glacier") }, "existing text preserved");
  assert.deepEqual(proEffectPatch(createTextPayload({ text: "   " }), "living-radiation"), { radiation: createRadiation("reactor"), text: PRO_EFFECT_PLACEHOLDER }, "empty text -> placeholder");
  assert.equal(PRO_EFFECT_PLACEHOLDER, "Write something about yourself here");
  const fire = createTextPayload({ text: "LEGEND", fire: createFire("mythic"), glow: { ...NEON_GLOW } });
  assert.deepEqual(proEffectPatch(fire, "living-ice"), { ice: createIce("glacier"), fire: undefined }, "switching replaces the animated effect; the earlier glow stays");
  assert.deepEqual(proEffectPatch(fire, "neon"), { fire: undefined }, "Neon on a fire text that already glows: the fire goes, the glow shows");
  assert.deepEqual(proEffectPatch(fire, "living-fire"), {}, "choosing the effect it shows again: no change, its tuning kept");
  const tuned = createTextPayload({ text: "X", ice: { ...createIce("deep"), frost: .1 } });
  assert.deepEqual(proEffectPatch(tuned, "living-ice"), {}, "re-selection never resets the user's settings");
  // what a text shows
  assert.equal(proEffectOf(plain), null);
  assert.equal(proEffectOf(createTextPayload({ glow: { ...NEON_GLOW } })).key, "neon");
  assert.equal(proEffectOf(fire).key, "living-fire", "an animated effect wins over the glow");
  assert.equal(proEffectOf(createTextPayload({ fire: createFire(), ice: createIce() })).key, "living-fire", "an older text with several shows the first, as the painter");
  assert.deepEqual(removeProEffectPatch(fire), { fire: undefined });
  assert.deepEqual(removeProEffectPatch(createTextPayload({ glow: { ...NEON_GLOW } })), { glow: undefined });
  assert.deepEqual(removeProEffectPatch(plain), {});
});

test("editor: a card applies its effect in ONE undo step - to the selected text(s), or as a new selected text with the placeholder; then its section opens", () => {
  assert.match(tools, /if \(!ids\.length\) addCustom\("text", createTextPayload\(\{ \.\.\.PRO_EFFECT_TEXT, \[effect\.field\]: effect\.create\(\) \}\), PRO_EFFECT_TEXT_SIZE\);/, "no selection: one new text showing the effect (addCustom selects it)");
  assert.match(tools, /text: PRO_EFFECT_PLACEHOLDER, fontFamily: "bebas-neue"/);
  assert.match(tools, /const patch = proEffectPatch\(stage\.elements\.find\(element => element\.id === id\)\?\.payload, effect\.key\);\n\s+if \(!Object\.keys\(patch\)\.length\) continue;/, "a text already showing it is left alone");
  assert.match(tools, /if \(changed\) run\(\{ ok: true, doc: current \}\);/, "all selected texts in one run (one undo step); nothing changed = no step");
  assert.match(tools, /setTool\("props"\);   \/\/ a phone opens Properties on the effect/);
  assert.match(tools, /revealProps\("pro"\);/);
  assert.match(tools, /button\.setAttribute\("aria-pressed", String\(texts\.length > 0 && texts\.every\(element => proEffectOf\(element\.payload\)\?\.key === effect\.key\)\)\)/, "the card of the effect the text shows is pressed");
  assert.doesNotMatch(tools, /Select a text element first, then choose an effect/, "an effect never asks for a selection first");
});

test("Properties: the chosen effect's own section first (expanded), the general sections after it collapsed; switching rebuilds; ordinary texts unchanged; phone too", () => {
  assert.match(controls, /const PRO_TEXT_DEFAULT = Object\.freeze\(\{ pro: true, content: false, effects: false, geometry: false, arrange: false, align: false \}\);/);
  assert.match(controls, /accordionState = effect \? proTextOpen : textSectionOpen;/, "effect texts keep their own open state; ordinary texts keep theirs");
  assert.match(controls, /const layout = effect \? \[\["pro", effect\.title\], \.\.\.TEXT_SECTIONS\] : TEXT_SECTIONS;/, "the effect section first, then Content & Typography, Text Style, Position & Size, Arrange, Align");
  assert.match(controls, /const textSectionOpen = \{ content: true, effects: true, geometry: false, arrange: false, align: false \};/, "an ordinary text opens as before");
  assert.match(controls, /if \(key === "pro"\) \{\n\s+Object\.assign\(proTextOpen, PRO_TEXT_DEFAULT\);/, "choosing an effect expands it and collapses the rest");
  assert.match(controls, /:\$\{proEffectOf\(element\.payload\)\?\.key \?\? "-"\}/, "a different effect is a different panel: heading and controls follow it");
  for (const key of ["neon", "living-fire", "living-ice", "living-radiation"]) assert.match(controls, new RegExp(`effect\\.key === "${key}"\\) \\w+Controls\\(root\\)`), key);
  assert.match(controls, /text: "Remove effect", "data-remove-effect": effect\.key/);
  // phone: the effect section first and open, then Content & typography and Text style collapsed
  assert.match(controls, /const pro = later\(effect\.title, true\);\n\s+pro\.node\.dataset\.proEffect = effect\.key;\n\s+proEffectControls\(pro\.inner, effect\);\n\s+body\.append\(pro\.node\);\n\s+const content = later\("Content & typography"\);\n\s+const style = later\("Text style"\);/);
  // effect controls are the effects' own, never typography; no other effect's controls show
  assert.match(controls, /\["depth", "Ice depth ×", "x"\], \["transparency", "Transparency %", "%"\], \["frost", "Frost coverage %", "%"\], \["density", "Crystal density %", "%"\], \["size", "Crystal size \/ spike length ×", "x"\], \["scattering", "Refraction \/ internal scattering ×", "x"\], \["roughness", "Surface roughness %", "%"\]/);
  for (const label of ["Wave speed", "Wave intensity", "Wave width", "Repeat interval · seconds", "Distortion strength", "Ripple amount", "Fragmentation", "Recovery speed", "Glow strength", "Crack brightness", "Afterglow · seconds", "Energy particles", "Energy mist", "Scan lines", "Gentle glitch"]) assert.ok(controls.includes(`"${label}"`), label);
  assert.match(controls, /if \(!proEffects\) \{\n\s+const glowDefaults/, "a Wall text's Neon glow lives in NEON EFFECTS, not the general sections; a GamID data text keeps its Glow");
});

// ---- rendering: one painter, Living Fire's safeguards, one shared budget -----------------------------------------------------------------------------------------
test("rendering: the editor, Preview and the published Wall share one painter; each renderer loads only for a Wall that uses it; no network; same-origin Worker", () => {
  const paint = read("dist/wall-kit/paint.js");
  assert.match(paint, /if \(content\.fire\) attachFire\(node, content, scale, item\);\n\s+else if \(content\.ice\) attachIce\(node, content, scale, item\);\n\s+else if \(content\.radiation\) attachRadiation\(node, content, scale, item\);/);
  for (const [light, engine, name] of [[iceLight, iceEngine, "living-ice"], [radLight, radEngine, "living-radiation"]]) {
    assert.match(light, new RegExp(`import\\("\\./${name}-engine\\.js"\\)`), `${name}: dynamic import only`);
    assert.doesNotMatch(light, new RegExp(`from "\\./${name}-engine\\.js"`));
    assert.doesNotMatch(engine + light, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|https?:\/\//, `${name}: no network use`);
    assert.match(engine, /new Worker\(new URL\("\.\/living-fire-sdf\.js", import\.meta\.url\), \{ type: "module" \}\)/, `${name}: the one same-origin distance-field Worker`);
    assert.equal((engine.match(/getContext\("webgl2"/g) ?? []).length, 1, `${name}: one WebGL2 context for the page`);
    assert.match(engine, /new IntersectionObserver\(/, `${name}: off-screen texts pause`);
    assert.match(engine, /if \(document\.hidden\) \{/, `${name}: hidden pages pause`);
    assert.match(engine, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/, `${name}: reduced motion = a still frame`);
    assert.match(engine, /KHR_parallel_shader_compile/);
    assert.match(engine, /webglcontextlost/, `${name}: a lost context falls back to static`);
    assert.match(engine, /dropContext\(true\)/, `${name}: the context is released when no such text is left`);
    assert.match(engine, /const IDLE_RELEASE_MS = 15000;/);
    assert.match(engine, /worker\?\.terminate\(\)/, `${name}: and its Worker`);
    assert.match(engine, /const interim = lastReady\.get\(entry\.id\);/, `${name}: an editor resize never flashes to static`);
    assert.match(light, /requestIdleCallback/, `${name}: the context is created when the page is idle`);
    assert.match(light, /canvas\.hidden = true;/, `${name}: no layout shift`);
    assert.match(light, /canvas\.setAttribute\("aria-hidden", "true"\);/);
  }
  const css = read("dist/wall-kit/wall-kit.css");
  assert.match(css, /\.wall-el\.is-ice-live > \.wall-text, \.wall-el\.is-radiation-live > \.wall-text \{ color: transparent !important;/, "live: the canvas draws the letters, the text stays for assistive technology");
  assert.match(css, /\.wall-el\.has-ice > \.wall-ice, \.wall-el\.has-radiation > \.wall-radiation \{ position: absolute; max-width: none; pointer-events: none; \}/, "a canvas never takes a tap");
  assert.match(css, /\.wall-el\.is-ice-static > \.wall-text \{[^}]*var\(--ice-frost/, "static: readable, in the chosen ice colours");
  assert.match(css, /\.wall-el\.is-radiation-static > \.wall-text \{[^}]*var\(--radiation-color/, "static: readable, in the energy colour");
});

test("Living Ice device safeguards (measured: ~0.2 ms per draw on a GPU, 400-550 ms with software rendering): never on a software renderer, gives up when draws keep blocking, may stop animating below ~10 fps", () => {
  assert.match(iceEngine, /const SOFTWARE_RENDERER = \/swiftshader\|llvmpipe\|softpipe\|software\|basic render\/i;/);
  assert.match(iceEngine, /if \(info && SOFTWARE_RENDERER\.test\(String\(gl\.getParameter\(info\.UNMASKED_RENDERER_WEBGL\)\)\)\) \{[^}]*failed = true; return false; \}/, "software rendering: the static fallback, nothing drawn");
  assert.match(iceEngine, /const SLOW_DRAW_MS = 100, SLOW_DRAWS = 3;/);
  assert.match(iceEngine, /slowDraws = stats\.lastCost > SLOW_DRAW_MS \? slowDraws \+ 1 : 0;\n\s+if \(slowDraws >= SLOW_DRAWS\) giveUp\(\);/, "three blocking draws in a row: give up");
  assert.match(iceEngine, /function giveUp\(\) \{\n\s+failed = true;\n\s+for \(const entry of \[\.\.\.entries\]\) \{ entry\.setState\("static"\);/);
  assert.match(iceEngine, /if \(slowWindow\.length === 30 && budget > 0 && mean > period \* \(budget > 1 \? 1\.6 : 3\)\) \{ budget--;/, "down to still frames when even one text cannot keep ~10 fps");
  assert.match(iceLight, /export const ICE_SUPERSAMPLE = 2;/);
  assert.match(iceLight, /Math\.min\(MAX_RENDER_W, Math\.round\(width \* ratio \* ICE_SUPERSAMPLE\)\)/, "drawn at twice its displayed size (no anti-aliasing of its own), never above the package's 1536 px camera");
  assert.doesNotMatch(radEngine, /SOFTWARE_RENDERER|giveUp/, "Living Radiation keeps 30 fps per text with software rendering (measured): no such guard");
});

test("one live budget for every animated effect: at most 4 animate at once on a page, whichever effects they are; a Fire-only Wall still gets 4", () => {
  assert.equal(EFFECT_LIVE_LIMIT, 4);
  reportLive("fire", 0); reportLive("ice", 0); reportLive("radiation", 0);
  assert.equal(liveAllowance("fire"), 4, "alone: the whole budget");
  reportLive("fire", 3);
  assert.equal(liveAllowance("ice"), 1); assert.equal(liveAllowance("fire"), 4, "an engine never counts itself");
  reportLive("ice", 1);
  assert.equal(liveAllowance("radiation"), 0); assert.equal(liveTotal(), 4);
  reportLive("fire", 0); reportLive("ice", 0);
  assert.equal(liveAllowance("radiation"), 4, "an engine with nothing to draw frees its share");
  for (const [engine, name] of [[fireEngine, "fire"], [iceEngine, "ice"], [radEngine, "radiation"]]) {
    assert.match(engine, new RegExp(`const available = Math\\.min\\(budget, liveAllowance\\("${name}"\\)\\);`), name);
    assert.match(engine, new RegExp(`const animate = !still && entry\\.visible && live < available;`), name);
    assert.match(engine, new RegExp(`reportLive\\("${name}", live\\);`), name);
    assert.match(engine, new RegExp(`if \\(!entries\\.size\\) \\{ reportLive\\("${name}", 0\\);`), `${name}: no text, no share`);
  }
});

test("the letters: the effects lay text out exactly like Living Fire (shared layout); the distance field keeps V3's cap unless an effect asks for its own", () => {
  const c = { measureText: text => ({ width: Array.from(text).length * 10 }) };
  assert.deepEqual(breakLines(c, "GAME ON STARTS", 75), ["GAME ON", "STARTS"]);
  assert.deepEqual(breakLines(c, "FIRE\nAND ICE", Infinity), ["FIRE", "AND ICE"]);
  assert.deepEqual(breakLines(c, "SUPERCALIFRAGILISTIC", 80), ["SUPERCAL", "IFRAGILI", "STIC"]);
  assert.equal(V3_FRAME.width, 1200); assert.equal(V3_FRAME.height, 640); assert.equal(V3_FRAME.sideRoom, 200);
  assert.equal(V3_FRAME.inkTop(100), (640 - 100) * 0.58, "V3's 58% rule");
  assert.ok(fireEngine.includes("(0.58 * DESIGN_H) / (0.58 * inkHeight + 0.8 * spec.size)"), "the same height rule as Living Fire");
  assert.match(radEngine, /layoutLetters\(entry\.spec, V3_FRAME\)/);
  assert.match(iceEngine, /export const ICE_FRAME = Object\.freeze\(\{ width: W, height: H, sideRoom: 180, fitHeight: ink => 560 \/ ink, inkTop: ink => \(H - ink\) \/ 2 \}\);/);
  const w = 40, h = 20, mask = new Uint8ClampedArray(w * h * 4);
  for (let y = 5; y < 15; y++) for (let x = 10; x < 30; x++) mask[(y * w + x) * 4 + 3] = 255;
  const v3 = buildSdf(mask, w, h), ice = buildSdf(mask, w, h, 3);
  assert.ok(v3.some(value => Math.abs(value) > 3), "V3: up to 256");
  assert.ok(ice.every(value => value >= -3 && value <= 3), "an effect's own cap");
  assert.deepEqual(Array.from(ice), Array.from(v3).map(value => Math.max(-3, Math.min(3, value))), "the same exact transform, only capped differently");
});
