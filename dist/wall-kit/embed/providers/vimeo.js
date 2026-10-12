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
  // the Wall Icon badge (Product Memory DEC-0006): the accepted Classic My Socials badge: its colour and its mark / glyph - tests/wall-icons.test.js keeps it identical to dist/public/public.css
  icon: Object.freeze({ background: "#1ab7ea", color: "#ffffff", mark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M23.977 6.417c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.522 3.01 7.522c-.179 0-.806.378-1.881 1.132L0 7.21c1.185-1.044 2.351-2.084 3.501-3.128C5.08 2.701 6.266 1.984 7.055 1.91c1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.507.539 2.45 1.131 3.674 1.776 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.868 3.434-5.757 6.762-5.637 2.473.06 3.628 1.664 3.493 4.797z'/%3E%3C/svg%3E\")" }),
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
