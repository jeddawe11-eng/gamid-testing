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
  const selection = controller.match(/document\.getElementById\("profileAvatarInput"\)\.addEventListener\("change",[\s\S]*?\n\}\);/)?.[0] || "";
  assert.match(selection, /openAvatarCrop/);
  assert.doesNotMatch(selection, /pendingAvatar\s*=/);
  assert.doesNotMatch(selection, /event\.target\.value = ""/);
  assert.match(selection, /const file = event\.target\.files\[0\][\s\S]*openAvatarCrop\(file\)/);
  assert.match(controller, /pendingAvatar = normalized\.blob/);
  assert.match(controller, /updateProfilePreview\(\)/);
  assert.match(controller, /function cancelAvatarCrop\(\)[\s\S]*cropDialog\.close\(\)[\s\S]*releaseCropImage/);
  assert.match(cropper, /class AvatarCropState/);
  assert.match(cropper, /pan\(deltaX, deltaY\)/);
  assert.match(cropper, /setZoom\(nextZoom/);
  assert.match(cropper, /createNormalizedAvatar/);
});

test("profile restore and mobile page restoration reset abandoned Avatar crop state", () => {
  assert.match(controller, /function resetAvatarCropLifecycle\([^)]*\)[\s\S]*avatarPreviewUrl = null;[\s\S]*pendingAvatar = null;[\s\S]*profileAvatarInput/);
  assert.match(controller, /async function showIdentity\(data\)[\s\S]*resetAvatarCropLifecycle\("profile-restored"\);[\s\S]*setPersistedAvatar/);
  assert.match(controller, /addEventListener\("pageshow"[\s\S]*event\.persisted[\s\S]*resetAvatarCropLifecycle\("pageshow-persisted"\)[\s\S]*setPersistedAvatar/);
  assert.match(cropper, /catch \(error\)[\s\S]*fallback-start[\s\S]*return fallback\(file, \{ report \}\)/);
});

test("Avatar decoder lifecycle prevents stale async cleanup from affecting a newer selection", () => {
  assert.match(cropper, /class AvatarDecodeSession/);
  assert.match(cropper, /operation !== this\.generation[\s\S]*this\.releaser\(image\)/);
  assert.match(cropper, /htmlImageUrls\.set\(image, \{ url, report \}\)/);
  assert.match(cropper, /releaseOrientedImage/);
  assert.match(controller, /const avatarDecoder = new AvatarDecodeSession/);
  assert.match(controller, /const decoded = await avatarDecoder\.open\(file\)[\s\S]*if \(decoded\.stale\)[^{]*\{[^}]*return;/);
  assert.match(controller, /avatarDecoder\.isCurrent\(applyingOperation, applyingImage\)/);
});

test("Android gallery File remains input-owned until decode/crop completion", () => {
  const selection = controller.match(/document\.getElementById\("profileAvatarInput"\)\.addEventListener\("change",[\s\S]*?\n\}\);/)?.[0] || "";
  assert.doesNotMatch(selection, /\.value\s*=\s*""/);
  assert.match(controller, /function cancelAvatarCrop\(\)[\s\S]*profileAvatarInput"\)\.value = ""/);
  assert.match(controller, /applyAvatarCrop[\s\S]*profileAvatarInput"\)\.value = ""/);
  assert.match(controller, /catch \{[\s\S]*expectedGeneration[\s\S]*profileAvatarInput"\)\.value = ""/);
});

test("TESTING-only diagnostics identify decode stage without recording private image data", () => {
  assert.match(html, /id="avatarDiagnostics"[^>]*hidden/);
  assert.match(controller, /get\("avatarDebug"\) === "1"/);
  assert.match(controller, /loadOrientedImage\(ownedBlob, \{ report:avatarDiag \}\)/);
  assert.match(cropper, /bitmap-success/);
  assert.match(cropper, /bitmap-failure/);
  assert.match(cropper, /fallback-load-success/);
  assert.match(cropper, /fallback-load-failure/);
  assert.match(cropper, /snapshot-start/);
  assert.match(cropper, /snapshot-success/);
  assert.match(cropper, /snapshot-failure/);
  assert.doesNotMatch(controller, /avatarDiag\([^\n]*(file\.name|objectURL|access_token|qr_public_token)/);
});

test("Avatar decode uses an application-owned Blob rather than the Gallery File", () => {
  assert.match(cropper, /async function createOwnedImageBlob/);
  assert.match(cropper, /await file\.arrayBuffer\(\)/);
  assert.match(cropper, /new Blob\(\[bytes\], \{ type:file\.type \}\)/);
  assert.match(controller, /const ownedBlob = await createOwnedImageBlob\(file, \{ report:avatarDiag \}\)[\s\S]*loadOrientedImage\(ownedBlob/);
  assert.doesNotMatch(controller, /loadOrientedImage\(file, \{ report:avatarDiag \}\)/);
});
