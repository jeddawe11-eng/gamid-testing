import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compatibilityScore, maxSeatsForQueue, sharesLanguage, validateDraft, validateSchedule } from "../dist/play-together/domain.js";

const root=new URL("../",import.meta.url);
const migration=await readFile(new URL("supabase/migrations/20260925090000_play_together_complete_milestone.sql",root),"utf8");
const html=await readFile(new URL("dist/play-together/index.html",root),"utf8");
const js=await readFile(new URL("dist/play-together/play-together.js",root),"utf8");
const css=await readFile(new URL("dist/play-together/play-together.css",root),"utf8");

test("all three active directions are first-class and payments stay absent",()=>{
 for(const value of ["NEED_PLAYERS","FIND_SQUAD","TEAM_VS_TEAM"])assert.match(`${migration}${html}`,new RegExp(value));
 assert.doesNotMatch(`${migration}${html}${js}`,/payment|subscription|commission|price_cents/i);
});
test("ME and US support registered invitations and manual unverified guests",()=>{
 for(const token of ["search_play_together_members","respond_play_together_invitation","candidate_invited_entity_ids","candidate_guests","MANUAL_UNVERIFIED"])assert.match(`${migration}${js}`,new RegExp(token));
 assert.match(migration,/member_kind in \('GAMID','GUEST'\)/);
 assert.match(migration,/membership_status in \('INVITED','ACCEPTED','DECLINED','REMOVED'\)/);
 assert.match(migration,/char_length\(regexp_replace\(q,'\[\^a-z0-9\]'/);
});
test("one active intent is protected for every accepted entity, not only hosts",()=>{
 assert.match(migration,/create table private\.play_together_active_entities/);
 assert.match(migration,/entity_id uuid primary key/);
 assert.match(migration,/ACTIVE_INTENT_EXISTS/);
 assert.match(migration,/pg_advisory_xact_lock/);
});
test("host approval requests are explicit, locked, versioned and never auto-admit",()=>{
 assert.match(migration,/play_together_join_requests/);
 for(const state of ["PENDING","APPROVED","REJECTED","WITHDRAWN","EXPIRED"])assert.match(migration,new RegExp(`'${state}'`));
 assert.match(migration,/for update/);
 assert.match(html,/HOST APPROVAL/);
 assert.doesNotMatch(`${migration}${html}${js}`,/AUTO_JOIN|AUTO_MATCH/);
});
test("matching separates server eligibility from ordered compatibility signals",()=>{
 assert.match(migration,/s\.game_key=mine\.game_key and s\.queue_key=mine\.queue_key and s\.region_key=mine\.region_key/);
 assert.match(migration,/mine\.language_keys && s\.language_keys/);
 assert.match(`${html}${js}`,/Eligibility is enforced first/);
 assert.equal(compatibilityScore({eligible:true,region_match:true,queue_match:true,role_match:false,language_match:true,mic_score:2}),192);
 assert.equal(compatibilityScore({eligible:false}),null);
});
test("seats wanted remains distinct from confirmed and planned group size",()=>{
 for(const field of ["current_group_size","planned_group_size","seats_wanted","seats_filled"])assert.match(migration,new RegExp(field));
 assert.equal(maxSeatsForQueue({enabled:true,max_party_size:5},3),2);
 assert.match(migration,/planned\+candidate_seats_wanted>q\.max_premade_party_size/);
});
test("Team vs Team is complete-team and game-rule driven, never hard-coded 5v5",()=>{
 assert.match(migration,/q\.team_size is null or planned<>q\.team_size/);
 assert.match(migration,/COMPLETE_TEAM_REQUIRED/);
 assert.doesNotMatch(migration,/planned\s*<>\s*5|5v5/);
});
test("scheduled timing uses the configurable three-hour policy and separate deadlines",()=>{
 assert.match(migration,/scheduled_horizon_minutes/);
 assert.match(migration,/ready_check_timeout_minutes/);
 assert.match(migration,/matching_expires_at/);
 const now=Date.parse("2026-09-25T00:00:00Z");
 assert.equal(validateSchedule("SCHEDULED","2026-09-25T02:59:00Z",now,180),null);
 assert.match(validateSchedule("SCHEDULED","2026-09-25T03:01:00Z",now,180),/within 3 hours/);
});
test("directional per-game Avoid is capped at two and is not Block or Report",()=>{
 assert.match(migration,/create table public\.play_together_avoids/);
 assert.match(migration,/current_count>=2/);
 assert.match(migration,/owner_entity_id=s\.creator_entity_id and a\.avoided_entity_id=mine\.creator_entity_id/);
 assert.match(html,/This is not Block or Report/);
});
test("Ready Check is explicit, race-safe and gates canonical room creation",()=>{
 for(const table of ["play_together_ready_checks","play_together_ready_responses","play_together_rooms"])assert.match(migration,new RegExp(`create table public\.${table}`));
 assert.match(migration,/response='PENDING'/);
 assert.match(migration,/select r\.\* into rc[\s\S]*for update/);
 assert.match(migration,/if remaining=0 then[\s\S]*insert into public\.play_together_rooms/);
 assert.match(`${html}${js}`,/Accepted is not Ready/);
});
test("room state is canonical and Discord stays an empty external boundary",()=>{
 assert.match(migration,/external_communication jsonb not null default '\{\}'::jsonb/);
 assert.doesNotMatch(migration,/discord_(channel|guild|voice)_id/);
 assert.match(js,/advance_play_together_room/);
});
test("Last Setup is player-level, written only after successful ready formation, and excludes seats",()=>{
 const table=migration.match(/create table private\.play_together_last_setup \([\s\S]*?\n\);/)?.[0]||"";
 assert.match(table,/entity_id uuid primary key/);
 assert.doesNotMatch(table,/seats_wanted/);
 assert.match(migration,/if remaining=0 then[\s\S]*insert into private\.play_together_last_setup/);
 assert.match(html,/USE LAST SETUP/);
});
test("history and Played With foundations are immutable events without an invented penalty",()=>{
 assert.match(migration,/create table public\.play_together_events/);
 assert.match(migration,/NO_SHOW_RECORDED/);
 assert.match(migration,/'played_with'/);
 assert.doesNotMatch(migration,/24 hours|suspend|penalty|third incident/i);
});
test("new tables are RLS-enabled, direct writes revoked, and public APIs are invoker wrappers",()=>{
 assert.ok((migration.match(/enable row level security/g)||[]).length>=10);
 assert.match(migration,/revoke all on table[\s\S]*from public,anon,authenticated/);
 assert.match(migration,/public\.create_play_together_attempt[\s\S]*security invoker set search_path=''/);
 assert.match(migration,/private\.create_play_together_attempt_impl[\s\S]*security definer set search_path=''/);
 assert.doesNotMatch(migration,/candidate_user_id/);
});
test("responsive UI covers flows, members, requests, ready, room, avoid and history",()=>{
 for(const id of ["groupBuilder","matchingSection","requestSection","readySection","roomSection","avoidPanel","historyPanel"])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(css,/@media\(max-width:34rem\)/);
 assert.match(css,/@media\(min-width:42rem\)/);
});
test("language matching needs overlap and max-two remains enforced in complete flow",()=>{
 assert.equal(sharesLanguage(["en","ar"],["ms","ar"]),true);
 assert.equal(sharesLanguage(["en"],["ms"]),false);
 assert.match(migration,/cardinality\(normalized_languages\) not between 1 and 2/);
});
test("complete draft rules distinguish Find and Team vs Team from Seats Wanted",()=>{
 const queue={enabled:true,max_party_size:5,team_size:5};
 const common={queue,regionKey:"me1",languageKeys:["en"],micPreference:"PREFERRED",timingKind:"PLAY_NOW"};
 assert.equal(validateDraft({...common,flow:"FIND_SQUAD",groupKind:"ME",currentGroupSize:1,seatsWanted:0}),null);
 assert.match(validateDraft({...common,flow:"FIND_SQUAD",groupKind:"ME",currentGroupSize:1,seatsWanted:1}),/does not use/);
 assert.equal(validateDraft({...common,flow:"TEAM_VS_TEAM",groupKind:"US",currentGroupSize:5,seatsWanted:0}),null);
 assert.match(validateDraft({...common,flow:"TEAM_VS_TEAM",groupKind:"US",currentGroupSize:4,seatsWanted:0}),/complete team/);
});
