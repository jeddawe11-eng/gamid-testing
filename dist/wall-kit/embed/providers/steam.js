// Steam. Official Steam store widget: https://store.steampowered.com/widget/<appid>/ (documented in Steamworks; verified frameable) - inline for game pages.
// Steam Community pages (profiles, groups) send X-Frame-Options: SAMEORIGIN and a restrictive frame-ancestors, so they can NOT be embedded: they are safe public
// link/cards only. A connected Steam account is identity ("My connections"); a pasted Steam address is Wall content - separate systems, and nothing is read from
// the pasted page. Page CSP needs frame-src https://store.steampowered.com.
import { defineProvider } from "../engine.js";

export const steam = defineProvider({
  key: "steam",
  label: "Steam",
  hosts: ["store.steampowered.com", "steamcommunity.com", "www.steamcommunity.com"],
  frameOrigins: ["https://store.steampowered.com"],
  kinds: {
    app: { label: "Game", id: "^[0-9]{1,10}$", inline: true, aspect: "auto", aspects: ["auto"], size: { width: 800, height: 240 }, minInline: { w: 320, h: 100 } },
    profile: { label: "Profile", id: "^(7656119[0-9]{10}|[A-Za-z0-9_-]{2,32})$", inline: false, profile: true, aspect: "auto", size: { width: 800, height: 240 } },
    group: { label: "Community group", id: "^[A-Za-z0-9_-]{2,64}$", inline: false, aspect: "auto", size: { width: 800, height: 240 } },
  },
  parse(url) {
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "store.steampowered.com" && parts[0] === "app" && /^[0-9]+$/.test(parts[1] ?? "")) return { kind: "app", id: parts[1] };
    if (host !== "store.steampowered.com") {
      if (parts[0] === "profiles" && parts[1]) return { kind: "profile", id: parts[1] };
      if (parts[0] === "id" && parts[1]) return { kind: "profile", id: parts[1] };
      if (parts[0] === "groups" && parts[1]) return { kind: "group", id: parts[1] };
    }
    return null;
  },
  openUrl(kind, id) {
    if (kind === "app") return `https://store.steampowered.com/app/${id}/`;
    if (kind === "group") return `https://steamcommunity.com/groups/${id}`;
    return /^[0-9]+$/.test(id) ? `https://steamcommunity.com/profiles/${id}` : `https://steamcommunity.com/id/${id}`;
  },
  embedUrl: (kind, id) => (kind === "app" ? `https://store.steampowered.com/widget/${id}/` : null),
});
