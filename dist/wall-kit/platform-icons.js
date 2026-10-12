// Platform icons for the Wall (Product Memory DEC-0006): the ONE badge look of the Wall's Icon display option and Icon Group - the accepted Classic My Socials badge.
// Each provider adapter declares its own badge (`icon` in dist/wall-kit/embed/providers/*.js: its platform colour and the Classic mark or glyph - the Classic marks
// are the same static SVG data-URI masks, kept byte-identical to dist/public/public.css by tests/wall-icons.test.js); this module only holds what no provider owns:
// the generic link icon for "Other" and the shared drawing constants. Nothing here comes from a document: a badge is chosen by its provider key only.
//
//   background  the badge fill (a colour, or a fixed gradient)      ring   an optional inner ring { color, width as a share of the badge }
//   color       the mark / glyph colour
//   mark        a CSS url() mask drawn at the Classic inset (MARK_INSET)  -or-  glyph  the Classic text mark, glyphScale = its size as a share of the badge
import { PROVIDERS } from "./embed/engine.js";

export const MARK_INSET = 0.24;
// Other: a generic chain link, drawn here (two rounded links), on the Classic badge's neutral fill
export const OTHER_ICON = Object.freeze({ background: "#2b2738", color: "#ffffff", mark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10.2 13.8a4.2 4.2 0 0 0 5.9 0l3.4-3.4a4.2 4.2 0 0 0-5.9-5.9l-1.4 1.4' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M13.8 10.2a4.2 4.2 0 0 0-5.9 0l-3.4 3.4a4.2 4.2 0 0 0 5.9 5.9l1.4-1.4' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")" });
// The badge for a provider key; "other" (and anything without a declared badge) is the generic link icon - never a guessed brand.
export const iconKeyFor = key => (key !== "other" && PROVIDERS.get(key)?.icon ? key : "other");
export const platformIcon = key => (iconKeyFor(key) === "other" ? OTHER_ICON : PROVIDERS.get(key).icon);
