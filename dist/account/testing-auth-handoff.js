const LEGACY_TESTING_ORIGIN = "https://jeddawe11-eng.github.io";
const LEGACY_ACCOUNT_PATH = "/gamid-testing/account/";
const CLOUDFLARE_TESTING_ORIGIN = "https://gamid-testing-static.gamid.workers.dev";
const CLOUDFLARE_PLAY_TOGETHER_PATH = "/play-together/";
const HANDOFF_PARAM = "gamid_testing_handoff";
const HANDOFF_VALUE = "play_together_cloudflare";

export function legacyAccountHandoffUrl(locationLike) {
  if (locationLike?.origin !== CLOUDFLARE_TESTING_ORIGIN || locationLike?.pathname !== CLOUDFLARE_PLAY_TOGETHER_PATH) return null;
  const target = new URL(LEGACY_ACCOUNT_PATH, LEGACY_TESTING_ORIGIN);
  target.searchParams.set(HANDOFF_PARAM, HANDOFF_VALUE);
  return target.href;
}

export function isRequestedTestingHandoff(locationLike) {
  if (locationLike?.origin !== LEGACY_TESTING_ORIGIN || locationLike?.pathname !== LEGACY_ACCOUNT_PATH) return false;
  return new URLSearchParams(locationLike.search || "").get(HANDOFF_PARAM) === HANDOFF_VALUE;
}

export function transferredSessionUrl(locationLike, session, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!isRequestedTestingHandoff(locationLike) || !session?.access_token || !session?.refresh_token) return null;
  const expiresIn = Math.max(1, Number(session.expires_at || nowSeconds + Number(session.expires_in || 3600)) - nowSeconds);
  const fragment = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type || "bearer",
    expires_in: String(expiresIn),
    type: "gamid_testing_handoff",
  });
  return `${CLOUDFLARE_TESTING_ORIGIN}${CLOUDFLARE_PLAY_TOGETHER_PATH}#${fragment}`;
}
