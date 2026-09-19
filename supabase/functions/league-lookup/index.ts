// Thin Supabase Edge Function glue: all behavior lives in the tested shared modules.
// @ts-nocheck — Deno runtime globals; logic is type-checked as plain JS in the Node test suite.
import { handleLeagueLookup, readLeagueEnv } from "../_shared/league/league-service.js";
import { opggAdapter } from "../_shared/league/opgg-adapter.js";

Deno.serve(request =>
  handleLeagueLookup({
    request,
    env: readLeagueEnv(name => Deno.env.get(name)),
    adapter: opggAdapter,
    // Codes only — never request bodies, names, tokens, or anything returned by the data source.
    log: (event: string, code: string) => console.log(`${event}:${code}`),
  })
);
