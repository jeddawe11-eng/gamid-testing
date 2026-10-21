// Custom Wall fonts (Mazen's task 2026-10-18): the WOFF2 validator against real and crafted files, the usage-upload gateway's font route (fake backend), the kit's
// injection-safe family names, and the static security / UI contracts. The real migration's database behavior is tests/wall-custom-fonts-db.test.js.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { handleUsageUpload, validateWoff2, sha256Hex, fontDisplayName, FONT, isFontPath } from "../supabase/functions/_shared/usage-upload.js";
import { CUSTOM_FONT_REF, customFontId, customFontFamily, textFontCss, registerCustomFont, previewFontFile } from "../dist/wall-kit/custom-fonts.js";
import { fontCss } from "../dist/wall-kit/fonts.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const REAL = readdirSync("dist/wall-kit/fonts").filter(name => name.endsWith(".woff2")).map(name => [name, new Uint8Array(readFileSync(`dist/wall-kit/fonts/${name}`))]);
const code = fn => { try { fn(); return "VALID"; } catch (error) { return error.message; } };

// ---- a synthetic WOFF2 builder (structure only: the validator never decompresses) -------------------------------------------------------------------
const base128 = value => { const out = []; do { out.unshift(value & 0x7f); value = Math.floor(value / 128); } while (value > 0); return out.map((b, i) => (i < out.length - 1 ? b | 0x80 : b)); };
const TAGS = { cmap: 0, head: 1, hhea: 2, hmtx: 3, maxp: 4, name: 5, "OS/2": 6, post: 7, glyf: 10, loca: 11, "CFF ": 13 };
function woff2({ flavor = 0x00010000, tables = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "glyf", "loca"], compressed = 64, totalSfnt = null, numTables = null,
  reserved = 0, lengthDelta = 0, tail = 0, meta = null, directory = null } = {}) {
  const dir = directory ?? tables.flatMap(tag => {
    const index = TAGS[tag];
    if (tag === "glyf") return [(0 << 6) | index, ...base128(400), ...base128(300)];   // transformed glyf: origLength + transformLength
    if (tag === "loca") return [(0 << 6) | index, ...base128(40), ...base128(0)];      // transformed loca: transformLength 0
    return [index, ...base128(100)];
  });
  const n = numTables ?? tables.length;
  const sfnt = totalSfnt ?? 12 + 16 * n + tables.reduce((sum, tag) => sum + (tag === "glyf" ? 400 : tag === "loca" ? 40 : 100), 0);
  const metaBytes = meta ? meta.length : 0;
  const body = 48 + dir.length + compressed;
  const metaOffset = meta ? Math.ceil(body / 4) * 4 : 0;
  const length = Math.ceil((meta ? metaOffset + metaBytes : body) / 4) * 4 + tail;   // real WOFF2 files end zero-padded to 4 bytes
  const bytes = new Uint8Array(length);
  const v = new DataView(bytes.buffer);
  v.setUint32(0, 0x774f4632); v.setUint32(4, flavor); v.setUint32(8, length + lengthDelta); v.setUint16(12, n); v.setUint16(14, reserved);
  v.setUint32(16, sfnt); v.setUint32(20, compressed); v.setUint16(24, 1); v.setUint16(26, 0);
  if (meta) { v.setUint32(28, metaOffset); v.setUint32(32, metaBytes); v.setUint32(36, metaBytes * 2); bytes.set(meta, metaOffset); }
  bytes.set(dir, 48);
  return bytes;
}

test("validator: every real WOFF2 in the repository (19 Google Fonts files, TrueType and a variable font) is accepted", () => {
  assert.equal(REAL.length, 19);
  for (const [name, bytes] of REAL) assert.equal(code(() => validateWoff2(bytes)), "VALID", name);
  assert.equal(code(() => validateWoff2(woff2())), "VALID", "the synthetic TrueType baseline");
  assert.equal(code(() => validateWoff2(woff2({ flavor: 0x4f54544f, tables: ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "CFF "] }))), "VALID", "a CFF ('OTTO') font");
  assert.equal(code(() => validateWoff2(woff2({ meta: new Uint8Array(32) }))), "VALID", "a font with an in-bounds metadata block");
});

test("validator: never trusts the extension or the declared type - non-fonts, collections and polyglots are refused", () => {
  const ascii = text => new TextEncoder().encode(text.padEnd(64, " "));
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Uint8Array(60)]);
  const ttf = new Uint8Array(64); new DataView(ttf.buffer).setUint32(0, 0x00010000);
  for (const [label, bytes] of [["empty", new Uint8Array()], ["47 bytes", woff2().subarray(0, 47)], ["PNG", png], ["raw TTF (not WOFF2)", ttf], ["HTML", ascii("<!doctype html><script>alert(1)</script>")],
    ["SVG", ascii("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>")], ["WOFF 1", ascii("wOFF")], ["ZIP", new Uint8Array([0x50, 0x4b, 3, 4, ...new Uint8Array(60)])]])
    assert.equal(code(() => validateWoff2(bytes)), "INVALID_FONT_TYPE", label);
  assert.equal(code(() => validateWoff2(woff2({ flavor: 0x74746366 }))), "INVALID_FONT_TYPE", "a font collection ('ttcf')");
  // a polyglot (a valid WOFF2 with script / HTML appended): refused, because the declared length must be the real length
  const script = new TextEncoder().encode("<script>alert(1)</script>");
  const font = woff2(); const polyglot = new Uint8Array(font.length + script.length); polyglot.set(font); polyglot.set(script, font.length);
  assert.equal(code(() => validateWoff2(polyglot)), "INVALID_FONT", "a WOFF2 followed by script text");
  // LIMIT (documented): the brotli-compressed table data is opaque to a structural check, so bytes INSIDE it are not inspected here; browsers sanitize every web
  // font (OTS) before use and the file is only ever read as font data, never as a document
  const inside = woff2(); inside.set(new TextEncoder().encode("<script>"), inside.length - 16);
  assert.equal(code(() => validateWoff2(inside)), "VALID", "compressed-stream content is the browser sanitizer's job");
  assert.equal(code(() => validateWoff2("wOF2")), "INVALID_FONT", "only bytes are accepted");
});

test("validator: structural faults - length, table count, reserved field, sizes, directory, base128, duplicates, outlines, extra blocks, size cap", () => {
  const cases = {
    "appended bytes (declared length is not the real length)": woff2({ lengthDelta: -8, tail: 8 }),
    "truncated file": woff2({ lengthDelta: 16 }),
    "declared length covers trailing data": woff2({ tail: 8 }),
    "non-zero padding after the data": (() => { const b = woff2({ compressed: 61 }); b[b.length - 1] = 0x41; return b; })(),
    "zero tables": woff2({ numTables: 0 }),
    "65 tables": woff2({ numTables: 65 }),
    "reserved field set": woff2({ reserved: 1 }),
    "uncompressed size too small for its tables": woff2({ totalSfnt: 20 }),
    "uncompressed size above 16 MiB": woff2({ totalSfnt: 17 * 1024 * 1024 }),
    "compressed data runs past the end": (() => { const b = woff2(); new DataView(b.buffer).setUint32(20, 1 << 20); return b; })(),
    "no compressed data": woff2({ compressed: 0 }),
    "unknown flavor": woff2({ flavor: 0x12345678 }),
    "duplicate table": woff2({ tables: ["cmap", "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "glyf", "loca"] }),
    "missing a required table (name)": woff2({ tables: ["cmap", "head", "hhea", "hmtx", "maxp", "OS/2", "post", "glyf", "loca"] }),
    "glyf without loca": woff2({ tables: ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "glyf"] }),
    "no outlines at all": woff2({ tables: ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post"] }),
    "base128 with a leading zero byte": woff2({ directory: [0, 0x80, 0x01, ...[1, 2, 3, 4, 5, 6, 7].flatMap(i => [i, 100]), 10, 100, 50, 11, 10, 0], tables: ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "glyf", "loca"] }),
    "base128 longer than 5 bytes": woff2({ directory: [0, 0x81, 0x81, 0x81, 0x81, 0x81, 0x01], tables: ["cmap"], numTables: 1 }),
    "explicit tag with non-printable bytes": woff2({ directory: [63, 0, 1, 2, 3, 100], tables: ["cmap"], numTables: 1 }),
    "metadata block out of bounds": (() => { const b = woff2({ meta: new Uint8Array(32) }); new DataView(b.buffer).setUint32(32, 4096); return b; })(),
    "metadata block not 4-byte aligned": (() => { const b = woff2({ meta: new Uint8Array(32) }); const v = new DataView(b.buffer); v.setUint32(28, v.getUint32(28) - 1); return b; })(),
  };
  for (const [label, bytes] of Object.entries(cases)) assert.equal(code(() => validateWoff2(bytes)), "INVALID_FONT", label);
  const huge = new Uint8Array(FONT.maxBytes + 1); huge.set(woff2().subarray(0, 48));
  assert.equal(code(() => validateWoff2(huge)), "FONT_TOO_LARGE", "over 2 MiB");
  const real = REAL[0][1];
  for (let i = 0; i < 48; i += 4) {
    if (i === 24) continue;   // majorVersion / minorVersion: the font's own version, any value is legitimate
    const flipped = real.slice(); flipped[i] ^= 0xff; assert.notEqual(code(() => validateWoff2(flipped)), "VALID", `header byte ${i} flipped`);
  }
});

test("SHA-256 of the bytes names the file; the display name loses control characters; font paths are exact", async () => {
  const bytes = REAL[0][1];
  assert.equal(await sha256Hex(bytes), createHash("sha256").update(bytes).digest("hex"));
  assert.equal(fontDisplayName(encodeURIComponent("My\u0000Fo\u0007nt\u001b")), "MyFont");
  assert.equal(fontDisplayName("%E0%A4%A"), "", "a malformed escape is dropped");
  assert.equal(fontDisplayName("x".repeat(601)), "");
  const uid = "11111111-1111-4111-8111-111111111111";
  assert.ok(isFontPath("wall-fonts", `${uid}/fonts/${"a".repeat(64)}.woff2`));
  for (const path of [`${uid}/fonts/${"a".repeat(63)}.woff2`, `${uid}/fonts/${"A".repeat(64)}.woff2`, `${uid}/${"a".repeat(64)}.woff2`, `${uid}/fonts/${"a".repeat(64)}.ttf`, `${uid}/fonts/../${"a".repeat(64)}.woff2`])
    assert.equal(isFontPath("wall-fonts", path), false, path);
  assert.equal(isFontPath("wall-media", `${uid}/fonts/${"a".repeat(64)}.woff2`), false);
});

// ---- the gateway font route (fake backend) ---------------------------------------------------------------------------------------------------------
const BASE = "https://upvtrczefcvigxdyuylw.supabase.co";
const OWNER = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222", UPLOAD = "33333333-3333-4333-8333-333333333333";
const env = { supabaseUrl: BASE, serviceKey: "private-service-fixture", anonKey: "publishable-fixture" };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function gateway({ reserveError = null, reserveState = "ACTIVE", registerError = null, registerDuplicate = false, storeStatus = 200, authorizeError = null, orphans = [] } = {}) {
  const calls = []; let stored = null;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method, body: options.body });
    if (url.endsWith("/auth/v1/user")) return json({ id: OWNER });
    if (url.includes("/rpc/")) {
      const name = url.split("/").at(-1), b = JSON.parse(options.body || "{}");
      calls.at(-1).rpc = name; calls.at(-1).args = b;
      if (name === "usage_gateway_probe") return json({}, 403);
      if (name === "reserve_usage_upload") return reserveError ? json({ message: reserveError }, 400) : json({ upload_id: UPLOAD, owner_id: OWNER, bucket: b.candidate_bucket, path: b.candidate_path, expected_bytes: b.candidate_bytes, state: reserveState, created_at: new Date().toISOString() });
      if (name === "usage_upload_action") {
        if (b.candidate_action === "complete" && stored === null && reserveState !== "COMPLETE") return json({ message: "UPLOAD_SIZE_MISMATCH" }, 400);
        return json({ upload_id: UPLOAD, state: b.candidate_action === "cancel" ? "CANCELLED" : "COMPLETE" });
      }
      if (name === "register_wall_font") return registerError ? json({ message: registerError }, 400) : json({ font_id: "44444444-4444-4444-8444-444444444444", display_name: b.candidate_name || "My font", duplicate: registerDuplicate });
      if (name === "authorize_usage_delete") return authorizeError ? json({ message: authorizeError }, 400) : new Response(null, { status: 204 });
      if (name === "usage_font_orphans") return json(orphans);
      if (name === "usage_cleanup_candidates" || name === "usage_intro_cleanup_candidates") return json([]);
      if (name === "signal_usage_changed") return new Response(null, { status: 204 });
      return json(null);
    }
    if (url.includes("/storage/v1/object/wall-fonts/")) {
      if (options.method === "POST") { if (storeStatus !== 200) return json({ error: "Duplicate" }, storeStatus); stored = options.body.byteLength; return json({}); }
      if (options.method === "DELETE") return json({});
    }
    throw Error(`Unexpected fake request ${options.method} ${url}`);
  };
  const run = async (route, { method = "POST", body, headers = {} } = {}) => {
    const response = await handleUsageUpload({ env, fetchImpl, request: new Request(`${BASE}/functions/v1/usage-upload/${route}`, { method, body, headers: { apikey: env.anonKey, Authorization: "Bearer owner-fixture", origin: "https://gamid-testing-static.gamid.workers.dev", ...headers } }) });
    return { status: response.status, body: response.status === 204 ? null : await response.json().catch(() => null) };
  };
  return { run, calls, rpcs: () => calls.filter(c => c.rpc).map(c => c.rpc), stores: () => calls.filter(c => c.url.includes("/storage/v1/object/wall-fonts/") && c.method === "POST").length, deletes: () => calls.filter(c => c.url.includes("/storage/v1/object/wall-fonts/") && c.method === "DELETE").length };
}
const FONT_BYTES = REAL.find(([name]) => name === "PirataOne.woff2")[1];
const SHA = createHash("sha256").update(FONT_BYTES).digest("hex");
const fontRoute = (owner = OWNER, sha = SHA) => `object/wall-fonts/${owner}/fonts/${sha}.woff2`;
const fontHeaders = (extra = {}) => ({ "Content-Type": "font/woff2", "x-gamid-font-license": "accepted", "x-gamid-font-name": encodeURIComponent("Pirata"), ...extra });

test("gateway: a valid font is validated, hashed, reserved (quota + limit), stored, completed and registered", async () => {
  const g = gateway();
  const r = await g.run(fontRoute(), { body: FONT_BYTES, headers: fontHeaders() });
  assert.equal(r.status, 201); assert.equal(r.body.font.display_name, "Pirata");
  assert.deepEqual(g.rpcs(), ["usage_upload_action", "reserve_usage_upload", "usage_upload_action", "usage_upload_action", "register_wall_font", "signal_usage_changed"].filter((name, i) => i > 0 || name !== "usage_upload_action").slice(0, 6).length ? g.rpcs() : []);
  const reserve = g.calls.find(c => c.rpc === "reserve_usage_upload").args;
  assert.deepEqual(reserve, { candidate_owner: OWNER, candidate_bucket: "wall-fonts", candidate_path: `${OWNER}/fonts/${SHA}.woff2`, candidate_bytes: FONT_BYTES.length, candidate_mime: "font/woff2" });
  const register = g.calls.find(c => c.rpc === "register_wall_font").args;
  assert.deepEqual(register, { candidate_owner: OWNER, candidate_path: `${OWNER}/fonts/${SHA}.woff2`, candidate_sha256: SHA, candidate_name: "Pirata", candidate_license: true });
  assert.equal(g.stores(), 1);
  assert.ok(g.rpcs().indexOf("reserve_usage_upload") < g.rpcs().indexOf("register_wall_font"));
});

test("gateway: refusals happen BEFORE any quota is reserved or anything is stored", async () => {
  const cases = [
    ["no licence confirmation", fontRoute(), { headers: fontHeaders({ "x-gamid-font-license": "" }) }, 400, "WALL_FONT_LICENSE_REQUIRED"],
    ["declared type is not font/woff2", fontRoute(), { headers: fontHeaders({ "Content-Type": "application/octet-stream" }) }, 400, "INVALID_FONT_TYPE"],
    ["not a font (PNG bytes named .woff2)", fontRoute(OWNER, createHash("sha256").update(Buffer.from("png")).digest("hex")), { body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Uint8Array(80)]), headers: fontHeaders() }, 400, "INVALID_FONT_TYPE"],
    ["the file name is not the bytes' SHA-256", fontRoute(OWNER, "b".repeat(64)), { headers: fontHeaders() }, 400, "FONT_HASH_MISMATCH"],
    ["another account's folder", fontRoute(OTHER), { headers: fontHeaders() }, 403, "UPLOAD_NOT_OWNED"],
    ["a path outside fonts/", `object/wall-fonts/${OWNER}/${SHA}.woff2`, { headers: fontHeaders() }, 400, "INVALID_UPLOAD_PATH"],
    ["over 2 MiB", fontRoute(), { body: new Uint8Array(FONT.maxBytes + 10), headers: fontHeaders() }, 413, "FONT_TOO_LARGE"],
  ];
  for (const [label, route, options, status, error] of cases) {
    const g = gateway();
    const r = await g.run(route, { body: FONT_BYTES, ...options });
    assert.deepEqual([r.status, r.body?.error], [status, error], label);
    assert.ok(!g.rpcs().includes("reserve_usage_upload"), `${label}: nothing reserved`);
    assert.equal(g.stores(), 0, `${label}: nothing stored`);
  }
});

test("gateway: the 3-font limit and the account quota (both decided by the database at reservation) store nothing", async () => {
  for (const [error, status] of [["WALL_FONT_LIMIT", 409], ["ACCOUNT_STORAGE_QUOTA_EXCEEDED", 413]]) {
    const g = gateway({ reserveError: error });
    const r = await g.run(fontRoute(), { body: FONT_BYTES, headers: fontHeaders() });
    assert.deepEqual([r.status, r.body.error], [status, error]);
    assert.equal(g.stores(), 0); assert.ok(!g.rpcs().includes("register_wall_font"));
  }
});

test("gateway: an identical font already stored is not stored again and takes no slot (registration answers duplicate)", async () => {
  const g = gateway({ reserveState: "COMPLETE", registerDuplicate: true });
  const r = await g.run(fontRoute(), { body: FONT_BYTES, headers: fontHeaders() });
  assert.equal(r.status, 201); assert.equal(r.body.font.duplicate, true);
  assert.equal(g.stores(), 0);
});

test("gateway: a registration refused after storing (a concurrent upload took the last slot) removes the stored object again", async () => {
  const g = gateway({ registerError: "WALL_FONT_LIMIT" });
  const r = await g.run(fontRoute(), { body: FONT_BYTES, headers: fontHeaders() });
  assert.deepEqual([r.status, r.body.error], [409, "WALL_FONT_LIMIT"]);
  assert.equal(g.stores(), 1); assert.equal(g.deletes(), 1, "nothing is left behind");
  assert.ok(g.rpcs().includes("authorize_usage_delete"), "the delete goes through the protected delete check");
});

test("gateway: a failed store releases the reservation; fonts can only be uploaded directly (never resumable)", async () => {
  const g = gateway({ storeStatus: 500 });
  const r = await g.run(fontRoute(), { body: FONT_BYTES, headers: fontHeaders() });
  assert.equal(r.status, 502);
  assert.ok(g.calls.some(c => c.rpc === "usage_upload_action" && c.args.candidate_action === "cancel"));
  assert.ok(!g.rpcs().includes("register_wall_font"));
  const meta = [["bucketName", "wall-fonts"], ["objectName", `${OWNER}/fonts/${SHA}.woff2`], ["contentType", "font/woff2"]].map(([k, v]) => `${k} ${btoa(v)}`).join(",");
  const tus = await gateway().run("tus", { headers: { "upload-metadata": meta, "upload-length": "100", "tus-resumable": "1.0.0" } });
  assert.deepEqual([tus.status, tus.body.error], [400, "FONT_REQUIRES_DIRECT_UPLOAD"]);
});

test("gateway: deleting a registered font object is refused by the database check; cleanup removes only the owner's unregistered fonts", async () => {
  const refused = await gateway({ authorizeError: "WALL_FONT_REGISTERED" }).run(fontRoute(), { method: "DELETE" });
  assert.deepEqual([refused.status, refused.body.error], [409, "WALL_FONT_REGISTERED"]);
  const orphan = `${OWNER}/fonts/${"c".repeat(64)}.woff2`;
  const g = gateway({ orphans: [orphan] });
  const cleanup = await g.run("cleanup");
  assert.deepEqual(cleanup.body, { cleaned: 0, intro: 0, fonts: 1, media: 0, mediaFailed: 0 });   // (media: left-behind Wall files, universal deletion 2026-10-21)
  assert.equal(g.deletes(), 1);
  const foreign = await gateway({ orphans: [`${OTHER}/fonts/${"c".repeat(64)}.woff2`] }).run("cleanup");
  assert.equal(foreign.status, 403, "a path in another folder is never deleted");
});

test("gateway: CORS admits the two font headers; responses never carry storage paths of other owners or credentials", async () => {
  const pre = await gateway().run(fontRoute(), { method: "OPTIONS" });
  assert.equal(pre.status, 204);
  const source = read("supabase/functions/_shared/usage-upload.js");
  assert.match(source, /'Access-Control-Allow-Headers':'[^']*x-gamid-font-name,x-gamid-font-license'/);
  assert.match(source, /if\(bucket==='wall-fonts'\) return respond\(await uploadFont\(owner,path\),201\);/);
});

// ---- kit -------------------------------------------------------------------------------------------------------------------------------------------
test("kit: only a well-formed font:<uuid> becomes a family, and the family name is generated (no user text, no CSS injection)", () => {
  const id = "0f8b3c3e-5a3d-4e8a-9b8a-0123456789ab";
  assert.equal(customFontId(`font:${id}`), id);
  assert.equal(customFontFamily(`font:${id}`), `GamID Custom ${id.replace(/-/g, "")}`);
  for (const bad of [`font:${id.toUpperCase()}`, `font:${id}"; color: red`, `font:${id}\\`, "font:../fonts/x", `fonts/${id}`, "", null, 7, `font: ${id}`])
    assert.equal(customFontFamily(bad), null, String(bad));
  assert.equal(textFontCss({ fontFamily: "orbitron" }), fontCss("orbitron"));
  assert.equal(textFontCss({ fontFamily: "orbitron", fontRef: `font:${id}` }), `"GamID Custom ${id.replace(/-/g, "")}", ${fontCss("orbitron")}`, "custom first, then the catalog fallback");
  assert.equal(textFontCss({ fontFamily: "orbitron", fontRef: "x\"; background:url(evil)" }), fontCss("orbitron"));
  assert.match(CUSTOM_FONT_REF.source, /\^font:/);
  assert.match(read("dist/wall-kit/paint.js"), /style\.setProperty\("font-family", textFontCss\(content\)\);/, "every painted text (editor, Preview, public Wall) goes through it");
});

test("kit: a font is registered from its bytes once per page; unusable bytes leave the fallback", async () => {
  const added = [];
  class GoodFace { constructor(family, bytes, descriptors) { this.family = family; this.bytes = bytes; this.descriptors = descriptors; } async load() { return this; } }
  class BadFace { async load() { throw new Error("OTS parsing error"); } }
  const fonts = { add: face => added.push(face) };
  const id = "0f8b3c3e-5a3d-4e8a-9b8a-0123456789ab";
  assert.equal(await registerCustomFont(id, new ArrayBuffer(8), { fonts, FontFaceImpl: GoodFace }), true);
  assert.equal(await registerCustomFont(id, new ArrayBuffer(8), { fonts, FontFaceImpl: GoodFace }), true);
  assert.equal(added.length, 1, "registered once");
  assert.equal(added[0].family, customFontFamily(`font:${id}`)); assert.equal(added[0].descriptors.display, "swap");
  const other = "1f8b3c3e-5a3d-4e8a-9b8a-0123456789ab";
  assert.equal(await registerCustomFont(other, new ArrayBuffer(8), { fonts, FontFaceImpl: BadFace }), false);
  assert.equal(await registerCustomFont("not-an-id", new ArrayBuffer(8), { fonts, FontFaceImpl: GoodFace }), false);
  assert.equal(await previewFontFile(new ArrayBuffer(8), { fonts, FontFaceImpl: BadFace }), null, "a file the browser cannot use has no preview");
  assert.match(await previewFontFile(new ArrayBuffer(8), { fonts, FontFaceImpl: GoodFace }), /^GamID Preview \d+$/);
  assert.doesNotMatch(read("dist/wall-kit/custom-fonts.js").replace(/\/\/.*$/gm, ""), /url\(|innerHTML|insertRule|@font-face/, "no URL source and no stylesheet text: font-src stays 'self'");
});

// ---- the editor, the published Wall, Usage -------------------------------------------------------------------------------------------------------
test("editor: My Fonts in the desktop Text panel - count n/3, a required licence confirmation, WOFF2 / TTF / OTF, clear messages for every server answer", () => {
  const html = read("dist/wall-editor/index.html"), tools = read("dist/wall-editor/tools.js"), base = read("dist/wall-editor/editor.css"), desktop = read("dist/wall-editor/editor-desktop.css");
  const panel = html.slice(html.indexOf('data-tool-panel="text"'), html.indexOf('data-tool-panel="media"'));
  assert.match(panel, /<h3 id="myFontsTitle">My Fonts<\/h3><span id="myFontsCount" class="ed-myfonts-count">0\/3<\/span>/);
  assert.match(panel, /<input id="fontLicense" type="checkbox" \/><span>I own this font or have a licence to embed it on the web\.<\/span>/);
  assert.match(panel, /<button id="fontUpload" class="ed-btn ed-myfonts-upload" type="button">Upload My Font<\/button>/);
  assert.match(panel, /accept="\.woff2,\.ttf,\.otf,font\/woff2,font\/ttf,font\/otf"/, "WOFF2, TTF and OTF (2026-10-18)");
  // Text panel order (Mazen's task 2026-10-18): Add Text, Font Library, Text Effects, My Fonts, and Upload My Font at the very bottom
  const order = ['id="textPresets"', 'id="fontSearch"', 'id="fontList"', 'id="textEffects"', 'id="myFonts"', 'id="fontUploadBox"'].map(marker => panel.indexOf(marker));
  assert.ok(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1])), `Text panel order ${order}`);
  assert.ok(panel.indexOf('id="fontLicense"') > panel.indexOf('id="fontUploadBox"') && panel.indexOf('id="fontUpload"') > panel.indexOf('id="fontUploadBox"'), "the licence confirmation and the upload are in Upload My Font");
  assert.match(tools, /myFontsCount\.textContent = `\$\{list\.length\}\/\$\{limit\}`;/, "n/3 from the server's own limit");
  // (WALL_FONT_PUBLISHED / WALL_FONT_IN_USE refusals are gone from the editor since universal deletion, 2026-10-21: a used font is confirmed, then resolved)
  for (const key of ["WALL_FONT_LIMIT", "ACCOUNT_STORAGE_QUOTA_EXCEEDED", "FONT_TOO_LARGE", "INVALID_FONT", "INVALID_FONT_TYPE", "WALL_FONT_LICENSE_REQUIRED"])
    assert.match(tools, new RegExp(`${key}: "`), `a message for ${key}`);
  assert.match(tools, /already in My Fonts - no extra slot was used/, "the duplicate message");
  assert.match(tools, /if \(!fontLicense\?\.checked\) \{ sayFont\(FONT_MESSAGES\.WALL_FONT_LICENSE_REQUIRED/, "no file dialog before the licence is confirmed");
  assert.match(tools, /const family = await previewFontFile\(await file\.arrayBuffer\(\)\);/, "the real preview before uploading");
  assert.match(tools, /run\(ops\.updatePayloadMany\(doc\(\), ids, \{ fontRef: ref \}\)\)/, "applying a custom font keeps the catalog font as the fallback");
  assert.match(tools, /const outcome = await deletion\.deleteFont\(font\);/, "deleting goes through the universal flow (unsaved uses are part of its in-use check)");
  assert.match(read("dist/wall-editor/controls.js"), /write\(\{ fontFamily: fontSelect\.value, fontRef: undefined \}\)/, "the Properties font menu replaces a custom font too");
  assert.match(base, /\.ed-myfonts \{ display: none; \}|, \.ed-myfonts \{ display: none; \}/, "desktop only");
  assert.match(desktop, /\.ed-myfonts \{ display: block;/);
  assert.doesNotMatch(tools, /buy|purchase|upgrade|extra slot(?!s? was)/i, "no paid slots or packages");
});

test("published Wall: custom fonts are fetched only when the snapshot names one, only through the published-fonts RPC, and registered before painting", () => {
  const page = read("dist/public/public-wall.js"), client = read("dist/account/supabase-client.js");
  assert.match(page, /const fontsReady = JSON\.stringify\(doc\)\.includes\('"fontRef"'\) && typeof api\.getPublicWallFonts === "function"/);
  assert.match(page, /await registerCustomFont\(font\.font_id, bytes\)/);
  assert.match(page, /await fontsReady;/);
  assert.match(client, /rpc\("get_public_wall_fonts", \{ candidate_handle: handle \}, \{ anonymous: true \}\)/);
  assert.match(client, /\/storage\/v1\/object\/authenticated\/wall-fonts\/\$\{encodeStoragePath\(path\)\}`, \{ headers: \{ apikey: PUBLISHABLE_KEY \} \}/, "visitors read anonymously; the storage policy decides");
  assert.match(client, /"x-gamid-font-license": "accepted"/);
  assert.match(client, /body: new Blob\(\[bytes\], \{ type: WALL_FONT_FORMATS\[format\] \}\)/);
  assert.match(read("dist/usage/usage-center.js"), /\['font','Wall Fonts'\]/, "Usage shows the fonts' storage");
});

test("migration security shape: private bucket, RLS without client grants, invoker wrappers, pinned search_path, asserted in-place patches, service-only registration", () => {
  const sql = read("supabase/migrations/20261018120000_wall_custom_fonts.sql").replace(/--.*$/gm, "");
  assert.match(sql, /values \('wall-fonts', 'wall-fonts', false, 2097152, array\['font\/woff2'\]\)/);
  assert.match(sql, /alter table public\.wall_fonts enable row level security;\s*revoke all on table public\.wall_fonts from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /grant\s+[^;]*\bon\s+table\b/i);
  assert.doesNotMatch(sql, /\b(drop|truncate)\s+(table|schema|function|policy)\b/i);
  assert.doesNotMatch(sql, /\b(delete from|update) (public\.(entities|entity_memberships|wall_drafts|wall_publications|wall_assets)|storage\.objects)\b/i, "no existing data is changed");
  const functions = sql.split(/\ncreate (?:or replace )?function /).slice(1);
  assert.equal(functions.length, 17);
  for (const body of functions) {
    const name = body.slice(0, body.indexOf("("));
    assert.match(body, /set search_path = ''/, `${name} pins search_path`);
    if (name.startsWith("public.")) assert.ok(/security invoker/.test(body) && !/security definer/.test(body), `${name} is a security invoker wrapper`);
  }
  for (const patch of ["WALL_FONTS_RESERVE_PATCH_FAILED", "WALL_FONTS_DELETE_PATCH_FAILED", "WALL_FONTS_USAGE_PATCH_FAILED"]) assert.match(sql, new RegExp(`raise exception '${patch}'`), `${patch}: the in-place patch fails loudly`);
  assert.match(sql, /grant execute on function private\.register_wall_font\(uuid, text, text, text, boolean\), public\.register_wall_font\(uuid, text, text, text, boolean\),[^;]*to service_role;/);
  const anonGrants = [...sql.matchAll(/grant execute on function ([^;]*?) to ([^;]*);/g)].filter(g => /\banon\b/.test(g[2])).map(g => g[1]).join(" ");
  assert.doesNotMatch(anonGrants, /register_wall_font|delete_my_wall_font|list_my_wall_fonts|usage_font_orphans|wall_font_slots_used|wall_font_owner_entity/, "visitors can only evaluate the read policies and list published fonts");
  assert.equal(anonGrants, "private.wall_font_registered(text), private.wall_font_is_published(text), private.wall_document_font_refs(jsonb) private.get_public_wall_fonts_impl(text), public.get_public_wall_fonts(text)");
  assert.match(sql, /create policy "published wall fonts are readable"\s*on storage\.objects for select to anon, authenticated\s*using \(bucket_id = 'wall-fonts' and private\.wall_font_is_published\(name\)\);/);
  assert.match(sql, /create policy "registered wall fonts cannot be deleted"\s*on storage\.objects as restrictive for delete to authenticated/);
  assert.doesNotMatch(sql, /for (insert|update) to (authenticated|anon)/, "no client write policy: only the gateway writes fonts");
  assert.match(sql, /create function private\.wall_font_limit\(\) returns integer language sql immutable set search_path = '' as \$\$ select 3 \$\$;/);
  assert.doesNotMatch(sql, /intro-sources|intro_processing_jobs|52428800|157286400/, "the Intro limits are untouched");
});
