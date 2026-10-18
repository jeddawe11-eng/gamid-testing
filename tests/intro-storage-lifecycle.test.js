// ISS-0011 (Intro storage lifecycle) + ISS-0012 (effective upload limit): the migration runs in an isolated PGlite Postgres with minimal stand-ins for the tables it
// reads; the gateway runs against a fake Supabase. What is checked: a refused upload start releases only its own still-unbound reservation, abandoned unbound
// receipts are reconciled safely after a grace period, failed sources become eligible after the retention, a removed Intro is cleaned without a new upload, and
// nothing that was already due before the migration (historical) or that is active / processing is ever selected.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { handleUsageUpload } from "../supabase/functions/_shared/usage-upload.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/20261011240000_intro_storage_lifecycle.sql");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const PA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const job = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema private; create schema storage;
    create table storage.objects (bucket_id text, name text, metadata jsonb, created_at timestamptz default now());
    create table private.usage_uploads (upload_id uuid primary key default gen_random_uuid(), owner_id uuid, bucket text, path text, expected_bytes bigint, content_type text,
      upstream_url text, state text not null default 'ACTIVE', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table public.intro_processing_jobs (job_id uuid primary key, profile_id uuid, owner_user_id uuid, state text, failure_code text, source_path text, derivative_path text,
      source_cleanup_eligible_at timestamptz, source_deleted_at timestamptz, derivative_cleanup_eligible_at timestamptz, derivative_deleted_at timestamptz,
      completed_at timestamptz, updated_at timestamptz);
    create table public.profile_intro_settings (profile_id uuid primary key, active_job_id uuid);
    insert into public.profile_intro_settings values ('${PA}', null), ('${PB}', null);
    -- the live definitions this migration replaces (so create or replace keeps working)
    create function private.worker_fail_intro_job_impl(candidate_job_id uuid, candidate_failure_code text) returns void language plpgsql as $$ begin null; end $$;
    create function private.worker_intro_cleanup_candidates_impl(candidate_limit integer default 20) returns table(job_id uuid, source_path text, derivative_path text) language sql as $$ select null::uuid, null::text, null::text where false $$;
    create function private.usage_cleanup_candidates(u uuid) returns jsonb language sql as $$ select '[]'::jsonb $$;
    create function private.usage_upload_action(i uuid, u uuid, a text, v text default null) returns jsonb language plpgsql as $$ begin return null; end $$;
    create function private.usage_reserved_bytes(u uuid) returns bigint language sql stable as $$
      select coalesce(sum(x.expected_bytes),0)::bigint from private.usage_uploads x where x.owner_id=u and x.state='ACTIVE' and not exists(select 1 from storage.objects o where o.bucket_id=x.bucket and o.name=x.path) $$;`);
  await db.exec(migration);
  const since = (await db.query("select automatic_since s from private.storage_lifecycle_policy")).rows[0].s;
  const at = secs => new Date(new Date(since).getTime() + secs * 1000).toISOString();
  return { db, since, at, q: async (sql, p = []) => (await db.query(sql, p)).rows };
}
const addJob = (f, n, values) => f.db.query(`insert into public.intro_processing_jobs (job_id, profile_id, owner_user_id, state, source_path, derivative_path, source_cleanup_eligible_at, source_deleted_at, derivative_cleanup_eligible_at, derivative_deleted_at)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [job(n), values.profile ?? PA, values.owner ?? A, values.state, values.source ?? `${values.owner ?? A}/${job(n)}/source.mp4`,
  values.derivative ?? null, values.srcElig ?? null, values.srcDel ?? null, values.derElig ?? null, values.derDel ?? null]);
const workerCandidates = async f => (await f.q("select job_id, source_path, derivative_path from private.worker_intro_cleanup_candidates_impl(100) order by job_id")).map(r => [r.job_id, Boolean(r.source_path), Boolean(r.derivative_path)]);

test("ISS-0011 failed Intro: its source becomes eligible after the explicit retention (1 hour), never at once, and only for failures from now on", async () => {
  const f = await fixture();
  await f.db.query("update private.storage_lifecycle_policy set automatic_since = now() - interval '1 day'");   // as if deployed a day ago
  await addJob(f, 1, { state: "processing" });
  await addJob(f, 2, { state: "failed" });   // a historical failure (before the migration): untouched
  await f.db.query("select private.worker_fail_intro_job_impl($1, 'D3_TIMING_OR_GEOMETRY_MISMATCH')", [job(1)]);
  const [row] = await f.q("select state, failure_code, extract(epoch from source_cleanup_eligible_at - completed_at)::int gap from public.intro_processing_jobs where job_id = $1", [job(1)]);
  assert.equal(row.state, "failed"); assert.equal(row.failure_code, "D3_TIMING_OR_GEOMETRY_MISMATCH");
  assert.equal(row.gap, 3600, "eligible exactly 1 hour after the failure");
  assert.deepEqual(await workerCandidates(f), [], "inside the retention nothing is due");
  await f.db.query("update public.intro_processing_jobs set source_cleanup_eligible_at = now() - interval '1 minute' where job_id = $1", [job(1)]);
  assert.deepEqual(await workerCandidates(f), [[job(1), true, false]], "after the retention the failed source is due");
  assert.equal((await f.q("select source_cleanup_eligible_at from public.intro_processing_jobs where job_id = $1", [job(2)]))[0].source_cleanup_eligible_at, null, "historical failures are not made eligible by the deployment");
});

test("ISS-0011 removed Intro: its derivative is due at once (no new upload needed); the active Intro, running jobs and anything due before the migration never are", async () => {
  const f = await fixture();
  await f.db.query("update private.storage_lifecycle_policy set automatic_since = now() - interval '1 day'");   // as if deployed a day ago
  const recent = "now() - interval '1 hour'", old = "now() - interval '2 days'";
  await addJob(f, 10, { state: "ready", derivative: `${A}/${job(10)}/intro-d3.webm` });   // removed after the deploy
  await addJob(f, 11, { state: "ready", derivative: `${A}/${job(11)}/intro-d3.webm` });   // eligible before the deploy (the 0.73 MB case)
  await addJob(f, 12, { state: "ready", derivative: `${A}/${job(12)}/intro-d3.webm` });   // eligible but it is the ACTIVE Intro
  await addJob(f, 13, { state: "processing" });                                            // running job: its source is never due
  await addJob(f, 14, { state: "ready", derivative: `${A}/${job(14)}/x.webm` });           // already deleted
  await f.db.query(`update public.intro_processing_jobs set derivative_cleanup_eligible_at = ${recent} where job_id = any($1)`, [[job(10), job(12)]]);
  await f.db.query(`update public.intro_processing_jobs set derivative_cleanup_eligible_at = ${old} where job_id = $1`, [job(11)]);
  await f.db.query(`update public.intro_processing_jobs set source_cleanup_eligible_at = ${recent} where job_id = $1`, [job(13)]);
  await f.db.query(`update public.intro_processing_jobs set source_cleanup_eligible_at = ${recent}, source_deleted_at = now(), derivative_cleanup_eligible_at = ${recent}, derivative_deleted_at = now() where job_id = $1`, [job(14)]);
  await f.db.query("update public.profile_intro_settings set active_job_id = $1 where profile_id = $2", [job(12), PA]);
  assert.deepEqual(await workerCandidates(f), [[job(10), false, true]], "only the removed (post-deploy) derivative");
  const owner = (await f.q("select private.usage_intro_cleanup_candidates($1) v", [A]))[0].v;
  assert.deepEqual(owner.map(c => [c.job_id, c.source_path, c.derivative_path]), [[job(10), null, `${A}/${job(10)}/intro-d3.webm`]]);
  assert.deepEqual((await f.q("select private.usage_intro_cleanup_candidates($1) v", [B]))[0].v, [], "another owner never sees these files");
});

test("ISS-0011 reservations: release_unbound frees only a never-started, object-less, ACTIVE receipt of its owner; Usage reserved bytes follow", async () => {
  const f = await fixture();
  const add = async (values) => (await f.q("insert into private.usage_uploads (owner_id, bucket, path, expected_bytes, content_type, upstream_url, state) values ($1, 'intro-sources', $2, $3, 'video/mp4', $4, $5) returning upload_id", [values.owner ?? A, values.path, values.bytes ?? 100, values.upstream ?? null, values.state ?? "ACTIVE"]))[0].upload_id;
  const unbound = await add({ path: `${A}/x/source.mp4`, bytes: 116291584 });
  const bound = await add({ path: `${A}/y/source.mp4`, bytes: 50, upstream: "https://example.test/upload/1" });
  const stored = await add({ path: `${A}/z/source.mp4`, bytes: 7 });
  await f.db.query("insert into storage.objects values ('intro-sources', $1, '{\"size\":\"7\"}')", [`${A}/z/source.mp4`]);
  assert.equal(Number((await f.q("select private.usage_reserved_bytes($1) n", [A]))[0].n), 116291634);
  const act = (id, owner = A) => f.q("select private.usage_upload_action($1, $2, 'release_unbound') v", [id, owner]);
  await assert.rejects(act(unbound, B), /UPLOAD_NOT_OWNED/, "never another owner's receipt");
  await assert.rejects(act(bound), /UPLOAD_IN_PROGRESS/, "a started (bound) upload keeps its reservation");
  await assert.rejects(act(stored), /UPLOAD_STILL_STORED/, "a receipt whose object exists is never released");
  assert.equal((await act(unbound))[0].v.state, "CANCELLED");
  await assert.rejects(act(unbound), /UPLOAD_IN_PROGRESS/, "idempotent: a released receipt cannot be released again");
  assert.equal(Number((await f.q("select private.usage_reserved_bytes($1) n", [A]))[0].n), 50, "reserved = only the genuine in-progress upload");
});

test("ISS-0011 abandoned receipts: an unbound receipt is reconciled after the 15-minute grace (created after the migration only); a bound one keeps the 26-hour rule", async () => {
  const f = await fixture();
  const add = (path, created, upstream = null) => f.db.query("insert into private.usage_uploads (owner_id, bucket, path, expected_bytes, content_type, upstream_url, created_at) values ($1, 'intro-sources', $2, 1, 'video/mp4', $3, $4)", [A, path, upstream, created]);
  await f.db.query("update private.storage_lifecycle_policy set automatic_since = now() - interval '2 days'");
  await add("fresh", new Date(Date.now() - 5 * 60 * 1000).toISOString());                                   // still being created: protected
  await add("abandoned", new Date(Date.now() - 20 * 60 * 1000).toISOString());                               // past the grace: reconciled
  await add("bound-recent", new Date(Date.now() - 20 * 60 * 1000).toISOString(), "https://example.test/u");   // a started upload: 26 h rule only
  await add("bound-old", new Date(Date.now() - 27 * 3600 * 1000).toISOString(), "https://example.test/v");
  await add("historical", new Date(Date.now() - 3 * 86400 * 1000).toISOString());                           // before automatic_since: only the 26-hour rule (it is past it)
  await f.db.query("update private.storage_lifecycle_policy set automatic_since = now() - interval '1 day'");
  await f.db.query("insert into private.usage_uploads (owner_id, bucket, path, expected_bytes, content_type, created_at) values ($1, 'intro-sources', 'pre-cutoff-recent', 1, 'video/mp4', now() - interval '25 hours')", [A]);
  const paths = (await f.q("select private.usage_cleanup_candidates($1) v", [A]))[0].v.map(r => r.path).sort();
  assert.deepEqual(paths, ["abandoned", "bound-old", "historical"], "pre-cutoff-recent waits for its 26 hours; fresh and bound-recent are protected");
  assert.deepEqual((await f.q("select private.usage_cleanup_candidates($1) v", [B]))[0].v, []);
});

test("ISS-0011 migration: additive; no object, receipt or job is changed by applying it; historical items keep their previous treatment", () => {
  const sql = migration.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(sql, /\b(delete\s+from|truncate|drop\s+(table|function|policy))\b/i);
  const outside = sql.replace(/\$(function)?\$[\s\S]*?\$(function)?\$/g, "");   // top-level statements only (function bodies removed)
  assert.doesNotMatch(outside, /\b(update|delete)\b/i, "applying it changes no row");
  assert.deepEqual(outside.match(/insert into [a-z_.]+/gi), ["insert into private.storage_lifecycle_policy"], "the only insert is the policy row");
  assert.match(sql, /failed_source_retention interval not null default interval '1 hour'/);
  assert.match(sql, /unbound_receipt_grace interval not null default interval '15 minutes'/);
  assert.match(sql, /grant execute on function private\.usage_intro_cleanup_candidates\(uuid\), public\.usage_intro_cleanup_candidates\(uuid\) to service_role;/);
});

// ---------------- gateway ----------------
const BASE = "https://upvtrczefcvigxdyuylw.supabase.co", TUS = "https://upvtrczefcvigxdyuylw.storage.supabase.co/storage/v1/upload/resumable";
const env = { supabaseUrl: BASE, serviceKey: "private-service-fixture", anonKey: "publishable-fixture" };
const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { "Content-Type": "application/json" } });
function gateway({ createStatus = 201, introCandidates = [], authorize = () => null } = {}) {
  const calls = [];
  const x = { upload_id: job(99), owner_id: A, bucket: "intro-sources", path: "", expected_bytes: 0, state: "ACTIVE", created_at: new Date().toISOString(), upstream_url: null };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, ...options, body: options.body && typeof options.body === "string" ? JSON.parse(options.body) : options.body });
    if (url.endsWith("/auth/v1/user")) return json({ id: A });
    if (url.includes("/rpc/")) {
      const name = url.split("/").at(-1), b = JSON.parse(options.body || "{}");
      if (name === "usage_gateway_probe") return json({}, 403);
      if (name === "reserve_usage_upload") { Object.assign(x, { path: b.candidate_path, expected_bytes: b.candidate_bytes }); return json(x); }
      if (name === "usage_upload_action") { if (b.candidate_action === "release_unbound") x.state = "CANCELLED"; return json(x); }
      if (name === "usage_cleanup_candidates") return json([]);
      if (name === "usage_intro_cleanup_candidates") return json(introCandidates);
      if (name === "authorize_usage_delete") { const refusal = authorize(b); return refusal ? json({ message: refusal }, 400) : new Response(null, { status: 204 }); }
      return new Response(null, { status: 204 });
    }
    if (url === TUS && options.method === "POST") return createStatus === 201 ? new Response(null, { status: 201, headers: { Location: `${TUS}/upstream-1` } }) : new Response("refused", { status: createStatus });
    if (url.includes("/storage/v1/object/") && options.method === "DELETE") return json({});
    throw Error(`unexpected ${url}`);
  };
  const run = (route, method, headers = {}) => handleUsageUpload({ request: new Request(`${BASE}/functions/v1/usage-upload/${route}`, { method, headers: { apikey: env.anonKey, Authorization: "Bearer owner", ...headers } }), env, fetchImpl });
  return { run, calls, x, rpcs: () => calls.filter(c => c.url.includes("/rpc/")).map(c => [c.url.split("/").at(-1), c.body?.candidate_action ?? null]) };
}
const tusMeta = (bucket, path, mime) => [["bucketName", bucket], ["objectName", path], ["contentType", mime]].map(([k, v]) => `${k} ${btoa(v)}`).join(",");

test("ISS-0011 / ISS-0012 gateway: Storage refusing to start (413 = over the effective upload limit) releases that attempt's own reservation and says so clearly", async () => {
  for (const [status, code, http] of [[413, "UPLOAD_TOO_LARGE", 413], [500, "RESUMABLE_CREATE_FAILED", 502]]) {
    const g = gateway({ createStatus: status });
    const r = await g.run("tus", "POST", { "Upload-Length": "116291584", "Upload-Metadata": tusMeta("intro-sources", `${A}/${job(7)}/source.mp4`, "video/mp4") });
    assert.equal(r.status, http); assert.equal((await r.json()).error, code);
    assert.deepEqual(g.rpcs().filter(([n]) => n === "usage_upload_action"), [["usage_upload_action", "release_unbound"]], "only release_unbound, never cancel / complete");
    assert.equal(g.x.state, "CANCELLED");
  }
  const ok = gateway();
  const r = await ok.run("tus", "POST", { "Upload-Length": "1000", "Upload-Metadata": tusMeta("intro-sources", `${A}/${job(8)}/source.mp4`, "video/mp4") });
  assert.equal(r.status, 201); assert.deepEqual(ok.rpcs().filter(([n]) => n === "usage_upload_action"), [["usage_upload_action", "bind"]], "a started upload keeps its reservation");
});

test("ISS-0011 gateway owner cleanup: the owner's due Intro files go through the protected delete path and are recorded; foreign paths and refusals delete nothing", async () => {
  const mine = [{ job_id: job(10), source_path: null, derivative_path: `${A}/${job(10)}/intro-d3.webm` }, { job_id: job(11), source_path: `${A}/${job(11)}/source.mp4`, derivative_path: null }];
  const g = gateway({ introCandidates: mine });
  const r = await g.run("cleanup", "POST");
  assert.deepEqual(await r.json(), { cleaned: 0, intro: 2, fonts: 0 });   // (custom Wall fonts, 2026-10-18: the same cleanup also reports unregistered font objects)
  const deletes = g.calls.filter(c => c.method === "DELETE").map(c => c.url.replace(`${BASE}/storage/v1/object/`, ""));
  assert.deepEqual(deletes, [`intro-media/${A}/${job(10)}/intro-d3.webm`, `intro-sources/${A}/${job(11)}/source.mp4`]);
  assert.deepEqual(g.calls.filter(c => c.url.endsWith("/authorize_usage_delete")).map(c => c.body.candidate_bucket), ["intro-media", "intro-sources"], "every delete is authorized first");
  assert.deepEqual(g.calls.filter(c => c.url.endsWith("/worker_confirm_intro_cleanup")).map(c => [c.body.candidate_job_id, c.body.candidate_source_deleted, c.body.candidate_derivative_deleted]),
    [[job(10), false, true], [job(11), true, false]]);
  const foreign = gateway({ introCandidates: [{ job_id: job(12), source_path: `${B}/${job(12)}/source.mp4`, derivative_path: null }] });
  assert.notEqual((await foreign.run("cleanup", "POST")).status, 200); assert.equal(foreign.calls.filter(c => c.method === "DELETE").length, 0, "never another owner's file");
  const running = gateway({ introCandidates: [mine[1]], authorize: () => "INTRO_PROCESSING_IN_PROGRESS" });
  assert.equal((await (await running.run("cleanup", "POST")).json()).error, "INTRO_PROCESSING_IN_PROGRESS"); assert.equal(running.calls.filter(c => c.method === "DELETE").length, 0);
});

test("ISS-0011 editor: removal and a new Intro upload ask the gateway to release what is due; the new refusal codes have clear words", () => {
  const account = read("dist/account/account.js"), domain = read("dist/account/domain.js");
  assert.match(account, /else if\(introChange\.action==='remove'\)\{await api\.removeIntro\(\);api\.reconcileUsageUploads\(\)\.catch\(\(\)=>\{\}\);\}/);
  assert.match(account, /try\{await api\.reconcileUsageUploads\(\)\.catch\(\(\)=>\{\}\);[^\n]*\n\s*sourcePath=await api\.uploadIntroSource\(/);
  assert.match(domain, /UPLOAD_TOO_LARGE: "This video is larger than the current upload limit\. Choose a smaller or shorter video\."/);
  assert.match(domain, /RESUMABLE_CREATE_FAILED: "The upload could not start\./);
});
