// Classic Profile desktop consolidated update (Mazen 2026-10-11): unlimited Favorite Genres (public shows five), structured Location (GeoNames country + city,
// legacy text kept), Connected Games, the consolidated My Crews view with the 10-Crew limit, and the PROVISIONAL SteamGridDB artwork evaluation. The migration
// runs in an isolated PGlite Postgres on top of the real Banner / About Me migrations, with minimal stand-ins for the Crew / game tables it reads.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { handleGameArtwork, resolveGame, normalizeTitle, handleFrom, LIMITS } from "../supabase/functions/_shared/game-artwork.js";
import { applyGameArtwork, fetchGameArtwork } from "../dist/public/game-artwork.js";
import { normalizeCrewDirectory, crewCard, createCrewsDirectory } from "../dist/public/crews-directory.js";
import { connectedGamesSection, initialsOf, createDesktopProfile } from "../dist/public/public-desktop.js";
import { locationSearchKey, filterCountries } from "../dist/account/location.js";
import { parseCity, parseCountries, batchSql } from "../scripts/location/geonames-import.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/20261011100000_classic_profile_consolidated.sql");
const allowlist = read("supabase/migrations/20261011140000_artwork_evaluation_allowlist.sql");

// ---------------------------------------------------------------------------------------------------------------- PGlite fixture
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema storage;
    grant usage on schema public, private, auth, storage to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function storage.operation() returns text language plpgsql stable as $$ begin return current_setting('storage.operation', true); end; $$;
    grant execute on function auth.uid(), storage.operation() to anon, authenticated, service_role;
    create function private.normalize_handle(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    grant execute on function private.normalize_handle(text) to anon, authenticated, service_role;
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, display_name text, visibility text, avatar_media_reference text, created_at timestamptz not null default now());
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.profiles (profile_id uuid primary key default gen_random_uuid(), entity_id uuid unique, updated_at timestamptz);
    insert into public.entities values ('${EA}', 'SOLO', 'alpha', 'Alpha', 'PUBLIC', 'x/avatar-a.webp', '2024-03-05T10:00:00Z'), ('${EB}', 'SOLO', 'bravo', 'Bravo', 'PUBLIC', null, '2026-01-01T00:30:00Z');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    insert into public.profiles (entity_id) values ('${EA}'), ('${EB}');
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, metadata jsonb, created_at timestamptz not null default now());
    alter table storage.objects enable row level security; grant select on storage.objects to anon, authenticated;
    create table private.usage_uploads (bucket text, path text, owner_id uuid, state text);
    create function private.usage_object_owned(b text, p text, u uuid) returns boolean language sql stable security definer set search_path = '' as $$ select false $$;
    grant execute on function private.usage_object_owned(text, text, uuid) to authenticated;
    create function private.intro_media_is_public(p text) returns boolean language sql stable as $$ select false $$;
    create function private.wall_object_is_published(b text, p text) returns boolean language sql stable as $$ select false $$;
    -- minimal stand-ins for the accepted game / Crew objects the new migration reads (their own behaviour is covered by their own tests)
    create table public.game_catalog (game_key text primary key, display_name text, release_year integer, is_active boolean default true);
    insert into public.game_catalog values ('league_of_legends', 'League of Legends', 2009, true), ('valorant', 'VALORANT', 2020, true), ('rocket_league', 'Rocket League', 2015, true);
    ${Array.from({ length: 12 }, (_, i) => `insert into public.game_catalog values ('g${i}', 'Game ${i}', 2000, true);`).join("\n")}
    create table public.game_catalog_provider_ids (provider text, external_id text, game_key text);
    insert into public.game_catalog_provider_ids values ('steam', '252950', 'rocket_league'), ('igdb', 'league-of-legends', 'league_of_legends');
    create table public.entity_game_platforms (entity_id uuid, game_key text, platform_key text);
    insert into public.entity_game_platforms values ('${EA}', 'rocket_league', 'pc');
    create table public.discovered_games (entity_id uuid, source_provider text, external_game_id text);
    create table public.known_game_sources (source_provider text, external_game_id text, game_key text);
    create table public.league_profiles (entity_id uuid, is_public boolean);
    insert into public.league_profiles values ('${EA}', true);
    create function private.public_my_games_allowed(e uuid) returns boolean language sql stable as $$ select e = '${EA}'::uuid $$;
    create table private.crew_policy (singleton boolean primary key default true, max_members integer not null);
    insert into private.crew_policy (max_members) values (15);
    create table public.crews (crew_id uuid primary key default gen_random_uuid(), game_key text, name text, owner_entity_id uuid);
    create table public.crew_members (crew_id uuid, game_key text, entity_id uuid, role text, status text, invited_by_entity_id uuid, joined_at timestamptz, primary key (crew_id, entity_id));
    create table public.crew_walls (crew_id uuid primary key, published boolean default false);
    create function private.identity_my_entity() returns uuid language sql stable security definer set search_path = '' as $$ select m.entity_id from public.entity_memberships m where m.user_id = auth.uid() $$;
    create function private.crew_lock(c uuid) returns public.crews language sql volatile security definer set search_path = '' as $$ select * from public.crews where crew_id = c $$;
    create function private.crew_lock_game(e uuid, g text) returns void language sql volatile as $$ select null::void $$;
    create function private.crew_max_members() returns integer language sql stable security definer set search_path = '' as $$ select max_members from private.crew_policy $$;
    create function private.notify(a uuid, b uuid, t text, s uuid, c jsonb) returns void language sql volatile as $$ select null::void $$;
    create function private.crew_context(c uuid) returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function private.create_crew_impl(candidate_game_key text, candidate_name text) returns uuid language sql as $$ select null::uuid $$;
    create function private.respond_to_crew_invite_impl(candidate_crew uuid, candidate_accept boolean) returns text language sql as $$ select null::text $$;
    create function public.create_crew(g text, n text) returns uuid language sql volatile security invoker set search_path = '' as $$ select private.create_crew_impl(g, n) $$;
    create function public.respond_to_crew_invite(c uuid, a boolean) returns text language sql volatile security invoker set search_path = '' as $$ select private.respond_to_crew_invite_impl(c, a) $$;`);
  for (const f of ["20261010120000_profile_banner.sql", "20261010130000_profile_banner_read_containment.sql", "20261010140000_visitor_storage_signing.sql", "20261010160000_profile_about_me.sql", "20261010180000_member_since_date.sql"]) await db.exec(read(`supabase/migrations/${f}`));

  await db.exec(migration);
  await db.exec(allowlist);
  await db.exec(`grant execute on function public.create_crew(text, text), public.respond_to_crew_invite(uuid, boolean), private.create_crew_impl(text, text), private.respond_to_crew_invite_impl(uuid, boolean) to authenticated;
    select private.import_location_batch('${JSON.stringify({ countries: [{ code: "SA", name: "Saudi Arabia", geoname_id: "102358" }, { code: "PG", name: "Papua New Guinea" }, { code: "GN", name: "Guinea" }, { code: "US", name: "United States" }],
      cities: [{ id: 105343, country: "SA", name: "Jeddah", name_ar: "جدة", search: "jeddah|جده|jiddah", population: 2867446 }, { id: 108410, country: "SA", name: "Riyadh", name_ar: "الرياض", search: "riyadh|الرياض", population: 4205961 },
        { id: 1, country: "US", name: "Springfield", search: "springfield", population: 167000 }, { id: 2, country: "US", name: "Springfield", search: "springfield", population: 116000 }] })}'::jsonb);`);
  const call = async (uid, sql, params = []) => { await db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';"); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); } };
  const service = async (sql, params = []) => { await db.exec("set role service_role;"); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); } };
  const set = (uid, v) => call(uid, "select * from public.set_my_about($1, $2, $3, $4, $5, $6, $7, $8)", [v.country ?? null, v.city ?? null, v.keepLegacy ?? false, v.languages ?? [], v.genres ?? [], v.showLocation ?? false, v.showLanguages ?? false, v.showGenres ?? false]);
  const extras = async handle => (await call(null, "select * from public.get_public_profile_extras($1)", [handle]))[0] ?? null;
  return { db, call, service, set, extras };
}
const code = e => e?.message ?? String(e);

test("migration: additive - nothing dropped but the About Me functions it re-creates and the two About constraints it widens; no data rewritten", () => {
  const sql = migration.replace(/--.*$/gm, "");
  const drops = [...sql.matchAll(/\bdrop\s+(\w+)\s+([^;]+);/gi)].map(m => `${m[1]} ${m[2].trim()}`.replace(/\s+/g, " "));
  assert.deepEqual(drops.filter(d => !/^function (public|private)\.(get_public_profile_extras|get_my_about|set_my_about)(_impl)?\(/.test(d)), ["constraint profiles_about_switches_check", "constraint profiles_about_genres_check"]);
  assert.doesNotMatch(sql.replace(/\$\$[\s\S]*?\$\$/g, ""), /\bdelete\s+from\b|\btruncate\b|\bupdate\s+(public|private)\./i, "no existing row is rewritten by the migration itself (function bodies run only when called)");
  assert.doesNotMatch(sql, /get_public_identity|public_my_games\(|storage\.objects/, "the accepted identity / My Games readers and Storage are untouched");
});

test("Favorite Genres: more than five are stored and returned (still catalog-validated, no duplicates); languages keep their five", async () => {
  const f = await fixture();
  const genres = (await f.call(A, "select * from public.get_my_about()"))[0].catalogs.genres.map(g => g.key);
  assert.equal(genres.length, 20);
  const row = (await f.set(A, { genres, showGenres: true }))[0];
  assert.equal(row.about_genres.length, 20, "all twenty kept");
  assert.equal((await f.extras("alpha")).about_genres.length, 20, "the server sends them all and the page draws them all");
  assert.deepEqual((await f.extras("alpha")).about_genres.map(g => g.key), genres, "in the owner's order");
  await f.set(A, { genres, showGenres: false });
  assert.deepEqual((await f.extras("alpha")).about_genres, [], "visibility OFF: no genre leaves the server");
  await assert.rejects(f.set(A, { genres: ["rpg", "rpg"] }), e => code(e) === "DUPLICATE_GENRE");
  await assert.rejects(f.set(A, { genres: ["dating"] }), e => code(e) === "INVALID_GENRE");
  await assert.rejects(f.set(A, { languages: ["ar", "en", "fr", "es", "de", "it"] }), e => code(e) === "TOO_MANY_LANGUAGES");
});

test("Location: a catalog country, then a city of THAT country; the public text is formatted; the switch needs a value", async () => {
  const f = await fixture();
  let row = (await f.set(A, { country: "SA", city: 105343, showLocation: true }))[0];
  assert.deepEqual([row.about_country_code, Number(row.about_city_id), row.about_city_name, row.about_location, row.show_location], ["SA", 105343, "Jeddah", "Jeddah, Saudi Arabia", true]);
  assert.equal((await f.extras("alpha")).about_location, "Jeddah, Saudi Arabia");
  row = (await f.set(A, { country: "SA", showLocation: true }))[0];
  assert.equal(row.about_location, "Saudi Arabia", "a country alone is a valid Location");
  await assert.rejects(f.set(A, { country: "XX" }), e => code(e) === "INVALID_COUNTRY");
  await assert.rejects(f.set(A, { country: "US", city: 105343 }), e => code(e) === "INVALID_CITY", "a city of another country");
  await assert.rejects(f.set(A, { city: 105343 }), e => code(e) === "INVALID_CITY", "a city without its country");
  row = (await f.set(A, { showLocation: true }))[0];
  assert.deepEqual([row.about_location, row.show_location], [null, false], "nothing chosen: the switch cannot be ON");
  await f.set(A, { country: "SA", city: 105343, showLocation: false });
  assert.equal((await f.extras("alpha")).about_location, null, "private: not sent");
  const found = await f.call(A, "select * from public.search_location_cities('US', 'spring')");
  assert.deepEqual(found.map(r => [Number(r.city_id), r.population]), [[1, 167000], [2, 116000]], "only that country, most populous first");
  assert.deepEqual((await f.call(A, "select * from public.search_location_cities('SA', 'جده')")).map(r => r.name), ["Jeddah"], "Arabic search (folded by the caller)");
  await assert.rejects(f.call(null, "select * from public.search_location_cities('SA', 'j')"), /permission denied/);
});

test("legacy free-text Location: kept as it is, still shown, never converted; a suggestion only when exactly one place matches", async () => {
  const f = await fixture();
  await f.db.exec(`update public.profiles set about_location = 'Jeddah Saudi Arabia', show_about_location = true where entity_id = '${EA}'`);
  let mine = (await f.call(A, "select * from public.get_my_about()"))[0];
  assert.deepEqual([mine.about_location, mine.legacy_location, mine.about_country_code], ["Jeddah Saudi Arabia", "Jeddah Saudi Arabia", null], "unchanged by the migration");
  assert.deepEqual(mine.location_suggestion, { country_code: "SA", country_name: "Saudi Arabia", city_id: 105343, city_name: "Jeddah" });
  assert.equal((await f.extras("alpha")).about_location, "Jeddah Saudi Arabia", "visitors still see it");
  const sugg = async text => { await f.db.exec(`update public.profiles set about_location = '${text}', about_country_code = null, about_city_id = null where entity_id = '${EA}'`); return (await f.call(A, "select * from public.get_my_about()"))[0].location_suggestion; };
  assert.deepEqual(await sugg("Saudi Arabia"), { country_code: "SA", country_name: "Saudi Arabia" });
  assert.equal(await sugg("Springfield United States"), null, "two Springfields: ambiguous, no guess");
  assert.equal(await sugg("Atlantis"), null);
  assert.deepEqual((await sugg("Port Moresby Papua New Guinea"))?.country_code ?? null, null, "a city the catalog does not hold: no suggestion");
  assert.deepEqual(await sugg("Papua New Guinea"), { country_code: "PG", country_name: "Papua New Guinea" }, "the longest country name wins (not 'Guinea')");
  await sugg("Jeddah Saudi Arabia");
  let row = (await f.set(A, { keepLegacy: true, showLocation: true }))[0];
  assert.deepEqual([row.legacy_location, row.show_location], ["Jeddah Saudi Arabia", true], "saving other fields keeps it");
  row = (await f.set(A, { country: "SA", city: 105343, showLocation: true }))[0];
  assert.deepEqual([row.about_location, row.legacy_location], ["Jeddah, Saudi Arabia", null], "the owner's own choice replaces it");
});

test("Crews: at most 10 ACTIVE memberships (owned + joined) - creating or accepting the 11th is refused; invites do not count; nothing existing is touched", async () => {
  const f = await fixture();
  const crews = [];
  for (let i = 0; i < 10; i++) { const [r] = await f.call(B, "select public.create_crew($1, $2) id", [`g${i}`, `Crew ${i}`]); crews.push(r.id); }
  await assert.rejects(f.call(B, "select public.create_crew('g10', 'Crew 10')"), e => code(e) === "CREW_LIMIT_REACHED");
  const [own] = await f.call(A, "select public.create_crew('g11', 'Alpha Crew') id");
  await f.db.exec(`insert into public.crew_members values ('${own.id}', 'g11', '${EB}', 'MEMBER', 'INVITED', '${EA}', null)`);
  await assert.rejects(f.call(B, "select public.respond_to_crew_invite($1, true)", [own.id]), e => code(e) === "CREW_LIMIT_REACHED", "accepting the 11th");
  assert.equal((await f.call(B, "select public.respond_to_crew_invite($1, false) r", [own.id]))[0].r, "DECLINED", "declining is always possible");
  await f.db.exec(`update public.crew_members set status = 'LEFT' where crew_id = '${crews[0]}'`);
  assert.ok((await f.call(B, "select public.create_crew('g10', 'Crew 10') id"))[0].id, "room again after leaving one");
  assert.equal((await f.db.query("select count(*)::int n from public.crew_members where entity_id = $1 and status = 'ACTIVE'", [EB])).rows[0].n, 10);
});

test("get_public_crews: the public section's Crews only (PUBLIC GamID, ACTIVE, Crew Wall PUBLISHED), with counts and at most six PUBLIC members", async () => {
  const f = await fixture();
  const [c1] = await f.call(A, "select public.create_crew('valorant', 'Spike') id");
  const [c2] = await f.call(A, "select public.create_crew('league_of_legends', 'Owls') id");
  await f.db.exec(`insert into public.crew_walls values ('${c1.id}', true), ('${c2.id}', false);
    insert into public.crew_members values ('${c1.id}', 'valorant', '${EB}', 'MEMBER', 'ACTIVE', '${EA}', now());`);
  let list = (await f.call(null, "select public.get_public_crews('alpha') v"))[0].v;
  assert.deepEqual(list.map(c => [c.crew_name, c.member_count, c.members.map(m => m.handle)]), [["Spike", 2, ["alpha", "bravo"]]], "the unpublished Crew Wall is not listed; owner first");
  assert.deepEqual(Object.keys(list[0].members[0]).sort(), ["avatar_media_reference", "display_name", "handle"]);
  await f.db.exec(`update public.entities set visibility = 'PRIVATE' where entity_id = '${EB}'`);
  list = (await f.call(null, "select public.get_public_crews('alpha') v"))[0].v;
  assert.deepEqual([list[0].member_count, list[0].members.map(m => m.handle)], [2, ["alpha"]], "a non-public member is counted, never shown");
  assert.deepEqual((await f.call(null, "select public.get_public_crews('bravo') v"))[0].v, [], "a non-public GamID lists nothing");
  await f.db.exec(`update public.entities set visibility = 'DRAFT' where entity_id = '${EA}'`);
  assert.deepEqual((await f.call(null, "select public.get_public_crews('alpha') v"))[0].v, []);
});

test("artwork RPCs: service role only; targets follow the visitor's own visibility (My Games public, League public, published Crew Walls); cache holds metadata only", async () => {
  const f = await fixture();
  for (const fn of ["public.game_artwork_targets('alpha')", "public.game_artwork_cache_get(array['x'])", "public.game_artwork_cache_put('[]'::jsonb)"]) {
    await assert.rejects(f.call(null, `select ${fn}`), /permission denied/, fn);
    await assert.rejects(f.call(A, `select ${fn}`), /permission denied/, fn);
  }
  assert.deepEqual((await f.service("select public.game_artwork_targets('alpha') v"))[0].v, { enabled: false, games: [] }, "outside the evaluation allowlist (only the GM-TEST personas): nothing");
  await f.db.exec("update private.game_artwork_settings set evaluation_handles = array['alpha', 'bravo']");
  const t = (await f.service("select public.game_artwork_targets('alpha') v"))[0].v;
  assert.equal(t.enabled, true);
  assert.deepEqual(t.games.map(g => [g.game_key, g.purposes, g.steam_appid]).sort(), [["league_of_legends", ["connected"], null], ["rocket_league", ["my_games"], 252950]]);
  assert.deepEqual((await f.service("select public.game_artwork_targets('bravo') v"))[0].v.games, [], "My Games not public, no League");
  await f.service(`select public.game_artwork_cache_put('[{"game_key":"rocket_league","status":"MATCHED","match_basis":"steam_appid","provider_game_id":5,"icon_url":"https://cdn2.steamgriddb.com/icon/abc.png"}]'::jsonb)`);
  assert.equal((await f.service("select public.game_artwork_cache_get(array['rocket_league']) v"))[0].v[0].icon_url, "https://cdn2.steamgriddb.com/icon/abc.png");
  await assert.rejects(f.service(`select public.game_artwork_cache_put('[{"game_key":"rocket_league","status":"MATCHED","icon_url":"https://evil.example/x.png"}]'::jsonb)`), /check constraint/, "only the provider CDN");
  await f.db.exec("update private.game_artwork_settings set enabled = false");
  assert.equal((await f.service("select public.game_artwork_targets('alpha') v"))[0].v.enabled, false, "the kill switch");
});

// ---------------------------------------------------------------------------------------------------------------- the game-artwork Edge Function (mocked provider)
const ENV = { supabaseUrl: "https://abc.supabase.co", serviceKey: "service-secret", providerKey: "provider-secret" };
const CDN = p => `https://cdn2.steamgriddb.com/${p}`;
function fakeFetch({ targets, cache = [], provider = {}, hit = true }) {
  const calls = { rpc: [], provider: [], put: null };
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    if (u.hostname === "abc.supabase.co") {
      const name = u.pathname.split("/").pop(), body = JSON.parse(options.body || "{}");
      calls.rpc.push(name);
      const reply = name === "public_media_hit" ? hit : name === "game_artwork_targets" ? targets : name === "game_artwork_cache_get" ? cache : name === "game_artwork_cache_put" ? (calls.put = body.candidate_rows, 1) : null;
      return new Response(JSON.stringify(reply), { status: 200 });
    }
    calls.provider.push(u.pathname + u.search);
    assert.equal(options.headers?.Authorization, "Bearer provider-secret");
    const route = Object.keys(provider).find(prefix => (u.pathname + u.search).startsWith(prefix));
    const r = route ? provider[route] : { status: 404 };
    if (r.throw) throw new Error(r.throw);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  };
  return { fetchImpl, calls };
}
const request = (handle = "alpha", init = {}) => new Request(`https://abc.supabase.co/functions/v1/game-artwork/${handle}`, { headers: { origin: "https://gamid-testing-static.gamid.workers.dev", ...init } });
const TARGETS = { enabled: true, games: [
  { game_key: "rocket_league", name: "Rocket League", year: 2015, steam_appid: 252950, purposes: ["my_games"] },
  { game_key: "league_of_legends", name: "League of Legends", year: 2009, steam_appid: null, purposes: ["connected", "crews"] },
] };
const ok = data => ({ body: { success: true, data } });

test("artwork: an exact Steam id match and a strict name + year match; images only from the provider CDN; metadata cached; the key never leaves", async () => {
  const { fetchImpl, calls } = fakeFetch({ targets: TARGETS, provider: {
    "/api/v2/games/steam/252950": ok({ id: 11 }),
    "/api/v2/search/autocomplete/League%20of%20Legends": ok([{ id: 22, name: "League of Legends", release_date: Date.UTC(2009, 9, 27) / 1000 }, { id: 23, name: "League of Legends: Wild Rift", release_date: Date.UTC(2020, 9, 27) / 1000 }]),
    "/api/v2/icons/game/11": ok([{ url: CDN("icon/rl.png") }]), "/api/v2/grids/game/11": ok([{ url: CDN("grid/rl.png") }]),
    "/api/v2/icons/game/22": ok([{ url: CDN("icon/lol.png") }]), "/api/v2/grids/game/22": ok([{ url: "https://elsewhere.example/lol.png" }]), "/api/v2/heroes/game/22": ok([{ url: CDN("hero/lol.jpg") }]),
  } });
  const response = await handleGameArtwork({ request: request(), env: ENV, fetchImpl });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.artwork, { rocket_league: { icon: CDN("icon/rl.png"), grid: CDN("grid/rl.png") }, league_of_legends: { icon: CDN("icon/lol.png"), hero: CDN("hero/lol.jpg") } });
  assert.deepEqual(body.myGames, { "Rocket League|2015": "rocket_league" });
  assert.deepEqual(calls.put.map(r => [r.game_key, r.status, r.match_basis, r.provider_game_id]), [["league_of_legends", "MATCHED", "exact_name_year", 22], ["rocket_league", "MATCHED", "steam_appid", 11]], "connected / crew games first");
  assert.ok(calls.provider.every(p => /types=static&nsfw=false&humor=false&epilepsy=false&limit=1|^\/api\/v2\/(games|search)/.test(p)), "static, safe images only");
  assert.doesNotMatch(JSON.stringify(body) + JSON.stringify(calls.put), /secret/);
});

test("artwork: similar titles, a different year or an ambiguous search are NO_MATCH (never a guessed image); no images = NO_MATCH", async () => {
  const sameNameTwice = ok([{ id: 1, name: "Doom", release_date: Date.UTC(1993, 0, 1) / 1000 }, { id: 2, name: "DOOM", release_date: Date.UTC(1993, 5, 1) / 1000 }]);
  const run = async (game, provider) => { const { fetchImpl } = fakeFetch({ targets: { enabled: true, games: [] }, provider }); return resolveGame(fetchImpl, ENV, game); };
  assert.equal((await run({ game_key: "doom", name: "Doom", year: 1993 }, { "/api/v2/search/autocomplete/Doom": sameNameTwice })).status, "NO_MATCH", "two exact titles in the same year");
  assert.equal((await run({ game_key: "doom", name: "Doom", year: 2016 }, { "/api/v2/search/autocomplete/Doom": sameNameTwice })).status, "NO_MATCH", "wrong year");
  assert.equal((await run({ game_key: "lol", name: "League of Legends", year: 2009 }, { "/api/v2/search/autocomplete/League%20of%20Legends": ok([{ id: 9, name: "Ruined King: A League of Legends Story", release_date: Date.UTC(2021, 0, 1) / 1000 }]) })).status, "NO_MATCH", "a similar title");
  assert.equal((await run({ game_key: "rl", name: "Rocket League", year: 2015, steam_appid: 252950 }, { "/api/v2/games/steam/252950": ok({ id: 11 }) })).status, "NO_MATCH", "a match with no images");
  assert.equal(normalizeTitle("Tom Clancy’s Rainbow Six® Siege"), normalizeTitle("Tom Clancy's Rainbow Six Siege"));
});

test("artwork failures never break the profile: timeout / 429 / 5xx / 401 stop lookups and cache nothing for that game; no key = no provider call; disabled / rate limited / bad handle", async () => {
  for (const failure of [{ throw: "timeout" }, { status: 429 }, { status: 503 }, { status: 401 }]) {
    const { fetchImpl, calls } = fakeFetch({ targets: TARGETS, provider: { "/api/v2/search": failure, "/api/v2/games/steam/252950": failure } });
    const response = await handleGameArtwork({ request: request(), env: ENV, fetchImpl });
    assert.equal(response.status, 200, JSON.stringify(failure));
    assert.deepEqual((await response.json()).artwork, {});
    assert.equal(calls.provider.length, 1, "it stopped at the first failure");
    assert.equal(calls.put, null, "nothing cached");
  }
  const noKey = fakeFetch({ targets: TARGETS, cache: [{ game_key: "rocket_league", status: "MATCHED", icon_url: CDN("icon/rl.png") }] });
  const body = await (await handleGameArtwork({ request: request(), env: { ...ENV, providerKey: "" }, fetchImpl: noKey.fetchImpl })).json();
  assert.deepEqual([body.configured, body.artwork, noKey.calls.provider.length], [false, { rocket_league: { icon: CDN("icon/rl.png") } }, 0], "cached results still served; nothing new asked");
  const disabled = fakeFetch({ targets: { ...TARGETS, enabled: false } });
  assert.deepEqual((await (await handleGameArtwork({ request: request(), env: ENV, fetchImpl: disabled.fetchImpl })).json()).artwork, {});
  assert.equal(disabled.calls.provider.length, 0);
  const limited = fakeFetch({ targets: TARGETS, hit: false });
  assert.equal((await handleGameArtwork({ request: request(), env: ENV, fetchImpl: limited.fetchImpl })).status, 429);
  const bad = fakeFetch({ targets: TARGETS });
  assert.deepEqual((await (await handleGameArtwork({ request: request("a%3Cb"), env: ENV, fetchImpl: bad.fetchImpl })).json()).artwork, {});
  assert.equal(bad.calls.rpc.length, 0);
  assert.equal((await handleGameArtwork({ request: request("alpha", { origin: "https://evil.example" }), env: ENV, fetchImpl: bad.fetchImpl })).status, 403);
  assert.equal(handleFrom("https://x.supabase.co/functions/v1/game-artwork/Alpha_1"), "alpha_1");
  assert.ok(LIMITS.lookupsPerRequest <= 8 && LIMITS.requestTimeoutMs <= 5000);
});

test("artwork: a malformed 200 (not JSON, or not the documented { success, data } shape) is a provider fault - lookups stop and nothing is cached", async () => {
  for (const bad of [{ raw: "<html>oops</html>" }, { body: { data: [] } }, { body: { success: false, errors: ["x"] } }, { body: [] }]) {
    const fetchImpl = async (url, options = {}) => {
      const u = new URL(url);
      if (u.hostname === "abc.supabase.co") { const name = u.pathname.split("/").pop(); return new Response(JSON.stringify(name === "public_media_hit" ? true : name === "game_artwork_targets" ? TARGETS : name === "game_artwork_cache_get" ? [] : (bad.put = true, 1)), { status: 200 }); }
      return new Response(bad.raw ?? JSON.stringify(bad.body), { status: 200 });
    };
    const body = await (await handleGameArtwork({ request: request(), env: ENV, fetchImpl })).json();
    assert.deepEqual(body.artwork, {}, JSON.stringify(bad));
    assert.equal(bad.put, undefined, "nothing cached");
  }
});

test("artwork: two library games with the same title and year are not mapped (no image rather than a wrong one)", async () => {
  const twins = { enabled: true, games: [{ game_key: "a", name: "Twin", year: 2000, purposes: ["my_games"] }, { game_key: "b", name: "Twin", year: 2000, purposes: ["my_games"] }] };
  const { fetchImpl } = fakeFetch({ targets: twins, cache: [{ game_key: "a", status: "MATCHED", icon_url: CDN("icon/a.png") }] });
  assert.deepEqual((await (await handleGameArtwork({ request: request(), env: { ...ENV, providerKey: "" }, fetchImpl })).json()).myGames, {});
});

// ---------------------------------------------------------------------------------------------------------------- a small fake DOM for the page modules
class El {
  constructor(tag, doc) { this.tag = tag; this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.attrs = {}; this.listeners = {}; this.hidden = false; this.className = ""; this._text = ""; this.style = {}; this.parent = null; }
  get ownerDocument() { return this.doc; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(""); }
  set textContent(v) { this.children = []; this._text = String(v); }
  get classList() { const s = this; return { add: n => { if (!s.className.split(/\s+/).includes(n)) s.className = `${s.className} ${n}`.trim(); }, contains: n => s.className.split(/\s+/).includes(n), toggle() {}, remove() {} }; }
  append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute(n, v) { this.attrs[n] = String(v); } getAttribute(n) { return this.attrs[n] ?? null; } hasAttribute(n) { return n in this.attrs; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); } dispatch(t) { for (const f of this.listeners[t] || []) f({ type: t, preventDefault() {} }); }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
  querySelectorAll(sel) { const m = /^\[([a-z-]+)\]$/.exec(sel); const cls = /^\.([a-z-]+)$/.exec(sel); return this.all(c => (m ? m[1] in c.attrs : cls ? c.classList.contains(cls[1]) : false)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  byClass(n) { return this.all(c => c.classList.contains(n)); }
  first(n) { return this.byClass(n)[0] || null; }
}
const makeDoc = () => { const doc = { createElement: tag => new El(tag, doc), activeElement: null, body: null }; doc.body = new El("body", doc); return doc; };

test("page artwork: tiles get an image only from the server's answer (initials stay underneath); backgrounds are a layer over the gradient; foreign URLs are ignored", () => {
  const doc = makeDoc(), root = doc.createElement("div");
  const tile = doc.createElement("span"); tile.setAttribute("data-game-key", "league_of_legends");
  const row = doc.createElement("span"); row.setAttribute("data-artwork-row", "Rocket League|2015");
  const bg = doc.createElement("span"); bg.setAttribute("data-game-bg", "league_of_legends");
  const other = doc.createElement("span"); other.setAttribute("data-game-key", "valorant");
  root.append(tile, row, bg, other);
  const placed = applyGameArtwork(root, { artwork: { league_of_legends: { icon: CDN("icon/lol.png"), hero: CDN("hero/lol.jpg") }, rocket_league: { grid: CDN("grid/rl.png") }, valorant: { icon: "https://evil.example/v.png" } }, myGames: { "Rocket League|2015": "rocket_league" } });
  assert.equal(placed, 3);
  assert.equal(tile.first("game-art").src, CDN("icon/lol.png"));
  assert.equal(tile.first("game-art").referrerPolicy, "no-referrer");
  assert.equal(row.first("game-art").src, CDN("grid/rl.png"), "a grid when there is no icon");
  assert.equal(bg.first("game-art-bg").style.backgroundImage, `url("${CDN("hero/lol.jpg")}")`);
  assert.equal(other.children.length, 0, "not the provider CDN: not shown");
  tile.first("game-art").dispatch("error");
  assert.equal(tile.first("game-art"), null, "a broken image is removed: the initials show");
  assert.equal(applyGameArtwork(root, null), 0);
});

test("page artwork request: GamID's own function only, and any failure is simply no artwork", async () => {
  const seen = [];
  assert.deepEqual(await fetchGameArtwork("https://abc.supabase.co", "alpha", { fetchImpl: async url => { seen.push(url); return new Response(JSON.stringify({ enabled: true, artwork: {} })); } }), { enabled: true, artwork: {} });
  assert.deepEqual(seen, ["https://abc.supabase.co/functions/v1/game-artwork/alpha"]);
  assert.equal(await fetchGameArtwork("https://abc.supabase.co", "alpha", { fetchImpl: async () => { throw new Error("offline"); } }), null);
  assert.equal(await fetchGameArtwork("https://abc.supabase.co", "alpha", { fetchImpl: async () => new Response("", { status: 503 }) }), null);
  assert.equal(await fetchGameArtwork("https://abc.supabase.co", "alpha", { fetchImpl: async () => new Response(JSON.stringify({ enabled: false, artwork: {} })) }), null);
});

const CREW_A = "11111111-2222-4333-8444-555555555555", CREW_B = "99999999-2222-4333-8444-555555555555";
const ROWS = [
  { crew_id: CREW_A, crew_name: "Night Owls", game_key: "league_of_legends", game_name: "League of Legends", role: "OWNER", member_count: 8, members: [{ handle: "alpha", display_name: "Alpha", avatar_media_reference: "x/a.webp" }, { handle: "BAD HANDLE" }, { handle: "bravo", display_name: "<b>x</b>" }] },
  { crew_id: CREW_B, crew_name: "Spike", game_key: "valorant", game_name: "VALORANT", role: "MEMBER", member_count: 1, members: [] },
];

test("My Crews view: large cards that each open that existing Crew Wall; game icon + background slots; member count and PUBLIC member avatars only", async () => {
  const doc = makeDoc(), h = (tag, cls, text) => { const el = doc.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
  const crews = normalizeCrewDirectory(ROWS);
  assert.deepEqual(crews.map(c => [c.name, c.gameKey, c.members, c.people.map(p => [p.handle, p.name])]), [["Night Owls", "league_of_legends", 8, [["alpha", "Alpha"], ["bravo", "@bravo"]]], ["Spike", "valorant", 1, []]]);
  const loads = [];
  const card = crewCard(h, crews[0], { ownerHandle: "alpha", pathname: "/@alpha", loadAvatar: path => { loads.push(path); return Promise.resolve("blob:x"); } });
  assert.equal(card.tag, "a"); assert.equal(card.href, `/crew/?c=${CREW_A}&from=alpha`);
  assert.equal(card.getAttribute("aria-label"), "Night Owls, League of Legends, 8 members. Open the Crew Wall");
  assert.equal(card.first("crew-card-bg").getAttribute("data-game-bg"), "league_of_legends");
  assert.equal(card.first("crew-card-icon").getAttribute("data-game-key"), "league_of_legends");
  assert.deepEqual(card.byClass("crew-card-face").map(f => f.textContent), ["A", "B", "+6"]);
  assert.deepEqual(loads, ["x/a.webp"]);
  // the view: opens with the profile's own section first, then the server's directory
  const opened = [];
  const panel = { body: doc.createElement("div"), isOpen: () => true, open: (label, content) => { opened.push([label, content.byClass("crew-card").length]); panel.body.replaceChildren(content); } };
  const dir = createCrewsDirectory({ doc, panel, handle: "alpha", pathname: "/@alpha", section: ROWS.map(({ members, ...r }) => r), api: { getPublicCrews: async () => ROWS }, loadAvatar: async () => null });
  await dir.open(null);
  assert.deepEqual(opened, [["MY CREWS · 2", 2], ["MY CREWS · 2", 2]]);
  const failing = createCrewsDirectory({ doc, panel, handle: "alpha", section: ROWS, api: { getPublicCrews: async () => { throw new Error("down"); } } });
  opened.length = 0; await failing.open(null);
  assert.deepEqual(opened, [["MY CREWS · 2", 2]], "a failed read keeps the section's Crews");
});

test("Connected Games: real linked accounts only, a few shown + View all, an item opens only an existing destination; separate from My Games", () => {
  const doc = makeDoc();
  const item = n => ({ gameKey: `g${n}`, gameName: `Game ${n}`, identity: `Player${n}#1`, lines: ["Gold II", null], chip: "PROTOTYPE / UNVERIFIED" });
  assert.equal(connectedGamesSection([], { doc }), null);
  const one = connectedGamesSection([{ ...item(1), onOpen() {} }], { doc, onViewAll() {} });
  assert.equal(one.id, "desktopConnected"); assert.equal(one.hidden, true, "shown only by the desktop profile");
  assert.equal(one.first("desk-connected-card").tag, "button", "it has a destination");
  assert.equal(one.first("connected-thumb").getAttribute("data-game-key"), "g1");
  assert.equal(one.first("desk-connected-all"), null, "no View all for one");
  const plain = connectedGamesSection([item(1)], { doc });
  assert.equal(plain.first("desk-connected-card").tag, "div", "no destination: not a button");
  const all = [];
  const many = connectedGamesSection([1, 2, 3, 4, 5].map(item), { doc, onViewAll: list => all.push(list.length) });
  assert.equal(many.byClass("desk-connected-item").length, 3);
  many.first("desk-connected-all").dispatch("click");
  assert.deepEqual(all, [5]);
  assert.equal(initialsOf("League of Legends"), "LL");
  const page = read("dist/public/public.js");
  assert.match(page, /html\.is-public-desktop \.public-section-league\{display:none\}|leagueConnectedItem/);
  assert.match(read("dist/public/public.css"), /html\.is-public-desktop \.public-section-league\{display:none\}/, "the League card leaves the desktop sidebar (mobile unchanged)");
});

test("public genres: the desktop About Me draws EVERY public genre in the owner's order (0, 1, 5, 9, 12) - no cap, no +N, no ellipsis", () => {
  const doc = makeDoc();
  for (const count of [0, 1, 5, 9, 12]) {
    const genres = Array.from({ length: count }, (_, i) => ({ key: `g${i}`, label: `Genre ${i}` }));
    const view = createDesktopProfile({ doc, profile: { displayName: "A", handle: "@a", secondaryRoles: [] }, extras: { member_since_date: "2026-10-11", about_languages: [], about_genres: genres } });
    const row = view.about.byClass("desk-fact").find(r => r.children[0].textContent === "Favorite Genres");
    if (!count) { assert.equal(row, undefined, "nothing public: no row"); continue; }
    assert.deepEqual(row.byClass("desk-chip").map(c => c.textContent), genres.map(g => g.label), `${count}`);
  }
  assert.doesNotMatch(read("dist/public/public-desktop.js"), /PUBLIC_GENRES_SHOWN|genres\.slice\(/);
  assert.doesNotMatch(read("dist/account/about-editor.js"), /shows five/, "the editor no longer says five are shown");
  assert.match(read("dist/public/public.css"), /\.desk-chips\{display:flex;flex-wrap:wrap;/, "chips wrap inside About Me");
});

test("location search keys: accents and Arabic variants fold the same way in the import and the editor; countries filter in English or Arabic", () => {
  assert.equal(locationSearchKey("São Paulo"), "sao paulo");
  assert.equal(locationSearchKey("Jeddah, KSA"), "jeddah ksa");
  assert.equal(locationSearchKey("جدّة"), locationSearchKey("جده"));
  assert.equal(locationSearchKey("أبها"), locationSearchKey("ابها"));
  const countries = [{ code: "SA", name: "Saudi Arabia" }, { code: "EG", name: "Egypt" }, { code: "ES", name: "Spain" }];
  const ar = { SA: "السعودية", EG: "مصر", ES: "إسبانيا" };
  assert.deepEqual(filterCountries(countries, "sa", { arabic: c => ar[c] }).map(c => c.code), ["SA"]);
  assert.deepEqual(filterCountries(countries, "مصر", { arabic: c => ar[c] }).map(c => c.code), ["EG"]);
  assert.deepEqual(filterCountries(countries, "اسبانيا", { arabic: c => ar[c] }).map(c => c.code), ["ES"], "alef forms fold");
  assert.equal(filterCountries(countries, "", { arabic: () => "" }).length, 3);
});

test("GeoNames import: ids, ISO codes, an Arabic-script name, folded search keys (bounded), and safe quoting", () => {
  const countries = parseCountries("#ISO\tISO3\nSA\tSAU\t682\tSA\tSaudi Arabia\tRiyadh\t1960582\t34268528\tAS\t.sa\tSAR\tRial\t966\t\t\tar-SA\t102358\tAE\t\n");
  assert.deepEqual(countries, [{ code: "SA", name: "Saudi Arabia", geoname_id: "102358" }]);
  const line = ["105343", "Jeddah", "Jeddah", "Djeddah,Jiddah,جدة,جده,吉达", "21.5", "39.2", "P", "PPLA", "SA", "", "14", "", "", "", "2867446", "", "17", "Asia/Riyadh", "2024-01-01"].join("\t");
  const city = parseCity(line, new Set(["SA"]));
  assert.deepEqual([city.id, city.country, city.name, city.name_ar, city.population], ["105343", "SA", "Jeddah", "جدة", 2867446]);
  assert.deepEqual(city.search.split("|"), ["jeddah", "جده", "djeddah", "jiddah"], "Latin and Arabic-script names only, folded, unique");
  assert.equal(parseCity(line.replace("\tSA\t", "\tZZ\t"), new Set(["SA"])), null, "unknown country");
  assert.match(batchSql({ countries, cities: [city] }), /^select private\.import_location_batch\(\$gn\$\{.*\}\$gn\$::jsonb\);\n$/s);
  assert.throws(() => batchSql({ countries: [{ code: "SA", name: "$gn$" }], cities: [] }));
});

test("owner vs visitor: the public modules build no editing controls (no inputs, switches or edit actions)", () => {
  for (const file of ["dist/public/public-desktop.js", "dist/public/crews-directory.js", "dist/public/profile-panel.js", "dist/public/game-artwork.js"]) {
    const source = read(file);
    assert.doesNotMatch(source, /createElement\("input"|h\("input"|"checkbox"|role", "switch"|contenteditable|set_my_|save_|update_my_/, file);
  }
});
