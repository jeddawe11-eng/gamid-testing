// GAME ID WALL - W0 PROTOTYPE - renders the same sample Wall at several CSS widths (emulation only; real devices are tested by hand).
const SIZES = [
  { label: "360 px phone (narrowest supported)", w: 360, h: 740 },
  { label: "390 px phone", w: 390, h: 740 },
  { label: "412 px phone (typical Samsung)", w: 412, h: 740 },
  { label: "768 px tablet", w: 768, h: 740 },
  { label: "Desktop 560 px column", w: 1100, h: 740, col: 560 },
  { label: "Desktop 640 px column", w: 1100, h: 740, col: 640 },
  { label: "Desktop 720 px column", w: 1100, h: 740, col: 720 },
];
const grid = document.getElementById("grid");
const q = new URLSearchParams(location.search);
for (const size of SIZES) {
  const item = document.createElement("div"); item.className = "vp-item";
  const title = document.createElement("h3"); title.textContent = size.label;
  const frame = document.createElement("iframe");
  frame.setAttribute("title", size.label);
  frame.setAttribute("width", String(size.w)); frame.setAttribute("height", String(size.h));
  const src = new URL("wall-view.html", location.href);
  if (size.col) src.searchParams.set("col", String(size.col));
  if (q.has("wall")) src.searchParams.set("wall", q.get("wall"));
  src.searchParams.set("diag", "1");
  frame.setAttribute("src", src.href);
  item.append(title, frame); grid.append(item);
}
