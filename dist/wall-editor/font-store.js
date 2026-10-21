// The owner's custom fonts in the editor (2026-10-18): the list (with the server's 3-font limit), their bytes registered on this page so the canvas and Preview draw
// them, and upload / delete (by the universal deletion rule, see delete-flow.js) through the account client. Every rule (format, size, quota, limit, ownership, in-use) is decided on the server; this only keeps the
// list in step and reports what happened.
import { registerCustomFont } from "../wall-kit/custom-fonts.js";

export function createFontStore({ api, onChange = () => {} }) {
  let userId = null;
  let state = { limit: 3, fonts: [], loaded: false, failed: false };
  const usable = new Set();
  const changed = () => onChange(state);
  async function registerAll(fonts) {
    await Promise.all(fonts.filter(font => !usable.has(font.font_id)).map(async font => {
      try { if (await registerCustomFont(font.font_id, await api.loadWallFont(font.storage_path))) usable.add(font.font_id); }
      catch { /* the text keeps its catalog fallback */ }
    }));
  }
  async function refresh() {
    try {
      const { limit, fonts } = await api.listWallFonts();
      state = { limit, fonts, loaded: true, failed: false };
      changed();
      await registerAll(fonts);
      changed();
    } catch {
      state = { ...state, loaded: true, failed: true };
      changed();
    }
    return state;
  }
  // -> the registered font row ({ duplicate: true } when this exact font was already in My Fonts)
  async function upload(file, { name, licenseAccepted }) {
    const font = await api.uploadWallFont(file, userId, { name, licenseAccepted });
    await refresh();
    return font;
  }
  // Deletion, by the universal rule (delete-flow.js decides when; see assets.js deleteResolving) -> the server's answer; a deleted font leaves My Fonts at once.
  async function deleteResolving(fontId, options) {
    const result = await api.deleteWallFontResolving(fontId, options);
    if (result.deleted) {
      usable.delete(fontId);
      state = { ...state, fonts: state.fonts.filter(font => font.font_id !== fontId) };
      changed();
      await refresh();
    }
    return result;
  }
  return {
    setUserId(id) { userId = id; },
    refresh, upload, deleteResolving,
    has: fontId => state.fonts.some(font => font.font_id === fontId),
    isUsable: fontId => usable.has(fontId),
    get state() { return state; },
  };
}
