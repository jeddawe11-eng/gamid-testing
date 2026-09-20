import { handleCallback, readEnv } from "../_shared/steam-openid.js";

// Only fixed event codes are ever logged — never URLs, states, OpenID fields, SteamIDs, or Steam/Supabase payloads.
Deno.serve((request: Request) =>
  handleCallback({
    request,
    env: readEnv((name: string) => Deno.env.get(name)),
    log: (event: string, code: string) => console.log(`${event}:${code}`),
  })
);
