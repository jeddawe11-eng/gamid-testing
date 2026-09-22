// A generic named-capability registry. Used TWICE by this Wall foundation - once for element types (elements.js) and once for embed providers
// (providers.js) - so both of the Wall's extension points (new element type, new embed provider) share one mechanism instead of two bespoke ones.
// This is the ONE way the Wall core stays extensible without ever branching on a specific type or provider name: a later phase adds a capability by
// calling .register() on the relevant registry, never by editing validate.js or render.js.
export function createRegistry() {
  const entries = new Map();
  return {
    register(key, definition) {
      if (typeof key !== "string" || !key) throw new Error("REGISTRY_INVALID_KEY");
      entries.set(key, definition);
    },
    unregister(key) { entries.delete(key); },
    get(key) { return entries.get(key) || null; },
    has(key) { return entries.has(key); },
    keys() { return [...entries.keys()]; },
  };
}
