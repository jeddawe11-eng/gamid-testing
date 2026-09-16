import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const MAX_WEBHOOK_BYTES = 128 * 1024;

function equalSecret(actual = "", expected = "") {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left,right);
}

export function authorizeWebhook(headers, expectedSecret) {
  return equalSecret(headers["x-gamid-dispatch-secret"],expectedSecret);
}

export function validateWebhookPayload(payload) {
  return payload?.type === "INSERT"
    && payload?.schema === "public"
    && payload?.table === "intro_processing_jobs"
    && payload?.record?.state === "pending"
    && typeof payload?.record?.job_id === "string";
}

function requiredEnvironment() {
  const project=process.env.GCP_PROJECT_ID;
  const region=process.env.GCP_REGION || "asia-southeast1";
  const job=process.env.CLOUD_RUN_JOB_NAME;
  const secret=process.env.DISPATCH_SHARED_SECRET;
  if (!project || !job || !secret) throw new Error("Dispatcher environment is incomplete");
  return { project,region,job,secret };
}

async function metadataAccessToken() {
  const response=await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",{
    headers:{ "Metadata-Flavor":"Google" },signal:AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`METADATA_TOKEN_${response.status}`);
  const payload=await response.json();
  if (!payload.access_token) throw new Error("METADATA_TOKEN_MISSING");
  return payload.access_token;
}

export async function executeCloudRunJob({ project,region,job }, tokenProvider=metadataAccessToken) {
  const token=await tokenProvider();
  const endpoint=`https://run.googleapis.com/v2/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/jobs/${encodeURIComponent(job)}:run`;
  const response=await fetch(endpoint,{
    method:"POST",
    headers:{ Authorization:`Bearer ${token}`,"Content-Type":"application/json" },
    body:"{}",
    signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`CLOUD_RUN_JOB_${response.status}`);
  return response.json();
}

async function readJson(request) {
  let size=0;
  const chunks=[];
  for await (const chunk of request) {
    size+=chunk.length;
    if (size > MAX_WEBHOOK_BYTES) throw new Error("WEBHOOK_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createDispatcherServer({ environment=requiredEnvironment(), executeJob=executeCloudRunJob } = {}) {
  return createServer(async (request,response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200,{ "Content-Type":"application/json" });
      response.end('{"ok":true}');
      return;
    }
    if (request.method !== "POST" || request.url !== "/dispatch") {
      response.writeHead(404);
      response.end();
      return;
    }
    if (!authorizeWebhook(request.headers,environment.secret)) {
      response.writeHead(401);
      response.end();
      return;
    }
    try {
      const payload=await readJson(request);
      if (!validateWebhookPayload(payload)) {
        response.writeHead(400);
        response.end();
        return;
      }
      await executeJob(environment);
      response.writeHead(202,{ "Content-Type":"application/json" });
      response.end('{"accepted":true}');
    } catch {
      response.writeHead(503,{ "Content-Type":"application/json" });
      response.end('{"accepted":false}');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port=Number(process.env.PORT || 8080);
  createDispatcherServer().listen(port,"0.0.0.0");
}
