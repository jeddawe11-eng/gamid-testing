// Steam. Official Steam store widget: https://store.steampowered.com/widget/<appid>/ (documented in Steamworks; verified frameable) - inline for game pages.
// Steam Community pages (profiles, groups) send X-Frame-Options: SAMEORIGIN and a restrictive frame-ancestors, so they can NOT be embedded: they are safe public
// link/cards only. A connected Steam account is identity ("My connections"); a pasted Steam address is Wall content - separate systems, and nothing is read from
// the pasted page. Page CSP needs frame-src https://store.steampowered.com.
import { defineProvider } from "../engine.js";

export const steam = defineProvider({
  key: "steam",
  label: "Steam",
  // the Wall Icon badge (Product Memory DEC-0006): the Classic My Games Steam mark (the simple-icons "steam" path, CC0) on Steam's dark blue - tests/wall-icons.test.js keeps it identical to dist/public/public.css
  icon: Object.freeze({ background: "#171a21", color: "#ffffff", mark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z'/%3E%3C/svg%3E\")" }),
  hosts: ["store.steampowered.com", "steamcommunity.com", "www.steamcommunity.com"],
  frameOrigins: ["https://store.steampowered.com"],
  examples: "store.steampowered.com/app/…  ·  steamcommunity.com/id/…",
  kinds: {
    app: { label: "Game", id: "^[0-9]{1,10}$", inline: true, aspect: "auto", aspects: ["auto"], size: { width: 800, height: 240 }, minInline: { w: 320, h: 100 }, poster: true, meta: true },
    profile: { label: "Profile", id: "^(7656119[0-9]{10}|[A-Za-z0-9_-]{2,32})$", inline: false, profile: true, aspect: "auto", size: { width: 800, height: 240 }, poster: true, meta: true },
    group: { label: "Community group", id: "^[A-Za-z0-9_-]{2,64}$", inline: false, aspect: "auto", size: { width: 800, height: 240 }, poster: true, meta: true },
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
