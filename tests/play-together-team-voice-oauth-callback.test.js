import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleVoiceAuthorizeCallback } from "../supabase/functions/_shared/play-together-voice.js";

const migration = readFileSync(new URL("../supabase/migrations/20261001180000_play_together_voice_oauth_consume_pgcrypto.sql", import.meta.url), "utf8");
const snow = "100000000000000044";
const attemptId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const env = {
  supabaseUrl: "https://gamid-testing.supabase.co",
  anonKey: "ANON",
  serviceKey: "SERVICE",
  discordClientId: "100000000000000007",
  discordClientSecret: "SECRET",
  discordBotToken: "BOT",
  discordGuildId: "100000000000000001",
  discordCategoryId: "100000000000000002",
  discordBotUserId: "100000000000000003"
};
const response = (body, status = 200) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("OAuth callback state lookup uses schema-qualified pgcrypto under the empty search path", () => {
  assert.match(migration, /consume_play_together_voice_oauth_impl/);
  assert.match(migration, /security definer set search_path=''/);
  assert.match(migration, /extensions\.digest\(candidate_state,'sha256'\)/);
  assert.doesNotMatch(migration, /(?<!extensions\.)digest\(/);
});

test("successful Discord callback persists READY consent so authorization is not requested again", async () => {
  let participantVoiceState = "CONSENT_REQUIRED";
  let completed = 0;
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith("/rest/v1/rpc/consume_play_together_voice_oauth")) {
      return response([{ status: "OK", attempt_id: attemptId, entity_id: "33333333-3333-4333-8333-333333333333", session_id: sessionId, expected_provider_account_id: snow }]);
    }
    if (target.endsWith("/api/oauth2/token")) return response({ access_token: "USER_ACCESS", scope: "identify guilds.join" });
    if (target.endsWith("/api/v10/users/@me")) return response({ id: snow });
    if (target.includes(`/guilds/${env.discordGuildId}/members/${snow}`)) return response(null, 204);
    if (target.endsWith("/rest/v1/rpc/complete_play_together_voice_oauth")) {
      const args = JSON.parse(init.body);
      assert.equal(args.candidate_attempt_id, attemptId);
      assert.equal(args.candidate_outcome, "READY");
      participantVoiceState = "READY";
      completed++;
      return response("READY");
    }
    if (target.endsWith("/api/oauth2/token/revoke")) return response(null, 200);
    throw new Error(`Unexpected request: ${target}`);
  };

  const request = new Request(`https://gamid-testing.supabase.co/functions/v1/play-together-voice-authorize-callback?code=discord-code&state=${"a".repeat(64)}`);
  const result = await handleVoiceAuthorizeCallback({ request, env, fetchImpl });

  assert.equal(result.status, 302);
  assert.equal(result.headers.get("location"), "https://gamid-testing-static.gamid.workers.dev/play-together/?voice=ready");
  assert.equal(completed, 1);
  assert.equal(participantVoiceState, "READY", "the next Team Room render skips ENABLE TEAM VOICE and continues provisioning");
});
