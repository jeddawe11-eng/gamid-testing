import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260912143000_slice_2_account_solo_foundation.sql", import.meta.url), "utf8");

test("account, entity, profile, membership, and QR records remain separate", () => {
  for (const table of ["private.account_private","public.entities","public.entity_memberships","public.profiles","public.qr_references"]) {
    assert.ok(sql.includes(`create table ${table}`), `missing ${table}`);
  }
});

test("DOB is private and public entities do not contain it", () => {
  const entityDefinition = sql.match(/create table public\.entities \(([\s\S]*?)\n\);/)?.[1] || "";
  assert.ok(sql.includes("private.account_private"));
  assert.ok(!entityDefinition.includes("date_of_birth"));
});

test("handle collision and one-Solo-per-user are enforced by database indexes", () => {
  assert.match(sql, /constraint entities_handle_unique unique \(gamid_handle\)/);
  assert.match(sql, /create unique index entities_one_solo_per_creator/);
  assert.match(sql, /HANDLE_TAKEN/);
});

test("all exposed Slice 2 tables enable RLS", () => {
  for (const table of ["entities","entity_memberships","profiles","qr_references"]) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`));
  }
});

test("QR tokens are opaque and not raw entity IDs", () => {
  assert.match(sql, /'q_' \|\| encode\(gen_random_bytes\(18\), 'hex'\)/);
  assert.match(sql, /public_token text not null unique/);
});

test("reserved handles are centrally maintained and enforced by the claim transaction", () => {
  for (const handle of ["admin","support","gamid","root","system","api","help","security"]) assert.ok(sql.includes(`('${handle}',`));
  assert.match(sql, /private\.reserved_handles/);
  assert.match(sql, /private\.handle_validation_error/);
});

test("identity creation is one database transaction that inserts all foundation records", () => {
  const fn = sql.match(/create or replace function public\.create_solo_identity\(([\s\S]*?)\n\$\$;/)?.[0] || "";
  for (const target of ["private.account_private","public.entities","public.entity_memberships","public.profiles","public.qr_references"]) {
    assert.ok(fn.includes(`insert into ${target}`), `transaction missing ${target}`);
  }
});

