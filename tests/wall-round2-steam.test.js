// Round 2 - Steam / connection identity: the public persona from Steam's official player summary (supabase/functions/_shared/steam-profile.js), stored through a
// service-role RPC (migration 20260927130000_steam_public_persona.sql), and shown on the Wall / public page instead of the SteamID64.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STEAM_PROFILE, cleanPersona, safeAvatar, safeProfileUrl, buildSummaryUrl, parsePlayerSummary, fetchPlayerSummary, refreshSteamProfile, profileRefresherFromEnv } from "../supabase/functions/_shared/steam-profile.js";
import { publicConnections, steamProfileUrl, steamAvatarQuery, loadGamidSnapshot } from "../dist/wall-editor/gamid-data.js";
import { paintGamidBlock } from "../dist/wall-kit/gamid-blocks.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ID = "76561197960287930";
const KEY = "0123456789abcdef0123456789ABCDEF";
const AVATAR = "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";
const summary = (players, status = 200) => ({ status, headers: { get: () => null }, text: async () => JSON.stringify({ response: { players } }) });

// ---------- P / Q: the official source, server-side ----------
test("P the summary comes from the OFFICIAL GetPlayerSummaries v2 endpoint with the server-side key and only the authenticated SteamID64", () => {
  const url = new URL(buildSummaryUrl({ steamId: ID, apiKey: KEY }));
  assert.equal(`${url.origin}${url.pathname}`, "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
  assert.deepEqual([...url.searchParams.keys()].sort(), ["format", "key", "steamids"]);
  assert.equal(url.searchParams.get("steamids"), ID);
  assert.throws(() => buildSummaryUrl({ steamId: "123", apiKey: KEY }));
  assert.throws(() => buildSummaryUrl({ steamId: ID, apiKey: "not-a-key" }));
  const module = read("supabase/functions/_shared/steam-profile.js");
  assert.doesNotMatch(module, /STEAM_WEB_API_KEY/, "the key's environment name stays in steam-games.js only");
  assert.doesNotMatch(module, /console\.(log|error|warn)/, "the module never logs (and so never logs the key)");
  for (const path of ["dist/wall-editor/gamid-data.js", "dist/public/public.js", "dist/account/account.js", "dist/wall-kit/gamid-blocks.js", "dist/account/supabase-client.js"]) assert.doesNotMatch(read(path), /api\.steampowered|GetPlayerSummaries|steamApiKey/i, `${path}: nothing client-side`);
});

test("Q parsing: only the entry for THIS SteamID64 is used; persona cleaned; avatar and profile address strictly validated; nothing invented", () => {
  assert.deepEqual(parsePlayerSummary(JSON.stringify({ response: { players: [{ steamid: "76561197960287931", personaname: "Someone else" }, { steamid: ID, personaname: "  Espada‮ \u0007 Steam ", avatarfull: AVATAR, profileurl: `https://steamcommunity.com/profiles/${ID}/` }] } }), ID),
    { persona: "Espada Steam", avatarUrl: AVATAR, profileUrl: `https://steamcommunity.com/profiles/${ID}/` });
  assert.equal(parsePlayerSummary(JSON.stringify({ response: { players: [{ steamid: "76561197960287931", personaname: "Other" }] } }), ID), null, "another account's summary is never used");
  assert.equal(parsePlayerSummary(JSON.stringify({ response: { players: [{ steamid: ID, personaname: "   " }] } }), ID), null, "no persona -> nothing stored (neutral fallback)");
  assert.equal(parsePlayerSummary("<html>", ID), null);
  assert.equal(parsePlayerSummary(JSON.stringify({ response: {} }), ID), null);
  assert.equal(cleanPersona("x".repeat(100)).length, 64);
  assert.equal(safeAvatar("https://evil.example/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg"), null);
  assert.equal(safeAvatar("http://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg"), null);
  assert.equal(safeAvatar(AVATAR), AVATAR);
  assert.equal(safeProfileUrl("https://steamcommunity.com/id/gabelogannewell/", ID), "https://steamcommunity.com/id/gabelogannewell/");
  assert.equal(safeProfileUrl(`https://steamcommunity.com/profiles/76561197960287931/`, ID), null, "another account's profile address is refused");
  assert.equal(safeProfileUrl("https://steamcommunity.com.evil.example/id/x/", ID), null);
  assert.equal(safeProfileUrl("javascript:alert(1)", ID), null);
});

test("Q fetch + store: one GET, redirects not followed; failures store nothing and never throw", async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, init }); return summary([{ steamid: ID, personaname: "Espada", avatarfull: AVATAR, profileurl: "https://steamcommunity.com/id/espada/" }]); };
  const saved = [];
  const save = async args => { saved.push(args); return { ok: true, body: "SAVED" }; };
  assert.equal(await refreshSteamProfile({ steamId: ID, apiKey: KEY, fetchImpl: ok, save }), "SAVED");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, "manual");
  assert.deepEqual(saved, [{ candidate_steam_id: ID, candidate_persona: "Espada", candidate_avatar_url: AVATAR, candidate_profile_url: "https://steamcommunity.com/id/espada/" }]);
  assert.equal(await refreshSteamProfile({ steamId: ID, apiKey: KEY, fetchImpl: async () => summary([], 403), save }), "NO_SUMMARY");
  assert.equal(await refreshSteamProfile({ steamId: ID, apiKey: KEY, fetchImpl: async () => { throw new Error("network"); }, save }), "NO_SUMMARY");
  assert.equal(await refreshSteamProfile({ steamId: ID, apiKey: KEY, fetchImpl: ok, save: async () => { throw new Error("db"); } }), "SAVE_FAILED");
  assert.equal(await refreshSteamProfile({ steamId: ID, apiKey: KEY, fetchImpl: ok, save: async () => ({ ok: false, body: { message: "x" } }) }), "SAVE_FAILED");
  assert.equal(saved.length, 1, "nothing else was stored");
  assert.equal(await fetchPlayerSummary({ steamId: ID, apiKey: "bad", fetchImpl: ok }), null, "no well-formed key: no request at all");
  assert.equal(calls.length, 3, "the two SAVE_FAILED cases fetched once each; the bad key sent nothing");
});

test("R refresh path: the connect callback (only after CONNECTED / RECONNECTED, with the SteamID Steam just authenticated) and the owner's games refresh", () => {
  const openid = read("supabase/functions/_shared/steam-openid.js");
  assert.match(openid, /if \(\(outcome === "CONNECTED" \|\| outcome === "RECONNECTED"\) && typeof onLinked === "function"\)/);
  assert.match(openid, /onLinked\(\{ steamId: verified\.steamId, fetchImpl, save: args => serviceRpc\(fetchImpl, env, "save_steam_profile", args\) \}\)/);
  assert.match(read("supabase/functions/steam-connect-callback/index.ts"), /onLinked: profileRefresherFromEnv\(\(name: string\) => Deno\.env\.get\(name\)\)/);
  assert.equal(profileRefresherFromEnv(() => undefined), null, "no key configured: no hook, the link works exactly as before");
  assert.equal(typeof profileRefresherFromEnv(name => (name === "STEAM_WEB_API_KEY" ? KEY : undefined)), "function");
  const games = read("supabase/functions/_shared/steam-games.js");
  assert.match(games, /refreshSteamProfile\(\{ steamId: start\.steam_id, apiKey: env\.steamApiKey, fetchImpl, save: args => serviceRpc\(fetchImpl, env, "save_steam_profile", args\) \}\)/, "the SteamID of the owner's own reserved connection");
  assert.equal(STEAM_PROFILE.endpoint.startsWith("https://api.steampowered.com/"), true);
});

test("R the migration: two nullable columns, a service-role-only save with strict checks, the public section adds the persona fields; League block untouched", () => {
  const sql = read("supabase/migrations/20260927130000_steam_public_persona.sql");
  assert.match(sql, /add column if not exists provider_profile_url text/);
  assert.match(sql, /add column if not exists provider_profile_refreshed_at timestamptz/);
  assert.match(sql, /revoke all on function private\.save_steam_profile_impl\(text, text, text, text\), public\.save_steam_profile\(text, text, text, text\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function private\.save_steam_profile_impl\(text, text, text, text\), public\.save_steam_profile\(text, text, text, text\) to service_role;/);
  assert.match(sql, /if current_user <> 'service_role' then raise exception using errcode = '42501', message = 'BACKEND_ONLY'/);
  assert.match(sql, /'persona_name', g\.provider_display_name, 'avatar_url', g\.provider_avatar_url, 'profile_url', g\.provider_profile_url/);
  assert.doesNotMatch(sql, /\bdrop\b|\btruncate\b|delete from|insert into/i, "additive: nothing dropped, no data written by the migration");
  assert.match(read("tests/integration/steam-persona-db.sql"), /TEST_RESULTS/);
});

// ---------- S / T: what visitors see ----------
test("S the Wall never shows the SteamID64: persona (or a neutral 'Steam account'), avatar through GamID's proxy, Steam's own profile address only", () => {
  const full = publicConnections({ steam: { steam_id: ID, trust_status: "CONNECTED", persona_name: "Espada", avatar_url: AVATAR, profile_url: "https://steamcommunity.com/id/espada/" } })[0];
  assert.deepEqual([full.name, full.sub, full.trust, full.avatarQuery, full.actions], ["Espada", "", "CONNECTED", "steam_avatar=fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb", [{ kind: "open", label: "Open Steam profile", url: "https://steamcommunity.com/id/espada/" }]]);
  const bare = publicConnections({ steam: { steam_id: ID, trust_status: "CONNECTED" } })[0];
  assert.deepEqual([bare.name, bare.sub, bare.actions, "avatarQuery" in bare], ["Steam account", "", [], false], "no summary yet: neutral label, no invented profile address");
  assert.equal(JSON.stringify(publicConnections({ steam: { steam_id: ID, trust_status: "CONNECTED", persona_name: "Espada" } })).includes(ID), false, "the id appears nowhere in what the Wall draws or opens");
  const forged = publicConnections({ steam: { steam_id: ID, trust_status: "CONNECTED", persona_name: "Espada", profile_url: "https://evil.example/", avatar_url: "https://evil.example/a.jpg" } })[0];
  assert.deepEqual([forged.actions, "avatarQuery" in forged], [[], false], "a stored address that is not Steam's own is never followed or loaded");
  assert.equal(steamProfileUrl(`https://steamcommunity.com/profiles/${ID}/`, ID), `https://steamcommunity.com/profiles/${ID}/`);
  assert.equal(steamAvatarQuery("https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg"), "steam_avatar=fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb");
});

test("S the editor's own (owner) snapshot also never draws the SteamID64 for Steam; other connections keep their display name", async () => {
  const api = {
    getIdentity: async () => ({ gamid_handle: "black", display_name: "Espada" }), getIdentityProfile: async () => ({}), getMyPublicGamesSettings: async () => null, getMyGameDisplaySettings: async () => ({}),
    getMyDiscoveredGames: async () => [], getMyManualGames: async () => [],
    getMyConnections: async () => [{ provider_key: "steam", connected: true, is_public: true, provider_username: ID, provider_display_name: null }, { provider_key: "discord", connected: true, is_public: true, provider_username: "espada", provider_display_name: "Espada" }],
  };
  const snapshot = await loadGamidSnapshot(api);
  assert.deepEqual(snapshot.connections, [{ label: "Steam", name: "Steam account" }, { label: "Discord", name: "Espada" }]);
});

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { props: new Map(), setProperty(n, v) { this.props.set(n, v); } }; this.className = ""; this.textContent = ""; this.listeners = {}; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  append(...nodes) { for (const node of nodes) if (node && typeof node === "object") { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  get text() { return this.textContent + this.children.map(child => child.text).join(""); }
}
const all = (root, predicate) => { const out = []; const walk = node => { if (predicate(node)) out.push(node); node.children.forEach(walk); }; walk(root); return out; };

test("S the Connections block draws the persona with its avatar (loaded only through GamID's proxy) and keeps the trust label", async () => {
  const connections = publicConnections({ steam: { steam_id: ID, trust_status: "CONNECTED", persona_name: "Espada", avatar_url: AVATAR, profile_url: "https://steamcommunity.com/id/espada/" } });
  const asked = [];
  const posters = { ready: () => null, load: async query => { asked.push(query); return "blob:avatar"; } };
  const root = paintGamidBlock({ kind: "gamid", block: "connections", layout: "card" }, { public: { available: true, connections, games: null } }, tag => new Node(tag), { interactive: true, posters });
  await new Promise(resolve => setTimeout(resolve, 0));
  const [img] = all(root, node => node.tag === "img");
  assert.equal(img.attrs.src, "blob:avatar");
  assert.equal(img.attrs.alt, "");
  assert.deepEqual(asked, ["steam_avatar=fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb"]);
  assert.match(root.text, /Steam.*Espada.*CONNECTED/);
  assert.equal(root.text.includes(ID), false);
  const noPosters = paintGamidBlock({ kind: "gamid", block: "connections", layout: "card" }, { public: { available: true, connections, games: null } }, tag => new Node(tag), { interactive: true });
  assert.equal(all(noPosters, node => node.tag === "img").length, 0, "no loader, no image - never a direct steamstatic request");
});

test("T the public profile page shows the persona (or 'Steam account'), never the SteamID64, and stays plain text", () => {
  // the REAL renderer from public.js (the page module runs its page code on import), exactly as public-stats-global-scope.test.js does
  const publicJs = read("dist/public/public.js");
  const source = publicJs.slice(publicJs.indexOf("const LEAGUE_APEX_TIERS"), publicJs.indexOf("async function buildConfig")).replace("export function renderPublicSections", "function renderPublicSections");
  const { renderPublicSections } = new Function("document", `${source}\nreturn { renderPublicSections };`)({ createElement: tag => new Node(tag) });
  {
    const panel = new Node("div");
    renderPublicSections(panel, { steam: { steam_id: ID, trust_status: "CONNECTED", persona_name: "Espada" } });
    assert.match(panel.text, /STEAM\s*Espada\s*CONNECTED/);
    assert.equal(panel.text.includes(ID), false);
    const bare = new Node("div");
    renderPublicSections(bare, { steam: { steam_id: ID, trust_status: "CONNECTED" } });
    assert.match(bare.text, /STEAM\s*Steam account/);
    assert.equal(bare.text.includes(ID), false);
  }
});

test("T Game vs Connection stay separate: the Steam CONNECTION shows identity only - no game, library or playtime claim", () => {
  const steam = publicConnections({ steam: { steam_id: ID, trust_status: "CONNECTED", persona_name: "Espada" } })[0];
  assert.deepEqual(steam.lines, []);
  assert.equal(steam.actions.some(action => action.kind === "game"), false);
  assert.doesNotMatch(read("supabase/functions/_shared/steam-profile.js").split("\n").filter(line => !line.trim().startsWith("//")).join("\n"), /GetOwnedGames|playtime|appid|library/i);
});
