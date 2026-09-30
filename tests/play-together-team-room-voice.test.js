import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { channelOverwrites, createDiscordVoiceProvider, discordVoiceConfigured } from "../supabase/functions/_shared/discord-voice-provider.js";
import { voiceProvider } from "../supabase/functions/_shared/voice-provider.js";
import { handleVoiceAuthorizeStart, handleVoiceReconcile, readVoiceEnv } from "../supabase/functions/_shared/play-together-voice.js";

const migration = readFileSync(new URL("../supabase/migrations/20260930170000_play_together_team_room_voice.sql", import.meta.url), "utf8");
const ui = readFileSync(new URL("../dist/play-together/play-together.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../dist/play-together/index.html", import.meta.url), "utf8");
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
const snow = n => String(100000000000000000n + BigInt(n));
const env = { discordBotToken: "BOT", discordGuildId: snow(1), discordCategoryId: snow(2), discordBotUserId: snow(3) };
const response = (body, status = 200, headers = {}) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

test("schema is additive, provider-neutral, one voice session per canonical Play Together session", () => {
  assert.match(migration, /create table private\.play_together_voice_sessions/);
  assert.match(migration, /session_id uuid not null unique references public\.play_together_sessions/);
  assert.match(migration, /provider_key text not null/);
  assert.match(migration, /'PENDING','PROVISIONING','READY','ACTIVE','ENDING','ENDED','FAILED'/);
  assert.doesNotMatch(migration, /alter table public\.play_together_sessions|drop table|drop function/i);
});
test("authorization is server-side through authenticated GamID membership and a matching linked Discord account", () => {
  assert.match(migration, /private\.play_together_voice_member\(candidate_session_id,me\)/);
  assert.match(migration, /member_kind='GAMID' and m\.membership_status='ACCEPTED'/);
  assert.match(migration, /expected_provider_account_id<>candidate_provider_account_id/);
  assert.match(migration, /VOICE_MEMBERSHIP_REQUIRED/);
  assert.doesNotMatch(migration, /grant (select|insert|update|delete).*play_together_voice/i);
});

test("five participants get explicit private-channel access while everyone else is denied", () => {
  const members = Array.from({ length: 5 }, (_, i) => ({ provider_account_id: snow(10 + i) }));
  const overwrites = channelOverwrites(env.discordGuildId, env.discordBotUserId, members);
  assert.equal(overwrites.length, 7);
  assert.deepEqual(overwrites[0], { id: env.discordGuildId, type: 0, allow: "0", deny: "1049600" });
  assert.deepEqual(overwrites.slice(1, 6).map(x => x.id), members.map(x => x.provider_account_id));
  assert.ok(BigInt(overwrites.at(-1).allow) & 16n, "bot can manage the temporary channel");
});

test("Discord provisioning is idempotent after an interrupted database write", async () => {
  const calls = [];
  const existing = { id: snow(80), type: 2, name: "team-abcdef123456", parent_id: env.discordCategoryId };
  const fetchImpl = async (url, init = {}) => { calls.push({ url, init }); return response([existing]); };
  const result = await createDiscordVoiceProvider({ env, fetchImpl }).ensureSession({ channelKey: existing.name, members: [{ provider_account_id: snow(10) }] });
  assert.deepEqual(result, { ok: true, guildId: env.discordGuildId, channelId: existing.id, recovered: true });
  assert.equal(calls.length, 1);
  assert.equal(calls.some(call => call.init.method === "POST"), false, "retry finds the deterministic channel instead of creating a duplicate");
});

test("new Discord channel is private, bounded to the squad, and uses the configured Team Voice category", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (!init.method) return response([]);
    return response({ id: snow(90) }, 201);
  };
  const members = Array.from({ length: 5 }, (_, i) => ({ provider_account_id: snow(20 + i) }));
  const result = await createDiscordVoiceProvider({ env, fetchImpl }).ensureSession({ channelKey: "team-abcdef123456", members });
  assert.equal(result.ok, true);
  const payload = JSON.parse(calls[1].init.body);
  assert.equal(payload.type, 2);
  assert.equal(payload.user_limit, 5);
  assert.equal(payload.parent_id, env.discordCategoryId);
  assert.deepEqual(payload.permission_overwrites.slice(1, 6).map(x => x.id), members.map(x => x.provider_account_id));
});

test("guild admission uses the authenticated Discord user token and cleanup treats an absent channel as ended", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => { calls.push({ url, init }); return url.includes("/members/") ? response(null, 204) : response({ message: "Unknown Channel" }, 404); };
  const provider = createDiscordVoiceProvider({ env, fetchImpl });
  assert.equal((await provider.ensureParticipant({ providerAccountId: snow(44), accessToken: "USER_ACCESS" })).ok, true);
  assert.equal(JSON.parse(calls[0].init.body).access_token, "USER_ACCESS");
  assert.equal((await provider.endSession({ channelId: snow(99) })).ok, true);
  assert.equal(calls[1].init.method, "DELETE");
});

test("provider registry keeps Team Room independent from Discord", () => {
  const generic = { ensureParticipant(){}, ensureSession(){}, joinTarget(){}, endSession(){} };
  assert.equal(voiceProvider({ discord: generic }, "discord"), generic);
  assert.throws(() => voiceProvider({}, "discord"), /VOICE_PROVIDER_UNSUPPORTED/);
});

test("Team Room UI exposes real participant voice states and only direct provider actions", () => {
  for (const text of ["TEAM ROOM", "JOIN TEAM VOICE", "ENABLE TEAM VOICE", "LINK DISCORD"]) assert.match(html, new RegExp(text));
  for (const state of ["NOT_LINKED", "CONSENT_REQUIRED", "READY", "CONNECTED"]) assert.match(ui, new RegExp(state));
  assert.match(ui, /get_play_together_team_room/);
  assert.match(ui, /play-together-voice-authorize-start/);
  assert.doesNotMatch(`${html}\n${ui}`, /stream|gift|coin|payment|recording/i);
});

test("OAuth requests only identify + guilds.join and never takes a manual Discord username", async () => {
  const full = { ...env, supabaseUrl: "https://gamid-testing.supabase.co", anonKey: "ANON", serviceKey: "SERVICE", discordClientId: snow(7), discordClientSecret: "SECRET", reconcileSecret: "RECONCILE" };
  const fetchImpl = async url => String(url).includes("start_play_together_voice_oauth") ? response([{ state: "a".repeat(64), expires_at: "2099-01-01T00:00:00Z" }]) : response({});
  const request = new Request("https://gamid-testing.supabase.co/functions/v1/play-together-voice-authorize-start", { method: "POST", headers: { origin: "https://gamid-testing-static.gamid.workers.dev", authorization: "Bearer USER.JWT" }, body: JSON.stringify({ session_id: "11111111-1111-4111-8111-111111111111" }) });
  const result = await handleVoiceAuthorizeStart({ request, env: full, fetchImpl });
  assert.equal(result.status, 200);
  const url = new URL((await result.json()).authorization_url);
  assert.equal(url.searchParams.get("scope"), "identify guilds.join");
  assert.equal(url.searchParams.has("username"), false);
});

test("reconciliation is server-secret protected and does not rely on a player's browser", async () => {
  const full = { ...env, supabaseUrl: "https://gamid-testing.supabase.co", anonKey: "ANON", serviceKey: "SERVICE", discordClientId: snow(7), discordClientSecret: "SECRET", reconcileSecret: "RECONCILE" };
  const denied = await handleVoiceReconcile({ request: new Request("https://x.test", { method: "POST" }), env: full, fetchImpl: async()=>response([]) });
  assert.equal(denied.status, 401);
  assert.match(config, /\[functions\.play-together-voice-reconcile\]\s*verify_jwt = false/);
  assert.match(migration, /claim_play_together_voice_cleanup/);
  assert.match(migration, /'COMPLETED','CANCELLED','EXPIRED'/);
});

test("all privileged credentials are environment-only and never enter browser code", () => {
  const names = [];
  readVoiceEnv(name => { names.push(name); return "x"; });
  for (const name of ["DISCORD_BOT_TOKEN","DISCORD_GUILD_ID","DISCORD_TEAM_VOICE_CATEGORY_ID","DISCORD_BOT_USER_ID","PLAY_TOGETHER_VOICE_RECONCILE_SECRET"]) assert.ok(names.includes(name));
  assert.doesNotMatch(ui, /DISCORD_BOT_TOKEN|SUPABASE_SERVICE_ROLE_KEY|PLAY_TOGETHER_VOICE_RECONCILE_SECRET/);
  assert.equal(discordVoiceConfigured(env), true);
});
