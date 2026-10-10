// Classic Profile Banner editor (Profile Editor -> Banner; DEC-0005). The owner picks an image (JPEG, PNG, WebP, GIF or AVIF, at most 5 MiB - an animated GIF
// uses its first frame), positions it inside a fixed 6:1 frame (drag, arrow keys, zoom), and the browser renders exactly 1920x320 as a JPEG. Nothing is sent until
// the section's Save Changes; then the usage-upload gateway fully decodes and re-encodes it (the security boundary) and attach is compare-and-set. Without a
// Banner the public desktop profile shows the default gradient. Built with createElement / textContent only; errors stay until the owner chooses again.
export const BANNER_SOURCE_MAX_BYTES = 5 * 1024 * 1024;
export const BANNER_OUTPUT = Object.freeze({ width: 1920, height: 320, type: "image/jpeg", quality: 0.9 });
export const BANNER_ASPECT = BANNER_OUTPUT.width / BANNER_OUTPUT.height;   // 6:1
export const BANNER_MIN_SOURCE = Object.freeze({ width: 1200, height: 200 });
export const BANNER_MAX_SIDE = 8192, BANNER_MAX_PIXELS = 40_000_000, BANNER_MAX_ZOOM = 4;
export const BANNER_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
export const BANNER_ERRORS = Object.freeze({
  TOO_LARGE: "This image is larger than 5 MB. Choose an image of 5 MB or less.",
  UNSUPPORTED: "Use a JPEG, PNG, WebP, GIF or AVIF image.",
  UNREADABLE: "This image couldn't be read. Choose another image.",
  TOO_BIG_DIMENSIONS: "This image is too large to process (more than 8192 pixels on a side or 40 megapixels). Choose a smaller image.",
  RENDER_FAILED: "The Banner couldn't be prepared in this browser. Choose the image again.",
});

// what the server may answer while saving (usage-upload gateway, attach / remove RPCs), in words
export const BANNER_SERVER_MESSAGES = Object.freeze({
  INVALID_BANNER: "The Banner couldn't be stored. Choose the image again.",
  INVALID_BANNER_TYPE: "The Banner couldn't be stored. Choose the image again.",
  INVALID_BANNER_SIZE: "The Banner couldn't be stored. Choose the image again.",
  CHUNK_TOO_LARGE: "The Banner is too large to store. Choose another image.",
  BANNER_CHANGED: "Your Banner was changed somewhere else (another tab or device). Reload the page to see the current Banner.",
  BANNER_NOT_UPLOADED: "The Banner upload didn't finish. Select Save Changes to try again.",
  UPLOAD_GATEWAY_FAILED: "The upload service is not responding right now. Select Save Changes to try again in a moment.",
});

// The real format from the file's first bytes (never its name or declared type). -> "jpeg" | "png" | "webp" | "gif" | "avif" | null
export function sniffImageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const ascii = (from, to) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (b.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "gif";
  if (b.length >= 12 && ascii(4, 8) === "ftyp" && /^(avif|avis)$/.test(ascii(8, 12))) return "avif";
  return null;
}
const DECLARED = { jpeg: ["image/jpeg", "image/jpg", "image/pjpeg"], png: ["image/png"], webp: ["image/webp"], gif: ["image/gif"], avif: ["image/avif"] };
// -> { ok: true, kind } | { ok: false, code }. A declared type that contradicts the bytes is refused.
export function checkBannerFile({ size, type }, head) {
  if (!Number.isFinite(size) || size <= 0) return { ok: false, code: "UNREADABLE" };
  if (size > BANNER_SOURCE_MAX_BYTES) return { ok: false, code: "TOO_LARGE" };
  const kind = sniffImageType(head);
  if (!kind) return { ok: false, code: "UNSUPPORTED" };
  if (type && !DECLARED[kind].includes(String(type).toLowerCase())) return { ok: false, code: "UNSUPPORTED" };
  return { ok: true, kind };
}
export function checkBannerDimensions(width, height) {
  if (!(width > 0 && height > 0)) return { ok: false, code: "UNREADABLE" };
  if (width > BANNER_MAX_SIDE || height > BANNER_MAX_SIDE || width * height > BANNER_MAX_PIXELS) return { ok: false, code: "TOO_BIG_DIMENSIONS" };
  return { ok: true, small: width < BANNER_MIN_SOURCE.width || height < BANNER_MIN_SOURCE.height };
}

// Crop geometry in OUTPUT pixels (1920x320). The image always covers the frame; zoom 1 = the smallest cover scale. -> { scale, x, y } (top-left of the image)
export function coverScale(width, height) { return Math.max(BANNER_OUTPUT.width / width, BANNER_OUTPUT.height / height); }
export function clampCrop({ width, height }, { zoom = 1, x = 0, y = 0 }) {
  const z = Math.min(BANNER_MAX_ZOOM, Math.max(1, Number.isFinite(zoom) ? zoom : 1));
  const scale = coverScale(width, height) * z;
  const minX = BANNER_OUTPUT.width - width * scale, minY = BANNER_OUTPUT.height - height * scale;
  return { zoom: z, scale, x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
}
// the centered crop for a zoom level
export function centeredCrop(size, zoom = 1) {
  const scale = coverScale(size.width, size.height) * zoom;
  return clampCrop(size, { zoom, x: (BANNER_OUTPUT.width - size.width * scale) / 2, y: (BANNER_OUTPUT.height - size.height * scale) / 2 });
}
// zooming keeps the point under the frame's center fixed
export function zoomCrop(size, crop, zoom) {
  const cx = BANNER_OUTPUT.width / 2, cy = BANNER_OUTPUT.height / 2;
  const next = clampCrop(size, { zoom, x: 0, y: 0 });
  const ratio = next.scale / crop.scale;
  return clampCrop(size, { zoom: next.zoom, x: cx - (cx - crop.x) * ratio, y: cy - (cy - crop.y) * ratio });
}
// the source rectangle drawn into the 1920x320 output
export function sourceRect(crop) { return { sx: -crop.x / crop.scale, sy: -crop.y / crop.scale, sw: BANNER_OUTPUT.width / crop.scale, sh: BANNER_OUTPUT.height / crop.scale }; }

export async function renderBanner(bitmap, crop, doc = globalThis.document) {
  const canvas = doc.createElement("canvas");
  canvas.width = BANNER_OUTPUT.width; canvas.height = BANNER_OUTPUT.height;
  const g = canvas.getContext("2d");
  g.fillStyle = "#07060b"; g.fillRect(0, 0, canvas.width, canvas.height);   // a transparent PNG / GIF lands on the page background, never black-on-JPEG garbage
  g.imageSmoothingQuality = "high";
  const r = sourceRect(crop);
  g.drawImage(bitmap, r.sx, r.sy, r.sw, r.sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, BANNER_OUTPUT.type, BANNER_OUTPUT.quality));
  if (!blob || blob.type !== BANNER_OUTPUT.type) throw new Error("RENDER_FAILED");
  return blob;
}

// -> { element, load(), isDirty(), save(), status(), reset() }. `api` = supabase-client functions; `userId()` = the signed-in owner.
export function createBannerEditor(doc, { api, userId, onChange = () => {}, createBitmap = globalThis.createImageBitmap?.bind(globalThis) } = {}) {
  const h = (tag, className, text) => { const n = doc.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const element = h("div", "banner-editor");
  const lede = h("p", "connections-lede", "A wide picture across the top of your public GamID on large screens (desktop). Without one, a GamID gradient is shown.");
  const frame = h("div", "banner-frame is-empty");
  frame.setAttribute("role", "img"); frame.setAttribute("aria-label", "Banner preview");
  const canvas = h("canvas", "banner-canvas"); canvas.width = BANNER_OUTPUT.width; canvas.height = BANNER_OUTPUT.height; canvas.setAttribute("aria-hidden", "true");
  const savedImg = h("img", "banner-saved"); savedImg.alt = ""; savedImg.hidden = true;
  frame.append(savedImg, canvas);
  const controls = h("div", "banner-controls");
  const pick = h("label", "secondary banner-pick", "Choose image");
  const input = h("input"); input.type = "file"; input.accept = BANNER_ACCEPT; input.id = "bannerInput"; input.className = "visually-hidden";
  pick.prepend(input);
  const zoomLabel = h("label", "banner-zoom", "Zoom");
  const zoom = h("input"); zoom.type = "range"; zoom.min = "1"; zoom.max = String(BANNER_MAX_ZOOM); zoom.step = "0.01"; zoom.value = "1"; zoom.id = "bannerZoom"; zoom.disabled = true;
  zoomLabel.append(zoom);
  const remove = h("button", "text-button danger", "Remove Banner"); remove.type = "button"; remove.id = "bannerRemove";
  const undo = h("button", "text-button", "Keep current Banner"); undo.type = "button"; undo.hidden = true; undo.id = "bannerUndo";
  controls.append(pick, zoomLabel, remove, undo);
  const help = h("small", "banner-help", "JPEG, PNG, WebP, GIF or AVIF · max 5 MB · shown at 1920 × 320 (6:1). Animated GIFs are shown as a still image (first frame). Drag the picture or use the arrow keys to position it.");
  const note = h("p", "banner-note"); note.hidden = true; note.setAttribute("role", "status");
  const error = h("p", "social-error banner-error"); error.id = "bannerError"; error.setAttribute("role", "alert"); error.hidden = true;
  element.append(lede, frame, controls, help, note, error);

  let saved = { path: null, url: null };
  let pending = null;          // { bitmap, size, crop, kind } - a new image not saved yet
  let removing = false;        // the saved Banner will be removed on Save Changes
  let loaded = false;

  const showError = text => { error.textContent = text || ""; error.hidden = !text; if (text) input.setAttribute("aria-describedby", error.id); else input.removeAttribute("aria-describedby"); };
  const showNote = text => { note.textContent = text || ""; note.hidden = !text; };
  function paint() {
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (pending) { const r = sourceRect(pending.crop); g.drawImage(pending.bitmap, r.sx, r.sy, r.sw, r.sh, 0, 0, canvas.width, canvas.height); }
    canvas.hidden = !pending;
    savedImg.hidden = Boolean(pending) || removing || !saved.url;
    frame.classList.toggle("is-empty", !pending && (removing || !saved.url));
    frame.classList.toggle("is-editing", Boolean(pending));
    frame.tabIndex = pending ? 0 : -1;
    frame.setAttribute("aria-label", pending ? "Banner preview - drag or use the arrow keys to position it" : "Banner preview");
    zoom.disabled = !pending;
    remove.hidden = Boolean(pending) || removing || !saved.path;
    undo.hidden = !pending && !removing;
    undo.textContent = saved.path ? "Keep current Banner" : "Cancel";
  }
  function setCrop(next) { if (!pending) return; pending.crop = clampCrop(pending.size, next); zoom.value = String(pending.crop.zoom); paint(); }

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    showError(""); showNote("");
    const head = new Uint8Array(await file.slice(0, 32).arrayBuffer().catch(() => new ArrayBuffer(0)));
    const check = checkBannerFile(file, head);
    if (!check.ok) { showError(BANNER_ERRORS[check.code]); return; }
    let bitmap;
    try { bitmap = await createBitmap(file); } catch { showError(BANNER_ERRORS.UNREADABLE); return; }
    const dims = checkBannerDimensions(bitmap.width, bitmap.height);
    if (!dims.ok) { bitmap.close?.(); showError(BANNER_ERRORS[dims.code]); return; }
    pending?.bitmap.close?.();
    const size = { width: bitmap.width, height: bitmap.height };
    pending = { bitmap, size, crop: centeredCrop(size), kind: check.kind };
    removing = false;
    zoom.value = "1";
    const notes = [];
    if (check.kind === "gif") notes.push("Animated GIFs are shown as a still image (first frame).");
    if (dims.small) notes.push(`This image is smaller than ${BANNER_MIN_SOURCE.width} × ${BANNER_MIN_SOURCE.height}; it may look soft.`);
    showNote(notes.join(" "));
    paint(); onChange();
    frame.focus?.();
  });
  zoom.addEventListener("input", () => { if (pending) { pending.crop = zoomCrop(pending.size, pending.crop, Number(zoom.value)); paint(); } });
  // drag to position (pointer events: mouse, touch, pen); distances are converted from the shown frame to output pixels
  let drag = null;
  frame.addEventListener("pointerdown", event => { if (!pending) return; drag = { x: event.clientX, y: event.clientY, crop: { ...pending.crop } }; frame.setPointerCapture?.(event.pointerId); event.preventDefault(); });
  frame.addEventListener("pointermove", event => {
    if (!drag || !pending) return;
    const k = BANNER_OUTPUT.width / (frame.getBoundingClientRect().width || BANNER_OUTPUT.width);
    setCrop({ zoom: drag.crop.zoom, x: drag.crop.x + (event.clientX - drag.x) * k, y: drag.crop.y + (event.clientY - drag.y) * k });
  });
  const endDrag = () => { if (drag) { drag = null; onChange(); } };
  frame.addEventListener("pointerup", endDrag); frame.addEventListener("pointercancel", endDrag);
  frame.addEventListener("keydown", event => {
    if (!pending) return;
    const step = event.shiftKey ? 120 : 24;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) { event.preventDefault(); setCrop({ ...pending.crop, x: pending.crop.x + moves[event.key][0], y: pending.crop.y + moves[event.key][1] }); onChange(); }
    if (event.key === "+" || event.key === "=") { event.preventDefault(); pending.crop = zoomCrop(pending.size, pending.crop, pending.crop.zoom + 0.25); zoom.value = String(pending.crop.zoom); paint(); }
    if (event.key === "-") { event.preventDefault(); pending.crop = zoomCrop(pending.size, pending.crop, pending.crop.zoom - 0.25); zoom.value = String(pending.crop.zoom); paint(); }
  });
  remove.addEventListener("click", () => { removing = true; showError(""); showNote("Your Banner will be removed when you save."); paint(); onChange(); });
  undo.addEventListener("click", () => { pending?.bitmap.close?.(); pending = null; removing = false; showError(""); showNote(""); paint(); onChange(); });

  async function setSavedPath(path) {
    if (saved.url) URL.revokeObjectURL(saved.url);
    saved = { path: path || null, url: null };
    if (path) { try { saved.url = await api.loadMyBanner(path); } catch { saved.url = null; } if (saved.url) savedImg.src = saved.url; }
    paint();
  }
  async function load() {
    const current = await api.getMyBanner();
    await setSavedPath(current?.banner_path || null);
    loaded = true;
    // detached uploads older than an hour (an interrupted save) are cleaned up so they never keep counting against storage
    api.listMyUnattachedBanners().then(rows => { for (const row of rows || []) api.deleteBannerObject(row.path); }, () => {});
  }
  // Saves what is staged. Throws an Error with a readable message on failure; the staged image stays so Save Changes can be retried.
  async function save() {
    try { await saveStaged(); }
    catch (failure) {
      const known = BANNER_SERVER_MESSAGES[failure?.code] || BANNER_SERVER_MESSAGES[failure?.message];
      throw known ? Object.assign(new Error(known), { code: failure?.code }) : failure;
    }
  }
  async function saveStaged() {
    if (!loaded) throw new Error("Your Banner has not loaded yet. Reload the page and try again.");
    if (pending) {
      let blob;
      try { blob = await renderBanner(pending.bitmap, pending.crop, doc); } catch { throw new Error(BANNER_ERRORS.RENDER_FAILED); }
      const path = await api.uploadBanner(blob, userId());
      let result;
      try { result = await api.attachMyBanner(path, saved.path); }
      catch (failure) { await api.deleteBannerObject(path); throw failure; }
      if (!result || result.banner_path !== path) { await api.deleteBannerObject(path); throw new Error("Your Banner couldn't be confirmed. Please try again."); }
      if (result.previous_path) await api.deleteBannerObject(result.previous_path);
      pending.bitmap.close?.(); pending = null; showNote("");
      await setSavedPath(path);
    } else if (removing) {
      const result = await api.removeMyBanner(saved.path);
      if (!result || result.banner_path !== null) throw new Error("Your Banner couldn't be confirmed as removed. Please try again.");
      if (result.previous_path) await api.deleteBannerObject(result.previous_path);
      removing = false; showNote("");
      await setSavedPath(null);
    }
    showError("");
  }
  function reset() { pending?.bitmap.close?.(); pending = null; removing = false; showError(""); showNote(""); if (saved.url) URL.revokeObjectURL(saved.url); saved = { path: null, url: null }; loaded = false; paint(); }
  paint();
  return {
    element, load, save, reset,
    isDirty: () => Boolean(pending) || removing,
    status: () => pending ? "Unsaved Banner" : removing ? "Banner will be removed" : saved.path ? "Banner saved" : "No Banner yet",
    showError,
  };
}
