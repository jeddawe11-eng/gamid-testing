import test from "node:test";
import assert from "node:assert/strict";
import { TUS_CHUNK_BYTES, ResumableUploadError, uploadResumable } from "../dist/account/resumable-upload.js";

const response = (status, headers = {}) => new Response(null, { status, headers });
const input = overrides => ({
  endpoint:"https://project.storage.supabase.co/storage/v1/upload/resumable",
  bucketName:"intro-sources", objectName:"user/job/source.mp4", contentType:"video/mp4",
  file:new Blob([new Uint8Array(TUS_CHUNK_BYTES + 7)], { type:"video/mp4" }),
  token:"access-token", apikey:"publishable-key", retryDelays:[0,0], ...overrides,
});

test("Intro uploads use the direct TUS endpoint in fixed 6 MiB chunks", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST") return response(201, { location:"upload/one", "upload-offset":"0" });
    const next = Number(options.headers["Upload-Offset"]) + options.body.size;
    return response(204, { "upload-offset":String(next) });
  };
  await uploadResumable(input({ fetcher }));
  assert.deepEqual(calls.map(call => call.options.method), ["POST","PATCH","PATCH"]);
  assert.equal(calls[1].options.body.size, TUS_CHUNK_BYTES);
  assert.equal(calls[2].options.body.size, 7);
  assert.equal(calls[1].options.headers.authorization, "Bearer access-token");
  assert.match(calls[0].options.headers["Upload-Metadata"], /bucketName/);
});

test("an interrupted Intro upload resumes from the server-confirmed offset", async () => {
  const offsets = [];
  let patches = 0;
  const fetcher = async (_url, options) => {
    if (options.method === "POST") return response(201, { location:"upload/two", "upload-offset":"0" });
    if (options.method === "HEAD") return response(200, { "upload-offset":"5" });
    offsets.push(Number(options.headers["Upload-Offset"]));
    patches += 1;
    if (patches === 1) throw new TypeError("connection reset");
    return response(204, { "upload-offset":String(5 + options.body.size) });
  };
  await uploadResumable(input({ file:new Blob([new Uint8Array(12)]), fetcher }));
  assert.deepEqual(offsets, [0,5]);
});

test("Intro upload transport failures are not misreported as Auth outages", async () => {
  const fetcher = async () => { throw new TypeError("failed to fetch"); };
  await assert.rejects(
    () => uploadResumable(input({ file:new Blob([new Uint8Array(12)]), fetcher })),
    error => error instanceof ResumableUploadError && error.code === "INTRO_UPLOAD_NETWORK_ERROR" && !/Authentication service/.test(error.message),
  );
});
