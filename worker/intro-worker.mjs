import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 15 * 1024 * 1024;
const MAX_DURATION_SECONDS = 30;

function rate(value = "0/1") { const [n,d] = String(value).split("/").map(Number); return d ? n / d : 0; }

export async function probe(path) {
  const { stdout } = await run("ffprobe", ["-v","error","-show_entries","format=format_name,duration,bit_rate,size:stream=index,codec_type,codec_name,profile,width,height,pix_fmt,avg_frame_rate,bit_rate,channels,sample_rate,start_time,duration","-of","json",path], { maxBuffer:2 * 1024 * 1024 });
  const data = JSON.parse(stdout); const video = data.streams.find(stream => stream.codec_type === "video"); const audio = data.streams.find(stream => stream.codec_type === "audio");
  return { data, video, audio, duration:Number(data.format.duration || video?.duration || 0), size:Number(data.format.size || 0), totalBitrate:Number(data.format.bit_rate || 0), fps:rate(video?.avg_frame_rate) };
}

export async function encodeD3(input, output) {
  const sourceStat = await stat(input); if (sourceStat.size > MAX_SOURCE_BYTES) throw new Error("SOURCE_TOO_LARGE");
  const source = await probe(input); if (!source.video || source.duration < .5 || source.duration > MAX_DURATION_SECONDS) throw new Error("INVALID_SOURCE_DURATION");
  const audioArgs = source.audio ? ["-map","0:a:0","-c:a","libopus","-b:a","32k","-vbr","on","-application","audio"] : ["-an"];
  const started = performance.now();
  await run("ffmpeg", ["-hide_banner","-loglevel","error","-nostdin","-n","-i",input,"-map","0:v:0","-c:v","libvpx-vp9","-crf","40","-b:v","0","-deadline","good","-cpu-used","2","-row-mt","1","-pix_fmt","yuv420p",...audioArgs,"-f","webm",output], { maxBuffer:4 * 1024 * 1024 });
  const encodingMs = Math.round(performance.now() - started); const result = await probe(output);
  if (result.size > MAX_OUTPUT_BYTES) throw new Error("DERIVATIVE_TOO_LARGE");
  if (result.video?.codec_name !== "vp9" || result.video?.pix_fmt !== "yuv420p" || !String(result.data.format.format_name).includes("webm")) throw new Error("INVALID_D3_VIDEO");
  if (source.audio && result.audio?.codec_name !== "opus") throw new Error("INVALID_D3_AUDIO");
  if (!source.audio && result.audio) throw new Error("UNEXPECTED_D3_AUDIO");
  if (result.video.width !== source.video.width || result.video.height !== source.video.height || Math.abs(result.fps - source.fps) > .02 || Math.abs(result.duration - source.duration) > .25) throw new Error("D3_TIMING_OR_GEOMETRY_MISMATCH");
  return { source, result, encodingMs };
}

function environment() {
  const url = process.env.GAMID_SUPABASE_URL; const key = process.env.GAMID_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Worker requires GAMID_SUPABASE_URL and GAMID_SUPABASE_SERVICE_ROLE_KEY");
  return { url:url.replace(/\/$/,""), key };
}
async function api(path, { method="POST", body, contentType="application/json", raw=false } = {}) {
  const { url,key } = environment(); const response = await fetch(`${url}${path}`, { method, headers:{ apikey:key,Authorization:`Bearer ${key}`,...(contentType?{"Content-Type":contentType}:{}) }, body:body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : body });
  if (raw) { if (!response.ok) throw new Error(`WORKER_API_${response.status}`); return response; }
  const payload = (response.headers.get("content-type") || "").includes("json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(`WORKER_API_${response.status}:${typeof payload === "string" ? payload : payload.message || payload.code || "ERROR"}`); return payload;
}
const storagePath = value => value.split("/").map(encodeURIComponent).join("/");
async function cleanupEligible() {
  const rows = await api("/rest/v1/rpc/worker_intro_cleanup_candidates", { body:{ candidate_limit:20 } });
  for (const row of rows || []) {
    let sourceDeleted=false, derivativeDeleted=false;
    if (row.source_path) { await api(`/storage/v1/object/intro-sources/${storagePath(row.source_path)}`, { method:"DELETE" }); sourceDeleted=true; }
    if (row.derivative_path) { await api(`/storage/v1/object/intro-media/${storagePath(row.derivative_path)}`, { method:"DELETE" }); derivativeDeleted=true; }
    await api("/rest/v1/rpc/worker_confirm_intro_cleanup", { body:{ candidate_job_id:row.job_id,candidate_source_deleted:sourceDeleted,candidate_derivative_deleted:derivativeDeleted } });
  }
}

export async function processOneRemoteJob() {
  const rows = await api("/rest/v1/rpc/worker_claim_intro_job", { body:{} }); const job = rows?.[0];
  if (!job) { await cleanupEligible(); return { processed:false }; }
  const dir = await mkdtemp(join(tmpdir(),"gamid-intro-")); const input=join(dir,"source"); const output=join(dir,"intro-d3.webm");
  try {
    const source = await api(`/storage/v1/object/authenticated/intro-sources/${storagePath(job.source_path)}`, { method:"GET", contentType:null,raw:true });
    await writeFile(input,Buffer.from(await source.arrayBuffer()));
    const encoded = await encodeD3(input,output); const bytes=await readFile(output);
    await api(`/storage/v1/object/intro-media/${storagePath(job.derivative_path)}`, { body:bytes,contentType:"video/webm" });
    const { result }=encoded;
    await api("/rest/v1/rpc/worker_complete_intro_job", { body:{ candidate_job_id:job.job_id,candidate_derivative_path:job.derivative_path,candidate_size:result.size,candidate_duration_ms:Math.round(result.duration*1000),candidate_width:result.video.width,candidate_height:result.video.height,candidate_fps:result.fps,candidate_video_bitrate:Number(result.video.bit_rate||0),candidate_audio_bitrate:Number(result.audio?.bit_rate||0),candidate_total_bitrate:result.totalBitrate,candidate_has_audio:Boolean(result.audio) } });
    await cleanupEligible(); return { processed:true,jobId:job.job_id,encodingMs:encoded.encodingMs };
  } catch (error) {
    try { await api("/rest/v1/rpc/worker_fail_intro_job", { body:{ candidate_job_id:job.job_id,candidate_failure_code:String(error.message).toUpperCase().replace(/[^A-Z0-9_]/g,"_").slice(0,64) } }); } catch { /* Keep original failure. */ }
    throw error;
  } finally { await rm(dir,{ recursive:true,force:true }); }
}

const [command,input,output] = process.argv.slice(2);
if (command === "encode") {
  if (!input || !output) throw new Error("Usage: node worker/intro-worker.mjs encode INPUT OUTPUT");
  console.log(JSON.stringify(await encodeD3(input,output),null,2));
} else if (command === "once") console.log(JSON.stringify(await processOneRemoteJob()));
else if (import.meta.url === `file://${process.argv[1]}`) throw new Error("Use encode or once");
