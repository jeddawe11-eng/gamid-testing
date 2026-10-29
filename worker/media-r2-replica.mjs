// Media delivery Architecture F - TESTING pilot (DEC-0013; supabase/migrations/20261029100000_media_r2_pilot.sql): the existing worker Job copies a pilot
// profile's READY visitor video (the Intro's D3 derivative, its Discord share copy) to the private R2 bucket, through the Cloudflare Worker's signed ingest
// route (cf-worker/media-r2.mjs handleMediaIngest). The Job holds no R2 credential: only the ingest key, which can write and delete pilot keys and nothing else.
// Supabase stays authoritative; the source object is only read.
//
//   claim (per-attempt claim token + R2 key) -> read the source (service role) -> its size must equal the queued size -> SHA-256 -> signed PUT (R2 refuses a
//   body whose digest differs) -> the stored size and digest must equal ours -> the database re-checks the source is current and its size, then marks READY.
//   Any failure: the replica is FAILED (at most 2 attempts in all), its key is deleted, and delivery stays on Supabase within the fallback budget.
//
// Inert without GAMID_MEDIA_R2_INGEST_URL + GAMID_MEDIA_R2_INGEST_KEY (nothing is claimed), and the database claims nothing while replication is disabled.
import { createHash, createHmac } from "node:crypto";
import { TESTING_PROJECT } from "./intro-share.mjs";

export const MEDIA_R2 = Object.freeze({
  ingestOrigin: "https://gamid-testing-static.gamid.workers.dev",
  ingestPrefix: "/media/v1-ingest/",
  maxBytes: 15728640,
  timeoutMs: 60000,
});

const encodeKey = key => key.split("/").map(encodeURIComponent).join("/");
export const ingestMessage = (method, key, exp, sha256 = "", bytes = "") => `ingest-v1\n${method}\n${key}\n${exp}\n${sha256}\n${bytes}`;
export const ingestSignature = (secret, method, key, exp, sha256 = "", bytes = "") => createHmac("sha256", secret).update(ingestMessage(method, key, exp, sha256, bytes)).digest("hex");

// -> { url, key } or null when the pilot is not configured in this Job (its env only)
export function readMediaR2Ingest(env = process.env) {
  const url = String(env.GAMID_MEDIA_R2_INGEST_URL || "").replace(/\/+$/, "");
  const key = String(env.GAMID_MEDIA_R2_INGEST_KEY || "");
  if (url !== MEDIA_R2.ingestOrigin || key.length < 32) return null;
  return { url, key };
}

async function ingest(ingestConfig, method, r2Key, { body = null, sha256 = "", fetchImpl = fetch, nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  const bytes = body ? String(body.byteLength) : "";
  const exp = String(nowSeconds);
  const headers = { "x-gamid-ingest-exp": exp, "x-gamid-ingest-sig": ingestSignature(ingestConfig.key, method, r2Key, exp, sha256, bytes) };
  if (body) Object.assign(headers, { "content-type": "video/webm", "content-length": bytes, "x-gamid-sha256": sha256 });
  const response = await fetchImpl(`${ingestConfig.url}${MEDIA_R2.ingestPrefix}${encodeKey(r2Key)}`, { method, headers, body, signal: AbortSignal.timeout(MEDIA_R2.timeoutMs) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`R2_INGEST_${response.status}:${payload?.error || "ERROR"}`);
  return payload;
}
export const putReplica = (ingestConfig, r2Key, body, sha256, options = {}) => ingest(ingestConfig, "PUT", r2Key, { ...options, body, sha256 });
export const deleteReplica = (ingestConfig, r2Key, options = {}) => ingest(ingestConfig, "DELETE", r2Key, options);

const rpcCaller = (backend, fetchImpl) => async (name, body) => {
  const response = await fetchImpl(`${backend.url}/rest/v1/rpc/${name}`, { method: "POST", headers: backend.headers("application/json"), body: JSON.stringify(body ?? {}) });
  const payload = (response.headers.get("content-type") || "").includes("json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(`WORKER_API_${response.status}:${typeof payload === "string" ? payload : payload?.message || "ERROR"}`);
  return payload;
};

// One queued replica, end to end. `backend` = { url, headers(contentType) } (the worker's service-role credentials, from the Job's secret only).
// -> { processed: false, skipped? } | { processed: true, replicaId, state: "ready" | "failed", code?, bytes? }
export async function processOneMediaR2Replica(backend, { fetchImpl = fetch, ingestConfig = readMediaR2Ingest() } = {}) {
  if (!ingestConfig) return { processed: false, skipped: "MEDIA_R2_NOT_CONFIGURED" };
  if (backend.url !== TESTING_PROJECT) throw new Error("TESTING_ONLY");
  const call = rpcCaller(backend, fetchImpl);
  const job = (await call("worker_claim_media_r2_replica"))?.[0];
  if (!job) { await sweepMediaR2Replicas(backend, { fetchImpl, call, ingestConfig }); return { processed: false }; }
  try {
    const expected = Number(job.source_bytes);
    if (!(expected > 0 && expected <= MEDIA_R2.maxBytes)) throw new Error("MEDIA_R2_SOURCE_SIZE");
    const source = await fetchImpl(`${backend.url}/storage/v1/object/authenticated/${encodeURIComponent(job.source_bucket)}/${encodeKey(job.source_path)}`,
      { headers: backend.headers(null), signal: AbortSignal.timeout(MEDIA_R2.timeoutMs) });
    if (!source.ok) throw new Error(`MEDIA_R2_SOURCE_READ_${source.status}`);
    const declared = Number(source.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MEDIA_R2.maxBytes) throw new Error("MEDIA_R2_SOURCE_SIZE");
    const body = new Uint8Array(await source.arrayBuffer());
    if (body.byteLength !== expected) throw new Error("MEDIA_R2_SOURCE_CHANGED");
    const sha256 = createHash("sha256").update(body).digest("hex");
    const stored = await putReplica(ingestConfig, job.r2_key, body, sha256, { fetchImpl });
    if (stored?.size !== expected || stored?.sha256 !== sha256) throw new Error("MEDIA_R2_REPLICA_MISMATCH");
    await call("worker_complete_media_r2_replica", { candidate_replica_id: job.replica_id, candidate_claim_token: job.claim_token, candidate_r2_key: job.r2_key,
      candidate_bytes: expected, candidate_sha256: sha256 });
    return { processed: true, replicaId: job.replica_id, state: "ready", bytes: expected };
  } catch (error) {
    const code = String(error?.message || "MEDIA_R2_FAILED").split(":")[0];
    try { await call("worker_fail_media_r2_replica", { candidate_replica_id: job.replica_id, candidate_claim_token: job.claim_token, candidate_code: code }); } catch { /* the 20-minute reclaim settles the row */ }
    return { processed: true, replicaId: job.replica_id, state: "failed", code };
  } finally {
    try { await sweepMediaR2Replicas(backend, { fetchImpl, call, ingestConfig }); } catch { /* the next run sweeps */ }
  }
}

// Deletes from R2 exactly what the database lists (failed / superseded replicas past their grace period), then records each deletion.
export async function sweepMediaR2Replicas(backend, { fetchImpl = fetch, call = rpcCaller(backend, fetchImpl), ingestConfig = readMediaR2Ingest() } = {}) {
  if (!ingestConfig) return 0;
  const rows = await call("worker_media_r2_sweep", { candidate_limit: 20 });
  let deleted = 0;
  for (const row of rows || []) {
    if (typeof row?.r2_key !== "string" || typeof row?.replica_id !== "string") continue;
    try {
      await deleteReplica(ingestConfig, row.r2_key, { fetchImpl });
      await call("worker_confirm_media_r2_deleted", { candidate_replica_id: row.replica_id, candidate_r2_key: row.r2_key });
      deleted += 1;
    } catch { /* retried by the next sweep */ }
  }
  return deleted;
}
