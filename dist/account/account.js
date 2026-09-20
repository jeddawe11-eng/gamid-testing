import { INTRO_TRANSITIONS, authErrorMessage, authLanding, authTabFromSearch, debounceAsync, errorMessage, hasIntroChanges, hasProfileChanges, normalizeHandle, searchWithoutAuth, validateHandle, validateIntroSource, validateProfileDraft } from "./domain.js";
import { AVATAR_PREVIEW_SIZE, AvatarCropState, AvatarDecodeSession, createNormalizedAvatar, createOwnedImageBlob, drawCropPreview, loadOrientedImage } from "./avatar-cropper.js";
import { PRESETS } from "../transition-engine.js";
import * as api from "./supabase-client.js";
import { createOwnedUploadBlob } from "./resumable-upload.js";
import { IntroStatusPoller, isProcessingIntroState } from "./intro-status-poller.js";
import { buildGameLibrary } from "./game-list.js";
import { attachGameProfile, indexGameProfiles, profileForGame } from "./game-profile.js";

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
let roleCatalog = [];
let educationWorkCatalog = [];
let savedIntro = null;
let pendingIntroSource = null;
let activeIntroUrl = null;
let introAction = "keep";
let pendingPreviewConfig = null;
let previewConfigDelivered = false;
let cropImage = null;
let cropState = null;
let cropOperation = null;
const cropPointers = new Map();
const avatarDiagnosticsEnabled = new URLSearchParams(location.search).get("avatarDebug") === "1";
const avatarDiagnosticKey = "gamid-avatar-diagnostics-v1";
let avatarDiagnosticLog = [];

const introStatusPoller = new IntroStatusPoller({
  load:() => api.getMyIntro(),
  onState:async intro => {
    if (!identity || pendingIntroSource || introAction !== "keep") return;
    await restoreIntroState(intro);
    updateProfilePreview();
  },
});

async function refreshIntroOnForeground() {
  if (document.visibilityState !== "visible" || !identity || pendingIntroSource || introAction !== "keep") return;
  try {
    const intro=await introStatusPoller.refreshNow();
    if (isProcessingIntroState(intro)) introStatusPoller.start();
  } catch { /* Keep the current UI; the next foreground event can retry. */ }
}

function cleanupIntroStatusRefresh() {
  introStatusPoller.stop();
  document.removeEventListener("visibilitychange",refreshIntroOnForeground);
}

document.addEventListener("visibilitychange",refreshIntroOnForeground);
window.addEventListener("pagehide",cleanupIntroStatusRefresh,{ once:true });

if (avatarDiagnosticsEnabled) {
  try { avatarDiagnosticLog = JSON.parse(sessionStorage.getItem(avatarDiagnosticKey)) || []; }
  catch { avatarDiagnosticLog = []; }
}

function avatarDiag(event, detail = "") {
  if (!avatarDiagnosticsEnabled) return;
  const entry = `${String(avatarDiagnosticLog.length + 1).padStart(2,"0")} ${event}${detail ? ` ${detail}` : ""}`;
  avatarDiagnosticLog = [...avatarDiagnosticLog.slice(-59), entry];
  try { sessionStorage.setItem(avatarDiagnosticKey, JSON.stringify(avatarDiagnosticLog)); } catch { /* Diagnostics remain in memory. */ }
  const output = document.getElementById("avatarDiagnosticOutput");
  if (output) output.textContent = avatarDiagnosticLog.join("\n");
}

const avatarDecoder = new AvatarDecodeSession({
  loader: async file => {
    const ownedBlob = await createOwnedImageBlob(file, { report:avatarDiag });
    return loadOrientedImage(ownedBlob, { report:avatarDiag });
  },
  report: avatarDiag,
});

const cropDialog = document.getElementById("avatarCropDialog");
const cropCanvas = document.getElementById("avatarCropCanvas");
const cropStage = document.getElementById("avatarCropStage");
const cropZoom = document.getElementById("avatarZoom");
const introTransition = document.getElementById("introTransition");
for (const key of INTRO_TRANSITIONS) introTransition.add(new Option(PRESETS[key].label, key));

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
  return ["HANDLE_TAKEN","SOLO_IDENTITY_EXISTS","EMAIL_NOT_VERIFIED","AGE_NOT_ELIGIBLE","INVALID_DATE_OF_BIRTH","INVALID_DISPLAY_NAME","BIO_TOO_LONG","INVALID_LANGUAGE","DUPLICATE_GAMING_ROLE","PRIMARY_ROLE_WITHOUT_ROLES","INVALID_PRIMARY_ROLE","INVALID_GAMING_ROLE","INVALID_EDUCATION_WORK_STATUS","INSTITUTION_TOO_LONG","FIELD_OF_STUDY_TOO_LONG","INVALID_INTRO_TYPE","INTRO_SOURCE_TOO_LARGE","INTRO_DURATION_INVALID","INTRO_PROCESSING_IN_PROGRESS","INVALID_INTRO_TRANSITION","INTRO_UPLOAD_NETWORK_ERROR","INTRO_UPLOAD_FAILED","AUTH_REQUIRED","RESERVED","TAKEN"].find(code => source.includes(code));
}

function profileDraft() {
  const educationWorkStatus = document.getElementById("educationWorkStatus").value || null;
  const includesStudyContext = ["student","university_student"].includes(educationWorkStatus);
  return {
    displayName: document.getElementById("profileDisplayName").value,
    bio: document.getElementById("profileBio").value,
    avatarPath: identity?.avatar_media_reference,
    roleKeys: [...document.querySelectorAll('input[name="gamingRole"]:checked')].map(input => input.value),
    primaryRoleKey: document.getElementById("primaryRoleSelect").value || null,
    educationWorkStatus,
    institution: includesStudyContext ? document.getElementById("profileInstitution").value : "",
    fieldOfStudy: includesStudyContext ? document.getElementById("profileFieldOfStudy").value : "",
  };
}

function introDraft() {
  return { transitionKey:document.getElementById("introTransition").value || "fade", action:introAction, pendingJobId:pendingIntroSource?.jobId || null };
}

const profileCatalogs = () => ({ roleKeys:roleCatalog.map(role => role.key), educationStatuses:educationWorkCatalog.map(status => status.key) });
const catalogLabel = (catalog, key) => catalog.find(item => item.key === key)?.label || key || "";

function renderIdentityCatalogs() {
  const choices = document.getElementById("gamingRoleChoices");
  choices.replaceChildren(...roleCatalog.map(role => {
    const label = document.createElement("label");
    label.className = "role-choice";
    const input = document.createElement("input");
    input.type = "checkbox"; input.name = "gamingRole"; input.value = role.key;
    const text = document.createElement("span"); text.textContent = role.label;
    label.append(input, text);
    return label;
  }));
  const education = document.getElementById("educationWorkStatus");
  education.replaceChildren(new Option("Prefer not to add", ""), ...educationWorkCatalog.map(status => new Option(status.label, status.key)));
}

function syncPrimaryRole() {
  const selected = profileDraft().roleKeys;
  const primary = document.getElementById("primaryRoleSelect");
  const previous = selected.includes(primary.value) ? primary.value : selected[0] || "";
  primary.replaceChildren(...(selected.length ? selected.map(key => new Option(catalogLabel(roleCatalog, key), key)) : [new Option("Select roles first", "")]));
  primary.value = previous;
  primary.disabled = !selected.length;
}

function syncEducationContext() {
  const status = document.getElementById("educationWorkStatus").value;
  document.getElementById("educationContextFields").hidden = !["student","university_student"].includes(status);
}

function isProfileDirty() {
  return Boolean(savedProfile && (hasProfileChanges(savedProfile, profileDraft(), Boolean(pendingAvatar))
    || hasIntroChanges(savedIntro, introDraft(), Boolean(pendingIntroSource))));
}

function renderIntroState() {
  const status = document.getElementById("introFileStatus");
  const summary = document.getElementById("introSectionSummary");
  status.className = "intro-file-status";
  if (pendingIntroSource) {
    status.textContent = `${pendingIntroSource.file.name} · ready to upload on SAVE GAMID`;
    status.classList.add("ready"); summary.textContent = `New video · ${PRESETS[introDraft().transitionKey]?.label || "Transition"}`;
  } else if (introAction === "remove") {
    status.textContent = "Intro will be removed when you save."; summary.textContent = "Remove on save";
  } else if (["pending","processing"].includes(savedIntro?.latestJobState)) {
    status.textContent = savedIntro.latestJobState === "processing" ? "Preparing approved D3 Intro…" : "Waiting for the FFmpeg processor…";
    status.classList.add("processing"); summary.textContent = `Processing · ${PRESETS[introDraft().transitionKey]?.label || "Transition"}`;
  } else if (savedIntro?.latestJobState === "failed" && !savedIntro?.activeJobId) {
    status.textContent = `Processing failed${savedIntro.latestFailureCode ? ` (${savedIntro.latestFailureCode})` : ""}. Your source remains protected.`;
    status.classList.add("failed"); summary.textContent = "Processing failed";
  } else if (savedIntro?.activeJobId) {
    status.textContent = "Optimized D3 Intro is active."; status.classList.add("ready");
    summary.textContent = `Intro ready · ${PRESETS[introDraft().transitionKey]?.label || "Transition"}`;
  } else { status.textContent = "No video selected."; summary.textContent = "No intro yet"; }
  document.getElementById("previewIntroButton").disabled = introAction === "remove" || !(pendingIntroSource?.url || activeIntroUrl);
  document.getElementById("removeIntroButton").disabled = !(pendingIntroSource || savedIntro?.activeJobId || ["pending","processing"].includes(savedIntro?.latestJobState));
}

function renderVisibility() {
  const chip = document.getElementById("visibilityChip");
  const toggle = document.getElementById("visibilityToggle");
  const isPublic = identity?.visibility === "PUBLIC";
  chip.textContent = isPublic ? "PUBLIC" : "DRAFT · PRIVATE";
  chip.classList.toggle("is-public", isPublic);
  toggle.textContent = isPublic ? "Unpublish" : "Publish";
  toggle.disabled = !identity;
}

function updateProfilePreview() {
  const draft = profileDraft();
  document.getElementById("displayNameSummary").textContent = draft.displayName.trim() || "Your display name";
  document.getElementById("bioSummary").textContent = draft.bio || "Add a short bio to tell players who you are.";
  document.getElementById("bioCount").textContent = String(draft.bio.length);
  const selectedRoles = draft.roleKeys;
  const primaryLabel = catalogLabel(roleCatalog, draft.primaryRoleKey);
  const secondaryLabels = selectedRoles.filter(key => key !== draft.primaryRoleKey).map(key => catalogLabel(roleCatalog, key));
  const rolesPreview = document.getElementById("rolesPreview");
  rolesPreview.hidden = !selectedRoles.length;
  document.getElementById("primaryRoleSummary").textContent = primaryLabel;
  const secondary = document.getElementById("secondaryRolesSummary");
  secondary.replaceChildren(...secondaryLabels.slice(0, 2).map(label => { const chip = document.createElement("span"); chip.textContent = label; return chip; }));
  if (secondaryLabels.length > 2) { const more = document.createElement("span"); more.textContent = `+${secondaryLabels.length - 2}`; secondary.append(more); }
  const educationLabel = catalogLabel(educationWorkCatalog, draft.educationWorkStatus);
  const educationContext = [educationLabel, draft.institution, draft.fieldOfStudy].filter(Boolean).join(" · ");
  const educationSummary = document.getElementById("educationWorkSummary");
  educationSummary.textContent = educationContext;
  educationSummary.hidden = !educationContext;
  document.getElementById("rolesSectionSummary").textContent = primaryLabel ? `${primaryLabel}${secondaryLabels.length ? ` +${secondaryLabels.length}` : ""}` : "Add your gaming roles";
  document.getElementById("educationSectionSummary").textContent = educationLabel || "Optional";
  document.getElementById("saveProfileButton").disabled = !isProfileDirty() || !validateProfileDraft(draft, profileCatalogs()).valid;
  document.getElementById("saveConfirmation").hidden = true;
  renderIntroState();
  renderVisibility();
}

function releasePendingIntro() {
  if (pendingIntroSource?.url) URL.revokeObjectURL(pendingIntroSource.url);
  pendingIntroSource = null;
  document.getElementById("introVideoInput").value = "";
}

async function restoreIntroState(intro) {
  releasePendingIntro(); introAction = "keep";
  if (activeIntroUrl) URL.revokeObjectURL(activeIntroUrl);
  activeIntroUrl = null;
  savedIntro = {
    transitionKey:intro?.transition_key || "fade", action:"keep", activeJobId:intro?.active_job_id || null,
    latestJobId:intro?.latest_job_id || null, latestJobState:intro?.latest_job_state || null,
    latestFailureCode:intro?.latest_failure_code || null,
  };
  document.getElementById("introTransition").value = savedIntro.transitionKey;
  if (intro?.active_derivative_path) {
    try { activeIntroUrl = await api.loadIntroMedia(intro.active_derivative_path); }
    catch { /* Keep editor usable if private media is temporarily unavailable. */ }
  }
  renderIntroState();
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

function cropPoint(event) {
  const bounds = cropCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * AVATAR_PREVIEW_SIZE / bounds.width,
    y: (event.clientY - bounds.top) * AVATAR_PREVIEW_SIZE / bounds.height,
  };
}

function cropGesture(points = [...cropPointers.values()]) {
  if (!points.length) return null;
  const center = points.reduce((value, point) => ({ x:value.x + point.x / points.length, y:value.y + point.y / points.length }), { x:0, y:0 });
  const distance = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
  return { center, distance };
}

function renderCrop() {
  if (!cropImage || !cropState) return;
  drawCropPreview(cropCanvas.getContext("2d", { alpha:false }), cropImage, cropState);
  cropZoom.value = String(cropState.zoom);
}

function releaseCropImage(reason = "release") {
  cropPointers.clear();
  avatarDecoder.reset(reason);
  cropImage = null;
  cropState = null;
  cropOperation = null;
}

function resetAvatarCropLifecycle(reason = "lifecycle-reset") {
  avatarDiag("lifecycle-reset", reason);
  if (cropDialog.open) cropDialog.close();
  releaseCropImage(reason);
  if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  avatarPreviewUrl = null;
  pendingAvatar = null;
  document.getElementById("profileAvatarInput").value = "";
}

function cancelAvatarCrop() {
  avatarDiag("crop-cancel");
  cropDialog.close();
  releaseCropImage("cancel");
  document.getElementById("profileAvatarInput").value = "";
}

async function openAvatarCrop(file) {
  if (!file) return;
  avatarDiag("open-request", `type=${file.type || "empty"};size=${file.size};modified=${file.lastModified || 0}`);
  if (!["image/jpeg","image/png","image/webp","image/avif"].includes(file.type)) {
    document.getElementById("profileAvatarInput").value = "";
    return setMessage("Choose a JPG, PNG, WebP, or AVIF image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    document.getElementById("profileAvatarInput").value = "";
    return setMessage("Avatar must be 5 MB or smaller.");
  }
  const expectedGeneration = avatarDecoder.generation + 1;
  try {
    const decoded = await avatarDecoder.open(file);
    if (decoded.stale) { avatarDiag("open-stale"); return; }
    cropImage = decoded.image;
    cropOperation = decoded.operation;
    cropState = new AvatarCropState(cropImage.width || cropImage.naturalWidth, cropImage.height || cropImage.naturalHeight);
    cropZoom.min = "1";
    cropZoom.max = String(cropState.maxZoom);
    cropZoom.value = "1";
    renderCrop();
    cropDialog.showModal();
    avatarDiag("crop-dialog-open", `g${cropOperation};${cropImage.width || cropImage.naturalWidth}x${cropImage.height || cropImage.naturalHeight}`);
  } catch {
    // A stale operation owns neither the current image nor its UI. Only the
    // current decoder generation is allowed to report or clean up a failure.
    if (expectedGeneration !== avatarDecoder.generation) return;
    releaseCropImage();
    document.getElementById("profileAvatarInput").value = "";
    setMessage("That image could not be opened. Choose another image.");
    avatarDiag("open-error-shown", `g${expectedGeneration}`);
  }
}

async function showIdentity(data) {
  const [editor, intro] = await Promise.all([api.getIdentityProfile(), api.getMyIntro()]);
  resetAvatarCropLifecycle("profile-restored");
  identity = { ...data, ...editor };
  roleCatalog = editor.role_catalog || [];
  educationWorkCatalog = editor.education_work_catalog || [];
  renderIdentityCatalogs();
  const handle = `@${identity.gamid_handle}`;
  document.getElementById("claimedHandle").textContent = handle;
  document.getElementById("handleField").textContent = handle;
  document.getElementById("accountEmail").textContent = data.account_email;
  document.querySelector("#languageForm select").value = data.preferred_language || "en";
  document.getElementById("profileDisplayName").value = identity.display_name;
  document.getElementById("profileBio").value = identity.bio || "";
  [...document.querySelectorAll('input[name="gamingRole"]')].forEach(input => { input.checked = (identity.role_keys || []).includes(input.value); });
  syncPrimaryRole();
  document.getElementById("primaryRoleSelect").value = identity.primary_role_key || "";
  document.getElementById("educationWorkStatus").value = identity.education_work_status || "";
  document.getElementById("profileInstitution").value = identity.institution || "";
  document.getElementById("profileFieldOfStudy").value = identity.field_of_study || "";
  syncEducationContext();
  savedProfile = {
    displayName:identity.display_name, bio:identity.bio || "", avatarPath:identity.avatar_media_reference,
    roleKeys:identity.role_keys || [], primaryRoleKey:identity.primary_role_key,
    educationWorkStatus:identity.education_work_status, institution:identity.institution || "", fieldOfStudy:identity.field_of_study || "",
  };
  await setPersistedAvatar(identity.avatar_media_reference, identity.display_name?.trim()?.[0]?.toUpperCase() || "G");
  await restoreIntroState(intro);
  if (isProcessingIntroState(intro)) introStatusPoller.start();
  updateProfilePreview();
  await loadSectionVisibility();
  renderShare();
  await loadConnections();
  await loadLeague();
  showView("identity");
  handleConnectionReturn();
}

function permanentGamidUrl() {
  return new URL(`../@${identity.gamid_handle}`, location.href).href;
}

function qrShareUrl() {
  return new URL(`../public/index.html?qr=${encodeURIComponent(identity.qr_public_token)}`, location.href).href;
}

let qrCodeInstance = null;
function renderShare() {
  if (!identity?.gamid_handle) return;
  document.getElementById("shareLinkInput").value = permanentGamidUrl();
  const qrContainer = document.getElementById("qrCodeCanvas");
  if (window.QRCode && qrContainer) {
    qrContainer.innerHTML = "";
    qrCodeInstance = new window.QRCode(qrContainer, {
      text: qrShareUrl(), width: 220, height: 220,
      colorDark: "#08070d", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.M,
    });
  }
  document.getElementById("qrDisplayName").textContent = identity.display_name || "Gamer";
  document.getElementById("qrHandle").textContent = `@${identity.gamid_handle}`;
}

function flashShareMessage(text) {
  const el = document.getElementById("shareMessage");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(flashShareMessage.timer);
  flashShareMessage.timer = setTimeout(() => { el.hidden = true; }, 2400);
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const input = document.getElementById("shareLinkInput");
    const previous = input.value;
    input.value = text; input.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch { copied = false; }
    input.value = previous;
    return copied;
  }
}

document.getElementById("copyShareLinkButton").addEventListener("click", async () => {
  flashShareMessage((await copyToClipboard(permanentGamidUrl())) ? "Link copied." : "Could not copy — select and copy manually.");
});

document.getElementById("shareIdentityButton").addEventListener("click", async () => {
  const url = permanentGamidUrl();
  if (navigator.share) {
    try { await navigator.share({ title: identity?.display_name || "My GamID", text: `Check out my GamID: @${identity?.gamid_handle}`, url }); }
    catch { /* user cancelled the native share sheet */ }
    return;
  }
  flashShareMessage((await copyToClipboard(url)) ? "Link copied — share it anywhere." : "Could not copy — select and copy manually.");
});

document.getElementById("showQrButton").addEventListener("click", () => {
  renderShare();
  document.getElementById("shareQrDialog").showModal();
});
document.getElementById("closeQrDialog").addEventListener("click", () => {
  document.getElementById("shareQrDialog").close();
});

// ---------------------------------------------------------------------------------------------------------
// Connections (Gaming Connections Engine — Discord foundation). Connected accounts are private by default.
// ---------------------------------------------------------------------------------------------------------
const FRONTEND_CONNECTABLE = new Set(["discord", "steam"]);
const CONNECTION_RETURN_OK = { connected: "Discord connected.", reconnected: "Discord reconnected.", cancelled: "Discord connection cancelled. Nothing was changed." };
// Provider-specific pieces. Each provider authenticates on its own official page; the browser only ever navigates to the exact
// official URL prefix below and never handles a provider credential, code, token, or assertion.
const PROVIDER_AUTH = {
  discord: { name: "Discord", prefix: "https://discord.com/oauth2/authorize?" },
  steam: { name: "Steam", prefix: "https://steamcommunity.com/openid/login?" },
};
const STEAM_RETURN_OK = { connected: "Steam connected.", reconnected: "Steam reconnected.", cancelled: "Steam connection cancelled. Nothing was changed." };
const STEAM_ERRORS = {
  provider_error: "Steam couldn't complete the connection. Please try again.",
  verification_failed: "Steam couldn't confirm that sign-in, so nothing was connected. Please try again.",
  account_in_use: "That Steam account is already connected to another GamID.",
  other_account_connected: "A different Steam account is already connected. Disconnect it first to connect another.",
  not_configured: "Steam connection isn't available yet on this TESTING site.",
  server_error: "Something went wrong connecting Steam. Please try again.",
};
const DISCOVERY_RETURN = {
  found: "Discord returned a Riot Games connection — see the private discovery result below.",
  absent: "Discord did not return a Riot Games connection — see the private discovery result below.",
  unavailable: "Discord's list of linked accounts couldn't be read this time — you can run the test again below.",
};
const CONNECTION_ERRORS = {
  invalid_state: "That connection link isn't valid. Please start again.",
  already_used: "That connection link was already used. Your current connections are shown below.",
  expired: "That connection attempt expired. Please start again.",
  provider_error: "Discord couldn't complete the connection. Please try again.",
  exchange_failed: "Discord couldn't complete the connection. Please try again.",
  account_in_use: "That Discord account is already connected to another GamID.",
  other_account_connected: "A different Discord account is already connected. Disconnect it first to connect another.",
  identity_not_found: "We couldn't find your GamID for this connection. Please try again.",
  not_configured: "Discord connection isn't available yet on this TESTING site.",
  email_not_verified: "Verify your email before connecting an account.",
  too_many_attempts: "Too many connection attempts. Please wait a few minutes and try again.",
  unauthenticated: "Please sign in again, then reconnect.",
  NETWORK_ERROR: "The connection service couldn't be reached. Check your connection and try again.",
  server_error: "Something went wrong connecting Discord. Please try again.",
};
let connectionRows = null;
let discoveryRows = [];
let connectingProvider = null;
let confirmingDisconnect = null;
let connectionsMessageTimer;

const isSafeProviderAvatar = url => typeof url === "string" && url.startsWith("https://cdn.discordapp.com/");

function showConnectionsMessage(text, success = false, sticky = false) {
  const el = document.getElementById("connectionsMessage");
  clearTimeout(connectionsMessageTimer);
  el.textContent = text;
  el.classList.toggle("success", success);
  el.hidden = !text;
  if (text && !sticky) connectionsMessageTimer = setTimeout(() => { el.hidden = true; }, 8000);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const flagText = value => (value === true ? "yes" : value === false ? "no" : "not returned");
const visibilityText = value => (value === 1 ? "public" : value === 0 ? "private" : "not returned");

// PRIVATE diagnostic for the Riot discovery validation slice: what Discord's connections API returned for Riot Games.
// Owner-only, never shown on the public GamID. All values are rendered as text.
// "Show on my GamID" — one generic control for every optional section (Discord, League of Legends, Education & Work).
// CONNECTED / SAVED is different from PUBLIC: every section starts OFF, and flipping a switch only changes that switch (the server
// enforces it; it never disconnects, deletes, refreshes, looks anything up, or touches a throttle).
const SECTION_ERRORS = {
  SECTION_NOT_SET_UP: "Add or connect this first, then you can choose to show it.",
  AUTH_REQUIRED: "Please sign in again, then try again.",
  IDENTITY_NOT_FOUND: "We couldn't find your GamID. Please refresh the page.",
  NETWORK_ERROR: "Couldn't reach the server. Check your connection and try again.",
};
let sectionVisibility = {};
let sectionBusy = null;

const isGamidPublished = () => identity?.visibility === "PUBLIC";
const visibilityHint = on => (on
  ? (isGamidPublished() ? "Shown on your public GamID." : "Will appear on your public GamID once you publish it.")
  : "Private — not shown on your public GamID.");

function visibilitySwitch({ on, busy = false, onChange, label = "Show on my GamID" }) {
  const row = element("div", "section-visibility");
  row.append(element("span", "section-visibility-label", label));
  const button = element("button", `visibility-switch${on ? " is-on" : ""}`);
  button.type = "button";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-checked", String(on));
  button.setAttribute("aria-label", label);
  button.disabled = busy || Boolean(sectionBusy);
  button.append(element("span", "visibility-switch-knob"), element("span", "visibility-switch-text", on ? "ON" : "OFF"));
  button.addEventListener("click", () => onChange(!on));
  row.append(button);
  return row;
}

async function changeSectionVisibility(section, visible, report, reload) {
  if (sectionBusy) return;
  sectionBusy = section;
  report("Updating…", false, true);
  try {
    await api.setSectionVisibility(section, visible);
    report(visible ? "Now shown on your GamID." : "Hidden from your public GamID.", true);
  } catch (error) {
    report(SECTION_ERRORS[error.message] || SECTION_ERRORS[error.code] || "Couldn't update this setting. Please try again.");
  }
  sectionBusy = null;
  await reload();
}

async function loadSectionVisibility() {
  try { sectionVisibility = Object.fromEntries((await api.getMySectionVisibility()).map(row => [row.section_key, row])); }
  catch { sectionVisibility = {}; }
  renderEducationVisibility();
}

function showEducationVisibilityMessage(text, success = false) {
  const el = document.getElementById("educationVisibilityMessage");
  el.textContent = text;
  el.classList.toggle("success", success);
  el.hidden = !text;
}

function renderEducationVisibility() {
  const slot = document.getElementById("educationVisibility");
  if (!slot) return;
  const state = sectionVisibility.education_work;
  if (!state) { slot.replaceChildren(); return; }
  const on = Boolean(state.is_public);
  slot.replaceChildren(
    visibilitySwitch({ on, onChange: next => changeSectionVisibility("education_work", next, showEducationVisibilityMessage, loadSectionVisibility) }),
    element("p", "section-visibility-hint", `${visibilityHint(on)} Turning this off keeps what you entered.`),
  );
}

function discoveryPanel(row) {
  const result = discoveryRows.find(item => item.provider_key === row.provider_key && item.discovered_provider === "riot");
  const panel = element("section", "connection-discovery");
  panel.setAttribute("aria-label", "Discovered through Discord");
  const head = element("div", "connection-discovery-head");
  head.append(element("p", "eyebrow", "DISCOVERED THROUGH DISCORD"), element("span", "connection-chip", "PRIVATE — DISCOVERY TEST"));
  panel.append(head);

  if (!result) {
    panel.append(element("p", "connection-discovery-note", "Riot discovery hasn't been run yet. It needs one extra Discord permission: viewing your linked accounts on Discord. Only Riot Games is looked at — every other linked account is ignored and never saved."));
  } else if (result.status === "FOUND") {
    panel.append(element("strong", "connection-discovery-title", "Riot Games"));
    if (result.external_name) panel.append(element("span", "connection-name", result.external_name));
    const facts = element("dl", "connection-discovery-facts");
    const add = (label, value) => { facts.append(element("dt", "", label), element("dd", "", value)); };
    add("Type returned by Discord", result.external_type || "not returned");
    add("Verified", flagText(result.verified));
    add("Visibility on Discord", visibilityText(result.visibility));
    add("Friend sync", flagText(result.friend_sync));
    add("Revoked", flagText(result.revoked));
    add("Account ID", result.external_id_shape ? `${result.external_id_shape} format, ${result.external_id_length} characters (not stored or shown)` : "not returned");
    add("Fields returned", Array.isArray(result.returned_fields) && result.returned_fields.length ? result.returned_fields.join(", ") : "none");
    panel.append(facts);
  } else if (result.status === "ABSENT") {
    const total = Number.isInteger(result.total_returned) ? result.total_returned : 0;
    panel.append(element("p", "connection-discovery-note", `Riot Games was not returned by Discord's connections API. Discord returned ${total} linked account${total === 1 ? "" : "s"} in total; none were Riot Games.`));
  } else {
    panel.append(element("p", "connection-discovery-note", "Discord's list of linked accounts couldn't be read on the last attempt."));
  }
  if (result?.checked_at) {
    const when = new Date(result.checked_at);
    if (!Number.isNaN(when.getTime())) panel.append(element("p", "connection-discovery-when", `Last checked ${when.toLocaleString()}`));
  }
  panel.append(element("p", "connection-discovery-note", "Diagnostic only — never shown on your public GamID."));

  const button = element("button", "secondary connection-button", connectingProvider === row.provider_key ? "Opening Discord…" : result ? "Run Riot discovery test again" : "Grant permission & run Riot discovery test");
  button.type = "button";
  button.disabled = Boolean(connectingProvider);
  button.addEventListener("click", () => beginConnection(row.provider_key));
  panel.append(button);
  return panel;
}

function connectionCard(row) {
  const card = element("article", `connection-card${row.connected ? " is-connected" : ""}`);
  card.dataset.provider = row.provider_key;

  const head = element("div", "connection-head");
  const avatar = element("div", "connection-avatar");
  if (row.connected && isSafeProviderAvatar(row.provider_avatar_url)) {
    const image = element("img");
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.src = row.provider_avatar_url;
    avatar.append(image);
  } else avatar.textContent = (row.label || "?").trim()[0]?.toUpperCase() || "?";

  const copy = element("div", "connection-copy");
  copy.append(element("strong", "", row.label));
  if (row.connected && row.provider_key === "steam") {
    // Steam authenticates only a SteamID64; there is no Steam display name/avatar (no Steam Web API is called).
    if (row.provider_username) copy.append(element("span", "connection-name", `SteamID64 ${row.provider_username}`));
  } else if (row.connected) {
    const primary = row.provider_display_name || row.provider_username || "";
    if (primary) copy.append(element("span", "connection-name", primary));
    if (row.provider_username && row.provider_username !== primary) copy.append(element("span", "connection-handle", `@${row.provider_username}`));
  }
  const chip = element("span", `connection-chip${row.connected ? " is-connected" : ""}`, row.connected ? "CONNECTED" : "NOT CONNECTED");
  head.append(avatar, copy, chip);
  card.append(head);

  if (row.connected) {
    const steamNote = row.provider_key === "steam" ? ` Only your SteamID64 ${row.is_public ? "is" : "would be"} shown.` : "";
    card.append(element("p", "connection-privacy", `${visibilityHint(Boolean(row.is_public))}${steamNote}`));
    if (row.provider_key === "discord" || row.provider_key === "steam") {
      card.append(visibilitySwitch({ on: Boolean(row.is_public), onChange: next => changeSectionVisibility(row.provider_key, next, showConnectionsMessage, loadConnections) }));
    }
    if (row.provider_key === "steam") {
      card.append(element("p", "connection-discovery-note", "Signed in through Steam. This confirms the Steam account only; nothing about any game is verified."));
      card.append(steamGamesPanel());
    }
  }
  if (row.connected && row.provider_key === "discord") card.append(discoveryPanel(row));

  const actions = element("div", "connection-actions");
  const supported = FRONTEND_CONNECTABLE.has(row.provider_key);
  if (!row.connected && supported) {
    const connecting = connectingProvider === row.provider_key;
    const button = element("button", "secondary connection-button", connecting ? `Opening ${row.label}…` : `Connect ${row.label}`);
    button.type = "button";
    button.disabled = Boolean(connectingProvider);
    button.addEventListener("click", () => beginConnection(row.provider_key));
    actions.append(button);
  } else if (row.connected && confirmingDisconnect === row.provider_key) {
    actions.append(element("p", "connection-confirm", `Disconnect ${row.label} from your GamID? Your GamID, Intro, and public profile stay exactly as they are.`));
    const confirm = element("button", "secondary connection-button danger", `Disconnect ${row.label}`);
    confirm.type = "button";
    confirm.addEventListener("click", () => finishDisconnect(row.provider_key));
    const cancel = element("button", "text-button connection-button", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => { confirmingDisconnect = null; renderConnections(); });
    actions.append(confirm, cancel);
  } else if (row.connected) {
    const button = element("button", "text-button danger connection-button", `Disconnect ${row.label}`);
    button.type = "button";
    button.addEventListener("click", () => { confirmingDisconnect = row.provider_key; renderConnections(); });
    actions.append(button);
  }
  if (actions.childElementCount) card.append(actions);
  return card;
}

function renderConnections() {
  const list = document.getElementById("connectionsList");
  renderGameDisplay();
  if (!connectionRows) { list.replaceChildren(element("p", "connections-empty", "Connections couldn't be loaded right now. Refresh to try again.")); return; }
  list.replaceChildren(...connectionRows.map(connectionCard));
}

// ---------------------------------------------------------------------------------------------------------
// Game display (provider-neutral). Playtime / hours played is sensitive: it is HIDDEN from the public GamID by default and only the owner can turn
// its public display ON. The switch is independent of whether any game is shown, applies to every provider that supplies playtime, and never
// changes what the owner sees privately. The server keeps it as one flag (profiles.show_game_playtime) behind a gate any future public game
// presenter must use; today the public GamID shows no game data at all.
// ---------------------------------------------------------------------------------------------------------
const GAME_PROVIDERS = new Set(["steam"]);   // connections that can supply games (and playtime); extended when another provider is added
let gameDisplay = null;
let gameDisplayBusy = false;

function showGameDisplayMessage(text, success = false) {
  const el = document.getElementById("gameDisplayMessage");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("success", success);
  el.hidden = !text;
}

function renderGameDisplay() {
  const section = document.getElementById("gameDisplaySection");
  const slot = document.getElementById("gameDisplaySlot");
  if (!section || !slot) return;
  const relevant = Boolean(connectionRows?.some(row => row.connected && GAME_PROVIDERS.has(row.provider_key)));
  section.hidden = !relevant;
  if (!relevant || !gameDisplay) { slot.replaceChildren(); return; }
  const on = Boolean(gameDisplay.show_game_playtime);
  slot.replaceChildren(
    visibilitySwitch({ on, busy: gameDisplayBusy, label: "Show playtime on my GamID", onChange: changePlaytimeVisibility }),
    element("p", "section-visibility-hint", on
      ? `Hours played may be shown publicly, only where a game is shown and its provider supplied them.${isGamidPublished() ? "" : " Nothing is public until you publish your GamID."}`
      : "Hidden. Hours played are never shown on your public GamID. You always see your own playtime in your private lists."),
    element("p", "section-visibility-hint", "This is separate from showing a game, and applies to every connected provider. No game list is shown on your public GamID yet."),
  );
}

async function changePlaytimeVisibility(visible) {
  if (gameDisplayBusy) return;
  gameDisplayBusy = true;
  showGameDisplayMessage("Updating…");
  renderGameDisplay();
  try {
    await api.setGamePlaytimeVisibility(visible);
    gameDisplay = { ...(gameDisplay || {}), show_game_playtime: visible };
    showGameDisplayMessage(visible ? "Playtime can now be shown publicly." : "Playtime is hidden from your public GamID.", true);
  } catch (error) {
    showGameDisplayMessage(SECTION_ERRORS[error.message] || SECTION_ERRORS[error.code] || "Couldn't update this setting. Please try again.");
  }
  gameDisplayBusy = false;
  try { gameDisplay = await api.getMyGameDisplaySettings(); } catch { /* keep what we know */ }
  renderGameDisplay();
}

async function loadGameProfiles() {
  try { gameProfileIndex = indexGameProfiles(await api.getMyGameProfiles()); }
  catch { gameProfileIndex = new Map(); }   // a failed read simply leaves every row compact
}

async function loadGameDisplay() {
  try { gameDisplay = await api.getMyGameDisplaySettings(); }
  catch { gameDisplay = null; }
}

async function loadConnections() {
  try { connectionRows = await api.getMyConnections(); }
  catch { connectionRows = null; }
  try { discoveryRows = await api.getMyConnectionDiscovery(); }
  catch { discoveryRows = []; }
  await loadSteamGames();
  await loadGameProfiles();
  await loadGameDisplay();
  renderConnections();
}

async function beginConnection(provider) {
  if (connectingProvider) return;
  connectingProvider = provider;
  confirmingDisconnect = null;
  const auth = PROVIDER_AUTH[provider];
  showConnectionsMessage(`Opening ${auth.name}…`, false, true);
  renderConnections();
  try {
    const { authorization_url: target } = await api.startConnection(provider);
    if (typeof target !== "string" || !target.startsWith(auth.prefix)) throw new Error("INVALID_AUTHORIZATION_URL");
    location.assign(target);
  } catch (error) {
    connectingProvider = null;
    showConnectionsMessage(CONNECTION_ERRORS[error.code] || CONNECTION_ERRORS[error.message] || "Couldn't start the connection. Please try again.");
    renderConnections();
  }
}

async function finishDisconnect(provider) {
  confirmingDisconnect = null;
  showConnectionsMessage("Disconnecting…", false, true);
  try {
    await api.disconnectConnection(provider);
    showConnectionsMessage(`${PROVIDER_AUTH[provider]?.name || "Account"} disconnected.`, true);
  } catch { showConnectionsMessage("Couldn't disconnect right now. Please try again."); }
  await loadConnections();
}

function handleConnectionReturn() {
  const params = new URLSearchParams(location.search);
  const provider = params.get("connection");
  if (provider !== "discord" && provider !== "steam") return;
  const result = params.get("result");
  const reason = params.get("reason");
  const discovery = params.get("discovery");
  history.replaceState(null, "", `${location.pathname}${location.hash}`);
  if (provider === "steam") {
    // Steam has no discovery step: only the fixed result/reason codes are ever read from the URL.
    if (result === "error") showConnectionsMessage(STEAM_ERRORS[reason] || CONNECTION_ERRORS[reason] || STEAM_ERRORS.server_error, false, true);
    else if (STEAM_RETURN_OK[result]) showConnectionsMessage(STEAM_RETURN_OK[result], result !== "cancelled");
    else return;
  } else if (result === "error") showConnectionsMessage(CONNECTION_ERRORS[reason] || CONNECTION_ERRORS.server_error, false, true);
  else if (CONNECTION_RETURN_OK[result]) {
    const extra = (result === "connected" || result === "reconnected") && DISCOVERY_RETURN[discovery] ? ` ${DISCOVERY_RETURN[discovery]}` : "";
    showConnectionsMessage(`${CONNECTION_RETURN_OK[result]}${extra}`, result !== "cancelled", Boolean(extra));
  } else return;
  document.getElementById("connectionsSection").scrollIntoView({ block: "center" });
}

window.addEventListener("pageshow", event => {
  if (!event.persisted || !identity) return;
  connectingProvider = null;
  loadConnections();
});

// ---------------------------------------------------------------------------------------------------------
// Steam "My Games" — DISCOVERY ONLY. Private to the owner (never on the public GamID). Steam's official API is contacted ONLY when
// the owner presses "Load My Games" / "Refresh Games"; there is no polling and no background work. The only timer below re-enables
// the button and makes no request. Everything from the server is rendered as text.
// A game listed here was DISCOVERED through Steam. That is not proof of any in-game profile, character, UID, rank, or stats.
// ---------------------------------------------------------------------------------------------------------
const STEAM_ICON_BASE = "https://media.steampowered.com/steamcommunity/public/images/apps";
const STEAM_GAMES_ERRORS = {
  not_configured: "Steam game lookup isn't set up yet on this TESTING site.",
  not_connected: "Connect Steam first, then load your games.",
  unauthenticated: "Please sign in again, then try again.",
  email_not_verified: "Verify your email before loading your games.",
  identity_not_found: "We couldn't find your GamID. Please refresh the page.",
  connection_changed: "Your Steam connection changed while loading. Please try again.",
  invalid_request: "That request wasn't valid. Please refresh the page and try again.",
  NETWORK_ERROR: "The games service couldn't be reached. Check your connection and try again.",
};
let steamGamesState = null;
let steamGames = [];
let steamGamesBusy = false;
// Which providers' game lists the owner expanded. Every list starts COLLAPSED (see game-list.js): a library can hold hundreds of games.
const gameListExpanded = new Set();
// Game Profiles already held for the owner (game_key -> normalized profile) and which rows the owner opened. Loaded with the stored games; no provider is contacted.
let gameProfileIndex = new Map();
const expandedGameProfiles = new Set();
let steamGamesNotice = null;
let steamGamesTimer;

function steamGamesErrorText(error) {
  if (error.code === "cooldown") return `Steam was asked very recently. Try again in about ${formatWait(error.retryAfterSeconds)}.`;
  if (error.code === "rate_limited") return `You've refreshed a lot for now. Try again in about ${formatWait(error.retryAfterSeconds)}.`;
  return STEAM_GAMES_ERRORS[error.code] || STEAM_GAMES_ERRORS[error.message] || "Couldn't load your games right now. Please try again.";
}

const gamePlural = count => `${count} game${count === 1 ? "" : "s"}`;
const gameHours = minutes => (minutes === 0 ? "No playtime recorded" : minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(minutes < 6000 ? 1 : 0)} h`);

// Distinguishes "Steam gave us games" from "Steam could not tell us": an unavailable library is NEVER reported as zero games.
function steamGamesStatus(state, stored) {
  if (!state?.last_result) return { tone: "info", text: "Not loaded yet. Press Load My Games to ask Steam which games this account can share." };
  const when = state.last_success_at ? formatWhen(state.last_success_at) : null;
  const keep = stored > 0 && when ? ` Still showing your last successful list (${when}).` : "";
  switch (state.last_result) {
    case "AVAILABLE": return { tone: "ok", text: `${gamePlural(state.game_count ?? stored)} from Steam${when ? ` · updated ${when}` : ""}.` };
    case "EMPTY": return { tone: "ok", text: `Steam returned an accessible game library with no games${when ? ` (updated ${when})` : ""}.` };
    case "UNAVAILABLE": return { tone: "warn", text: `Steam didn't share this account's game list, so GamID can't tell what you own — this does NOT mean you have no games. In Steam, open your profile → Edit Profile → Privacy Settings and set "My profile" and "Game details" to Public, then press Refresh Games (Steam can take a few minutes to apply it). GamID never changes anything in Steam.${keep}` };
    case "TEMPORARY_ERROR": return { tone: "warn", text: `Steam couldn't be reached or is busy right now, so nothing was changed. Try again in a few minutes.${keep}` };
    case "SERVICE_ERROR": return { tone: "warn", text: `GamID's connection to Steam's game service isn't working right now (a setup problem on our side, not yours), so nothing was changed.${keep}` };
    case "MALFORMED": return { tone: "warn", text: `Steam answered in a way GamID couldn't read reliably, so nothing was changed.${keep}` };
    default: return { tone: "info", text: "" };
  }
}

function gameIcon(game) {
  const box = element("span", "game-icon");
  const letter = (game.game_name || "?").trim()[0]?.toUpperCase() || "?";
  if (/^[0-9]{1,10}$/.test(game.external_game_id) && /^[0-9a-f]{40}$/.test(game.icon_ref || "")) {
    const image = element("img");
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.width = 32;
    image.height = 32;
    image.src = `${STEAM_ICON_BASE}/${game.external_game_id}/${game.icon_ref}.jpg`;
    image.addEventListener("error", () => { image.remove(); box.textContent = letter; });
    box.append(image);
  } else box.textContent = letter;
  return box;
}

function gameItem(game) {
  const item = element("li", "game-item");
  const copy = element("span", "game-copy");
  const meta = [Number.isInteger(game.playtime_minutes) ? gameHours(game.playtime_minutes) : null, "Discovered via Steam"].filter(Boolean).join(" · ");
  copy.append(element("span", "game-name", game.game_name || `App ${game.external_game_id}`), element("span", "game-meta", meta));
  item.append(gameIcon(game), copy);
  // A row becomes expandable ONLY when a real Game Profile is attached to this game's normalized key (never because a game was merely discovered).
  // Nothing starts open; each game toggles independently and in place.
  const profile = profileForGame(gameProfileIndex, game.recognized_game_key);
  if (profile) attachGameProfile({ element, item, profile, stateKey: `steam:${game.external_game_id}`, expanded: expandedGameProfiles, gameName: game.game_name || `App ${game.external_game_id}` });
  return item;
}

// Recognition only: Steam lists Marvel Rivals among this account's games. It is not a Marvel account / UID / rank / stats verification.
function marvelRecognition() {
  const found = steamGamesState?.recognized_games?.find(item => item.game_key === "marvel_rivals");
  if (found) {
    const box = element("div", "steam-recognized");
    const head = element("div", "steam-recognized-head");
    head.append(element("strong", "", found.display_name || "Marvel Rivals"), element("span", "connection-chip is-connected", "DISCOVERED VIA STEAM"));
    box.append(head, element("p", "connection-discovery-note", "Your Steam games include Marvel Rivals. That is all this means — it does not verify a Marvel account, UID, rank, or stats."));
    return box;
  }
  if (steamGamesState?.last_success_at) {
    return element("p", "connection-discovery-note steam-not-found", "Marvel Rivals: not found in the games Steam returned. (A free-to-play game is listed only once it has been played on this account.)");
  }
  return null;
}

function steamGamesPanel() {
  clearTimeout(steamGamesTimer);
  const panel = element("section", "steam-games");
  panel.setAttribute("aria-label", "My Games");
  const head = element("div", "connection-discovery-head");
  head.append(element("p", "eyebrow", "MY GAMES"), element("span", "connection-chip", "PRIVATE"));
  panel.append(head, element("p", "connection-discovery-note", "Games your Steam account shares with GamID. Private to you — not shown on your public GamID. GamID asks Steam only when you press the button, and saves the game names, IDs and playtime Steam returns (playtime appears only if Steam shares it)."));

  const status = steamGamesStatus(steamGamesState, steamGames.length);
  if (status.text) {
    const line = element("p", `steam-games-status is-${status.tone}`, status.text);
    line.setAttribute("role", "status");
    panel.append(line);
  }
  if (steamGamesNotice) {
    const line = element("p", `steam-games-status is-${steamGamesNotice.tone}`, steamGamesNotice.text);
    line.setAttribute("role", "status");
    panel.append(line);
  }
  const marvel = marvelRecognition();
  if (marvel) panel.append(marvel);

  const availableAt = Date.parse(steamGamesState?.refresh_available_at || "");
  const waitMs = Number.isNaN(availableAt) ? 0 : availableAt - Date.now();
  const everLoaded = Boolean(steamGamesState?.last_success_at) || steamGames.length > 0;
  const label = steamGamesBusy ? "Asking Steam…" : waitMs > 0 ? `Available in ${formatWait(waitMs / 1000)}` : everLoaded ? "Refresh Games" : "Load My Games";
  const button = element("button", "secondary connection-button", label);
  button.type = "button";
  button.disabled = steamGamesBusy || waitMs > 0;
  button.addEventListener("click", refreshMySteamGames);
  panel.append(button);
  // Purely local: re-render once when the cooldown ends so the button re-enables. This makes no request.
  if (waitMs > 0 && waitMs < 2 ** 31 - 1) steamGamesTimer = setTimeout(renderConnections, waitMs + 250);

  if (steamGames.length) {
    // Provider-neutral compact list: a bounded preview, the total count, and a chevron that expands / collapses it (game-list.js).
    panel.append(buildGameLibrary({
      element, games: steamGames, renderItem: gameItem, expanded: gameListExpanded.has("steam"), id: "gameList-steam",
      onToggle: () => { if (gameListExpanded.has("steam")) gameListExpanded.delete("steam"); else gameListExpanded.add("steam"); renderConnections(); },
    }));
    if (steamGamesState?.game_count > steamGames.length) panel.append(element("p", "connection-discovery-note", `Showing the ${steamGames.length} most-played of ${steamGamesState.game_count} games.`));
  }
  return panel;
}

async function loadSteamGames() {
  const connected = Boolean(connectionRows?.some(row => row.provider_key === "steam" && row.connected));
  if (!connected) { steamGamesState = null; steamGames = []; gameListExpanded.delete("steam"); steamGamesNotice = null; steamGamesBusy = false; return; }
  try {
    // Database reads only — this never contacts Steam.
    [steamGamesState, steamGames] = await Promise.all([api.getMyGameDiscoveryState("steam"), api.getMyDiscoveredGames("steam")]);
  } catch {
    steamGamesState = null; steamGames = [];
    steamGamesNotice = { tone: "warn", text: "Couldn't load your saved games right now." };
  }
}

async function refreshMySteamGames() {
  if (steamGamesBusy) return;
  steamGamesBusy = true;
  steamGamesNotice = null;
  renderConnections();
  try {
    await api.refreshSteamGames();
  } catch (error) {
    steamGamesNotice = { tone: "warn", text: steamGamesErrorText(error) };
  }
  steamGamesBusy = false;
  await loadSteamGames();
  renderConnections();
}

// ---------------------------------------------------------------------------------------------------------
// League of Legends PROTOTYPE — manual Riot ID + a temporary data source. Private to the owner, unverified by design.
// A lookup happens ONLY when the owner presses "Add League Account" or "Refresh". There is no polling and no background work;
// the single timer below only re-enables the Refresh button and makes no network request.
// ---------------------------------------------------------------------------------------------------------
// Kept in step with supabase/functions/_shared/league/league-domain.js (a test asserts they match).
const LEAGUE_REGIONS = [
  ["NA1", "North America (NA1)"], ["EUW1", "Europe West (EUW1)"], ["EUN1", "Europe Nordic & East (EUN1)"], ["KR", "Korea (KR)"],
  ["JP1", "Japan (JP1)"], ["BR1", "Brazil (BR1)"], ["LA1", "Latin America North (LA1)"], ["LA2", "Latin America South (LA2)"],
  ["OC1", "Oceania (OC1)"], ["TR1", "Türkiye (TR1)"], ["RU", "Russia (RU)"], ["ME1", "Middle East (ME1)"],
  ["SG2", "Singapore (SG2)"], ["TW2", "Taiwan (TW2)"], ["VN2", "Vietnam (VN2)"], ["PH2", "Philippines (PH2)"], ["TH2", "Thailand (TH2)"],
];
const LEAGUE_SOURCE_LABELS = { OPGG_TEMPORARY: "OP.GG" };
const LEAGUE_APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const LEAGUE_DIVISION = { I: "I", II: "II", III: "III", IV: "IV" };
const LEAGUE_RESULT_MESSAGES = {
  ok_add: "League account added. The details below came from a temporary source and are not verified.",
  ok_refresh: "League details refreshed.",
  not_found: "OP.GG couldn't find that Riot ID in the selected region. Check the game name, tagline and region.",
  unavailable: "OP.GG couldn't be reached right now, so nothing was changed. Please try again later.",
  structure_changed: "OP.GG returned something GamID couldn't read reliably, so nothing was changed.",
  identity_mismatch: "OP.GG returned a different player than the one you entered, so nothing was changed.",
};
const LEAGUE_ERRORS = {
  already_exists: "A League account is already added. Remove it first to add a different one.",
  no_profile: "There's no League account to refresh yet.",
  unauthenticated: "Please sign in again, then try again.",
  email_not_verified: "Verify your email before adding a League account.",
  identity_not_found: "We couldn't find your GamID. Please refresh the page.",
  NETWORK_ERROR: "The lookup service couldn't be reached. Check your connection and try again.",
  lookup_failed: "Something went wrong with the lookup. Please try again later.",
  save_failed: "The lookup worked but couldn't be saved. Please try again later.",
  not_configured: "League lookup isn't available on this TESTING site yet.",
};
const LEAGUE_FIELD_ERRORS = { game_name: "Check the Riot game name.", tag_line: "Check the tagline (no spaces, # or -).", region: "Choose a region." };
const LEAGUE_FAILURE_REASONS = { NOT_FOUND: "the profile wasn't found", UNAVAILABLE: "the data source was unavailable", STRUCTURE_CHANGED: "the data source's format changed", IDENTITY_MISMATCH: "the source returned a different player" };
let leagueProfile = null;
let leagueLoaded = false;
let leagueBusy = null;
let confirmingLeagueRemove = false;
let leagueMessageTimer;
let leagueRefreshTimer;
let leagueDraft = { gameName: "", tagLine: "", platformId: "" };

function showLeagueMessage(text, success = false, sticky = false) {
  const el = document.getElementById("leagueMessage");
  clearTimeout(leagueMessageTimer);
  el.textContent = text;
  el.classList.toggle("success", success);
  el.hidden = !text;
  if (text && !sticky) leagueMessageTimer = setTimeout(() => { el.hidden = true; }, 10000);
}

const leagueRegionLabel = platformId => LEAGUE_REGIONS.find(([id]) => id === platformId)?.[1] || platformId;
const titleCase = value => `${value.charAt(0)}${value.slice(1).toLowerCase()}`;
const formatWhen = iso => { const when = new Date(iso); return Number.isNaN(when.getTime()) ? null : when.toLocaleString(); };
function formatWait(seconds) {
  const s = Math.max(1, Math.ceil(Number(seconds) || 60));
  return s < 90 ? `${s} second${s === 1 ? "" : "s"}` : `${Math.ceil(s / 60)} minutes`;
}

function leagueErrorMessage(error) {
  if (error.code === "invalid_input") return LEAGUE_FIELD_ERRORS[error.field] || "Check the Riot ID and region you entered.";
  if (error.code === "cooldown") return `Please wait about ${formatWait(error.retryAfterSeconds)} before looking up again.`;
  if (error.code === "rate_limited") return `Too many lookups for now. Try again in about ${formatWait(error.retryAfterSeconds)}.`;
  return LEAGUE_ERRORS[error.code] || LEAGUE_ERRORS.lookup_failed;
}

function leagueRankText(profile) {
  if (profile.solo_rank_state !== "RANKED" || !profile.solo_tier) return "No ranked Solo/Duo rank reported";
  const division = !LEAGUE_APEX.has(profile.solo_tier) && LEAGUE_DIVISION[profile.solo_division] ? ` ${LEAGUE_DIVISION[profile.solo_division]}` : "";
  return `${titleCase(profile.solo_tier)}${division} · ${profile.solo_lp} LP`;
}

function leagueForm() {
  const form = element("form", "league-form");
  form.noValidate = true;
  form.append(element("p", "connection-discovery-note", "Enter your Riot ID once. GamID looks up public League details from OP.GG, a temporary source. Typing a Riot ID doesn't prove you own the account."));

  const idRow = element("div", "league-id-row");
  const nameLabel = element("label", "league-field");
  nameLabel.append(element("span", "", "Riot ID"));
  const name = element("input", "league-input");
  name.type = "text"; name.name = "gameName"; name.placeholder = "Game Name"; name.maxLength = 64; name.autocomplete = "off"; name.spellcheck = false;
  name.setAttribute("aria-label", "Riot game name");
  name.value = leagueDraft.gameName;
  nameLabel.append(name);
  const hash = element("span", "league-hash", "#");
  hash.setAttribute("aria-hidden", "true");
  const tagLabel = element("label", "league-field league-tag");
  tagLabel.append(element("span", "", "Tagline"));
  const tag = element("input", "league-input");
  tag.type = "text"; tag.name = "tagLine"; tag.placeholder = "Tagline"; tag.maxLength = 20; tag.autocomplete = "off"; tag.spellcheck = false;
  tag.setAttribute("aria-label", "Riot tagline");
  tag.value = leagueDraft.tagLine;
  tagLabel.append(tag);
  idRow.append(nameLabel, hash, tagLabel);

  const regionLabel = element("label", "league-field");
  regionLabel.append(element("span", "", "Region"));
  const region = element("select", "league-input");
  region.name = "platformId";
  const placeholder = element("option", "", "Select your region");
  placeholder.value = ""; placeholder.disabled = true; placeholder.selected = !leagueDraft.platformId;
  region.append(placeholder);
  for (const [id, label] of LEAGUE_REGIONS) { const option = element("option", "", label); option.value = id; option.selected = id === leagueDraft.platformId; region.append(option); }
  regionLabel.append(region);

  const submit = element("button", "secondary connection-button", leagueBusy === "add" ? "Looking up…" : "Add League Account");
  submit.type = "submit";
  submit.disabled = Boolean(leagueBusy);
  form.append(idRow, regionLabel, submit);

  // Keep what was typed if the view re-renders (e.g. after an error).
  const remember = () => { leagueDraft = { gameName: name.value, tagLine: tag.value, platformId: region.value }; };
  form.addEventListener("input", remember);
  form.addEventListener("change", remember);
  form.addEventListener("submit", event => { event.preventDefault(); remember(); submitLeagueAdd(); });
  return form;
}

function leagueProfileView(profile) {
  const frag = document.createDocumentFragment();
  const head = element("div", "connection-head");
  const avatar = element("div", "connection-avatar", "L");
  const copy = element("div", "connection-copy");
  copy.append(element("strong", "", "League of Legends"), element("span", "connection-name", `${profile.game_name}#${profile.tag_line}`), element("span", "connection-handle", leagueRegionLabel(profile.platform_id)));
  head.append(avatar, copy, element("span", "connection-chip league-chip", "PROTOTYPE / UNVERIFIED"));
  frag.append(head);

  const rank = element("div", "league-rank");
  rank.append(element("strong", "league-rank-title", leagueRankText(profile)));
  if (Number.isInteger(profile.solo_wins) && Number.isInteger(profile.solo_losses)) rank.append(element("span", "connection-name", `Ranked Solo/Duo · ${profile.solo_wins}W ${profile.solo_losses}L`));
  else if (profile.solo_rank_state === "RANKED") rank.append(element("span", "connection-name", "Ranked Solo/Duo"));
  frag.append(rank);

  const facts = element("dl", "connection-discovery-facts");
  const add = (label, value) => { facts.append(element("dt", "", label), element("dd", "", value)); };
  add("Data source", LEAGUE_SOURCE_LABELS[profile.data_source] || "Third-party source");
  const fetched = formatWhen(profile.fetched_at);
  add("Last updated", fetched || "unknown");
  const sourceWhen = profile.source_updated_at ? formatWhen(profile.source_updated_at) : null;
  if (sourceWhen) add("Source data as of", sourceWhen);
  if (Number.isInteger(profile.profile_icon_id)) add("Profile icon ID", String(profile.profile_icon_id));
  frag.append(facts);

  if (profile.last_result && profile.last_result !== "OK") {
    frag.append(element("p", "connection-discovery-note league-warning", `The last refresh didn't work (${LEAGUE_FAILURE_REASONS[profile.last_result] || "an unexpected problem"}). Showing the previous details.`));
  }
  const unverifiedNote = "Unverified: your Riot ID was entered manually, so this isn't proof of account ownership.";
  frag.append(element("p", "connection-privacy", profile.is_public
    ? `${isGamidPublished() ? "Shown on your public GamID" : "Will appear on your public GamID once you publish it"}, marked PROTOTYPE / UNVERIFIED (data: ${LEAGUE_SOURCE_LABELS[profile.data_source] || "a third-party source"}). ${unverifiedNote}`
    : `Private — not shown on your public GamID. ${unverifiedNote}`));
  frag.append(visibilitySwitch({ on: Boolean(profile.is_public), onChange: next => changeSectionVisibility("league", next, showLeagueMessage, loadLeague) }));

  try {
    const url = new URL(profile.source_url);
    if (url.protocol === "https:") {
      const link = element("a", "league-source-link", "View the source page");
      link.href = url.toString(); link.target = "_blank"; link.rel = "noopener noreferrer nofollow";
      frag.append(link);
    }
  } catch { /* an unusable URL is simply not shown */ }

  const actions = element("div", "connection-actions");
  if (confirmingLeagueRemove) {
    actions.append(element("p", "connection-confirm", "Remove your League account from GamID? Your GamID, Intro, and public profile stay exactly as they are."));
    const confirm = element("button", "secondary connection-button danger", "Remove League account");
    confirm.type = "button"; confirm.disabled = Boolean(leagueBusy);
    confirm.addEventListener("click", finishLeagueRemove);
    const cancel = element("button", "text-button connection-button", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => { confirmingLeagueRemove = false; renderLeague(); });
    actions.append(confirm, cancel);
  } else {
    const availableAt = Date.parse(profile.refresh_available_at || "");
    const waitMs = Number.isNaN(availableAt) ? 0 : availableAt - Date.now();
    const refresh = element("button", "secondary connection-button", leagueBusy === "refresh" ? "Refreshing…" : waitMs > 0 ? `Refresh available in ${formatWait(waitMs / 1000)}` : "Refresh");
    refresh.type = "button";
    refresh.disabled = Boolean(leagueBusy) || waitMs > 0;
    refresh.addEventListener("click", submitLeagueRefresh);
    const remove = element("button", "text-button danger connection-button", "Remove");
    remove.type = "button"; remove.disabled = Boolean(leagueBusy);
    remove.addEventListener("click", () => { confirmingLeagueRemove = true; renderLeague(); });
    actions.append(refresh, remove);
    // Purely local: re-render once when the cooldown ends so the button re-enables. This makes no request.
    if (waitMs > 0 && waitMs < 2 ** 31 - 1) leagueRefreshTimer = setTimeout(renderLeague, waitMs + 250);
  }
  frag.append(actions);
  return frag;
}

function renderLeague() {
  clearTimeout(leagueRefreshTimer);
  const container = document.getElementById("leagueCard");
  if (!leagueLoaded) { container.replaceChildren(element("p", "connections-empty", "League of Legends couldn't be loaded right now. Refresh to try again.")); return; }
  const card = element("article", `connection-card league-card${leagueProfile ? " is-connected" : ""}`);
  if (leagueProfile) card.append(leagueProfileView(leagueProfile));
  else {
    const head = element("div", "connection-head");
    const copy = element("div", "connection-copy");
    copy.append(element("strong", "", "League of Legends"), element("span", "connection-name", "Prototype · unverified"));
    head.append(element("div", "connection-avatar", "L"), copy, element("span", "connection-chip", "NOT ADDED"));
    card.append(head, leagueForm());
  }
  container.replaceChildren(card);
}

async function loadLeague() {
  try { leagueProfile = await api.getMyLeagueProfile(); leagueLoaded = true; }
  catch { leagueProfile = null; leagueLoaded = false; }
  renderLeague();
}

function splitRiotId() {
  // Convenience: a pasted "Name#TAG" in the name box is split for the owner (the server still validates everything).
  const at = leagueDraft.gameName.lastIndexOf("#");
  if (at > 0 && !leagueDraft.tagLine.trim()) leagueDraft = { ...leagueDraft, gameName: leagueDraft.gameName.slice(0, at), tagLine: leagueDraft.gameName.slice(at + 1) };
}

async function runLeagueLookup(action, busy) {
  if (leagueBusy) return;
  leagueBusy = busy;
  confirmingLeagueRemove = false;
  showLeagueMessage(action === "add" ? "Looking up your League profile…" : "Refreshing…", false, true);
  renderLeague();
  try {
    const result = await api.lookupLeagueProfile(action, { gameName: leagueDraft.gameName.trim(), tagLine: leagueDraft.tagLine.trim().replace(/^#/, ""), platformId: leagueDraft.platformId });
    if (result?.status === "ok") {
      showLeagueMessage(LEAGUE_RESULT_MESSAGES[action === "add" ? "ok_add" : "ok_refresh"], true, true);
      if (action === "add") leagueDraft = { gameName: "", tagLine: "", platformId: "" };
    } else showLeagueMessage(LEAGUE_RESULT_MESSAGES[result?.status] || LEAGUE_ERRORS.lookup_failed, false, true);
  } catch (error) {
    showLeagueMessage(leagueErrorMessage(error), false, true);
  }
  leagueBusy = null;
  await loadLeague();
}

function submitLeagueAdd() {
  splitRiotId();
  if (!leagueDraft.gameName.trim() || !leagueDraft.tagLine.trim()) { showLeagueMessage("Enter your Riot game name and tagline (the part after the #).", false, true); renderLeague(); return; }
  if (!leagueDraft.platformId) { showLeagueMessage(LEAGUE_FIELD_ERRORS.region, false, true); renderLeague(); return; }
  runLeagueLookup("add", "add");
}

function submitLeagueRefresh() { runLeagueLookup("refresh", "refresh"); }

async function finishLeagueRemove() {
  if (leagueBusy) return;
  leagueBusy = "remove";
  showLeagueMessage("Removing…", false, true);
  renderLeague();
  try {
    await api.removeLeagueProfile();
    showLeagueMessage("League account removed.", true);
  } catch { showLeagueMessage("Couldn't remove it right now. Please try again.", false, true); }
  confirmingLeagueRemove = false;
  leagueBusy = null;
  await loadLeague();
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
  event.preventDefault(); setMessage("");
  const values = Object.fromEntries(new FormData(signinForm));
  busy(signinForm, true);
  try {
    await api.signIn(values.email.trim(), values.password);
  } catch (error) {
    setMessage(authErrorMessage(error, "signin"));
    busy(signinForm, false);
    return;
  }
  try { await routeAuthenticated(); }
  catch (error) { setMessage(`Signed in, but the account could not be loaded (${String(error?.code || "ACCOUNT_LOAD_ERROR").toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64)}). Refresh to try again.`); }
  finally { busy(signinForm, false); }
});

document.getElementById("backToSignIn").addEventListener("click", () => { showView("auth"); document.getElementById("signinTab").click(); });
document.getElementById("forgotButton").addEventListener("click", () => showView("forgot"));
document.getElementById("cancelForgot").addEventListener("click", () => { showView("auth"); document.getElementById("signinTab").click(); });

document.getElementById("forgotForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; const email = new FormData(form).get("email").trim(); busy(form, true); setMessage("");
  try { await api.sendPasswordReset(email); setMessage("If that account exists, a reset link has been sent.", true); }
  catch (error) { setMessage(authErrorMessage(error, "recovery")); }
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
document.getElementById("gamingRoleChoices").addEventListener("change", () => { syncPrimaryRole(); updateProfilePreview(); });
document.getElementById("primaryRoleSelect").addEventListener("change", updateProfilePreview);
document.getElementById("educationWorkStatus").addEventListener("change", () => { syncEducationContext(); updateProfilePreview(); });
document.getElementById("profileInstitution").addEventListener("input", updateProfilePreview);
document.getElementById("profileFieldOfStudy").addEventListener("input", updateProfilePreview);

function inspectIntroFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const durationMs = Math.round(video.duration * 1000);
      video.removeAttribute("src"); video.load();
      const validation = validateIntroSource(file, durationMs);
      if (!validation.valid) { URL.revokeObjectURL(url); reject(Object.assign(new Error(validation.reason), { code:validation.reason })); }
      else resolve({ file, url, durationMs, jobId:crypto.randomUUID() });
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(Object.assign(new Error("INVALID_INTRO_TYPE"), { code:"INVALID_INTRO_TYPE" })); };
    video.src = url;
  });
}

document.getElementById("introVideoInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    // Snapshot Samsung/Android Gallery-backed content while the selection event
    // still owns a readable handle. Later TUS PATCH retries must read from an
    // application-owned Blob, not a transient content URI.
    const ownedFile = await createOwnedUploadBlob(file);
    const inspected = await inspectIntroFile(ownedFile);
    releasePendingIntro();
    pendingIntroSource = inspected;
    introAction = "replace";
    updateProfilePreview();
  } catch (error) {
    event.target.value = "";
    setMessage(errorMessage(reasonFrom(error) || error.code || error.message));
  }
});

introTransition.addEventListener("change", updateProfilePreview);
document.getElementById("removeIntroButton").addEventListener("click", () => {
  releasePendingIntro(); introAction = "remove"; updateProfilePreview();
});

document.getElementById("visibilityToggle").addEventListener("click", async event => {
  const button = event.currentTarget;
  const goingPublic = identity?.visibility !== "PUBLIC";
  button.disabled = true;
  try {
    const result = await api.setMyIdentityVisibility(goingPublic);
    identity = { ...identity, visibility: result?.visibility || (goingPublic ? "PUBLIC" : "PRIVATE") };
    setMessage(goingPublic ? "Your GamID is now public." : "Your GamID is private again.", true);
  } catch (error) {
    setMessage(errorMessage(reasonFrom(error) || error.message));
  } finally {
    renderVisibility();
    // the per-section hints ("Shown on your public GamID" vs "Will appear once you publish") depend on the publish state
    renderConnections(); renderLeague(); renderEducationVisibility();
  }
});

function currentPreviewConfig() {
  const draft = profileDraft();
  const primary = catalogLabel(roleCatalog, draft.primaryRoleKey);
  const secondary = draft.roleKeys.filter(key => key !== draft.primaryRoleKey).map(key => catalogLabel(roleCatalog,key));
  const education = [catalogLabel(educationWorkCatalog,draft.educationWorkStatus),draft.institution,draft.fieldOfStudy].filter(Boolean).join(" · ");
  return {
    videoUrl:pendingIntroSource?.url || activeIntroUrl, transitionKey:introDraft().transitionKey,
    avatarUrl:avatarPreviewUrl || persistedAvatarUrl || "", displayName:draft.displayName.trim(),
    handle:`@${identity.gamid_handle}`, primaryRole:primary, secondaryRoles:secondary, education, bio:draft.bio,
  };
}

function sendPreviewConfig() {
  if (!pendingPreviewConfig || previewConfigDelivered) return;
  previewConfigDelivered = true;
  document.getElementById("introPreviewFrame").contentWindow?.postMessage({ type:"gamid-intro-preview", config:pendingPreviewConfig }, location.origin);
}

document.getElementById("previewIntroButton").addEventListener("click", () => {
  pendingPreviewConfig = currentPreviewConfig();
  if (!pendingPreviewConfig.videoUrl) return;
  previewConfigDelivered = false;
  document.getElementById("introPreviewDialog").showModal();
  sendPreviewConfig();
});
document.getElementById("closeIntroPreview").addEventListener("click", () => {
  document.getElementById("introPreviewDialog").close(); pendingPreviewConfig = null;
});
document.getElementById("introPreviewFrame").addEventListener("load", sendPreviewConfig);
window.addEventListener("message", event => {
  if (event.origin !== location.origin) return;
  if (event.data?.type === "gamid-intro-preview-ready") sendPreviewConfig();
  if (event.data?.type === "gamid-intro-preview-error") setMessage("The selected Intro could not be previewed.");
});

for (const toggle of document.querySelectorAll(".section-toggle")) {
  toggle.addEventListener("click", () => {
    const opening = toggle.getAttribute("aria-expanded") !== "true";
    for (const other of document.querySelectorAll(".section-toggle")) {
      const panel = document.getElementById(other.getAttribute("aria-controls"));
      const expanded = other === toggle && opening;
      other.setAttribute("aria-expanded", String(expanded));
      panel.hidden = !expanded;
    }
  });
}
document.getElementById("profileAvatarInput").addEventListener("change", event => {
  const file = event.target.files[0];
  avatarDiag("input-change", `hasFile=${Boolean(file)}`);
  // Keep the native input as the owner of Android's gallery-backed File until
  // this decode/crop session finishes. Clearing it here can invalidate a
  // transient Samsung content URI before either decoder has consumed it.
  openAvatarCrop(file);
});

cropStage.addEventListener("pointerdown", event => {
  cropStage.setPointerCapture(event.pointerId);
  cropPointers.set(event.pointerId, cropPoint(event));
});
cropStage.addEventListener("pointermove", event => {
  if (!cropPointers.has(event.pointerId) || !cropState) return;
  const before = cropGesture();
  cropPointers.set(event.pointerId, cropPoint(event));
  const after = cropGesture();
  cropState.pan(after.center.x - before.center.x, after.center.y - before.center.y);
  if (before.distance > 0 && after.distance > 0) {
    cropState.setZoom(cropState.zoom * after.distance / before.distance, after.center.x, after.center.y);
  }
  renderCrop();
});
const endCropPointer = event => cropPointers.delete(event.pointerId);
cropStage.addEventListener("pointerup", endCropPointer);
cropStage.addEventListener("pointercancel", endCropPointer);
cropZoom.addEventListener("input", () => { cropState?.setZoom(Number(cropZoom.value)); renderCrop(); });
cropStage.addEventListener("wheel", event => {
  if (!cropState) return;
  event.preventDefault();
  const point = cropPoint(event);
  cropState.setZoom(cropState.zoom * (event.deltaY < 0 ? 1.08 : .92), point.x, point.y);
  renderCrop();
}, { passive:false });
document.getElementById("cancelAvatarCrop").addEventListener("click", cancelAvatarCrop);
cropDialog.addEventListener("cancel", event => { event.preventDefault(); cancelAvatarCrop(); });
document.getElementById("applyAvatarCrop").addEventListener("click", async event => {
  if (!cropImage || !cropState) return;
  const button = event.currentTarget;
  const applyingImage = cropImage;
  const applyingState = cropState;
  const applyingOperation = cropOperation;
  button.disabled = true;
  avatarDiag("apply-start", `g${applyingOperation}`);
  try {
    const normalized = await createNormalizedAvatar(applyingImage, applyingState);
    if (!avatarDecoder.isCurrent(applyingOperation, applyingImage)) { avatarDiag("apply-stale", `g${applyingOperation}`); return; }
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    pendingAvatar = normalized.blob;
    avatarPreviewUrl = URL.createObjectURL(pendingAvatar);
    const avatar = document.getElementById("avatarSummary");
    avatar.style.backgroundImage = `url("${avatarPreviewUrl}")`;
    avatar.textContent = "";
    cropDialog.close();
    releaseCropImage("apply-complete");
    document.getElementById("profileAvatarInput").value = "";
    updateProfilePreview();
    avatarDiag("apply-success", `bytes=${pendingAvatar.size};type=${pendingAvatar.type}`);
  } catch (error) { avatarDiag("apply-failure", error?.name || "Error"); setMessage("The Avatar crop could not be prepared. Try again."); }
  finally { button.disabled = false; }
});

document.getElementById("profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const draft = validateProfileDraft(profileDraft(), profileCatalogs());
  if (!draft.valid) return setMessage(errorMessage(draft.reason));
  if (!isProfileDirty()) return;
  let saved = false;
  const introChange = introDraft();
  const introSource = pendingIntroSource;
  busy(form, true); setMessage("");
  try {
    let avatarPath = null;
    if (pendingAvatar) avatarPath = await api.uploadAvatar(pendingAvatar, api.userIdFromToken(), { attach: false });
    const updated = await api.updateIdentityProfile({ ...draft, avatarPath });
    if (introSource) {
      let sourcePath;
      try {
        sourcePath = await api.uploadIntroSource(introSource.file, api.userIdFromToken(), introSource.jobId);
        await api.queueIntro({
          jobId:introSource.jobId, sourcePath, transitionKey:introChange.transitionKey,
          sourceMime:introSource.file.type, sourceSize:introSource.file.size, durationMs:introSource.durationMs,
        });
      } catch (error) {
        if (sourcePath) { try { await api.deleteIntroSource(sourcePath); } catch { /* Server cleanup remains possible for an orphan. */ } }
        throw error;
      }
    } else if (introChange.action === "remove") await api.removeIntro();
    else if (savedIntro?.transitionKey !== introChange.transitionKey) await api.setIntroTransition(introChange.transitionKey);
    identity = { ...identity, ...updated };
    savedProfile = {
      displayName:updated.display_name, bio:updated.bio, avatarPath:updated.avatar_media_reference,
      roleKeys:updated.role_keys || [], primaryRoleKey:updated.primary_role_key,
      educationWorkStatus:updated.education_work_status, institution:updated.institution || "", fieldOfStudy:updated.field_of_study || "",
    };
    resetAvatarCropLifecycle("save-success");
    await setPersistedAvatar(updated.avatar_media_reference, updated.display_name?.[0]?.toUpperCase() || "G");
    document.getElementById("profileDisplayName").value = updated.display_name;
    document.getElementById("profileBio").value = updated.bio;
    [...document.querySelectorAll('input[name="gamingRole"]')].forEach(input => { input.checked = savedProfile.roleKeys.includes(input.value); });
    syncPrimaryRole();
    document.getElementById("primaryRoleSelect").value = savedProfile.primaryRoleKey || "";
    document.getElementById("educationWorkStatus").value = savedProfile.educationWorkStatus || "";
    document.getElementById("profileInstitution").value = savedProfile.institution;
    document.getElementById("profileFieldOfStudy").value = savedProfile.fieldOfStudy;
    syncEducationContext();
    const intro=await api.getMyIntro();
    await restoreIntroState(intro);
    if (isProcessingIntroState(intro)) introStatusPoller.start();
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
  finally { introStatusPoller.stop(); releasePendingIntro(); if (activeIntroUrl) URL.revokeObjectURL(activeIntroUrl); activeIntroUrl = null; identity = null; savedProfile = null; savedIntro = null; pendingAvatar = null; showView("auth"); document.getElementById("signinTab").click(); }
});
window.addEventListener("beforeunload", event => {
  if (!isProfileDirty()) return;
  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("pageshow", event => {
  avatarDiag("pageshow", `persisted=${event.persisted}`);
  if (!event.persisted || !identity) return;
  resetAvatarCropLifecycle("pageshow-persisted");
  setPersistedAvatar(savedProfile?.avatarPath, identity.display_name?.trim()?.[0]?.toUpperCase() || "G").then(updateProfilePreview);
});
window.addEventListener("pagehide", () => {
  avatarDiag("pagehide");
  if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  if (persistedAvatarUrl) URL.revokeObjectURL(persistedAvatarUrl);
  if (pendingIntroSource?.url) URL.revokeObjectURL(pendingIntroSource.url);
  if (activeIntroUrl) URL.revokeObjectURL(activeIntroUrl);
}, { once: true });

if (avatarDiagnosticsEnabled) {
  const diagnostics = document.getElementById("avatarDiagnostics");
  diagnostics.hidden = false;
  avatarDiag("script-init", `navigation=${performance.getEntriesByType("navigation")[0]?.type || "unknown"}`);
  document.getElementById("copyAvatarDiagnostics").addEventListener("click", async event => {
    try { await navigator.clipboard.writeText(avatarDiagnosticLog.join("\n")); event.currentTarget.textContent = "Copied ✓"; }
    catch { event.currentTarget.textContent = "Select the log above"; }
  });
  document.getElementById("clearAvatarDiagnostics").addEventListener("click", () => {
    avatarDiagnosticLog = [];
    try { sessionStorage.removeItem(avatarDiagnosticKey); } catch { /* Nothing else to clear. */ }
    document.getElementById("avatarDiagnosticOutput").textContent = "";
    avatarDiag("diagnostics-cleared");
  });
}

try {
  const redirected = api.consumeRedirectSession();
  await api.restoreSession();
  if (redirected?.type === "recovery") showView("recovery");
  else await routeAuthenticated();
} catch { showView("auth"); }

// Landing-page deep link (/account/?auth=signin | ?auth=register): only picks the tab of the existing auth view, and only when
// that view is what the visitor is looking at (a signed-in owner goes straight to YOUR GAMID as before). It touches no session.
{
  const tab = authTabFromSearch(location.search);
  if (tab && document.getElementById("authView").classList.contains("is-active")) document.getElementById(tab === "signin" ? "signinTab" : "registerTab").click();
  if (new URLSearchParams(location.search).has("auth")) history.replaceState(null, "", `${location.pathname}${searchWithoutAuth(location.search)}${location.hash}`);
}
