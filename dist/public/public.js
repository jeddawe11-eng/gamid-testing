import { getPublicIdentity, getPublicIdentityByQr, loadPublicAvatar, loadPublicIntroMedia } from "../account/supabase-client.js";

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
  let initialSendDone = false;
  let revealed = false;
  const sendReplay = () => { if (config) frame.contentWindow?.postMessage({ type: "gamid-intro-preview", config }, location.origin); };
  const sendInitial = () => { if (initialSendDone || !frameReady || !config) return; initialSendDone = true; sendReplay(); };

  addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "gamid-intro-preview-ready") { frameReady = true; sendInitial(); }
    if (event.data?.type === "gamid-intro-preview-state") {
      // The child only ever broadcasts a state after play() has actually applied a config, so this is
      // the proof (not a guess) that the iframe now shows this identity rather than its raw placeholder markup.
      if (!revealed) { revealed = true; loading.hidden = true; experienceWrap.hidden = false; }
      replayButton.hidden = !hasIntro || event.data.state !== "profile";
    }
  });
  frame.addEventListener("load", () => { frameReady = true; sendInitial(); });
  replayButton.addEventListener("click", sendReplay);

  const params = new URLSearchParams(location.search);
  const handle = (params.get("handle") || "").trim().replace(/^@/, "");
  const qrToken = (params.get("qr") || "").trim();

  let identity = null;
  if (handle) {
    try { identity = await getPublicIdentity(handle); } catch { identity = null; }
  } else if (qrToken) {
    try { identity = await getPublicIdentityByQr(qrToken); } catch { identity = null; }
  }

  if (!identity) { loading.hidden = true; notFound.hidden = false; return; }

  config = await buildConfig(identity);
  hasIntro = Boolean(config.videoUrl);
  sendInitial();
}

render();
