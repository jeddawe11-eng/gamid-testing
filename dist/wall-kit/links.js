// "Other" link input (Media & Links > Other, and the Link section of a linked text): what the creator TYPES -> the address to store, or why not.
// The stored rule itself (LINK_URL, and the validator the database mirrors) lives in text.js; this only prepares input for it and words the refusals.
import { LINK_MAX, isSafeLinkUrl } from "./text.js";

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// A bare "mysite.com" becomes https://mysite.com; an address with any other scheme (javascript:, data:, ftp:, ...) is refused as it is. The browser's URL parser
// normalises the rest (punycode host, percent-encoded path), and the result must then pass the stored rule.
// -> { ok: true, url } | { ok: false, reason: "empty" | "scheme" | "credentials" | "invalid" | "tooLong" }
export function normalizeLinkInput(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, reason: "empty" };
  const otherScheme = HAS_SCHEME.test(raw) && !/^https?:/i.test(raw);
  if (otherScheme) return { ok: false, reason: "scheme" };
  let parsed;
  try { parsed = new URL(HAS_SCHEME.test(raw) ? raw : `https://${raw}`); } catch { return { ok: false, reason: "invalid" }; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false, reason: "scheme" };
  if (parsed.username || parsed.password) return { ok: false, reason: "credentials" };
  const url = parsed.href;
  if (url.length > LINK_MAX) return { ok: false, reason: "tooLong" };
  return isSafeLinkUrl(url) ? { ok: true, url } : { ok: false, reason: "invalid" };
}

export const LINK_PROBLEMS = Object.freeze({
  empty: "Enter the web address to open.",
  scheme: "Only web addresses starting with https:// or http:// can be used.",
  credentials: "That address contains a user name or password, so it cannot be used.",
  invalid: "That is not a valid web address.",
  tooLong: "That address is too long.",
});
