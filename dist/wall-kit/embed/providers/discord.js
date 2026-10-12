// Discord. An invite link identifies a community but NOT its numeric server id, and Discord's widget iframe needs that id AND a server that has enabled its widget,
// so an invite cannot be embedded honestly. Discord is therefore a safe link/card (no player, no frame origin, no network from the Wall). Live member counts would need
// Discord's API: not used. A connected Discord account is identity ("My connections"); a pasted invite is Wall content - the two are separate.
// A personal profile (https://discord.com/users/<numeric user id>, Discord's own profile address) is a LINK only: Discord offers no public profile card or player and
// GamID fetches nothing for it, so neither a Player nor a Card is offered (`presentations`).
import { defineProvider } from "../engine.js";

export const discord = defineProvider({
  key: "discord",
  label: "Discord",
  // the Wall Icon badge (Product Memory DEC-0006): the accepted Classic My Socials badge: its colour and its mark / glyph - tests/wall-icons.test.js keeps it identical to dist/public/public.css
  icon: Object.freeze({ background: "#5865f2", color: "#ffffff", mark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z'/%3E%3C/svg%3E\")" }),
  hosts: ["discord.gg", "discord.com", "www.discord.com", "discordapp.com", "www.discordapp.com", "dsc.gg"],
  frameOrigins: [],
  examples: "discord.gg/… or discord.com/users/…",
  kinds: {
    invite: { label: "Server invite", id: "^[A-Za-z0-9-]{2,32}$", inline: false, aspect: "auto", size: { width: 800, height: 240 }, poster: true, meta: true },
    profile: { label: "Profile", id: "^[0-9]{17,20}$", inline: false, profile: true, presentations: ["link"], aspect: "auto", size: { width: 640, height: 96 } },
  },
  parse(url) {
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if ((host === "discord.gg" || host === "dsc.gg") && parts.length === 1) return { kind: "invite", id: parts[0] };
    if (parts[0] === "invite" && parts[1]) return { kind: "invite", id: parts[1] };
    if (host !== "discord.gg" && host !== "dsc.gg" && parts[0] === "users" && parts.length === 2) return { kind: "profile", id: parts[1] };
    return null;
  },
  openUrl: (kind, id) => (kind === "profile" ? `https://discord.com/users/${id}` : `https://discord.gg/${id}`),
  embedUrl: () => null,
});
