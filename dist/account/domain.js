export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;
export const BIO_MAX = 160;

export function normalizeHandle(value = "") {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

export function validateHandle(value) {
  const handle = normalizeHandle(value);
  if (handle.length < HANDLE_MIN) return { valid: false, reason: "TOO_SHORT", handle };
  if (handle.length > HANDLE_MAX) return { valid: false, reason: "TOO_LONG", handle };
  if (!/^[a-z0-9][a-z0-9_]*[a-z0-9]$/.test(handle) || handle.includes("__")) {
    return { valid: false, reason: "INVALID_FORMAT", handle };
  }
  return { valid: true, reason: null, handle };
}

export function debounceAsync(fn, delay = 350) {
  let timer;
  let sequence = 0;
  return (...args) => new Promise((resolve, reject) => {
    clearTimeout(timer);
    const current = ++sequence;
    timer = setTimeout(async () => {
      try {
        const result = await fn(...args);
        if (current === sequence) resolve(result);
      } catch (error) {
        if (current === sequence) reject(error);
      }
    }, delay);
  });
}

export function authLanding(session, identity) {
  if (!session) return "auth";
  if (identity?.entity_id) return "identity";
  return "onboarding";
}

export function normalizeProfileDraft({ displayName = "", bio = "", avatarPath = null } = {}) {
  return { displayName: displayName.trim(), bio, avatarPath: avatarPath || null };
}

export function validateProfileDraft(draft) {
  const normalized = normalizeProfileDraft(draft);
  if (normalized.displayName.length < 1 || normalized.displayName.length > 60) {
    return { valid: false, reason: "INVALID_DISPLAY_NAME", ...normalized };
  }
  if (normalized.bio.length > BIO_MAX) return { valid: false, reason: "BIO_TOO_LONG", ...normalized };
  return { valid: true, reason: null, ...normalized };
}

export function hasProfileChanges(saved, draft, hasPendingAvatar = false) {
  const before = normalizeProfileDraft(saved);
  const after = normalizeProfileDraft(draft);
  return hasPendingAvatar || before.displayName !== after.displayName || before.bio !== after.bio;
}

export const errorMessage = reason => ({
  TOO_SHORT: "Use at least 3 characters.",
  TOO_LONG: "Use no more than 24 characters.",
  INVALID_FORMAT: "Use letters, numbers, or single underscores; start and end with a letter or number.",
  RESERVED: "This GamID is protected and cannot be claimed.",
  TAKEN: "That GamID is already taken.",
  HANDLE_TAKEN: "That GamID was claimed moments ago. Please choose another.",
  SOLO_IDENTITY_EXISTS: "Your Solo identity already exists.",
  EMAIL_NOT_VERIFIED: "Verify your email before creating your GamID.",
  AGE_NOT_ELIGIBLE: "You do not meet the current minimum-age requirement for a GamID identity.",
  INVALID_DATE_OF_BIRTH: "Enter a valid date of birth.",
  INVALID_DISPLAY_NAME: "Enter a display name between 1 and 60 characters.",
  INVALID_LANGUAGE: "Choose a supported language.",
  BIO_TOO_LONG: `Keep your bio to ${BIO_MAX} characters or fewer.`,
}[reason] || reason || "Something went wrong. Please try again.");
