// Discord OAuth2 account-linking logic for the GamID TESTING backend (Supabase Edge Functions).
//
// Flow: Authorization Code grant, scope "identify" only. Tokens are never stored: the access token is used once to read
// /users/@me and is then revoked (which revokes the whole grant). PKCE is intentionally not used: Discord's current official
// OAuth2 documentation does not document PKCE, and this is a confidential server-side client (the client secret never leaves
// this backend), so the protections are one-time DB-bound state + exact registered redirect URI + server-side code exchange.
//
// Everything environmental (fetch, env, logging) is injected so the exact same code is exercised by the Node test suite.

export const DISCORD_OAUTH = Object.freeze({
  authorizeUrl: "https://discord.com/oauth2/authorize",
  tokenUrl: "https://discord.com/api/oauth2/token",
  revokeUrl: "https://discord.com/api/oauth2/token/revoke",
  userUrl: "https://discord.com/api/v10/users/@me",
  scope: "identify",
});

export const SITE_ORIGIN = "https://jeddawe11-eng.github.io";
export const RETURN_URL = `${SITE_ORIGIN}/gamid-testing/account/`;
export const CALLBACK_FUNCTION = "discord-connect-callback";
const USER_AGENT = "GamID-Testing-OAuth (https://jeddawe11-eng.github.io/gamid-testing/, 1.0)";

export function readEnv(get) {
  return {
    supabaseUrl: get("SUPABASE_URL"),
    anonKey: get("SUPABASE_ANON_KEY"),
    serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
    discordClientId: get("DISCORD_CLIENT_ID"),
    discordClientSecret: get("DISCORD_CLIENT_SECRET"),
  };
}

const configured = env => Boolean(env?.supabaseUrl && env.anonKey && env.serviceKey && env.discordClientId && env.discordClientSecret);

export function redirectUriFor(supabaseUrl) {
  return `${String(supabaseUrl).replace(/\/+$/, "")}/functions/v1/${CALLBACK_FUNCTION}`;
}

export function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: DISCORD_OAUTH.scope,
    redirect_uri: redirectUri,
    state,
    prompt: "consent",
  });
  return `${DISCORD_OAUTH.authorizeUrl}?${params.toString()}`;
}

export function buildAvatarUrl(userId, avatarHash) {
  if (typeof avatarHash !== "string" || !/^(a_)?[0-9a-f]{32}$/.test(avatarHash)) return null;
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`;
}

// Non-sensitive result codes only — nothing from Discord, tokens, or errors is ever placed in the return URL.
export function returnRedirect(result, reason) {
  const url = new URL(RETURN_URL);
  url.searchParams.set("connection", "discord");
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

function corsFor(origin) {
  return origin === SITE_ORIGIN ? { "Access-Control-Allow-Origin": SITE_ORIGIN, Vary: "Origin" } : { Vary: "Origin" };
}

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
// START — called by the signed-in GamID owner's browser. Returns the official Discord authorization URL.
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
  if (body?.provider !== "discord") return json({ error: "invalid_provider" }, 400, cors);

  // The caller's own JWT is forwarded, so the database — not this function — authenticates the user (auth.uid()).
  const started = await rpc(fetchImpl, env, "start_connection_attempt", { candidate_provider: "discord" }, { bearer: match[1], apikey: env.anonKey });
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

  return json({
    authorization_url: buildAuthorizeUrl({ clientId: env.discordClientId, redirectUri: redirectUriFor(env.supabaseUrl), state: row.state }),
    expires_at: row.expires_at,
  }, 200, cors);
}

// ---------------------------------------------------------------------------------------------------------------
// CALLBACK — Discord redirects the browser here. No GamID credentials are presented (cross-site navigation), so the
// initiating user is derived exclusively from the one-time, DB-bound state. The response is always a 302 back to the
// GamID UI carrying only a non-sensitive result code.
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

async function revokeQuietly(fetchImpl, env, accessToken) {
  try {
    const response = await fetchImpl(DISCORD_OAUTH.revokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
      body: new URLSearchParams({ client_id: env.discordClientId, client_secret: env.discordClientSecret, token: accessToken, token_type_hint: "access_token" }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function handleCallback({ request, env, fetchImpl = fetch, log = () => {} }) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (!configured(env)) { log("callback", "not_configured"); return returnRedirect("error", "not_configured"); }

  const params = new URL(request.url).searchParams;
  const state = params.get("state") || "";
  const code = params.get("code") || "";
  const providerError = params.get("error");

  try {
    const consumed = await serviceRpc(fetchImpl, env, "consume_connection_attempt", { candidate_state: state });
    if (!consumed.ok) { log("callback", "consume_failed"); return returnRedirect("error", "server_error"); }
    const attempt = Array.isArray(consumed.body) ? consumed.body[0] : null;
    if (!attempt || attempt.status !== "OK") {
      const status = attempt?.status || "INVALID_STATE";
      log("callback", `state_${status}`);
      return returnRedirect("error", STATE_REASON[status] || "invalid_state");
    }

    const finish = outcome => serviceRpc(fetchImpl, env, "finish_connection_attempt", { candidate_attempt_id: attempt.attempt_id, candidate_outcome: outcome });

    if (providerError) {
      const denied = providerError === "access_denied";
      await finish(denied ? "DENIED" : "PROVIDER_ERROR");
      log("callback", denied ? "cancelled" : "provider_error");
      return denied ? returnRedirect("cancelled") : returnRedirect("error", "provider_error");
    }
    if (!/^[A-Za-z0-9._~-]{1,512}$/.test(code)) {
      await finish("PROVIDER_ERROR");
      log("callback", "missing_code");
      return returnRedirect("error", "provider_error");
    }

    // Server-side code exchange. The client secret exists only in this function's environment.
    let token = null;
    try {
      const response = await fetchImpl(DISCORD_OAUTH.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": USER_AGENT },
        body: new URLSearchParams({
          client_id: env.discordClientId,
          client_secret: env.discordClientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUriFor(env.supabaseUrl),
        }),
      });
      if (response.ok) token = await response.json();
    } catch { token = null; }

    const accessToken = typeof token?.access_token === "string" ? token.access_token : null;
    const grantedScopes = typeof token?.scope === "string" ? token.scope.split(/\s+/).filter(Boolean) : [];
    const scopeOk = grantedScopes.length === 1 && grantedScopes[0] === DISCORD_OAUTH.scope;
    if (!accessToken || String(token?.token_type).toLowerCase() !== "bearer" || !scopeOk) {
      if (accessToken) await revokeQuietly(fetchImpl, env, accessToken);
      await finish("EXCHANGE_FAILED");
      log("callback", "exchange_failed");
      return returnRedirect("error", "exchange_failed");
    }

    // Read only the minimum identity, then discard the credential: revoke the grant immediately (nothing is retained).
    let discordUser = null;
    try {
      const response = await fetchImpl(DISCORD_OAUTH.userUrl, { headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": USER_AGENT } });
      if (response.ok) discordUser = await response.json();
    } catch { discordUser = null; }
    const revoked = await revokeQuietly(fetchImpl, env, accessToken);
    if (!revoked) log("callback", "revoke_failed");

    if (!discordUser || !/^[0-9]{5,25}$/.test(String(discordUser.id)) || typeof discordUser.username !== "string" || !discordUser.username) {
      await finish("PROVIDER_ERROR");
      log("callback", "identity_unavailable");
      return returnRedirect("error", "provider_error");
    }

    const completed = await serviceRpc(fetchImpl, env, "complete_connection_attempt", {
      candidate_attempt_id: attempt.attempt_id,
      candidate_account_id: String(discordUser.id),
      candidate_username: discordUser.username.slice(0, 64),
      candidate_display_name: typeof discordUser.global_name === "string" ? discordUser.global_name.slice(0, 64) : null,
      candidate_avatar_url: buildAvatarUrl(String(discordUser.id), discordUser.avatar),
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
