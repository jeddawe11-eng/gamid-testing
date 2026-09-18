import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const previewController = await readFile(new URL("../dist/account/intro-preview.js", import.meta.url), "utf8");
const publicController = await readFile(new URL("../dist/public/public.js", import.meta.url), "utf8");
const accountController = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");
const publicHtml = await readFile(new URL("../dist/public/index.html", import.meta.url), "utf8");
const accountHtml = await readFile(new URL("../dist/account/index.html", import.meta.url), "utf8");
const previewHtml = await readFile(new URL("../dist/account/intro-preview.html", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");

test("the Intro iframe re-announces readiness on a bounded interval instead of a single one-shot broadcast, so a parent listener that attaches late (iframe-ready-before-parent) still eventually receives it", () => {
  assert.match(previewController, /const READY_RETRY_LIMIT=25,READY_RETRY_MS=200/);
  assert.match(previewController, /function announceReady\(\)/);
  assert.match(previewController, /readyTimer=setInterval\(announceReady,READY_RETRY_MS\)/);
  assert.match(previewController, /announceReady\(\);\r?\nreadyTimer=setInterval/);
});

test("the retry loop is bounded (no infinite message loop) and stops permanently once config has been received", () => {
  const announceFn = previewController.match(/function announceReady\(\)\{[\s\S]*?\}\r?\n/)?.[0] || "";
  assert.match(announceFn, /if\(configReceived\)\{clearInterval\(readyTimer\);return;\}/, "must stop retrying once config is received");
  assert.match(announceFn, /if\(readyAttempts>=READY_RETRY_LIMIT\)\{clearInterval\(readyTimer\);return;\}/, "must give up after a bounded number of attempts");
});

test("receiving a config message immediately marks it received and clears the retry timer before playing, so no further ready pings are sent afterward", () => {
  assert.match(previewController, /configReceived=true;clearInterval\(readyTimer\);play\(event\.data\.config\)/);
});

test("the public route's initial config send is idempotent: repeated ready/load signals cannot trigger a second, duplicate Intro playback, while Replay remains an explicit unlimited action", () => {
  assert.match(publicController, /let initialSendDone = false;/);
  assert.match(publicController, /const sendReplay = \(\) => \{ if \(config\) frame\.contentWindow\?\.postMessage/);
  assert.match(publicController, /const sendInitial = \(\) => \{ if \(initialSendDone \|\| !frameReady \|\| !config\) return; initialSendDone = true; sendReplay\(\); \}/);
  assert.match(publicController, /gamid-intro-preview-ready"\) \{ frameReady = true; sendInitial\(\); \}/);
  assert.match(publicController, /frame\.addEventListener\("load", \(\) => \{ frameReady = true; sendInitial\(\); \}\)/);
  assert.match(publicController, /replayButton\.addEventListener\("click", sendReplay\)/);
});

test("the public route never reveals the Intro iframe (and its raw, unconfigured placeholder markup) until the child confirms a config has actually been applied, so a placeholder identity can never be mistaken for a real loaded profile", () => {
  assert.match(publicController, /let revealed = false;/);
  const stateHandler = publicController.match(/if \(event\.data\?\.type === "gamid-intro-preview-state"\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(stateHandler, /if \(!revealed\) \{ revealed = true; loading\.hidden = true; experienceWrap\.hidden = false; \}/);
  assert.doesNotMatch(publicController, /experienceWrap\.hidden = false;\s*\n\s*sendInitial\(\);/, "revealing the wrapper must not happen merely because a config was built locally — only once the child confirms it was applied");
});

test("the loading state stays visible (an intentional loading state) rather than a blank gap or the raw placeholder while waiting for the child's confirmation, and switches to not-found only for a genuinely missing/unpublished identity", () => {
  assert.match(publicController, /if \(!identity\) \{ loading\.hidden = true; notFound\.hidden = false; return; \}/);
  assert.doesNotMatch(publicController, /loading\.hidden = true;\s*\n\s*if \(!identity\)/, "loading must not be hidden before we know whether the child actually applied a real config");
});

test("the owner's Intro Preview dialog also guards against sending its config more than once per preview session, closing the same duplicate-playback risk the public route has", () => {
  assert.match(accountController, /let previewConfigDelivered = false;/);
  assert.match(accountController, /if \(!pendingPreviewConfig \|\| previewConfigDelivered\) return;\s*\n\s*previewConfigDelivered = true;/);
  assert.match(accountController, /previewConfigDelivered = false;\s*\n\s*document\.getElementById\("introPreviewDialog"\)\.showModal\(\);/);
});

test("a config message is still accepted and applied at any later time (e.g. a user-triggered Preview click long after the retry window has expired), since only the readiness announcement is bounded, never the ability to receive a config", () => {
  assert.match(previewController, /addEventListener\("message",event=>\{if\(event\.origin!==location\.origin\|\|event\.data\?\.type!=="gamid-intro-preview"\)return;/);
});

test("deterministic, deploy-derived asset versioning exists on every cross-document reference between the public/account parents and the shared Intro iframe, without any random or manually-maintained value", () => {
  assert.match(publicHtml, /src="\.\.\/account\/intro-preview\.html\?v=__ASSET_VERSION__"/);
  assert.match(publicHtml, /src="public\.js\?v=__ASSET_VERSION__"/);
  assert.match(accountHtml, /src="intro-preview\.html\?v=__ASSET_VERSION__"/);
  assert.match(previewHtml, /href="intro-preview\.css\?v=__ASSET_VERSION__"/);
  assert.match(previewHtml, /src="intro-preview\.js\?v=__ASSET_VERSION__"/);
});

test("the deploy workflow stamps the placeholder with the actual commit SHA automatically at deploy time, requiring no manual per-deployment maintenance", () => {
  assert.match(workflow, /VERSION="\$\{GITHUB_SHA:0:7\}"/);
  assert.match(workflow, /sed -i "s\/__ASSET_VERSION__\/\$\{VERSION\}\/g"/);
  assert.match(workflow, /for f in public\/index\.html account\/index\.html account\/intro-preview\.html/);
  assert.doesNotMatch(workflow, /RANDOM|Math\.random|uuidgen/i, "versioning must be deterministic, not random");
});

test("the versioning step runs after staging and before upload, so the committed dist/ source keeps the human-readable placeholder and only the deployed artifact is stamped", () => {
  const stageIndex = workflow.indexOf("Stage non-video static site");
  const stampIndex = workflow.indexOf("Stamp deterministic asset version");
  const uploadIndex = workflow.indexOf("Upload static site");
  assert.ok(stageIndex > -1 && stampIndex > -1 && uploadIndex > -1);
  assert.ok(stageIndex < stampIndex && stampIndex < uploadIndex);
});
