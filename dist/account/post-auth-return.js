// Same-tab single-use sign-in intent: fixed paths, five-minute lifetime, no tokens.
const RETURN_KEY = "gamid.testing.auth.return.v1";
const MAX_AGE_MS = 5 * 60 * 1000;
export const ALLOWED_RETURN_PATHS = Object.freeze(["/wall-editor/", "/play-together/"]);

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
