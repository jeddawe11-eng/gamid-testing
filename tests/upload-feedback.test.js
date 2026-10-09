// ISS-0001..ISS-0005 (Product Memory): the shared upload error box and its classification, Wall asset error mapping (stale video limit, quota refusal), Intro
// upload / processing messages, gateway refusal codes, and the avatar orphan cleanup. All network is stubbed; no real account or storage is touched.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { classifyUploadError, renderUploadError, USAGE_ERROR_CODES } from "../dist/app/upload-feedback.js";
import { describeAssetError, ASSET_ERROR_MESSAGES, VIDEO_LIMITS, describeVideoJobFailure } from "../dist/wall-kit/assets.js";
import { errorMessage, describeIntroProcessingFailure } from "../dist/account/domain.js";
import { uploadResumable, STORAGE_QUOTA_MESSAGE, TUS_CHUNK_BYTES } from "../dist/account/resumable-upload.js";
import { createAssetStore } from "../dist/wall-editor/assets.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

// a tiny DOM: enough for renderUploadError (createElement / textContent / attributes / listeners / append)
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; this.className = ""; this.textContent = ""; this.type = ""; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...nodes) { this.children.push(...nodes); }
  async click() { for (const fn of this.listeners.click ?? []) await fn(); }
  find(className) { return this.children.flatMap(child => [child, ...(child.find ? [child.find(className)].flat() : [])]).filter(Boolean).find(child => child.className === className) ?? null; }
}
const doc = { createElement: tag => new Node(tag) };
const buttons = box => box.children[1].children.map(button => button.textContent);

test("classification: storage / Wall limits offer View Usage and never Retry; transport and expired uploads retry; hard validation never does", () => {
  for (const code of USAGE_ERROR_CODES) assert.deepEqual(classifyUploadError({ code, status: 413 }), { usage: true, retryable: false }, code);
  for (const [error, retryable] of [
    [{ code: "NETWORK_ERROR", status: 0 }, true],
    [{ code: "UPLOAD_EXPIRED", status: 400 }, true],          // a fresh upload of the same file succeeds
    [{ code: "UPLOAD_GATEWAY_FAILED", status: 502 }, true],
    [{ code: "WALL_VIDEO_UPLOAD_FAILED", status: 0 }, true],
    [{ code: "WALL_VIDEO_UPLOAD_FAILED", status: 503 }, true],
    [{ code: "WALL_VIDEO_UPLOAD_FAILED", status: 404 }, false], // the server refused this upload as such
    [{ code: "INTRO_UPLOAD_FAILED", status: 403 }, false],
    [{ code: "INVALID_FILE_TYPE", status: 400 }, false],
    [{ code: "FILE_TOO_LARGE" }, false],
    [{ code: "CHUNK_TOO_LARGE", status: 413 }, false],
    [{ code: "VIDEO_CODEC_UNSUPPORTED", status: 400 }, false],
    [{ code: "SOMETHING_NEW", status: 500 }, true],
    [{ code: "SOMETHING_NEW", status: 400 }, false],
    [{ code: "SOURCE_HDR_UNSUPPORTED" }, false],               // a conversion verdict
  ]) assert.equal(classifyUploadError(error).retryable, retryable, JSON.stringify(error));
});

test("the box: role=alert, the reason, Retry only when retryable and possible, View Usage only for usage codes, Dismiss always", async () => {
  const calls = [];
  const quota = renderUploadError(doc, { message: STORAGE_QUOTA_MESSAGE, code: "ACCOUNT_STORAGE_QUOTA_EXCEEDED", status: 413 }, { id: "x", onRetry: () => calls.push("retry"), onViewUsage: () => { calls.push("usage"); return true; }, onDismiss: () => calls.push("dismiss") });
  assert.equal(quota.attributes.role, "alert");
  assert.equal(quota.id, "x");
  assert.equal(quota.children[0].textContent, STORAGE_QUOTA_MESSAGE);
  assert.deepEqual(buttons(quota), ["View Usage", "×"]);
  assert.equal(quota.children[1].children[1].attributes["aria-label"], "Dismiss this message");
  await quota.children[1].children[0].click();
  await quota.children[1].children[1].click();
  assert.deepEqual(calls, ["usage", "dismiss"]);

  const network = renderUploadError(doc, { message: "No connection.", code: "NETWORK_ERROR", status: 0 }, { onRetry: () => calls.push("retry"), onDismiss() {} });
  assert.deepEqual(buttons(network), ["Retry", "×"]);
  await network.children[1].children[0].click();
  assert.equal(calls.at(-1), "retry");
  assert.deepEqual(buttons(renderUploadError(doc, { message: "Choose a JPG.", code: "INVALID_FILE_TYPE" }, { onRetry() {}, onDismiss() {} })), ["×"], "hard validation: dismiss only");
  assert.deepEqual(buttons(renderUploadError(doc, { message: "x", code: "NETWORK_ERROR", status: 0 }, { onDismiss() {} })), ["×"], "no Retry without a way to retry");

  const missing = renderUploadError(doc, { message: "Too big.", code: "WALL_VIDEO_LIMIT" }, { onViewUsage: () => false, onDismiss() {} });
  await missing.children[1].children[0].click();
  assert.match(missing.children[0].textContent, /Open USAGE at the top of the page/, "when Usage is not mounted, the box says where to look instead");
});

test("ISS-0002: the Wall client no longer states a 10-video limit; limit messages name the limit without a figure", () => {
  const source = read("dist/wall-kit/assets.js");
  assert.doesNotMatch(source, /10 videos|maxVideos/);
  assert.equal("maxVideos" in VIDEO_LIMITS, false);
  for (const code of ["WALL_VIDEO_LIMIT", "WALL_ASSET_LIMIT", "ACCOUNT_STORAGE_QUOTA_EXCEEDED"]) assert.doesNotMatch(describeAssetError({ code }), /\d/, code);
  assert.match(describeAssetError({ code: "WALL_VIDEO_LIMIT" }), /Wall video limit/);
  assert.match(describeVideoJobFailure("WALL_VIDEO_LIMIT"), /video limit/);
  assert.equal(ASSET_ERROR_MESSAGES.ACCOUNT_STORAGE_QUOTA_EXCEEDED, STORAGE_QUOTA_MESSAGE, "one quota wording everywhere");
});

test("ISS-0003: a Wall image or video refused for the storage quota is reported as the quota (View Usage, no Retry), never as 'Try again'; a video is never called an image", async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  globalThis.location = { origin: "https://testing.gamid.example", pathname: "/wall-editor/", search: "", hash: "" };
  globalThis.history = { replaceState() {} };
  const token = `h.${Buffer.from(JSON.stringify({ sub: "11111111-1111-4111-8111-111111111111", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.s`;
  const seen = [];
  globalThis.fetch = async (url, options = {}) => {
    seen.push(`${options.method || "GET"} ${url}`);
    if (url.includes("grant_type=password")) return json({ access_token: token, refresh_token: "r", expires_in: 3600, user: { id: "u" } });
    if (url.includes("/usage-upload/")) return json({ error: "ACCOUNT_STORAGE_QUOTA_EXCEEDED" }, 413);   // POST (image) and TUS creation (video)
    return json([]);
  };
  const api = await import(`../dist/account/supabase-client.js?quota=${Date.now()}`);
  await api.signIn("fixture@example.test", "fixture-only");
  const assets = createAssetStore({ api, userId: api.userIdFromToken(), decode: async () => ({ width: 10, height: 10 }), decodeVideoFile: async () => ({ width: 10, height: 10, duration: 2 }) });

  const image = await assets.upload(new Blob([new Uint8Array(10)], { type: "image/png" }));
  assert.equal(image.ok, false);
  assert.equal(image.code, "ACCOUNT_STORAGE_QUOTA_EXCEEDED");
  assert.equal(image.message, STORAGE_QUOTA_MESSAGE);
  assert.doesNotMatch(image.message, /Try again/);
  assert.deepEqual(classifyUploadError(image), { usage: true, retryable: false });

  const video = await assets.uploadVideo(new Blob([new Uint8Array(10)], { type: "video/mp4" }));
  assert.equal(video.code, "ACCOUNT_STORAGE_QUOTA_EXCEEDED");
  assert.equal(video.message, STORAGE_QUOTA_MESSAGE);
  assert.match(describeAssetError(null, { video: true }), /That video could not be added/);
  assert.ok(!seen.some(call => call.includes("wall-asset-register")), "a refused upload is never registered");
});

test("ISS-0004: no Intro message names the removed SAVE GAMID button; gateway refusals and the quota have words with a next step", () => {
  for (const name of readdirSync(new URL("../dist/account/", import.meta.url)).filter(name => name.endsWith(".js"))) assert.doesNotMatch(read(`dist/account/${name}`), /SAVE GAMID/, name);
  assert.match(errorMessage("INTRO_UPLOAD_FAILED"), /Save Changes/);
  assert.match(errorMessage("INTRO_UPLOAD_NETWORK_ERROR"), /Save Changes/);
  assert.equal(errorMessage("ACCOUNT_STORAGE_QUOTA_EXCEEDED"), STORAGE_QUOTA_MESSAGE);
  for (const code of ["UPLOAD_EXPIRED", "UPLOAD_CONFLICT", "UPLOAD_GATEWAY_FAILED", "CHUNK_TOO_LARGE", "AVATAR_UPLOAD_NETWORK_ERROR"]) assert.notEqual(errorMessage(code), code, code);
  const account = read("dist/account/account.js");
  for (const code of ["ACCOUNT_STORAGE_QUOTA_EXCEEDED", "UPLOAD_EXPIRED", "UPLOAD_GATEWAY_FAILED", "AVATAR_UPLOAD_NETWORK_ERROR"]) assert.ok(account.includes(`"${code}"`), `reasonFrom recognises ${code}`);
});

test("a gateway refusal of a chunk keeps its code and is not retried; a failed upload is terminated", async () => {
  const methods = [];
  const fetcher = async (_url, options) => {
    methods.push(options.method);
    if (options.method === "POST") return new Response(null, { status: 201, headers: { location: "upload/x", "upload-offset": "0" } });
    if (options.method === "PATCH") return json({ error: "UPLOAD_EXPIRED" }, 400);
    return new Response(null, { status: 204 });
  };
  await assert.rejects(
    uploadResumable({ endpoint: "https://gateway.example/tus", bucketName: "intro-sources", objectName: "u/j/source.mp4", contentType: "video/mp4", file: new Blob([new Uint8Array(TUS_CHUNK_BYTES + 1)]), apikey: "k", fetcher, retryDelays: [0, 0, 0], terminateOnFailure: true }),
    error => error.code === "UPLOAD_EXPIRED" && error.status === 400 && !/Intro|SAVE GAMID/.test(error.message),
  );
  assert.deepEqual(methods, ["POST", "PATCH", "DELETE"], "one PATCH, no retry loop, then the upload is terminated");
});

test("ISS-0005: Intro processing failure codes become reasons; a failed replacement keeps the active Intro and says so", () => {
  assert.match(describeIntroProcessingFailure("DERIVATIVE_TOO_LARGE"), /shorter or simpler clip/);
  assert.match(describeIntroProcessingFailure("INVALID_SOURCE_DURATION"), /30 seconds/);
  assert.match(describeIntroProcessingFailure("D3_TIMING_OR_GEOMETRY_MISMATCH"), /reference D3_TIMING_OR_GEOMETRY_MISMATCH/);
  assert.doesNotMatch(describeIntroProcessingFailure("<b>x</b>"), /<b>/, "only a clean code is echoed");
  const account = read("dist/account/account.js");
  const failed = account.indexOf('} else if (savedIntro?.latestJobState === "failed") {');
  const active = account.indexOf("} else if (savedIntro?.activeJobId) {");
  assert.ok(failed > 0 && active > failed, "a failed latest job is checked before 'active' (it is no longer hidden by an active Intro)");
  assert.match(account.slice(failed, active), /Your new Intro could not be processed: \$\{reason\} Your current Intro stays active\./);
});

test("avatar: a stored avatar the profile never took is removed only when the read-back profile does not use it; a dropped connection names the upload", async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  globalThis.location = { origin: "https://testing.gamid.example", pathname: "/account/", search: "", hash: "" };
  globalThis.history = { replaceState() {} };
  const token = `h.${Buffer.from(JSON.stringify({ sub: "22222222-2222-4222-8222-222222222222", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.s`;
  let profile = { avatar_media_reference: null }, attachFails = false, offline = false;
  const deletes = [];
  globalThis.fetch = async (url, options = {}) => {
    if (offline && url.includes("/usage-upload/")) throw new TypeError("failed to fetch");
    if (url.includes("grant_type=password")) return json({ access_token: token, refresh_token: "r", expires_in: 3600, user: { id: "u" } });
    if (url.includes("/rpc/get_my_identity_profile")) return json([profile]);
    if (url.includes("/rpc/attach_avatar")) return attachFails ? json({ message: "NETWORK_ERROR" }, 500) : json([]);
    if (options.method === "DELETE") { deletes.push(url); return json({ deleted: true }); }
    return json([]);
  };
  const api = await import(`../dist/account/supabase-client.js?avatar=${Date.now()}`);
  await api.signIn("fixture@example.test", "fixture-only");
  const uid = api.userIdFromToken();
  assert.equal(await api.discardUnattachedAvatar(`${uid}/avatar-a.png`), true);
  assert.equal(deletes.length, 1);
  profile = { avatar_media_reference: `${uid}/avatar-b.png` };
  assert.equal(await api.discardUnattachedAvatar(`${uid}/avatar-b.png`), false, "the profile uses it (a lost answer may still have attached it): kept");
  assert.equal(deletes.length, 1);

  attachFails = true; profile = { avatar_media_reference: null };
  await assert.rejects(api.uploadAvatar(new Blob([new Uint8Array(4)], { type: "image/png" }), uid));
  assert.equal(deletes.length, 2, "attach failed: the stored, unused object is removed");

  offline = true;
  await assert.rejects(api.uploadAvatar(new Blob([new Uint8Array(4)], { type: "image/png" }), uid, { attach: false }),
    error => error.code === "AVATAR_UPLOAD_NETWORK_ERROR" && !/Authentication/.test(error.message));
  const account = read("dist/account/account.js");
  assert.match(account, /if\(avatarPath&&owner===api\.userIdFromToken\(\)\)await api\.discardUnattachedAvatar\(avatarPath\);/, "the Profile Editor save cleans up the same way");
});

test("Wall editor wiring: one upload at a time, a persistent box under Upload / beside the background video, resolved by a delete", () => {
  const tools = read("dist/wall-editor/tools.js");
  assert.match(tools, /if \(uploading\) \{ say\("An upload is already in progress\. Wait for it to finish\."\); return null; \}/);
  assert.match(tools, /uploadButton\.disabled = true;[\s\S]*finally \{\s*uploading = false;\s*if \(uploadButton\) uploadButton\.disabled = false;/);
  assert.match(tools, /renderUploadError\(document, failed, \{ id: "assetUploadError"/);
  assert.match(tools, /renderUploadError\(document, videoError, \{ id: "bgVideoError"/);
  assert.match(tools, /if \(videoBusy\(\)\) \{ notify\("A background video is already being added/);
  assert.equal((tools.match(/if \(result\.ok\) resolveUsageErrors\(\);/g) ?? []).length, 2, "both delete paths resolve a limit / quota error");
  assert.doesNotMatch(tools, /\.append\([^)]*videoErrorBox\(\)\)/, "never appends a possibly-null box");
});
