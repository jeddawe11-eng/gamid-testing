// Shared-session lifecycle regression (W3 bug 1). Every same-origin GamID surface (Account, Play Together, Wall Editor) shares ONE session through localStorage, while
// each tab also keeps it in memory and Supabase refresh tokens are SINGLE USE. Before the fix, a tab that lost a refresh race - or held a stale in-memory copy - got a
// 400 from Supabase and then DELETED the shared stored session, leaving Account showing the identity it had already loaded while every other page found
// NO_STORED_SESSION. These tests run the REAL client, as several tabs, against a fake Supabase that enforces rotating single-use refresh tokens.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveEditorSession, planAuth, SESSION_STATES } from "../dist/wall-kit/auth-gate.js";
import { legacyAccountHandoffUrl, transferredSessionUrl, isRequestedTestingHandoff } from "../dist/account/testing-auth-handoff.js";
import { rememberReturnTo, takeReturnTo } from "../dist/account/post-auth-return.js";
import { createWallPersistence } from "../dist/wall/persistence.js";
import { createEditorSession } from "../dist/wall-kit/session.js";
import { createDocument } from "../dist/wall/schema.js";

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

// ---- the REAL cross-origin lifecycle ------------------------------------------------------------------------------------------------------------------
const ROOT = "https://gamid-testing-static.gamid.workers.dev";
const LEGACY = "https://jeddawe11-eng.github.io";
const memoryStorage = (seed = {}) => { const map = new Map(Object.entries(seed)); return { map, getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) }; };
const jsonReply = (status, body) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => body, text: async () => JSON.stringify(body) });

// Visits a page: swaps in that origin's storage and location (as a browser does) and loads a fresh copy of the client (a page load).
async function visit({ origin, pathname, search = "", hash = "", local, tabStore, fetchImpl }) {
  const replaced = [];
  globalThis.localStorage = local;
  globalThis.sessionStorage = tabStore;
  globalThis.location = { origin, pathname, search, hash, host: new URL(origin).host, replace: url => replaced.push(url) };
  globalThis.history = { replaceState: (_s, _t, url) => { globalThis.location.hash = ""; void url; } };
  if (fetchImpl) globalThis.fetch = fetchImpl;
  return { client: await import(`../dist/account/supabase-client.js?tab=${counter++}`), replaced };
}

test("REAL LIFECYCLE: valid session only on the legacy origin -> the Wall Editor hands off automatically -> Cloudflare stores the session -> the editor is restored and loads the owner's Wall", async () => {
  const legacyStore = memoryStorage({ [KEY]: JSON.stringify(sessionAt("R1", 3000)) });   // the legacy origin still has @black's valid session
  const cloudflareStore = memoryStorage();                                                // the Cloudflare origin has nothing stored
  const cloudflareTab = memoryStorage();                                                  // this browser tab's sessionStorage on Cloudflare
  let rpcAuthorization = null;
  const cloudflareFetch = async (url, init) => {
    if (String(url).includes("/rpc/ensure_my_wall_draft")) {
      rpcAuthorization = init.headers.Authorization;
      return jsonReply(200, [{ document: createDocument(), revision: 1, created_at: "t0", updated_at: "t0" }]);
    }
    return jsonReply(404, {});
  };

  // 1. Mazen opens the Wall Editor on Cloudflare: no stored session there.
  let page = await visit({ origin: ROOT, pathname: "/wall-editor/", local: cloudflareStore, tabStore: cloudflareTab, fetchImpl: cloudflareFetch });
  const first = await resolveEditorSession(page.client.restoreSession);
  assert.equal(first.state, SESSION_STATES.NO_STORED_SESSION);
  const handoffUrl = legacyAccountHandoffUrl({ origin: ROOT, pathname: "/play-together/" });   // the ESTABLISHED, already-deployed handoff value
  const plan = planAuth(first, { attempts: cloudflareTab, handoffUrl });
  assert.deepEqual([plan.action, plan.url], ["HANDOFF", handoffUrl]);
  assert.equal(handoffUrl, `${LEGACY}/gamid-testing/account/?gamid_testing_handoff=play_together_cloudflare`);
  assert.equal(rememberReturnTo("/wall-editor/", cloudflareTab), true);
  assert.equal(planAuth(first, { attempts: cloudflareTab, handoffUrl }).action, "SIGN_IN", "the automatic handoff is attempted once - never a redirect loop");

  // 2. The legacy Account page (already deployed) recognises the request, restores its own session and produces the transfer URL.
  const legacyUrl = new URL(handoffUrl);
  page = await visit({ origin: legacyUrl.origin, pathname: legacyUrl.pathname, search: legacyUrl.search, local: legacyStore, tabStore: memoryStorage() });
  assert.equal(isRequestedTestingHandoff(globalThis.location), true);
  await page.client.restoreSession();
  const transferUrl = transferredSessionUrl(globalThis.location, page.client.currentSession());
  assert.ok(transferUrl.startsWith(`${ROOT}/play-together/#`), "the existing Play Together return page - the only one the deployed legacy side knows");

  // 3. Cloudflare receives the session on that page (whatever page consumes it first), persists it, and the shared client returns the person to the editor.
  page = await visit({ origin: ROOT, pathname: "/play-together/", hash: new URL(transferUrl).hash, local: cloudflareStore, tabStore: cloudflareTab, fetchImpl: cloudflareFetch });
  const received = await page.client.restoreSession();
  assert.equal(received.refresh_token, "R1");
  assert.equal(JSON.parse(cloudflareStore.map.get(KEY)).refresh_token, "R1", "stored on the Cloudflare origin for every same-origin surface");
  assert.deepEqual(page.replaced, ["/wall-editor/"], "and the person is returned to where they were going");
  assert.equal(globalThis.location.hash, "", "the tokens are removed from the address bar");

  // 4. The Wall Editor loads again: authenticated, owner-only data through the W2 RPC with the transferred session.
  page = await visit({ origin: ROOT, pathname: "/wall-editor/", local: cloudflareStore, tabStore: cloudflareTab, fetchImpl: cloudflareFetch });
  const second = await resolveEditorSession(page.client.restoreSession);
  assert.equal(second.state, SESSION_STATES.READY);
  assert.equal(planAuth(second, { attempts: cloudflareTab, handoffUrl }).action, "OPEN");
  assert.equal(cloudflareTab.map.has("gamid.testing.auth.handoff.attempt.v1"), false, "the attempt marker is cleared once it worked");
  const editor = createEditorSession({ persistence: createWallPersistence({ rpc: (name, body) => page.client.rpc(name, body) }) });
  assert.equal(await editor.load(), true);
  assert.equal(rpcAuthorization, "Bearer access-R1", "the owner's own transferred session authenticated the request");
});

test("the return note is safe: only known pages, same tab, short-lived, single use - and a handoff nobody asked a return for behaves exactly as before (Play Together)", async () => {
  const tab = memoryStorage();
  assert.equal(rememberReturnTo("/evil/", tab), false);
  assert.equal(rememberReturnTo("https://evil.example/", tab), false);
  assert.equal(rememberReturnTo("//evil.example/", tab), false);
  assert.equal(rememberReturnTo("/wall-editor/", tab, 1000), true);
  assert.equal(takeReturnTo(tab, 1000 + 6 * 60 * 1000), null, "expired");
  rememberReturnTo("/wall-editor/", tab, 1000);
  assert.equal(takeReturnTo(tab, 2000), "/wall-editor/");
  assert.equal(takeReturnTo(tab, 2000), null, "single use");
  tab.setItem("gamid.testing.auth.return.v1", JSON.stringify({ path: "https://evil.example/", at: 1 }));
  assert.equal(takeReturnTo(tab, 2), null, "a tampered note is ignored");
  assert.equal(takeReturnTo(null), null);

  // Play Together receiving a handoff with no return note: stays where it is
  const cloudflareStore = memoryStorage();
  const hash = new URL(transferredSessionUrl({ origin: LEGACY, pathname: "/gamid-testing/account/", search: "?gamid_testing_handoff=play_together_cloudflare" }, sessionAt("R1", 3000))).hash;
  const page = await visit({ origin: ROOT, pathname: "/play-together/", hash, local: cloudflareStore, tabStore: memoryStorage() });
  assert.equal((await page.client.restoreSession()).refresh_token, "R1");
  assert.deepEqual(page.replaced, []);
  // an ordinary sign-in (not a handoff) never triggers a return either
  const other = memoryStorage({ "gamid.testing.auth.return.v1": JSON.stringify({ path: "/wall-editor/", at: Date.now() }) });
  const signedIn = await visit({ origin: ROOT, pathname: "/account/", hash: "#access_token=a&refresh_token=b&type=recovery", local: memoryStorage(), tabStore: other });
  await signedIn.client.restoreSession();
  assert.deepEqual(signedIn.replaced, []);
});

test("no session anywhere: the handoff is tried once, then the normal sign-in - and the person sees no infrastructure wording", async () => {
  const tab = memoryStorage();
  const handoffUrl = legacyAccountHandoffUrl({ origin: ROOT, pathname: "/play-together/" });
  const none = { state: SESSION_STATES.NO_STORED_SESSION };
  assert.equal(planAuth(none, { attempts: tab, handoffUrl }).action, "HANDOFF");
  const again = planAuth(none, { attempts: tab, handoffUrl });
  assert.equal(again.action, "SIGN_IN");
  const { gateFor } = await import("../dist/wall-kit/auth-gate.js");
  const shown = gateFor(again.action);
  assert.match(shown.title, /Sign in/);
  assert.doesNotMatch(JSON.stringify(shown), /github|cloudflare|handoff|storage|session check|NO_STORED|recover|legacy|origin|token/i);
  assert.equal(planAuth(none, { attempts: null, handoffUrl }).action, "SIGN_IN", "with no usable tab storage it never loops");
  assert.equal(planAuth(none, { attempts: tab, handoffUrl: null }).action, "SIGN_IN", "and where no handoff applies it goes straight to sign-in");
  assert.equal(planAuth({ state: SESSION_STATES.AUTH_SERVICE_UNREACHABLE }, { attempts: memoryStorage(), handoffUrl }).action, "UNREACHABLE");
});