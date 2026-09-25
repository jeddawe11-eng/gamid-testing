// Turns the outcome of the ESTABLISHED account session restore (dist/account/supabase-client.js restoreSession) into what the Wall Editor does next.
// The editor never keeps a session of its own: it asks the account client, which reads the same localStorage session the Account page uses.
//
// During the TESTING move from the legacy GitHub Pages origin to Cloudflare, an owner may be signed in on the legacy origin only. The editor then uses the
// ESTABLISHED Play Together handoff (legacy Account -> Cloudflare, already deployed and accepted) automatically, once, and comes back to itself when the session
// arrives. That is plumbing, not product: nothing about it is shown to the person, and if it cannot help they simply get the normal sign-in.
export const SESSION_STATES = Object.freeze({
  READY: "READY",
  NO_STORED_SESSION: "NO_STORED_SESSION",
  SESSION_REFRESH_REJECTED: "SESSION_REFRESH_REJECTED",
  AUTH_SERVICE_UNREACHABLE: "AUTH_SERVICE_UNREACHABLE",
});

export async function resolveEditorSession(restoreSession) {
  try {
    const session = await restoreSession();
    return session?.access_token ? { state: SESSION_STATES.READY } : { state: SESSION_STATES.NO_STORED_SESSION };
  } catch (error) {
    const unreachable = error?.status === 0 || error?.code === "NETWORK_ERROR" || error?.status >= 500 || error?.status === 429;
    return { state: unreachable ? SESSION_STATES.AUTH_SERVICE_UNREACHABLE : SESSION_STATES.SESSION_REFRESH_REJECTED, status: error?.status ?? null };
  }
}

const ATTEMPT_KEY = "gamid.testing.auth.handoff.attempt.v1";
const ATTEMPT_WINDOW_MS = 3 * 60 * 1000;

// What to do with a session outcome. `attempts` is a same-tab store ({ getItem, setItem, removeItem }); `handoffUrl` is the established legacy handoff URL for this
// page (null where none applies). The automatic handoff runs at most once per attempt window, so a person without any session is never bounced in a loop.
export function planAuth(result, { attempts, handoffUrl, now = Date.now() } = {}) {
  if (result.state === SESSION_STATES.READY) { try { attempts?.removeItem(ATTEMPT_KEY); } catch { /* not important */ } return { action: "OPEN" }; }
  if (result.state === SESSION_STATES.AUTH_SERVICE_UNREACHABLE) return { action: "UNREACHABLE", reason: result.state };
  let recent = false;
  try { const at = Number(attempts?.getItem(ATTEMPT_KEY)); recent = Number.isFinite(at) && at > 0 && now - at >= 0 && now - at < ATTEMPT_WINDOW_MS; } catch { recent = true; }   // no usable store: never loop
  if (!recent && handoffUrl && attempts) {
    try { attempts.setItem(ATTEMPT_KEY, String(now)); return { action: "HANDOFF", url: handoffUrl, reason: result.state }; } catch { /* fall through to the normal sign-in */ }
  }
  return { action: "SIGN_IN", reason: result.state };
}

// The wording a person sees. No hosts, sessions, handoffs or diagnostics.
export function gateFor(action) {
  if (action === "UNREACHABLE") return { title: "Could not check your sign-in", text: "Please try again in a moment.", link: false, retry: true };
  return { title: "Sign in to edit your Wall", text: "Your Wall is private to you. Sign in to your GamID account, then open the Wall Editor again.", link: true, retry: false };
}
