import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BIO_MAX, authErrorMessage, authLanding, errorMessage, hasProfileChanges, normalizeHandle, validateHandle, validateProfileDraft } from "../dist/account/domain.js";

test("handle normalization is case-insensitive and URL-safe", () => {
  assert.equal(normalizeHandle("  @Mazen_27 "), "mazen_27");
  assert.deepEqual(validateHandle("Mazen_27"), { valid:true, reason:null, handle:"mazen_27" });
});

test("invalid handle formats are rejected before availability requests", () => {
  assert.equal(validateHandle("ab").reason, "TOO_SHORT");
  assert.equal(validateHandle("_mazen").reason, "INVALID_FORMAT");
  assert.equal(validateHandle("mazen__id").reason, "INVALID_FORMAT");
  assert.equal(validateHandle("mazen-id").reason, "INVALID_FORMAT");
  assert.equal(validateHandle("a".repeat(25)).reason, "TOO_LONG");
});

test("authenticated return flow resolves an existing identity without creating one", () => {
  assert.equal(authLanding(null, null), "auth");
  assert.equal(authLanding({ access_token:"token" }, null), "onboarding");
  assert.equal(authLanding({ access_token:"token" }, { entity_id:"solo-1" }), "identity");
});

test("age and concurrency errors have safe user-facing messages", () => {
  assert.match(errorMessage("AGE_NOT_ELIGIBLE"), /minimum-age/);
  assert.match(errorMessage("HANDLE_TAKEN"), /claimed moments ago/);
});

test("Auth failures stay safe while distinguishing credentials, rate limits, and network errors", () => {
  assert.equal(authErrorMessage({ code:"invalid_credentials", status:400 }, "signin"), "Email or password is incorrect.");
  assert.equal(authErrorMessage({ code:"email_not_confirmed", status:400 }, "signin"), "Verify your email before signing in.");
  assert.match(authErrorMessage({ code:"NETWORK_ERROR", status:0 }, "signin"), /could not reach authentication/);
  assert.match(authErrorMessage({ code:"over_email_send_rate_limit", status:429 }, "recovery"), /Too many recovery requests/);
  assert.match(authErrorMessage({ code:"smtp_failure", status:500 }, "recovery"), /SMTP_FAILURE/);
});

test("sign-in authentication errors are separated from post-auth account loading", async () => {
  const source = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");
  assert.match(source, /await api\.signIn[\s\S]*catch \(error\)[\s\S]*return;[\s\S]*await routeAuthenticated/);
  assert.match(source, /Signed in, but the account could not be loaded/);
});

test("language preference is captured before the form is disabled", async () => {
  const source = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");
  const capture = source.indexOf('const language = new FormData(form).get("language")');
  const disable = source.indexOf("busy(form, true)", capture);
  const update = source.indexOf("api.updateLanguage(language)", disable);
  assert.ok(capture >= 0 && disable > capture && update > disable);
});

test("Slice 3A profile drafts enforce display-name and 160-character bio boundaries", () => {
  assert.equal(BIO_MAX, 160);
  assert.equal(validateProfileDraft({ displayName:" Black ", bio:"x".repeat(160) }).valid, true);
  assert.equal(validateProfileDraft({ displayName:"Black", bio:"x".repeat(161) }).reason, "BIO_TOO_LONG");
  assert.equal(validateProfileDraft({ displayName:"   ", bio:"" }).reason, "INVALID_DISPLAY_NAME");
});

test("unsaved profile state includes display name, bio, and a pending avatar", () => {
  const saved = { displayName:"Black", bio:"Player one", avatarPath:"user/avatar.webp" };
  assert.equal(hasProfileChanges(saved, { ...saved }), false);
  assert.equal(hasProfileChanges(saved, { ...saved, bio:"Player two" }), true);
  assert.equal(hasProfileChanges(saved, { ...saved }, true), true);
});

test("Avatar-only and Avatar-plus-text dirty branches restore to the same clean saved state", () => {
  const saved = { displayName:"Black", bio:"Player one", avatarPath:"user/avatar.webp" };
  const avatarOnly = { draft:{ ...saved }, pendingAvatar:true };
  const avatarAndText = { draft:{ ...saved, bio:"Unsaved text" }, pendingAvatar:true };
  assert.equal(hasProfileChanges(saved, avatarOnly.draft, avatarOnly.pendingAvatar), true);
  assert.equal(hasProfileChanges(saved, avatarAndText.draft, avatarAndText.pendingAvatar), true);

  // A real reload rebuilds both branches from the persisted server snapshot.
  const restoredAvatarOnly = { draft:{ ...saved }, pendingAvatar:false };
  const restoredAvatarAndText = { draft:{ ...saved }, pendingAvatar:false };
  assert.equal(hasProfileChanges(saved, restoredAvatarOnly.draft, restoredAvatarOnly.pendingAvatar), false);
  assert.equal(hasProfileChanges(saved, restoredAvatarAndText.draft, restoredAvatarAndText.pendingAvatar), false);
  assert.deepEqual(restoredAvatarOnly, restoredAvatarAndText);
});
