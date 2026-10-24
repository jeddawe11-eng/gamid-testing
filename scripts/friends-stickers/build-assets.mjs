// Friends Stickers V1 (Mazen's task 2026-10-24): builds the served sticker files from the supplied originals. One-off asset tool, not part of the site.
//   node scripts/friends-stickers/build-assets.mjs <GAMID_PREMIUM_ANIMATED_14 folder> [maxEdge=384] [quality=80]
// For each of the 14 stickers:
//   - <key>.webp        the ORIGINAL animated WebP (ANIMATED_WEBP/) decoded frame by frame in Chrome (WebCodecs ImageDecoder) and re-encoded by FFmpeg (libwebp_anim):
//                       every frame, the 24 fps timing, infinite loop and the alpha channel kept; only the size changes (longest edge <= maxEdge). The artwork is
//                       not redrawn or retimed.
//   - <key>-still.webp  the STATIC master (STATIC_MASTERS/*.png), resized the same way: the picker preview and the reduced-motion image.
// The originals stay untouched; their SHA-256 and the produced files' sizes go to assets-manifest.json beside this script.
// Needs: Chrome (Playwright, from the sibling gamid-monitor checkout) and ffmpeg on PATH. FFmpeg alone cannot decode animated WebP, hence the browser.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { STICKER_CATALOG } from "../../dist/wall/stickers.js";

const [source, maxEdgeArg = "384", qualityArg = "80"] = process.argv.slice(2);
if (!source) { console.error("usage: node scripts/friends-stickers/build-assets.mjs <GAMID_PREMIUM_ANIMATED_14 folder> [maxEdge] [quality]"); process.exit(2); }
const maxEdge = Number(maxEdgeArg), quality = Number(qualityArg);
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../../dist/wall-kit/stickers");
mkdirSync(out, { recursive: true });
const sha256 = buffer => createHash("sha256").update(buffer).digest("hex");
const require = createRequire(join(here, "../../../gamid-monitor/package.json"));
const { chromium } = require("playwright");

// ImageDecoder needs a secure context: a blank page from localhost
const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>stickers</title>"); });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);

// -> { frames: [{ png (base64), duration (us) }], frameCount, repetitionCount, srcW, srcH, w, h }
async function decode(bytes) {
  return page.evaluate(async ({ data, maxEdge }) => {
    const raw = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const decoder = new ImageDecoder({ data: raw, type: "image/webp" });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const frames = [];
    let size = null;
    for (let i = 0; i < track.frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const srcW = image.displayWidth, srcH = image.displayHeight;
      const scale = Math.max(srcW, srcH) > maxEdge ? maxEdge / Math.max(srcW, srcH) : 1;
      size ??= { srcW, srcH, w: Math.round(srcW * scale / 2) * 2, h: Math.round(srcH * scale / 2) * 2 };
      const canvas = new OffscreenCanvas(size.w, size.h);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, size.w, size.h);
      const buf = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
      let s = ""; for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000));
      frames.push({ png: btoa(s), duration: image.duration });
      image.close();
    }
    return { frames, frameCount: track.frameCount, repetitionCount: track.repetitionCount, ...size };
  }, { data: bytes.toString("base64"), maxEdge });
}

const manifest = { built: new Date().toISOString().slice(0, 10), maxEdge, quality, stickers: [] };
for (const sticker of STICKER_CATALOG) {
  const animatedSrc = join(source, "ANIMATED_WEBP", `${sticker.source}.webp`);
  const stillSrc = join(source, "STATIC_MASTERS", `${sticker.source}.png`);
  const animatedBytes = readFileSync(animatedSrc), stillBytes = readFileSync(stillSrc);
  const decoded = await decode(animatedBytes);
  const work = join(tmpdir(), `gamid-sticker-${sticker.key}`);
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  decoded.frames.forEach((frame, i) => writeFileSync(join(work, `f${String(i).padStart(3, "0")}.png`), Buffer.from(frame.png, "base64")));
  const frameMs = decoded.frames.reduce((sum, f) => sum + f.duration, 0) / 1000 / decoded.frameCount;
  const fps = Math.round(1000 / frameMs);
  const animatedOut = join(out, `${sticker.key}.webp`), stillOut = join(out, `${sticker.key}-still.webp`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(fps), "-i", join(work, "f%03d.png"), "-c:v", "libwebp_anim", "-lossless", "0", "-quality", String(quality), "-compression_level", "6", "-pix_fmt", "yuva420p", "-loop", "0", animatedOut]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", stillSrc, "-vf", `scale='if(gt(iw,ih),${maxEdge},-2)':'if(gt(iw,ih),-2,${maxEdge})':flags=lanczos`, "-c:v", "libwebp", "-lossless", "0", "-quality", "85", "-pix_fmt", "yuva420p", stillOut]);
  rmSync(work, { recursive: true, force: true });
  manifest.stickers.push({
    key: sticker.key, source: sticker.source,
    animatedSource: { sha256: sha256(animatedBytes), bytes: animatedBytes.length, width: decoded.srcW, height: decoded.srcH, frames: decoded.frameCount, fps, loop: decoded.repetitionCount },
    stillSource: { sha256: sha256(stillBytes), bytes: stillBytes.length },
    animated: { file: `${sticker.key}.webp`, bytes: statSync(animatedOut).size, width: decoded.w, height: decoded.h },
    still: { file: `${sticker.key}-still.webp`, bytes: statSync(stillOut).size },
  });
  console.log(`${sticker.key}: ${(animatedBytes.length / 1e6).toFixed(2)} MB -> ${(statSync(animatedOut).size / 1e6).toFixed(2)} MB (${decoded.w}x${decoded.h}, ${decoded.frameCount} frames @ ${fps} fps); still ${(statSync(stillOut).size / 1e3).toFixed(0)} KB`);
}
writeFileSync(join(here, "assets-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await browser.close();
server.close();
console.log(`total served: ${(readdirSync(out).reduce((sum, f) => sum + statSync(join(out, f)).size, 0) / 1e6).toFixed(2)} MB`);
