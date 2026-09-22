// GamID PHASE 2 (Architecture C): the profile-specific Identity Card, composited by supabase/functions/social-card. Everything importable under plain Node is
// tested here (the real modules are imported and executed, nothing is reimplemented); the Deno-only rendering step (Satori/ImageResponse) is exercised by
// deploying and validating live, not here - see supabase/functions/social-card/index.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as sharedHandle from "../supabase/functions/_shared/handle.js";
import * as domainHandle from "../dist/account/domain.js";
import {
  CARD_WIDTH, CARD_HEIGHT, roleLine, fetchIdentityForCard, fetchAvatarBytes, buildCardElement, buildFallbackElement, toDataUri, resolveAvatarDataUri,
} from "../supabase/functions/_shared/social-card.js";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

// ------------------------------------------------------------------------------------------------------------------------------ sync guard: _shared/handle.js vs dist/account/domain.js
// Supabase's Edge Function bundler only reliably resolves imports inside supabase/functions/ (unlike the Cloudflare Worker, which uses a real bundler capable
// of resolving cross-tree imports - see cf-worker/worker.mjs importing dist/account/domain.js directly), so handle.js is a deliberate duplicate, not an import.
// This test is what keeps that duplicate honest: if domain.js's handle rules ever change, this fails loudly instead of the two silently drifting apart.
test("sync guard: _shared/handle.js's constants and behavior are identical to dist/account/domain.js's", () => {
  assert.equal(sharedHandle.HANDLE_MIN, domainHandle.HANDLE_MIN);
  assert.equal(sharedHandle.HANDLE_MAX, domainHandle.HANDLE_MAX);
  const samples = [
    "", "a", "ab", "abc", "Black", "@black", "  black  ", "a".repeat(24), "a".repeat(25),
    "a_b", "a__b", "_ab", "ab_", "-ab-", "AB12", "a1_2b", "3", "123", "verylonghandlethatistoolong123",
  ];
  for (const sample of samples) {
    assert.equal(sharedHandle.normalizeHandle(sample), domainHandle.normalizeHandle(sample), `normalizeHandle(${JSON.stringify(sample)})`);
    assert.deepEqual(sharedHandle.validateHandle(sample), domainHandle.validateHandle(sample), `validateHandle(${JSON.stringify(sample)})`);
  }
});
test("sync guard: the two validateHandle implementations' source (the regex + rules) match exactly, not just on these samples", () => {
  const extractBody = source => {
    const start = source.indexOf("export function validateHandle");
    const nextExportAt = source.indexOf("export function", start + 1);
    return source.slice(start, nextExportAt === -1 ? undefined : nextExportAt).trim();
  };
  assert.equal(extractBody(read("supabase/functions/_shared/handle.js")).replace(/\s+/g, " "), extractBody(read("dist/account/domain.js")).replace(/\s+/g, " "));
});

// ------------------------------------------------------------------------------------------------------------------------------ roleLine
test("roleLine: primary + secondary roles joined, unknown keys fall back to the raw key, truncated, never throws on missing data", () => {
  const catalog = [{ key: "player", label: "Player" }, { key: "streamer", label: "Streamer" }];
  assert.equal(roleLine({ role_catalog: catalog, primary_role_key: "player", role_keys: ["player", "streamer"] }), "Player · Streamer");
  assert.equal(roleLine({ role_catalog: catalog, primary_role_key: "player", role_keys: ["player"] }), "Player");
  assert.equal(roleLine({}), "");
  assert.equal(roleLine(null), "");
  assert.equal(roleLine({ role_catalog: [], primary_role_key: "ghost", role_keys: ["ghost"] }), "ghost");
});

// ------------------------------------------------------------------------------------------------------------------------------ fetchIdentityForCard (mocked network only)
test("fetchIdentityForCard: an invalid-format handle never reaches the network at all", async () => {
  let called = false;
  const result = await fetchIdentityForCard("a", { supabaseUrl: "https://x.test", publishableKey: "k", fetchImpl: async () => { called = true; } });
  assert.equal(result, null);
  assert.equal(called, false);
});
test("fetchIdentityForCard: calls the SAME anonymous RPC shape as the Cloudflare Worker - POST, apikey header, candidate_handle body", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => [{ display_name: "Espada" }] }; };
  const result = await fetchIdentityForCard("black", { supabaseUrl: "https://x.test", publishableKey: "k", fetchImpl });
  assert.deepEqual(result, { display_name: "Espada" });
  assert.equal(calls[0].url, "https://x.test/rest/v1/rpc/get_public_identity");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, "k");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].init.body), { candidate_handle: "black" });
});
test("fetchIdentityForCard fails SAFE to null on every failure mode", async () => {
  const opts = { supabaseUrl: "https://x.test", publishableKey: "k" };
  assert.equal(await fetchIdentityForCard("black", { ...opts, fetchImpl: async () => ({ ok: true, json: async () => [] }) }), null);
  assert.equal(await fetchIdentityForCard("black", { ...opts, fetchImpl: async () => ({ ok: false, json: async () => { throw new Error("unread"); } }) }), null);
  assert.equal(await fetchIdentityForCard("black", { ...opts, fetchImpl: async () => { throw new TypeError("network down"); } }), null);
  assert.equal(await fetchIdentityForCard("black", { ...opts, fetchImpl: async () => ({ ok: true, json: async () => [null] }) }), null);
});

// ------------------------------------------------------------------------------------------------------------------------------ fetchAvatarBytes (mocked network only)
test("fetchAvatarBytes: fetches the SAME private, authenticated storage path the browser's own loadPublicAvatar uses, apikey header only", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, headers: new Headers({ "content-type": "image/webp" }), arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  const result = await fetchAvatarBytes("07991366-84e9/avatar.webp", { supabaseUrl: "https://x.test", publishableKey: "k", fetchImpl });
  assert.equal(calls[0].url, "https://x.test/storage/v1/object/authenticated/avatars/07991366-84e9/avatar.webp");
  assert.equal(calls[0].init.headers.apikey, "k");
  assert.equal(calls[0].init.headers.Authorization, undefined, "no session token: the same anonymous, RLS-gated read an ordinary visitor's browser performs");
  assert.deepEqual([...result.bytes], [1, 2, 3]);
  assert.equal(result.contentType, "image/webp");
});
test("fetchAvatarBytes: encodes each path segment (matches dist/account/supabase-client.js's own encodeStoragePath convention)", async () => {
  const calls = [];
  const fetchImpl = async url => { calls.push(url); return { ok: true, headers: new Headers({ "content-type": "image/png" }), arrayBuffer: async () => new ArrayBuffer(0) }; };
  await fetchAvatarBytes("a b/c#d.png", { supabaseUrl: "https://x.test", publishableKey: "k", fetchImpl });
  assert.equal(calls[0], "https://x.test/storage/v1/object/authenticated/avatars/a%20b/c%23d.png");
});
test("fetchAvatarBytes fails SAFE to null: no path, non-ok response, non-image content-type, or a throwing fetch", async () => {
  const opts = { supabaseUrl: "https://x.test", publishableKey: "k" };
  assert.equal(await fetchAvatarBytes(null, opts), null);
  assert.equal(await fetchAvatarBytes("", opts), null);
  assert.equal(await fetchAvatarBytes("p", { ...opts, fetchImpl: async () => ({ ok: false }) }), null);
  assert.equal(await fetchAvatarBytes("p", { ...opts, fetchImpl: async () => ({ ok: true, headers: new Headers({ "content-type": "text/html" }), arrayBuffer: async () => new ArrayBuffer(0) }) }), null, "defense in depth: never embed a non-image response");
  assert.equal(await fetchAvatarBytes("p", { ...opts, fetchImpl: async () => { throw new Error("down"); } }), null);
});

// ------------------------------------------------------------------------------------------------------------------------------ buildCardElement / buildFallbackElement (pure, synchronous)
function findByStyleKey(node, key) {
  const hits = [];
  const walk = n => {
    if (!n || typeof n !== "object") return;
    if (n.props?.style?.[key] !== undefined) hits.push(n);
    (n.props?.children || []).forEach(walk);
  };
  walk(node);
  return hits;
}
function allText(node) {
  if (typeof node === "string") return [node];
  if (!node || typeof node !== "object") return [];
  return (node.props?.children || []).flatMap(allText);
}

test("buildCardElement: the exact card dimensions are exported and match the accepted og:image:width/height (1200x630)", () => {
  assert.equal(CARD_WIDTH, 1200);
  assert.equal(CARD_HEIGHT, 630);
});
test("buildCardElement: with an avatar data URI, renders an <img> with that src; without one, renders a letter-avatar fallback (no <img> at all)", () => {
  const withAvatar = buildCardElement({ displayName: "Espada", handle: "black", roles: "Player", avatarDataUri: "data:image/webp;base64,AAAA" });
  const img = findByStyleKey(withAvatar, "objectFit");
  assert.equal(img.length, 1);
  assert.equal(img[0].type, "img");
  assert.equal(img[0].props.src, "data:image/webp;base64,AAAA");

  const withoutAvatar = buildCardElement({ displayName: "Espada", handle: "black", roles: "", avatarDataUri: null });
  assert.equal(findByStyleKey(withoutAvatar, "objectFit").length, 0);
  assert.ok(allText(withoutAvatar).includes("E"), "falls back to the first letter of the display name, matching the app's own letter-avatar convention");
});
test("buildCardElement: text values are plain child strings, never markup - Satori renders them as text nodes, so no escaping is needed or possible to forget", () => {
  const evil = buildCardElement({ displayName: `<script>alert(1)</script>`, handle: "black", roles: "", avatarDataUri: null });
  const texts = allText(evil);
  assert.ok(texts.includes(`<script>alert(1)</script>`), "the raw string is passed through as a text node, not concatenated into markup");
  assert.ok(JSON.stringify(evil).indexOf("<script>alert(1)</script>") === JSON.stringify(evil).lastIndexOf("<script>alert(1)</script>"), "appears exactly once - as a value, not interpolated into a template");
});
test("buildCardElement: falls back to '@handle' when there is no display name, and to '?' when even the handle is empty", () => {
  assert.ok(allText(buildCardElement({ displayName: "", handle: "black", roles: "", avatarDataUri: null })).includes("@black"));
  assert.ok(allText(buildCardElement({ displayName: "", handle: "", roles: "", avatarDataUri: null })).includes("?"));
});
test("buildCardElement: omits the roles line entirely when there are no roles (no empty line taking up space)", () => {
  const noRoles = buildCardElement({ displayName: "Espada", handle: "black", roles: "", avatarDataUri: null });
  assert.equal(allText(noRoles).filter(t => t === "").length, 0);
});
test("buildFallbackElement: personalized by handle text even with no data at all - never a bare error page", () => {
  const fallback = buildFallbackElement("nobody_here");
  assert.ok(allText(fallback).includes("@nobody_here"));
});

// ------------------------------------------------------------------------------------------------------------------------------ toDataUri
test("toDataUri: encodes bytes as base64 for a Satori-renderable format; null avatar stays null", () => {
  assert.equal(toDataUri(null), null);
  assert.equal(toDataUri({ bytes: new Uint8Array([72, 105]), contentType: "image/png" }), "data:image/png;base64,SGk=");
  assert.equal(toDataUri({ bytes: new Uint8Array([72, 105]), contentType: "image/jpeg" }), "data:image/jpeg;base64,SGk=");
  assert.equal(toDataUri({ bytes: new Uint8Array([72, 105]), contentType: "image/gif" }), "data:image/gif;base64,SGk=");
});
test("toDataUri: WebP is rejected (Satori cannot render it - confirmed empirically against a real GamID avatar) so the caller falls back to the letter avatar", () => {
  assert.equal(toDataUri({ bytes: new Uint8Array([72, 105]), contentType: "image/webp" }), null);
  assert.equal(toDataUri({ bytes: new Uint8Array([72, 105]), contentType: "image/svg+xml" }), null, "any other unsupported format is rejected the same way");
});

// ------------------------------------------------------------------------------------------------------------------------------ resolveAvatarDataUri (the WebP -> PNG conversion wrapper; the actual WASM codec is Deno-only glue, injected here as a fake)
test("resolveAvatarDataUri: a directly-renderable format (png/jpeg/gif) never touches the converter at all", async () => {
  let called = false;
  const result = await resolveAvatarDataUri({ bytes: new Uint8Array([72, 105]), contentType: "image/png" }, { convertWebpToPng: async () => { called = true; } });
  assert.equal(result, "data:image/png;base64,SGk=");
  assert.equal(called, false, "toDataUri already handles it - no need to convert");
});
test("resolveAvatarDataUri: null avatar resolves to null without calling the converter", async () => {
  let called = false;
  assert.equal(await resolveAvatarDataUri(null, { convertWebpToPng: async () => { called = true; } }), null);
  assert.equal(called, false);
});
test("resolveAvatarDataUri: WebP is converted via the injected converter, and the CONVERTED bytes (not the original WebP bytes) are what gets encoded", async () => {
  const calls = [];
  const convertWebpToPng = async bytes => { calls.push(bytes); return new Uint8Array([72, 105]); };
  const result = await resolveAvatarDataUri({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" }, { convertWebpToPng });
  assert.equal(result, "data:image/png;base64,SGk=");
  assert.equal(calls.length, 1);
  assert.deepEqual([...calls[0]], [1, 2, 3], "the ORIGINAL webp bytes are what gets passed to the converter");
});
test("resolveAvatarDataUri fails SAFE to null (letter-avatar fallback) when conversion is unavailable, throws, or returns nothing usable", async () => {
  const webpAvatar = { bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" };
  assert.equal(await resolveAvatarDataUri(webpAvatar, {}), null, "no convertWebpToPng provided at all");
  assert.equal(await resolveAvatarDataUri(webpAvatar, { convertWebpToPng: async () => { throw new Error("wasm boom"); } }), null, "converter throws");
  assert.equal(await resolveAvatarDataUri(webpAvatar, { convertWebpToPng: async () => null }), null, "converter returns nothing");
  assert.equal(await resolveAvatarDataUri(webpAvatar, { convertWebpToPng: async () => new Uint8Array([]) }), null, "converter returns empty bytes");
});
test("resolveAvatarDataUri: any other unsupported format (not webp, not directly renderable) never calls the converter and resolves to null", async () => {
  let called = false;
  const result = await resolveAvatarDataUri({ bytes: new Uint8Array([1]), contentType: "image/svg+xml" }, { convertWebpToPng: async () => { called = true; } });
  assert.equal(result, null);
  assert.equal(called, false, "the converter is WebP-specific - it must not be tried for a format it cannot help with");
});

// ------------------------------------------------------------------------------------------------------------------------------ privacy: no private path, key, or provider identifier ever reaches the rendered element tree
test("source-level guarantee: no service-role term, and the only key referenced is passed in by the caller (never hardcoded here)", () => {
  const source = read("supabase/functions/_shared/social-card.js");
  assert.doesNotMatch(source, /service_role|SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(source, /sb_publishable_|sb_secret_/i, "the key is always injected by the caller (index.ts, from env), never hardcoded in the shared module");
});

// ------------------------------------------------------------------------------------------------------------------------------ config.toml + the Deno glue: anonymous reachability is intentional, not an oversight
test("supabase/config.toml: verify_jwt = false for social-card, same reasoning as discord-connect-callback (a crawler cannot present a GamID session)", () => {
  const config = read("supabase/config.toml");
  assert.match(config, /\[functions\.social-card\]\s*verify_jwt = false/);
});
test("the Deno glue only reads SUPABASE_URL/SUPABASE_ANON_KEY from env, never a service-role secret, and rejects non-GET/HEAD", () => {
  const glue = read("supabase/functions/social-card/index.ts");
  assert.match(glue, /Deno\.env\.get\("SUPABASE_URL"\)/);
  assert.match(glue, /Deno\.env\.get\("SUPABASE_ANON_KEY"\)/);
  assert.doesNotMatch(glue, /SERVICE_ROLE|service_role/i);
  assert.match(glue, /request\.method !== "GET" && request\.method !== "HEAD"/);
});
test("the Deno glue wires the real WebP->PNG converter into resolveAvatarDataUri (not the raw toDataUri path) so the real avatar photo is actually used", () => {
  const glue = read("supabase/functions/social-card/index.ts");
  assert.match(glue, /resolveAvatarDataUri\(avatar,\s*\{\s*convertWebpToPng\s*\}\)/);
  assert.match(glue, /decodeWebp\(/, "the webp decode call is present");
  assert.match(glue, /encodePng\(/, "the png encode call is present");
});
