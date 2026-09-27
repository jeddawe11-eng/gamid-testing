// Instagram. Posts, Reels and profiles are CARDS / LINKS that open on Instagram, with the content's real poster (media-poster: Instagram's public page preview).
// No Player is offered (post-Round 2 acceptance finding: tapping an Instagram "Player" sent the visitor to Instagram). Meta's only documented embedding path is the
// Graph API oEmbed (a Meta app access token) whose markup is turned into a frame by Instagram's embed.js script - a third-party script the Wall's page policy
// (script-src 'self') does not run - and for visitors who are not logged in to Instagram a Reel / video in that embed shows its poster with "View more on
// Instagram" rather than playing inside the page. That is an Instagram platform limitation, not something the Wall can work around safely, so the frame origin
// is no longer allowed either. Walls saved while a Player was offered stay valid (legacyEmbed): such an element is shown as a Card.
import { defineProvider } from "../engine.js";

const CODE = "^[A-Za-z0-9_-]{5,30}$";
const RESERVED = new Set(["p", "reel", "reels", "tv", "explore", "accounts", "stories", "direct", "about", "legal", "web", "developer", "directory", "challenge", "emails", "session", "oauth"]);

export const instagram = defineProvider({
  key: "instagram",
  label: "Instagram",
  hosts: ["instagram.com", "www.instagram.com", "m.instagram.com"],
  frameOrigins: [],
  examples: "instagram.com/p/…  ·  instagram.com/reel/…  ·  instagram.com/name",
  kinds: {
    post: { label: "Post", id: CODE, inline: false, legacyEmbed: true, aspect: "auto", size: { width: 540, height: 700 }, poster: true },
    reel: { label: "Reel", id: CODE, inline: false, legacyEmbed: true, aspect: "auto", size: { width: 540, height: 700 }, poster: true },
    profile: { label: "Profile", id: "^[A-Za-z0-9._]{1,30}$", inline: false, profile: true, aspect: "auto", size: { width: 800, height: 240 } },
  },
  parse(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[1] === "p") parts.shift();            // /username/p/<code>
    if (parts.length >= 3 && (parts[1] === "reel" || parts[1] === "reels")) parts.shift();
    if (parts[0] === "p" && parts[1]) return { kind: "post", id: parts[1] };
    if ((parts[0] === "reel" || parts[0] === "reels") && parts[1]) return { kind: "reel", id: parts[1] };
    if (parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) return { kind: "profile", id: parts[0] };
    return null;
  },
  openUrl(kind, id) {
    if (kind === "post") return `https://www.instagram.com/p/${id}/`;
    if (kind === "reel") return `https://www.instagram.com/reel/${id}/`;
    return `https://www.instagram.com/${id}/`;
  },
  embedUrl: () => null,
});
