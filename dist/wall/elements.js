// The Wall's element-type extension point. A "supported foundational element-type architecture": every type - foundational or future - is registered
// the same way, through the same registry, with the same two-function shape ({ validatePayload, render }). validate.js and render.js dispatch through
// this registry; neither file ever branches on a literal type name. A future phase adds text/image/background/live-data element types by registering
// them here (or in their own module) - never by adding another `if (type === "...")` to the Wall core.
//
// W1 registers exactly two types, deliberately minimal:
//   - "rect": the smallest possible non-embed visual element, proving the extension mechanism for an ordinary type (not a special case).
//   - "embed": the universal, provider-neutral embed contract (see providers.js) - proves the SAME mechanism also carries the provider extension point.
// Neither is a real product content type. Real types (text, image, live GamID blocks, ...) are later-phase work.
import { createRegistry } from "./registry.js";
import { providerRegistry } from "./providers.js";

export const elementRegistry = createRegistry();

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

elementRegistry.register("rect", {
  validatePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ["PAYLOAD_NOT_OBJECT"];
    return HEX_COLOR.test(payload.fill) ? [] : ["INVALID_FILL"];
  },
  render(payload) {
    return { kind: "rect", fill: payload.fill };
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
