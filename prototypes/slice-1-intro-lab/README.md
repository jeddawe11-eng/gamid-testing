# Slice 1 — Intro / Transition Engine lab (internal reference prototype)

This is the accepted Slice 1 prototype (`slice-1-accepted`): an interactive lab for the Intro and the five reveal transitions,
showing a **fictional** profile ("NovaRift") next to prototype controls.

It used to be the anonymous root of the TESTING site. That was the wrong product experience (a visitor could believe they had
opened a real, controllable GamID account), so on the "Root landing page V1" change it was moved **out of `dist/`**. It is kept
here as an internal reference; it is **not** deployed (the Pages workflow publishes only `dist/`) and has no public route.

- It is not part of the product and must never be linked from the public site.
- It still runs locally. Serve the repository root with any static server and open `/prototypes/slice-1-intro-lab/`.
  Its files reference the shared engine assets in `dist/` (`../../dist/styles.css`, `../../dist/transition-engine.js`,
  `../../dist/assets/*`), because the real Intro (account preview and public profile) reuses that same engine and stylesheet.
- `scripts/validate.mjs` still validates its structure, and `npm run typecheck` still syntax-checks `app.js`.
