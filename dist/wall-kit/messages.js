// Owner-facing wording for the Wall's typed error codes. Codes are the contract (tests pin them); this only decides what the editor SAYS.
const BY_CODE = {
  UNSAFE_PAYLOAD_CONTENT: "That text looks like HTML or script (for example <tag>, javascript: or onclick=). Wall text is plain text only, so it was not applied.",
  INVALID_TEXT: "The text is too long (2000 characters at most).",
  INVALID_FONT_SIZE: "Text size must be between 4 and 600.",
  INVALID_LINE_HEIGHT: "Line height must be between 0.5 and 4.",
  INVALID_LETTER_SPACING: "Letter spacing must be between -20 and 100.",
  INVALID_OPACITY: "Opacity must be between 0 and 100%.",
  INVALID_STROKE_WIDTH: "Border width must be between 0 and 100.",
  INVALID_RADIUS: "Corner radius must be between 0 and 1000.",
  OUTSIDE_CANVAS: "That would leave the stage, so it was not applied.",
  INVALID_KEEP_INSIDE: "That Keep inside stage setting is not valid, so it was not applied.",
  LAST_STAGE: "A Wall needs at least one stage.",
  STAGE_NOT_EMPTY: "This stage has elements on it.",
  // Wall Stages V2 (DEC-0011): My Stage / Friends Stage and the stage allowance
  STAGE_LIMIT: "Your Wall already has the most stages it can have.",
  WALL_STAGE_LIMIT: "Your Wall has more stages than it can have, so nothing was saved. Delete a stage, then save again.",
  LAST_MY_STAGE: "Your Wall needs at least one My Stage. Make another stage a My Stage first.",
  NO_MY_STAGE: "Your Wall needs at least one My Stage.",
  STAGE_NOT_EMPTY_FOR_FRIENDS: "Only an empty stage can become a Friends Stage. Move its elements to another stage (Move to stage) or delete them, and remove its own background, first.",
  STAGE_HAS_STICKERS: "This Friends Stage still has friends' stickers. Remove them first (Friends Stage panel), then try again.",
  FRIENDS_STAGE_ELEMENTS: "This is a Friends Stage: it is kept for your friends' stickers, so you can't add your own elements to it. Open a My Stage, or make this one a My Stage.",
  FRIENDS_STAGE_BACKGROUND: "A Friends Stage only takes a background from the GamID background catalog, so your own background can't be used here.",
  INVALID_STAGE_TYPE: "A stage is either a My Stage or a Friends Stage.",
  GROUP_NEEDS_TWO: "Select at least two elements to group.",
  NOT_GROUPED: "The selection is not grouped.",
  GROUP_ROTATION_UNSUPPORTED: "Groups can be moved and resized; rotate the elements before grouping them.",
  GROUP_ELEMENT_RESIZE_UNSUPPORTED: "Ungroup first to resize a single element of a group.",
  SELECTION_INVALID: "Select elements on one stage first.",
  NOT_AN_EMBED: "Select a link or media element first.",
  INVALID_ASPECT: "That shape is not available for this player.",
  NOT_A_GAMID_BLOCK: "Select a GamID block first.",
  NO_OTHER_GAMID_BLOCKS: "There are no other GamID blocks on this Wall to apply the style to.",
  INVALID_STYLE: "That block style is not valid, so it was not applied.",
  INVALID_STYLE_KEY: "That block style is not valid, so it was not applied.",
  // Round 3 - Artwork and live GamID data
  ELEMENT_LOCKED: "This artwork's position is locked. Unlock it (Properties > Layering, or the lock in Layers) to move or resize it.",
  NOT_AN_ARTWORK: "Select an artwork (an uploaded image) first.",
  INVALID_SPLIT: "An artwork splits into 2 to 5 pieces, vertically or horizontally.",
  ALREADY_SPLIT: "This artwork is already split. Remove the split first to split it differently.",
  ROTATED_SPLIT_UNSUPPORTED: "Reset the rotation before splitting this artwork.",
  UNGROUP_BEFORE_SPLIT: "Ungroup this artwork before splitting it (its pieces become their own group).",
  TOO_SMALL_TO_SPLIT: "The artwork is too small for that many pieces.",
  NOT_SPLIT: "This artwork is not split.",
  INVALID_BOUNDARY: "That split boundary cannot move there.",
  INVALID_FLIP: "That flip is not valid, so it was not applied.",
  INVALID_FADE: "An edge fade must be between 0 and 50%.",
  INVALID_MEDIA: "That media type is not available.",
  INVALID_LINK: "That link is not a valid https:// or http:// web address, so it was not applied.",
  INVALID_FIRE: "That Living Fire setting is not valid, so it was not applied.",
  INVALID_ICE: "That Living Ice setting is not valid, so it was not applied.",
  INVALID_RADIATION: "That Living Radiation setting is not valid, so it was not applied.",
  INVALID_SHAPE: "That shape is not available, so it was not applied.",
  INVALID_SHAPE_PARAMS: "That shape setting is out of range, so it was not applied.",
  INVALID_SHAPE_PATH: "That freeform shape needs at least 2 points (3 when closed) and at most 100, so it was not applied.",
  INVALID_LOCK_ASPECT: "That aspect ratio cannot be locked, so it was not applied.",
  // Icon Group (DEC-0006)
  INVALID_ICON_ITEMS: "An Icon Group holds 1 to 24 icons, so that was not applied.",
  INVALID_ICON_ITEM: "An icon's link must be a supported platform link or a valid https:// or http:// web address, so that was not applied.",
  INVALID_ICON_SIZE: "Icon size must be between 40 and 400.",
  INVALID_ICON_GAP: "Spacing must be between 0 and 200.",
  INVALID_ICON_ALIGN: "That alignment is not available.",
  VIDEO_SPLIT_UNSUPPORTED: "A video can't be split (its pieces would play out of step). Split a picture or GIF instead.",
  INVALID_BACKDROP: "The backing must be None or a colour.",
  INVALID_CROP: "That crop is not valid, so it was not applied.",
  INVALID_MASK: "That mask is not available.",
  INVALID_EFFECTS: "That effect value is out of range, so it was not applied.",
  INVALID_BLEND: "That blend mode is not available.",
  INVALID_SLICE: "That split piece is not valid.",
  INVALID_DATA_FIELD: "That GamID data field is not available.",
  INVALID_DATA_REF: "Choose one of your own roles, games or connections.",
  INVALID_DATA_KEY: "That option does not apply to this GamID data element.",
  INVALID_DATA_TEXT: "That text style is not valid, so it was not applied.",
  INVALID_DATA_LOOK: "That picture style is not valid, so it was not applied.",
  EMBED_KEPT_ON_TOP: "A video or music player always stays in front of anything it overlaps (nothing may be drawn over a player), so it was kept on top. Elements can sit behind it.",
  WALL_REVISION_CONFLICT: "A newer version of your Wall exists.",
  AUTH_REQUIRED: "Your session ended. Sign in again from your account, then come back.",
  IDENTITY_NOT_FOUND: "Create your GamID first, then come back to build your Wall.",
  WALL_DRAFT_NOT_FOUND: "Your Wall draft could not be found.",
  INVALID_WALL_DOCUMENT: "The Wall was rejected as invalid, so nothing was saved.",
  WALL_DOCUMENT_TOO_LARGE: "The Wall is too large to save (1 MiB limit).",
  WALL_ASSET_NOT_FOUND: "A picture on your Wall is no longer in your Assets, so nothing was saved. Remove it from the Wall or upload it again.",
  WALL_ASSET_IN_USE: "That image is still used on your Wall. Remove it from the Wall first.",
  WALL_ASSET_KIND_MISMATCH: "A video can only be a background, and a picture only an image or artwork, so nothing was saved.",
  STORED_DOCUMENT_INVALID: "The saved Wall could not be opened safely, so editing is blocked to protect it.",
  WALL_PERSISTENCE_FAILED: "Could not reach the server. Your edits are kept here; try again.",
  WALL_SAVE_FAILED: "Saving failed. Your edits are kept here; try again.",
  WALL_LOAD_FAILED: "Your Wall could not be loaded.",
};

export const errorCodeBase = code => String(code).split(":")[0];

// One friendly sentence per DISTINCT code family, in first-seen order.
export function describeErrors(codes) {
  const seen = new Set();
  const lines = [];
  for (const code of codes) {
    const base = errorCodeBase(code);
    if (seen.has(base)) continue;
    seen.add(base);
    lines.push(BY_CODE[base] ?? `That change is not allowed (${base}).`);
  }
  return lines;
}
export const describeCode = code => BY_CODE[errorCodeBase(code)] ?? "Something went wrong.";

// The editor's one message banner (post-Round 2 manual-acceptance fix: an informational notice - e.g. EMBED_KEPT_ON_TOP - used to stay on screen forever).
//   info(message)   a TRANSIENT notice (success, cancellation, a refused edit, a hint, the player z-order notice): hides itself after `delayMs` (~5 s)
//   error(message)  a PERSISTENT error that needs the owner's action (a save conflict, an expired session, ...): stays until dismissed / replaced
//   clearTransient() hides a transient notice now (stage / selection changed); a persistent error is left alone
//   dismiss()       hides whatever is shown (the Dismiss button)
// Each message gets a sequence number; a timer only hides the message it was started for, so an old timer can never clear a newer message.
export const TRANSIENT_NOTICE_MS = 5000;
export function createNotifier({ show, hide, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id), delayMs = TRANSIENT_NOTICE_MS }) {
  let sequence = 0, timer = null, current = null;   // current: { id, kind }
  const stop = () => { if (timer !== null) { clearTimer(timer); timer = null; } };
  const put = (message, kind) => {
    stop();
    if (!message) { current = null; hide(); return null; }
    const id = ++sequence;
    current = { id, kind };
    show(message, kind);
    if (kind === "info") timer = setTimer(() => { if (current?.id === id) { timer = null; current = null; hide(); } }, delayMs);
    return id;
  };
  return {
    info: message => put(message, "info"),
    error: message => put(message, "error"),
    clearTransient: () => { if (current?.kind === "info") put("", "info"); },
    dismiss: () => put("", "info"),
    get current() { return current ? { ...current } : null; },
  };
}

// The canvas status line: says plainly when the selection is one group (so it is clear the handles move / resize the group as one unit).
export function selectionSummary(elements) {
  if (!elements.length) return "";
  const groups = new Set(elements.map(element => element.groupId ?? null));
  if (groups.size === 1 && !groups.has(null)) return `Group of ${elements.length} selected`;
  return `${elements.length} selected`;
}

// The question asked before deleting ANY stage. It says what goes with it and that Undo brings it back (never "cannot be undone": it can).
export function stageDeleteQuestion(info) {
  if (!info) return "";
  const stage = `Stage ${info.number}`;
  if (info.elementCount > 0) return `${stage} has ${info.elementCount} element${info.elementCount === 1 ? "" : "s"}${info.hasBackground ? " and its own background" : ""}. Delete it and everything on it? You can undo this.`;
  if (info.hasBackground) return `${stage} has no elements but has its own background. Delete this stage? You can undo this.`;
  if (info.type === "friends") return `${stage} is a Friends Stage with ${info.stickerCount ?? 0} active sticker${info.stickerCount === 1 ? "" : "s"}. Delete this stage? You can undo this.`;
  return `${stage} is empty. Delete this stage? You can undo this.`;
}

// Why a stage cannot become a Friends Stage yet (DEC-0011): what is still on it, counted, and how to clear it. Nothing is removed for the owner.
export function friendsConversionBlocked(info) {
  const parts = [];
  if (info.elementCount > 0) parts.push(`${info.elementCount} element${info.elementCount === 1 ? "" : "s"}`);
  if (info.hasBackground) parts.push("its own background");
  return `Stage ${info.number} still has ${parts.join(" and ")}. Only an empty stage can become a Friends Stage: move its elements to another stage (Move to stage) or delete them${info.hasBackground ? ", and remove its background (Assets > Background, This stage only)" : ""}, then try again.`;
}
