import { getPublicIdentity, loadPublicAvatar, loadPublicIntroMedia } from "../account/supabase-client.js";

const catalogLabel = (catalog, key) => catalog?.find(item => item.key === key)?.label || key || "";

async function buildConfig(identity) {
  const primaryLabel = catalogLabel(identity.role_catalog, identity.primary_role_key);
  const secondaryLabels = (identity.role_keys || [])
    .filter(key => key !== identity.primary_role_key)
    .map(key => catalogLabel(identity.role_catalog, key));
  const educationLabel = catalogLabel(identity.education_work_catalog, identity.education_work_status);
  const education = [educationLabel, identity.institution, identity.field_of_study].filter(Boolean).join(" · ");
  const [avatarUrl, videoUrl] = await Promise.all([
    loadPublicAvatar(identity.avatar_media_reference).catch(() => null),
    loadPublicIntroMedia(identity.intro_derivative_path).catch(() => null),
  ]);
  return {
    publicMode: true,
    videoUrl: videoUrl || "",
    transitionKey: identity.intro_transition_key || "fade",
    avatarUrl: avatarUrl || "",
    displayName: identity.display_name || "Gamer",
    handle: `@${identity.gamid_handle}`,
    primaryRole: primaryLabel,
    secondaryRoles: secondaryLabels,
    education,
    bio: identity.bio || "",
  };
}

async function render() {
  const loading = document.getElementById("loadingState");
  const notFound = document.getElementById("notFoundState");
  const experienceWrap = document.getElementById("experienceWrap");
  const frame = document.getElementById("experienceFrame");
  const replayButton = document.getElementById("replayIntroButton");

  let frameReady = false;
  let config = null;
  let hasIntro = false;
  const send = () => { if (frameReady && config) frame.contentWindow?.postMessage({ type: "gamid-intro-preview", config }, location.origin); };

  addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "gamid-intro-preview-ready") { frameReady = true; send(); }
    if (event.data?.type === "gamid-intro-preview-state") replayButton.hidden = !hasIntro || event.data.state !== "profile";
  });
  replayButton.addEventListener("click", send);

  const handle = (new URLSearchParams(location.search).get("handle") || "").trim().replace(/^@/, "");

  let identity = null;
  if (handle) {
    try { identity = await getPublicIdentity(handle); } catch { identity = null; }
  }

  loading.hidden = true;
  if (!identity) { notFound.hidden = false; return; }

  config = await buildConfig(identity);
  hasIntro = Boolean(config.videoUrl);
  experienceWrap.hidden = false;
  send();
}

render();
