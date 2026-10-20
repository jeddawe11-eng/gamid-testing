// The contextual Properties panel. Built entirely with createElement/textContent (never innerHTML). The panel is rebuilt only when the SELECTION changes
// (which controls apply); on every other change the existing controls are just re-synced, so typing in a field is never interrupted.
import * as ops from "../wall-kit/ops.js";
import { elementRegistry } from "../wall/elements.js";
import { FONT_CATALOG, fontKnown } from "../wall-kit/fonts.js";
import { TEXT_LIMITS, WEIGHTS, LINK_MAX } from "../wall-kit/text.js";
import { FIRE_STYLES, FIRE_STYLE_DEFAULTS, FIRE_LIMITS, FIRE_LIVE_LIMIT, createFire, fireTextFits } from "../wall-kit/living-fire.js";
import { SHAPES, SHAPE_PARAMS, SHAPE_LIMITS, SHAPE_LIBRARY, SHAPE_CATEGORIES, shapeParam, libraryIdOf } from "../wall/shapes.js";

const FIRE_STYLE_LABELS = { organic: "Organic", cinematic: "Cinematic", mythic: "Mythic" };
import { normalizeLinkInput, LINK_PROBLEMS } from "../wall-kit/links.js";
import { describeErrors } from "../wall-kit/messages.js";
import { PROVIDERS, isAllowedOpenUrl, presentationsFor, PRESENTATION_LABELS } from "../wall-kit/embed/engine.js";
import { ICON_LIMITS, ICON_ALIGNS, ICON_DEFAULTS, iconItemFromInput, iconItemAddress, resolveIconItem } from "../wall-kit/icons.js";
import { paintIconBadge } from "../wall-kit/icons-paint.js";
import { ALT_MAX, MASKS, BLENDS, CROP_PRESETS, SPLIT_COUNTS, EFFECT_LIMITS, FADE_MAX, cropFor } from "../wall-kit/image.js";
import { DATA_FIELD_INFO, DATA_ITEMS, dataTextStyle, renderGamidDataPayload, isDataText, isDataCollection, isSectionItem } from "../wall-kit/gamid-data.js";
import { resolveGamidData } from "../wall-kit/gamid-data-paint.js";
import { GAMID_LAYOUTS, GAMES_INITIAL, GAMID_STYLE_ENUMS, GAMID_STYLE_RANGES, resolveGamidStyle } from "../wall-kit/gamid.js";
import { PHONE_QUERY } from "./phone.js";

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

const WEIGHT_NAMES = { 100: "Thin", 200: "Extra light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semi-bold", 700: "Bold", 800: "Extra bold", 900: "Black" };
const TYPE_LABEL = { text: "Text", rect: "Shape", embed: "Link / Embed", image: "Artwork", gamid: "GamID block", gamidData: "GamID data", icons: "Icon Group" };
const MASK_LABELS = { circle: "Circle", rounded: "Rounded rectangle", hexagon: "Hexagon", diamond: "Diamond" };
const BLEND_LABELS = { normal: "Normal", screen: "Screen", multiply: "Multiply", overlay: "Overlay", "soft-light": "Soft light" };
const CROP_LABELS = { free: "Free (this box)", original: "Original", "1:1": "Square 1:1", "16:9": "Wide 16:9", "9:16": "Tall 9:16" };
const isHexColour = value => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

// onGroupingChanged: called after a successful Group / Ungroup, so the editor can leave Multi-select (while Multi stays on, the next tap on the new group toggles it
// OFF again and its handles vanish - the W0 Samsung finding).
export function createPropertiesPanel({ body, title, session, run, fitTextHeight, assets = null, refreshGamid = () => {}, getGamid = () => null, onGroupingChanged = () => {}, onEditPoints = () => {} }) {
  let builtKey = null;
  let syncers = [];
  let errorBox = null;

  const selectedElements = () => {
    const stage = session.stage;
    const chosen = new Set(session.state.selection);
    return stage ? stage.elements.filter(element => chosen.has(element.id)) : [];
  };
  const showErrors = codes => { if (errorBox) { errorBox.hidden = !codes.length; errorBox.replaceChildren(...describeErrors(codes).map(line => h("div", { text: line }))); } };
  const exec = (result, options) => { const applied = run(result, options); showErrors(applied.ok ? [] : applied.errors); return applied; };
  const activeIn = node => node.contains(document.activeElement);

  // ---- control builders (each registers a syncer) -----------------------------------------------------------------------------------------------------
  const field = (label, ...nodes) => h("label", { class: "ed-field" }, h("span", { text: label }), h("div", { class: "ed-inline" }, ...nodes));

  function numberSlider({ label, min, max, step, sliderMax = max, sliderMin = min, get, set, key }) {
    const range = h("input", { type: "range", min: sliderMin, max: sliderMax, step });
    const number = h("input", { type: "number", min, max, step, inputmode: "decimal" });
    const apply = event => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value) || event.target.value === "") return;
      exec(set(value), { coalesce: key });
    };
    range.addEventListener("input", apply);
    number.addEventListener("input", apply);
    syncers.push(targets => {
      const value = get(targets[0]);
      if (!activeIn(number)) number.value = String(value);
      if (document.activeElement !== range) range.value = String(value);
    });
    return field(label, range, number);
  }
  function colorField({ label, get, set, key }) {
    const input = h("input", { type: "color" });
    input.addEventListener("input", () => exec(set(input.value), { coalesce: key }));
    syncers.push(targets => { if (document.activeElement !== input) input.value = get(targets[0]); });
    return field(label, input);
  }
  function selectField({ label, options, get, set, key, extra }) {
    const select = h("select");
    for (const option of options) select.append(h("option", { value: option.value, text: option.label }));
    select.addEventListener("change", () => exec(set(select.value), { coalesce: key }));
    syncers.push(targets => {
      const value = String(get(targets[0]));
      if (extra && ![...select.options].some(option => option.value === value)) select.append(h("option", { value, text: extra(value) }));
      select.value = value;
    });
    return field(label, select);
  }
  function toggleButton({ label, get, set, key }) {
    const button = h("button", { class: "ed-btn", type: "button", "aria-pressed": "false", text: label });
    button.addEventListener("click", () => exec(set(!get(selectedElements()[0])), { coalesce: key }));
    syncers.push(targets => button.setAttribute("aria-pressed", String(!!get(targets[0]))));
    return button;
  }
  function optionalGroup({ label, key, get, defaults, build, write = patchAll }) {
    const wrap = h("div");
    const checkbox = h("input", { type: "checkbox" });
    const head = field(label, checkbox);
    const inner = h("div");
    checkbox.addEventListener("change", () => exec(write({ [key]: checkbox.checked ? structuredClone(defaults) : undefined })));
    syncers.push(targets => { const on = get(targets[0]) !== undefined && get(targets[0]) !== null; checkbox.checked = on; inner.hidden = !on; });
    build(inner);
    wrap.append(head, inner);
    return wrap;
  }

  // payload edits apply to every selected element of the (single) shared type
  const patchAll = patch => ops.updatePayloadMany(session.doc, session.state.selection, patch);
  const payloadOf = element => element.payload;

  // ---- panels -------------------------------------------------------------------------------------------------------------------------------------
  // `read` / `write` (Round 3): the same Text controls style a live GamID Data text field, whose style lives in payload.text (no content box there)
  // effectsRoot: where Outline / Shadow / Glow / Gradient go - the desktop text accordion's Text Effects section; without it they follow under an "Effects" title.
  function textControls(root, { read = payloadOf, write = patchAll, content = true, effectsRoot = null } = {}) {
    const nested = (key, name, fallback) => element => (read(element)[key] ?? { [name]: fallback })[name];
    const setNested = (key, name, defaults) => value => write({ [key]: { ...defaults, ...(read(selectedElements()[0])[key] ?? {}), [name]: value } });
    if (content) {
      const area = h("textarea", { class: "ed-text-input", maxlength: TEXT_LIMITS.maxLength, "aria-label": "Text", spellcheck: "false" });
      area.addEventListener("input", () => exec(write({ text: area.value }), { coalesce: "text" }));
      area.addEventListener("blur", () => { area.value = selectedElements()[0]?.payload.text ?? ""; showErrors([]); });
      syncers.push(targets => { if (document.activeElement !== area) area.value = read(targets[0]).text; });
      const linked = !!selectedElements()[0]?.payload.link;
      root.append(h("div", { class: "ed-group-title", text: linked ? "Display Text" : "Content" }), area);
      root.append(h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Fit box height to text", onclick: () => fitTextHeight(session.state.selection[0]) })));
      if (linked) linkControls(root);
    }

    const families = [...new Set(FONT_CATALOG.map(font => font.group))];
    const fontSelect = h("select");
    for (const group of families) {
      const optgroup = h("optgroup", { label: group });
      for (const font of FONT_CATALOG.filter(candidate => candidate.group === group)) optgroup.append(h("option", { value: font.key, text: font.label }));
      fontSelect.append(optgroup);
    }
    fontSelect.addEventListener("change", () => exec(write({ fontFamily: fontSelect.value, fontRef: undefined }), { coalesce: "fontFamily" }));   // a library font replaces a custom one
    syncers.push(targets => {
      const value = read(targets[0]).fontFamily;
      if (!fontKnown(value) && ![...fontSelect.options].some(option => option.value === value)) fontSelect.append(h("option", { value, text: `${value} (unavailable, using fallback)` }));
      fontSelect.value = value;
    });
    root.append(field("Font", fontSelect));
    root.append(numberSlider({ label: "Size", min: TEXT_LIMITS.fontSize[0], max: TEXT_LIMITS.fontSize[1], sliderMin: 8, sliderMax: 300, step: 1, get: element => read(element).fontSize, set: value => write({ fontSize: value }), key: "fontSize" }));
    root.append(selectField({ label: "Weight", options: WEIGHTS.map(weight => ({ value: String(weight), label: `${WEIGHT_NAMES[weight]} (${weight})` })), get: element => read(element).fontWeight, set: value => write({ fontWeight: Number(value) }), key: "fontWeight" }));
    root.append(h("div", { class: "ed-btn-row" },
      toggleButton({ label: "B", get: element => read(element).fontWeight >= 600, set: on => write({ fontWeight: on ? 700 : 400 }), key: "bold" }),
      toggleButton({ label: "I", get: element => read(element).italic, set: on => write({ italic: on }), key: "italic" }),
      toggleButton({ label: "U", get: element => read(element).underline, set: on => write({ underline: on }), key: "underline" }),
      toggleButton({ label: "Wrap", get: element => read(element).wrap, set: on => write({ wrap: on }), key: "wrap" })));
    root.append(colorField({ label: "Colour", get: element => read(element).color, set: value => write({ color: value }), key: "color" }));
    const alignRow = h("div", { class: "ed-btn-row" });
    for (const [value, label] of [["left", "Left"], ["center", "Center"], ["right", "Right"]]) {
      const button = h("button", { class: "ed-btn", type: "button", text: label, "aria-pressed": "false", onclick: () => exec(write({ align: value })) });
      syncers.push(targets => button.setAttribute("aria-pressed", String(read(targets[0]).align === value)));
      alignRow.append(button);
    }
    root.append(alignRow);
    root.append(selectField({ label: "Direction", options: [{ value: "auto", label: "Automatic" }, { value: "ltr", label: "Left to right" }, { value: "rtl", label: "Right to left" }], get: element => read(element).direction, set: value => write({ direction: value }), key: "direction" }));
    root.append(numberSlider({ label: "Line height", min: TEXT_LIMITS.lineHeight[0], max: TEXT_LIMITS.lineHeight[1], step: 0.05, get: element => read(element).lineHeight, set: value => write({ lineHeight: value }), key: "lineHeight" }));
    root.append(numberSlider({ label: "Letter space", min: TEXT_LIMITS.letterSpacing[0], max: TEXT_LIMITS.letterSpacing[1], sliderMin: -10, sliderMax: 40, step: 0.5, get: element => read(element).letterSpacing, set: value => write({ letterSpacing: value }), key: "letterSpacing" }));
    root.append(numberSlider({ label: "Opacity %", min: 0, max: 100, step: 1, get: element => Math.round(read(element).opacity * 100), set: value => write({ opacity: value / 100 }), key: "opacity" }));

    if (effectsRoot) root = effectsRoot; else root.append(h("div", { class: "ed-group-title", text: "Effects" }));
    root.append(optionalGroup({ label: "Outline", key: "stroke", get: element => read(element).stroke, defaults: { color: "#000000", width: 4 }, write, build: box => {
      box.append(colorField({ label: "Colour", get: nested("stroke", "color", "#000000"), set: setNested("stroke", "color", { color: "#000000", width: 4 }), key: "strokeColor" }));
      box.append(numberSlider({ label: "Width", min: 0, max: 50, step: 0.5, get: nested("stroke", "width", 4), set: setNested("stroke", "width", { color: "#000000", width: 4 }), key: "strokeWidth" }));
    } }));
    const shadowDefaults = { color: "#000000", blur: 8, x: 4, y: 4 };
    root.append(optionalGroup({ label: "Shadow", key: "shadow", get: element => read(element).shadow, defaults: shadowDefaults, write, build: box => {
      box.append(colorField({ label: "Colour", get: nested("shadow", "color", "#000000"), set: setNested("shadow", "color", shadowDefaults), key: "shadowColor" }));
      box.append(numberSlider({ label: "Blur", min: 0, max: 100, step: 1, get: nested("shadow", "blur", 8), set: setNested("shadow", "blur", shadowDefaults), key: "shadowBlur" }));
      box.append(numberSlider({ label: "Offset X", min: -100, max: 100, step: 1, get: nested("shadow", "x", 4), set: setNested("shadow", "x", shadowDefaults), key: "shadowX" }));
      box.append(numberSlider({ label: "Offset Y", min: -100, max: 100, step: 1, get: nested("shadow", "y", 4), set: setNested("shadow", "y", shadowDefaults), key: "shadowY" }));
    } }));
    const glowDefaults = { color: "#62e7ff", blur: 16 };
    root.append(optionalGroup({ label: effectsRoot ? "Neon glow" : "Glow", key: "glow", get: element => read(element).glow, defaults: glowDefaults, write, build: box => {
      box.append(colorField({ label: "Colour", get: nested("glow", "color", "#62e7ff"), set: setNested("glow", "color", glowDefaults), key: "glowColor" }));
      box.append(numberSlider({ label: "Blur", min: 0, max: 100, step: 1, get: nested("glow", "blur", 16), set: setNested("glow", "blur", glowDefaults), key: "glowBlur" }));
    } }));
    if (effectsRoot) livingFireGroup(root, { read, write });   // desktop and the Mobile V2 phone panel (both pass effectsRoot); the 600-899px panel is unchanged
    gradientGroup(root, "Gradient fill", { read, write });
  }

  // Living Fire (V3): the style first - choosing one starts from that style's own V3 tuning - then the engine's real controls. The letters keep this text's font.
  function livingFireGroup(root, { read = payloadOf, write = patchAll } = {}) {
    const defaults = createFire("organic");
    const value = (name, fallback) => element => read(element).fire?.[name] ?? fallback;
    const set = name => next => write({ fire: { ...defaults, ...(read(selectedElements()[0]).fire ?? {}), [name]: next } });
    const select = (label, name, options, key) => selectField({ label, options: Object.entries(options).map(([option, text]) => ({ value: option, label: text })), get: value(name, defaults[name]), set: set(name), key });
    root.append(optionalGroup({ label: "Living Fire", key: "fire", get: element => read(element).fire, defaults, write, build: box => {
      box.append(selectField({ label: "Style", options: FIRE_STYLES.map(style => ({ value: style, label: FIRE_STYLE_LABELS[style] })), get: value("style", "organic"),
        set: style => write({ fire: { ...defaults, ...(read(selectedElements()[0]).fire ?? {}), style, ...FIRE_STYLE_DEFAULTS[style] } }), key: "fireStyle" }));
      box.append(numberSlider({ label: "Intensity %", min: Math.round(FIRE_LIMITS.intensity[0] * 100), max: Math.round(FIRE_LIMITS.intensity[1] * 100), step: 1, get: element => Math.round(value("intensity", 1)(element) * 100), set: next => set("intensity")(next / 100), key: "fireIntensity" }));
      box.append(numberSlider({ label: "Speed ×", min: FIRE_LIMITS.speed[0], max: FIRE_LIMITS.speed[1], step: 0.05, get: value("speed", 1), set: set("speed"), key: "fireSpeed" }));
      box.append(numberSlider({ label: "Turbulence %", min: Math.round(FIRE_LIMITS.turbulence[0] * 100), max: Math.round(FIRE_LIMITS.turbulence[1] * 100), step: 1, get: element => Math.round(value("turbulence", 0.9)(element) * 100), set: next => set("turbulence")(next / 100), key: "fireTurbulence" }));
      box.append(select("Colour", "color", { natural: "Natural combustion", crimson: "Deep crimson", blue: "Blue flame" }, "fireColor"));
      box.append(select("Flames", "mode", { full: "Full fire", letters: "Letters only" }, "fireMode"));
      box.append(h("div", { class: "ed-btn-row" }, toggleButton({ label: "Sparks", get: element => value("sparks", false)(element) === true, set: on => set("sparks")(on), key: "fireSparks" })));
      const fit = h("p", { class: "ed-hint", role: "status" });
      syncers.push(targets => { fit.hidden = targets.every(element => fireTextFits(read(element).text)); fit.textContent = `Living Fire draws up to ${FIRE_LIMITS.maxText} characters; this text is longer, so it shows a still fire colour instead.`; });
      box.append(fit, h("p", { class: "ed-hint", text: `Drawn in this text's own font, on the same lines as the text. Up to ${FIRE_LIVE_LIMIT} fire texts move at once (fewer on slower devices); the rest show a still flame. Devices that cannot draw it, and visitors who prefer reduced motion, see a still version.` }));
    } }));
  }

  // "Other" link: the address this text opens on the Wall (a new tab). Checked with the same rule the database applies before it is stored; a refused address leaves
  // the saved one unchanged. Remove link turns it back into ordinary text.
  function linkControls(root) {
    const input = h("input", { class: "ed-text-line", type: "url", inputmode: "url", autocomplete: "off", spellcheck: "false", maxlength: LINK_MAX, "aria-label": "Destination URL" });
    const status = h("p", { class: "ed-media-msg", role: "status", hidden: true });
    const current = () => selectedElements()[0]?.payload.link?.url ?? "";
    const commit = () => {
      if (input.value.trim() === current()) { status.hidden = true; return; }
      const link = normalizeLinkInput(input.value);
      if (!link.ok) { status.hidden = false; status.textContent = `${LINK_PROBLEMS[link.reason]} The link still opens ${current()}.`; return; }
      status.hidden = true;
      const applied = exec(patchAll({ link: { url: link.url } }));
      if (applied.ok) input.value = link.url;
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); commit(); } });
    syncers.push(targets => { if (document.activeElement !== input) input.value = targets[0].payload.link?.url ?? ""; });
    root.append(h("div", { class: "ed-group-title", text: "Link" }),
      h("label", { class: "ed-stack" }, h("span", { text: "Destination URL" }), input), status,
      h("p", { class: "ed-hint", text: "Visitors tap the text to open this address in a new tab. Only https:// or http:// addresses." }),
      h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Remove link", onclick: () => exec(patchAll({ link: undefined })) })));
  }

  function gradientGroup(root, label, { read = payloadOf, write = patchAll } = {}) {
    const defaults = { from: "#62e7ff", to: "#8b5dff", angle: 90 };
    const nested = (key, name, fallback) => element => (read(element)[key] ?? { [name]: fallback })[name];
    const setNested = (key, name, defaults) => value => write({ [key]: { ...defaults, ...(read(selectedElements()[0])[key] ?? {}), [name]: value } });
    root.append(optionalGroup({ label, key: "gradient", get: element => read(element).gradient, defaults, write, build: box => {
      box.append(colorField({ label: "From", get: nested("gradient", "from", defaults.from), set: setNested("gradient", "from", defaults), key: "gradFrom" }));
      box.append(colorField({ label: "To", get: nested("gradient", "to", defaults.to), set: setNested("gradient", "to", defaults), key: "gradTo" }));
      box.append(numberSlider({ label: "Angle", min: 0, max: 360, step: 1, get: nested("gradient", "angle", 90), set: setNested("gradient", "angle", defaults), key: "gradAngle" }));
    } }));
  }

  // radius: false when the desktop accordion shows Corner radius in Shape & Geometry instead (titled: false drops the "Style" title there)
  function shapeControls(root, { titled = true, radius = true } = {}) {
    if (titled) root.append(h("div", { class: "ed-group-title", text: "Style" }));
    root.append(colorField({ label: "Fill", get: element => element.payload.fill, set: value => patchAll({ fill: value }), key: "fill" }));
    gradientGroup(root, "Gradient");
    root.append(numberSlider({ label: "Opacity %", min: 0, max: 100, step: 1, get: element => Math.round((element.payload.opacity ?? 1) * 100), set: value => patchAll({ opacity: value === 100 ? undefined : value / 100 }), key: "opacity" }));
    root.append(optionalGroupBorder());
    if (radius) root.append(cornerRadius());
  }
  const cornerRadius = () => numberSlider({ label: "Corner radius", min: 0, max: 1000, sliderMax: 300, step: 1, get: element => element.payload.radius ?? 0, set: value => patchAll({ radius: value === 0 ? undefined : value }), key: "radius" });

  // Shapes V2 (desktop): Shape type, its Smart Shape numbers, Corner radius for the classic shapes, Edit points for a freeform shape
  function shapeGeometryControls(root, targets) {
    const first = targets[0], allCustom = targets.every(item => item.payload.shape === "custom");
    if (allCustom && targets.length === 1) {
      const path = first.payload.path;
      root.append(h("p", { class: "ed-hint", text: `Freeform shape: ${path.points.length} points, ${path.closed ? "closed" : "open (a line)"}.` }),
        h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn ed-primary", type: "button", text: "Edit points", onclick: () => onEditPoints(first.id) })),
        h("p", { class: "ed-hint", text: "Drag a point or its curve handles, add or delete points, or switch a point between smooth and corner. You can also double-click the shape. While editing points the element itself does not move; press Done (or Esc) to move and resize it again." }));
      return;
    }
    if (targets.some(item => item.payload.shape === "custom")) { root.append(h("p", { class: "ed-hint", text: "A freeform shape keeps its own drawn shape." })); return; }
    const select = h("select");
    for (const category of SHAPE_CATEGORIES) {
      const group = h("optgroup", { label: category });
      for (const item of SHAPE_LIBRARY.filter(entry => entry.category === category)) group.append(h("option", { value: item.id, text: item.label }));
      select.append(group);
    }
    const tuned = h("option", { value: "", text: "Tuned shape", disabled: true });
    select.prepend(tuned);
    select.addEventListener("change", () => {
      const item = SHAPE_LIBRARY.find(entry => entry.id === select.value);
      if (!item) return;
      const classic = { rect: undefined, rounded: 48, circle: 1000 };
      exec(patchAll({ shape: item.shape ?? undefined, params: item.params ? { ...item.params } : undefined, ...(item.shape ? {} : { radius: classic[item.id] }) }));
    });
    syncers.push(current => { const ids = new Set(current.map(item => libraryIdOf(item.payload))); select.value = ids.size === 1 && [...ids][0] ? [...ids][0] : ""; });
    root.append(field("Shape type", select));
    const shapes = new Set(targets.map(item => item.payload.shape ?? null));
    if (shapes.size !== 1) return;
    const shape = [...shapes][0];
    if (!shape) { root.append(cornerRadius()); return; }
    for (const key of Object.keys(SHAPES[shape] ?? {})) {
      const rule = SHAPE_PARAMS[key], percent = !rule.integer;
      const setParam = value => ops.updatePayloadMany(session.doc, session.state.selection, { params: { ...(selectedElements()[0].payload.params ?? {}), [key]: value } });
      root.append(numberSlider({ label: percent ? `${rule.label} %` : rule.label, min: percent ? Math.round(rule.min * 100) : rule.min, max: percent ? Math.round(rule.max * 100) : rule.max, step: 1,
        get: item => { const value = shapeParam(item.payload, key); return percent ? Math.round(value * 100) : value; }, set: value => setParam(percent ? value / 100 : Math.round(value)), key: `shape-${key}` }));
    }
  }

  // Lock aspect ratio (shapes): on = the ratio the box has now is kept by dragging, Width and Height; off = free
  function lockAspectControl() {
    const box = h("input", { type: "checkbox" });
    box.addEventListener("change", () => {
      let result = { ok: true, doc: session.doc };
      for (const item of selectedElements()) {
        if (!result.ok) break;
        const ratio = Math.min(SHAPE_LIMITS.aspect[1], Math.max(SHAPE_LIMITS.aspect[0], Math.round((item.width / item.height) * 1000) / 1000));
        result = ops.updatePayloadMany(result.doc, [item.id], { lockAspect: box.checked ? ratio : undefined });
      }
      exec(result);
    });
    syncers.push(targets => { box.checked = targets.every(item => typeof item.payload.lockAspect === "number"); });
    return h("div", {}, field("Lock aspect ratio", box), h("p", { class: "ed-hint", text: "On: dragging a handle, Width and Height all keep the current proportions. Off: stretch freely." }));
  }
  function optionalGroupBorder() {
    const wrap = h("div");
    const checkbox = h("input", { type: "checkbox" });
    const inner = h("div");
    checkbox.addEventListener("change", () => exec(patchAll(checkbox.checked ? { stroke: "#ffffff", strokeWidth: 4 } : { stroke: undefined, strokeWidth: undefined })));
    syncers.push(targets => { const on = targets[0].payload.stroke !== undefined; checkbox.checked = on; inner.hidden = !on; });
    inner.append(colorField({ label: "Border colour", get: element => element.payload.stroke ?? "#ffffff", set: value => patchAll({ stroke: value }), key: "stroke" }));
    inner.append(numberSlider({ label: "Border width", min: 0, max: 100, sliderMax: 40, step: 0.5, get: element => element.payload.strokeWidth ?? 0, set: value => patchAll({ strokeWidth: value }), key: "strokeWidth" }));
    wrap.append(field("Border", checkbox), inner);
    return wrap;
  }

  function textInput({ label, get, set, key, max }) {
    const input = h("input", { type: "text", maxlength: max, autocomplete: "off" });
    input.addEventListener("input", () => exec(set(input.value), { coalesce: key }));
    input.addEventListener("blur", () => { input.value = get(selectedElements()[0]) ?? ""; showErrors([]); });
    syncers.push(targets => { if (document.activeElement !== input) input.value = get(targets[0]) ?? ""; });
    return field(label, input);
  }

  // ---- Artwork (Round 3) --------------------------------------------------------------------------------------------------------------------------------
  // Sections with progressive disclosure (<details>): Artwork and Appearance open, the rest one tap away. Every control writes typed values through ops (validated,
  // one undo step per gesture). The picture file itself is never changed: crop, mask, split and effects are all non-destructive.
  const section = (root, label, open = false) => {
    const details = h("details", { class: "ed-props-section" });
    details.open = open;
    details.dataset.section = label;
    const inner = h("div");
    details.append(h("summary", { text: label }), inner);
    root.append(details);
    return inner;
  };
  const effectsOf = look => look.effects ?? {};
  // one effect key -> the whole (validated) effects object; the default value removes the key, an empty object removes `effects`
  const withEffect = (look, key, value) => {
    const effects = { ...effectsOf(look) };
    if (value === undefined) delete effects[key]; else effects[key] = value;
    return Object.keys(effects).length ? effects : undefined;
  };

  // The shared LOOK controls (an artwork, or the live GamID avatar): backing, mask, corner radius, opacity, blend, effects.
  function lookControls(root, { read, write, maskSection, appearanceSection, effectsSection }) {
    maskSection.append(selectField({ label: "Mask", options: [{ value: "", label: "None" }, ...MASKS.map(value => ({ value, label: MASK_LABELS[value] }))], get: element => read(element).mask ?? "", set: value => write({ mask: value || undefined }), key: "artMask" }));
    maskSection.append(numberSlider({ label: "Corner radius", min: 0, max: 1000, sliderMax: 300, step: 1, get: element => read(element).radius ?? 0, set: value => write({ radius: value === 0 ? undefined : value }), key: "artRadius" }));
    maskSection.append(h("p", { class: "ed-hint", text: "A mask only hides parts of the picture while it is shown. The picture itself is never changed." }));

    appearanceSection.append(numberSlider({ label: "Opacity %", min: 0, max: 100, step: 1, get: element => Math.round((read(element).opacity ?? 1) * 100), set: value => write({ opacity: value / 100 }), key: "artOpacity" }));
    appearanceSection.append(selectField({ label: "Blend", options: BLENDS.map(value => ({ value, label: BLEND_LABELS[value] })), get: element => read(element).blend ?? "normal", set: value => write({ blend: value === "normal" ? undefined : value }), key: "artBlend" }));
    const backingColour = colorField({ label: "Backing colour", get: element => (isHexColour(read(element).backdrop) ? read(element).backdrop : "#14101f"), set: value => write({ backdrop: value }), key: "artBackdropColour" });
    appearanceSection.append(selectField({ label: "Backing", options: [{ value: "none", label: "None (transparent)" }, { value: "colour", label: "Colour" }],
      get: element => (read(element).backdrop === "none" ? "none" : "colour"), set: value => write({ backdrop: value === "none" ? "none" : (isHexColour(read(selectedElements()[0]).backdrop) ? read(selectedElements()[0]).backdrop : "#14101f") }), key: "artBackdrop",
      extra: () => "Colour" }), backingColour);
    syncers.push(targets => { backingColour.hidden = read(targets[0]).backdrop === "none"; });

    const effect = key => element => effectsOf(read(element))[key];
    const setEffect = (key, value) => write({ effects: withEffect(read(selectedElements()[0]), key, value) });
    const shadowDefaults = { color: "#000000", blur: 24, x: 0, y: 12 }, glowDefaults = { color: "#62e7ff", blur: 30 };
    const nestedEffect = (key, name, defaults) => ({ get: element => (effect(key)(element) ?? defaults)[name], set: value => setEffect(key, { ...defaults, ...(effect(key)(selectedElements()[0]) ?? {}), [name]: value }) });
    effectsSection.append(optionalGroup({ label: "Shadow", key: "effects", get: effect("shadow"), defaults: null, write: patch => setEffect("shadow", patch.effects === undefined ? undefined : shadowDefaults), build: box => {
      box.append(colorField({ label: "Colour", ...nestedEffect("shadow", "color", shadowDefaults), key: "fxShadowColor" }));
      box.append(numberSlider({ label: "Blur", min: 0, max: 100, step: 1, ...nestedEffect("shadow", "blur", shadowDefaults), key: "fxShadowBlur" }));
      box.append(numberSlider({ label: "Offset X", min: -100, max: 100, step: 1, ...nestedEffect("shadow", "x", shadowDefaults), key: "fxShadowX" }));
      box.append(numberSlider({ label: "Offset Y", min: -100, max: 100, step: 1, ...nestedEffect("shadow", "y", shadowDefaults), key: "fxShadowY" }));
    } }));
    effectsSection.append(optionalGroup({ label: "Glow", key: "effects", get: effect("glow"), defaults: null, write: patch => setEffect("glow", patch.effects === undefined ? undefined : glowDefaults), build: box => {
      box.append(colorField({ label: "Colour", ...nestedEffect("glow", "color", glowDefaults), key: "fxGlowColor" }));
      box.append(numberSlider({ label: "Size", min: 0, max: 100, step: 1, ...nestedEffect("glow", "blur", glowDefaults), key: "fxGlowBlur" }));
    } }));
    const [blurMin, blurMax] = EFFECT_LIMITS.blur;
    effectsSection.append(numberSlider({ label: "Soften (blur)", min: blurMin, max: blurMax, step: 0.5, get: element => effect("blur")(element) ?? 0, set: value => setEffect("blur", value === 0 ? undefined : value), key: "fxBlur" }));
    for (const [key, label] of [["brightness", "Brightness %"], ["contrast", "Contrast %"], ["saturation", "Saturation %"]]) {
      const [min, max] = EFFECT_LIMITS[key];
      effectsSection.append(numberSlider({ label, min: min * 100, max: max * 100, step: 1, get: element => Math.round((effect(key)(element) ?? 1) * 100), set: value => setEffect(key, value === 100 ? undefined : Math.round(value) / 100), key: `fx-${key}` }));
    }
    effectsSection.append(h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Reset effects", onclick: () => exec(write({ effects: undefined })) })));
  }

  // Flip + edge fade (media layers - picture, GIF and video alike): a mirror of what is drawn and a transparency fade at the left / right edges. Never baked in.
  function flipFadeControls(root) {
    const flip = (label, key) => toggleButton({ label, get: item => item.payload[key] === true, set: on => patchAll({ [key]: on ? true : undefined }), key: `art-${key}` });
    root.append(h("div", { class: "ed-btn-row", role: "group", "aria-label": "Flip" }, flip("Flip horizontal", "flipX"), flip("Flip vertical", "flipY")));
    const fadeOf = item => item.payload.fade ?? {};
    const setFade = (side, value) => {
      const fade = { ...fadeOf(selectedElements()[0]) };
      if (value > 0) fade[side] = value; else delete fade[side];
      return patchAll({ fade: Object.keys(fade).length ? fade : undefined });
    };
    root.append(numberSlider({ label: "Fade left %", min: 0, max: FADE_MAX, step: 1, get: item => fadeOf(item).left ?? 0, set: value => setFade("left", value), key: "artFadeLeft" }));
    root.append(numberSlider({ label: "Fade right %", min: 0, max: FADE_MAX, step: 1, get: item => fadeOf(item).right ?? 0, set: value => setFade("right", value), key: "artFadeRight" }));
    root.append(h("p", { class: "ed-hint", text: "Fade: how much of the left / right edge melts into transparency. Flip and fade only change how it is shown - your file is never changed." }));
  }

  function imageControls(root, targets) {
    const element = targets[0];
    const pieces = element.payload.slice ? ops.splitPieces(session.doc, element.id) : [];
    const read = payloadOf, write = patchAll;
    const video = targets.some(item => item.payload.media === "video");
    const art = section(root, "Artwork", true);
    if (video && targets.every(item => item.payload.media === "video")) art.parentElement.querySelector("summary").textContent = "Video";
    if (video) art.append(h("p", { class: "ed-hint", text: "Plays muted and on a loop, right on your Wall. A WebM made with transparency (alpha) shows what is behind it; an MP4 always has a solid picture." }));
    art.append(selectField({ label: "Fit", options: [{ value: "cover", label: "Fill the box (crop)" }, { value: "contain", label: video ? "Show whole video" : "Show whole picture" }, { value: "fill", label: "Stretch" }], get: item => item.payload.fit, set: value => patchAll({ fit: value }), key: "imgFit" }));
    art.append(numberSlider({ label: "Position X %", min: 0, max: 100, step: 1, get: item => item.payload.posX, set: value => patchAll({ posX: value }), key: "imgX" }));
    art.append(numberSlider({ label: "Position Y %", min: 0, max: 100, step: 1, get: item => item.payload.posY, set: value => patchAll({ posY: value }), key: "imgY" }));
    art.append(textInput({ label: "Description", max: ALT_MAX, get: item => item.payload.alt ?? "", set: value => patchAll({ alt: value === "" ? undefined : value }), key: "imgAlt" }));
    art.append(h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Original proportions", onclick: () => {
      const current = selectedElements()[0];
      const size = sourceSize(current);
      if (!size) return;
      exec(ops.updateGeometry(session.doc, current.id, { height: Math.max(10, Math.round(current.width * size.ah / size.aw)) }));
    } })));

    const crop = section(root, "Crop");
    if (targets.length === 1 && !element.payload.slice) cropControls(crop, element);
    else crop.append(h("p", { class: "ed-hint", text: element.payload.slice ? "Remove the split to change the crop (every piece shows the same crop)." : "Select one artwork to crop it." }));

    const mask = section(root, "Mask");
    const split = section(root, "Split");
    if (video) split.append(h("p", { class: "ed-hint", text: "A video can't be split (its pieces would play out of step). Split works on pictures and GIFs." }));
    else splitControls(split, targets, pieces);
    const appearance = section(root, "Appearance", true);
    const effects = section(root, "Effects");
    lookControls(root, { read, write, maskSection: mask, appearanceSection: appearance, effectsSection: effects });
    flipFadeControls(appearance);

    const layering = section(root, "Layering", true);
    layering.append(h("div", { class: "ed-btn-row" },
      toggleButton({ label: "Lock position", get: item => item.payload.locked === true, set: on => patchAll({ locked: on ? true : undefined }), key: "artLock" }),
      toggleButton({ label: "Click-through", get: item => item.payload.clickThrough === true, set: on => patchAll({ clickThrough: on ? true : undefined }), key: "artClick" })));
    layering.append(h("p", { class: "ed-hint", text: "Locked: stays put on the canvas (still selectable here and in Layers). Click-through: taps on the canvas reach what is beneath; select it from Layers." }));
    layering.append(h("p", { class: "ed-hint", text: "Forward / Backward / To front / To back are under Arrange; you can also drag rows in Layout > Layers." }));
  }
  const sourceSize = item => (item.payload.aw && item.payload.ah ? { aw: item.payload.aw, ah: item.payload.ah } : (() => { const size = assets?.dimensionsOf(item.payload.assetId); return size ? { aw: size.width, ah: size.height } : null; })());

  // Crop: a preset, zoom and focal point, plus a small picture of the WHOLE source with the crop window on it - drag the window to reposition. Reset removes the crop.
  function cropControls(root, element) {
    const size = sourceSize(element);
    if (!size) { root.append(h("p", { class: "ed-hint", text: "Loading the picture's size… open this section again in a moment." })); return; }
    const current = () => selectedElements()[0]?.payload.crop ?? null;
    const state = () => {
      const crop = current();
      if (!crop) return { preset: "", zoom: 1, focusX: 50, focusY: 50 };
      const box = selectedElements()[0];
      const base = cropFor(crop.preset, { ...size, ratio: box.width / box.height });
      return { preset: crop.preset, zoom: Math.max(1, Math.round((base.w / crop.w) * 100) / 100), focusX: Math.round((crop.x + crop.w / 2) * 100), focusY: Math.round((crop.y + crop.h / 2) * 100) };
    };
    const apply = patch => {
      const box = selectedElements()[0];
      const next = { ...state(), ...patch };
      if (!next.preset) return ops.setCrop(session.doc, box.id, null, size);
      return ops.setCrop(session.doc, box.id, cropFor(next.preset, { ...size, zoom: next.zoom, focusX: next.focusX, focusY: next.focusY, ratio: box.width / box.height }), size);
    };
    root.append(selectField({ label: "Crop", options: [{ value: "", label: "No crop" }, ...CROP_PRESETS.map(value => ({ value, label: CROP_LABELS[value] }))], get: () => state().preset, set: value => apply({ preset: value, zoom: 1 }), key: "cropPreset" }));
    const detail = h("div");
    detail.append(numberSlider({ label: "Zoom ×", min: 1, max: 8, step: 0.05, get: () => state().zoom, set: value => apply({ zoom: value }), key: "cropZoom" }));
    detail.append(numberSlider({ label: "Focus X %", min: 0, max: 100, step: 1, get: () => state().focusX, set: value => apply({ focusX: value }), key: "cropFx" }));
    detail.append(numberSlider({ label: "Focus Y %", min: 0, max: 100, step: 1, get: () => state().focusY, set: value => apply({ focusY: value }), key: "cropFy" }));
    const url = assets?.urlFor?.(element.payload.assetId);
    if (url) {
      const pad = h("div", { class: "ed-crop-pad", "aria-label": "Drag the window to reposition the crop" });
      pad.append(h("img", { src: url, alt: "", draggable: "false" }));
      const frame = h("div", { class: "ed-crop-rect" });
      pad.append(frame);
      syncers.push(() => {
        const crop = current();
        frame.hidden = !crop;
        if (crop) for (const [name, value] of [["left", crop.x], ["top", crop.y], ["width", crop.w], ["height", crop.h]]) frame.style.setProperty(name, `${Math.round(value * 10000) / 100}%`);
      });
      let drag = null;
      frame.addEventListener("pointerdown", event => { const crop = current(); if (!crop) return; event.preventDefault(); drag = { x: event.clientX, y: event.clientY, crop, rect: pad.getBoundingClientRect() }; frame.setPointerCapture?.(event.pointerId); });
      frame.addEventListener("pointermove", event => {
        if (!drag) return;
        const { crop, rect } = drag;
        const x = Math.min(1 - crop.w, Math.max(0, crop.x + (event.clientX - drag.x) / rect.width));
        const y = Math.min(1 - crop.h, Math.max(0, crop.y + (event.clientY - drag.y) / rect.height));
        const round = value => Math.round(value * 10000) / 10000;
        exec(ops.setCrop(session.doc, session.state.selection[0], { ...crop, x: round(x), y: round(y) }, size), { coalesce: "cropDrag" });
      });
      const stop = () => { drag = null; };
      frame.addEventListener("pointerup", stop);
      frame.addEventListener("pointercancel", stop);
      detail.append(pad);
    }
    detail.append(h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Reset crop", onclick: () => exec(ops.setCrop(session.doc, session.state.selection[0], null, size)) })));
    syncers.push(() => { detail.hidden = !current(); });
    root.append(detail);
  }

  function splitControls(root, targets, pieces) {
    const element = targets[0];
    if (pieces.length) {
      const whole = pieces.length === targets.length && pieces.every(piece => targets.includes(piece));
      root.append(h("p", { class: "ed-hint", text: `Split into ${pieces.length} ${element.payload.slice.dir === "h" ? "horizontal" : "vertical"} pieces of one picture - a GIF plays as one animation across them.` }));
      if (whole) root.append(h("p", { class: "ed-hint", text: "Drag the boundary lines on the canvas to change where it is cut. Ungroup to move, layer or send pieces to another stage on their own." }));
      root.append(h("div", { class: "ed-btn-row" },
        h("button", { class: "ed-btn", type: "button", text: "Equal pieces again", onclick: () => exec(ops.resetSplit(session.doc, element.id), { keepResultSelection: true }) }),
        h("button", { class: "ed-btn", type: "button", text: "Remove split", onclick: () => exec(ops.removeSplit(session.doc, element.id), { keepResultSelection: true }) })));
      // Split hardening: WHERE a piece is and WHICH PART it shows are separate - with the scale preserved, resizing a piece shows more / less of the picture
      root.append(h("div", { class: "ed-btn-row" }, toggleButton({ label: "Preserve source scale", get: item => !!item.payload.slice?.scale, set: on => ops.setSplitScaleLock(session.doc, session.state.selection, on), key: "splitScale" })));
      root.append(h("p", { class: "ed-hint", text: "On (recommended): moving or resizing a piece never zooms or stretches the picture - resizing shows more or less of it. Off: the picture stretches with the piece's box." }));
      return;
    }
    if (targets.length !== 1) { root.append(h("p", { class: "ed-hint", text: "Select one artwork to split it." })); return; }
    const count = h("select", { "aria-label": "Pieces" });
    for (const n of SPLIT_COUNTS) count.append(h("option", { value: String(n), text: `${n} pieces` }));
    const dir = h("select", { "aria-label": "Direction" });
    for (const [value, label] of [["v", "Side by side (vertical cuts)"], ["h", "Stacked (horizontal cuts)"]]) dir.append(h("option", { value, text: label }));
    root.append(field("Pieces", count), field("Cut", dir));
    root.append(h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Split", onclick: () => exec(ops.splitArtwork(session.doc, session.state.selection[0], Number(count.value), dir.value), { keepResultSelection: true }) })));
    root.append(h("p", { class: "ed-hint", text: "Nothing is cut out of your picture: each piece shows its part, and you can change, reset or remove the split any time." }));
  }

  // ---- live GamID Data (Round 3) ----------------------------------------------------------------------------------------------------------------------------
  function dataControls(root, targets) {
    const element = targets[0];
    const field = element.payload.field;
    const info = DATA_FIELD_INFO[field];
    const status = h("p", { class: "ed-hint", role: "status" });
    const sectionLabel = field === "section" ? getGamid()?.sections?.find(section => section.key === element.payload.section)?.label : null;   // a Classic section names itself
    root.append(h("div", { class: "ed-group-title", text: `GamID data · ${sectionLabel ?? info?.label ?? field}` }),
      h("p", { class: "ed-hint", text: "Live: this shows your GamID as it is now and updates with it. Visitors only ever see what your GamID shows publicly." }), status);
    syncers.push(items => {
      const resolved = resolveGamidData(renderGamidDataPayload(items[0].payload), getGamid(), "edit");
      status.textContent = resolved.state === "missing" ? resolved.message : resolved.private ? "Private right now: visitors will not see this until it is public on your GamID." : "";
    });
    if (targets.length === 1 && (DATA_ITEMS.includes(field) || isSectionItem(element.payload))) root.append(dataPicker(element));
    if (field === "connection") root.append(h("div", { class: "ed-btn-row" }, toggleButton({ label: "Show the platform name", get: item => item.payload.withLabel !== false, set: on => patchAll({ withLabel: on ? undefined : false }), key: "dataWithLabel" })));
    // Display Style (desktop, 900px and wider): for a Classic section whose items are games with Classic artwork (Favorite Games), each element chooses Names Only
    // (the default - no key is stored, so existing elements are unchanged) or Game Covers. Only the payload changes: never the box, rotation or style.
    const gameArt = field === "section" && getGamid()?.sections?.find(section => section.key === element.payload.section)?.artwork === "game";
    if (gameArt && desktopProps?.matches && targets.every(item => item.payload.field === "section" && item.payload.section === element.payload.section)) {
      root.append(selectField({ label: "Display Style", options: [{ value: "names", label: "Names Only" }, { value: "covers", label: "Game Covers" }],
        get: item => (item.payload.display === "covers" ? "covers" : "names"), set: value => patchAll({ display: value === "covers" ? "covers" : undefined }), key: "dataDisplay" }));
    }
    root.append(h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Refresh GamID data", onclick: () => refreshGamid() })));
    if (isDataText(element.payload)) {
      if (new Set(targets.map(item => item.payload.field)).size !== 1 || !targets.every(item => isDataText(item.payload))) return;
      const read = item => dataTextStyle(item.payload.field, item.payload.text);
      const write = patch => {
        let current = session.doc;
        for (const id of session.state.selection) {
          const found = ops.locate(current, id);
          if (!found || found.element.type !== "gamidData") continue;
          const text = { ...dataTextStyle(found.element.payload.field, found.element.payload.text) };
          for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete text[key]; else text[key] = value; }
          const result = ops.updatePayload(current, id, { text });
          if (!result.ok) return result;
          current = result.doc;
        }
        return { ok: true, doc: current };
      };
      textControls(root, { read, write, content: false });
    } else if (field === "avatar") {
      const read = item => item.payload.look ?? { backdrop: "none" };
      const write = patch => {
        let current = session.doc;
        for (const id of session.state.selection) {
          const found = ops.locate(current, id);
          if (!found || found.element.payload.field !== "avatar") continue;
          const look = { backdrop: "none", ...(found.element.payload.look ?? {}) };
          for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete look[key]; else look[key] = value; }
          const result = ops.updatePayload(current, id, { look });
          if (!result.ok) return result;
          current = result.doc;
        }
        return { ok: true, doc: current };
      };
      lookControls(root, { read, write, maskSection: section(root, "Mask", true), appearanceSection: section(root, "Appearance", true), effectsSection: section(root, "Effects") });
    } else if (isDataCollection(element.payload)) {
      root.append(selectField({ label: "Layout", options: GAMID_LAYOUTS.map(value => ({ value, label: value === "card" ? "Card" : "Compact" })), get: item => item.payload.layout ?? "card", set: value => patchAll({ layout: value }), key: "dataLayout" }));
      if (field === "games") {
        root.append(numberSlider({ label: "Shown first", min: GAMES_INITIAL.min, max: GAMES_INITIAL.max, step: 1, get: item => item.payload.initial ?? GAMES_INITIAL.default, set: value => patchAll({ initial: Math.round(value) }), key: "dataInitial" }));
        root.append(h("div", { class: "ed-btn-row" }, toggleButton({ label: "Show hours played", get: item => item.payload.showPlaytime === true, set: on => patchAll({ showPlaytime: on ? true : undefined }), key: "dataHours" })));
      }
      gamidStyleControls(root, element);
    }
  }
  // The single-item picker: ONLY the owner's own real roles / games / connections (from the loaded GamID snapshot) - nothing can be typed in.
  function dataPicker(element) {
    const field = element.payload.field;
    const snapshot = getGamid();
    const select = h("select", { "aria-label": "Which one" });
    const options = [];
    // a Classic section item (My Gamer Data): the items of that section the server returned for the owner - bound by their stable id (`item`, not `ref`)
    const section = field === "section" ? snapshot?.sections?.find(candidate => candidate.key === element.payload.section) : null;
    const key = field === "section" ? "item" : "ref";
    if (field === "section") {
      for (const item of section?.items ?? []) options.push({ value: item.id, label: item.label });
    } else if (field === "role") {
      options.push({ value: "@primary", label: "My primary role (follows my GamID)" });
      for (const role of snapshot?.roles ?? []) options.push({ value: role.key, label: role.label });
    } else if (field === "game") {
      const seen = new Set();
      for (const game of snapshot?.games?.items ?? []) if (game.ref && !seen.has(game.ref)) { seen.add(game.ref); options.push({ value: game.ref, label: game.refName || game.name }); }
    } else for (const connection of snapshot?.connections ?? []) options.push({ value: connection.key, label: `${connection.label} · ${connection.name}` });
    const currentRef = element.payload[key];
    if (currentRef && !options.some(option => option.value === currentRef)) options.unshift({ value: currentRef, label: "(no longer available)" });
    for (const option of options) select.append(h("option", { value: option.value, text: option.label }));
    select.addEventListener("change", () => exec(patchAll({ [key]: select.value }), { coalesce: "dataRef" }));
    syncers.push(targets => { select.value = targets[0].payload[key] ?? ""; });
    return h("label", { class: "ed-field" }, h("span", { text: field === "section" ? (section?.itemLabel ?? "Item") : field === "role" ? "Role" : field === "game" ? "Game" : "Connection" }), h("div", { class: "ed-inline" }, select));
  }
  function embedControls(root) {
    const element = selectedElements()[0];
    const provider = PROVIDERS.get(element.payload.providerKey);
    const kind = provider?.kinds[element.payload.data?.kind];
    root.append(h("div", { class: "ed-group-title", text: "Link / Embed" }));
    root.append(h("p", { class: "ed-hint", text: `${provider?.label ?? "Link"} · ${kind?.label ?? ""}. Nothing loads from ${provider?.label ?? "the provider"} while you edit; use Preview to try it.` }));
    // one operation: the data change and, for a player, the box refitted to the selected aspect (one undo step)
    const patchData = patch => ops.setEmbedData(session.doc, session.state.selection[0], patch);
    // Only the presentations this content honestly supports (a Player only where the provider has a working official player).
    const offered = kind ? presentationsFor(kind) : ["card", "link"];
    const presentations = ["card", "link", "embed", "icon"].filter(value => offered.includes(value)).map(value => ({ value, label: PRESENTATION_LABELS[value] }));
    root.append(selectField({ label: "Show as", options: presentations, get: item => item.payload.data.presentation, set: value => patchData({ presentation: value }), key: "embedShow" }));
    if (!kind?.inline) root.append(h("p", { class: "ed-hint", text: `${provider?.label ?? "This platform"} has no player for this content, so it opens on ${provider?.label ?? "the platform"} as ${offered.includes("card") ? "a Card, Link or Icon" : "a Link or Icon"}.` }));
    if (element.payload.data.presentation === "icon") root.append(h("p", { class: "ed-hint", text: `Shows the ${provider?.label ?? "platform"} icon; visitors tap it to open this link. To show several icons together, use Media & Links > Icon Group.` }));
    // Shape: a Player's own shapes from its adapter (never a copied list); a card keeps its own box, so it has no Shape.
    const shapes = (kind?.aspects ?? []).filter(value => value !== "auto");
    if (element.payload.data.presentation === "embed" && shapes.length > 1) root.append(selectField({ label: "Shape", options: shapes.map(value => ({ value, label: value })), get: item => item.payload.data.aspect ?? kind.aspect, set: value => patchData({ aspect: value === kind.aspect ? undefined : value }), key: "embedAspect" }));
    else if (element.payload.data.presentation === "embed" && shapes.length === 1) root.append(h("p", { class: "ed-hint", text: `Shape: ${shapes[0]} - set by ${provider?.label ?? "the provider"}'s player.` }));
    else if (element.payload.data.presentation === "embed") root.append(h("p", { class: "ed-hint", text: `${provider?.label ?? "This"} player sizes itself to its box.` }));
    root.append(textInput({ label: "Caption", max: 80, get: item => item.payload.data.caption ?? "", set: value => patchData({ caption: value === "" ? undefined : value }), key: "embedCaption" }));
    const descriptor = elementRegistry.get("embed").render(element.payload).content;
    if (descriptor && isAllowedOpenUrl(descriptor.providerKey, descriptor.openUrl)) {
      root.append(h("div", { class: "ed-btn-row" }, h("a", { class: "ed-btn", href: descriptor.openUrl, target: "_blank", rel: "noopener noreferrer nofollow", text: `Open on ${descriptor.providerLabel} ↗` })));
    }
  }

  // Icon Group (DEC-0006): the icons in the owner's order. Each row: its badge, its link (checked by the Wall link engine when it changes), move up / down, remove.
  // The list itself is rebuilt when icons are added, removed or reordered (the panel key below); a refused link leaves the saved one unchanged.
  // appearanceRoot: the desktop Icon Group accordion's Appearance & Spacing section; without it the size / spacing / align controls follow in the same panel.
  function iconsControls(root, { appearanceRoot = null } = {}) {
    const element = selectedElements()[0];
    const items = () => selectedElements()[0]?.payload.items ?? [];
    const setItems = next => exec(patchAll({ items: next }));
    root.append(h("div", { class: "ed-group-title", text: `Icons (${element.payload.items.length} of ${ICON_LIMITS.items})` }));
    const list = h("ol", { class: "ed-icon-list" });
    element.payload.items.forEach((item, index) => {
      const input = h("input", { class: "ed-text-line", type: "url", inputmode: "url", autocomplete: "off", spellcheck: "false", maxlength: LINK_MAX, "aria-label": `Link of icon ${index + 1}` });
      const status = h("p", { class: "ed-media-msg", role: "status", hidden: true });
      const commit = () => {
        const current = items()[index];
        if (!current || input.value.trim() === iconItemAddress(current)) { status.hidden = true; return; }
        const parsed = iconItemFromInput(input.value);
        if (!parsed.ok) { status.hidden = false; status.textContent = `${parsed.message} The icon still opens ${iconItemAddress(current)}.`; return; }
        status.hidden = true;
        setItems(items().map((value, i) => (i === index ? parsed.item : value)));
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); commit(); } });
      syncers.push(targets => { const current = targets[0].payload.items?.[index]; if (current && document.activeElement !== input) input.value = iconItemAddress(current); });
      const move = delta => { const next = [...items()]; const [moved] = next.splice(index, 1); next.splice(index + delta, 0, moved); setItems(next); };
      const resolved = resolveIconItem(item);
      list.append(h("li", { class: "ed-icon-item" },
        paintIconBadge(tag => document.createElement(tag), resolved, 32),
        h("div", { class: "ed-icon-link" }, input, status),
        h("div", { class: "ed-icon-actions" },
          h("button", { class: "ed-btn", type: "button", text: "↑", "aria-label": `Move icon ${index + 1} up`, disabled: index === 0, onclick: () => move(-1) }),
          h("button", { class: "ed-btn", type: "button", text: "↓", "aria-label": `Move icon ${index + 1} down`, disabled: index === element.payload.items.length - 1, onclick: () => move(1) }),
          h("button", { class: "ed-btn", type: "button", text: "✕", "aria-label": `Remove icon ${index + 1}`, disabled: element.payload.items.length === 1, onclick: () => setItems(items().filter((_, i) => i !== index)) }))));
    });
    root.append(list);
    if (element.payload.items.length < ICON_LIMITS.items) {
      const input = h("input", { class: "ed-text-line", type: "url", inputmode: "url", autocomplete: "off", spellcheck: "false", maxlength: LINK_MAX, placeholder: "Paste a link", "aria-label": "Link of a new icon" });
      const status = h("p", { class: "ed-media-msg", role: "status", hidden: true });
      const add = () => {
        const parsed = iconItemFromInput(input.value);
        if (!parsed.ok) { status.hidden = false; status.textContent = parsed.message; input.focus(); return; }
        const applied = setItems([...items(), parsed.item]);
        if (applied.ok) { input.value = ""; status.hidden = true; }
      };
      input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); add(); } });
      root.append(h("label", { class: "ed-stack" }, h("span", { text: "Add an icon" }), input), status,
        h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Add icon", onclick: add })));
    }
    root.append(h("p", { class: "ed-hint", text: "Any supported platform link shows that platform's icon; any other website shows a link icon. A group keeps at least one icon: to remove the last one, delete the element." }));
    if (appearanceRoot) root = appearanceRoot;
    root.append(numberSlider({ label: "Icon size", min: ICON_LIMITS.size[0], max: ICON_LIMITS.size[1], step: 1, get: item => item.payload.size ?? ICON_DEFAULTS.size, set: value => patchAll({ size: Math.round(value) }), key: "iconSize" }));
    root.append(numberSlider({ label: "Spacing", min: ICON_LIMITS.gap[0], max: ICON_LIMITS.gap[1], step: 1, get: item => item.payload.gap ?? ICON_DEFAULTS.gap, set: value => patchAll({ gap: Math.round(value) }), key: "iconGap" }));
    root.append(selectField({ label: "Align", options: ICON_ALIGNS.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })), get: item => item.payload.align ?? ICON_DEFAULTS.align, set: value => patchAll({ align: value }), key: "iconAlign" }));
    root.append(h("p", { class: "ed-hint", text: "Icons line up and wrap inside the box by themselves; when the box is too small, they all shrink together so none is cut off." }));
  }

  function gamidControls(root) {
    const element = selectedElements()[0];
    root.append(h("div", { class: "ed-group-title", text: "GamID block" }));
    root.append(h("p", { class: "ed-hint", text: "This block shows your real GamID data and updates with it. Private information stays private." }));
    root.append(selectField({ label: "Layout", options: GAMID_LAYOUTS.map(value => ({ value, label: value === "card" ? "Card" : "Compact" })), get: item => item.payload.layout ?? "card", set: value => patchAll({ layout: value }), key: "gamidLayout" }));
    if (element.payload.block === "games") {
      root.append(numberSlider({ label: "Shown first", min: GAMES_INITIAL.min, max: GAMES_INITIAL.max, step: 1, get: item => item.payload.initial ?? GAMES_INITIAL.default, set: value => patchAll({ initial: Math.round(value) }), key: "gamidInitial" }));
      root.append(h("div", { class: "ed-btn-row" }, toggleButton({ label: "Show hours played", get: item => item.payload.showPlaytime === true, set: on => patchAll({ showPlaytime: on ? true : undefined }), key: "gamidHours" })));
      root.append(h("p", { class: "ed-hint", text: "Hours are hidden unless you turn them on here AND your GamID playtime setting allows them." }));
    }
    root.append(h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Refresh GamID data", onclick: () => refreshGamid() })));
    gamidStyleControls(root, element);
  }

  // Round 2: presentation only. Every control writes typed values into the block's own `style` (ops.setGamidStyle - validated, one undo step per gesture); the data
  // shown never changes. Rows that only apply to one choice (gradient end colour, border details) are shown / hidden by their syncers, never rebuilt.
  function gamidStyleControls(root, element) {
    const style = item => resolveGamidStyle(item.payload.style);
    const setStyle = (key, value) => ops.setGamidStyle(session.doc, session.state.selection, { [key]: value });
    const when = (node, predicate) => { syncers.push(targets => { node.hidden = !predicate(style(targets[0])); }); return node; };
    const color = (label, key) => colorField({ label, get: item => style(item)[key], set: value => setStyle(key, value), key: `gs-${key}` });
    const percent = (label, key) => numberSlider({ label, min: 0, max: 100, step: 5, get: item => Math.round(style(item)[key] * 100), set: value => setStyle(key, Math.round(value) / 100), key: `gs-${key}` });
    const units = (label, key) => { const [min, max] = GAMID_STYLE_RANGES[key]; return numberSlider({ label, min, max, step: 1, get: item => style(item)[key], set: value => setStyle(key, Math.round(value)), key: `gs-${key}` }); };
    const choice = (label, key, labels) => selectField({ label, options: GAMID_STYLE_ENUMS[key].map(value => ({ value, label: labels[value] })), get: item => style(item)[key], set: value => setStyle(key, value), key: `gs-${key}` });

    root.append(h("div", { class: "ed-group-title", text: "Block style" }));
    root.append(h("p", { class: "ed-hint", text: "Changes how this block looks, never what it shows. Opacity applies to the background only - text stays fully readable. Trust labels keep their own colours." }));
    root.append(choice("Background", "bgMode", { solid: "Solid colour", gradient: "Gradient", none: "None (transparent)" }));
    root.append(when(color("Colour", "bgColor"), s => s.bgMode !== "none"));
    root.append(when(color("Gradient end", "bgColor2"), s => s.bgMode === "gradient"));
    root.append(when(units("Gradient angle °", "bgAngle"), s => s.bgMode === "gradient"));
    root.append(when(percent("Background opacity %", "bgOpacity"), s => s.bgMode !== "none"));
    root.append(h("div", { class: "ed-btn-row" }, toggleButton({ label: "Border", get: item => style(item).border, set: on => setStyle("border", on), key: "gs-border" })));
    root.append(when(color("Border colour", "borderColor"), s => s.border));
    root.append(when(percent("Border opacity %", "borderOpacity"), s => s.border));
    root.append(when(units("Border width", "borderWidth"), s => s.border));
    root.append(units("Corner radius", "radius"));
    root.append(color("Heading colour", "headingColor"), color("Primary text", "primaryColor"), color("Secondary text", "secondaryColor"), color("Accent", "accentColor"));
    root.append(choice("Chips / badges", "chipStyle", { outline: "Outline", filled: "Filled", plain: "Plain" }));
    root.append(choice("Rows", "rowStyle", { card: "Cards", plain: "Plain", divided: "Divided" }));
    if (element.payload.block === "profile") {
      root.append(choice("Avatar", "avatarShape", { circle: "Circle", rounded: "Rounded square", square: "Square" }));
      root.append(choice("Name size", "nameSize", { s: "Small", m: "Medium", l: "Large" }));
      root.append(h("div", { class: "ed-btn-row" }, toggleButton({ label: "Show @GamID", get: item => style(item).showHandle, set: on => setStyle("showHandle", on), key: "gs-showHandle" })));
    }
    root.append(units("Padding", "padding"), units("Spacing", "gap"));
    const status = h("p", { class: "ed-hint", role: "status" });
    const applyAll = () => {
      const result = exec(ops.applyGamidStyleToAll(session.doc, session.state.selection[0]));
      status.textContent = result.ok ? `Style applied to ${result.count} other GamID block${result.count === 1 ? "" : "s"}. Each one can still be changed on its own.` : "";
    };
    root.append(h("div", { class: "ed-btn-row" },
      h("button", { class: "ed-btn", type: "button", text: "Apply to all GamID blocks", onclick: applyAll }),
      h("button", { class: "ed-btn", type: "button", text: "Reset style", onclick: () => { status.textContent = ""; exec(patchAll({ style: undefined })); } })), status);
  }

  function geometryControls(root, { titled = true, afterSize = null } = {}) {
    if (titled) root.append(h("div", { class: "ed-group-title", text: "Position and size" }));
    const box = h("div");
    const numeric = (label, name) => {
      const input = h("input", { type: "number", step: 1, inputmode: "numeric" });
      input.addEventListener("change", () => exec(ops.updateGeometry(session.doc, session.state.selection[0], { [name]: input.value }), { coalesce: `geo-${name}` }));
      syncers.push(targets => { if (document.activeElement !== input) input.value = String(targets[0][name]); });
      return field(label, input);
    };
    box.append(numeric("X", "x"), numeric("Y", "y"), numeric("Width", "width"), numeric("Height", "height"));
    root.append(box);
    if (afterSize) root.append(afterSize);
    root.append(numberSlider({ label: "Rotation °", min: -180, max: 180, step: 1, get: element => element.rotation ?? 0, set: value => ops.rotateElement(session.doc, session.state.selection[0], value), key: "rotation" }));
    root.append(h("div", { class: "ed-btn-row" },
      h("button", { class: "ed-btn", type: "button", text: "Reset rotation", onclick: () => exec(ops.rotateElement(session.doc, session.state.selection[0], 0)) }),
      h("button", { class: "ed-btn", type: "button", text: "Smaller", onclick: () => exec(ops.scaleSelection(session.doc, session.state.selection, 0.8)) }),
      h("button", { class: "ed-btn", type: "button", text: "Bigger", onclick: () => exec(ops.scaleSelection(session.doc, session.state.selection, 1.25)) }),
      h("button", { class: "ed-btn", type: "button", text: "2× bigger", onclick: () => exec(ops.scaleSelection(session.doc, session.state.selection, 2)) })));
  }

  // alignRoot: the desktop text accordion's Align to Stage section; without it the align controls follow under their own title.
  function actionControls(root, targets, single, { alignRoot = null } = {}) {
    const ids = session.state.selection;
    const grouped = targets.some(element => element.groupId);
    if (!alignRoot) root.append(h("div", { class: "ed-group-title", text: "Arrange" }));
    const button = (text, handler, disabled = false) => h("button", { class: "ed-btn", type: "button", text, disabled, onclick: handler });
    root.append(h("div", { class: "ed-btn-row" },
      button("Duplicate", () => { const result = exec(ops.duplicateElements(session.doc, ids), { keepResultSelection: true }); }),
      button("Delete", () => exec(ops.deleteElements(session.doc, ids), { clearSelection: true }))));
    root.append(h("div", { class: "ed-btn-row" },
      button("Forward", () => exec(ops.reorderLayers(session.doc, ids, "forward"))), button("Backward", () => exec(ops.reorderLayers(session.doc, ids, "backward"))),
      button("To front", () => exec(ops.reorderLayers(session.doc, ids, "front"))), button("To back", () => exec(ops.reorderLayers(session.doc, ids, "back")))));
    // Group: two or more units selected (a group counts as one unit). Ungroup: the selection contains a group.
    const units = new Set(targets.map(element => element.groupId ?? element.id)).size;
    const regroup = (result) => { const applied = exec(result, { keepResultSelection: true }); if (applied.ok) onGroupingChanged(); return applied; };
    root.append(h("div", { class: "ed-btn-row" },
      button("Group", () => regroup(ops.groupElements(session.doc, ids)), units < 2),
      button("Ungroup", () => regroup(ops.ungroupElements(session.doc, ids)), !grouped)));
    if (alignRoot) root = alignRoot; else root.append(h("div", { class: "ed-group-title", text: single ? "Align to stage" : "Align" }));
    const alignRow = h("div", { class: "ed-btn-row" });
    for (const [mode, label] of [["left", "Left"], ["hcenter", "Center"], ["right", "Right"], ["top", "Top"], ["vmiddle", "Middle"], ["bottom", "Bottom"]]) alignRow.append(button(label, () => exec(ops.alignElements(session.doc, ids, mode))));
    root.append(alignRow);
    // Keep inside stage (ON by default): OFF lets the selection go partly or wholly past any stage edge - the stage clips it in Preview and on the Wall
    const keep = h("input", { type: "checkbox" });
    keep.addEventListener("change", () => exec(ops.setKeepInside(session.doc, session.state.selection, keep.checked)));
    syncers.push(current => { keep.checked = current.every(ops.keepsInside); });
    root.append(field("Keep inside stage", keep),
      h("p", { class: "ed-hint", text: "Off: move it past the stage edges. Whatever is outside the stage is cut off in Preview and on your Wall." }));
  }

  // Post-Round 2 manual-acceptance fix: moving elements to another stage is the FIRST thing in the panel whenever the Wall has more than one stage - an explicit
  // destination (every other stage by number, so Stage 1 -> Stage 4 is one step), then Move. The moved elements keep their position, size, rotation, content, style
  // and group (ops.moveElementsToStage), and the editor follows them: the destination stage opens with them still selected, so both Layers lists update at once.
  function stageMoveControls(root) {
    if (session.doc.stages.length < 2) return;
    const currentIndex = session.doc.stages.findIndex(stage => stage.id === session.state.stageId);
    const select = h("select", { "aria-label": "Destination stage" });
    for (const option of ops.stageMoveOptions(session.doc, session.state.stageId)) select.append(h("option", { value: option.id, text: option.label }));
    const move = () => {
      const ids = ops.expandSelection(session.stage, session.state.selection);
      const destination = select.value;
      const applied = exec(ops.moveElementsToStage(session.doc, ids, destination), { clearSelection: true });
      if (!applied.ok) return;
      session.setStage(destination);
      session.select(ids);
    };
    root.append(h("div", { class: "ed-group-title", text: `Move to stage (now on Stage ${currentIndex + 1} of ${session.doc.stages.length})` }),
      h("div", { class: "ed-btn-row" }, select, h("button", { class: "ed-btn ed-btn-primary", type: "button", text: "Move", onclick: move })));
  }

  // Desktop (900px and wider) text Properties: five independent collapsible sections holding the very same controls. Several may be open; which ones are open is kept
  // for every later text selection in this editor session. Each heading is a real button (Enter / Space toggle; Up / Down / Home / End move between headings).
  // Below 900px, and for every other element type, the panel is exactly what it was.
  const desktopProps = typeof matchMedia === "function" ? matchMedia("(min-width: 900px)") : null;
  // Mobile Wall Editor V2 (2026-10-20): on a phone the same controls are ordered common first, the rest in collapsible sections (Text effects with Living Fire,
  // Position & size with nudge, Arrange & align). The 600-899px tablet panel is unchanged.
  const phoneProps = typeof matchMedia === "function" ? matchMedia(PHONE_QUERY) : null;
  const TEXT_SECTIONS = [["content", "Content & Typography"], ["effects", "Text Effects"], ["geometry", "Position & Size"], ["arrange", "Arrange"], ["align", "Align to Stage"]];
  const textSectionOpen = { content: true, effects: true, geometry: false, arrange: false, align: false };
  // Icon Group (desktop, 2026-10-19): the same accordion, with its own remembered open / closed state. Move to stage stays the first control, above it.
  const ICON_SECTIONS = [["icons", "Icons & Links"], ["appearance", "Appearance & Spacing"], ["geometry", "Position & Size"], ["arrange", "Arrange"], ["align", "Align to Stage"]];
  const iconSectionOpen = { icons: true, appearance: true, geometry: false, arrange: false, align: false };
  // Shapes V2 (desktop, 2026-10-19): the same accordion for shapes, with its own remembered state
  const SHAPE_SECTIONS = [["shape", "Shape & Geometry"], ["appearance", "Appearance"], ["geometry", "Position & Size"], ["arrange", "Arrange"], ["align", "Align to Stage"]];
  const shapeSectionOpen = { shape: true, appearance: true, geometry: false, arrange: false, align: false };
  let accordion = null, accordionState = textSectionOpen;
  function setSection(state, key, open) {
    state[key] = open;
    const entry = state === accordionState ? accordion?.[key] : null;
    if (entry) { entry.head.setAttribute("aria-expanded", String(open)); entry.body.hidden = !open; }
  }
  const setTextSection = (key, open) => setSection(textSectionOpen, key, open);
  function accordionSection(root, key, label, state = textSectionOpen) {
    const id = `propsSection-${key}`;
    const head = h("button", { class: "ed-acc-head", type: "button", id: `${id}-head`, "aria-expanded": String(state[key]), "aria-controls": id, onclick: () => setSection(state, key, !state[key]) }, h("span", { text: label }));
    head.addEventListener("keydown", event => {
      const heads = [...body.querySelectorAll(".ed-acc-head")], at = heads.indexOf(head);
      const next = { ArrowDown: heads[at + 1] ?? heads[0], ArrowUp: heads[at - 1] ?? heads[heads.length - 1], Home: heads[0], End: heads[heads.length - 1] }[event.key];
      if (next) { event.preventDefault(); next.focus(); }
    });
    const inner = h("div", { class: "ed-acc-body", id, role: "region", "aria-labelledby": `${id}-head`, hidden: !state[key] });
    root.append(h("section", { class: "ed-acc", "data-acc": key }, h("h3", { class: "ed-acc-title" }, head), inner));
    accordion[key] = { head, body: inner };
    return inner;
  }

  function rebuild(targets) {
    body.replaceChildren();
    syncers = [];
    accordion = null; accordionState = textSectionOpen;
    errorBox = h("div", { class: "ed-errors", role: "alert", hidden: true });
    if (!targets.length) {
      title.textContent = "Properties";
      body.append(h("p", { class: "ed-empty", text: "Select an element on the canvas or in Layers to edit it. Use Add to place text or shapes." }));
      return;
    }
    const types = [...new Set(targets.map(element => element.type))];
    const single = targets.length === 1;
    const groupedSelection = targets.some(element => element.groupId);
    const label = single && targets[0].type === "image" && targets[0].payload.media === "video" ? "Video" : single && targets[0].type === "text" && targets[0].payload.link ? "Link" : TYPE_LABEL[types[0]] ?? types[0];
    title.textContent = single ? `${label}${groupedSelection ? " (in a group)" : ""}` : groupedSelection && new Set(targets.map(element => element.groupId)).size === 1 ? `Group of ${targets.length}` : `${targets.length} elements`;
    body.append(errorBox);
    stageMoveControls(body);   // always the first control (accepted post-Round 2 fix), above any accordion
    if (types.length === 1 && types[0] === "rect" && desktopProps?.matches) {
      accordion = {}; accordionState = shapeSectionOpen;
      const sections = Object.fromEntries(SHAPE_SECTIONS.map(([key, name]) => [key, accordionSection(body, key, key === "align" && !single ? "Align" : name, shapeSectionOpen)]));
      shapeGeometryControls(sections.shape, targets);
      shapeControls(sections.appearance, { titled: false, radius: false });
      if (single && !groupedSelection) geometryControls(sections.geometry, { titled: false, afterSize: lockAspectControl() });
      else sections.geometry.append(h("p", { class: "ed-hint", text: groupedSelection ? "Groups move and resize as one unit. Ungroup to edit an element on its own." : "Multiple elements selected. Move and resize them together on the canvas." }), lockAspectControl());
      actionControls(sections.arrange, targets, single, { alignRoot: sections.align });
      return;
    }
    if (types.length === 1 && types[0] === "icons" && single && desktopProps?.matches) {
      accordion = {}; accordionState = iconSectionOpen;
      const sections = Object.fromEntries(ICON_SECTIONS.map(([key, name]) => [key, accordionSection(body, key, name, iconSectionOpen)]));
      iconsControls(sections.icons, { appearanceRoot: sections.appearance });
      if (!groupedSelection) geometryControls(sections.geometry, { titled: false });
      else sections.geometry.append(h("p", { class: "ed-hint", text: "Groups move and resize as one unit. Ungroup to edit an element on its own." }));
      actionControls(sections.arrange, targets, single, { alignRoot: sections.align });
      return;
    }
    if (types.length === 1 && types[0] === "text" && desktopProps?.matches) {
      accordion = {};
      const sections = Object.fromEntries(TEXT_SECTIONS.map(([key, name]) => [key, accordionSection(body, key, key === "align" && !single ? "Align" : name)]));
      textControls(sections.content, { effectsRoot: sections.effects });
      if (single && !groupedSelection) geometryControls(sections.geometry, { titled: false });
      else sections.geometry.append(h("p", { class: "ed-hint", text: groupedSelection ? "Groups move and resize as one unit. Ungroup to edit an element on its own." : "Multiple elements selected. Move and resize them together on the canvas." }));
      actionControls(sections.arrange, targets, single, { alignRoot: sections.align });
      return;
    }
    if (phoneProps?.matches) { phoneRebuild(targets, types, single, groupedSelection); return; }
    if (types.length === 1 && types[0] === "text") textControls(body);
    else if (types.length === 1 && types[0] === "rect") shapeControls(body);
    else if (types.length === 1 && types[0] === "image") imageControls(body, targets);
    else if (types.length === 1 && types[0] === "gamidData") dataControls(body, targets);
    else if (types.length === 1 && types[0] === "embed" && single) embedControls(body);
    else if (types.length === 1 && types[0] === "gamid") gamidControls(body);
    else if (types.length === 1 && types[0] === "icons" && single) iconsControls(body);
    if (single && !groupedSelection) geometryControls(body);
    else body.append(h("p", { class: "ed-hint", text: groupedSelection ? "Groups move and resize as one unit. Ungroup to edit an element on its own." : "Multiple elements selected. Move and resize them together on the canvas." }));
    actionControls(body, targets, single);
  }

  // the phone panel: the type's own controls (common ones first), then Position & size and Arrange & align one tap away
  function phoneRebuild(targets, types, single, groupedSelection) {
    const later = (label, open = false) => { const holder = h("div"); const inner = section(holder, label, open); return { node: holder.firstChild, inner }; };
    const one = types.length === 1 ? types[0] : null;
    if (one === "text") {
      const effects = later("Text effects");
      textControls(body, { effectsRoot: effects.inner });
      body.append(effects.node);
    } else if (one === "rect") shapeControls(body);
    else if (one === "image") imageControls(body, targets);
    else if (one === "gamidData") dataControls(body, targets);
    else if (one === "embed" && single) embedControls(body);
    else if (one === "gamid") gamidControls(body);
    else if (one === "icons" && single) iconsControls(body);
    const geometry = later("Position & size");
    if (single && !groupedSelection) { geometryControls(geometry.inner, { titled: false }); nudgeControls(geometry.inner); }
    else { geometry.inner.append(h("p", { class: "ed-hint", text: groupedSelection ? "Groups move and resize as one unit. Ungroup to edit an element on its own." : "Multiple elements selected. Move and resize them together on the canvas." })); nudgeControls(geometry.inner); }
    body.append(geometry.node);
    const arrange = later("Arrange & align");
    actionControls(arrange.inner, targets, single);
    body.append(arrange.node);
  }
  // Nudge (phone): moves the selection by 1 stage unit (10 with "Big steps"), one undo step per burst - the touch counterpart of the arrow keys.
  function nudgeControls(root) {
    let big = false;
    const step = () => (big ? 10 : 1);
    const nudge = (dx, dy) => exec(ops.moveElements(session.doc, session.state.selection, dx * step(), dy * step()), { coalesce: "nudge" });
    const arrow = (label, text, dx, dy) => h("button", { class: "ed-btn ed-nudge", type: "button", "aria-label": label, text, onclick: () => nudge(dx, dy) });
    const size = h("button", { class: "ed-btn", type: "button", "aria-pressed": "false", text: "Big steps (10)", onclick: () => { big = !big; size.setAttribute("aria-pressed", String(big)); } });
    root.append(h("div", { class: "ed-group-title", text: "Nudge" }),
      h("div", { class: "ed-btn-row ed-nudge-row", role: "group", "aria-label": "Nudge the selection" }, arrow("Nudge left", "←", -1, 0), arrow("Nudge up", "↑", 0, -1), arrow("Nudge down", "↓", 0, 1), arrow("Nudge right", "→", 1, 0)),
      h("div", { class: "ed-btn-row" }, size));
  }

  const panel = {
    update() {
      const targets = selectedElements();
      // (an embed's presentation is part of the key: switching Card <-> Player changes which controls apply, e.g. Shape)
      const key = `${session.state.stageId}|${targets.map(element => `${element.id}:${element.type}:${element.groupId ?? ""}:${element.type === "embed" ? element.payload.data?.presentation ?? "" : ""}${element.type === "image" ? `:${element.payload.slice?.set ?? "-"}` : ""}${element.type === "text" ? `:${element.payload.link ? "link" : "-"}` : ""}${element.type === "rect" ? `:${element.payload.shape ?? "-"}:${element.payload.path?.points.length ?? ""}` : ""}${element.type === "icons" ? `:${(element.payload.items ?? []).map(item => item.providerKey ?? "other").join("+")}` : ""}`).join(",")}|${session.doc.stages.length}|${getGamid() ? 1 : 0}|${desktopProps?.matches ? 1 : 0}|${phoneProps?.matches ? 1 : 0}`;
      if (key !== builtKey) { builtKey = key; rebuild(targets); }
      if (targets.length) for (const sync of syncers) sync(targets);
    },
    showErrors,
    // Opens one desktop text section (e.g. Text Effects after an effect is chosen in the Text panel) and brings it into view; remembered even when no text is selected.
    reveal(key) {
      if (!(key in textSectionOpen)) return;
      setTextSection(key, true);
      const section = accordion?.[key]?.head.closest(".ed-acc");
      if (section) requestAnimationFrame(() => section.scrollIntoView({ block: "nearest" }));
    },
  };
  desktopProps?.addEventListener?.("change", () => panel.update());
  phoneProps?.addEventListener?.("change", () => panel.update());
  return panel;
}
