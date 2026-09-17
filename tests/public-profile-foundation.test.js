import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const enumMigration = await readFile(new URL("../supabase/migrations/20260918120000_public_profile_foundation.sql", import.meta.url), "utf8");
const rpcMigration = await readFile(new URL("../supabase/migrations/20260918120500_public_profile_rpcs.sql", import.meta.url), "utf8");
const avatarMigration = await readFile(new URL("../supabase/migrations/20260918121000_public_profile_avatar_read.sql", import.meta.url), "utf8");
const educationMigration = await readFile(new URL("../supabase/migrations/20260918121500_public_profile_education_catalog.sql", import.meta.url), "utf8");
const client = await readFile(new URL("../dist/account/supabase-client.js", import.meta.url), "utf8");
const accountHtml = await readFile(new URL("../dist/account/index.html", import.meta.url), "utf8");
const accountController = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");
const publicHtml = await readFile(new URL("../dist/public/index.html", import.meta.url), "utf8");
const publicController = await readFile(new URL("../dist/public/public.js", import.meta.url), "utf8");

test("Public visibility is added as a new enum value in its own migration", () => {
  assert.match(enumMigration, /alter type public\.entity_visibility add value if not exists 'PUBLIC'/);
});

test("Publish/unpublish goes through the established private-impl + public-invoker pattern", () => {
  assert.match(rpcMigration, /create function private\.set_my_identity_visibility_impl\(candidate_public boolean\)/);
  assert.match(rpcMigration, /security definer/);
  assert.match(rpcMigration, /create function public\.set_my_identity_visibility\(candidate_public boolean\)/);
  assert.match(rpcMigration, /security invoker/);
  assert.match(rpcMigration, /if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'/);
  assert.match(rpcMigration, /grant execute on function public\.set_my_identity_visibility\(boolean\) to authenticated/);
  assert.doesNotMatch(rpcMigration, /grant execute on function public\.set_my_identity_visibility\(boolean\) to anon/);
});

test("Publish only ever targets the caller's own SOLO entity via entity_memberships ownership", () => {
  assert.match(rpcMigration, /entity_memberships m[\s\S]*where m\.user_id = caller and m\.role = 'OWNER' and e\.entity_type = 'SOLO'/);
});

test("The public read RPC is gated on visibility = 'PUBLIC' and never returns private fields", () => {
  assert.match(educationMigration, /and e\.visibility = 'PUBLIC'/);
  const returnColumns = educationMigration.match(/create function public\.get_public_identity\(candidate_handle text\)\nreturns table \(([\s\S]*?)\n\)/)?.[1] || "";
  assert.ok(returnColumns.length > 0, "could not locate get_public_identity return column list");
  for (const forbidden of ["date_of_birth", "account_email", "email", "qr_public_token", "public_token", "entity_id", "profile_id", "visibility"]) {
    assert.ok(!returnColumns.includes(forbidden), `public identity RPC must not return ${forbidden}`);
  }
});

test("The public read RPC is anonymous-safe and granted to anon", () => {
  assert.match(rpcMigration, /grant execute on function private\.get_public_identity_impl\(text\) to anon, authenticated/);
  assert.match(rpcMigration, /grant execute on function public\.get_public_identity\(text\) to anon, authenticated/);
});

test("Public avatar storage access is scoped to only the currently PUBLIC entity's own avatar", () => {
  assert.match(avatarMigration, /on storage\.objects for select to anon, authenticated/);
  assert.match(avatarMigration, /e\.avatar_media_reference = storage\.objects\.name/);
  assert.match(avatarMigration, /e\.visibility = 'PUBLIC'/);
});

test("Education/Work catalog labels are joined the same way for the public RPC as for the owner RPC", () => {
  assert.match(educationMigration, /education_work_catalog jsonb/);
  assert.match(educationMigration, /from public\.education_work_status_catalog c where c\.active/);
});

test("The frontend API client exposes publish/unpublish and anonymous public-identity reads", () => {
  assert.match(client, /export async function setMyIdentityVisibility\(candidatePublic\)/);
  assert.match(client, /rpc\("set_my_identity_visibility", \{ candidate_public: candidatePublic \}\)/);
  assert.match(client, /export async function getPublicIdentity\(handle\)/);
  assert.match(client, /rpc\("get_public_identity", \{ candidate_handle: handle \}, \{ anonymous: true \}\)/);
});

test("YOUR GAMID exposes a Publish/Unpublish control without redesigning the rest of the editor", () => {
  assert.match(accountHtml, /id="visibilityChip"/);
  assert.match(accountHtml, /id="visibilityToggle"/);
  assert.match(accountController, /api\.setMyIdentityVisibility\(goingPublic\)/);
  assert.match(accountController, /identity\?\.visibility === "PUBLIC"/);
});

test("The public route is read-only: no forms, no file inputs, no auth-only controls", () => {
  assert.doesNotMatch(publicHtml, /<form/i);
  assert.doesNotMatch(publicHtml, /type="file"/i);
  assert.doesNotMatch(publicHtml, /signOutButton|profileForm|saveProfileButton/);
  assert.match(publicHtml, /<meta name="robots" content="noindex"/);
});

test("The public page never sends an auth token and builds its config from only public-safe fields", () => {
  assert.match(publicController, /getPublicIdentity\(handle\)/);
  assert.doesNotMatch(publicController, /access_token|Authorization/);
  for (const field of ["display_name", "gamid_handle", "role_catalog", "education_work_catalog", "bio", "avatar_media_reference"]) {
    assert.match(publicController, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
