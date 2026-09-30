// Post-manual-QA: I GIF support with SERVER-SIDE content validation. The Edge Function reads the STORED bytes, recognises the real format, reads the real size, counts a
// GIF's frames (decode-cost limits), deletes anything invalid, and registers through a service_role-only database function.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sniffImage, assetProblem, handleWallAssetRegister, WALL_ASSET_ORIGINS, WALL_ASSET_LIMITS } from "../supabase/functions/_shared/wall-assets.js";
import { ASSET_LIMITS, ASSET_TYPE_LABEL, checkAssetFile, describeAssetError } from "../dist/wall-kit/assets.js";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import * as ops from "../dist/wall-kit/ops.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ---------- real byte fixtures ----------
const le16 = n => [n & 0xff, (n >> 8) & 0xff];
function gif({ width = 64, height = 48, frames = 3, trailer = true } = {}) {
  const bytes = [...Buffer.from("GIF89a"), ...le16(width), ...le16(height), 0x80, 0, 0, 0, 0, 0, 255, 255, 255];   // global colour table: 2 entries
  bytes.push(0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00);                      // loop extension
  for (let f = 0; f < frames; f++) bytes.push(0x21, 0xf9, 0x04, 0x04, 0x0a, 0x00, 0x00, 0x00, 0x2c, 0, 0, 0, 0, ...le16(width), ...le16(height), 0x00, 0x02, 0x02, 0x44, 0x01, 0x00);
  if (trailer) bytes.push(0x3b);
  return new Uint8Array(bytes);
}
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const webp = new Uint8Array([...Buffer.from("RIFF"), 30, 0, 0, 0, ...Buffer.from("WEBPVP8X"), 10, 0, 0, 0, 0, 0, 0, 0, 0x1f, 0x03, 0x00, 0x67, 0x01, 0x00]);   // 800 x 360
const avif = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from("ftypavif"), 0, 0, 0, 0, ...Buffer.from("mif1avif"), 0, 0, 0, 0x14, ...Buffer.from("ispe"), 0, 0, 0, 0, 0, 0, 0x05, 0x00, 0, 0, 0x02, 0xd0]);   // 1280 x 720
const text = value => new Uint8Array(Buffer.from(value));

test("I format recognition reads the REAL bytes: GIF (frames counted), PNG, JPEG, WebP, AVIF - and refuses SVG, HTML, script and truncated or disguised files", () => {
  assert.deepEqual(sniffImage(gif({ width: 64, height: 48, frames: 3 })), { ok: true, mime: "image/gif", width: 64, height: 48, frames: 3 });
  assert.deepEqual(sniffImage(gif({ frames: 1 })).frames, 1);
  assert.deepEqual(sniffImage(png), { ok: true, mime: "image/png", width: 1, height: 1, frames: null });
  assert.deepEqual(sniffImage(jpeg), { ok: true, mime: "image/jpeg", width: 640, height: 480, frames: null });
  assert.deepEqual(sniffImage(webp), { ok: true, mime: "image/webp", width: 800, height: 360, frames: null });
  assert.deepEqual(sniffImage(avif), { ok: true, mime: "image/avif", width: 1280, height: 720, frames: null });
  assert.deepEqual(sniffImage(text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')), { ok: false, code: "UNSUPPORTED_IMAGE_TYPE" }, "SVG can carry script: never accepted");
  assert.deepEqual(sniffImage(text("<!doctype html><script>alert(1)</script>")), { ok: false, code: "UNSUPPORTED_IMAGE_TYPE" });
  assert.deepEqual(sniffImage(text("GIF89a<script>alert(1)</script>")), { ok: false, code: "INVALID_IMAGE" }, "only STARTING like a GIF is not a GIF");
  assert.deepEqual(sniffImage(gif({ trailer: false })), { ok: false, code: "INVALID_IMAGE" }, "a truncated GIF is refused");
  assert.deepEqual(sniffImage(new Uint8Array(0)), { ok: false, code: "UNSUPPORTED_IMAGE_TYPE" });
});

test("I limits: extension must match the real format; <= 8192 px a side; a GIF is limited by DECODE cost (<= 500 frames, <= 50M frame-pixels), not only by file size", () => {
  assert.equal(assetProblem(sniffImage(gif()), "gif", 1000), null);
  assert.equal(assetProblem(sniffImage(png), "gif", 1000), "WALL_ASSET_TYPE_MISMATCH", "a PNG renamed .gif");
  assert.equal(assetProblem(sniffImage(gif()), "png", 1000), "WALL_ASSET_TYPE_MISMATCH");
  assert.equal(assetProblem(sniffImage(gif({ frames: 501 })), "gif", 1000), "GIF_TOO_COMPLEX");
  assert.equal(assetProblem({ ok: true, mime: "image/gif", width: 4096, height: 4096, frames: 3 }, "gif", 1000), "GIF_TOO_COMPLEX", "50,331,648 frame-pixels");
  assert.equal(assetProblem({ ok: true, mime: "image/gif", width: 500, height: 500, frames: 200 }, "gif", 1000), null, "exactly 50M is allowed");
  assert.equal(assetProblem({ ok: true, mime: "image/png", width: 8193, height: 10, frames: null }, "png", 1000), "INVALID_WALL_ASSET_SIZE");
  assert.equal(assetProblem(sniffImage(png), "png", 5 * 1024 * 1024 + 1), "WALL_ASSET_TOO_LARGE");
  assert.deepEqual([WALL_ASSET_LIMITS.gifMaxFrames, WALL_ASSET_LIMITS.gifMaxFramePixels], [ASSET_LIMITS.gifMaxFrames, ASSET_LIMITS.gifMaxFramePixels], "the browser's early check and the server agree");
  const migration = read("supabase/migrations/20260927110000_wall_gif_assets.sql");
  assert.match(migration, /frame_count between 1 and 500 and width::bigint \* height::bigint \* frame_count::bigint <= 50000000/, "and so does the database");
});

// ---------- the handler, with an injected fetch standing in for Supabase ----------
const UID = "0f1e2d3c-4b5a-4968-8776-655443322110";
const env = { supabaseUrl: "https://project.supabase.co", anonKey: "anon-key", serviceKey: "service-key" };
function supabase({ user = { id: UID }, stored = gif(), register = { status: 200, body: [{ asset_id: "a", mime_type: "image/gif" }] } } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body });
    if (url.endsWith("/auth/v1/user")) return user ? new Response(JSON.stringify(user), { status: 200 }) : new Response("{}", { status: 401 });
    if (url.includes("/storage/v1/object/wall-media/") && (init.method ?? "GET") === "GET") return stored ? new Response(stored, { status: 200 }) : new Response("{}", { status: 404 });
    if (url.includes("/storage/v1/object/wall-media/") && init.method === "DELETE") return new Response("{}", { status: 200 });
    if (url.endsWith("/rest/v1/rpc/register_verified_wall_asset")) return new Response(JSON.stringify(register.body), { status: register.status });
    throw new Error(`unexpected ${url}`);
  };
  return { calls, fetchImpl };
}
const call = (server, { path = `${UID}/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d.gif`, origin = WALL_ASSET_ORIGINS[1], auth = "Bearer user-token", method = "POST" } = {}) =>
  handleWallAssetRegister({ request: new Request("https://project.supabase.co/functions/v1/wall-asset-register", { method, headers: { ...(origin ? { origin } : {}), ...(auth ? { authorization: auth } : {}), "content-type": "application/json" }, body: method === "POST" ? JSON.stringify({ path }) : undefined }), env, fetchImpl: server.fetchImpl });

test("I register: a valid animated GIF in the caller's own folder is read by the SERVER and registered with the values the server measured (service role, owner from the token)", async () => {
  const server = supabase({ stored: gif({ width: 320, height: 240, frames: 12 }) });
  const response = await call(server);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://gamid-testing-static.gamid.workers.dev");
  assert.equal((await response.json()).asset.mime_type, "image/gif");
  const read = server.calls.find(c => c.url.includes("/storage/v1/object/wall-media/") && c.method === "GET");
  assert.equal(read.headers.Authorization, "Bearer service-key", "the stored bytes are read with the service role");
  const registered = server.calls.find(c => c.url.endsWith("register_verified_wall_asset"));
  assert.equal(registered.headers.Authorization, "Bearer service-key");
  assert.deepEqual(JSON.parse(registered.body), { candidate_owner: UID, candidate_path: `${UID}/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d.gif`, candidate_mime: "image/gif", candidate_bytes: gif({ width: 320, height: 240, frames: 12 }).length, candidate_width: 320, candidate_height: 240, candidate_frames: 12 });
  assert.equal(server.calls.some(c => c.method === "DELETE"), false, "a valid image is kept");
});

test("I register refuses - and DELETES the stored file for - SVG disguised as GIF, a PNG renamed .gif, a too-heavy GIF, and an oversized file", async () => {
  for (const [stored, code] of [[text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "UNSUPPORTED_IMAGE_TYPE"], [png, "WALL_ASSET_TYPE_MISMATCH"], [gif({ frames: 501 }), "GIF_TOO_COMPLEX"], [new Uint8Array(5 * 1024 * 1024 + 1), "WALL_ASSET_TOO_LARGE"]]) {
    const server = supabase({ stored });
    const response = await call(server);
    assert.equal(response.status, 400, code);
    assert.deepEqual(await response.json(), { error: code });
    assert.ok(server.calls.some(c => c.method === "DELETE" && c.headers.Authorization === "Bearer service-key"), `${code}: the refused file is deleted`);
    assert.equal(server.calls.some(c => c.url.endsWith("register_verified_wall_asset")), false, `${code}: nothing is registered`);
  }
});

test("I register: identity comes only from the token, the path must be the caller's own folder, origins are allow-listed, and database refusals also delete the file", async () => {
  assert.equal((await call(supabase(), { auth: null })).status, 401);
  assert.equal((await call(supabase({ user: null }))).status, 401, "a token that does not prove a user");
  const otherFolder = supabase();
  const other = await call(otherFolder, { path: `11111111-2222-4333-8444-555555555555/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d.gif` });
  assert.deepEqual([other.status, (await other.json()).error], [400, "INVALID_WALL_ASSET_PATH"]);
  assert.equal(otherFolder.calls.some(c => c.url.includes("/storage/")), false, "another user's file is never even read");
  for (const path of [`${UID}/../x.gif`, `${UID}/x.svg`, `${UID}/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d.GIF`]) assert.equal((await call(supabase(), { path })).status, 400, path);
  assert.equal((await call(supabase(), { origin: "https://evil.example" })).status, 403);
  assert.equal((await call(supabase(), { origin: WALL_ASSET_ORIGINS[0] })).status, 200, "the github.io TESTING origin is allowed too");
  assert.equal((await call(supabase(), { method: "GET" })).status, 405);
  assert.equal((await call(supabase({ stored: null }))).status, 404);
  const limit = supabase({ register: { status: 400, body: { message: "WALL_ASSET_LIMIT" } } });
  const limited = await call(limit);
  assert.deepEqual([limited.status, (await limited.json()).error], [409, "WALL_ASSET_LIMIT"]);
  assert.ok(limit.calls.some(c => c.method === "DELETE"));
  const preflight = await call(supabase(), { method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-headers"), /authorization/);
});

test("I client: GIF is an accepted image everywhere the owner adds pictures; the browser only uploads to its folder and asks the verifying function - it never registers itself", () => {
  assert.ok(ASSET_LIMITS.types.includes("image/gif"));
  assert.equal(ASSET_TYPE_LABEL, "JPG, PNG, WebP, AVIF or GIF");
  assert.deepEqual(checkAssetFile({ type: "image/gif", size: 1000 }), { ok: true });
  assert.equal(checkAssetFile({ type: "image/svg+xml", size: 1000 }).ok, false, "still no SVG");
  for (const code of ["GIF_TOO_COMPLEX", "UNSUPPORTED_IMAGE_TYPE", "WALL_ASSET_TYPE_MISMATCH", "INVALID_IMAGE"]) assert.notEqual(describeAssetError({ code }), describeAssetError({ code: "nope" }), code);
  const client = read("dist/account/supabase-client.js");
  const upload = client.slice(client.indexOf("export async function uploadWallAsset"), client.indexOf("export async function loadWallAsset"));
  assert.match(client, /const WALL_ASSET_TYPES = \{[^}]*"image\/gif": "gif"/);
  assert.match(upload, /functions\/v1\/wall-asset-register/);
  assert.match(upload, /body: JSON\.stringify\(\{ path \}\)/, "only the path is sent: type, size and pixels are measured by the server");
  assert.doesNotMatch(upload, /register_my_wall_asset/);
  const html = read("dist/wall-editor/index.html");
  // (video media layers task: the Assets picker also takes MP4 / WebM - videos go through their own resumable upload and check; GIF stays a picture)
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp,image\/avif,image\/gif,video\/mp4,video\/webm"/);
  const tools = read("dist/wall-editor/tools.js");
  assert.match(tools, /accept: "video\/mp4"/, "GIF is not video: MP4 is a separate, background-only upload (split hardening + video background pass)");
  assert.match(read("supabase/config.toml"), /\[functions\.wall-asset-register\]\nverify_jwt = true/);
  assert.match(read("supabase/migrations/20260927110000_wall_gif_assets.sql"), /revoke execute on function public\.register_my_wall_asset\(text, text, integer, integer, integer\), private\.register_my_wall_asset_impl\(text, text, integer, integer, integer\) from authenticated;/);
});

test("I an animated GIF survives save / reload / render: the Wall stores only the asset id, and the picture is drawn by the browser from the owner's own file (animation intact)", () => {
  const assetId = "3f2b8c1e-5a4d-4e7b-9c60-1d2e3f4a5b6c";
  let doc = createDocument({ stageCount: 2 });
  doc = ops.addCustomElement(doc, "stage_1", { type: "image", payload: { assetId, fit: "contain", posX: 50, posY: 50, opacity: 1, aw: 320, ah: 240 }, width: 320, height: 240 }).doc;
  doc = ops.setBackground(doc, "stage_2", { kind: "image", assetId, fit: "cover", posX: 50, posY: 50, opacity: 1 }).doc;
  const reloaded = JSON.parse(JSON.stringify(doc));
  assert.equal(validateDocument(reloaded).valid, true);
  assert.deepEqual(reloaded, doc, "save + reload round-trips exactly");
  const make = tag => ({ tag, children: [], attrs: {}, style: { setProperty() {} }, className: "", setAttribute(name, value) { this.attrs[name] = String(value); }, append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); return node; } });
  const pictures = [];
  const walk = node => { if (node.tag === "img") pictures.push(node.attrs.src); node.children.forEach(walk); };
  const painted = paintDocument(reloaded, 500, make, { mode: "view", assets: { urlFor: id => (id === assetId ? "blob:https://gamid/abc" : null) } });
  painted.stages.forEach(walk);
  assert.deepEqual(pictures, ["blob:https://gamid/abc", "blob:https://gamid/abc"], "the element and the background draw the owner's own GIF file itself - an <img>, so it animates");
});
