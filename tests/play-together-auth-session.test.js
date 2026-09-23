import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlayTogetherStartup } from "../dist/play-together/startup.js";

test("an existing authenticated GamID session loads Play Together instead of showing Sign In Required", async () => {
  const existingSession = { access_token: "existing-session" };
  let authenticatedLoads = 0;
  const result = await resolvePlayTogetherStartup({
    restoreSession: async () => existingSession,
    loadAuthenticated: async () => {
      authenticatedLoads += 1;
      return { catalog: { games: [] }, activeSession: null };
    },
  });
  assert.equal(result.state, "READY");
  assert.equal(authenticatedLoads, 1);
});

test("an unauthenticated visitor still receives Sign In Required without loading member data", async () => {
  let authenticatedLoads = 0;
  const result = await resolvePlayTogetherStartup({
    restoreSession: async () => null,
    loadAuthenticated: async () => { authenticatedLoads += 1; },
  });
  assert.equal(result.state, "AUTH_REQUIRED");
  assert.equal(authenticatedLoads, 0);
});

test("a post-authentication data failure is not misreported as Sign In Required", async () => {
  const failure = Object.assign(new Error("Catalog unavailable"), { status: 503 });
  const result = await resolvePlayTogetherStartup({
    restoreSession: async () => ({ access_token: "existing-session" }),
    loadAuthenticated: async () => { throw failure; },
  });
  assert.equal(result.state, "LOAD_ERROR");
  assert.equal(result.error, failure);
});

test("a server-confirmed 401 still returns the user to sign in", async () => {
  const failure = Object.assign(new Error("JWT expired"), { status: 401 });
  const result = await resolvePlayTogetherStartup({
    restoreSession: async () => ({ access_token: "stale-session" }),
    loadAuthenticated: async () => { throw failure; },
  });
  assert.equal(result.state, "AUTH_REQUIRED");
});
