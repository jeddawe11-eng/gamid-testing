// The tool drawer: Add, Text, Media & Links, Shapes, Background, GamID, Assets, Templates (Layout - stages and layers - is wired in editor.js). Every panel is built
// with createElement/textContent only. Panels never touch the network themselves: uploads go through the asset store, links go through the provider-neutral engine,
// and every change to the Wall is an ops.* result applied with `run` (so it is validated, undoable and unsaved-tracked like every other edit).
import { createTemplatesPanel } from "./templates.js";
import * as ops from "../wall-kit/ops.js";
import { createTextPayload, LINK_MAX } from "../wall-kit/text.js";
import { normalizeLinkInput, LINK_PROBLEMS } from "../wall-kit/links.js";
import { describeErrors } from "../wall-kit/messages.js";
import { FONT_CATALOG, fontCss } from "../wall-kit/fonts.js";
import { customFontRef, customFontId, customFontFamily, previewFontFile } from "../wall-kit/custom-fonts.js";
import { PRO_EFFECTS, PRO_EFFECT_PLACEHOLDER, NEON_GLOW, proEffectOf, proEffectPatch } from "../wall-kit/pro-effects.js";
import { SHAPE_LIBRARY, SHAPE_CATEGORIES, shapePath, shapeFillRule, libraryIdOf } from "../wall/shapes.js";
import { createImagePayload } from "../wall-kit/image.js";
import { defaultBackground, createImageBackground, createVideoBackground } from "../wall-kit/background.js";
import { GAMID_BLOCKS, GAMID_BLOCK_INFO, createGamidPayload } from "../wall-kit/gamid.js";
import { sectionItemText } from "../wall-kit/gamid-blocks.js";
import { DATA_FIELD_INFO, DATA_ITEMS, DATA_TEXT_FIELDS, createGamidDataPayload, dataTextStyle } from "../wall-kit/gamid-data.js";
import { startingImageSize, describeVideoJobFailure, isVideoAsset, isVideoFileType } from "../wall-kit/assets.js";
import { PROVIDERS, detectEmbed, buildEmbedPayload, defaultEmbedSize, humanReason, PRESENTATION_LABELS, ICON_SIZE } from "../wall-kit/embed/engine.js";
import { ICON_LIMITS, createIconsPayload, defaultIconGroupSize, iconItemFromInput } from "../wall-kit/icons.js";
import { mediaCapabilities } from "../wall-kit/embed/index.js";
import { fitFrame } from "../wall-kit/embed/player.js";
import { createVideoPreviews } from "./video-preview.js";
import { createDeleteFlow, openDeleteDialog } from "./delete-flow.js";
import { renderUploadError, classifyUploadError } from "../app/upload-feedback.js";
import { createTransientMessage } from "../account/transient-message.js";

const h = (tag, attributes = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
};
const $ = id => document.getElementById(id);

// desktopLabel / desktopNote: the desktop Text panel's wording (2026-10-18), which makes plain these add text BOXES, not fonts; the phone keeps label / note.
export const TEXT_PRESETS = Object.freeze([
  { key: "heading", label: "Heading", note: "Big, bold, for your name or title", desktopLabel: "Heading", desktopNote: "A large title box for your name or a headline", overrides: { text: "Your title", fontFamily: "orbitron", fontSize: 150, fontWeight: 800 }, size: { width: 900, height: 230 } },
  { key: "body", label: "Text", note: "A paragraph about you", desktopLabel: "Text", desktopNote: "A paragraph box for your bio or any details", overrides: { text: "Write something about yourself here.", fontFamily: "system-sans", fontSize: 56, fontWeight: 400, align: "left", lineHeight: 1.35 }, size: { width: 800, height: 260 } },
  { key: "gaming", label: "Gaming title", note: "Condensed with a neon glow", desktopLabel: "Gaming Title", desktopNote: "A condensed title box with a neon glow", overrides: { text: "GAME ON", fontFamily: "bebas-neue", fontSize: 230, fontWeight: 400, glow: { color: "#62e7ff", blur: 22 } }, size: { width: 900, height: 300 } },
]);

// Pro Effects (Text panel, desktop and phone; Mazen's task 2026-10-25): Neon, Living Fire, Living Ice and Living Radiation, from the one registry (wall-kit/pro-effects.js).
// All free. Choosing one applies it to the selected text(s), or - with no text selected - adds a new text showing it, so an effect never lands on nothing.
export { PRO_EFFECTS, NEON_GLOW };
// the new text a Pro Effect adds when no text is selected: the placeholder in a bold display face the effects read well in (docs/WALL-EDITOR-TEXT-EFFECTS.md Phase B)
export const PRO_EFFECT_TEXT = Object.freeze({ text: PRO_EFFECT_PLACEHOLDER, fontFamily: "bebas-neue", fontSize: 110, fontWeight: 400, align: "center", lineHeight: 1.1 });
export const PRO_EFFECT_TEXT_SIZE = Object.freeze({ width: 900, height: 280 });

// My Gamer Data (desktop GamID tool, Phase 1 2026-10-19): the Classic data a Wall can already show, by Classic section. Each choice appears ONCE and goes to the
// existing implementation: `data` = a GamID data element (one live field), `pick` = a GamID data element bound to one chosen item, `block` = a GamID block. "All roles /
// games / connections" are the GamID blocks (the matching data collections draw the same content; elements of either kind stay valid and editable).
// Phase 2: these are the sections with specialised renderers. Every other Classic section comes from the server's section catalog (see sectionChoices below) and
// is placed among them by its catalog sort order, so a newly registered section appears here with no Wall menu entry of its own.
export const GAMER_DATA_SECTIONS = Object.freeze([
  { key: "profile", label: "Profile", order: 10, items: [
    { id: "avatar", kind: "data", field: "avatar", label: "Avatar", note: "Your GamID picture" },
    { id: "displayName", kind: "data", field: "displayName", label: "Display Name", note: "Your display name" },
    { id: "handle", kind: "data", field: "handle", label: "@GamID", note: "Your @GamID" },
    { id: "bio", kind: "data", field: "bio", label: "Bio", note: "Your bio" },
    { id: "profileCard", kind: "block", block: "profile", label: "Profile Card", note: "Your avatar, display name and @GamID in one card" },
  ] },
  { key: "roles", label: "Gaming Roles", order: 20, items: [
    { id: "role", kind: "pick", field: "role", label: "One Role", note: "One of your roles, or whichever is primary" },
    { id: "roles", kind: "block", block: "roles", label: "All Roles", note: "Every gaming role you chose" },
  ] },
  { key: "games", label: "My Games", order: 50, items: [
    { id: "game", kind: "pick", field: "game", label: "One Game", note: "One game from your library" },
    { id: "games", kind: "block", block: "games", label: "All Games", note: "Your games list. Hours stay hidden unless you turn them on" },
  ] },
  { key: "connections", label: "Connections", order: 60, items: [
    { id: "connection", kind: "pick", field: "connection", label: "One Connection", note: "One of your public connections" },
    { id: "connections", kind: "block", block: "connections", label: "All Connections", note: "The accounts you show on your GamID" },
  ] },
  { key: "duo", label: "My Duo", order: 70, items: [{ id: "duo", kind: "block", block: "duo", label: "My Duo", note: "Your accepted Duo. Visitors can open their GamID" }] },
  { key: "crews", label: "My Crews", order: 80, items: [{ id: "crews", kind: "block", block: "crews", label: "My Crews", note: "Your Crews with a published Crew Wall. Visitors can open each one" }] },
]);

// "Other" link (Media & Links): a text element whose words are the link. Starts as a clear, underlined link line; every Text control restyles it.
export const OTHER_TEXT_MAX = 120;
export const OTHER_LINK_STYLE = Object.freeze({ fontFamily: "system-sans", fontSize: 64, fontWeight: 700, underline: true, color: "#62e7ff", align: "center", lineHeight: 1.2, wrap: true });
export const OTHER_LINK_SIZE = Object.freeze({ width: 800, height: 120 });

export function createTools({ session, run, notify, assets, fonts = null, getGamid, refreshGamid, setTool, pickImage, revealProps = () => {}, startFreeform = () => {}, onResourceDeleted = () => {} }) {
  // Universal deletion: every Delete in these panels (Assets, Background images / videos, My Fonts) goes through this one flow and its one confirmation.
  const deletion = createDeleteFlow({ session, assets, fonts, confirm: (details, perform) => openDeleteDialog(document, details, perform), onDeleted: onResourceDeleted });
  const videoPreviews = createVideoPreviews();   // one still frame per video asset, shared by Assets and the background video list
  const doc = () => session.doc;
  const stageId = () => session.state.stageId;
  const selectedTextIds = () => { const stage = session.stage; const chosen = new Set(session.state.selection); return stage ? stage.elements.filter(element => chosen.has(element.id) && element.type === "text").map(element => element.id) : []; };
  const addCustom = (type, payload, size, extra = {}) => run(ops.addCustomElement(doc(), stageId(), { type, payload, width: size.width, height: size.height, ...extra }), { keepResultSelection: true });

  const templates = createTemplatesPanel({ host: $("templatesBody"), session, run, getGamid });

  // ---- Add -----------------------------------------------------------------------------------------------------------------------------------
  const addActions = {
    text: () => { addTextPreset(TEXT_PRESETS[1]); setTool("props"); },
    shape: () => setTool("shapes"),
    image: () => pickImage(),
    embed: () => { setTool("media"); requestAnimationFrame(() => $("mediaUrl")?.focus()); },
    gamid: () => setTool("gamid"),
    gamidData: () => { setTool("gamid"); requestAnimationFrame(() => (accordionOn() ? $("gamerDataLibrary") : $("gamidDataTitle"))?.scrollIntoView({ block: "start" })); },
  };
  for (const button of document.querySelectorAll("[data-add-action]")) button.addEventListener("click", () => addActions[button.dataset.addAction]?.());

  // ---- Text ----------------------------------------------------------------------------------------------------------------------------------
  function addTextPreset(preset) { return addCustom("text", createTextPayload(preset.overrides), preset.size); }
  const presets = $("textPresets");
  const presetCards = TEXT_PRESETS.map(preset => {
    const name = document.createTextNode(preset.label), note = h("small", { text: preset.note });
    presets.append(h("button", { class: "ed-btn", type: "button", onclick: () => { addTextPreset(preset); setTool("props"); } }, h("b", { text: "T" }), h("span", {}, name, note)));
    return { preset, name, note };
  });
  // The font library: the curated catalog (wall-kit/fonts.js), by category. Each card carries a live sample drawn in its own family (shown on desktop, 900px and wider);
  // below that the card is the same one-line button as always. A font file is fetched by the browser only when a card with that family is actually rendered.
  const fontList = $("fontList");
  const FONT_SAMPLE = "Legend";
  const fontGroups = [...new Set(FONT_CATALOG.map(font => font.group))].map(group => ({ group, heading: h("div", { class: "group", text: group }), cards: [] }));
  const fontEmpty = h("p", { class: "ed-hint ed-font-empty", role: "status", hidden: true });
  for (const entry of fontGroups) {
    fontList.append(entry.heading);
    for (const font of FONT_CATALOG.filter(candidate => candidate.group === entry.group)) {
      const sample = h("span", { class: "ed-font-sample", "aria-hidden": "true", text: FONT_SAMPLE });
      const button = h("button", { class: "ed-btn ed-font", type: "button", "data-font": font.key, onclick: () => {
        const ids = selectedTextIds();
        if (!ids.length) { notify("Select a text element first, then choose a font."); return; }
        run(ops.updatePayloadMany(doc(), ids, { fontFamily: font.key, fontRef: undefined }));   // a library font replaces a custom one
      } }, font.label, sample);
      entry.cards.push({ font, button, sample });
      fontList.append(button);
    }
  }
  fontList.append(fontEmpty);
  // A card gets its family only when it is near the visible part of the panel, so a browser never fetches the font files of cards nobody has scrolled to (it fetches a face only
  // when text in that family is rendered). Without IntersectionObserver every card is set at once.
  const cardOf = new Map();
  const applyCardFont = ({ font, button, sample }) => { const css = fontCss(font.key); button.style.setProperty("font-family", css); sample.style.setProperty("font-family", css); };
  const lazyFonts = typeof IntersectionObserver === "function" ? new IntersectionObserver(seen => {
    for (const item of seen) if (item.isIntersecting) { applyCardFont(cardOf.get(item.target)); lazyFonts.unobserve(item.target); }
  }, { root: $("drawer"), rootMargin: "160px 0px" }) : null;
  for (const entry of fontGroups) for (const card of entry.cards) { cardOf.set(card.button, card); if (lazyFonts) lazyFonts.observe(card.button); else applyCardFont(card); }
  // Desktop (900px and wider): each category is an accordion - a real button with the category name, its font count and a chevron. All start collapsed, several may be
  // open, and the open / closed choice is kept while searching. Below 900px the heading stays the plain text it always was and every card shows (no accordion).
  const desktopFonts = typeof matchMedia === "function" ? matchMedia("(min-width: 900px)") : null;
  const accordionOn = () => Boolean(desktopFonts?.matches);
  for (const entry of fontGroups) {
    entry.open = false;
    entry.toggle = h("button", { class: "ed-font-group-toggle", type: "button", "aria-expanded": "false", onclick: () => { if (fontSearching()) return; entry.open = !entry.open; applyFontFilter(); } },
      h("span", { class: "ed-font-group-name", text: entry.group }), h("span", { class: "ed-font-group-count", text: String(entry.cards.length), "aria-label": `${entry.cards.length} fonts` }));
  }
  function renderFontHeadings() {
    for (const entry of fontGroups) {
      if (accordionOn()) { if (entry.toggle.parentNode !== entry.heading) { entry.heading.replaceChildren(entry.toggle); entry.heading.classList.add("is-accordion"); } }
      else if (entry.heading.classList.contains("is-accordion")) { entry.heading.classList.remove("is-accordion"); entry.heading.replaceChildren(entry.group); }
    }
  }
  // Search by name only: it hides cards in this list and nothing else - the canvas and the saved Wall are never touched. It looks in every category, collapsed or not,
  // and shows the matching ones opened; clearing the search returns each category to the open / closed state it had before.
  const fontSearch = $("fontSearch");
  const fontSearching = () => Boolean((fontSearch?.value ?? "").trim());
  function applyFontFilter() {
    const query = (fontSearch?.value ?? "").trim().toLowerCase();
    const accordion = accordionOn();
    let shown = 0;
    for (const entry of fontGroups) {
      let visible = 0;
      for (const { font, button } of entry.cards) {
        const match = !query || font.label.toLowerCase().includes(query) || font.key.includes(query);
        button.hidden = !match || (accordion && !query && !entry.open);
        if (match) visible++;
      }
      entry.heading.hidden = Boolean(query) && visible === 0; shown += visible;
      entry.toggle.setAttribute("aria-expanded", String(query ? visible > 0 : entry.open));
      if (query) entry.toggle.setAttribute("aria-disabled", "true"); else entry.toggle.removeAttribute("aria-disabled");
    }
    fontEmpty.hidden = shown > 0;
    if (!shown) fontEmpty.textContent = `No font matches "${query}".`;
  }
  fontSearch?.addEventListener("input", applyFontFilter);
  // The desktop wording of the presets and the library heading; the phone keeps its own.
  const fontLibraryTitle = $("fontLibraryTitle");
  function renderTextCopy() {
    const desktop = accordionOn();
    for (const { preset, name, note } of presetCards) { name.data = desktop ? preset.desktopLabel : preset.label; note.textContent = desktop ? preset.desktopNote : preset.note; }
    if (fontLibraryTitle) fontLibraryTitle.textContent = desktop ? "Font Library" : "Fonts";
  }
  const relayoutFonts = () => { renderFontHeadings(); applyFontFilter(); renderTextCopy(); };
  desktopFonts?.addEventListener?.("change", relayoutFonts);
  relayoutFonts();
  // The font of the selected text element(s) is the current card - a custom font (My Fonts) when they use one, else the library font; a mixed selection marks none.
  function renderFontSelection() {
    const stage = session.stage, chosen = new Set(session.state.selection);
    const texts = stage ? stage.elements.filter(element => chosen.has(element.id) && element.type === "text") : [];
    const customs = new Set(texts.map(element => customFontId(element.payload?.fontRef)));
    const currentCustom = customs.size === 1 ? [...customs][0] : null;
    const families = new Set(texts.map(element => element.payload?.fontFamily));
    const current = !currentCustom && customs.size === 1 && families.size === 1 ? [...families][0] : null;
    for (const entry of fontGroups) for (const { font, button } of entry.cards) { if (font.key === current) button.setAttribute("aria-current", "true"); else button.removeAttribute("aria-current"); }
    for (const button of myFontList?.querySelectorAll("[data-custom-font-apply]") ?? []) { if (button.dataset.customFontApply === currentCustom) button.setAttribute("aria-current", "true"); else button.removeAttribute("aria-current"); }
    for (const { effect, button } of effectCards) button.setAttribute("aria-pressed", String(texts.length > 0 && texts.every(element => proEffectOf(element.payload)?.key === effect.key)));
  }

  // ---- Pro Effects (Text panel): choosing an effect APPLIES it - immediately visible on the canvas - and opens its own section in Properties (the general sections
  // collapsed). With text(s) selected: each gets the effect (its text kept; an empty text gets the placeholder; another animated effect it had is replaced; choosing an
  // effect it already shows changes nothing). With no text selected: one new text showing the effect is added and selected. One undo step either way.
  const effectList = $("textEffectList");
  function applyProEffect(effect) {
    const stage = session.stage;
    if (!stage) return;
    const ids = selectedTextIds();
    if (!ids.length) addCustom("text", createTextPayload({ ...PRO_EFFECT_TEXT, [effect.field]: effect.create() }), PRO_EFFECT_TEXT_SIZE);
    else {
      let current = doc(), changed = false;
      for (const id of ids) {
        const patch = proEffectPatch(stage.elements.find(element => element.id === id)?.payload, effect.key);
        if (!Object.keys(patch).length) continue;
        const result = ops.updatePayload(current, id, patch);
        if (!result.ok) { run(result); return; }
        current = result.doc; changed = true;
      }
      if (changed) run({ ok: true, doc: current });
    }
    setTool("props");   // a phone opens Properties on the effect; desktop Properties is always open
    revealProps("pro");
  }
  const effectCards = PRO_EFFECTS.map(effect => {
    const button = h("button", { class: "ed-btn ed-fx", type: "button", "data-effect": effect.key, "data-tier": effect.tier, "aria-pressed": "false", onclick: () => applyProEffect(effect) },
      h("span", { class: "ed-fx-sample", "data-fx": effect.key, "aria-hidden": "true", text: effect.label }),
      h("span", { class: "ed-fx-text" }, effect.label, h("small", { text: effect.note })));
    effectList?.append(button);
    return { effect, button };
  });

  // ---- My Fonts: the owner's custom fonts (desktop Text panel). Upload, limit, quota, ownership and in-use rules are the server's; this reports them plainly. ----
  const myFontList = $("myFontList"), myFontsCount = $("myFontsCount"), fontMessage = $("fontMessage"), fontUpload = $("fontUpload"), fontFile = $("fontFile"), fontLicense = $("fontLicense");
  const FONT_MESSAGES = {
    WALL_FONT_LIMIT: "You already have 3 custom fonts. Delete one you no longer use, then upload again.",
    ACCOUNT_STORAGE_QUOTA_EXCEEDED: "There is not enough space left in your 200 MB storage for this font. Free some space, then try again.",
    FONT_TOO_LARGE: "This font is larger than 2 MB as WOFF2 (the stored size limit). Choose a smaller font file.",
    FONT_SOURCE_TOO_LARGE: "Font files must be 8 MB or smaller (WOFF2: 2 MB).",
    INVALID_FONT: "This file is not a valid font. Use a WOFF2, TTF or OTF font.",
    INVALID_FONT_TYPE: "This file is not a WOFF2, TTF or OTF font. Font collections (.ttc) and WOFF 1 are not supported.",
    FONT_CONVERSION_FAILED: "This font could not be converted to WOFF2. Try a WOFF2 version of it.",
    FONT_CONVERSION_UNAVAILABLE: "TTF and OTF uploads are not available right now. Upload a WOFF2 version of the font.",
    WALL_FONT_LICENSE_REQUIRED: "Tick the licence confirmation first: only upload fonts you own or are licensed to use on the web.",
    FONT_HASH_MISMATCH: "The file changed on the way. Try the upload again.",
    NETWORK_ERROR: "The connection dropped. Check it and try again.",
    unauthenticated: "Sign in again to manage your fonts.",
    upload: "The font could not be uploaded. Try again.",
  };
  let textSections = [], openTextSection = "textEffects";   // the Text panel accordion (below); declared first, as the font messages use it
  const sayFont = (text, kind = "info") => { if (!fontMessage) return; homeFontMessage(); fontMessage.textContent = text; fontMessage.dataset.kind = kind; };
  let pendingFont = null, myFontsShown = "", fontBusy = false;
  function renderMyFonts() {
    if (!myFontList || !fonts) return;
    const { limit, fonts: list } = fonts.state;
    myFontsCount.textContent = `${list.length}/${limit}`;
    myFontsCount.setAttribute("aria-label", `${list.length} of ${limit} custom fonts used`);
    const shown = JSON.stringify([list.map(font => [font.font_id, font.display_name, font.in_draft, font.in_published, fonts.isUsable(font.font_id)]), pendingFont?.name ?? null]);
    if (shown === myFontsShown) return;
    myFontsShown = shown;
    const cards = list.map(font => {
      const ref = customFontRef(font.font_id);
      const sample = h("span", { class: "ed-font-sample", "aria-hidden": "true", text: FONT_SAMPLE });
      if (fonts.isUsable(font.font_id)) sample.style.setProperty("font-family", `"${customFontFamily(ref)}", system-ui, sans-serif`);
      const status = font.in_published ? "Published" : font.in_draft ? "On your Wall" : "";
      const apply = h("button", { class: "ed-btn ed-font", type: "button", "data-custom-font-apply": font.font_id, onclick: () => {
        const ids = selectedTextIds();
        if (!ids.length) { notify("Select a text element first, then choose a font."); return; }
        run(ops.updatePayloadMany(doc(), ids, { fontRef: ref }));
      } }, font.display_name, status ? h("small", { class: "ed-myfont-status", text: status }) : null, sample);
      const remove = h("button", { class: "ed-myfont-delete", type: "button", "aria-label": `Delete ${font.display_name}`, title: "Delete font", onclick: () => deleteFont(font) });
      return h("div", { class: "ed-myfont", "data-custom-font": font.font_id }, apply, remove);
    });
    if (pendingFont) {
      const sample = h("span", { class: "ed-font-sample", "aria-hidden": "true", text: FONT_SAMPLE });
      sample.style.setProperty("font-family", `"${pendingFont.family}", system-ui, sans-serif`);
      cards.push(h("div", { class: "ed-myfont is-pending" }, h("div", { class: "ed-btn ed-font", "aria-busy": "true" }, `${pendingFont.name} · uploading`, sample)));
    }
    if (!cards.length) cards.push(h("p", { class: "ed-hint ed-myfonts-empty", text: fonts.state.failed ? "My Fonts could not be loaded. Reopen the editor to try again." : "No custom fonts yet." }));
    myFontList.replaceChildren(...cards);
    renderFontSelection();
  }
  // Deleting a font follows the universal rule (delete-flow.js): always confirmed first - simply when unused; in detail when used, and on Delete its texts switch to their library font.
  async function deleteFont(font) {
    if (fontBusy || deletion.busy) return;
    fontBusy = true; sayFont("");
    try {
      const outcome = await deletion.deleteFont(font);
      if (outcome.status === "deleted") sayFont(`${outcome.message} Its slot is free.`, "ok");
      else if (outcome.status === "failed") sayFont(outcome.message, "error");
    } finally { fontBusy = false; renderMyFonts(); }
  }
  async function uploadFontFile(file) {
    const name = String(file?.name ?? "").replace(/\.(woff2|ttf|otf)$/i, "").trim().slice(0, 60) || "My font";
    if (!/\.(woff2|ttf|otf)$/i.test(file?.name ?? "")) { sayFont(FONT_MESSAGES.INVALID_FONT_TYPE, "error"); return; }
    if (file.size > (/\.woff2$/i.test(file.name) ? 2 : 8) * 1024 * 1024) { sayFont(/\.woff2$/i.test(file.name) ? "WOFF2 fonts must be 2 MB or smaller." : FONT_MESSAGES.FONT_SOURCE_TOO_LARGE, "error"); return; }
    const family = await previewFontFile(await file.arrayBuffer());   // the browser's own font check, and the real preview
    if (!family) { sayFont(FONT_MESSAGES.INVALID_FONT, "error"); return; }
    fontBusy = true; fontUpload.disabled = true; pendingFont = { name, family }; renderMyFonts(); sayFont(`Uploading "${name}"…`);
    try {
      const font = await fonts.upload(file, { name, licenseAccepted: Boolean(fontLicense?.checked) });
      sayFont(font?.duplicate ? `"${font.display_name}" is already in My Fonts - no extra slot was used.` : `"${font?.display_name ?? name}" was added to My Fonts${font?.converted ? ` (converted from ${String(font.format).toUpperCase()} to WOFF2)` : ""}. Select a text element and choose it.`, "ok");
    } catch (error) { sayFont(FONT_MESSAGES[error?.code] ?? FONT_MESSAGES.upload, "error"); }
    finally { fontBusy = false; fontUpload.disabled = false; pendingFont = null; renderMyFonts(); }
  }
  fontUpload?.addEventListener("click", () => {
    if (fontBusy) return;
    if (!fontLicense?.checked) { sayFont(FONT_MESSAGES.WALL_FONT_LICENSE_REQUIRED, "error"); fontLicense?.focus(); return; }
    fontFile.value = ""; fontFile.click();
  });
  fontFile?.addEventListener("change", () => { const file = fontFile.files?.[0]; if (file) uploadFontFile(file); });

  // ---- Text panel sections (Mazen's task 2026-10-25): Pro Effects, My Fonts and Upload My Font are accordions - a real button in each heading, with a chevron -
  // and only one is open at a time (opening one closes the others; Pro Effects is open at first). Their content, ids and behaviour are unchanged: only wrapped.
  // Shown on desktop and phones; the 600-899px panel hides all three, as before.
  const TEXT_ACCORDION = [["textEffects", "textEffectsTitle"], ["myFonts", "myFontsTitle"], ["fontUploadBox", "fontUploadTitle"]];
  textSections = TEXT_ACCORDION.map(([id, titleId]) => {
    const section = $(id), title = $(titleId);
    if (!section || !title) return null;
    const head = title.closest(".ed-myfonts-head") ?? title;   // what stays above the content (My Fonts keeps its n/3 count in it)
    const bodyId = `${id}Body`;
    const toggle = h("button", { class: "ed-text-acc", type: "button", "aria-expanded": "false", "aria-controls": bodyId }, h("span", { class: "ed-text-acc-name", text: title.textContent }));
    const count = head.querySelector(".ed-myfonts-count");
    if (count) toggle.append(count);
    title.replaceChildren(toggle);
    const body = h("div", { class: "ed-text-acc-body", id: bodyId, role: "region", "aria-labelledby": titleId });
    while (head.nextSibling) body.append(head.nextSibling);
    section.append(body);
    section.classList.add("ed-text-acc-section");
    toggle.addEventListener("click", () => openTextPanelSection(openTextSection === id ? null : id));
    return { id, section, toggle, body };
  }).filter(Boolean);
  function openTextPanelSection(id) {
    openTextSection = id;
    for (const entry of textSections) { const open = entry.id === id; entry.toggle.setAttribute("aria-expanded", String(open)); entry.body.hidden = !open; entry.section.classList.toggle("is-open", open); }
    homeFontMessage();
  }
  // the font status line (upload / delete results) is shown in whichever font section is open - an upload's result where the upload was made, a deletion's in My Fonts
  function homeFontMessage() {
    const open = textSections.find(entry => entry.id === openTextSection && entry.id !== "textEffects");
    const home = open?.body ?? textSections.find(entry => entry.id === "myFonts")?.body;
    if (fontMessage && home && fontMessage.parentNode !== home) home.append(fontMessage);
  }
  openTextPanelSection(openTextSection);

  // ---- Shapes --------------------------------------------------------------------------------------------------------------------------------
  for (const button of document.querySelectorAll("[data-shape]")) button.addEventListener("click", () => { const result = run(ops.addElement(doc(), stageId(), button.dataset.shape), { keepResultSelection: true }); if (result.ok) setTool("props"); });
  // Shapes V2 (desktop, 900px and wider): the shape library - a Freeform entry, then the curated shapes by category, each card a preview drawn with the same
  // vector geometry the Wall uses. Below 900px the three shape buttons above stay exactly as they were.
  const shapeLibrary = $("shapeLibrary"), shapeQuick = $("shapeQuick");
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SHAPE_COLORS = { Basic: "#8b5dff", "Polygons & stars": "#62e7ff", Arrows: "#ffd36b", Callouts: "#f4f0ff", "Badges & banners": "#ff4fd8", Gaming: "#ff7a1a" };
  const CLASSIC = { rect: { fill: "#8b5dff" }, rounded: { fill: "#62e7ff", radius: 48 }, circle: { fill: "#ff4fd8", radius: 1000 } };
  const libraryPayload = item => {
    const payload = item.shape ? { fill: SHAPE_COLORS[item.category] ?? "#8b5dff", shape: item.shape, ...(item.params ? { params: { ...item.params } } : {}) } : { ...CLASSIC[item.id] };
    if (item.lock) payload.lockAspect = Math.round((item.size[0] / item.size[1]) * 1000) / 1000;   // proportion-sensitive shapes start with their aspect locked
    return payload;
  };
  const previewSvg = item => {
    const [w, h] = item.size, k = Math.min(40 / w, 30 / h), pw = w * k, ph = h * k;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 44 34"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("class", "ed-shape-preview");
    const path = document.createElementNS(SVG_NS, "path");
    const payload = item.shape ? libraryPayload(item) : null;
    const x = (44 - pw) / 2, y = (34 - ph) / 2;
    path.setAttribute("d", payload ? shapePath(payload, x, y, pw, ph) : item.id === "circle" ? shapePath({ shape: "ellipse" }, x, y, pw, ph) : item.id === "rounded" ? `M${x + 6} ${y}H${x + pw - 6}Q${x + pw} ${y} ${x + pw} ${y + 6}V${y + ph - 6}Q${x + pw} ${y + ph} ${x + pw - 6} ${y + ph}H${x + 6}Q${x} ${y + ph} ${x} ${y + ph - 6}V${y + 6}Q${x} ${y} ${x + 6} ${y}Z` : `M${x} ${y}H${x + pw}V${y + ph}H${x}Z`);
    path.setAttribute("fill-rule", payload ? shapeFillRule(payload) : "nonzero");
    svg.append(path);
    return svg;
  };
  const libraryCards = new Map();
  // the categories are accordions (2026-10-19), styled like the font library: Basic starts open, several may be open, and the choice is kept for this session
  const shapeCategoryOpen = new Map(SHAPE_CATEGORIES.map((category, index) => [category, index === 0]));
  const categoryToggles = new Map();
  if (shapeLibrary) {
    const free = h("button", { class: "ed-btn ed-shape-free", type: "button", onclick: () => startFreeform() },
      h("b", { "aria-hidden": "true" }), h("span", {}, "Freeform Shape", h("small", { text: "Draw your own: click to add points, drag to curve, click the first point to close. Double-click it later to edit its points." })));
    shapeLibrary.append(free);
    for (const category of SHAPE_CATEGORIES) {
      const grid = h("div", { class: "ed-shape-grid" });
      for (const item of SHAPE_LIBRARY.filter(entry => entry.category === category)) {
        const card = h("button", { class: "ed-btn ed-shape-card", type: "button", "data-library-shape": item.id, title: item.label, onclick: () => {
          const result = addCustom("rect", libraryPayload(item), { width: item.size[0], height: item.size[1] });
          if (result.ok) setTool("props");
        } }, previewSvg(item), h("span", { text: item.label }));
        libraryCards.set(item.id, card);
        grid.append(card);
      }
      const count = grid.children.length, gridId = `shapeCategory-${categoryToggles.size + 1}`;
      grid.id = gridId;
      const toggle = h("button", { class: "ed-font-group-toggle ed-shape-cat-toggle", type: "button", "aria-controls": gridId, onclick: () => { shapeCategoryOpen.set(category, !shapeCategoryOpen.get(category)); renderCategories(); } },
        h("span", { class: "ed-font-group-name", text: category }), h("span", { class: "ed-font-group-count", text: String(count), "aria-label": `${count} shapes` }));
      categoryToggles.set(category, { toggle, grid });
      shapeLibrary.append(h("h3", { class: "ed-shape-cat is-accordion" }, toggle), grid);
    }
  }
  function renderCategories() {
    for (const [category, { toggle, grid }] of categoryToggles) { const open = shapeCategoryOpen.get(category); toggle.setAttribute("aria-expanded", String(open)); grid.hidden = !open; }
  }
  renderCategories();
  const renderShapeMode = () => { if (shapeQuick) shapeQuick.style.setProperty("display", accordionOn() ? "none" : ""); };
  desktopFonts?.addEventListener?.("change", renderShapeMode);
  renderShapeMode();
  // the card of the selected shape is the current one
  function renderShapeSelection() {
    const stage = session.stage, chosen = new Set(session.state.selection);
    const shapes = stage ? stage.elements.filter(element => chosen.has(element.id) && element.type === "rect") : [];
    const ids = new Set(shapes.map(shape => libraryIdOf(shape.payload)));
    const current = ids.size === 1 ? [...ids][0] : null;
    for (const [id, card] of libraryCards) { if (id === current) card.setAttribute("aria-current", "true"); else card.removeAttribute("aria-current"); }
    // a collapsed category still shows that it holds the selected shape
    const currentCategory = SHAPE_LIBRARY.find(item => item.id === current)?.category ?? null;
    for (const [category, { toggle }] of categoryToggles) { if (category === currentCategory) toggle.setAttribute("data-current", "true"); else toggle.removeAttribute("data-current"); }
  }

  // ---- Media & Links -------------------------------------------------------------------------------------------------------------------------
  const mediaUrl = $("mediaUrl"), mediaResult = $("mediaResult");
  $("mediaSupported").textContent = "Paste a normal web address - never embed code. Only these platforms are accepted here; for any other website, use Other.";
  // Provider discovery: every supported platform with the modes it HONESTLY supports (derived from the adapters, never a hand-written list). A platform button opens
  // what can be pasted for it, per content type, with its modes and player shapes.
  const providerList = $("mediaProviders"), providerInfo = $("mediaProviderInfo");
  let openProvider = null;
  const capabilities = mediaCapabilities();
  function renderProviderInfo() {
    for (const button of providerList.querySelectorAll("button")) button.setAttribute("aria-expanded", String(button.dataset.provider === openProvider));
    if (openProvider === OTHER) { providerInfo.hidden = false; providerInfo.replaceChildren(otherForm()); requestAnimationFrame(() => $("otherUrl")?.focus()); return; }
    if (openProvider === GROUP) { providerInfo.hidden = false; providerInfo.replaceChildren(groupForm()); requestAnimationFrame(() => providerInfo.querySelector("input")?.focus()); return; }
    const entry = capabilities.find(item => item.key === openProvider);
    providerInfo.hidden = !entry;
    if (!entry) { providerInfo.replaceChildren(); return; }
    const rows = entry.kinds.map(kind => h("li", {},
      h("strong", { text: kind.label }),
      h("span", { class: "modes", text: kind.presentations.map(value => PRESENTATION_LABELS[value]).join(" · ") }),
      kind.aspects.length && kind.aspects[0] !== "auto" ? h("span", { class: "shapes", text: `Player shape${kind.aspects.length > 1 ? "s" : ""}: ${kind.aspects.join(", ")}` }) : null));
    providerInfo.replaceChildren(
      h("strong", { class: "title", text: entry.label }),
      h("p", { class: "ed-hint", text: entry.player ? "Plays right on your Wall where it says Player." : `No player: ${entry.label} opens on ${entry.label} (Card or Link).` }),
      h("ul", {}, ...rows),
      entry.examples ? h("p", { class: "ed-hint", text: `Paste: ${entry.examples}` }) : null);
  }
  // A card's modes, "Player · Card · Link · Icon": the same text as before, as one piece per mode, so on desktop a line never starts with a separator
  // (editor-desktop.css keeps each piece whole).
  // Desktop only (900px and wider): below that the card keeps its plain text, so the phone and tablet panels render exactly as before.
  const modeLines = [];
  const renderModeLine = ({ small, modes }) => {
    if (accordionOn()) small.replaceChildren(...modes.flatMap((mode, index) => index < modes.length - 1 ? [h("span", { class: "ed-mode", text: `${mode} ·` }), " "] : [h("span", { class: "ed-mode", text: mode })]));
    else small.textContent = modes.join(" · ");
  };
  const modeLine = modes => { const line = { small: h("small"), modes }; modeLines.push(line); renderModeLine(line); return line.small; };
  desktopFonts?.addEventListener?.("change", () => modeLines.forEach(renderModeLine));
  for (const entry of capabilities) {
    const modes = [...new Set(entry.kinds.flatMap(kind => kind.presentations))].map(value => PRESENTATION_LABELS[value]);
    const button = h("button", { type: "button", class: `ed-provider${entry.featured ? "" : " is-extra"}`, "aria-expanded": "false", "aria-controls": "mediaProviderInfo", role: "listitem",
      onclick: () => { openProvider = openProvider === entry.key ? null : entry.key; renderProviderInfo(); } }, h("b", { text: entry.label }), modeLine(modes));
    button.dataset.provider = entry.key;
    providerList.append(button);
  }
  // OTHER: any ordinary web page (a website, a support / payment page...) as a TEXT link - the creator's own words are what shows; the address opens in a new tab on
  // the Wall. This is deliberately NOT a platform: the paste box above still recognises only the platforms listed, and nothing here is embedded or fetched.
  const OTHER = "other";
  const otherButton = h("button", { type: "button", class: "ed-provider", "aria-expanded": "false", "aria-controls": "mediaProviderInfo", role: "listitem",
    onclick: () => { openProvider = openProvider === OTHER ? null : OTHER; renderProviderInfo(); } }, h("b", { text: "Other" }), h("small", { text: "Text link" }));
  otherButton.dataset.provider = OTHER;
  providerList.append(otherButton);
  // ICON GROUP (DEC-0006): several platform icons - any supported link, or any other website - in ONE Wall element that aligns and wraps them by itself
  const GROUP = "icon-group";
  const groupButton = h("button", { type: "button", class: "ed-provider", "aria-expanded": "false", "aria-controls": "mediaProviderInfo", role: "listitem",
    onclick: () => { openProvider = openProvider === GROUP ? null : GROUP; renderProviderInfo(); } }, h("b", { text: "Icon Group" }), h("small", { text: "Several icons" }));
  groupButton.dataset.provider = GROUP;
  providerList.append(groupButton);
  function groupForm() {
    const rows = h("div", { class: "ed-icon-rows" });
    const status = h("p", { class: "ed-media-msg", role: "status", hidden: true });
    const addRow = () => {
      if (rows.children.length >= ICON_LIMITS.items) return;
      const input = h("input", { class: "ed-text-line", type: "url", inputmode: "url", autocomplete: "off", spellcheck: "false", maxlength: LINK_MAX, placeholder: "Paste a link", "aria-label": `Link ${rows.children.length + 1}` });
      input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); add(); } });
      rows.append(input);
      return input;
    };
    const add = () => {
      const values = [...rows.querySelectorAll("input")].map(input => input.value.trim());
      const items = [];
      for (const [index, value] of values.entries()) {
        if (!value) continue;
        const parsed = iconItemFromInput(value);
        if (!parsed.ok) { status.hidden = false; status.textContent = `Link ${index + 1}: ${parsed.message}`; rows.children[index]?.focus(); return; }
        items.push(parsed.item);
      }
      if (!items.length) { status.hidden = false; status.textContent = "Paste at least one link."; rows.children[0]?.focus(); return; }
      const result = addCustom("icons", createIconsPayload(items), defaultIconGroupSize(items.length));
      if (!result.ok) { status.hidden = false; status.textContent = describeErrors(result.errors).join(" "); return; }
      openProvider = null;
      renderProviderInfo();
      setTool("props");
    };
    addRow(); addRow();
    return h("div", { class: "ed-other" },
      h("strong", { class: "title", text: "Icon Group" }),
      h("p", { class: "ed-hint", text: `Several icons in one element: paste up to ${ICON_LIMITS.items} links (any supported platform, or any other website for a link icon). They line up and wrap by themselves; move and resize the group as one. Each icon opens its own link.` }),
      rows, status,
      h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Add another link", onclick: () => addRow()?.focus() }),
        h("button", { class: "ed-btn ed-primary", type: "button", text: "Add to Wall", onclick: add })),
      h("p", { class: "ed-hint", text: "Add, remove, reorder or change links later in Edit." }));
  }
  function otherForm() {
    const url = h("input", { id: "otherUrl", class: "ed-text-line", type: "url", inputmode: "url", autocomplete: "off", spellcheck: "false", maxlength: LINK_MAX, placeholder: "mywebsite.com" });
    const text = h("input", { id: "otherText", class: "ed-text-line", type: "text", autocomplete: "off", maxlength: OTHER_TEXT_MAX, placeholder: "Support Me" });
    const status = h("p", { class: "ed-media-msg", role: "status", hidden: true });
    // Show as: the Display Text (a text link, as before) or the generic link Icon (DEC-0006: a one-icon Icon Group, so more links can join it later)
    let asIcon = false;
    const textLabel = h("label", { class: "ed-stack" }, h("span", { text: "Display Text" }), text);
    const seg = h("div", { class: "ed-seg", role: "group", "aria-label": "How to show it" });
    for (const [value, label] of [[false, "Text link"], [true, "Icon"]]) seg.append(h("button", { type: "button", "aria-pressed": String(value === asIcon), text: label, onclick: () => {
      asIcon = value; textLabel.hidden = asIcon; for (const button of seg.children) button.setAttribute("aria-pressed", String(button.textContent === label));
    } }));
    const add = () => {
      const link = normalizeLinkInput(url.value);
      if (!link.ok) { status.hidden = false; status.textContent = LINK_PROBLEMS[link.reason]; url.focus(); return; }
      const shown = text.value.trim() || new URL(link.url).hostname;
      const result = asIcon ? addCustom("icons", createIconsPayload([{ url: link.url }], { size: ICON_SIZE }), { width: ICON_SIZE, height: ICON_SIZE })
        : addCustom("text", createTextPayload({ ...OTHER_LINK_STYLE, text: shown, link: { url: link.url } }), OTHER_LINK_SIZE);
      if (!result.ok) { status.hidden = false; status.textContent = describeErrors(result.errors).join(" "); return; }
      openProvider = null;
      renderProviderInfo();
      setTool("props");
    };
    for (const input of [url, text]) input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); add(); } });
    return h("div", { class: "ed-other" },
      h("strong", { class: "title", text: "Other" }),
      h("p", { class: "ed-hint", text: "Link to any website - your site, a shop, a support or payment page. Your Display Text is what shows on your Wall; visitors tap it to open the address in a new tab." }),
      h("label", { class: "ed-stack" }, h("span", { text: "URL" }), url),
      seg,
      textLabel,
      status,
      h("button", { class: "ed-btn ed-primary", type: "button", text: "Add to Wall", onclick: add }),
      h("p", { class: "ed-hint", text: "Only https:// or http:// addresses. Style it like any text (font, size, colour, effects) in Edit; change the text or the address there too." }));
  }
  let timer = 0;
  const choice = { presentation: null, aspect: null, caption: "" };
  function renderDetected(detected) {
    mediaResult.replaceChildren();
    if (!detected) return;
    if (!detected.ok) { mediaResult.append(h("div", { class: "ed-media-msg", text: humanReason[detected.reason] })); return; }
    choice.presentation = detected.defaultPresentation; choice.aspect = detected.aspect; choice.caption = "";
    const card = h("div", { class: "ed-media-card" });
    card.append(h("span", { class: "tag", text: detected.providerLabel.toUpperCase() }), h("strong", { text: `${detected.kindLabel}${detected.profile ? "" : ""}` }));
    const labels = PRESENTATION_LABELS;
    const seg = h("div", { class: "ed-seg", role: "group", "aria-label": "How to show it" });
    for (const value of detected.presentations) seg.append(h("button", { type: "button", "aria-pressed": String(choice.presentation === value), text: labels[value], onclick: () => { choice.presentation = value; for (const other of seg.children) other.setAttribute("aria-pressed", String(other.textContent === labels[value])); } }));
    card.append(seg);
    if (detected.aspects.length > 1) {
      const aspectSelect = h("select", { "aria-label": "Shape" });
      for (const aspect of detected.aspects) aspectSelect.append(h("option", { value: aspect, text: aspect, selected: aspect === choice.aspect }));
      aspectSelect.addEventListener("change", () => { choice.aspect = aspectSelect.value; });
      card.append(h("label", { class: "ed-stack" }, h("span", { text: "Shape" }), aspectSelect));
    }
    const caption = h("input", { class: "ed-text-line", type: "text", maxlength: 80, placeholder: "Caption (optional)", autocomplete: "off" });
    caption.addEventListener("input", () => { choice.caption = caption.value; });
    card.append(caption);
    card.append(h("button", { class: "ed-btn ed-primary", type: "button", text: "Add to Wall", onclick: () => addDetected(detected) }));
    mediaResult.append(card);
  }
  function addDetected(detected) {
    const built = buildEmbedPayload(detected, { presentation: choice.presentation, aspect: choice.aspect, caption: choice.caption.trim() });
    if (built.errors.length) { notify("That link could not be added."); return; }
    let size = defaultEmbedSize(detected, choice.presentation);
    if (choice.presentation === "embed" && choice.aspect && choice.aspect !== "auto") size = fitFrame(choice.aspect, 800, 800);
    const result = addCustom("embed", built.payload, size);
    if (result.ok) { mediaUrl.value = ""; mediaResult.replaceChildren(); setTool("props"); }
  }
  const detectNow = () => { const text = mediaUrl.value.trim(); renderDetected(text ? detectEmbed(text) : null); };
  mediaUrl.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(detectNow, 250); });
  mediaUrl.addEventListener("paste", () => setTimeout(detectNow, 0));
  mediaUrl.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); detectNow(); } });

  // ---- Assets: My Assets + Background (Mazen's approved organization, 2026-10-21) ------------------------------------------------------------------
  // ONE tool for the owner's uploaded Wall media and the Wall background: My Assets (the library) and Background (Whole Wall / This stage only, the five types and
  // their settings) are two areas of the Assets panel, on desktop and phone alike. The area last shown is kept for this editor session; anything that still opens
  // "background" opens this tool on Background (editor.js openTool). Both areas use the same uploaded files - nothing is copied or uploaded twice.
  let assetsArea = "library";
  function showAssetsArea(area) {
    assetsArea = area === "background" ? "background" : "library";
    for (const button of document.querySelectorAll("[data-assets-show]")) button.setAttribute("aria-pressed", String(button.dataset.assetsShow === assetsArea));
    for (const box of document.querySelectorAll("[data-assets-area]")) box.hidden = box.dataset.assetsArea !== assetsArea;
  }
  for (const button of document.querySelectorAll("[data-assets-show]")) button.addEventListener("click", () => showAssetsArea(button.dataset.assetsShow));

  // ---- Background (inside Assets) -----------------------------------------------------------------------------------------------------------------
  let scope = "wall";
  const scopeId = () => (scope === "wall" ? "wall" : stageId());
  const currentBackground = () => (scope === "wall" ? doc().background ?? null : session.stage?.background ?? null);
  const setBg = (background, options) => run(ops.setBackground(doc(), scopeId(), background), options);
  for (const button of document.querySelectorAll("[data-bg-scope]")) button.addEventListener("click", () => { scope = button.dataset.bgScope; renderBackground(); renderAssets(); });
  const controlsBox = $("bgControls"), kindsBox = $("bgKinds");

  function bgSlider(label, min, max, step, value, onInput) {
    const range = h("input", { type: "range", min, max, step, value: String(value) });
    range.addEventListener("input", () => onInput(Number(range.value)));
    return h("label", { class: "ed-field" }, h("span", { text: label }), h("div", { class: "ed-inline" }, range));
  }
  function bgColor(label, value, onInput) {
    const input = h("input", { type: "color", value });
    input.addEventListener("input", () => onInput(input.value));
    return h("label", { class: "ed-field" }, h("span", { text: label }), h("div", { class: "ed-inline" }, input));
  }
  let bgKey = "";
  // Desktop Background panel (900px and wider, 2026-10-19): the uploads and the picture / video settings in independent accordion sections (the font library's
  // heading button), kept for this editor session. Images start open, Videos closed; choosing the Image or Video type opens its own section.
  const bgSectionOpen = { images: true, videos: false, fit: true, look: true };
  let lastBgKind = null;
  let videoStatus = "";
  let videoError = null;   // ISS-0001: a failed background video upload / conversion { message, code, status, file?, target? } - persistent until dismissed or resolved
  // Background asset deletion follows the universal rule (delete-flow.js), exactly as in Assets: every Delete is confirmed first (simply when unused); one the Wall uses says where
  // ("In use: ...") and its Delete asks first, then removes it from every place - this background included.
  let deleteStatus = "";
  function deleteControls(asset, noun) {
    const usage = ops.assetUsage(doc(), asset.asset_id);
    const button = h("button", { class: "ed-btn ed-danger", type: "button", text: "Delete", "aria-label": `Delete this ${noun}`, onclick: async () => {
      deleteStatus = "";
      const outcome = await deleteAssetNow(asset);
      if (outcome.status === "deleted" || outcome.status === "failed") { deleteStatus = outcome.message; renderBackground(true); }
    } });
    return usage.length ? [h("div", { class: "ed-asset-inuse", text: `In use: ${usage.join(", ")}` }), button] : [button];
  }
  // Uploading FOR the background: the same asset store, checks, limits and quota as My Assets - the new file is a normal asset (listed in My Assets too, never a
  // copy) and is assigned to the scope the owner chose when they picked it, even if they switch stage meanwhile. One upload at a time across both areas.
  //   a video -> the background video path (resumable, with progress; an H.265 / HEVC one is converted on the server and attached when it is ready);
  //   a picture -> the picture upload, then assigned.
  const BG_ACCEPT = { video: "video/mp4", image: "image/jpeg,image/png,image/webp,image/avif,image/gif", any: "image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm" };
  const videoInput = h("input", { type: "file", accept: BG_ACCEPT.video, hidden: true });
  document.body.append(videoInput);
  videoInput.addEventListener("change", async () => {
    const file = videoInput.files?.[0];
    videoInput.value = "";
    if (!file) return;
    await uploadForBackground(file, scopeId());
  });
  const videoBusy = () => /^(Checking|Uploading|Processing)/.test(videoStatus);
  const uploadForBackground = (file, target) => (isVideoFileType(file.type) ? uploadBackgroundVideo(file, target) : uploadBackgroundImage(file, target));
  async function uploadBackgroundVideo(file, target) {
    if (videoBusy() || uploading) { notify("An upload is already in progress. Wait for it to finish."); return; }
    videoError = null;
    videoStatus = "Checking the video…";
    renderBackground(true);
    const result = await assets.uploadVideo(file, { onProgress: (done, total) => showVideoStatus(`Uploading… ${Math.round((done / total) * 100)}%`) });
    if (!result.ok) { videoStatus = ""; videoError = { message: result.message, code: result.code, status: result.status, file, target }; notify(result.message); renderBackground(true); return; }
    if (result.asset) { videoStatus = "Video added."; run(ops.setBackground(doc(), target, createVideoBackground(result.asset.asset_id))); return; }
    // HEVC / H.265: converted to H.264 on the server at the SAME resolution. Nothing is attached until it is READY; a failure changes nothing on the Wall.
    await followConversion(result.job.job_id, target, { attach: true });
  }
  async function uploadBackgroundImage(file, target) {
    if (videoBusy() || uploading) { notify("An upload is already in progress. Wait for it to finish."); return; }
    videoError = null;
    videoStatus = "Uploading the image…";
    uploading = true;
    if (uploadButton) uploadButton.disabled = true;
    renderBackground(true);
    try {
      const result = await assets.upload(file);
      if (!result.ok) { videoStatus = ""; videoError = { message: result.message, code: result.code, status: result.status, file, target }; notify(result.message); return; }
      videoStatus = "Image added to your assets and set as the background.";
      run(ops.setBackground(doc(), target, createImageBackground(result.asset.asset_id)));
    } finally {
      uploading = false;
      if (uploadButton) uploadButton.disabled = false;
      renderBackground(true);
    }
  }
  const pickForBackground = kind => { if (videoBusy() || uploading) { notify("An upload is already in progress. Wait for it to finish."); return; } videoStatus = ""; videoInput.accept = BG_ACCEPT[kind]; videoInput.click(); };
  // the persistent error box for a background upload (rebuilt with the panel); Retry re-sends the same file to the scope it was meant for
  const videoErrorBox = () => (videoError ? renderUploadError(document, videoError, { id: "bgVideoError",
    onRetry: videoError.file ? (() => { const { file, target } = videoError; uploadForBackground(file, target); }) : null,
    onDismiss: () => { videoError = null; renderBackground(true); controlsBox.querySelector(".ed-primary")?.focus(); } }) : null);
  const videoErrorBoxes = () => (videoError ? [videoErrorBox()] : []);
  const showVideoStatus = text => { videoStatus = text; const line = $("bgVideoStatus"); if (line) line.textContent = text; else renderBackground(true); };
  async function followConversion(jobId, target, { attach }) {
    showVideoStatus("Processing video… Converting it for every browser at its full resolution. This can take a few minutes; you can keep editing.");
    const done = await assets.watchVideoJob(jobId);
    if (done.state === "ready") {
      videoStatus = "Ready - your video is converted.";
      if (attach) run(ops.setBackground(doc(), target, createVideoBackground(done.asset.asset_id)));
      else { notify("Your converted background video is ready. Choose it under Background > Video."); renderBackground(true); }
      return;
    }
    // a conversion failure is the server's verdict on this video: no Retry of the same file (a limit still offers View Usage)
    videoStatus = "";
    videoError = { message: describeVideoJobFailure(done.failureCode), code: done.failureCode };
    notify(videoError.message);
    renderBackground(true);
  }
  // a conversion still running from an earlier visit: show its progress and say when it is ready (it is not attached to anything by itself)
  setTimeout(async () => { for (const job of await assets.pendingVideoJobs?.() ?? []) followConversion(job.job_id, null, { attach: false }); }, 1500);
  const pickVideo = () => { if (videoBusy()) { notify("A background video is already being added. Wait for it to finish."); return; } pickForBackground("video"); };

  function renderBackground(force = false) {
    const current = currentBackground();
    // rebuild only when the STRUCTURE changes (scope, stage, kind, picture, fit, overlay on/off, asset list) - never while a slider is being dragged
    const key = JSON.stringify([scope, stageId(), current?.kind ?? null, current?.assetId ?? null, current?.fit ?? null, !!current?.overlay, assets.assets.length, assets.images.filter(asset => assets.urlFor(asset.asset_id)).length, assets.videos.map(asset => !!assets.videoUrlFor(asset.asset_id)).join(), doc().stages.length, scope === "stage" ? !!doc().background : null, videoStatus, videoError?.message ?? null,
      current?.flipX === true, current?.flipY === true, deleteStatus, JSON.stringify(assets.assets.map(asset => [asset.asset_id, ops.assetUsage(doc(), asset.asset_id)])), accordionOn()]);
    if (!force && key === bgKey) return;
    bgKey = key;
    for (const button of document.querySelectorAll("[data-bg-scope]")) button.setAttribute("aria-pressed", String(button.dataset.bgScope === scope));
    const bg = currentBackground();
    const kind = bg?.kind ?? "none";
    const desktop = accordionOn();
    if (desktop && kind !== lastBgKind) { if (kind === "image") bgSectionOpen.images = true; if (kind === "video") bgSectionOpen.videos = true; }
    lastBgKind = kind;
    // a desktop section: heading button (name, optional count, chevron) + its body; toggling only shows / hides it (no rebuild)
    const section = (key, title, count, nodes) => {
      const id = `bgSection-${key}`;
      const body = h("div", { class: "ed-bg-section-body", id, hidden: !bgSectionOpen[key] });
      body.append(...nodes.filter(Boolean));
      const toggle = h("button", { class: "ed-font-group-toggle ed-bg-toggle", type: "button", "aria-expanded": String(bgSectionOpen[key]), "aria-controls": id, onclick: () => {
        bgSectionOpen[key] = !bgSectionOpen[key]; toggle.setAttribute("aria-expanded", String(bgSectionOpen[key])); body.hidden = !bgSectionOpen[key];
      } }, h("span", { class: "ed-font-group-name", text: title }), count === null ? null : h("span", { class: "ed-font-group-count", text: String(count), "aria-label": `${count} ${key}` }));
      return h("section", { class: "ed-bg-section", "data-bg-section": key }, h("h3", { class: "ed-bg-section-head" }, toggle), body);
    };
    kindsBox.replaceChildren();
    for (const [value, label] of [["none", "None"], ["color", "Colour"], ["gradient", "Gradient"], ["image", "Image"], ["video", "Video"]]) {
      kindsBox.append(h("button", { type: "button", "aria-pressed": String(kind === value), text: label, onclick: () => {
        if (value === "none") setBg(null);
        else if (value === "image") { const first = assets.images[0]; if (first) setBg(createImageBackground(first.asset_id)); else pickForBackground("image"); }
        else if (value === "video") { const first = assets.videos[0]; if (first) setBg(createVideoBackground(first.asset_id)); else pickVideo(); }
        else setBg(defaultBackground(value));
      } }));
    }
    controlsBox.replaceChildren();
    const co = { coalesce: `bg-${scope}` };
    // every control writes onto the background AS IT IS NOW (sliders do not rebuild this panel, so a value captured when it was built may be stale)
    const live = () => currentBackground() ?? bg;
    // Remove background: clears THIS scope's assignment only (a stage then falls back to the Whole Wall background). The uploaded file is never touched here;
    // once nothing uses it any more, its Delete appears in the background uploads below.
    if (bg) controlsBox.append(h("div", { class: "ed-row ed-wrap" }, h("button", { class: "ed-btn", type: "button", text: "Remove background",
      "aria-label": scope === "wall" ? "Remove the Whole Wall background" : "Remove this stage's own background", onclick: () => { deleteStatus = ""; setBg(null); } })));
    // the background uploads (Use + Delete); `onUse` assigns one, `selectedId` marks the current one
    const imageGrid = (selectedId, onUse) => {
      const grid = h("div", { class: "ed-assets" });
      for (const asset of assets.images) {
        const thumb = h("div", { class: "thumb" });
        const url = assets.urlFor(asset.asset_id);
        if (url) thumb.append(h("img", { src: url, alt: "" })); else thumb.textContent = "…";
        const use = h("button", { class: "ed-btn", type: "button", "aria-pressed": String(asset.asset_id === selectedId), text: asset.asset_id === selectedId ? "Selected" : "Use", onclick: () => onUse(asset.asset_id) });
        const remove = deleteControls(asset, "image");
        grid.append(desktop ? h("div", { class: "ed-asset ed-bg-asset" }, thumb, h("div", { class: "ed-bg-actions" }, use, ...remove)) : h("div", { class: "ed-asset" }, thumb, use, ...remove));
      }
      return grid;
    };
    const videoList = (selectedId, onUse) => {
      const list = h("div", { class: "ed-assets ed-videos" });
      assets.videos.forEach((asset, index) => {
        const thumb = h("div", { class: "thumb" });
        videoPreviews.mount(thumb, { id: asset.asset_id, url: assets.videoUrlFor(asset.asset_id) });   // a still frame, never a <video> (video-preview.js)
        const selected = asset.asset_id === selectedId;
        const size = `${asset.width}×${asset.height} · ${Math.max(1, Math.round(asset.byte_size / (1024 * 1024)))} MB`;
        const use = h("button", { class: "ed-btn", type: "button", "aria-pressed": String(selected), text: selected ? "Selected" : "Use", onclick: () => onUse(asset.asset_id) });
        const remove = deleteControls(asset, "video");
        list.append(desktop ? h("div", { class: "ed-asset ed-bg-asset" }, thumb, h("div", { class: "meta" }, h("b", { text: `Video ${index + 1}` }), h("span", { text: size })), h("div", { class: "ed-bg-actions" }, use, ...remove))
          : h("div", { class: "ed-asset" }, thumb, h("div", { class: "meta", text: `Video ${index + 1} · ${size}` }), h("div", { class: "row" }, use), ...remove));
      });
      return list;
    };
    const deleteLine = () => (deleteStatus ? [h("p", { class: "ed-hint", role: "status", text: deleteStatus })] : []);
    // a new file for THIS background, through the shared upload (it then appears in My Assets too)
    const uploadRow = (label, kindOfFile) => h("div", { class: "ed-row ed-wrap" }, h("button", { class: "ed-btn ed-primary", type: "button", text: label, onclick: () => pickForBackground(kindOfFile), disabled: videoBusy() || uploading }));
    if (bg?.kind === "color") controlsBox.append(bgColor("Colour", bg.color, value => setBg({ ...live(), color: value }, co)));
    if (bg?.kind === "gradient") controlsBox.append(bgColor("From", bg.from, value => setBg({ ...live(), from: value }, co)), bgColor("To", bg.to, value => setBg({ ...live(), to: value }, co)), bgSlider("Angle", 0, 360, 1, bg.angle, value => setBg({ ...live(), angle: value }, co)));
    if (bg?.kind === "image") {
      if (desktop) controlsBox.append(section("images", "Images", assets.images.length, [imageGrid(bg.assetId, assetId => setBg({ ...live(), assetId }))]), ...deleteLine());
      else controlsBox.append(imageGrid(bg.assetId, assetId => setBg({ ...live(), assetId })), ...deleteLine());
      controlsBox.append(uploadRow("Upload image", "image"));
    }
    // no background here: the uploads stay reachable (choosing Image / Video would assign one straight away, so an unused upload could never be deleted)
    if (!bg && (assets.images.length || assets.videos.length)) {
      controlsBox.append(h("p", { class: "ed-hint", text: "Your uploads - the same files as in My Assets. Use one as this background." }));
      if (desktop) {
        if (assets.images.length) controlsBox.append(section("images", "Images", assets.images.length, [imageGrid(null, assetId => setBg(createImageBackground(assetId)))]));
        if (assets.videos.length) controlsBox.append(section("videos", "Videos", assets.videos.length, [videoList(null, assetId => setBg(createVideoBackground(assetId)))]));
      } else {
        if (assets.images.length) controlsBox.append(h("h4", { class: "ed-sub", text: "Images" }), imageGrid(null, assetId => setBg(createImageBackground(assetId))));
        if (assets.videos.length) controlsBox.append(h("h4", { class: "ed-sub", text: "Videos" }), videoList(null, assetId => setBg(createVideoBackground(assetId))));
      }
      controlsBox.append(...deleteLine());
    }
    if (!bg) controlsBox.append(uploadRow("Upload image or video", "any"));
    if (bg?.kind === "video") {
      controlsBox.append(desktop ? section("videos", "Videos", assets.videos.length, [videoList(bg.assetId, assetId => setBg({ ...live(), assetId }))]) : videoList(bg.assetId, assetId => setBg({ ...live(), assetId })), ...deleteLine(), h("div", { class: "ed-row ed-wrap" }, h("button", { class: "ed-btn ed-primary", type: "button", text: "Upload MP4", onclick: pickVideo, disabled: /^(Checking|Uploading|Processing)/.test(videoStatus) })),
        h("p", { id: "bgVideoStatus", class: "ed-hint", role: "status", text: videoStatus }), ...videoErrorBoxes(),
        h("p", { class: "ed-hint", text: "MP4, up to 50 MB. H.264 is used as it is; an H.265 (HEVC) video is converted for every browser at the same resolution. It plays muted and looping behind everything, with no controls." }));
    } else if ((videoStatus || videoError) && kind !== "video") controlsBox.append(h("p", { id: "bgVideoStatus", class: "ed-hint", role: "status", text: videoStatus }), ...videoErrorBoxes());
    if (bg?.kind === "image" || bg?.kind === "video") {
      const fitSelect = (() => {
        const select = h("select");
        for (const [value, label] of [["cover", bg.kind === "video" ? "Fill (cover, recommended)" : "Fill (crop)"], ["contain", bg.kind === "video" ? "Show whole video" : "Show whole picture"]]) select.append(h("option", { value, text: label, selected: bg.fit === value }));
        select.addEventListener("change", () => setBg({ ...live(), fit: select.value }));
        return select;
      })();
      const posX = bgSlider("Position X %", 0, 100, 1, bg.posX, value => setBg({ ...live(), posX: value }, co)), posY = bgSlider("Position Y %", 0, 100, 1, bg.posY, value => setBg({ ...live(), posY: value }, co));
      const opacity = bgSlider("Opacity %", 0, 100, 1, Math.round(bg.opacity * 100), value => setBg({ ...live(), opacity: value / 100 }, co));
      // desktop: the same controls, the Fit menu at full width so its longest choice is readable, in two sections; the rest below goes into Appearance
      const look = desktop ? [] : null;
      const put = (...nodes) => (look ? look.push(...nodes) : controlsBox.append(...nodes));
      if (desktop) controlsBox.append(section("fit", "Fit & Position", null, [h("label", { class: "ed-stack" }, h("span", { text: "Fit" }), fitSelect), posX, posY]));
      else controlsBox.append(h("label", { class: "ed-field" }, h("span", { text: "Fit" }), h("div", { class: "ed-inline" }, fitSelect)), posX, posY);
      put(opacity);
      // Flip: mirrors how the background is drawn (image or video alike) - the uploaded file is never changed. Saved in the Wall as flipX / flipY.
      const flip = (label, key) => h("button", { class: "ed-btn", type: "button", "aria-pressed": String(bg[key] === true), text: label,
        onclick: () => { const now = live(); setBg(now[key] === true ? (({ [key]: _off, ...rest }) => rest)(now) : { ...now, [key]: true }); } });
      put(h("div", { class: "ed-btn-row", role: "group", "aria-label": "Flip background" }, flip("Flip horizontal", "flipX"), flip("Flip vertical", "flipY")));
      const overlayOn = !!bg.overlay;
      const toggle = h("input", { type: "checkbox" });
      toggle.checked = overlayOn;
      toggle.addEventListener("change", () => setBg(toggle.checked ? { ...live(), overlay: { color: "#000000", opacity: 0.35 } } : { ...live(), overlay: undefined }));
      put(h("label", { class: "ed-field" }, h("span", { text: "Darken" }), h("div", { class: "ed-inline" }, toggle)));
      if (overlayOn) put(bgColor("Overlay", bg.overlay.color, value => setBg({ ...live(), overlay: { ...live().overlay, color: value } }, co)), bgSlider("Overlay %", 0, 100, 1, Math.round(bg.overlay.opacity * 100), value => setBg({ ...live(), overlay: { ...live().overlay, opacity: value / 100 } }, co)));
      if (look) controlsBox.append(section("look", "Appearance", null, look));
    }    const note = $("bgNote");
    if (scope === "stage") note.textContent = session.stage?.background ? "This stage has its own background." : (doc().background ? "This stage uses the Whole Wall background. Choose one here to give this stage its own." : "No background yet.");
    else note.textContent = "The Whole Wall background runs continuously across all stages. A stage can have its own background instead.";
  }

  // ---- GamID blocks --------------------------------------------------------------------------------------------------------------------------
  const blocksBox = $("gamidBlocks");
  for (const block of GAMID_BLOCKS) {
    const info = GAMID_BLOCK_INFO[block];
    blocksBox.append(h("button", { class: "ed-btn", type: "button", onclick: () => { const result = addCustom("gamid", createGamidPayload(block), info.size); if (result.ok) setTool("props"); } }, h("b", { text: "G" }), h("span", {}, info.label, h("small", { text: info.description }))));
  }
  function renderGamidStatus() {
    const snapshot = getGamid();
    $("gamidStatus").textContent = snapshot ? `Your GamID data is loaded: ${snapshot.games.total} game${snapshot.games.total === 1 ? "" : "s"}, ${snapshot.roles.length} role${snapshot.roles.length === 1 ? "" : "s"}, ${snapshot.connections.length} public connection${snapshot.connections.length === 1 ? "" : "s"}.` : "Loading your GamID data…";
  }

  // ---- GamID data (Round 3) -----------------------------------------------------------------------------------------------------------------------
  // Live bindings, never copies. A single role / game / connection is chosen from the owner's OWN current data only (nothing can be typed in).
  const DATA_ORDER = ["avatar", "displayName", "handle", "bio", "role", "game", "connection", "roles", "games", "connections"];
  const DATA_NOTES = { avatar: "Your GamID picture", displayName: "Your display name", handle: "Your @GamID", bio: "Your bio", role: "One of your roles", game: "One of your games", connection: "One of your connections",
    roles: "All your roles", games: "Your games list", connections: "Your public connections" };
  function addData(field, ref) {
    const text = DATA_TEXT_FIELDS.includes(field) ? dataTextStyle(field) : undefined;
    const payload = createGamidDataPayload(field, { ...(ref ? { ref } : {}), ...(text ? { text } : {}), ...(field === "avatar" ? { look: { backdrop: "none", mask: "circle" } } : {}) });
    const result = addCustom("gamidData", payload, DATA_FIELD_INFO[field].size);
    if (result.ok) setTool("props");
    return result;
  }
  function itemOptions(field, snapshot) {
    if (field === "role") return [{ value: "@primary", label: "My primary role" }, ...(snapshot?.roles ?? []).map(role => ({ value: role.key, label: role.label }))];
    if (field === "game") { const seen = new Set(); return (snapshot?.games?.items ?? []).filter(game => game.ref && !seen.has(game.ref) && seen.add(game.ref)).map(game => ({ value: game.ref, label: game.refName || game.name })); }
    return (snapshot?.connections ?? []).map(connection => ({ value: connection.key, label: `${connection.label} · ${connection.name}` }));
  }
  let dataKey = "";
  function renderGamidData() {
    const snapshot = getGamid();
    const key = snapshot ? JSON.stringify([snapshot.roles.map(role => role.key), snapshot.games.items.length, snapshot.connections.map(connection => connection.key)]) : "loading";
    if (key === dataKey) return;
    dataKey = key;
    const box = $("gamidData");
    box.replaceChildren();
    for (const field of DATA_ORDER) {
      const info = DATA_FIELD_INFO[field];
      if (!DATA_ITEMS.includes(field)) {
        box.append(h("button", { class: "ed-btn", type: "button", onclick: () => addData(field) }, h("b", { text: "◉" }), h("span", {}, info.label, h("small", { text: DATA_NOTES[field] }))));
        continue;
      }
      const options = itemOptions(field, snapshot);
      const select = h("select", { "aria-label": info.label });
      for (const option of options) select.append(h("option", { value: option.value, text: option.label }));
      const empty = !snapshot ? "Loading your GamID data…" : !options.length ? (field === "game" ? "No games on your GamID yet." : field === "connection" ? "No public connections yet." : "No roles yet.") : "";
      box.append(h("div", { class: "ed-data-item" },
        h("button", { class: "ed-btn", type: "button", disabled: !options.length, onclick: () => addData(field, select.value) }, h("b", { text: "◉" }), h("span", {}, info.label, h("small", { text: empty || DATA_NOTES[field] }))),
        options.length ? h("div", { class: "ed-data-picker" }, select) : null));
    }
  }

  // ---- My Gamer Data (desktop, 900px and wider): the same imports as the two lists above, as one "Import from Classic" library. Each Classic section is an
  // accordion (Profile open, the rest closed; several may be open; the choice is kept for the whole visit). Each choice is listed once and adds exactly what the
  // lists above add. Below 900px the panel is the one it always was: the library stays hidden and the lists show.
  const gamidPanel = document.querySelector('[data-tool-panel="gamid"]');
  const gamidTitle = gamidPanel?.querySelector("h2"), gamidRailLabel = document.querySelector('#rail [data-tool="gamid"] span');
  const libraryTools = $("gamerDataTools"), library = $("gamerDataLibrary");
  const legacyGamid = [...(gamidPanel?.children ?? [])].filter(node => node !== gamidTitle && node !== libraryTools);
  const gdOpen = { profile: true, roles: false, games: false, connections: false, duo: false, crews: false };
  const gdFeedback = $("gamerDataStatus") ? createTransientMessage($("gamerDataStatus")) : null;
  let gdKey = "", gdRefreshing = false;
  const gdRefresh = $("gamerDataRefresh");
  // Refresh from Classic: the same authorised reads as the editor's first load (one at a time - a second press while one runs does nothing). The current data stays
  // on screen until the new data arrives; a failed read leaves it in place. Linked elements are bindings, so they repaint with the new data, keeping their place and look.
  gdRefresh?.addEventListener("click", async () => {
    if (gdRefreshing) return;
    gdRefreshing = true; gdRefresh.disabled = true; gdRefresh.setAttribute("aria-busy", "true");
    gdFeedback?.show("Refreshing from Classic…", { tone: "info", progress: true });
    let ok = false;
    try { ok = (await refreshGamid({ keep: true })) !== false; } catch { ok = false; }
    gdRefreshing = false; gdRefresh.disabled = false; gdRefresh.removeAttribute("aria-busy");
    gdFeedback?.show(ok ? "Up to date with your Classic profile." : "Your Classic data could not be refreshed. Check your connection and try again.", { tone: ok ? "success" : "error" });
  });
  const gdMatches = (item, element) => (item.kind === "block" ? element.type === "gamid" && element.payload?.block === item.block
    : item.section ? element.type === "gamidData" && element.payload?.field === "section" && element.payload.section === item.section
      && (item.kind === "section" ? element.payload.item == null : item.kind === "section-item" ? element.payload.item === item.item : element.payload.item != null)
    : element.type === "gamidData" && element.payload?.field === item.field);
  // A catalog section (My Gamer Data Phase 2) as library choices, derived from its metadata only: a "facts" section lists each of its facts as a choice, after
  // its full card; any other section offers "One <item>" (a picker of its items, by stable id) and "All <section>". `single` / `all` say which it supports.
  function sectionChoices(section) {
    const choices = [];
    const all = { id: `${section.key}:all`, kind: "section", section: section.key, label: section.presentation === "facts" ? `${section.label} Card` : `All ${section.label}`, note: `Your whole ${section.label} section, live` };
    if (section.presentation === "facts") {
      if (section.all) choices.push(all);
      if (section.single) for (const item of section.items) choices.push({ id: `${section.key}:${item.id}`, kind: "section-item", section: section.key, item: item.id, label: item.label, note: sectionItemText(item), private: item.private === true });
    } else {
      if (section.single) choices.push({ id: `${section.key}:one`, kind: "section-pick", section: section.key, label: `One ${section.itemLabel}`, note: `One ${section.itemLabel.toLowerCase()} of your choice` });
      if (section.all) choices.push(all);
    }
    return choices.map(choice => ({ ...choice, icon: section.icon }));
  }
  function librarySections(snapshot) {
    const fixed = new Set(GAMER_DATA_SECTIONS.map(section => section.key));
    const catalog = (snapshot?.sections ?? []).filter(section => !fixed.has(section.key)).map(section => ({ key: section.key, label: section.label, order: section.order, icon: section.icon, source: section, items: sectionChoices(section) }));
    return [...GAMER_DATA_SECTIONS, ...catalog].filter(section => section.items.length || section.source).sort((a, b) => a.order - b.order);
  }
  const addSection = (section, item) => {
    const result = addCustom("gamidData", createGamidDataPayload("section", item != null ? { section, item, text: dataTextStyle("section") } : { section }), item != null ? DATA_FIELD_INFO.section.itemSize : DATA_FIELD_INFO.section.size);
    if (result.ok) setTool("props");
    return result;
  };
  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
  // what the owner's GamID holds for a choice right now: a short count line, or "Not on your GamID yet" (the choice still works and draws its own empty state)
  function gdHolding(item, snapshot) {
    if (!snapshot) return null;
    if (item.section) {
      const source = snapshot.sections?.find(section => section.key === item.section);
      const count = source?.items.length ?? 0;
      if (item.kind === "section-item") return item.private ? { private: true } : null;
      if (!count) return { empty: true };
      const hidden = source.items.every(entry => entry.private) ? { private: true } : {};
      return source.presentation === "facts" ? (hidden.private ? hidden : null) : { text: plural(count, source.itemLabel.toLowerCase()), ...hidden };
    }
    const rolesCount = snapshot.roles.length, gamesCount = snapshot.games.total, connectionsCount = snapshot.connections.length, crewsCount = snapshot.crews?.length ?? 0;
    switch (item.id) {
      case "bio": return snapshot.profile.bio ? null : { empty: true };
      case "role": case "roles": return rolesCount ? { text: plural(rolesCount, "role") } : { empty: true };
      case "game": case "games": return gamesCount ? { text: plural(gamesCount, "game") } : { empty: true };
      case "connection": case "connections": return connectionsCount ? { text: `${plural(connectionsCount, "public connection")}` } : { empty: true };
      case "duo": return snapshot.duo ? { text: `With ${snapshot.duo.displayName}` } : { empty: true };
      case "crews": return crewsCount ? { text: plural(crewsCount, "Crew") } : { empty: true };
      default: return null;
    }
  }
  function gdCard(item, snapshot) {
    const holding = gdHolding(item, snapshot);
    const icon = h("b", { class: "ed-gd-icon", "data-gd-icon": item.icon ?? item.id, "aria-hidden": "true" });
    const tag = holding?.empty ? h("em", { class: "ed-gd-tag", text: "Not on your GamID yet" }) : holding?.text ? h("em", { class: "ed-gd-count", text: holding.text }) : null;
    const hiddenTag = holding?.private ? h("em", { class: "ed-gd-tag", text: "Private on Classic" }) : null;   // visitors will not see it until it is public there
    const text = h("span", { class: "ed-gd-text" }, h("strong", { text: item.label }), h("small", { text: item.note }), tag, hiddenTag);
    if (item.kind === "section-pick") {
      const source = snapshot?.sections?.find(section => section.key === item.section);
      const select = h("select", { class: "ed-gd-select", "aria-label": `Choose ${item.label.replace(/^One /, "a ").toLowerCase()}` });
      for (const entry of source?.items ?? []) select.append(h("option", { value: entry.id, text: entry.private ? `${entry.label} (private)` : entry.label }));
      const addButton = h("button", { class: "ed-gd-add", type: "button", text: "Add", "aria-label": `Add ${item.label}`, disabled: !source?.items.length, onclick: () => addSection(item.section, select.value) });
      return h("div", { class: "ed-gd-card ed-gd-pick", "data-gd": item.id }, h("div", { class: "ed-gd-head" }, icon, text), source?.items.length ? h("div", { class: "ed-gd-pick-row" }, select, addButton) : null);
    }
    if (item.kind !== "pick") {
      const add = () => (item.kind === "block" ? (addCustom("gamid", createGamidPayload(item.block), GAMID_BLOCK_INFO[item.block].size).ok && setTool("props"))
        : item.kind === "section" ? addSection(item.section) : item.kind === "section-item" ? addSection(item.section, item.item) : addData(item.field));
      return h("button", { class: "ed-gd-card", type: "button", "data-gd": item.id, onclick: add }, icon, text);
    }
    const options = itemOptions(item.field, snapshot);
    const select = h("select", { class: "ed-gd-select", "aria-label": `Choose ${item.label.replace(/^One /, "a ").toLowerCase()}` });
    for (const option of options) select.append(h("option", { value: option.value, text: option.label }));
    const addButton = h("button", { class: "ed-gd-add", type: "button", text: "Add", "aria-label": `Add ${item.label}`, disabled: !options.length, onclick: () => addData(item.field, select.value) });
    return h("div", { class: "ed-gd-card ed-gd-pick", "data-gd": item.id }, h("div", { class: "ed-gd-head" }, icon, text),
      options.length ? h("div", { class: "ed-gd-pick-row" }, select, addButton) : !snapshot ? h("p", { class: "ed-gd-wait", text: "Loading your GamID data…" }) : null);
  }
  function renderGamerData() {
    if (!library || !libraryTools) return;
    const desktop = accordionOn();
    libraryTools.hidden = !desktop;
    for (const node of legacyGamid) node.style.setProperty("display", desktop ? "none" : "");   // the phone lists (hidden on desktop by script: the desktop file may not hide)
    if (gamidTitle) gamidTitle.textContent = desktop ? "Import from Classic" : "GamID blocks";
    if (gamidRailLabel) gamidRailLabel.textContent = desktop ? "My Gamer Data" : "GamID";
    if (!desktop) return;
    const snapshot = getGamid();
    const key = JSON.stringify(snapshot ? [snapshot.profile, snapshot.roles, snapshot.games.items.map(game => game.ref), snapshot.connections, snapshot.duo?.handle ?? null, snapshot.duo?.displayName ?? null, (snapshot.crews ?? []).map(crew => crew.id), snapshot.sections ?? []] : "loading");
    const sections = librarySections(snapshot);
    if (key !== gdKey) {
      gdKey = key;
      library.replaceChildren(...sections.map(section => {
        if (!(section.key in gdOpen)) gdOpen[section.key] = false;   // a catalog section starts closed; its choice is kept for the visit like the others
        const id = `gamerData-${section.key}`;
        const body = h("div", { class: "ed-gd-body", id, hidden: !gdOpen[section.key] }, ...section.items.map(item => gdCard(item, snapshot)));
        const toggle = h("button", { class: "ed-font-group-toggle ed-gd-toggle", type: "button", "aria-expanded": String(gdOpen[section.key]), "aria-controls": id, onclick: () => {
          gdOpen[section.key] = !gdOpen[section.key]; toggle.setAttribute("aria-expanded", String(gdOpen[section.key])); body.hidden = !gdOpen[section.key];
        } }, h("span", { class: "ed-font-group-name", text: section.label }), h("span", { class: "ed-font-group-count", text: String(section.items.length), "aria-label": `${section.items.length} import choices` }));
        return h("section", { class: "ed-gd-section", "data-gd-section": section.key }, h("h3", { class: "ed-gd-section-head" }, toggle), body);
      }));
    }
    // selected state: the choice that made the selected element(s) (every selected element came from it)
    const stage = session.stage, chosen = new Set(session.state.selection);
    const selected = stage ? stage.elements.filter(element => chosen.has(element.id)) : [];
    for (const section of sections) for (const item of section.items) {
      const card = library.querySelector(`[data-gd="${CSS.escape(item.id)}"]`);
      if (!card) continue;
      if (selected.length && selected.every(element => gdMatches(item, element))) card.setAttribute("aria-current", "true"); else card.removeAttribute("aria-current");
    }
  }
  desktopFonts?.addEventListener?.("change", () => { gdKey = ""; renderGamerData(); });

  // ---- Assets --------------------------------------------------------------------------------------------------------------------------------
  // Pictures (JPG / PNG / WebP / AVIF / GIF) and VIDEOS (MP4 / WebM) side by side. "Add" places either as a media layer with the same artwork controls; a video layer
  // plays muted and looping. Deleting follows the universal rule (delete-flow.js): always confirmed (simply when unused; in detail, then removed from every place, when in use).
  const grid = $("assetGrid"), message = $("assetMessage");
  const say = text => { message.textContent = text; };
  // ISS-0001: a failed upload is ONE persistent inline box under Upload (reason and next step, Retry only when retryable, View Usage for the storage quota or a
  // Wall limit, Dismiss). One upload at a time: while one runs, Upload is disabled and a second pick is refused, so a double tap never sends a file twice.
  const uploadButton = $("assetUpload");
  let uploading = false;
  let assetError = null;   // { message, code, status, file, place }
  function renderAssetError() {
    $("assetUploadError")?.remove();
    uploadButton?.removeAttribute("aria-describedby");
    if (!assetError) return;
    const failed = assetError;
    message.after(renderUploadError(document, failed, { id: "assetUploadError",
      onRetry: () => { assetError = null; renderAssetError(); uploadFile(failed.file, { place: failed.place }); },
      onDismiss: () => { assetError = null; renderAssetError(); uploadButton?.focus(); } }));
    uploadButton?.setAttribute("aria-describedby", "assetUploadError");
  }
  // a delete frees a slot / storage: a limit or quota error is resolved by it (the server decides again on the next upload)
  const resolveUsageErrors = () => {
    if (assetError && classifyUploadError(assetError).usage) { assetError = null; renderAssetError(); }
    if (videoError && classifyUploadError(videoError).usage) { videoError = null; renderBackground(true); }
  };
  // Assets and the Background panel delete through the same flow (one deletion at a time across both)
  async function deleteAssetNow(asset) {
    if (deletion.busy) return { status: "busy", message: "" };
    const outcome = await deletion.deleteAsset(asset);
    if (outcome.status === "deleted") resolveUsageErrors();
    return outcome;
  }
  let assetsKey = "";
  const videoKind = asset => (asset.mime_type === "video/webm" ? "WebM" : "MP4");
  const sizeLabel = bytes => (bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  // Set as Background: the background the Background area is set to (Whole Wall, or this stage only)
  const targetLabel = () => (scope === "wall" ? "Whole Wall" : `Stage ${doc().stages.findIndex(stage => stage.id === stageId()) + 1}`);
  // Two explicit actions on every upload, never one by accident: Add to Canvas makes an independent element; Set as Background assigns the SAME stored file as the
  // background (a picture or video background already there keeps its fit, position and appearance and only changes its file). Nothing is copied or uploaded again.
  function setAsBackground(asset) {
    const video = isVideoAsset(asset), now = currentBackground();
    const next = now?.kind === (video ? "video" : "image") ? { ...now, assetId: asset.asset_id } : (video ? createVideoBackground : createImageBackground)(asset.asset_id);
    const result = run(ops.setBackground(doc(), scopeId(), next));
    if (result.ok) say(`${video ? "Video" : "Image"} set as the ${targetLabel()} background. Fit, position and appearance are under Background.`);
    return result;
  }
  function renderAssets(force = false) {
    const used = ops.assetsInUse(doc());
    const target = $("assetBgTarget");
    if (target) target.textContent = `Set as Background applies to: ${scope === "wall" ? "the Whole Wall" : `${targetLabel()} only`} (choose under Background).`;
    const key = JSON.stringify([assets.assets.map(asset => [asset.asset_id, isVideoAsset(asset) ? !!assets.videoUrlFor(asset.asset_id) : !!assets.urlFor(asset.asset_id)]), [...used].sort(), scope, scope === "stage" ? stageId() : null]);
    if (!force && key === assetsKey) return;
    assetsKey = key;
    videoPreviews.retain(new Set(assets.videos.map(asset => asset.asset_id)));   // a deleted video's cached frame is dropped
    grid.replaceChildren();
    if (!assets.assets.length) { grid.append(h("p", { class: "ed-empty", text: "No images or videos yet. Upload one to use it on your Wall or as a background." })); return; }
    for (const asset of assets.assets) {
      const video = isVideoAsset(asset);
      const thumb = h("div", { class: "thumb" });
      if (video) videoPreviews.mount(thumb, { id: asset.asset_id, url: assets.videoUrlFor(asset.asset_id) });   // a representative still frame (video-preview.js)
      else { const url = assets.urlFor(asset.asset_id); if (url) thumb.append(h("img", { src: url, alt: "" })); else thumb.textContent = "…"; }
      const inUse = used.has(asset.asset_id);
      const noun = video ? "Video" : "Image";
      grid.append(h("div", { class: "ed-asset" }, thumb,
        h("div", { class: "meta", text: `${video ? `${videoKind(asset)} video · ` : ""}${asset.width}×${asset.height} · ${sizeLabel(asset.byte_size)}` }),
        inUse ? h("div", { class: "used", text: "IN USE" }) : null,
        h("div", { class: "row ed-asset-actions" },
          h("button", { class: "ed-btn", type: "button", text: "Add to Canvas", "aria-label": `Add this ${noun.toLowerCase()} to the stage as its own element`, onclick: () => addImageElement(asset) }),
          h("button", { class: "ed-btn", type: "button", text: "Set as Background", "aria-label": `Set this ${noun.toLowerCase()} as the ${targetLabel()} background`, onclick: () => setAsBackground(asset) }),
          h("button", { class: "ed-btn ed-danger", type: "button", text: "Delete", "aria-label": `Delete this ${noun.toLowerCase()}`, onclick: async () => {
            const outcome = await deleteAssetNow(asset);
            if (outcome.status === "deleted" || outcome.status === "failed") say(outcome.message);
          } }))));
    }
  }
  // Places an asset as a media layer: a picture (image / GIF) or a video (MP4 / WebM - `media: "video"`), at its own proportions.
  function addImageElement(asset) {
    const size = startingImageSize(asset.width, asset.height);
    const payload = createImagePayload(asset.asset_id, { aw: asset.width, ah: asset.height, ...(isVideoAsset(asset) ? { media: "video" } : {}) });
    const result = addCustom("image", payload, size);
    if (result.ok) setTool("props");
    return result;
  }
  // Upload -> (optionally) place it. Used by Assets > Upload and Add > Image. A video goes up resumably with progress; the server checks the stored file.
  async function uploadFile(file, { place = false } = {}) {
    if (uploading || videoBusy()) { say("An upload is already in progress. Wait for it to finish."); return null; }
    uploading = true;
    if (uploadButton) uploadButton.disabled = true;
    assetError = null;
    renderAssetError();
    try {
      const video = isVideoFileType(file.type);
      say("Uploading…");
      const result = video ? await assets.uploadVideo(file, { onProgress: (done, total) => say(`Uploading… ${Math.round((done / total) * 100)}%`) }) : await assets.upload(file);
      if (!result.ok) {
        say("");
        assetError = { message: result.message, code: result.code, status: result.status, file, place };
        renderAssetError();
        notify(result.message);
        if (place) { showAssetsArea("library"); setTool("assets"); }   // Add > Image: the error is shown where the upload lives (My Assets)
        return null;
      }
      if (result.job) { say("Processing video… it will appear in your assets when it is ready."); return null; }
      say(video ? "Video added to your assets." : "Image added to your assets.");
      if (place) addImageElement(result.asset);
      return result.asset;
    } finally {
      uploading = false;
      if (uploadButton) uploadButton.disabled = false;
    }
  }

  return {
    addImageElement, uploadFile, showAssetsArea,
    update() { templates.update(); renderBackground(); renderAssets(); renderGamidStatus(); renderGamidData(); renderGamerData(); renderMyFonts(); renderFontSelection(); renderShapeSelection(); },
    invalidate() { renderBackground(true); renderAssets(true); },
    renderAssets, renderBackground,
  };
}
