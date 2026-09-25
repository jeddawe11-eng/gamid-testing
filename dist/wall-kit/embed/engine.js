// The provider-neutral Link / Embed Engine.
//
//   pasted URL -> detectEmbed() -> provider adapter (parse) -> {provider, kind, id} -> presentation choices -> embed element payload { providerKey, data }
//   stored data  -> adapter.validatePayload() -> adapter.render() -> plain descriptor -> safe painter (paint.js / player.js)
//
// The Wall core never knows a provider: adapters are registered into the core's providerRegistry (dist/wall/providers.js) exactly as its contract describes. Nothing a
// person pastes is ever stored or executed: only a provider key, a content KIND and a strictly validated ID are stored (plus a presentation choice and an optional plain
// caption). Every URL a visitor can follow or a player can load is REBUILT by the adapter from those validated parts - never taken from user input - and is
// checked against the adapter's own host allowlist. No HTML, no iframe code and no script is accepted anywhere.
import { providerRegistry } from "../../wall/providers.js";
import { isSet } from "../../wall/fields.js";

export const PRESENTATIONS = Object.freeze(["link", "card", "embed"]);
export const ASPECTS = Object.freeze(["16:9", "9:16", "1:1", "4:3", "auto"]);
export const CAPTION_MAX = 80;
const MAX_URL_LENGTH = 2048;

// Provider capability names (documented vocabulary; each adapter declares the ones it truly supports).
export const CAPABILITIES = Object.freeze(["LINK", "CARD", "PROFILE_CARD", "CONTENT_CARD", "INLINE_EMBED", "MEDIA_PLAYER", "COMPACT_PLAYER", "EXPANDED_PLAYER"]);

export const PROVIDERS = new Map();

const codePoints = value => Array.from(value).length;
const idOk = (spec, id) => typeof id === "string" && new RegExp(spec.id).test(id);

// A provider is described declaratively; everything else (validation, rendering, presentation rules) is derived from that description.
//   key, label, hosts (page hosts it recognises), frameOrigins (origins its players load from - the ONLY additions to the page CSP),
//   kinds: { [kind]: { label, id (regex source), inline (has an official embeddable player), aspect (default), aspects, size {width,height} (default element size),
//                     minInline {w,h} (below this on screen a player is a tap-to-open tile), profile (a person/channel rather than content) } }
//   parse(url: URL) -> { kind, id, aspect? } | null      openUrl(kind, id) -> https URL      embedUrl(kind, id) -> https URL | null ({parent} = the page host)
export function defineProvider(definition) {
  const provider = Object.freeze({ ...definition });
  PROVIDERS.set(provider.key, provider);
  providerRegistry.register(provider.key, {
    validatePayload: data => validateEmbedData(provider, data),
    render: data => describeEmbed(provider, data),
  });
  return provider;
}

export function validateEmbedData(provider, data) {
  const kind = typeof data.kind === "string" && Object.hasOwn(provider.kinds, data.kind) ? provider.kinds[data.kind] : null;
  if (!kind) return ["INVALID_KIND"];
  const errors = [];
  if (!idOk(kind, data.id)) errors.push("INVALID_ID");
  if (!PRESENTATIONS.includes(data.presentation) || (data.presentation === "embed" && !kind.inline)) errors.push("INVALID_PRESENTATION");
  if (isSet(data.aspect) && !ASPECTS.includes(data.aspect)) errors.push("INVALID_ASPECT");
  if (isSet(data.caption) && (typeof data.caption !== "string" || codePoints(data.caption) > CAPTION_MAX)) errors.push("INVALID_CAPTION");
  return errors;
}

// The plain, JSON-serializable descriptor the renderer/painter works from (never markup).
export function describeEmbed(provider, data) {
  const kind = provider.kinds[data.kind];
  const wantsPlayer = data.presentation === "embed" && kind.inline;
  return {
    kind: "embed",
    providerKey: provider.key,
    providerLabel: provider.label,
    contentKind: data.kind,
    contentLabel: kind.label,
    profile: !!kind.profile,
    presentation: data.presentation,
    aspect: data.aspect ?? kind.aspect,
    inline: wantsPlayer,
    minInline: kind.minInline ?? null,
    openUrl: provider.openUrl(data.kind, data.id),
    embedUrl: wantsPlayer ? provider.embedUrl(data.kind, data.id) : null,
    frameOrigins: wantsPlayer ? provider.frameOrigins : [],
    id: data.id,
    ...(isSet(data.caption) ? { caption: data.caption } : {}),
  };
}

// ---- URL detection -----------------------------------------------------------------------------------------------------------------------------
function parseWebUrl(text) {
  if (typeof text !== "string") return { error: "NOT_A_URL" };
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return { error: "NOT_A_URL" };
  if (/^(javascript|data|vbscript|file|blob|ftp|ftps|mailto|about|chrome|intent|tel|sms|ws|wss):/i.test(trimmed)) return { error: "UNSAFE_URL" };   // named so the person is told why, whatever follows
  if (/[\s<>"'`]/.test(trimmed)) return { error: "NOT_A_URL" };
  let candidate = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;   // "youtu.be/abc" is fine
  let url;
  try { url = new URL(candidate); } catch { return { error: "NOT_A_URL" }; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "UNSAFE_URL" };   // javascript:, data:, file:, ... are never accepted
  if (url.username || url.password) return { error: "UNSAFE_URL" };
  return { url };
}

const hostOf = url => url.hostname.toLowerCase();

// -> { ok: true, providerKey, providerLabel, kind, kindLabel, id, profile, presentations, defaultPresentation, aspect, aspects, size, canonicalUrl }
//    { ok: false, reason: NOT_A_URL | UNSAFE_URL | UNSUPPORTED_SITE | UNRECOGNIZED_CONTENT, providerLabel? }
export function detectEmbed(text) {
  const parsed = parseWebUrl(text);
  if (parsed.error) return { ok: false, reason: parsed.error };
  const host = hostOf(parsed.url);
  let recognisedSite = null;
  for (const provider of PROVIDERS.values()) {
    if (!provider.hosts.includes(host)) continue;
    recognisedSite = provider;
    const found = provider.parse(parsed.url);
    if (!found || !Object.hasOwn(provider.kinds, found.kind) || !idOk(provider.kinds[found.kind], found.id)) continue;
    const kind = provider.kinds[found.kind];
    const presentations = kind.inline ? ["embed", "card", "link"] : ["card", "link"];
    return {
      ok: true, providerKey: provider.key, providerLabel: provider.label, kind: found.kind, kindLabel: kind.label, id: found.id, profile: !!kind.profile,
      presentations, defaultPresentation: presentations[0], aspect: found.aspect ?? kind.aspect, aspects: kind.aspects ?? [], size: kind.size,
      inline: !!kind.inline, canonicalUrl: provider.openUrl(found.kind, found.id),
    };
  }
  return recognisedSite ? { ok: false, reason: "UNRECOGNIZED_CONTENT", providerLabel: recognisedSite.label } : { ok: false, reason: "UNSUPPORTED_SITE" };
}

// The embed element payload for a detected item and the person's choices. The result is validated by the same adapter that will render it.
export function buildEmbedPayload(detected, { presentation, aspect, caption } = {}) {
  const provider = PROVIDERS.get(detected.providerKey);
  const data = { kind: detected.kind, id: detected.id, presentation: presentation ?? detected.defaultPresentation };
  const chosenAspect = aspect ?? detected.aspect;
  if (chosenAspect && chosenAspect !== provider.kinds[detected.kind].aspect) data.aspect = chosenAspect;
  if (isSet(caption) && caption !== "") data.caption = caption;
  return { payload: { providerKey: detected.providerKey, data }, errors: validateEmbedData(provider, data) };
}

// A sensible starting element size (canonical units) for a presentation.
export function defaultEmbedSize(detected, presentation) {
  if (presentation === "link") return { width: 640, height: 96 };
  if (presentation === "card") return { width: 800, height: detected.profile ? 240 : 260 };
  return { ...detected.size };
}

export const humanReason = {
  NOT_A_URL: "That does not look like a web address. Paste a full web link (it starts with https).",
  UNSAFE_URL: "Only normal web links (https) can be added.",
  get UNSUPPORTED_SITE() { return `That site is not supported yet. Supported: ${[...PROVIDERS.values()].map(provider => provider.label).join(", ")}.`; },
  UNRECOGNIZED_CONTENT: "That is a supported site, but this kind of page cannot be added. Paste a link to a video, post, profile, channel or invite instead.",
};

// The union of every origin an enabled player may load from: the page's `frame-src` is exactly this list (a test keeps them identical).
export const frameOrigins = () => [...new Set([...PROVIDERS.values()].flatMap(provider => provider.frameOrigins))].sort();

// Defence in depth for the painter/player: a URL is only followed/loaded when it is https and its host is one of the provider's own hosts.
export function isAllowedOpenUrl(providerKey, url) {
  const provider = PROVIDERS.get(providerKey);
  try { const parsed = new URL(url); return !!provider && parsed.protocol === "https:" && !parsed.username && provider.hosts.includes(parsed.hostname.toLowerCase()); } catch { return false; }
}
export function isAllowedFrameUrl(providerKey, url) {
  const provider = PROVIDERS.get(providerKey);
  try { const parsed = new URL(url); return !!provider && parsed.protocol === "https:" && provider.frameOrigins.includes(parsed.origin); } catch { return false; }
}
