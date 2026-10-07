// Cloudflare TESTING sign-in navigation. No cross-origin session or token transfer.
import { ALLOWED_RETURN_PATHS, takeReturnTo } from "./post-auth-return.js";
export const TESTING_ORIGIN = "https://gamid-testing-static.gamid.workers.dev";
export function accountSignInUrl(locationLike) {
  if (locationLike?.origin !== TESTING_ORIGIN || !ALLOWED_RETURN_PATHS.includes(locationLike?.pathname)) return null;
  return `${TESTING_ORIGIN}/account/?auth=signin`;
}
// Only authenticated Account consumes the single-use, fixed-path note. Recovery stays in Account.
export function authenticatedReturnPath(locationLike, session, storage, now = Date.now()) {
  if (locationLike?.origin !== TESTING_ORIGIN || locationLike?.pathname !== "/account/" || !session?.access_token || session.type === "recovery" || !(session.expires_at * 1000 > now)) return null;
  return takeReturnTo(storage, now);
}
