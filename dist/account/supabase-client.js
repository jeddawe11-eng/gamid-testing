const SUPABASE_URL = "https://upvtrczefcvigxdyuylw.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_ovl-uegBzJlWPJcTF_dviw_6uf1aVYg";
const SESSION_KEY = "gamid.testing.auth.session.v1";

let session = null;

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code || message;
  }
}

async function request(path, { method = "GET", body, token, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined && !(body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Authentication service could not be reached.", 0, "NETWORK_ERROR");
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = payload?.message || payload?.msg || payload?.error_description || payload?.error || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload?.code || payload?.error_code || message);
  }
  return payload;
}

async function requestBlob(path, token, code = "PRIVATE_MEDIA_READ_FAILED") {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ApiError(`Private media could not be loaded (${response.status}).`, response.status, code);
  return response.blob();
}

const encodeStoragePath = path => path.split("/").map(encodeURIComponent).join("/");

function persist(next) {
  session = next;
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Authentication has already succeeded. Keep the in-memory session usable
    // when a browser temporarily denies or cannot write persistent storage.
  }
  return next;
}

function withExpiry(payload) {
  return { ...payload, expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600) };
}

export function consumeRedirectSession() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.get("access_token")) return null;
  const next = withExpiry({
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    token_type: params.get("token_type") || "bearer",
    expires_in: Number(params.get("expires_in") || 3600),
    type: params.get("type"),
  });
  history.replaceState(null, "", location.pathname + location.search);
  return persist(next);
}

export async function restoreSession() {
  consumeRedirectSession();
  if (!session) {
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { persist(null); }
  }
  if (!session?.access_token) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
  if (!session.refresh_token) return persist(null);
  try {
    const refreshed = await request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refresh_token } });
    return persist(withExpiry(refreshed));
  } catch (error) {
    persist(null);
    throw error;
  }
}

export const currentSession = () => session;

export async function signUp(email, password) {
  const redirect = encodeURIComponent(location.origin + location.pathname);
  const payload = await request(`/auth/v1/signup?redirect_to=${redirect}`, { method: "POST", body: { email, password } });
  if (payload.access_token) persist(withExpiry(payload));
  return payload;
}

export async function signIn(email, password) {
  const payload = await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  return persist(withExpiry(payload));
}

export async function signOut() {
  const token = session?.access_token;
  try {
    if (token) await request("/auth/v1/logout", { method: "POST", token });
  } finally {
    persist(null);
  }
}

export async function sendPasswordReset(email) {
  const redirect = encodeURIComponent(location.origin + location.pathname);
  return request(`/auth/v1/recover?redirect_to=${redirect}`, { method: "POST", body: { email } });
}

export async function updatePassword(password) {
  const payload = await request("/auth/v1/user", { method: "PUT", token: session?.access_token, body: { password } });
  return payload;
}

export async function rpc(name, body = {}, { anonymous = false } = {}) {
  const token = anonymous ? null : session?.access_token;
  return request(`/rest/v1/rpc/${name}`, { method: "POST", token, body });
}

export async function getIdentity() {
  const rows = await rpc("get_my_gamid");
  return rows?.[0] || null;
}

export async function getIdentityProfile() {
  const rows = await rpc("get_my_identity_profile");
  return rows?.[0] || null;
}

export async function checkHandle(candidate) {
  const rows = await rpc("check_handle_availability", { candidate }, { anonymous: true });
  return rows?.[0] || null;
}

export async function createSoloIdentity(input) {
  const rows = await rpc("create_solo_identity", {
    candidate_handle: input.handle,
    candidate_display_name: input.displayName,
    candidate_date_of_birth: input.dateOfBirth,
    candidate_language: input.language,
  });
  return rows?.[0];
}

export async function updateLanguage(language) {
  return rpc("update_preferred_language", { candidate_language: language });
}

export async function uploadAvatar(file, userId, { attach = true } = {}) {
  const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[file.type];
  if (!extension) throw new ApiError("Choose a JPG, PNG, WebP, or AVIF image.", 400, "INVALID_FILE_TYPE");
  if (file.size > 5 * 1024 * 1024) throw new ApiError("Avatar must be 5 MB or smaller.", 400, "FILE_TOO_LARGE");
  const path = `${userId}/avatar-${crypto.randomUUID()}.${extension}`;
  await request(`/storage/v1/object/avatars/${path}`, {
    method: "POST",
    token: session?.access_token,
    body: file,
    headers: { "Content-Type": file.type, "x-upsert": "false" },
  });
  if (attach) await rpc("attach_avatar", { candidate_path: path });
  return path;
}

export async function updateIdentityProfile({ displayName, bio, avatarPath = null, roleKeys = [], primaryRoleKey = null, educationWorkStatus = null, institution = null, fieldOfStudy = null }) {
  const rows = await rpc("update_my_identity_profile", {
    candidate_display_name: displayName,
    candidate_bio: bio,
    candidate_avatar_path: avatarPath,
    candidate_role_keys: roleKeys,
    candidate_primary_role_key: primaryRoleKey,
    candidate_education_work_status: educationWorkStatus,
    candidate_institution: institution,
    candidate_field_of_study: fieldOfStudy,
  });
  return rows?.[0] || null;
}

export async function loadAvatar(path) {
  if (!path) return null;
  const blob = await requestBlob(`/storage/v1/object/authenticated/avatars/${encodeStoragePath(path)}`, session?.access_token, "AVATAR_READ_FAILED");
  return URL.createObjectURL(blob);
}

export async function getMyIntro() {
  const rows = await rpc("get_my_intro");
  return rows?.[0] || null;
}

export async function uploadIntroSource(file, userId, jobId) {
  const extension = ({ "video/mp4":"mp4", "video/quicktime":"mov", "video/webm":"webm" })[file.type];
  if (!extension) throw new ApiError("Choose an MP4, MOV, or WebM video.", 400, "INVALID_INTRO_TYPE");
  if (file.size > 100 * 1024 * 1024) throw new ApiError("Intro video must be 100 MB or smaller.", 400, "INTRO_SOURCE_TOO_LARGE");
  const path = `${userId}/${jobId}/source.${extension}`;
  await request(`/storage/v1/object/intro-sources/${path}`, {
    method:"POST", token:session?.access_token, body:file,
    headers:{ "Content-Type":file.type, "x-upsert":"false" },
  });
  return path;
}

export async function deleteIntroSource(path) {
  if (!path) return;
  return request(`/storage/v1/object/intro-sources/${encodeStoragePath(path)}`, { method:"DELETE", token:session?.access_token });
}

export async function queueIntro({ jobId, sourcePath, transitionKey, sourceMime, sourceSize, durationMs }) {
  const rows = await rpc("queue_my_intro", {
    candidate_job_id:jobId, candidate_source_path:sourcePath, candidate_transition:transitionKey,
    candidate_source_mime:sourceMime, candidate_source_size:sourceSize, candidate_duration_ms:durationMs,
  });
  return rows?.[0] || null;
}

export const setIntroTransition = transitionKey => rpc("set_my_intro_transition", { candidate_transition:transitionKey });
export const removeIntro = () => rpc("remove_my_intro");

export async function loadIntroMedia(path) {
  if (!path) return null;
  const blob = await requestBlob(`/storage/v1/object/authenticated/intro-media/${encodeStoragePath(path)}`, session?.access_token, "INTRO_READ_FAILED");
  return URL.createObjectURL(blob);
}

export function userIdFromToken() {
  try {
    const value = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(value.padEnd(Math.ceil(value.length / 4) * 4, "=")));
    return payload.sub;
  } catch { return null; }
}
