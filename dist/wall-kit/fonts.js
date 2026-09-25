// The built-in typeface catalog. A text payload stores only a catalog KEY (e.g. "orbitron"); this module maps the key to a CSS family stack at paint time.
// The catalog is deliberately separate from validation: a payload's fontFamily is only checked for FORMAT (a short kebab-case key), so growing this list - or
// later resolving keys from a larger catalog, or an opaque `fontRef` to an uploaded font asset - never requires a document change or a database change.
// An unknown key simply paints with the fallback stack. Bundled files are OFL-licensed WOFF2 served from this site (see fonts/LICENSES.txt); the rest are
// system stacks, so nothing is ever fetched from a third-party host.
export const FONT_KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const FONT_CATALOG = Object.freeze([
  { key: "orbitron", label: "Orbitron", group: "Gaming", css: '"GamID Orbitron", "Segoe UI", system-ui, sans-serif', bundled: true },
  { key: "bebas-neue", label: "Bebas Neue", group: "Gaming", css: '"GamID Bebas", Impact, "Arial Narrow", sans-serif', bundled: true },
  { key: "russo-one", label: "Russo One", group: "Gaming", css: '"GamID Russo", "Arial Black", system-ui, sans-serif', bundled: true },
  { key: "rajdhani", label: "Rajdhani", group: "Gaming", css: '"GamID Rajdhani", "Segoe UI", system-ui, sans-serif', bundled: true },
  { key: "chakra-petch", label: "Chakra Petch", group: "Gaming", css: '"GamID Chakra", "Segoe UI", system-ui, sans-serif', bundled: true },
  { key: "system-sans", label: "Clean sans", group: "System", css: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { key: "system-rounded", label: "Rounded", group: "System", css: 'ui-rounded, "SF Pro Rounded", "Trebuchet MS", "Segoe UI", sans-serif' },
  { key: "system-condensed", label: "Condensed", group: "System", css: '"Roboto Condensed", "Arial Narrow", "Helvetica Neue Condensed", sans-serif' },
  { key: "system-display", label: "Heavy display", group: "System", css: 'Impact, "Arial Black", "Helvetica Neue", sans-serif' },
  { key: "system-serif", label: "Serif", group: "System", css: 'Georgia, "Times New Roman", Times, serif' },
  { key: "system-mono", label: "Monospace", group: "System", css: 'ui-monospace, SFMono-Regular, Consolas, Menlo, "Courier New", monospace' },
  { key: "system-handwriting", label: "Handwriting", group: "System", css: '"Segoe Script", "Bradley Hand", "Comic Sans MS", cursive' },
]);

export const FALLBACK_FONT_CSS = FONT_CATALOG.find(font => font.key === "system-sans").css;
export const fontCss = key => FONT_CATALOG.find(font => font.key === key)?.css ?? FALLBACK_FONT_CSS;
export const fontKnown = key => FONT_CATALOG.some(font => font.key === key);
