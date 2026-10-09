// My Socials: the owner's OWN named-platform social accounts (Profile Editor section + public icons). No "Other": free-form links belong to the Wall.
// The platform list and URL patterns are the SAME as public.social_platform_catalog (supabase/migrations/20261009120000_my_socials.sql); the server validates
// every saved URL again and is authoritative. Built with createElement/textContent only; every href is a URL the server accepted (https only).
export const SOCIAL_PLATFORMS = Object.freeze([
  { key: "instagram", label: "Instagram", glyph: "IG", example: "https://www.instagram.com/yourname", pattern: "^https://(www\\.)?instagram\\.com/[a-z0-9._]{1,30}/?$" },
  { key: "tiktok", label: "TikTok", glyph: "TT", example: "https://www.tiktok.com/@yourname", pattern: "^https://(www\\.)?tiktok\\.com/@[a-z0-9._]{2,24}/?$" },
  { key: "youtube", label: "YouTube", glyph: "▶", example: "https://www.youtube.com/@yourchannel", pattern: "^https://(www\\.|m\\.)?youtube\\.com/(@[a-z0-9._-]{3,30}|channel/uc[a-z0-9_-]{22}|c/[a-z0-9._-]{1,100}|user/[a-z0-9._-]{1,100})/?$" },
  { key: "twitch", label: "Twitch", glyph: "TW", example: "https://www.twitch.tv/yourname", pattern: "^https://(www\\.)?twitch\\.tv/[a-z0-9_]{3,25}/?$" },
  { key: "kick", label: "Kick", glyph: "K", example: "https://kick.com/yourname", pattern: "^https://(www\\.)?kick\\.com/[a-z0-9_-]{3,25}/?$" },
  { key: "x", label: "X", glyph: "X", example: "https://x.com/yourname", pattern: "^https://(www\\.)?(x|twitter)\\.com/[a-z0-9_]{1,15}/?$" },
  { key: "threads", label: "Threads", glyph: "@", example: "https://www.threads.net/@yourname", pattern: "^https://(www\\.)?threads\\.(net|com)/@[a-z0-9._]{1,30}/?$" },
  { key: "snapchat", label: "Snapchat", glyph: "SC", example: "https://www.snapchat.com/add/yourname", pattern: "^https://(www\\.)?snapchat\\.com/(add/|@)[a-z0-9._-]{3,15}/?$" },
  { key: "discord", label: "Discord", glyph: "DC", example: "https://discord.gg/yourserver", pattern: "^https://(www\\.)?(discord\\.gg/[a-z0-9-]{2,32}|discord\\.com/(invite/[a-z0-9-]{2,32}|users/[0-9]{17,20}))/?$" },
  { key: "facebook", label: "Facebook", glyph: "f", example: "https://www.facebook.com/yourname", pattern: "^https://(www\\.|m\\.)?facebook\\.com/([a-z0-9.]{5,50}|profile\\.php\\?id=[0-9]{5,20})/?$" },
  { key: "reddit", label: "Reddit", glyph: "R", example: "https://www.reddit.com/user/yourname", pattern: "^https://(www\\.)?reddit\\.com/(u|user)/[a-z0-9_-]{3,20}/?$" },
  { key: "linkedin", label: "LinkedIn", glyph: "in", example: "https://www.linkedin.com/in/yourname", pattern: "^https://(www\\.)?linkedin\\.com/in/[a-z0-9-]{3,100}/?$" },
].map(platform => Object.freeze({ ...platform, regex: new RegExp(platform.pattern, "i") })));
export const SOCIAL_MAX = SOCIAL_PLATFORMS.length;
export const SOCIAL_URL_MAX = 200;
export const socialPlatform = key => SOCIAL_PLATFORMS.find(platform => platform.key === key) ?? null;

export const SOCIAL_ERROR_MESSAGES = Object.freeze({
  INVALID_SOCIAL_URL: "Use the full link to your own account on that platform (https://…).",
  INVALID_SOCIAL_PLATFORM: "Choose one of the listed platforms.",
  DUPLICATE_SOCIAL_PLATFORM: "Each platform can be added once.",
  TOO_MANY_SOCIAL_LINKS: `You can add up to ${SOCIAL_MAX} social accounts.`,
  INVALID_SOCIAL_LINKS: "Your social accounts could not be saved. Check them and try again.",
  EMPTY_SOCIAL_URL: "Add the link to your account, or remove this platform.",
  SOCIALS_NOT_LOADED: "Your social accounts have not loaded yet. Reload the page and try again.",
});

// What people paste -> the canonical form the server accepts: trimmed, https:// added when missing (http:// upgraded), tracking query / fragment dropped
// (Facebook's profile.php?id= is the account itself and is kept). Anything that is not a plain web address is returned unchanged so it fails validation.
export function normalizeSocialUrl(input) {
  let raw = String(input ?? "").trim();
  if (!raw) return "";
  if (/^http:\/\//i.test(raw)) raw = `https://${raw.slice(7)}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw.replace(/^\/+/, "")}`;
  let url;
  try { url = new URL(raw); } catch { return raw; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return raw;
  const host = url.hostname.toLowerCase();
  const facebookId = /(^|\.)facebook\.com$/.test(host) && url.pathname === "/profile.php" ? url.searchParams.get("id") : null;
  return `https://${host}${url.pathname}${facebookId ? `?id=${facebookId}` : ""}`;
}

// -> { ok: true, links: [{ platform, url }] } | { ok: false, index, code }. Mirrors the server's checks (order, one per platform, the platform's pattern).
export function validateSocialLinks(links) {
  if (!Array.isArray(links) || links.length > SOCIAL_MAX) return { ok: false, index: -1, code: "TOO_MANY_SOCIAL_LINKS" };
  const seen = new Set();
  const out = [];
  for (const [index, link] of links.entries()) {
    const platform = socialPlatform(link?.platform);
    if (!platform) return { ok: false, index, code: "INVALID_SOCIAL_PLATFORM" };
    if (seen.has(platform.key)) return { ok: false, index, code: "DUPLICATE_SOCIAL_PLATFORM" };
    seen.add(platform.key);
    const url = normalizeSocialUrl(link.url);
    if (!url) return { ok: false, index, code: "EMPTY_SOCIAL_URL" };
    if (url.length > SOCIAL_URL_MAX || !platform.regex.test(url)) return { ok: false, index, code: "INVALID_SOCIAL_URL" };
    out.push({ platform: platform.key, url });
  }
  return { ok: true, links: out };
}

// The platform icon: one consistent round badge (platform colour + short mark), always labelled by text for assistive technology by its container.
export function socialIcon(doc, key) {
  const platform = socialPlatform(key);
  const icon = doc.createElement("span");
  icon.className = "social-icon";
  icon.dataset.platform = platform?.key ?? "unknown";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = platform?.glyph ?? "?";
  return icon;
}

// Public icons: only saved links the server returned for a published GamID. Each is an https link opened in a new tab without referrer / opener.
export function renderPublicSocials(container, links, doc = container.ownerDocument) {
  const items = [];
  for (const link of Array.isArray(links) ? links : []) {
    const platform = socialPlatform(link?.platform_key);
    if (!platform || typeof link.url !== "string" || !platform.regex.test(link.url)) continue;   // never draw a link the catalog would refuse
    const a = doc.createElement("a");
    a.className = "public-social";
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer nofollow";
    a.setAttribute("aria-label", `${platform.label} (opens in a new tab)`);
    a.title = platform.label;
    a.append(socialIcon(doc, platform.key));
    items.push(a);
  }
  container.replaceChildren(...items);
  container.hidden = items.length === 0;
  return items.length;
}

// The Profile Editor section body. Draft-only: nothing is sent until the section's Save Changes (or Save All Changes); `onChange` lets the editor refresh its
// save buttons. -> { element, draft(), setSaved(rows), isDirty(), showError(index, code), clearErrors() }
export function createSocialsEditor(doc, { onChange = () => {} } = {}) {
  const h = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const element = h("div", "socials-editor");
  const lede = h("p", "connections-lede", "Your own accounts on other platforms. They appear as icons on your public GamID, with or without a Wall.");
  const list = h("ul", "social-list");
  const empty = h("p", "connections-empty", "No social accounts yet.");
  const adder = h("div", "social-add");
  const select = h("select");
  select.setAttribute("aria-label", "Platform");
  const input = h("input");
  input.type = "url"; input.inputMode = "url"; input.autocomplete = "off"; input.spellcheck = false; input.maxLength = SOCIAL_URL_MAX;
  input.setAttribute("aria-label", "Link to your account");
  const add = h("button", "secondary", "Add");
  add.type = "button";
  const addError = h("p", "social-error");
  addError.id = "social-add-error"; addError.setAttribute("role", "alert"); addError.hidden = true;
  adder.append(select, input, add);
  element.append(lede, list, empty, adder, addError);

  let saved = [];
  let rows = [];   // [{ platform, url }]
  const snapshot = list => JSON.stringify(list.map(row => ({ platform: row.platform, url: normalizeSocialUrl(row.url) })));
  function renderOptions() {
    const used = new Set(rows.map(row => row.platform));
    const keep = select.value;
    select.replaceChildren(...SOCIAL_PLATFORMS.filter(platform => !used.has(platform.key)).map(platform => { const option = h("option", "", platform.label); option.value = platform.key; return option; }));
    if ([...select.options].some(option => option.value === keep)) select.value = keep;
    const platform = socialPlatform(select.value);
    input.placeholder = platform?.example ?? "";
    adder.hidden = !select.options.length;
  }
  function render() {
    list.replaceChildren(...rows.map((row, index) => {
      const platform = socialPlatform(row.platform);
      const item = h("li", "social-row");
      item.dataset.platform = row.platform;
      const name = h("span", "social-name", platform?.label ?? row.platform);
      const field = h("input");
      field.type = "url"; field.inputMode = "url"; field.autocomplete = "off"; field.spellcheck = false; field.maxLength = SOCIAL_URL_MAX; field.value = row.url;
      field.setAttribute("aria-label", `${platform?.label ?? row.platform} link`);
      field.addEventListener("input", () => { rows[index] = { ...rows[index], url: field.value }; clearRowError(item, field); onChange(); });
      const remove = h("button", "text-button danger", "Remove");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${platform?.label ?? row.platform}`);
      remove.addEventListener("click", () => { rows.splice(index, 1); render(); onChange(); });
      const error = h("p", "social-error");
      error.id = `social-error-${row.platform}`; error.setAttribute("role", "alert"); error.hidden = true;
      item.append(socialIcon(doc, row.platform), name, field, remove, error);
      return item;
    }));
    empty.hidden = rows.length > 0;
    renderOptions();
  }
  function clearRowError(item, field) { const error = item.querySelector(".social-error"); if (error) error.hidden = true; field.removeAttribute("aria-invalid"); field.removeAttribute("aria-describedby"); }
  const showAddError = text => { addError.textContent = text; addError.hidden = !text; if (text) { input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", addError.id); } else { input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); } };
  select.addEventListener("change", () => { renderOptions(); showAddError(""); });
  input.addEventListener("input", () => showAddError(""));
  input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); add.click(); } });
  add.addEventListener("click", () => {
    const platform = socialPlatform(select.value);
    if (!platform) return;
    const url = normalizeSocialUrl(input.value);
    const check = validateSocialLinks([{ platform: platform.key, url }]);
    if (!check.ok) { showAddError(SOCIAL_ERROR_MESSAGES[check.code]); input.focus(); return; }
    rows.push({ platform: platform.key, url });
    input.value = "";
    showAddError("");
    render();
    onChange();
    list.querySelector(`[data-platform="${platform.key}"] input`)?.focus();
  });
  render();
  return {
    element,
    draft: () => rows.map(row => ({ platform: row.platform, url: normalizeSocialUrl(row.url) })),
    setSaved(next) {
      saved = (Array.isArray(next) ? next : []).map(row => ({ platform: row.platform_key ?? row.platform, url: row.url }));
      rows = saved.map(row => ({ ...row }));
      showAddError("");
      render();
    },
    isDirty: () => snapshot(rows) !== snapshot(saved),
    showError(index, code) {
      const item = list.children[index];
      const text = SOCIAL_ERROR_MESSAGES[code] ?? SOCIAL_ERROR_MESSAGES.INVALID_SOCIAL_LINKS;
      if (!item) { showAddError(text); return; }
      const field = item.querySelector("input"), error = item.querySelector(".social-error");
      error.textContent = text; error.hidden = false;
      field.setAttribute("aria-invalid", "true"); field.setAttribute("aria-describedby", error.id);
      field.focus();
    },
    clearErrors() { for (const item of list.children) clearRowError(item, item.querySelector("input")); showAddError(""); },
  };
}
