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
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: PUBLISHABLE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !(body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = payload?.message || payload?.msg || payload?.error_description || payload?.error || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload?.code || payload?.error_code || message);
  }
  return payload;
}

function persist(next) {
  session = next;
  if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  else localStorage.removeItem(SESSION_KEY);
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

export async function uploadAvatar(file, userId) {
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
  await rpc("attach_avatar", { candidate_path: path });
  return path;
}

export function userIdFromToken() {
  try {
    const value = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(value.padEnd(Math.ceil(value.length / 4) * 4, "=")));
    return payload.sub;
  } catch { return null; }
}
