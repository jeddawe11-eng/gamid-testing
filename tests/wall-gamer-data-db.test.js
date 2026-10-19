// My Gamer Data Phase 2: the PROPOSED migration (supabase/migrations/20261019120000_gamer_data_sections.sql) on an isolated Postgres (PGlite), after the real
// section-catalog migration it extends. The About Me / Favorite Games reads it composes are stood in for with their exact column contracts and gates (their real
// definitions are covered by their own tests and by the rolled-back TESTING rehearsal). Proves: the "Show on my GamID" switch list is unchanged, catalog metadata,
// owner vs visitor projections, every privacy gate, ordering, unknown sections, grants.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    grant usage on schema public, private, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create function private.normalize_handle(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    grant execute on function private.normalize_handle(text) to anon, authenticated, service_role;
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, visibility text, created_at timestamptz);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.profiles (profile_id uuid primary key default gen_random_uuid(), entity_id uuid unique, education_work_status text, institution text, field_of_study text,
      about_location text, about_languages text[] not null default '{}', about_genres text[] not null default '{}', show_about_location boolean not null default false,
      show_about_languages boolean not null default false, show_about_genres boolean not null default false, favorite_games text[] not null default '{}', show_my_games boolean not null default false);
    create table public.gaming_connections (entity_id uuid, provider_key text, is_public boolean);
    create table public.league_profiles (entity_id uuid, is_public boolean);
    insert into public.entities values ('${EA}', 'SOLO', 'alpha', 'PUBLIC', '2026-10-03T08:00:00Z'), ('${EB}', 'SOLO', 'bravo', 'DRAFT', '2025-01-09T08:00:00Z');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    insert into public.profiles (entity_id) values ('${EA}'), ('${EB}');
    create function private.banner_owner() returns table (owner_uid uuid, owner_entity_id uuid, owner_profile_id uuid) language plpgsql stable security definer set search_path = '' as $$
      begin if auth.uid() is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
      return query select m.user_id, e.entity_id, p.profile_id from public.entity_memberships m join public.entities e on e.entity_id = m.entity_id join public.profiles p on p.entity_id = e.entity_id where m.user_id = auth.uid();
      if not found then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if; end $$;
    -- stand-ins with the real column contracts and gates (20261011100000 / 20261011180000)
    create table public.langs (code text, label text, sort_order int); insert into public.langs values ('en', 'English', 1), ('ar', 'Arabic', 2), ('fr', 'French', 3);
    create table public.genres (key text, label text, sort_order int); insert into public.genres values ('shooter', 'Shooter', 1), ('rpg', 'RPG', 2);
    create function private.get_my_about_impl() returns table (about_location text, about_languages text[], about_genres text[], show_location boolean, show_languages boolean, show_genres boolean,
      member_since_year integer, catalogs jsonb, member_since_date text, about_country_code text, about_city_id bigint, about_city_name text, legacy_location text, location_suggestion jsonb)
      language sql stable security definer set search_path = '' as $$
      select p.about_location, p.about_languages, p.about_genres, p.show_about_location, p.show_about_languages, p.show_about_genres, extract(year from e.created_at)::int,
        jsonb_build_object('languages', (select jsonb_agg(jsonb_build_object('code', l.code, 'label', l.label) order by l.sort_order) from public.langs l),
          'genres', (select jsonb_agg(jsonb_build_object('key', g.key, 'label', g.label) order by g.sort_order) from public.genres g)),
        to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD'), null::text, null::bigint, null::text, null::text, null::jsonb
      from public.profiles p join public.entities e on e.entity_id = p.entity_id where p.profile_id = (select owner_profile_id from private.banner_owner()) $$;
    create function private.get_public_profile_extras_impl(candidate_handle text) returns table (member_since_year integer, has_banner boolean, about_location text, about_languages jsonb, about_genres jsonb, member_since_date text)
      language sql stable security definer set search_path = '' as $$
      select extract(year from e.created_at)::int, false, case when p.show_about_location then p.about_location end,
        case when p.show_about_languages then coalesce((select jsonb_agg(jsonb_build_object('code', l.code, 'label', l.label) order by array_position(p.about_languages, l.code)) from public.langs l where l.code = any (p.about_languages)), '[]') else '[]' end,
        case when p.show_about_genres then coalesce((select jsonb_agg(jsonb_build_object('key', g.key, 'label', g.label) order by array_position(p.about_genres, g.key)) from public.genres g where g.key = any (p.about_genres)), '[]') else '[]' end,
        to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD')
      from public.entities e join public.profiles p on p.entity_id = e.entity_id where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC' $$;
    grant execute on function private.get_public_profile_extras_impl(text) to anon, authenticated;
    create table public.game_catalog (game_key text primary key, display_name text, release_year integer, is_active boolean default true);
    insert into public.game_catalog values ('elden_ring', 'Elden Ring', 2022, true), ('valorant', 'Valorant', 2020, true), ('old_game', 'Old Game', null, true), ('retired', 'Retired', 2001, false);
    create function private.public_my_games_allowed(candidate uuid) returns boolean language sql stable security definer set search_path = '' as $$ select coalesce((select show_my_games from public.profiles where entity_id = candidate), false) $$;
    create function private.get_my_favorite_games_impl() returns text[] language sql stable security definer set search_path = '' as $$ select p.favorite_games from public.profiles p where p.profile_id = (select owner_profile_id from private.banner_owner()) $$;
    create function private.get_public_favorite_games_impl(candidate_handle text) returns jsonb language sql stable security definer set search_path = '' as $$
      select coalesce((select jsonb_agg(jsonb_build_object('game_key', g.game_key, 'name', g.display_name, 'year', g.release_year) order by u.i) from unnest(p.favorite_games) with ordinality u(k, i) join public.game_catalog g on g.game_key = u.k and g.is_active), '[]')
      from public.entities e join public.profiles p on p.entity_id = e.entity_id where e.gamid_handle = private.normalize_handle(candidate_handle) and e.entity_type = 'SOLO' and e.visibility = 'PUBLIC' and private.public_my_games_allowed(e.entity_id) $$;`);
  const catalog = read("20260920140000_public_section_visibility.sql");   // its catalog and switch RPCs (the identity functions it also rebuilds are not involved here)
  await db.exec(catalog.slice(0, catalog.indexOf("-- The anonymous public-safe boundary")));
  await db.exec("insert into public.public_section_catalog (section_key, label, section_kind, sort_order) values ('steam', 'Steam', 'CONNECTION', 15);");   // as 20260920190000 adds it
  const switchesBefore = await switches(db, A);
  await db.exec(read("20261019120000_gamer_data_sections.sql"));
  return { db, switchesBefore, call: (uid, sql, params) => call(db, uid, sql, params) };
}
async function call(db, uid, sql, params = []) {
  await db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); }
}
const switches = async (db, uid) => (await call(db, uid, "select * from public.get_my_section_visibility()")).map(row => `${row.section_key}:${row.label}`);
const owner = async (f, uid = A) => (await f.call(uid, "select public.get_my_gamer_data() x"))[0].x;
const visitor = async (f, handle = "alpha") => (await f.call(null, "select public.get_public_gamer_data($1) x", [handle]))[0].x;
const section = (list, key) => list.find(row => row.key === key);
const profile = (f, entity, set) => f.db.query(`update public.profiles set ${set} where entity_id = $1`, [entity]);

test("catalog: the two sections are offered to the Wall with generic metadata; the owner's Show on my GamID switches are exactly the same rows", async () => {
  const f = await fixture();
  assert.deepEqual(await switches(f.db, A), f.switchesBefore);
  assert.deepEqual(f.switchesBefore, ["discord:Discord", "steam:Steam", "league:League of Legends", "education_work:Education & Work"]);
  await assert.rejects(f.call(A, "select * from public.set_my_section_visibility('about_me', true)"), /INVALID_SECTION/);
  const rows = (await f.db.query("select section_key, wall_presentation, wall_icon, wall_single, wall_all, wall_item_label, visibility_switch from public.public_section_catalog where wall_importable order by sort_order")).rows;
  assert.deepEqual(rows, [
    { section_key: "about_me", wall_presentation: "facts", wall_icon: "about", wall_single: true, wall_all: true, wall_item_label: "Fact", visibility_switch: false },
    { section_key: "favorite_games", wall_presentation: "cards", wall_icon: "favorite", wall_single: true, wall_all: true, wall_item_label: "Favorite Game", visibility_switch: false },
  ]);
  await assert.rejects(f.db.query("insert into public.public_section_catalog (section_key, label, section_kind, wall_importable) values ('broken', 'Broken', 'PROFILE', true)"), /public_section_catalog_wall_check/);
  await assert.rejects(f.db.query("insert into public.public_section_catalog (section_key, label, section_kind, wall_importable, wall_presentation, wall_icon, wall_single) values ('odd', 'Odd', 'PROFILE', true, 'html', 'x', true)"), /check/);
});

test("About Me: the owner sees every fact with a value (each marked private while visitors would not see it); visitors get exactly what Classic shows", async () => {
  const f = await fixture();
  await profile(f, EA, "about_location = 'Paris, France', about_languages = '{ar,en}', about_genres = '{rpg,shooter}', show_about_location = true, show_about_languages = false, show_about_genres = true");
  const mine = section(await owner(f), "about_me");
  assert.deepEqual(mine.items, [
    { id: "location", kind: "text", label: "Location", value: "Paris, France", private: false },
    { id: "member_since", kind: "text", label: "Member Since", value: "3 October 2026", private: false },
    { id: "languages", kind: "chips", label: "Languages", values: ["Arabic", "English"], private: true },
    { id: "genres", kind: "chips", label: "Favorite Genres", values: ["RPG", "Shooter"], private: false },
  ]);
  assert.deepEqual({ ...mine, items: undefined }, { key: "about_me", label: "About Me", icon: "about", presentation: "facts", single: true, all: true, order: 30, item_label: "Fact", items: undefined });
  const theirs = section(await visitor(f), "about_me");
  assert.deepEqual(theirs.items, [
    { id: "location", kind: "text", label: "Location", value: "Paris, France" },
    { id: "member_since", kind: "text", label: "Member Since", value: "3 October 2026" },
    { id: "genres", kind: "chips", label: "Favorite Genres", values: ["RPG", "Shooter"] },
  ], "languages are private: absent, and no private flag reaches a visitor");
  await profile(f, EA, "show_about_location = false, show_about_genres = false");
  assert.deepEqual(section(await visitor(f), "about_me").items.map(item => item.id), ["member_since"], "switches apply on the next read");
});

test("Favorite Games: the owner's order, catalog game keys, reorder / add / remove follow Classic; visitors only while My Games is public", async () => {
  const f = await fixture();
  await profile(f, EA, "favorite_games = '{valorant,elden_ring,old_game,retired}', show_my_games = true");
  assert.deepEqual(section(await owner(f), "favorite_games").items, [
    { id: "valorant", kind: "card", label: "Valorant", title: "Valorant", sub: "2020", private: false },
    { id: "elden_ring", kind: "card", label: "Elden Ring", title: "Elden Ring", sub: "2022", private: false },
    { id: "old_game", kind: "card", label: "Old Game", title: "Old Game", private: false },
  ], "an inactive catalog game is never shown; a game with no year has no sub line");
  assert.deepEqual(section(await visitor(f), "favorite_games").items.map(item => item.id), ["valorant", "elden_ring", "old_game"]);
  await profile(f, EA, "favorite_games = '{elden_ring,valorant}'");
  assert.deepEqual(section(await visitor(f), "favorite_games").items.map(item => item.id), ["elden_ring", "valorant"], "reordered and one removed");
  await profile(f, EA, "show_my_games = false");
  assert.equal(section(await visitor(f), "favorite_games"), undefined, "My Games off: the section is not listed for visitors at all");
  assert.ok(section(await owner(f), "favorite_games").items.every(item => item.private === true), "the owner still designs with it, marked private");
});

test("a GamID that is not public: visitors get nothing; its owner gets every section marked private", async () => {
  const f = await fixture();
  await profile(f, EB, "about_location = 'Cairo', show_about_location = true, favorite_games = '{valorant}', show_my_games = true");
  assert.deepEqual(await visitor(f, "bravo"), []);
  assert.deepEqual(await visitor(f, "nobody"), []);
  const mine = await owner(f, B);
  assert.ok(mine.every(row => row.items.every(item => item.private === true)), JSON.stringify(mine));
  assert.deepEqual(mine.map(row => row.key), ["about_me", "favorite_games"]);
});

test("discovery: a new catalog row is listed only once its projection branch exists; an inactive or non-importable row never is; nothing leaks across owners", async () => {
  const f = await fixture();
  await f.db.query("insert into public.public_section_catalog (section_key, label, section_kind, sort_order, visibility_switch, wall_importable, wall_presentation, wall_icon, wall_single, wall_all) values ('future_section', 'Future', 'PROFILE', 50, false, true, 'chips', 'future', false, true)");
  assert.ok(!(await owner(f)).some(row => row.key === "future_section"), "no branch -> nothing exposed");
  await f.db.query("update public.public_section_catalog set active = false where section_key = 'about_me'");
  assert.ok(!(await owner(f)).some(row => row.key === "about_me"));
  assert.ok(!(await visitor(f)).some(row => row.key === "about_me"));
  await f.db.query("update public.public_section_catalog set active = true, wall_importable = false where section_key = 'about_me'");
  assert.ok(!(await owner(f)).some(row => row.key === "about_me"));
  await profile(f, EB, "favorite_games = '{elden_ring}'");
  await profile(f, EA, "favorite_games = '{valorant}'");
  assert.deepEqual(section(await owner(f, A), "favorite_games").items.map(item => item.id), ["valorant"], "the owner read is always the caller's own GamID");
});

test("grants: anonymous callers may read the public projection only; the owner projection needs a signed-in owner; internals are not callable", async () => {
  const f = await fixture();
  await assert.rejects(f.call(null, "select public.get_my_gamer_data()"), /permission denied/);
  for (const fn of ["private.gamer_data_items('about_me', 'alpha', true)", "private.gamer_data_projection('alpha', true)", "private.get_my_gamer_data_impl()"]) {
    await assert.rejects(f.call(null, `select ${fn}`), /permission denied/, fn);
    await assert.rejects(f.call(A, `select ${fn === "private.get_my_gamer_data_impl()" ? "private.gamer_data_items('about_me', 'bravo', false)" : fn}`), /permission denied/, fn);
  }
  await assert.rejects(f.call("33333333-3333-4333-8333-333333333333", "select public.get_my_gamer_data()"), /IDENTITY_NOT_FOUND/);
  assert.ok(Array.isArray(await visitor(f)));
});
