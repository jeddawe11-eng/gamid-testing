// Stages dist/ for Cloudflare Workers Static Assets EXACTLY the way .github/workflows/deploy-pages.yml stages it for GitHub Pages:
//   1. copy dist/ without /assets/gamid-intro.mp4 (the deferred video is never published)
//   2. replace __ASSET_VERSION__ with the first 7 characters of the commit SHA in the three pages that carry it
// The result (.cloudflare-stage/, git-ignored) is what wrangler.jsonc points at. This is a hosting step only: no application file is edited in the repo.
import { cp, rm, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "dist");
const target = join(root, ".cloudflare-stage");
const STAMPED = ["public/index.html", "account/index.html", "account/intro-preview.html"];
const EXCLUDED = new Set([resolve(source, "assets", "gamid-intro.mp4")]);

const sha = (process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()).slice(0, 7);
if (!/^[0-9a-f]{7}$/.test(sha)) throw new Error(`Unexpected commit SHA prefix: ${sha}`);

await rm(target, { recursive: true, force: true });
// (on Windows fs.cp hands the filter extended-length paths that start with \\?\ : strip that prefix before comparing)
await cp(source, target, { recursive: true, filter: path => !EXCLUDED.has(resolve(path.replace(/^\\\\\?\\/, ""))) });

// Line endings: git stores these files with LF (and GitHub's Linux build publishes LF), but a Windows checkout with core.autocrlf may hold CRLF. Text files are normalized to
// LF so the staged site is byte-for-byte what the GitHub Pages workflow publishes. Binary files (png, webp, woff2, ...) are never touched.
const TEXT = /\.(html|js|mjs|css|md|txt|json|svg)$/i;
async function walk(dir) {
  const { readdir } = await import("node:fs/promises");
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { await walk(path); continue; }
    if (!TEXT.test(entry.name)) continue;
    const bytes = await readFile(path);
    if (!bytes.includes(13)) continue;
    await writeFile(path, Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8"));
  }
}
await walk(target);

for (const file of STAMPED) {
  const path = join(target, file);
  const text = await readFile(path, "utf8");
  if (!text.includes("__ASSET_VERSION__")) throw new Error(`${file} has no __ASSET_VERSION__ placeholder to stamp`);
  await writeFile(path, text.replaceAll("__ASSET_VERSION__", sha));
}
console.log(`staged dist/ -> .cloudflare-stage/ (asset version ${sha}; gamid-intro.mp4 excluded)`);
