// The contextual Properties panel. Built entirely with createElement/textContent (never innerHTML). The panel is rebuilt only when the SELECTION changes
// (which controls apply); on every other change the existing controls are just re-synced, so typing in a field is never interrupted.
import * as ops from "../wall-kit/ops.js";
import { elementRegistry } from "../wall/elements.js";
import { FONT_CATALOG, fontKnown } from "../wall-kit/fonts.js";
import { TEXT_LIMITS, WEIGHTS } from "../wall-kit/text.js";
import { describeErrors } from "../wall-kit/messages.js";
import { PROVIDERS, isAllowedOpenUrl } from "../wall-kit/embed/engine.js";
import { ALT_MAX, MASKS, BLENDS, CROP_PRESETS, SPLIT_COUNTS, EFFECT_LIMITS, cropFor } from "../wall-kit/image.js";
import { DATA_FIELD_INFO, DATA_ITEMS, DATA_TEXT_FIELDS, DATA_COLLECTIONS, dataTextStyle, renderGamidDataPayload } from "../wall-kit/gamid-data.js";
import { resolveGamidData } from "../wall-kit/gamid-data-paint.js";
import { GAMID_LAYOUTS, GAMES_INITIAL, GAMID_STYLE_ENUMS, GAMID_STYLE_RANGES, resolveGamidStyle } from "../wall-kit/gamid.js";

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
const TYPE_LABEL = { text: "Text", rect: "Shape", embed: "Link / Embed", image: "Artwork", gamid: "GamID block", gamidData: "GamID data" };
const MASK_LABELS = { circle: "Circle", rounded: "Rounded rectangle", hexagon: "Hexagon", diamond: "Diamond" };
const BLEND_LABELS = { normal: "Normal", screen: "Screen", multiply: "Multiply", overlay: "Overlay", "soft-light": "Soft light" };
const CROP_LABELS = { free: "Free (this box)", original: "Original", "1:1": "Square 1:1", "16:9": "Wide 16:9", "9:16": "Tall 9:16" };
const isHexColour = value => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

// onGroupingChanged: called after a successful Group / Ungroup, so the editor can leave Multi-select (while Multi stays on, the next tap on the new group toggles it
// OFF again and its handles vanish - the W0 Samsung finding).
export function createPropertiesPanel({ body, title, session, run, fitTextHeight, assets = null, refreshGamid = () => {}, getGamid = () => null, onGroupingChanged = () => {} }) {
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
  function textControls(root, { read = payloadOf, write = patchAll, content = true } = {}) {
    const nested = (key, name, fallback) => element => (read(element)[key] ?? { [name]: fallback })[name];
    const setNested = (key, name, defaults) => value => write({ [key]: { ...defaults, ...(read(selectedElements()[0])[key] ?? {}), [name]: value } });
    if (content) {
      const area = h("textarea", { class: "ed-text-input", maxlength: TEXT_LIMITS.maxLength, "aria-label": "Text", spellcheck: "false" });
      area.addEventListener("input", () => exec(write({ text: area.value }), { coalesce: "text" }));
      area.addEventListener("blur", () => { area.value = selectedElements()[0]?.payload.text ?? ""; showErrors([]); });
      syncers.push(targets => { if (document.activeElement !== area) area.value = read(targets[0]).text; });
      root.append(h("div", { class: "ed-group-title", text: "Content" }), area);
      root.append(h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Fit box height to text", onclick: () => fitTextHeight(session.state.selection[0]) })));
    }

    const families = [...new Set(FONT_CATALOG.map(font => font.group))];
    const fontSelect = h("select");
    for (const group of families) {
      const optgroup = h("optgroup", { label: group });
      for (const font of FONT_CATALOG.filter(candidate => candidate.group === group)) optgroup.append(h("option", { value: font.key, text: font.label }));
      fontSelect.append(optgroup);
    }
    fontSelect.addEventListener("change", () => exec(write({ fontFamily: fontSelect.value }), { coalesce: "fontFamily" }));
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

    root.append(h("div", { class: "ed-group-title", text: "Effects" }));
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
    root.append(optionalGroup({ label: "Glow", key: "glow", get: element => read(element).glow, defaults: glowDefaults, write, build: box => {
      box.append(colorField({ label: "Colour", get: nested("glow", "color", "#62e7ff"), set: setNested("glow", "color", glowDefaults), key: "glowColor" }));
      box.append(numberSlider({ label: "Blur", min: 0, max: 100, step: 1, get: nested("glow", "blur", 16), set: setNested("glow", "blur", glowDefaults), key: "glowBlur" }));
    } }));
    gradientGroup(root, "Gradient fill", { read, write });
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

  function shapeControls(root) {
    root.append(h("div", { class: "ed-group-title", text: "Style" }));
    root.append(colorField({ label: "Fill", get: element => element.payload.fill, set: value => patchAll({ fill: value }), key: "fill" }));
    gradientGroup(root, "Gradient");
    root.append(numberSlider({ label: "Opacity %", min: 0, max: 100, step: 1, get: element => Math.round((element.payload.opacity ?? 1) * 100), set: value => patchAll({ opacity: value === 100 ? undefined : value / 100 }), key: "opacity" }));
    root.append(optionalGroupBorder());
    root.append(numberSlider({ label: "Corner radius", min: 0, max: 1000, sliderMax: 300, step: 1, get: element => element.payload.radius ?? 0, set: value => patchAll({ radius: value === 0 ? undefined : value }), key: "radius" }));
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

  // The shared LOOK controls (an artwork, or a live profile picture): backing, mask, corner radius, opacity, blend, effects.
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

  function imageControls(root, targets) {
    const element = targets[0];
    const pieces = element.payload.slice ? ops.splitPieces(session.doc, element.id) : [];
    const read = payloadOf, write = patchAll;
    const art = section(root, "Artwork", true);
    art.append(selectField({ label: "Fit", options: [{ value: "cover", label: "Fill the box (crop)" }, { value: "contain", label: "Show whole picture" }, { value: "fill", label: "Stretch" }], get: item => item.payload.fit, set: value => patchAll({ fit: value }), key: "imgFit" }));
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
    splitControls(split, targets, pieces);
    const appearance = section(root, "Appearance", true);
    const effects = section(root, "Effects");
    lookControls(root, { read, write, maskSection: mask, appearanceSection: appearance, effectsSection: effects });

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
    root.append(h("div", { class: "ed-group-title", text: `GamID data · ${info?.label ?? field}` }),
      h("p", { class: "ed-hint", text: "Live: this shows your GamID as it is now and updates with it. Visitors only ever see what your GamID shows publicly." }), status);
    syncers.push(items => {
      const resolved = resolveGamidData(renderGamidDataPayload(items[0].payload), getGamid(), "edit");
      status.textContent = resolved.state === "missing" ? resolved.message : resolved.private ? "Private right now: visitors will not see this until it is public on your GamID." : "";
    });
    if (targets.length === 1 && DATA_ITEMS.includes(field)) root.append(dataPicker(element));
    if (field === "connection") root.append(h("div", { class: "ed-btn-row" }, toggleButton({ label: "Show the platform name", get: item => item.payload.withLabel !== false, set: on => patchAll({ withLabel: on ? undefined : false }), key: "dataWithLabel" })));
    root.append(h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Refresh GamID data", onclick: () => refreshGamid() })));
    if (DATA_TEXT_FIELDS.includes(field)) {
      if (new Set(targets.map(item => item.payload.field)).size !== 1) return;
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
    } else if (DATA_COLLECTIONS[field]) {
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
    if (field === "role") {
      options.push({ value: "@primary", label: "My primary role (follows my GamID)" });
      for (const role of snapshot?.roles ?? []) options.push({ value: role.key, label: role.label });
    } else if (field === "game") {
      const seen = new Set();
      for (const game of snapshot?.games?.items ?? []) if (game.ref && !seen.has(game.ref)) { seen.add(game.ref); options.push({ value: game.ref, label: game.refName || game.name }); }
    } else for (const connection of snapshot?.connections ?? []) options.push({ value: connection.key, label: `${connection.label} · ${connection.name}` });
    const currentRef = element.payload.ref;
    if (currentRef && !options.some(option => option.value === currentRef)) options.unshift({ value: currentRef, label: "(no longer available)" });
    for (const option of options) select.append(h("option", { value: option.value, text: option.label }));
    select.addEventListener("change", () => exec(patchAll({ ref: select.value }), { coalesce: "dataRef" }));
    syncers.push(targets => { select.value = targets[0].payload.ref ?? ""; });
    return h("label", { class: "ed-field" }, h("span", { text: field === "role" ? "Role" : field === "game" ? "Game" : "Connection" }), h("div", { class: "ed-inline" }, select));
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
    const presentations = [{ value: "card", label: "Card" }, { value: "link", label: "Link" }, ...(kind?.inline ? [{ value: "embed", label: "Player" }] : [])];
    root.append(selectField({ label: "Show as", options: presentations, get: item => item.payload.data.presentation, set: value => patchData({ presentation: value }), key: "embedShow" }));
    if (!kind?.inline) root.append(h("p", { class: "ed-hint", text: `${provider?.label ?? "This platform"} has no player for this content, so it opens on ${provider?.label ?? "the platform"} as a Card or Link.` }));
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

  function geometryControls(root) {
    root.append(h("div", { class: "ed-group-title", text: "Position and size" }));
    const box = h("div");
    const numeric = (label, name) => {
      const input = h("input", { type: "number", step: 1, inputmode: "numeric" });
      input.addEventListener("change", () => exec(ops.updateGeometry(session.doc, session.state.selection[0], { [name]: input.value }), { coalesce: `geo-${name}` }));
      syncers.push(targets => { if (document.activeElement !== input) input.value = String(targets[0][name]); });
      return field(label, input);
    };
    box.append(numeric("X", "x"), numeric("Y", "y"), numeric("Width", "width"), numeric("Height", "height"));
    root.append(box);
    root.append(numberSlider({ label: "Rotation °", min: -180, max: 180, step: 1, get: element => element.rotation ?? 0, set: value => ops.rotateElement(session.doc, session.state.selection[0], value), key: "rotation" }));
    root.append(h("div", { class: "ed-btn-row" },
      h("button", { class: "ed-btn", type: "button", text: "Reset rotation", onclick: () => exec(ops.rotateElement(session.doc, session.state.selection[0], 0)) }),
      h("button", { class: "ed-btn", type: "button", text: "Smaller", onclick: () => exec(ops.scaleSelection(session.doc, session.state.selection, 0.8)) }),
      h("button", { class: "ed-btn", type: "button", text: "Bigger", onclick: () => exec(ops.scaleSelection(session.doc, session.state.selection, 1.25)) }),
      h("button", { class: "ed-btn", type: "button", text: "2× bigger", onclick: () => exec(ops.scaleSelection(session.doc, session.state.selection, 2)) })));
  }

  function actionControls(root, targets, single) {
    const ids = session.state.selection;
    const grouped = targets.some(element => element.groupId);
    root.append(h("div", { class: "ed-group-title", text: "Arrange" }));
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
    root.append(h("div", { class: "ed-group-title", text: single ? "Align to stage" : "Align" }));
    const alignRow = h("div", { class: "ed-btn-row" });
    for (const [mode, label] of [["left", "Left"], ["hcenter", "Center"], ["right", "Right"], ["top", "Top"], ["vmiddle", "Middle"], ["bottom", "Bottom"]]) alignRow.append(button(label, () => exec(ops.alignElements(session.doc, ids, mode))));
    root.append(alignRow);
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

  function rebuild(targets) {
    body.replaceChildren();
    syncers = [];
    errorBox = h("div", { class: "ed-errors", role: "alert", hidden: true });
    if (!targets.length) {
      title.textContent = "Properties";
      body.append(h("p", { class: "ed-empty", text: "Select an element on the canvas or in Layers to edit it. Use Add to place text or shapes." }));
      return;
    }
    const types = [...new Set(targets.map(element => element.type))];
    const single = targets.length === 1;
    const groupedSelection = targets.some(element => element.groupId);
    title.textContent = single ? `${TYPE_LABEL[types[0]] ?? types[0]}${groupedSelection ? " (in a group)" : ""}` : groupedSelection && new Set(targets.map(element => element.groupId)).size === 1 ? `Group of ${targets.length}` : `${targets.length} elements`;
    body.append(errorBox);
    stageMoveControls(body);
    if (types.length === 1 && types[0] === "text") textControls(body);
    else if (types.length === 1 && types[0] === "rect") shapeControls(body);
    else if (types.length === 1 && types[0] === "image") imageControls(body, targets);
    else if (types.length === 1 && types[0] === "gamidData") dataControls(body, targets);
    else if (types.length === 1 && types[0] === "embed" && single) embedControls(body);
    else if (types.length === 1 && types[0] === "gamid") gamidControls(body);
    if (single && !groupedSelection) geometryControls(body);
    else body.append(h("p", { class: "ed-hint", text: groupedSelection ? "Groups move and resize as one unit. Ungroup to edit an element on its own." : "Multiple elements selected. Move and resize them together on the canvas." }));
    actionControls(body, targets, single);
  }

  return {
    update() {
      const targets = selectedElements();
      // (an embed's presentation is part of the key: switching Card <-> Player changes which controls apply, e.g. Shape)
      const key = `${session.state.stageId}|${targets.map(element => `${element.id}:${element.type}:${element.groupId ?? ""}:${element.type === "embed" ? element.payload.data?.presentation ?? "" : ""}${element.type === "image" ? `:${element.payload.slice?.set ?? "-"}` : ""}`).join(",")}|${session.doc.stages.length}|${getGamid() ? 1 : 0}`;
      if (key !== builtKey) { builtKey = key; rebuild(targets); }
      if (targets.length) for (const sync of syncers) sync(targets);
    },
    showErrors,
  };
}
