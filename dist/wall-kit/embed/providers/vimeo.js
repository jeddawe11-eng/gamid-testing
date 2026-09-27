// Vimeo. Official player: https://player.vimeo.com/video/<id> (verified to render and play inside the Wall player sandbox; frameable). `dnt=1` is Vimeo's own "do not
// track" switch. An unlisted video's address carries a privacy hash (vimeo.com/<id>/<hash> or player.vimeo.com/video/<id>?h=<hash>); it is stored as "<id>:<hash>" and
// passed back as `h=`. Vimeo hosts landscape, vertical and square video, so 16:9 (default), 9:16, 1:1 and 4:3 are offered. Profiles are a link/card (no profile
// player). Note: an owner can restrict where their video may be embedded - such a video shows Vimeo's own notice inside the player. Page CSP needs frame-src
// https://player.vimeo.com.
import { defineProvider } from "../engine.js";

const VIDEO = "^[0-9]{6,12}(:[0-9a-f]{6,20})?$";
const RESERVED = new Set(["channels", "groups", "showcase", "album", "ondemand", "categories", "blog", "features", "upload", "log_in", "join", "pricing", "search", "watch", "help", "about", "manage", "settings", "explore", "create", "live", "enterprise", "stock", "solutions", "user", "users", "video", "videos", "home", "privacy", "terms", "cookie_policy", "partners", "event", "events", "integrations"]);
const isNumber = value => /^[0-9]{6,12}$/.test(value ?? "");
const isHash = value => /^[0-9a-f]{6,20}$/.test(value ?? "");
const withHash = (id, hash) => (isHash(hash) ? `${id}:${hash}` : id);

export const vimeo = defineProvider({
  key: "vimeo",
  label: "Vimeo",
  hosts: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"],
  frameOrigins: ["https://player.vimeo.com"],
  examples: "vimeo.com/123456789  ·  vimeo.com/name",
  kinds: {
    video: { label: "Video", id: VIDEO, inline: true, aspect: "16:9", aspects: ["16:9", "9:16", "1:1", "4:3"], size: { width: 800, height: 450 }, minInline: { w: 240, h: 135 }, poster: true },
    profile: { label: "Profile", id: "^[A-Za-z0-9_-]{2,64}$", inline: false, profile: true, aspect: "auto", size: { width: 800, height: 240 } },
  },
  parse(url) {
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "player.vimeo.com") return parts[0] === "video" && isNumber(parts[1]) ? { kind: "video", id: withHash(parts[1], url.searchParams.get("h")) } : null;
    if (isNumber(parts[0])) return { kind: "video", id: withHash(parts[0], parts[1]) };
    const tail = parts[parts.length - 1];
    if (["channels", "groups", "showcase", "album"].includes(parts[0]) && isNumber(tail)) return { kind: "video", id: tail };
    if (parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) return { kind: "profile", id: parts[0] };
    return null;
  },
  openUrl(kind, id) {
    if (kind === "profile") return `https://vimeo.com/${id}`;
    const [number, hash] = id.split(":");
    return `https://vimeo.com/${number}${hash ? `/${hash}` : ""}`;
  },
  embedUrl(kind, id) {
    if (kind !== "video") return null;
    const [number, hash] = id.split(":");
    return `https://player.vimeo.com/video/${number}?dnt=1${hash ? `&h=${hash}` : ""}`;
  },
});
