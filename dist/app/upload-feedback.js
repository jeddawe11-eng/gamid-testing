// Upload & Add error feedback (Product Memory ISS-0001), shared by every file / media upload surface: Wall Assets, Wall background video, sign-up Avatar,
// Profile Editor Avatar and Intro. A failed upload becomes ONE persistent inline box beside the control that failed: the reason and next step, Retry only when
// trying the same file again can succeed, View Usage only for the account storage quota or a Wall limit (the existing global Usage panel), and Dismiss.
// It stays until it is dismissed or its cause is resolved (the surface clears it). No limit is decided here: the server stays authoritative and the actual
// figures are the ones Usage shows. Built with createElement/textContent only.

// Refusals whose cure is freeing space / slots, never trying again.
export const USAGE_ERROR_CODES = Object.freeze(["ACCOUNT_STORAGE_QUOTA_EXCEEDED", "WALL_ASSET_LIMIT", "WALL_VIDEO_LIMIT"]);
// A transport / gateway failure, or an upload that expired or collided: a fresh attempt with the same file can succeed.
const ALWAYS_RETRYABLE = new Set(["NETWORK_ERROR", "UPLOAD_GATEWAY_FAILED", "UPLOAD_EXPIRED", "UPLOAD_CONFLICT", "INTRO_UPLOAD_NETWORK_ERROR", "AVATAR_UPLOAD_NETWORK_ERROR"]);
// Generic "did not finish" codes: retryable unless the server answered with a 4xx refusal of this request.
const RETRYABLE_UNLESS_REFUSED = new Set(["WALL_VIDEO_UPLOAD_FAILED", "WALL_ASSET_UPLOAD_NOT_FOUND", "INVALID_WALL_ASSET_PATH", "register_failed", "INTRO_UPLOAD_FAILED"]);

// -> { usage, retryable }. Unknown codes are retryable only for a network failure (status 0) or a server error (5xx); hard validation never is.
export function classifyUploadError({ code, status } = {}) {
  const usage = USAGE_ERROR_CODES.includes(code);
  if (usage) return { usage, retryable: false };
  if (ALWAYS_RETRYABLE.has(code)) return { usage, retryable: true };
  const refused = Number.isInteger(status) && status >= 400 && status < 500;
  if (RETRYABLE_UNLESS_REFUSED.has(code)) return { usage, retryable: !refused };
  return { usage, retryable: status === 0 || (Number.isInteger(status) && status >= 500) };
}

// Opens the global Usage panel of the authenticated shell (loaded lazily, so pure modules and tests never pull the shell in).
export async function openUsage() {
  try { return (await import("./authenticated-shell.js")).openUsagePanel(); } catch { return false; }
}

// -> the box element. error = { message, code, status }; handlers: onRetry (offered only when retryable), onViewUsage (only for usage codes), onDismiss (always).
export function renderUploadError(doc, error, { id, onRetry, onViewUsage = openUsage, onDismiss } = {}) {
  const { usage, retryable } = classifyUploadError(error);
  const box = doc.createElement("div");
  box.className = "upload-error";
  box.setAttribute("role", "alert");
  if (id) box.id = id;
  box.dataset.code = error?.code || "";
  const text = doc.createElement("p");
  text.className = "upload-error-text";
  text.textContent = error?.message || "The upload could not be completed.";
  const actions = doc.createElement("div");
  actions.className = "upload-error-actions";
  const button = (label, className, handler, ariaLabel) => {
    const node = doc.createElement("button");
    node.type = "button";
    node.className = className;
    node.textContent = label;
    if (ariaLabel) node.setAttribute("aria-label", ariaLabel);
    node.addEventListener("click", handler);
    return node;
  };
  if (retryable && onRetry) actions.append(button("Retry", "upload-error-retry", () => onRetry()));
  if (usage && onViewUsage) actions.append(button("View Usage", "upload-error-usage", async () => {
    if (await onViewUsage() === false) text.textContent = `${error?.message || ""} Open USAGE at the top of the page to see what is stored.`.trim();
  }));
  actions.append(button("×", "upload-error-dismiss", () => onDismiss?.(), "Dismiss this message"));
  box.append(text, actions);
  return box;
}
