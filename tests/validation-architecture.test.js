import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const validator = await readFile(new URL("../scripts/validate.mjs", import.meta.url), "utf8");
const pagesWorkflow = await readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");

test("static validation checks the deferred video reference without accessing its file", () => {
  assert.match(validator, /<source src="assets\/gamid-intro\.mp4" type="video\/mp4"/);
  assert.doesNotMatch(
    validator,
    /(?:access|readFile|open|stat|hash|createReadStream)[^\n]*gamid-intro\.mp4/,
  );
});

test("GitHub Pages stages the site without the deferred video", () => {
  assert.match(pagesWorkflow, /rsync -a --exclude '\/assets\/gamid-intro\.mp4'/);
  assert.match(pagesWorkflow, /path: \$\{\{ runner\.temp \}\}\/gamid-pages/);
  assert.doesNotMatch(pagesWorkflow, /path:\s*dist\s*$/m);
});
