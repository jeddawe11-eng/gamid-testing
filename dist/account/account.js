import { authLanding, debounceAsync, errorMessage, hasProfileChanges, normalizeHandle, validateHandle, validateProfileDraft } from "./domain.js";
import * as api from "./supabase-client.js";

const views = [...document.querySelectorAll(".view")];
const message = document.getElementById("formMessage");
const registerForm = document.getElementById("registerForm");
const signinForm = document.getElementById("signinForm");
const onboardingForm = document.getElementById("onboardingForm");
const handleInput = document.getElementById("handleInput");
const handleStatus = document.getElementById("handleStatus");
const createButton = document.getElementById("createButton");
let identity = null;
let handleAvailable = false;
let avatarPreviewUrl;
let persistedAvatarUrl;
let savedProfile = null;
let pendingAvatar = null;
let saveConfirmationTimer;

function showView(name) {
  views.forEach(view => view.classList.toggle("is-active", view.id === `${name}View`));
  message.hidden = true;
  window.scrollTo({ top: 0, behavior: "instant" });
}

function setMessage(text, success = false) {
  message.textContent = text;
  message.classList.toggle("success", success);
  message.hidden = !text;
}

function busy(form, active) {
  form.querySelectorAll("button,input,select,textarea").forEach(control => control.disabled = active);
  form.setAttribute("aria-busy", String(active));
}

function reasonFrom(error) {
  const source = `${error?.message || ""} ${error?.code || ""}`;
  return ["HANDLE_TAKEN","SOLO_IDENTITY_EXISTS","EMAIL_NOT_VERIFIED","AGE_NOT_ELIGIBLE","INVALID_DATE_OF_BIRTH","INVALID_DISPLAY_NAME","BIO_TOO_LONG","INVALID_LANGUAGE","RESERVED","TAKEN"].find(code => source.includes(code));
}

function profileDraft() {
  return {
    displayName: document.getElementById("profileDisplayName").value,
    bio: document.getElementById("profileBio").value,
    avatarPath: identity?.avatar_media_reference,
  };
}

function isProfileDirty() {
  return Boolean(savedProfile && hasProfileChanges(savedProfile, profileDraft(), Boolean(pendingAvatar)));
}

function updateProfilePreview() {
  const draft = profileDraft();
  document.getElementById("displayNameSummary").textContent = draft.displayName.trim() || "Your display name";
  document.getElementById("bioSummary").textContent = draft.bio || "Add a short bio to tell players who you are.";
  document.getElementById("bioCount").textContent = String(draft.bio.length);
  document.getElementById("saveProfileButton").disabled = !isProfileDirty() || !validateProfileDraft(draft).valid;
  document.getElementById("saveConfirmation").hidden = true;
}

async function setPersistedAvatar(path, fallbackLetter) {
  if (persistedAvatarUrl) URL.revokeObjectURL(persistedAvatarUrl);
  persistedAvatarUrl = null;
  const avatar = document.getElementById("avatarSummary");
  avatar.style.backgroundImage = "";
  avatar.textContent = fallbackLetter;
  if (!path) return;
  try {
    persistedAvatarUrl = await api.loadAvatar(path);
    avatar.style.backgroundImage = `url("${persistedAvatarUrl}")`;
    avatar.textContent = "";
  } catch { /* Keep a safe initial fallback if private media cannot load. */ }
}

async function showIdentity(data) {
  const editor = await api.getIdentityProfile();
  identity = { ...data, ...editor };
  const handle = `@${identity.gamid_handle}`;
  document.getElementById("claimedHandle").textContent = handle;
  document.getElementById("handleField").textContent = handle;
  document.getElementById("accountEmail").textContent = data.account_email;
  document.querySelector("#languageForm select").value = data.preferred_language || "en";
  document.getElementById("profileDisplayName").value = identity.display_name;
  document.getElementById("profileBio").value = identity.bio || "";
  savedProfile = { displayName: identity.display_name, bio: identity.bio || "", avatarPath: identity.avatar_media_reference };
  pendingAvatar = null;
  await setPersistedAvatar(identity.avatar_media_reference, identity.display_name?.trim()?.[0]?.toUpperCase() || "G");
  updateProfilePreview();
  showView("identity");
}

async function routeAuthenticated() {
  identity = await api.getIdentity();
  const landing = authLanding(api.currentSession(), identity);
  if (landing === "identity") await showIdentity(identity);
  else showView(landing);
}

document.getElementById("registerTab").addEventListener("click", () => {
  registerForm.hidden = false; signinForm.hidden = true;
  document.getElementById("registerTab").classList.add("active"); document.getElementById("signinTab").classList.remove("active");
});
document.getElementById("signinTab").addEventListener("click", () => {
  registerForm.hidden = true; signinForm.hidden = false;
  document.getElementById("signinTab").classList.add("active"); document.getElementById("registerTab").classList.remove("active");
});

registerForm.addEventListener("submit", async event => {
  event.preventDefault(); setMessage("");
  const values = Object.fromEntries(new FormData(registerForm));
  if (values.password !== values.confirmPassword) return setMessage("Passwords do not match.");
  if (values.password.length < 8) return setMessage("Password must contain at least 8 characters.");
  busy(registerForm, true);
  try {
    const result = await api.signUp(values.email.trim(), values.password);
    if (result.access_token) { await api.restoreSession(); await routeAuthenticated(); }
    else { document.getElementById("verifyEmail").textContent = values.email.trim(); showView("verify"); }
  } catch (error) { setMessage(error.message); }
  finally { busy(registerForm, false); }
});

signinForm.addEventListener("submit", async event => {
  event.preventDefault(); setMessage(""); busy(signinForm, true);
  const values = Object.fromEntries(new FormData(signinForm));
  try { await api.signIn(values.email.trim(), values.password); await routeAuthenticated(); }
  catch { setMessage("Email or password is incorrect, or the account is not verified yet."); }
  finally { busy(signinForm, false); }
});

document.getElementById("backToSignIn").addEventListener("click", () => { showView("auth"); document.getElementById("signinTab").click(); });
document.getElementById("forgotButton").addEventListener("click", () => showView("forgot"));
document.getElementById("cancelForgot").addEventListener("click", () => { showView("auth"); document.getElementById("signinTab").click(); });

document.getElementById("forgotForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; busy(form, true); setMessage("");
  try { await api.sendPasswordReset(new FormData(form).get("email").trim()); setMessage("If that account exists, a reset link has been sent.", true); }
  catch { setMessage("If that account exists, a reset link will be sent when available.", true); }
  finally { busy(form, false); }
});

document.getElementById("recoveryForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
  if (values.password !== values.confirmPassword) return setMessage("Passwords do not match.");
  if (values.password.length < 8) return setMessage("Password must contain at least 8 characters.");
  busy(form, true);
  try { await api.updatePassword(values.password); setMessage("Password updated. Loading your account…", true); setTimeout(routeAuthenticated, 600); }
  catch (error) { setMessage(error.message); }
  finally { busy(form, false); }
});

const availability = debounceAsync(async value => {
  const local = validateHandle(value);
  if (!local.valid) return local;
  const remote = await api.checkHandle(local.handle);
  return { valid: remote.available, available: remote.available, reason: remote.reason, handle: remote.normalized_handle };
}, 350);

handleInput.addEventListener("input", async () => {
  handleInput.value = normalizeHandle(handleInput.value);
  handleAvailable = false; createButton.disabled = true;
  const local = validateHandle(handleInput.value);
  if (!local.valid) { handleStatus.textContent = errorMessage(local.reason); handleStatus.className = "unavailable"; return; }
  handleStatus.textContent = "Checking availability…"; handleStatus.className = "";
  try {
    const result = await availability(handleInput.value);
    handleAvailable = Boolean(result.available);
    handleStatus.textContent = handleAvailable ? `@${result.handle} is available` : errorMessage(result.reason);
    handleStatus.className = handleAvailable ? "available" : "unavailable";
    createButton.disabled = !handleAvailable;
  } catch { handleStatus.textContent = "Could not check availability. Try again."; handleStatus.className = "unavailable"; }
});

onboardingForm.addEventListener("submit", async event => {
  event.preventDefault(); if (!handleAvailable) return setMessage("Choose an available GamID handle first.");
  const values = Object.fromEntries(new FormData(onboardingForm));
  const avatar = document.getElementById("avatarInput").files[0];
  busy(onboardingForm, true); setMessage("");
  try {
    await api.createSoloIdentity({ handle: values.handle, displayName: values.displayName, dateOfBirth: values.dateOfBirth, language: values.language });
    if (avatar) {
      try { await api.uploadAvatar(avatar, api.userIdFromToken()); }
      catch { setMessage("Your GamID was created, but the optional avatar could not be saved. You can add it later."); }
    }
    const created = await api.getIdentity(); await showIdentity(created);
  } catch (error) { setMessage(errorMessage(reasonFrom(error) || error.message)); }
  finally { busy(onboardingForm, false); createButton.disabled = !handleAvailable; }
});

document.getElementById("avatarInput").addEventListener("change", event => {
  if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  const file = event.target.files[0];
  if (file) avatarPreviewUrl = URL.createObjectURL(file);
});

document.getElementById("profileDisplayName").addEventListener("input", updateProfilePreview);
document.getElementById("profileBio").addEventListener("input", updateProfilePreview);
document.getElementById("profileAvatarInput").addEventListener("change", event => {
  if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  pendingAvatar = event.target.files[0] || null;
  avatarPreviewUrl = pendingAvatar ? URL.createObjectURL(pendingAvatar) : null;
  const avatar = document.getElementById("avatarSummary");
  if (avatarPreviewUrl) {
    avatar.style.backgroundImage = `url("${avatarPreviewUrl}")`;
    avatar.textContent = "";
  } else {
    setPersistedAvatar(identity?.avatar_media_reference, profileDraft().displayName?.trim()?.[0]?.toUpperCase() || "G");
  }
  updateProfilePreview();
});

document.getElementById("profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const draft = validateProfileDraft(profileDraft());
  if (!draft.valid) return setMessage(errorMessage(draft.reason));
  if (!isProfileDirty()) return;
  let saved = false;
  busy(form, true); setMessage("");
  try {
    let avatarPath = null;
    if (pendingAvatar) avatarPath = await api.uploadAvatar(pendingAvatar, api.userIdFromToken(), { attach: false });
    const updated = await api.updateIdentityProfile({ displayName: draft.displayName, bio: draft.bio, avatarPath });
    identity = { ...identity, ...updated };
    savedProfile = { displayName: updated.display_name, bio: updated.bio, avatarPath: updated.avatar_media_reference };
    pendingAvatar = null;
    document.getElementById("profileAvatarInput").value = "";
    if (avatarPreviewUrl) { URL.revokeObjectURL(avatarPreviewUrl); avatarPreviewUrl = null; }
    await setPersistedAvatar(updated.avatar_media_reference, updated.display_name?.[0]?.toUpperCase() || "G");
    document.getElementById("profileDisplayName").value = updated.display_name;
    document.getElementById("profileBio").value = updated.bio;
    updateProfilePreview();
    saved = true;
  } catch (error) { setMessage(errorMessage(reasonFrom(error) || error.message)); }
  finally {
    busy(form, false); updateProfilePreview();
    if (saved) {
      const confirmation = document.getElementById("saveConfirmation");
      confirmation.hidden = false;
      clearTimeout(saveConfirmationTimer);
      saveConfirmationTimer = setTimeout(() => { confirmation.hidden = true; }, 2400);
    }
  }
});

document.getElementById("languageForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; const language = new FormData(form).get("language"); busy(form, true);
  try { await api.updateLanguage(language); setMessage("Language preference saved.", true); }
  catch (error) { setMessage(error.message); }
  finally { busy(form, false); }
});

document.getElementById("signOutButton").addEventListener("click", async () => {
  if (isProfileDirty() && !window.confirm("Discard your unsaved profile changes and sign out?")) return;
  try { await api.signOut(); }
  finally { identity = null; savedProfile = null; pendingAvatar = null; showView("auth"); document.getElementById("signinTab").click(); }
});
window.addEventListener("beforeunload", event => {
  if (!isProfileDirty()) return;
  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("pagehide", () => {
  if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  if (persistedAvatarUrl) URL.revokeObjectURL(persistedAvatarUrl);
}, { once: true });

try {
  const redirected = api.consumeRedirectSession();
  await api.restoreSession();
  if (redirected?.type === "recovery") showView("recovery");
  else await routeAuthenticated();
} catch { showView("auth"); }
