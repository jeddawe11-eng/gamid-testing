// Turns the outcome of the ESTABLISHED account session restore (dist/account/supabase-client.js restoreSession) into what the Wall Editor should show.
// The editor never keeps a session of its own: it asks the account client, which reads the same localStorage session the Account page uses. This module only
// classifies the answer, so a network problem is never mislabelled as "you are signed out" and every gate carries a short, non-secret reason code.
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

export function gateForSessionState(result, host = "") {
  const where = host ? ` (${host})` : "";
  if (result.state === SESSION_STATES.NO_STORED_SESSION) {
    return { title: "Sign in to edit your Wall", text: `No signed-in GamID session was found on this address${where}. Sign in at your account on this same address, then open the Wall Editor again.`, link: true, retry: true, reason: result.state };
  }
  if (result.state === SESSION_STATES.SESSION_REFRESH_REJECTED) {
    return { title: "Your sign-in needs renewing", text: `Your saved sign-in could not be renewed${result.status ? ` (${result.status})` : ""}. Sign in again at your account on this same address, then come back.`, link: true, retry: true, reason: result.state };
  }
  return { title: "Could not check your sign-in", text: "The sign-in service could not be reached, so your session was left untouched. Try again in a moment.", link: false, retry: true, reason: result.state };
}
