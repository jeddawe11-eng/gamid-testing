import { createDiscordVoiceProvider, readDiscordVoiceEnv } from "./discord-voice-provider.js";
import { voiceProvider } from "./voice-provider.js";

const SITE_ORIGINS = new Set(["https://gamid-testing-static.gamid.workers.dev", "https://jeddawe11-eng.github.io"]);
const DISCORD = Object.freeze({ authorize: "https://discord.com/oauth2/authorize", token: "https://discord.com/api/oauth2/token", revoke: "https://discord.com/api/oauth2/token/revoke", user: "https://discord.com/api/v10/users/@me", scopes: Object.freeze(["identify", "guilds.join"]) });
const USER_AGENT = "GamID-PlayTogether-Voice/1.0";
const json = (body, status, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const corsFor = origin => SITE_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" };
const bearer = request => /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/.exec(request.headers.get("authorization") || "")?.[1] || null;
const base = env => String(env.supabaseUrl || "").replace(/\/+$/, "");

export function readVoiceEnv(read) {
  return { supabaseUrl: read("SUPABASE_URL"), anonKey: read("SUPABASE_ANON_KEY"), serviceKey: read("SUPABASE_SERVICE_ROLE_KEY"), discordClientId: read("DISCORD_CLIENT_ID"), discordClientSecret: read("DISCORD_CLIENT_SECRET"), reconcileSecret: read("PLAY_TOGETHER_VOICE_RECONCILE_SECRET"), ...readDiscordVoiceEnv(read) };
}
const configured = env => Boolean(env?.supabaseUrl && env.anonKey && env.serviceKey && env.discordClientId && env.discordClientSecret);
const callbackUri = env => `${base(env)}/functions/v1/play-together-voice-authorize-callback`;
const returnUri = result => `https://gamid-testing-static.gamid.workers.dev/play-together/?voice=${encodeURIComponent(result)}`;

async function rpc(fetchImpl, env, name, args, token, service = false) {
  const key = service ? env.serviceKey : env.anonKey;
  const response = await fetchImpl(`${base(env)}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${service ? env.serviceKey : token}`, "Content-Type": "application/json" }, body: JSON.stringify(args || {}) });
  let body = null; try { body = await response.json(); } catch { body = null; }
  return { ok: response.ok, status: response.status, body };
}
const first = body => Array.isArray(body) ? body[0] : body;
const redirect = result => new Response(null, { status: 302, headers: { Location: returnUri(result), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

async function revoke(fetchImpl, env, token) {
  if (!token) return;
  await fetchImpl(DISCORD.revoke, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT }, body: new URLSearchParams({ client_id: env.discordClientId, client_secret: env.discordClientSecret, token, token_type_hint: "access_token" }) }).catch(() => null);
}
export async function handleVoiceAuthorizeStart({ request, env, fetchImpl = fetch }) {
  const origin = request.headers.get("origin"), cors = corsFor(origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" } });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && !SITE_ORIGINS.has(origin)) return json({ error: "origin_not_allowed" }, 403, cors);
  const token = bearer(request); if (!token) return json({ error: "unauthenticated" }, 401, cors);
  if (!configured(env)) return json({ error: "not_configured" }, 503, cors);
  let body = null; try { body = await request.json(); } catch { body = null; }
  if (!/^[0-9a-f-]{36}$/.test(body?.session_id || "")) return json({ error: "invalid_session" }, 400, cors);
  const started = await rpc(fetchImpl, env, "start_play_together_voice_oauth", { candidate_session_id: body.session_id }, token);
  const row = first(started.body);
  if (!started.ok || !/^[0-9a-f]{64}$/.test(row?.state || "")) return json({ error: String(started.body?.message || "authorization_failed") }, started.status || 502, cors);
  const params = new URLSearchParams({ client_id: env.discordClientId, response_type: "code", scope: DISCORD.scopes.join(" "), redirect_uri: callbackUri(env), state: row.state, prompt: "consent" });
  return json({ authorization_url: `${DISCORD.authorize}?${params.toString().replace(/\+/g, "%20")}`, expires_at: row.expires_at }, 200, cors);
}

export async function handleVoiceAuthorizeCallback({ request, env, fetchImpl = fetch, log = () => {} }) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (!configured(env)) return redirect("not_configured");
  const params = new URL(request.url).searchParams;
  const consumed = await rpc(fetchImpl, env, "consume_play_together_voice_oauth", { candidate_state: params.get("state") || "" }, null, true);
  const attempt = first(consumed.body);
  if (!consumed.ok || attempt?.status !== "OK") return redirect(String(attempt?.status || "invalid_state").toLowerCase());
  if (params.get("error")) { await rpc(fetchImpl, env, "complete_play_together_voice_oauth", { candidate_attempt_id: attempt.attempt_id, candidate_provider_account_id: attempt.expected_provider_account_id, candidate_guild_id: env.discordGuildId, candidate_outcome: "DENIED" }, null, true); return redirect("denied"); }
  let tokenBody = null;
  try { const response = await fetchImpl(DISCORD.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT }, body: new URLSearchParams({ client_id: env.discordClientId, client_secret: env.discordClientSecret, grant_type: "authorization_code", code: params.get("code") || "", redirect_uri: callbackUri(env) }) }); if (response.ok) tokenBody = await response.json(); } catch { tokenBody = null; }
  const accessToken = typeof tokenBody?.access_token === "string" ? tokenBody.access_token : null;
  const scopes = new Set(String(tokenBody?.scope || "").split(/\s+/).filter(Boolean));
  if (!accessToken || scopes.size !== DISCORD.scopes.length || DISCORD.scopes.some(scope => !scopes.has(scope))) { await revoke(fetchImpl, env, accessToken); return redirect("scope_error"); }
  let user = null;
  try { const response = await fetchImpl(DISCORD.user, { headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": USER_AGENT } }); if (response.ok) user = await response.json(); } catch { user = null; }
  if (!/^[0-9]{5,25}$/.test(String(user?.id || "")) || String(user.id) !== attempt.expected_provider_account_id) { await revoke(fetchImpl, env, accessToken); await rpc(fetchImpl, env, "complete_play_together_voice_oauth", { candidate_attempt_id: attempt.attempt_id, candidate_provider_account_id: String(user?.id || "0"), candidate_guild_id: env.discordGuildId, candidate_outcome: "ACCOUNT_MISMATCH" }, null, true); return redirect("account_mismatch"); }
  let joined;
  try { joined = await createDiscordVoiceProvider({ env, fetchImpl }).ensureParticipant({ providerAccountId: String(user.id), accessToken }); } catch { joined = { ok: false, code: "DISCORD_VOICE_NOT_CONFIGURED" }; }
  await revoke(fetchImpl, env, accessToken);
  const outcome = joined.ok ? "READY" : joined.code;
  await rpc(fetchImpl, env, "complete_play_together_voice_oauth", { candidate_attempt_id: attempt.attempt_id, candidate_provider_account_id: String(user.id), candidate_guild_id: env.discordGuildId, candidate_outcome: outcome }, null, true);
  log("voice-oauth", joined.ok ? "ready" : outcome.toLowerCase());
  return redirect(joined.ok ? "ready" : outcome.toLowerCase());
}

export async function handleVoice({ request, env, fetchImpl = fetch, log = () => {} }) {
  const origin = request.headers.get("origin"), cors = corsFor(origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" } });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && !SITE_ORIGINS.has(origin)) return json({ error: "origin_not_allowed" }, 403, cors);
  const token = bearer(request); if (!token) return json({ error: "unauthenticated" }, 401, cors);
  if (!configured(env)) return json({ error: "not_configured" }, 503, cors);
  let body = null; try { body = await request.json(); } catch { body = null; }
  if (!/^[0-9a-f-]{36}$/.test(body?.session_id || "") || !["PROVISION", "JOIN"].includes(body?.action)) return json({ error: "invalid_request" }, 400, cors);
  if (body.action === "JOIN") {
    const allowed = await rpc(fetchImpl, env, "get_play_together_voice_join", { candidate_session_id: body.session_id }, token);
    const target = first(allowed.body);
    if (!allowed.ok || !target?.channel_id) return json({ error: String(allowed.body?.message || "voice_not_ready") }, allowed.status || 409, cors);
    try { return json({ join_url: voiceProvider({ discord: createDiscordVoiceProvider({ env, fetchImpl }) }, target.provider).joinTarget({ guildId: target.guild_id, channelId: target.channel_id }) }, 200, cors); } catch { return json({ error: "join_unavailable" }, 503, cors); }
  }
  const ensured = await rpc(fetchImpl, env, "ensure_play_together_voice_session", { candidate_session_id: body.session_id, candidate_provider: "discord" }, token);
  const voiceSessionId = first(ensured.body);
  if (!ensured.ok || !/^[0-9a-f-]{36}$/.test(String(voiceSessionId || ""))) return json({ error: String(ensured.body?.message || "voice_session_failed") }, ensured.status || 409, cors);
  const claim = await rpc(fetchImpl, env, "claim_play_together_voice_provision", { candidate_voice_session_id: voiceSessionId, candidate_guild_id: env.discordGuildId }, null, true);
  const work = first(claim.body);
  if (!claim.ok) return json({ error: "provision_claim_failed" }, 502, cors);
  if (work?.status === "READY") return json({ state: "READY" }, 200, cors);
  if (work?.status !== "CLAIMED") return json({ state: work?.status || "PENDING", count: work?.count || 0 }, 409, cors);
  let provisioned;
  try { provisioned = await voiceProvider({ discord: createDiscordVoiceProvider({ env, fetchImpl }) }, "discord").ensureSession({ channelKey: work.channel_key, members: work.members }); } catch { provisioned = { ok: false, code: "DISCORD_VOICE_NOT_CONFIGURED" }; }
  await rpc(fetchImpl, env, "finish_play_together_voice_provision", { candidate_voice_session_id: voiceSessionId, candidate_channel_id: provisioned.channelId || null, candidate_error_code: provisioned.ok ? null : provisioned.code }, null, true);
  log("voice-provision", provisioned.ok ? (provisioned.recovered ? "recovered" : "created") : provisioned.code.toLowerCase());
  return provisioned.ok ? json({ state: "READY" }, 200, cors) : json({ state: "FAILED", error: provisioned.code }, provisioned.code === "DISCORD_RATE_LIMIT" ? 429 : 502, cors);
}

export async function handleVoiceReconcile({ request, env, fetchImpl = fetch, log = () => {} }) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env?.reconcileSecret || request.headers.get("x-gamid-reconcile-secret") !== env.reconcileSecret) return json({ error: "unauthorized" }, 401);
  const claimed = await rpc(fetchImpl, env, "claim_play_together_voice_cleanup", { candidate_limit: 20 }, null, true);
  if (!claimed.ok) return json({ error: "cleanup_claim_failed" }, 502);
  const rows = Array.isArray(claimed.body) ? claimed.body : [];
  let ended = 0, failed = 0;
  for (const row of rows) {
    let result;
    try { result = await voiceProvider({ discord: createDiscordVoiceProvider({ env, fetchImpl }) }, row.provider_key).endSession({ channelId: row.provider_channel_id }); } catch { result = { ok: false, code: "VOICE_PROVIDER_UNAVAILABLE" }; }
    await rpc(fetchImpl, env, "finish_play_together_voice_cleanup", { candidate_voice_session_id: row.voice_session_id, candidate_deleted: result.ok, candidate_error_code: result.ok ? null : result.code }, null, true);
    result.ok ? ended++ : failed++;
  }
  log("voice-reconcile", `ended_${ended}_failed_${failed}`);
  return json({ claimed: rows.length, ended, failed }, 200);
}
