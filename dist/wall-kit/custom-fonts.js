// Custom Wall fonts (2026-10-18). A text element names an uploaded font with payload.fontRef = "font:<font_id>" and keeps its catalog fontFamily as the fallback.
// The CSS family name is GENERATED from the validated id (never from the owner's file name or any other text), so nothing a user types can reach CSS; and the font
// is registered from its bytes with the FontFace API (no url(), so the page's font-src stays 'self'). Until the bytes arrive - or if the browser's own font
// sanitizer refuses them - the text simply shows in its catalog fallback. Loading the bytes is the caller's job (owner: the editor; visitors: the published Wall).
import { fontCss } from "./fonts.js";

export const CUSTOM_FONT_REF = /^font:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export const customFontId = ref => (typeof ref === "string" ? CUSTOM_FONT_REF.exec(ref)?.[1] ?? null : null);
export const customFontRef = id => `font:${id}`;
export const customFontFamily = ref => { const id = customFontId(ref); return id ? `GamID Custom ${id.replace(/-/g, "")}` : null; };
// the font-family value for a painted text element: its custom family first (when it names one), then its catalog stack
export function textFontCss(content) {
  const family = customFontFamily(content?.fontRef);
  const fallback = fontCss(content?.fontFamily);
  return family ? `"${family}", ${fallback}` : fallback;
}

const registered = new Map();
// -> true once the font is usable on this page; false if it could not be (bad bytes, no FontFace). Each font is registered once per page.
export function registerCustomFont(fontId, bytes, { fonts = globalThis.document?.fonts, FontFaceImpl = globalThis.FontFace } = {}) {
  const family = customFontFamily(customFontRef(fontId));
  if (!family || !bytes || !fonts || typeof FontFaceImpl !== "function") return Promise.resolve(false);
  if (registered.has(fontId)) return registered.get(fontId);
  const pending = (async () => {
    try { const face = new FontFaceImpl(family, bytes, { display: "swap" }); await face.load(); fonts.add(face); return true; }
    catch { return false; }
  })();
  registered.set(fontId, pending);
  pending.then(ok => { if (!ok) registered.delete(fontId); });
  return pending;
}
// A throwaway face for previewing a file before it is uploaded: -> the family name to draw the preview with, or null when the browser cannot use the file.
let previews = 0;
export async function previewFontFile(bytes, { fonts = globalThis.document?.fonts, FontFaceImpl = globalThis.FontFace } = {}) {
  if (!bytes || !fonts || typeof FontFaceImpl !== "function") return null;
  const family = `GamID Preview ${++previews}`;
  try { const face = new FontFaceImpl(family, bytes, { display: "swap" }); await face.load(); fonts.add(face); return family; }
  catch { return null; }
}
