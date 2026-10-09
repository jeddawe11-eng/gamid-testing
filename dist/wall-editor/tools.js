// The tool drawer: Add, Text, Media & Links, Shapes, Background, GamID, Assets, Templates (Layout - stages and layers - is wired in editor.js). Every panel is built
// with createElement/textContent only. Panels never touch the network themselves: uploads go through the asset store, links go through the provider-neutral engine,
// and every change to the Wall is an ops.* result applied with `run` (so it is validated, undoable and unsaved-tracked like every other edit).
import { createTemplatesPanel } from "./templates.js";
import * as ops from "../wall-kit/ops.js";
import { createTextPayload, LINK_MAX } from "../wall-kit/text.js";
import { normalizeLinkInput, LINK_PROBLEMS } from "../wall-kit/links.js";
import { describeErrors } from "../wall-kit/messages.js";
import { FONT_CATALOG, fontCss } from "../wall-kit/fonts.js";
import { createImagePayload } from "../wall-kit/image.js";
import { defaultBackground, createImageBackground, createVideoBackground } from "../wall-kit/background.js";
import { GAMID_BLOCKS, GAMID_BLOCK_INFO, createGamidPayload } from "../wall-kit/gamid.js";
import { DATA_FIELD_INFO, DATA_ITEMS, DATA_TEXT_FIELDS, createGamidDataPayload, dataTextStyle } from "../wall-kit/gamid-data.js";
import { startingImageSize, describeVideoJobFailure, isVideoAsset, isVideoFileType } from "../wall-kit/assets.js";
import { PROVIDERS, detectEmbed, buildEmbedPayload, defaultEmbedSize, humanReason, PRESENTATION_LABELS } from "../wall-kit/embed/engine.js";
import { mediaCapabilities } from "../wall-kit/embed/index.js";
import { fitFrame } from "../wall-kit/embed/player.js";
import { createVideoPreviews } from "./video-preview.js";
import { renderUploadError, classifyUploadError } from "../app/upload-feedback.js";

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

export const TEXT_PRESETS = Object.freeze([
  { key: "heading", label: "Heading", note: "Big, bold, for your name or title", overrides: { text: "Your title", fontFamily: "orbitron", fontSize: 150, fontWeight: 800 }, size: { width: 900, height: 230 } },
  { key: "body", label: "Text", note: "A paragraph about you", overrides: { text: "Write something about yourself here.", fontFamily: "system-sans", fontSize: 56, fontWeight: 400, align: "left", lineHeight: 1.35 }, size: { width: 800, height: 260 } },
  { key: "gaming", label: "Gaming title", note: "Condensed with a neon glow", overrides: { text: "GAME ON", fontFamily: "bebas-neue", fontSize: 230, fontWeight: 400, glow: { color: "#62e7ff", blur: 22 } }, size: { width: 900, height: 300 } },
]);

// "Other" link (Media & Links): a text element whose words are the link. Starts as a clear, underlined link line; every Text control restyles it.
export const OTHER_TEXT_MAX = 120;
export const OTHER_LINK_STYLE = Object.freeze({ fontFamily: "system-sans", fontSize: 64, fontWeight: 700, underline: true, color: "#62e7ff", align: "center", lineHeight: 1.2, wrap: true });
export const OTHER_LINK_SIZE = Object.freeze({ width: 800, height: 120 });

export function createTools({ session, run, notify, assets, getGamid, refreshGamid, setTool, pickImage }) {
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
    gamidData: () => { setTool("gamid"); requestAnimationFrame(() => $("gamidDataTitle")?.scrollIntoView({ block: "start" })); },
  };
  for (const button of document.querySelectorAll("[data-add-action]")) button.addEventListener("click", () => addActions[button.dataset.addAction]?.());

  // ---- Text ----------------------------------------------------------------------------------------------------------------------------------
  function addTextPreset(preset) { return addCustom("text", createTextPayload(preset.overrides), preset.size); }
  const presets = $("textPresets");
  for (const preset of TEXT_PRESETS) presets.append(h("button", { class: "ed-btn", type: "button", onclick: () => { addTextPreset(preset); setTool("props"); } }, h("b", { text: "T" }), h("span", {}, preset.label, h("small", { text: preset.note }))));
  const fontList = $("fontList");
  for (const group of [...new Set(FONT_CATALOG.map(font => font.group))]) {
    fontList.append(h("div", { class: "group", text: group }));
    for (const font of FONT_CATALOG.filter(candidate => candidate.group === group)) {
      const button = h("button", { class: "ed-btn", type: "button", text: font.label, onclick: () => {
        const ids = selectedTextIds();
        if (!ids.length) { notify("Select a text element first, then choose a font."); return; }
        run(ops.updatePayloadMany(doc(), ids, { fontFamily: font.key }));
      } });
      button.style.setProperty("font-family", fontCss(font.key));
      fontList.append(button);
    }
  }

  // ---- Shapes --------------------------------------------------------------------------------------------------------------------------------
  for (const button of document.querySelectorAll("[data-shape]")) button.addEventListener("click", () => { const result = run(ops.addElement(doc(), stageId(), button.dataset.shape), { keepResultSelection: true }); if (result.ok) setTool("props"); });

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
  for (const entry of capabilities) {
    const modes = [...new Set(entry.kinds.flatMap(kind => kind.presentations))].map(value => PRESENTATION_LABELS[value]);
    const button = h("button", { type: "button", class: `ed-provider${entry.featured ? "" : " is-extra"}`, "aria-expanded": "false", "aria-controls": "mediaProviderInfo", role: "listitem",
      onclick: () => { openProvider = openProvider === entry.key ? null : entry.key; renderProviderInfo(); } }, h("b", { text: entry.label }), h("small", { text: modes.join(" · ") }));
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
  function otherForm() {
    const url = h("input", { id: "otherUrl", class: "ed-text-line", type: "url", inputmode: "url", autocomplete: "off", spellcheck: "false", maxlength: LINK_MAX, placeholder: "mywebsite.com" });
    const text = h("input", { id: "otherText", class: "ed-text-line", type: "text", autocomplete: "off", maxlength: OTHER_TEXT_MAX, placeholder: "Support Me" });
    const status = h("p", { class: "ed-media-msg", role: "status", hidden: true });
    const add = () => {
      const link = normalizeLinkInput(url.value);
      if (!link.ok) { status.hidden = false; status.textContent = LINK_PROBLEMS[link.reason]; url.focus(); return; }
      const shown = text.value.trim() || new URL(link.url).hostname;
      const result = addCustom("text", createTextPayload({ ...OTHER_LINK_STYLE, text: shown, link: { url: link.url } }), OTHER_LINK_SIZE);
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
      h("label", { class: "ed-stack" }, h("span", { text: "Display Text" }), text),
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
    const labels = { embed: "Player", card: "Card", link: "Link" };
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

  // ---- Background ----------------------------------------------------------------------------------------------------------------------------
  let scope = "wall";
  const scopeId = () => (scope === "wall" ? "wall" : stageId());
  const currentBackground = () => (scope === "wall" ? doc().background ?? null : session.stage?.background ?? null);
  const setBg = (background, options) => run(ops.setBackground(doc(), scopeId(), background), options);
  for (const button of document.querySelectorAll("[data-bg-scope]")) button.addEventListener("click", () => { scope = button.dataset.bgScope; renderBackground(); });
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
  let videoStatus = "";
  let videoError = null;   // ISS-0001: a failed background video upload / conversion { message, code, status, file?, target? } - persistent until dismissed or resolved
  // Background asset deletion: never one click. An asset the Wall uses (Whole Wall / a stage background / a picture element) cannot be deleted - the panel says
  // where it is used; an unused one asks for confirmation first. The database refuses again if the SAVED Wall still uses it (nothing is ever left broken).
  let pendingDelete = null;       // asset id awaiting confirmation
  let deleteStatus = "";
  function deleteControls(asset, noun) {
    const usage = ops.assetUsage(doc(), asset.asset_id);
    if (usage.length) return h("div", { class: "ed-asset-inuse", text: `In use: ${usage.join(", ")}` });
    if (pendingDelete !== asset.asset_id) {
      return h("button", { class: "ed-btn ed-danger", type: "button", text: "Delete", "aria-label": `Delete this ${noun}`, onclick: () => { pendingDelete = asset.asset_id; deleteStatus = ""; renderBackground(true); } });
    }
    return h("div", { class: "ed-confirm", role: "group", "aria-label": `Delete this ${noun}?` },
      h("p", { text: `Delete this ${noun} permanently? It is removed from your uploads and cannot be undone.` }),
      h("div", { class: "ed-row" },
        h("button", { class: "ed-btn ed-danger", type: "button", text: "Delete permanently", onclick: async () => {
          const result = await assets.remove(asset.asset_id, doc());
          pendingDelete = null;
          if (result.ok) resolveUsageErrors();
          deleteStatus = result.ok ? `The ${noun} was deleted.`
            : result.code === "WALL_ASSET_IN_USE" ? `This ${noun} is still used by your saved Wall. Save your changes first, then delete it.` : result.message;
          renderBackground(true);
        } }),
        h("button", { class: "ed-btn", type: "button", text: "Cancel", onclick: () => { pendingDelete = null; renderBackground(true); } })));
  }
  // MP4 background upload (background only - videos never appear in Assets or as artwork). Resumable, with progress; the server checks the stored file.
  const videoInput = h("input", { type: "file", accept: "video/mp4", hidden: true });
  document.body.append(videoInput);
  videoInput.addEventListener("change", async () => {
    const file = videoInput.files?.[0];
    videoInput.value = "";
    if (!file) return;
    // the scope the owner chose when they picked the file: a converted video lands exactly there, even if they switched stage meanwhile
    await uploadBackgroundVideo(file, scopeId());
  });
  const videoBusy = () => /^(Checking|Uploading|Processing)/.test(videoStatus);
  async function uploadBackgroundVideo(file, target) {
    if (videoBusy()) { notify("A background video is already being added. Wait for it to finish."); return; }
    videoError = null;
    videoStatus = "Checking the video…";
    renderBackground(true);
    const result = await assets.uploadVideo(file, { onProgress: (done, total) => showVideoStatus(`Uploading… ${Math.round((done / total) * 100)}%`) });
    if (!result.ok) { videoStatus = ""; videoError = { message: result.message, code: result.code, status: result.status, file, target }; notify(result.message); renderBackground(true); return; }
    if (result.asset) { videoStatus = "Video added."; setBg(createVideoBackground(result.asset.asset_id)); return; }
    // HEVC / H.265: converted to H.264 on the server at the SAME resolution. Nothing is attached until it is READY; a failure changes nothing on the Wall.
    await followConversion(result.job.job_id, target, { attach: true });
  }
  // the persistent error box for the background video (rebuilt with the panel); Retry re-sends the same file to the scope it was meant for
  const videoErrorBox = () => (videoError ? renderUploadError(document, videoError, { id: "bgVideoError",
    onRetry: videoError.file ? (() => { const { file, target } = videoError; uploadBackgroundVideo(file, target); }) : null,
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
  const pickVideo = () => { if (videoBusy()) { notify("A background video is already being added. Wait for it to finish."); return; } videoStatus = ""; videoInput.click(); };

  function renderBackground(force = false) {
    const current = currentBackground();
    // rebuild only when the STRUCTURE changes (scope, stage, kind, picture, fit, overlay on/off, asset list) - never while a slider is being dragged
    const key = JSON.stringify([scope, stageId(), current?.kind ?? null, current?.assetId ?? null, current?.fit ?? null, !!current?.overlay, assets.assets.length, assets.images.filter(asset => assets.urlFor(asset.asset_id)).length, assets.videos.map(asset => !!assets.videoUrlFor(asset.asset_id)).join(), doc().stages.length, scope === "stage" ? !!doc().background : null, videoStatus, videoError?.message ?? null,
      current?.flipX === true, current?.flipY === true, pendingDelete, deleteStatus, [...ops.assetsInUse(doc())].sort().join()]);
    if (!force && key === bgKey) return;
    bgKey = key;
    for (const button of document.querySelectorAll("[data-bg-scope]")) button.setAttribute("aria-pressed", String(button.dataset.bgScope === scope));
    const bg = currentBackground();
    const kind = bg?.kind ?? "none";
    kindsBox.replaceChildren();
    for (const [value, label] of [["none", "None"], ["color", "Colour"], ["gradient", "Gradient"], ["image", "Image"], ["video", "Video"]]) {
      kindsBox.append(h("button", { type: "button", "aria-pressed": String(kind === value), text: label, onclick: () => {
        if (value === "none") setBg(null);
        else if (value === "image") { const first = assets.images[0]; if (first) setBg(createImageBackground(first.asset_id)); else { notify("Upload an image first (Assets), then use it as a background."); setTool("assets"); } }
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
      "aria-label": scope === "wall" ? "Remove the Whole Wall background" : "Remove this stage's own background", onclick: () => { pendingDelete = null; deleteStatus = ""; setBg(null); } })));
    // the background uploads (Use + Delete); `onUse` assigns one, `selectedId` marks the current one
    const imageGrid = (selectedId, onUse) => {
      const grid = h("div", { class: "ed-assets" });
      for (const asset of assets.images) {
        const thumb = h("div", { class: "thumb" });
        const url = assets.urlFor(asset.asset_id);
        if (url) thumb.append(h("img", { src: url, alt: "" })); else thumb.textContent = "…";
        grid.append(h("div", { class: "ed-asset" }, thumb, h("button", { class: "ed-btn", type: "button", "aria-pressed": String(asset.asset_id === selectedId), text: asset.asset_id === selectedId ? "Selected" : "Use", onclick: () => onUse(asset.asset_id) }),
          deleteControls(asset, "image")));
      }
      return grid;
    };
    const videoList = (selectedId, onUse) => {
      const list = h("div", { class: "ed-assets ed-videos" });
      assets.videos.forEach((asset, index) => {
        const thumb = h("div", { class: "thumb" });
        videoPreviews.mount(thumb, { id: asset.asset_id, url: assets.videoUrlFor(asset.asset_id) });   // a still frame, never a <video> (video-preview.js)
        const selected = asset.asset_id === selectedId;
        list.append(h("div", { class: "ed-asset" }, thumb,
          h("div", { class: "meta", text: `Video ${index + 1} · ${asset.width}×${asset.height} · ${Math.max(1, Math.round(asset.byte_size / (1024 * 1024)))} MB` }),
          h("div", { class: "row" },
            h("button", { class: "ed-btn", type: "button", "aria-pressed": String(selected), text: selected ? "Selected" : "Use", onclick: () => onUse(asset.asset_id) })),
          deleteControls(asset, "video")));
      });
      return list;
    };
    const deleteLine = () => (deleteStatus ? [h("p", { class: "ed-hint", role: "status", text: deleteStatus })] : []);
    if (bg?.kind === "color") controlsBox.append(bgColor("Colour", bg.color, value => setBg({ ...live(), color: value }, co)));
    if (bg?.kind === "gradient") controlsBox.append(bgColor("From", bg.from, value => setBg({ ...live(), from: value }, co)), bgColor("To", bg.to, value => setBg({ ...live(), to: value }, co)), bgSlider("Angle", 0, 360, 1, bg.angle, value => setBg({ ...live(), angle: value }, co)));
    if (bg?.kind === "image") controlsBox.append(imageGrid(bg.assetId, assetId => setBg({ ...live(), assetId })), ...deleteLine());
    // no background here: the uploads stay reachable (choosing Image / Video would assign one straight away, so an unused upload could never be deleted)
    if (!bg && (assets.images.length || assets.videos.length)) {
      controlsBox.append(h("p", { class: "ed-hint", text: "Your background uploads. Use one here, or delete one that nothing uses." }));
      if (assets.images.length) controlsBox.append(h("h4", { class: "ed-sub", text: "Images" }), imageGrid(null, assetId => setBg(createImageBackground(assetId))));
      if (assets.videos.length) controlsBox.append(h("h4", { class: "ed-sub", text: "Videos" }), videoList(null, assetId => setBg(createVideoBackground(assetId))));
      controlsBox.append(...deleteLine());
    }
    if (bg?.kind === "video") {
      controlsBox.append(videoList(bg.assetId, assetId => setBg({ ...live(), assetId })), ...deleteLine(), h("div", { class: "ed-row ed-wrap" }, h("button", { class: "ed-btn ed-primary", type: "button", text: "Upload MP4", onclick: pickVideo, disabled: /^(Checking|Uploading|Processing)/.test(videoStatus) })),
        h("p", { id: "bgVideoStatus", class: "ed-hint", role: "status", text: videoStatus }), ...videoErrorBoxes(),
        h("p", { class: "ed-hint", text: "MP4, up to 50 MB. H.264 is used as it is; an H.265 (HEVC) video is converted for every browser at the same resolution. It plays muted and looping behind everything, with no controls." }));
    } else if ((videoStatus || videoError) && kind !== "video") controlsBox.append(h("p", { id: "bgVideoStatus", class: "ed-hint", role: "status", text: videoStatus }), ...videoErrorBoxes());
    if (bg?.kind === "image" || bg?.kind === "video") {
      controlsBox.append(h("label", { class: "ed-field" }, h("span", { text: "Fit" }), h("div", { class: "ed-inline" }, (() => {
        const select = h("select");
        for (const [value, label] of [["cover", bg.kind === "video" ? "Fill (cover, recommended)" : "Fill (crop)"], ["contain", bg.kind === "video" ? "Show whole video" : "Show whole picture"]]) select.append(h("option", { value, text: label, selected: bg.fit === value }));
        select.addEventListener("change", () => setBg({ ...live(), fit: select.value }));
        return select;
      })())));
      controlsBox.append(bgSlider("Position X %", 0, 100, 1, bg.posX, value => setBg({ ...live(), posX: value }, co)), bgSlider("Position Y %", 0, 100, 1, bg.posY, value => setBg({ ...live(), posY: value }, co)), bgSlider("Opacity %", 0, 100, 1, Math.round(bg.opacity * 100), value => setBg({ ...live(), opacity: value / 100 }, co)));
      // Flip: mirrors how the background is drawn (image or video alike) - the uploaded file is never changed. Saved in the Wall as flipX / flipY.
      const flip = (label, key) => h("button", { class: "ed-btn", type: "button", "aria-pressed": String(bg[key] === true), text: label,
        onclick: () => { const now = live(); setBg(now[key] === true ? (({ [key]: _off, ...rest }) => rest)(now) : { ...now, [key]: true }); } });
      controlsBox.append(h("div", { class: "ed-btn-row", role: "group", "aria-label": "Flip background" }, flip("Flip horizontal", "flipX"), flip("Flip vertical", "flipY")));
      const overlayOn = !!bg.overlay;
      const toggle = h("input", { type: "checkbox" });
      toggle.checked = overlayOn;
      toggle.addEventListener("change", () => setBg(toggle.checked ? { ...live(), overlay: { color: "#000000", opacity: 0.35 } } : { ...live(), overlay: undefined }));
      controlsBox.append(h("label", { class: "ed-field" }, h("span", { text: "Darken" }), h("div", { class: "ed-inline" }, toggle)));
      if (overlayOn) controlsBox.append(bgColor("Overlay", bg.overlay.color, value => setBg({ ...live(), overlay: { ...live().overlay, color: value } }, co)), bgSlider("Overlay %", 0, 100, 1, Math.round(bg.overlay.opacity * 100), value => setBg({ ...live(), overlay: { ...live().overlay, opacity: value / 100 } }, co)));
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

  // ---- Assets --------------------------------------------------------------------------------------------------------------------------------
  // Pictures (JPG / PNG / WebP / AVIF / GIF) and VIDEOS (MP4 / WebM) side by side. "Add" places either as a media layer with the same artwork controls; a video layer
  // plays muted and looping. Deleting follows the same safe rule as before (an asset the Wall uses is never deleted from under it).
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
  let assetsKey = "";
  const videoKind = asset => (asset.mime_type === "video/webm" ? "WebM" : "MP4");
  const sizeLabel = bytes => (bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  function renderAssets(force = false) {
    const used = ops.assetsInUse(doc());
    const key = JSON.stringify([assets.assets.map(asset => [asset.asset_id, isVideoAsset(asset) ? !!assets.videoUrlFor(asset.asset_id) : !!assets.urlFor(asset.asset_id)]), [...used].sort()]);
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
        h("div", { class: "row" },
          h("button", { class: "ed-btn", type: "button", text: "Add", "aria-label": `Add this ${noun.toLowerCase()} to the stage`, onclick: () => addImageElement(asset) }),
          h("button", { class: "ed-btn ed-danger", type: "button", text: "Delete", onclick: async () => { const result = await assets.remove(asset.asset_id, doc()); say(result.ok ? `${noun} deleted.` : result.message); if (result.ok) resolveUsageErrors(); } }))));
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
    if (uploading) { say("An upload is already in progress. Wait for it to finish."); return null; }
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
        if (place) setTool("assets");   // Add > Image: the error is shown where the upload lives
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
    addImageElement, uploadFile,
    update() { templates.update(); renderBackground(); renderAssets(); renderGamidStatus(); renderGamidData(); },
    invalidate() { renderBackground(true); renderAssets(true); },
    renderAssets, renderBackground,
  };
}
