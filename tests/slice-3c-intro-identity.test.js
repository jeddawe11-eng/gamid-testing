import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hasIntroChanges, validateIntroSource } from "../dist/account/domain.js";

const migration = await readFile(new URL("../supabase/migrations/20260916170000_slice_3c_intro_identity.sql", import.meta.url), "utf8");
const html = await readFile(new URL("../dist/account/index.html", import.meta.url), "utf8");
const controller = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");
const client = await readFile(new URL("../dist/account/supabase-client.js", import.meta.url), "utf8");
const preview = await readFile(new URL("../dist/account/intro-preview.js", import.meta.url), "utf8");
const previewCss = await readFile(new URL("../dist/account/intro-preview.css", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/intro-worker.mjs", import.meta.url), "utf8");

test("Slice 3C source limits and canonical Intro dirty state are enforced", () => {
  const file = { type:"video/mp4", size:10 * 1024 * 1024 };
  assert.equal(validateIntroSource(file,20_000).valid,true);
  assert.equal(validateIntroSource({ ...file,size:101 * 1024 * 1024 },20_000).reason,"INTRO_SOURCE_TOO_LARGE");
  assert.equal(validateIntroSource(file,30_001).reason,"INTRO_DURATION_INVALID");
  assert.equal(hasIntroChanges({ transitionKey:"fade" },{ transitionKey:"fade" }),false);
  assert.equal(hasIntroChanges({ transitionKey:"fade" },{ transitionKey:"shrink" }),true);
  assert.equal(hasIntroChanges({ transitionKey:"fade" },{ transitionKey:"fade" },true),true);
});

test("YOUR INTRO reuses the accordion and the one SAVE GAMID flow", () => {
  assert.match(html,/id="introSectionToggle"[\s\S]*aria-controls="introSectionPanel"/);
  assert.match(html,/Add|Intro video/);
  assert.match(html,/id="introTransition"/);
  assert.match(html,/id="previewIntroButton"/);
  assert.match(html,/id="removeIntroButton"/);
  assert.match(html,/>SAVE GAMID</);
  assert.doesNotMatch(html,/SAVE INTRO/i);
  assert.match(controller,/hasIntroChanges\(savedIntro, introDraft\(\), Boolean\(pendingIntroSource\)\)/);
});

test("Intro Preview uses the accepted Transition Engine and current local identity", () => {
  assert.match(preview,/from "\.\.\/transition-engine\.js"/);
  for (const symbol of ["computeShrinkTarget","effectiveTransitionDuration","nextExperienceState","resolvePreset"]) assert.match(preview,new RegExp(symbol));
  assert.match(controller,/avatarUrl:avatarPreviewUrl \|\| persistedAvatarUrl/);
  assert.match(controller,/displayName:draft\.displayName/);
  assert.match(controller,/secondaryRoles:secondary/);
  assert.match(previewCss,/@media \(min-aspect-ratio:1\/1\)[\s\S]*\.media-stage video\{object-fit:contain/);
});

test("private storage and RPC boundaries preserve per-user ownership", () => {
  assert.match(migration,/\('intro-sources'.*false, 104857600/);
  assert.match(migration,/\('intro-media'.*false, 15728640/);
  assert.match(migration,/owners read their intro jobs[\s\S]*owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration,/users upload intro sources to their folder[\s\S]*storage\.foldername/);
  assert.match(migration,/revoke all on table public\.intro_processing_jobs,public\.profile_intro_settings from public,anon,authenticated/);
  assert.match(migration,/WORKER_ONLY/);
  assert.doesNotMatch(client,/service_role|SERVICE_ROLE/);
});

test("processing state, replacement safety, removal, and cleanup are server controlled", () => {
  for (const state of ["pending","processing","ready","failed"]) assert.match(migration,new RegExp(`'${state}'`));
  assert.match(migration,/select active_job_id into old_active/);
  assert.match(migration,/update public\.profile_intro_settings set active_job_id=candidate_job_id/);
  assert.match(migration,/source_cleanup_eligible_at=now\(\)/);
  assert.match(migration,/derivative_cleanup_eligible_at=now\(\)/);
  assert.match(migration,/update public\.profile_intro_settings set active_job_id=null/);
  assert.match(controller,/if \(sourcePath\).*api\.deleteIntroSource/s);
});

test("provider-neutral worker applies and validates the approved D3 profile", () => {
  assert.match(worker,/"libvpx-vp9","-crf","40","-b:v","0"/);
  assert.match(worker,/"libopus","-b:a","32k"/);
  assert.match(worker,/result\.video\?\.codec_name !== "vp9"/);
  assert.match(worker,/result\.audio\?\.codec_name !== "opus"/);
  assert.match(worker,/D3_TIMING_OR_GEOMETRY_MISMATCH/);
  assert.match(worker,/worker_claim_intro_job/);
  assert.match(worker,/worker_complete_intro_job/);
  assert.match(worker,/worker_fail_intro_job/);
});

test("browser uploads source and queues work but never transcodes", () => {
  assert.match(client,/uploadIntroSource/);
  assert.match(client,/storage\.supabase\.co\/storage\/v1\/upload\/resumable/);
  assert.match(client,/queue_my_intro/);
  assert.match(controller,/createOwnedUploadBlob\(file\)/);
  assert.match(controller,/visibilitychange/);
  assert.match(controller,/isProcessingIntroState\(intro\)[\s\S]*introStatusPoller\.start\(\)/);
  assert.doesNotMatch(`${client}\n${controller}`,/import[^\n]*(ffmpeg|libvpx)|WebAssembly|new Worker\s*\(/i);
});
