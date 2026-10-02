import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleVoice } from "../supabase/functions/_shared/play-together-voice.js";

const migration = readFileSync(new URL("../supabase/migrations/20261001112124_play_together_voice_provision_aggregate_order.sql", import.meta.url), "utf8");
const ui = readFileSync(new URL("../dist/play-together/play-together.js", import.meta.url), "utf8");
const env = { supabaseUrl: "https://testing.example", anonKey: "anon", serviceKey: "service", discordClientId: "client", discordClientSecret: "secret", discordBotToken: "bot", discordGuildId: "100000000000000001", discordCategoryId: "100000000000000002", discordBotUserId: "100000000000000003" };
const sid = "11111111-1111-4111-8111-111111111111";
const channelId = "100000000000000099";
const members = [{ provider_account_id: "100000000000000010" }, { provider_account_id: "100000000000000011" }];
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("provision claim orders members inside the aggregate, avoiding PostgreSQL 42803", () => {
  assert.match(migration, /provider_account_id\) order by entity_id\) into members/);
  assert.doesNotMatch(migration, /where voice_session_id=v\.voice_session_id order by entity_id/);
  assert.match(migration, /for update/);
  assert.match(migration, /PARTICIPANTS_NOT_READY/);
});

for (const forbidden of [false, true]) test(forbidden ? "Discord rejection is persisted and returned without claiming READY" : "two READY participants create a private category channel, persist READY, and retry without duplication", async () => {
  let state = "PENDING";
  let created = 0;
  let savedError = null;
  const fetchImpl = async (url, init = {}) => {
    if (url.endsWith('/users/@me')) return reply({ id: env.discordBotUserId, bot: true });
    if (url.endsWith("/ensure_play_together_voice_session")) return reply(sid);
    if (url.endsWith("/claim_play_together_voice_provision")) return reply(state === "READY" ? { status: "READY" } : { status: "CLAIMED", channel_key: "team-111111111111", members });
    if (url.endsWith("/finish_play_together_voice_provision")) {
      const body = JSON.parse(init.body);
      savedError = body.candidate_error_code;
      state = savedError ? "FAILED" : "READY";
      assert.equal(body.candidate_channel_id, forbidden ? null : channelId);
      return reply(state);
    }
    if (url.endsWith("/channels") && init.method === "POST") {
      created++;
      const body = JSON.parse(init.body);
      assert.equal(body.parent_id, env.discordCategoryId);
      assert.equal(body.type, 2);
      assert.equal(body.user_limit, 2);
      assert.equal(body.permission_overwrites[0].allow, "0");
      assert.deepEqual(body.permission_overwrites.slice(1, 3).map(x => x.id), members.map(x => x.provider_account_id));
      return forbidden ? reply({ code: 50013, message: "Missing Permissions" }, 403) : reply({ id: channelId }, 201);
    }
    if (url.endsWith("/channels")) return reply([]);
    throw new Error("Unexpected request");
  };
  const request = () => new Request("https://testing.example/voice", { method: "POST", headers: { authorization: "Bearer user.jwt" }, body: JSON.stringify({ action: "PROVISION", session_id: sid }) });
  const result = await handleVoice({ request: request(), env, fetchImpl });
  assert.equal(result.status, forbidden ? 502 : 200);
  assert.equal(state, forbidden ? "FAILED" : "READY");
  if (forbidden) {
    assert.equal(savedError, "DISCORD_CHANNEL_FORBIDDEN");
    assert.equal((await result.json()).error, savedError);
  } else {
    assert.equal((await (await handleVoice({ request: request(), env, fetchImpl })).json()).state, "READY");
    assert.equal(created, 1);
  }
});

test("automatic provisioning failures expose the existing error and retry controls", () => {
  const provision = ui.slice(ui.indexOf("async function provisionVoice"), ui.indexOf("async function joinVoice"));
  assert.match(provision, /catch\(error\)\{\$\("voiceFailure"\)\.hidden=false/);
  assert.match(provision, /\$\("voiceFailure"\)\.textContent=displayError\(error\)/);
  assert.match(provision, /\$\("retryVoiceButton"\)\.hidden=false/);
});
