const LEGACY_TESTING_ORIGIN = "https://jeddawe11-eng.github.io";
const LEGACY_ACCOUNT_PATH = "/gamid-testing/account/";
const CLOUDFLARE_TESTING_ORIGIN = "https://gamid-testing-static.gamid.workers.dev";
const CLOUDFLARE_PLAY_TOGETHER_PATH = "/play-together/";
const HANDOFF_PARAM = "gamid_testing_handoff";
const HANDOFF_VALUE = "play_together_cloudflare";
// Each handoff value names ONE fixed return page on the Cloudflare TESTING origin. The target is never taken from the request, so a handoff can only ever send
// a session to a known GamID page on that origin.
const HANDOFF_TARGETS = Object.freeze({
  [HANDOFF_VALUE]: CLOUDFLARE_PLAY_TOGETHER_PATH,
  wall_editor_cloudflare: "/wall-editor/",
});

export function legacyAccountHandoffUrl(locationLike) {
  if (locationLike?.origin !== CLOUDFLARE_TESTING_ORIGIN) return null;
  const value = Object.keys(HANDOFF_TARGETS).find(key => HANDOFF_TARGETS[key] === locationLike?.pathname);
  if (!value) return null;
  const target = new URL(LEGACY_ACCOUNT_PATH, LEGACY_TESTING_ORIGIN);
  target.searchParams.set(HANDOFF_PARAM, value);
  return target.href;
}

function requestedHandoffValue(locationLike) {
  if (locationLike?.origin !== LEGACY_TESTING_ORIGIN || locationLike?.pathname !== LEGACY_ACCOUNT_PATH) return null;
  const value = new URLSearchParams(locationLike.search || "").get(HANDOFF_PARAM);
  return Object.hasOwn(HANDOFF_TARGETS, value) ? value : null;
}

export function isRequestedTestingHandoff(locationLike) {
  return requestedHandoffValue(locationLike) !== null;
}

export function transferredSessionUrl(locationLike, session, nowSeconds = Math.floor(Date.now() / 1000)) {
  const value = requestedHandoffValue(locationLike);
  if (!value || !session?.access_token || !session?.refresh_token) return null;
  const expiresIn = Math.max(1, Number(session.expires_at || nowSeconds + Number(session.expires_in || 3600)) - nowSeconds);
  const fragment = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type || "bearer",
    expires_in: String(expiresIn),
    type: "gamid_testing_handoff",
  });
  return `${CLOUDFLARE_TESTING_ORIGIN}${HANDOFF_TARGETS[value]}#${fragment}`;
}
