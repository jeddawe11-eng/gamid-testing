// Classic Profile visual review (DEC-0005, Mazen 2026-10-10): the full Member Since date (20261010180000_member_since_date, in an isolated PGlite Postgres on top
// of the real About Me migrations), the interactive games counter, the desktop MY CREW card, the game-tile artwork fallback, the Discord / Instagram marks and the
// About Me checkbox fix. The live / browser evidence is in scripts/public-desktop-browser.mjs and scripts/profile-editor-browser.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { formatMemberSince } from "../dist/account/about-editor.js";
import { createDesktopProfile, crewSection } from "../dist/public/public-desktop.js";
import { gameTile, buildGameRow } from "../dist/public/public-games.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/20261010180000_member_since_date.sql");
const aboutMigration = read("supabase/migrations/20261010160000_profile_about_me.sql");
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
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, visibility text, avatar_media_reference text, created_at timestamptz not null default now());
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.profiles (profile_id uuid primary key default gen_random_uuid(), entity_id uuid unique, updated_at timestamptz);
    insert into public.entities values ('${EA}', 'SOLO', 'alpha', 'PUBLIC', null, '2024-03-05T10:00:00Z'), ('${EB}', 'SOLO', 'bravo', 'PUBLIC', null, '2026-01-01T00:30:00Z');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    insert into public.profiles (entity_id) values ('${EA}'), ('${EB}');
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, metadata jsonb, created_at timestamptz not null default now());
    alter table storage.objects enable row level security; grant select on storage.objects to anon, authenticated;
    create table private.usage_uploads (bucket text, path text, owner_id uuid, state text);
    create function private.usage_object_owned(b text, p text, u uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from private.usage_uploads x where x.bucket = b and x.path = p and x.owner_id = u and x.state = 'COMPLETE') $$;
    grant execute on function private.usage_object_owned(text, text, uuid) to authenticated;
    create function private.intro_media_is_public(p text) returns boolean language sql stable as $$ select false $$;
    create function private.wall_object_is_published(b text, p text) returns boolean language sql stable as $$ select false $$;`);
  for (const f of ["20261010120000_profile_banner.sql", "20261010130000_profile_banner_read_containment.sql", "20261010140000_visitor_storage_signing.sql", "20261010160000_profile_about_me.sql", "20261010180000_member_since_date.sql"]) await db.exec(read(`supabase/migrations/${f}`));
  const call = async (uid, sql, params = []) => { await db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';"); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); } };
  const set = (uid, v) => call(uid, "select * from public.set_my_about($1, $2, $3, $4, $5, $6)", [v.location ?? null, v.languages ?? [], v.genres ?? [], v.showLocation ?? false, v.showLanguages ?? false, v.showGenres ?? false]);
  const extras = async handle => (await call(null, "select * from public.get_public_profile_extras($1)", [handle]))[0] ?? null;
  return { db, call, set, extras };
}

// ---------------------------------------------------------------------------------------------------------------- Member Since: the full registration date
test("migration: only the return shape changes - set_my_about's body, the extras' privacy rules and every grant are the accepted ones", () => {
  const body = sql => { const from = sql.indexOf("create function private.set_my_about_impl"); const begin = sql.indexOf("declare", from); return sql.slice(begin, sql.indexOf("$$;", begin)); };
  assert.equal(body(migration), body(aboutMigration), "set_my_about_impl: the same validation and write, word for word");
  const rules = sql => { const from = sql.indexOf("create function private.get_public_profile_extras_impl"); return sql.slice(sql.indexOf("private.public_banner_object", from), sql.indexOf("from public.entities e", from)); };
  assert.equal(rules(migration).replace(/,\s*to_char\(e\.created_at at time zone 'UTC', 'YYYY-MM-DD'\)\s*$/, "").trim(), rules(aboutMigration).trim(), "the public values are the same switched-on values");
  assert.match(migration, /where e\.gamid_handle = private\.normalize_handle\(candidate_handle\) and e\.entity_type = 'SOLO' and e\.visibility = 'PUBLIC';/);
  assert.equal((migration.match(/to_char\(e\.created_at at time zone 'UTC', 'YYYY-MM-DD'\)/g) || []).length, 2, "a plain UTC calendar date: no time, no time zone");
  assert.doesNotMatch(migration.replace(/--.*$/gm, ""), /\binsert\b|\bupdate public\.entities\b|alter table|create policy|storage\.objects|get_public_identity\b/i, "no new write path, no table or Storage change");
});

test("owner and visitor readers return the date (UTC, independent of the session time zone); privacy and grants are unchanged", async () => {
  const f = await fixture();
  assert.equal((await f.call(A, "select * from public.get_my_about()"))[0].member_since_date, "2024-03-05");
  assert.equal((await f.set(A, { location: "Riyadh" }))[0].member_since_date, "2024-03-05", "Save Changes returns it too");
  assert.deepEqual(await f.extras("alpha"), { member_since_year: 2024, has_banner: false, about_location: null, about_languages: [], about_genres: [], member_since_date: "2024-03-05" }, "nothing private is sent");
  for (const zone of ["Pacific/Honolulu", "Asia/Riyadh", "Pacific/Kiritimati"]) {
    await f.db.exec(`set timezone = '${zone}'`);
    const row = await f.extras("BRAVO");
    assert.deepEqual([row.member_since_year, row.member_since_date], [2026, "2026-01-01"], zone);
  }
  for (const visibility of ["PRIVATE", "DRAFT"]) { await f.db.exec(`update public.entities set visibility = '${visibility}' where entity_id = '${EA}'`); assert.equal(await f.extras("alpha"), null, visibility); }
  await assert.rejects(f.call(null, "select * from public.get_my_about()"), /permission denied/);
  await assert.rejects(f.call(null, "select * from public.set_my_about(null, '{}', '{}', false, false, false)"), /permission denied/);
  await assert.rejects(f.set(B, { location: "x".repeat(61) }), /INVALID_ABOUT_LOCATION/, "the server rules still apply");
});

test("formatMemberSince: day, full English month name and year - no Date object, no time zone, nothing invented", () => {
  assert.equal(formatMemberSince("2026-10-10"), "10 October 2026");
  assert.equal(formatMemberSince("2024-03-05"), "5 March 2024");
  assert.equal(formatMemberSince("2024-02-29"), "29 February 2024");
  for (const bad of ["2023-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "2026-10-10T00:00:00Z", "", null, undefined, 2026]) assert.equal(formatMemberSince(bad), "", String(bad));
  const source = read("dist/account/about-editor.js");
  const fn = source.slice(source.indexOf("export function formatMemberSince"), source.indexOf("// the same rules the server applies"));
  assert.doesNotMatch(fn, /new Date|Intl|toLocale|getTimezoneOffset/);
});

// ---------------------------------------------------------------------------------------------------------------- a small fake DOM
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.hidden = false; this.className = ""; this._text = ""; this.id = ""; this.href = ""; this.focused = 0; this.scrolled = null; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this.children = []; this._text = String(value); }
  get classList() { const self = this; return { add: n => { self.className = `${self.className} ${n}`.trim(); }, remove: n => { self.className = self.className.split(/\s+/).filter(c => c !== n).join(" "); }, contains: n => self.className.split(/\s+/).includes(n) }; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return name in this.attrs; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatch(type) { let prevented = false; for (const handler of this.listeners[type] || []) handler({ type, target: this, preventDefault() { prevented = true; } }); return prevented; }
  get childElementCount() { return this.children.length; }
  focus() { this.focused++; }
  scrollIntoView(options) { this.scrolled = options; }
  all(predicate, out = []) { for (const child of this.children) { if (predicate(child)) out.push(child); child.all(predicate, out); } return out; }
  byClass(name) { return this.all(node => node.className.split(/\s+/).includes(name)); }
  first(name) { return this.byClass(name)[0] || null; }
}
const games = new El("section"); games.id = "publicGames";
const doc = { createElement: tag => new El(tag), getElementById: id => (id === "publicGames" ? games : null) };
const element = (tag, className, text) => { const node = new El(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const PROFILE = { displayName: "Gamer", handle: "@gamer", primaryRole: "Duelist", secondaryRoles: [], education: "", bio: "", avatarUrl: "" };

test("desktop About Me shows the full date (the year only when an older server sends no date)", () => {
  const facts = view => view.about.byClass("desk-fact").map(row => `${row.children[0].textContent}=${row.children[1].textContent}`);
  assert.deepEqual(facts(createDesktopProfile({ doc, profile: PROFILE, extras: { member_since_year: 2026, member_since_date: "2026-10-10", about_languages: [], about_genres: [] } })), ["Member Since=10 October 2026"]);
  assert.deepEqual(facts(createDesktopProfile({ doc, profile: PROFILE, extras: { member_since_year: 2026, about_languages: [], about_genres: [] } })), ["Member Since=2026"]);
});

test("games counter: the same stat, now one link to My Games - smooth scroll (instant with reduced motion), focus moves to the section, a clear name", () => {
  const view = createDesktopProfile({ doc, profile: PROFILE, extras: null, gamesCount: 82 });
  const stat = view.hero.first("desk-stat");
  assert.equal(stat.tag, "a", "a real link: Tab reaches it, Enter follows it, without script it still jumps to #publicGames");
  assert.equal(stat.href, "#publicGames");
  assert.equal(stat.getAttribute("aria-label"), "82 games - go to My Games");
  assert.deepEqual([stat.first("desk-stat-value").textContent, stat.first("desk-stat-label").textContent], ["82", "Games"]);
  assert.equal(stat.dispatch("click"), true);
  assert.deepEqual(games.scrolled, { behavior: "smooth", block: "start" });
  assert.equal(games.getAttribute("tabindex"), "-1");
  assert.equal(games.focused, 1);
  assert.equal(createDesktopProfile({ doc, profile: PROFILE, extras: null, gamesCount: 1 }).hero.first("desk-stat").getAttribute("aria-label"), "1 game - go to My Games");
  assert.equal(createDesktopProfile({ doc, profile: PROFILE, extras: null, gamesCount: 0 }).hero.first("desk-stat"), null, "no count without public games");
  const css = read("dist/public/public.css");
  assert.match(css, /\.desk-stat:focus-visible\{outline:2px solid var\(--cyan\)/, "visible keyboard focus");
  assert.match(css, /\.desk-stat\{color:inherit;text-decoration:none/, "it looks exactly like the stat it was");
  assert.match(read("dist/public/public-desktop.js"), /prefers-reduced-motion: reduce/);
});

// ---------------------------------------------------------------------------------------------------------------- MY CREW (desktop sidebar)
const CREW = (id, name, extra = {}) => ({ crew_id: id, crew_name: name, game_key: "league-of-legends", game_name: "League of Legends", role: "MEMBER", member_count: 4, ...extra });
const LOL = "11111111-2222-4333-8444-555555555555", VAL = "99999999-2222-4333-8444-555555555555";

test("MY CREW: every crew the server lists (its own order, no invented primary Crew), each one link to that existing Crew Wall, desktop only", () => {
  const block = crewSection([CREW(LOL, "Night Owls"), CREW(VAL, "Spike Rushers", { game_name: "VALORANT", role: "OWNER", member_count: 1 })], { ownerHandle: "gamer", pathname: "/@gamer", doc });
  assert.equal(block.className, "public-section public-duo public-crew desk-only");
  assert.equal(block.children[0].textContent, "MY CREW");
  const cards = block.byClass("public-crew-card");
  assert.deepEqual(cards.map(card => card.href), [`/crew/?c=${LOL}&from=gamer`, `/crew/?c=${VAL}&from=gamer`]);
  assert.deepEqual(cards.map(card => card.getAttribute("aria-label")), ["My Crew: Night Owls, League of Legends · 4 members. Open the Crew Wall", "My Crew: Spike Rushers, VALORANT · 1 member. Open the Crew Wall"]);
  assert.deepEqual(cards.map(card => card.first("public-crew-avatar").textContent), ["N", "S"], "no Crew image exists in the public section: the initial");
  assert.ok(cards.every(card => card.first("public-duo-names") && card.first("public-duo-chevron")), "the My Duo card's structure (same look, long names wrap)");
  assert.equal(crewSection([CREW(LOL, "Night Owls")], { ownerHandle: "gamer", pathname: "/public/index.html", doc }).first("public-crew-card").href, `/crew/?c=${LOL}&from=gamer`, "the temporary route too");
});

test("MY CREW: nothing at all without a valid crew - malformed rows are never drawn", () => {
  for (const section of [undefined, null, [], [CREW("not-a-uuid", "X")], [CREW(LOL, "")], [CREW(LOL, "<b>x</b>")], [CREW(LOL, "Owls", { role: "INVITED" })]]) assert.equal(crewSection(section, { ownerHandle: "gamer", doc }), null, JSON.stringify(section));
});

test("MY CREW sits beneath My Duo inside the sections panel; a panel with only My Crew shows on the desktop profile only", () => {
  const page = read("dist/public/public.js");
  const sections = page.slice(page.indexOf("export function renderPublicSections"), page.indexOf("async function buildConfig"));
  assert.ok(sections.indexOf("if (duo) blocks.push(duo);") < sections.indexOf("if (crew) blocks.push(crew);"));
  assert.ok(sections.indexOf("if (crew) blocks.push(crew);") < sections.indexOf("const discord = sections?.discord;"));
  assert.match(sections, /return blocks\.length - \(crew \? 1 : 0\);/, "it is not counted as a section the mobile panel shows");
  assert.match(page, /if \(!hasSections && hasDeskSide\) sectionsPanel\.hidden = !desktopActive\(\) \|\| event\.data\.state !== "profile";/);
  assert.match(page, /if \(!hasSections && hasDeskSide\) sectionsPanel\.hidden = !desktopActive\(\);/, "and again when the width crosses the breakpoint");
  assert.match(page, /classList\.toggle\("desk-has-side", hasSections \|\| hasDeskSide\)/);
});

// ---------------------------------------------------------------------------------------------------------------- game tiles, socials, checkboxes
test("game tiles: the title's initials in a tone chosen from the title - never an image; decoration only, no text added to the row", () => {
  const tile = gameTile(element, "League of Legends");
  assert.deepEqual([tile.className, tile.getAttribute("data-initials"), tile.getAttribute("aria-hidden"), tile.textContent], ["game-thumb", "LL", "true", ""]);
  assert.equal(gameTile(element, "The Witcher 3: Wild Hunt").getAttribute("data-initials"), "W3");
  assert.equal(gameTile(element, "Cyberpunk 2077").getAttribute("data-initials"), "C2");
  assert.equal(gameTile(element, "").getAttribute("data-initials"), "?");
  assert.equal(gameTile(element, "Marvel Rivals").getAttribute("data-tone"), gameTile(element, "Marvel Rivals").getAttribute("data-tone"), "deterministic");
  assert.ok(/^[0-5]$/.test(gameTile(element, "Marvel Rivals").getAttribute("data-tone")));
  const row = buildGameRow({ element, game: { name: "Cyberpunk 2077", year: 2020, sources: [] }, onOpen() {} });
  assert.deepEqual(row.first("pg-row").children.map(child => child.className), ["game-thumb", "pg-copy", "pg-chevron"], "thumbnail, title / year / source, chevron (Game Details is a real destination)");
  const css = read("dist/public/public.css");
  assert.match(css, /\.game-thumb\{width:56px;aspect-ratio:1/);
  assert.match(css, /\.public-game-tile\{width:50px;aspect-ratio:1/);
  assert.match(css, /\.game-thumb,\.public-game-tile\{display:none;/, "hidden unless the desktop Classic Profile shows it");
  assert.match(css, /html\.is-public-desktop \.public-games \.game-thumb\{display:grid\}/);
  assert.doesNotMatch(read("dist/public/public-games.js") + read("dist/public/public.js"), /steamcdn|steamstatic|ddragon|igdb|rawg|<img[^>]*game/i, "no artwork source is fetched");
});

test("My Socials: recognizable Discord and Instagram marks on the desktop profile only - static, local, the link keeps its accessible name", () => {
  const css = read("dist/public/public.css");
  const marks = css.slice(css.indexOf("/* My Socials marks"), css.indexOf("}\n.desk-hero{"));
  assert.match(marks, /html\.is-public-desktop \.social-icon\[data-platform=discord\]\{--social-mark:url\("data:image\/svg\+xml,/);
  assert.match(marks, /html\.is-public-desktop \.social-icon\[data-platform=instagram\]\{--social-mark:url\("data:image\/svg\+xml,/);
  assert.match(marks, /simple-icons "discord" path \(CC0\)/, "the source and license are recorded");
  assert.doesNotMatch(marks, /animation|keyframes|transition|filter|box-shadow|https?:\/\/(?!www\.w3\.org)/, "static: no animation or glow, nothing remote");
  assert.match(read("dist/account/socials.js"), /\["discord", \["profile", "invite"\], "DC",/, "the mobile badge keeps its accepted text mark");
});

test("About Me checkboxes: one compact native box (the global input rule no longer stretches it); long labels wrap beside it", () => {
  const css = read("dist/account/account.css");
  assert.match(css, /\.about-chip input\[type=checkbox\]\{flex:0 0 auto;display:inline-block;width:1rem;height:1rem;min-height:0;margin:0;padding:0;/);
  assert.match(css, /\.about-chip span\{min-width:0;overflow-wrap:anywhere\}/);
  const editor = read("dist/account/about-editor.js");
  assert.match(editor, /if \(box\.checked && next\.size < max\) next\.add/, "still at most 5");
  assert.match(editor, /if \(focused !== null\) \[\.\.\.group\.querySelectorAll\("input"\)\]\.find\(box => box\.value === focused\)\?\.focus\(\);/, "keyboard focus stays on the chip that was toggled (the chips are rebuilt)");
});
