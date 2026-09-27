import { handleCallback, readEnv } from "../_shared/steam-openid.js";
import { profileRefresherFromEnv } from "../_shared/steam-profile.js";

// Only fixed event codes are ever logged — never URLs, states, OpenID fields, SteamIDs, or Steam/Supabase payloads.
Deno.serve((request: Request) =>
  handleCallback({
    request,
    env: readEnv((name: string) => Deno.env.get(name)),
    log: (event: string, code: string) => console.log(`${event}:${code}`),
    // Round 2: after a successful link, store the account's public persona / avatar / profile address (official GetPlayerSummaries, server-side key).
    onLinked: profileRefresherFromEnv((name: string) => Deno.env.get(name)),
  })
);
