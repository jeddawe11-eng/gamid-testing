// Universal deletion (Mazen's approved contract 2026-10-21, revised the same day: every permanent deletion is confirmed) - ONE flow for every place the editor
// deletes an owner's Wall resource (Assets, the Background panel's images and videos, My Fonts; desktop and phone use the same panels):
//   NOT IN USE -> a simple confirmation ("not currently in use", permanent, cannot be undone, Cancel / Delete) - no usage list;
//   IN USE     -> the detailed confirmation: the name, where it is used, what deleting it does, the published Wall, Cancel / Delete (Cancel is the default);
//   CONFIRM    -> deleted, and every reference to it is removed - in the Wall being edited (and its undo history) and, in the same database transaction, in the
//                 saved draft and the published Wall (migration 20261022100000_universal_delete_resolve.sql);
//   CANCEL     -> nothing changes, and nothing has been sent.
// "In use" is the Wall being edited (unsaved edits included), the saved draft this editor holds, and what the server knows (the published Wall; for fonts the
// listed in_draft / in_published). A deletion confirmed as "not in use" is sent with resolve = false, so the server deletes it ONLY if it is still unused; if the
// server finds it used after all (an older published Wall, another tab), nothing is deleted and the SAME dialog switches to the detailed confirmation. Nothing is
// ever half done: the server deletes and resolves in one transaction, the editor follows only a confirmed result, and an unknown outcome (a dropped connection) is
// settled by re-reading the authoritative list before anything is reported. One deletion at a time; repeated clicks while one runs do nothing.
import * as ops from "../wall-kit/ops.js";
import { FONT_CATALOG } from "../wall-kit/fonts.js";
import { isVideoAsset } from "../wall-kit/assets.js";

const READY = new Set(["saved", "unsaved", "error"]);   // the editor knows its saved revision (not loading / saving / in conflict / blocked)
const MESSAGES = {
  WALL_REVISION_CONFLICT: "Your Wall was saved somewhere else a moment ago (another tab?), so nothing was deleted. Reload the latest version, then delete again.",
  SAVE_IN_PROGRESS: "Your Wall is being saved. Wait a moment, then delete again.",
  EDITOR_NOT_READY: "Sort out the save problem shown at the top first, then delete again.",
  NETWORK_ERROR: "The connection dropped and nothing was deleted. Check it and try again.",
  AUTH_REQUIRED: "Sign in again, then delete again.",
};
// the GamID code of a failure (the account client puts the database's code in the message and PostgREST's in `code`)
const codeOf = error => { const message = String(error?.message ?? ""); return /^[A-Z][A-Z0-9_]+$/.test(message) ? message : String(error?.code || "DELETE_FAILED"); };
const sizeLabel = bytes => (bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.max(1, Math.round((bytes || 0) / 1024))} KB`);
const fontLabel = key => FONT_CATALOG.find(font => font.key === key)?.label ?? "the standard font";
const list = items => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const STORAGE_PENDING = " Its stored file could not be removed yet, so it still counts toward your storage for now.";

// The library font(s) the texts using a custom font fall back to (each text keeps its own catalog fontFamily).
function fallbackFonts(doc, fontId) {
  const ref = `font:${fontId}`, keys = new Set();
  for (const stage of doc.stages) for (const element of stage.elements) if (element.payload?.fontRef === ref) keys.add(element.payload.fontFamily);
  return [...keys].map(fontLabel);
}

// What one deletable resource is, for the flow: how to find its uses, how to remove its references, how to delete it.
function assetResource(assets, asset) {
  const video = isVideoAsset(asset), noun = video ? "video" : "image";
  return {
    kind: "asset", id: asset.asset_id, noun, store: assets,
    name: `${video ? `${asset.mime_type === "video/webm" ? "WebM" : "MP4"} video` : "Image"} · ${asset.width}×${asset.height} · ${sizeLabel(asset.byte_size)}`,
    usage: doc => ops.assetUsage(doc, asset.asset_id),
    strip: doc => ops.removeAssetReferences(doc, asset.asset_id).doc,
    consequence: () => `Deleting it removes the ${noun} from every place it is used${video ? "" : " (as a picture or a background)"}. Everything else on your Wall stays as it is.`,
    published: null,   // asked of the server only when needed (the server checks the published Wall itself)
  };
}
function fontResource(fonts, font, doc) {
  return {
    kind: "font", id: font.font_id, noun: "font", store: fonts,
    name: font.display_name,
    usage: current => ops.fontUsage(current, font.font_id),
    strip: current => ops.removeFontReferences(current, font.font_id).doc,
    consequence: () => {
      const fallbacks = fallbackFonts(doc(), font.font_id);
      return `Text that uses it keeps its words, position and other styling, and its appearance changes: it switches to ${fallbacks.length ? `its library font (${list(fallbacks)})` : "its library font"}.`;
    },
    published: font.in_published === true,
    inDraft: font.in_draft === true,
  };
}

// session: the editor session (wall-kit/session.js). confirm(details, run): shows the confirmation (details.inUse picks the simple or the detailed one); `run`
// performs the deletion and resolves to the outcome, which confirm resolves to (Cancel resolves to null) - or to { status: "confirm-again", details, run } when the
// server found the resource still in use: confirm then shows those details and asks again. onDeleted({ kind, id, publishedChanged }): the editor refreshes what
// depends on it (publication status).
export function createDeleteFlow({ session, assets, fonts, confirm, onDeleted = () => {} }) {
  let busy = false;

  function settle(resource, { draftRevision = null, publishedChanged = false, storageCleanup = "none" } = {}, text) {
    session.rebase(draftRevision, resource.strip);
    onDeleted({ kind: resource.kind, id: resource.id, publishedChanged });
    return { status: "deleted", message: `${text}${storageCleanup === "pending" ? STORAGE_PENDING : ""}` };
  }
  // A failure. The deletion may still have happened when the answer was lost (a dropped connection): the authoritative list decides, never a guess.
  async function failure(resource, error) {
    const code = codeOf(error);
    if (code === "WALL_REVISION_CONFLICT" || code === "AUTH_REQUIRED") return { status: "failed", code, message: MESSAGES[code] };
    let present = true;
    try {
      await resource.store.refresh();
      present = resource.kind === "font" && resource.store.state?.failed ? true : resource.store.has(resource.id);
    } catch { present = true; }
    if (!present) {
      // it is gone on the server: take its references out here too. The saved draft may have changed with it, so when nothing else is unsaved the editor reloads
      // the server's draft; otherwise the next Save meets the normal "newer version" choice - nothing is ever overwritten silently.
      const outcome = settle(resource, {}, `"${resource.name}" was deleted.`);
      if (!session.dirty) await session.reloadLatest();
      return outcome;
    }
    return { status: "failed", code, message: MESSAGES[code] ?? `"${resource.name}" could not be deleted, and nothing changed. Try again.` };
  }
  async function resolveNow(resource) {
    if (session.status === "saving") return { status: "failed", code: "SAVE_IN_PROGRESS", message: MESSAGES.SAVE_IN_PROGRESS };
    if (!READY.has(session.status)) return { status: "failed", code: "EDITOR_NOT_READY", message: MESSAGES.EDITOR_NOT_READY };
    let answer;
    try { answer = await resource.store.deleteResolving(resource.id, { resolve: true, expectedRevision: session.state.revision }); }
    catch (error) { return failure(resource, error); }
    if (!answer.deleted) return { status: "failed", code: "DELETE_FAILED", message: `"${resource.name}" could not be deleted, and nothing changed. Try again.` };
    const where = [answer.inDraft ? "your saved Wall" : null, answer.inPublished ? "your published Wall" : null].filter(Boolean);
    return settle(resource, answer, `"${resource.name}" was deleted${where.length ? ` and removed from ${list(where)}` : ""}.`);
  }

  // The detailed confirmation's content. `server` (optional): the server's own answer that it is still used.
  function usedDetails(resource, local, { savedOnly = false, published = resource.published } = {}) {
    const places = [...local];
    if (savedOnly) places.push("your saved Wall (you removed it here, but that is not saved yet)");
    if (published === true) places.push("your published Wall");
    return {
      kind: resource.kind, noun: resource.noun, name: resource.name, inUse: true, places,
      publishedNote: published === null ? `If your published Wall shows this ${resource.noun}, it is removed there too.` : null,
      consequence: resource.consequence(),
    };
  }
  async function remove(resource) {
    const local = resource.usage(session.doc);
    const saved = session.savedDocument;
    const savedOnly = !local.length && !!saved && resource.usage(saved).length > 0;
    const usedByFontList = resource.kind === "font" && (resource.inDraft || resource.published === true);
    let outcome;
    if (local.length || savedOnly || usedByFontList) {
      outcome = await confirm(usedDetails(resource, local, { savedOnly: savedOnly || (!local.length && resource.inDraft === true) }), () => resolveNow(resource));
    } else {
      // not in use as far as the editor knows: the simple confirmation. On Delete the server deletes it only if it is STILL unused (resolve = false); if the
      // published Wall (or another tab's save) uses it after all, nothing is deleted and the dialog turns into the detailed confirmation.
      const simple = { kind: resource.kind, noun: resource.noun, name: resource.name, inUse: false, places: [], publishedNote: null, consequence: "" };
      outcome = await confirm(simple, async () => {
        let server;
        try { server = await resource.store.deleteResolving(resource.id, { resolve: false }); }
        catch (error) { return failure(resource, error); }
        if (server.deleted) return settle(resource, server, `"${resource.name}" was deleted.`);
        return { status: "confirm-again", details: usedDetails(resource, [], { savedOnly: server.inDraft, published: server.inPublished }), run: () => resolveNow(resource) };
      });
    }
    return outcome ?? { status: "cancelled", message: "" };
  }

  async function guarded(resource) {
    if (busy) return { status: "busy", message: "" };
    busy = true;
    try { return await remove(resource); } finally { busy = false; }
  }
  return {
    get busy() { return busy; },
    deleteAsset: asset => guarded(assetResource(assets, asset)),
    deleteFont: font => guarded(fontResource(fonts, font, () => session.doc)),
  };
}

// The confirmation: a native modal <dialog> (top layer - never clipped by a panel or a bottom sheet, focus kept inside, Escape = Cancel). Cancel has the focus.
//   not in use (details.inUse false): "This <noun> is not currently in use." + permanent / cannot be undone - no usage list;
//   in use: the name, where it is used, the consequence, the published Wall, permanent / cannot be undone.
// While the deletion runs both buttons are disabled and the dialog stays open; it closes with the outcome, or - when the server says the resource is still used
// ("confirm-again") - shows the detailed confirmation in place and waits for the owner again. -> Promise<outcome | null (cancelled)>
export function openDeleteDialog(documentRef, details, run) {
  const h = (tag, attributes = {}, ...children) => {
    const node = documentRef.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) { if (key === "class") node.className = value; else if (key === "text") node.textContent = value; else node.setAttribute(key, value); }
    for (const child of children) if (child) node.append(child);
    return node;
  };
  const bodyFor = shown => (shown.inUse
    ? [h("p", { class: "ed-delete-name", text: shown.name }),
      h("p", { text: `This ${shown.noun} is in use:` }),
      h("ul", { class: "ed-delete-places" }, ...shown.places.map(place => h("li", { text: place }))),
      h("p", { text: shown.consequence }),
      shown.publishedNote ? h("p", { text: shown.publishedNote }) : null,
      h("p", { class: "ed-delete-final", text: "This deletes it permanently. It cannot be undone." })]
    : [h("p", { class: "ed-delete-name", text: shown.name }),
      h("p", { text: `This ${shown.noun} is not currently in use.` }),
      h("p", { text: "Are you sure you want to permanently delete it?" }),
      h("p", { class: "ed-delete-final", text: "This action cannot be undone." })]).filter(Boolean);
  return new Promise(resolve => {
    const titleId = `deleteTitle-${Date.now()}`;
    let current = details, perform = run;
    const cancel = h("button", { class: "ed-btn", type: "button", text: "Cancel" });
    const confirmButton = h("button", { class: "ed-btn ed-delete-confirm", type: "button", text: `Delete ${details.noun}` });
    const status = h("p", { class: "ed-delete-status", role: "status" });
    const body = h("div", { class: "ed-delete-body" }, ...bodyFor(details));
    const dialog = h("dialog", { class: "ed-delete-dialog", "aria-labelledby": titleId },
      h("h2", { id: titleId, text: `Delete this ${details.noun}?` }), body, status, h("div", { class: "ed-delete-actions" }, cancel, confirmButton));
    let running = false, finished = false;
    const finish = outcome => { if (finished) return; finished = true; if (dialog.open) dialog.close(); dialog.remove(); resolve(outcome); };
    const ready = (message = "") => { cancel.disabled = false; confirmButton.disabled = false; confirmButton.textContent = `Delete ${current.noun}`; status.textContent = message; };
    cancel.addEventListener("click", () => { if (!running) finish(null); });
    dialog.addEventListener("cancel", event => { event.preventDefault(); if (!running) finish(null); });   // Escape
    confirmButton.addEventListener("click", async () => {
      if (running) return;
      running = true; cancel.disabled = true; confirmButton.disabled = true; confirmButton.textContent = "Deleting…"; status.textContent = "";
      const outcome = await perform();
      running = false;
      if (outcome?.status === "failed" && outcome.code === "SAVE_IN_PROGRESS") { ready(outcome.message); return; }   // wait, then press Delete again
      if (outcome?.status === "confirm-again") {   // still in use after all: nothing was deleted - show where, and ask again
        current = outcome.details; perform = outcome.run;
        body.replaceChildren(...bodyFor(current));
        ready("Nothing was deleted yet: it is still in use, as listed above.");
        cancel.focus({ preventScroll: true });
        return;
      }
      finish(outcome);
    });
    documentRef.body.append(dialog);
    dialog.showModal();
    cancel.focus({ preventScroll: true });   // the title stays in view; the buttons are pinned to the bottom (editor.css)
  });
}