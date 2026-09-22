// Thin Supabase Edge Function glue: all real logic lives in the tested shared modules (see supabase/functions/_shared/social-card.js and handle.js).
// @ts-nocheck — Deno runtime globals; the shared logic is type-checked as plain JS in the Node test suite.
//
// GET /functions/v1/social-card?handle=<handle> -> a 1200x630 PNG: the requested public identity's Identity Card if the handle resolves to a published
// identity, otherwise the same generic letter-avatar fallback card (never an error page, never a signal distinguishing "unknown" from "private").
// verify_jwt = false (see supabase/config.toml): a social crawler cannot present a GamID session, so this endpoint must be reachable anonymously - exactly like
// the public.get_public_identity RPC it calls, which is the ONLY privileged-adjacent thing it touches, gated the same way for every anonymous caller.
import { ImageResponse } from "npm:@vercel/og@^0";
// Imported via esm.sh (a plain HTTPS URL, not the npm: specifier): Supabase's Docker-free (--use-api) deploy bundler could not resolve the npm: specifier's
// package.json "exports" subpaths (@jsquash/webp/decode, @jsquash/png/encode) - confirmed empirically ("path not found" at boot) - while esm.sh, which
// pre-resolves and flattens the package server-side, worked immediately. Manual WASM init (see ensureImageCodecsReady) because there is no bundler here to
// auto-inline the .wasm assets the way a browser toolchain would.
import decodeWebp, { init as initWebpDecode } from "https://esm.sh/@jsquash/webp@1.5.0/decode";
import encodePng, { init as initPngEncode } from "https://esm.sh/@jsquash/png@2.2.0/encode";
import { validateHandle } from "../_shared/handle.js";
import {
  CARD_WIDTH, CARD_HEIGHT, roleLine, fetchIdentityForCard, fetchAvatarBytes, buildCardElement, buildFallbackElement, resolveAvatarDataUri,
} from "../_shared/social-card.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const FETCH_TIMEOUT_MS = 4000;   // same discipline as cf-worker/worker.mjs's fetchPublicIdentity: never let one slow/blocked outbound call hang the whole request

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// Bounded, fail-safe fetch: NEVER trusts a non-2xx response body (feeding a 404/error-page body to a downstream parser as if it were real data is what
// caused an earlier version of this endpoint's font loading to misbehave). Every fetch here checks res.ok before using the body, and every await is bounded
// by FETCH_TIMEOUT_MS, so a slow/blocked/broken source degrades to "skip this optional piece" instead of ever blocking the response.
async function safeFetch(url, init) {
  const { signal, clear } = withTimeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clear();
  }
}

let fontPromise = null;
async function loadInterFont() {
  // Fetched once per warm instance, not bundled: Inter is OFL-licensed and is already this project's own declared brand font (see dist/public/public.css).
  // The font file URL is resolved dynamically from Google's CSS endpoint rather than hardcoded, because Google rotates the versioned CDN path
  // (e.g. .../v13/... becomes .../v20/...) - a hardcoded leaf URL would silently 404 once that happens, and renderCard() falls back to no custom font either way.
  if (!fontPromise) {
    fontPromise = (async () => {
      const cssRes = await safeFetch("https://fonts.googleapis.com/css2?family=Inter:wght@800&display=swap");
      if (!cssRes) return null;
      const css = await cssRes.text();
      const fontUrl = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
      if (!fontUrl) return null;
      const fontRes = await safeFetch(fontUrl);
      return fontRes ? fontRes.arrayBuffer() : null;
    })().catch(() => null);
  }
  return fontPromise;
}

async function renderCard(element) {
  const fontData = await loadInterFont();
  const fonts = fontData ? [{ name: "Inter", data: fontData, weight: 800, style: "normal" }] : [];
  return new ImageResponse(element, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });
}

// The real GamID avatar pipeline only ever produces WebP (dist/account/avatar-cropper.js), which Satori cannot render (see toDataUri in _shared/social-card.js).
// This converts it to PNG first - confirmed empirically against a real 512x512 GamID avatar (correct pixels, ~1.3s cold, comfortably inside the free-tier
// wall-clock budget). Both codecs' WASM are fetched once per warm instance and cached (same pattern as loadInterFont): a failure at any step (fetch, init, or
// the decode/encode call itself) resolves to false/null, and the caller (resolveAvatarDataUri) falls back to the same letter avatar used when there is no
// avatar at all - never a broken image, never a hang.
let codecsReadyPromise = null;
async function ensureImageCodecsReady() {
  if (!codecsReadyPromise) {
    codecsReadyPromise = (async () => {
      const webpWasmRes = await safeFetch("https://cdn.jsdelivr.net/npm/@jsquash/webp@1.5.0/codec/dec/webp_dec.wasm");
      const pngWasmRes = await safeFetch("https://cdn.jsdelivr.net/npm/@jsquash/png@2.2.0/codec/squoosh_png_bg.wasm");
      if (!webpWasmRes || !pngWasmRes) return false;
      await initWebpDecode(await webpWasmRes.arrayBuffer());
      await initPngEncode(await pngWasmRes.arrayBuffer());
      return true;
    })().catch(() => false);
  }
  return codecsReadyPromise;
}

async function convertWebpToPng(bytes) {
  const ready = await ensureImageCodecsReady();
  if (!ready) return null;
  const imageData = await decodeWebp(bytes.buffer);
  if (!imageData) return null;
  return new Uint8Array(await encodePng(imageData));
}

Deno.serve(async request => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const rawHandle = url.searchParams.get("handle") || "";
  const check = validateHandle(rawHandle);

  const identityTimeout = withTimeout(FETCH_TIMEOUT_MS);
  const identity = check.valid
    ? await fetchIdentityForCard(check.handle, { supabaseUrl: SUPABASE_URL, publishableKey: PUBLISHABLE_KEY, signal: identityTimeout.signal }).finally(identityTimeout.clear)
    : null;

  let element;
  if (identity) {
    const avatarTimeout = withTimeout(FETCH_TIMEOUT_MS);
    const avatar = identity.avatar_media_reference
      ? await fetchAvatarBytes(identity.avatar_media_reference, { supabaseUrl: SUPABASE_URL, publishableKey: PUBLISHABLE_KEY, signal: avatarTimeout.signal }).finally(avatarTimeout.clear)
      : null;
    // resolveAvatarDataUri converts the real WebP avatar to PNG (see convertWebpToPng above) so Satori can actually render it; if conversion isn't possible
    // for any reason, it falls back to null and buildCardElement renders the same letter avatar used when there is no avatar at all.
    element = buildCardElement({
      displayName: identity.display_name,
      handle: check.handle,
      roles: roleLine(identity),
      avatarDataUri: await resolveAvatarDataUri(avatar, { convertWebpToPng }),
    });
  } else {
    element = buildFallbackElement(check.valid ? check.handle : "gamid");
  }

  const image = await renderCard(element);
  const headers = new Headers(image.headers);
  headers.set("cache-control", "public, max-age=60");
  return new Response(request.method === "HEAD" ? null : image.body, { status: 200, headers });
});
