import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260916130000_slice_3b_roles_education_occupation.sql", import.meta.url), "utf8");
const indexes = await readFile(new URL("../supabase/migrations/20260916134000_slice_3b_catalog_indexes.sql", import.meta.url), "utf8");
const html = await readFile(new URL("../dist/account/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../dist/account/account.css", import.meta.url), "utf8");
const controller = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");
const client = await readFile(new URL("../dist/account/supabase-client.js", import.meta.url), "utf8");

test("Slice 3B uses concise controlled role and education catalogs", () => {
  for (const role of ["Gamer","Streamer","Content Creator","Esports Player","Coach","Designer","Developer","Tournament Organizer","Team Manager","Community Manager","Video Editor","Photographer"]) assert.match(migration, new RegExp(`'${role}'`));
  for (const status of ["Student","University Student","Freelancer","Professional","Self-employed"]) assert.match(migration, new RegExp(`'${status}'`));
  assert.doesNotMatch(migration, /free.?text.?role|profile_blocks/i);
});

test("multiple roles require exactly one selected primary through the secure mutation boundary", () => {
  assert.match(migration, /create table public\.profile_gaming_roles/);
  assert.match(migration, /profile_gaming_roles_one_primary[\s\S]*where is_primary/);
  assert.match(migration, /DUPLICATE_GAMING_ROLE/);
  assert.match(migration, /PRIMARY_ROLE_WITHOUT_ROLES/);
  assert.match(migration, /INVALID_PRIMARY_ROLE/);
  assert.match(migration, /INVALID_GAMING_ROLE/);
  assert.match(migration, /m\.user_id = caller and m\.role = 'OWNER' and e\.entity_type = 'SOLO'/);
});

test("education and occupation stay optional, bounded, and separate from gaming roles", () => {
  assert.match(migration, /add column education_work_status/);
  assert.match(migration, /add column institution/);
  assert.match(migration, /add column field_of_study/);
  assert.match(migration, /char_length\(institution\) <= 120/);
  assert.match(migration, /char_length\(field_of_study\) <= 120/);
  assert.doesNotMatch(migration, /employer|company_membership|organization_membership/i);
  assert.match(indexes, /profile_gaming_roles_role_key_idx/);
  assert.match(indexes, /profiles_education_work_status_idx/);
});

test("Slice 3B writes remain RPC-only and preserve DRAFT/private identity invariants", () => {
  assert.match(migration, /security definer set search_path = ''/);
  assert.match(migration, /security invoker set search_path = ''/);
  assert.match(migration, /revoke all on table public\.gaming_role_catalog, public\.education_work_status_catalog, public\.profile_gaming_roles from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.update_my_identity_profile\(text,text,text,text\[\],text,text,text,text\) to authenticated/);
  assert.match(migration, /update public\.profiles p set bio = candidate_bio, education_work_status = normalized_education, institution = normalized_institution, field_of_study = normalized_field, updated_at = now\(\) where p\.profile_id = owned_profile_id/);
  assert.match(migration, /update public\.entities e set display_name = trim\(candidate_display_name\), avatar_media_reference = coalesce\(candidate_avatar_path, e\.avatar_media_reference\), updated_at = now\(\) where e\.entity_id = owned_entity_id/);
  assert.doesNotMatch(migration, /qr_references|public_token/);
});

test("YOUR GAMID uses one-open-section accordion controls without navigation or modal editing", () => {
  assert.match(html, /id="rolesSectionToggle"[\s\S]*aria-controls="rolesSectionPanel"/);
  assert.match(html, /id="educationSectionToggle"[\s\S]*aria-controls="educationSectionPanel"/);
  assert.match(controller, /for \(const toggle of document\.querySelectorAll\("\.section-toggle"\)\)/);
  assert.match(controller, /other === toggle && opening/);
  assert.match(css, /Slice 3B — reusable identity-board accordion/);
  assert.doesNotMatch(html, /href=[^>]*(roles|education|occupation)/i);
});

test("live preview and existing Save Profile flow include Slice 3B state", () => {
  assert.match(html, /id="primaryRoleSummary"/);
  assert.match(html, /id="secondaryRolesSummary"/);
  assert.match(html, /id="educationWorkSummary"/);
  assert.match(controller, /secondaryLabels\.slice\(0, 2\)/);
  assert.match(controller, /api\.updateIdentityProfile\(\{ \.\.\.draft, avatarPath \}\)/);
  assert.match(client, /candidate_role_keys: roleKeys/);
  assert.match(client, /candidate_primary_role_key: primaryRoleKey/);
  assert.match(client, /candidate_education_work_status: educationWorkStatus/);
  assert.match(controller, /savedProfile = \{[\s\S]*roleKeys:updated\.role_keys/);
});

test("future Slice 3 sections remain inactive and unimplemented", () => {
  assert.match(html, /<span>Games<\/span><span>Stats<\/span><span>Connections<\/span><span>Socials<\/span>/);
  assert.doesNotMatch(migration, /game_catalog|player_id|rank|verified_badge|discord|steam|xbox|playstation/i);
});
