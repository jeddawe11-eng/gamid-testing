import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const qrMigration = await readFile(new URL("../supabase/migrations/20260919120000_public_profile_qr_resolution.sql", import.meta.url), "utf8");
const client = await readFile(new URL("../dist/account/supabase-client.js", import.meta.url), "utf8");
const publicController = await readFile(new URL("../dist/public/public.js", import.meta.url), "utf8");
const notFoundHtml = await readFile(new URL("../dist/404.html", import.meta.url), "utf8");
const accountHtml = await readFile(new URL("../dist/account/index.html", import.meta.url), "utf8");
const accountController = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");
const accountCss = await readFile(new URL("../dist/account/account.css", import.meta.url), "utf8");

test("QR resolution reuses the existing get_public_identity_impl instead of duplicating its query, so publishing rules and forbidden columns are inherited automatically", () => {
  assert.match(qrMigration, /create function private\.get_public_identity_by_qr_impl\(candidate_token text\)/);
  assert.match(qrMigration, /select \* from private\.get_public_identity_impl\(/);
  assert.doesNotMatch(qrMigration, /where e\.visibility = 'PUBLIC'/, "the QR resolver must delegate to the existing gated function, not re-implement its own visibility filter");
});

test("QR resolution looks up the entity via the existing opaque qr_references.public_token, not a new identifier system", () => {
  assert.match(qrMigration, /from public\.qr_references q/);
  assert.match(qrMigration, /join public\.entities e on e\.entity_id = q\.entity_id/);
  assert.match(qrMigration, /where q\.public_token = candidate_token/);
});

test("the QR RPC follows the established security-definer/invoker split and is anonymous-safe", () => {
  assert.match(qrMigration, /language sql stable security definer/);
  assert.match(qrMigration, /create function public\.get_public_identity_by_qr\(candidate_token text\)/);
  assert.match(qrMigration, /language sql stable security invoker/);
  assert.match(qrMigration, /grant execute on function private\.get_public_identity_by_qr_impl\(text\) to anon, authenticated/);
  assert.match(qrMigration, /grant execute on function public\.get_public_identity_by_qr\(text\) to anon, authenticated/);
});

test("the migration never widens direct anonymous table access to qr_references or entities", () => {
  assert.doesNotMatch(qrMigration, /grant .* on (table )?public\.qr_references/i);
  assert.doesNotMatch(qrMigration, /grant .* on (table )?public\.entities/i);
});

test("the frontend client exposes an anonymous QR-based identity lookup mirroring the handle-based one", () => {
  assert.match(client, /export async function getPublicIdentityByQr\(token\)/);
  assert.match(client, /rpc\("get_public_identity_by_qr", \{ candidate_token: token \}, \{ anonymous: true \}\)/);
});

test("the public route resolves either ?handle= or ?qr= through the same rendering path, without a second profile page", () => {
  assert.match(publicController, /getPublicIdentityByQr/);
  assert.match(publicController, /params\.get\("qr"\)/);
  assert.match(publicController, /params\.get\("handle"\)/);
});

test("dist/404.html implements the permanent /@handle route as a redirect into the existing /public/ route, preserving the temporary ?handle= route", () => {
  assert.match(notFoundHtml, /\/@\(\[\^\/\]\+\)\\\/\?\$/);
  assert.match(notFoundHtml, /\/public\/index\.html\?handle=/);
  assert.match(notFoundHtml, /location\.replace/);
});

test("the account editor exposes a Share Identity experience: permanent link, copy, native share, and QR", () => {
  for (const id of ["shareLinkInput", "copyShareLinkButton", "shareIdentityButton", "showQrButton", "shareQrDialog", "qrCodeCanvas"]) {
    assert.match(accountHtml, new RegExp(`id="${id}"`));
  }
  assert.match(accountHtml, /<script src="qrcode\.min\.js"><\/script>/);
});

test("the permanent public URL and QR URL are both derived from the existing permanent handle and QR token, never a new identifier", () => {
  assert.match(accountController, /new URL\(`\.\.\/@\$\{identity\.gamid_handle\}`, location\.href\)/);
  assert.match(accountController, /new URL\(`\.\.\/public\/index\.html\?qr=\$\{encodeURIComponent\(identity\.qr_public_token\)\}`, location\.href\)/);
});

test("Share uses the native Web Share API where available and falls back to copying the link, never the raw QR token", () => {
  assert.match(accountController, /navigator\.share\(/);
  assert.match(accountController, /copyToClipboard\(permanentGamidUrl\(\)\)/);
  const shareHandler = accountController.match(/shareIdentityButton"\)\.addEventListener\("click", async \(\) => \{[\s\S]*?\n\}\);/)?.[0] || "";
  assert.doesNotMatch(shareHandler, /qr_public_token/, "the Share button's text/url must never include the raw QR token");
});

test("Copy Link copies the permanent handle-based URL, not the QR-token URL", () => {
  const copyHandler = accountController.match(/copyShareLinkButton"\)\.addEventListener\("click", async \(\) => \{[\s\S]*?\n\}\);/)?.[0] || "";
  assert.match(copyHandler, /permanentGamidUrl\(\)/);
  assert.doesNotMatch(copyHandler, /qrShareUrl\(\)/);
});

test("the owner's Share section never renders while there is no identity, and does not expose the entity/profile IDs", () => {
  assert.match(accountController, /if \(!identity\?\.gamid_handle\) return;/);
  const renderShareFn = accountController.match(/function renderShare\(\)\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(renderShareFn, /entity_id|profile_id/);
});

test("the Share section styling is mobile-first and reuses the existing dialog/button design language", () => {
  assert.match(accountCss, /\.share-section\{/);
  assert.match(accountCss, /\.share-qr-dialog\{/);
  assert.match(accountCss, /\.qr-code-canvas\{/);
});
