// Anonymous published-Wall capability cache. Call only for assets from a fresh
// get_public_wall response; never use this cache for owner/draft signing.
const KEY = "gamid.testing.published-wall-video-urls.v1";
import { WALL_VIDEO_URL_SECONDS } from "../account/supabase-client.js";
const LIFETIME = WALL_VIDEO_URL_SECONDS * 1000; // canonical existing lifetime, never extended
const MARGIN = 30 * 60 * 1000;
const MAX_ENTRIES = 120;

export function createPublishedVideoUrlCache({ baseUrl, now = Date.now, storage = () => globalThis.sessionStorage } = {}) {
  const entries = new Map(), pending = new Map();
  const origin = new URL(baseUrl).origin;
  const keyFor = (bucket, path) => JSON.stringify([origin, bucket, path]);
  function valid(entry, bucket, path) {
    try {
      const url = new URL(entry.url);
      const expected = `/storage/v1/object/sign/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
      if (url.protocol !== "https:" || url.origin !== origin || url.pathname !== expected) return false;
      const token = url.searchParams.get("token");
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      const expires = payload.exp * 1000;
      return Number.isFinite(payload.exp) && Number.isFinite(expires) && Number.isFinite(entry.issued) && entry.issued <= now()
        && now() < Math.min(expires, entry.issued + LIFETIME) - MARGIN;
    } catch { return false; }
  }
  function prune() {
    for (const [key, entry] of entries) {
      try {
        const [savedOrigin, bucket, path] = JSON.parse(key);
        if (savedOrigin !== origin || !valid(entry, bucket, path)) entries.delete(key);
      } catch { entries.delete(key); }
    }
    while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
  }
  function save() {
    prune();
    try { storage()?.setItem(KEY, JSON.stringify([...entries])); } catch { /* blocked storage: memory only */ }
  }
  try {
    const saved = JSON.parse(storage()?.getItem(KEY) ?? "[]");
    if (Array.isArray(saved)) for (const item of saved.slice(-MAX_ENTRIES)) {
      if (Array.isArray(item) && item.length === 2) entries.set(item[0], item[1]);
    }
  } catch { /* corrupt/blocked storage is never fatal */ }
  save();
  return {
    async get({ bucket, path, sign }) {
      if (!["wall-video", "wall-video-derived"].includes(bucket) || typeof path !== "string" || !path) return null;
      const key = keyFor(bucket, path);
      prune();
      save();
      const known = entries.get(key);
      if (known) return known.url;
      if (pending.has(key)) return pending.get(key);
      const issued = now();
      const request = Promise.resolve().then(sign).then(url => {
        const entry = { url, issued };
        if (valid(entry, bucket, path)) { entries.set(key, entry); save(); }
        return url; // signing failures/legacy responses retain the existing placeholder behaviour
      }).finally(() => pending.delete(key));
      pending.set(key, request);
      return request;
    },
  };
}
