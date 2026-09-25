// A tiny, same-tab "where was this person going" note for the TESTING sign-in transition. When a GamID page has to bring an existing sign-in across from the legacy
// TESTING origin, it notes the page it wants to come back to; the shared client (supabase-client.js) takes the note when the transferred session arrives and returns
// the person there. Only fixed, known GamID pages are allowed, and the note lives in sessionStorage (this tab only, expires in minutes). No token is ever stored here.
const RETURN_KEY = "gamid.testing.auth.return.v1";
const MAX_AGE_MS = 5 * 60 * 1000;
export const ALLOWED_RETURN_PATHS = Object.freeze(["/wall-editor/"]);

const defaultStorage = () => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };

export function rememberReturnTo(path, storage = defaultStorage(), now = Date.now()) {
  if (!ALLOWED_RETURN_PATHS.includes(path) || !storage) return false;
  try { storage.setItem(RETURN_KEY, JSON.stringify({ path, at: now })); return true; } catch { return false; }
}

// Reads AND clears the note. Returns an allowed path, or null.
export function takeReturnTo(storage = defaultStorage(), now = Date.now()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RETURN_KEY);
    storage.removeItem(RETURN_KEY);
    const note = JSON.parse(raw);
    return note && ALLOWED_RETURN_PATHS.includes(note.path) && now - note.at >= 0 && now - note.at < MAX_AGE_MS ? note.path : null;
  } catch {
    return null;
  }
}
