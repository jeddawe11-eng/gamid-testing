import { handleStart, readEnv } from "../_shared/steam-openid.js";

Deno.serve((request: Request) =>
  handleStart({ request, env: readEnv((name: string) => Deno.env.get(name)) })
);
