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
  // Fantasy & Gothic and Luxury Signature & Script (Phase 2 of the desktop Text redesign): OFL, bundled WOFF2 latin subsets (see fonts/LICENSES.txt and OFL-NOTICES.txt)
  { key: "cinzel-decorative", label: "Cinzel Decorative", group: "Fantasy & Gothic", css: '"GamID Cinzel Decorative", Georgia, "Times New Roman", serif', bundled: true },
  { key: "unifraktur-cook", label: "UnifrakturCook", group: "Fantasy & Gothic", css: '"GamID UnifrakturCook", "Old English Text MT", Georgia, serif', bundled: true },
  { key: "pirata-one", label: "Pirata One", group: "Fantasy & Gothic", css: '"GamID Pirata One", "Old English Text MT", Georgia, serif', bundled: true },
  { key: "eagle-lake", label: "Eagle Lake", group: "Fantasy & Gothic", css: '"GamID Eagle Lake", Georgia, "Times New Roman", serif', bundled: true },
  { key: "metal-mania", label: "Metal Mania", group: "Fantasy & Gothic", css: '"GamID Metal Mania", Impact, "Arial Black", fantasy, sans-serif', bundled: true },
  { key: "great-vibes", label: "Great Vibes", group: "Luxury Signature & Script", css: '"GamID Great Vibes", "Segoe Script", "Bradley Hand", cursive', bundled: true },
  { key: "alex-brush", label: "Alex Brush", group: "Luxury Signature & Script", css: '"GamID Alex Brush", "Segoe Script", "Bradley Hand", cursive', bundled: true },
  { key: "pinyon-script", label: "Pinyon Script", group: "Luxury Signature & Script", css: '"GamID Pinyon Script", "Segoe Script", "Bradley Hand", cursive', bundled: true },
  { key: "italianno", label: "Italianno", group: "Luxury Signature & Script", css: '"GamID Italianno", "Segoe Script", "Bradley Hand", cursive', bundled: true },
  { key: "tangerine", label: "Tangerine", group: "Luxury Signature & Script", css: '"GamID Tangerine", "Segoe Script", "Bradley Hand", cursive', bundled: true },
  { key: "ballet", label: "Ballet", group: "Luxury Signature & Script", css: '"GamID Ballet", "Segoe Script", "Bradley Hand", cursive', bundled: true },
  { key: "system-sans", label: "Clean sans", group: "System & Classic", css: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { key: "system-rounded", label: "Rounded", group: "System & Classic", css: 'ui-rounded, "SF Pro Rounded", "Trebuchet MS", "Segoe UI", sans-serif' },
  { key: "system-condensed", label: "Condensed", group: "System & Classic", css: '"Roboto Condensed", "Arial Narrow", "Helvetica Neue Condensed", sans-serif' },
  { key: "system-display", label: "Heavy display", group: "System & Classic", css: 'Impact, "Arial Black", "Helvetica Neue", sans-serif' },
  { key: "system-serif", label: "Serif", group: "System & Classic", css: 'Georgia, "Times New Roman", Times, serif' },
  { key: "system-mono", label: "Monospace", group: "System & Classic", css: 'ui-monospace, SFMono-Regular, Consolas, Menlo, "Courier New", monospace' },
  { key: "system-handwriting", label: "Handwriting", group: "System & Classic", css: '"Segoe Script", "Bradley Hand", "Comic Sans MS", cursive' },
]);

export const FALLBACK_FONT_CSS = FONT_CATALOG.find(font => font.key === "system-sans").css;
export const fontCss = key => FONT_CATALOG.find(font => font.key === key)?.css ?? FALLBACK_FONT_CSS;
export const fontKnown = key => FONT_CATALOG.some(font => font.key === key);
