import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const introMigration = await readFile(new URL("../supabase/migrations/20260918130000_public_profile_intro.sql", import.meta.url), "utf8");
const introMediaMigration = await readFile(new URL("../supabase/migrations/20260918130500_public_profile_intro_media_read.sql", import.meta.url), "utf8");
const client = await readFile(new URL("../dist/account/supabase-client.js", import.meta.url), "utf8");
const previewHtml = await readFile(new URL("../dist/account/intro-preview.html", import.meta.url), "utf8");
const previewController = await readFile(new URL("../dist/account/intro-preview.js", import.meta.url), "utf8");
const publicHtml = await readFile(new URL("../dist/public/index.html", import.meta.url), "utf8");
const publicController = await readFile(new URL("../dist/public/public.js", import.meta.url), "utf8");
const accountController = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");

test("the public identity RPC only surfaces a READY active derivative, gated on entity visibility, and never returns job/profile internals", () => {
  assert.match(introMigration, /active\.job_id = s\.active_job_id and active\.state = 'ready'/);
  assert.match(introMigration, /and e\.visibility = 'PUBLIC'/);
  const returnColumns = introMigration.match(/create function public\.get_public_identity\(candidate_handle text\)\nreturns table \(([\s\S]*?)\n\)/)?.[1] || "";
  assert.ok(returnColumns.length > 0, "could not locate get_public_identity return column list");
  for (const forbidden of ["job_id", "profile_id", "entity_id", "owner_user_id", "source_path", "failure_code"]) {
    assert.ok(!returnColumns.includes(forbidden), `public identity RPC must not return ${forbidden}`);
  }
  assert.match(introMigration, /grant execute on function public\.get_public_identity\(text\) to anon, authenticated/);
});

test("Intro media storage access is scoped to only the currently active, ready derivative of a PUBLIC entity, via a security definer function", () => {
  assert.match(introMediaMigration, /security definer/);
  assert.match(introMediaMigration, /j\.state = 'ready'/);
  assert.match(introMediaMigration, /e\.visibility = 'PUBLIC'/);
  assert.match(introMediaMigration, /on storage\.objects for select to anon, authenticated/);
  assert.match(introMediaMigration, /grant execute on function private\.intro_media_is_public\(text\) to anon, authenticated/);
});

test("the frontend client can load intro media anonymously with no auth header, mirroring the avatar loader", () => {
  assert.match(client, /export async function loadPublicIntroMedia\(path\)/);
  const fn = client.match(/export async function loadPublicIntroMedia[\s\S]*?\n}/)?.[0] || "";
  assert.doesNotMatch(fn, /Authorization|access_token/);
});

test("intro-preview.js reuses the existing Transition Engine unchanged and never duplicates it", () => {
  assert.match(previewController, /from "\.\.\/transition-engine\.js"/);
  for (const symbol of ["computeShrinkTarget", "effectiveTransitionDuration", "nextExperienceState", "resolvePreset"]) {
    assert.match(previewController, new RegExp(symbol));
  }
});

test("a profile with no Intro configured skips straight to the revealed profile instead of showing an empty intro stage", () => {
  assert.match(previewController, /if\(!config\.videoUrl\)\{[^}]*setState\("SKIP"\)/);
});

test("public mode hides the owner-only PREVIEW and DRAFT/PRIVATE badges without touching the rest of the accepted preview markup", () => {
  assert.match(previewHtml, /id="previewBadge"/);
  assert.match(previewHtml, /id="previewPrivate"/);
  assert.match(previewController, /previewBadge\.hidden=Boolean\(config\.publicMode\)/);
  assert.match(previewController, /previewPrivate\.hidden=Boolean\(config\.publicMode\)/);
});

test("existing owner preview config (account.js) never sets publicMode, preserving its exact current behavior", () => {
  assert.doesNotMatch(accountController, /publicMode/);
});

test("intro-preview.js broadcasts its state to the parent frame so a host page can react, without breaking the existing ready/error message contract", () => {
  assert.match(previewController, /parent\.postMessage\(\{type:"gamid-intro-preview-state",state\},location\.origin\)/);
  assert.match(previewController, /parent\.postMessage\(\{type:"gamid-intro-preview-ready"\},location\.origin\)/);
  assert.match(previewController, /type:"gamid-intro-preview-error"/);
});

test("the public route embeds the existing Intro Preview experience via iframe instead of duplicating it", () => {
  assert.match(publicHtml, /src="\.\.\/account\/intro-preview\.html"/);
  assert.doesNotMatch(publicHtml, /<video/);
  assert.doesNotMatch(publicHtml, /split-panel|intro-layer|media-stage/);
});

test("Replay Intro only appears once the profile is revealed and only when an Intro exists, and reuses play() rather than reloading the page", () => {
  assert.match(publicHtml, /id="replayIntroButton"/);
  assert.match(publicController, /hasIntro = Boolean\(config\.videoUrl\)/);
  assert.match(publicController, /replayButton\.hidden = !hasIntro \|\| event\.data\.state !== "profile"/);
  assert.match(publicController, /replayButton\.addEventListener\("click", send\)/);
  assert.doesNotMatch(publicController, /location\.reload/);
});

test("the public page config is built entirely from the public-safe RPC response, never from an authenticated session", () => {
  assert.doesNotMatch(publicController, /session|getIdentity\(\)|getMyIntro\(\)/);
});

test("the iframe's message listener is attached before the identity fetch, so an early gamid-intro-preview-ready signal from the iframe is never missed", () => {
  const listenerIndex = publicController.indexOf('addEventListener("message"');
  const fetchIndex = publicController.indexOf("await getPublicIdentity(handle)");
  assert.ok(listenerIndex > -1 && fetchIndex > -1, "could not locate both the message listener and the identity fetch");
  assert.ok(listenerIndex < fetchIndex, "the message listener must be attached before awaiting the identity fetch, or the iframe's ready signal races ahead of it and is lost");
});

test("send() only posts once both the iframe is ready and a config has been built, and is re-invoked once the config resolves", () => {
  assert.match(publicController, /const send = \(\) => \{ if \(frameReady && config\)/);
  assert.match(publicController, /experienceWrap\.hidden = false;\s*\n\s*send\(\);/);
});

test("public mode also hides the owner-only 'YOUR GAMID' eyebrow label, and the CSS respects the hidden attribute instead of forcing the badge visible", async () => {
  assert.match(previewHtml, /id="previewEyebrow"/);
  assert.match(previewController, /previewEyebrow\.hidden=Boolean\(config\.publicMode\)/);
  const previewCss = await readFile(new URL("../dist/account/intro-preview.css", import.meta.url), "utf8");
  assert.match(previewCss, /\.preview-private\[hidden\]\{display:none\}/);
});
