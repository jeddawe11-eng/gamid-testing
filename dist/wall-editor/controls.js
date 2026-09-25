// The contextual Properties panel. Built entirely with createElement/textContent (never innerHTML). The panel is rebuilt only when the SELECTION changes
// (which controls apply); on every other change the existing controls are just re-synced, so typing in a field is never interrupted.
import * as ops from "../wall-kit/ops.js";
import { FONT_CATALOG, fontKnown } from "../wall-kit/fonts.js";
import { TEXT_LIMITS, WEIGHTS } from "../wall-kit/text.js";
import { describeErrors } from "../wall-kit/messages.js";

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
const TYPE_LABEL = { text: "Text", rect: "Shape", embed: "Embed" };

export function createPropertiesPanel({ body, title, session, run, fitTextHeight }) {
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
  function optionalGroup({ label, key, get, defaults, build }) {
    const wrap = h("div");
    const checkbox = h("input", { type: "checkbox" });
    const head = field(label, checkbox);
    const inner = h("div");
    checkbox.addEventListener("change", () => exec(patchAll({ [key]: checkbox.checked ? structuredClone(defaults) : undefined })));
    syncers.push(targets => { const on = get(targets[0]) !== undefined && get(targets[0]) !== null; checkbox.checked = on; inner.hidden = !on; });
    build(inner);
    wrap.append(head, inner);
    return wrap;
  }

  // payload edits apply to every selected element of the (single) shared type
  const patchAll = patch => ops.updatePayloadMany(session.doc, session.state.selection, patch);
  const payloadOf = element => element.payload;
  const nested = (key, name, fallback) => element => (element.payload[key] ?? { [name]: fallback })[name];
  const setNested = (key, name, defaults) => value => patchAll({ [key]: { ...defaults, ...(selectedElements()[0].payload[key] ?? {}), [name]: value } });

  // ---- panels -------------------------------------------------------------------------------------------------------------------------------------
  function textControls(root) {
    const area = h("textarea", { class: "ed-text-input", maxlength: TEXT_LIMITS.maxLength, "aria-label": "Text", spellcheck: "false" });
    area.addEventListener("input", () => exec(patchAll({ text: area.value }), { coalesce: "text" }));
    area.addEventListener("blur", () => { area.value = selectedElements()[0]?.payload.text ?? ""; showErrors([]); });
    syncers.push(targets => { if (document.activeElement !== area) area.value = targets[0].payload.text; });
    root.append(h("div", { class: "ed-group-title", text: "Content" }), area);
    root.append(h("div", { class: "ed-btn-row" }, h("button", { class: "ed-btn", type: "button", text: "Fit box height to text", onclick: () => fitTextHeight(session.state.selection[0]) })));

    const families = [...new Set(FONT_CATALOG.map(font => font.group))];
    const fontSelect = h("select");
    for (const group of families) {
      const optgroup = h("optgroup", { label: group });
      for (const font of FONT_CATALOG.filter(candidate => candidate.group === group)) optgroup.append(h("option", { value: font.key, text: font.label }));
      fontSelect.append(optgroup);
    }
    fontSelect.addEventListener("change", () => exec(patchAll({ fontFamily: fontSelect.value }), { coalesce: "fontFamily" }));
    syncers.push(targets => {
      const value = targets[0].payload.fontFamily;
      if (!fontKnown(value) && ![...fontSelect.options].some(option => option.value === value)) fontSelect.append(h("option", { value, text: `${value} (unavailable, using fallback)` }));
      fontSelect.value = value;
    });
    root.append(field("Font", fontSelect));
    root.append(numberSlider({ label: "Size", min: TEXT_LIMITS.fontSize[0], max: TEXT_LIMITS.fontSize[1], sliderMin: 8, sliderMax: 300, step: 1, get: element => element.payload.fontSize, set: value => patchAll({ fontSize: value }), key: "fontSize" }));
    root.append(selectField({ label: "Weight", options: WEIGHTS.map(weight => ({ value: String(weight), label: `${WEIGHT_NAMES[weight]} (${weight})` })), get: element => element.payload.fontWeight, set: value => patchAll({ fontWeight: Number(value) }), key: "fontWeight" }));
    root.append(h("div", { class: "ed-btn-row" },
      toggleButton({ label: "B", get: element => element.payload.fontWeight >= 600, set: on => patchAll({ fontWeight: on ? 700 : 400 }), key: "bold" }),
      toggleButton({ label: "I", get: element => element.payload.italic, set: on => patchAll({ italic: on }), key: "italic" }),
      toggleButton({ label: "U", get: element => element.payload.underline, set: on => patchAll({ underline: on }), key: "underline" }),
      toggleButton({ label: "Wrap", get: element => element.payload.wrap, set: on => patchAll({ wrap: on }), key: "wrap" })));
    root.append(colorField({ label: "Colour", get: element => element.payload.color, set: value => patchAll({ color: value }), key: "color" }));
    const alignRow = h("div", { class: "ed-btn-row" });
    for (const [value, label] of [["left", "Left"], ["center", "Center"], ["right", "Right"]]) {
      const button = h("button", { class: "ed-btn", type: "button", text: label, "aria-pressed": "false", onclick: () => exec(patchAll({ align: value })) });
      syncers.push(targets => button.setAttribute("aria-pressed", String(targets[0].payload.align === value)));
      alignRow.append(button);
    }
    root.append(alignRow);
    root.append(selectField({ label: "Direction", options: [{ value: "auto", label: "Automatic" }, { value: "ltr", label: "Left to right" }, { value: "rtl", label: "Right to left" }], get: element => element.payload.direction, set: value => patchAll({ direction: value }), key: "direction" }));
    root.append(numberSlider({ label: "Line height", min: TEXT_LIMITS.lineHeight[0], max: TEXT_LIMITS.lineHeight[1], step: 0.05, get: element => element.payload.lineHeight, set: value => patchAll({ lineHeight: value }), key: "lineHeight" }));
    root.append(numberSlider({ label: "Letter space", min: TEXT_LIMITS.letterSpacing[0], max: TEXT_LIMITS.letterSpacing[1], sliderMin: -10, sliderMax: 40, step: 0.5, get: element => element.payload.letterSpacing, set: value => patchAll({ letterSpacing: value }), key: "letterSpacing" }));
    root.append(numberSlider({ label: "Opacity %", min: 0, max: 100, step: 1, get: element => Math.round(element.payload.opacity * 100), set: value => patchAll({ opacity: value / 100 }), key: "opacity" }));

    root.append(h("div", { class: "ed-group-title", text: "Effects" }));
    root.append(optionalGroup({ label: "Outline", key: "stroke", get: element => element.payload.stroke, defaults: { color: "#000000", width: 4 }, build: box => {
      box.append(colorField({ label: "Colour", get: nested("stroke", "color", "#000000"), set: setNested("stroke", "color", { color: "#000000", width: 4 }), key: "strokeColor" }));
      box.append(numberSlider({ label: "Width", min: 0, max: 50, step: 0.5, get: nested("stroke", "width", 4), set: setNested("stroke", "width", { color: "#000000", width: 4 }), key: "strokeWidth" }));
    } }));
    const shadowDefaults = { color: "#000000", blur: 8, x: 4, y: 4 };
    root.append(optionalGroup({ label: "Shadow", key: "shadow", get: element => element.payload.shadow, defaults: shadowDefaults, build: box => {
      box.append(colorField({ label: "Colour", get: nested("shadow", "color", "#000000"), set: setNested("shadow", "color", shadowDefaults), key: "shadowColor" }));
      box.append(numberSlider({ label: "Blur", min: 0, max: 100, step: 1, get: nested("shadow", "blur", 8), set: setNested("shadow", "blur", shadowDefaults), key: "shadowBlur" }));
      box.append(numberSlider({ label: "Offset X", min: -100, max: 100, step: 1, get: nested("shadow", "x", 4), set: setNested("shadow", "x", shadowDefaults), key: "shadowX" }));
      box.append(numberSlider({ label: "Offset Y", min: -100, max: 100, step: 1, get: nested("shadow", "y", 4), set: setNested("shadow", "y", shadowDefaults), key: "shadowY" }));
    } }));
    const glowDefaults = { color: "#62e7ff", blur: 16 };
    root.append(optionalGroup({ label: "Glow", key: "glow", get: element => element.payload.glow, defaults: glowDefaults, build: box => {
      box.append(colorField({ label: "Colour", get: nested("glow", "color", "#62e7ff"), set: setNested("glow", "color", glowDefaults), key: "glowColor" }));
      box.append(numberSlider({ label: "Blur", min: 0, max: 100, step: 1, get: nested("glow", "blur", 16), set: setNested("glow", "blur", glowDefaults), key: "glowBlur" }));
    } }));
    gradientGroup(root, "Gradient fill");
  }

  function gradientGroup(root, label) {
    const defaults = { from: "#62e7ff", to: "#8b5dff", angle: 90 };
    root.append(optionalGroup({ label, key: "gradient", get: element => element.payload.gradient, defaults, build: box => {
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
    root.append(h("div", { class: "ed-btn-row" },
      button("Group", () => exec(ops.groupElements(session.doc, ids), { keepResultSelection: true }), targets.length < 2 || (grouped && new Set(targets.map(element => element.groupId ?? element.id)).size === 1)),
      button("Ungroup", () => exec(ops.ungroupElements(session.doc, ids), { keepResultSelection: true }), !grouped)));
    root.append(h("div", { class: "ed-group-title", text: single ? "Align to stage" : "Align" }));
    const alignRow = h("div", { class: "ed-btn-row" });
    for (const [mode, label] of [["left", "Left"], ["hcenter", "Center"], ["right", "Right"], ["top", "Top"], ["vmiddle", "Middle"], ["bottom", "Bottom"]]) alignRow.append(button(label, () => exec(ops.alignElements(session.doc, ids, mode))));
    root.append(alignRow);
    if (session.doc.stages.length > 1) {
      root.append(h("div", { class: "ed-group-title", text: "Move to stage" }));
      const select = h("select");
      session.doc.stages.forEach((stage, index) => { if (stage.id !== session.state.stageId) select.append(h("option", { value: stage.id, text: `Stage ${index + 1}` })); });
      root.append(h("div", { class: "ed-btn-row" }, select, button("Move", () => exec(ops.moveElementsToStage(session.doc, ids, select.value), { clearSelection: true }))));
    }
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
    if (types.length === 1 && types[0] === "text") textControls(body);
    else if (types.length === 1 && types[0] === "rect") shapeControls(body);
    if (single && !groupedSelection) geometryControls(body);
    else body.append(h("p", { class: "ed-hint", text: groupedSelection ? "Groups move and resize as one unit. Ungroup to edit an element on its own." : "Multiple elements selected. Move and resize them together on the canvas." }));
    actionControls(body, targets, single);
  }

  return {
    update() {
      const targets = selectedElements();
      const key = `${session.state.stageId}|${targets.map(element => `${element.id}:${element.type}:${element.groupId ?? ""}`).join(",")}|${session.doc.stages.length}`;
      if (key !== builtKey) { builtKey = key; rebuild(targets); }
      if (targets.length) for (const sync of syncers) sync(targets);
    },
    showErrors,
  };
}
