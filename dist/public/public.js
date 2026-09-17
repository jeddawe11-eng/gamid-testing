import { getPublicIdentity, loadPublicAvatar } from "../account/supabase-client.js";

const catalogLabel = (catalog, key) => catalog?.find(item => item.key === key)?.label || key || "";

async function render() {
  const loading = document.getElementById("loadingState");
  const notFound = document.getElementById("notFoundState");
  const profile = document.getElementById("profileView");
  const handle = (new URLSearchParams(location.search).get("handle") || "").trim().replace(/^@/, "");

  let identity = null;
  if (handle) {
    try { identity = await getPublicIdentity(handle); } catch { identity = null; }
  }

  loading.hidden = true;
  if (!identity) { notFound.hidden = false; return; }

  profile.hidden = false;
  document.getElementById("publicDisplayName").textContent = identity.display_name || "Gamer";
  document.getElementById("publicHandle").textContent = `@${identity.gamid_handle}`;

  const avatar = document.getElementById("publicAvatar");
  avatar.textContent = (identity.display_name || "G").trim()[0]?.toUpperCase() || "G";
  if (identity.avatar_media_reference) {
    try {
      const url = await loadPublicAvatar(identity.avatar_media_reference);
      if (url) { avatar.style.backgroundImage = `url("${url}")`; avatar.textContent = ""; }
    } catch { /* Keep the letter fallback if the avatar cannot load. */ }
  }

  const primaryLabel = catalogLabel(identity.role_catalog, identity.primary_role_key);
  const secondaryLabels = (identity.role_keys || [])
    .filter(key => key !== identity.primary_role_key)
    .map(key => catalogLabel(identity.role_catalog, key));
  const rolesPreview = document.getElementById("publicRoles");
  rolesPreview.hidden = !(identity.role_keys || []).length;
  document.getElementById("publicPrimaryRole").textContent = primaryLabel;
  const secondary = document.getElementById("publicSecondaryRoles");
  secondary.replaceChildren(...secondaryLabels.map(label => {
    const chip = document.createElement("span");
    chip.textContent = label;
    return chip;
  }));

  const educationLabel = catalogLabel(identity.education_work_catalog, identity.education_work_status);
  const educationSummary = [educationLabel, identity.institution, identity.field_of_study].filter(Boolean).join(" · ");
  const education = document.getElementById("publicEducation");
  education.textContent = educationSummary;
  education.hidden = !educationSummary;

  const bio = document.getElementById("publicBio");
  bio.textContent = identity.bio || "";
  bio.hidden = !identity.bio;
}

render();
