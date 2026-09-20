// Steam OpenID 2.0 account-linking logic for the GamID TESTING backend (Supabase Edge Functions).
//
// Flow: the signed-in owner asks the START function for the official Steam sign-in URL; Steam authenticates the user on
// steamcommunity.com (GamID never sees a Steam password, Steam Guard code, or Steam session cookie) and redirects the browser to
// the CALLBACK function with a signed assertion. The callback NEVER trusts the browser: it (1) consumes the one-time, database-bound
// state, (2) checks every field of the assertion locally, (3) asks Steam itself to validate the signature (direct
// verification, `openid.mode=check_authentication`), and only then (4) links the SteamID64 Steam authenticated to the owner that
// started the attempt. No Steam Web API key is needed and no Steam API is called: the SteamID64 is the whole identity result.
//
// Steam's OpenID 2.0 has no `state` parameter, so the one-time state travels inside `openid.return_to` - the standard OpenID
// technique. That value is covered by Steam's signature (`openid.signed` must include `return_to`), so an assertion issued for
// one attempt cannot be replayed against another. The state is single-use, expires in 10 minutes, and is stored hash-only.
//
// Everything environmental (fetch, env, clock, logging) is injected so the exact same code is exercised by the Node test suite.

export const STEAM_OPENID = Object.freeze({
  // The one and only OP endpoint. It is FIXED: no discovery is performed from the claimed identifier (that is the classic
  // OpenID relying-party bug), so a forged identifier can never make the backend contact an attacker-chosen server.
  endpoint: "https://steamcommunity.com/openid/login",
  ns: "http://specs.openid.net/auth/2.0",
  identifierSelect: "http://specs.openid.net/auth/2.0/identifier_select",
  callbackFunction: "steam-connect-callback",
  // Individual-account SteamID64 range (accountid 1 .. 2^32-1 added to the individual-account base).
  minSteamId: 76561197960265729n,
  maxSteamId: 76561202255233023n,
  requiredSigned: Object.freeze(["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"]),
  nonceMaxAgeMs: 10 * 60 * 1000,
  nonceMaxFutureMs: 5 * 60 * 1000,
  verifyTimeoutMs: 8000,
});

export const SITE_ORIGIN = "https://jeddawe11-eng.github.io";
export const RETURN_URL = `${SITE_ORIGIN}/gamid-testing/account/`;
const USER_AGENT = "GamID-Testing-OpenID (https://jeddawe11-eng.github.io/gamid-testing/, 1.0)";
const CLAIMED_ID = /^https?:\/\/steamcommunity\.com\/openid\/id\/([0-9]{17})$/;

export function readEnv(get) {
  return {
    supabaseUrl: get("SUPABASE_URL"),
    anonKey: get("SUPABASE_ANON_KEY"),
    serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

// No Steam secret exists: OpenID 2.0 has no client credential. Only the platform-provided Supabase variables are required.
const configured = env => Boolean(env?.supabaseUrl && env.anonKey && env.serviceKey);

export function callbackUrlFor(supabaseUrl) {
  return `${String(supabaseUrl).replace(/\/+$/, "")}/functions/v1/${STEAM_OPENID.callbackFunction}`;
}

export const returnToFor = (supabaseUrl, state) => `${callbackUrlFor(supabaseUrl)}?state=${state}`;
export const realmFor = supabaseUrl => `${new URL(String(supabaseUrl)).origin}/`;

export function buildAuthenticationUrl({ supabaseUrl, state }) {
  const params = new URLSearchParams({
    "openid.ns": STEAM_OPENID.ns,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnToFor(supabaseUrl, state),
    "openid.realm": realmFor(supabaseUrl),
    "openid.identity": STEAM_OPENID.identifierSelect,
    "openid.claimed_id": STEAM_OPENID.identifierSelect,
  });
  return `${STEAM_OPENID.endpoint}?${params.toString()}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Assertion verification. Pure except for the single direct-verification request to the fixed Steam endpoint.
// Returns { ok: true, steamId } or { ok: false, reason } where reason is a fixed non-sensitive code.
//   invalid_assertion    - malformed, incomplete, foreign, or locally inconsistent (never sent to Steam)
//   verification_failed  - Steam answered that the signature/assertion is NOT valid (forged, replayed, tampered)
//   provider_unavailable - Steam could not be reached / answered unusably
// ---------------------------------------------------------------------------------------------------------------
const NONCE_TIME = /^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})Z[\x21-\x7e]{0,120}$/;

function collectOpenIdParams(searchParams) {
  const collected = new Map();
  for (const key of searchParams.keys()) {
    if (!key.startsWith("openid.")) continue;
    if (!/^openid\.[a-z0-9_.]{1,60}$/.test(key)) return null;
    if (collected.has(key)) continue;
    const all = searchParams.getAll(key);
    // A repeated protocol field is ambiguous (parameter pollution): refuse the whole assertion.
    if (all.length !== 1) return null;
    if (all[0].length > 2048) return null;
    collected.set(key, all[0]);
    if (collected.size > 40) return null;
  }
  return collected;
}

export function checkAssertionLocally({ searchParams, expectedReturnTo, nowMs = Date.now() }) {
  const fields = collectOpenIdParams(searchParams);
  if (!fields) return { ok: false, reason: "invalid_assertion" };
  const get = name => fields.get(`openid.${name}`);

  if (get("ns") !== STEAM_OPENID.ns) return { ok: false, reason: "invalid_assertion" };
  if (get("mode") !== "id_res") return { ok: false, reason: "invalid_assertion" };
  if (get("op_endpoint") !== STEAM_OPENID.endpoint) return { ok: false, reason: "invalid_assertion" };
  // The assertion must have been issued for THIS attempt's exact return_to (which embeds the one-time state).
  if (get("return_to") !== expectedReturnTo) return { ok: false, reason: "invalid_assertion" };

  const claimed = CLAIMED_ID.exec(get("claimed_id") || "");
  const identity = CLAIMED_ID.exec(get("identity") || "");
  if (!claimed || !identity || claimed[1] !== identity[1]) return { ok: false, reason: "invalid_assertion" };
  const steamId = claimed[1];
  const numeric = BigInt(steamId);
  if (numeric < STEAM_OPENID.minSteamId || numeric > STEAM_OPENID.maxSteamId) return { ok: false, reason: "invalid_assertion" };

  // Every security-relevant field must be covered by Steam's signature; an unsigned claimed_id/return_to would be forgeable.
  const signed = new Set((get("signed") || "").split(",").map(item => item.trim()).filter(Boolean));
  if (!STEAM_OPENID.requiredSigned.every(name => signed.has(name))) return { ok: false, reason: "invalid_assertion" };
  if (!get("sig") || !get("assoc_handle")) return { ok: false, reason: "invalid_assertion" };

  // Fresh, well-formed response nonce (defense in depth on top of Steam's own single-use assertion and our single-use state).
  const nonce = NONCE_TIME.exec(get("response_nonce") || "");
  if (!nonce) return { ok: false, reason: "invalid_assertion" };
  const issued = Date.parse(`${nonce[1]}Z`);
  if (!Number.isFinite(issued) || nowMs - issued > STEAM_OPENID.nonceMaxAgeMs || issued - nowMs > STEAM_OPENID.nonceMaxFutureMs) {
    return { ok: false, reason: "invalid_assertion" };
  }

  return { ok: true, steamId, fields };
}

export async function verifyAssertion({ searchParams, expectedReturnTo, fetchImpl = fetch, nowMs = Date.now() }) {
  const local = checkAssertionLocally({ searchParams, expectedReturnTo, nowMs });
  if (!local.ok) return local;

  // Direct verification: send Steam back exactly the openid.* fields it produced, with the mode changed. Only Steam can
  // say whether the signature is genuine; nothing the browser sent is trusted until Steam answers `is_valid:true`.
  const body = new URLSearchParams();
  for (const [key, value] of local.fields) body.set(key, key === "openid.mode" ? "check_authentication" : value);

  let text = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STEAM_OPENID.verifyTimeoutMs);
    let response;
    try {
      response = await fetchImpl(STEAM_OPENID.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "text/plain", "User-Agent": USER_AGENT },
        body,
        redirect: "manual",
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false, reason: "provider_unavailable" };
      text = (await response.text()).slice(0, 4096);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { ok: false, reason: "provider_unavailable" };
  }

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const valid = lines.filter(line => /^is_valid:/i.test(line));
  if (valid.length !== 1 || valid[0] !== "is_valid:true") return { ok: false, reason: "verification_failed" };
  return { ok: true, steamId: local.steamId };
}

// ---------------------------------------------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------------------------------------------
// Non-sensitive result codes only - nothing from Steam, the assertion, or errors is ever placed in the return URL.
export function returnRedirect(result, reason) {
  const url = new URL(RETURN_URL);
  url.searchParams.set("connection", "steam");
  url.searchParams.set("result", result);
  if (reason) url.searchParams.set("reason", reason);
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

function json(body, status, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

const corsFor = origin => (origin === SITE_ORIGIN ? { "Access-Control-Allow-Origin": SITE_ORIGIN, Vary: "Origin" } : { Vary: "Origin" });

async function rpc(fetchImpl, env, name, args, { bearer, apikey }) {
  const response = await fetchImpl(`${String(env.supabaseUrl).replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  return { ok: response.ok, status: response.status, body };
}

const serviceRpc = (fetchImpl, env, name, args) => rpc(fetchImpl, env, name, args, { bearer: env.serviceKey, apikey: env.serviceKey });

// ---------------------------------------------------------------------------------------------------------------
// START - called by the signed-in GamID owner's browser. Returns the official Steam sign-in URL.
// ---------------------------------------------------------------------------------------------------------------
export async function handleStart({ request, env, fetchImpl = fetch }) {
  const origin = request.headers.get("origin");
  const cors = corsFor(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Access-Control-Max-Age": "600",
      },
    });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && origin !== SITE_ORIGIN) return json({ error: "origin_not_allowed" }, 403);
  if (!configured(env)) return json({ error: "not_configured" }, 503, cors);

  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/.exec(request.headers.get("authorization") || "");
  if (!match) return json({ error: "unauthenticated" }, 401, cors);

  let body = null;
  try { body = await request.json(); } catch { body = null; }
  if (body?.provider !== "steam") return json({ error: "invalid_provider" }, 400, cors);

  // The caller's own JWT is forwarded, so the database - not this function - authenticates the user (auth.uid()).
  const started = await rpc(fetchImpl, env, "start_connection_attempt", { candidate_provider: "steam" }, { bearer: match[1], apikey: env.anonKey });
  if (!started.ok) {
    const message = String(started.body?.message || "");
    if (started.status === 401 || message === "AUTH_REQUIRED") return json({ error: "unauthenticated" }, 401, cors);
    if (message === "EMAIL_NOT_VERIFIED") return json({ error: "email_not_verified" }, 403, cors);
    if (message === "IDENTITY_NOT_FOUND") return json({ error: "identity_not_found" }, 409, cors);
    if (message === "TOO_MANY_ATTEMPTS") return json({ error: "too_many_attempts" }, 429, cors);
    return json({ error: "start_failed" }, 502, cors);
  }
  const row = Array.isArray(started.body) ? started.body[0] : null;
  if (!row || !/^[0-9a-f]{64}$/.test(row.state || "")) return json({ error: "start_failed" }, 502, cors);

  return json({ authorization_url: buildAuthenticationUrl({ supabaseUrl: env.supabaseUrl, state: row.state }), expires_at: row.expires_at }, 200, cors);
}

// ---------------------------------------------------------------------------------------------------------------
// CALLBACK - Steam redirects the browser here. No GamID credentials are presented (cross-site navigation), so the initiating
// user is derived exclusively from the one-time, DB-bound state. The response is always a 302 back to the GamID UI carrying
// only a non-sensitive result code. The state is consumed BEFORE any outbound request, so an unknown/replayed/expired state
// never causes this function to contact Steam at all.
// ---------------------------------------------------------------------------------------------------------------
const STATE_REASON = { INVALID_STATE: "invalid_state", REPLAYED: "already_used", EXPIRED: "expired" };
const LINK_RESULT = {
  CONNECTED: ["connected"],
  RECONNECTED: ["reconnected"],
  ACCOUNT_ALREADY_LINKED: ["error", "account_in_use"],
  OWNER_HAS_OTHER_ACCOUNT: ["error", "other_account_connected"],
  IDENTITY_NOT_FOUND: ["error", "identity_not_found"],
  REPLAYED: ["error", "already_used"],
  INVALID_STATE: ["error", "invalid_state"],
  PROVIDER_ERROR: ["error", "provider_error"],
};
const VERIFY_REASON = { invalid_assertion: "verification_failed", verification_failed: "verification_failed", provider_unavailable: "provider_error" };

export async function handleCallback({ request, env, fetchImpl = fetch, log = () => {}, nowMs = Date.now() }) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (!configured(env)) { log("callback", "not_configured"); return returnRedirect("error", "not_configured"); }

  const searchParams = new URL(request.url).searchParams;
  const states = searchParams.getAll("state");
  const state = states.length === 1 ? states[0] : "";

  try {
    const consumed = await serviceRpc(fetchImpl, env, "consume_connection_attempt_for", { candidate_state: state, expected_provider: "steam" });
    if (!consumed.ok) { log("callback", "consume_failed"); return returnRedirect("error", "server_error"); }
    const attempt = Array.isArray(consumed.body) ? consumed.body[0] : null;
    if (!attempt || attempt.status !== "OK") {
      const status = attempt?.status || "INVALID_STATE";
      log("callback", `state_${status}`);
      return returnRedirect("error", STATE_REASON[status] || "invalid_state");
    }

    const finish = outcome => serviceRpc(fetchImpl, env, "finish_connection_attempt", { candidate_attempt_id: attempt.attempt_id, candidate_outcome: outcome });

    if (searchParams.get("openid.mode") === "cancel") {
      await finish("DENIED");
      log("callback", "cancelled");
      return returnRedirect("cancelled");
    }

    const verified = await verifyAssertion({ searchParams, expectedReturnTo: returnToFor(env.supabaseUrl, state), fetchImpl, nowMs });
    if (!verified.ok) {
      await finish(verified.reason === "provider_unavailable" ? "PROVIDER_ERROR" : "EXCHANGE_FAILED");
      log("callback", `verify_${verified.reason}`);
      return returnRedirect("error", VERIFY_REASON[verified.reason] || "verification_failed");
    }

    const completed = await serviceRpc(fetchImpl, env, "complete_steam_connection_attempt", {
      candidate_attempt_id: attempt.attempt_id,
      candidate_steam_id: verified.steamId,
    });
    const outcome = completed.ok && typeof completed.body === "string" ? completed.body : "PROVIDER_ERROR";
    log("callback", `link_${outcome}`);
    const [result, reason] = LINK_RESULT[outcome] || LINK_RESULT.PROVIDER_ERROR;
    return returnRedirect(result, reason);
  } catch (error) {
    log("callback", `unexpected_${error?.name || "error"}`);
    return returnRedirect("error", "server_error");
  }
}
