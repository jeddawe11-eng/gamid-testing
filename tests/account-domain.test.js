import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { authLanding, errorMessage, normalizeHandle, validateHandle } from "../dist/account/domain.js";

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

test("language preference is captured before the form is disabled", async () => {
  const source = await readFile(new URL("../dist/account/account.js", import.meta.url), "utf8");
  const capture = source.indexOf('const language = new FormData(form).get("language")');
  const disable = source.indexOf("busy(form, true)", capture);
  const update = source.indexOf("api.updateLanguage(language)", disable);
  assert.ok(capture >= 0 && disable > capture && update > disable);
});
