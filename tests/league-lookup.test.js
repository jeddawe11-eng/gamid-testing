import test from "node:test";
import assert from "node:assert/strict";
import {
  APEX_TIERS, LEAGUE_REGIONS, PLATFORM_IDS, RANK_TIERS, normalizeRiotIdInput, validateSnapshot,
} from "../supabase/functions/_shared/league/league-domain.js";
import { buildProfileUrl, opggAdapter, parseProfilePage } from "../supabase/functions/_shared/league/opgg-adapter.js";
import { SITE_ORIGIN, handleLeagueLookup, readLeagueEnv } from "../supabase/functions/_shared/league/league-service.js";
import { SITE_ORIGIN as DISCORD_SITE_ORIGIN } from "../supabase/functions/_shared/discord-oauth.js";

// =====================================================================================================================
// Fixtures. The page fixtures mirror the schema.org JSON-LD structure actually observed on a live public OP.GG profile
// (ProfilePage + Person nodes). The "unranked" variant is SYNTHETIC: it is the same template without the rank sentence.
// =====================================================================================================================
const NAME = "Hide on bush#KR1";
const RANKED_SENTENCE = "current SOLORANKED rank is challenger Division 1 2144 LP with 395 wins, 321 losses, and a 55% win rate.";

function pageHtml({ name = NAME, region = "kr", serverLabel = "KR", rank = RANKED_SENTENCE, dateModified = "2026-09-20T00:19:21+09:00", image = "https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon6.jpg", omit = [], descriptionOverride } = {}) {
  const description = descriptionOverride ?? `${name} is a League of Legends summoner on the ${serverLabel} server. ${rank ? `${name}'s ${rank} ` : ""}The available champion statistics list Locke (4W-0L, 100% win rate).`;
  const graph = [
    { "@type": "ProfilePage", "@id": "x#profile-page", url: "x", name: `${name} - League of Legends Summoner Stats`, description, dateModified, mainEntity: { "@id": "x#summoner" } },
    { "@type": "Person", "@id": "x#summoner", name, alternateName: name.split("#")[0], identifier: [{ "@type": "PropertyValue", name: "puuid", value: "SECRET-PUUID-VALUE-should-never-be-stored" }, { "@type": "PropertyValue", name: "region", value: region }, { "@type": "PropertyValue", name: "tagline", value: name.split("#").pop() }], image },
    { "@type": "VideoGame", name: "League of Legends" },
  ].filter(node => !omit.includes(node["@type"]));
  return `<!doctype html><html><head><title>${name}</title><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script></head><body>UNRELATED-BODY-CONTENT-SHOULD-NOT-BE-RETAINED</body></html>`;
}

const QUERY = { gameName: "Hide on bush", tagLine: "KR1", platformId: "KR" };
const SOURCE_URL = "https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1";
const htmlResponse = (body, status = 200, headers = {}) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });

// =====================================================================================================================
// Domain: input validation / normalization
// =====================================================================================================================

test("valid Riot ID input is accepted and safely normalized (trim, NFC, leading #, region case) without assuming a tagline format", () => {
  const ok = normalizeRiotIdInput({ gameName: "  Hide on bush  ", tagLine: "#kr1 ", platformId: " kr " });
  assert.deepEqual(ok, { ok: true, value: { gameName: "Hide on bush", tagLine: "kr1", platformId: "KR" } });
  assert.equal(normalizeRiotIdInput({ gameName: "Café", tagLine: "EUW", platformId: "EUW1" }).value.gameName, "Café", "NFC-normalized");
  for (const tagLine of ["A", "12", "ABCDE", "가나다", "abcdefghijklmnop"]) assert.equal(normalizeRiotIdInput({ gameName: "Name", tagLine, platformId: "SG2" }).ok, true, `tagline ${tagLine} must not be rejected by a format assumption`);
  assert.equal(normalizeRiotIdInput({ gameName: "日本語の名前", tagLine: "JP1", platformId: "JP1" }).ok, true);
});

test("malformed Riot ID input is refused with a field-specific code", () => {
  const bad = [
    [{ gameName: "", tagLine: "T", platformId: "NA1" }, "INVALID_GAME_NAME"],
    [{ gameName: "   ", tagLine: "T", platformId: "NA1" }, "INVALID_GAME_NAME"],
    [{ gameName: "a#b", tagLine: "T", platformId: "NA1" }, "INVALID_GAME_NAME"],
    [{ gameName: "a/b", tagLine: "T", platformId: "NA1" }, "INVALID_GAME_NAME"],
    [{ gameName: "a\\b", tagLine: "T", platformId: "NA1" }, "INVALID_GAME_NAME"],
    [{ gameName: "a\u0000b", tagLine: "T", platformId: "NA1" }, "INVALID_GAME_NAME"],
    [{ gameName: "a\u202eb", tagLine: "T", platformId: "NA1" }, "INVALID_GAME_NAME"],
    [{ gameName: "x".repeat(33), tagLine: "T", platformId: "NA1" }, "INVALID_GAME_NAME"],
    [{ gameName: 12345, tagLine: "T", platformId: "NA1" }, "INVALID_GAME_NAME"],
    [{ gameName: null, tagLine: "T", platformId: "NA1" }, "INVALID_GAME_NAME"],
    [{ gameName: "Name", tagLine: "", platformId: "NA1" }, "INVALID_TAG_LINE"],
    [{ gameName: "Name", tagLine: "a b", platformId: "NA1" }, "INVALID_TAG_LINE"],
    [{ gameName: "Name", tagLine: "a-b", platformId: "NA1" }, "INVALID_TAG_LINE"],
    [{ gameName: "Name", tagLine: "a#b", platformId: "NA1" }, "INVALID_TAG_LINE"],
    [{ gameName: "Name", tagLine: "x".repeat(17), platformId: "NA1" }, "INVALID_TAG_LINE"],
    [{ gameName: "Name", tagLine: { a: 1 }, platformId: "NA1" }, "INVALID_TAG_LINE"],
    [{ gameName: "Name", tagLine: "T", platformId: "" }, "INVALID_REGION"],
    [{ gameName: "Name", tagLine: "T", platformId: "MARS1" }, "INVALID_REGION"],
    [{ gameName: "Name", tagLine: "T", platformId: "../etc" }, "INVALID_REGION"],
    [{ gameName: "Name", tagLine: "T" }, "INVALID_REGION"],
    [null, "INVALID_GAME_NAME"],
    [undefined, "INVALID_GAME_NAME"],
  ];
  for (const [input, code] of bad) assert.deepEqual(normalizeRiotIdInput(input), { ok: false, code }, JSON.stringify(input));
});

test("region and rank catalogs are consistent and Riot-native (no data source is named in the domain)", () => {
  assert.equal(new Set(PLATFORM_IDS).size, PLATFORM_IDS.length);
  assert.ok(PLATFORM_IDS.includes("SG2"));
  assert.deepEqual(LEAGUE_REGIONS.find(region => region.platformId === "SG2").label, "Singapore (SG2)");
  assert.ok(APEX_TIERS.every(tier => RANK_TIERS.includes(tier)));
});

test("snapshot validation accepts only well-formed, source-neutral snapshots", () => {
  const good = { gameName: "A", tagLine: "T", platformId: "SG2", soloRank: { state: "RANKED", tier: "PLATINUM", division: "II", lp: 64, wins: 10, losses: 9 }, profileIconId: 6, sourceUrl: "https://example.test/p", sourceUpdatedAt: "2026-09-20T00:00:00.000Z" };
  assert.equal(validateSnapshot(good), true);
  assert.equal(validateSnapshot({ ...good, soloRank: { state: "NOT_REPORTED", tier: null, division: null, lp: null, wins: null, losses: null } }), true);
  const invalid = [
    null, {}, { ...good, gameName: "" }, { ...good, platformId: "MARS" }, { ...good, sourceUrl: "http://insecure.test" }, { ...good, sourceUrl: "javascript:alert(1)" },
    { ...good, profileIconId: -1 }, { ...good, sourceUpdatedAt: "not a date" },
    { ...good, soloRank: { ...good.soloRank, tier: "WOOD" } }, { ...good, soloRank: { ...good.soloRank, lp: -5 } }, { ...good, soloRank: { ...good.soloRank, lp: 1.5 } },
    { ...good, soloRank: { ...good.soloRank, division: null } }, { ...good, soloRank: { ...good.soloRank, state: "BOGUS" } },
    { ...good, soloRank: { state: "NOT_REPORTED", tier: "GOLD", division: null, lp: null, wins: null, losses: null } },
    { ...good, soloRank: { ...good.soloRank, wins: -1 } },
  ];
  for (const snapshot of invalid) assert.equal(validateSnapshot(snapshot), false, JSON.stringify(snapshot));
});

// =====================================================================================================================
// OP.GG adapter — URL, parsing, normalization
// =====================================================================================================================

test("adapter builds one fixed-host profile URL per Riot platform, encoding the Riot ID safely", () => {
  assert.equal(buildProfileUrl(QUERY), SOURCE_URL);
  assert.equal(buildProfileUrl({ gameName: "Name", tagLine: "T", platformId: "SG2" }), "https://op.gg/lol/summoners/sg/Name-T");
  assert.equal(buildProfileUrl({ gameName: "a b?c&d=e", tagLine: "T", platformId: "NA1" }), "https://op.gg/lol/summoners/na/a%20b%3Fc%26d%3De-T");
  assert.equal(buildProfileUrl({ gameName: "../x", tagLine: "T", platformId: "NA1" }).startsWith("https://op.gg/lol/summoners/na/"), true);
  assert.equal(buildProfileUrl({ gameName: "x", tagLine: "T", platformId: "MARS" }), null);
  for (const id of PLATFORM_IDS) assert.match(buildProfileUrl({ gameName: "x", tagLine: "T", platformId: id }), /^https:\/\/op\.gg\/lol\/summoners\/[a-z]+\/x-T$/);
});

test("parsing a ranked apex profile yields the normalized source-neutral snapshot (Solo/Duo only)", () => {
  const result = parseProfilePage(pageHtml(), { platformId: "KR", sourceUrl: SOURCE_URL });
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot, {
    gameName: "Hide on bush", tagLine: "KR1", platformId: "KR",
    soloRank: { state: "RANKED", tier: "CHALLENGER", division: "I", lp: 2144, wins: 395, losses: 321 },
    profileIconId: 6, sourceUrl: SOURCE_URL, sourceUpdatedAt: "2026-09-19T15:19:21.000Z",
  });
  assert.equal(validateSnapshot(result.snapshot), true);
});

test("parsing covers every ranked tier, division mapping, thousands separators, and singular win/loss", () => {
  const cases = [
    ["iron Division 4 0 LP with 3 wins, 4 losses, and a 43% win rate.", "IRON", "IV", 0, 3, 4],
    ["platinum Division 2 64 LP with 20 wins, 18 losses, and a 53% win rate.", "PLATINUM", "II", 64, 20, 18],
    ["emerald Division 1 99 LP with 1 win, 1 loss, and a 50% win rate.", "EMERALD", "I", 99, 1, 1],
    ["master Division 1 1,234 LP with 200 wins, 190 losses, and a 51% win rate.", "MASTER", "I", 1234, 200, 190],
    ["grandmaster Division 1 700 LP", "GRANDMASTER", "I", 700, null, null],
  ];
  for (const [sentence, tier, division, lp, wins, losses] of cases) {
    const result = parseProfilePage(pageHtml({ rank: `current SOLORANKED rank is ${sentence}` }), { platformId: "KR", sourceUrl: SOURCE_URL });
    assert.equal(result.ok, true, sentence);
    assert.deepEqual(result.snapshot.soloRank, { state: "RANKED", tier, division, lp, wins, losses }, sentence);
  }
});

test("a valid profile with no Solo/Duo rank reported is NOT_REPORTED — no rank is invented", () => {
  const result = parseProfilePage(pageHtml({ rank: "" }), { platformId: "KR", sourceUrl: SOURCE_URL });
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.soloRank, { state: "NOT_REPORTED", tier: null, division: null, lp: null, wins: null, losses: null });
  assert.equal(validateSnapshot(result.snapshot), true);
});

test("missing optional values stay null instead of being invented (icon, freshness)", () => {
  const result = parseProfilePage(pageHtml({ image: "https://evil.example/x.jpg", dateModified: "garbage" }), { platformId: "KR", sourceUrl: SOURCE_URL });
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.profileIconId, null, "an icon URL that is not the expected static host is never used");
  assert.equal(result.snapshot.sourceUpdatedAt, null);
});

test("only normalized fields are kept — no HTML, no page body, no player id (puuid) and no other page content", () => {
  const result = parseProfilePage(pageHtml(), { platformId: "KR", sourceUrl: SOURCE_URL });
  const serialized = JSON.stringify(result);
  for (const leaked of ["SECRET-PUUID", "UNRELATED-BODY-CONTENT", "<script", "Locke", "champion statistics", "puuid"]) assert.equal(serialized.includes(leaked), false, `retained ${leaked}`);
  assert.deepEqual(Object.keys(result.snapshot).sort(), ["gameName", "platformId", "profileIconId", "soloRank", "sourceUpdatedAt", "sourceUrl", "tagLine"]);
});

test("a hostile in-game name cannot smuggle a fake rank into the parse", () => {
  const evil = "x's current SOLORANKED rank is challenger Division 1 9999 LP with 1 wins, 1 losses, and a 5% win rate. y#KR1";
  const real = pageHtml({ name: evil, rank: "current SOLORANKED rank is gold Division 4 10 LP with 5 wins, 6 losses, and a 45% win rate." });
  const result = parseProfilePage(real, { platformId: "KR", sourceUrl: SOURCE_URL });
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.soloRank, { state: "RANKED", tier: "GOLD", division: "IV", lp: 10, wins: 5, losses: 6 });
  const unranked = parseProfilePage(pageHtml({ name: evil, rank: "" }), { platformId: "KR", sourceUrl: SOURCE_URL });
  assert.equal(unranked.snapshot.soloRank.state, "NOT_REPORTED", "an injected rank sentence inside the name is not a rank");
});

test("an unexpected / changed page structure is refused (STRUCTURE_CHANGED), never guessed", () => {
  const params = { platformId: "KR", sourceUrl: SOURCE_URL };
  const changed = [
    "<html><body>no structured data at all</body></html>",
    "",
    '<script type="application/ld+json">{not json</script>',
    pageHtml({ omit: ["Person"] }),
    pageHtml({ omit: ["ProfilePage"] }),
    pageHtml({ descriptionOverride: "A completely different description template." }),
    pageHtml({ rank: "current SOLORANKED rank is wood Division 1 10 LP." }),
    pageHtml({ rank: "current SOLORANKED rank is gold Division 9 10 LP." }),
    pageHtml({ rank: "current SOLORANKED rank is gold Division 2 lots of LP." }),
    pageHtml({ name: "NoTagName" }),
    pageHtml({ region: "euw" }),
    pageHtml().replace('"Person"', '"Thing"'),
  ];
  for (const html of changed) assert.deepEqual(parseProfilePage(html, params), { ok: false, code: "STRUCTURE_CHANGED" }, html.slice(0, 80));
});

// =====================================================================================================================
// OP.GG adapter — the outbound request
// =====================================================================================================================

test("lookup makes exactly one plain GET with an honest User-Agent and no credentials or bypass headers", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return htmlResponse(pageHtml()); };
  const result = await opggAdapter.lookup(QUERY, { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1, "one request, no retries, no polling");
  assert.equal(calls[0].url, SOURCE_URL);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.redirect, "manual");
  assert.ok(calls[0].init.signal, "a timeout signal is always attached");
  assert.deepEqual(Object.keys(calls[0].init.headers).sort(), ["Accept", "Accept-Language", "User-Agent"], "no cookies, tokens, referer, proxies or spoofed browser headers");
  assert.match(calls[0].init.headers["User-Agent"], /^GamID-Testing-Prototype /);
  assert.equal(opggAdapter.sourceKey, "OPGG_TEMPORARY");
});

test("player not found (HTTP 404) is NOT_FOUND", async () => {
  const result = await opggAdapter.lookup(QUERY, { fetchImpl: async () => htmlResponse("<html>not found</html>", 404) });
  assert.deepEqual(result, { ok: false, code: "NOT_FOUND" });
});

test("OP.GG unavailable or refusing (403/429/503/500/timeout/network) is UNAVAILABLE after exactly one request — no retry, no bypass", async () => {
  for (const status of [403, 429, 500, 502, 503, 504, 401, 451]) {
    let calls = 0;
    const result = await opggAdapter.lookup(QUERY, { fetchImpl: async () => { calls += 1; return htmlResponse("blocked", status); } });
    assert.deepEqual(result, { ok: false, code: "UNAVAILABLE" }, String(status));
    assert.equal(calls, 1, `status ${status} must not be retried`);
  }
  for (const failure of [new DOMException("timed out", "TimeoutError"), new TypeError("network down"), new Error("boom")]) {
    let calls = 0;
    const result = await opggAdapter.lookup(QUERY, { fetchImpl: async () => { calls += 1; throw failure; } });
    assert.deepEqual(result, { ok: false, code: "UNAVAILABLE" });
    assert.equal(calls, 1);
  }
});

test("a 200 challenge/interstitial page (no structured profile) is STRUCTURE_CHANGED, not parsed and not worked around", async () => {
  let calls = 0;
  const result = await opggAdapter.lookup(QUERY, { fetchImpl: async () => { calls += 1; return htmlResponse("<html><title>Just a moment...</title><body>checking your browser</body></html>"); } });
  assert.deepEqual(result, { ok: false, code: "STRUCTURE_CHANGED" });
  assert.equal(calls, 1);
});

test("redirects: one same-host profile redirect is followed; anything else is refused", async () => {
  const seen = [];
  const same = await opggAdapter.lookup(QUERY, { fetchImpl: async url => {
    seen.push(String(url));
    return seen.length === 1 ? new Response(null, { status: 308, headers: { location: "/lol/summoners/kr/Hide%20On%20Bush-KR1" } }) : htmlResponse(pageHtml());
  } });
  assert.equal(same.ok, true);
  assert.equal(seen.length, 2);
  assert.equal(seen[1], "https://op.gg/lol/summoners/kr/Hide%20On%20Bush-KR1");

  for (const location of ["https://evil.example/lol/summoners/kr/x", "http://op.gg/lol/summoners/kr/x", "https://op.gg.evil.example/lol/summoners/kr/x", "https://op.gg/other/path", "//evil.example/x", ""]) {
    let calls = 0;
    const result = await opggAdapter.lookup(QUERY, { fetchImpl: async () => { calls += 1; return new Response(null, { status: 302, headers: { location } }); } });
    assert.deepEqual(result, { ok: false, code: "UNAVAILABLE" }, location);
    assert.equal(calls, 1, `must not follow ${location}`);
  }
  let loops = 0;
  // every hop points somewhere NEW and valid, so only the one-hop limit (not loop detection) can stop this chain
  const loop = await opggAdapter.lookup(QUERY, { fetchImpl: async () => { loops += 1; return new Response(null, { status: 308, headers: { location: `/lol/summoners/kr/hop-${loops}` } }); } });
  assert.deepEqual(loop, { ok: false, code: "UNAVAILABLE" });
  assert.equal(loops, 2, "at most one redirect hop");
});

test("non-HTML and oversized responses are refused without being parsed", async () => {
  assert.deepEqual(await opggAdapter.lookup(QUERY, { fetchImpl: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }) }), { ok: false, code: "STRUCTURE_CHANGED" });
  assert.deepEqual(await opggAdapter.lookup(QUERY, { fetchImpl: async () => htmlResponse("x", 200, { "content-length": String(50 * 1024 * 1024) }) }), { ok: false, code: "STRUCTURE_CHANGED" });
  const huge = new Response(new ReadableStream({ start(controller) { for (let i = 0; i < 5; i += 1) controller.enqueue(new Uint8Array(1024 * 1024)); controller.close(); } }), { status: 200, headers: { "content-type": "text/html" } });
  assert.deepEqual(await opggAdapter.lookup(QUERY, { fetchImpl: async () => huge }), { ok: false, code: "STRUCTURE_CHANGED" });
});

// =====================================================================================================================
// Service — fake backend implementing the SQL contract of 20260920100000_league_profile_prototype.sql
// =====================================================================================================================

const SUPABASE = "https://example-project.supabase.co";
const SERVICE_KEY = "test-service-role-key-value";
const ANON_KEY = "test-anon-key-value";
const ENV = { supabaseUrl: SUPABASE, anonKey: ANON_KEY, serviceKey: SERVICE_KEY };
const ENDPOINT = `${SUPABASE}/functions/v1/league-lookup`;

function makeWorld(options = {}) {
  const world = {
    now: 1_800_000_000_000,
    calls: [],
    profiles: new Map(), // entity -> row
    attempts: [],
    adapterCalls: [],
    adapterResult: options.adapterResult || { ok: true, snapshot: snapshot() },
    reserveError: options.reserveError,
  };
  const users = { "user-a-jwt": { user: "user-a", entity: "entity-a" }, "user-b-jwt": { user: "user-b", entity: "entity-b" }, "user-c-jwt": { user: "user-c", entity: null } };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const secondsLeft = (from, ms) => Math.ceil((from + ms - world.now) / 1000);

  world.advance = seconds => { world.now += seconds * 1000; };
  world.adapter = {
    sourceKey: "OPGG_TEMPORARY",
    lookup: async (query, ctx) => { world.adapterCalls.push({ query, hasFetch: typeof ctx.fetchImpl === "function" }); if (options.adapterThrows) throw new Error("adapter exploded: secret-ish"); return world.adapterResult; },
  };

  world.fetch = async (url, init = {}) => {
    const target = new URL(url);
    const name = target.pathname.replace("/rest/v1/rpc/", "");
    const bearer = String(init.headers?.Authorization || "").replace(/^Bearer /, "");
    const args = JSON.parse(init.body || "{}");
    world.calls.push({ name, bearer, args });

    if (name === "reserve_league_lookup") {
      if (world.reserveError) return json({ message: world.reserveError }, 400);
      const who = users[bearer];
      if (!who) return json({ code: "PGRST301", message: "JWT invalid" }, 401);
      if (!who.entity) return json({ message: "IDENTITY_NOT_FOUND" }, 400);
      const row = status => json([{ reservation_id: null, status, retry_after_seconds: null, game_name: null, tag_line: null, platform_id: null }]);
      const profile = world.profiles.get(who.entity);
      let requested;
      if (args.candidate_action === "add") {
        if (profile) return row("ALREADY_EXISTS");
        requested = { game_name: args.candidate_game_name, tag_line: args.candidate_tag_line, platform_id: args.candidate_platform_id };
      } else {
        if (!profile) return row("NO_PROFILE");
        const wait = secondsLeft(profile.last_attempt_at, 600_000);
        if (wait > 0) return json([{ reservation_id: null, status: "COOLDOWN", retry_after_seconds: wait }]);
        requested = { game_name: profile.game_name, tag_line: profile.tag_line, platform_id: profile.platform_id };
      }
      const mine = world.attempts.filter(a => a.entity === who.entity);
      const last = Math.max(0, ...mine.map(a => a.created_at));
      if (mine.length && secondsLeft(last, 60_000) > 0) return json([{ reservation_id: null, status: "COOLDOWN", retry_after_seconds: secondsLeft(last, 60_000) }]);
      const recent = mine.filter(a => a.created_at > world.now - 3_600_000);
      if (recent.length >= 6) return json([{ reservation_id: null, status: "RATE_LIMITED", retry_after_seconds: 1800 }]);
      const attempt = { id: `res-${world.attempts.length + 1}`, entity: who.entity, action: args.candidate_action, requested, created_at: world.now, completed: false };
      world.attempts.push(attempt);
      return json([{ reservation_id: attempt.id, status: "OK", retry_after_seconds: null, ...requested }]);
    }

    if (bearer !== SERVICE_KEY) return json({ message: "permission denied" }, 403);
    const attempt = world.attempts.find(a => a.id === args.candidate_reservation_id);
    if (name === "finish_league_lookup") {
      if (attempt && !attempt.completed) {
        attempt.completed = true;
        if (attempt.action === "refresh") { const p = world.profiles.get(attempt.entity); p.last_attempt_at = world.now; p.last_result = args.candidate_outcome; }
      }
      return json(null);
    }
    if (name === "save_league_lookup") {
      if (!attempt || attempt.completed) return json("INVALID_RESERVATION");
      attempt.completed = true;
      const same = args.candidate_game_name.toLowerCase() === attempt.requested.game_name.toLowerCase() && args.candidate_tag_line.toLowerCase() === attempt.requested.tag_line.toLowerCase() && args.candidate_platform_id === attempt.requested.platform_id;
      if (!same) { if (attempt.action === "refresh") { const p = world.profiles.get(attempt.entity); p.last_attempt_at = world.now; p.last_result = "IDENTITY_MISMATCH"; } return json("IDENTITY_MISMATCH"); }
      const row = { game_name: args.candidate_game_name, tag_line: args.candidate_tag_line, platform_id: args.candidate_platform_id, data_source: args.candidate_data_source, trust_status: "MANUAL", is_public: false,
        solo: { state: args.candidate_rank_state, tier: args.candidate_tier, division: args.candidate_division, lp: args.candidate_lp, wins: args.candidate_wins, losses: args.candidate_losses },
        profile_icon_id: args.candidate_profile_icon_id, source_url: args.candidate_source_url, source_updated_at: args.candidate_source_updated_at, fetched_at: world.now, last_attempt_at: world.now, last_result: "OK" };
      world.profiles.set(attempt.entity, row);
      return json("SAVED");
    }
    throw new Error(`unexpected rpc ${name}`);
  };
  return world;
}

function snapshot(over = {}) {
  return {
    gameName: "Hide on bush", tagLine: "KR1", platformId: "KR",
    soloRank: { state: "RANKED", tier: "PLATINUM", division: "II", lp: 64, wins: 20, losses: 18 },
    profileIconId: 6, sourceUrl: SOURCE_URL, sourceUpdatedAt: "2026-09-19T15:19:21.000Z", ...over,
  };
}

const request = (body, headers = {}, method = "POST") => new Request(ENDPOINT, { method, headers: { "content-type": "application/json", origin: SITE_ORIGIN, authorization: "Bearer user-a-jwt", ...headers }, body: method === "POST" ? JSON.stringify(body) : undefined });
const run = (world, req, log) => handleLeagueLookup({ request: req, env: ENV, adapter: world.adapter, fetchImpl: world.fetch, log });
const ADD = { action: "add", game_name: "Hide on bush", tag_line: "KR1", region: "KR" };
const reads = (world, name) => world.calls.filter(c => c.name === name);

test("service: the site origin matches the Discord slice's accepted origin", () => {
  assert.equal(SITE_ORIGIN, DISCORD_SITE_ORIGIN);
});

test("lookup success: reserve as the caller, one adapter call, persist only the normalized snapshot, reply with a status word only", async () => {
  const world = makeWorld();
  const response = await run(world, request(ADD));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" }, "the browser never receives the looked-up data in this response");
  assert.deepEqual(world.calls.map(c => c.name), ["reserve_league_lookup", "save_league_lookup"]);
  assert.equal(reads(world, "reserve_league_lookup")[0].bearer, "user-a-jwt", "reservation uses the caller's OWN token (auth.uid())");
  assert.equal(reads(world, "save_league_lookup")[0].bearer, SERVICE_KEY);
  assert.equal(world.adapterCalls.length, 1);
  assert.deepEqual(world.adapterCalls[0].query, { gameName: "Hide on bush", tagLine: "KR1", platformId: "KR" });
  const stored = world.profiles.get("entity-a");
  assert.equal(stored.data_source, "OPGG_TEMPORARY");
  assert.equal(stored.trust_status, "MANUAL", "never verified");
  assert.equal(stored.is_public, false, "private by default");
  assert.deepEqual(stored.solo, { state: "RANKED", tier: "PLATINUM", division: "II", lp: 64, wins: 20, losses: 18 });
});

test("input is validated and normalized server-side: bad input never reaches the database or the data source", async () => {
  const cases = [
    [{ ...ADD, game_name: "" }, "game_name"], [{ ...ADD, game_name: "a#b" }, "game_name"], [{ ...ADD, tag_line: "a b" }, "tag_line"],
    [{ ...ADD, tag_line: "" }, "tag_line"], [{ ...ADD, region: "MARS" }, "region"], [{ ...ADD, game_name: 42 }, "game_name"], [{ action: "add" }, "game_name"],
  ];
  for (const [body, field] of cases) {
    const world = makeWorld();
    const response = await run(world, request(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.deepEqual(await response.json(), { error: "invalid_input", field });
    assert.equal(world.calls.length, 0);
    assert.equal(world.adapterCalls.length, 0);
  }
  const world = makeWorld();
  await run(world, request({ ...ADD, game_name: "  Hide on bush ", tag_line: "#KR1", region: "kr" }));
  assert.deepEqual(reads(world, "reserve_league_lookup")[0].args, { candidate_action: "add", candidate_platform_id: "KR", candidate_game_name: "Hide on bush", candidate_tag_line: "KR1" });
});

test("invalid actions, methods, origins and missing configuration are refused before anything happens", async () => {
  for (const body of [{ action: "delete" }, { action: "" }, {}, null, { action: "ADD" }]) {
    const world = makeWorld();
    assert.equal((await run(world, request(body))).status, 400);
    assert.equal(world.calls.length + world.adapterCalls.length, 0);
  }
  const world = makeWorld();
  assert.equal((await run(world, request(null, {}, "GET"))).status, 405);
  assert.equal((await run(world, request(ADD, { origin: "https://evil.example" }))).status, 403);
  const noConfig = await handleLeagueLookup({ request: request(ADD), env: { ...ENV, serviceKey: undefined }, adapter: world.adapter, fetchImpl: world.fetch });
  assert.equal(noConfig.status, 503);
  assert.equal(world.calls.length + world.adapterCalls.length, 0);
  const preflight = await run(world, request(null, {}, "OPTIONS"));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), SITE_ORIGIN);
  assert.equal((await run(world, request(null, { origin: "https://evil.example" }, "OPTIONS"))).headers.get("access-control-allow-origin"), null);
});

test("owner-only: a missing/invalid token is refused and never reaches the data source", async () => {
  for (const authorization of [undefined, "", "Basic abc", "Bearer ", "Bearer bad token"]) {
    const world = makeWorld();
    const headers = authorization === undefined ? { authorization: "" } : { authorization };
    const response = await run(world, request(ADD, headers));
    assert.equal(response.status, 401, String(authorization));
    assert.equal(world.calls.length + world.adapterCalls.length, 0);
  }
  const world = makeWorld();
  const response = await run(world, request(ADD, { authorization: "Bearer not-a-real-user" }));
  assert.equal(response.status, 401);
  assert.equal(world.adapterCalls.length, 0);
  assert.equal(world.profiles.size, 0);
});

test("owner-only add: each user only ever creates and sees their own row; ids in the body are ignored", async () => {
  const world = makeWorld();
  await run(world, request({ ...ADD, entity_id: "entity-b", user_id: "user-b", owner: "user-b" }));
  assert.deepEqual([...world.profiles.keys()], ["entity-a"]);
  for (const call of world.calls) assert.equal(JSON.stringify(call.args).includes("entity-b"), false);
  world.advance(3600);
  world.adapterResult = { ok: true, snapshot: snapshot({ gameName: "Other", tagLine: "EUW" }) };
  const b = await run(world, request({ ...ADD, game_name: "Other", tag_line: "EUW" }, { authorization: "Bearer user-b-jwt" }));
  assert.equal(b.status, 200);
  assert.deepEqual([...world.profiles.keys()].sort(), ["entity-a", "entity-b"]);
  assert.equal(world.profiles.get("entity-a").game_name, "Hide on bush", "A's row untouched by B");
});

test("a user without a GamID identity, or an unverified email, cannot look anything up", async () => {
  const noIdentity = makeWorld();
  const a = await run(noIdentity, request(ADD, { authorization: "Bearer user-c-jwt" }));
  assert.equal(a.status, 409);
  assert.equal(noIdentity.adapterCalls.length, 0);
  const unverified = makeWorld({ reserveError: "EMAIL_NOT_VERIFIED" });
  const b = await run(unverified, request(ADD));
  assert.equal(b.status, 403);
  assert.equal(unverified.adapterCalls.length, 0);
});

test("adding when a League identity already exists is refused without a lookup (change it by removing first)", async () => {
  const world = makeWorld();
  await run(world, request(ADD));
  world.advance(3600);
  const again = await run(world, request({ ...ADD, game_name: "Someone", tag_line: "ELSE" }));
  assert.equal(again.status, 409);
  assert.deepEqual(await again.json(), { error: "already_exists" });
  assert.equal(world.adapterCalls.length, 1);
  assert.equal(world.profiles.get("entity-a").game_name, "Hide on bush");
});

test("owner-only refresh: only the owner can refresh, and a refresh can only re-check the STORED identity", async () => {
  const world = makeWorld();
  assert.equal((await run(world, request({ action: "refresh" }))).status, 409, "no profile yet -> no_profile");
  assert.equal(world.adapterCalls.length, 0);
  await run(world, request(ADD));
  world.advance(601);
  const b = await run(world, request({ action: "refresh" }, { authorization: "Bearer user-b-jwt" }));
  assert.deepEqual(await b.json(), { error: "no_profile" }, "B has no profile: A's profile cannot be refreshed by B");
  assert.equal(world.adapterCalls.length, 1);
  const refreshed = await run(world, request({ action: "refresh", game_name: "Attacker", tag_line: "HAX", region: "NA1" }));
  assert.equal(refreshed.status, 200);
  assert.deepEqual(world.adapterCalls[1].query, { gameName: "Hide on bush", tagLine: "KR1", platformId: "KR" }, "the body's identity is ignored on refresh");
  assert.deepEqual(reads(world, "reserve_league_lookup").at(-1).args, { candidate_action: "refresh", candidate_platform_id: null, candidate_game_name: null, candidate_tag_line: null });
});

test("refresh throttling: 60 s spacing, 10 minute Refresh cooldown, hourly cap — enforced before any outbound request", async () => {
  const world = makeWorld();
  await run(world, request(ADD));
  assert.equal(world.adapterCalls.length, 1);

  const early = await run(world, request({ action: "refresh" }));
  assert.equal(early.status, 429);
  const body = await early.json();
  assert.equal(body.error, "cooldown");
  assert.ok(body.retry_after_seconds > 0 && body.retry_after_seconds <= 600);
  assert.equal(early.headers.get("retry-after"), String(body.retry_after_seconds));
  world.advance(300);
  assert.equal((await run(world, request({ action: "refresh" }))).status, 429, "still inside the 10 minute cooldown");
  assert.equal(world.adapterCalls.length, 1, "throttled requests never reach the data source");

  world.advance(301);
  assert.equal((await run(world, request({ action: "refresh" }))).status, 200);
  assert.equal(world.adapterCalls.length, 2);

  // hourly cap: failed attempts count too
  const capped = makeWorld({ adapterResult: { ok: false, code: "NOT_FOUND" } });
  let ok = 0;
  for (let i = 0; i < 6; i += 1) { assert.equal((await run(capped, request(ADD))).status, 200); ok += 1; capped.advance(61); }
  const seventh = await run(capped, request(ADD));
  assert.equal(seventh.status, 429);
  assert.equal((await seventh.json()).error, "rate_limited");
  assert.equal(capped.adapterCalls.length, 6);
  assert.equal(ok, 6);
});

test("failed lookups still count against the spacing throttle (no hammering after not-found/unavailable)", async () => {
  for (const code of ["NOT_FOUND", "UNAVAILABLE", "STRUCTURE_CHANGED"]) {
    const world = makeWorld({ adapterResult: { ok: false, code } });
    assert.equal((await run(world, request(ADD))).status, 200);
    const again = await run(world, request(ADD));
    assert.equal(again.status, 429);
    assert.equal((await again.json()).error, "cooldown");
    assert.equal(world.adapterCalls.length, 1);
  }
});

test("no automatic polling: nothing happens without a request, and one request is exactly one lookup", async () => {
  const world = makeWorld();
  await run(world, request(ADD));
  const before = world.adapterCalls.length;
  world.advance(24 * 3600);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(world.adapterCalls.length, before, "time passing never triggers a lookup");
  await run(world, request({ action: "refresh" }));
  assert.equal(world.adapterCalls.length, before + 1, "an explicit refresh is exactly one lookup");
});

test("player not found: reported, nothing stored on add, and the attempt is recorded as finished", async () => {
  const world = makeWorld({ adapterResult: { ok: false, code: "NOT_FOUND" } });
  const response = await run(world, request(ADD));
  assert.deepEqual(await response.json(), { status: "not_found" });
  assert.equal(world.profiles.size, 0);
  assert.deepEqual(reads(world, "finish_league_lookup")[0].args.candidate_outcome, "NOT_FOUND");
  assert.equal(reads(world, "save_league_lookup").length, 0);
});

test("data source unavailable / changed structure / adapter crash: safe status, nothing stored, no detail leaked", async () => {
  const scenarios = [
    [{ adapterResult: { ok: false, code: "UNAVAILABLE" } }, "unavailable"],
    [{ adapterResult: { ok: false, code: "STRUCTURE_CHANGED" } }, "structure_changed"],
    [{ adapterResult: { ok: false, code: "SOMETHING_ELSE" } }, "unavailable"],
    [{ adapterResult: { ok: true, snapshot: { nonsense: true } } }, "structure_changed"],
    [{ adapterResult: { ok: true, snapshot: snapshot({ soloRank: { state: "RANKED", tier: "WOOD", division: "I", lp: 1, wins: null, losses: null } }) } }, "structure_changed"],
    [{ adapterThrows: true }, "unavailable"],
  ];
  for (const [options, status] of scenarios) {
    const world = makeWorld(options);
    const logged = [];
    const response = await run(world, request(ADD), (...parts) => logged.push(parts.join(":")));
    assert.deepEqual(await response.json(), { status });
    assert.equal(world.profiles.size, 0);
    assert.equal(reads(world, "save_league_lookup").length, 0);
    assert.equal(logged.join("|").includes("secret-ish"), false);
  }
});

test("a failed refresh keeps the last good data and only records that the last attempt failed", async () => {
  const world = makeWorld();
  await run(world, request(ADD));
  const good = structuredClone(world.profiles.get("entity-a").solo);
  world.advance(601);
  world.adapterResult = { ok: false, code: "UNAVAILABLE" };
  assert.deepEqual(await (await run(world, request({ action: "refresh" }))).json(), { status: "unavailable" });
  const row = world.profiles.get("entity-a");
  assert.deepEqual(row.solo, good);
  assert.equal(row.last_result, "UNAVAILABLE");
});

test("a data source that answers with a DIFFERENT player is never saved over the owner's identity", async () => {
  const world = makeWorld();
  await run(world, request(ADD));
  world.advance(601);
  world.adapterResult = { ok: true, snapshot: snapshot({ gameName: "Someone Else", soloRank: { state: "RANKED", tier: "CHALLENGER", division: "I", lp: 1, wins: 1, losses: 1 } }) };
  const response = await run(world, request({ action: "refresh" }));
  assert.deepEqual(await response.json(), { status: "identity_mismatch" });
  assert.equal(world.profiles.get("entity-a").game_name, "Hide on bush");
  assert.equal(world.profiles.get("entity-a").solo.tier, "PLATINUM");
  assert.equal(world.profiles.get("entity-a").last_result, "IDENTITY_MISMATCH");
});

test("canonical capitalization returned by the source is accepted for the same player", async () => {
  const world = makeWorld({ adapterResult: { ok: true, snapshot: snapshot({ gameName: "HIDE ON BUSH", tagLine: "kr1" }) } });
  assert.deepEqual(await (await run(world, request({ ...ADD, game_name: "hide on bush", tag_line: "KR1" }))).json(), { status: "ok" });
  assert.equal(world.profiles.get("entity-a").game_name, "HIDE ON BUSH");
});

test("missing rank / unranked player is stored honestly as NOT_REPORTED with no invented values", async () => {
  const world = makeWorld({ adapterResult: { ok: true, snapshot: snapshot({ soloRank: { state: "NOT_REPORTED", tier: null, division: null, lp: null, wins: null, losses: null } }) } });
  assert.deepEqual(await (await run(world, request(ADD))).json(), { status: "ok" });
  assert.deepEqual(world.profiles.get("entity-a").solo, { state: "NOT_REPORTED", tier: null, division: null, lp: null, wins: null, losses: null });
});

test("nothing sensitive leaks: no token, key, or looked-up data appears in any response, log line, or non-owner RPC argument", async () => {
  const world = makeWorld();
  const logged = [];
  const response = await run(world, request(ADD), (...parts) => logged.push(parts.join(":")));
  const text = `${await response.text()}${logged.join("|")}`;
  for (const secret of [SERVICE_KEY, ANON_KEY, "user-a-jwt", "Hide on bush", "PLATINUM"]) assert.equal(text.includes(secret), false, `leaked ${secret}`);
  for (const call of world.calls) {
    if (call.bearer === "user-a-jwt") assert.equal(JSON.stringify(call.args).includes(SERVICE_KEY), false);
  }
  assert.ok(logged.every(line => /^league:[a-z_A-Z]+$/.test(line)), "log lines are event:code only");
});

test("service environment uses the standard Supabase variable names only (no Discord, Riot, or third-party keys)", () => {
  const seen = [];
  readLeagueEnv(name => { seen.push(name); return "x"; });
  assert.deepEqual(seen.sort(), ["SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"]);
});

test("replaceability: any adapter implementing { sourceKey, lookup } works unchanged — the service forwards its source key and snapshot as-is", async () => {
  const world = makeWorld();
  const officialLikeAdapter = {
    sourceKey: "SOME_FUTURE_OFFICIAL_SOURCE",
    lookup: async query => ({ ok: true, snapshot: snapshot({ gameName: query.gameName, tagLine: query.tagLine, platformId: query.platformId }) }),
  };
  const response = await handleLeagueLookup({ request: request(ADD), env: ENV, adapter: officialLikeAdapter, fetchImpl: world.fetch });
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(reads(world, "save_league_lookup")[0].args.candidate_data_source, "SOME_FUTURE_OFFICIAL_SOURCE");
  assert.equal(world.profiles.get("entity-a").data_source, "SOME_FUTURE_OFFICIAL_SOURCE");
});
