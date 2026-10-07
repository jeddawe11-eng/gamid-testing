// Turns the outcome of the ESTABLISHED account session restore (dist/account/supabase-client.js restoreSession) into what the Wall Editor does next.
// The editor never keeps a session of its own: it asks the account client, which reads the same localStorage session the Account page uses.
//
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

// Same-origin Account owns sign-in. No credential transfer or automatic redirect loops.
export function planAuth(result) {
  if (result.state === SESSION_STATES.READY) return { action: "OPEN" };
  if (result.state === SESSION_STATES.AUTH_SERVICE_UNREACHABLE) return { action: "UNREACHABLE", reason: result.state };
  return { action: "SIGN_IN", reason: result.state };
}

// The wording a person sees. No hosts, sessions, handoffs or diagnostics.
export function gateFor(action) {
  if (action === "UNREACHABLE") return { title: "Could not check your sign-in", text: "Please try again in a moment.", link: false, retry: true };
  return { title: "Sign in to edit your Wall", text: "Your Wall is private to you. Sign in to your GamID account, then open the Wall Editor again.", link: true, retry: false };
}
