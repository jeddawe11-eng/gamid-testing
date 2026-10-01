import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261001173000_play_together_voice_pgcrypto_schema.sql", import.meta.url), "utf8");

test("voice OAuth uses schema-qualified pgcrypto with an empty search path", () => {
  assert.match(migration, /start_play_together_voice_oauth_impl/);
  assert.match(migration, /security definer set search_path=''/);
  assert.match(migration, /extensions\.gen_random_bytes\(32\)/);
  assert.match(migration, /extensions\.digest\(raw,'sha256'\)/);
  assert.doesNotMatch(migration, /(?<!extensions\.)gen_random_bytes\(/);
  assert.doesNotMatch(migration, /(?<!extensions\.)digest\(/);
});
