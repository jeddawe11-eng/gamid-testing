import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20260920140000_public_section_visibility.sql");
const connectionsMigration = await read("../supabase/migrations/20260919130000_gaming_connections_foundation.sql");
const leagueMigration = await read("../supabase/migrations/20260920100000_league_profile_prototype.sql");
const controller = (await read("../dist/account/account.js")).replace(/\r\n/g, "\n");
const client = await read("../dist/account/supabase-client.js");
const accountHtml = await read("../dist/account/index.html");
const accountCss = (await read("../dist/account/account.css")).replace(/\r\n/g, "\n");
const publicJs = await read("../dist/public/public.js");
const publicHtml = await read("../dist/public/index.html");
const publicCss = await read("../dist/public/public.css");
const introPreview = await read("../dist/account/intro-preview.js");
const introHtml = await read("../dist/account/intro-preview.html");

const sql = text => text.replace(/--.*$/gm, "");
const code = sql(migration);
const publicFn = code.slice(code.indexOf("create function private.get_public_identity_impl"), code.indexOf("create function public.get_public_identity("));
const setFn = code.slice(code.indexOf("create function private.set_my_section_visibility_impl"), code.indexOf("create function public.get_my_section_visibility"));
const discordPart = publicFn.slice(publicFn.indexOf("select 'discord'::text"), publicFn.indexOf("union all"));
const leaguePart = publicFn.slice(publicFn.indexOf("select 'league'::text"), publicFn.indexOf(") x"));
// the payload (jsonb_build_object) of each section, separate from the WHERE gate that follows it
const payloadOf = part => part.slice(0, part.indexOf("from public."));
const keysOf = part => [...part.matchAll(/'([a-z_]+)',\s*[a-z]\./g)].map(match => match[1]).sort();

// ------------------------------------------------------------------------------------------------ the two levels of visibility

test("the whole-GamID Publish gate is unchanged and still gates everything: sections are only ever read inside the PUBLIC-only query", () => {
  assert.match(publicFn, /and e\.visibility = 'PUBLIC'/);
  assert.match(publicFn, /e\.entity_type = 'SOLO'/);
  assert.ok(publicFn.indexOf("public_sections jsonb") < publicFn.indexOf("language sql stable security definer"), "the new column is part of the one existing function");
  assert.doesNotMatch(code, /set_my_identity_visibility|update public\.entities/i, "Publish / Unpublish is not touched by this migration");
});

test("there is one public boundary, not a second one: the QR route delegates to the same implementation", () => {
  const qr = code.slice(code.indexOf("create function private.get_public_identity_by_qr_impl"), code.indexOf("create function public.get_public_identity_by_qr("));
  assert.match(qr, /select \* from private\.get_public_identity_impl\(/);
  assert.equal([...code.matchAll(/create function (?:private|public)\.get_public_identity[a-z_]*\(/g)].length, 4);
  assert.equal([...code.matchAll(/public_sections jsonb/g)].length, 4, "handle and QR, impl and wrapper, all return the same shape");
});

// ------------------------------------------------------------------------------------------------ hidden means absent (server side)

test("hidden sections are omitted from the response entirely: each is read only WHERE its own switch is ON", () => {
  assert.match(publicFn, /from public\.gaming_connections g\s+where g\.entity_id = e\.entity_id and g\.provider_key = 'discord' and g\.is_public/);
  assert.match(publicFn, /from public\.league_profiles l\s+where l\.entity_id = e\.entity_id and l\.is_public/);
  assert.match(publicFn, /coalesce\(jsonb_object_agg\(x\.section_key, x\.payload\), '\{\}'::jsonb\)/, "no section -> an empty object, never a visible=false placeholder");
  assert.doesNotMatch(publicFn, /visible\s*=\s*false|'visible'|'is_public'|'hidden'/);
});

test("Education & Work is returned only while its switch is ON; otherwise every value is NULL inside the database", () => {
  for (const column of ["education_work_status", "institution", "field_of_study"]) assert.match(publicFn, new RegExp(`case when p\\.show_education_work then p\\.${column} end`));
  assert.match(publicFn, /case when p\.show_education_work then \(select jsonb_agg\(jsonb_build_object\('key', c\.status_key/);
});

test("Discord public fields are exactly display_name, username and trust_status — no account id, avatar URL (it embeds the id), token, timestamp or diagnostic", () => {
  assert.deepEqual(keysOf(payloadOf(discordPart)), ["display_name", "trust_status", "username"]);
  assert.doesNotMatch(payloadOf(discordPart), /provider_account_id|provider_avatar_url|connection_id|connected_at|updated_at|discovery|token/);
});

test("League public fields are exactly the approved presentation fields and keep the manual / unverified truth", () => {
  assert.deepEqual(keysOf(payloadOf(leaguePart)), ["data_source", "division", "game_name", "identity_source", "losses", "lp", "platform_id", "profile_icon_id", "rank_state", "tag_line", "tier", "trust_status", "updated_at", "wins"]);
  assert.match(leaguePart, /'trust_status', l\.trust_status/);
  assert.match(leaguePart, /'identity_source', l\.identity_source/);
  assert.match(leaguePart, /'data_source', l\.data_source/);
  assert.match(leaguePart, /'updated_at', l\.fetched_at/);
  assert.doesNotMatch(payloadOf(leaguePart), /source_url|last_result|last_attempt_at|league_profile_id|entity_id|league_lookup_attempts|reservation|is_public|created_at/);
  assert.doesNotMatch(payloadOf(leaguePart), /'VERIFIED'|verified\s*[:=]\s*true/i, "nothing here can present the prototype as verified");
  assert.match(leagueMigration, /league_profiles_temporary_source_is_never_verified check \(data_source <> 'OPGG_TEMPORARY' or trust_status = 'MANUAL'\)/);
});

test("null presentation values are stripped rather than sent as empty fields", () => {
  assert.equal([...publicFn.matchAll(/jsonb_strip_nulls\(/g)].length, 2);
});

// ------------------------------------------------------------------------------------------------ defaults and the switch storage

test("every optional section starts OFF and the switch lives on the row it controls (so re-linking can never inherit an old ON)", () => {
  assert.match(connectionsMigration, /is_public boolean not null default false/);
  assert.match(leagueMigration, /is_public boolean not null default false/);
  assert.match(code, /alter table public\.profiles add column show_education_work boolean not null default false/);
  // the flows that create/refresh rows never write the switch
  const complete = connectionsMigration.slice(connectionsMigration.indexOf("create function private.complete_connection_attempt_impl"), connectionsMigration.indexOf("create function private.finish_connection_attempt_impl"));
  assert.doesNotMatch(complete, /is_public/);
  const save = leagueMigration.slice(leagueMigration.indexOf("create function private.save_league_lookup_impl"), leagueMigration.indexOf("create function private.finish_league_lookup_impl"));
  assert.doesNotMatch(save, /is_public/);
});

test("Education & Work: existing accepted public behavior is preserved by grandfathering only profiles that already hold Education/Work data", () => {
  const backfill = code.slice(code.indexOf("update public.profiles p"), code.indexOf("-- ") > 0 ? code.indexOf("create function private.get_my_section_visibility_impl") : undefined);
  assert.match(backfill, /set show_education_work = true/);
  assert.match(backfill, /where p\.education_work_status is not null\s+or nullif\(btrim\(coalesce\(p\.institution, ''\)\), ''\) is not null\s+or nullif\(btrim\(coalesce\(p\.field_of_study, ''\)\), ''\) is not null/);
  assert.doesNotMatch(backfill, /set\s+(education_work_status|institution|field_of_study)|delete\s|drop column/, "no Education/Work data is changed");
});

// ------------------------------------------------------------------------------------------------ the owner RPCs

test("the switch RPC only flips that one flag: no disconnect, delete, refresh, lookup, timestamp or throttle-ledger effect", () => {
  assert.match(setFn, /update public\.gaming_connections g set is_public = candidate_visible/);
  assert.match(setFn, /update public\.league_profiles l set is_public = candidate_visible/);
  assert.match(setFn, /update public\.profiles p set show_education_work = candidate_visible/);
  assert.doesNotMatch(setFn, /delete\s|insert\s|league_lookup_attempts|connection_oauth_attempts|reserve_|fetched_at|last_attempt_at|updated_at|now\(\)|last_result/i);
  assert.equal([...setFn.matchAll(/update public\./g)].length, 3, "exactly the three flag updates, nothing else is written");
});

test("the switch RPC is owner-only, validated, and refuses sections that are not set up", () => {
  assert.match(setFn, /caller uuid := \(select auth\.uid\(\)\)/);
  assert.match(setFn, /m\.user_id = caller and m\.role = 'OWNER' and e\.entity_type = 'SOLO'/);
  for (const reason of ["AUTH_REQUIRED", "INVALID_VISIBILITY", "INVALID_SECTION", "IDENTITY_NOT_FOUND", "SECTION_NOT_SET_UP"]) assert.match(setFn, new RegExp(reason));
  assert.match(setFn, /lower\(btrim\(candidate_section\)\)/);
  assert.doesNotMatch(setFn, /candidate_(entity|user|owner)/, "the target identity is never caller-supplied");
});

test("privileges: the owner RPCs are authenticated-only, the catalog is unreachable by clients, and the public functions keep their grants", () => {
  assert.match(code, /alter table public\.public_section_catalog enable row level security/);
  assert.match(code, /revoke all on table public\.public_section_catalog from public, anon, authenticated/);
  const grants = code.slice(code.indexOf("revoke all on function\n  private.get_my_section_visibility_impl()"));
  assert.match(grants, /grant execute on function\s+private\.get_my_section_visibility_impl\(\), private\.set_my_section_visibility_impl\(text, boolean\),\s+public\.get_my_section_visibility\(\), public\.set_my_section_visibility\(text, boolean\)\s+to authenticated;/);
  assert.doesNotMatch(code.replace(/grant execute on function private\.get_public_identity[\s\S]*$/, ""), /\bto\b[^;]*\banon\b/i, "no owner RPC or table is granted to anon");
  for (const fn of ["private.get_public_identity_impl(text)", "public.get_public_identity(text)", "private.get_public_identity_by_qr_impl(text)", "public.get_public_identity_by_qr(text)"]) assert.ok(code.includes(`grant execute on function ${fn} to anon, authenticated;`), fn);
  assert.doesNotMatch(code, /grant[^;]*(gaming_connections|league_profiles|connection_discovery_results|profiles)\b/i, "no table access is granted to anyone");
});

test("the section registry is small and extensible (a future game is a catalog row plus its own presenter, not a new visibility model)", () => {
  assert.match(code, /section_kind text not null check \(section_kind in \('CONNECTION', 'GAME', 'PROFILE'\)\)/);
  assert.deepEqual([...code.matchAll(/\('([a-z_]+)', '[^']+', '(?:CONNECTION|GAME|PROFILE)', \d+\)/g)].map(match => match[1]), ["discord", "league", "education_work"]);
  assert.doesNotMatch(code, /marvel|valorant|steam|riot rso|rso_/i, "no other game or provider is implemented");
});

// ------------------------------------------------------------------------------------------------ YOUR GAMID UI

test("one generic 'Show on my GamID' control is used by all three sections, next to the section it controls", () => {
  assert.equal([...controller.matchAll(/function visibilitySwitch\(/g)].length, 1);
  assert.match(controller, /"Show on my GamID"/);
  assert.match(controller, /button\.setAttribute\("role", "switch"\)/);
  assert.match(controller, /button\.setAttribute\("aria-checked", String\(on\)\)/);
  assert.match(controller, /button\.type = "button"/, "it can never submit the profile form");
  assert.match(controller, /changeSectionVisibility\("discord", next, showConnectionsMessage, loadConnections\)/);
  assert.match(controller, /changeSectionVisibility\("league", next, showLeagueMessage, loadLeague\)/);
  assert.match(controller, /changeSectionVisibility\("education_work", next, showEducationVisibilityMessage, loadSectionVisibility\)/);
  assert.match(accountHtml, /id="educationVisibility"/);
  const panel = accountHtml.slice(accountHtml.indexOf('id="educationSectionPanel"'), accountHtml.indexOf("</section>", accountHtml.indexOf('id="educationSectionPanel"')));
  assert.ok(panel.includes('id="educationVisibility"') && panel.includes('id="educationVisibilityMessage"'), "the Education/Work switch is inside the Education & Work section");
});

test("the owner is told that connected/saved is different from public, with hints that follow the real publish state", () => {
  assert.match(controller, /"Private — not shown on your public GamID\."/);
  assert.match(controller, /"Shown on your public GamID\."/);
  assert.match(controller, /"Will appear on your public GamID once you publish it\."/);
  assert.match(controller, /Turning this off keeps what you entered\./);
  assert.match(controller, /, marked PROTOTYPE \/ UNVERIFIED \(data: /, "an ON League profile is described publicly as prototype / unverified");
  assert.match(controller, /renderConnections\(\); renderLeague\(\); renderEducationVisibility\(\);/, "publishing / unpublishing refreshes every hint");
});

test("toggling a section calls ONLY the visibility RPC: no OAuth, disconnect, League lookup, refresh, or throttle interaction", () => {
  const change = controller.slice(controller.indexOf("async function changeSectionVisibility"), controller.indexOf("async function loadSectionVisibility"));
  assert.match(change, /api\.setSectionVisibility\(section, visible\)/);
  assert.equal([...change.matchAll(/api\./g)].length, 1);
  assert.doesNotMatch(change, /startConnection|disconnectConnection|lookupLeagueProfile|removeLeagueProfile|runLeagueLookup|beginConnection|location\./);
  assert.match(client, /rpc\("set_my_section_visibility", \{ candidate_section: section, candidate_visible: Boolean\(visible\) \}\)/);
  assert.match(client, /rpc\("get_my_section_visibility"\)/);
  assert.match(controller, /if \(sectionBusy\) return;/, "double clicks cannot start two updates");
});

test("existing Discord and League behavior is untouched by the new control (Connect/Disconnect and Add/Refresh/Remove code paths unchanged)", () => {
  for (const marker of ["beginConnection(row.provider_key)", "finishDisconnect(row.provider_key)", "runLeagueLookup(\"add\", \"add\")", "runLeagueLookup(\"refresh\", \"refresh\")", "finishLeagueRemove"]) assert.ok(controller.includes(marker), marker);
  assert.equal([...controller.matchAll(/lookupLeagueProfile\(/g)].length, 1);
});

test("the switch styles are generic (not League-only) and respect reduced motion", () => {
  for (const cls of [".section-visibility{", ".visibility-switch{", ".visibility-switch.is-on{", ".section-visibility-hint{", ".visibility-slot{"]) assert.ok(accountCss.includes(cls), cls);
  assert.match(accountCss, /@media\(prefers-reduced-motion:reduce\)\{\.visibility-switch-knob\{transition:none\}\}/);
});

// ------------------------------------------------------------------------------------------------ the public page (minimum presentation)

test("the public page renders only what the anonymous response contains, as text, and only once the profile is revealed", () => {
  assert.match(publicJs, /renderPublicSections\(sectionsPanel, identity\.public_sections\)/);
  assert.doesNotMatch(publicJs, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(publicJs, /sectionsPanel\.hidden = !hasSections \|\| event\.data\.state !== "profile"/);
  assert.doesNotMatch(publicJs, /\.visible\b|is_public|show_education|hidden_sections/, "no client-side hiding logic: the server omits hidden sections");
  assert.match(publicHtml, /<aside id="publicSections" class="public-sections" aria-label="More about this GamID" hidden><\/aside>/);
});

test("the public League presentation says prototype/unverified and names its source, and never claims verification", () => {
  assert.match(publicJs, /"PROTOTYPE \/ UNVERIFIED"/);
  assert.match(publicJs, /Data: \$\{source\}/);
  assert.match(publicJs, /LEAGUE_SOURCE_LABELS = \{ OPGG_TEMPORARY: "OP\.GG" \}/);
  assert.doesNotMatch(publicJs + publicHtml + publicCss, /verified by riot|official riot|riot verified|riot connection/i);
  assert.doesNotMatch(publicJs, /avatar_url|provider_account|source_url/, "nothing private is read");
});

test("the Intro and its iframe are not modified by this phase (the panel lives outside the iframe)", () => {
  assert.doesNotMatch(introPreview + introHtml, /public_sections|publicSections|show_education|visibilitySwitch/);
  assert.match(publicHtml, /<iframe id="experienceFrame" title="GamID public identity" src="\.\.\/account\/intro-preview\.html\?v=__ASSET_VERSION__" allow="autoplay"><\/iframe>/);
  assert.match(publicCss, /\.public-sections\{[^}]*pointer-events:none/, "the panel never intercepts taps meant for the Intro");
  assert.match(publicCss, /\.public-sections\{[^}]*z-index:22/);
});

test("nothing else was started: no other game, no Cinematic Profile Engine, no Production reference", () => {
  const everything = migration + controller + publicJs;
  assert.doesNotMatch(everything, /marvel rivals|valorant|steam|cinematic profile|production/i);
  assert.doesNotMatch(migration + publicJs, /supabase\.co/);
});
