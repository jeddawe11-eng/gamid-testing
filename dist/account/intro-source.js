// F5 Intro capabilities: memory only. Recheck current state for every playback.
export const INTRO_LEASE_SECONDS = 120;
const PLAYBACK_MARGIN_MS = 35000; // existing 30s maximum + transition margin
export function createIntroSourceResolver({ baseUrl, current, principal = () => "anonymous", sign, now = Date.now }) {
  const origin = new URL(baseUrl).origin;
  let entry = null, generation = 0;
  function invalidate() { generation++; entry = null; }
  function lease(url, path, started) {
    try {
      const u = new URL(url), prefix = "/storage/v1/object/sign/intro-media/";
      if (u.origin !== origin || u.protocol !== "https:" || u.pathname !== prefix + path.split("/").map(encodeURIComponent).join("/") || u.username || u.password) return null;
      const claims = JSON.parse(atob(u.searchParams.get("token").split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
      if (!Number.isFinite(claims.exp) || !Number.isFinite(claims.iat) || claims.exp - claims.iat > INTRO_LEASE_SECONDS || claims.exp <= claims.iat) return null;
      const expiresAt = Math.min(claims.exp * 1000, started + INTRO_LEASE_SECONDS * 1000);
      return expiresAt - now() > PLAYBACK_MARGIN_MS ? { url, expiresAt } : null;
    } catch { return null; }
  }
  async function resolve() {
    const version = generation, actor = principal();
    if (!actor) { invalidate(); return null; }
    let state;
    try { state = await current(); } catch (error) { invalidate(); throw error; }
    if (version !== generation || principal() !== actor) return null;
    if (!state?.path || !state.key) { entry = null; return null; }
    if (entry?.key === state.key && entry.path === state.path && entry.actor === actor && entry.expiresAt - now() > PLAYBACK_MARGIN_MS) return { ...entry };
    entry = null;
    const started = now();
    let url;
    try { url = await sign(state.path, INTRO_LEASE_SECONDS); } catch (error) { invalidate(); throw error; }
    if (version !== generation || principal() !== actor) return null;
    const valid = lease(url, state.path, started);
    if (!valid) return null;
    const confirmed = await current();
    if (version !== generation || principal() !== actor || confirmed?.key !== state.key || confirmed?.path !== state.path) return null;
    entry = { ...valid, key: state.key, path: state.path, actor };
    return { ...entry };
  }
  async function isCurrent() {
    if (!entry || entry.expiresAt <= now() || entry.actor !== principal()) return false;
    const version = generation, known = entry;
    try { const state = await current(); return version === generation && known.actor === principal() && state?.key === known.key && state?.path === known.path; } catch { return false; }
  }
  return { resolve, invalidate, isCurrent };
}
