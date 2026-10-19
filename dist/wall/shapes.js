// Shapes V2 (Mazen's task "My Wall Desktop Shapes V2", 2026-10-19): the vector shapes a `rect` element can be, as COMPATIBLE optional payload fields. A rect without
// `shape` is exactly the shape it always was (CSS box: fill, gradient, border, corner radius, opacity), so every saved Wall paints unchanged.
//
//   shape      a catalog key below, or "custom" (a freeform path drawn with the pen)
//   params     the shape's own Smart Shape numbers (sides, points, inner, shaft, head, tail, cut, thickness), each bounded; only the keys that shape uses
//   path       custom only: { closed, points: [{ x, y, ix?, iy?, ox?, oy? }] } - anchors in 0..1 of the element box, curve handles (in / out) in -1..2;
//              2..100 points (3+ when closed). Open paths are stroked only.
//   lockAspect width / height ratio to hold while resizing (0.05..20), absent = free
//
// Everything here is pure math on validated numbers: the painter turns it into SVG path data made only of numbers and fixed command letters.

export const SHAPE_LIMITS = Object.freeze({ maxPoints: 100, aspect: [0.05, 20], anchor: [0, 1], handle: [-1, 2] });
export const SHAPE_PARAMS = Object.freeze({
  sides: { min: 3, max: 12, integer: true, label: "Sides" },
  points: { min: 3, max: 16, integer: true, label: "Points" },
  inner: { min: 0.2, max: 0.9, label: "Inner radius" },
  shaft: { min: 0.1, max: 0.9, label: "Shaft thickness" },
  head: { min: 0.1, max: 0.9, label: "Head length" },
  tail: { min: 0.05, max: 0.95, label: "Tail position" },
  cut: { min: 0, max: 0.45, label: "Corner cut" },
  thickness: { min: 0.1, max: 0.9, label: "Thickness" },
});

// key -> the Smart Shape parameters it takes (with defaults)
export const SHAPES = Object.freeze({
  ellipse: {}, triangle: {}, "right-triangle": {}, diamond: {}, parallelogram: { cut: 0.25 }, trapezoid: { cut: 0.22 },
  polygon: { sides: 6 }, star: { points: 5, inner: 0.45 },
  "arrow-right": { shaft: 0.42, head: 0.38 }, "arrow-left": { shaft: 0.42, head: 0.38 }, "arrow-up": { shaft: 0.42, head: 0.38 }, "arrow-down": { shaft: 0.42, head: 0.38 },
  "arrow-double": { shaft: 0.42, head: 0.28 }, "chevron-right": { thickness: 0.42 }, "chevron-left": { thickness: 0.42 },
  bubble: { tail: 0.25 }, "bubble-round": { tail: 0.3 }, callout: { tail: 0.25 },
  shield: {}, ribbon: { cut: 0.12 }, pennant: { cut: 0.3 }, tag: { cut: 0.22 }, plaque: { cut: 0.18 },
  bolt: {}, heart: {}, crown: {}, gem: {}, plus: { thickness: 0.34 }, ring: { thickness: 0.3 },
  custom: {},
});
export const SHAPE_KEYS = Object.freeze(Object.keys(SHAPES));

const num = value => typeof value === "number" && Number.isFinite(value);
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const within = (value, min, max) => num(value) && value >= min && value <= max;

export function validatePath(path) {
  if (!plain(path) || typeof path.closed !== "boolean" || !Array.isArray(path.points)) return false;
  if (Object.keys(path).some(key => key !== "closed" && key !== "points")) return false;
  const count = path.points.length;
  if (count < (path.closed ? 3 : 2) || count > SHAPE_LIMITS.maxPoints) return false;
  return path.points.every(point => plain(point)
    && Object.keys(point).every(key => ["x", "y", "ix", "iy", "ox", "oy"].includes(key))
    && within(point.x, ...SHAPE_LIMITS.anchor) && within(point.y, ...SHAPE_LIMITS.anchor)
    && ["ix", "iy", "ox", "oy"].every(key => point[key] === undefined || within(point[key], ...SHAPE_LIMITS.handle))
    && ((point.ix === undefined) === (point.iy === undefined)) && ((point.ox === undefined) === (point.oy === undefined)));
}

// The Shapes V2 part of a rect payload: [] when valid (or absent). Error codes are the contract (the database mirrors them when its migration is applied).
export function shapeFieldErrors(payload) {
  const errors = [];
  const set = value => value !== undefined && value !== null;
  if (set(payload.shape) && !(typeof payload.shape === "string" && SHAPE_KEYS.includes(payload.shape))) errors.push("INVALID_SHAPE");
  const allowed = set(payload.shape) && SHAPES[payload.shape] ? Object.keys(SHAPES[payload.shape]) : [];
  if (set(payload.params)) {
    const ok = plain(payload.params) && Object.entries(payload.params).every(([key, value]) => {
      const rule = SHAPE_PARAMS[key];
      return allowed.includes(key) && rule && within(value, rule.min, rule.max) && (!rule.integer || Number.isInteger(value));
    });
    if (!ok) errors.push("INVALID_SHAPE_PARAMS");
  }
  if (payload.shape === "custom" ? !validatePath(payload.path) : set(payload.path)) errors.push("INVALID_SHAPE_PATH");
  if (set(payload.lockAspect) && !within(payload.lockAspect, ...SHAPE_LIMITS.aspect)) errors.push("INVALID_LOCK_ASPECT");
  return errors;
}

export const shapeParam = (payload, key) => {
  const rule = SHAPE_PARAMS[key], value = payload.params?.[key], fallback = SHAPES[payload.shape]?.[key];
  return within(value, rule.min, rule.max) ? value : fallback;
};

// ---- geometry: every function gets the drawing box (x, y, w, h) and returns SVG path data -----------------------------------------------------------------
const r2 = value => Math.round(value * 100) / 100;
const poly = points => `M${points.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L")}Z`;
const ellipsePath = (cx, cy, rx, ry) => `M${r2(cx - rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(cx + rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(cx - rx)} ${r2(cy)}Z`;
function roundedRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${r2(x + r)} ${r2(y)}H${r2(x + w - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + w)} ${r2(y + r)}V${r2(y + h - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + w - r)} ${r2(y + h)}H${r2(x + r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x)} ${r2(y + h - r)}V${r2(y + r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + r)} ${r2(y)}Z`;
}
const regular = (x, y, w, h, n, start = -Math.PI / 2) => Array.from({ length: n }, (_, i) => { const a = start + (i * 2 * Math.PI) / n; return [x + w / 2 + (w / 2) * Math.cos(a), y + h / 2 + (h / 2) * Math.sin(a)]; });
function star(x, y, w, h, n, inner) {
  return Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / n, k = i % 2 ? inner : 1; return [x + w / 2 + (w / 2) * k * Math.cos(a), y + h / 2 + (h / 2) * k * Math.sin(a)]; });
}
// a right-pointing arrow in a unit box, then mapped (rotations for the other directions)
function arrowUnit(shaft, head, double) {
  const t = (1 - shaft) / 2, hx = 1 - head;
  if (double) { const hl = head; return [[0, 0.5], [hl, 0], [hl, t], [1 - hl, t], [1 - hl, 0], [1, 0.5], [1 - hl, 1], [1 - hl, 1 - t], [hl, 1 - t], [hl, 1]]; }
  return [[0, t], [hx, t], [hx, 0], [1, 0.5], [hx, 1], [hx, 1 - t], [0, 1 - t]];
}
const mapUnit = (x, y, w, h, points, turn = "none") => points.map(([u, v]) => {
  const [a, b] = turn === "left" ? [1 - u, v] : turn === "up" ? [v, 1 - u] : turn === "down" ? [v, u] : [u, v];
  return [x + a * w, y + b * h];
});

export function shapePath(payload, x, y, w, h) {
  const p = key => shapeParam(payload, key);
  switch (payload.shape) {
    case "ellipse": return ellipsePath(x + w / 2, y + h / 2, w / 2, h / 2);
    case "triangle": return poly([[x + w / 2, y], [x + w, y + h], [x, y + h]]);
    case "right-triangle": return poly([[x, y], [x + w, y + h], [x, y + h]]);
    case "diamond": return poly([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]);
    case "parallelogram": return poly([[x + w * p("cut"), y], [x + w, y], [x + w * (1 - p("cut")), y + h], [x, y + h]]);
    case "trapezoid": return poly([[x + w * p("cut"), y], [x + w * (1 - p("cut")), y], [x + w, y + h], [x, y + h]]);
    case "polygon": return poly(regular(x, y, w, h, p("sides"), p("sides") % 2 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / p("sides")));
    case "star": return poly(star(x, y, w, h, p("points"), p("inner")));
    case "arrow-right": return poly(mapUnit(x, y, w, h, arrowUnit(p("shaft"), p("head"), false)));
    case "arrow-left": return poly(mapUnit(x, y, w, h, arrowUnit(p("shaft"), p("head"), false), "left"));
    case "arrow-up": return poly(mapUnit(x, y, w, h, arrowUnit(p("shaft"), p("head"), false), "up"));
    case "arrow-down": return poly(mapUnit(x, y, w, h, arrowUnit(p("shaft"), p("head"), false), "down"));
    case "arrow-double": return poly(mapUnit(x, y, w, h, arrowUnit(p("shaft"), p("head"), true)));
    case "chevron-right": case "chevron-left": {
      const t = p("thickness") * 0.6, pts = [[0, 0], [t, 0], [1, 0.5], [t, 1], [0, 1], [1 - t, 0.5]];
      return poly(mapUnit(x, y, w, h, pts, payload.shape === "chevron-left" ? "left" : "none"));
    }
    case "bubble": case "callout": {
      const body = h * 0.78, tx = x + w * p("tail"), r = payload.shape === "bubble" ? Math.min(w, body) * 0.22 : 0;
      const tw = Math.max(8, w * 0.12);
      const rr = Math.max(0, Math.min(r, w / 2, body / 2));
      return `M${r2(x + rr)} ${r2(y)}H${r2(x + w - rr)}${rr ? `A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + w)} ${r2(y + rr)}` : ""}V${r2(y + body - rr)}${rr ? `A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + w - rr)} ${r2(y + body)}` : ""}`
        + `H${r2(Math.min(x + w - rr, tx + tw))}L${r2(tx - tw * 0.4)} ${r2(y + h)}L${r2(Math.max(x + rr, tx - tw * 0.2))} ${r2(y + body)}H${r2(x + rr)}${rr ? `A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x)} ${r2(y + body - rr)}` : ""}V${r2(y + rr)}${rr ? `A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + rr)} ${r2(y)}` : ""}Z`;
    }
    case "bubble-round": {
      const body = h * 0.8, cx = x + w / 2, cy = y + body / 2, tx = x + w * p("tail");
      const tail = poly([[tx - w * 0.07, y + body * 0.86], [tx - w * 0.12, y + h], [tx + w * 0.1, y + body * 0.92]]);
      return ellipsePath(cx, cy, w / 2, body / 2) + tail;
    }
    case "shield": return `M${r2(x + w / 2)} ${r2(y)}L${r2(x + w)} ${r2(y + h * 0.14)}V${r2(y + h * 0.48)}C${r2(x + w)} ${r2(y + h * 0.75)} ${r2(x + w * 0.74)} ${r2(y + h * 0.9)} ${r2(x + w / 2)} ${r2(y + h)}C${r2(x + w * 0.26)} ${r2(y + h * 0.9)} ${r2(x)} ${r2(y + h * 0.75)} ${r2(x)} ${r2(y + h * 0.48)}V${r2(y + h * 0.14)}Z`;
    case "ribbon": { const c = p("cut"); return poly([[x, y], [x + w, y], [x + w * (1 - c), y + h / 2], [x + w, y + h], [x, y + h], [x + w * c, y + h / 2]]); }
    case "pennant": return poly([[x, y], [x + w, y], [x + w * (1 - p("cut")), y + h / 2], [x + w, y + h], [x, y + h]]);
    case "tag": return poly([[x + w * p("cut"), y], [x + w, y], [x + w, y + h], [x + w * p("cut"), y + h], [x, y + h / 2]]);
    case "plaque": { const c = Math.min(w, h) * p("cut"); return poly([[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]]); }
    case "bolt": return poly(mapUnit(x, y, w, h, [[0.58, 0], [0.12, 0.56], [0.46, 0.56], [0.36, 1], [0.88, 0.38], [0.53, 0.38], [0.7, 0]]));
    case "heart": return `M${r2(x + w / 2)} ${r2(y + h)}C${r2(x + w * 0.1)} ${r2(y + h * 0.72)} ${r2(x)} ${r2(y + h * 0.45)} ${r2(x)} ${r2(y + h * 0.28)}C${r2(x)} ${r2(y + h * 0.08)} ${r2(x + w * 0.2)} ${r2(y)} ${r2(x + w * 0.29)} ${r2(y)}C${r2(x + w * 0.4)} ${r2(y)} ${r2(x + w * 0.47)} ${r2(y + h * 0.08)} ${r2(x + w / 2)} ${r2(y + h * 0.17)}C${r2(x + w * 0.53)} ${r2(y + h * 0.08)} ${r2(x + w * 0.6)} ${r2(y)} ${r2(x + w * 0.71)} ${r2(y)}C${r2(x + w * 0.8)} ${r2(y)} ${r2(x + w)} ${r2(y + h * 0.08)} ${r2(x + w)} ${r2(y + h * 0.28)}C${r2(x + w)} ${r2(y + h * 0.45)} ${r2(x + w * 0.9)} ${r2(y + h * 0.72)} ${r2(x + w / 2)} ${r2(y + h)}Z`;
    case "crown": return poly(mapUnit(x, y, w, h, [[0, 0.22], [0.27, 0.55], [0.5, 0], [0.73, 0.55], [1, 0.22], [0.9, 1], [0.1, 1]]));
    case "gem": return poly(mapUnit(x, y, w, h, [[0.22, 0], [0.78, 0], [1, 0.32], [0.5, 1], [0, 0.32]]));
    case "plus": { const t = (1 - p("thickness")) / 2; return poly(mapUnit(x, y, w, h, [[t, 0], [1 - t, 0], [1 - t, t], [1, t], [1, 1 - t], [1 - t, 1 - t], [1 - t, 1], [t, 1], [t, 1 - t], [0, 1 - t], [0, t], [t, t]])); }
    case "ring": { const k = 1 - p("thickness"); return ellipsePath(x + w / 2, y + h / 2, w / 2, h / 2) + ellipsePath(x + w / 2, y + h / 2, (w / 2) * k, (h / 2) * k); }
    case "custom": return customPath(payload.path, x, y, w, h);
    default: return roundedRect(x, y, w, h, 0);
  }
}

// A freeform path: straight segments where neither end has a handle, cubic curves otherwise (a missing handle = its own anchor).
export function customPath(path, x, y, w, h) {
  if (!validatePath(path)) return "";
  const at = (u, v) => `${r2(x + u * w)} ${r2(y + v * h)}`;
  const pts = path.points;
  let d = `M${at(pts[0].x, pts[0].y)}`;
  const segment = (a, b) => (a.ox === undefined && b.ix === undefined ? `L${at(b.x, b.y)}` : `C${at(a.ox ?? a.x, a.oy ?? a.y)} ${at(b.ix ?? b.x, b.iy ?? b.y)} ${at(b.x, b.y)}`);
  for (let i = 1; i < pts.length; i++) d += segment(pts[i - 1], pts[i]);
  if (path.closed) d += `${segment(pts[pts.length - 1], pts[0])}Z`;
  return d;
}

export const shapeFillRule = payload => (payload.shape === "ring" ? "evenodd" : "nonzero");
export const shapeIsOpen = payload => payload.shape === "custom" && payload.path?.closed === false;

// The library offered in the editor: name, category, the payload a new element gets, its starting size, and whether its proportions start locked.
// Rectangle / Rounded / Circle are the existing shapes (ops ELEMENT_KINDS) and keep their own payloads.
const lib = (id, label, category, shape, params, size, lock = false) => ({ id, label, category, shape, params, size, lock });
export const SHAPE_LIBRARY = Object.freeze([
  lib("rect", "Rectangle", "Basic", null, null, [400, 260]), lib("rounded", "Rounded", "Basic", null, null, [400, 260]), lib("circle", "Circle", "Basic", null, null, [300, 300], true),
  lib("ellipse", "Ellipse", "Basic", "ellipse", null, [400, 260]), lib("triangle", "Triangle", "Basic", "triangle", null, [320, 280], true), lib("right-triangle", "Right triangle", "Basic", "right-triangle", null, [320, 280]),
  lib("diamond", "Diamond", "Basic", "diamond", null, [300, 300], true), lib("parallelogram", "Parallelogram", "Basic", "parallelogram", null, [420, 240]), lib("trapezoid", "Trapezoid", "Basic", "trapezoid", null, [420, 260]),
  lib("pentagon", "Pentagon", "Polygons & stars", "polygon", { sides: 5 }, [300, 300], true), lib("hexagon", "Hexagon", "Polygons & stars", "polygon", { sides: 6 }, [300, 300], true),
  lib("octagon", "Octagon", "Polygons & stars", "polygon", { sides: 8 }, [300, 300], true), lib("star4", "4-point star", "Polygons & stars", "star", { points: 4, inner: 0.4 }, [300, 300], true),
  lib("star5", "5-point star", "Polygons & stars", "star", { points: 5, inner: 0.45 }, [300, 300], true), lib("star6", "6-point star", "Polygons & stars", "star", { points: 6, inner: 0.55 }, [300, 300], true),
  lib("star8", "8-point star", "Polygons & stars", "star", { points: 8, inner: 0.6 }, [300, 300], true), lib("burst", "Burst", "Polygons & stars", "star", { points: 16, inner: 0.78 }, [300, 300], true),
  lib("arrow-right", "Arrow right", "Arrows", "arrow-right", null, [420, 220]), lib("arrow-left", "Arrow left", "Arrows", "arrow-left", null, [420, 220]),
  lib("arrow-up", "Arrow up", "Arrows", "arrow-up", null, [220, 420]), lib("arrow-down", "Arrow down", "Arrows", "arrow-down", null, [220, 420]),
  lib("arrow-double", "Double arrow", "Arrows", "arrow-double", null, [460, 200]), lib("chevron-right", "Chevron right", "Arrows", "chevron-right", null, [220, 300]), lib("chevron-left", "Chevron left", "Arrows", "chevron-left", null, [220, 300]),
  lib("bubble", "Speech bubble", "Callouts", "bubble", null, [420, 300]), lib("bubble-round", "Round bubble", "Callouts", "bubble-round", null, [420, 300]), lib("callout", "Callout box", "Callouts", "callout", null, [420, 300]),
  lib("shield", "Shield", "Badges & banners", "shield", null, [280, 340], true), lib("ribbon", "Ribbon banner", "Badges & banners", "ribbon", null, [520, 160]), lib("pennant", "Pennant", "Badges & banners", "pennant", null, [460, 200]),
  lib("tag", "Tag", "Badges & banners", "tag", null, [420, 200]), lib("plaque", "Plaque", "Badges & banners", "plaque", null, [440, 240]),
  lib("bolt", "Lightning", "Gaming", "bolt", null, [240, 360], true), lib("crown", "Crown", "Gaming", "crown", null, [360, 260], true), lib("gem", "Gem", "Gaming", "gem", null, [320, 280], true),
  lib("heart", "Heart", "Gaming", "heart", null, [320, 290], true), lib("plus", "Health cross", "Gaming", "plus", null, [300, 300], true), lib("ring", "Ring", "Gaming", "ring", null, [300, 300], true),
]);
export const SHAPE_CATEGORIES = Object.freeze([...new Set(SHAPE_LIBRARY.map(item => item.category))]);

// Which library entry a payload is (for the editor's "current shape" mark and Shape type menu); null for a freeform path or a tuned polygon / star.
export function libraryIdOf(payload) {
  if (!payload?.shape) return payload?.radius >= 1000 ? "circle" : payload?.radius > 0 ? "rounded" : "rect";
  if (payload.shape === "custom") return null;
  const same = item => item.shape === payload.shape && Object.entries(item.params ?? {}).every(([key, value]) => shapeParam(payload, key) === value);
  const matches = SHAPE_LIBRARY.filter(same);
  return matches.length ? matches[0].id : null;
}
