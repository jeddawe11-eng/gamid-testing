const TUS_VERSION = "1.0.0";
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];

const encodeMetadata = value => btoa(unescape(encodeURIComponent(String(value))));
const wait = delay => new Promise(resolve => setTimeout(resolve, delay));

export async function createOwnedUploadBlob(file) {
  const bytes = await file.arrayBuffer();
  const owned = new Blob([bytes], { type:file.type });
  Object.defineProperties(owned, {
    name:{ value:file.name || "intro", enumerable:true },
    lastModified:{ value:Number(file.lastModified || Date.now()), enumerable:true },
  });
  return owned;
}

export class ResumableUploadError extends Error {
  constructor(message, status = 0, code = "INTRO_UPLOAD_FAILED") {
    super(message);
    this.name = "ResumableUploadError";
    this.status = status;
    this.code = code;
  }
}

async function checkedFetch(url, options, fetcher) {
  try { return await fetcher(url, options); }
  catch { throw new ResumableUploadError("Intro upload was interrupted. Check your connection and try SAVE GAMID again.", 0, "INTRO_UPLOAD_NETWORK_ERROR"); }
}

async function readOffset(uploadUrl, headers, fetcher) {
  const response = await checkedFetch(uploadUrl, { method:"HEAD", headers:{ ...headers, "Tus-Resumable":TUS_VERSION } }, fetcher);
  if (!response.ok) throw new ResumableUploadError(`Intro upload could not resume (${response.status}).`, response.status);
  const offset = Number(response.headers.get("upload-offset"));
  if (!Number.isSafeInteger(offset) || offset < 0) throw new ResumableUploadError("Intro upload returned an invalid resume position.", 0);
  return offset;
}

export async function uploadResumable({ endpoint, bucketName, objectName, contentType, file, token, apikey, fetcher = fetch, retryDelays = RETRY_DELAYS, onProgress = null, terminateOnFailure = false }) {
  const authHeaders = { ...(token?{authorization:`Bearer ${token}`} : {}), apikey };
  const metadata = [
    ["bucketName",bucketName], ["objectName",objectName], ["contentType",contentType], ["cacheControl","3600"],
  ].map(([key,value]) => `${key} ${encodeMetadata(value)}`).join(",");
  const creation = await checkedFetch(endpoint, {
    method:"POST",
    headers:{ ...authHeaders, "Tus-Resumable":TUS_VERSION, "Upload-Length":String(file.size), "Upload-Metadata":metadata, "x-upsert":"false" },
  }, fetcher);
  if (!creation.ok) {
    let payload;try{payload=await creation.json();}catch{/* Storage responses may be plain text. */}
    if(payload?.error==='ACCOUNT_STORAGE_QUOTA_EXCEEDED')throw new ResumableUploadError('This upload would exceed your 200 MB storage allowance. Remove stored media and try again.',creation.status,payload.error);
    throw new ResumableUploadError(`Intro upload could not start (${creation.status}).`, creation.status,typeof payload?.error==='string'?payload.error:'INTRO_UPLOAD_FAILED');
  }
  const location = creation.headers.get("location");
  if (!location) throw new ResumableUploadError("Intro upload did not return a resumable location.", 0);
  const uploadUrl = new URL(location, endpoint).href;
  let offset = Number(creation.headers.get("upload-offset") || 0);

  try {
  while (offset < file.size) {
    let completed = false;
    let lastError;
    for (const delay of retryDelays) {
      if (delay) await wait(delay);
      try {
        const chunk = await file.slice(offset, Math.min(offset + TUS_CHUNK_BYTES, file.size), contentType);
        const response = await checkedFetch(uploadUrl, {
          method:"PATCH",
          headers:{ ...authHeaders, "Tus-Resumable":TUS_VERSION, "Upload-Offset":String(offset), "Content-Type":"application/offset+octet-stream" },
          body:chunk,
        }, fetcher);
        if (response.ok) {
          const next = Number(response.headers.get("upload-offset"));
          if (!Number.isSafeInteger(next) || next <= offset || next > file.size) throw new ResumableUploadError("Intro upload returned an invalid chunk position.", 0);
          offset = next; completed = true; onProgress?.(offset, file.size); break;
        }
        if ([401,403,404,413].includes(response.status)) {
          const permanent = new ResumableUploadError(`Intro upload failed (${response.status}).`, response.status);
          permanent.permanent = true;
          throw permanent;
        }
        lastError = new ResumableUploadError(`Intro upload chunk failed (${response.status}).`, response.status);
      } catch (error) {
        if (error?.permanent) throw error;
        lastError = error;
      }
      try { offset = await readOffset(uploadUrl, authHeaders, fetcher); }
      catch (error) { lastError = error; }
      if (offset >= file.size) { completed = true; break; }
    }
    if (!completed) throw lastError || new ResumableUploadError("Intro upload could not be completed.", 0);
  }
  } catch (error) {
    // A failed DELETE does not free capacity: the server keeps the reservation.
    if(terminateOnFailure)try{await checkedFetch(uploadUrl,{method:'DELETE',headers:{...authHeaders,'Tus-Resumable':TUS_VERSION}},fetcher);}catch{/* Retried by confirmed-expiry cleanup. */}
    throw error;
  }
}
