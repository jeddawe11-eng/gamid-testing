// The Wall's shared tap / pointer policy for painted Walls (Preview and, later, a visitor's Wall).
//
// Every painted element wrapper (`.wall-el`) is `pointer-events: none` in EVERY mode, so an element's rectangular box - including its visually empty parts (the
// space around a line of text, a transparent shape, a block's padding) - never swallows a tap meant for something underneath it. Only the parts of an element that
// really are controls opt back in, and only in VIEW mode, by being marked with markInteractive(): a link/card, a player facade, a playing inline player and its Close,
// a GamID block's own controls (the Games list and its Show all / Show fewer). A future interactive control uses the same call; nothing is provider- or block-specific.
//
// The editor never relies on this: in EDIT mode nothing is marked and the canvas hit-tests the document itself (ops.hitTest), so selection and dragging are unaffected.
export const INTERACTIVE_ATTR = "data-wall-interactive";

export function markInteractive(node) {
  node.setAttribute(INTERACTIVE_ATTR, "true");
  node.style.setProperty("pointer-events", "auto");
  return node;
}

export function markPassThrough(node) {
  node.style.setProperty("pointer-events", "none");
  return node;
}
