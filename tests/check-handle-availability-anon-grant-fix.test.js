import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const original = await readFile(new URL("../supabase/migrations/20260912170000_harden_rpc_boundaries.sql", import.meta.url), "utf8");
const fix = await readFile(new URL("../supabase/migrations/20260918123000_fix_check_handle_availability_anon_grant.sql", import.meta.url), "utf8");

test("the original migration already grants anon on the private impl function", () => {
  assert.match(original, /grant execute on function private\.check_handle_availability_impl\(text\) to anon, authenticated/);
});

test("the drift fix is a single, minimal, forward-only grant restoring exactly what live TESTING was missing", () => {
  assert.match(fix, /^grant execute on function private\.check_handle_availability_impl\(text\) to anon;\s*$/);
  assert.doesNotMatch(fix, /revoke/i);
  assert.doesNotMatch(fix, /drop /i);
  assert.doesNotMatch(fix, /create /i);
  assert.doesNotMatch(fix, /alter /i);
});
