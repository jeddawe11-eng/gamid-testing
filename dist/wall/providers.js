// The universal, provider-neutral Embed Engine's extension point:
//
//   Wall -> Embed Element -> Provider Registry (this file) -> Provider Adapter -> Provider Parsing/Normalization -> Provider Validation -> Safe Renderer
//
// The Wall core (elements.js, validate.js, render.js) never knows a provider by name. It only knows that an embed element's `providerKey` names a
// REGISTERED adapter in this registry, and that the adapter - not the Wall core - owns parsing, validating, and rendering that provider's data. A
// provider that is not registered is rejected exactly like an unsupported element type: there is no fallback, no partial rendering, no guessing.
//
// W1 registers ZERO real providers here. Adding any real provider later - whichever platform it may be, including one that does not exist yet - means
// calling providerRegistry.register(key, adapter) from that provider's own module - never editing this file or any Wall-core file.
//
// Adapter contract (documented, not enforced by a class - any object with this shape works):
//   {
//     // Given the embed element's opaque `data` payload (already guaranteed to be a plain object, never a raw string/markup, by the Wall core - see
//     // validate.js's scanForUnsafeContent), return an array of error codes ([] means valid). The provider decides what "valid" means for its own data
//     // (e.g. a specific ID format) - the Wall core never inspects `data`'s contents itself.
//     validatePayload(data) -> string[]
//
//     // Given a validated `data` payload, return a plain, JSON-serializable content descriptor for the render tree (see render.js) - never raw HTML,
//     // never a DOM node, never markup of any kind. Turning that descriptor into an actual iframe/DOM element is a later phase's job, done through the
//     // provider's own "safe provider renderer" step, never by string-concatenating provider data into markup.
//     render(data) -> object
//   }
import { createRegistry } from "./registry.js";

export const providerRegistry = createRegistry();
