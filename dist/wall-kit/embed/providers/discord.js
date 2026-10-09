// Discord. An invite link identifies a community but NOT its numeric server id, and Discord's widget iframe needs that id AND a server that has enabled its widget,
// so an invite cannot be embedded honestly. Discord is therefore a safe link/card (no player, no frame origin, no network from the Wall). Live member counts would need
// Discord's API: not used. A connected Discord account is identity ("My connections"); a pasted invite is Wall content - the two are separate.
// A personal profile (https://discord.com/users/<numeric user id>, Discord's own profile address) is a LINK only: Discord offers no public profile card or player and
// GamID fetches nothing for it, so neither a Player nor a Card is offered (`presentations`).
import { defineProvider } from "../engine.js";

export const discord = defineProvider({
  key: "discord",
  label: "Discord",
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
