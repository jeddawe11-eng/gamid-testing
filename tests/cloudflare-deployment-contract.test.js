import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const [wrangler, staging, workflow, pagesWorkflow] = await Promise.all([
  read("wrangler.jsonc"),
  read("scripts/stage-cloudflare.mjs"),
  read(".github/workflows/deploy-cloudflare-testing.yml"),
  read(".github/workflows/deploy-pages.yml"),
]);
const config = JSON.parse(wrangler.replace(/^\s*\/\/.*$/gm, ""));

test("Cloudflare deployment remains pinned to the existing TESTING Worker and staging directory", () => {
  assert.equal(config.name, "gamid-testing-static");
  assert.equal(config.assets.directory, "./.cloudflare-stage");
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.equal(config.env, undefined);
  assert.equal(config.routes, undefined);
  assert.doesNotMatch(JSON.stringify(config), /production/i);
});

test("staging copies the complete dist tree, preserves the video exclusion, and stamps Play Together", () => {
  assert.match(staging, /await cp\(source, target, \{ recursive: true/);
  assert.match(staging, /assets", "gamid-intro\.mp4"/);
  assert.match(staging, /"play-together\/index\.html"/);
  assert.match(staging, /replaceAll\("__ASSET_VERSION__", sha\)/);
});

test("deployment is manual-only, protected by TESTING, and has read-only repository permissions", () => {
  assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /environment:\s*\n\s+name: TESTING/);
  assert.match(workflow, /url: https:\/\/gamid-testing-static\.gamid\.workers\.dev/);
  assert.match(workflow, /group: cloudflare-testing/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("source ref, exact SHA, accepted ancestry, and initial Play Together tree are guarded before deployment", () => {
  assert.match(workflow, /source_ref:/);
  assert.match(workflow, /expected_sha:/);
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /ref: \$\{\{ inputs\.source_ref \}\}/);
  assert.match(workflow, /ACTUAL_SHA=.*git rev-parse HEAD/);
  assert.match(workflow, /"\$ACTUAL_SHA" == "\$EXPECTED_SHA"/);
  assert.match(workflow, /git merge-base --is-ancestor "\$ACCEPTED_BASELINE_SHA" "\$ACTUAL_SHA"/);
  assert.match(workflow, /INITIAL_PLAY_TOGETHER_SHA: 3f1e78c2aa61a59607187a132c7fbddf7b932c7d/);
  assert.match(workflow, /INITIAL_PLAY_TOGETHER_TREE: 7a1a6063e71d7140cf78a0dcfe94e213d365b24a/);
});

test("workflow validates TESTING config and staged Play Together before the credential-bearing deploy step", () => {
  const guard = workflow.indexOf("Verify commit, ancestry, tree, and TESTING-only config");
  const stage = workflow.indexOf("Verify staged artifact");
  const deploy = workflow.indexOf("Deploy existing Cloudflare TESTING Worker");
  assert.ok(guard > -1 && stage > guard && deploy > stage);
  assert.match(workflow, /config\.name !== process\.env\.TESTING_WORKER_NAME/);
  assert.match(workflow, /config\.assets\?\.directory !== "\.\/\.cloudflare-stage"/);
  assert.match(workflow, /test -f \.cloudflare-stage\/play-together\/index\.html/);
  assert.match(workflow, /test ! -e \.cloudflare-stage\/assets\/gamid-intro\.mp4/);
  assert.match(workflow, /__ASSET_VERSION__/);
});

test("credentials are injected only into the deploy step and Wrangler is explicitly pinned", () => {
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow, /WRANGLER_VERSION: 4\.86\.0/);
  assert.match(workflow, /npx --yes "wrangler@\$WRANGLER_VERSION" deploy --config wrangler\.jsonc/);
  const credentialLines = workflow.split(/\r?\n/).filter(line => /CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID):/.test(line));
  assert.equal(credentialLines.length, 2);
  assert.ok(credentialLines.every(line => line.includes("${{")), "credentials must only come from GitHub Environment contexts");
});

test("workflow reports deployment identity and prepares the approved TESTING smoke checks", () => {
  for (const value of ["Requested source", "Resolved source SHA", "Root tree SHA", "Worker", "Wrangler", "Staged artifact", "Deployment result", "TESTING URL"]) {
    assert.match(workflow, new RegExp(value));
  }
  for (const path of ["/", "/account/", "/play-together/", "/@black"]) assert.ok(workflow.includes(JSON.stringify(path)));
  assert.match(workflow, /html\.includes\("__ASSET_VERSION__"\)/);
  assert.match(workflow, /\?v=\[0-9a-f\]\{7\}/);
});

test("workflow has no Production target, credential, environment, or automatic trigger", () => {
  assert.doesNotMatch(workflow, /name:\s*PRODUCTION/i);
  assert.doesNotMatch(workflow, /CLOUDFLARE_[A-Z_]*PRODUCTION|PRODUCTION_[A-Z_]*CLOUDFLARE/i);
  assert.doesNotMatch(workflow, /https?:\/\/[^\s]*production/i);
  assert.doesNotMatch(workflow, /CLOUDFLARE_ENV/);
  assert.doesNotMatch(workflow, /--env\s+production/i);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
});

test("legacy GitHub Pages is preserved but cannot deploy automatically from a main push", () => {
  assert.match(pagesWorkflow, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(pagesWorkflow, /^\s+(push|pull_request|schedule):/m);
  assert.match(pagesWorkflow, /name: github-pages/);
  assert.match(pagesWorkflow, /uses: actions\/deploy-pages@v4/);
});
