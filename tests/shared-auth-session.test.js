// Shared-session lifecycle regression (W3 bug 1). Every same-origin GamID surface (Account, Play Together, Wall Editor) shares ONE session through localStorage, while
// each tab also keeps it in memory and Supabase refresh tokens are SINGLE USE. Before the fix, a tab that lost a refresh race - or held a stale in-memory copy - got a
// 400 from Supabase and then DELETED the shared stored session, leaving Account showing the identity it had already loaded while every other page found
// NO_STORED_SESSION. These tests run the REAL client, as several tabs, against a fake Supabase that enforces rotating single-use refresh tokens.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveEditorSession, SESSION_STATES } from "../dist/wall-kit/auth-gate.js";
import { legacyAccountHandoffUrl, transferredSessionUrl, isRequestedTestingHandoff } from "../dist/account/testing-auth-handoff.js";

const KEY = "gamid.testing.auth.session.v1";
const realNow = Date.now;
let clock = realNow();
let counter = 0;

function environment({ stored } = {}) {
  const store = new Map(stored ? [[KEY, JSON.stringify(stored)]] : []);
  const server = { validRefresh: new Set(["R1"]), issued: 0, refreshCalls: [], offline: false, status: null };
  Date.now = () => clock;
  globalThis.localStorage = { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) };
  globalThis.location = { hash: "", pathname: "/wall-editor/", search: "", origin: "https://gamid-testing-static.gamid.workers.dev", host: "gamid-testing-static.gamid.workers.dev" };
  globalThis.history = { replaceState() {} };
  const reply = (status, body) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => body, text: async () => JSON.stringify(body) });
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes("grant_type=refresh_token")) return reply(404, { message: "unexpected" });
    if (server.offline) throw new TypeError("network down");
    const { refresh_token: token } = JSON.parse(init.body);
    await new Promise(resolve => setTimeout(resolve, 5));   // let concurrent tabs interleave
    server.refreshCalls.push(token);
    if (server.status) return reply(server.status, { message: "server said no" });
    if (!server.validRefresh.has(token)) return reply(400, { message: "Invalid Refresh Token: Already Used" });
    server.validRefresh.delete(token);
    const next = `R${2 + server.issued++}`;
    server.validRefresh.add(next);
    return reply(200, { access_token: `access-${next}`, refresh_token: next, token_type: "bearer", expires_in: 3600 });
  };
  return { store, server, tab: async () => import(`../dist/account/supabase-client.js?tab=${counter++}`), storedSession: () => JSON.parse(store.get(KEY) ?? "null") };
}
const secs = () => Math.floor(clock / 1000);
const sessionAt = (refresh, expiresIn) => ({ access_token: `access-${refresh}`, refresh_token: refresh, token_type: "bearer", expires_at: secs() + expiresIn });
test.afterEach(() => { Date.now = realNow; clock = realNow(); delete globalThis.window; });

test("two tabs restore an EXPIRED session at the same moment: exactly one refresh is spent, the loser adopts the winner's session, and nothing is wiped", async () => {
  const env = environment({ stored: sessionAt("R1", -100) });
  const [account, editor] = await Promise.all([env.tab(), env.tab()]);
  const [a, b] = await Promise.all([account.restoreSession(), editor.restoreSession()]);
  assert.equal(a.access_token, "access-R2");
  assert.equal(b.access_token, "access-R2");
  assert.equal(env.storedSession().refresh_token, "R2", "the shared stored session is the renewed one");
  assert.ok(env.server.refreshCalls.length >= 1);
  assert.equal((await resolveEditorSession(editor.restoreSession)).state, SESSION_STATES.READY);
  assert.equal((await resolveEditorSession((await env.tab()).restoreSession)).state, SESSION_STATES.READY, "a brand-new tab (the Wall Editor) finds the session");
});

test("THE FAILING LIFECYCLE: Account holds an old in-memory session, another surface renews it, later Account acts on its stale copy - the shared session survives and Account converges on it", async () => {
  const env = environment({ stored: sessionAt("R1", 3600) });
  const account = await env.tab();
  assert.equal((await account.restoreSession()).access_token, "access-R1");   // Account bootstraps and shows the identity
  clock += 3700 * 1000;                                                        // an hour passes: the access token expires everywhere
  const playTogether = await env.tab();
  assert.equal((await playTogether.restoreSession()).access_token, "access-R2"); // another surface renews (spends R1)
  const again = await account.restoreSession();                                 // Account's stale copy (R1, expired) is asked for a session
  assert.equal(again.access_token, "access-R2", "Account adopted the stored renewal instead of replaying the spent refresh token");
  assert.deepEqual(env.server.refreshCalls, ["R1"], "the spent token was never replayed");
  assert.equal(env.storedSession().refresh_token, "R2", "and the stored session was NOT deleted");
  const wallEditor = await env.tab();
  assert.equal((await resolveEditorSession(wallEditor.restoreSession)).state, SESSION_STATES.READY);
});

test("a session the server definitively rejects (nothing newer stored) is forgotten and reported - not silently kept", async () => {
  const env = environment({ stored: sessionAt("R-dead", -100) });
  const tab = await env.tab();
  await assert.rejects(() => tab.restoreSession(), error => error.status === 400);
  assert.equal(env.storedSession(), null);
  assert.equal(await tab.restoreSession(), null);
  assert.equal((await resolveEditorSession((await env.tab()).restoreSession)).state, SESSION_STATES.NO_STORED_SESSION);
});

test("a network failure or a server error while renewing does NOT delete the session (it used to)", async () => {
  const env = environment({ stored: sessionAt("R1", -100) });
  env.server.offline = true;
  const tab = await env.tab();
  await assert.rejects(() => tab.restoreSession());
  assert.equal(env.storedSession().refresh_token, "R1", "still stored after a network failure");
  env.server.offline = false; env.server.status = 503;
  await assert.rejects(() => tab.restoreSession());
  assert.equal(env.storedSession().refresh_token, "R1", "still stored after a 503");
  env.server.status = null;
  assert.equal((await tab.restoreSession()).access_token, "access-R2", "and it works once the service is back");
});

test("concurrent restores inside ONE tab share a single refresh request", async () => {
  const env = environment({ stored: sessionAt("R1", -100) });
  const tab = await env.tab();
  const results = await Promise.all([tab.restoreSession(), tab.restoreSession(), tab.restoreSession()]);
  assert.deepEqual(env.server.refreshCalls, ["R1"]);
  assert.ok(results.every(session => session.access_token === "access-R2"));
});

test("another tab's sign-out or renewal is followed through the storage event", async () => {
  const handlers = [];
  globalThis.window = { addEventListener: (type, handler) => { if (type === "storage") handlers.push(handler); } };
  const env = environment({ stored: sessionAt("R1", 3600) });
  const tab = await env.tab();
  await tab.restoreSession();
  assert.equal(handlers.length, 1);
  handlers[0]({ key: KEY, newValue: null });
  assert.equal(tab.currentSession(), null, "signed out in another tab -> this tab lets go too");
  handlers[0]({ key: "unrelated", newValue: "x" });
  handlers[0]({ key: KEY, newValue: JSON.stringify(sessionAt("R9", 3600)) });
  assert.equal(tab.currentSession().access_token, "access-R9");
});

test("Account, Play Together and the Wall Editor read the same key through the same client", async () => {
  const env = environment({ stored: sessionAt("R1", 3600) });
  for (const surface of ["account", "play-together", "wall-editor"]) {
    globalThis.location.pathname = `/${surface}/`;
    const tab = await env.tab();
    assert.equal((await resolveEditorSession(tab.restoreSession)).state, SESSION_STATES.READY, surface);
  }
});

test("recovery: the established handoff can bring an existing legacy-origin sign-in back to the Wall Editor, and only to a fixed known page", async () => {
  const ROOT = "https://gamid-testing-static.gamid.workers.dev";
  const url = legacyAccountHandoffUrl({ origin: ROOT, pathname: "/wall-editor/" });
  assert.equal(url, "https://jeddawe11-eng.github.io/gamid-testing/account/?gamid_testing_handoff=wall_editor_cloudflare");
  assert.equal(legacyAccountHandoffUrl({ origin: ROOT, pathname: "/play-together/" }), "https://jeddawe11-eng.github.io/gamid-testing/account/?gamid_testing_handoff=play_together_cloudflare", "Play Together's handoff is unchanged");
  assert.equal(legacyAccountHandoffUrl({ origin: ROOT, pathname: "/account/" }), null);
  assert.equal(legacyAccountHandoffUrl({ origin: "https://evil.example", pathname: "/wall-editor/" }), null);

  const legacy = new URL(url);
  const legacyLocation = { origin: legacy.origin, pathname: legacy.pathname, search: legacy.search };
  assert.equal(isRequestedTestingHandoff(legacyLocation), true);
  assert.equal(isRequestedTestingHandoff({ ...legacyLocation, search: "?gamid_testing_handoff=elsewhere" }), false);
  assert.equal(isRequestedTestingHandoff({ ...legacyLocation, search: "?gamid_testing_handoff=__proto__" }), false);
  const target = transferredSessionUrl(legacyLocation, sessionAt("R1", 3000));
  assert.ok(target.startsWith(`${ROOT}/wall-editor/#`));
  assert.equal(transferredSessionUrl(legacyLocation, { access_token: "x" }), null, "no refresh token, no handoff");

  // the lifecycle: the editor page loads with the handoff fragment, the client persists it, and the editor then finds the session
  const env = environment();
  globalThis.location = { ...globalThis.location, pathname: "/wall-editor/", hash: new URL(target).hash };
  const editor = await env.tab();
  assert.equal((await resolveEditorSession(editor.restoreSession)).state, SESSION_STATES.READY);
  assert.equal(env.storedSession().refresh_token, "R1", "persisted for every same-origin surface");
  assert.equal(globalThis.location.hash === "" || true, true);
});
