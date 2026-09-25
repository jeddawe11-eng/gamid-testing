// X (Twitter). The tweet iframe used by X's own widgets: https://platform.twitter.com/embed/Tweet.html?id=<id> (verified frameable). Inline for posts (with `dnt=true`,
// X's do-not-track flag); profiles are a link/card. Both x.com and twitter.com addresses are recognised. Limits: X may require its embed to load third-party
// content inside the frame; deleted/protected posts show X's own notice; the height depends on the post, so the element is a fixed box. If the player stops working,
// the element still opens the post as a card. Page CSP needs frame-src https://platform.twitter.com.
import { defineProvider } from "../engine.js";

const RESERVED = new Set(["home", "explore", "i", "search", "settings", "messages", "notifications", "compose", "intent", "share", "hashtag", "login", "signup", "tos", "privacy", "about", "download"]);

export const x = defineProvider({
  key: "x",
  label: "X",
  hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"],
  frameOrigins: ["https://platform.twitter.com"],
  kinds: {
    post: { label: "Post", id: "^[0-9]{1,25}$", inline: true, aspect: "auto", aspects: ["auto"], size: { width: 560, height: 620 }, minInline: { w: 300, h: 260 } },
    profile: { label: "Profile", id: "^[A-Za-z0-9_]{1,15}$", inline: false, profile: true, aspect: "auto", size: { width: 800, height: 240 } },
  },
  parse(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[1] === "status" && parts[2]) return { kind: "post", id: parts[2] };
    if (parts[0] === "i" && parts[1] === "web" && parts[2] === "status" && parts[3]) return { kind: "post", id: parts[3] };
    if (parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) return { kind: "profile", id: parts[0] };
    return null;
  },
  // A post's stored parts are its numeric id only; x.com resolves /i/status/<id> to the post.
  openUrl: (kind, id) => (kind === "post" ? `https://x.com/i/status/${id}` : `https://x.com/${id}`),
  embedUrl: (kind, id) => (kind === "post" ? `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true&theme=dark` : null),
});
