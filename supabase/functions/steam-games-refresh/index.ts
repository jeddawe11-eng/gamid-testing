// Thin Supabase Edge Function glue: all behavior lives in the tested shared module.
// @ts-nocheck — Deno runtime globals; logic is type-checked as plain JS in the Node test suite.
import { handleRefresh, readEnv } from "../_shared/steam-games.js";

Deno.serve((request: Request) =>
  handleRefresh({
    request,
    env: readEnv((name: string) => Deno.env.get(name)),
    // Codes only — never URLs (which carry the API key), SteamIDs, request bodies, or anything returned by Steam.
    log: (event: string, code: string) => console.log(`${event}:${code}`),
  })
);
