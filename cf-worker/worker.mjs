// GamID PHASE 1 - the real Cloudflare Worker for permanent public identity URLs, /@<handle> (TESTING only).
//
// Scope, precisely: this Worker's ONLY job is to make `/@<handle>` answer a direct HTTP 200 with crawler-readable Open Graph / Twitter metadata already present in
// the first response (no JavaScript needed to see it), while a human's browser still gets the exact same accepted interactive Public Profile (Intro, transition,
// identity, public sections, My Games, Replay Intro) completely unchanged. It reuses the shipped, accepted public shell (dist/public/index.html) byte-for-byte
// apart from a small, literal, anchor-checked head injection (see injectMetadata): nothing in <body> is touched, so the existing public.js keeps working as is.
//
// PHASE 2 (Architecture C) update: when a handle resolves to a real published identity, og:image/twitter:image now point at a personalized Identity Card
// rendered by the new supabase/functions/social-card Edge Function (see supabase/functions/_shared/social-card.js), instead of the generic static PNG. The
// generic static PNG (SOCIAL_CARD_PATH) remains the image for every invalid/unknown/unpublished handle - unchanged from Phase 1, and still the ONLY image
// ever used when identity is null, so an unpublished identity's card can never be distinguished from "doesn't exist" by image either.
//
// PHASE 2 (public Intro proxy) update: a second route, /@<handle>/intro.webm, streams the SAME accepted D3 derivative a signed-in visitor's browser already
// plays (see loadPublicIntroMedia in dist/account/supabase-client.js) to anonymous callers - crawlers included - without ever exposing the authenticated
// Supabase Storage URL or the apikey a crawler could never send itself. It is a byte-for-byte passthrough: no transcoding, no new derivative, no D3 or Intro
// pipeline change. og:video/og:video:secure_url/og:video:type are added to the page's metadata only when the resolved identity actually has one; otherwise the
// personalized Identity Card (og:image) is the only thing any platform ever sees, matching Phase 0b's proven WhatsApp behavior (poster only, no inline video).
//
// It does not touch the accepted Intro/D3 pipeline, Supabase config, Auth/OAuth, or any real data. It calls the SAME anonymous, accepted public.get_public_identity
// RPC the browser already calls, with the SAME publishable ("anon") key already shipped inside dist/account/supabase-client.js - that key is not a secret (it is
// public in every page load today) and carries no privileged access; RLS is what keeps unpublished/private data out, exactly as it does for a normal anonymous
// visitor. Nothing here can see more than an anonymous browser already can.
//
// PHASE 2 (deterministic media versioning) update: og:image/og:video now carry a short "?v=<hash>" tag (see computeContentVersion) - observed live that Discord
// can cache an embed (metadata AND resolved image) against the permanent /@<handle> URL for an unpredictable stretch, so a later profile/avatar/Intro change can
// keep showing stale media indefinitely. The permanent page URL itself never changes; only the two media URLs a platform actually caches carry the tag, so
// identical content always produces the identical URL (stays cacheable) and any real change produces a new one (forces a fresh fetch on the platform's next
// crawl). No random token, no RPC/schema change: the tag is a deterministic SHA-256 of fields already returned by get_public_identity.
//
// Routing (see wrangler.jsonc: assets.run_worker_first: ["/@*"]): ONLY requests whose path matches "/@<segment>" or "/@<segment>/intro.webm" are handled here;
// the Worker runs BEFORE Cloudflare's own static-asset routing for that pattern, which matters because that routing was observed (Phase 0a) to redirect a
// literal "/@black" to "/%40black" before ever reaching a Worker. Every other path (including "/@handle/extra" and non-GET/HEAD methods) falls straight through to
// the accepted Phase 0a static-asset behavor (env.ASSETS.fetch), so Phase 0a's own tested behavior - the accepted 404 page, the normal site - is unchanged.
//
// Privacy: an invalid-format handle, an unknown handle, and a real-but-unpublished/private identity all produce the EXACT SAME generic response (same generic
// title/description/image, same HTTP 200) from the identity route, and the EXACT SAME 404 from the intro-video route (whether the handle is malformed, unknown,
// unpublished, or simply has no Intro) - the Supabase call is only ever made for a well-formed handle, and the storage path used is ALWAYS the one the trusted
// RPC just returned, never anything a caller supplies. A visitor (human or crawler) can therefore never tell "doesn't exist" apart from "exists but is private"
// apart from "exists, is public, but has no Intro" from either response.

import { normalizeHandle, validateHandle } from "../dist/account/domain.js";

const SUPABASE_URL = "https://upvtrczefcvigxdyuylw.supabase.co";
// The browser's own public ("anon") key, copied verbatim from dist/account/supabase-client.js. Not a secret: it ships in every page load already and is
// meaningless without the RLS-gated anonymous RPC it calls here, which returns exactly what the same call already returns to an ordinary anonymous visitor.
const PUBLISHABLE_KEY = "sb_publishable_ovl-uegBzJlWPJcTF_dviw_6uf1aVYg";

const SOCIAL_CARD_PATH = "/assets/social-card-1200x630.png";   // the generic fallback card (see scripts/generate-social-card.ps1) - used whenever identity is null
const SOCIAL_CARD_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/social-card`;   // the personalized Identity Card (Phase 2 / Architecture C) - used only when identity is found
const DEFAULT_TITLE = "GamID";
const DEFAULT_DESCRIPTION = "A GamID public identity.";

// Deterministic cache-busting for social-platform embeds (Discord/WhatsApp/etc. cache og:image and og:video by URL, sometimes for a long, unpredictable time -
// observed directly: Discord kept serving a stale card + no video for one identity across multiple re-shares of the unchanged /@<handle> URL). The permanent
// page URL (/@<handle>) never changes; only the two MEDIA urls carry a short version tag, derived from exactly the fields that actually affect what those two
// media responses render (see buildCardElement/roleLine in _shared/social-card.js for the image; intro_derivative_path alone for the video) - never anything
// else, and never a random value: identical state always hashes to the identical tag, so the URL only changes when the rendered content actually would.
// SHA-256 (Web Crypto's crypto.subtle - a standard global in both Cloudflare Workers and Node, so this runs identically, unmocked, under `node --test`) is a
// one-way hash: the resulting 8 hex characters reveal nothing about the underlying avatar path, intro path, or any other field that went into it.
export async function computeContentVersion(identity) {
  if (!identity) return null;
  const material = JSON.stringify({
    avatar: identity.avatar_media_reference || null,
    intro: identity.intro_derivative_path || null,
    name: identity.display_name || null,
    primary: identity.primary_role_key || null,
    roles: identity.role_keys || [],
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 8);
}

export function buildImageUrl(identity, handle, version) {
  if (!identity) return null;   // null resolved to the static fallback by the caller
  const base = `${SOCIAL_CARD_FUNCTION_URL}?handle=${encodeURIComponent(handle)}`;
  return version ? `${base}&v=${version}` : base;
}

// Same-origin (this Worker, not Supabase) because the video route below is served by this Worker itself - a byte-for-byte proxy needs no separate function.
export function buildVideoUrl(identity, handle, origin, version) {
  if (!identity?.intro_derivative_path) return null;
  const base = `${origin}/@${encodeURIComponent(handle)}/intro.webm`;
  return version ? `${base}?v=${version}` : base;
}

const HANDLE_PATH_RE = /^\/@([^/]+)\/?$/;   // the same shape dist/404.html's own client-side redirect already matches
const INTRO_PATH_RE = /^\/@([^/]+)\/intro\.webm\/?$/;

export function parseHandlePath(pathname) {
  const match = HANDLE_PATH_RE.exec(pathname);
  return match ? match[1] : null;
}

export function parseIntroPath(pathname) {
  const match = INTRO_PATH_RE.exec(pathname);
  return match ? match[1] : null;
}

export const escapeHtml = value => String(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Collapses whitespace/control characters and caps length (a public bio is already capped at write time, but nothing here trusts that: every value that
// reaches HTML is normalized and bounded independently).
export function truncate(text, max) {
  const clean = String(text ?? "").replace(/[\r\n\t -]+/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(max - 1, 0)).trimEnd()}…`;
}

const catalogLabel = (catalog, key) => catalog?.find?.(item => item.key === key)?.label || key || "";

export function buildTitle(identity, handle) {
  const name = truncate(identity?.display_name, 60);
  return name ? `${name} — @${handle} · GamID` : `@${handle} · GamID`;
}

export function buildDescription(identity) {
  const primary = catalogLabel(identity?.role_catalog, identity?.primary_role_key);
  const secondary = (identity?.role_keys || []).filter(key => key !== identity?.primary_role_key).map(key => catalogLabel(identity?.role_catalog, key));
  const roles = [primary, ...secondary].filter(Boolean).join(" · ");
  const bio = truncate(identity?.bio, 200);
  const combined = [roles, bio].filter(Boolean).join(" — ");
  return truncate(combined, 300) || DEFAULT_DESCRIPTION;
}

// Reaches the SAME accepted anonymous RPC the browser calls (public.get_public_identity): no service-role key, no privileged table access, no bypass of RLS.
// Any failure (network, timeout, non-200, malformed body) fails SAFE to null - identical to "this identity is not public" - never surfaces an error detail.
export async function fetchPublicIdentity(handle, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/get_public_identity`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "content-type": "application/json" },
      body: JSON.stringify({ candidate_handle: handle }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] && typeof rows[0] === "object" ? rows[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Streams the SAME accepted D3 derivative from Supabase Storage's authenticated object endpoint, with the same public "anon" apikey the browser already uses -
// confirmed empirically that this endpoint already implements correct HTTP Range semantics itself (206/Content-Range for a satisfiable range, 416/Content-Range:
// bytes */<total> for an unsatisfiable one, plain 200 for no Range header), so this is a THIN passthrough: forward the client's Range header upstream, forward
// the upstream status/headers back, stream the body. No Range parsing/slicing is implemented here - it would only duplicate what the storage backend already
// does correctly. A short AbortController timeout bounds only the wait for the upstream response to START (headers), never the body transfer itself, so large
// videos are never cut off once streaming begins.
async function fetchIntroVideo(path, rangeHeader, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const headers = { apikey: PUBLISHABLE_KEY };
    if (rangeHeader) headers.Range = rangeHeader;
    return await fetchImpl(`${SUPABASE_URL}/storage/v1/object/authenticated/intro-media/${path.split("/").map(encodeURIComponent).join("/")}`, { headers, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Only these upstream statuses are ever passed through: 200 (full file), 206 (satisfiable range), 416 (unsatisfiable range - still needs to reach the client,
// with its Content-Range: bytes */<total>, so a video player can recover). Anything else (an upstream error, an unexpected shape) becomes a generic 404 -
// never surfaces a raw Supabase Storage error body, which could describe the bucket/path/backend in more detail than a public endpoint should ever reveal.
const PASSTHROUGH_VIDEO_STATUSES = new Set([200, 206, 416]);
const FORWARDED_VIDEO_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

export async function handleIntroRequest(request, check, identity) {
  const introPath = check.valid ? identity?.intro_derivative_path : null;
  if (!introPath) return new Response("Not Found", { status: 404 });   // invalid handle, unknown handle, unpublished identity, or no Intro: identical response

  const upstream = await fetchIntroVideo(introPath, request.headers.get("range"));
  if (!upstream || !PASSTHROUGH_VIDEO_STATUSES.has(upstream.status)) return new Response("Not Found", { status: 404 });

  const headers = new Headers();
  for (const key of FORWARDED_VIDEO_HEADERS) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set("cache-control", "public, max-age=60");   // short: the SAME /@<handle>/intro.webm URL serves a different file after the owner replaces their Intro
  headers.set("access-control-allow-origin", "*");

  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
}

// Injects <base>, the per-request <title>/description, and the OG/Twitter tags into the ACCEPTED public shell, touching nothing else. Every anchor is matched as
// an exact literal string (not a loose regex): if the shipped shell's markup ever changes, this throws loudly instead of silently shipping broken/missing metadata.
export function injectMetadata(shellHtml, { title, description, url, image, video }) {
  const CHARSET = '<meta charset="UTF-8" />';
  const TITLE = "<title>GamID</title>";
  const DESCRIPTION = '<meta name="description" content="A GamID public identity." />';
  const HEAD_CLOSE = "</head>";
  for (const [label, anchor] of [["charset meta", CHARSET], ["title", TITLE], ["description meta", DESCRIPTION], ["head close", HEAD_CLOSE]]) {
    if (!shellHtml.includes(anchor)) throw new Error(`injectMetadata: expected ${label} not found in the public shell - dist/public/index.html changed; update cf-worker/worker.mjs`);
  }
  const tags = [
    ["property", "og:site_name", "GamID"],
    ["property", "og:type", "website"],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", url],
    ["property", "og:image", image],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:type", "image/png"],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", image],
  ];
  // Only present when the resolved identity actually has a public Intro (see buildVideoUrl) - a platform that ignores og:video (or lacks video support
  // entirely, e.g. WhatsApp per Phase 0b) simply falls back to the personalized Identity Card above, which is always present regardless.
  if (video) {
    tags.push(
      ["property", "og:video", video],
      ["property", "og:video:secure_url", video],
      ["property", "og:video:type", "video/webm"],
    );
  }
  const metaBlock = tags.map(([attr, key, value]) => `  <meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(value)}">`).join("\n");
  let html = shellHtml;
  // the <base> must be present before any relative URL is parsed (public.css / public.js are referenced as bare relative filenames), so it goes in immediately
  // after the charset declaration - the response is served at "/@<handle>", not "/public/", so without this every relative asset would 404
  html = html.replace(CHARSET, `${CHARSET}\n  <base href="/public/">`);
  html = html.replace(TITLE, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(DESCRIPTION, `<meta name="description" content="${escapeHtml(description)}" />`);
  html = html.replace(HEAD_CLOSE, `${metaBlock}\n  <link rel="canonical" href="${escapeHtml(url)}">\n${HEAD_CLOSE}`);
  return html;
}

function parseHandleFromRequest(rawSegment) {
  let decoded = null;
  try { decoded = decodeURIComponent(rawSegment); } catch { decoded = null; }
  return decoded !== null ? validateHandle(decoded) : { valid: false, handle: normalizeHandle("") };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return env.ASSETS.fetch(request);

    const introSegment = parseIntroPath(url.pathname);
    if (introSegment !== null) {
      const check = parseHandleFromRequest(introSegment);
      const identity = check.valid ? await fetchPublicIdentity(check.handle, fetch) : null;
      return handleIntroRequest(request, check, identity);
    }

    const rawSegment = parseHandlePath(url.pathname);
    if (rawSegment === null) return env.ASSETS.fetch(request);   // not a single-segment "/@..." URL: unchanged Phase 0a static-asset behavior (incl. the accepted 404)

    const check = parseHandleFromRequest(rawSegment);
    const identity = check.valid ? await fetchPublicIdentity(check.handle, fetch) : null;

    const shellRes = await env.ASSETS.fetch(new Request(`${url.origin}/public/`, { method: "GET" }));
    if (!shellRes.ok) return shellRes;   // fail safe: surface whatever the assets layer itself returned rather than mask it
    const shellHtml = await shellRes.text();

    const meta = identity
      ? { title: buildTitle(identity, check.handle), description: buildDescription(identity) }
      : { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION };
    const version = await computeContentVersion(identity);
    const image = buildImageUrl(identity, check.handle, version) || `${url.origin}${SOCIAL_CARD_PATH}`;
    const video = buildVideoUrl(identity, check.handle, url.origin, version);
    const html = injectMetadata(shellHtml, { ...meta, url: `${url.origin}${url.pathname}`, image, video });

    return new Response(request.method === "HEAD" ? null : html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  },
};
