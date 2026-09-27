// Twitch. Official embeds (dev.twitch.tv/docs/embed/video-and-clips): https://player.twitch.tv/?channel=<login>|video=v<id>&parent=<page host> and
// https://clips.twitch.tv/embed?clip=<slug>&parent=<page host>. Twitch REQUIRES the embedding page's host in `parent` (verified: its frame-ancestors follows it), which
// the player fills in at runtime from the page it is on. Twitch also documents a MINIMUM player size of 400 x 300 px (manual-QA finding: the Wall allowed 400x225 inline
// and ~358x201 in a phone's larger player, both below it). minFrame is therefore 400 x 300: the editor keeps a Twitch Player element at least 400 x (300 + the Close bar)
// units, so at full scale the frame meets it. Round 2: the player always plays inside its own element (no overlay); on a phone's scaled-down column the element - and
// so the frame - is proportionally smaller than 400 x 300 CSS px (Twitch's player still renders there; a documented limitation). 16:9 is the default shape; 4:3
// reaches Twitch's minimum in a narrower box. Page CSP needs frame-src https://player.twitch.tv and https://clips.twitch.tv. Live/offline status is not read (Twitch needs
// an API key for that): deferred.
import { defineProvider } from "../engine.js";

const RESERVED = new Set(["videos", "directory", "downloads", "jobs", "p", "settings", "subscriptions", "turbo", "wallet", "friends", "inventory", "drops", "prime", "store", "search", "login", "signup", "help", "legal", "about", "team", "popout", "embed", "moderator", "dashboard", "u"]);
const MIN = { w: 400, h: 300 };

export const twitch = defineProvider({
  key: "twitch",
  label: "Twitch",
  hosts: ["twitch.tv", "www.twitch.tv", "m.twitch.tv", "clips.twitch.tv"],
  frameOrigins: ["https://player.twitch.tv", "https://clips.twitch.tv"],
  examples: "twitch.tv/name  ·  twitch.tv/videos/…  ·  clips.twitch.tv/…",
  kinds: {
    channel: { label: "Channel", id: "^[A-Za-z0-9_]{3,25}$", inline: true, profile: true, aspect: "16:9", aspects: ["16:9", "4:3"], size: { width: 800, height: 450 }, minInline: MIN, minFrame: MIN, poster: true },
    video: { label: "Video", id: "^[0-9]{5,15}$", inline: true, aspect: "16:9", aspects: ["16:9", "4:3"], size: { width: 800, height: 450 }, minInline: MIN, minFrame: MIN },
    clip: { label: "Clip", id: "^[A-Za-z0-9_-]{5,100}$", inline: true, aspect: "16:9", aspects: ["16:9", "4:3"], size: { width: 800, height: 450 }, minInline: MIN, minFrame: MIN },
  },
  parse(url) {
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "clips.twitch.tv") return parts[0] && parts[0] !== "embed" ? { kind: "clip", id: parts[0] } : (url.searchParams.get("clip") ? { kind: "clip", id: url.searchParams.get("clip") } : null);
    if (parts[0] === "videos" && parts[1]) return { kind: "video", id: parts[1] };
    if (parts[1] === "clip" && parts[2]) return { kind: "clip", id: parts[2] };
    if (parts[0] && parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) return { kind: "channel", id: parts[0] };
    return null;
  },
  openUrl(kind, id) {
    if (kind === "video") return `https://www.twitch.tv/videos/${id}`;
    if (kind === "clip") return `https://clips.twitch.tv/${id}`;
    return `https://www.twitch.tv/${id}`;
  },
  embedUrl(kind, id) {
    if (kind === "video") return `https://player.twitch.tv/?video=v${id}&parent={parent}&autoplay=false`;
    if (kind === "clip") return `https://clips.twitch.tv/embed?clip=${id}&parent={parent}&autoplay=false`;
    return `https://player.twitch.tv/?channel=${id}&parent={parent}&autoplay=false&muted=true`;
  },
});
