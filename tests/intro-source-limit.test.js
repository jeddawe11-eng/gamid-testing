// Intro source upload limit: 150 MiB = 157,286,400 bytes (was 100 MiB = 104,857,600). Every enforcement point carries the same number,
// the duration limit and all media processing are untouched. (Live database behavior: tests/integration/intro-source-limit-db.sql.)
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { INTRO_MAX_DURATION_MS, INTRO_SOURCE_MAX_BYTES, INTRO_SOURCE_TYPES, validateIntroSource } from "../dist/account/domain.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stripSql = sql => sql.replace(/--.*$/gm, "");
const OLD = 104_857_600, NEW = 157_286_400, MiB = 1024 * 1024;
const migrationName = "20260921100000_intro_source_limit_150mib.sql";
const migration = stripSql(read(`supabase/migrations/${migrationName}`));
const worker = read("worker/intro-worker.mjs");
const client = read("dist/account/supabase-client.js");
const html = read("dist/account/index.html");
const domain = read("dist/account/domain.js");

test("the unit convention is unchanged (MiB, shown as MB) and the new limit is exactly 157,286,400 bytes", () => {
  assert.equal(150 * MiB, NEW);
  assert.equal(INTRO_SOURCE_MAX_BYTES, NEW);
  assert.equal(100 * MiB, OLD);
  assert.match(domain, /export const INTRO_SOURCE_MAX_BYTES = 150 \* 1024 \* 1024;/);
  assert.match(domain, /1024\*1024-byte units \(MiB\)/, "the unit is documented where the constant lives");
});

test("browser validation: exactly 150 MiB is accepted, one byte more is refused, and the old limit no longer blocks", () => {
  const file = size => ({ type: "video/mp4", size });
  assert.equal(validateIntroSource(file(NEW), 20_000).valid, true);
  assert.equal(validateIntroSource(file(NEW + 1), 20_000).reason, "INTRO_SOURCE_TOO_LARGE");
  assert.equal(validateIntroSource(file(OLD + 1), 20_000).valid, true, "a 100 MiB + 1 byte source is now accepted");
  assert.equal(validateIntroSource(file(120 * MiB), 20_000).valid, true);
  assert.equal(validateIntroSource(file(0), 20_000).reason, "INTRO_SOURCE_TOO_LARGE");
  for (const type of INTRO_SOURCE_TYPES) assert.equal(validateIntroSource({ type, size: NEW }, 20_000).valid, true);
  assert.equal(validateIntroSource({ type: "video/avi", size: 1000 }, 20_000).reason, "INVALID_INTRO_TYPE");
});

test("the Intro DURATION limit is unchanged (0.5 s to 30 s) in the browser, the RPC, the table and the worker", () => {
  assert.equal(INTRO_MAX_DURATION_MS, 30_000);
  assert.equal(validateIntroSource({ type: "video/mp4", size: MiB }, 30_000).valid, true);
  assert.equal(validateIntroSource({ type: "video/mp4", size: MiB }, 30_001).reason, "INTRO_DURATION_INVALID");
  assert.equal(validateIntroSource({ type: "video/mp4", size: MiB }, 499).reason, "INTRO_DURATION_INVALID");
  assert.match(migration, /candidate_duration_ms < 500 or candidate_duration_ms > 30000/);
  assert.match(worker, /const MAX_DURATION_SECONDS = 30;/);
  assert.match(worker, /source\.duration < \.5 \|\| source\.duration > MAX_DURATION_SECONDS/);
});

test("the second browser guard (before the resumable upload starts) uses the same constant and the new wording", () => {
  assert.match(client, /import \{ INTRO_SOURCE_MAX_BYTES \} from "\.\/domain\.js";/);
  assert.match(client, /if \(file\.size > INTRO_SOURCE_MAX_BYTES\) throw new ApiError\("Intro video must be 150 MB or smaller\.", 400, "INTRO_SOURCE_TOO_LARGE"\)/);
  assert.doesNotMatch(client, /100 \* 1024 \* 1024|100 MB/);
  assert.match(domain, /INTRO_SOURCE_TOO_LARGE: "Intro video must be 150 MB or smaller\."/);
});

test("help text and messages say 150 MB everywhere a person can see a limit, and nothing still says 100 MB", () => {
  assert.match(html, /MP4, MOV, or WebM · max 150 MB\./);
  for (const path of ["dist/account/index.html", "dist/account/account.js", "dist/account/domain.js", "dist/account/supabase-client.js"]) assert.doesNotMatch(read(path), /100 MB|100 MiB/, path);
  assert.match(html, /max 30 seconds/, "the duration wording is untouched");
  assert.match(html, /Avatar[\s\S]*max 5 MB/, "the avatar limit is untouched");
});

test("SERVER side: a new additive migration raises the bucket limit, the RPC bound and the table CHECK to exactly 157286400 (earlier migrations untouched)", () => {
  const all = readdirSync(new URL("../supabase/migrations/", import.meta.url)).sort();
  assert.ok(all.indexOf(migrationName) > all.indexOf("20260921000000_game_playtime_visibility.sql"), "it comes after the playtime migration");
  assert.match(migration, /update storage\.buckets set file_size_limit = 157286400 where id = 'intro-sources';/);
  assert.match(migration, /add constraint intro_processing_jobs_source_size_bytes_check check \(source_size_bytes >= 1 and source_size_bytes <= 157286400\)/);
  assert.match(migration, /if candidate_source_size < 1 or candidate_source_size > 157286400 then raise exception using errcode='22023', message='INTRO_SOURCE_TOO_LARGE'; end if;/);
  assert.doesNotMatch(migration, /104857600/, "the old number is gone from the new migration");
  assert.doesNotMatch(migration, /intro-media|\b15728640\b/, "the derivative bucket and its ceiling are not touched");
  assert.match(migration, /create or replace function private\.queue_my_intro_impl\([\s\S]*language plpgsql security definer set search_path = ''/);
  assert.doesNotMatch(migration, /\bgrant\b|\brevoke\b/i, "privileges are preserved, neither widened nor narrowed");
  // the historical migration keeps its original numbers (history is never rewritten)
  assert.match(read("supabase/migrations/20260916170000_slice_3c_intro_identity.sql"), /'intro-sources', 'intro-sources', false, 104857600/);
});

test("the re-declared RPC differs from the original only in the size constant", () => {
  const original = read("supabase/migrations/20260916170000_slice_3c_intro_identity.sql");
  const fnOf = sql => sql.slice(sql.indexOf("create function private.queue_my_intro_impl") > -1 ? sql.indexOf("create function private.queue_my_intro_impl") : sql.indexOf("create or replace function private.queue_my_intro_impl"));
  const before = fnOf(stripSql(original)), after = fnOf(migration);
  const body = text => text.slice(text.indexOf("returns table"), text.indexOf("$$;", text.indexOf("returns table")) + 3).replace(/\s+/g, " ");
  assert.equal(body(after), body(before).replace("104857600", "157286400"));
});

test("WORKER: its own SOURCE_TOO_LARGE guard uses 150 MiB; the derivative ceiling, duration and all D3 encode settings are unchanged", () => {
  assert.match(worker, /const MAX_SOURCE_BYTES = 150 \* 1024 \* 1024;/);
  assert.match(worker, /if \(sourceStat\.size > MAX_SOURCE_BYTES\) throw new Error\("SOURCE_TOO_LARGE"\)/);
  assert.match(worker, /const MAX_OUTPUT_BYTES = 15 \* 1024 \* 1024;/);
  assert.match(worker, /"-c:v","libvpx-vp9","-crf","40","-b:v","0","-deadline","good","-cpu-used","2","-row-mt","1","-pix_fmt","yuv420p"/);
  assert.match(worker, /"-c:a","libopus","-b:a","32k","-vbr","on","-application","audio"/);
  assert.match(worker, /result\.video\.width !== source\.video\.width \|\| result\.video\.height !== source\.video\.height/);
  assert.match(worker, /if \(result\.size > MAX_OUTPUT_BYTES\) throw new Error\("DERIVATIVE_TOO_LARGE"\)/);
});

test("no other place in the product still enforces the old Intro source number", () => {
  const roots = ["dist/account/account.js", "dist/account/domain.js", "dist/account/supabase-client.js", "dist/account/resumable-upload.js", "dist/account/index.html", "worker/intro-worker.mjs", "worker/intro-dispatcher.mjs"];
  for (const path of roots) assert.doesNotMatch(read(path), /104857600|100 \* 1024 \* 1024|100 ?MB|100 ?MiB/, path);
  const later = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter(name => name > "20260916170000_slice_3c_intro_identity.sql");
  for (const name of later.filter(item => item !== migrationName)) assert.doesNotMatch(stripSql(read(`supabase/migrations/${name}`)), /queue_my_intro_impl|intro-sources/, `${name} does not redefine the Intro source limit`);
});

test("the change is confined to the Intro source limit: presentation, games, playtime and connections code are untouched", () => {
  assert.match(read("dist/account/intro-preview.js"), /resolvePresentation/);
  assert.match(read("dist/video-fit.js"), /export const MAX_UPSCALE = 1\.5;/);
  assert.doesNotMatch(migration, /steam|discord|league|playtime|game|profiles\b/i);
});