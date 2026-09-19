import { handleStart, readEnv } from "../_shared/discord-oauth.js";

Deno.serve((request: Request) =>
  handleStart({ request, env: readEnv((name: string) => Deno.env.get(name)) })
);
