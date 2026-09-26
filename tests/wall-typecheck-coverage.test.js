import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

async function jsFiles(dir) {
  const entries = await readdir(new URL(`${dir}/`, root), { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => (entry.isDirectory() ? jsFiles(`${dir}/${entry.name}`) : entry.name.endsWith(".js") ? [`${dir}/${entry.name}`] : [])));
  return nested.flat();
}

test("npm run typecheck covers every Wall, Wall-Kit, Wall Editor and embed-provider runtime file", async () => {
  const files = (await Promise.all(["dist/wall", "dist/wall-kit", "dist/wall-editor"].map(jsFiles))).flat();
  assert.ok(files.length > 0);
  assert.ok(files.some(file => file.startsWith("dist/wall-kit/embed/providers/")));
  for (const file of files) assert.ok(pkg.scripts.typecheck.includes(`node --check ${file}`), `${file} is not in npm run typecheck`);
});

test("npm run typecheck covers the account auth handoff modules the Wall Editor uses", () => {
  for (const file of ["dist/account/supabase-client.js", "dist/account/testing-auth-handoff.js", "dist/account/post-auth-return.js"]) {
    assert.ok(pkg.scripts.typecheck.includes(`node --check ${file}`), `${file} is not in npm run typecheck`);
  }
});
