export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;
export const BIO_MAX = 160;
export const PROFILE_CONTEXT_MAX = 120;

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

function authErrorCode(error) {
  return String(error?.code || "AUTH_ERROR").toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64);
}

export function authErrorMessage(error, flow) {
  const code = authErrorCode(error);
  if (flow === "signin") {
    if (code === "INVALID_CREDENTIALS") return "Email or password is incorrect.";
    if (code === "EMAIL_NOT_CONFIRMED") return "Verify your email before signing in.";
    if (code === "NETWORK_ERROR") return "GamID could not reach authentication. Check your connection and try again.";
    return `Sign in failed (${code}). Try again.`;
  }
  if (["OVER_EMAIL_SEND_RATE_LIMIT","EMAIL_RATE_LIMIT_EXCEEDED","TOO_MANY_REQUESTS"].includes(code) || error?.status === 429) {
    return "Too many recovery requests. Wait a minute, then try again.";
  }
  if (code === "NETWORK_ERROR") return "GamID could not reach email recovery. Check your connection and try again.";
  return `The recovery email could not be sent (${code}). Try again.`;
}

export function normalizeProfileDraft({ displayName = "", bio = "", avatarPath = null, roleKeys = [], primaryRoleKey = null, educationWorkStatus = null, institution = "", fieldOfStudy = "" } = {}) {
  return {
    displayName: displayName.trim(), bio, avatarPath: avatarPath || null,
    roleKeys: [...roleKeys], primaryRoleKey: primaryRoleKey || null,
    educationWorkStatus: educationWorkStatus || null,
    institution: institution.trim(), fieldOfStudy: fieldOfStudy.trim(),
  };
}

export function validateProfileDraft(draft, catalogs = {}) {
  const normalized = normalizeProfileDraft(draft);
  if (normalized.displayName.length < 1 || normalized.displayName.length > 60) {
    return { valid: false, reason: "INVALID_DISPLAY_NAME", ...normalized };
  }
  if (normalized.bio.length > BIO_MAX) return { valid: false, reason: "BIO_TOO_LONG", ...normalized };
  if (new Set(normalized.roleKeys).size !== normalized.roleKeys.length) return { valid: false, reason: "DUPLICATE_GAMING_ROLE", ...normalized };
  if (normalized.roleKeys.length && !normalized.roleKeys.includes(normalized.primaryRoleKey)) return { valid: false, reason: "INVALID_PRIMARY_ROLE", ...normalized };
  if (!normalized.roleKeys.length && normalized.primaryRoleKey) return { valid: false, reason: "PRIMARY_ROLE_WITHOUT_ROLES", ...normalized };
  if (catalogs.roleKeys && normalized.roleKeys.some(role => !catalogs.roleKeys.includes(role))) return { valid: false, reason: "INVALID_GAMING_ROLE", ...normalized };
  if (catalogs.educationStatuses && normalized.educationWorkStatus && !catalogs.educationStatuses.includes(normalized.educationWorkStatus)) return { valid: false, reason: "INVALID_EDUCATION_WORK_STATUS", ...normalized };
  if (normalized.institution.length > PROFILE_CONTEXT_MAX) return { valid: false, reason: "INSTITUTION_TOO_LONG", ...normalized };
  if (normalized.fieldOfStudy.length > PROFILE_CONTEXT_MAX) return { valid: false, reason: "FIELD_OF_STUDY_TOO_LONG", ...normalized };
  return { valid: true, reason: null, ...normalized };
}

export function hasProfileChanges(saved, draft, hasPendingAvatar = false) {
  const before = normalizeProfileDraft(saved);
  const after = normalizeProfileDraft(draft);
  return hasPendingAvatar || before.displayName !== after.displayName || before.bio !== after.bio
    || JSON.stringify(before.roleKeys) !== JSON.stringify(after.roleKeys)
    || before.primaryRoleKey !== after.primaryRoleKey
    || before.educationWorkStatus !== after.educationWorkStatus
    || before.institution !== after.institution || before.fieldOfStudy !== after.fieldOfStudy;
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
  DUPLICATE_GAMING_ROLE: "Choose each gaming role only once.",
  INVALID_PRIMARY_ROLE: "Choose one selected role as your primary role.",
  PRIMARY_ROLE_WITHOUT_ROLES: "Select a gaming role before choosing a primary role.",
  INVALID_GAMING_ROLE: "Choose a role from the GamID role list.",
  INVALID_EDUCATION_WORK_STATUS: "Choose a valid education or work status.",
  INSTITUTION_TOO_LONG: `Keep institution to ${PROFILE_CONTEXT_MAX} characters or fewer.`,
  FIELD_OF_STUDY_TOO_LONG: `Keep field of study to ${PROFILE_CONTEXT_MAX} characters or fewer.`,
}[reason] || reason || "Something went wrong. Please try again.");
