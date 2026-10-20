// Anonymous published-Wall capability cache. Call only for assets from a fresh
// get_public_wall response; never use this cache for owner/draft signing.
//
// F6-A (Mazen's authorization 2026-10-21): the cache is shared by the tabs of one browser (localStorage) instead of one tab (sessionStorage), so a new-tab
// revisit reuses the SAME signed URL and the browser can serve the video from its own cache. Nothing about the capability changes:
//   - the lifetime is the server's (public-media, 6 h); reuse still ends 30 minutes before the earlier of the token's exp and issue + 6 h - never extended;
//   - an entry is used only for an asset of the CURRENT, freshly fetched publication manifest, and it is scoped to that Wall (handle), that publication
//     (published_at), that asset id and that exact object - a republished Wall, a replaced or removed asset, another Wall or another object never matches;
//   - every fresh manifest drops the entries of that Wall it no longer lists, and a Wall that is no longer published / enabled / PUBLIC drops all of them, so a
//     bearer URL does not linger in the browser after its asset stops being public (it stays valid on the server until expiry: the accepted lease contract);
//   - the cache is never an authorization decision, never logged, and cleared on sign-out; corrupt, foreign or blocked storage only means "sign again".
const KEY = "gamid.testing.published-wall-video-urls.v2";
const LEGACY_KEY = "gamid.testing.published-wall-video-urls.v1";   // F4's per-tab cache (sessionStorage); removed when seen
export const PUBLISHED_VIDEO_URL_CACHE_KEY = KEY;
import { WALL_VIDEO_URL_SECONDS } from "../account/supabase-client.js";
const LIFETIME = WALL_VIDEO_URL_SECONDS * 1000; // canonical existing lifetime, never extended
const MARGIN = 30 * 60 * 1000;
const MAX_ENTRIES = 120;
const BUCKETS = ["wall-video", "wall-video-derived"];
const text = (value, max = 512) => typeof value === "string" && value.length > 0 && value.length <= max;
const normHandle = handle => (text(handle, 64) ? handle.toLowerCase() : null);

const defaultStorage = () => globalThis.localStorage;

export function createPublishedVideoUrlCache({ baseUrl, now = Date.now, storage = defaultStorage, legacyStorage = () => globalThis.sessionStorage } = {}) {
  let entries = new Map();
  const pending = new Map();
  const origin = new URL(baseUrl).origin;
  // the scope is part of the key: [origin, bucket, path, wall handle, publication, asset id]
  const keyFor = (bucket, path, scope) => JSON.stringify([origin, bucket, path, normHandle(scope?.handle) ?? "", String(scope?.publishedAt ?? ""), String(scope?.assetId ?? "")]);
  function valid(entry, bucket, path) {
    try {
      if (!entry || typeof entry.url !== "string" || !Number.isFinite(entry.issued)) return false;
      const url = new URL(entry.url);
      const expected = `/storage/v1/object/sign/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
      if (url.protocol !== "https:" || url.origin !== origin || url.pathname !== expected) return false;
      const token = url.searchParams.get("token");
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      const expires = payload.exp * 1000;
      return Number.isFinite(payload.exp) && Number.isFinite(expires) && entry.issued <= now()
        && now() < Math.min(expires, entry.issued + LIFETIME) - MARGIN;
    } catch { return false; }
  }
  const parseKey = key => { try { const parts = JSON.parse(key); return Array.isArray(parts) && parts.length === 6 && parts.every(part => typeof part === "string") ? parts : null; } catch { return null; } };
  const keep = (key, entry) => { const parts = parseKey(key); return Boolean(parts && parts[0] === origin && BUCKETS.includes(parts[1]) && text(parts[2]) && valid(entry, parts[1], parts[2])); };
  function read() {
    const found = new Map();
    try {
      const saved = JSON.parse(storage()?.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) for (const item of saved.slice(-MAX_ENTRIES)) if (Array.isArray(item) && item.length === 2 && typeof item[0] === "string") found.set(item[0], item[1]);
    } catch { /* corrupt/blocked storage is never fatal */ }
    return found;
  }
  // other tabs may have signed meanwhile: merge what is stored with what this tab knows (the later issue wins), drop everything no longer valid, cap the size
  function sync() {
    const merged = read();
    for (const [key, entry] of entries) { const other = merged.get(key); if (!other || !(other.issued >= entry.issued)) merged.set(key, entry); }
    for (const [key, entry] of merged) if (!keep(key, entry)) merged.delete(key);
    while (merged.size > MAX_ENTRIES) merged.delete(merged.keys().next().value);
    entries = merged;
  }
  function write() {
    try { if (entries.size) storage()?.setItem(KEY, JSON.stringify([...entries])); else storage()?.removeItem?.(KEY); } catch { /* blocked storage: memory only */ }
  }
  try { legacyStorage()?.removeItem?.(LEGACY_KEY); } catch { /* not available */ }
  sync();
  write();
  return {
    // scope: { handle, publishedAt, assetId } of the asset in the CURRENT manifest
    async get({ bucket, path, sign, scope = null }) {
      if (!BUCKETS.includes(bucket) || typeof path !== "string" || !path) return null;
      const key = keyFor(bucket, path, scope);
      sync();
      write();
      const known = entries.get(key);
      if (known) return known.url;
      if (pending.has(key)) return pending.get(key);
      const issued = now();
      const request = Promise.resolve().then(sign).then(url => {
        const entry = { url, issued };
        if (valid(entry, bucket, path)) { sync(); entries.set(key, entry); write(); }
        return url; // signing failures/legacy responses retain the existing placeholder behaviour
      }).finally(() => pending.delete(key));
      pending.set(key, request);
      return request;
    },
    // after a fresh manifest of `handle`: keep only the entries of exactly these (bucket, path, scope) items; everything else of that Wall is forgotten
    retain(handle, items = []) {
      const wall = normHandle(handle);
      if (!wall) return;
      const wanted = new Set(items.map(item => keyFor(item.bucket, item.path, item.scope)));
      sync();
      for (const key of [...entries.keys()]) { const parts = parseKey(key); if (parts && parts[3] === wall && !wanted.has(key)) entries.delete(key); }
      write();
    },
    forget(handle) { this.retain(handle, []); },
    clear() { entries = new Map(); write(); },
  };
}

// A Wall that is no longer published / enabled / PUBLIC (or an unknown handle): forget every cached URL of it. Never throws.
export function forgetPublishedWallVideos(handle, { storage = defaultStorage } = {}) {
  const wall = normHandle(handle);
  if (!wall) return;
  try {
    const saved = JSON.parse(storage()?.getItem(KEY) ?? "[]");
    if (!Array.isArray(saved)) { storage()?.removeItem?.(KEY); return; }
    const kept = saved.filter(item => { try { const parts = JSON.parse(item[0]); return !(Array.isArray(parts) && parts[3] === wall); } catch { return false; } });
    if (kept.length) storage()?.setItem(KEY, JSON.stringify(kept)); else storage()?.removeItem?.(KEY);
  } catch { /* blocked or corrupt storage: nothing kept to forget */ }
}
