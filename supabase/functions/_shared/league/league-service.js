// League lookup orchestration for the GamID TESTING backend (Supabase Edge Function `league-lookup`).
//
// Source-neutral: the data source is injected as an adapter `{ sourceKey, lookup(query, { fetchImpl }) }` that returns a
// LeagueSnapshot (see league-domain.js) or `{ ok:false, code }`. Swapping the temporary source for an official one does not
// touch this file.
//
// Order of operations for every add/refresh (each step can end the request):
//   1. CORS/origin, method, configuration, Bearer token.
//   2. Validate + normalize input SERVER-side (add only; a refresh can never change the stored identity).
//   3. Reserve the lookup in the database AS THE CALLER (their own JWT -> auth.uid()). This proves ownership, enforces the
//      throttle (60 s spacing, 6 per hour, 10 min Refresh cooldown) and mints a one-time reservation — all BEFORE any outbound
//      request, so a throttled or unauthorized call never reaches the data source.
//   4. One data-source lookup, no retries.
//   5. Persist only the normalized snapshot through a service_role RPC bound to that reservation.
// The browser only ever receives a short status word; the stored data is read back through an owner-only RPC.

import { normalizeRiotIdInput, validateSnapshot } from "./league-domain.js";

// Must equal the Discord slice's site origin (asserted by a test); duplicated so this module does not depend on it.
export const SITE_ORIGIN = "https://jeddawe11-eng.github.io";

export function readLeagueEnv(get) {
  return { supabaseUrl: get("SUPABASE_URL"), anonKey: get("SUPABASE_ANON_KEY"), serviceKey: get("SUPABASE_SERVICE_ROLE_KEY") };
}

const configured = env => Boolean(env?.supabaseUrl && env.anonKey && env.serviceKey);

function json(body, status, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
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

const FAILURE_STATUS = { NOT_FOUND: "not_found", UNAVAILABLE: "unavailable", STRUCTURE_CHANGED: "structure_changed" };
const INPUT_FIELD = { INVALID_GAME_NAME: "game_name", INVALID_TAG_LINE: "tag_line", INVALID_REGION: "region" };

export async function handleLeagueLookup({ request, env, adapter, fetchImpl = fetch, log = () => {} }) {
  const origin = request.headers.get("origin");
  const cors = corsFor(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Max-Age": "600" },
    });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && origin !== SITE_ORIGIN) return json({ error: "origin_not_allowed" }, 403);
  if (!configured(env)) return json({ error: "not_configured" }, 503, cors);

  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/.exec(request.headers.get("authorization") || "");
  if (!match) return json({ error: "unauthenticated" }, 401, cors);

  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const action = body?.action;
  if (action !== "add" && action !== "refresh") return json({ error: "invalid_action" }, 400, cors);

  let reserveArgs = { candidate_action: action, candidate_platform_id: null, candidate_game_name: null, candidate_tag_line: null };
  if (action === "add") {
    const parsed = normalizeRiotIdInput({ gameName: body?.game_name, tagLine: body?.tag_line, platformId: body?.region });
    if (!parsed.ok) return json({ error: "invalid_input", field: INPUT_FIELD[parsed.code] }, 400, cors);
    reserveArgs = { candidate_action: "add", candidate_platform_id: parsed.value.platformId, candidate_game_name: parsed.value.gameName, candidate_tag_line: parsed.value.tagLine };
  }

  try {
    // Step 3 — the database, acting as the signed-in caller, authorizes and throttles.
    const reserved = await rpc(fetchImpl, env, "reserve_league_lookup", reserveArgs, { bearer: match[1], apikey: env.anonKey });
    if (!reserved.ok) {
      const message = String(reserved.body?.message || "");
      if (reserved.status === 401 || message === "AUTH_REQUIRED") return json({ error: "unauthenticated" }, 401, cors);
      if (message === "EMAIL_NOT_VERIFIED") return json({ error: "email_not_verified" }, 403, cors);
      if (message === "IDENTITY_NOT_FOUND") return json({ error: "identity_not_found" }, 409, cors);
      log("league", "reserve_failed");
      return json({ error: "lookup_failed" }, 502, cors);
    }
    const slot = Array.isArray(reserved.body) ? reserved.body[0] : null;
    if (!slot) return json({ error: "lookup_failed" }, 502, cors);
    if (slot.status === "COOLDOWN" || slot.status === "RATE_LIMITED") {
      const retry = Number.isInteger(slot.retry_after_seconds) && slot.retry_after_seconds > 0 ? slot.retry_after_seconds : 60;
      log("league", slot.status.toLowerCase());
      return json({ error: slot.status === "COOLDOWN" ? "cooldown" : "rate_limited", retry_after_seconds: retry }, 429, { ...cors, "Retry-After": String(retry) });
    }
    if (slot.status === "ALREADY_EXISTS") return json({ error: "already_exists" }, 409, cors);
    if (slot.status === "NO_PROFILE") return json({ error: "no_profile" }, 409, cors);
    if (slot.status === "INVALID_INPUT") return json({ error: "invalid_input" }, 400, cors);
    if (slot.status !== "OK" || !slot.reservation_id) return json({ error: "lookup_failed" }, 502, cors);

    const reservationId = slot.reservation_id;
    const finish = outcome => rpc(fetchImpl, env, "finish_league_lookup", { candidate_reservation_id: reservationId, candidate_outcome: outcome }, { bearer: env.serviceKey, apikey: env.serviceKey }).catch(() => null);

    // Step 4 — exactly one lookup, for exactly the identity the database reserved (a refresh uses the STORED identity).
    let result;
    try {
      result = await adapter.lookup({ gameName: slot.game_name, tagLine: slot.tag_line, platformId: slot.platform_id }, { fetchImpl });
    } catch { result = { ok: false, code: "UNAVAILABLE" }; }

    if (!result?.ok || !validateSnapshot(result.snapshot)) {
      const code = result?.ok ? "STRUCTURE_CHANGED" : (FAILURE_STATUS[result?.code] ? result.code : "UNAVAILABLE");
      await finish(code);
      log("league", `lookup_${code}`);
      return json({ status: FAILURE_STATUS[code] }, 200, cors);
    }

    // Step 5 — persist the normalized snapshot only.
    const s = result.snapshot;
    const saved = await rpc(fetchImpl, env, "save_league_lookup", {
      candidate_reservation_id: reservationId,
      candidate_data_source: adapter.sourceKey,
      candidate_game_name: s.gameName,
      candidate_tag_line: s.tagLine,
      candidate_platform_id: s.platformId,
      candidate_rank_state: s.soloRank.state,
      candidate_tier: s.soloRank.tier,
      candidate_division: s.soloRank.division,
      candidate_lp: s.soloRank.lp,
      candidate_wins: s.soloRank.wins,
      candidate_losses: s.soloRank.losses,
      candidate_profile_icon_id: s.profileIconId,
      candidate_source_url: s.sourceUrl,
      candidate_source_updated_at: s.sourceUpdatedAt,
    }, { bearer: env.serviceKey, apikey: env.serviceKey });

    const outcome = saved.ok && typeof saved.body === "string" ? saved.body : "SAVE_FAILED";
    log("league", `save_${outcome}`);
    if (outcome === "SAVED") return json({ status: "ok" }, 200, cors);
    if (outcome === "IDENTITY_MISMATCH") return json({ status: "identity_mismatch" }, 200, cors);
    if (outcome === "ALREADY_EXISTS") return json({ error: "already_exists" }, 409, cors);
    return json({ error: "save_failed" }, 502, cors);
  } catch (error) {
    log("league", `unexpected_${error?.name || "error"}`);
    return json({ error: "lookup_failed" }, 502, cors);
  }
}
