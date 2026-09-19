import { INTRO_TRANSITIONS, authErrorMessage, authLanding, debounceAsync, errorMessage, hasIntroChanges, hasProfileChanges, normalizeHandle, validateHandle, validateIntroSource, validateProfileDraft } from "./domain.js";
import { AVATAR_PREVIEW_SIZE, AvatarCropState, AvatarDecodeSession, createNormalizedAvatar, createOwnedImageBlob, drawCropPreview, loadOrientedImage } from "./avatar-cropper.js";
import { PRESETS } from "../transition-engine.js";
import * as api from "./supabase-client.js";
import { createOwnedUploadBlob } from "./resumable-upload.js";
import { IntroStatusPoller, isProcessingIntroState } from "./intro-status-poller.js";

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
  renderShare();
  await loadConnections();
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
const FRONTEND_CONNECTABLE = new Set(["discord"]);
const CONNECTION_RETURN_OK = { connected: "Discord connected.", reconnected: "Discord reconnected.", cancelled: "Discord connection cancelled. Nothing was changed." };
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
  if (row.connected) {
    const primary = row.provider_display_name || row.provider_username || "";
    if (primary) copy.append(element("span", "connection-name", primary));
    if (row.provider_username && row.provider_username !== primary) copy.append(element("span", "connection-handle", `@${row.provider_username}`));
  }
  const chip = element("span", `connection-chip${row.connected ? " is-connected" : ""}`, row.connected ? "CONNECTED" : "NOT CONNECTED");
  head.append(avatar, copy, chip);
  card.append(head);

  if (row.connected) card.append(element("p", "connection-privacy", row.is_public ? "Shown on your public GamID." : "Private — not shown on your public GamID."));

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
  if (!connectionRows) { list.replaceChildren(element("p", "connections-empty", "Connections couldn't be loaded right now. Refresh to try again.")); return; }
  list.replaceChildren(...connectionRows.map(connectionCard));
}

async function loadConnections() {
  try { connectionRows = await api.getMyConnections(); }
  catch { connectionRows = null; }
  renderConnections();
}

async function beginConnection(provider) {
  if (connectingProvider) return;
  connectingProvider = provider;
  confirmingDisconnect = null;
  showConnectionsMessage("Opening Discord…", false, true);
  renderConnections();
  try {
    const { authorization_url: target } = await api.startConnection(provider);
    if (typeof target !== "string" || !target.startsWith("https://discord.com/oauth2/authorize?")) throw new Error("INVALID_AUTHORIZATION_URL");
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
    showConnectionsMessage(`${provider === "discord" ? "Discord" : "Account"} disconnected.`, true);
  } catch { showConnectionsMessage("Couldn't disconnect right now. Please try again."); }
  await loadConnections();
}

function handleConnectionReturn() {
  const params = new URLSearchParams(location.search);
  if (params.get("connection") !== "discord") return;
  const result = params.get("result");
  const reason = params.get("reason");
  history.replaceState(null, "", `${location.pathname}${location.hash}`);
  if (result === "error") showConnectionsMessage(CONNECTION_ERRORS[reason] || CONNECTION_ERRORS.server_error, false, true);
  else if (CONNECTION_RETURN_OK[result]) showConnectionsMessage(CONNECTION_RETURN_OK[result], result !== "cancelled");
  else return;
  document.getElementById("connectionsSection").scrollIntoView({ block: "center" });
}

window.addEventListener("pageshow", event => {
  if (!event.persisted || !identity) return;
  connectingProvider = null;
  loadConnections();
});

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
