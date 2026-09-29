// The tool drawer: Add, Text, Media & Links, Shapes, Background, GamID, Assets, Templates (Layout - stages and layers - is wired in editor.js). Every panel is built
// with createElement/textContent only. Panels never touch the network themselves: uploads go through the asset store, links go through the provider-neutral engine,
// and every change to the Wall is an ops.* result applied with `run` (so it is validated, undoable and unsaved-tracked like every other edit).
import * as ops from "../wall-kit/ops.js";
import { createTextPayload } from "../wall-kit/text.js";
import { FONT_CATALOG, fontCss } from "../wall-kit/fonts.js";
import { createImagePayload } from "../wall-kit/image.js";
import { defaultBackground, createImageBackground, createVideoBackground } from "../wall-kit/background.js";
import { GAMID_BLOCKS, GAMID_BLOCK_INFO, createGamidPayload } from "../wall-kit/gamid.js";
import { DATA_FIELD_INFO, DATA_ITEMS, DATA_TEXT_FIELDS, createGamidDataPayload, dataTextStyle } from "../wall-kit/gamid-data.js";
import { startingImageSize, describeVideoJobFailure } from "../wall-kit/assets.js";
import { PROVIDERS, detectEmbed, buildEmbedPayload, defaultEmbedSize, humanReason, PRESENTATION_LABELS } from "../wall-kit/embed/engine.js";
import { mediaCapabilities } from "../wall-kit/embed/index.js";
import { fitFrame } from "../wall-kit/embed/player.js";

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

export function createTools({ session, run, notify, assets, getGamid, refreshGamid, setTool, pickImage }) {
  const doc = () => session.doc;
  const stageId = () => session.state.stageId;
  const selectedTextIds = () => { const stage = session.stage; const chosen = new Set(session.state.selection); return stage ? stage.elements.filter(element => chosen.has(element.id) && element.type === "text").map(element => element.id) : []; };
  const addCustom = (type, payload, size, extra = {}) => run(ops.addCustomElement(doc(), stageId(), { type, payload, width: size.width, height: size.height, ...extra }), { keepResultSelection: true });

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
  $("mediaSupported").textContent = "Paste a normal web address - never embed code. Only these platforms are accepted.";
  // Provider discovery: every supported platform with the modes it HONESTLY supports (derived from the adapters, never a hand-written list). A platform button opens
  // what can be pasted for it, per content type, with its modes and player shapes.
  const providerList = $("mediaProviders"), providerInfo = $("mediaProviderInfo");
  let openProvider = null;
  const capabilities = mediaCapabilities();
  function renderProviderInfo() {
    for (const button of providerList.querySelectorAll("button")) button.setAttribute("aria-expanded", String(button.dataset.provider === openProvider));
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
  // MP4 background upload (background only - videos never appear in Assets or as artwork). Resumable, with progress; the server checks the stored file.
  const videoInput = h("input", { type: "file", accept: "video/mp4", hidden: true });
  document.body.append(videoInput);
  videoInput.addEventListener("change", async () => {
    const file = videoInput.files?.[0];
    videoInput.value = "";
    if (!file) return;
    // the scope the owner chose when they picked the file: a converted video lands exactly there, even if they switched stage meanwhile
    const target = scopeId();
    videoStatus = "Checking the video…";
    renderBackground(true);
    const result = await assets.uploadVideo(file, { onProgress: (done, total) => showVideoStatus(`Uploading… ${Math.round((done / total) * 100)}%`) });
    if (!result.ok) { videoStatus = result.message; notify(result.message); renderBackground(true); return; }
    if (result.asset) { videoStatus = "Video added."; setBg(createVideoBackground(result.asset.asset_id)); return; }
    // HEVC / H.265: converted to H.264 on the server at the SAME resolution. Nothing is attached until it is READY; a failure changes nothing on the Wall.
    await followConversion(result.job.job_id, target, { attach: true });
  });
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
    videoStatus = describeVideoJobFailure(done.failureCode);
    notify(videoStatus);
    renderBackground(true);
  }
  // a conversion still running from an earlier visit: show its progress and say when it is ready (it is not attached to anything by itself)
  setTimeout(async () => { for (const job of await assets.pendingVideoJobs?.() ?? []) followConversion(job.job_id, null, { attach: false }); }, 1500);
  const pickVideo = () => { videoStatus = ""; videoInput.click(); };

  function renderBackground(force = false) {
    const current = currentBackground();
    // rebuild only when the STRUCTURE changes (scope, stage, kind, picture, fit, overlay on/off, asset list) - never while a slider is being dragged
    const key = JSON.stringify([scope, stageId(), current?.kind ?? null, current?.assetId ?? null, current?.fit ?? null, !!current?.overlay, assets.assets.length, assets.images.filter(asset => assets.urlFor(asset.asset_id)).length, assets.videos.map(asset => !!assets.videoUrlFor(asset.asset_id)).join(), doc().stages.length, scope === "stage" ? !!doc().background : null, videoStatus]);
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
    if (bg?.kind === "color") controlsBox.append(bgColor("Colour", bg.color, value => setBg({ ...bg, color: value }, co)));
    if (bg?.kind === "gradient") controlsBox.append(bgColor("From", bg.from, value => setBg({ ...bg, from: value }, co)), bgColor("To", bg.to, value => setBg({ ...bg, to: value }, co)), bgSlider("Angle", 0, 360, 1, bg.angle, value => setBg({ ...bg, angle: value }, co)));
    if (bg?.kind === "image") {
      const grid = h("div", { class: "ed-assets" });
      for (const asset of assets.images) {
        const thumb = h("div", { class: "thumb" });
        const url = assets.urlFor(asset.asset_id);
        if (url) thumb.append(h("img", { src: url, alt: "" })); else thumb.textContent = "…";
        grid.append(h("div", { class: "ed-asset" }, thumb, h("button", { class: "ed-btn", type: "button", "aria-pressed": String(asset.asset_id === bg.assetId), text: asset.asset_id === bg.assetId ? "Selected" : "Use", onclick: () => setBg({ ...bg, assetId: asset.asset_id }) })));
      }
      controlsBox.append(grid);
    }
    if (bg?.kind === "video") {
      const list = h("div", { class: "ed-assets ed-videos" });
      assets.videos.forEach((asset, index) => {
        const thumb = h("div", { class: "thumb" });
        const url = assets.videoUrlFor(asset.asset_id);
        if (url) thumb.append(h("video", { src: url, muted: true, preload: "metadata", playsinline: true, "aria-hidden": "true" })); else thumb.textContent = "…";
        const selected = asset.asset_id === bg.assetId;
        list.append(h("div", { class: "ed-asset" }, thumb,
          h("div", { class: "meta", text: `Video ${index + 1} · ${asset.width}×${asset.height} · ${Math.max(1, Math.round(asset.byte_size / (1024 * 1024)))} MB` }),
          h("div", { class: "row" },
            h("button", { class: "ed-btn", type: "button", "aria-pressed": String(selected), text: selected ? "Selected" : "Use", onclick: () => setBg({ ...bg, assetId: asset.asset_id }) }),
            selected ? null : h("button", { class: "ed-btn ed-danger", type: "button", text: "Delete", onclick: async () => { const result = await assets.remove(asset.asset_id, doc()); videoStatus = result.ok ? "Video deleted." : result.message; renderBackground(true); } }))));
      });
      controlsBox.append(list, h("div", { class: "ed-row ed-wrap" }, h("button", { class: "ed-btn ed-primary", type: "button", text: "Upload MP4", onclick: pickVideo, disabled: /^(Checking|Uploading|Processing)/.test(videoStatus) })),
        h("p", { id: "bgVideoStatus", class: "ed-hint", role: "status", text: videoStatus }),
        h("p", { class: "ed-hint", text: "MP4, up to 50 MB. H.264 is used as it is; an H.265 (HEVC) video is converted for every browser at the same resolution. It plays muted and looping behind everything, with no controls." }));
    } else if (videoStatus && kind !== "video") controlsBox.append(h("p", { id: "bgVideoStatus", class: "ed-hint", role: "status", text: videoStatus }));
    if (bg?.kind === "image" || bg?.kind === "video") {
      controlsBox.append(h("label", { class: "ed-field" }, h("span", { text: "Fit" }), h("div", { class: "ed-inline" }, (() => {
        const select = h("select");
        for (const [value, label] of [["cover", bg.kind === "video" ? "Fill (cover, recommended)" : "Fill (crop)"], ["contain", bg.kind === "video" ? "Show whole video" : "Show whole picture"]]) select.append(h("option", { value, text: label, selected: bg.fit === value }));
        select.addEventListener("change", () => setBg({ ...bg, fit: select.value }));
        return select;
      })())));
      controlsBox.append(bgSlider("Position X %", 0, 100, 1, bg.posX, value => setBg({ ...bg, posX: value }, co)), bgSlider("Position Y %", 0, 100, 1, bg.posY, value => setBg({ ...bg, posY: value }, co)), bgSlider("Opacity %", 0, 100, 1, Math.round(bg.opacity * 100), value => setBg({ ...bg, opacity: value / 100 }, co)));
      const overlayOn = !!bg.overlay;
      const toggle = h("input", { type: "checkbox" });
      toggle.checked = overlayOn;
      toggle.addEventListener("change", () => setBg(toggle.checked ? { ...bg, overlay: { color: "#000000", opacity: 0.35 } } : { ...bg, overlay: undefined }));
      controlsBox.append(h("label", { class: "ed-field" }, h("span", { text: "Darken" }), h("div", { class: "ed-inline" }, toggle)));
      if (overlayOn) controlsBox.append(bgColor("Overlay", bg.overlay.color, value => setBg({ ...bg, overlay: { ...bg.overlay, color: value } }, co)), bgSlider("Overlay %", 0, 100, 1, Math.round(bg.overlay.opacity * 100), value => setBg({ ...bg, overlay: { ...bg.overlay, opacity: value / 100 } }, co)));
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
  const grid = $("assetGrid"), message = $("assetMessage");
  const say = text => { message.textContent = text; };
  let assetsKey = "";
  function renderAssets(force = false) {
    const used = ops.assetsInUse(doc());
    const key = JSON.stringify([assets.images.map(asset => [asset.asset_id, !!assets.urlFor(asset.asset_id)]), [...used].sort()]);
    if (!force && key === assetsKey) return;
    assetsKey = key;
    grid.replaceChildren();
    if (!assets.images.length) { grid.append(h("p", { class: "ed-empty", text: "No images yet. Upload one to use it on your Wall or as a background." })); return; }
    for (const asset of assets.images) {
      const thumb = h("div", { class: "thumb" });
      const url = assets.urlFor(asset.asset_id);
      if (url) thumb.append(h("img", { src: url, alt: "" })); else thumb.textContent = "…";
      const inUse = used.has(asset.asset_id);
      grid.append(h("div", { class: "ed-asset" }, thumb,
        h("div", { class: "meta", text: `${asset.width}×${asset.height} · ${Math.max(1, Math.round(asset.byte_size / 1024))} KB` }),
        inUse ? h("div", { class: "used", text: "IN USE" }) : null,
        h("div", { class: "row" },
          h("button", { class: "ed-btn", type: "button", text: "Add", onclick: () => addImageElement(asset) }),
          h("button", { class: "ed-btn ed-danger", type: "button", text: "Delete", onclick: async () => { const result = await assets.remove(asset.asset_id, doc()); say(result.ok ? "Image deleted." : result.message); } }))));
    }
  }
  function addImageElement(asset) {
    const size = startingImageSize(asset.width, asset.height);
    const payload = createImagePayload(asset.asset_id, { aw: asset.width, ah: asset.height });
    const result = addCustom("image", payload, size);
    if (result.ok) setTool("props");
    return result;
  }
  // Upload -> (optionally) place it. Used by Assets > Upload image and Add > Image.
  async function uploadFile(file, { place = false } = {}) {
    say("Uploading…");
    const result = await assets.upload(file);
    if (!result.ok) { say(result.message); notify(result.message); return null; }
    say("Image added to your assets.");
    if (place) addImageElement(result.asset);
    return result.asset;
  }

  return {
    addImageElement, uploadFile,
    update() { renderBackground(); renderAssets(); renderGamidStatus(); renderGamidData(); },
    invalidate() { renderBackground(true); renderAssets(true); },
    renderAssets, renderBackground,
  };
}
