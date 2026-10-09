// My Socials: the owner's OWN social accounts (Profile Editor section + public icons). No "Other": free-form links belong to the Wall.
// ONE link engine for the Wall and My Socials: the Wall's provider adapters (dist/wall-kit/embed) are the only platform / URL rules. detectEmbed() recognises the
// platform and the content kind, the adapter's id rule validates it, and the adapter rebuilds every address (openUrl) - the same parts a Wall link stores
// ({ platform, kind, id }). My Socials only chooses WHICH platforms are offered and which kinds count as the owner's account (a profile, channel, page or server
// invite - never a post or a video); public.social_platform_catalog.account_kinds mirrors that list and the server checks every id against the Wall's own server
// rules (private.wall_embed_specs). Built with createElement/textContent only.
import { PROVIDERS, detectEmbed, isAllowedOpenUrl } from "../wall-kit/embed/index.js";

const ACCOUNTS = [
  ["instagram", ["profile"], "IG", "https://www.instagram.com/yourname"],
  ["tiktok", ["profile"], "TT", "https://www.tiktok.com/@yourname"],
  ["youtube", ["channel"], "▶", "https://www.youtube.com/@yourchannel"],
  ["twitch", ["channel"], "TW", "https://www.twitch.tv/yourname"],
  ["kick", ["channel"], "K", "https://kick.com/yourname"],
  ["x", ["profile"], "X", "https://x.com/yourname"],
  ["snapchat", ["profile"], "SC", "https://www.snapchat.com/add/yourname"],
  ["discord", ["profile", "invite"], "DC", "https://discord.com/users/123456789012345678"],
  ["facebook", ["page"], "f", "https://www.facebook.com/yourpage"],
];
// label and account kinds come from the Wall adapters; a platform or kind the engine does not know fails loudly here (and in tests), never silently
export const SOCIAL_PLATFORMS = Object.freeze(ACCOUNTS.map(([key, kinds, glyph, example]) => {
  const provider = PROVIDERS.get(key);
  if (!provider || kinds.some(kind => !Object.hasOwn(provider.kinds, kind))) throw new Error(`My Socials platform ${key} is not supported by the Wall link engine`);
  return Object.freeze({ key, label: provider.label, glyph, example, kinds: Object.freeze([...kinds]) });
}));
export const SOCIAL_MAX = SOCIAL_PLATFORMS.length;
export const SOCIAL_URL_MAX = 200;
export const socialPlatform = key => SOCIAL_PLATFORMS.find(platform => platform.key === key) ?? null;

export const SOCIAL_ERROR_MESSAGES = Object.freeze({
  INVALID_SOCIAL_URL: "Use the link to your own account on that platform (https://…).",
  NOT_A_SOCIAL_ACCOUNT: "That is a post or a video, not your account. Paste the link to your profile, channel, page or server.",
  INVALID_SOCIAL_PLATFORM: "Choose one of the listed platforms.",
  DUPLICATE_SOCIAL_PLATFORM: "Each platform can be added once.",
  TOO_MANY_SOCIAL_LINKS: `You can add up to ${SOCIAL_MAX} social accounts.`,
  INVALID_SOCIAL_LINKS: "Your social accounts could not be saved. Check them and try again.",
  EMPTY_SOCIAL_URL: "Add the link to your account, or remove this platform.",
  SOCIALS_NOT_LOADED: "Your social accounts have not loaded yet. Reload the page and try again.",
});

// The address of a saved account, rebuilt by the platform's own Wall adapter from its validated parts (null when the parts are not a valid account).
export function socialUrl(platformKey, kind, id) {
  const platform = socialPlatform(platformKey), provider = PROVIDERS.get(platformKey), spec = provider?.kinds[kind];
  if (!platform || !platform.kinds.includes(kind) || !spec || typeof id !== "string" || !new RegExp(spec.id).test(id)) return null;
  const url = provider.openUrl(kind, id);
  return isAllowedOpenUrl(platformKey, url) ? url : null;
}

// One pasted link for a chosen platform -> { ok: true, platform, kind, id, url } | { ok: false, code }. The Wall engine decides what the link is.
export function parseSocialLink(platformKey, input) {
  const platform = socialPlatform(platformKey);
  if (!platform) return { ok: false, code: "INVALID_SOCIAL_PLATFORM" };
  const text = String(input ?? "").trim();
  if (!text) return { ok: false, code: "EMPTY_SOCIAL_URL" };
  if (text.length > SOCIAL_URL_MAX) return { ok: false, code: "INVALID_SOCIAL_URL" };
  const detected = detectEmbed(text);
  if (!detected.ok || detected.providerKey !== platform.key) return { ok: false, code: "INVALID_SOCIAL_URL" };
  if (!platform.kinds.includes(detected.kind)) return { ok: false, code: "NOT_A_SOCIAL_ACCOUNT" };
  return { ok: true, platform: platform.key, kind: detected.kind, id: detected.id, url: detected.canonicalUrl };
}

// What people paste -> the canonical address the engine rebuilds (shown back in the row); anything unrecognised is kept as typed so it fails validation visibly.
export function normalizeSocialUrl(input, platformKey = null) {
  const text = String(input ?? "").trim();
  const detected = text ? detectEmbed(text) : null;
  if (detected?.ok && (!platformKey || detected.providerKey === platformKey)) return detected.canonicalUrl;
  return text;
}

// -> { ok: true, links: [{ platform, kind, id }] } | { ok: false, index, code }. The same checks the server makes (one per platform, an account kind, the Wall id rule).
export function validateSocialLinks(links) {
  if (!Array.isArray(links) || links.length > SOCIAL_MAX) return { ok: false, index: -1, code: "TOO_MANY_SOCIAL_LINKS" };
  const seen = new Set();
  const out = [];
  for (const [index, link] of links.entries()) {
    if (!socialPlatform(link?.platform)) return { ok: false, index, code: "INVALID_SOCIAL_PLATFORM" };
    if (seen.has(link.platform)) return { ok: false, index, code: "DUPLICATE_SOCIAL_PLATFORM" };
    seen.add(link.platform);
    const parsed = parseSocialLink(link.platform, link.url);
    if (!parsed.ok) return { ok: false, index, code: parsed.code };
    out.push({ platform: parsed.platform, kind: parsed.kind, id: parsed.id });
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

// Public icons: only saved accounts the server returned for a published GamID ({ platform_key, kind, account_id }). Each address is rebuilt by the Wall adapter,
// checked against the platform's own hosts, and opened in a new tab without referrer / opener.
export function renderPublicSocials(container, links, doc = container.ownerDocument) {
  const items = [];
  for (const link of Array.isArray(links) ? links : []) {
    const platform = socialPlatform(link?.platform_key);
    const url = platform ? socialUrl(platform.key, link.kind, link.account_id) : null;
    if (!url) continue;   // never draw something the engine would refuse
    const a = doc.createElement("a");
    a.className = "public-social";
    a.href = url;
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
  const snapshot = list => JSON.stringify(list.map(row => ({ platform: row.platform, url: normalizeSocialUrl(row.url, row.platform) })));
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
    const parsed = parseSocialLink(platform.key, input.value);
    if (!parsed.ok) { showAddError(SOCIAL_ERROR_MESSAGES[parsed.code]); input.focus(); return; }
    rows.push({ platform: platform.key, url: parsed.url });
    input.value = "";
    showAddError("");
    render();
    onChange();
    list.querySelector(`[data-platform="${platform.key}"] input`)?.focus();
  });
  render();
  return {
    element,
    draft: () => rows.map(row => ({ platform: row.platform, url: normalizeSocialUrl(row.url, row.platform) })),
    setSaved(next) {
      // saved rows are { platform_key, kind, account_id }: the address is rebuilt by the Wall adapter
      saved = (Array.isArray(next) ? next : []).map(row => { const platform = row.platform_key ?? row.platform; return { platform, url: row.url ?? socialUrl(platform, row.kind, row.account_id) ?? '' }; });
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
