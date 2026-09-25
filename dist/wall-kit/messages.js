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
  LAST_STAGE: "A Wall needs at least one stage.",
  STAGE_NOT_EMPTY: "This stage has elements on it.",
  GROUP_NEEDS_TWO: "Select at least two elements to group.",
  NOT_GROUPED: "The selection is not grouped.",
  GROUP_ROTATION_UNSUPPORTED: "Groups can be moved and resized; rotate the elements before grouping them.",
  GROUP_ELEMENT_RESIZE_UNSUPPORTED: "Ungroup first to resize a single element of a group.",
  SELECTION_INVALID: "Select elements on one stage first.",
  WALL_REVISION_CONFLICT: "A newer version of your Wall exists.",
  AUTH_REQUIRED: "Your session ended. Sign in again from your account, then come back.",
  IDENTITY_NOT_FOUND: "Create your GamID first, then come back to build your Wall.",
  WALL_DRAFT_NOT_FOUND: "Your Wall draft could not be found.",
  INVALID_WALL_DOCUMENT: "The Wall was rejected as invalid, so nothing was saved.",
  WALL_DOCUMENT_TOO_LARGE: "The Wall is too large to save (1 MiB limit).",
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
