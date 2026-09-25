// The Wall's element-type extension point. A "supported foundational element-type architecture": every type - foundational or future - is registered
// the same way, through the same registry, with the same shape ({ validatePayload, render } plus the optional `scale` hook). validate.js and render.js
// dispatch through this registry; neither file ever branches on a literal type name. A later phase adds text/image/background/live-data element types by
// registering them here (or in their own module) - never by adding another `if (type === "...")` to the Wall core.
//
// Registered here, deliberately minimal:
//   - "rect": a rectangle. W1 shipped it as a bare fill; W3 makes it a useful shape (optional opacity, border, corner radius, gradient) as COMPATIBLE optional
//     payload fields: every document that was valid before is still valid and renders the same.
//   - "embed": the universal, provider-neutral embed contract (see providers.js) - proves the SAME mechanism also carries the provider extension point.
// The `text` type lives in ../wall-kit/text.js and registers itself into this same registry; the core never names it.
//
// The optional `scale(payload, factor)` hook lets a type-owned payload follow a uniform resize of a group (type sizes, border widths, ...): the editor calls
// it without knowing what any payload contains.
import { createRegistry } from "./registry.js";
import { providerRegistry } from "./providers.js";
import { HEX_COLOR, isSet, isHex, inRange, isGradient, isPlainObject } from "./fields.js";

export const elementRegistry = createRegistry();

elementRegistry.register("rect", {
  validatePayload(payload) {
    if (!isPlainObject(payload)) return ["PAYLOAD_NOT_OBJECT"];
    const errors = [];
    if (!HEX_COLOR.test(payload.fill)) errors.push("INVALID_FILL");
    if (isSet(payload.opacity) && !inRange(payload.opacity, 0, 1)) errors.push("INVALID_OPACITY");
    if (isSet(payload.stroke) && !isHex(payload.stroke)) errors.push("INVALID_STROKE");
    if (isSet(payload.strokeWidth) && !inRange(payload.strokeWidth, 0, 100)) errors.push("INVALID_STROKE_WIDTH");
    if (isSet(payload.radius) && !inRange(payload.radius, 0, 1000)) errors.push("INVALID_RADIUS");
    if (isSet(payload.gradient) && !isGradient(payload.gradient)) errors.push("INVALID_GRADIENT");
    return errors;
  },
  render(payload) {
    const content = { kind: "rect", fill: payload.fill };
    for (const key of ["opacity", "stroke", "strokeWidth", "radius", "gradient"]) if (isSet(payload[key])) content[key] = payload[key];
    return content;
  },
  scale(payload, factor) {
    const next = { ...payload };
    if (typeof next.strokeWidth === "number") next.strokeWidth = Math.min(100, Math.round(next.strokeWidth * factor * 10) / 10);
    if (typeof next.radius === "number") next.radius = Math.min(1000, Math.round(next.radius * factor));
    return next;
  },
});

// The embed element's OWN payload shape is fixed and minimal: { providerKey, data }. `providerKey` must name a registered provider; `data` is that
// provider's own opaque payload, validated and rendered entirely by its adapter (see providers.js) - the Wall core only checks that `data` is a plain
// object (never a raw string, so it can never itself be interpreted as markup) and delegates everything else.
elementRegistry.register("embed", {
  validatePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ["PAYLOAD_NOT_OBJECT"];
    if (typeof payload.providerKey !== "string" || !payload.providerKey) return ["INVALID_PROVIDER_KEY"];
    const adapter = providerRegistry.get(payload.providerKey);
    if (!adapter) return ["UNSUPPORTED_PROVIDER"];
    if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) return ["PROVIDER_DATA_NOT_OBJECT"];
    const providerErrors = adapter.validatePayload ? adapter.validatePayload(payload.data) : [];
    return (providerErrors || []).map(code => `PROVIDER:${code}`);
  },
  render(payload) {
    const adapter = providerRegistry.get(payload.providerKey);
    // Only reachable for an already-validated element (render.js never renders an invalid document), so the adapter is guaranteed to exist here; the
    // `unavailable` fallback exists purely so this function still fails safe - never throws, never renders raw data - if ever called out of that order.
    if (!adapter) return { kind: "embed", providerKey: payload.providerKey, unavailable: true };
    return { kind: "embed", providerKey: payload.providerKey, content: adapter.render ? adapter.render(payload.data) : null };
  },
});
