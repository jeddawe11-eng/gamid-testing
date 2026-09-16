import test from "node:test";
import assert from "node:assert/strict";

function browserHarness() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  };
  globalThis.location = { origin:"https://testing.gamid.example", pathname:"/account/", search:"", hash:"" };
  globalThis.history = { replaceState() {} };
  return store;
}

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers:{ "content-type":"application/json" } });

test("auth client covers registration, persistence, refresh, reset, password update, and sign out", async () => {
  const store = browserHarness();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/signup")) return json({ id:"user-1", email_confirmed_at:null });
    if (url.includes("grant_type=password")) return json({ access_token:"a.b.c", refresh_token:"refresh-1", expires_in:3600, user:{ id:"user-1" } });
    if (url.includes("grant_type=refresh_token")) return json({ access_token:"d.e.f", refresh_token:"refresh-2", expires_in:3600, user:{ id:"user-1" } });
    if (url.includes("/recover")) return json({});
    if (url.endsWith("/auth/v1/user")) return json({ id:"user-1" });
    if (url.endsWith("/auth/v1/logout")) return json({});
    return json([]);
  };

  const api = await import(`../dist/account/supabase-client.js?auth=${Date.now()}`);
  const registration = await api.signUp("new@example.test", "password-1");
  assert.equal(registration.email_confirmed_at, null);
  assert.match(calls.at(-1).url, /signup\?redirect_to=/);

  await api.signIn("returning@example.test", "password-1");
  assert.ok(store.get("gamid.testing.auth.session.v1"));
  assert.ok(await api.restoreSession());
  await api.sendPasswordReset("returning@example.test");
  assert.match(calls.at(-1).url, /recover\?redirect_to=/);
  await api.updatePassword("password-2");
  assert.equal(calls.at(-1).options.method, "PUT");
  await api.updateIdentityProfile({ displayName:"Black", bio:"Player one" });
  const profileCall = calls.at(-1);
  assert.match(profileCall.url, /\/rest\/v1\/rpc\/update_my_identity_profile$/);
  assert.deepEqual(JSON.parse(profileCall.options.body), {
    candidate_display_name:"Black",
    candidate_bio:"Player one",
    candidate_avatar_path:null,
  });
  assert.match(profileCall.options.headers.Authorization, /^Bearer /);
  await api.signOut();
  assert.equal(store.has("gamid.testing.auth.session.v1"), false);

  store.set("gamid.testing.auth.session.v1", JSON.stringify({ access_token:"expired", refresh_token:"refresh-1", expires_at:1 }));
  const restoringApi = await import(`../dist/account/supabase-client.js?restore=${Date.now()}`);
  const restored = await restoringApi.restoreSession();
  assert.equal(restored.refresh_token, "refresh-2");
});

test("Auth transport failures become a stable safe NETWORK_ERROR", async () => {
  browserHarness();
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  const api = await import(`../dist/account/supabase-client.js?network=${Date.now()}`);
  await assert.rejects(
    () => api.signIn("returning@example.test", "not-a-real-secret"),
    error => error instanceof api.ApiError && error.code === "NETWORK_ERROR" && error.status === 0,
  );
});

test("successful Auth remains usable in memory when browser storage is unavailable", async () => {
  browserHarness();
  globalThis.localStorage.setItem = () => { throw new DOMException("Storage unavailable", "SecurityError"); };
  globalThis.fetch = async () => json({ access_token:"a.b.c", refresh_token:"refresh-1", expires_in:3600 });
  const api = await import(`../dist/account/supabase-client.js?storage=${Date.now()}`);
  const signedIn = await api.signIn("returning@example.test", "not-a-real-secret");
  assert.equal(api.currentSession(), signedIn);
  assert.equal(api.currentSession().access_token, "a.b.c");
});
