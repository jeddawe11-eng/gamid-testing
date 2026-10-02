// Public Wall publishing (TESTING): Wall Draft -> Publish -> Published Wall on the visitor's /@handle; Unpublish -> the Public Profile again.
// The live database behavior (privileges, the public-identity gate, published-only media, drafts staying private, delete protection, unpublish) is
// tests/integration/wall-publishing-db.sql; this file pins the migration's shape, the owner client, the visitor page wiring and the shared renderer reuse.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { createWallPersistence, publicationState, toPublicationRecord } from "../dist/wall/persistence.js";
import { preparePublicWall, visitorSnapshot, WALL_MAX_WIDTH } from "../dist/public/public-wall.js";
import { publicWallBucketFor } from "../dist/account/supabase-client.js";
import { createImagePayload } from "../dist/wall-kit/image.js";
import { createVideoBackground } from "../dist/wall-kit/background.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const MIGRATION = "supabase/migrations/20261002120000_wall_public_publishing.sql";
const sql = read(MIGRATION);
const code = sql.replace(/--.*$/gm, "");
const PIC = "3f2b8c1e-5a4d-4e7b-9c60-1d2e3f4a5b6c", VID = "bbbbbbbb-0000-4000-8000-000000000003", UNUSED = "aaaaaaaa-0000-4000-8000-000000000009";

// ---------- the migration ----------
test("P1 additive and reversible: one new table, new functions, one storage SELECT policy; nothing dropped, no existing data written", () => {
  assert.match(code, /create table public\.wall_publications \(/);
  assert.match(code, /alter table public\.wall_publications enable row level security;/);
  assert.match(code, /revoke all on table public\.wall_publications from public, anon, authenticated;/);
  assert.match(code, /constraint wall_publications_document_is_valid check \(cardinality\(private\.wall_document_errors\(document\)\) = 0\)/, "a published document is a valid Wall, as for drafts");
  const statements = code.replace(/\$\$[\s\S]*?\$\$/g, "$$ <body> $$");
  assert.doesNotMatch(statements, /\bdrop\s|\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\.|\binsert\s+into\b|\balter\s+table\s+(?!public\.wall_publications\b)/i, "no destructive statement and no data written by the migration");
  assert.doesNotMatch(code, /grant\s+[^;]*\bon\s+table\b/i, "no table grant of any kind");
  assert.match(sql, /Rollback: drop policy "published wall media is readable"/, "the rollback is written down");
});

test("P2 privileges: owner calls for signed-in users only; the visitor call (and the storage check) for anon + authenticated; definers pin search_path", () => {
  assert.match(code, /grant execute on function\s+private\.publish_my_wall_impl\(bigint\), private\.unpublish_my_wall_impl\(\), private\.get_my_wall_publication_impl\(\),\s+public\.publish_my_wall\(bigint\), public\.unpublish_my_wall\(\), public\.get_my_wall_publication\(\)\s+to authenticated;/);
  assert.match(code, /grant execute on function private\.get_public_wall_impl\(text\), public\.get_public_wall\(text\), private\.wall_object_is_published\(text, text\) to anon, authenticated;/);
  assert.equal([...code.matchAll(/grant execute/g)].length, 2, "nothing else is granted");
  for (const body of code.split(/\ncreate (?:or replace )?function /).slice(1)) {
    const name = body.slice(0, body.indexOf("("));
    assert.match(body, /set search_path = ''/, `${name} pins search_path`);
    if (name.startsWith("public.")) assert.ok(/security invoker/.test(body) && !/security definer/.test(body), `${name} is a security invoker wrapper`);
  }
  // owner calls take no owner / identity argument: the owner comes from auth.uid()
  for (const name of ["publish_my_wall_impl", "unpublish_my_wall_impl", "get_my_wall_publication_impl"]) assert.match(code, new RegExp(`create function private\\.${name}\\([^)]*\\)[\\s\\S]*?private\\.wall_owned_entity_id\\(\\)`), name);
});

test("P3 visitors: exactly the public profile's gate (SOLO + PUBLIC + the same handle normalizer), the SNAPSHOT only, and only the assets it references", () => {
  const impl = code.slice(code.indexOf("create function private.get_public_wall_impl"), code.indexOf("create function public.get_public_wall"));
  assert.match(impl, /join public\.wall_publications w on w\.entity_id = e\.entity_id/);
  assert.match(impl, /where e\.gamid_handle = private\.normalize_handle\(candidate_handle\)\s+and e\.entity_type = 'SOLO'\s+and e\.visibility = 'PUBLIC'/);
  assert.doesNotMatch(impl, /wall_drafts/, "the draft is never read for a visitor");
  assert.match(impl, /a\.asset_id::text = any \(private\.wall_document_asset_ids\(w\.document\)\)/, "only referenced assets");
  const check = code.slice(code.indexOf("create function private.wall_object_is_published"), code.indexOf("create policy"));
  assert.match(check, /e\.entity_type = 'SOLO'\s+and e\.visibility = 'PUBLIC'/);
  assert.match(check, /a\.asset_id::text = any \(private\.wall_document_asset_ids\(w\.document\)\)/);
  assert.doesNotMatch(check, /wall_drafts/);
  assert.match(code, /create policy "published wall media is readable"\s+on storage\.objects for select to anon, authenticated\s+using \(bucket_id in \('wall-media', 'wall-video', 'wall-video-derived'\) and private\.wall_object_is_published\(bucket_id, name\)\);/, "SELECT only - nobody can write through it");
  assert.equal([...code.matchAll(/create policy/g)].length, 1, "the owner-only policies are untouched");
});

test("P4 publish = the SAVED draft the owner is looking at; a published asset can't be deleted from under visitors", () => {
  const publish = code.slice(code.indexOf("create function private.publish_my_wall_impl"), code.indexOf("create function private.unpublish_my_wall_impl"));
  assert.match(publish, /select \* into draft from public\.wall_drafts d where d\.entity_id = owned_entity_id;/);
  assert.match(publish, /if draft\.revision <> candidate_expected_revision then\s+raise exception using errcode = 'PT409', message = 'WALL_REVISION_CONFLICT'/);
  assert.match(publish, /values \(owned_entity_id, draft\.document, draft\.revision, now\(\)\)/, "a copy of the stored draft - never a document from the client");
  const del = code.slice(code.indexOf("create or replace function private.delete_my_wall_asset_impl"));
  assert.match(del, /from public\.wall_publications w where w\.entity_id = owned_entity_id/);
  assert.match(del, /if coalesce\(in_use, false\) or coalesce\(in_published, false\) then raise exception using errcode = 'PT409', message = 'WALL_ASSET_IN_USE'/);
});

// ---------- the owner client ----------
test("O1 the owner client: publish sends only the expected revision, unpublish nothing; status is Not published / Published / Unpublished changes", async () => {
  const calls = [];
  const rpc = async (name, body) => {
    calls.push([name, body]);
    if (name === "publish_my_wall") return [{ draft_revision: body.candidate_expected_revision, published_at: "2026-10-02T10:00:00Z" }];
    if (name === "unpublish_my_wall") return true;
    if (name === "get_my_wall_publication") return [];
    return null;
  };
  const wall = createWallPersistence({ rpc });
  assert.equal(await wall.loadPublication(), null);
  assert.deepEqual(await wall.publish(7), { draftRevision: 7, publishedAt: "2026-10-02T10:00:00Z" });
  assert.equal(await wall.unpublish(), true);
  assert.deepEqual(calls, [["get_my_wall_publication", {}], ["publish_my_wall", { candidate_expected_revision: 7 }], ["unpublish_my_wall", {}]]);
  assert.equal(toPublicationRecord({ draft_revision: null }), null);
  assert.equal(publicationState(null, { revision: 3, dirty: false }), "unpublished");
  assert.equal(publicationState({ draftRevision: 3 }, { revision: 3, dirty: false }), "published");
  assert.equal(publicationState({ draftRevision: 3 }, { revision: 3, dirty: true }), "changes", "unsaved edits are not what visitors see");
  assert.equal(publicationState({ draftRevision: 3 }, { revision: 4, dirty: false }), "changes", "a newer SAVED draft is not published yet");
  await assert.rejects(() => createWallPersistence({ rpc: async () => { throw Object.assign(new Error("WALL_REVISION_CONFLICT"), { payload: { message: "WALL_REVISION_CONFLICT", details: "9" } }); } }).publish(8), error => error.code === "WALL_REVISION_CONFLICT" && error.currentRevision === 9);
});

test("O2 the editor: Publish saves unsaved edits first, then publishes that exact revision; Unpublish asks first; the status chip and the public link", () => {
  const html = read("dist/wall-editor/index.html"), editor = read("dist/wall-editor/editor.js");
  for (const id of ["publishBtn", "publishState", "unpublishBtn", "publicLink"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(editor, /const PUBLISH_TEXT = \{ unpublished: "Not published", published: "Published", changes: "Unpublished changes" \};/);
  assert.match(editor, /if \(session\.dirty \|\| session\.status === "unsaved" \|\| session\.status === "error"\) \{\s+await save\(\);\s+if \(session\.dirty \|\| session\.status !== "saved"\) return;/);
  assert.match(editor, /const record = await persistence\.publish\(session\.state\.revision\);/);
  assert.match(editor, /window\.confirm\("Unpublish your Wall\? Visitors will see your Public Profile again\. Your Wall draft is kept\."\)/);
  assert.match(editor, /\$\("publicLink"\)\.href = new URL\(`\.\.\/@\$\{encodeURIComponent\(handle\)\}`, location\.href\)\.href;/);
});

// ---------- the visitor page ----------
const publishedDoc = () => {
  const doc = createDocument({ stageCount: 1 });
  doc.background = createVideoBackground(VID);
  doc.stages[0].elements = [createElement({ id: "p", type: "image", x: 0, y: 0, width: 400, height: 300, z: 0, payload: createImagePayload(PIC) })];
  return doc;
};
const fakeApi = (calls = []) => ({
  loadPublicWallPicture: async path => { calls.push(["picture", path]); return `blob:https://x/${path}`; },
  signPublicWallVideo: async (path, mime) => { calls.push(["video", path, mime]); return `https://project.supabase.co/storage/v1/object/sign/wall-video/${path}?token=t`; },
  getPublicIdentity: async handle => ({ gamid_handle: handle, display_name: "Pub A", bio: "hi", role_keys: ["streamer"], role_catalog: [{ key: "streamer", label: "Streamer" }], public_sections: {} }),
  getPublicMyGames: async () => ({ games: [], total_count: 0 }),
  loadPublicAvatar: async () => null,
});

test("V1 a visitor's Wall: pictures through the anonymous published-media read, videos through a signed stream - only the assets the snapshot lists", async () => {
  const calls = [];
  const ready = await preparePublicWall({ document: publishedDoc(), assets: [
    { asset_id: PIC, storage_path: "u/pic.png", mime_type: "image/png" },
    { asset_id: VID, storage_path: "u/vid.mp4", mime_type: "video/mp4" },
  ] }, "puba", fakeApi(calls));
  assert.deepEqual(calls.sort(), [["picture", "u/pic.png"], ["video", "u/vid.mp4", "video/mp4"]]);
  assert.equal(ready.assets.urlFor(PIC), "blob:https://x/u/pic.png");
  assert.match(ready.assets.videoUrlFor(VID), /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/sign\/wall-video\//);
  assert.equal(ready.assets.urlFor(UNUSED), null, "nothing else can be resolved");
  assert.equal(ready.gamid.public.available, true);
  assert.deepEqual([ready.gamid.profile.displayName, ready.gamid.roles.map(role => role.label)], ["Pub A", ["Streamer"]], "live data = the anonymous public view only");
  assert.equal(await preparePublicWall({ document: { schemaVersion: 99 } }, "puba", fakeApi()), null, "an invalid document is never drawn");
  assert.equal(visitorSnapshot(null).public.available, false);
  assert.deepEqual(["u/a.png", "u/b.mp4", "u/c.webm", "u/job.h264.mp4"].map((path, i) => publicWallBucketFor(path, ["image/png", "video/mp4", "video/webm", "video/mp4"][i])), ["wall-media", "wall-video", "wall-video", "wall-video-derived"]);
  assert.ok(WALL_MAX_WIDTH === 900);
});

test("V2 /@handle: Intro -> Published Wall when one exists (it replaces the profile body); otherwise the accepted Public Profile, line for line", () => {
  const page = read("dist/public/public.js");
  // the accepted handshake lines are unchanged
  for (const line of ['replayButton.hidden = !hasIntro || event.data.state !== "profile";', 'sectionsPanel.hidden = !hasSections || event.data.state !== "profile";', 'gamesBlock.hidden = !hasGames || event.data.state !== "profile";', 'layout.setProfileShowing(event.data.state === "profile");']) assert.ok(page.includes(line), line);
  assert.match(page, /if \(wall\) showWall\(event\.data\.state\);/, "the Wall only exists once a published one was found");
  assert.match(page, /const \[built, published\] = await Promise\.all\(\[buildConfig\(identity\), getPublicWall\(identity\.gamid_handle\)\.catch\(\(\) => null\)\]\);/, "a lookup failure falls back to the Public Profile");
  assert.match(page, /if \(published\?\.document\) \{/);
  assert.match(page, /if \(state === "profile" \|\| state === "transitioning"\) \{\s+sectionsPanel\.hidden = true; gamesBlock\.hidden = true;/);
  assert.match(page, /if \(!wall\.showing\) \{ root\.classList\.add\("is-public-wall"\); wall\.show\(\); scrollTo\(0, 0\); \}/);
  assert.match(page, /root\.classList\.toggle\("is-public-wall-reveal", state === "transitioning"\);\s+experienceWrap\.hidden = state === "profile";/, "during the transition the Wall is behind the Intro frame");
  assert.match(page, /\} else if \(wall\.showing\) \{ wall\.hide\(\); root\.classList\.remove\("is-public-wall", "is-public-wall-reveal"\); experienceWrap\.hidden = false; \}/, "Replay Intro gives the stage back to the Intro");
  const css = read("dist/public/public.css");
  assert.match(css, /html\.is-public-wall \.experience-wrap\{display:none\}/);
  assert.match(css, /html\.is-public-wall\.is-public-wall-reveal \.experience-wrap\{display:block;background:transparent\}/);
  assert.match(css, /html\.is-public-live\.is-public-wall\{overflow-x:hidden;overflow-y:auto\}/, "the Wall scrolls like a page (vertically only)");
  assert.match(css, /html\.is-public-wall\{scrollbar-gutter:stable\}/, "the page scrollbar never changes the Wall's width (like the flow mode)");
  // the Worker's crawler metadata is unchanged (the Identity Card stays the share preview)
  assert.doesNotMatch(read("cf-worker/worker.mjs"), /wall/i);
});

test("V2b no flash: with a published Wall the Intro frame is asked for hostReveal - its transition reveals the Wall, the old profile card is never shown; opt-in only", () => {
  const page = read("dist/public/public.js");
  assert.match(page, /config = wall \? \{ \.\.\.built, hostReveal: true \} : built;/, "only when a published Wall exists");
  const frameJs = read("dist/account/intro-preview.js");
  assert.match(frameJs, /function play\(config\)\{ document\.documentElement\.dataset\.flow=config\.publicMode===true\?"on":"";document\.documentElement\.classList\.toggle\("host-reveal",config\.hostReveal===true\);/, "set (or cleared) on every play, Replay included");
  assert.equal([...frameJs.matchAll(/hostReveal/g)].length, 1, "the Intro's own logic and transitions are otherwise untouched");
  const frameCss = read("dist/account/intro-preview.css");
  assert.match(frameCss, /html\.host-reveal,html\.host-reveal body,html\.host-reveal \.experience\{background:transparent\}\nhtml\.host-reveal \.profile\{visibility:hidden\}/);
  assert.equal([...frameCss.matchAll(/host-reveal/g)].length, 4, "every rule is scoped to host-reveal: owner previews and GamIDs without a Wall are unchanged");
  assert.doesNotMatch(read("dist/account/account.js"), /hostReveal/, "the owner's own Intro preview never asks for it");
});

test("V3 one renderer: the visitor Wall is painted by the same Preview pipeline (paintDocument in VIEW mode, players, posters, details, video pool)", () => {
  const module = read("dist/public/public-wall.js");
  assert.match(module, /paintDocument\(ready\.doc, target, undefined, \{ mode: "view", assets: ready\.assets, gamid: ready\.gamid, players, posters, details, videos \}\)/);
  assert.match(module, /doc: normalizeEmbedLayering\(doc\)\.doc/, "the same layering rule Preview applies");
  assert.doesNotMatch(module, /function paint(Stage|Element|Image|Text)\b|createElement\("(img|video)"\)/, "no second renderer");
  const editor = read("dist/wall-editor/editor.js");
  assert.match(editor, /paintDocument\(ops\.normalizeEmbedLayering\(session\.doc\)\.doc, width, undefined, \{ mode: "view"/, "Preview still uses the same call");
});
