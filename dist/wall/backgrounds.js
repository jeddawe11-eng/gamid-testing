// The Wall's background extension point (a Wall-wide background, and an optional per-stage override). Exactly like element types and embed providers, background KINDS
// are registered by name; the Wall core only knows "a background is a plain object whose `kind` names a registered kind" and never branches on a specific kind.
// Kind definition: { validate(background) -> string[], render(background) -> plain descriptor }. Registrations live outside the core (dist/wall-kit/background.js).
import { createRegistry } from "./registry.js";

export const backgroundRegistry = createRegistry();
