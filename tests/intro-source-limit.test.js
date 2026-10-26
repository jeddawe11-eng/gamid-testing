// Intro source upload limit: 50 MiB = 52,428,800 bytes (was 150 MiB = 157,286,400; Mazen's decision 2026-10-11, ISS-0012: it matches the effective TESTING
// upload limit). Every enforcement point carries the same number; the duration limit, formats, processing and every other media limit are untouched.
// (Live database behavior: tests/integration/intro-source-limit-db.sql.)
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { INTRO_MAX_DURATION_MS, INTRO_SOURCE_MAX_BYTES, INTRO_SOURCE_TYPES, validateIntroSource } from "../dist/account/domain.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const stripSql = sql => sql.replace(/--.*$/gm, "");
const OLD = 157_286_400, NEW = 52_428_800, MiB = 1024 * 1024;
const migrationName = "20261011260000_intro_source_limit_50mib.sql";
const migration = stripSql(read(`supabase/migrations/${migrationName}`));
const worker = read("worker/intro-worker.mjs");
const client = read("dist/account/supabase-client.js");
const html = read("dist/account/index.html");
const domain = read("dist/account/domain.js");

test("the unit convention is unchanged (MiB, shown as MB) and the new limit is exactly 52,428,800 bytes", () => {
  assert.equal(50 * MiB, NEW);
  assert.equal(INTRO_SOURCE_MAX_BYTES, NEW);
  assert.equal(150 * MiB, OLD);
  assert.match(domain, /export const INTRO_SOURCE_MAX_BYTES = 50 \* 1024 \* 1024;/);
  assert.match(domain, /1024\*1024-byte units \(MiB\)/, "the unit is documented where the constant lives");
});

test("browser validation: exactly 50 MiB is accepted, 50 MiB + 1 byte is refused, and the old 150 MiB limit no longer admits anything above 50 MiB", () => {
  const file = size => ({ type: "video/mp4", size });
  assert.equal(validateIntroSource(file(NEW), 20_000).valid, true, "exactly 52,428,800 bytes");
  assert.equal(validateIntroSource(file(NEW + 1), 20_000).reason, "INTRO_SOURCE_TOO_LARGE", "52,428,801 bytes");
  assert.equal(validateIntroSource(file(49 * MiB), 20_000).valid, true);
  for (const size of [51 * MiB, 116_291_584, OLD]) assert.equal(validateIntroSource(file(size), 20_000).reason, "INTRO_SOURCE_TOO_LARGE", String(size));
  assert.equal(validateIntroSource(file(0), 20_000).reason, "INTRO_SOURCE_TOO_LARGE");
  for (const type of INTRO_SOURCE_TYPES) assert.equal(validateIntroSource({ type, size: NEW }, 20_000).valid, true);
  assert.equal(validateIntroSource({ type: "video/avi", size: 1000 }, 20_000).reason, "INVALID_INTRO_TYPE");
});

test("the duration contract is unchanged (0.5-30 s, inclusive 31 s technical tolerance)", () => {
  assert.equal(INTRO_MAX_DURATION_MS, 31_000);
  assert.equal(validateIntroSource({ type: "video/mp4", size: MiB }, 31_000).valid, true);
  assert.equal(validateIntroSource({ type: "video/mp4", size: MiB }, 31_001).reason, "INTRO_DURATION_INVALID");
  assert.equal(validateIntroSource({ type: "video/mp4", size: MiB }, 499).reason, "INTRO_DURATION_INVALID");
  assert.match(migration, /candidate_duration_ms < 500 or candidate_duration_ms > 31000/);
  assert.match(worker, /const MAX_DURATION_SECONDS = 31;/);
});

test("the second browser guard (before the resumable upload starts) uses the same constant and the new wording", () => {
  assert.match(client, /import \{ INTRO_SOURCE_MAX_BYTES \} from "\.\/domain\.js";/);
  assert.match(client, /if \(file\.size > INTRO_SOURCE_MAX_BYTES\) throw new ApiError\("Intro video must be 50 MB or smaller\.", 400, "INTRO_SOURCE_TOO_LARGE"\)/);
  assert.match(domain, /INTRO_SOURCE_TOO_LARGE: "Intro video must be 50 MB or smaller\."/);
});

test("help text and messages say 50 MB everywhere a person can see the Intro limit; nothing still says 150 MB; other limits are untouched", () => {
  assert.match(html, /MP4, MOV, or WebM · max 50 MB\./);
  for (const path of ["dist/account/index.html", "dist/account/account.js", "dist/account/domain.js", "dist/account/supabase-client.js"]) assert.doesNotMatch(read(path), /150 ?MB|150 ?MiB|150 \* 1024|157286400/, path);
  assert.match(html, /max 30 seconds/, "the duration wording is untouched");
  assert.match(html, /Avatar[\s\S]*max 5 MB/, "the Avatar limit is untouched");
});

test("SERVER side: one additive migration lowers the bucket limit, the RPC bound and the table CHECK to exactly 52428800 (earlier migrations untouched)", () => {
  const all = readdirSync(new URL("../supabase/migrations/", import.meta.url)).sort();
  assert.ok(all.includes(migrationName), "the migration exists (later, unrelated migrations are checked below never to touch the Intro limit)");
  assert.match(migration, /update storage\.buckets set file_size_limit = 52428800 where id = 'intro-sources';/);
  assert.match(migration, /drop constraint intro_processing_jobs_source_size_bytes_check;/);
  assert.match(migration, /add constraint intro_processing_jobs_source_size_bytes_check check \(source_size_bytes >= 1 and source_size_bytes <= 52428800\)/);
  assert.match(migration, /if candidate_source_size < 1 or candidate_source_size > 52428800 then raise exception using errcode='22023', message='INTRO_SOURCE_TOO_LARGE'; end if;/);
  assert.doesNotMatch(migration, /157286400/, "the old number is gone from the new migration");
  assert.doesNotMatch(migration, /intro-media|\b15728640\b|wall-|avatars|quota/, "the derivative bucket, Wall / Avatar media and the quota are not touched");
  assert.doesNotMatch(migration, /\bgrant\b|\brevoke\b/i, "privileges are preserved, neither widened nor narrowed");
  // history is never rewritten: the earlier migrations keep their numbers
  assert.match(read("supabase/migrations/20260921100000_intro_source_limit_150mib.sql"), /update storage\.buckets set file_size_limit = 157286400 where id = 'intro-sources';/);
  assert.match(read("supabase/migrations/20260916170000_slice_3c_intro_identity.sql"), /'intro-sources', 'intro-sources', false, 104857600/);
});

test("the re-declared RPC body differs from the previous definition (20261007160000_intro_duration_tolerance) only in the size constant", () => {
  const bodyOf = sql => { const start = sql.indexOf("queue_my_intro_impl("); const open = sql.indexOf("$", sql.indexOf(" as ", start) >= 0 ? sql.toLowerCase().indexOf(" as ", start) : start); const tag = sql.slice(open, sql.indexOf("$", open + 1) + 1); const from = open + tag.length; return sql.slice(from, sql.indexOf(tag, from)).replace(/\s+/g, " ").trim(); };
  const before = bodyOf(stripSql(read("supabase/migrations/20261007160000_intro_duration_tolerance.sql")));
  assert.ok(before.includes("157286400"), "the previous body carried the 150 MiB bound");
  assert.equal(bodyOf(migration), before.replace("157286400", "52428800"));
});

test("WORKER: its own defensive 150 MiB processing ceiling, derivative ceiling, duration and D3 codec settings are unchanged (the worker image is not redeployed)", () => {
  assert.match(worker, /const MAX_SOURCE_BYTES = 150 \* 1024 \* 1024;/);
  assert.match(worker, /if \(sourceStat\.size > MAX_SOURCE_BYTES\) throw new Error\("SOURCE_TOO_LARGE"\)/);
  assert.match(worker, /const MAX_OUTPUT_BYTES = 15 \* 1024 \* 1024;/);
  assert.match(worker, /"-c:v","libvpx-vp9","-crf","40","-b:v","0","-deadline","good","-cpu-used","2","-row-mt","1","-pix_fmt","yuv420p"/);
  assert.match(worker, /if \(result\.size > MAX_OUTPUT_BYTES\) throw new Error\("DERIVATIVE_TOO_LARGE"\)/);
});

test("no other migration redefines the Intro source limit after this one, and the Usage gateway never changes bucket caps", () => {
  const later = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter(name => name > migrationName);
  // Intro Thumbnail for Discord only READS the Intro jobs (its share copies reference the active job); it never touches the source path, table limits or queue
  const readsIntroJobs = new Set(["20261026120000_intro_discord_thumbnail.sql"]);
  for (const name of later) {
    const sql = stripSql(read(`supabase/migrations/${name}`));
    assert.doesNotMatch(sql, readsIntroJobs.has(name) ? /intro-sources|queue_my_intro|source_size_bytes|52428800|157286400|alter\s+table\s+public\.intro_processing_jobs|update\s+public\.intro_processing_jobs/i
      : /intro-sources|intro_processing_jobs|queue_my_intro|source_size_bytes|52428800|157286400/i, `${name} leaves the Intro source limit alone`);
  }
  const usage = stripSql(read("supabase/migrations/20261004170252_global_usage_gateway.sql"));
  assert.doesNotMatch(usage, /alter\s+table\s+storage\.buckets|update\s+storage\.buckets|52428800|157286400/i, "Usage reuses bucket limits and extends ownership only");
});
