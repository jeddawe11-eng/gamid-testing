import { handleCallback, readEnv } from "../_shared/discord-oauth.js";

// Only fixed event codes are ever logged — never URLs, codes, states, tokens, or Discord/Supabase payloads.
Deno.serve((request: Request) =>
  handleCallback({
    request,
    env: readEnv((name: string) => Deno.env.get(name)),
    log: (event: string, code: string) => console.log(`${event}:${code}`),
  })
);
