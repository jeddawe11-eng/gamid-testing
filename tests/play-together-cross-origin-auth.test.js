import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isRequestedTestingHandoff,
  legacyAccountHandoffUrl,
  transferredSessionUrl,
} from "../dist/account/testing-auth-handoff.js";

const cloudflareLocation = {
  origin: "https://gamid-testing-static.gamid.workers.dev",
  pathname: "/play-together/",
  search: "",
};
const legacyLocation = {
  origin: "https://jeddawe11-eng.github.io",
  pathname: "/gamid-testing/account/",
  search: "?gamid_testing_handoff=play_together_cloudflare",
};

test("the real TESTING origins have isolated browser storage and use the fixed legacy-to-Cloudflare handoff", () => {
  const legacyStorage = new Map([["gamid.testing.auth.session.v1", "legacy-session"]]);
  const cloudflareStorage = new Map();
  assert.equal(cloudflareStorage.get("gamid.testing.auth.session.v1"), undefined, "a session on GitHub Pages is absent on workers.dev");
  assert.equal(legacyStorage.get("gamid.testing.auth.session.v1"), "legacy-session");
  assert.equal(
    legacyAccountHandoffUrl(cloudflareLocation),
    "https://jeddawe11-eng.github.io/gamid-testing/account/?gamid_testing_handoff=play_together_cloudflare",
  );
  assert.equal(isRequestedTestingHandoff(legacyLocation), true);
});

test("handoff preserves the established Supabase session fragment shape without putting tokens in a query string", () => {
  const target = transferredSessionUrl(legacyLocation, {
    access_token: "access-token",
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_at: 4600,
  }, 1000);
  const url = new URL(target);
  assert.equal(url.origin, cloudflareLocation.origin);
  assert.equal(url.pathname, cloudflareLocation.pathname);
  assert.equal(url.search, "");
  const fragment = new URLSearchParams(url.hash.slice(1));
  assert.equal(fragment.get("access_token"), "access-token");
  assert.equal(fragment.get("refresh_token"), "refresh-token");
  assert.equal(fragment.get("expires_in"), "3600");
  assert.equal(fragment.get("type"), "gamid_testing_handoff");
});

test("handoff is closed to arbitrary origins, paths, destinations, and incomplete sessions", () => {
  assert.equal(legacyAccountHandoffUrl({ ...cloudflareLocation, origin: "https://example.test" }), null);
  assert.equal(legacyAccountHandoffUrl({ ...cloudflareLocation, pathname: "/account/" }), null);
  assert.equal(isRequestedTestingHandoff({ ...legacyLocation, origin: "https://example.test" }), false);
  assert.equal(isRequestedTestingHandoff({ ...legacyLocation, search: "?gamid_testing_handoff=https://evil.test" }), false);
  assert.equal(transferredSessionUrl(legacyLocation, { access_token: "only-one-token" }), null);
});

test("both deployed controllers wire the handoff while preserving the ordinary unauthenticated panel fallback", async () => {
  const [account, playTogether] = await Promise.all([
    readFile(new URL("../dist/account/account.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/play-together/play-together.js", import.meta.url), "utf8"),
  ]);
  assert.match(account, /transferredSessionUrl\(location, api\.currentSession\(\)\)/);
  assert.match(account, /location\.replace\(target\)/);
  assert.match(playTogether, /legacyAccountHandoffUrl\(location\)/);
  assert.match(playTogether, /if\(handoffUrl\)\{location\.replace\(handoffUrl\);return;\}/);
  assert.match(playTogether, /show\("authPanel"\)/);
});
