// Gaming clip links for Friends Stickers V1 (Mazen's addendum, 2026-10-24). Provider facts - hosts and link shapes - live with the provider adapters (DEC-0002), so
// the Wall core, the kit and the editor stay provider-neutral and ask this module.
//
// One optional link per sticker, to a clip on YouTube, Twitch or Medal.tv. It is only ever a link (opened in a new tab): nothing is embedded, played, downloaded
// or hosted, so this is NOT a Wall embed provider and adds nothing to the Wall's link engine. The accepted shapes are deliberately narrow (clips and videos) and are
// mirrored exactly by the server (private.wall_sticker_clip in supabase/migrations/20261024100000_friends_stickers_v1.sql); tests run one corpus through both.
// The link is rebuilt from the parts these patterns accept, so what is stored and opened is always a plain https address on the provider's own host - never
// whatever else the sender typed (query strings, fragments, credentials, ports, other hosts). Discord's media links expire after about a day, so they are not
// accepted in V1.
export const STICKER_CLIP_MAX = 300;
export const STICKER_CLIP_PROVIDERS = Object.freeze(["youtube", "twitch", "medal"]);
export const STICKER_CLIP_LABELS = Object.freeze({ youtube: "YouTube", twitch: "Twitch", medal: "Medal.tv" });
// "YouTube, Twitch or Medal.tv" - for the send flow's words
export const stickerClipProvidersText = () => { const names = STICKER_CLIP_PROVIDERS.map(key => STICKER_CLIP_LABELS[key]); return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`; };

const ID = "[A-Za-z0-9_-]";
// a watch link: the FIRST v= parameter (leftmost match, as the SQL port's regexp_match) names the video
const YOUTUBE_V = new RegExp(`[?&]v=(${ID}{11})(?:&|$)`);
const CLIP_RULES = [
  { provider: "youtube", host: /^(?:www\.|m\.)?youtube\.com$/, path: { exec: path => (/^\/watch\?[^#]*$/.test(path) ? YOUTUBE_V.exec(path) : null) }, build: m => `https://www.youtube.com/watch?v=${m[1]}` },
  { provider: "youtube", host: /^(?:www\.|m\.)?youtube\.com$/, path: new RegExp(`^/shorts/(${ID}{11})/?(?:\\?[^#]*)?$`), build: m => `https://www.youtube.com/shorts/${m[1]}` },
  { provider: "youtube", host: /^(?:www\.|m\.)?youtube\.com$/, path: new RegExp(`^/clip/(${ID}{20,40})/?(?:\\?[^#]*)?$`), build: m => `https://www.youtube.com/clip/${m[1]}` },
  { provider: "youtube", host: /^youtu\.be$/, path: new RegExp(`^/(${ID}{11})/?(?:\\?[^#]*)?$`), build: m => `https://www.youtube.com/watch?v=${m[1]}` },
  { provider: "twitch", host: /^clips\.twitch\.tv$/, path: new RegExp(`^/(${ID}{3,100})/?(?:\\?[^#]*)?$`), build: m => `https://clips.twitch.tv/${m[1]}` },
  { provider: "twitch", host: /^(?:www\.|m\.)?twitch\.tv$/, path: new RegExp(`^/([A-Za-z0-9_]{2,25})/clip/(${ID}{3,100})/?(?:\\?[^#]*)?$`), build: m => `https://www.twitch.tv/${m[1].toLowerCase()}/clip/${m[2]}` },
  { provider: "twitch", host: /^(?:www\.|m\.)?twitch\.tv$/, path: /^\/videos\/([0-9]{1,15})\/?(?:\?[^#]*)?$/, build: m => `https://www.twitch.tv/videos/${m[1]}` },
  { provider: "medal", host: /^(?:www\.)?medal\.tv$/, path: new RegExp(`^/games/([a-z0-9-]{1,60})/clips/(${ID}{4,40})(?:/(${ID}{1,100}))?/?(?:\\?[^#]*)?$`), build: m => `https://medal.tv/games/${m[1]}/clips/${m[2]}${m[3] ? `/${m[3]}` : ""}` },
  { provider: "medal", host: /^(?:www\.)?medal\.tv$/, path: new RegExp(`^/clips/(${ID}{4,40})(?:/(${ID}{1,100}))?/?(?:\\?[^#]*)?$`), build: m => `https://medal.tv/clips/${m[1]}${m[2] ? `/${m[2]}` : ""}` },
];
const SUPPORTED_HOSTS = /^(?:(?:www\.|m\.)?youtube\.com|youtu\.be|clips\.twitch\.tv|(?:www\.|m\.)?twitch\.tv|(?:www\.)?medal\.tv)$/;

// -> { ok: true, clip: null } (no link) | { ok: true, clip: { provider, url } } | { ok: false, code: "STICKER_CLIP_INVALID" | "STICKER_CLIP_UNSUPPORTED" }
export function parseStickerClip(input) {
  if (input === null || input === undefined) return { ok: true, clip: null };
  if (typeof input !== "string") return { ok: false, code: "STICKER_CLIP_INVALID" };
  const text = input.replace(/^[ \t\r\n\f\v]+|[ \t\r\n\f\v]+$/g, "");   // ASCII whitespace only (the SQL port trims the same set)
  if (text === "") return { ok: true, clip: null };
  // printable ASCII only, without \ " ' < > ` (a link is opened, never shown as markup; anything else is not a link these providers give out)
  if (text.length > STICKER_CLIP_MAX || /[^\x21-\x7e]/.test(text) || /[\\"'<>`]/.test(text)) return { ok: false, code: "STICKER_CLIP_INVALID" };
  const parts = /^https:\/\/([A-Za-z0-9.-]+)(\/[^#]*)?(?:#.*)?$/.exec(text);
  if (!parts) return { ok: false, code: "STICKER_CLIP_INVALID" };
  const host = parts[1].toLowerCase(), path = parts[2] ?? "/";
  if (!SUPPORTED_HOSTS.test(host)) return { ok: false, code: "STICKER_CLIP_UNSUPPORTED" };
  for (const rule of CLIP_RULES) {
    if (!rule.host.test(host)) continue;
    const m = rule.path.exec(path);
    if (m) return { ok: true, clip: { provider: rule.provider, url: rule.build(m) } };
  }
  return { ok: false, code: "STICKER_CLIP_INVALID" };
}
// a stored link, re-checked before it is drawn (a link that does not pass is simply not shown)
export const safeStickerClip = (url, provider) => {
  const parsed = parseStickerClip(url);
  return parsed.ok && parsed.clip && parsed.clip.url === url && parsed.clip.provider === provider ? parsed.clip : null;
};
