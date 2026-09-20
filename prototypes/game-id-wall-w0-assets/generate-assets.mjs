// W0 sample-art generator (throwaway prototype tooling; not part of the product and not deployed).
//
// Renders the procedural PNG sample art used by the Game ID Wall W0 prototype into
//   dist/prototypes/game-id-wall-w0/assets/
// with no dependencies (Node's zlib only). All artwork is original and procedural: no third-party imagery.
//
//   node prototypes/game-id-wall-w0-assets/generate-assets.mjs
//
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist", "prototypes", "game-id-wall-w0", "assets");
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------------------------------------ PNG encoder
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    // choose the cheapest of filters None / Sub / Up per row (keeps smooth gradients small)
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    const prev = y ? rgba.subarray((y - 1) * stride, y * stride) : null;
    const candidates = [0, 1, 2].map(type => {
      const f = Buffer.alloc(stride);
      let cost = 0;
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? row[i - 4] : 0;
        const up = prev ? prev[i] : 0;
        const v = (row[i] - (type === 1 ? left : type === 2 ? up : 0)) & 255;
        f[i] = v;
        cost += v < 128 ? v : 256 - v;
      }
      return { type, f, cost };
    });
    const best = candidates.reduce((a, b) => (b.cost < a.cost ? b : a));
    raw[y * (stride + 1)] = best.type;
    best.f.copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ------------------------------------------------------------------------------------------------ tiny raster toolkit
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

class Canvas {
  constructor(w, h, fill = [0, 0, 0, 0]) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); if (fill[3] || fill[0] || fill[1] || fill[2]) for (let i = 0; i < w * h; i++) this.d.set(fill, i * 4); }
  // Porter-Duff "over" with straight (non-premultiplied) alpha, so transparent art keeps clean edges.
  over(x, y, rgb, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, da = this.d[i + 3] / 255, oa = a + da * (1 - a);
    if (oa <= 0) return;
    for (let c = 0; c < 3; c++) this.d[i + c] = (rgb[c] * a + this.d[i + c] * da * (1 - a)) / oa;
    this.d[i + 3] = oa * 255;
  }
  each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y); }
  glow(cx, cy, radius, rgb, strength = 1) { const r = Math.ceil(radius); for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(this.h, cy + r); y++) for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(this.w, cx + r); x++) { const t = 1 - Math.hypot(x - cx, y - cy) / radius; if (t > 0) this.over(x, y, rgb, strength * t * t * t); } }
  ring(cx, cy, radius, width, rgb, alpha = 1) { const r = radius + width + 3; for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(this.h, cy + r); y++) for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(this.w, cx + r); x++) { const d = Math.abs(Math.hypot(x - cx, y - cy) - radius); this.over(x, y, rgb, alpha * (1 - smooth(width / 2 - 1, width / 2 + 1, d))); } }
  line(x0, y0, x1, y1, width, rgb, alpha = 1) { const minx = Math.floor(Math.min(x0, x1) - width - 2), maxx = Math.ceil(Math.max(x0, x1) + width + 2), miny = Math.floor(Math.min(y0, y1) - width - 2), maxy = Math.ceil(Math.max(y0, y1) + width + 2); const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1; for (let y = Math.max(0, miny); y < Math.min(this.h, maxy); y++) for (let x = Math.max(0, minx); x < Math.min(this.w, maxx); x++) { const t = clamp01(((x - x0) * dx + (y - y0) * dy) / len2); const d = Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)); this.over(x, y, rgb, alpha * (1 - smooth(width / 2 - 1, width / 2 + 1, d))); } }
  rect(x0, y0, x1, y1, rgb, alpha = 1) { for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, Math.ceil(x1)); x++) this.over(x, y, rgb, alpha); }
  poly(points, rgb, alpha = 1) { const ys = points.map(p => p[1]); for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(this.h, Math.ceil(Math.max(...ys))); y++) { const xs = []; for (let i = 0; i < points.length; i++) { const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length]; if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax)); } xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.floor(xs[k])); x < Math.min(this.w, Math.ceil(xs[k + 1])); x++) this.over(x, y, rgb, alpha); } }
  png() { return encodePng(this.w, this.h, Buffer.from(this.d.buffer)); }
}
const save = (name, canvas) => { const buf = canvas.png(); writeFileSync(join(OUT, name), buf); console.log(`${name.padEnd(18)} ${canvas.w}x${canvas.h}  ${(buf.length / 1024).toFixed(0)} KB`); };

// ------------------------------------------------------------------------------------------------ 1. tall continuous Wall art (720 x 3840 = exactly three 9:16 stages)
{
  const W = 720, H = 3840, S = H / 3; // S = one stage in art pixels (1280)
  const c = new Canvas(W, H);
  const stops = [["#070512", 0], ["#1a0b3d", .16], ["#3a0f5e", .30], ["#12203f", .45], ["#0a3c52", .58], ["#2a0d48", .74], ["#0c0716", 1]].map(([h, p]) => [hex(h), p]);
  c.each((x, y) => { const t = y / (H - 1); let i = 0; while (i < stops.length - 2 && t > stops[i + 1][1]) i++; const [a, pa] = stops[i], [b, pb] = stops[i + 1]; const m = mix(a, b, smooth(pa, pb, t)); c.d.set([m[0], m[1], m[2], 255], (y * W + x) * 4); });
  const rnd = mulberry32(7);
  for (let i = 0; i < 260; i++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H); c.over(x, y, [255, 255, 255], 0.25 + rnd() * 0.6); if (rnd() > .8) c.over(x + 1, y, [200, 220, 255], .35); }
  // features that deliberately CROSS the seams (y = 1280 and y = 2560) so continuity is easy to judge
  c.glow(360, S, 520, hex("#ff3fb0"), .55);                       // glow centred on seam 1
  c.ring(360, S, 230, 8, hex("#ff7ad9"), .95);                    // ring straddling seam 1
  c.ring(360, S, 250, 3, hex("#ffffff"), .6);
  c.glow(150, 2 * S, 430, hex("#38e3ff"), .5);                    // glow centred on seam 2
  c.line(-40, 900, 780, 1700, 10, hex("#7cf0ff"), .9);            // streak crossing seam 1
  c.line(-40, 900, 780, 1700, 34, hex("#38e3ff"), .16);
  c.line(760, 2300, -40, 3100, 10, hex("#ffb84a"), .9);           // streak crossing seam 2
  c.line(760, 2300, -40, 3100, 34, hex("#ff8a1f"), .16);
  // skyline silhouettes at the foot of each stage (they end exactly at the seam)
  for (const base of [S, 2 * S, 3 * S]) { const r2 = mulberry32(base); let x = -20; while (x < W) { const w = 30 + Math.floor(r2() * 60), h = 90 + Math.floor(r2() * 230); c.rect(x, base - h, x + w, base, hex("#05030d"), .96); for (let k = 0; k < 6; k++) c.rect(x + 6 + (k % 3) * 16, base - h + 12 + Math.floor(k / 3) * 30, x + 14 + (k % 3) * 16, base - h + 20 + Math.floor(k / 3) * 30, hex(k % 2 ? "#ffd27a" : "#7cf0ff"), .55 + r2() * .3); x += w + 4 + Math.floor(r2() * 10); } }
  // subtle seam tick marks at both edges (alignment aid; they are 3px in art space, fully inside the art)
  for (const y of [S, 2 * S]) { c.rect(0, y - 1, 26, y + 2, [255, 255, 255], .5); c.rect(W - 26, y - 1, W, y + 2, [255, 255, 255], .5); }
  save("wall-art.png", c);
}

// ------------------------------------------------------------------------------------------------ 2. per-stage override art (720 x 1280): amber hex-grid
{
  const W = 720, H = 1280, c = new Canvas(W, H);
  c.each((x, y) => { const t = y / H; const m = mix(hex("#1d0f05"), hex("#5a2408"), smooth(0, 1, t)); c.d.set([m[0], m[1], m[2], 255], (y * W + x) * 4); });
  const R = 46;
  for (let row = -1; row < H / (R * 1.5) + 1; row++) for (let col = -1; col < W / (R * 1.74) + 1; col++) { const cx = col * R * 1.74 + (row % 2 ? R * .87 : 0), cy = row * R * 1.5; const pts = [0, 1, 2, 3, 4, 5].map(k => [cx + R * .9 * Math.cos(Math.PI / 6 + k * Math.PI / 3), cy + R * .9 * Math.sin(Math.PI / 6 + k * Math.PI / 3)]); for (let k = 0; k < 6; k++) c.line(pts[k][0], pts[k][1], pts[(k + 1) % 6][0], pts[(k + 1) % 6][1], 2, hex("#ff9a3c"), .38); }
  c.glow(360, 640, 420, hex("#ff7a18"), .35);
  save("stage-alt.png", c);
}

// ------------------------------------------------------------------------------------------------ 3. transparent "character" cut-out (640 x 960, genuine alpha)
{
  const W = 640, H = 960, c = new Canvas(W, H); // fully transparent
  const rimA = hex("#ff4fd8"), rimB = hex("#38e3ff"), dark = hex("#150a2a");
  c.glow(320, 470, 380, rimA, .28);                                 // soft halo: partially transparent pixels around the figure
  // hair spikes
  for (const [dx, h, w] of [[-150, 210, 90], [-70, 260, 100], [20, 290, 110], [110, 240, 100], [180, 190, 80]]) c.poly([[320 + dx - w / 2, 250], [320 + dx + 8, 250 - h], [320 + dx + w / 2, 250]], mix(hex("#7a3bff"), hex("#ff4fd8"), (dx + 150) / 330), 1);
  // torso + shoulders
  c.poly([[130, 960], [170, 610], [260, 545], [380, 545], [470, 610], [510, 960]], dark, 1);
  c.poly([[190, 960], [215, 640], [275, 600], [365, 600], [425, 640], [450, 960]], mix(hex("#2a1a55"), hex("#452a8a"), .5), 1);
  c.poly([[110, 640], [190, 585], [235, 640], [160, 690]], hex("#ff4fd8"), 1);                 // shoulder plates
  c.poly([[530, 640], [450, 585], [405, 640], [480, 690]], hex("#38e3ff"), 1);
  // head
  for (let y = 180; y < 560; y++) for (let x = 150; x < 490; x++) { const dx = (x - 320) / 165, dy = (y - 380) / 185; const d = Math.hypot(dx, dy); if (d < 1) c.over(x, y, mix(hex("#f2c9b5"), hex("#d99b86"), clamp01((y - 300) / 260)), 1 - smooth(.985, 1, d)); }
  // visor
  c.poly([[190, 330], [450, 330], [470, 405], [170, 405]], hex("#0b1030"), 1);
  c.poly([[200, 345], [440, 345], [455, 392], [185, 392]], mix(hex("#38e3ff"), hex("#ff4fd8"), .35), .95);
  c.rect(215, 360, 425, 366, [255, 255, 255], .55);
  // neon rim light (an outline that fades to alpha at the outer edge)
  c.line(130, 960, 170, 610, 7, rimA, .95); c.line(510, 960, 470, 610, 7, rimB, .95); c.line(170, 610, 260, 545, 6, rimA, .9); c.line(470, 610, 380, 545, 6, rimB, .9);
  save("character.png", c);
}

// ------------------------------------------------------------------------------------------------ 4. ordinary opaque image (800 x 450, "game screenshot" feel)
{
  const W = 800, H = 450, c = new Canvas(W, H);
  c.each((x, y) => { const t = y / H; const m = mix(hex("#ff9a5a"), hex("#3b1b6b"), smooth(0, .8, t)); c.d.set([m[0], m[1], m[2], 255], (y * W + x) * 4); });
  c.glow(560, 190, 230, hex("#fff2b0"), .85);
  const r = mulberry32(21); for (const [base, shade, amp] of [[300, "#3a2359", 90], [345, "#22143d", 70], [400, "#120a24", 55]]) { let y0 = base; const pts = [[0, H]]; for (let x = 0; x <= W; x += 40) { y0 = base - amp * (0.4 + r() * .6); pts.push([x, y0]); } pts.push([W, H]); c.poly(pts, hex(shade), 1); }
  c.rect(24, 24, 250, 40, [0, 0, 0], .45); c.rect(24, 24, 24 + 200 * .72, 40, hex("#6ef0b5"), .95); c.rect(24, 46, 250, 58, [0, 0, 0], .45); c.rect(24, 46, 24 + 200 * .45, 58, hex("#38e3ff"), .95);
  c.ring(690, 70, 34, 4, [255, 255, 255], .8); c.line(690, 70, 700, 52, 4, [255, 255, 255], .9);
  save("photo.png", c);
}

// ------------------------------------------------------------------------------------------------ 5. decorative frame plate (1000 x 600) for the "frame BEHIND the embed" test
{
  const W = 1000, H = 600, c = new Canvas(W, H);
  c.rect(0, 0, W, H, hex("#12082a"), 1);
  for (let i = 0; i < 6; i++) { const inset = 4 + i * 3; c.rect(inset, inset, W - inset, inset + 3, mix(hex("#ff4fd8"), hex("#38e3ff"), i / 5), .95 - i * .1); c.rect(inset, H - inset - 3, W - inset, H - inset, mix(hex("#38e3ff"), hex("#ff4fd8"), i / 5), .95 - i * .1); c.rect(inset, inset, inset + 3, H - inset, mix(hex("#ff4fd8"), hex("#38e3ff"), i / 5), .95 - i * .1); c.rect(W - inset - 3, inset, W - inset, H - inset, mix(hex("#38e3ff"), hex("#ff4fd8"), i / 5), .95 - i * .1); }
  for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) c.glow(x, y, 120, hex("#ff4fd8"), .55);
  save("frame.png", c);
}
