// Pro Effects (2026-10-25): the letter mask an animated text effect builds its distance field from, laid out EXACTLY like the painted text (paint.js). This is Living
// Fire's layout (living-fire-engine.js, Bounding box fix 2026-10-19), which the Living Radiation V1 package ships unchanged; only the design frame is a parameter, so
// Living Ice V5 (a 1920 x 800 frame) uses the same rules. Living Fire keeps its own copy, unchanged.
//   - the same line breaks: wrap on = the box width, word by word, a word wider than the box broken anywhere; wrap off = only the text's own line breaks;
//   - the same alignment, CSS line boxes and line height; an overflowing line starts at its start edge, as CSS does;
//   - one design size that fits the frame (frame.sideRoom / frame.fitHeight), placed by frame.inkTop; the field records where the text box's top-left corner is, so
//     the caller pins that corner to the element's and every line sits where the painted text puts it.
export function breakLines(c, text, maxWidth) {
  const width = line => c.measureText(line).width;
  const lines = [];
  for (const paragraph of text.split("\n")) {
    if (!Number.isFinite(maxWidth)) { lines.push(paragraph); continue; }
    let line = "";
    const flushWord = word => {   // a word wider than the box: broken anywhere (overflow-wrap: anywhere)
      let part = "";
      for (const ch of Array.from(word)) { if (part && width((part + ch).trimEnd()) > maxWidth) { lines.push(part); part = ch; } else part += ch; }
      return part;
    };
    for (const token of paragraph.split(/(?<=\s)(?=\S)/)) {
      if (width((line + token).trimEnd()) <= maxWidth) { line += token; continue; }
      if (line) { lines.push(line.trimEnd()); line = ""; }
      line = width(token.trimEnd()) > maxWidth ? flushWord(token) : token;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// The V3 frame (1200 x 640): lines within 1000 design units, room above for flames / waves, the inked block at 58% (Living Fire and Living Radiation).
export const V3_FRAME = Object.freeze({ width: 1200, height: 640, sideRoom: 200, fitHeight: (ink, size) => (0.58 * 640) / (0.58 * ink + 0.8 * size), inkTop: ink => (640 - ink) * 0.58 });

export function layoutLetters(spec, frame) {
  const W = frame.width, H = frame.height;
  const mask = document.createElement("canvas"); mask.width = W; mask.height = H;
  const c = mask.getContext("2d", { willReadFrequently: true });
  const setSize = px => { c.font = `${spec.italic ? "italic " : ""}${spec.weight} ${px}px ${spec.family}`; if ("letterSpacing" in c) c.letterSpacing = `${spec.letterSpacing * px}px`; };
  // 1. line breaks at the reference size (wrapping scales with the font size, so the breaks hold at any size)
  setSize(spec.size);
  const lines = breakLines(c, spec.text, spec.wrap ? spec.boxEm * spec.size : Infinity);
  const measure = size => {
    setSize(size);
    const metrics = lines.map(line => c.measureText(line));
    const fontBox = c.measureText("Hg");
    const ascentFont = fontBox.fontBoundingBoxAscent || size * 0.8, descentFont = fontBox.fontBoundingBoxDescent || size * 0.2;
    const lineBox = spec.lineHeight * size;
    // the CSS line box: half-leading above, then the font ascent to the baseline
    const baselines = lines.map((_, i) => i * lineBox + (lineBox - ascentFont - descentFont) / 2 + ascentFont);
    const inked = metrics.map((m, i) => (lines[i].trim() ? i : -1)).filter(i => i >= 0);
    const top = inked.length ? Math.min(...inked.map(i => baselines[i] - (metrics[i].actualBoundingBoxAscent || size * 0.75))) : 0;
    const bottom = inked.length ? Math.max(...inked.map(i => baselines[i] + (metrics[i].actualBoundingBoxDescent || 0))) : lineBox;
    return { metrics, baselines, top, bottom, widths: metrics.map(m => m.width) };
  };
  // 2. the size: the widest line within the frame's side room, the inked block within its height rule
  const first = measure(spec.size);
  const widest = Math.max(1, ...first.widths), inkHeight = Math.max(1, first.bottom - first.top);
  const k = Math.min(1, (W - frame.sideRoom) / widest, frame.fitHeight(inkHeight, spec.size));
  const size = spec.size * k;
  const laid = k === 1 ? first : measure(size);
  // 3. each line where the painted text puts it in its box (an overflowing line starts at the start edge, as CSS does)
  const boxWidth = spec.boxEm * size;
  const offsets = laid.widths.map(w => (w > boxWidth ? (spec.rtl ? boxWidth - w : 0) : spec.align === "center" ? (boxWidth - w) / 2 : spec.align === "right" ? boxWidth - w : 0));
  const minX = Math.min(...offsets), maxX = Math.max(...offsets.map((x, i) => x + laid.widths[i]));
  const boxLeft = W / 2 - (minX + maxX) / 2;                          // design x of the box's left edge
  const boxTop = frame.inkTop(laid.bottom - laid.top) - laid.top;     // design y of the box's top edge
  c.fillStyle = "#fff"; c.textAlign = "left"; c.direction = spec.rtl ? "rtl" : "ltr";
  lines.forEach((line, i) => { if (line.trim()) c.fillText(line, boxLeft + offsets[i], boxTop + laid.baselines[i]); });
  return { mask: c.getImageData(0, 0, W, H), size, boxLeft, boxTop, lines: lines.length,
    bounds: { left: boxLeft + minX, right: boxLeft + maxX, top: boxTop + laid.top, bottom: boxTop + laid.bottom }, empty: !spec.text.trim() };
}
