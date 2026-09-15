import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260915170000_slice_3a_identity_foundation.sql", import.meta.url), "utf8");
const html = await readFile(new URL("../dist/account/index.html", import.meta.url), "utf8");
const client = await readFile(new URL("../dist/account/supabase-client.js", import.meta.url), "utf8");
const controller = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");
const cropper = await readFile(new URL("../dist/account/avatar-cropper.js", import.meta.url), "utf8");

test("Slice 3A adds only a bounded bio field to the existing profile model", () => {
  assert.match(migration, /alter table public\.profiles[\s\S]*add column bio text not null default ''/);
  assert.match(migration, /char_length\(bio\) <= 160/);
  assert.doesNotMatch(migration, /profile_blocks|create table/i);
});

test("profile mutation stays behind an authenticated RPC and preserves identity invariants", () => {
  assert.match(migration, /create function private\.update_my_identity_profile_impl/);
  assert.match(migration, /create function public\.update_my_identity_profile/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /m\.user_id = caller and m\.role = 'OWNER' and e\.entity_type = 'SOLO'/);
  assert.match(migration, /char_length\(candidate_bio\) > 160/);
  assert.match(migration, /grant execute on function public\.update_my_identity_profile\(text,text,text\) to authenticated/);
  assert.match(migration, /revoke all on function public\.update_my_identity_profile\(text,text,text\) from public, anon/);
  assert.match(migration, /revoke insert, update, delete, truncate, references, trigger on public\.profiles from authenticated/);
  assert.doesNotMatch(migration, /update public\.entities[\s\S]*gamid_handle\s*=/);
  assert.doesNotMatch(migration, /update public\.profiles[\s\S]*status\s*=/);
});

test("avatar replacement reuses the private bucket and validates caller ownership", () => {
  assert.match(migration, /bucket_id = 'avatars'/);
  assert.match(migration, /o\.owner_id = caller::text/);
  assert.match(client, /uploadAvatar\(file, userId, \{ attach = true \} = \{\}\)/);
  assert.match(client, /update_my_identity_profile/);
});

test("Your GamID UI exposes live editable fields but no handle mutation", () => {
  assert.match(html, />YOUR GAMID</);
  assert.match(html, /LIVE PREVIEW/);
  assert.match(html, /id="profileDisplayName"/);
  assert.match(html, /id="profileBio"[\s\S]*maxlength="160"/);
  assert.match(html, /id="profileAvatarInput"/);
  assert.match(html, /id="handleField"/);
  assert.doesNotMatch(html, /name="(?:gamid_)?handle"[^>]*id="handleField"/);
  assert.match(controller, /beforeunload/);
  assert.match(controller, /updateProfilePreview/);
  assert.match(controller, /Saved ✓|saveConfirmation/);
});

test("Slice 3A remains DRAFT/private and does not expose QR or enable future areas", () => {
  assert.match(html, /DRAFT · PRIVATE/);
  assert.doesNotMatch(html, /qr_public_token|public_token/);
  assert.doesNotMatch(migration, /qr_public_token|public\.qr_references/);
  assert.doesNotMatch(html, /href=[^>]*(games|stats|connections|socials)/i);
});

test("Avatar selection opens positioning before creating an unsaved normalized Avatar", () => {
  assert.match(html, /id="avatarCropDialog"/);
  assert.match(html, /id="avatarCropCanvas"/);
  assert.match(html, /id="avatarZoom"[^>]*type="range"/);
  assert.match(html, />APPLY</);
  assert.match(html, />CANCEL</);
  const selection = controller.match(/document\.getElementById\("profileAvatarInput"\)\.addEventListener\("change",[^\n]+/)?.[0] || "";
  assert.match(selection, /openAvatarCrop/);
  assert.doesNotMatch(selection, /pendingAvatar\s*=/);
  assert.match(controller, /pendingAvatar = normalized\.blob/);
  assert.match(controller, /updateProfilePreview\(\)/);
  assert.match(controller, /function cancelAvatarCrop\(\)[\s\S]*cropDialog\.close\(\)[\s\S]*releaseCropImage/);
  assert.match(cropper, /class AvatarCropState/);
  assert.match(cropper, /pan\(deltaX, deltaY\)/);
  assert.match(cropper, /setZoom\(nextZoom/);
  assert.match(cropper, /createNormalizedAvatar/);
});
