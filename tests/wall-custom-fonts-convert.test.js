// Custom Wall fonts: TTF / OTF upload (Mazen's task 2026-10-18). Genuine fonts (tests/fixtures/fonts: Imperial Script TTF from Google Fonts, Source Sans 3 CFF OTF,
// both OFL) are validated and converted to WOFF2 by the gateway's own code with Node's Brotli (the same algorithm the Edge runtime's zlib provides). The WOFF2 must
// carry every source table byte for byte (null transform), pass the same validator as an uploaded WOFF2, and only that WOFF2 is ever stored.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
const decompress = data => new Uint8Array(brotliDecompressSync(data));
import { handleUsageUpload, detectFontFormat, validateSfnt, convertSfntToWoff2, prepareFont, validateWoff2, fontBrotliQuality, FONT, FONT_SOURCE } from "../supabase/functions/_shared/usage-upload.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const TTF = new Uint8Array(readFileSync("tests/fixtures/fonts/ImperialScript-Regular.ttf"));
const OTF = new Uint8Array(readFileSync("tests/fixtures/fonts/SourceSans3-Regular.otf"));
const WOFF2 = new Uint8Array(readFileSync("dist/wall-kit/fonts/PirataOne.woff2"));
const compress = (data, quality) => new Uint8Array(brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT, [constants.BROTLI_PARAM_QUALITY]: quality, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }));
const code = fn => { try { fn(); return "VALID"; } catch (error) { return error.message; } };
const u32 = (bytes, at, value) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(at, value);
const u16 = (bytes, at, value) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(at, value);
const record = (bytes, tag) => { const v = new DataView(bytes.buffer, bytes.byteOffset); for (let i = 0; i < v.getUint16(4); i++) { const at = 12 + 16 * i; if (String.fromCharCode(...bytes.subarray(at, at + 4)) === tag) return at; } return -1; };

// reads a WOFF2 directory and its decompressed stream (only for checking our own output)
function unpack(woff2) {
  const v = new DataView(woff2.buffer, woff2.byteOffset, woff2.byteLength); let at = 48; const entries = [];
  const TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB"];
  for (let i = 0; i < v.getUint16(12); i++) {
    const flags = woff2[at++]; let tag = TAGS[flags & 63];
    if ((flags & 63) === 63) { tag = String.fromCharCode(...woff2.subarray(at, at + 4)); at += 4; }
    let length = 0, b; do { b = woff2[at++]; length = length * 128 + (b & 127); } while (b & 128);
    entries.push({ tag, version: flags >> 6, length });
  }
  return { entries, stream: new Uint8Array(brotliDecompressSync(woff2.subarray(at, at + v.getUint32(20)))) };
}

test("formats are told apart by their bytes only: WOFF2, TTF ('\\0\\1\\0\\0' / 'true'), OTF ('OTTO'); collections, WOFF 1 and non-fonts are refused", () => {
  assert.equal(detectFontFormat(WOFF2), "woff2"); assert.equal(detectFontFormat(TTF), "ttf"); assert.equal(detectFontFormat(OTF), "otf");
  const tagged = tag => { const b = new Uint8Array(64); b.set(new TextEncoder().encode(tag)); return b; };
  assert.equal(detectFontFormat(tagged("true")), "ttf");
  for (const [label, bytes] of [["ttcf collection", tagged("ttcf")], ["WOFF 1", tagged("wOFF")], ["PNG named .ttf", new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Uint8Array(60)])],
    ["HTML named .otf", new TextEncoder().encode("<!doctype html><script>alert(1)</script>")], ["PDF", tagged("%PDF-1.7")], ["empty", new Uint8Array()], ["11 bytes", TTF.subarray(0, 11)]])
    assert.equal(code(() => detectFontFormat(bytes)), "INVALID_FONT_TYPE", label);
});

test("genuine sources: Imperial Script (TTF, glyf) and Source Sans 3 (OTF, CFF) are valid sfnt fonts", () => {
  const ttf = validateSfnt(TTF), otf = validateSfnt(OTF);
  assert.equal(ttf.flavor, 0x00010000); assert.ok(ttf.tables.some(t => t.tag === "glyf") && ttf.tables.some(t => t.tag === "loca"));
  assert.equal(otf.flavor, 0x4f54544f); assert.ok(otf.tables.some(t => t.tag === "CFF "));
  for (const { tables } of [ttf, otf]) assert.deepEqual(tables.map(t => t.tag), [...tables.map(t => t.tag)].sort(), "tables come back in tag order");
});

test("malformed or hostile sources are refused before any conversion: structure, bounds, overlaps, duplicates, outlines, head magic, size", () => {
  const mutate = (fn, base = TTF) => { const b = base.slice(); fn(b); return b; };
  const cases = {
    "truncated table directory": TTF.slice(0, 40),
    "zero tables": mutate(b => u16(b, 4, 0)),
    "65 tables": mutate(b => u16(b, 4, 65)),
    "table past the end of the file": mutate(b => u32(b, record(b, "name") + 12, 10 * 1024 * 1024)),
    "misaligned table offset": mutate(b => u32(b, record(b, "name") + 8, new DataView(b.buffer).getUint32(record(b, "name") + 8) + 1)),
    "table inside the directory": mutate(b => u32(b, record(b, "name") + 8, 12)),
    "overlapping tables": mutate(b => u32(b, record(b, "post") + 8, new DataView(b.buffer).getUint32(record(b, "name") + 8))),
    "duplicate table tag": mutate(b => b.set(new TextEncoder().encode("cmap"), record(b, "name"))),
    "non-printable tag": mutate(b => b.set([1, 2, 3, 4], record(b, "kern") >= 0 ? record(b, "kern") : record(b, "gasp"))),
    "missing a required table (renamed name)": mutate(b => b.set(new TextEncoder().encode("zzzz"), record(b, "name"))),
    "glyf without loca": mutate(b => b.set(new TextEncoder().encode("zzzz"), record(b, "loca"))),
    "no outlines (CFF renamed)": mutate(b => b.set(new TextEncoder().encode("zzzz"), record(b, "CFF ")), OTF),
    "OTTO flavor with TrueType outlines": mutate(b => u32(b, 0, 0x4f54544f)),
    "bad head magic number": mutate(b => u32(b, new DataView(b.buffer).getUint32(record(b, "head") + 8) + 12, 0x12345678)),
  };
  for (const [label, bytes] of Object.entries(cases)) assert.equal(code(() => validateSfnt(bytes)), "INVALID_FONT", label);
  const huge = new Uint8Array(FONT_SOURCE.maxBytes + 1); huge.set(TTF.subarray(0, 12));
  assert.equal(code(() => validateSfnt(huge)), "FONT_SOURCE_TOO_LARGE", "over 8 MiB");
  assert.equal(code(() => validateSfnt(WOFF2)), "INVALID_FONT_TYPE", "a WOFF2 is not an sfnt");
});

test("conversion: the genuine TTF and OTF become a valid WOFF2 that carries every source table byte for byte (null transform), within 2 MiB", () => {
  for (const [label, source] of [["Imperial Script TTF", TTF], ["Source Sans 3 OTF", OTF]]) {
    const woff2 = convertSfntToWoff2(source, { compress });
    assert.equal(validateWoff2(woff2).numTables, validateSfnt(source).tables.length, label);
    assert.ok(woff2.length <= FONT.maxBytes && woff2.length < source.length, `${label}: smaller than the source (${source.length} -> ${woff2.length})`);
    assert.equal(woff2.length % 4, 0, "padded to 4 bytes");
    assert.equal(new DataView(woff2.buffer).getUint32(4), new DataView(source.buffer).getUint32(0), "flavor kept");
    const { entries, stream } = unpack(woff2);
    const tables = validateSfnt(source).tables;
    assert.deepEqual(entries.map(e => [e.tag, e.length]), tables.map(t => [t.tag, t.length]));
    for (const entry of entries) assert.equal(entry.version, entry.tag === "glyf" || entry.tag === "loca" ? 3 : 0, `${label} ${entry.tag}: null transform`);
    let at = 0;
    for (const t of tables) { assert.deepEqual(stream.subarray(at, at + t.length), source.subarray(t.offset, t.offset + t.length), `${label} ${t.tag} is byte-identical`); at += t.length; }
    assert.equal(at, stream.length, "nothing else is in the stream");
  }
});

test("conversion is deterministic (same font -> same WOFF2 -> same SHA-256 -> stored once) and fails closed", () => {
  const a = convertSfntToWoff2(TTF, { compress }), b = convertSfntToWoff2(TTF.slice(), { compress });
  assert.equal(createHash("sha256").update(a).digest("hex"), createHash("sha256").update(b).digest("hex"));
  assert.equal(code(() => convertSfntToWoff2(TTF, {})), "FONT_CONVERSION_UNAVAILABLE", "no Brotli in the runtime");
  assert.equal(code(() => convertSfntToWoff2(TTF, { compress: () => { throw new Error("boom"); } })), "FONT_CONVERSION_FAILED");
  assert.equal(code(() => convertSfntToWoff2(TTF, { compress: () => new Uint8Array() })), "FONT_CONVERSION_FAILED");
  assert.equal(code(() => convertSfntToWoff2(TTF, { compress: () => new Uint8Array(FONT.maxBytes) })), "FONT_TOO_LARGE", "a converted font over 2 MiB is never stored");
  assert.deepEqual([fontBrotliQuality(150_000), fontBrotliQuality(2 * 1024 * 1024), fontBrotliQuality(2 * 1024 * 1024 + 1)], [9, 9, 5]);
  const passthrough = prepareFont(WOFF2, { compress });
  assert.deepEqual([passthrough.format, passthrough.converted, passthrough.woff2], ["woff2", false, WOFF2], "an uploaded WOFF2 is stored as it is");
  assert.deepEqual([prepareFont(OTF, { compress }).format, prepareFont(OTF, { compress }).converted], ["otf", true]);
});

// ---- the gateway's unified font route ----
const BASE = "https://upvtrczefcvigxdyuylw.supabase.co", OWNER = "11111111-1111-4111-8111-111111111111", UPLOAD = "33333333-3333-4333-8333-333333333333";
const env = { supabaseUrl: BASE, serviceKey: "private-service-fixture", anonKey: "publishable-fixture" };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function gateway({ reserveError = null, reserveState = "ACTIVE", withCompress = true } = {}) {
  const calls = []; let stored = null;
  const fetchImpl = async (url, options = {}) => {
    const call = { url, method: options.method }; calls.push(call);
    if (url.endsWith("/auth/v1/user")) return json({ id: OWNER });
    if (url.includes("/rpc/")) {
      const name = url.split("/").at(-1), b = JSON.parse(options.body || "{}"); call.rpc = name; call.args = b;
      if (name === "usage_gateway_probe") return json({}, 403);
      if (name === "reserve_usage_upload") return reserveError ? json({ message: reserveError }, 400) : json({ upload_id: UPLOAD, state: reserveState, created_at: new Date().toISOString(), expected_bytes: b.candidate_bytes });
      if (name === "usage_upload_action") return b.candidate_action === "complete" && stored === null && reserveState !== "COMPLETE" ? json({ message: "UPLOAD_SIZE_MISMATCH" }, 400) : json({ state: "COMPLETE" });
      if (name === "register_wall_font") return json({ font_id: "44444444-4444-4444-8444-444444444444", display_name: b.candidate_name, duplicate: reserveState === "COMPLETE" });
      return new Response(null, { status: 204 });
    }
    if (url.includes("/storage/v1/object/wall-fonts/") && options.method === "POST") { stored = options.body; call.body = options.body; return json({}); }
    throw Error(`Unexpected ${options.method} ${url}`);
  };
  const run = async (route, { method = "POST", body, headers = {} } = {}) => {
    const response = await handleUsageUpload({ env, fetchImpl, fontCompress: withCompress ? compress : null, fontDecompress: withCompress ? decompress : null, request: new Request(`${BASE}/functions/v1/usage-upload/${route}`, { method, body, headers: { apikey: env.anonKey, Authorization: "Bearer owner-fixture", ...headers } }) });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  return { run, calls, reserve: () => calls.find(c => c.rpc === "reserve_usage_upload")?.args, stored: () => calls.find(c => c.body)?.body, register: () => calls.find(c => c.rpc === "register_wall_font")?.args };
}
const fontHeaders = (type = "font/ttf") => ({ "Content-Type": type, "x-gamid-font-license": "accepted", "x-gamid-font-name": encodeURIComponent("Imperial Script") });

test("gateway: a TTF / OTF is converted and ONLY the validated WOFF2 is reserved, stored and registered, named by its own SHA-256", async () => {
  for (const [source, type, format] of [[TTF, "font/ttf", "ttf"], [OTF, "font/otf", "otf"]]) {
    const g = gateway();
    const r = await g.run("font", { body: source, headers: fontHeaders(type) });
    assert.equal(r.status, 201); assert.deepEqual([r.body.format, r.body.converted], [format, true]);
    const expected = convertSfntToWoff2(source, { compress });
    const sha = createHash("sha256").update(expected).digest("hex");
    assert.deepEqual(g.reserve(), { candidate_owner: OWNER, candidate_bucket: "wall-fonts", candidate_path: `${OWNER}/fonts/${sha}.woff2`, candidate_bytes: expected.length, candidate_mime: "font/woff2" }, "quota is reserved for the stored WOFF2, not the source");
    assert.deepEqual(new Uint8Array(g.stored()), expected, "the stored bytes are the converted WOFF2");
    assert.equal(g.register().candidate_sha256, sha);
  }
});

test("gateway: a WOFF2 through the same route is stored unchanged; the declared type is never trusted", async () => {
  const g = gateway();
  const r = await g.run("font", { body: WOFF2, headers: fontHeaders("application/octet-stream") });
  assert.equal(r.status, 201); assert.deepEqual([r.body.format, r.body.converted], ["woff2", false]);
  assert.deepEqual(new Uint8Array(g.stored()), WOFF2);
  const spoof = gateway();
  const html = await spoof.run("font", { body: new TextEncoder().encode("<!doctype html><script>alert(1)</script>"), headers: fontHeaders("font/ttf") });
  assert.deepEqual([html.status, html.body.error], [400, "INVALID_FONT_TYPE"], "HTML declared as font/ttf");
  assert.equal(spoof.reserve(), undefined, "nothing reserved");
});

test("gateway: size limits, licence, conversion unavailable, malformed sources, limit and quota all refuse before anything is stored", async () => {
  const bigTtf = new Uint8Array(FONT_SOURCE.maxBytes + 100); bigTtf.set(TTF.subarray(0, 12));
  const bigWoff2 = new Uint8Array(FONT.maxBytes + 100); bigWoff2.set(WOFF2.subarray(0, 48));
  const broken = TTF.slice(); u32(broken, new DataView(broken.buffer).getUint32(record(broken, "head") + 8) + 12, 0);
  const cases = [
    ["source over 8 MiB", {}, bigTtf, fontHeaders(), 413, "FONT_SOURCE_TOO_LARGE"],
    ["WOFF2 over 2 MiB", {}, bigWoff2, fontHeaders("font/woff2"), 413, "FONT_TOO_LARGE"],
    ["no licence confirmation", {}, TTF, { "Content-Type": "font/ttf" }, 400, "WALL_FONT_LICENSE_REQUIRED"],
    ["runtime without Brotli", { withCompress: false }, TTF, fontHeaders(), 503, "FONT_CONVERSION_UNAVAILABLE"],
    ["malformed TTF", {}, broken, fontHeaders(), 400, "INVALID_FONT"],
    ["the 3-font limit", { reserveError: "WALL_FONT_LIMIT" }, TTF, fontHeaders(), 409, "WALL_FONT_LIMIT"],
    ["the account quota", { reserveError: "ACCOUNT_STORAGE_QUOTA_EXCEEDED" }, OTF, fontHeaders("font/otf"), 413, "ACCOUNT_STORAGE_QUOTA_EXCEEDED"],
  ];
  for (const [label, options, body, headers, status, error] of cases) {
    const g = gateway(options);
    const r = await g.run("font", { body, headers });
    assert.deepEqual([r.status, r.body?.error], [status, error], label);
    assert.equal(g.stored(), undefined, `${label}: nothing stored`);
  }
  const duplicate = gateway({ reserveState: "COMPLETE" });
  const again = await duplicate.run("font", { body: TTF, headers: fontHeaders() });
  assert.equal(again.status, 201); assert.equal(again.body.font.duplicate, true); assert.equal(duplicate.stored(), undefined, "an identical font is not stored again");
});

test("gateway: capabilities report the accepted formats from a real Brotli round, without any account data or authentication", async () => {
  const ok = await gateway().run("capabilities", { method: "GET", headers: { Authorization: "" } });
  assert.deepEqual([ok.status, ok.body], [200, { fonts: ["woff2", "ttf", "otf"], conversion: true }]);
  const none = await gateway({ withCompress: false }).run("capabilities", { method: "GET" });
  assert.deepEqual(none.body, { fonts: ["woff2"], conversion: false });
  const entry = read("supabase/functions/usage-upload/index.ts");
  assert.match(entry, /const zlib = await import\('node:zlib'\);/, "Brotli is loaded defensively: a runtime without it cannot stop the gateway from starting");
  assert.match(entry, /\} catch \{ fontCompress = null; fontDecompress = null; \}/);
  assert.match(entry, /BROTLI_MODE_FONT/);
});

test("editor and client: the picker offers .woff2, .ttf and .otf; the client sends every format to the one font route", () => {
  const html = read("dist/wall-editor/index.html"), client = read("dist/account/supabase-client.js"), tools = read("dist/wall-editor/tools.js");
  assert.match(html, /<input id="fontFile" type="file" accept="\.woff2,\.ttf,\.otf,font\/woff2,font\/ttf,font\/otf" hidden \/>/);
  assert.match(client, /await request\("\/functions\/v1\/usage-upload\/font", \{/);
  assert.match(client, /export const WALL_FONT_SOURCE_MAX_BYTES = 8 \* 1024 \* 1024;/);
  for (const key of ["FONT_SOURCE_TOO_LARGE", "FONT_CONVERSION_FAILED", "FONT_CONVERSION_UNAVAILABLE", "INVALID_FONT_TYPE", "FONT_TOO_LARGE"]) assert.match(tools, new RegExp(`${key}: "`));
  assert.match(tools, /converted from \$\{String\(font\.format\)\.toUpperCase\(\)\} to WOFF2/);
});
