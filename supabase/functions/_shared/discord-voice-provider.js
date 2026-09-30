const API = "https://discord.com/api/v10";
const VIEW_CHANNEL = 1n << 10n;
const MANAGE_CHANNELS = 1n << 4n;
const CONNECT = 1n << 20n;
const SPEAK = 1n << 21n;
const snowflake = value => typeof value === "string" && /^[0-9]{5,25}$/.test(value);
const permission = value => String(value);

async function discord(fetchImpl, env, path, init = {}) {
  const response = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bot ${env.discordBotToken}`, "Content-Type": "application/json", "User-Agent": "GamID-PlayTogether-Voice/1.0", ...(init.headers || {}) },
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  return { ok: response.ok, status: response.status, body, retryAfter: Number(response.headers.get("retry-after") || body?.retry_after || 0) };
}
export function readDiscordVoiceEnv(read) {
  return {
    discordBotToken: read("DISCORD_BOT_TOKEN"), discordGuildId: read("DISCORD_GUILD_ID"),
    discordCategoryId: read("DISCORD_TEAM_VOICE_CATEGORY_ID"), discordBotUserId: read("DISCORD_BOT_USER_ID"),
  };
}

export function discordVoiceConfigured(env) {
  return Boolean(env?.discordBotToken && snowflake(env.discordGuildId) && snowflake(env.discordBotUserId) && (!env.discordCategoryId || snowflake(env.discordCategoryId)));
}

export function channelOverwrites(guildId, botUserId, members) {
  const deny = VIEW_CHANNEL | CONNECT;
  const memberAllow = VIEW_CHANNEL | CONNECT | SPEAK;
  const botAllow = memberAllow | MANAGE_CHANNELS;
  return [
    { id: guildId, type: 0, allow: "0", deny: permission(deny) },
    ...members.map(member => ({ id: member.provider_account_id, type: 1, allow: permission(memberAllow), deny: "0" })),
    { id: botUserId, type: 1, allow: permission(botAllow), deny: "0" },
  ];
}

export function createDiscordVoiceProvider({ env, fetchImpl = fetch }) {
  if (!discordVoiceConfigured(env)) throw new Error("DISCORD_VOICE_NOT_CONFIGURED");
  return {
    async ensureParticipant({ providerAccountId, accessToken }) {
      if (!snowflake(providerAccountId) || typeof accessToken !== "string") return { ok: false, code: "DISCORD_IDENTITY_INVALID" };
      const result = await discord(fetchImpl, env, `/guilds/${env.discordGuildId}/members/${providerAccountId}`, { method: "PUT", body: JSON.stringify({ access_token: accessToken }) });
      if (result.ok && [201, 204].includes(result.status)) return { ok: true };
      return { ok: false, code: result.status === 429 ? "DISCORD_RATE_LIMIT" : result.status === 401 || result.status === 403 ? "DISCORD_GUILD_JOIN_FORBIDDEN" : "DISCORD_GUILD_JOIN_FAILED", retryAfter: result.retryAfter };
    },
    async ensureSession({ channelKey, members }) {
      if (!/^team-[0-9a-f]{12}$/.test(channelKey) || !Array.isArray(members) || !members.length || members.some(m => !snowflake(m.provider_account_id))) return { ok: false, code: "DISCORD_CHANNEL_INPUT_INVALID" };
      const listed = await discord(fetchImpl, env, `/guilds/${env.discordGuildId}/channels`);
      if (!listed.ok) return { ok: false, code: listed.status === 429 ? "DISCORD_RATE_LIMIT" : "DISCORD_CHANNEL_LIST_FAILED", retryAfter: listed.retryAfter };
      const existing = Array.isArray(listed.body) ? listed.body.find(channel => channel?.type === 2 && channel?.name === channelKey && (!env.discordCategoryId || channel.parent_id === env.discordCategoryId)) : null;
      if (existing && snowflake(existing.id)) return { ok: true, guildId: env.discordGuildId, channelId: existing.id, recovered: true };
      const created = await discord(fetchImpl, env, `/guilds/${env.discordGuildId}/channels`, {
        method: "POST",
        body: JSON.stringify({ name: channelKey, type: 2, user_limit: Math.min(members.length, 99), ...(env.discordCategoryId ? { parent_id: env.discordCategoryId } : {}), permission_overwrites: channelOverwrites(env.discordGuildId, env.discordBotUserId, members), reason: "GamID Play Together temporary Team Voice" }),
      });
      if (!created.ok || !snowflake(created.body?.id)) return { ok: false, code: created.status === 429 ? "DISCORD_RATE_LIMIT" : created.status === 403 ? "DISCORD_CHANNEL_FORBIDDEN" : "DISCORD_CHANNEL_CREATE_FAILED", retryAfter: created.retryAfter };
      return { ok: true, guildId: env.discordGuildId, channelId: created.body.id, recovered: false };
    },
    joinTarget({ guildId, channelId }) {
      if (!snowflake(guildId) || !snowflake(channelId)) throw new Error("DISCORD_JOIN_TARGET_INVALID");
      return `https://discord.com/channels/${guildId}/${channelId}`;
    },
    async endSession({ channelId }) {
      if (!snowflake(channelId)) return { ok: false, code: "DISCORD_CHANNEL_INVALID" };
      const removed = await discord(fetchImpl, env, `/channels/${channelId}`, { method: "DELETE", body: JSON.stringify({ reason: "GamID Play Together session ended" }) });
      if (removed.ok || removed.status === 404) return { ok: true };
      return { ok: false, code: removed.status === 429 ? "DISCORD_RATE_LIMIT" : "DISCORD_CHANNEL_DELETE_FAILED", retryAfter: removed.retryAfter };
    },
  };
}
