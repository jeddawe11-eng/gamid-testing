// Gaming Roles in eight categories + Suggest a Role (admin review), four Favorite Games, the two-column Classic Profile, the Crew header game logo (Mazen
// 2026-10-11). The migration runs in an isolated PGlite Postgres with minimal stand-ins for the accepted tables it builds on.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { handleGameArtwork, crewFrom } from "../supabase/functions/_shared/game-artwork.js";
import { favoriteGamesSection, FAVORITE_GAMES_SHOWN } from "../dist/public/public-desktop.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/20261011200000_roles_favorites_crews.sql");

const APPROVED = {
  gaming_competitive: ["Gamer", "Casual Gamer", "Competitive Gamer", "Esports Player", "Pro Player", "Team Captain", "Gaming Coach", "Esports Analyst"],
  streaming_content: ["Streamer", "VTuber", "Gaming Content Creator", "Gaming YouTuber", "Gaming TikToker", "Gaming Influencer", "Gaming Podcaster", "Gaming Journalist", "Game Reviewer"],
  game_development: ["Game Developer", "Game Programmer", "Gameplay Programmer", "Game Designer", "Level Designer", "Narrative Designer", "Technical Artist", "Game Producer", "QA Game Tester"],
  art_design_animation: ["Game Artist", "Concept Artist", "Character Designer", "Environment Artist", "3D Artist", "2D Artist", "Animator", "UI/UX Game Designer", "VFX Artist"],
  audio_video_production: ["Gaming Video Editor", "Gaming Photographer", "Gaming Videographer", "Motion Designer", "Sound Designer", "Game Music Composer", "Voice Actor", "Broadcast Producer", "Stream Technician"],
  esports_team_management: ["Esports Team Manager", "Esports Coach", "Esports Scout", "Esports Organization Owner", "Tournament Organizer", "Tournament Admin", "Esports Referee", "Esports Caster", "Esports Host", "Esports Observer"],
  community_marketing: ["Gaming Community Manager", "Discord Community Manager", "Gaming Moderator", "Gaming Social Media Manager", "Gaming Marketing Specialist", "Gaming Brand Manager", "Esports Partnerships Manager", "Gaming PR Specialist"],
  business_technology: ["Game Studio Founder", "Gaming Entrepreneur", "Gaming Project Manager", "Gaming Product Manager", "Gaming Platform Developer", "Game Server Administrator", "Gaming Data Analyst", "Anti-Cheat Developer", "Gaming Hardware Reviewer"],
};
const ORIGINAL_KEYS = ["gamer", "streamer", "content_creator", "esports_player", "coach", "designer", "developer", "tournament_organizer", "team_manager", "community_manager", "video_editor", "photographer"];
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", ADM = "33333333-3333-4333-8333-333333333333";
const EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", EADM = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    grant usage on schema public, private, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, visibility text);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.profiles (profile_id uuid primary key default gen_random_uuid(), entity_id uuid unique, updated_at timestamptz, favorite_games text[] not null default '{}'
      constraint profiles_favorite_games_check check (cardinality(favorite_games) <= 3));
    insert into public.entities values ('${EA}', 'SOLO', 'alpha', 'PUBLIC'), ('${EB}', 'SOLO', 'bravo', 'PUBLIC'), ('${EADM}', 'SOLO', 'black', 'PUBLIC');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER'), ('${EADM}', '${ADM}', 'OWNER');
    insert into public.profiles (entity_id) values ('${EA}'), ('${EB}'), ('${EADM}');
    create function private.banner_owner() returns table (owner_uid uuid, owner_entity_id uuid, owner_profile_id uuid) language sql stable security definer set search_path = '' as $$
      select m.user_id, e.entity_id, p.profile_id from public.entity_memberships m join public.entities e on e.entity_id = m.entity_id join public.profiles p on p.entity_id = e.entity_id where m.user_id = auth.uid() $$;
    grant execute on function private.banner_owner() to authenticated;
    create table public.gaming_role_catalog (role_key text primary key check (role_key ~ '^[a-z][a-z0-9_]*$'), label text not null unique check (char_length(label) between 1 and 40),
      sort_order smallint not null unique check (sort_order > 0), active boolean not null default true);
    insert into public.gaming_role_catalog (role_key, label, sort_order) values
      ('gamer', 'Gamer', 10), ('streamer', 'Streamer', 20), ('content_creator', 'Content Creator', 30), ('esports_player', 'Esports Player', 40), ('coach', 'Coach', 50), ('designer', 'Designer', 60),
      ('developer', 'Developer', 70), ('tournament_organizer', 'Tournament Organizer', 80), ('team_manager', 'Team Manager', 90), ('community_manager', 'Community Manager', 100),
      ('video_editor', 'Video Editor', 110), ('photographer', 'Photographer', 120);
    create table public.profile_gaming_roles (profile_id uuid, role_key text references public.gaming_role_catalog(role_key) on delete restrict, is_primary boolean);
    insert into public.profile_gaming_roles select p.profile_id, 'coach', true from public.profiles p where p.entity_id = '${EA}';
    create table public.notification_types (type_key text primary key, producer text, destination text, active boolean default true);
    create table public.sent (recipient uuid, actor uuid, type_key text, context jsonb);
    create function private.notify(r uuid, a uuid, t text, s uuid, c jsonb) returns bigint language sql volatile security definer set search_path = '' as $$ insert into public.sent values (r, a, t, c) returning 1::bigint $$;
    create function private.library_game_keys(e uuid) returns setof text language sql stable as $$ select unnest(array['g1','g2','g3','g4','g5']) $$;
    create function private.set_my_favorite_games_impl(candidate_keys text[]) returns text[] language sql as $$ select candidate_keys $$;
    create function public.set_my_favorite_games(candidate_keys text[]) returns text[] language sql volatile security invoker set search_path = '' as $$ select private.set_my_favorite_games_impl(candidate_keys); $$;
    create table private.game_artwork_settings (singleton boolean primary key default true, enabled boolean not null default true); insert into private.game_artwork_settings default values;
    create table public.game_catalog (game_key text primary key, display_name text, release_year integer, is_active boolean default true); insert into public.game_catalog values ('valorant', 'Valorant', 2020, true);
    create table public.game_catalog_provider_ids (provider text, external_id text, game_key text);
    create table public.crews (crew_id uuid primary key, game_key text); create table public.crew_walls (crew_id uuid primary key, published boolean);
    insert into public.crews values ('${EA}', 'valorant'), ('${EB}', 'valorant'); insert into public.crew_walls values ('${EA}', true), ('${EB}', false);`);
  await db.exec(migration);
  const call = async (uid, sql, params = []) => { await db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';"); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); } };
  return { db, call };
}
const code = e => e?.message ?? String(e);

test("catalog: eight categories with exactly the approved names (71 - the list as approved), the 12 original keys kept, selections untouched, nothing duplicated", async () => {
  const f = await fixture();
  const cats = (await f.call(null, "select public.get_gaming_role_categories() v"))[0].v;
  assert.deepEqual(cats.map(c => c.key), Object.keys(APPROVED));
  for (const c of cats) assert.deepEqual(c.roles.map(r => r.label), APPROVED[c.key], c.key);
  const all = cats.flatMap(c => c.roles);
  assert.equal(all.length, 71);
  assert.equal(new Set(all.map(r => r.key)).size, 71, "unique keys");
  assert.equal(new Set(all.map(r => r.label.toLowerCase())).size, 71, "unique names");
  for (const key of ORIGINAL_KEYS) assert.ok(all.some(r => r.key === key), key);
  assert.equal(all.find(r => r.key === "coach").label, "Gaming Coach");
  assert.deepEqual((await f.db.query("select role_key from public.profile_gaming_roles")).rows.map(r => r.role_key), ["coach"], "an existing selection survives");
});

test("Suggest a Role: authenticated owners only; whitespace normalized; catalog duplicates (exact or near) and repeats refused; 5 a day; admins notified", async () => {
  const f = await fixture();
  await assert.rejects(f.call(null, "select public.suggest_gaming_role('Speedrunner')"), /permission denied/);
  const r = (await f.call(A, "select public.suggest_gaming_role('  Speed   runner ') v"))[0].v;
  assert.equal(r.status, "PENDING");
  assert.deepEqual((await f.db.query("select proposed_name, status, user_id from public.gaming_role_suggestions")).rows, [{ proposed_name: "Speed runner", status: "PENDING", user_id: A }]);
  assert.deepEqual((await f.db.query("select recipient, type_key from public.sent")).rows, [{ recipient: EADM, type_key: "role.suggestion_submitted" }], "the administrator is notified");
  for (const dup of ["Gaming Coach", "gaming coach", "Coaches", "Esports Caster"]) await assert.rejects(f.call(A, "select public.suggest_gaming_role($1)", [dup]), e => code(e) === "ROLE_ALREADY_EXISTS", dup);
  await assert.rejects(f.call(A, "select public.suggest_gaming_role('Speed Runner')"), e => code(e) === "ROLE_SUGGESTION_DUPLICATE");
  for (const bad of ["ab", "x".repeat(41), "https://spam.example", "<b>Hacker</b>", "12345"]) await assert.rejects(f.call(A, "select public.suggest_gaming_role($1)", [bad]), e => code(e) === "INVALID_ROLE_NAME", bad);
  for (const name of ["Cosplayer", "Modder", "Lore Keeper", "Map Maker"]) await f.call(A, "select public.suggest_gaming_role($1)", [name]);
  await assert.rejects(f.call(A, "select public.suggest_gaming_role('Lore Master')"), e => code(e) === "ROLE_SUGGESTION_RATE_LIMIT");
  assert.equal((await f.call(A, "select public.get_my_role_suggestions() v"))[0].v.length, 5);
  assert.deepEqual((await f.call(B, "select public.get_my_role_suggestions() v"))[0].v, [], "nobody sees another user's suggestions");
});

test("review: administrators only (server-side); approve adds it to the chosen category once (stable key) and resolves same-name suggestions; reject closes it", async () => {
  const f = await fixture();
  await f.call(A, "select public.suggest_gaming_role('Speedrunner')");
  await f.call(B, "select public.suggest_gaming_role('Speedrunners')");
  for (const uid of [A, B]) {
    assert.equal((await f.call(uid, "select public.get_my_admin_status() v"))[0].v, false);
    await assert.rejects(f.call(uid, "select public.list_role_suggestions('PENDING')"), e => code(e) === "ADMIN_ONLY");
    const [{ suggestion_id }] = (await f.db.query("select suggestion_id from public.gaming_role_suggestions limit 1")).rows;
    await assert.rejects(f.call(uid, "select public.review_role_suggestion($1, 'APPROVE', 'gaming_competitive', null)", [suggestion_id]), e => code(e) === "ADMIN_ONLY");
  }
  await assert.rejects(f.call(A, "insert into public.gaming_role_suggestions (user_id, entity_id, proposed_name, normalized_name) values ($1, $2, 'X role', 'x')", [A, EA]), /permission denied/, "no direct table access");
  await assert.rejects(f.call(A, "update public.gaming_role_catalog set label = 'Hacked' where role_key = 'gamer'"), /permission denied/);
  assert.equal((await f.call(ADM, "select public.get_my_admin_status() v"))[0].v, true, "the seeded TESTING administrator (@black's account)");
  const pending = (await f.call(ADM, "select public.list_role_suggestions('PENDING') v"))[0].v;
  assert.deepEqual(pending.map(p => [p.proposed_name, p.submitter_handle, p.same_name_pending]), [["Speedrunner", "alpha", 2], ["Speedrunners", "bravo", 2]]);
  await assert.rejects(f.call(ADM, "select public.review_role_suggestion($1, 'APPROVE', 'nope', null)", [pending[0].suggestion_id]), e => code(e) === "INVALID_ROLE_CATEGORY");
  await assert.rejects(f.call(ADM, "select public.review_role_suggestion($1, 'APPROVE', 'gaming_competitive', 'Gamer')", [pending[0].suggestion_id]), e => code(e) === "ROLE_ALREADY_EXISTS");
  const done = (await f.call(ADM, "select public.review_role_suggestion($1, 'APPROVE', 'gaming_competitive', 'Speedrunner') v", [pending[0].suggestion_id]))[0].v;
  assert.deepEqual(done, { status: "APPROVED", role_key: "speedrunner", label: "Speedrunner" });
  const comp = (await f.call(null, "select public.get_gaming_role_categories() v"))[0].v.find(c => c.key === "gaming_competitive");
  assert.equal(comp.roles.at(-1).label, "Speedrunner", "selectable from the catalog at once");
  assert.deepEqual((await f.db.query("select status from public.gaming_role_suggestions order by created_at")).rows.map(r => r.status), ["APPROVED", "APPROVED"], "the same-name suggestion is resolved too");
  assert.equal((await f.db.query("select count(*)::int n from public.sent where type_key = 'role.suggestion_approved'")).rows[0].n, 2);
  await assert.rejects(f.call(ADM, "select public.review_role_suggestion($1, 'REJECT', null, null)", [pending[0].suggestion_id]), e => code(e) === "ROLE_SUGGESTION_ALREADY_REVIEWED");
  await f.call(A, "select public.suggest_gaming_role('Cosplayer')");
  const [{ suggestion_id: cos }] = (await f.db.query("select suggestion_id from public.gaming_role_suggestions where proposed_name = 'Cosplayer'")).rows;
  assert.equal((await f.call(ADM, "select public.review_role_suggestion($1, 'REJECT', null, null) v", [cos]))[0].v.status, "REJECTED");
  assert.equal((await f.db.query("select count(*)::int n from public.gaming_role_catalog where label = 'Cosplayer'")).rows[0].n, 0, "a rejected or pending suggestion is never in the catalog");
});

test("Favorite Games: four allowed, a fifth refused by the server; the constraint is 4", async () => {
  const f = await fixture();
  assert.deepEqual((await f.call(A, "select public.set_my_favorite_games(array['g1','g2','g3','g4']) v"))[0].v, ["g1", "g2", "g3", "g4"]);
  await assert.rejects(f.call(A, "select public.set_my_favorite_games(array['g1','g2','g3','g4','g5'])"), e => code(e) === "FAVORITE_GAMES_LIMIT");
  await assert.rejects(f.db.query("update public.profiles set favorite_games = array['a','b','c','d','e']"), /profiles_favorite_games_check/);
  const account = read("dist/account/account.js");
  assert.match(account, /const FAVORITE_GAMES_MAX = 4;/);
  assert.match(account, /"Maximum 4 favorite games\. Remove one to add another\."/);
});

test("Crew header artwork: only a Crew whose Crew Wall is published; the function route takes a Crew id", async () => {
  const f = await fixture();
  await f.db.exec("grant execute on function public.game_artwork_crew_targets(uuid) to anon");   // (service role in production; the shape is what is tested)
  assert.equal((await f.call(null, `select public.game_artwork_crew_targets('${EA}') v`))[0].v.games[0].game_key, "valorant");
  assert.deepEqual((await f.call(null, `select public.game_artwork_crew_targets('${EB}') v`))[0].v.games, [], "an unpublished Crew Wall: nothing");
  assert.equal(crewFrom(`https://x.supabase.co/functions/v1/game-artwork/crew/${EA}`), EA);
  assert.equal(crewFrom("https://x.supabase.co/functions/v1/game-artwork/crew/not-a-uuid"), null);
  const calls = [];
  const fetchImpl = async (url, options = {}) => { const name = new URL(url).pathname.split("/").pop(); calls.push(name); return new Response(JSON.stringify(name === "public_media_hit" ? true : name === "game_artwork_crew_targets" ? { enabled: true, games: [] } : []), { status: 200 }); };
  const response = await handleGameArtwork({ request: new Request(`https://abc.supabase.co/functions/v1/game-artwork/crew/${EA}`), env: { supabaseUrl: "https://abc.supabase.co", serviceKey: "k", providerKey: "" }, fetchImpl });
  assert.equal(response.status, 200);
  assert.ok(calls.includes("game_artwork_crew_targets") && !calls.includes("game_artwork_targets"));
  const wall = read("dist/crew/crew-wall.js"), crew = read("dist/crew/crew.js");
  assert.match(wall, /make\("span", "crew-title-logo"\)/);
  assert.match(wall, /box\.append\(logo, game, name, meta\)/);
  assert.match(crew, /artwork \|\|= fetchCrewArtwork\(SUPABASE_URL, model\.crewId\)/, "one request per page load");
});

test("Classic Profile: two independent columns (left hero / favorites / My Games; right About Me / panel / Connected Games); four favorite covers in one row", () => {
  const page = read("dist/public/public.js"), css = read("dist/public/public.css");
  assert.match(page, /deskColumns\.left\.append\(\.\.\.\[desktopView\.hero, deskFavorites, gamesBlock\]\.filter\(Boolean\)\);/);
  assert.match(page, /deskColumns\.right\.append\(\.\.\.\[desktopView\.about, sectionsPanel, deskConnected\]\.filter\(Boolean\)\);/);
  assert.match(page, /function restoreMobileOrder\(\) \{ if \(deskColumns\) replayButton\.before\(sectionsPanel, gamesBlock\); \}/, "mobile gets its accepted order back");
  assert.match(css, /html\.is-public-desktop \.public-shell\{display:grid;grid-template-columns:minmax\(0,1\.75fr\) minmax\(19rem,1fr\);grid-template-areas:"left right" "replay replay";/);
  assert.match(css, /\.desk-col\{display:none\}/, "the columns exist only on the desktop profile");
  assert.match(css, /\.desk-favorites-list\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);/);
  assert.equal(FAVORITE_GAMES_SHOWN, 4);
  const doc = { createElement: tag => ({ tag, children: [], attrs: {}, className: "", textContent: "", setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, append(...n) { this.children.push(...n); }, dataset: {} }) };
  const five = ["a", "b", "c", "d", "e"].map((k, i) => ({ game_key: k, name: `Game ${i}` }));
  assert.equal(favoriteGamesSection(five, { doc }).children[1].children.length, 4, "never more than four");
  assert.equal(favoriteGamesSection([], { doc }), null, "no favorites, no section");
});

test("Gaming Roles editor and badges: categories with counts, selected chips + Clear All, Suggest a Role; each secondary role its own badge in the profile frame", () => {
  const account = read("dist/account/account.js"), preview = read("dist/account/intro-preview.js"), css = read("dist/account/intro-preview.css");
  assert.match(account, /box\.querySelector\("\[data-role-count\]"\)\.textContent = `\$\{total\} roles\$\{picked \? ` · \$\{picked\} selected` : ""\}`;/);
  assert.match(account, /clear\.textContent = "Clear All"/);
  assert.match(account, /open\.textContent = "Can't find your role\? Suggest a Role"/);
  assert.match(account, /submit\.textContent = "Submit Suggestion"/);
  assert.match(account, /const previous = selected\.includes\(primary\.value\) \? primary\.value : selected\[0\] \|\| "";/, "a deselected Primary Role is replaced");
  assert.match(preview, /els\.previewSecondaryRoles\.replaceChildren\(/);
  assert.doesNotMatch(preview, /secondaryRoles\|\|\[\]\)\.join\(/);
  assert.match(css, /#previewSecondaryRoles\{display:contents\}/);
  assert.match(read("dist/account/profile-editor.js"), /\['#roleSuggestionsSection','role-suggestions','Role Suggestions'/);
});
