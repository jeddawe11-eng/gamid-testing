// Handle validation, duplicated (deliberately, not imported) from dist/account/domain.js: Supabase's Edge Function bundler only resolves imports inside
// supabase/functions/, so a cross-tree import of dist/account/domain.js is not reliable at deploy time - unlike the Cloudflare Worker, which uses a real
// bundler (esbuild via wrangler) that can. tests/social-card.test.js has a sync-guard test that fails loudly if this ever drifts from dist/account/domain.js.
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;

export function normalizeHandle(value = "") {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

export function validateHandle(value) {
  const handle = normalizeHandle(value);
  if (handle.length < HANDLE_MIN) return { valid: false, reason: "TOO_SHORT", handle };
  if (handle.length > HANDLE_MAX) return { valid: false, reason: "TOO_LONG", handle };
  if (!/^[a-z0-9][a-z0-9_]*[a-z0-9]$/.test(handle) || handle.includes("__")) {
    return { valid: false, reason: "INVALID_FORMAT", handle };
  }
  return { valid: true, reason: null, handle };
}
