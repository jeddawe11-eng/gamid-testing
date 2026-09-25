// W3 regression - the Wall Editor must recognise the EXISTING same-origin GamID session exactly as the Account page does. Both import the same client
// (dist/account/supabase-client.js) and the same localStorage key; these tests run the REAL client against a fake storage/network and check that a session
// the Account page would accept is accepted by the editor's boot check, and that failures are reported as what they are.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveEditorSession, gateFor, planAuth, SESSION_STATES } from "../dist/wall-kit/auth-gate.js";

const KEY = "gamid.testing.auth.session.v1";
const now = () => Math.floor(Date.now() / 1000);
let counter = 0;

async function freshClient({ stored, refresh } = {}) {
  const store = new Map(stored ? [[KEY, JSON.stringify(stored)]] : []);
  const calls = [];
  globalThis.localStorage = { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) };
  globalThis.location = { hash: "", pathname: "/wall-editor/", search: "", origin: "https://gamid-testing-static.gamid.workers.dev", host: "gamid-testing-static.gamid.workers.dev" };
  globalThis.history = { replaceState() {} };
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (!refresh) throw new TypeError("no network");
    return refresh(String(url), init);
  };
  const client = await import(`../dist/account/supabase-client.js?case=${counter++}`);
  return { client, store, calls };
}
const json = (status, body) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => body, text: async () => JSON.stringify(body) });

test("the editor and the Account page use the one shared client and the one storage key", () => {
  const editor = readFileSync("dist/wall-editor/editor.js", "utf8");
  const account = readFileSync("dist/account/account.js", "utf8");
  assert.match(editor, /import \{ restoreSession, rpc \} from "\.\.\/account\/supabase-client\.js"/);
  assert.match(account, /supabase-client\.js/);
  assert.match(readFileSync("dist/account/supabase-client.js", "utf8"), new RegExp(`SESSION_KEY = "${KEY.replaceAll(".", "\\.")}"`));
  assert.doesNotMatch((editor + readFileSync("dist/wall-kit/auth-gate.js", "utf8")).replace(/\/\/.*$/gm, "").replace(/const sessionStorageOrNull = .*$/m, ""), /localStorage|\bsessionStorage\b|document\.cookie|auth\/v1/, "no separate Wall session or storage");
  assert.match(editor, /resolveEditorSession\(restoreSession\)/);
});

test("an existing unexpired same-origin session (what /account/ recognises) is recognised by the editor - no network, no sign-in", async () => {
  const { client, calls } = await freshClient({ stored: { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_at: now() + 3000 } });
  assert.deepEqual(await resolveEditorSession(client.restoreSession), { state: SESSION_STATES.READY });
  assert.equal(calls.length, 0);
  assert.equal(client.currentSession().access_token, "a.b.c");
});

test("an expired session with a valid refresh token is renewed once and recognised, and the renewed session is stored for the Account page too", async () => {
  const { client, store, calls } = await freshClient({
    stored: { access_token: "old", refresh_token: "r1", token_type: "bearer", expires_at: now() - 100 },
    refresh: async () => json(200, { access_token: "new", refresh_token: "r2", token_type: "bearer", expires_in: 3600 }),
  });
  assert.deepEqual(await resolveEditorSession(client.restoreSession), { state: SESSION_STATES.READY });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /grant_type=refresh_token/);
  assert.equal(JSON.parse(store.get(KEY)).refresh_token, "r2");
});

test("a session that is about to expire (< 60 s) is renewed the same way the Account page does", async () => {
  const { client, calls } = await freshClient({
    stored: { access_token: "old", refresh_token: "r1", token_type: "bearer", expires_at: now() + 20 },
    refresh: async () => json(200, { access_token: "new", refresh_token: "r2", token_type: "bearer", expires_in: 3600 }),
  });
  assert.equal((await resolveEditorSession(client.restoreSession)).state, SESSION_STATES.READY);
  assert.equal(calls.length, 1);
});

test("no stored session is classified as such; the person sees a plain sign-in with no infrastructure wording", async () => {
  const { client } = await freshClient();
  const result = await resolveEditorSession(client.restoreSession);
  assert.equal(result.state, SESSION_STATES.NO_STORED_SESSION);
  const shown = gateFor(planAuth(result, { attempts: null, handoffUrl: null }).action);
  assert.equal(shown.title, "Sign in to edit your Wall");
  assert.equal(shown.link, true);
  assert.doesNotMatch(JSON.stringify(shown), /github|cloudflare|handoff|storage|session check|NO_STORED|recover|origin|token/i);
});
test("a refresh the server rejects is 'sign-in needs renewing' (with the status), not a silent sign-out message", async () => {
  const { client } = await freshClient({
    stored: { access_token: "old", refresh_token: "r1", token_type: "bearer", expires_at: now() - 100 },
    refresh: async () => json(400, { message: "Invalid Refresh Token: Already Used" }),
  });
  const result = await resolveEditorSession(client.restoreSession);
  assert.deepEqual(result, { state: SESSION_STATES.SESSION_REFRESH_REJECTED, status: 400 });
  assert.equal(planAuth(result, { attempts: null, handoffUrl: null }).action, "SIGN_IN");
});

test("a network or service failure while checking is NOT reported as signed out, and never claims the session is gone", async () => {
  const { client } = await freshClient({ stored: { access_token: "old", refresh_token: "r1", token_type: "bearer", expires_at: now() - 100 } });   // fetch throws
  const result = await resolveEditorSession(client.restoreSession);
  assert.equal(result.state, SESSION_STATES.AUTH_SERVICE_UNREACHABLE);
  assert.equal(planAuth(result, { attempts: null, handoffUrl: null }).action, "UNREACHABLE");
  const gate = gateFor("UNREACHABLE");
  assert.match(gate.title, /Could not check/);
  assert.equal(gate.retry, true);
  assert.equal(gate.link, false);
  const serverError = await freshClient({ stored: { access_token: "old", refresh_token: "r1", token_type: "bearer", expires_at: now() - 100 }, refresh: async () => json(503, { message: "unavailable" }) });
  assert.equal((await resolveEditorSession(serverError.client.restoreSession)).state, SESSION_STATES.AUTH_SERVICE_UNREACHABLE);
});

test("owner-only protection is unchanged: a session alone opens nothing - the Wall is still loaded through the owner RPCs, which resolve the owner server-side", () => {
  const editor = readFileSync("dist/wall-editor/editor.js", "utf8");
  assert.match(editor, /session\.load\(\)/);
  assert.doesNotMatch(editor, /candidate_(owner|user|entity)|user_id|entity_id/);
});
